// ── Áreas do sistema (novo modelo de permissões) ─────────────────────────────
// Modelo SIMPLES: cada colaborador tem um conjunto de áreas LIBERADAS pelo admin.
// Quadradinho ligado = tem acesso; desligado = não vê nem acessa. Sem níveis,
// sem templates por cargo, sem CRUD separado. A chave de cada área é a MESMA
// usada no gate (`requireModule(key)` / `resolveMyModuleKeys`) — ligar o card
// libera a página E as APIs daquela área automaticamente.
//
// BÁSICO (sempre liberado, não aparece na grade): entrada do sistema + trabalho
// pessoal. Central, minhas atividades, meu ponto/banco de horas, mensagens,
// notificações e perfil são pessoais — todo colaborador tem.

export const AREA_BASICA = ["central", "minhas-atividades"] as const;

// Sub-ação dentro de uma área. A chave GRAVADA/gateada é `${area.key}:${sub.key}`
// (ex.: "estoque:precos"). A área é o guarda-chuva: só aparece pra quem tem ao
// menos uma sub ligada. O gate fino usa `keys.includes("estoque:precos")`.
// `sensivel`: sub que ALTERA o mundo fora do sistema (pausar campanha, mexer em
// orçamento) ou que escancara dinheiro (financeiro). Fica FORA do back-compat
// que concede tudo a quem já tinha a área — senão quem só analisava dashboard
// ganharia o poder sem ninguém decidir. Só passa a valer quando o admin liga o
// quadradinho de propósito.
// `implica`: subs da MESMA área que esta exige para funcionar. Quem responde
// precisa ler a conversa; quem publica precisa ver a automação. Sem isso o
// admin ligava "Ver todas as conversas", a página abria e TODA requisição
// voltava 403 porque a API exige `tridichat:ver` — permissão ligada, acesso
// barrado, ninguém entendendo por quê.
// `concede`: chaves EXTRAS (fora do vocabulário `area:sub`) que esta sub libera.
// É como as visões por setor do Analytics (`set:*`), que a tela lê direto,
// entram na grade.
// `restrita` numa SUB é o mesmo que `restrita` numa área, um degrau abaixo: a
// sub fica fora de toda concessão em bloco (papel admin, card "acesso total") e
// fora do que o superusuário atravessa — só existe em quem alguém marcou de
// propósito. Serve pra sub que mostra SALÁRIO dentro de uma área comum: a aba
// de marketplaces é operação, o bônus de quem cuida delas não é.
export interface AreaSub {
  key: string; label: string; descricao?: string;
  sensivel?: boolean; restrita?: boolean; implica?: string[]; concede?: string[];
  // `herdada`: sub `sensivel` que MESMO ASSIM entra no back-compat de quem já
  // tinha a área ligada no modelo antigo. É pra sub que não estreia poder
  // nenhum — a tela já existia dentro da área e todo mundo que tinha a área a
  // usava. Sem isso, dividir uma área em subs TIRARIA acesso de quem trabalha.
  // Não vale nada para quem nunca teve a área: continua `sensivel`, ou seja,
  // fora de qualquer concessão em bloco.
  herdada?: boolean;
}

export interface Area {
  key: string;        // = chave de módulo do gate (requireModule)
  label: string;
  icon: string;       // ícone Tabler (mesmo do Icon.tsx / sidebar)
  descricao: string;  // descrição curta pro card
  categoria: string;  // agrupamento na grade
  critica?: boolean;  // pede confirmação ao REMOVER (dado sensível)
  subs?: AreaSub[];   // sub-ações (opcional). Sem subs = liga/desliga a área toda.
  // OCULTA: a chave continua VÁLIDA (gateia rotas, aparece no catálogo que o
  // `gate-por-area.test.ts` confere), mas some da grade de permissões — ninguém
  // a concede mais pelo quadradinho. É o estado de uma área que foi ABSORVIDA
  // por outra: a porta nova manda, e a chave velha vive só como vocabulário
  // interno das rotas que ainda a citam. Sem isto, absorver uma área significa
  // ou reescrever dezenas de gates de uma vez, ou deixar dois cards na grade
  // fazendo a mesma pergunta — que é como nasce "tem gente com acesso a coisa
  // que eu não abri pra ninguém".
  oculta?: boolean;
  // RESTRITA: fica FORA de qualquer concessão em bloco. Nem o papel "admin",
  // nem o card "Administrador — acesso total" abrem uma área restrita: ela só
  // entra concedida uma a uma, de propósito, nesta pessoa. Serve pro que não é
  // "mais uma tela do sistema" e sim dinheiro e dívida de gente de verdade.
  restrita?: boolean;
}

