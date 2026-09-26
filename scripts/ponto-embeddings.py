# Gera os "constructos" (embeddings faciais 512-d, ArcFace w600k_mbf) NO MAC e
# manda prontos pro servidor — o tablet baixa os vetores no sync e não precisa
# calcular nada do cadastro.
#
#   python3 scripts/ponto-embeddings.py
#
# Por que aqui e não no tablet: o Mac roda o pipeline COMPLETO do InsightFace
# (detector SCRFD + alinhamento por 5 pontos + w600k_mbf), que alinha melhor que
# os 2 olhos do ML Kit no tablet. O MODELO é o mesmo dos dois lados — regra de
# ouro: embedding só compara com embedding do mesmo modelo, e o app descarta
# qualquer vetor cujo tamanho não seja o do motor ativo (512).
#
# O que faz, por pessoa ATIVA com foto:
#   1. baixa as fotos (perfil + extras, até 4);
#   2. detecta o maior rosto e gera o embedding 512-d normalizado;
#   3. grava em ponto_face_amostras (o mesmo canal dos moldes aprendidos).
# Antes disso, apaga da tabela os vetores de MODELO ANTIGO (tamanho ≠ 512) —
# eles nunca mais casam com nada e só ocupariam as 6 vagas por pessoa.
#
# Requisitos (uma vez):  pip3 install insightface onnxruntime opencv-python-headless requests
# Modelos: ~/.insightface/models/buffalo_s (baixa sozinho na primeira execução).
import json
import os
import sys
import urllib.request

RAIZ = os.path.join(os.path.dirname(__file__), "..")
# O EMBEDDING sai do MESMO arquivo int8 que roda no tablet
# (assets/w600k_r50_int8.onnx) — int8 é um espaço próprio, com score levemente
# deslocado do fp32, então cadastro e selfie têm que nascer do mesmo binário.
# A detecção/alinhamento continua no pipeline buffalo_l (só acha o rosto).
# Sentinelas de TAMANHO separam os espaços em todo o sistema:
#   514 = r50 int8 · 513 = r50 fp32 · 512 = mbf · 192 = tflite
# (componentes extras são 0.0 — não mudam produto escalar nem norma).
PACOTE = "buffalo_l"
MODELO_INT8 = os.path.join(RAIZ, "ponto-app/app/src/main/assets/w600k_r50_int8.onnx")
DIM = 514
MAX_FOTOS = 4
# Por foto: rosto inteiro + espelho + 3 oclusões (metade esq/dir tapada e a
# metade de baixo tapada). O molde parcial é o que faz um rosto PARCIAL na
# câmera casar: o embedding de meio rosto vivo cai perto do embedding de meio
# rosto cadastrado — nunca do rosto inteiro. Até 20 constructos por pessoa
# (4 fotos × 5 variantes), dedupe de quase-idênticos.
MAX_POR_PESSOA = 20

def env_local():
    out = {}
    with open(os.path.join(RAIZ, ".env.local")) as f:
        for l in f:
            if "=" in l and not l.strip().startswith("#"):
                k, v = l.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out

ENV = env_local()
URL = ENV["NEXT_PUBLIC_SUPABASE_URL"]
KEY = ENV["SUPABASE_SERVICE_ROLE_KEY"]

def rest(metodo, caminho, corpo=None, params=""):
    req = urllib.request.Request(
        f"{URL}/rest/v1/{caminho}{params}",
        data=json.dumps(corpo).encode() if corpo is not None else None,
        method=metodo,
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "Prefer": "return=minimal"},
    )
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None

