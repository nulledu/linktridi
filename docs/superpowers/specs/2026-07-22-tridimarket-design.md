# TridiMarket — Design do produto

## Objetivo

Criar o TridiMarket como um mercadinho interno auditável, composto por um totem Android offline-first e um painel de gestão dentro de Administração do Gaius. O funcionário identifica-se por PIN, monta um carrinho e adiciona a retirada à própria conta; a gestão controla produtos, estoque, limites, lançamentos financeiros, dispositivos, risco e conciliação.

## Decisões confirmadas

- Evoluir o Supabase existente `wcxhyludixozqloqzjpn` de forma aditiva, sem apagar nem reescrever o histórico legado.
- Lançamento inicial para os perfis **Tridi Produção** e **Tridi Escritório**, mantendo todas as APIs e tabelas multi-perfil para futura ativação dos demais perfis.
- A retirada física é confirmada localmente e nunca desaparece por conflito posterior; divergências ficam em revisão.
- Não existe pagamento no totem. O botão final usa “Adicionar à minha conta”.
- **Desconto em folha está fora do produto**, sem tela, coluna, exportação ou integração planejada.
- A chave `TRIDIMARKET_SUPABASE_ANONKEY` tem papel `service_role` e só pode ser usada no servidor Next.js. APK e browser conversam exclusivamente com APIs do Gaius.
- Nenhum emoji será usado como iconografia. Web usa o componente `Icon` com paths Tabler; Android usa vetores equivalentes.

## Escopo por entrega

### Entrega 1 — operação completa

- Painel: visão geral, funcionários, produtos, estoque, financeiro, dispositivos e configurações.
- Totem: pareamento, PIN, catálogo, busca, leitura de código de barras, carrinho, confirmação e recibo.
- Produtos e preços existentes, preço histórico por compra, estoque por perfil e venda com estoque negativo autorizável.
- Conta do funcionário com limite normal, limite diário/mensal, débito aberto, disponível e bloqueios.
- Livro-razão imutável para compra, pagamento, crédito, débito, estorno e correção.
- Pagamentos totais ou parciais e fechamento mensal, sem desconto em folha.
- Offline-first, fila idempotente, sincronização e estados de revisão.
- Kiosk/device-owner e inicialização automática.
- Auditoria administrativa e eventos de segurança.

### Entrega 2 — crédito e inteligência operacional

- Cheque especial com aprovação manual e validade.
- Score interno, alertas de atraso e limites por categoria/produto.
- Inventário físico, sugestão de reposição, previsão de ruptura e alertas de divergência.
- Extrato individual e notificações de dívida.

### Entrega 3 — expansão

- Múltiplos totens e unidades, autorização offline por dispositivo e revogação remota.
- Reconhecimento facial opcional, recomendações, previsão de consumo e reserva/retirada.
- Benefícios e créditos concedidos pela empresa.

As entregas posteriores não bloqueiam a operação da Entrega 1. O schema nasce preparado para elas, mas o código inicial não simula funcionalidades incompletas.

## Arquitetura

### Painel web

O TridiMarket entra como subárea `administracao:tridimarket`. `AdministracaoClient` adiciona uma aba “TridiMarket”, e o painel interno usa navegação própria para Visão geral, Funcionários, Produtos, Estoque, Financeiro, Dispositivos e Configurações. Rotas Next.js autenticadas aplicam `requireModuleKeys("administracao")` e acessam o banco por um cliente server-only dedicado.

### Backend e banco

As tabelas legadas continuam sendo as fontes de cadastro e histórico:

- `perfis`, `usuarios_perfil`, `categorias`, `produtos`, `precos_perfil`;
- `estoque_perfil`, `estoque_geral`, `movimentacoes_estoque`;
- `vendas_usuarios`, `venda_itens`, `sessoes_totem`, `historico_suspeitas`.

Uma migração aditiva cria as capacidades ausentes:

- `market_purchase_operations`: UUID do dispositivo, sequência local, status e idempotência;
- `market_ledger_entries`: livro-razão imutável por funcionário;
- `market_payments`: pagamentos e alocação em ciclos;
- `market_product_rules`: fallback de estoque, limites e disponibilidade;
- `market_price_history`: preço praticado e vigência;
- `market_devices` e `market_device_codes`: pareamento, versão, saúde e revogação;
- `market_security_events`: tentativas, bloqueios e relógio suspeito;
- `market_billing_cycles`: períodos e fechamento;
- `market_admin_audit_logs`: alterações sensíveis.

As APIs toleram a migração ainda não aplicada apenas para leitura do legado. Operações novas exigem o schema novo e retornam erro explícito de configuração; nunca degradam silenciosamente para uma gravação sem idempotência.

### Totem Android

Novo projeto `tridimarket-app`, separado dos apps de atividades, ponto e TV:

- Kotlin + Jetpack Compose;
- Room como fonte local para perfil, funcionários, produtos, regras, carrinho persistido e fila;
- WorkManager para envio e atualização de cache;
- DataStore para configuração não relacional;
- Android Keystore para material criptográfico do dispositivo;
- OkHttp/Kotlin Serialization para API;
- CameraX/ML Kit Barcode Scanning para códigos de barras;
- DevicePolicyManager para kiosk e HOME persistente.

O dispositivo recebe um pacote assinado com funcionários habilitados, verificadores de PIN, limites, produtos, preços, regras e validade offline. A autorização nunca contém service role nem credencial administrativa.

## Fluxos

### Pareamento

1. Admin gera código de seis dígitos no painel.
2. Totem troca o código por token de dispositivo e chave pública de assinatura.
3. Backend associa perfil/local, registra versão e entrega o primeiro snapshot.
4. Device-owner fixa o aplicativo como HOME e ativa LockTask.

### Compra

1. Funcionário digita PIN; após cinco erros, o PIN entra em bloqueio temporário e gera evento.
2. Totem mostra primeiro nome, foto, débito, limite disponível e status.
3. Produtos entram por catálogo, busca ou leitura de código.
4. Regras locais validam disponibilidade, quantidades, limite e autorização offline.
5. Confirmação grava operação, itens, preço praticado e movimentos locais em uma transação Room.
6. A tela confirma imediatamente; a fila sincroniza em segundo plano.
7. Servidor deduplica por `operation_id`, registra venda/itens/ledger/estoque e responde `SYNCED` ou `REQUIRES_REVIEW`.

### Estoque com fallback

Produto configurado para venda sem saldo continua no carrinho, com aviso objetivo. A operação recebe `stock_override=true`; o painel mostra a divergência e a reposição seguinte sugere compensação do saldo negativo.

### Financeiro

Saldo é a soma do livro-razão, nunca um número editável. Correções criam lançamentos compensatórios. Pagamento parcial reduz o aberto sem alterar compras anteriores. Fechamentos congelam o período para relatório, mas lançamentos posteriores entram como ajustes do ciclo seguinte.

## Visual

### Tokens

- `Gaius Purple` `#5B21B6`: ações primárias e seleção.
- `Deep Ledger` `#171333`: áreas densas, kiosk e navegação do painel interno.
- `Market Mist` `#F5F6FA`: fundo operacional.
- `Paper` `#FFFFFF`: cartões e superfícies de toque.
- `Healthy` `#16875B`: recebido, online e saldo saudável.
- `Attention` `#D97706`: limite/estoque em atenção.
- `Critical` `#D92D20`: bloqueio, vencido e falha real.

Tipografia web reaproveita a família do sistema Gaius. No Android, usa a sans do sistema com escala própria: números e totais têm maior contraste que rótulos. A assinatura visual é o **pulso de conciliação**: uma linha segmentada que conecta consumo, recebimento e estoque e muda de estado conforme a operação está local, sincronizando, conciliada ou em revisão.

### Totem

- Inicial: marca, status de conexão, PIN numérico e ajuda discreta.
- Identificação: faixa compacta com foto, nome, disponível, débito e status.
- Catálogo: categorias, busca, cards grandes e carrinho sempre acessível.
- Carrinho: quantidade, total, disponível após compra e CTA “Adicionar à minha conta”.
- Confirmação: total registrado, estado da sincronização e retorno automático em cinco segundos.

### Painel

Dentro da aba Administração, o painel abre com os indicadores que geram ação: consumido, recebido, aberto, vencido, estoque crítico e totens offline. O gráfico principal compara consumo e recebimento. Listas de atenção substituem dashboards decorativos. Cards levam diretamente para a lista filtrada correspondente.

## Erros e estados

- Rede indisponível: operação local continua enquanto a autorização offline for válida.
- Autorização vencida: bloqueia ou limita compras conforme política recebida; nunca inventa permissão.
- Item/limite alterado em conflito: registra retirada e envia para revisão.
- Operação duplicada: retorna o resultado original sem novo débito/estoque.
- Migração ausente: painel permanece legível; mutações novas mostram “Configure o banco do TridiMarket”.
- Totem revogado: deixa de aceitar novas compras e preserva a fila para recuperação administrativa.
- Relógio alterado: marca evento, usa sequência monotônica e horário do servidor na conciliação.

## Testes e verificação

- Unitários: saldo, limite, fallback, status financeiro, idempotência e conflitos.
- Integração: rotas com cliente Supabase substituível e respostas de schema ausente.
- UI web: estados de carregamento, vazio, erro e filtros.
- Android: repositórios/Room, validação de PIN, carrinho e fila offline.
- Instrumentado: fluxo PIN → produto → carrinho → confirmação em emulador Android.
- Contrato: payloads de bootstrap e sync compartilhados entre TypeScript e modelos Kotlin.
- Build final: `npm test`, `npm run build`, testes Gradle e APK debug.

## Fora de escopo explícito

- Desconto em folha, arquivo para folha, automação trabalhista ou vínculo com salário.
- Pagamento no próprio totem.
- Exposição direta do Supabase/service role ao dispositivo.
- Apagar ou editar lançamentos históricos.