// Áreas liberáveis, agrupadas por categoria. A ordem aqui é a ordem da grade.
export const AREAS: Area[] = [
  // Operação
  { key: "producao",  label: "Produção",   icon: "tools",              descricao: "Ordens de produção, chancela e carimbos.", categoria: "Operação", subs: [
    { key: "status",   label: "Status agora",     descricao: "Painel do que está rodando." },
    { key: "dia",      label: "Produção do dia",  descricao: "Fechamento e metas do dia." },
    { key: "controle", label: "Controle",         descricao: "Ajustes e gestão da produção." },
  ] },
  { key: "design",    label: "Design",     icon: "palette",            descricao: "Fila e entregas de design.",              categoria: "Operação" },
  { key: "logistica", label: "Logística",  icon: "truck",              descricao: "Envios, rastreio e expedição.",           categoria: "Operação" },
  { key: "estoque",   label: "Estoque",    icon: "building-warehouse", descricao: "Itens, insumos e ficha técnica.",         categoria: "Operação", subs: [
    { key: "itens",        label: "Ver catálogo / itens", descricao: "Lista de produtos e insumos." },
    { key: "precos",       label: "Ver preços de custo",  descricao: "Custos e ficha técnica." },
    { key: "compras",      label: "Ver compras",          descricao: "Recebimentos e ordens de compra." },
    { key: "fornecedores", label: "Ver fornecedores",     descricao: "Cadastro de fornecedores e materiais." },
    { key: "locais",  label: "Ver e editar localizações", descricao: "Cadastro dos lugares do estoque." },
    // `sensivel` porque bipar ALTERA o estoque físico de verdade — quem só
    // consultou o catálogo (back-compat da migração) não pode herdar o poder
    // de dar baixa lendo um código. `implica: ["itens"]` porque a tela de
    // bipagem mostra o item da unidade: sem estoque:itens ela abre e toda
    // requisição volta 403, sem ninguém entender por quê.
    // NÃO é `sensivel`. Bipar aqui é a operação do galpão — entrou material,
    // saiu material — e não um poder à parte como mexer em orçamento ou ver
    // financeiro. Quem trabalha no estoque bipa; exigir concessão pessoa a
    // pessoa só criava atrito pra liberar 20 pessoas que já fazem isso o dia
    // inteiro. `implica: ["itens"]` fica: a tela mostra o item da unidade, e
    // sem `estoque:itens` a página abriria com toda requisição voltando 403.
    { key: "bipar",   label: "Bipar etiqueta (dar baixa)", descricao: "Tirar unidade do estoque lendo o código.", implica: ["itens"] },
    // ── As duas chaves de ESCRITA ────────────────────────────────────────────
    // `estoque:itens` era a chave de tudo: ver o catálogo e também criar,
    // apagar item e mexer no saldo. Quem enxergava, mexia — não havia como
    // liberar entrada e saída de material sem entregar junto o poder de apagar
    // o cadastro. Estas duas separam o poder pela pergunta que cada uma
    // responde (o QUE existe × QUANTO tem) e devolvem ao `itens` o que o
    // rótulo dele sempre disse: ver.
    //
    // `sensivel` nas duas — e é o ponto todo. É o que as mantém FORA do
    // back-compat de `chavesDasAreas()`: sem isso, todo mundo que hoje tem a
    // área ligada herdaria os dois poderes na migração, e a permissão nasceria
    // já concedida a quem ninguém decidiu conceder. `implica: ["itens"]`
    // porque as duas telas mostram o catálogo: sem ele a página abre e toda
    // requisição volta 403.
    //
    // Rótulo curto de propósito: o quadradinho da grade trunca com reticências
    // (`whiteSpace: nowrap`) e "Cadastrar, editar e apagar item do catálogo"
    // vira "Cadastrar, editar e apa…". O detalhe mora na descrição.
    { key: "cadastrar", label: "Cadastrar e apagar item", sensivel: true, implica: ["itens"],
      descricao: "Criar item novo, editar, apagar, importar planilha, classificar em lote e mexer na ficha técnica." },
    { key: "ajustar",   label: "Ajustar quantidade", sensivel: true, implica: ["itens"],
      descricao: "Adicionar e remover quantidade: ajuste manual, gerar etiqueta de unidade e disparar a reposição." },
  ] },
  // ── 3D: biblioteca de arquivos de impressão (set/2026) ───────────────────
  // MVP: acervo central dos arquivos que rodam nas impressoras 3D (enviar,
  // buscar, visualizar em 3D, baixar). A área vai crescer pra máquinas,
  // programações e kanban — sub nova nasce aqui quando a tela nascer, não
  // antes (classificação prévia vira beco). Sem subs: liga/desliga a área.
  { key: "3d", label: "3D", icon: "box", descricao: "Arquivos de impressão 3D: biblioteca, visualização e download.", categoria: "Operação" },
  // ── Atividades: área PRÓPRIA (11/09/2026) ────────────────────────────────
  // Morava de carona: a página abria pelo CARGO (admin/gerentes) e as rotas
  // pelo cargo OU pela área Pessoas (`colaboradores`) OU por "Produção ›
  // Controle". Quem ganhava Pessoas pra conferir ponto levava junto o poder de
  // distribuir o trabalho da empresa inteira — não havia como dar um sem o
  // outro. Três chaves, pela pergunta que cada uma responde; alcance em TODOS
  // os setores (decisão do dono). A virada é por herança: `atividadesHerdada`.
  { key: "atividades", label: "Atividades", icon: "checklist", descricao: "Distribuir e acompanhar o trabalho da equipe.", categoria: "Operação", subs: [
    { key: "ver",        label: "Ver", descricao: "Visão geral, quadro da equipe, histórico e tempos." },
    { key: "atribuir",   label: "Atribuir", implica: ["ver"], descricao: "Criar e atribuir atividades pra qualquer setor, gerar produção, mexer no que é dos outros." },
    { key: "configurar", label: "Configurar", implica: ["ver"], descricao: "Modelos de produção, catálogo de tarefas e peças." },
    // O "supervisor do caixa": o tablet trava quando alguém quer recusar uma
    // atividade e só destrava com o código pessoal de quem tem esta chave.
    // Restrita: só vem marcando na ficha (o papel admin atravessa igual).
    { key: "autorizar",  label: "Autorizar recusa no tablet", implica: ["ver"], restrita: true, descricao: "Ter um código de supervisor pra liberar (ou negar) quando alguém quer recusar uma atividade no tablet." },
  ] },

  // Vendas & Marketing
  { key: "comercial", label: "Comercial",              icon: "trending-up",     descricao: "Pedidos, clientes e vendas.",       categoria: "Vendas & Marketing", subs: [
    { key: "pedidos",   label: "Pedidos",   descricao: "Todos os pedidos da empresa." },
    { key: "historico", label: "Histórico", descricao: "Métricas por vendedora." },
    { key: "carteira",  label: "Meus pedidos", descricao: "Carteira pessoal do vendedor." },
    // Esta sub é quem define a EQUIPE do comercial: a aba Pedidos puxa do ERP só
    // os pedidos de quem está com ela ligada. Desligar a chave (ou desligar a
    // pessoa) tira os pedidos dela da tela sem ninguém mexer em lista nenhuma —
    // antes isso era uma lista manual que guardava até quem já saiu da empresa.
    { key: "lancar",    label: "Lançar pedido", descricao: "Pode lançar pedido no Comercial. Os pedidos desta pessoa no ERP passam a aparecer na aba Pedidos." },
    { key: "leads",     label: "Leads",     descricao: "Base de leads." },
  ] },
  // Marketing · Geral — painel do setor: produção de criativos + resultado do
  // orgânico. `criar` é sub porque a numeração é patrimônio do time: quem só
  // acompanha (gestor, vendedor) enxerga sem poder mexer na sequência.
  { key: "marketing", label: "Marketing · Geral",       icon: "speakerphone",    descricao: "Criativos, equipe e resultados do orgânico.", categoria: "Vendas & Marketing", subs: [
    { key: "ver",   label: "Ver painel e criativos", descricao: "Dashboard de produção, lista e detalhe dos criativos." },
    { key: "criar", label: "Criar e editar criativos", descricao: "Cadastrar criativo novo (gera o número) e editar os existentes." },
    { key: "desempenho", label: "Ver desempenho no tráfego", descricao: "Ranking dos criativos que mais venderam, com gasto, ROAS, CTR e CPA. Mostra DINHEIRO investido." },
    // A Contingência SAIU daqui (set/2026): era a sub `marketing:aquecimento` e
    // virou área própria, logo abaixo. Quem cuida de criativo não decide mais,
    // por tabela, quem enxerga o parque de chips — ver CONTINGENCIA_HERDADA.
  ] },
  // Contingência — área PRÓPRIA, e não mais uma sub do Marketing.
  //
  // O parque de chips, BMs, contas, celulares e proxies não é "mais uma aba de
  // marketing": é a estrutura que mantém a operação no ar quando a Meta bane
  // alguma coisa. Enquanto morava dentro do Marketing, todo mundo com a área de
  // criativo herdava a contingência inteira — não dava pra abrir uma sem a
  // outra. Agora é um quadradinho separado, ligado pessoa a pessoa.
  //
  // SEM SUBS de propósito: quem entra aqui CADASTRA e EDITA. Separar "ver" de
  // "editar" faria a tela abrir só de leitura pra quem a usa o dia inteiro —
  // e quem não precisa mexer também não precisa ver o parque.
  { key: "contingencia", label: "Contingência", icon: "shield-check",
    descricao: "Parque de chips, BMs, contas, celulares e proxies: cadastra, edita e acompanha. Ver e mexer andam juntos.",
    categoria: "Vendas & Marketing" },
  { key: "trafego",   label: "Tráfego",                icon: "activity",        descricao: "Campanhas e tráfego pago.",         categoria: "Vendas & Marketing", subs: [
    { key: "analisar",  label: "Ver painéis e relatórios", descricao: "Dashboards, funil e relatórios do tráfego." },
    { key: "custos",    label: "Ver custos e lucro",       descricao: "Investimento, margem e lucro real." },
    { key: "gerenciar", label: "Ligar/pausar e mexer no orçamento", sensivel: true,
      descricao: "Altera as campanhas na Meta de verdade: pausa, reativa e muda o orçamento diário. Mexe em dinheiro real." },
  ] },
  // Criador de lojas. As subs separam quem MONTA a loja de quem só cuida do
  // catálogo: publicar uma loja e apontar um domínio mexem no que o público
  // enxerga, e isso não pode vir junto com "pode cadastrar produto".
  { key: "lojas", label: "Lojas", icon: "shopping-bag",
    descricao: "Criador de lojas: catálogo, pedidos e endereço.",
    categoria: "Vendas & Marketing", subs: [
    { key: "ver",       label: "Ver as lojas",              descricao: "Lista de lojas, catálogo e pedidos." },
    { key: "produtos",  label: "Cadastrar e editar produtos", implica: ["ver"], descricao: "Criar produto, mexer em preço, foto e estoque do catálogo." },
    { key: "pedidos",   label: "Gerenciar pedidos",          implica: ["ver"], descricao: "Mudar status de pagamento e de envio." },
    { key: "publicar",  label: "Publicar e despublicar loja", sensivel: true, implica: ["ver"],
      descricao: "Coloca a vitrine no ar (ou tira). O que está publicado é público." },
    { key: "dominios",  label: "Apontar domínio próprio", sensivel: true, implica: ["ver"],
      descricao: "Cadastra o endereço que a loja passa a usar. Mexe em DNS e no que o cliente digita." },
  ] },
  // TridiFlow — workspace próprio com sidebar própria. As subs espelham UMA A UMA
  // as abas daquela sidebar: ligar o quadradinho acende a aba, desligar some com
  // ela. Antes era uma chave só, então quem precisava só dos contatos recebia
  // junto o editor de páginas, os domínios e o pixel.
  { key: "tridiflow", label: "Atendimento", icon: "message-chatbot",
    descricao: "Bots, páginas e conversas (TridiFlow).", categoria: "Vendas & Marketing", subs: [
    { key: "projetos",     label: "Projetos (fluxos, quizzes e páginas)",
      descricao: "Dashboard, lista de projetos e os editores de fluxo, quiz e página, com prévia, resultados e métricas." },
    // LinkTridi é o bio link da MARCA: um projeto só, que é o link da bio do
    // Instagram. Quem tem "projetos" continua vendo e abrindo (leitura), mas
    // mexer nos cartões é outra decisão — um destino trocado manda o seguidor
    // pro lugar errado e ninguém percebe pela tela de dentro.
    // `implica: ["projetos"]` porque o editor mora dentro da lista de projetos:
    // sem ela a permissão ligava e a página voltava 403.
    { key: "linktridi",    label: "Criar e editar LinkTridi", implica: ["projetos"],
      descricao: "O bio link da marca: criar, editar cartões, links de destino, imagens, cores e publicar. Sem esta chave o LinkTridi abre só de leitura." },
    { key: "tutoriais",    label: "Centrais de tutoriais",  descricao: "Criar e editar as centrais de tutoriais dos produtos." },
    { key: "templates",    label: "Templates",              descricao: "Biblioteca de modelos prontos para começar um projeto." },
    { key: "temas",        label: "Temas",                  descricao: "Identidade visual reaproveitada pelas páginas." },
    { key: "integracoes",  label: "Integrações",            descricao: "Como o TridiFlow conversa com WhatsApp, pixel e afins." },
    { key: "contatos",     label: "Contatos e leads",       descricao: "Quem passou pelos funis: estágio, anotação e dados de contato." },
    { key: "analytics",    label: "Analytics",              descricao: "Sessões, conversão e desempenho dos funis." },
    // `sensivel` porque domínio, webhook e pixel ALTERAM o mundo fora do
    // sistema: apontam DNS, disparam requisição para fora e mexem no
    // rastreamento que já está no ar. `herdada` porque hoje TODO MUNDO que tem
    // a área tem essas telas — tirar na migração seria tomar acesso de quem já
    // trabalha nelas. Daqui pra frente ela só entra ligada de propósito.
    { key: "configuracoes", label: "Configurações (domínios, webhooks, pixels)", sensivel: true, herdada: true,
      descricao: "Domínio próprio, usuários do workspace, webhooks, logs e rastreamento. Mexe em DNS e em pixel que já está no ar." },
  ] },

  // Gestão & Dados
  // Analytics é visão POR SETOR: a tela lê chaves `set:*` (ver SETORES_ANALYTICS
  // em lib/permissions.ts) para decidir o que mostrar. Elas só existiam no
  // modelo antigo por NÍVEL — quem era configurado na grade ficava com a área
  // ligada e nenhuma visão dentro dela. Cada setor é uma sub que `concede` a
  // chave correspondente. Financeiro é `sensivel`: expõe o dinheiro da empresa,
  // então não vem de migração — o admin liga de propósito.
  { key: "analytics",     label: "Analytics",     icon: "chart-line", descricao: "Métricas e indicadores da empresa.",           categoria: "Gestão & Dados", critica: true, subs: [
    { key: "comercial",   label: "Setor Comercial",   concede: ["set:comercial"],   descricao: "Vendas do comercial." },
    { key: "vendedoras",  label: "Setor Vendedoras",  concede: ["set:vendedoras"],  descricao: "Desempenho por vendedora." },
    { key: "marketing",   label: "Setor Marketing",   concede: ["set:marketing"],   descricao: "Resultado do marketing." },
    { key: "marketplace", label: "Setor Marketplace", concede: ["set:marketplace"], descricao: "Vendas nos marketplaces." },
    { key: "financeiro",  label: "Financeiro",        concede: ["set:financeiro"],  sensivel: true,
      descricao: "Aba Financeiro: caixa, custos e margem da empresa." },
  ] },
  // ── RH — Recursos Humanos ───────────────────────────────────────────────────
  //
  // A área que ABSORVEU Pessoas (set/2026). O RH é o centro de informação do
  // funcionário: quem é, o que assinou, o que faltou, quanto trabalhou, quando
  // sai de férias e o que a ficha anamnésica diz. Nada disso é "mais uma tela
  // do sistema" — é a vida de gente de verdade, com dado de saúde no meio.
  //
  // `restrita` pelo mesmo motivo do Financeiro, e é o pedido explícito do dono:
  // NINGUÉM entra por tabela. Nem o papel "admin", nem o card "Administrador —
  // acesso total", nem cargo, nem departamento, nem ter tido Pessoas antes.
  // Quem distribui é `rh:acessos` — e, porque o nome `acessos` é reservado
  // (ver `chaveQueConcede`), na prática só o SUPERUSUÁRIO concede o RH, até ele
  // entregar essa chave a alguém de propósito.
  //
  // As subs separam a sensibilidade REAL de cada gaveta, e não a tela em que
  // ela aparece: ver quem é a equipe ≠ mexer no cadastro; ver quanto alguém
  // trabalhou ≠ ler o atestado que explica a falta; e NADA disso é a ficha
  // anamnésica, que é dado de saúde e não vem junto com nenhuma outra chave.
  // `sensivel` em toda gaveta que expõe saúde, documento ou poder de escrita:
  // elas ficam fora de qualquer concessão em bloco e de todo back-compat.
  //
  // Nenhuma sub é `restrita`: isso as jogaria em CHAVES_SO_POR_CONCESSAO e
  // trancaria o próprio dono do lado de fora (a grade proíbe editar a PRÓPRIA
  // ficha). O superusuário atravessa o RH — é ele quem abre a porta pros outros.
  { key: "rh", label: "RH", icon: "id-badge",
    descricao: "Colaboradores: cadastro, documentos, atestados, ponto, férias, ficha anamnésica e histórico.",
    categoria: "Gestão & Dados", critica: true, restrita: true, subs: [
    { key: "ver",              label: "Ver o RH",
      descricao: "Abre o módulo: visão geral, lista de colaboradores e a ficha de cada um (dados pessoais e profissionais)." },
    { key: "editar",           label: "Editar colaborador", sensivel: true, implica: ["ver"],
      descricao: "Altera a ficha: dados pessoais, contato, endereço, cargo, setor e situação (ativo, afastado, férias, desligado)." },
    { key: "documentos",       label: "Ver documentos", implica: ["ver"],
      descricao: "Lista e abre os documentos guardados do colaborador (contrato, RG, comprovantes)." },
    { key: "documentos_editar", label: "Anexar e remover documentos", sensivel: true, implica: ["ver", "documentos"],
      descricao: "Cadastra documento novo na ficha e apaga os que estão lá." },
    // Atestado é dado de SAÚDE mesmo quando só se olha a data: a existência da
    // falta já revela doença. Por isso a leitura também é `sensivel`, ao
    // contrário de documentos.
    { key: "atestados",        label: "Ver atestados", sensivel: true, implica: ["ver"],
      descricao: "Atestados do colaborador: período, dias abonados e observação. É informação de saúde." },
    { key: "atestados_editar", label: "Registrar atestado", sensivel: true, implica: ["ver", "atestados"],
      descricao: "Lança atestado novo, muda o status (aceito/recusado) e apaga registro." },
    { key: "ponto",            label: "Ver ponto", implica: ["ver"],
      descricao: "Batidas, horários e jornada do colaborador, e o painel de presença da equipe." },
    { key: "banco_horas",      label: "Ver banco de horas", implica: ["ver", "ponto"],
      descricao: "Saldo, crédito, débito e histórico de compensação — o número que vira dinheiro na folha." },
    // Compensação mexe em DIA e em HORA ao mesmo tempo: o dia trabalhado no
    // feriado e o dia de folga que o devolve. Ler vem junto com o banco de
    // horas (é lá que o par aparece); ESCREVER é chave própria, porque aprovar
    // um par perdoa uma jornada inteira e reserva hora que viraria dinheiro.
    { key: "compensacoes_editar", label: "Registrar e aprovar compensações", sensivel: true, implica: ["ver", "ponto", "banco_horas"],
      descricao: "Liga um dia trabalhado (feriado, sábado) a um dia de folga, aprova a troca e a reflete no banco de horas." },
    { key: "ferias",           label: "Ver férias", implica: ["ver"],
      descricao: "Períodos aquisitivos, férias programadas, gozadas e saldo de dias." },
    { key: "ferias_editar",    label: "Programar e registrar férias", sensivel: true, implica: ["ver", "ferias"],
      descricao: "Cria, altera e cancela período de férias. Mexe na escala e no que a pessoa recebe." },
    // O dado mais íntimo que o sistema guarda. Não vem com "editar", não vem
    // com "atestados", não vem com nada: só ligado de propósito, nesta pessoa.
    { key: "anamnese",         label: "Ver ficha anamnésica", sensivel: true, implica: ["ver"],
      descricao: "Histórico de saúde declarado pelo colaborador. Não vem junto com nenhuma outra chave do RH." },
    { key: "anamnese_editar",  label: "Preencher ficha anamnésica", sensivel: true, implica: ["ver", "anamnese"],
      descricao: "Preenche e altera a ficha anamnésica do colaborador." },
    // Currículos é dado pessoal de gente de FORA da empresa. A lista mostra o
    // mínimo (nome, vaga, cidade, status); o que o candidato escreveu, o arquivo
    // e a nota interna são gavetas separadas — cada uma só entra ligada de
    // propósito. Nenhuma implica a outra: ler as respostas não abre o currículo.
    { key: "curriculos",       label: "Ver currículos",
      descricao: "Lista de candidatos recebidos: nome, vaga, cidade, origem, data e status. Sem respostas, arquivo nem observações." },
    { key: "curriculos_respostas", label: "Ver respostas do candidato", sensivel: true, implica: ["curriculos"],
      descricao: "O que o candidato respondeu no formulário de candidatura: histórico, motivação, disponibilidade." },
    { key: "curriculos_arquivo",   label: "Abrir currículo (arquivo)", sensivel: true, implica: ["curriculos"],
      descricao: "Visualiza e baixa o PDF/DOC enviado pelo candidato." },
    { key: "curriculos_status",    label: "Mudar status e arquivar", sensivel: true, implica: ["curriculos"],
      descricao: "Move o candidato entre Novo, Em análise, Pré-selecionado, Entrevista, Aprovado, Reprovado e Arquivado." },
    { key: "curriculos_editar",    label: "Observações, vaga e cadastro", sensivel: true, implica: ["curriculos"],
      descricao: "Registra observação interna, associa o candidato a uma vaga, corrige contato e cadastra vagas." },
    { key: "curriculos_integracao", label: "Formulário e vagas", sensivel: true, implica: ["curriculos"],
      descricao: "Liga/desliga o formulário público de candidatura, publica ou encerra vaga e escolhe a vaga padrão." },
    { key: "calendario",       label: "Calendário do RH",
      descricao: "Aniversários, feriados, datas comemorativas, datas do setor e eventos internos no calendário anual." },
    // As três gavetas de ESCRITA do calendário, separadas pelo que cada uma
    // muda: evento interno é agenda; data de setor é identidade de um grupo;
    // feriado mexe no que o Ponto e a folha consideram dia útil. Ler implica
    // só a porta — nenhuma escrita vem com "ver o calendário".
    { key: "calendario_editar",   label: "Criar e editar eventos", sensivel: true, implica: ["calendario"],
      descricao: "Cria, altera e apaga eventos internos e datas comemorativas próprias no calendário do RH." },
    { key: "calendario_setores",  label: "Datas dos setores", sensivel: true, implica: ["calendario"],
      descricao: "Cadastra, ativa, desativa e apaga as datas associadas a cada setor (dia do setor, comemorações internas)." },
    { key: "calendario_feriados", label: "Gerenciar feriados", sensivel: true, implica: ["calendario"],
      descricao: "Cadastra feriado manual, corrige o municipal e atualiza a lista pela fonte externa." },
    // A CHAVE DA PORTA. Quem a tem decide quem mais entra no RH — inclusive
    // quem lê ficha anamnésica e atestado. Não implica nenhuma outra sub: dá
    // para administrar o acesso sem abrir a ficha de ninguém.
    { key: "acessos",          label: "Conceder acesso ao RH", sensivel: true,
      descricao: "Abre a grade que libera e revoga o RH para cada pessoa. Quem tem isto escolhe quem lê saúde e documento." },
  ] },
  // Pessoas foi ABSORVIDA pelo RH em set/2026 e a área virou `oculta`: a chave
  // continua gateando as rotas que sempre gateou (ponto, dispositivos, cadastro
  // de colaborador, usuários do ERP — ver `pessoasDoRh` abaixo), mas não é mais
  // concedida pelo quadradinho. A porta é o RH, e só ele.
  //
  // O cofre de senhas morava aqui como sub `sensivel` enquanto a tela vivia
  // dentro de Pessoas; em 15/09/2026 o cofre saiu para Acessos & Infra (a única
  // tela que ainda o mostra), então a permissão foi junto — virou
  // `infraestrutura:cofre`. Quem já tinha o cofre não perde nada:
  // `cofreHerdado()` traduz a chave antiga (ver abaixo).
  { key: "colaboradores", label: "Pessoas (absorvida pelo RH)", icon: "users", descricao: "Chave antiga de Pessoas. Quem concede hoje é o RH.", categoria: "Gestão & Dados", critica: true, oculta: true },
  // ── TI — projetos de tecnologia e roadmaps (set/2026) ────────────────────
  // A área acompanha a evolução dos sistemas da empresa: cada projeto de TI
  // tem um roadmap (etapas, prazos, responsáveis) e as etapas vinculam
  // TAREFAS da Central — não existe segunda base de tarefas. As subs separam
  // ler de escrever, e apagar de editar: excluir um roadmap some com o
  // histórico de um projeto inteiro, então é `sensivel` (nunca vem de
  // migração nem de bloco). Quem concede a TI é a grade comum (qualquer
  // admin), como toda área não-restrita — a sub `acessos` que existiu por
  // algumas horas saiu em 22/09/2026: o gerenciamento de permissões mora na
  // PRÓPRIA TI (/ti/permissoes, o ex-/rh/gestao), e uma grade paralela só de
  // chaves ti:* seria duas portas pro mesmo poder.
  { key: "ti", label: "TI", icon: "device-laptop",
    descricao: "Projetos de tecnologia: roadmaps, etapas, prazos e equipe.",
    categoria: "Gestão & Dados", subs: [
    { key: "ver",     label: "Ver roadmaps e projetos",
      descricao: "Visão geral, lista de roadmaps, timeline, etapas, tarefas vinculadas e equipe." },
    { key: "criar",   label: "Criar roadmap e projeto", implica: ["ver"],
      descricao: "Cadastrar projeto novo e criar roadmap com etapas." },
    { key: "editar",  label: "Editar etapas e vincular tarefas", implica: ["ver"],
      descricao: "Alterar roadmap e etapas (status, datas, responsável, ordem) e vincular/desvincular tarefas." },
    { key: "excluir", label: "Excluir roadmap e etapas", sensivel: true, implica: ["ver", "editar"],
      descricao: "Apagar roadmap, etapa ou projeto. Some com o acompanhamento — decisão de propósito." },
  ] },
  // Acessos & Infra — domínios, hospedagens, VPS e o COFRE de senhas da empresa
  // (o que vence quando, o que renovar, onde cada coisa roda e com qual acesso).
  //
  // Duas subs, e a primeira existe pela mecânica de `mapaDePermissoes()`: numa
  // área com subs, a área só fica ligada se ALGUMA sub estiver marcada. Sem uma
  // sub de LEITURA, salvar a ficha de quem cuida de domínio (e não do cofre)
  // gravaria `infraestrutura: false` e tiraria a área inteira da pessoa.
  //  · `ver`   — cadastrar e editar domínios, hospedagens e VPS. NÃO é
  //    `sensivel`: o back-compat de `chavesDasAreas()` a concede a quem já tinha
  //    `infraestrutura: true` no modelo sem subs. Ninguém perde acesso.
  //  · `cofre` — `sensivel`, o ponto todo desta separação: a senha do GitHub, da
  //    AWS e do Meta da empresa não pode vir de carona pra quem ganhou a área só
  //    pra conferir vencimento de domínio. Nasce desligada e só entra ligada de
  //    propósito, pessoa a pessoa. NÃO se chama `acessos`: esse nome é reservado
  //    — `chaveQueConcede()` trata qualquer sub `acessos` como "quem administra o
  //    acesso desta área", e batizá-la assim exigiria o cofre pra qualquer admin
  //    salvar a ficha de alguém em Infra. `critica`: é o mapa da infra da empresa.
  { key: "infraestrutura", label: "Acessos & Infra", icon: "key",
    descricao: "Domínios, hospedagens e VPS da empresa, e o cofre de senhas — com vínculo entre cada coisa e o acesso que a destranca.",
    categoria: "Gestão & Dados", critica: true, subs: [
    { key: "ver",   label: "Domínios, hospedagens e VPS",
      descricao: "Cadastrar e editar domínios, hospedagens e VPS — vencimentos, custos e decisão de renovar." },
    { key: "cofre", label: "Cofre de senhas", sensivel: true,
      descricao: "Ver e revelar as senhas, e-mails e credenciais dos serviços da empresa. Toda revelação fica registrada com autor e horário." },
  ] },

  // Sistema
  // FINANCEIRO — o cofre. Compromissos, compras, notas, patrimônio e a folha de
  // Tridi e Gedux. É a área mais fechada do sistema: `restrita` (não vem junto
  // com "acesso total" nem com o papel admin — ver lib/permissions.ts) e
  // DISCRETA (não aparece na sidebar nem na busca — ver MODULOS_DISCRETOS em
  // lib/rbac.ts). Entra pessoa a pessoa, ligando o quadradinho de propósito.
  //
  // As subs separam três poderes que não podem andar juntos:
  //  · LER o financeiro  ≠  MEXER nele (lançar, comprar, cadastrar);
  //  · mexer             ≠  PAGAR (dar baixa move dinheiro de verdade);
  //  · o financeiro todo ≠  a FOLHA (salário de gente de verdade, nominal).
  // Por isso `pagar`, `folha` e `contas` são `sensivel`: nunca vêm de migração
  // nem de back-compat, só de alguém ligando aquele quadradinho.
  { key: "financeiro", label: "Financeiro", icon: "wallet",
    descricao: "Compromissos, compras, notas fiscais, patrimônio e folha de Tridi e Gedux.",
    categoria: "Sistema", critica: true, restrita: true, subs: [
    { key: "ver",          label: "Ver o financeiro",              descricao: "Visão geral, compromissos, compras, notas e patrimônio — só leitura." },
    { key: "compromissos", label: "Lançar e editar compromissos",  implica: ["ver"], descricao: "Criar, alterar valor/vencimento e cancelar obrigação." },
    { key: "compras",      label: "Registrar compras",             implica: ["ver"], descricao: "Cadastrar compra, itens e plano de pagamento (gera os compromissos)." },
    { key: "notas",        label: "Notas fiscais",                 implica: ["ver"], descricao: "Lançar nota emitida e nota de compra, e vincular à compra." },
    { key: "patrimonio",   label: "Patrimônio",                    implica: ["ver"], descricao: "Cadastrar bem, mudar local, status e garantia." },
    { key: "cadastros",    label: "Cadastros",                     implica: ["ver"], descricao: "Recorrências, bancos e gateways, fornecedores." },
    { key: "pagar",        label: "Dar baixa e pagar", sensivel: true, implica: ["ver", "compromissos"],
      descricao: "Paga o compromisso: grava a baixa, cria o movimento e mexe no saldo da conta. É dinheiro saindo de verdade." },
    { key: "contas",       label: "Mexer em contas e saldos", sensivel: true, implica: ["ver", "cadastros"],
      descricao: "Cadastra banco/gateway/cartão, ajusta saldo de abertura, transfere entre contas e reverte pagamento." },
    { key: "folha",        label: "Ver salários e folha", sensivel: true, implica: ["ver"],
      descricao: "Salário-base, benefícios e folha do mês, com nome de cada pessoa. É o dado mais pessoal que o sistema guarda." },
    // A CHAVE DO COFRE. Quem tem isto decide quem mais entra no Financeiro — é
    // poder sobre poder, e por isso não implica nenhuma outra sub: dá para
    // administrar o acesso sem ver um centavo. Como toda sub de área restrita,
    // ela não vem do papel admin nem do "acesso total"; na prática só o
    // superusuário a tem, até ele conceder a alguém de propósito.
    // A tela de CONFIGURAÇÃO do módulo: empresas (criar, editar, marca) e a
    // identidade visual das contas. Não mostra um centavo — mexe na moldura —,
    // mas quem cria empresa decide onde o dinheiro é lançado, e por isso é
    // `sensivel` como as outras: só entra ligada de propósito. Como toda sub
    // de área restrita, quem a concede é `financeiro:acessos`.
    { key: "config",       label: "Configurar o Financeiro", sensivel: true,
      descricao: "Cadastrar e editar empresas (nome, CNPJ, cor e logo) e a marca de cada banco, gateway e cartão." },
    { key: "acessos",      label: "Conceder acesso ao Financeiro", sensivel: true,
      descricao: "Abre a tela que libera e revoga o Financeiro para cada pessoa. Quem tem isto escolhe quem mais entra — inclusive quem pode pagar e ver a folha." },
  ] },
  // TridiMarket é área PRÓPRIA e RESTRITA — saiu de dentro de Configurações.
  // Lá dentro estão a carteira, a dívida e o histórico de consumo de cada
  // pessoa da empresa: quem abre isso vê quanto cada colega deve e o que
  // comprou. Não é coisa que se ganhe junto com "acesso total ao sistema" —
  // tem que ser uma decisão consciente, por pessoa. Ver `restrita`.
  { key: "tridimarket", label: "TridiMarket", icon: "shopping-bag",
    descricao: "Mercadinho: carteiras, dívidas, estoque e totens.",
    categoria: "Sistema", critica: true, restrita: true },
  { key: "frota", label: "Frota de TVs", icon: "device-tv", descricao: "Atualização e comando remoto das TV box da parede.", categoria: "Sistema" },
  { key: "administracao", label: "Configurações", icon: "settings", descricao: "Ajustes do sistema e dispositivos.", categoria: "Sistema", critica: true, subs: [
    { key: "paineis",      label: "Painéis",      descricao: "Configuração dos painéis/kiosk." },
    { key: "marketplaces", label: "Marketplaces", descricao: "Integrações de marketplace." },
    // O bônus do gerenciador é SALÁRIO de uma pessoa, dentro de uma aba que é
    // operação: quem confere pedido da Shopee não tem por que ver quanto o
    // colega ganha por cuidar dela. `restrita` + `sensivel`: não vem do papel
    // admin, não vem do "acesso total", não vem de migração e o superusuário
    // não atravessa. Sem esta chave a rota não devolve o acordo nem o valor —
    // não é a tela que esconde, é o servidor que não manda.
    { key: "marketplaces-bonus", label: "Bônus dos marketplaces", sensivel: true, restrita: true,
      implica: ["marketplaces"],
      descricao: "Ver e definir o bônus de quem cuida dos marketplaces (salário)." },
    { key: "notificacoes", label: "Notificações", descricao: "Envio de notificações push." },
    // Pedido do dono (14/09/2026): "ADMIN e TI ONLY". Não existe papel "TI" —
    // é esta chave: o admin já recebe (não é restrita) e quem é de TI ganha no
    // quadradinho da ficha. Abre /status e o aviso na tela quando algo cai.
    { key: "status", label: "Status dos sistemas", descricao: "Aviso na tela, selo, relatório semanal e custo das quedas (admin, TI e gestor). O /status completo é de todo mundo logado." },
  ] },
];

