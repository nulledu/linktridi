# Integração entre compromissos, recorrências e cadastros

## Objetivo

Transformar Compromissos na agenda central do Financeiro sem perder a diferença entre uma obrigação real e uma previsão. Compromissos e recorrências poderão nascer um do outro, compartilhar os mesmos cadastros e navegar para suas origens, sem duplicar títulos. O upload de marca de empresa será corrigido na causa real, não apenas receberá uma mensagem de erro melhor.

## Modelo conceitual

- **Recorrência** é uma regra: descreve quando e como obrigações futuras devem nascer.
- **Previsão** é uma ocorrência calculada da regra que ainda não foi materializada. Não pode ser paga, editada ou contabilizada como título existente.
- **Compromisso** é a obrigação materializada. Pode ser pendente, prevista pela folha, paga ou cancelada.
- **Pagamento/movimento** continua separado do compromisso e só nasce na baixa.

Esse modelo preserva o fluxo já usado pelo sistema e por ERPs: regra gera previsão; previsão materializada vira obrigação; baixa gera movimento.

## Fluxos de criação

### Compromisso que vira recorrência

O formulário de novo compromisso terá a opção `Repetir este compromisso`. Ao ativá-la, serão exibidos periodicidade, intervalo, dia de vencimento, início e término opcional.

Ao salvar:

1. o compromisso informado é criado como a primeira ocorrência real;
2. a recorrência é criada com os mesmos empresa, descrição, categoria, valor, conta, fornecedor e contato;
3. `proxima_competencia` começa no período seguinte ao compromisso inicial;
4. compromisso e recorrência ficam ligados por `origem = recorrencia` e `origem_id`;
5. a primeira ocorrência recebe a mesma chave idempotente que o gerador usaria para aquela competência.

A operação será transacional no banco. Nenhuma metade poderá permanecer salva se a outra falhar.

### Recorrência que vira compromisso

O formulário de recorrência terá a opção `Lançar a primeira ocorrência agora`, ligada por padrão quando o primeiro vencimento já está definido.

Ao salvar, o sistema cria a regra e, na mesma operação, materializa somente a primeira ocorrência. Se a opção estiver desligada, a regra nasce sem compromisso e sua primeira ocorrência aparece imediatamente como previsão na agenda.

### Edição

Editar um compromisso já gerado não reescreve a regra silenciosamente. A tela oferece uma ação explícita `Editar recorrência` para mudanças futuras. Editar a recorrência afeta somente ocorrências ainda não materializadas; compromissos existentes preservam o histórico.

## Agenda de compromissos

A página do servidor carregará compromissos e recorrências do mesmo escopo de empresas e calculará previsões até o fim da janela exibida.

- Previsões aparecem com selo `Previsto` e ícone Tabler de recorrência.
- O filtro poderá incluir/excluir previsões explicitamente.
- KPIs e totais identificarão separado `lançado` e `previsto`, evitando somar duas vezes ou apresentar previsão como dívida confirmada.
- Uma previsão será deduplicada por `(empresa, recorrência, competência)` contra compromissos pendentes, pagos ou cancelados.
- Clicar numa previsão abre detalhes e a ação `Lançar compromisso`; não haverá confirmação disparada diretamente pelo clique da linha.
- A materialização chamará um serviço dedicado com `recorrencia_id` e `competencia`, criando exatamente uma ocorrência. Não usará a rota de compromisso manual nem avançará outras regras.
- O gerador em lote e o lançamento unitário compartilharão o mesmo serviço e a mesma chave idempotente.

## Navegação e integração entre abas

- O detalhe do compromisso exibirá sua origem e abrirá a recorrência, compra ou folha correspondente quando houver uma rota aplicável.
- O detalhe da recorrência exibirá compromissos já gerados e permitirá abrir a agenda filtrada pela regra.
- Compromisso e recorrência usarão as mesmas fontes de empresa, conta, fornecedor, contato, categoria, forma de pagamento e responsável quando o campo fizer sentido.
- Um compromisso poderá guardar `contato_id`, além de `fornecedor_id`, para pagamentos a pessoas ou empresas que não são fornecedores.
- A interface evitará dois campos concorrentes para o mesmo favorecido. Fornecedor e contato serão escolhas mutuamente exclusivas, com limpeza explícita ao trocar.
- Atalhos entre abas usarão URLs com filtros estáveis; nenhum formulário duplicará cadastros inteiros dentro de outro formulário nesta entrega.

