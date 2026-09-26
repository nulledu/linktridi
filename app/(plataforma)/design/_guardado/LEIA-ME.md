# Guardado — telas de TRABALHO do Design

O Design é um painel de **gestão**: quem abre quer ver status, não produzir
arte. Estas telas foram feitas antes dessa decisão (22/09/26) e saíram do
módulo — não têm rota, não aparecem no menu e ninguém as abre.

Ficam aqui porque o código serve se um dia o setor quiser a ferramenta:

- `ProjetosDesign.tsx.txt` — kanban das 7 etapas / lista com busca e filtros.
- `ControleDesign.tsx.txt` — kanban do dia (urgentes, criação, revisão…).
- `BibliotecaDesign.tsx.txt` — artes do pedido + materiais do setor (envio ao B2).
- `ProgramacoesDesign.tsx.txt` — dia/semana/mês.
- `rota-biblioteca.ts.txt` — a rota `/api/design/biblioteca` (GET/POST/DELETE).

Todos com `.txt` no fim de propósito: dentro de `app/` um `.tsx` continua
sendo compilado (e um `route.ts` voltaria a ser endpoint vivo), então um
arquivo guardado que menciona uma função que saiu quebraria o `npm run build`
de todo mundo. Pra reativar, tire o `.txt` e conserte o que mudou desde então.

O que elas usam continua de pé: `/api/design/projetos?vista=lista`,
`lib/design-fluxo.ts`, `lib/design-projetos.ts`, `design.css` e
`supabase/design_materiais.sql` (que NÃO foi rodado no banco).

Pra reativar: devolver o arquivo pra uma pasta com `page.tsx`, recriar a rota
da biblioteca e pôr a subárea de volta em `DesignCasca.tsx`.