export const AREA_KEYS = AREAS.map((a) => a.key);
export const AREA_BY_KEY: Record<string, Area> = Object.fromEntries(AREAS.map((a) => [a.key, a]));

// Todas as sub-chaves completas ("estoque:precos"…). Usado pelo admin (concede
// tudo) e pra validar o mapa salvo.
export const SUB_FULL_KEYS: string[] = AREAS.flatMap((a) => (a.subs ?? []).map((s) => `${a.key}:${s.key}`));

// ── Áreas restritas ─────────────────────────────────────────────────────────
// Chaves que NUNCA saem de uma concessão em bloco (papel admin / "acesso
// total"). Só entram quando alguém liga o quadradinho naquela pessoa — ou
// quando quem está pedindo é superusuário (ver lib/superusuario.ts).
export const AREAS_RESTRITAS: Area[] = AREAS.filter((a) => a.restrita);
export const CHAVES_RESTRITAS: string[] = [
  ...AREAS_RESTRITAS.flatMap((a) => [a.key, ...(a.subs ?? []).map((s) => `${a.key}:${s.key}`)]),
  // Subs restritas dentro de áreas comuns (ex.: o bônus dos marketplaces).
  ...AREAS.filter((a) => !a.restrita).flatMap((a) => (a.subs ?? []).filter((s) => s.restrita).map((s) => `${a.key}:${s.key}`)),
];
const RESTRITAS = new Set(CHAVES_RESTRITAS);
export function ehChaveRestrita(key: string): boolean { return RESTRITAS.has(key); }

