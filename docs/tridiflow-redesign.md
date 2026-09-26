# TridiFlow — referência de redesign (mockups do usuário)

> Norte visual e de features. O usuário mandou mockups de alta fidelidade
> ("TridiFlow"/"FlowChat") e pediu: **seguir o design do layout e ter todas as
> features das imagens**. Mais imagens virão — atualizar este doc conforme chegam.
> Regras do projeto continuam: **sem emojis na UI** (ícones Tabler via `<Icon>`).

## Linguagem visual (todas as telas)
- SaaS claro, limpo: sidebar escura à esquerda com marca **TridiFlow** (logo quadrado
  roxo), nav com ícones + rótulos, bloco de plano ("Plano Profissional · Uso de Bots
  4/25" + barra + "Fazer upgrade") e card do usuário embaixo (avatar, nome, e-mail).
- Conteúdo em fundo branco/cinza-claro, cards com borda sutil e cantos ~14px.
- Roxo primário (~#6D28D9/#7C3AED) nos CTAs; verde/laranja/vermelho para status/métricas.
- Cabeçalho de página: título grande + subtítulo + ações à direita.

## Nav lateral (itens) — REVISADO (2ª leva de mocks)
Topo: **Dashboard · Meus Bots · Templates · Integrações · Contatos · Analytics**.
**Configurações** é um **grupo expansível** com: Domínios, Usuários, Times, Faturas,
Planos e limites, Webhooks, Logs de atividades, **Rastreamento & Pixels**.
(Rodapé da sidebar: bloco de plano + card do usuário.)

## Telas / features

### 1. Dashboard
- KPIs no topo: **Bots ativos, Conversas, Leads, Taxa de conversão** (com variação %).
- **Bots recentes** (tabela: Nome, Status, Conversas, Leads, Conversão, Atualizado em, ⋯).
- **Conversas nos últimos 7 dias** (gráfico de linha) + seletor de período.
- Botão **Criar novo bot**.

### 2. Meus Bots (Painel principal)
- Busca (nome/domínio/slug) + **Filtros** (Status, Pasta, Domínio) + ordenação + **Criar novo bot**.
- **Pastas** na sidebar: Todos os bots (128), Carimbos (42), Chancelas (36), Totem (15) + adicionar pasta.
- Grade de **cards de bot** com CAPA (imagem/gradiente + categoria + título), status (Publicado/Rascunho),
  domínio/slug (link externo), **Sessões** + **Taxa de conclusão**, ações: Abrir/Editar/Duplicar/Publicar/Mais.
- Alternar grade/lista. Paginação + itens por página.

### 3. Editor de Fluxo
- Título editável + "Salvo há X min"; **Desfazer/Refazer**, **Testar**, **Salvar**, **Publicar**, ⋯.
- Palette esquerda com abas **Blocos / Biblioteca**, busca (Ctrl+K), grupos:
  - **Bolhas**: Texto, Imagem, Vídeo, Áudio, Carrossel, Arquivo.
  - **Inputs**: Botões, Lista, Campo de Texto, Data e Hora, Número, Localização.
  - **Lógica**: Condição, Atraso, Randomizador, Divisão.
  - **Integrações**: WhatsApp, E-mail, Google Sheets, Webhook.
  - **Bloco personalizado**.
- Canvas com nós conectados; **Configurar bloco** (Tipo, Texto rich, **Typing humano** toggle,
  Velocidade, Atraso, **Exibir hora**, **Botões** editáveis + adicionar, **Ações ao clicar**).
- **Pré-visualização** com abas **Chat / Dados**, **seletor de device** (iPhone 14 Pro), celular realista,
  "Abrir no WhatsApp"; nota "a prévia pode variar…".
- Minimap + zoom controls.

### 4. Biblioteca de Templates
- Categorias: Todos (24), Geração de Leads, Vendas, Atendimento, Engajamento, Pós-venda.
- Busca + filtros (objetivo, canal) + ordenar (Mais usados).
- Cards de template: ícone, título, descrição, **mini-fluxo** (passos com ícones + setas),
  métricas **Uso / Conversão / Economia de tempo**, botão **Usar template** + favoritar.
- Sidebar: **Recomendados para você** + **Dicas para escolher o template ideal** + guia.
- Ações: **Importar template**, **Criar do zero**.

### 5. Temas & Personalização
- Linha de **temas prontos**: WhatsApp, Instagram DM, Messenger, iMessage, Foco Total,
  Vendedor Quente, Oferta/Urgência, Premium/Confiança, Clean Minimal, Dark, **Marca personalizada**.
- **Editor de tema** (sub-nav): Cores, Fontes, Bolhas, Botões, Avatar, Cabeçalho,
  Plano de fundo, Micro-animações.
- **Prévia ao vivo** (desktop/mobile toggle).
- **Paletas prontas** (Verde Confiança, Roxo Premium, Azul Profundo, Laranja Energia, Rosa Vibrante).
- **Fontes pareadas** (Inter+Poppins, DM Sans+Inter, Plus Jakarta+Poppins, Montserrat+Lato).
- **Exportar tema** / **Salvar**.

### 6. Analytics
- Abas: **Visão geral / Funil / Conversas / Leads / Desempenho** + seletor de datas.
- KPIs: Conversas, Leads, Taxa de conversão, Conclusões (com variação %).
- Gráfico **Conversas ao longo do tempo**.

### 7. Integrações
- Cards: **Google Sheets, Facebook Leads, ManyChat, Zapier, Webhook** (e "Ver todas") com **Conectar**.

### 8. Contatos
- Lista/base de contatos coletados (leads) — detalhar quando vierem imagens.

### 9. Equipe
- Membros com papéis **Admin / Editor / Visualizador**, **Convidar membro**, permissões
  ("apenas admins convidam/alteram permissões").

### 10. Config do bloco / Variáveis / Publicar (painéis do editor)
- **Variáveis**: tabela (Nome, Tipo, Valor padrão, Usada em N blocos) + Nova variável.
- **Publicar**: link do bot + Copiar, **QR Code** (baixar), domínio próprio, incorporar,
  status (Publicado/Despublicar), ações rápidas.

## Telas / features — 2ª leva de mocks

### 11. Configurações › Rastreamento & Pixels
- **Conectores de rastreamento** (cards): Meta Pixel, Meta Conversions API, Google GA4/GTM,
  TikTok Pixel, Pinterest Tag — cada um com campo de ID/token (copiar, olho no token),
  "Eventos recebendo dados N/7", toggle Ativo/Inativo, status.
- **Mapeamento de eventos** (tabela): linhas de evento (Abertura do bot, Lead, ViewContent,
  AddToCart, InitiateCheckout, Purchase, CompleteRegistration) × colunas de plataforma
  (Meta/CAPI/GA4/TikTok/Pinterest) com checkboxes. "Adicionar evento personalizado" +
  "Ver eventos recebidos".
- **Parâmetros e UTMs**: UTMs padrão (source/medium/campaign/content/term) e parâmetros de
  clique (fbclid/gclid/ttclid/msclid) com status Ativo/Opcional. Nota "dados seguros".

### 12. Configurações › Domínios
- **Seus domínios** (tabela: Domínio [Principal], Tipo, Status [Ativo/Verificando/Pendente],
  SSL, Bot atribuído, Adicionado em, ⋯) + busca + filtro de status.
- **Instruções de DNS**: card por domínio com CNAME (recomendado) e A (alternativo),
  Nome/Host, Valor, TTL (copiáveis) + **Verificar agora**.
- **Atribuir domínio a um bot**: 1) bot, 2) domínio, 3) slug → mostra a URL pública + Salvar.
- **Domínio de fallback** da plataforma, **HTTPS automático** (SSL), **Pré-visualização de URLs**.
- Sub-nav de Configurações visível: Domínios, Usuários, Times, Faturas, Planos e limites, Webhooks, Logs.

