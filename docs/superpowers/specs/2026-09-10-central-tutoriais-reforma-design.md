# Central de Tutoriais — reforma (editor, publicação e leitura)

## Objetivo

Deixar a Central de Tutoriais pronta pra uso: fácil de escrever por quem não é
técnico, sem armadilha de "salvei e não apareceu", e com uma página de leitura
feita pra quem está com o carimbo numa mão e o celular na outra.

## Diagnóstico (10/09/2026)

- A caixa de texto mostra HTML cru (`<p>Carimbo, <strong>tinta…`) — o conteúdo
  real da central foi escrito assim. Sem negrito/lista/link; texto puro perde as
  quebras de linha no ar.
- Salvar não publicava: tutorial marcado "Visível" e salvo só aparecia depois de
  "Publicar alterações". A central real está fora do ar, com 10 tutoriais em
  rascunho e nenhuma capa.
- A tela exige `tridiflow:tutoriais`; a API de salvar exigia `tridiflow:projetos`.
  Quem só tem Tutoriais abria o editor e não conseguia gravar nem listar.
- Upload pela função da Vercel (corte em 4,5 MB) com promessa de 100 MB; foto sem
  compressão.
- Cada salvamento mandava a central inteira: duas abas se sobrescreviam.
- Fechar o painel perdia tudo sem aviso; bloco novo nascia fechado; imagem
  enviada sem miniatura; campos mentirosos (Formato "Automático", Etapas à mão,
  Palavras-chave de uma busca removida).
- A central aberta por Projetos › Páginas caía no editor genérico de páginas.

## Decisões

1. **Salvar publica.** Cada tutorial é Publicado ou Rascunho; com a central no
   ar, salvar atualiza a página pública na hora (o snapshot `published.pagina` é
   regravado junto). Somem "Alterações não publicadas" e "Publicar alterações".
   A central tem só "No ar / Fora do ar". (Decisão do usuário, 10/09.)
2. **Operações, não documento.** O editor manda operações (`salvarTutorial`,
   `excluirTutorial`, `ordenarTutoriais`, `salvarCategoria`, `excluirCategoria`,
   `ordenarCategorias`, `salvarConfig`). Cliente aplica na hora (otimista);
   servidor aplica sobre o documento atual com compare-and-swap em `updated_at`
   (até 3 tentativas). `lib/tridiflow-tutoriais-operacoes.ts`, puro.
3. **API própria** gated por `tridiflow:tutoriais` — `/api/tridiflow/tutoriais/centrais`
   (listar, criar) e `/api/tridiflow/tutoriais/centrais/[id]` (ler, operar,
   identidade, no ar/fora do ar, excluir). Toda rota confere que o id é uma
   central (template `central_tutoriais`): a chave de Tutoriais não abre porta
   pra outro projeto do TridiFlow.
4. **Conteúdo continua em HTML** (p, br, strong, em, ul, ol, li, a[href]) — o
   servidor gedux (deploy manual) segue desenhando sem deploy novo. Texto puro
   legado vira parágrafos na saída (`textoParaHtml`). Na escrita passa por uma
   lista de permissão própria do tutorial.
5. **Editor de texto: Tiptap 3** (pacotes mínimos, versões fixas), carregado só
   no editor. `immediatelyRender: false`; vazio grava `""`; link sem
   `target/rel`; barra fixa (B, I, lista, lista numerada, link ⌘K).
6. **Reordenar: @dnd-kit** (core + sortable, versões fixas), arrasto pela alça
   (toque e mouse) e teclado, anúncios em pt-BR; ↑↓ continuam.
7. **Mídia:** upload direto ao Storage por URL assinada
   (`/api/tridiflow/tutoriais/upload-url`), foto comprimida no navegador (1600 px,
   WebP), GIF até 4 MB, vídeo até 20 MB (acima disso: YouTube não listado), capa
   do vídeo tirada do primeiro quadro, progresso do envio.
8. **Metadados automáticos:** passos contados do conteúdo; tempo = o digitado
   ("quanto leva pra fazer") ou a estimativa de leitura. Formato, Etapas e
   Palavras-chave saem do formulário (seguem no documento, sem uso).

