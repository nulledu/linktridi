# Integrações de Tráfego — OAuth real (o que fazer)

A UI e o scaffold já existem (`IntegracoesCentral` + `/api/trafego/integracoes`).
Falta a parte que **depende de credenciais externas**. Este doc lista, por
plataforma, o que **você** precisa obter e o que **eu** implemento depois.

## Divisão de trabalho

**Você (uma vez por plataforma):**
1. Criar o app de desenvolvedor na plataforma.
2. Pegar as chaves (Client ID / Secret / Developer Token…).
3. Cadastrar a **Redirect URI** (abaixo).
4. Me passar as chaves → eu coloco nas variáveis de ambiente (Vercel).

**Eu (por plataforma):**
- Rota de início do OAuth: `GET /api/trafego/oauth/<plataforma>/start` → redirect.
- Rota de callback: `GET /api/trafego/oauth/<plataforma>/callback` → troca `code`
  por token, guarda com segurança (tabela `meta_tokens`-like ou nova), lista contas.
- Renovação/expiração/revogação do token.
- Seleção de contas + puxar campanhas/anúncios pro mesmo `AdsOverview`.
- Card de status vira **Conectado** sozinho.

## Redirect URI (cadastrar em todas)

```
https://<seu-dominio>/api/trafego/oauth/<plataforma>/callback
# ex.: https://tridigaius.vercel.app/api/trafego/oauth/google/callback
```
(em dev: `http://localhost:3000/api/trafego/oauth/<plataforma>/callback`)

---

## 1) Google Ads  ⚠️ mais burocrático (aprovação leva dias)
Onde: Google Cloud Console + Google Ads API Center.
Passos:
1. Google Cloud → novo projeto → **APIs & Services → Ativar "Google Ads API"**.
2. **Tela de consentimento OAuth** (External) + escopo `https://www.googleapis.com/auth/adwords`.
3. **Credentials → OAuth client ID (Web)** → cadastrar a Redirect URI → pega Client ID/Secret.
4. Em uma conta **MCC (Manager)** do Google Ads → **API Center → solicitar Developer Token**
   (começa em "test", precisa de **aprovação** pra dados reais — pode levar alguns dias).
Env:
```
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_DEVELOPER_TOKEN=...
```

## 2) TikTok Ads  ✅ mais direto
Onde: TikTok for Business — Marketing API.
Passos:
1. https://business-api.tiktok.com/ → **Developer → criar App** (Marketing API).
2. Cadastrar a Redirect URI + escopos (Ad Account, Reporting).
3. Pega **App ID** e **Secret**.
Env:
```
TIKTOK_APP_ID=...
TIKTOK_APP_SECRET=...
```

## 3) Kwai Ads
Onde: Kwai for Business (acesso à API costuma exigir contato com o gerente da conta).
Passos: solicitar acesso à Marketing API → criar app → Redirect URI → Client ID/Secret.
Env:
```
KWAI_CLIENT_ID=...
KWAI_CLIENT_SECRET=...
```

## 4) Taboola
Onde: Taboola Backstage → API (Client Credentials, não é OAuth de usuário).
Passos: no Backstage, pedir **Client ID/Secret** de API pra sua conta.
Env:
```
TABOOLA_CLIENT_ID=...
TABOOLA_CLIENT_SECRET=...
```

## 5) Google Analytics 4 (opcional, p/ sessões do site)
Onde: Google Cloud → Service Account + acesso à propriedade GA4.
Passos:
1. Ativar **Google Analytics Data API**.
2. Criar **Service Account** → chave JSON.
3. Em GA4 → Admin → Acesso à propriedade → adicionar o e-mail da service account (Leitor).
Env:
```
GA4_PROPERTY_ID=123456789
GA4_CLIENT_EMAIL=...@...iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## Meta Ads — já pronto ✅
Nada a fazer: conecta colando o token em **Tráfego → Contas de anúncio**.

---

## Recomendação de ordem
1. **TikTok** — OAuth mais simples, sem aprovação demorada → melhor pra validar o fluxo ponta a ponta.
2. **Google Ads** — maior valor, mas peça o Developer Token **já** (aprovação demora).
3. GA4 (rápido, service account) → depois Kwai/Taboola conforme acesso.

## Assim que você me passar as chaves de UMA plataforma
Eu implemento: rota start + callback, storage do token, renovação, seleção de
contas e o fetch das campanhas/anúncios entrando no mesmo dashboard. Testo o
fluxo de conexão e te mostro conectado.