// ── O que NEM o superusuário recebe de graça ─────────────────────────────────
//
// `restrita` já mantém o Financeiro fora do papel admin e do "acesso total".
// Faltava um degrau: o superusuário atravessava TUDO, e como o dono do sistema
// é `role: "admin"`, na prática existia um admin que via o cofre sem ninguém
// ter decidido isso. "Nem admin tem acesso por padrão" só é verdade quando vale
// também para ele.
//
// DUAS chaves ficam de fora desta lista, e é o mesmo motivo nas duas: elas
// governam a MOLDURA do módulo, não o dinheiro dentro dele.
//
// · `financeiro:acessos` abre a tela que concede o Financeiro a alguém;
// · `financeiro:config` cadastra empresa e define a marca de empresas e contas.
//
// Nenhuma das duas mostra um centavo. E as duas caem no MESMO beco se saírem
// daqui: a grade de permissões não deixa ninguém editar a própria ficha (a
// trava do `isSelf`, que existe para ninguém se conceder o cofre sozinho).
// Então uma chave de governança que só chega por concessão explícita fica
// inalcançável para o dono do sistema — ele precisaria de um segundo admin
// para se conceder, e esse segundo admin precisaria da chave que ele não tem.
//
// `config` entrou nesta exceção DEPOIS, e por um defeito real: a tela de
// Configurações foi ao ar e ninguém conseguia abri-la, nem o dono. Ela existia,
// o link estava na barra, e o `podeVer` o escondia de todo mundo — a leitura
// disso, de fora, é "a tela não existe".
//
// Ver a visão geral, pagar ou abrir a folha continua exigindo o quadradinho
// ligado — e isso fica no rastro da auditoria, com data e autor, como qualquer
// outra concessão.
//
// A chave é montada à mão em vez de chamar `subFullKey`: ele é `const` e mora
// mais abaixo neste arquivo, então usá-lo aqui rodaria antes da declaração e
// derrubaria o módulo inteiro no import (zona morta temporal). O `tsc` não
// reclama porque o tipo existe — quem quebra é o runtime, no primeiro import.
const GOVERNANCA_DO_MODULO = new Set(["financeiro:acessos", "financeiro:config"]);

