# Central de Tutoriais — Design

## Objetivo

Adicionar à área existente **Lojas › Páginas** uma página especial do tipo **Central de Tutoriais**, capaz de publicar um catálogo visual de tutoriais e páginas de leitura passo a passo sem criar outro CMS, duplicar produtos ou alterar o comportamento das páginas institucionais atuais.

## Limites da entrega

A entrega inclui criação e edição da Central, categorias, tutoriais, blocos, uploads de imagem e vídeo, seleção de produtos existentes, ordenação, publicação, busca e experiência pública responsiva. Não inclui analytics específicos de tutoriais, comentários, progresso sincronizado entre dispositivos, permissões novas, tradução ou recomendação automática.

## Integração com Páginas

`loja_paginas` continua sendo a raiz e a fonte do endereço público. A tabela recebe a coluna `tipo`, com `institucional` como padrão e `central_tutoriais` como alternativa, e `subtitulo`, vazio por padrão. Páginas existentes continuam institucionais sem migração manual.

Uma Central usa o mesmo título, `handle`, status, autenticação, permissão `lojas:produtos`, loja e tema das páginas existentes. Sua página pública fica em `/l/{slug}/p/{central}`. Cada tutorial fica em `/l/{slug}/p/{central}/{tutorial}`.

O editor institucional e seus blocos permanecem inalterados. Ao escolher o modelo **Central de Tutoriais**, o editor abre uma experiência especializada dentro do mesmo painel de Páginas.

## Modelo de dados

### `loja_paginas`

- `tipo text not null default 'institucional'`, limitado a `institucional | central_tutoriais`.
- `subtitulo text not null default ''`, usado somente pela Central e limitado a 240 caracteres na aplicação.
- O `status` da página governa a publicação da Central inteira.
- `conteudo` e `blocos` continuam exclusivos do editor institucional.

### `loja_tutorial_categorias`

- `id`, `pagina_id`, `nome`, `imagem_url`, `icone`, `ordem`, `ativa`, timestamps.
- Nome obrigatório, máximo de 80 caracteres.
- A exclusão da página remove categorias em cascata.
- Excluir categoria usada é bloqueado até os tutoriais serem movidos ou a categoria ser esvaziada.

### `loja_tutoriais`

- `id`, `pagina_id`, `categoria_id`, `titulo`, `handle`, `descricao`, `capa_url`, `palavras_chave`, `duracao_minutos`, `quantidade_etapas`, `tipo_midia`, `selo`, `destaque`, `status`, `ordem`, `blocos`, timestamps.
- `handle` é único dentro da Central.
- `status` é `rascunho | publicado`; uma Central publicada não expõe tutoriais em rascunho.
- `tipo_midia` é opcional: `leitura | video | passos`.
- `selo` é opcional: `novo | mais_acessado`; “Destaque” deriva do booleano `destaque`.
- `blocos` é um array `jsonb` ordenado porque os blocos são sempre lidos e gravados como uma unidade.
- Categorias e tutoriais usam `ordem` inteira. Reordenar persiste todas as posições da lista numa única operação autenticada.

### Blocos do tutorial

Todos têm `id` estável e um `tipo` discriminante:

- `texto`: título opcional e HTML simples higienizado na saída.
- `passo`: título, texto opcional, imagem opcional e vídeo opcional; o número é derivado da ordem dos blocos `passo`.
- `imagem`: URL, texto alternativo e legenda opcional.
- `video`: origem `link | upload`, URL, capa opcional e legenda. YouTube e Vimeo viram embeds permitidos; MP4 e URLs diretas usam `<video>`.
- `produto`: somente `produtoId`, título auxiliar opcional e texto do botão. Nome, imagem, descrição e destino sempre vêm do catálogo atual.
- `link`: título, descrição opcional, URL segura e texto do botão.

Blocos desconhecidos ou inválidos são descartados pela normalização defensiva. Produto ausente ou excluído não quebra a página: o bloco não é renderizado publicamente e o editor informa que a seleção precisa ser refeita.

## Administração

A listagem de Páginas identifica a Central pelo tipo, mas mantém os mesmos filtros de publicação. A criação começa no seletor de modelos já existente.

O editor especializado contém:

1. Configurações da Central: título, endereço, subtítulo opcional e publicação.
2. Categorias: lista visual, criar, editar, ativar, excluir e ordenar.
3. Tutoriais: lista em cards, busca administrativa, filtro por status/categoria, criar, duplicar, editar, publicar, excluir e ordenar.
4. Editor de tutorial: dados básicos, capa, metadados opcionais e lista de blocos.

