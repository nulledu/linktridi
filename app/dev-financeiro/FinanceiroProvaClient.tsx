"use client";

// As peças de ESCRITA do Financeiro, fora do login.
//
// O que se prova aqui: o campo de foto aparece com o botão certo, o "Remover"
// existe quando há imagem, e o botão de apagar chama a rota. É deliberadamente
// pouco: cada peça montada uma vez, do jeito que a tela real a monta.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAbrirFechar } from "../(plataforma)/ui/micro";
import { travarRolagem } from "../(plataforma)/ui/travaRolagem";
import { PainelLateral } from "../(plataforma)/ui/controles";
import { ContatosClient } from "../(plataforma)/financeiro/cadastros/contatos/ContatosClient";
import { BotaoApagar, BotaoFin, CampoMarca, Cartao, Escolha, Filtro, FiltroPeriodo, Filtros, Marca, TituloCartao, LinhaKpi, FaixaDePaineis } from "../(plataforma)/financeiro/ui";
import { hojeISO } from "../../lib/financeiro/calculos";
import { mesRelativo, noMes, rotuloDoMes } from "../../lib/financeiro/periodo";
import { PorBanco, type ItemAPagar } from "../(plataforma)/financeiro/cadastros/contas/PorBanco";
import { Agenda, BotaoLargo, CartaoEmpresa, Etiqueta, FileiraDeAbas, KpiSeta, PainelRolante, TrocaDeVisao, VerTudo } from "../(plataforma)/financeiro/blocos";
import { DesfazerAviso } from "../(plataforma)/ui/Desfazer";
import type { Conta } from "../../lib/financeiro/tipos";

/** Duas empresas com o MESMO banco: têm que sair como duas coisas. */
const CONTAS_DE_PROVA: Conta[] = [
  { id: "itau-t", empresa_id: "tridi", nome: "Itaú", tipo: "banco", instituicao: "Itaú Unibanco", saldo_inicial: 0, saldo: 18240.5, inclui_no_saldo: true, ativa: true, cor: null, ordem: 0, responsavel_id: null, limite: null, usado: null, disponivel: null, conta_mae_id: null, bandeira: null, final: null, agencia: null, numero: null },
  { id: "cartao-t", empresa_id: "tridi", nome: "Itaú Black", tipo: "cartao", instituicao: "Itaú Unibanco", saldo_inicial: 0, saldo: -3200, inclui_no_saldo: false, ativa: true, cor: null, ordem: 1, responsavel_id: null, limite: 20000, usado: 3200, disponivel: 16800, conta_mae_id: "itau-t", bandeira: "Mastercard", final: "4412", agencia: null, numero: null },
  { id: "itau-g", empresa_id: "gedux", nome: "Itaú", tipo: "banco", instituicao: "Itaú Unibanco", saldo_inicial: 0, saldo: 2050, inclui_no_saldo: true, ativa: true, cor: null, ordem: 0, responsavel_id: null, limite: null, usado: null, disponivel: null, conta_mae_id: null, bandeira: null, final: null, agencia: null, numero: null },
  { id: "solto-g", empresa_id: "gedux", nome: "Nubank PJ", tipo: "cartao", instituicao: "Nubank", saldo_inicial: 0, saldo: -900, inclui_no_saldo: false, ativa: true, cor: null, ordem: 2, responsavel_id: null, limite: 5000, usado: 4700, disponivel: 300, conta_mae_id: null, bandeira: "Mastercard", final: "0199", agencia: null, numero: null },
];
const ITENS_DE_PROVA = (hoje: string): ItemAPagar[] => [
  { id: "a", conta_id: "cartao-t", descricao: "Google Workspace", vencimento: `${hoje.slice(0, 7)}-05`, valor: 412.9, atrasado: `${hoje.slice(0, 7)}-05` < hoje, previsto: false },
  { id: "b", conta_id: "cartao-t", descricao: "Meta Ads", vencimento: `${hoje.slice(0, 7)}-20`, valor: 2790, atrasado: false, previsto: true },
  { id: "c", conta_id: "itau-t", descricao: "Aluguel do galpão", vencimento: `${hoje.slice(0, 7)}-10`, valor: 8000, atrasado: `${hoje.slice(0, 7)}-10` < hoje, previsto: false },
  { id: "d", conta_id: "solto-g", descricao: "Hospedagem VPS", vencimento: `${hoje.slice(0, 7)}-15`, valor: 189, atrasado: false, previsto: false },
];

/** Lista longa o bastante para a busca aparecer sozinha (limiar: 8). */
const CATEGORIAS = ["Software", "Aluguel", "Internet", "Serviços", "Impostos",
  "Colaboradores", "Marketing", "Matéria-prima", "Outros"];

