# Folha: comissão de vendas da planilha, entrada automática por mês e bônus recorrente

**Data:** 2026-09-01 · Continuação de `2026-09-01-marketplace-canal-comissao-design.md`.

## Decisões (confirmadas com o dono em 01/09)

| Pergunta | Resposta |
|---|---|
| Comissão de VENDAS das vendedoras | **Soma do `valor_comissao`** de `comercial_planilha_mes` (ERP legado, projeto `irdptdvkldrghevmtmzc`), por `responsavel_id`, nos pagamentos cuja `data_pagamento` cai no mês |
| Menu da comissão (por pessoa, por mês) | **Um interruptor por área** (vendas, tráfego, marketplace): entrada automática ligada/desligada para AQUELE mês |
| Padrão do interruptor | **Ligado de setembro/2026 em diante; desligado antes** (agosto e meses anteriores de 2026 ficam manuais) |
| Bônus recorrente | Marcado na hora de lançar; **repete até alguém parar** (remover a cópia pergunta "só este mês" ou "daqui pra frente") |
| Comissões e o resto | Não se repetem (o mês novo já nasce zerado) |

## Desenho

### 1. Comissão de vendas vem da planilha do ERP

`lib/comissao-vendas-servidor.ts` · `comissoesVendasPorPessoa("AAAA-MM")` → `Record<employeeId, { valor, pagamentos }>`.
Lê `comercial_planilha_mes?select=responsavel_id,valor_comissao&data_pagamento=gte.<1º>T00:00:00-03:00&data_pagamento=lt.<1º do mês seguinte>T00:00:00-03:00` (paginado), soma por `responsavel_id`, e casa com `employees.erp_user_id` → `employees.id` (= `fin_colaboradores.employee_id`). Mesmas defesas: lembra 5 min, desiste em 2,5 s devolvendo `{}`.

A rota da folha devolve `comissaoVendasSugerida: Record<colaboradorId, number>`, e a página manda a inicial.

### 2. Entrada automática por área, por mês (SQL)

`supabase/financeiro_folha_automatico.sql` — `fin_folha_mensal` ganha `auto_vendas`, `auto_trafego`, `auto_marketplace boolean` (**nulos** = padrão pela data). Regra pura em `folha-mensal.ts`:

```ts
export const AUTOMATICO_DESDE = "2026-09-01";
entradaAutomatica(mes, parte) = mes[`auto_${parte}`] ?? (mes.competencia >= AUTOMATICO_DESDE)
```

A tela só aplica a sugestão de uma área quando `entradaAutomatica` está ligada, a parte está em zero e o mês não foi pago — em `mesEfetivo`, na linha da tabela, no fechamento do pagamento e na regrinha. O painel da comissão mostra, por área, o interruptor "Automático" e a sugestão do sistema; salvar grava partes e interruptores juntos (`gravarMesDaFolha` aceita os três booleanos). Leitura em degrau: sem o SQL, os três voltam `null` e a regra por data vale.

### 3. Bônus recorrente (SQL)

`fin_folha_lancamentos` ganha `recorrente boolean not null default false`, `origem_id uuid` (cópia → lançamento de origem, `on delete set null`), `encerrado_em date` (a origem para de gerar a partir desta competência) e `pulados date[]` (meses em que a cópia foi tirada só naquele mês). Índice único `(origem_id, competencia)`.

Materialização idempotente em `lib/financeiro/bonus-recorrente-servidor.ts` · `materializarBonusRecorrente(escopo, competencia)`: origens = `tipo='bonus' and recorrente and origem_id is null and competencia < C and (encerrado_em is null or encerrado_em > C) and not (C = any(pulados))`; cópia = mesma pessoa/valor/descrição com `origem_id`. A decisão de quais faltam é pura (`copiasQueFaltam` em `folha-mensal.ts`). Roda: no cron diário (mês corrente e seguinte, por empresa), na página de Colaboradores (encadeada antes de `lancamentosDaFolha`) e no `GET` da folha mensal ao trocar de mês.

Tela: ao lançar bônus, caixa "Repetir todo mês". Na lista, selo "todo mês" (origem) / "repetição" (cópia). Remover cópia pergunta **só este mês** (`DELETE ?id&alcance=mes` → apaga e grava o mês em `pulados` da origem) ou **daqui pra frente** (`alcance=futuro` → apaga e carimba `encerrado_em` na origem). Remover a origem: `alcance=futuro` só desliga `recorrente` (o lançamento fica); sem alcance apaga a origem (as cópias já feitas ficam como lançamentos comuns).

## Fora do escopo
Percentual configurável no app (a planilha já tem o snapshot); interruptor global.

## Travas
`folha-automatico.test.ts` (regra por data, `copiasQueFaltam`), `comissao-vendas-nao-segura-folha.test.ts`, `financeiro-folha-automatico-sql.test.ts` (PGlite), pinos em `folha-mensal-tela.test.ts`.