// ── A sub restrita que o DONO alcança ────────────────────────────────────────
//
// Mesmo beco de `financeiro:config`, por outra porta. Uma sub restrita fica
// fora do papel admin, do "acesso total" e da migração — e isso é o que se
// quis. Mas se ela também ficar fora do superusuário, ninguém consegue
// concedê-la a ele: a grade proíbe editar a PRÓPRIA ficha (a trava do
// `isSelf`, que existe pra ninguém se dar o cofre sozinho). Resultado: o dono
// do sistema precisaria de um segundo admin pra se conceder, e a tela nasceria
// invisível pra quem mandou construí-la.
//
// `administracao:marketplaces-bonus` está aqui por decisão escrita: o dono
// atravessa. O que NÃO muda é tudo o mais — nenhum admin, nenhum "acesso
// total" e nenhuma migração trazem essa chave; ela continua entrando em
// qualquer outra pessoa só pelo quadradinho ligado, com data e autor na
// auditoria.
// `atividades:autorizar` pelo mesmo motivo: é o código de supervisor do
// tablet, e o dono precisa tê-lo sem depender de outro admin marcar a ficha.
const O_DONO_ALCANCA = new Set(["administracao:marketplaces-bonus", "atividades:autorizar"]);

export const CHAVES_SO_POR_CONCESSAO: string[] = [
  ...(AREA_BY_KEY.financeiro?.subs ?? [])
    .map((s) => `financeiro:${s.key}`)
    .filter((k) => !GOVERNANCA_DO_MODULO.has(k)),
  // Toda sub marcada `restrita` entra aqui pelo mesmo motivo do Financeiro:
  // "nem admin tem por padrão" só é verdade se valer também pro dono — menos
  // as que ele precisa alcançar pra não trancar a si mesmo do lado de fora.
  ...AREAS.flatMap((a) => (a.subs ?? [])
    .filter((s) => s.restrita && !O_DONO_ALCANCA.has(`${a.key}:${s.key}`))
    .map((s) => `${a.key}:${s.key}`)),
];