const UM_UUID = "00000000-0000-4000-8000-000000000001";

function Bloco({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <Cartao style={{ marginBottom: 16 }}>
      <TituloCartao icone="photo">{titulo}</TituloCartao>
      {nota && <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>{nota}</p>}
      {children}
    </Cartao>
  );
}

export function FinanceiroProvaClient() {
  // Período: as setas andam de mês em mês e o seletor mostra o mês como a pessoa fala.
  const [periodo, setPeriodo] = useState(() => mesRelativo(hojeISO(), 0));
  const [eco, setEco] = useState<string[]>([]);
  const [modal, setModal] = useState(false);
  const [painel, setPainel] = useState(false);
  const [f1, setF1] = useState("");
  const [f2, setF2] = useState("");
  const [enviado, setEnviado] = useState("");
  const [rel, setRel] = useState("");
  const [criados, setCriados] = useState<{ id: string; nome: string; grupo: string }[]>([]);
  const [aba, setAba] = useState<"todas" | "abertas" | "pagas" | "atrasadas" | "canceladas">("todas");
  const [visao, setVisao] = useState<"cartoes" | "tabela">("cartoes");
  const [pago, setPago] = useState(0);

  // Intercepta as chamadas do módulo para MOSTRAR o corpo em vez de mandá-lo.
  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (entrada, init) => {
      const url = String(typeof entrada === "string" ? entrada : (entrada as Request).url ?? entrada);
      if (url.includes("/api/financeiro/")) {
        const corpo = init?.body ? JSON.parse(String(init.body)) : null;
        setEnviado(`${init?.method ?? "GET"} ${url}\n\n${JSON.stringify(corpo, null, 2)}`);
        return new Response(JSON.stringify({ ok: true, id: "c1" }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      return original(entrada, init);
    };
    return () => { window.fetch = original; };
  }, []);
  const anotar = (t: string) => setEco((e) => [`${e.length + 1}. ${t}`, ...e].slice(0, 12));

  return (
    <main className="tf-scope" style={{ padding: "24px 16px 80px", maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Financeiro — banco de provas</h1>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 22, lineHeight: 1.6 }}>
        As peças de escrita, sem login. As chamadas vão para as rotas de verdade.
      </p>

      <Bloco
        titulo="Foto — registro que JÁ existe"
        nota="Com imagem: tem de aparecer “Trocar foto” E “Remover”. Sem imagem: só “Escolher foto”."
      >
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>com imagem</p>
            <CampoMarca
              tipo="conta" id={UM_UUID} nome="Itaú"
              logo="https://placehold.co/96x96/png" icone="wallet" cor="#EC7000"
              aoTrocar={() => anotar("conta com imagem: aoTrocar()")}
            />
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>sem imagem</p>
            <CampoMarca
              tipo="conta" id={UM_UUID} nome="Inter" logo={null} icone="wallet" cor="#FF7A00"
              aoTrocar={() => anotar("conta sem imagem: aoTrocar()")}
            />
          </div>
        </div>
      </Bloco>

      <Bloco
        titulo="Foto — cadastro NOVO (registro ainda não existe)"
        nota="A foto é escolhida antes de salvar e sobe junto com o cadastro. A prévia é local."
      >
        <CampoMarca
          tipo="contato" id={null} nome="Encanador" logo={null} icone="user" cor={null}
          aoTrocar={() => anotar("novo: aoTrocar()")}
          aoEscolherPendente={(f) => anotar(f ? `pendente: ${f.name} (${Math.round(f.size / 1024)} KB)` : "pendente: limpo")}
        />
      </Bloco>

      <Bloco titulo="Apagar" nota="Pergunta antes, nomeia o registro, e a recusa do servidor chega inteira.">
        <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
          <BotaoApagar tipo="conta" id={UM_UUID} nome="Itaú" aoApagar={() => anotar("conta apagada")} />
          <BotaoApagar tipo="patrimonio" id={UM_UUID} nome="Notebook Dell" aoApagar={() => anotar("bem apagado")} />
          <BotaoApagar tipo="recorrencia" id={UM_UUID} nome="Aluguel" aoApagar={() => anotar("recorrência apagada")} />
          <BotaoApagar tipo="empresa" id={UM_UUID} nome="Tridi" aoApagar={() => anotar("empresa apagada")} />
        </div>
      </Bloco>

      <Bloco titulo="Marca — como a imagem é enquadrada" nota="Sem barra branca em volta: a foto preenche o quadrado.">
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <Marca marca={{ nome: "Alta", logo: "https://placehold.co/64x160/png" }} tamanho={52} raio={13} />
          <Marca marca={{ nome: "Larga", logo: "https://placehold.co/240x60/png" }} tamanho={52} raio={13} />
          <Marca marca={{ nome: "Quadrada", logo: "https://placehold.co/96x96/png" }} tamanho={52} raio={13} />
          <Marca marca={{ nome: "Sem foto", icone: "building-warehouse", cor: "var(--indigo)" }} tamanho={52} raio={13} />
        </div>
      </Bloco>

      {/* O modal do patrimônio, com as MESMAS classes, para medir onde o
          clique cai. "Não consigo clicar em quase nada dentro desse pop up"
          não se diagnostica lendo CSS: `.t-modal` nasce com
          `pointer-events: none` e depende de `is-open` chegar. */}
      <Bloco titulo="Modal — o clique chega nos campos?" nota="Abre o modal e roda a medição pelo console.">
        <BotaoFin icone="package" onClick={() => setModal(true)}>Abrir modal de prova</BotaoFin>
      </Bloco>

      {/* A TELA DE CONTATOS DE VERDADE, com o `fetch` interceptado.
          Três correções de "não salva" passaram porque eu testava servidor e
          rota — as duas certas. O que nunca tinha sido olhado é o CORPO que o
          formulário produz ao editar. Aqui ele aparece na tela. */}
      <Bloco titulo="Contatos — o que o formulário ENVIA ao editar" nota="Abra um contato, mude um campo, salve. O corpo aparece abaixo.">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ maxHeight: 460, overflow: "auto", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
            <ContatosClient
              empresaId="e1"
              empresaNome="TridiXP"
              podeEscrever
              schemaPendente={false}
              logos={{}}
              lista={[{
                id: "c1", empresa_id: "e1", nome: "Packit", natureza: "empresa",
                papeis: ["contato"], ativo: true,
                telefone: "11 4538-5909", telefones: ["11 4538-5909"],
                email: "contato@packit.com", site: null, endereco: null, observacao: null,
                categoria: null, categorias: [], cargo: null, organizacao: null,
                organizacao_id: null, cnpj: null, logo_url: null, icone: null,
                fornecedor: null,
              } as never]}
            />
          </div>
          <pre style={{
            margin: 0, padding: 12, borderRadius: 10, background: "var(--surface-2)",
            fontSize: 11.5, lineHeight: 1.5, overflow: "auto", maxHeight: 260, whiteSpace: "pre-wrap",
          }}>{enviado || "— nada enviado ainda —"}</pre>
        </div>
      </Bloco>

      <Bloco titulo="Escolher — e criar o que não existe" nota="Digite um nome que não está na lista: aparece “Criar”.">
        <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
          <Escolha
            valor={rel}
            vazio="Sem relacionado"
            placeholder="Buscar pessoa, empresa ou fornecedor…"
            aoEscolher={setRel}
            rotuloCriar="Criar contato"
            aoCriar={async (nome) => {
              const id = `novo:${nome}`;
              setCriados((c) => [...c, { id, nome, grupo: "Criados agora" }]);
              return id;
            }}
            opcoes={[
              { id: "1", nome: "Madeiranit Bauru", grupo: "Fornecedores" },
              { id: "2", nome: "Packit", grupo: "Fornecedores" },
              ...criados,
            ]}
          />
          <p style={{ fontSize: 12, color: "var(--text-dim)" }} data-prova="escolhido">Escolhido: {rel || "—"}</p>
        </div>
      </Bloco>

      <Bloco titulo="Filtros" nota="A peça que aparece em todas as telas. Lista curta abre sem busca; longa, com.">
        <Filtros>
          <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} hoje={hojeISO()}
            atalhos={[{ valor: "7", label: "Próximos 7 dias" }, { valor: "vencidos", label: "Já vencidos" }]} />
          <Filtro rotulo="Situação" valor={f1} aoMudar={setF1}
            opcoes={[{ valor: "pendente", label: "Pendente" }, { valor: "pago", label: "Pago" }, { valor: "cancelado", label: "Cancelado" }]} />
          <Filtro rotulo="Categoria" valor={f2} aoMudar={setF2}
            opcoes={CATEGORIAS.map((c) => ({ valor: c, label: c }))} />
        </Filtros>
        <p data-periodo={periodo} style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
          Período: <strong>{rotuloDoMes(periodo, hojeISO())}</strong> ({periodo})
        </p>
      </Bloco>

      <Bloco titulo="Números com seta, agenda e cartão de empresa" nota="As peças novas das telas. A seta do número filtra a tela de verdade; a agenda carimba a data.">
        <div data-blocos-novos style={{ display: "grid", gap: 16 }}>
          <LinhaKpi>
            <KpiSeta icone="hourglass-high" rotulo="A pagar" valor="R$ 104.395,00" detalhe="5 contas, previstas incluídas"
              aoAbrir={() => setEco((e) => ["kpi: a pagar", ...e])} />
            <KpiSeta icone="circle-check" rotulo="Pagos" valor="R$ 10.534,40" tom="ok" detalhe="12 compromissos quitados"
              aoAbrir={() => setEco((e) => ["kpi: pagos", ...e])} />
            <KpiSeta icone="alert-triangle" rotulo="Atrasados" valor="R$ 0,00" tom="ok" detalhe="Nenhum compromisso" />
            <KpiSeta icone="refresh" rotulo="Previstos" valor="R$ 4.395,00" detalhe="Ainda não lançados"
              aoAbrir={() => setEco((e) => ["kpi: previstos", ...e])} />
          </LinhaKpi>

          <div data-faixa-prova>
          <FaixaDePaineis largura={190}>
            <Cartao>
              <TituloCartao icone="chart-bar">Por categoria</TituloCartao>
              <div style={{ display: "grid", gap: 13 }}>
                {["Software", "Outros", "Serviços", "Impostos", "Aluguel", "Internet/Telefonia"].map((n, k) => (
                  <div key={n} style={{ display: "grid", gap: 5, fontSize: 12.5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span>{n}</span><strong>R$ {(100200 - k * 15000).toLocaleString("pt-BR")}</strong>
                    </div>
                    <span style={{ height: 7, borderRadius: 999, background: "var(--surface-2)", display: "block" }} />
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-dim)" }}>
                É este cartão que decide a altura da fileira; o da direita copia e rola por dentro.
              </p>
            </Cartao>
            <Cartao>
              <TituloCartao icone="chart-pie">Médio</TituloCartao>
              <div style={{ display: "grid", gap: 8 }}>
                {["Serviços", "Outros", "Software"].map((n) => (
                  <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span>{n}</span><strong>R$ 1.000,00</strong>
                  </div>
                ))}
              </div>
            </Cartao>
            <PainelRolante
              icone="calendar-event"
              titulo="Próximos vencimentos"
              direita={<VerTudo href="/dev-financeiro" />}
              rodape={<BotaoLargo href="/dev-financeiro">Ver todas as cobranças</BotaoLargo>}
            >
              <Agenda
                itens={Array.from({ length: 14 }, (_, k) => ({
                  chave: `v${k}`,
                  vencimento: `${hojeISO().slice(0, 7)}-${String((k % 28) + 1).padStart(2, "0")}`,
                  titulo: `Cobrança número ${k + 1}`,
                  sub: "Serviços",
                  valor: 500 + k * 37,
                  aoAbrir: () => setEco((e) => [`agenda: item ${k + 1}`, ...e]),
                }))}
              />
            </PainelRolante>
          </FaixaDePaineis>
          </div>
        </div>
      </Bloco>

      <Bloco
        titulo="Movimento — abas, visão e desfazer"
        nota="A pílula viaja entre as abas (e rola junto no celular). “Pagar” mostra o aviso com o tempo visível: ponteiro em cima pausa a barra."
      >
        <div data-movimento style={{ display: "grid", gap: 14 }}>
          <FileiraDeAbas
            valor={aba}
            aoTrocar={setAba}
            abas={[
              { id: "todas", label: "Todas", icone: "list", contagem: 42 },
              { id: "abertas", label: "Em aberto", icone: "hourglass-high", contagem: 18 },
              { id: "pagas", label: "Pagas", icone: "circle-check", contagem: 21 },
              { id: "atrasadas", label: "Atrasadas", icone: "alert-triangle", contagem: 3 },
              { id: "canceladas", label: "Canceladas", icone: "ban" },
            ]}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <TrocaDeVisao
              valor={visao}
              aoTrocar={setVisao}
              opcoes={[{ id: "cartoes", icone: "layout-grid", titulo: "Cartões" }, { id: "tabela", icone: "table", titulo: "Tabela" }]}
            />
            <BotaoFin primario icone="cash" onClick={() => setPago((n) => n + 1)}>Pagar (prova)</BotaoFin>
          </div>
        </div>
      </Bloco>
      {pago > 0 && (
        <DesfazerAviso
          key={pago}
          tom="ok"
          icone="circle-check"
          titulo="Pagamento registrado"
          detalhe="Aluguel do galpão · R$ 8.000,00"
          aoDesfazer={() => { anotar("desfazer pagamento"); return true; }}
          aoSumir={() => setPago(0)}
        />
      )}

      <Bloco titulo="Bancos por empresa — cartões dentro do banco e o que há pra pagar" nota="O mesmo Itaú em duas empresas sai como duas contas. Cartão sem banco fica num bloco próprio.">
        <div data-por-banco>
          <PorBanco
            contas={CONTAS_DE_PROVA}
            itens={ITENS_DE_PROVA(hojeISO()).filter((i) => noMes(periodo, i.vencimento))}
            atrasadosFora={[{ id: "z", conta_id: "itau-g", descricao: "DAS de julho", vencimento: "2026-07-20", valor: 1200, atrasado: true, previsto: false }]}
            hoje={hojeISO()}
            rotuloDoPeriodo={rotuloDoMes(periodo, hojeISO())}
            empresas={[{ id: "tridi", nome: "Tridi" }, { id: "gedux", nome: "Gedux" }]}
            geral
            logos={{}}
            podeEscrever
            aoAbrir={(c) => setEco((e) => [`abrir ${c.nome}`, ...e])}
            aoNovoCartao={(b) => setEco((e) => [`novo cartão em ${b.nome} (${b.empresa_id})`, ...e])}
            aoNovaConta={() => setEco((e) => ["nova conta", ...e])}
            aoPagarFatura={(c) => setEco((e) => [`pagar fatura ${c.nome}`, ...e])}
            aoAjustar={(c) => setEco((e) => [`ajustar ${c.nome}`, ...e])}
          />
        </div>
      </Bloco>

      <Bloco titulo="Painel centrado" nota="O mesmo PainelLateral, no meio da tela. No celular vira folha de baixo.">
        <BotaoFin icone="package" onClick={() => setPainel(true)}>Abrir painel centrado</BotaoFin>
      </Bloco>
      {painel && (
        <PainelLateral
          centrado
          titulo="Novo compromisso"
          subtitulo="A conta entra na agenda como pendente."
          soFechaNoX
          onFechar={() => setPainel(false)}
          rodape={<><BotaoFin onClick={() => setPainel(false)}>Fechar</BotaoFin><BotaoFin primario icone="check">Lançar</BotaoFin></>}
        >
          <div style={{ display: "grid", gap: 12 }} data-prova="corpo-painel">
            {["Descrição", "Valor", "Vencimento", "Categoria"].map((r) => (
              <label key={r} style={{ display: "grid", gap: 5, fontSize: 12.5 }}>
                {r}
                <input defaultValue="" placeholder={r} />
              </label>
            ))}
          </div>
        </PainelLateral>
      )}
      {modal && <ModalDeProva aoFechar={() => setModal(false)} />}

      <Cartao>
        <TituloCartao icone="file-text">O que aconteceu</TituloCartao>
        {eco.length === 0
          ? <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Nada ainda — clique em alguma coisa.</p>
          : <ul style={{ display: "grid", gap: 6, fontSize: 12.5, listStyle: "none" }}>
              {eco.map((l) => <li key={l} style={{ color: "var(--text-dim)" }}>{l}</li>)}
            </ul>}
      </Cartao>
    </main>
  );
}

/** O modal do patrimônio reduzido ao esqueleto: mesmas classes, mesmo portal. */
function ModalDeProva({ aoFechar }: { aoFechar: () => void }) {
  const { montado, classe } = useAbrirFechar(true);
  useEffect(() => travarRolagem(), []);
  if (!montado) return null;
  return createPortal(
    <div className={`fin-scope apple-backdrop ${classe}`.trim()} data-prova="veu">
      <form
        className={`apple-modal t-modal ${classe}`.trim()}
        data-prova="modal"
        role="dialog"
        aria-modal="true"
        onSubmit={(e) => e.preventDefault()}
        style={{ width: 620, maxWidth: "100%", borderRadius: "var(--r-md)", padding: 18, minWidth: 0 }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <h2 style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>Editar PAT0001</h2>
          <button type="button" data-prova="x" onClick={aoFechar} style={{ minHeight: 34, padding: "0 12px" }}>Fechar</button>
        </header>
        <div style={{ display: "grid", gap: 12 }}>
          <input data-prova="texto" defaultValue="Monitor Gamer" placeholder="Descrição" />
          <select data-prova="select" defaultValue="">
            <option value="">Sem responsável</option>
            <option value="1">Alguém</option>
          </select>
          <input data-prova="data" type="date" />
        </div>
      </form>
    </div>,
    document.body,
  );
}
