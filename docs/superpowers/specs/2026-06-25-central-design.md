# Central — design

Módulo único `central` no shell (nível ≥ 1, todos veem), 4 abas internas:
**Início · Mensagens · Solicitações · Suporte**. Visual Apple (`.glass`, `.apple-modal`,
cards com blur, cantos arredondados). **Atividades foi cortado do escopo.**

## Rotas
- `/central` — Início (Home).
- `/central/mensagens`, `/central/solicitacoes`, `/central/suporte`.
- Sub-nav interna em abas (não cresce a sidebar).

## 1. Início
- Saudação por horário ("Bom dia/tarde/noite, {primeiro nome}").
- Barra "Buscar ou pedir à IA…" → vai pra `/central/suporte?q=`.
- Cards-resumo com contagem real: Mensagens não lidas · Solicitações abertas (minhas/meu setor) ·
  Chamados abertos · atalho. Cada card leva à aba.

## 2. Mensagens
- Conversas: diretas, por setor (Produção, Logística, Comercial, Financeiro…), grupos.
- Recursos: texto, anexar imagem, responder (cita), reagir emoji, @menção, status de lido,
  fixar mensagem, buscar conversa.
- Sem realtime na v1 — polling leve ao abrir conversa.
- Tabelas: `central_conversas`, `central_conversa_membros`, `central_mensagens`
  (`responde_a`, `imagem_url`, `fixada`), `central_reacoes`, `central_leituras`.

## 3. Solicitações
- Criar: tipo (Produto/peça, Estoque, Compra, Manutenção, Desenvolvimento, Financeiro, Outro),
  título, descrição, prioridade, setor destino (sugerido pelo tipo).
- Fluxo: Pendente → Aprovada/Recusada (recusa pede motivo) → Concluída.
- Aprova/recusa: dono do setor / admin. NÃO vira Atividade.
- Tabela: `central_solicitacoes`.

## 4. Suporte
- Chat com FAQ curada (`lib/central-faq.ts`: pergunta + palavras-chave + resposta + links).
  Responde no tom de IA, mas é match na base — **sem API/IA real**.
- Sem match bom → "Abrir chamado" (Bug, Dúvida, Melhoria, Erro de sistema,
  Problema com pedido, Problema com estoque).
- Tabela: `central_chamados`.

## Ordem de entrega
Home (casca) → Solicitações → Mensagens → Suporte. Cada uma com SQL próprio (usuário roda no
Supabase NOVO) e push ao terminar.