const SO_POR_CONCESSAO = new Set(CHAVES_SO_POR_CONCESSAO);
/** Esta chave só chega em alguém por concessão explícita — nem o superusuário a ganha. */
export function ehChaveSoPorConcessao(key: string): boolean { return SO_POR_CONCESSAO.has(key); }
export function ehAreaRestrita(areaKey: string): boolean { return !!AREA_BY_KEY[areaKey]?.restrita; }
export const subsDaArea = (areaKey: string): AreaSub[] => AREA_BY_KEY[areaKey]?.subs ?? [];
export const subFullKey = (areaKey: string, subKey: string) => `${areaKey}:${subKey}`;

// Categorias na ordem de exibição (derivadas da ordem das AREAS).
export const AREA_CATEGORIAS: string[] = AREAS.reduce<string[]>((acc, a) => {
  if (!acc.includes(a.categoria)) acc.push(a.categoria);
  return acc;
}, []);

// Fecho das dependências entre subs (`implica`). Recebe e devolve chaves
// completas ("tridichat:responder"). Roda até estabilizar, então uma cadeia
// (A precisa de B, que precisa de C) resolve inteira.
export function expandirImplicacoes(chaves: Iterable<string>): Set<string> {
  const set = new Set(chaves);
  for (let volta = 0; volta < 8; volta++) {
    let mudou = false;
    for (const a of AREAS) {
      for (const s of a.subs ?? []) {
        if (!s.implica?.length || !set.has(subFullKey(a.key, s.key))) continue;
        for (const dep of s.implica) {
          const fk = subFullKey(a.key, dep);
          if (!set.has(fk)) { set.add(fk); mudou = true; }
        }
      }
    }
    if (!mudou) break;
  }
  return set;
}

