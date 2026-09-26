# Quantiza o w600k_r50 para INT8 (estático, QDQ) — os mesmos pesos em inteiros
# de 8 bits, que a CPU do tablet processa 2–3× mais rápido via os kernels C++
# do ONNX Runtime. Estático (e não dinâmico) porque o ganho em rede
# convolucional vem de calibrar as ATIVAÇÕES: usamos como calibração os rostos
# reais do cadastro (alinhados 112×112), então a faixa dos números é a da
# nossa própria operação.
#
#   python3 scripts/ponto-quantizar.py
#
# Saída: ponto-app/app/src/main/assets/w600k_r50_int8.onnx (~44MB).
# IMPORTANTE: int8 é um ESPAÇO próprio (score levemente deslocado do fp32) —
# os constructos têm que ser gerados pelo MESMO arquivo int8, e o sentinela
# de tamanho dele é 514 (512 + dois zeros). Ver ponto-embeddings.py.
import json
import os
import urllib.request

import numpy as np

RAIZ = os.path.join(os.path.dirname(__file__), "..")
ENTRADA = os.path.expanduser("~/.insightface/models/buffalo_l/w600k_r50.onnx")
SAIDA = os.path.join(RAIZ, "ponto-app/app/src/main/assets/w600k_r50_int8.onnx")


def env_local():
    out = {}
    with open(os.path.join(RAIZ, ".env.local")) as f:
        for l in f:
            if "=" in l and not l.strip().startswith("#"):
                k, v = l.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def rostos_de_calibracao(maximo=48):
    """Rostos reais, alinhados como o tablet alinha — a distribuição verdadeira."""
    import cv2
    from insightface.app import FaceAnalysis
    from insightface.utils import face_align

    env = env_local()
    req = urllib.request.Request(
        f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/ponto_pessoas?select=foto_url,fotos&ativo=eq.true",
        headers={"apikey": env["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}"},
    )
    pessoas = json.loads(urllib.request.urlopen(req).read())
    app = FaceAnalysis(name="buffalo_l", allowed_modules=["detection"])
    app.prepare(ctx_id=-1, det_size=(640, 640))

    crops = []
    for p in pessoas:
        for u in [x for x in ([p.get("foto_url")] + (p.get("fotos") or [])) if x][:2]:
            try:
                dados = urllib.request.urlopen(u, timeout=30).read()
                img = cv2.imdecode(np.frombuffer(dados, np.uint8), cv2.IMREAD_COLOR)
                rostos = app.get(img) if img is not None else []
                if rostos:
                    maior = max(rostos, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
                    crops.append(face_align.norm_crop(img, landmark=maior.kps))
            except Exception:
                pass
            if len(crops) >= maximo:
                return crops
    return crops


def como_tensor(crop):
    # BGR→RGB, NCHW, (v−127.5)/127.5 — idêntico ao tablet.
    rgb = crop[:, :, ::-1].astype(np.float32)
    x = (rgb - 127.5) / 127.5
    return np.expand_dims(x.transpose(2, 0, 1), 0)


def main():
    from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static
    from onnxruntime.quantization.shape_inference import quant_pre_process

    crops = rostos_de_calibracao()
    print(f"{len(crops)} rostos de calibração")
    assert len(crops) >= 8, "calibração precisa de rostos"

    class Leitor(CalibrationDataReader):
        def __init__(self):
            self.fila = [{"input.1": como_tensor(c)} for c in crops]
        def get_next(self):
            return self.fila.pop() if self.fila else None

    prep = SAIDA + ".prep.onnx"
    # O r50 é opset 11 (2021); a quantização POR CANAL (a que preserva precisão
    # em convolução) gera DequantizeLinear com `axis`, que só existe do 13 pra
    # frente. Sobe o opset antes.
    import onnx
    from onnx import version_converter
    m13 = version_converter.convert_version(onnx.load(ENTRADA), 13)
    entrada13 = SAIDA + ".op13.onnx"
    onnx.save(m13, entrada13)
    quant_pre_process(entrada13, prep)
    os.remove(entrada13)
    quantize_static(prep, SAIDA, Leitor(), quant_format=QuantFormat.QDQ,
                    activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8,
                    per_channel=True)
    os.remove(prep)
    print(f"gerado: {SAIDA} ({os.path.getsize(SAIDA) / 1048576:.0f}MB)")

    # Sanidade: int8 × fp32 nos mesmos rostos — o cosseno tem que ficar altíssimo.
    import onnxruntime as ort
    s32 = ort.InferenceSession(ENTRADA, providers=["CPUExecutionProvider"])
    s8 = ort.InferenceSession(SAIDA, providers=["CPUExecutionProvider"])
    piores = []
    for c in crops[:12]:
        t = como_tensor(c)
        a = s32.run(None, {"input.1": t})[0][0]
        b = s8.run(None, {"input.1": t})[0][0]
        cos = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
        piores.append(cos)
    print(f"cosseno int8×fp32 nos rostos de teste: mín {min(piores):.4f} · média {sum(piores)/len(piores):.4f}")
    assert min(piores) > 0.97, "quantização degradou demais — não usar"


if __name__ == "__main__":
    main()
