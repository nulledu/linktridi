# Domínio novo: Cloudflare na frente da Vercel, B2 depois

Domínio: **tridigaius.com.br**, registrado no registro.br. Nada aqui toca VPS.

Estado inicial medido em 2026-08-07: nameservers `a/b.auto.dns.br` (DNS do próprio
registro.br), zona vazia — sem A, sem CNAME, sem TXT.

---

## Fase 1 — Domínio no ar (Cloudflare DNS + Vercel)

### 1. Criar a zona no Cloudflare

1. Cloudflare → **Add a site** → `tridigaius.com.br` → plano **Free**.
2. O Cloudflare varre o DNS atual e te dá **dois nameservers** (ex.: `ana.ns.cloudflare.com`).
3. No **registrador** (registro.br, GoDaddy, Namecheap…) troque os nameservers pelos dois do
   Cloudflare. Propagação: minutos a algumas horas. A zona só vale quando aparece **Active**.

> No registro.br isso fica em *Alterar servidores DNS* → "Usar servidores DNS externos".

### 2. Adicionar o domínio na Vercel

Vercel → projeto → **Settings → Domains → Add** → `tridigaius.com.br`.
Adicione **as duas formas**: o apex e o `www` (a Vercel cria o redirect entre eles sozinha).

A Vercel vai pedir registros. No Cloudflare (**DNS → Records**):

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| A | `@` | `76.76.21.21` | **cinza** (por enquanto) |
| CNAME | `www` | `cname.vercel-dns.com` | **cinza** (por enquanto) |
| TXT | `_vercel` | *(o valor que a Vercel mostrar)* | — (TXT nunca é proxiado) |

Confira o IP/host **na tela da Vercel**, não aqui — ela muda de tempos em tempos.

### 3. Esperar o certificado, DEPOIS ligar o laranja

Esta ordem não é preciosismo. Com o proxy ligado, o desafio HTTP-01 da Let's Encrypt não
chega na Vercel e o certificado **nunca emite** — o domínio fica preso em "Invalid
Configuration".

1. Deixe cinza até a Vercel mostrar o cadeado / **Valid Configuration**.
2. Cloudflare → **SSL/TLS → Overview** → modo **Full (strict)**.
   `Flexible` = loop infinito de redirect. É o erro nº 1 desse setup.
3. Só então vire `@` e `www` para **laranja** (proxiado).

### 4. Ajustes no Cloudflare depois do laranja

- **Speed → Optimization**: desligue *Rocket Loader* e minificação de JS. Quebram hidratação
  do Next.
- **Caching → Cache Rules**: não crie "Cache Everything". O Cloudflare já não cacheia HTML
  por padrão, e cachear HTML de app logado vaza sessão entre usuários.
- **Security → Bots**: *Bot Fight Mode* injeta JS e derruba webhook/API. Deixe desligado, ou
  crie exceção para `/api/*`.
- **Always Use HTTPS**: pode ligar.

### 5. ⚠️ Específico deste projeto: `APP_HOSTS`

[`middleware.ts:53`](../middleware.ts) faz isolação de host. Hoje `APP_HOSTS` vazio =
fail-open (tudo passa). **Se você preencher, precisa listar TODOS os hosts do ERP** —
domínio novo, `www`, e o `*.vercel.app` que você ainda usa. Faltando um, `/login` responde
404 e a conclusão errada é "o domínio não funcionou".

```
APP_HOSTS=seudominio.com,www.seudominio.com,dashvendas.vercel.app
```

Se não precisa da isolação, **deixe vazio** e não invente configuração.

### 6. IP real do cliente

Com proxy ligado, `x-forwarded-for` traz IP do Cloudflare. O IP verdadeiro está em
**`cf-connecting-ip`**. Qualquer log, rate-limit ou auditoria que hoje lê `x-forwarded-for`
passa a registrar Cloudflare. Verifique antes de ligar o laranja.

### Checagem final da fase 1