### 13. Publicação & Embed (por bot)
- Abas: **Link standalone · Container embutido · Popup · Bubble de chat · Script de embed**.
- Link público + Copiar, **QR Code** (baixar), opções de compartilhamento, **Código do link (URL)**.
- **Pré-visualização ao vivo** (desktop/mobile) mostrando o bot embutido numa landing.
- Cabeçalho com bot selecionado (versão v2.3.1), status Publicado, Visualizar histórico, Publicar.

### 14. Analytics & Conversion (rico)
- Período + **Filtros**. KPIs com sparkline e variação: Sessões iniciadas, Leads gerados,
  Taxa de conclusão, Eventos de conversão.
- **Desempenho ao longo do tempo** (linhas: Sessões/Leads/Taxa) + granularidade (Diário).
- **Funil de Conversão por Etapa** (funil visual: Usuários, Conversão, Queda por etapa) +
  dica da maior perda.
- **Testes A/B** (cards A/B: Vencedor/Em andamento, sessões, leads, taxa, +%).
- **Desempenho por Campanha** (tabela: Sessões, Leads, Taxa, Custo por lead, Receita atribuída).
- **Atribuição UTM** (por source: sessões/leads/taxa).
- **Fontes de Dados** (Meta Pixel, CAPI, WhatsApp Business API, GA4 — eventos/sessões + status).

