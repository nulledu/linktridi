# Cadastro financeiro unificado — contatos, empresas e fornecedores

**Data:** 24/08/2026  
**Status:** aprovado para planejamento pelo pedido “Pode executar”

## Objetivo

Substituir a separação artificial entre Contatos e Fornecedores por um único diretório chamado **Contatos e empresas**. Cada registro representa uma pessoa ou organização e pode acumular papéis — por exemplo, uma organização pode ser simultaneamente empresa, fornecedor e parceiro — sem repetir nome, telefone, endereço ou imagem.

Compromissos devem exibir a imagem da pessoa, empresa ou fornecedor relacionado. Quando não houver relacionado, usam a marca da empresa financeira proprietária como contexto visual.

## Decisões de produto

- “Empresa” dentro deste diretório significa uma organização externa cadastrada em `fin_contatos`. Tridi/Gedux continuam sendo empresas proprietárias em `fin_empresas` e não se misturam ao diretório.
- Um registro tem uma natureza única (`pessoa` ou `empresa`) e zero ou mais papéis (`contato`, `fornecedor`, `cliente`, `parceiro`, `prestador`, `outro`).
- A aba e o item de navegação passam a se chamar **Contatos e empresas**.
- A aba separada **Fornecedores** deixa de ser uma fonte de cadastro independente. Links antigos redirecionam para o diretório já filtrado por `fornecedor`.
- No painel lateral, um dropdown multisseleção chamado **Papéis** liga e desliga papéis. Selecionar `fornecedor` revela a seção financeira do fornecedor; os dados comuns permanecem em uma única ficha.
- A lista oferece filtro por natureza e papel. O botão principal diz **Novo contato ou empresa**.
- Uma pessoa pode ser vinculada a uma organização do mesmo diretório.
- Remover o papel `fornecedor` não apaga histórico. A extensão fica inativa e deixa de aparecer em novas compras e compromissos.

## Modelo de dados

`fin_contatos` será a identidade canônica. Recebe:

- `papeis text[] not null default array['contato']` com constraint para o vocabulário permitido;
- `cnpj text`, exclusivo por empresa financeira quando preenchido;
- os campos compartilhados que hoje estão duplicados em `fin_fornecedores`, quando ainda não existirem: site, WhatsApp, endereço e marca.

`fin_fornecedores` permanece como extensão operacional para preservar todas as FKs e o histórico existente. Recebe `contato_id uuid unique references fin_contatos(id) on delete restrict`. Guarda apenas atributos próprios da relação de fornecimento, como prazo de pagamento, prazo de envio, PIX, banco, boleto e condições comerciais.

A migração é idempotente e faz backfill:

1. Para cada fornecedor sem `contato_id`, encontra com segurança uma organização compatível ou cria um `fin_contatos` com papel `fornecedor`.
2. Copia dados comuns e a imagem para a identidade canônica sem sobrescrever valores melhores já existentes.
3. Liga `fin_fornecedores.contato_id`.
4. Mantém os campos duplicados antigos durante a transição para rollback e compatibilidade; novas leituras preferem o contato canônico.

Não haverá fusão automática apenas por nome. CNPJ normalizado pode identificar a mesma organização; sem CNPJ, a migração cria um registro separado para evitar unir homônimos incorretamente.

## API e consistência

Uma operação servidor/RPC salva a ficha unificada de forma transacional:

- grava dados comuns em `fin_contatos`;
- cria, atualiza ou inativa a extensão `fin_fornecedores` conforme o papel;
- valida que contato, extensão e organização pertencem à mesma `fin_empresa`;
- normaliza e protege CNPJ duplicado;
- audita alterações de identidade e papéis;
- devolve os IDs canônico e da extensão.

As rotas antigas de fornecedores permanecem temporariamente como adaptadores dessa operação, evitando quebrar integrações e formulários ainda existentes durante a migração. A permissão continua `financeiro:cadastros`.

A imagem passa a pertencer ao contato canônico. Upload solicitado por um fornecedor resolve seu `contato_id` e atualiza a mesma marca, para que lista, compromissos e ficha nunca mostrem imagens divergentes.

## Interface

### Diretório

A lista combina pessoas e organizações e mostra imagem, nome, natureza, papéis, telefone e status. No celular, mantém o padrão de cards e alvos de 44 px; filtros ficam em uma faixa lateralmente rolável ou folha inferior já fornecida pelo projeto.

O painel lateral contém:

1. imagem e nome;
2. dropdown multisseleção **Papéis**;
3. dados gerais;
4. vínculo com organização, apenas para pessoa;
5. seção **Fornecedor**, apenas quando o papel estiver ativo;
6. categorias, observações e status.

O dropdown não navega para outra página: ele muda os papéis e as seções da mesma ficha. Links “ver fornecedor” vindos de compras abrem este painel diretamente com a seção Fornecedor em foco.

### Compromissos

Servidor assina as imagens em lote, nunca uma requisição por linha. A lista e a ficha exibem `Marca` ao lado do relacionado:

1. contato explicitamente ligado;
2. fornecedor ligado, resolvido para seu contato canônico;
3. empresa financeira proprietária, quando não houver relacionado;
4. ícone Tabler/inicial como fallback.

O formulário troca os seletores separados “Fornecedor” e “Contato” por **Relacionado a**, agrupado em Pessoas, Empresas e Fornecedores. Internamente continua preenchendo `fornecedor_id` quando o papel fornecedor é escolhido e `contato_id` nos demais casos, preservando o modelo de compromissos e recorrências.

Previsões de recorrência usam a mesma resolução de imagem e nome que compromissos materializados.

## Compatibilidade e erros

- URLs antigas de fornecedores redirecionam para `/financeiro/cadastros/contatos?papel=fornecedor` e preservam IDs em links de edição.
- Histórico financeiro nunca perde `fornecedor_id`.
- Falha ao salvar qualquer parte reverte a transação completa.
- Conflito de CNPJ responde 409 com orientação para abrir o cadastro existente.
- Registros migrados sem dados suficientes continuam utilizáveis e recebem fallback visual.
- Quem só possui leitura de compromissos vê nome e imagem já necessários à obrigação, mas não recebe dados bancários nem campos privados do fornecedor.

## Testes e aceite

- Migração sobe sobre schema antigo e é idempotente.
- Backfill não funde homônimos e não duplica CNPJ inequívoco.
- Criar organização + papel fornecedor gera identidade e extensão numa transação.
- Adicionar/remover papel preserva histórico e controla novos seletores.
- Rotas antigas continuam funcionando como adaptadores.
- Lista filtra por pessoa, empresa e papéis; links antigos abrem o filtro correto.
- Compromisso materializado e previsão mostram a imagem correta em todos os fallbacks.
- Nenhuma imagem é assinada individualmente por linha.
- Upload pela ficha ou por fornecedor atualiza a mesma imagem.
- Typecheck, suíte financeira e build passam.
- `/dev-mobile` é conferido em 320, 375 e 430 px, nos temas claro e escuro, sem overflow e com alvos de 44 px.

## Fora do escopo

- Unificar colaboradores da folha com este diretório.
- Transformar `fin_empresas` (Tridi/Gedux) em contatos.
- Apagar imediatamente `fin_fornecedores` ou seus campos legados.
- Deduplicação automática por nome, telefone ou similaridade.
