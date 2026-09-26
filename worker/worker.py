"""
TridiMarket - Worker de leitura de nota (roda num PC da empresa, 24h).

O que ele faz, em loop:
  1. Pergunta pro seu dominio "tem nota pra processar?" (POST /api/worker/claim).
  2. Baixa a imagem da nota por uma URL assinada (a imagem NUNCA vai pro Claude).
  3. Le a nota LOCALMENTE:
       - tenta o QR do cupom fiscal (NFC-e) -> guarda a chave;
       - le o texto com OCR (RapidOCR/ONNX) e separa os itens (nome, qtd, preco).
  4. Devolve o resultado (POST /api/worker/complete). A pessoa confere no painel
     antes de dar entrada no estoque.

Nao abre porta nenhuma: ele so FALA com o seu dominio (HTTPS de saida). Por isso
funciona atras de qualquer roteador, sem IP fixo.

Config por variaveis de ambiente (veja .env.example):
  WORKER_URL     -> base do dominio, ex.: https://app.suaempresa.com.br
  WORKER_TOKEN   -> o mesmo TRIDIMARKET_WORKER_TOKEN configurado no servidor
  POLL_SECONDS   -> intervalo entre consultas quando nao ha trabalho (padrao 5)
"""
import io
import os
import re
import sys
import time
import traceback

import requests

# --- OCR e QR sao carregados sob demanda (import pesado) --------------------
_ocr = None
_np = None


def _log(msg):
    print(time.strftime("[%H:%M:%S] ") + str(msg), flush=True)


def _config():
    base = (os.environ.get("WORKER_URL") or "").rstrip("/")
    token = os.environ.get("WORKER_TOKEN") or ""
    poll = float(os.environ.get("POLL_SECONDS") or "5")
    if not base or not token:
        _log("ERRO: defina WORKER_URL e WORKER_TOKEN (veja .env.example).")
        sys.exit(1)
    return base, token, poll


def _get_ocr():
    """Carrega o RapidOCR uma vez (baixa os modelos ONNX na 1a execucao)."""
    global _ocr, _np
    if _ocr is None:
        import numpy as np
        from rapidocr_onnxruntime import RapidOCR
        _np = np
        _log("Carregando o motor de OCR (primeira vez baixa os modelos)...")
        _ocr = RapidOCR()
        _log("OCR pronto.")
    return _ocr


# --- Leitura da nota --------------------------------------------------------
_VALOR = re.compile(r"(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\b")
_QTD = re.compile(r"(\d+(?:[.,]\d{1,3})?)\s*(?:un|kg|x|pc|pct|cx|lt|g|ml)\b", re.I)


def _num(txt):
    """'1.234,56' -> 1234.56 ; '2,5' -> 2.5"""
    t = txt.strip().replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def _decode_qr(img_bytes):
    """Tenta achar a chave de 44 digitos do cupom fiscal (NFC-e) no QR."""
    try:
        from pyzbar.pyzbar import decode
        from PIL import Image
        im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        for res in decode(im):
            payload = res.data.decode("utf-8", "ignore")
            m = re.search(r"[?&]p=(\d{44})", payload) or re.search(r"\b(\d{44})\b", payload)
            if m:
                return m.group(1)
    except Exception as e:  # noqa: BLE001
        _log("QR: nao deu pra ler (%s) - segue no OCR." % e)
    return None


