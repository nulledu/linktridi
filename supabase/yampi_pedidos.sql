-- Tridify · espelho dos pedidos PAGOS da Yampi (fonte da verdade do checkout).
-- Idempotente: pode rodar de novo sem estrago.
--
-- Por que existe: até 22/09/2026 toda venda de checkout entrava no app só pela
-- tabela `pedidos` do ERP legado. Medido naquele dia, a loja de tráfego tinha
-- 19 pedidos pagos na Yampi e 17 no ERP — 2 pedidos (R$ 390,80 de produto)
-- só foram importados mais de 7h depois de pagos. O resto da diferença do card (R$ 227,16)
-- era juros de parcelamento, que fica fora dos dois lados.
--
-- O app NÃO chama a Yampi a cada tela: um cron (/api/yampi/sync) escreve aqui e
-- a leitura é sempre deste espelho. Chamar a API por requisição é o erro que já
-- pausou o projeto na Vercel por invocação — ver lib/__tests__/orcamento-de-execucao.
--
-- `valor_produtos` é o que vira faturamento: só produto, sem frete e sem juros
-- de parcelamento (decisão do usuário, 22/09/2026). Na API o juros vem em
-- `value_tax` — o nome engana, não é imposto. Os outros
-- valores ficam guardados só pra conferência com o ERP.

create table if not exists public.yampi_pedidos (
  -- O `number` do pedido na Yampi. É a MESMA chave que o ERP guarda em
  -- `pedidos.id_proprio`, e é por ela que os dois lados se cruzam.
  numero text primary key,
  yampi_id bigint,
  loja text not null,
  -- Loja como o ERP a chama (`pedidos.qual_yampi`). Vem preenchida quando o
  -- pedido chegou pelo WEBHOOK, que tem endereço próprio e portanto sabe disso
  -- sem adivinhar. Pelo cron fica nula e o app deduz pelo alias.
  --
  -- Hoje só a loja de TRÁFEGO entra aqui: a orgânica continua inteira no ERP
  -- (decisão do usuário, 22/09/2026).
  loja_erp text,
  criado_em timestamptz not null,
  valor_produtos numeric(12,2) not null default 0,
  valor_total numeric(12,2) not null default 0,
  valor_frete numeric(12,2) not null default 0,
  valor_desconto numeric(12,2) not null default 0,
  status text,
  sincronizado_em timestamptz not null default now()
);

-- A consulta do snapshot é sempre "loja + janela de dias".
create index if not exists yampi_pedidos_loja_dia on public.yampi_pedidos (loja, criado_em desc);
create index if not exists yampi_pedidos_dia on public.yampi_pedidos (criado_em desc);

-- Estado do cron, pra tela saber se o espelho está velho (e desde quando).
create table if not exists public.yampi_sync (
  loja text primary key,
  ultima_rodada timestamptz,
  ultimo_erro text,
  pedidos integer not null default 0
);

-- O app lê com service_role (ver rls-so-profiles-passa-pela-sessao): RLS ligado
-- e sem policy = ninguém alcança pela sessão do navegador, que é o desejado.
alter table public.yampi_pedidos enable row level security;
alter table public.yampi_sync enable row level security;

-- Acrescenta a coluna em banco que já rodou a versão anterior deste arquivo.
alter table public.yampi_pedidos add column if not exists loja_erp text;

-- ── v2 (23/09/2026): widgets do painel da Yampi dentro da Tridify ────────────
-- O espelho passa a guardar TODO pedido da loja, não só o pago. É o que separa
-- as duas manchetes do painel da Yampi:
--   Vendas  = todo pedido criado (pago ou aguardando), valor de produto
--   Receita = só o pedido pago, valor de produto
-- e é também o que dá o "Pix gerados × pagos". Quem soma faturamento na
-- Tridify (lib/trafego-vendas) continua lendo SÓ `pago = true`.
--
-- Default `true` de propósito: toda linha gravada pela v1 veio do filtro de
-- pagos, então ela É paga — nascer `false` apagaria o faturamento de setembro
-- da Tridify no instante em que este arquivo rodasse.
alter table public.yampi_pedidos add column if not exists pago boolean not null default true;
-- `pix` | `cartao` | `boleto` | `outro` — o agrupamento do gráfico "Formas de
-- pagamento". A bandeira (mastercard, visa…) fica à parte, pra quem quiser abrir.
alter table public.yampi_pedidos add column if not exists forma_pagamento text;
alter table public.yampi_pedidos add column if not exists bandeira text;
alter table public.yampi_pedidos add column if not exists parcelas integer;
-- Juros de parcelamento (`value_tax` na API — o nome engana, não é imposto).
alter table public.yampi_pedidos add column if not exists valor_juros numeric(12,2) not null default 0;
alter table public.yampi_pedidos add column if not exists uf text;
-- Pra "clientes recorrentes": o cliente é recorrente se já tem pedido PAGO
-- anterior neste espelho. Por isso a v2 pede um backfill de histórico.
alter table public.yampi_pedidos add column if not exists cliente_id bigint;
create index if not exists yampi_pedidos_cliente on public.yampi_pedidos (cliente_id, criado_em);

-- Os produtos de cada pedido (Top produtos). Chave (pedido, sku): o mesmo sku
-- aparece uma vez por pedido na Yampi, e o upsert do sync reescreve a linha
-- quando o pedido muda.
create table if not exists public.yampi_pedido_itens (
  numero text not null references public.yampi_pedidos(numero) on delete cascade,
  sku_id bigint not null,
  produto text not null,
  quantidade integer not null default 1,
  preco numeric(12,2) not null default 0,
  -- Brinde ("Parabéns! Seu pedido vai com um…") conta em "vendidos" no painel
  -- da Yampi. Fica marcado pra tela poder mostrar sem confundir com venda.
  brinde boolean not null default false,
  imagem text,
  primary key (numero, sku_id)
);
alter table public.yampi_pedido_itens enable row level security;
