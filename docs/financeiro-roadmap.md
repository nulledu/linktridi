# Financeiro — o que falta

Estado em 15/08/2026. As nove fases do documento original (§20) estão entregues:
multiempresa, cadastros, compromissos, movimentos, recorrências, compras, visão
geral, notas, patrimônio, alertas, exportação e auditoria.

Este arquivo é o que sobrou **depois** disso — achado auditando o código, não
imaginado. Cada item diz o que está quebrado hoje e o que muda quando for feito.

---

## 0. Bloqueio: o SQL não foi rodado

Nada abaixo importa antes disto. `supabase/financeiro.sql` é rodado à mão no SQL
Editor do Supabase. Enquanto não rodar, as telas abrem com aviso em vez de dados.

O arquivo é idempotente — rodar de novo é seguro e é o que traz as colunas que
entraram depois (`fin_contas.responsavel_id`).

---

## ~~1. A compra que promete um bem e não entrega~~ · FEITO

**Hoje:** o formulário de compra tem "gera patrimônio". O valor é gravado em
`fin_compras.gera_patrimonio` e **nada acontece**. Confirmar a compra cria as
parcelas e os compromissos; o bem nunca nasce.

É a pior categoria de defeito do módulo: não é falta de recurso, é a interface
afirmando algo falso. Quem marcou o quadradinho vai procurar o item em
Patrimônio na semana seguinte e não vai achar.

**Quando estiver feito:** confirmar uma compra marcada cria o item em
`fin_patrimonio` com código sugerido, valor, fornecedor e o vínculo
`compra_id` — sem lançar despesa nova (§21: o custo já foi contado na compra).
Reprocessar não duplica: a chave é a própria `compra_id`.

---

## ~~2. A folha aparece na Visão Geral e não vira conta~~ · FEITO

**Hoje:** `fin_compromissos.origem` aceita `folha`, `chaveDaFolha()` existe em
`calculos.ts`, a Visão Geral mostra "Folha do mês" — e **ninguém gera** esses
compromissos. O número do cartão é uma projeção que nunca vira obrigação na
agenda.

**Quando estiver feito:** um botão em Colaboradores ("Gerar folha do mês") cria
um compromisso por pessoa ativa, na competência escolhida, com
`idempotency_key = folha:<pessoa>:<AAAA-MM>` — então clicar duas vezes não paga
ninguém duas vezes. §13: salário-base é projeção, e o fechamento confirma o
valor real; editar o compromisso gerado é o fechamento.

---

## ~~3. Restringir alguém a UMA empresa~~ · FEITO

A tela de Acessos ganhou o bloco "Empresas". Nenhuma marcada = vê todas (o
padrão), e a tela **diz isso com todas as letras** — ler os quadradinhos vazios
como bloqueio era o mal-entendido que faria alguém achar que trancou justamente
quando liberou tudo.

---

## ~~4. Comprovante, XML e PDF~~ · FEITO

**Hoje:** `fin_anexos` está no schema e **zero linhas de código a usam**.
`fin_notas` tem `xml_url` e `pdf_url` que ninguém preenche. Não dá para anexar o
comprovante de um pagamento nem o XML de uma nota.

**Não é só plugar no `/api/upload` que já existe:** aquela rota grava em buckets
**públicos** (`photos`, `sounds`, `branding`, `chat`) — qualquer pessoa com a URL
abre o arquivo. §17 exige anexo privado e autorizado por empresa. Precisa de
bucket privado + URL assinada de curta duração, e o gate por `empresa_id`.

**Quando estiver feito:** anexar comprovante ao pagar, XML/PDF à nota, e o
arquivo só abre para quem tem a área e a empresa.

---

## ~~5. Nota que chega antes da compra~~ · FEITO

**Hoje:** §8 diz "nota primeiro pode sugerir compra rascunho". Não existe. A nota
de compra sem `compra_id` só vira um alerta de pendência.

**Quando estiver feito:** ao lançar uma nota de compra sem vínculo, um botão
oferece criar a compra rascunho já preenchida com fornecedor, data e valor.

---

## ~~6. Os alertas não saem da tela~~ · FEITO

**Hoje:** `alertas()` calcula atrasado, vence hoje, vence em 3 dias, nota sem
compra e garantia acabando — e isso só aparece **dentro** da Visão Geral. Quem
não abre o Financeiro naquele dia não fica sabendo de nada.

**Quando estiver feito:** os alertas entram no sininho do ERP, respeitando a
permissão — só quem tem `financeiro:ver` recebe.

**Cuidado:** notificação é escrita. Não pode nascer de um poll de leitura (ver
CLAUDE.md → "nunca escrever dentro de um poll").

---

## ~~7. As rotas de escrita não têm teste~~ · FEITO

**Hoje:** o que é testado é o núcleo — `calculos`, `escrita` (com um banco falso
que aplica os índices únicos), o SQL contra PGlite, as permissões e o CSV. As 22
rotas de API estão cobertas só por `gate-por-area`, que confere o portão e não o
comportamento.

**Quando estiver feito:** cada rota tem teste de corpo inválido, empresa alheia,
permissão faltando e o caminho feliz.

---

## 8. Refinamentos menores

- **Fornecedores e Colaboradores** ficaram mais magras que Recorrências e
  Contas: sem KPIs próprios, sem paginação, sem painel de resumo.
- **Histórico por linha**: `historico()` existe em `db.ts` e nenhuma tela mostra
  o rastro de UM compromisso — só a Auditoria geral.
- **Transferência entre empresas** não existe, e é proposital: o gatilho do banco
  recusa. Se um dia precisar, é conta de sócio, não transferência.
- **Seletor de mês no cabeçalho** (dos mockups) faz sentido em Compromissos e
  Compras, e não faz em cadastro nenhum — filtrar fornecedor por mês não quer
  dizer nada.

---

## Ordem sugerida

Os itens 1 a 7 foram entregues em 15/08/2026. **O roadmap está zerado** — o que
resta é o item 8 (refinamentos menores) e o que o uso real apontar.

O de sempre continua valendo: **o SQL precisa ser rodado**. Tudo aqui foi
verificado com dado falso, contra um Postgres em memória e com as telas montadas
sem sessão. A primeira passada com dados de verdade é a que ainda não aconteceu.

Do item 8, o que sobrou:

- **Colaboradores** ainda não tem paginação nem painel de resumo (Fornecedores
  ganhou; Recorrências e Contas já tinham).
- **Histórico por linha**: `historico()` existe em `db.ts` e nenhuma tela mostra
  o rastro de UM compromisso — só a Auditoria geral.
- **Agendar o disparo de avisos**: hoje é botão. A rota já aceita cron pelo
  header `x-financeiro-avisos` + `FINANCEIRO_AVISOS_TOKEN`; falta agendar.