def _parse_itens(linhas):
    """
    Heuristica de cupom brasileiro. Cada linha vira (talvez) um item:
    pega linhas que tem um VALOR monetario e tenta separar nome / qtd / preco.
    Imperfeito de proposito - a pessoa confere no painel antes do estoque.
    """
    itens = []
    for linha in linhas:
        txt = " ".join(linha.split())
        if len(txt) < 3:
            continue
        valores = _VALOR.findall(txt)
        if not valores:
            continue
        # ultimo valor da linha = total do item; penultimo (se houver) = unitario
        nums = [float(int(a.replace(".", "")) + int(b) / 100.0) if False else _num("%s,%s" % (a, b)) for a, b in valores]
        nums = [n for n in nums if n is not None]
        if not nums:
            continue
        total = nums[-1]
        unit = nums[-2] if len(nums) >= 2 else None
        mq = _QTD.search(txt)
        qtd = _num(mq.group(1)) if mq else 1.0
        if not qtd or qtd <= 0:
            qtd = 1.0
        if unit is None:
            unit = round(total / qtd, 2) if qtd else total
        # nome = texto antes do primeiro numero "solto"/qtd/valor
        nome = re.split(r"\s\d+(?:[.,]\d+)?\s*(?:un|kg|x|pc|pct|cx|lt|g|ml)\b|\s\d{1,3}(?:\.\d{3})*,\d{2}\b", txt, flags=re.I)[0]
        nome = re.sub(r"^\s*\d{1,3}\s+", "", nome)  # tira numero de item (001, 002)
        nome = re.sub(r"\b\d{8,14}\b", "", nome).strip(" -.*")  # tira codigo de barras
        if len(nome) < 2:
            continue
        # descarta linhas de rodape (total, troco, etc.)
        if re.search(r"\b(total|troco|subtotal|desconto|valor pago|dinheiro|cartao|pix)\b", nome, re.I):
            continue
        itens.append({
            "nome": nome[:200],
            "quantidade": round(qtd, 3),
            "precoUnitario": round(unit, 2),
            "total": round(total, 2),
        })
    return itens


def _ler_nota(img_bytes):
    chave = _decode_qr(img_bytes)
    ocr = _get_ocr()
    arr = _np.frombuffer(img_bytes, dtype=_np.uint8)
    import cv2
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError("imagem invalida")
    resultado, _ = ocr(img)
    linhas = [item[1] for item in (resultado or [])]
    itens = _parse_itens(linhas)
    return {
        "fonte": "qr_fiscal" if chave else "ocr",
        "chave": chave,
        "itens": itens,
    }


# --- Loop -------------------------------------------------------------------
def _claim(base, token):
    r = requests.post(base + "/api/worker/claim", headers={"Authorization": "Bearer " + token}, timeout=30)
    if r.status_code == 204:
        return None
    r.raise_for_status()
    data = r.json()
    return data.get("data") if data.get("ok") else None


def _complete(base, token, job_id, result=None, erro=None):
    body = {"jobId": job_id}
    if erro:
        body["error"] = str(erro)[:2000]
    else:
        body["result"] = result
    r = requests.post(base + "/api/worker/complete", headers={"Authorization": "Bearer " + token}, json=body, timeout=30)
    r.raise_for_status()


def main():
    base, token, poll = _config()
    _log("Worker TridiMarket iniciado. Falando com %s" % base)
    ocioso = 0
    while True:
        try:
            pego = _claim(base, token)
            if not pego:
                ocioso += 1
                if ocioso == 1:
                    _log("Sem notas na fila. Aguardando...")
                time.sleep(poll)
                continue
            ocioso = 0
            job = pego["job"]
            job_id = job["id"]
            url = pego.get("imageUrl")
            _log("Nota %s: baixando imagem..." % job_id)
            img = requests.get(url, timeout=60).content
            _log("Nota %s: lendo (%d KB)..." % (job_id, len(img) // 1024))
            result = _ler_nota(img)
            _log("Nota %s: %d itens (%s)." % (job_id, len(result["itens"]), result["fonte"]))
            _complete(base, token, job_id, result=result)
        except KeyboardInterrupt:
            _log("Encerrando.")
            return
        except Exception as e:  # noqa: BLE001
            _log("ERRO: %s" % e)
            traceback.print_exc()
            # Se ja tinha pego um job, marca como erro pra nao travar a fila.
            try:
                if "job_id" in dir() and job_id:  # type: ignore  # noqa: F821
                    _complete(base, token, job_id, erro=e)  # type: ignore  # noqa: F821
            except Exception:  # noqa: BLE001
                pass
            time.sleep(poll)


if __name__ == "__main__":
    main()