- [ ] `https://tridigaius.com.br` abre com cadeado válido.
- [ ] `https://www.tridigaius.com.br` redireciona pro apex (ou vice-versa).
- [ ] `/login` responde (não 404) — teste de aba anônima.
- [ ] Um POST de API funciona (Bot Fight Mode desligado).
- [ ] `curl -sI https://tridigaius.com.br | grep -i cf-ray` retorna header → proxy ativo.

---

## Os dois endereços convivem — e isso é o estado correto

Depois da fase 1 o projeto responde por dois endereços, de propósito:

| Endereço | Caminho | Quem usa |
|---|---|---|
| `tridigaius.com.br` | Cloudflare → Vercel | pessoas, navegador |
| `tridigaius.vercel.app` | direto na Vercel | tablet, TV, posto, ponto, webhooks, OAuth |

Mesmo deployment, mesmo banco, mesma sessão. A Vercel roteia qualquer domínio atribuído ao
projeto pro mesmo app — não há nada a duplicar.

### `tridigaius.vercel.app` NÃO pode passar pelo Cloudflare

O Cloudflare só proxia zona cujo **nameserver** você controla, e o `vercel.app` é da Vercel.
Não existe plano nem configuração que resolva. Também não é problema: o `.vercel.app` já é
servido pela edge da própria Vercel, com TLS, HTTP/2 e mitigação de DDoS. É outra CDN, não
"sem CDN".

### O plano Free do Cloudflare aguenta

Banda e requisições **ilimitadas**, DDoS incluído. Não há cota de tráfego pra estourar.

**Expectativa errada a evitar:** o Cloudflare **não reduz invocação na Vercel**. Ele cacheia
asset estático; HTML de app logado e `/api/*` não são cacheáveis. Cada poll do ERP continua
sendo uma invocação cheia. Quem resolve o estouro de agosto/2026 (1,1M invocações, 11h53 de
CPU) continua sendo o recuo progressivo do `usePollComRecuo` — não relaxe o poll achando que
o Cloudflare cobre.

---

## ⛔ NÃO redirecionar o `.vercel.app` — quebra webhook e frota

A Vercel oferece **Domains → Redirect to**. Funciona. **Não ligue.**

### Por que a frota quebra

`tridigaius.vercel.app` está **compilado dentro** dos clientes nativos:

- [`tridimarket-app/app/build.gradle.kts:20`](../tridimarket-app/app/build.gradle.kts) — tablet do mercadinho
- [`tv-central/core/network/build.gradle.kts:18`](../tv-central/core/network/build.gradle.kts) — TV
- [`posto/src/renderer/index.html:76`](../posto/src/renderer/index.html) — posto (campo editável, não exige recompilar)
- `ponto-app/`, `android/` — ponto

### Por que os webhooks quebram (pior)

Recebem POST de fora, com a URL `.vercel.app` cadastrada no painel de terceiros:

| Rota | Quem chama |
|---|---|
| [`app/api/tridichat-webhook`](../app/api/tridichat-webhook) | Meta (WhatsApp / Instagram) |
| [`app/api/marketplaces/[provider]/webhook`](../app/api/marketplaces) | marketplaces |
| [`app/api/webhooks/leads-x1`](../app/api/webhooks/leads-x1) | captação de leads |
| [`app/api/trafego/oauth/meta/callback`](../app/api/trafego/oauth/meta/callback) | Meta (OAuth) |

- Webhook é **POST**, e provedor de webhook em geral **não segue redirect** — a Meta não segue.
  Ela vê o 30x, marca entrega falhada, e **não reenvia** pro destino novo.
- A Meta **desativa a inscrição** após falhas repetidas. Desfazer o redirect não basta: tem
  que reinscrever no painel dela.
- Mesmo quem segue redirect perde **corpo do POST e assinatura** no caminho → validação HMAC
  falha do outro lado.

**Sem redirect, tudo isso continua funcionando normalmente.** O domínio novo não muda nada
para quem chama a URL antiga.

### Ordem correta, se um dia quiser unificar