## Serviço e persistência

Será criada uma fronteira única para materialização de recorrências:

```text
materializarOcorrencia(empresaId, recorrenciaId, competencia, autor)
```

Ela deverá:

1. carregar e validar a regra dentro da empresa;
2. calcular a ocorrência pedida usando o mesmo cálculo do gerador;
3. recusar competência fora do início/fim ou incompatível com a periodicidade;
4. fazer `upsert` pela chave `rec:<recorrencia>:<AAAA-MM>`;
5. devolver se criou ou se já existia;
6. avançar `proxima_competencia` somente quando a competência materializada for a próxima esperada;
7. registrar auditoria.

O gerador em lote chamará a mesma unidade para cada competência pendente. A rota manual de compromissos continuará criando apenas compromissos manuais e não aceitará campos de origem arbitrários enviados pelo navegador.

Uma função transacional no Postgres será usada para os fluxos que criam regra e primeira ocorrência juntas. Ela validará vínculos de empresa e manterá a chave única já existente em `fin_compromissos`.

## Upload de marca de empresa

O erro será reproduzido atravessando as quatro fronteiras: id enviado pelo formulário, consulta de `fin_empresas`, upload no bucket e atualização de `logo_url`.

- Erro de consulta não poderá virar 404 genérico.
- A rota validará UUID, permissão e existência separadamente.
- Se o upload ocorrer e a atualização do banco falhar, o arquivo recém-criado será removido.
- Ao trocar uma imagem, o caminho anterior será removido somente depois da atualização bem-sucedida.
- A resposta preservará códigos úteis de schema/storage e uma mensagem compreensível.
- Haverá testes da rota/serviço para empresa existente, id inválido, registro ausente, falha de consulta, falha de storage e falha ao atualizar a linha.

## Compatibilidade com o trabalho existente

As alterações não commitadas deixadas pelo Claude serão revisadas por comportamento:

- `previsoes.ts` será mantido apenas após corrigir ligação com a página, semântica de totais e materialização exata;
- a chamada atual à rota manual de compromissos será removida;
- o filtro opcional de `gerarRecorrencias` não será usado como lançamento unitário porque ainda gera todas as competências até uma data;
- o SQL de contato-empresa será preservado se continuar idempotente e mantiver todas as validações antigas;
- mudanças não relacionadas ao Financeiro presentes no worktree não serão alteradas nem incluídas nos commits desta entrega.

## Permissões e segurança

- Ler previsões exige `financeiro:ver`.
- Criar/materializar compromissos exige `financeiro:compromissos`.
- Criar/editar recorrências exige `financeiro:cadastros`.
- Criar ambos no mesmo fluxo exige as duas permissões; a opção será escondida ou desabilitada com explicação quando faltar uma delas.
- Todo id de empresa, conta, fornecedor, contato e recorrência será validado no servidor.
- O navegador nunca poderá escolher `origem`, `origem_id` ou `idempotency_key` livremente.

## Interface e celular

Os novos campos ficam dentro dos painéis laterais existentes, que viram folhas inferiores no celular. Controles terão pelo menos `var(--tap)`, botões principais permanecerão alcançáveis com teclado aberto e nenhum conteúdo dependerá de hover. A agenda continuará usando a tabela/card responsiva do kit. Serão verificados 320, 375 e 430 px, áreas seguras e temas claro/escuro em `/dev-mobile`.

## Testes e aceite

O desenvolvimento seguirá ciclos TDD. Os testes mínimos cobrirão:

- compromisso + recorrência criados juntos sem duplicar a primeira competência;
- recorrência + primeira ocorrência criadas juntas ou somente prevista;
- rollback integral quando qualquer metade falha;
- materialização de exatamente uma competência;
- idempotência concorrente e repetida;
- deduplicação de previsões contra compromissos pendentes, pagos e cancelados;
- edição da regra sem alterar compromissos históricos;
- vínculos entre empresas recusados;
- contato/fornecedor propagados corretamente;
- causas e compensações do upload de marca;
- testes existentes do Financeiro, typecheck e build;
- ausência de rolagem horizontal e alvos de toque adequados no celular.

## Fora do escopo

- Conciliação bancária automática, integração com bancos e contabilidade de partidas dobradas.
- Cadastro completo de fornecedor/contato/conta dentro do formulário de compromisso.
- Alteração retroativa em massa de compromissos já materializados.
- Unificação física das tabelas de recorrência e compromisso.
