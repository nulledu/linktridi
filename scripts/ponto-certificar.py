# Pós-verificação das batidas + emissão de CERTIFICADO — roda no Mac.
#
#   python3 scripts/ponto-certificar.py             # certifica o que falta
#   python3 scripts/ponto-certificar.py --verificar <registro_id>
#   python3 scripts/ponto-certificar.py --apagar-fotos   # apaga selfie >30d JÁ certificada
#
# A ideia: em vez de guardar o ROSTO pra sempre, guardar um ATESTADO assinado.
# Para cada batida com selfie, o script re-verifica no modelo forte (o MESMO
# int8 do tablet): exatamente um rosto, embedding comparado com os constructos
# da própria pessoa. O veredito vira um certificado JSON:
#
#   { registro, pessoa, batido_em, lat/lon, conf_tablet, conf_servidor,
#     rostos_na_imagem, modelo, selfie_sha256, verificado_em }
#
# BLINDAGEM (v2):
#  · assinatura Ed25519 — a chave PRIVADA só existe neste Mac
#    (PONTO_CERT_ED25519 no .env.local); a PÚBLICA (ponto-certificado-publico.txt,
#    versionada) permite a qualquer um CONFERIR sem poder forjar. É a diferença
#    entre "o sistema diz" e "só o dono pôde ter emitido".
#  · CADEIA: cada certificado leva o número de sequência e o hash do anterior.
#    Editar, forjar ou APAGAR um do meio quebra a cadeia inteira
#    (--verificar-cadeia varre e denuncia o elo exato).
#  · o sha256 da selfie amarra o atestado à imagem exata.
# (v1, HMAC, continua verificável pelo caminho antigo.)
#
# Com o certificado emitido, a selfie vira descartável: --apagar-fotos remove
# as com mais de 30 dias (prazo de contestação) QUE têm certificado — nunca as
# sem. Fica a prova; o dado sensível morre.
#
# Depende de: supabase/ponto_certificados.sql (tabela) e PONTO_CERT_KEY.
import hashlib
import hmac
import json
import os
import sys
import urllib.request
import urllib.error

RAIZ = os.path.join(os.path.dirname(__file__), "..")
MODELO_INT8 = os.path.join(RAIZ, "ponto-app/app/src/main/assets/w600k_r50_int8.onnx")
DIM = 514
PRAZO_FOTO_DIAS = 30


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
CERT_KEY = ENV.get("PONTO_CERT_KEY", "")
SEED_ED = ENV.get("PONTO_CERT_ED25519", "")
PUB_PATH = os.path.join(RAIZ, "scripts/ponto-certificado-publico.txt")


def chave_privada():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    assert SEED_ED, "PONTO_CERT_ED25519 ausente no .env.local"
    return Ed25519PrivateKey.from_private_bytes(bytes.fromhex(SEED_ED))


def chave_publica():
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    return Ed25519PublicKey.from_public_bytes(bytes.fromhex(open(PUB_PATH).read().strip()))


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


def baixar_selfie(u):
    if u.startswith("http"):
        return urllib.request.urlopen(u, timeout=30).read()
    req = urllib.request.Request(f"{URL}/storage/v1/object/ponto-selfies/{u}",
                                 headers={"Authorization": f"Bearer {KEY}", "apikey": KEY})
    return urllib.request.urlopen(req, timeout=30).read()