Arrastar é suportado no desktop. Botões **Mover para cima** e **Mover para baixo** existem em todas as listas para teclado e celular. Ações nunca dependem de hover. No celular, o painel lateral usa a fundação de folha presa ao rodapé, rolagem interna, áreas seguras e alvos de pelo menos 44px.

Uploads reaproveitam o bucket público `photos` e a política de validação do upload de produtos, usando caminhos `lojas/{lojaId}/tutoriais/...`. Imagens aceitam JPG, PNG, WEBP e GIF até 8 MB. Vídeos aceitam MP4 e WEBM até 100 MB. O nome do arquivo é gerado pelo servidor; o cliente nunca escolhe o caminho no bucket.

## Experiência pública

### Central

- Título forte, subtítulo opcional e busca arredondada.
- Categorias em `.tab-strip`, com foto circular e nome. “Todos” é sempre a primeira opção.
- Busca instantânea por título, descrição, palavras-chave e nome da categoria, sem nova requisição.
- Destaques aparecem primeiro, respeitando a ordem definida; os demais vêm em seguida.
- Um card exibe capa, título e no máximo um metadado primário. Selo opcional ocupa uma área pequena.
- Celular: uma coluna, cards `16:10`, largura total útil.
- Desktop: container de até 1280px, três colunas; duas em largura intermediária.
- Nenhuma informação ou ação depende de hover.

### Tutorial

- Voltar para a Central, capa, título, descrição e conteúdo.
- Coluna de leitura limitada para manter legibilidade.
- Blocos `passo` formam uma trilha vertical discreta, com numeração derivada.
- Imagens e vídeos preservam proporção e cantos arredondados.
- Produto relacionado usa os dados atuais e leva à rota canônica do produto da loja.
- Links externos usam `rel="noreferrer noopener"` e esquemas permitidos.

A página usa os tokens de tipografia, cores, botões e raio do tema da loja. Overlay escuro aparece somente na base das capas para garantir contraste. As transições duram de 150 a 220 ms e são removidas por `prefers-reduced-motion`.

## Estados e falhas

- Central inexistente, não publicada ou tutorial em rascunho retorna o mesmo 404 público.
- Central sem tutorial publicado mostra uma orientação curta, sem controles administrativos.
- Busca sem resultado oferece limpar a busca ou escolher “Todos”.
- Imagem quebrada usa uma superfície neutra com ícone Tabler e texto alternativo; não usa emoji.
- Falha de upload preserva o formulário e mostra erro acionável.
- Sem a migração, Páginas continua abrindo e mostra o arquivo SQL necessário; páginas institucionais continuam funcionando.
- Toda escrita confirma `lojas:produtos` e restringe registros ao `lojaId` e à `paginaId` correspondentes.

## Acessibilidade e responsividade

- Funciona sem rolagem horizontal da página a 320px, 375px e 430px.
- Alvos interativos têm pelo menos `var(--tap)`.
- Busca, filtros, listas e editor funcionam por teclado.
- Imagens editáveis exigem texto alternativo quando transmitem conteúdo.
- Foco visível, estados `aria-pressed`, rótulos de formulário e anúncios de resultado de busca são obrigatórios.
- Claro e escuro mantêm contraste; áreas seguras do dispositivo são respeitadas.
- Ícones visíveis usam exclusivamente o componente Tabler existente.

## Segurança

- HTML passa pelo higienizador existente na renderização.
- URLs de imagem, vídeo e link passam por allowlists de protocolo e provedor.
- Embeds usam sandbox e atributos restritos.
- Upload valida permissão, MIME, extensão e tamanho no servidor.
- APIs públicas não retornam rascunhos nem dados administrativos.
- IDs de produto são resolvidos apenas dentro da mesma loja.

## Testes e validação

- Testes unitários cobrem normalização dos blocos, handles, busca, ordenação, embeds e validações.
- Testes de banco verificam idempotência e contratos do SQL.
- Testes DOM cobrem filtros, vazio, controles de ordenação e acessibilidade básica.
- Rotas públicas são verificadas para Central publicada, rascunho e tutorial inexistente.
- A validação visual usa uma rota `/dev-tutoriais`, protegida pelas duas travas de desenvolvimento, montando dados reais de tema sem credenciais.
- Em 320px, 390px e desktop: `document.documentElement.scrollWidth - clientWidth` deve ser `0`.
- Claro, escuro, teclado, `prefers-reduced-motion`, imagens ausentes e produto removido são verificados manualmente.
