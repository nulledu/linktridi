# Gerenciador de Contingência — design (2026-09-01)

Central para ver, atualizar e acompanhar a contingência da empresa. Nasce dentro
de Marketing › Aquecimento e reaproveita o motor que já existe ali: o chip de
WhatsApp da contingência **é** o `aquecimento_ativo` de tipo `numero`, e o
celular **é** a ficha `aquecimento_aparelho`. Não há segundo cadastro de chip.

## Decisões

1. **Onde mora.** UMA tela: a aba "Contingência" do Marketing e a rota
   `/marketing/contingencia` renderizam o mesmo `ContingenciaClient`, com oito
   visões por `?v=` (Visão Geral · Hoje · Telefônica · Tráfego · Atendentes ·
   Roteiros · Histórico · Configurações). O aquecimento não é mais uma tela à
   parte: Hoje é a fila do dia, Roteiros é o roteiro, e os inventários
   (WhatsApp / Estrutura Meta) moram dentro de Telefônica e Tráfego. O motor do
   aquecimento virou o hook `useAquecimento`. Gate igual ao do aquecimento: página e API exigem
   `marketing:aquecimento` (paridade page/API).
2. **Fonte dos números.** Tudo que é contagem sai das entidades; só custo de
   plano, proxy, pendência e limites de saúde são cadastro manual. Cada card
   diz de onde veio ("contado dos chips cadastrados" / "informado à mão").
3. **Mapeamento de status** (não muda o aquecimento):
   - não aquecido = `novo` · em aquecimento = `aquecendo` · pronto para
     entregar = `aquecido` · em uso = `em_uso` · restringido = `restrito` ·
     bloqueado = `banido`. `aposentado` fica fora das contagens ativas.
   - "Chips aquecidos" nas fórmulas = `aquecido` + `em_uso` (terminou o
     aquecimento). "Prontos" na linha principal = só `aquecido`.
   - Fluke = operadora igual a "fluke" (sem caixa/acentos).
   - Em estoque = `novo`, sem aparelho e sem atendente (chip na gaveta).
   - Com proxy = existe proxy ativo apontando pro número **ou** pro aparelho
     onde ele mora. Celular com proxy = proxy no aparelho ou em algum número dele.
   - Celular disponível = ficha sem override manual e sem número ativo dentro;
     em uso = tem número; `manutencao`/`aposentado` são overrides manuais.
4. **Fórmulas exatamente como informadas** (denominador zero → `null`, a tela
   mostra "— · Sem dados suficientes"):
   - produtividade = celulares / celulares com proxy
   - aquecimento = chips aquecidos / chips não aquecidos
   - protegidos = chips aquecidos / chips aquecidos com proxy
   - qualidade = chips com proxy aquecidos / chips com proxy restringidos ou bloqueados
5. **Saúde do atendente** com limites configuráveis (tabela `contingencia_config`):
   crítico se reservas (prontos não entregues) ≤ limite crítico **e** nada em
   aquecimento; atenção se reservas ≤ limite de atenção **ou** aquecidos com
   proxy ≤ limite de protegidos; saudável no resto.
6. **Atualização de Hoje** = um painel lateral com contadores manuais (custos,
   lote de chips/proxies) e uma lista compacta por atendente com troca de status
   e proxy por toque. "Salvar atualização" aplica tudo via as funções do
   aquecimento (histórico continua íntegro) e grava o snapshot do dia.
7. **Histórico** = `contingencia_snapshot` (1 linha por dia, jsonb com o
   consolidado). Gravado ao salvar e por cron diário (`/api/contingencia-cron`).
8. **Credenciais.** Nada de senha em código, seed ou tela. O celular da Manu
   entra no **Cofre de acessos** já existente (AES-256-GCM, auditoria, botão
   revelar, gate `colaboradores:cofre`). Configurações só aponta pra lá.
9. **Tráfego** = a Estrutura Meta do aquecimento (BMs e contas por status),
   azul/branco, sem métrica de negócio inventada — só contagem do cadastrado.
10. **Pendências** = `contingencia_pendencia`, semeada com "Fazer novos
    suportes de celular".

## Arquivos

- `supabase/marketing_contingencia.sql` (idempotente; código tolerante à ausência)
- `lib/contingencia-const.ts` (puro, testado) · `lib/contingencia.ts` (dados)
- `app/api/marketing/contingencia/**` · `app/api/contingencia-cron/route.ts`
- `app/(plataforma)/marketing/contingencia/**` · `/dev-contingencia`
- `lib/__tests__/contingencia.test.ts`