### 15. Contatos / Leads e Respostas
- Tabela de leads (Nome+avatar, Telefone [ícone WhatsApp], E-mail, Campanha [tag], Bot,
  Status [Novo/Qualificado/Reengajado/Em atendimento/Perdido], Pontuação, Última interação) +
  busca + filtros (campanha/bot/status) + ordenar + seleção + paginação + **Exportar leads**.
- **Painel lateral do lead**: avatar, nome, status, telefone/e-mail, "Abrir no WhatsApp",
  Exportar; abas **Resumo / Respostas / Atividades**; Respostas de Qualificação, Origem e UTM,
  **Resumo da Conversa** + "Ver conversa completa".

## Estado atual (código) — o que já existe
- `app/(plataforma)/tridiflow/TridiflowClient.tsx` — dashboard/bots (KPIs, cards c/ capa, domínios, busca, templates via menu).
- `.../[id]/EditorClient.tsx` — editor (palette c/ categorias+busca, canvas React Flow, ConfigBloco, painéis Tema/Pixels/Config/Stories, preview celular).
- Runtime `app/f/ChatRuntime.tsx` — chat (temas, header configurável, stories, CTA, retomar, markdown).
- `lib/tridiflow-templates.ts` — templates Chancela + Carimbo (via menu).
- Resultados (overlay) com abas Analytics/Leads. Domínios + Rastreamento(pixels) + Meta CAPI. `pasta?` já existe no PATCH/lib.

## Lacunas principais vs mockups
- **Shell visual**: não há a sidebar "TridiFlow" dedicada (hoje é o Shell geral do ERP com modo foco). Precisa da identidade das imagens.
- **Meus Bots**: falta Pastas na UI, Filtros, alternar grade/lista, paginação, ações rotuladas por card.
- **Templates**: virar **página/biblioteca** com categorias, mini-fluxo, métricas, recomendados (hoje é dropdown).
- **Temas**: virar página com sub-nav (Fontes, Paletas prontas, Fontes pareadas, Plano de fundo, Micro-animações, Exportar).
- **Analytics**: página própria com abas e período (hoje só overlay de Resultados).
- **Integrações / Contatos / Equipe / Configurações**: telas novas.
- **Editor**: aba **Biblioteca** na palette, **Dados** na prévia, seletor de device, blocos Carrossel/Lista/Arquivo, "Ações ao clicar", Variáveis como tabela.

## Ordem de construção proposta (incremental)
1. **Shell/identidade TridiFlow** (sidebar + layout) — define a linguagem visual de todas as telas.
2. **Meus Bots** completo (pastas, filtros, grade/lista, cards).
3. **Biblioteca de Templates** (página).
4. **Temas & Personalização** (página com sub-nav).
5. **Analytics** (página com abas).
6. **Integrações / Contatos / Equipe / Configurações**.
7. Refinos do **Editor** (Biblioteca, Dados, device, blocos novos).

> Cada item vira um passo verificável (typecheck + build). Ir por partes pra não quebrar o que já funciona.
