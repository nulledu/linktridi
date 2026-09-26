# TridiChat — configurar o webhook da Meta

Vale para WhatsApp Cloud API e, depois, Instagram Messaging API. **Só APIs oficiais** — nada de
WhatsApp Web, QR Code, Baileys, Venom ou similar.

## Ordem obrigatória

Esta ordem não é preferência, é para não perder mensagem:

1. **Rodar o SQL** (`supabase/tridichat.sql`) no SQL Editor do Supabase.
2. **Cadastrar o canal** no TridiChat → Canais (entra junto com o formulário, na Etapa 2/3).
3. **Só então** apontar a URL na Meta.

Se o webhook apontar para um banco sem as tabelas, a Meta retenta, **desativa a inscrição** e
**não faz replay** do que passou. As mensagens daquele intervalo somem.

## URL e token

| Campo no painel da Meta | Valor |
|---|---|
| Callback URL | `https://SEU-DOMINIO/api/tridichat-webhook/meta` |
| Verify token | o mesmo salvo no canal (ou `TRIDICHAT_VERIFY_TOKEN` no primeiro handshake) |
| Campos a assinar | `messages` |

O caminho é `/api/tridichat-webhook` de propósito, separado de `/api/tridichat`. O middleware
libera por prefixo com `startsWith(p + "/")` — liberar `/api/tridichat` deixaria o **módulo
inteiro** acessível sem sessão. Só o galho do webhook é público, e ele se autentica por
assinatura HMAC, não por cookie.

## O que a rota faz

**GET** — a verificação que a Meta faz uma vez ao salvar a URL. Confere `hub.verify_token` em
tempo constante contra os tokens dos canais + o de env, e devolve o `hub.challenge` em **texto
puro**. Qualquer JSON aqui reprova a URL.

**POST** — eventos:

1. Lê o **corpo cru** (`req.text()`). O HMAC é sobre os bytes exatos — passar por `req.json()` e
   re-serializar muda ordem e espaçamento, e a assinatura nunca mais bate.
2. Descobre o canal pelo `phone_number_id` do payload e confere
   `X-Hub-Signature-256` com o `app_secret` daquele canal (ou o de env).
   Assinatura inválida → **403 e nada é gravado**. Sem isso, qualquer um na internet injetaria
   mensagem falsa na caixa de entrada.
3. Normaliza (WhatsApp e Instagram têm formatos diferentes; o resto do módulo só vê o formato interno).
4. Grava na fila com dedupe por `evento_id` e responde **200**.
5. Processa **depois da resposta**, via `after()` do Next, na mesma invocação.

### Códigos de resposta

| Situação | Resposta | Por quê |
|---|---|---|
| Assinatura inválida | `403` | evento não autenticado nunca vira dado |
| JSON inválido | `200` | retentativa não conserta corpo quebrado |
| Tabelas ausentes | `200` + log | 5xx faria a Meta desativar a inscrição |
| Falha real de banco | `500` | aí a retentativa da Meta é justamente o que se quer |

## Processamento assíncrono

Não há Redis nem worker neste projeto. A fila é a tabela `tridichat_eventos`, drenada em três
lugares, todos chamando a mesma função:

1. **`after()`** logo depois do 200 — caminho normal.
2. **`POST /api/tridichat/fila/drenar`** — chamado pelo PC da empresa que já roda
   `worker/worker.py` 24h. Autentica por `Authorization: Bearer $CONVERSAS_WORKER_TOKEN`.
   Cobre o que o `after()` perdeu (instância morta, timeout).
3. **Cron diário da Vercel** — rede de segurança. Aceita `CRON_SECRET`.

A resposta traz `restantes`: maior que zero significa "bata de novo", mesmo contrato de
`/api/trafego/sync`.

Evento que falha **não some**: volta para a fila com espera crescente (1min, 5, 20, 60, 240) e,
depois de 5 tentativas, vira `erro` — e ainda assim fica na tabela para inspeção.

## Testar sem a Meta

```bash
# 1) verificação (deve devolver o challenge em texto puro)
curl "http://localhost:3000/api/tridichat-webhook/meta?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=ABC123"

# 2) evento assinado
node -e '
const {createHmac}=require("crypto");
const corpo=JSON.stringify({object:"whatsapp_business_account",entry:[{id:"WABA1",changes:[{field:"messages",value:{messaging_product:"whatsapp",metadata:{phone_number_id:"SEU_PHONE_NUMBER_ID"},contacts:[{profile:{name:"Maria"},wa_id:"5544999998888"}],messages:[{from:"5544999998888",id:"wamid.TESTE1",timestamp:String(Math.floor(Date.now()/1000)),type:"text",text:{body:"oi"}}]}}]}]});
const sig="sha256="+createHmac("sha256",process.env.APP_SECRET).update(corpo,"utf8").digest("hex");
fetch("http://localhost:3000/api/tridichat-webhook/meta",{method:"POST",headers:{"content-type":"application/json","x-hub-signature-256":sig},body:corpo}).then(r=>r.text()).then(console.log);
'
```

Mandar o **mesmo** `wamid` duas vezes tem que resultar em **uma** mensagem — é o dedupe.

## Variáveis de ambiente

Só o que é do servidor. As credenciais **por canal** ficam no banco (`tridichat_canais`),
cadastradas pela tela Canais.

```
CONVERSAS_WORKER_TOKEN=   # ≥16 caracteres; sem ele a rota de drenagem recusa todo mundo
TRIDICHAT_VERIFY_TOKEN=   # fallback do primeiro handshake, antes de existir canal
WHATSAPP_APP_SECRET=      # opcional: app da Meta servindo vários canais
CRON_SECRET=              # já usado pelos 5 crons existentes
```

## Templates (janela de 24h)

Passadas 24 horas sem mensagem do cliente, a Cloud API recusa texto livre. O caminho é template
aprovado:

1. Crie e aprove no **Gerenciador da Meta** (leva alguns dias — não dá para fazer por aqui).
2. Preencha o **WhatsApp Business Account ID** no canal. Templates pertencem à *conta*, não ao
   número — sem o WABA ID não há o que sincronizar.
3. TridiChat → **Templates** → *Sincronizar com a Meta*.
4. Na conversa com a janela fechada, o campo de escrita vira **"Escolher um template"**, com
   preenchimento das variáveis e prévia antes de enviar.

Só templates com status **APPROVED** aparecem para escolher: oferecer os outros seria oferecer
algo que a Meta vai recusar.

## Mídia

Áudio, imagem, vídeo e documento recebidos são copiados para o bucket **privado**
`tridichat-midia` assim que chegam — a Meta manda só um `media_id`, e a URL dele expira em
minutos. A tela pede uma URL assinada de curta duração por `/api/tridichat/midia?mensagem=<id>`,
que passa pelo mesmo gate de permissão. Nada fica com link permanente nem adivinhável.

Falha ao baixar não derruba a ingestão: a mensagem já existe e aparece na conversa sem o arquivo,
em vez de sumir.

## Limitações desta etapa

- **Envio de mídia pelo atendente** ainda não existe — só recebimento. Enviar texto e template, sim.
- **Instagram**: normalizador pronto e testado, sem ativação — depende do WhatsApp estar de pé.
- **Automações** (Etapa 5) e **vínculo com lead/pedido/tags** (Etapa 6) ainda não existem.
- **Sem rate limiting** na rota. A Meta não abusa, mas a URL é pública.