## Modelo (acréscimos compatíveis)

- Tutorial: `dificuldade` (facil | media | dificil | null), `materiais`
  ("Você vai precisar": nome + produto opcional).
- Blocos novos: `aviso` (atencao | dica | lembrete — sentido fixo) e `problemas`
  ("Deu errado?": sintoma → solução). Passo ganha `videoCapaUrl`; link ganha
  `tutorial` (handle de outro tutorial, resolvido contra a central de quem vê —
  a prévia continua na prévia).
- Central: `whatsapp` (dígitos com DDI) — o "fale com a gente" de toda a central.
- Servidor antigo ignora campo e bloco desconhecidos (degrada sem quebrar).

## Editor

- **Tela da central:** cabeçalho com No ar/Fora do ar, link, Visualizar,
  Configurações e o indicador "Salvo às 14:32" (erro com "Tentar de novo").
  Abas Tutoriais/Categorias (`Abas`). Lista: capa, título, selos (status,
  categoria, "4 passos · 3 min", leituras, % resolveu, pendências), alça de
  arrasto, ↑↓; tocar abre o tutorial. Filtro por categoria e por texto.
  Duplicar/Excluir/Prévia moram dentro do editor do tutorial.
- **Categorias:** tocar abre o painel (nome, foto, visível); excluir avisa quantos
  tutoriais ficam sem categoria. Oculta = o cartão some; os tutoriais dela
  continuam em "Todos" (e não caem em "Outros").
- **Configurações:** Endereço (nome, domínio, slug com erro no campo quando está
  em uso, Testar link), Cabeçalho, WhatsApp, cartão Todos, Catálogo, Barra do
  rodapé (valida link vazio; sugestão usa o WhatsApp).
- **Tutorial em tela cheia:** barra superior (fechar, título, Rascunho/Publicado,
  salvar); formulário à esquerda e prévia ao vivo num celular à direita (≥1100 px);
  no celular alterna Editar/Prévia. Seções: capa, título, descrição, categoria
  (com "nova categoria" ali mesmo), Você vai precisar, conteúdo (blocos com "+"
  entre eles, menu ⋮ com duplicar/converter/excluir), detalhes (tempo,
  dificuldade, selo, destaque, endereço). Pendências (título; capa; descrição;
  passo vazio; imagem sem descrição; link sem destino) com clique que leva ao
  bloco. Modelos ao criar (Passo a passo, Solução de problema, Cuidados).
  Guarda: fechar/sair com alteração pede confirmação; cópia local recupera o que
  não foi salvo; ⌘S salva.

## Página pública

- Central: cartões só com o resumo (sem o conteúdo), "Comece por aqui" com os
  destaques, "Não achou? Fale com a gente" (WhatsApp), metadado automático, barra
  padrão com Contato quando há WhatsApp.
- Tutorial: "Você vai precisar" (tempo, dificuldade, materiais com link pro
  produto), "Passo N de T", "Feito" por passo (guardado no aparelho; progresso
  pelos passos; Recomeçar), sumário recolhido no celular e trilho fixo com passo
  atual/feitos no computador, "Manter tela acesa" (Wake Lock, só por toque),
  modo "Um passo por vez" (tela cheia, Anterior/Próximo, gesto, setas, `#passo-N`,
  troca por esmaecer — nada lateral), avisos, "Deu errado?", "Não resolveu?" com
  motivo e WhatsApp com a mensagem pronta, og:image com a capa.
- Métricas: `contatos` e motivos do "não" como contadores diários (SQL novo,
  tolerante à migração pendente).

## Fora do escopo

Histórico de versões, busca pública (a remoção foi decisão do dono; reavaliar
com 25+ tutoriais), JSON-LD de HowTo (o Google não mostra mais).

## Verificação

Testes de domínio, operações, API (gate e trava de central), texto (Tiptap
headless + lista de permissão), mídia (classificação e envio), DOM do editor e da
leitura; `tsc`; `npm test`; bancos de provas `/dev-tutoriais` e
`/dev-tutoriais-admin` a 320/390/430/768/1024 nos dois temas; `npm run rolagem`.