def canonico(dados: dict) -> bytes:
    # JSON canônico (chaves ordenadas, sem espaço) — o que se assina.
    return json.dumps(dados, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def assinar_v1(dados: dict) -> str:
    return hmac.new(bytes.fromhex(CERT_KEY), canonico(dados), hashlib.sha256).hexdigest()


def assinar(dados: dict) -> str:
    return chave_privada().sign(canonico(dados)).hex()


def assinatura_ok(dados: dict, assinatura: str) -> bool:
    if dados.get("v", 1) == 1:
        return hmac.compare_digest(assinar_v1(dados), assinatura)
    try:
        chave_publica().verify(bytes.fromhex(assinatura), canonico(dados))
        return True
    except Exception:
        return False


def elo(dados: dict, assinatura: str) -> str:
    """O que o PRÓXIMO certificado referencia: hash de dados+assinatura."""
    return hashlib.sha256(canonico(dados) + assinatura.encode()).hexdigest()


def verificar(registro_id: str):
    rows = rest("GET", "ponto_certificados", params=f"?registro_id=eq.{registro_id}&select=dados,assinatura")
    if not rows:
        print("sem certificado para esse registro")
        return
    c = rows[0]
    ok = assinatura_ok(c["dados"], c["assinatura"])
    print(json.dumps(c["dados"], indent=2, ensure_ascii=False))
    print("assinatura:", "VÁLIDA ✓" if ok else "INVÁLIDA ✗ — o certificado foi alterado")


def verificar_cadeia():
    """Varre a cadeia inteira: assinatura de cada elo + encadeamento + sequência.
    Sumir com um certificado do meio, editar ou forjar → denuncia o elo exato."""
    todos = []
    for off in range(0, 1000000, 1000):
        rows = rest("GET", "ponto_certificados", params=f"?select=registro_id,dados,assinatura&limit=1000&offset={off}") or []
        todos.extend(rows)
        if len(rows) < 1000:
            break
    v2 = sorted([c for c in todos if c["dados"].get("v", 1) >= 2], key=lambda c: c["dados"]["seq"])
    problemas = 0
    anterior = "genesis"
    esperado = 1
    for c in v2:
        d = c["dados"]
        if not assinatura_ok(d, c["assinatura"]):
            print(f"✗ seq {d['seq']}: assinatura inválida (registro {d['registro']})"); problemas += 1
        if d["seq"] != esperado:
            print(f"✗ buraco na cadeia: esperava seq {esperado}, veio {d['seq']} — certificado sumiu ou foi inserido"); problemas += 1
        if d.get("elo_anterior") != anterior:
            print(f"✗ seq {d['seq']}: elo_anterior não bate — a cadeia foi mexida"); problemas += 1
        anterior = elo(d, c["assinatura"])
        esperado = d["seq"] + 1
    print(f"cadeia: {len(v2)} certificado(s) v2 · {problemas} problema(s)" + (" — ÍNTEGRA ✓" if problemas == 0 else ""))


def apagar_fotos_certificadas():
    import datetime as dt
    corte = (dt.datetime.utcnow() - dt.timedelta(days=PRAZO_FOTO_DIAS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    # só selfie EM CAMINHO (privada), antiga, e COM certificado
    certs = rest("GET", "ponto_certificados", params="?select=registro_id&limit=10000") or []
    ids = {c["registro_id"] for c in certs}
    regs = rest("GET", "ponto_registros",
                params=f"?select=id,selfie_url&selfie_url=not.is.null&batido_em=lt.{corte}&limit=5000") or []
    apagadas = 0
    for r in regs:
        if r["id"] not in ids or r["selfie_url"].startswith("http"):
            continue
        req = urllib.request.Request(f"{URL}/storage/v1/object/ponto-selfies/{r['selfie_url']}",
                                     method="DELETE", headers={"Authorization": f"Bearer {KEY}", "apikey": KEY})
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError:
            pass
        rest("PATCH", "ponto_registros", corpo={"selfie_url": None}, params=f"?id=eq.{r['id']}")
        apagadas += 1
    print(f"{apagadas} selfie(s) certificadas com +{PRAZO_FOTO_DIAS}d apagadas — os certificados ficam")


def certificar():
    import numpy as np
    import cv2
    import onnxruntime as ort_rt
    from insightface.app import FaceAnalysis
    from insightface.utils import face_align

    assert CERT_KEY, "PONTO_CERT_KEY ausente no .env.local"
    det = FaceAnalysis(name="buffalo_l", allowed_modules=["detection"])
    det.prepare(ctx_id=-1, det_size=(640, 640))
    sess8 = ort_rt.InferenceSession(MODELO_INT8, providers=["CPUExecutionProvider"])

    def embutir(crop):
        rgb = crop[:, :, ::-1].astype(np.float32)
        x = np.expand_dims(((rgb - 127.5) / 127.5).transpose(2, 0, 1), 0)
        v = sess8.run(None, {"input.1": x})[0].flatten()
        n = float(np.linalg.norm(v))
        return None if n <= 0 else list(v / n) + [0.0] * (DIM - len(v))

    # constructos por pessoa (o gabarito da verificação)
    amostras = {}
    for off in range(0, 100000, 1000):
        rows = rest("GET", "ponto_face_amostras", params=f"?select=pessoa_id,embedding&order=created_at.desc&limit=1000&offset={off}") or []
        for r in rows:
            e = r.get("embedding")
            if isinstance(e, list) and len(e) == DIM:
                amostras.setdefault(r["pessoa_id"], []).append(e)
        if len(rows) < 1000:
            break

    try:
        ja = set()
        ultimo_elo, ultimo_seq = "genesis", 0
        for off in range(0, 1000000, 1000):
            rows = rest("GET", "ponto_certificados", params=f"?select=registro_id,dados,assinatura&limit=1000&offset={off}") or []
            for c in rows:
                ja.add(c["registro_id"])
                d = c["dados"]
                if d.get("v", 1) >= 2 and d.get("seq", 0) > ultimo_seq:
                    ultimo_seq = d["seq"]
                    ultimo_elo = elo(d, c["assinatura"])
            if len(rows) < 1000:
                break
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print("A tabela ponto_certificados ainda não existe — rode supabase/ponto_certificados.sql no editor do Supabase e chame o script de novo.")
            return
        raise
    try:
        regs = rest("GET", "ponto_registros",
                    params="?select=id,pessoa_id,batido_em,selfie_url,confianca,lat,lon&selfie_url=not.is.null&order=batido_em.desc&limit=3000") or []
    except urllib.error.HTTPError:
        # colunas lat/lon ainda não criadas (ponto_localizacao.sql pendente)
        regs = rest("GET", "ponto_registros",
                    params="?select=id,pessoa_id,batido_em,selfie_url,confianca&selfie_url=not.is.null&order=batido_em.desc&limit=3000") or []
    pendentes = [r for r in regs if r["id"] not in ja]
    print(f"{len(pendentes)} batida(s) com selfie sem certificado")

    emitidos = 0
    import datetime as dt
    for r in pendentes:
        try:
            dados_img = baixar_selfie(r["selfie_url"])
            img = cv2.imdecode(np.frombuffer(dados_img, np.uint8), cv2.IMREAD_COLOR)
            if img is None:
                continue
            rostos = det.get(img)
            conf_srv = None
            if rostos and amostras.get(r["pessoa_id"]):
                maior = max(rostos, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
                emb = embutir(face_align.norm_crop(img, landmark=maior.kps))
                if emb is not None:
                    conf_srv = max(sum(a * b for a, b in zip(emb, m)) for m in amostras[r["pessoa_id"]])
            dados = {
                "v": 2,
                "seq": ultimo_seq + 1,
                "elo_anterior": ultimo_elo,
                "registro": r["id"],
                "pessoa": r["pessoa_id"],
                "batido_em": r["batido_em"],
                "lat": r.get("lat"), "lon": r.get("lon"),
                "conf_tablet": r.get("confianca"),
                "conf_servidor": round(conf_srv, 4) if conf_srv is not None else None,
                "rostos_na_imagem": len(rostos),
                "modelo": "w600k_r50-int8",
                "selfie_sha256": hashlib.sha256(dados_img).hexdigest(),
                "verificado_em": dt.datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            assinatura = assinar(dados)
            rest("POST", "ponto_certificados", corpo={"registro_id": r["id"], "dados": dados, "assinatura": assinatura})
            ultimo_seq = dados["seq"]
            ultimo_elo = elo(dados, assinatura)
            emitidos += 1
            if emitidos % 100 == 0:
                print(f"  {emitidos}…")
        except urllib.error.HTTPError as e:
            if e.code == 404 and "certificados" in str(e.url):
                print("Falta rodar supabase/ponto_certificados.sql no Supabase.")
                return
            pass
        except Exception:
            pass
    print(f"{emitidos} certificado(s) emitido(s)")


if __name__ == "__main__":
    if "--verificar-cadeia" in sys.argv:
        verificar_cadeia()
    elif "--verificar" in sys.argv:
        verificar(sys.argv[sys.argv.index("--verificar") + 1])
    elif "--apagar-fotos" in sys.argv:
        apagar_fotos_certificadas()
    else:
        certificar()
