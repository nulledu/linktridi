# Creative Intelligence Center — Design

## Objetivo

Transformar o detalhe de criativo do Tridify em um centro de análise operacional sem criar um fluxo paralelo. O componente-base continua sendo o modal de `CriativosStudio`: preview e navegação à esquerda/cabeçalho, inteligência à direita, e as marcações já existentes (editor e tags) permanecem editáveis.

## Arquitetura encontrada

- Frontend: Next.js 16, React 19 e TypeScript; componentes do Tridify ficam em `app/(plataforma)/trafego`.
- Dados: Supabase/Postgres. `meta_ad_insights_daily` é o warehouse diário por anúncio; o job em `lib/meta-warehouse.ts` importa a Meta e o overview em `lib/meta-ads.ts` lê o warehouse.
- Visualização: Recharts já está instalado; o produto usa tokens de `app/globals.css`, `Icon.tsx`, `Portal`, `.tf-scope`, `.tf-panel`, `.sheet-host`, `.sheet` e `.tab-strip`.
- Identidade do criativo: `normalizarNome(nome)@safra`, em `lib/criativos.ts`. Tags e editor ficam em `trafego_criativo_marcas`, pela mesma chave.
- Período: `TrafegoClient` mantém um `PeriodState`; `AdsOverview` já expõe `since` e `until`.

## Contrato de métricas

Todos os cálculos vivem em `lib/creative-intelligence`. Valores ausentes são `null`; zero só representa zero quando a família da métrica foi coletada. Divisão por zero ou entrada não finita retorna `null`.

O importer passa a solicitar os campos de vídeo presentes no SDK oficial da Meta: `video_play_actions`, `video_continuous_2_sec_watched_actions`, `video_p25_watched_actions`, `video_p50_watched_actions`, `video_p75_watched_actions`, `video_p95_watched_actions`, `video_p100_watched_actions`, `video_avg_time_watched_actions` e `video_thruplay_watched_actions`.

- Hook Rate: visualizações contínuas de 2 segundos / reproduções × 100.
- Hold Rate: ThruPlay / visualizações contínuas de 2 segundos × 100.
- As definições ficam em constantes públicas e aparecem integralmente em tooltips.
- O warehouse recebe colunas anuláveis e marcadores `funnel_metrics_collected` e `video_metrics_collected`. Linhas históricas não sincronizadas continuam nulas.
- Reach e frequência não são somados entre dias. Quando não houver uma leitura deduplicada válida, a UI mostra `--`.

## Camada analítica

Uma única consulta limitada ao warehouse recupera o período; uma segunda consulta recupera todas as marcações. O servidor agrupa por identidade de criativo e devolve:

- métricas agregadas e série diária do criativo aberto;
- catálogo de criativos comparáveis do mesmo período;
- mediana interna de cada métrica disponível;
- comparação relativa e percentil por métrica;
- score explicável e insights/recomendações determinísticos;
- agregações ponderadas por tag.

Percentuais agregados são recalculados a partir dos numeradores e denominadores. O benchmark usa mediana, ignora `null` e só existe com amostra suficiente. O score transforma métricas em percentis relativos ao mesmo conjunto/período, inverte métricas de custo e combina dimensões com pesos explícitos. Uma dimensão sem dados sai do denominador em vez de receber zero.

## Interface

O modal existente cresce até o tamanho útil da janela e mantém o preview em uma coluna estável. O painel de análise tem:

1. faixa compacta de KPIs;
2. faixa de Hook, Hold e IC;
3. abas Visão geral, Funil, Retenção, Histórico, Comparar e Apresentação;
4. rodapé persistente com editor, tags, Facebook e geração de apresentação.

A assinatura visual é o painel de score em forma de anel técnico, acompanhado das dimensões explicáveis. Ele é o único elemento gráfico forte; o restante usa superfícies claras, divisores suaves e o roxo atual apenas como acento.

No celular, `.sheet-host`/`.sheet` transformam o modal em folha, o preview fica acima dos dados, as abas usam `.tab-strip`, ações têm no mínimo 44 px e gráficos/tabelas rolam somente dentro dos seus blocos.

## Relatório

A aba Apresentação monta uma sequência somente com seções que têm dados. A visualização usa o mesmo modelo estruturado consumido pela camada de impressão. “Exportar PDF” abre o modo de impressão do navegador, com CSS `@media print`, evitando dependência adicional. PPTX não entra nesta entrega porque o projeto não possui infraestrutura para isso e a dependência não se justifica para o primeiro corte.

## Estados e desempenho

- O modal abre imediatamente com os KPIs já presentes no overview.
- Benchmark, séries, score e comparações carregam sob demanda e ficam em cache no cliente por `chave+período`.
- As abas pesadas só renderizam seu conteúdo quando selecionadas.
- Loading, erro, sem dados e dados parciais têm mensagens próprias.
- Nenhuma saída pode conter `NaN`, `Infinity`, `undefined`, `null` ou moeda inválida.

## Verificação

Testes unitários cobrem fórmulas, ausências, benchmark, direção das métricas, score, regras de diagnóstico e agregação por tag. A UI será verificada em `/dev-tridify` nos temas claro/escuro e larguras 320, 390 e desktop. A entrega termina com testes, TypeScript, lint disponível e build completos.
