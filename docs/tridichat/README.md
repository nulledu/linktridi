# TridiChat

Atendimento e automações por **WhatsApp Cloud API** e **Instagram Messaging API**, dentro do Gaius.

Só APIs oficiais da Meta. Nada de WhatsApp Web, QR Code, Baileys, Venom, WPPConnect, scraping ou
navegador simulado.

- [Configurar o webhook da Meta](configurar-webhook.md) — passo a passo e como testar sem a Meta
- [Análise e plano técnico](analise-e-plano.md) — o mapa do sistema que originou este módulo

---

## Por onde começar (ordem obrigatória)

1. **Rodar `supabase/tridichat.sql`** no SQL Editor do Supabase. É idempotente.
2. **Liberar a área** `TridiChat` na grade de permissões, por pessoa.
3. **Conectar o canal** em TridiChat → Canais, e clicar em *Testar conexão*.
4. **Só então** apontar a URL do webhook na Meta.

A ordem não é preferência. Se o webhook chegar antes das tabelas existirem, a Meta retenta,
**desativa a inscrição** e não faz replay — as mensagens daquele intervalo se perdem.

---

## Arquitetura

```
Meta ──POST──▶ /api/tridichat-webhook/meta
                 │ 1. corpo cru → confere X-Hub-Signature-256 (HMAC, tempo constante)
                 │ 2. normaliza (WhatsApp e Instagram → formato interno único)
                 │ 3. grava em tridichat_eventos (dedupe por evento_id) e responde 200
                 └─after()─▶ drenador
                              ├─ ingestão: contato → conversa → mensagem → mídia
                              └─ motor de automações
```

**Sem Redis, sem broker, sem worker Node** — o projeto não tem nenhum dos três. A fila é uma
tabela no Postgres com CAS otimista, no mesmo desenho de `market_worker_jobs`.

O drenador roda em três lugares, todos chamando a mesma função:

| Onde | Quando | Autenticação |
|---|---|---|
| `after()` do Next | logo após o 200 ao webhook | — (mesma invocação) |
| `POST /api/tridichat/fila/drenar` | o PC da empresa que já roda `worker/worker.py` 24h | `Bearer CONVERSAS_WORKER_TOKEN` |
| Cron da Vercel (diário) | rede de segurança | `Bearer CRON_SECRET` |

> O cron é **diário**, não horário: cron horário estoura o limite do plano e **falha o deploy**
> (ver `app/api/trafego/warm/route.ts`). Quem dá frequência real é o `after()` e o PC 24h.

### Arquivos

```
lib/tridichat/
  tipos.ts              tipos + janela de 24h (funções puras, testadas)
  db.ts                 camada de dados tolerante a SQL não rodado + log estruturado
  meta/assinatura.ts    HMAC do webhook e verificação da URL
  meta/normalizar.ts    payload da Meta → formato interno
  meta/cloud-api.ts     envio pela Cloud API
  fila.ts               enfileirar / reivindicar (CAS) / backoff
  ingestao.ts           evento → contato, conversa, mensagem
  midia.ts              copia mídia para o bucket privado
  envio.ts              PONTO ÚNICO de saída — janela, idempotência, "robô cala"
  conversas.ts          caixa de entrada, thread com cursor, atribuição
  contatos.ts           cadastro de pessoa: tags, lead, pedidos do ERP
  templates.ts          espelho dos templates aprovados na Meta
  automacao-schema.ts   zod do gatilho e das etapas + validação de publicação
  motor.ts              executa o fluxo no servidor, com estado por conversa
  metricas.ts           a visão simples
```

---

## As regras que não podem ser relaxadas

**Janela de 24 horas.** Fora dela a Cloud API recusa texto livre — só template aprovado. A conta
sai do `timestamp` da **Meta** (`ultima_entrada_em`), nunca de `now()`: o webhook pode chegar
minutos depois ou ser reprocessado. Conversa sem nenhuma mensagem recebida conta como **fechada** —
na dúvida exigir template, porque o contrário faz a mensagem falhar depois da atendente já ter
digitado.

**O robô nunca fala por cima de um humano.** Quando um atendente responde, a conversa vira
`modo = humano`, e as execuções de automação vivas são **canceladas**. Devolver para a automação é
ação explícita — nunca automática.

**Idempotência.** Sem transação nem lock neste projeto (tudo é PostgREST), a trava é o `UNIQUE`:
`evento_id` no webhook, `(canal_id, provider_message_id)` na mensagem recebida, `idempotencia` no
envio, `(canal_id, contato_id)` na conversa.

**Segredo não volta.** Token, verify token e app secret ficam em `tridichat_canais` e só saem do
servidor como booleano + os 4 últimos caracteres. Campo em branco na edição significa *manter*,
nunca *apagar*.

---

## Permissões

Área `tridichat`, default-deny, com 11 sub-permissões. Três são **sensíveis** (ficam fora de
qualquer concessão em bloco):