// ── A virada de Atividades pra área própria ─────────────────────────────────
// Ninguém perde acesso no dia da troca, e ninguém ganha poder nenhum: herdam
// as TRÊS chaves quem abria a tela pela ÁREA — Pessoas ou "Produção ›
// Controle". As três porque essa gente já podia tudo, inclusive editar o
// catálogo.
//
// O CARGO não entra aqui: "cargo não abre área" é regra desde 31/08/2026
// (sem-grade-so-o-basico.test.ts). Os gerentes que abriam a tela pelo cargo
// ganham as chaves pela FICHA — supabase/permissao_atividades.sql grava — e
// dali em diante é a grade que manda. `role` fica na assinatura por
// compatibilidade com o resolvedor.
//
// Mesma regra da contingência: vale só enquanto NINGUÉM decidiu sobre a chave
// nova. A grade salva grava o mapa inteiro, então a primeira decisão sobre a
// pessoa desliga a herança — e o SQL grava a herança no banco pra o
// quadradinho aparecer marcado na ficha.
//
// Recebe as chaves JÁ RESOLVIDAS (e não o mapa cru): assim o back-compat e o
// `implica` valem igual pra "tem Pessoas" e "tem Produção › Controle".
export const CHAVES_ATIVIDADES = ["atividades", "atividades:ver", "atividades:atribuir", "atividades:configurar"] as const;
export function atividadesHerdada(
  permissoes: Record<string, boolean> | null | undefined,
  role: string,
  chavesResolvidas: readonly string[],
): boolean {
  if (permissoes && CHAVES_ATIVIDADES.some((k) => permissoes[k] !== undefined)) return false;
  return chavesResolvidas.includes("colaboradores") || chavesResolvidas.includes("producao:controle");
}

// ── Herança da Contingência ──────────────────────────────────────────────────
// `marketing:aquecimento` foi APOSENTADA quando a Contingência virou área
// própria. Quem tinha acesso no dia da virada não pode perdê-lo: nem quem
// marcou a sub, nem quem tem o Marketing inteiro do modelo antigo (o
// back-compat de `chavesDasAreas` concedia a sub junto).
//
// A herança só vale enquanto NINGUÉM decidiu sobre a chave nova. Assim que a
// grade daquela pessoa é salva — ela grava o mapa completo, `contingencia`
// inclusive — quem manda é o quadradinho. Sem essa condição a herança viraria
// a armadilha de AREAS_ABERTAS_TEMPORARIAMENTE: desmarcar o card não surtiria
// efeito nenhum, porque a chave voltaria por baixo.
//
// `supabase/permissao_contingencia.sql` grava `contingencia: true` em quem
// herdou, e a partir daí esta função não decide mais nada.
export function contingenciaHerdada(permissoes: Record<string, boolean> | null | undefined): boolean {
  if (!permissoes || permissoes.contingencia !== undefined) return false;
  if (permissoes["marketing:aquecimento"]) return true;
  const subsMarketing = AREA_BY_KEY.marketing?.subs ?? [];
  const marcouAlgumaSub = subsMarketing.some((s) => permissoes[subFullKey("marketing", s.key)]);
  return !marcouAlgumaSub && !!permissoes.marketing;
}

// ── Migração do cofre: saiu de Pessoas, foi pra Acessos & Infra ───────────────
// O cofre de senhas era `colaboradores:cofre` (sub `sensivel` de Pessoas). Em
// 15/09/2026 a tela saiu de Pessoas — Infra virou a única página que a mostra —
// e a permissão foi junto: agora é `infraestrutura:cofre`. Quem já tinha o cofre
// não pode perdê-lo, nem perder o jeito de CHEGAR nele (a tela abre pela área
// `infraestrutura`), então esta herança traduz a chave antiga na nova.
//
// Como toda herança do arquivo, só vale enquanto NINGUÉM decidiu sobre a chave
// NOVA: assim que a grade da pessoa é salva (grava o mapa completo,
// `infraestrutura:cofre` inclusive), quem manda é o quadradinho. Sem essa guarda
// desmarcar o cofre não surtiria efeito, porque a chave antiga o traria de volta
// por baixo. `supabase/permissao_cofre_infra.sql` grava a chave nova em quem
// herdou e apaga a antiga; a partir daí esta função não decide mais nada.
export function cofreHerdado(permissoes: Record<string, boolean> | null | undefined): boolean {
  if (!permissoes || permissoes["infraestrutura:cofre"] !== undefined) return false;
  return !!permissoes["colaboradores:cofre"];
}

// ── Pessoas foi absorvida pelo RH: a chave velha vem DO RH, e só nessa direção ─
//
// Quando o RH tomou o lugar de Pessoas, dezenas de rotas continuaram gateando
// por `colaboradores` — o ponto inteiro, os dispositivos, os usuários do ERP, o
// CRUD do colaborador. Reescrever todos os gates no mesmo dia seria trocar o
// piso e a fundação de uma vez; deixar como estava faria a permissão nova abrir
// a tela e TODA requisição voltar 403, que é o bug clássico deste repositório:
// a pessoa lê "está quebrado", não "falta permissão".
//
// Então o RH CONCEDE a chave operacional antiga. A direção importa e é única:
//
//   tem RH  →  ganha `colaboradores` (para as rotas que ainda a citam)
//   tem `colaboradores`  →  NÃO ganha nada do RH
//
// A segunda linha é o pedido explícito do dono: "ter acesso a Pessoas
// anteriormente NÃO deve significar acesso automático ao RH". Quem usava
// Pessoas continua com a chave velha até alguém decidir; o que ela não abre
// mais é tela nenhuma, porque `/colaboradores` agora leva ao RH e o gate de lá
// é `rh`.
//
// Diferente das heranças acima (`contingenciaHerdada`, `cofreHerdado`), esta
// NÃO tem prazo nem depende de "ninguém decidiu ainda": ela é permanente
// enquanto existir rota gateando por `colaboradores`. O dia em que a última
// delas passar a exigir `rh:*`, esta função e a área oculta saem juntas.
export const CHAVE_PESSOAS_LEGADA = "colaboradores";

export function pessoasDoRh(chavesResolvidas: Iterable<string>): boolean {
  for (const k of chavesResolvidas) if (k === "rh" || k.startsWith("rh:")) return true;
  return false;
}

