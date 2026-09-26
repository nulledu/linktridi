# Ponto Tridi — app de tablet do Controle de Ponto

Tablet kiosk que bate ponto por **selfie com reconhecimento facial** — 100%
offline depois do sync (ML Kit p/ achar o rosto + MobileFaceNet TFLite p/ o
embedding; comparação por similaridade de cosseno no próprio aparelho).

## Fluxo
1. **Parear**: no painel (Administração → Controle de Ponto → Tablet) gere um
   código de 6 dígitos e digite no app. O tablet vira um *device* (mesmo esquema
   do app de atividades — token no header `x-device-token`).
2. **Sincronizar**: o app baixa as pessoas ativas (nome + fotos) de
   `/api/ponto/sync` e converte cada foto em embedding local.
3. **Bater ponto**: a pessoa toca em BATER PONTO → selfie → reconhecimento →
   confirmação ("Sou eu") → `POST /api/ponto/bater` (com a selfie p/ auditoria).
   Entrada/saída alterna sozinho pela última batida do dia (decidido no servidor).
4. Sem certeza (score < 0.62) → a pessoa escolhe o próprio nome na lista
   (candidatos mais parecidos primeiro). Nunca chuta em silêncio.

## Build
```bash
cd ponto-app && ./gradlew :app:assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Requisitos: JDK 17, Android SDK (local.properties → sdk.dir). minSdk 24 (Android 7).

## Servidor
Padrão: `https://dashvendas-ashen.vercel.app` (produção). Pra testar com o dev
server local via USB: `adb reverse tcp:3000 tcp:3000` e use `http://localhost:3000`
na tela de pareamento.

## Modelo
`app/src/main/assets/mobile_face_net.tflite` (MobileFaceNet, 112×112 → 192-d).
Entrada normalizada (px-127.5)/128; saída L2-normalizada; cosseno ≥ 0.62 = confiante.

## Modelo de rosto (não versionado)

O reconhecimento usa o **w600k_r50** (InsightFace/ArcFace, 174MB) — grande
demais pro GitHub, então o arquivo fica fora do git. Antes de buildar:

```bash
curl -sL -o /tmp/buffalo_l.zip https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip
unzip -o /tmp/buffalo_l.zip -d /tmp/buffalo_l
cp /tmp/buffalo_l/w600k_r50.onnx app/src/main/assets/
```

Depois, gere a versão INT8 (a que o app prefere — 213ms/embedding no P40HD
contra 768ms do fp32): `python3 ../scripts/ponto-quantizar.py` (usa rostos do
cadastro como calibração e valida a fidelidade contra o fp32).

Sem nenhum dos dois o app compila e roda com o w600k_mbf (13MB, versionado).
A ordem de preferência mora no FaceEngine, e os espaços não se misturam — o
TAMANHO do vetor identifica o modelo (componentes extras são 0.0):
514 = r50 int8 · 513 = r50 fp32 · 512 = mbf · 192 = tflite.
Trocou o modelo? Rode `python3 ../scripts/ponto-embeddings.py` no Mac pra
regenerar os constructos no espaço novo (o app detecta a troca sozinho e
re-sincroniza).
