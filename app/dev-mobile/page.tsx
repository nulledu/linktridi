// TEMPORÁRIO — banco de provas da fundação mobile. Monta o Shell REAL sem login
// e renderiza no SERVIDOR os padrões de grid que a rede do globals.css precisa
// pegar (a serialização do SSR é justamente a que não casava).
import { notFound } from "next/navigation";
import { Shell } from "../(plataforma)/Shell";
import { TridiMarketShell } from "../(plataforma)/tridimarket/TridiMarketShell";
import { MODULES, navFor, navForKeys } from "@/lib/rbac";
import { DEFAULT_PERIOD } from "../(plataforma)/PeriodPicker";
import { ProvaDataList } from "./ProvaDataList";
import { ProvaKit } from "./ProvaKit";
import { ProvaControles } from "./ProvaControles";

export const dynamic = "force-dynamic";

export default async function DevMobile({ searchParams }: { searchParams: Promise<{ ws?: string; t?: string }> }) {
  // DUPLA TRAVA, igual às outras páginas /dev-*: o middleware só a torna PÚBLICA
  // fora de produção — não a faz sumir. Sem este 404, qualquer pessoa logada
  // abriria em produção uma casca com a navegação de admin; e como esta rota
  // está fora de (plataforma), ela não tem gate de sessão nenhum, então no
  // fail-open do middleware (env do Supabase ausente) sairia até anônima.
  if (process.env.NODE_ENV === "production") notFound();

  const { ws, t } = await searchParams;
  const modules = MODULES;

  // ── Funil de quiz ──────────────────────────────────────────────────────────
  // `quiz` prova o PLAYER (o que o visitante do anúncio vê) e por isso NÃO entra
  // no Shell: o player é uma página pública, sozinha na tela — envolvê-lo na
  // navegação do ERP mediria uma tela que não existe. `quiz-editor` prova o
  // editor, esse sim dentro do sistema.
  if (ws === "quiz" || ws === "quiz-editor") {
    const { QUIZ_EXEMPLO } = await import("./telas-quiz");
    const { THEME_PADRAO } = await import("@/lib/tridiflow");
    // `?t=<templateId>` mostra um template pronto (ex.: candidatura) em vez do
    // funil de prova genérico — serve pra conferir cada template no ar.
    const { templateQuizPorId } = await import("@/lib/tridiflow-quiz-templates");
    const quizProva = (t && templateQuizPorId(t)?.montar()) || QUIZ_EXEMPLO;
    if (ws === "quiz") {
      const { QuizRuntime } = await import("../f/QuizRuntime");
      // `resumeKey` fixa: é o que faz esta página provar TAMBÉM a retomada
      // (fechar e reabrir volta onde parou). `previa` só impede o redirect real
      // pro checkout — as duas coisas são independentes.
      return <QuizRuntime quiz={quizProva} theme={THEME_PADRAO} altura="100dvh" resumeKey={`dev-quiz-${t || "exemplo"}`} previa />;
    }
    const { QuizEditorProva } = await import("./QuizEditorProva");
    return (
      <Shell nav={navFor("admin")} modules={modules} name="Teste" role="admin">
        <QuizEditorProva inicial={quizProva} theme={THEME_PADRAO} />
      </Shell>
    );
  }

  // ── Triagem de candidatos (aba Candidatos da tela de Resultados) ───────────
  // A tela real fica atrás de login. Monto com o template de Candidatura — que
  // liga a aba "Candidatos" porque tem `resultados` — e a rede falsa devolvendo
  // as respostas: é o card de candidato a 320px (nome que quebra, chips, CV e o
  // seletor de estágio) que esta prova existe pra medir. O PATCH de estágio ganha
  // um handler pra o clique responder sem reverter (o mapa só cobre GET).
  if (ws === "quiz-resultados") {
    const { ProvaQuizResultados } = await import("./ProvaQuizResultados");
    return (
      <Shell nav={navFor("admin")} modules={modules} name="Teste" role="admin">
        <ProvaQuizResultados />
      </Shell>
    );
  }

  // ── Telas REAIS montadas com dados falsos ────────────────────────────────
  // Componente solto não revela problema de tela: espaçamento, hierarquia e
  // densidade só aparecem com o conteúdo de verdade dentro da casca de verdade.
  if (ws === "pessoas") {
    const { PESSOAS, PONTO_STATUS, PONTO_PESSOAS, PONTO_REGISTROS, BANCO_HORAS, ACESSOS_COFRE, ACESSOS_LOG } = await import("./telas");
    const { ColaboradoresHub } = await import("../(plataforma)/colaboradores/ColaboradoresHub");
    const { RedeFalsa } = await import("./RedeFalsa");
    return (
      <Shell nav={navFor("admin")} modules={modules} name="Teste" role="admin">
        {/* O Hub monta o Ponto na primeira aba, e ele busca sozinho — sem a rede
            falsa a prova abriria num "Carregando…" eterno. */}
        <RedeFalsa mapa={{ "/api/ponto/status": PONTO_STATUS, "/api/ponto/pessoas": PONTO_PESSOAS, "/api/ponto/registros": PONTO_REGISTROS, "/api/ponto/banco-horas": BANCO_HORAS, "/api/acessos/log": ACESSOS_LOG, "/api/acessos": ACESSOS_COFRE }}>
          <ColaboradoresHub
            meId="u13" isAdmin
            areasQueConcedo={["financeiro"]}
            // Em produção esta é uma PROMESSA que chega por streaming (a lista
            // serve só a aba de equipe, e a que abre é o Ponto). Na prova ela já
            // está resolvida — a forma é a mesma.
            equipe={Promise.resolve({
              colaboradores: PESSOAS,
              empresasFinanceiro: [{ id: "e1", nome: "Tridi" }, { id: "e2", nome: "Gedux" }],
              restricoesFinanceiro: { u2: ["e2"] },
            })}
          />
        </RedeFalsa>
      </Shell>
    );
  }

  if (ws === "central" || ws === "atividades" || ws === "minhas" || ws === "tarefas" || ws === "solicitacoes" || ws === "historico") {
    const { COLABORADORES, ATIVIDADES, POOL, TAREFAS, SOLICITACOES, ATIVIDADES_HISTORICO, CANCELADAS_HISTORICO } = await import("./telas");
    const { Historico } = await import("../(plataforma)/atividades/Historico");
    const { CentralTrabalhoClient } = await import("../(plataforma)/central/tarefas/CentralTrabalhoClient");
    const { SolicitacoesClient } = await import("../(plataforma)/central/solicitacoes/SolicitacoesClient");
    const { CentralTabs } = await import("../(plataforma)/central/CentralTabs");
    const { AtividadesClient } = await import("../(plataforma)/atividades/AtividadesClient");
    const { MinhasAtividadesClient } = await import("../(plataforma)/minhas-atividades/MinhasAtividadesClient");
    const { InicioClient } = await import("../(plataforma)/central/inicio/InicioClient");
    // `central` prova o INÍCIO (a porta) e `tarefas` prova a caixa de entrada.
    // Eram a mesma tela enquanto `/central` abria direto na lista; hoje são
    // duas, e a chave antiga aponta pra rota que ela nomeia.
    //
    // O `<div>` repete o contêiner de `central/layout.tsx` de propósito: é ele
    // que faz a Central encostar na barra lateral, e é justamente a largura que
    // esta página existe pra medir.
    const central = (
      <div style={{ padding: "8px 0 40px" }}>
        <CentralTabs rotaDeProva={ws === "tarefas" ? "/central/tarefas" : ws === "solicitacoes" ? "/central/solicitacoes" : "/central"} />
        {ws === "tarefas"
          ? <CentralTrabalhoClient userId="dev" inicial={TAREFAS} />
          : ws === "solicitacoes"
          ? <SolicitacoesClient meuId="dev" inicial={SOLICITACOES} papelResolve />
          : (
            <InicioClient
              nome="Teste"
              // Os três estados do card na mesma fileira, de propósito: com
              // número, ZERADO (Solicitações) e sem contador nenhum (Meu ponto,
              // Suporte). O zerado é o que mais precisa de olho — é o estado em
              // que o card corria o risco de virar a aba de cima outra vez.
              destinos={[
                { href: "/central/tarefas", icon: "checklist", titulo: "Tarefas", linha: "O que você tem pra fazer.", numero: 3, unidade: "em aberto", vazio: "Nada em aberto" },
                { href: "/central/solicitacoes", icon: "inbox", titulo: "Solicitações", linha: "Pedidos esperando a sua resposta.", numero: 0, unidade: "esperando você", vazio: "Nada esperando você" },
                { href: "/central/banco-horas", icon: "clock", titulo: "Meu ponto", linha: "Na empresa desde 08:12.", numero: null, unidade: null },
                { href: "/mensagens", icon: "message", titulo: "Mensagens", linha: "Conversas dos setores e diretas.", numero: 2, unidade: "não lidas · 1 cita você", vazio: "Tudo lido" },
                { href: "/central/suporte", icon: "lifebuoy", titulo: "Suporte", linha: "Como se faz cada coisa no sistema.", numero: null, unidade: null },
              ]}
              locais={[
                { id: "pg_estoque", tipo: "pagina", titulo: "Estoque", sub: "Ir para", href: "/estoque", icon: "building-warehouse" },
                { id: "pg_pessoas", tipo: "pagina", titulo: "Pessoas", sub: "Ir para", href: "/colaboradores", icon: "users" },
                ...TAREFAS.slice(0, 6).map((t) => ({ id: `tf_${t.id}`, tipo: "tarefa" as const, titulo: t.titulo, sub: "Tarefa", href: "/central/tarefas", icon: "checklist" })),
              ]}
              // Sem sessão a rota de busca devolve 401 — a camada local prova
              // sozinha o agrupamento, o teclado e o desenho da lista.
              podeBuscarPessoas={false} podeBuscarEstoque={false} podeBuscarPedidos={false}
            />
          )}
      </div>
    );
    return (
      <Shell nav={navFor("admin")} modules={modules} name="Teste" role="admin">
        {(ws === "central" || ws === "tarefas" || ws === "solicitacoes") && central}
        {ws === "atividades" && <AtividadesClient colaboradores={COLABORADORES} initial={ATIVIDADES} roleLabel="Administrador" />}
        {ws === "minhas" && <MinhasAtividadesClient initial={ATIVIDADES} pool={POOL} />}
        {ws === "historico" && (
          <Historico lista={ATIVIDADES_HISTORICO} canceladas={CANCELADAS_HISTORICO}
            colaboradores={COLABORADORES} itens={[]} modelos={[]} podeAtribuir />
        )}
      </Shell>
    );
  }

  // Telas que buscam os próprios dados: sem sessão as chamadas falham e elas
  // caem no estado de erro/vazio. Serve mesmo assim — cabeçalho, abas, filtros e
  // barra de ações são justamente onde moram os defeitos de celular, e esses
  // renderizam de qualquer jeito.
  if (ws === "painel-tv") {
    const { AdministracaoClient } = await import("../(plataforma)/administracao/AdministracaoClient");
    return (
      <Shell nav={navFor("admin")} modules={modules} name="Teste" role="admin" podeAvisar>
        <AdministracaoClient perms={{ paineis: true }} />
      </Shell>
    );
  }

  // "A produção de verdade" (/atividades/historico). A tela nasce com o primeiro
  // período vindo do SERVIDOR e o rastro vem por `fetch` — sem sessão as duas
  // pontas falham e a prova mediria o estado de erro, que é o único sem tabela
  // nem árvore. Com dados falsos as duas abas desenham por inteiro.
  if (ws === "producao") {
    const { HistoricoProducaoClient } = await import("../(plataforma)/atividades/historico/HistoricoProducaoClient");
    const { RedeFalsa } = await import("./RedeFalsa");
    const { TEMPOS_PROVA, RASTRO_PROVA } = await import("./telas-producao");
    return (
      <Shell nav={navFor("admin")} modules={modules} name="Teste" role="admin">
        <RedeFalsa mapa={{
          "/api/atividades/genealogia": RASTRO_PROVA as unknown as Record<string, unknown>,
          "/api/atividades/tempos": TEMPOS_PROVA as unknown as Record<string, unknown>,
        }}>
          <HistoricoProducaoClient inicial={TEMPOS_PROVA} />
        </RedeFalsa>
      </Shell>
    );
  }

  if (ws === "operacao") {
    const { VisaoGeralOperacao } = await import("../(plataforma)/operacao/geral/VisaoGeralOperacao");
    const { DADOS_OPERACAO_PROVA } = await import("./prova-operacao-geral");
    return (
      <Shell nav={navFor("admin")} modules={modules} name="Teste" role="admin">
        <VisaoGeralOperacao dados={DADOS_OPERACAO_PROVA} />
      </Shell>
    );
  }

  if (ws === "logistica") {
    const { LogisticaTela } = await import("../(plataforma)/logistica/LogisticaClient");
    const { SNAP_LOGISTICA_PROVA } = await import("./prova-logistica");
    return (
      <Shell nav={navFor("admin")} modules={modules} name="Teste" role="admin">
        <LogisticaTela snap={SNAP_LOGISTICA_PROVA} />
      </Shell>
    );
  }

  if (ws === "ponto") {
    const { PontoPanel } = await import("../(plataforma)/administracao/PontoPanel");
    const { RedeFalsa } = await import("./RedeFalsa");
    const { PONTO_STATUS, PONTO_PESSOAS, PONTO_REGISTROS, BANCO_HORAS } = await import("./telas");
    return (
      <Shell nav={navFor("admin")} modules={modules} name="Teste" role="admin">
        <RedeFalsa mapa={{ "/api/ponto/status": PONTO_STATUS, "/api/ponto/pessoas": PONTO_PESSOAS, "/api/ponto/registros": PONTO_REGISTROS, "/api/ponto/banco-horas": BANCO_HORAS }}>
          <PontoPanel />
        </RedeFalsa>
      </Shell>
    );
  }

  if (ws === "banco-horas" || ws === "vendas" || ws === "comercial" || ws === "estoque" || ws === "analytics" || ws === "impressao" || ws === "contatos" || ws === "templates") {
    const { MeuPontoClient } = await import("../(plataforma)/meu-ponto/MeuPontoClient");
    const { VendasClient } = await import("../(plataforma)/vendas/VendasClient");
    const { ComercialClient } = await import("../(plataforma)/comercial/ComercialClient");
    // O `ProvaEstoque` monta o `EstoqueTabs` (e não o `CatalogoClient` puro): é
    // ele que a página monta de verdade, e é dele que vem o <h1>. Montar o
    // client puro dá uma tela sem título — um "defeito" que só existe na prova.
    const { ProvaEstoque } = await import("./ProvaEstoque");
    // A impressão fica FORA do `ProvaEstoque` porque ela não é uma aba do
    // Estoque — é rota própria (`/estoque/impressao`). Montá-la aqui é o que
    // permite medir a única tela do módulo cujo conteúdo tem largura FÍSICA: a
    // etiqueta de 72mm não encolhe pra caber num celular de 320px.
    const { ProvaImpressao } = await import("./ProvaImpressao");
    // O Analytics inteiro, não uma aba dele: o que esta prova precisa mostrar é
    // que o título e a fileira de abas ficam de pé mesmo com o dado ainda
    // carregando — antes eles nasciam DENTRO de cada aba e sumiam junto.
    const { AnalyticsClient } = await import("../(plataforma)/analytics/AnalyticsClient");
    const { CentralTabs } = await import("../(plataforma)/central/CentralTabs");
    const { RedeFalsa } = await import("./RedeFalsa");
    const { ContatosClient } = await import("../(plataforma)/tridiflow/contatos/ContatosClient");
    const { TemplatesClient } = await import("../(plataforma)/tridiflow/templates/TemplatesClient");
    const { BANCO_HORAS, LEADS_TRIDIFLOW } = await import("./telas");
    return (
      <Shell nav={navFor("admin")} modules={modules} name="Teste" role="admin">
        {/* Com a rede falsa a tela monta com CRÉDITO em aberto — é a única
            forma de provar no celular o botão de pagar horas, a régua e o
            extrato, que não existem quando o saldo está zerado. Como admin (sem
            `soMeu`) ela abre na equipe: tocar na pessoa leva ao detalhe. */}
        {ws === "banco-horas" && (
          <RedeFalsa mapa={{ "/api/ponto/banco-horas": BANCO_HORAS }}>
            <CentralTabs rotaDeProva="/central/banco-horas" />
            <MeuPontoClient isAdmin nome="Teste" />
          </RedeFalsa>
        )}
        {ws === "vendas" && <VendasClient views={[]} period={DEFAULT_PERIOD} />}
        {ws === "comercial" && <ComercialClient initial={[]} perms={{ pedidos: true, historico: true, carteira: true, leads: true }} canDash canCanais />}
        {ws === "analytics" && <AnalyticsClient canVendas canEmpresa canTrafego views={[]} />}
        {/* Estoque não recebe props — busca sozinho. Sem a rede falsa a tela
            fica presa em "Carregando…" e o conteúdo (que é onde estão os
            defeitos de celular) nunca aparece.

            As SETE abas entram no mapa, não só `/api/estoque`: cada uma busca
            numa rota própria e, sem resposta, todas caíam no mesmo estado vazio
            de uma linha. Catálogo sem card, Conferir sem fila, Recebimento sem
            KPI: a prova passava porque não havia nada pra estourar a largura.

            A rede e as abas moram no `ProvaEstoque` (cliente) porque importar
            planilha e classificar em lote são POST, e os handlers que os
            simulam são FUNÇÕES — função não atravessa a fronteira servidor →
            cliente como prop. */}
        {ws === "estoque" && <ProvaEstoque />}
        {ws === "impressao" && <ProvaImpressao />}
        {/* Contatos busca sozinho e é a tela onde o lead é TRABALHADO: sem a
            rede falsa a prova abriria vazia, e é justamente a fileira de
            filtros (com o botão "Recuperar") e o painel do lead (com os cinco
            botões de estágio) que precisam caber em 320px.
            `crm: true` liga os controles — é o estado depois de rodar
            supabase/tridiflow-leads-crm.sql, que é o que se quer medir. */}
        {ws === "contatos" && (
          <RedeFalsa mapa={{ "/api/tridiflow/leads": { crm: true, leads: LEADS_TRIDIFLOW } }}>
            <ContatosClient />
          </RedeFalsa>
        )}
        {/* Templates não busca nada: o catálogo é estático. O que precisa ser
            medido aqui é a fileira de abas por tipo (rola de lado) e o card,
            que tem mini-fluxo em linha única — o candidato natural a estourar
            a largura em 320px. */}
        {ws === "templates" && <TemplatesClient />}
      </Shell>
    );
  }

  // Workspaces: o Shell some por completo e quem manda é o rail do próprio app
  // (`.ws-rail`, que no celular vira faixa horizontal). É outro conjunto de
  // regras de celular, nunca exercitado por este banco de provas.
  if (ws === "trafego" || ws === "flow") {
    const { TrafegoClient } = await import("../(plataforma)/trafego/TrafegoClient");
    const { TridiflowShell } = await import("../(plataforma)/tridiflow/TridiflowShell");
    const { TODAS_AS_CHAVES } = await import("../(plataforma)/tridiflow/abas");
    const { DashboardClient } = await import("../(plataforma)/tridiflow/DashboardClient");
    if (ws === "trafego") return <TrafegoClient userId="dev" podeGerenciar />;
    return (
      <TridiflowShell name="Teste" role="admin" photoUrl={null} keys={TODAS_AS_CHAVES}>
        <DashboardClient />
      </TridiflowShell>
    );
  }

  // O Financeiro é área RESTRITA: as telas ficam atrás de `requireFinanceiro()`
  // e não montam sem sessão. O que precisa de medida no celular, porém, é o
  // KIT — toda tela do módulo desenha com as mesmas peças —, e ele monta com
  // dados falsos. Aqui se mede o rail virando faixa, a fileira de KPI virando
  // carrossel, a tabela de 6 colunas virando card e o seletor de empresa, cuja
  // folha nasce dentro de uma faixa de 44px se não for portada pro <body>.
  if (ws?.startsWith("financeiro")) {
    const { FinanceiroShell } = await import("../(plataforma)/financeiro/FinanceiroShell");
    const { ProvaFinanceiro, ProvaFinanceiroAuditoria, ProvaFinanceiroKitNovo,
            ProvaFinanceiroRecorrencias, ProvaFinanceiroContas,
            ProvaFinanceiroFolha, ProvaFinanceiroCompras, ProvaFinanceiroNotas,
            ProvaFinanceiroPatrimonio, ProvaFinanceiroFornecedores, ProvaFinanceiroContatos,
            ProvaFinanceiroConfiguracoes, ProvaFinanceiroGeral } = await import("./ProvaFinanceiro");
    const { default: CarregandoFinanceiro } = await import("../(plataforma)/financeiro/loading");
    // `podeVerFolha={false}` na prova da auditoria de propósito: é o estado que
    // precisa de olho — o detalhe da linha de colaborador some, e a coluna não
    // pode ficar com um buraco sem explicação.
    const dentro = ws === "financeiro-auditoria" ? <ProvaFinanceiroAuditoria />
      : ws === "financeiro-kit" ? <ProvaFinanceiroKitNovo />
      : ws === "financeiro-recorrencias" ? <ProvaFinanceiroRecorrencias />
      : ws === "financeiro-contas" ? <ProvaFinanceiroContas />
      : ws === "financeiro-folha" ? <ProvaFinanceiroFolha />
      : ws === "financeiro-compras" ? <ProvaFinanceiroCompras />
      : ws === "financeiro-notas" ? <ProvaFinanceiroNotas />
      : ws === "financeiro-patrimonio" ? <ProvaFinanceiroPatrimonio />
      : ws === "financeiro-fornecedores" ? <ProvaFinanceiroFornecedores />
      : ws === "financeiro-contatos" ? <ProvaFinanceiroContatos />
      : ws === "financeiro-configuracoes" ? <ProvaFinanceiroConfiguracoes />
      : ws === "financeiro-geral" ? <ProvaFinanceiroGeral />
      : ws === "financeiro-carregando" ? <CarregandoFinanceiro />
      : <ProvaFinanceiro />;
    return (
      <FinanceiroShell
        name="Teste" role="admin" photoUrl={null}
        empresas={[
          { id: "e1", slug: "tridi", nome: "Tridi", cnpj: "12.345.678/0001-90", ordem: 1, ativa: true },
          { id: "e2", slug: "gedux", nome: "Gedux", cnpj: "98.765.432/0001-10", ordem: 2, ativa: true },
        ]}
        empresaAtiva={{ id: "e1", slug: "tridi", nome: "Tridi", cnpj: "12.345.678/0001-90", ordem: 1, ativa: true }}
        poderes={{ ver: true, compromissos: true, compras: true, notas: true, patrimonio: true, cadastros: true, pagar: true, contas: true, folha: true, config: true, acessos: true }}
        schemaPendente={false}
      >
        {dentro}
      </FinanceiroShell>
    );
  }

  if (ws === "market") {
    return (
      <TridiMarketShell name="Teste" role="admin" photoUrl={null}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Rail do workspace</h1>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {["A", "B", "C", "D"].map((n) => <div key={n} className="glass" style={{ padding: 16, borderRadius: 14 }}>{n}</div>)}
        </div>
      </TridiMarketShell>
    );
  }

  // A barra do banco de provas é montada por CHAVES, e não por papel: o
  // Financeiro é área restrita e não vem de papel nenhum, então `navFor("admin")`
  // nunca o mostraria — a prova mediria uma barra que ninguém tem.
  return (
    <Shell nav={navForKeys([...MODULES.map((m) => m.key)])} modules={modules} name="Teste" role="admin">
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 14 }}>Banco de provas — mobile</h1>

      <ProvaControles />
      <ProvaKit />

      <ProvaDataList />

      <div id="g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        <div className="glass" style={{ padding: 16, borderRadius: 14 }}>A</div>
        <div className="glass" style={{ padding: 16, borderRadius: 14 }}>B</div>
        <div className="glass" style={{ padding: 16, borderRadius: 14 }}>C</div>
      </div>

      <div id="g6" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 14 }}>
        {["1", "2", "3", "4", "5", "6"].map((n) => <div key={n} className="glass" style={{ padding: 12, borderRadius: 12 }}>{n}</div>)}
      </div>

      <div id="gauto" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12, marginBottom: 14 }}>
        <div className="glass" style={{ padding: 16, borderRadius: 14 }}>auto-fit 320</div>
        <div className="glass" style={{ padding: 16, borderRadius: 14 }}>auto-fit 320</div>
      </div>

      <div id="flexlongo" style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <div className="glass" style={{ padding: 14, borderRadius: 12 }}>Pseudopseudohipoparatireoidismo-XYZ-0123456789</div>
      </div>

      <form id="form" style={{ display: "grid", gap: 10, marginBottom: 14 }}>
        <input id="inp" placeholder="Campo de texto" style={{ fontSize: 12, padding: "6px 10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
        <button id="btnicone" type="button" style={{ width: 24, height: 24, padding: 0, border: "1px solid var(--border)", borderRadius: 8, background: "transparent" }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" /></svg>
        </button>
      </form>

      <table id="tab" style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>{["Coluna A muito longa", "Coluna B muito longa", "Coluna C muito longa", "Coluna D muito longa"].map((c) => (
            <td key={c} style={{ padding: 10, minWidth: 180, border: "1px solid var(--border)" }}>{c}</td>
          ))}</tr>
        </tbody>
      </table>
    </Shell>
  );
}
