# Configurações de usuário — consertos e o que passa a seguir a conta

Data: 2026-09-15 · Escopo aprovado em conversa (consertos + página inicial + barra recolhida).
Continuação de `lib/tema.ts` / `lib/preload.ts` (tema na conta, commit 036ec693).

## Problema

Auditoria dos Ajustes e das preferências por pessoa:

1. **Tour grava na conta a cada carga de página.** Quem já viu o tour dispara
   `PUT /api/user-prefs` em toda montagem do shell, para sempre — uma invocação e
   um upsert por carga, contra a regra de orçamento de execução.
2. **Tridify baixa as preferências inteiras várias vezes na mesma tela.** Cada
   `useSyncedPref` (Cockpit, Visão geral, UTM) faz o próprio `GET /api/user-prefs`,
   que devolve TODAS as chaves (layouts de até 20 KB). Remontar antes do PUT com
   debounce chegar lia o valor velho do servidor e desfazia a troca.
3. **Trocar senha não é formulário.** Enter não envia, gerenciador de senhas não
   reconhece (sem `<form>` nem campo de usuário), resposta que não é JSON (429,
   500 em HTML) estoura sem mensagem, não há como conferir o que foi digitado.
4. **Ícone de "Ajustes" é uma TV** (`device-tv`).
5. **Página inicial só é escolhida por quem administra a equipe** (ficha › Acesso).
6. **Barra recolhida em Mensagens mora só no navegador** (`gaius:rail`) e nasce
   aberta no primeiro quadro antes de o efeito ler o localStorage.

## Desenho

### Preferências da conta no navegador — `lib/prefs-da-conta.ts`
- `lerPrefsDaConta()`: um GET por carregamento (promessa compartilhada, 60 s);
  falha não fica guardada.
- `gravarPrefDaConta(key, value)`: PUT com `keepalive`, atualiza a leitura
  compartilhada na hora (remontar não desfaz a troca) e devolve `{ ok, em }`.
- `marcarUmaVez(chaveLocal, key, value)`: grava na conta uma vez por aparelho.
- `escolherVersao(local, conta)`: mesma regra de versão do tema — conta vence se
  mais nova; cópia vence se mais nova ou "pendente"; conta vazia recebe a cópia
  antiga (migração). `salvarVersionado()` marca pendente, grava e guarda a versão.
- Usado por: Tour, `useSyncedPref`, `salvarAparenciaNaConta`, Shell (rail).

### Servidor — prefs do shell numa leitura só
- `getPrefsDoShell(userId)` em `lib/user-prefs.ts`: `ui.aparencia` + `ui.rail`
  numa consulta (`in("key", …)`), cacheada 60 s (`prefs-shell:`), derrubada no PUT
  de qualquer uma das duas. Substitui `getAparenciaDaConta`.
- Layout `(plataforma)` passa `railConta` ao Shell → barra certa desde o SSR.

### Ajustes — `GET/PUT /api/ajustes`
- Lido só quando o modal abre (nada a mais por carga de página).
- GET: `username` (campo oculto do formulário de senha) e página inicial
  `{ disponivel, atual, padrao, opcoes }` — opções = áreas prontas que a pessoa tem.
- PUT `{ paginaInicial }`: só a própria ficha (id da sessão), só área liberada
  (`paginaInicialPermitida`), coluna ausente → 409 com o SQL pendente, ficha
  inexistente → 404; derruba `pagina-inicial:`.
- Seção "Página inicial" no modal com `GlassSelect`; some se indisponível.

### Trocar senha — `TrocarSenha.tsx`
`<form>` com Enter, usuário oculto `autocomplete="username"`, mostrar/ocultar,
alvo de 44 px, mensagem por status (401 senha atual / sessão, 429, rede, genérico),
mensagem some ao digitar.

## Fora do escopo
Foto e nome pelo próprio usuário; "sair de todos os aparelhos" (o JWT é
verificado localmente, então não derrubaria sessões na hora — prometeria o que
não entrega).

## Testes
- `lib/__tests__/prefs-da-conta.test.ts` — dedupe, TTL, gravação atualiza a
  leitura, marcar uma vez, regra de versão.
- `lib/__tests__/ajustes-pagina-inicial.test.ts` — área permitida; rota usa a
  sessão, valida e derruba o cache.
- `app/(plataforma)/__tests__/trocar-senha.dom.test.tsx` — Enter envia, erros
  mapeados, mostrar senha, campo de usuário.
- `tema-sem-piscar.test.ts` atualizado para `prefs-shell`.