1. Criar `app.tridigaius.com.br` (Cloudflare, laranja) no mesmo projeto Vercel.
2. Recompilar cada cliente nativo com o endereço novo; atualizar a frota em campo.
3. **Reapontar cada webhook no painel do provedor** (Meta, marketplaces) e confirmar entrega.
4. Atualizar callbacks de OAuth ([`docs/trafego-integracoes-oauth.md`](trafego-integracoes-oauth.md)).
5. Só então ligar o redirect.

Isso é migração de frota, aparelho por aparelho. **Não misture com a fase 1.**

---

## Fase 2 — Backblaze B2 no lugar do Supabase Storage

### Por que isso vale a pena aqui

O Supabase já estourou uma vez por egress (6,3 GB, banco de 53 MB). Mídia servida por
`getPublicUrl` do Supabase é egress cobrado a cada view. **B2 + Cloudflare = egress zero**
(Bandwidth Alliance), desde que o tráfego saia por um hostname proxiado pelo Cloudflare —
nunca pelo `f00X.backblazeb2.com` direto.

### O que existe hoje (o trabalho real)

Nove pontos gravam/leem direto no Supabase Storage:

| Arquivo | Bucket |
|---|---|
| [`app/api/upload/route.ts`](../app/api/upload/route.ts) | variável |
| [`app/api/device/upload/route.ts`](../app/api/device/upload/route.ts) | `photos` |
| [`app/api/ponto/bater/route.ts`](../app/api/ponto/bater/route.ts) | `photos` |
| [`app/api/ponto/cadastro/route.ts`](../app/api/ponto/cadastro/route.ts) | `photos` |
| [`app/api/recebimento/tablet/confirmar/route.ts`](../app/api/recebimento/tablet/confirmar/route.ts) | `photos` |
| [`app/api/tridimarket/foto-produto/route.ts`](../app/api/tridimarket/foto-produto/route.ts) | `photos` |
| [`lib/ponto.ts`](../lib/ponto.ts) | `photos` (remove) |
| [`lib/tridimarket/notas.ts`](../lib/tridimarket/notas.ts) | notas (signed URL) |
| [`lib/tridichat/midia.ts`](../lib/tridichat/midia.ts), [`anexo.ts`](../lib/tridichat/anexo.ts) | mídia |

**Não troque um por um.** Crie `lib/storage.ts` com quatro funções — `enviar`,
`urlPublica`, `urlAssinada`, `remover` — migre os nove chamadores pra ela **ainda no
Supabase** (refactor sem mudança de comportamento, testável), e só então troque o miolo
por B2. Assim a migração é uma linha, e reverter também.

### DNS do CDN

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| CNAME | `cdn` | `f003.backblazeb2.com` *(confira sua região no B2)* | **laranja — obrigatório** |

Cinza aqui = egress cobrado pela Backblaze. O laranja é o que zera a conta.

No B2: bucket **público** para foto de produto/perfil; bucket **privado** + URL assinada
para nota fiscal e anexo de conversa (é o padrão que `notas.ts` já usa).

Path do B2 inclui o bucket (`/file/meu-bucket/caminho.jpg`). Para servir
`cdn.tridigaius.com.br/caminho.jpg` limpo, use uma **Cloudflare Transform Rule** reescrevendo
o path — não um Worker, que custa invocação.

### Cache

Cache Rule em `cdn.tridigaius.com.br/*` → *Edge TTL* longo (30 dias) + *Browser TTL* longo.
Mídia é imutável se o nome do arquivo carrega hash/timestamp — o que os uploads atuais já
fazem. Sem isso o CDN é decorativo.

### Ordem segura da migração

1. `lib/storage.ts` com implementação Supabase; nove chamadores migrados; deploy.
2. Bucket B2 + `cdn.` proxiado + Transform Rule; validar com um arquivo subido na mão.
3. Flag de ambiente `STORAGE_DRIVER=supabase|b2`; upload **novo** vai pro B2, leitura
   continua resolvendo os dois.
4. Backfill dos arquivos antigos (rclone), só depois de dias sem incidente.
5. Aposentar o driver Supabase.

Nunca apague nada do Supabase Storage antes do passo 5 confirmado.
