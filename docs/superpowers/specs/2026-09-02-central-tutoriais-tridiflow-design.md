# Central de Tutoriais no TridiFlow — Design

## Objetivo

Reposicionar a Central de Tutoriais como um projeto especial de Página do TridiFlow. O módulo não pertence a uma loja e não possui CMS, tabela de páginas, publicação ou domínio próprios.

## Decisões

- A entrada principal é **TridiFlow › Tutoriais**. Marketing oferece somente um atalho para essa tela.
- Cada central é uma linha existente de `tridiflow_bots` com `tipo = page` e `pagina.config.template = central_tutoriais`.
- O documento `pagina.config.centralTutoriais` guarda título, subtítulo, categorias e tutoriais. O rascunho continua em `pagina`; publicar continua congelando o documento em `published.pagina`.
- A central pública usa `/p/[slug]`; um tutorial usa `/p/[slug]/[tutorial]`. Domínio próprio, slug, status, autoria e permissões são os do TridiFlow.
- A listagem e o editor antigos de Lojas deixam de expor o modelo. Dados e APIs específicos de `loja_paginas` deixam de ser necessários.
- O bloco Produto guarda somente o ID. Um adaptador de catálogo lê os produtos existentes das lojas e devolve também sua URL pública; a Central não passa a pertencer à loja.
- Upload de imagem e vídeo usa uma rota autenticada do TridiFlow e o bucket público já disponível, com validação de MIME e tamanho.

## Experiência administrativa

`/tridiflow/tutoriais` lista somente páginas com template `central_tutoriais`, com status, endereço, edição, publicação, despublicação e exclusão. “Nova central” cria um projeto Página já configurado e abre `/tridiflow/tutoriais/[id]`.

O editor mantém duas áreas: Tutoriais e Categorias. Alterações são salvas no documento do projeto; o cabeçalho permite editar nome, slug e publicar. O editor oferece texto, passo, imagem, vídeo, produto e link, incluindo upload nos blocos.

## Experiência pública

A central mantém busca, categorias circulares e cards visuais. O tutorial mantém capa, retorno, conteúdo sequencial e blocos. Somente o snapshot publicado é servido. Tutoriais marcados como rascunho não aparecem nem abrem diretamente.

## Compatibilidade e segurança

- Páginas normais do TridiFlow continuam usando o renderer atual sem mudança visual.
- O novo formato é opcional e normalizado defensivamente quando o JSON é antigo ou inválido.
- HTML editorial é higienizado; URLs externas são validadas; embeds aceitam somente origens conhecidas.
- Rotas administrativas exigem o módulo `tridiflow`.
- A rota de demonstração continua indisponível em produção e passa a exercitar o renderer do TridiFlow.

## Responsividade e validação

O editor e o público devem funcionar desde 320px, sem rolagem horizontal, com alvos de toque de 44px, categorias em faixa rolável, temas claro/escuro e movimento reduzido. A entrega exige testes de domínio, DOM, rotas públicas, proteção, TypeScript, suíte completa e build de produção.