| Sub | O que libera |
|---|---|
| `ver` / `ver_todas` | a caixa; sem `ver_todas` a pessoa só enxerga o que é dela — filtrado **na query** |
| **`responder`** | manda mensagem REAL ao cliente e assume a conversa |
| `atribuir` · `contatos` · `templates` · `metricas` · `logs` | o resto do dia a dia |
| `automacoes` | monta o fluxo (sozinho, não põe nada no ar) |
| **`publicar`** | coloca o fluxo no ar: o robô passa a responder sozinho |
| **`canais`** | credenciais da Meta |

---

## Automações

Lista **ordenada** de etapas, não canvas. O canvas é do TridiFlow, onde o fluxo roda no navegador
do visitante; aqui o motor roda no servidor, com estado por conversa e espera de dias.

**Gatilhos:** mensagem recebida (com palavras-chave), conversa iniciada, contato criado, lead
criado, webhook interno.

**Etapas:** enviar mensagem (com `{{contato.nome}}`), esperar resposta, esperar tempo, condição,
adicionar/remover tag, criar lead, atribuir (pessoa, rodízio ou manter), criar atividade, enviar
webhook, encerrar.

Publicar **valida de verdade**: salto para etapa inexistente, id repetido, condição sem caminho,
atribuição sem pessoa, URL inválida, espera sem teto. Automação quebrada no ar deixa o cliente
falando sozinho e ninguém percebe. O editor mostra o que falta **antes** de a pessoa tentar.

Fluxo circular para no teto de **50 passos** por execução — saltar para trás é legítimo
("não entendi, repete?"), então o teto é a proteção certa, não proibir o salto.

---

## Integração com o resto do sistema

O sistema **não tem tabela de clientes** — "cliente" é texto solto dentro do pedido. Então o
contato do TridiChat é o cadastro de pessoa, e ele amarra:

- **Lead** (`comercial_leads`) — criado por `addLeadFunil()`, a mesma função que o TridiFlow usa.
  Não duplica: contato que já tem lead devolve o existente.
- **Pedido** — vem do **ERP legado** por REST, não do Supabase. O ERP guarda o cliente como
  `"Nome - telefone"` em `id_proprio`, mas **~70% dos pedidos têm ali um código puro de
  marketplace**. Por isso a busca é feita pelos 4 últimos dígitos e depois **filtrada em JS**
  exigindo o formato `" - "` e o casamento dos 8 últimos dígitos do telefone. Sem esse filtro, a
  ficha mostraria pedido de outra pessoa dentro da conversa.
- **Atividade** — vira tarefa na Central de Trabalho (`tarefas`), com `origem_tipo = "tridichat"`.

**TridiFlow ↔ TridiChat:** o gancho existe no schema
(`tridichat_contatos.tridiflow_sessao_id` + `origem`) mas ainda não é preenchido. A ideia é o
visitante que sai de um fluxo do TridiFlow pelo `wa.me` chegar aqui já identificado, com as
respostas do fluxo junto.

---

## Rodar e testar localmente

```bash
npm run dev                          # servidor
npx tsc --noEmit                     # tipos
npm test                             # 33 arquivos de teste
npx next build                       # build de produção
```

> `npm run lint` **não funciona** neste projeto: roda `next lint`, comando removido no Next 16, e
> não há ESLint instalado. Não é regressão do TridiChat.

Para testar o webhook sem a Meta, veja [configurar-webhook.md](configurar-webhook.md).

Nenhum teste manda mensagem de verdade: o cliente da Cloud API é substituído por um duble.

---

## Variáveis de ambiente

As credenciais **por canal** ficam no banco. Aqui só o que é do servidor:

```
CONVERSAS_WORKER_TOKEN=   # ≥16 caracteres; sem ele a rota de drenagem recusa todo mundo
TRIDICHAT_VERIFY_TOKEN=   # fallback do primeiro handshake, antes de existir canal
WHATSAPP_APP_SECRET=      # opcional: um app da Meta servindo vários canais
CRON_SECRET=              # já usado pelos 5 crons existentes
```

---

## Limitações atuais

- **Instagram**: normalizador pronto e testado, mas **não ativado** — depende do WhatsApp estar de pé.
- **Enviar mídia** pelo atendente ainda não existe; receber, sim.
- **Atribuir a outra pessoa** pela interface (a API já aceita; falta o seletor de pessoas).
- **Gatilho de status de pedido**: fora do escopo por decisão registrada. Pedidos estão no ERP
  legado e não emitem evento — só daria por diferença de snapshot do `/api/sync`.
- **Criar/aprovar template** é no Gerenciador da Meta e leva dias. Aqui é só o espelho.
- **Sem rate limiting** na rota do webhook. A Meta não abusa, mas a URL é pública.
- Os gatilhos `contato_criado`, `lead_criado` e `webhook_interno` têm schema, validação e execução,
  mas **ainda não há quem os dispare**.

## Próximas etapas recomendadas

1. Disparar os gatilhos que faltam e expor `POST /api/tridichat/gatilho` para o webhook interno.
2. Envio de mídia pelo atendente (o bucket privado e o download já existem).
3. Ponte TridiFlow → TridiChat pelo `wa.me` com código de sessão.
4. Ativar o Instagram.
5. Rate limiting no webhook e alerta quando a fila acumular.