def main():
    import numpy as np
    from insightface.app import FaceAnalysis
    import cv2

    app = FaceAnalysis(name=PACOTE, allowed_modules=["detection", "recognition"])
    app.prepare(ctx_id=-1, det_size=(640, 640))   # CPU

    pessoas = rest("GET", "ponto_pessoas", params="?select=id,nome,foto_url,fotos&ativo=eq.true&order=nome")
    print(f"{len(pessoas)} pessoa(s) ativa(s)")

    # Vetores de modelo antigo fora — o app os ignora, mas eles ocupam as vagas.
    velhas = rest("GET", "ponto_face_amostras", params="?select=id,embedding&limit=2000") or []
    ids_velhos = [r["id"] for r in velhas if not isinstance(r.get("embedding"), list) or len(r["embedding"]) != DIM]
    if ids_velhos:
        for i in range(0, len(ids_velhos), 50):
            lote = ",".join(f'"{x}"' for x in ids_velhos[i:i+50])
            rest("DELETE", "ponto_face_amostras", params=f"?id=in.({lote})")
        print(f"apagadas {len(ids_velhos)} amostra(s) de modelo antigo")

    from insightface.utils import face_align
    import onnxruntime as ort_rt

    # O reconhecedor é o ARQUIVO INT8 DO TABLET, não o do pacote insightface.
    sess8 = ort_rt.InferenceSession(MODELO_INT8, providers=["CPUExecutionProvider"])

    class RecInt8:
        def get_feat(self, crop):
            rgb = crop[:, :, ::-1].astype(np.float32)
            x = np.expand_dims(((rgb - 127.5) / 127.5).transpose(2, 0, 1), 0)
            return sess8.run(None, {"input.1": x})[0]
    rec = RecInt8()

    def variantes(alinhado):
        """Recorte alinhado 112x112 → as vistas que cadastramos. A oclusão usa a
        cor média do próprio rosto (não preto): borrão neutro, sem borda dura
        que o modelo confundiria com óculos/máscara."""
        media = alinhado.mean(axis=(0, 1))
        vs = [alinhado, cv2.flip(alinhado, 1)]
        for (y0, y1, x0, x1) in [(0, 112, 0, 56), (0, 112, 56, 112), (56, 112, 0, 112)]:
            v = alinhado.copy()
            v[y0:y1, x0:x1] = media
            vs.append(v)
        return vs

    def normalizar(v):
        n = float(np.linalg.norm(v))
        if n <= 0:
            return None
        base = [float(x) / n for x in v]
        return base + [0.0] * (DIM - len(base))   # sentinela de tamanho do espaço

    # ── Selfies de batida viram cadastro (com guarda-corpo) ──────────────────
    # A melhor foto de uma pessoa é a que ela tira TODO DIA, na câmera e na luz
    # reais do tablet. Mas selfie atribuída errado viraria cadastro do rosto
    # errado e amplificaria o erro pra sempre — por isso os filtros:
    #   · só batida com score ALTO — e a régua é mais dura pro modelo antigo
    #     (mbf), que já provou errar a 0.61: lá só entra ≥0.72; no r50 int8
    #     (depois de 03/09 13:30 UTC) entra ≥0.55;
    #   · só pessoa ATIVA (selfie de ex-funcionário fica fora);
    #   · rosto não pode encostar na faixa do carimbo (12% de baixo da imagem,
    #     selfies de 03/09 em diante saem carimbadas);
    #   · no máximo 3 por pessoa, as de maior score, últimos 30 dias.
    CORTE_R50Q = "2026-09-03T13:30:00Z"
    import datetime as _dt
    desde_sel = (_dt.datetime.utcnow() - _dt.timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    regs = rest("GET", "ponto_registros",
                params=f"?select=pessoa_id,selfie_url,confianca,batido_em&selfie_url=not.is.null&confianca=not.is.null&batido_em=gte.{desde_sel}&order=confianca.desc&limit=1000") or []
    selfies_por_pessoa = {}
    for r in regs:
        conf = r.get("confianca") or 0
        minimo = 0.55 if r["batido_em"] >= CORTE_R50Q else 0.72
        if conf < minimo:
            continue
        selfies_por_pessoa.setdefault(r["pessoa_id"], []).append(r)

    def baixar_selfie(u):
        """Selfie mora no bucket PRIVADO (selfie_url é caminho, não URL) — baixa
        com a service key. URL http antiga (pré-migração) ainda funciona."""
        if u.startswith("http"):
            return urllib.request.urlopen(u, timeout=30).read()
        req = urllib.request.Request(f"{URL}/storage/v1/object/ponto-selfies/{u}",
                                     headers={"Authorization": f"Bearer {KEY}", "apikey": KEY})
        return urllib.request.urlopen(req, timeout=30).read()

    def embutir_selfie(reg, vetores):
        """Selfie de batida → constructo (inteiro + espelho). None se reprovar."""
        dados = baixar_selfie(reg["selfie_url"])
        img = cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            return 0
        rostos = app.get(img)
        if not rostos:
            return 0
        maior = max(rostos, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
        # carimbo: rosto encostando nos 12% de baixo invalida o recorte
        if reg["batido_em"] >= "2026-09-03T12:00:00Z" and maior.bbox[3] > img.shape[0] * 0.86:
            return 0
        alinhado = face_align.norm_crop(img, landmark=maior.kps)
        n = 0
        for v in [alinhado, cv2.flip(alinhado, 1)]:
            emb = normalizar(rec.get_feat(v).flatten())
            if emb is None or len(emb) != DIM:
                continue
            if any(sum(a * b for a, b in zip(emb, e)) > 0.985 for e in vetores):
                continue
            vetores.append(emb)
            n += 1
        return n

    total = 0
    for p in pessoas:
        fotos = [u for u in ([p.get("foto_url")] + (p.get("fotos") or [])) if u][:MAX_FOTOS]
        if not fotos and p["id"] not in selfies_por_pessoa:
            print(f"  {p['nome']}: sem foto — pulada")
            continue
        vetores = []
        for u in fotos:
            try:
                dados = urllib.request.urlopen(u, timeout=30).read()
                img = cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_COLOR)
                if img is None:
                    continue
                rostos = app.get(img)
                if not rostos:
                    continue
                maior = max(rostos, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
                alinhado = face_align.norm_crop(img, landmark=maior.kps)
                for v in variantes(alinhado):
                    emb = normalizar(rec.get_feat(v).flatten())
                    if emb is None or len(emb) != DIM:
                        continue
                    # dedupe: quase-idêntico a um que já temos não acrescenta nada
                    if any(sum(a * b for a, b in zip(emb, e)) > 0.985 for e in vetores):
                        continue
                    vetores.append(emb)
                    if len(vetores) >= MAX_POR_PESSOA:
                        break
                if len(vetores) >= MAX_POR_PESSOA:
                    break
            except Exception as e:
                print(f"  {p['nome']}: foto falhou ({type(e).__name__})")
        # selfies de batida aprovadas (até 3, as de maior score)
        n_selfies = 0
        for reg in selfies_por_pessoa.get(p["id"], [])[:6]:
            if n_selfies >= 3:
                break
            try:
                n_selfies += 1 if embutir_selfie(reg, vetores) > 0 else 0
            except Exception:
                pass
        if not vetores:
            print(f"  {p['nome']}: NENHUM rosto detectável nas fotos ⚠")
            continue
        # Substitui as amostras 512 de cadastro anteriores desta pessoa (mantém as
        # aprendidas pela câmera fora do alcance: só inserimos, e o teto de 6 por
        # pessoa é aparado pelo servidor na ordem "mais recente fica").
        rest("POST", "ponto_face_amostras", corpo=[{"pessoa_id": p["id"], "embedding": v} for v in vetores])
        total += len(vetores)
        print(f"  {p['nome']}: {len(vetores)} constructo(s)" + (f" ({n_selfies} de selfie de batida)" if n_selfies else ""))
    print(f"\n{total} embeddings gravados. O tablet baixa no próximo sync (ou toque 7x na tela → Sincronizar pessoas).")

if __name__ == "__main__":
    main()