// Chaves efetivas de acesso a partir do mapa de permissões (novo modelo):
// básico + áreas marcadas como true. Usado pelo resolver.
export function chavesDasAreas(permissoes: Record<string, boolean> | null | undefined): string[] {
  const set = new Set<string>(AREA_BASICA);
  if (!permissoes) return [...set];
  const subs = new Set<string>();
  for (const a of AREAS) {
    if (a.subs && a.subs.length) {
      // Área COM subs: incluir cada sub liberada; a área entra se tiver qualquer sub.
      const ligadas = a.subs.filter((s) => permissoes[subFullKey(a.key, s.key)]);
      if (ligadas.length) {
        for (const s of ligadas) subs.add(subFullKey(a.key, s.key));
        set.add(a.key);
      } else if (permissoes[a.key] && !Object.keys(permissoes).some((k) => k.startsWith(`${a.key}:`))) {
        // Só pra mapa SEM nenhuma `area:*` (ligada ou não, atual ou
        // aposentada): sub no mapa prova que a grade decidiu sub a sub.
        // BACK-COMPAT: área ligada no modelo antigo (sem subs no mapa) → concede
        // as subs de LEITURA, pra ninguém perder acesso ao configurar subs.
        // As `sensivel` ficam de fora: são poderes que a pessoa nunca teve, e
        // herdá-los por migração seria conceder acesso sem ninguém decidir.
        set.add(a.key);
        for (const s of a.subs) if (!s.sensivel || s.herdada) subs.add(subFullKey(a.key, s.key));
      }
    } else if (permissoes[a.key]) {
      set.add(a.key);
    }
  }
  if (contingenciaHerdada(permissoes)) set.add("contingencia");
  // Cofre migrado de Pessoas → Infra: a chave antiga vira `infraestrutura:cofre`.
  // Entra em `subs` para o laço abaixo somar a ÁREA `infraestrutura` junto — sem
  // ela a pessoa teria a chave do cofre e nenhuma porta pra chegar na tela.
  if (cofreHerdado(permissoes)) subs.add("infraestrutura:cofre");
  // Dependências entre subs + as chaves extras que cada sub concede (`set:*`).
  // A área entra junto: uma sub concedida por implicação sem a área ligada
  // deixaria a pessoa com a chave fina e sem a porta de entrada.
  for (const k of expandirImplicacoes(subs)) {
    set.add(k);
    set.add(k.slice(0, k.indexOf(":")));
    const [areaKey, subKey] = k.split(":");
    for (const extra of AREA_BY_KEY[areaKey]?.subs?.find((s) => s.key === subKey)?.concede ?? []) set.add(extra);
  }
  // Por último, e depois do fecho: o RH carrega junto a chave operacional que
  // Pessoas deixou, senão a tela abre e as rotas do ponto devolvem 403.
  if (pessoasDoRh(set)) set.add(CHAVE_PESSOAS_LEGADA);
  return [...set];
}

// Já foi configurado pela grade? Basta ter QUALQUER chave (true OU false): a
// grade salva o mapa completo das áreas, então "remover todas" (tudo false) conta
// como configurado = deny-all (só o básico), sem cair no fallback por nível.
// null / {} = nunca configurado → o resolver usa o fallback por nível (transição).
export function temPermissoesConfiguradas(permissoes: Record<string, boolean> | null | undefined): boolean {
  return !!permissoes && Object.keys(permissoes).length > 0;
}

/**
 * O mapa que vai para `employees.permissoes` quando a grade é salva.
 *
 * Mora aqui, e não dentro do componente, porque é a regra que define quem
 * enxerga o quê — e regra de acesso que só existe dentro de um `.tsx` de 1.500
 * linhas não tem como ser testada. A que segue é a que quebrou:
 *
 *   "acesso total" liga tudo em bloco, MENOS o que é de área restrita.
 *
 * Isso já valia para a chave da ÁREA e não valia para as SUBS. Como o
 * TridiMarket não tem subs, ninguém notou; o Financeiro tem dez, e o resultado
 * era que salvar a ficha de qualquer admin gravava as dez como `true`. Na tela,
 * os quadradinhos apareciam marcados e travados — desmarcar não adiantava,
 * porque o salvamento seguinte acendia tudo de novo.
 *
 * `selecionadas` já deve vir com o fecho de `implica` aplicado.
 */
export function mapaDePermissoes(opts: {
  ehAdmin: boolean;
  /** Chaves marcadas na grade: `area` para as sem subs, `area:sub` para as com. */
  selecionadas: Set<string>;
}): Record<string, boolean> {
  const { ehAdmin, selecionadas } = opts;
  const ligada = (a: Area) =>
    a.subs?.length ? a.subs.some((s) => selecionadas.has(`${a.key}:${s.key}`)) : selecionadas.has(a.key);

  const map: Record<string, boolean> = { admin: ehAdmin };
  for (const a of AREAS) {
    const emBloco = ehAdmin && !a.restrita;
    map[a.key] = a.restrita ? ligada(a) : (emBloco || ligada(a));
    for (const s of a.subs ?? []) {
      const fk = `${a.key}:${s.key}`;
      // Sub restrita nunca vem no bloco, mesmo numa área que vem.
      map[fk] = (emBloco && !s.restrita) || selecionadas.has(fk);
    }
  }
  return map;
}

// ── Quem pode CONCEDER uma área restrita ─────────────────────────────────────

/**
 * A sub que administra o acesso da própria área, se ela tiver uma.
 *
 * O Financeiro tem `financeiro:acessos` — quem a possui decide quem entra no
 * cofre. Uma área restrita que não declara essa sub (o TridiMarket) continua
 * sendo concedida por qualquer admin na grade, como sempre foi.
 */
export function chaveQueConcede(areaKey: string): string | null {
  const tem = AREA_BY_KEY[areaKey]?.subs?.some((s) => s.key === "acessos");
  return tem ? `${areaKey}:acessos` : null;
}

/**
 * Esta pessoa pode mexer nas chaves DESTA área ao salvar a ficha de alguém?
 *
 * Existe porque a grade de Pessoas grava o mapa inteiro de permissões: sem
 * este filtro, qualquer admin editando o telefone de um colega poderia mandar
 * `financeiro:pagar: true` no mesmo PATCH e se dar o cofre — a área restrita
 * protegia contra concessão em BLOCO, não contra alguém marcando de propósito.
 */
export function podeConcederArea(
  areaKey: string,
  minhasChaves: string[],
  ehSuperusuario = false,
): boolean {
  const exigida = chaveQueConcede(areaKey);
  if (!exigida) return true;                 // área sem administrador próprio
  return ehSuperusuario || minhasChaves.includes(exigida);
}

/**
 * O mapa que vai ser GRAVADO, com as áreas que quem salva não administra
 * voltando ao que já estava.
 *
 * Preserva em vez de zerar, e a diferença importa: zerar deixaria qualquer
 * admin REVOGAR o Financeiro de alguém sem querer, só por salvar o cargo da
 * pessoa numa tela que nem mostra essas chaves.
 */
export function preservarAreasNaoAdministradas(opts: {
  enviado: Record<string, boolean>;
  guardado: Record<string, boolean> | null | undefined;
  minhasChaves: string[];
  ehSuperusuario?: boolean;
}): Record<string, boolean> {
  const { enviado, guardado, minhasChaves, ehSuperusuario = false } = opts;
  const out = { ...enviado };
  for (const a of AREAS) {
    if (podeConcederArea(a.key, minhasChaves, ehSuperusuario)) continue;
    const chaves = [a.key, ...(a.subs ?? []).map((s) => `${a.key}:${s.key}`)];
    for (const k of chaves) {
      const antes = guardado?.[k];
      if (antes === undefined) delete out[k]; else out[k] = antes;
    }
  }
  return out;
}
