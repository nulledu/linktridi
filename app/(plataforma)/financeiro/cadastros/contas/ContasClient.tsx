"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../Icon";
import { toast } from "../../../Toast";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral } from "../../../ui/controles";
import { AvisoSchema, BotaoExportar, BotaoFin, Cabecalho, Cartao, Filtro, Filtros, LimparFiltros, LinhaKpi, ListaLateral, Marca, Rosca, Selo, SoLeitura, Tabela, TituloCartao, Vazio, SeletorEmpresa, CampoMarca, enviarMarca, BotaoApagar, Escolha, FiltroPeriodo, FaixaDePaineis, BuscaDaLista } from "../../ui";
import { Agenda, ColunasPorEmpresa, KpiSeta, PainelRolante, TrocaDeVisao, VerTudo } from "../../blocos";
import { PorBanco, type ItemAPagar } from "./PorBanco";
import { AReceberNoGateway, ehPagarme } from "./SaldoNoGateway";
import { ehMes, mesRelativo, noMes, rotuloDoMes } from "@/lib/financeiro/periodo";
import type { PrevisaoDaAgenda } from "@/lib/financeiro/previsoes";
import { centavos, dataBR, hojeISO, moeda } from "@/lib/financeiro/calculos";
import { numeroCSV } from "@/lib/financeiro/csv";
import {
  CONTA_TIPOS, ICONE_CONTA_TIPO, LABEL_CONTA_TIPO,
  type Compromisso, type Conta, type ContaTipo, type Movimento, type MovimentoTipo,
} from "@/lib/financeiro/tipos";

interface RascunhoConta {
  id: string | null;
  /** Em "Visão geral" a tela não tem empresa: a conta nova pergunta em qual nasce. */
  empresa_id: string;
  nome: string; tipo: ContaTipo; instituicao: string;
  saldo_inicial: string; inclui_no_saldo: boolean; ativa: boolean;
  /** Só de cartão: quanto aguenta, em qual banco mora, bandeira e 4 finais. */
  limite: string; conta_mae_id: string; bandeira: string; final: string;
  /** Agência e número — o que se copia na hora de receber. */
  agencia: string; numero: string;
}

interface Transferencia { de_id: string; para_id: string; valor: string; data: string; descricao: string }

interface Ajuste { conta_id: string; valor: string; motivo: string }

/**
 * `r.ok` sozinho já não mente: rota de API deste módulo nunca redireciona, e o
 * middleware devolve 401 em JSON — o que chega aqui é o erro escrito pela rota.
 */
async function chamar(url: string, metodo: "POST" | "PATCH", corpo: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(url, {
    method: metodo,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(dados.erro ?? "Não deu para salvar."));
  return dados;
}

const recado = (e: unknown) => (e instanceof Error ? e.message : "Não deu para salvar.");

const numero = (v: string) => Number(v.replace(",", ".")) || 0;

const novaConta = (): RascunhoConta => ({
  id: null, empresa_id: "", nome: "", tipo: "banco", instituicao: "",
  saldo_inicial: "", inclui_no_saldo: true, ativa: true,
  limite: "", conta_mae_id: "", bandeira: "", final: "",
  agencia: "", numero: "",
});

const daConta = (c: Conta): RascunhoConta => ({
  id: c.id, empresa_id: c.empresa_id, nome: c.nome, tipo: c.tipo, instituicao: c.instituicao ?? "",
  saldo_inicial: String(c.saldo_inicial), inclui_no_saldo: c.inclui_no_saldo, ativa: c.ativa,
  limite: c.limite == null ? "" : String(c.limite),
  conta_mae_id: c.conta_mae_id ?? "", bandeira: c.bandeira ?? "", final: c.final ?? "",
  agencia: c.agencia ?? "", numero: c.numero ?? "",
});

/** As bandeiras que circulam no Brasil. Lista, e não texto livre, para
 *  "Master", "Mastercard" e "MASTER" não virarem três cartões diferentes. */
const BANDEIRAS = ["Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"];

const SELO_ATIVA = { label: "Ativa", cor: "var(--ok)" };
const SELO_INATIVA = { label: "Inativa", cor: "var(--neutro)" };

/** A paleta da rosca, em ordem. Nove tons — nove fatias legíveis; a décima
 *  conta não ganharia cor própria, então a rosca mostra as maiores. */
const CORES_ROSCA = [
  "var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)",
  "var(--cat-6)", "var(--cat-7)", "var(--cat-8)", "var(--cat-9)",
];

const ICONE_MOVIMENTO: Record<MovimentoTipo, string> = {
  entrada: "trending-up",
  saida: "trending-down",
  transferencia: "arrows-split",
  ajuste: "adjustments-horizontal",
  reversao: "arrow-back-up",
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

export function ContasClient({
  empresas = [], empresaId, empresaNome, podeEscrever, lista, movimentos, pessoas, desde30, logos, schemaPendente,
  geral = false, hoje = hojeISO(), compromissos = [], previsoes = [],
}: {
  /** "Visão geral" ligada: a visão por banco reparte os blocos por empresa. */
  geral?: boolean;
  hoje?: string;
  /** Tudo em aberto, de qualquer data — a tela recorta pelo período. */
  compromissos?: Compromisso[];
  /** A próxima volta das recorrências, ainda não lançada. */
  previsoes?: PrevisaoDaAgenda[];
  /** As empresas liberadas — a conta diz em qual nasce quando a tela está em "Visão geral". */
  empresas?: { id: string; nome: string }[];
  empresaId: string;
  empresaNome: string;
  podeEscrever: boolean;
  lista: Conta[];
  movimentos: Movimento[];
  /** Só id e nome — vem vazio quando falta `financeiro:folha`. */
  pessoas: { id: string; nome: string }[];
  /** Começo da janela de 30 dias, calculado no servidor: se o cliente
   *  recalculasse com o próprio relógio, o número renderizado na hidratação
   *  sairia diferente do que o servidor mandou. */
  desde30: string;
  /** id da conta → link do logo, já assinado pelo servidor. */
  logos: Record<string, string>;
  schemaPendente: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [instituicao, setInstituicao] = useState("");
  const [situacao, setSituacao] = useState("");
  // A visão por banco é a que abre: cada banco com seus cartões e o que há
  // pra pagar em cada um no mês. A lista continua ali pra quem quer a tabela.
  const [visao, setVisao] = useState<"bancos" | "lista">("bancos");
  // Nasce no mês de hoje — padrão do módulo inteiro (set/2026).
  const [periodo, setPeriodo] = useState(() => mesRelativo(hoje, 0));
  const periodoPadrao = mesRelativo(hoje, 0);
  const [conta, setConta] = useState<RascunhoConta | null>(null);
  // A foto escolhida ANTES de a conta existir. Sobe logo depois do POST.
  const [fotoPendente, setFotoPendente] = useState<File | null>(null);
  const [transferencia, setTransferencia] = useState<Transferencia | null>(null);
  const [ajuste, setAjuste] = useState<Ajuste | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const ativas = useMemo(() => lista.filter((c) => c.ativa), [lista]);
  const saldoTotal = ativas.filter((c) => c.inclui_no_saldo).reduce((s, c) => s + c.saldo, 0);

  // Movimento revertido continua na tabela (extrato não se apaga), mas não
  // conta como saldo nem como "última atividade": o estorno que o desfez é um
  // movimento novo, mais recente, e é ele quem deve aparecer.
  const confirmados = useMemo(
    () => movimentos.filter((m) => m.status === "confirmado"),
    [movimentos],
  );

  // O mockup pedia "Recebíveis futuros". Este módulo NÃO tem contas a receber:
  // `fin_movimentos` só registra o que já entrou, e não existe previsão de
  // recebimento em lugar nenhum do schema. Um número fixo aqui seria invenção
  // com cara de dado, então o cartão conta o que é verdade — o dinheiro que
  // entrou nos últimos 30 dias — e o rótulo diz exatamente isso.
  const entradas30 = useMemo(
    () => centavos(
      confirmados
        .filter((m) => m.valor > 0 && m.ocorrido_em.slice(0, 10) >= desde30)
        .reduce((s, m) => s + m.valor, 0),
    ),
    [confirmados, desde30],
  );

  const ultimoDaConta = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const m of confirmados) {
      const atual = mapa.get(m.conta_id);
      if (!atual || m.ocorrido_em > atual) mapa.set(m.conta_id, m.ocorrido_em);
    }
    return mapa;
  }, [confirmados]);

  const nomePessoa = useMemo(() => new Map(pessoas.map((p) => [p.id, p.nome])), [pessoas]);

  // Devolvem "" quando não há nada, e não "—": o travessão é decisão da TELA.
  // No CSV ele viraria um caractere solto numa célula que deveria estar vazia,
  // e uma planilha com "—" não filtra nem soma.
  const responsavelDe = (c: Conta) =>
    (c.responsavel_id && nomePessoa.get(c.responsavel_id)) || "";

  const ultimaMovimentacaoDe = (c: Conta) => {
    const iso = ultimoDaConta.get(c.id);
    return iso ? quando(iso) : "";
  };

  // As opções saem do que EXISTE cadastrado, não de uma lista fixa: oferecer
  // "Stone" num filtro que devolve zero linhas faz a pessoa achar que a tela
  // quebrou.
  const opcoesInstituicao = useMemo(() => {
    const vistas = [...new Set(lista.map((c) => c.instituicao?.trim()).filter(Boolean))] as string[];
    return vistas.sort((a, b) => a.localeCompare(b, "pt-BR")).map((i) => ({ valor: i, label: i }));
  }, [lista]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((c) =>
      (!tipo || c.tipo === tipo) &&
      (!instituicao || (c.instituicao ?? "").trim() === instituicao) &&
      (!situacao || c.ativa === (situacao === "ativa")) &&
      (!q || c.nome.toLowerCase().includes(q) || (c.instituicao ?? "").toLowerCase().includes(q)));
  }, [lista, busca, tipo, instituicao, situacao]);

  const temFiltro = !!(tipo || instituicao || situacao || busca.trim());

  const limparFiltros = () => { setTipo(""); setInstituicao(""); setSituacao(""); setBusca(""); };

  // Só entra na rosca o que é dinheiro de verdade e positivo: conta fora do
  // caixa (cartão) e saldo negativo não são "parte de um total" — um arco de
  // valor negativo não existe, ele só encolheria as outras fatias em silêncio.
  const fatiasSaldo = useMemo(() => {
    const dentro = ativas
      .filter((c) => c.inclui_no_saldo && c.saldo > 0)
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, CORES_ROSCA.length);
    const soma = dentro.reduce((s, c) => s + c.saldo, 0);
    return dentro.map((c, i) => ({
      id: c.id, label: c.nome, cor: CORES_ROSCA[i], valor: c.saldo,
      proporcao: soma > 0 ? c.saldo / soma : 0,
    }));
  }, [ativas]);

  const somaDaRosca = fatiasSaldo.reduce((s, f) => s + f.valor, 0);

  const ultimas = useMemo(() => {
    const nome = new Map(lista.map((c) => [c.id, c.nome]));
    return [...confirmados]
      .sort((a, b) => b.ocorrido_em.localeCompare(a.ocorrido_em))
      .slice(0, 5)
      .map((m) => ({
        chave: m.id,
        icone: ICONE_MOVIMENTO[m.tipo] ?? "receipt",
        cor: m.valor < 0 ? "var(--perigo)" : "var(--ok)",
        titulo: `${nome.get(m.conta_id) ?? "Conta"} – ${m.descricao || "sem descrição"}`,
        sub: dataBR(m.ocorrido_em, { curta: true }),
        // O sinal na frente é o que separa "entrou" de "saiu" numa lista onde
        // as duas coisas convivem; a moeda sozinha só mostra o menos.
        valor: `${m.valor > 0 ? "+" : ""}${moeda(m.valor)}`,
        valorCor: m.valor < 0 ? "var(--perigo)" : "var(--ok)",
      }));
  }, [confirmados, lista]);

  const contaDoAjuste = ajuste ? lista.find((c) => c.id === ajuste.conta_id) ?? null : null;

  // O que há pra pagar, por conta, NO PERÍODO — lançado e previsto juntos. O
  // atrasado que cai fora do período não entra na lista, mas a tela avisa
  // dele em cada conta: esconder dívida por causa de um filtro de mês seria o
  // pior desfecho possível numa tela de dinheiro.
  const { itensAPagar, atrasadosFora, totalAPagar } = useMemo(() => {
    const todos: ItemAPagar[] = [
      ...compromissos
        .filter((c) => c.status !== "pago" && c.status !== "cancelado")
        .map((c) => ({
          id: c.id, conta_id: c.conta_id, descricao: c.descricao, vencimento: c.vencimento,
          valor: c.valor, atrasado: c.vencimento < hoje, previsto: false,
        })),
      ...previsoes.map((p) => ({
        id: p.id, conta_id: p.conta_id, descricao: p.descricao, vencimento: p.vencimento,
        valor: p.valor, atrasado: p.vencimento < hoje, previsto: true,
      })),
    ].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    const dentro = todos.filter((i) => noMes(periodo, i.vencimento));
    const fora = todos.filter((i) => i.atrasado && !noMes(periodo, i.vencimento) && !i.previsto);
    return {
      itensAPagar: dentro,
      atrasadosFora: fora,
      totalAPagar: centavos(dentro.filter((i) => i.conta_id).reduce((s, i) => s + i.valor, 0)),
    };
  }, [compromissos, previsoes, periodo, hoje]);
  const rotuloDoPeriodo = ehMes(periodo) ? rotuloDoMes(periodo, hoje) : "em aberto";
  /** Quantas contas têm alguma coisa pra pagar no período. */
  const contasComPagamento = new Set(itensAPagar.map((i) => i.conta_id).filter(Boolean)).size;
  const nomeDaConta = new Map(lista.map((c) => [c.id, c.nome]));

  /** Cartão novo já pendurado no banco: mesma empresa, mesma instituição, fora do caixa. */
  const novoCartaoEm = (banco: Conta) => {
    setErro("");
    setConta({
      ...novaConta(), tipo: "cartao", conta_mae_id: banco.id, empresa_id: banco.empresa_id,
      instituicao: banco.instituicao ?? "", inclui_no_saldo: false,
    });
  };
  const pagarFaturaDe = (c: Conta) => {
    setErro("");
    setTransferencia({
      de_id: c.conta_mae_id ?? "", para_id: c.id,
      valor: (c.usado ?? 0).toFixed(2), data: hojeISO(),
      descricao: `Fatura do cartão ${c.nome}`,
    });
  };

  async function salvarConta() {
    if (!conta) return;
    setSalvando(true);
    setErro("");
    try {
      const comum = {
        nome: conta.nome,
        tipo: conta.tipo,
        instituicao: conta.instituicao || null,
        inclui_no_saldo: conta.inclui_no_saldo,
        ativa: conta.ativa,
        agencia: conta.agencia || null,
        numero: conta.numero || null,
        // Os campos de cartão só fazem sentido em cartão. Mandá-los vazios
        // para uma conta corrente limpa qualquer resto de quando ela era
        // cartão — e é exatamente o que se quer ao trocar o tipo.
        limite: conta.tipo === "cartao" ? (conta.limite || null) : null,
        conta_mae_id: conta.tipo === "cartao" ? (conta.conta_mae_id || null) : null,
        bandeira: conta.tipo === "cartao" ? (conta.bandeira || null) : null,
        final: conta.tipo === "cartao" ? (conta.final || null) : null,
      };
      // `saldo_inicial` só vai no NASCIMENTO da conta. A rota recusa mudá-lo
      // depois, e com razão: reescrevê-lo move o saldo de hoje sem deixar linha
      // no extrato — a correção que existe é o ajuste, que lança um movimento.
      if (conta.id) await chamar(`/api/financeiro/contas/${conta.id}`, "PATCH", comum);
      else {
        const alvo = conta.empresa_id || empresaId;
        if (!alvo) { setErro("Escolha em qual empresa a conta nasce."); setSalvando(false); return; }
        const criada = await chamar("/api/financeiro/contas", "POST", {
          empresa_id: alvo, ...comum, saldo_inicial: numero(conta.saldo_inicial),
        });
        // A foto escolhida antes de salvar sobe agora, com o id. Falha aqui
        // NÃO desfaz o cadastro: a conta já existe, e a pessoa só precisa
        // tentar a foto de novo — não o cadastro inteiro.
        if (fotoPendente && typeof criada.id === "string") {
          const erroFoto = await enviarMarca("conta", criada.id, fotoPendente);
          if (erroFoto) toast.erro(`Conta salva, mas a foto não subiu: ${erroFoto}`);
        }
      }
      setFotoPendente(null);
      setConta(null);
      toast.ok("Conta salva.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSalvando(false);
    }
  }

  async function salvarTransferencia() {
    if (!transferencia) return;
    setSalvando(true);
    setErro("");
    try {
      await chamar("/api/financeiro/contas/transferir", "POST", {
        // A empresa é a da conta de ORIGEM, não a da tela: em "Visão geral" a
        // tela não tem uma, e a transferência já sabe de onde sai.
        empresa_id: lista.find((c) => c.id === transferencia.de_id)?.empresa_id ?? empresaId,
        de_id: transferencia.de_id,
        para_id: transferencia.para_id,
        valor: numero(transferencia.valor),
        data: transferencia.data,
        descricao: transferencia.descricao || undefined,
      });
      setTransferencia(null);
      toast.ok("Transferência registrada.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSalvando(false);
    }
  }

  async function salvarAjuste() {
    if (!ajuste) return;
    // A conta vai na URL: sem ela o endereço vira `/contas//ajustar` e a
    // resposta é um 404 que não explica nada a quem só esqueceu de escolher.
    if (!ajuste.conta_id) { setErro("Escolha a conta que vai receber o ajuste."); return; }
    setSalvando(true);
    setErro("");
    try {
      await chamar(`/api/financeiro/contas/${ajuste.conta_id}/ajustar`, "POST", {
        empresa_id: lista.find((c) => c.id === ajuste.conta_id)?.empresa_id ?? empresaId,
        valor: numero(ajuste.valor), motivo: ajuste.motivo,
      });
      setAjuste(null);
      toast.ok("Ajuste lançado no extrato.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSalvando(false);
    }
  }

  const abrirAjuste = (contaId: string) => {
    setErro("");
    setConta(null);
    setAjuste({ conta_id: contaId, valor: "", motivo: "" });
  };

  return (
    <>
      <Cabecalho
        titulo="Bancos e Gateways"
        sub="Veja seus saldos, movimentações e o que há para pagar em cada conta."
        busca={busca}
        aoBuscar={setBusca}
        acoes={
          <>
            <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} hoje={hoje} />
            {podeEscrever && (
              <>
                <BotaoFin icone="plus" primario onClick={() => { setErro(""); setConta(novaConta()); }}>
                  Nova conta
                </BotaoFin>
                <BotaoFin
                  icone="arrows-split"
                  onClick={() => {
                    setErro("");
                    setTransferencia({
                      de_id: ativas[0]?.id ?? "", para_id: ativas[1]?.id ?? "",
                      valor: "", data: hojeISO(), descricao: "",
                    });
                  }}
                >
                  Transferir
                </BotaoFin>
                <BotaoFin icone="adjustments-horizontal" onClick={() => abrirAjuste(ativas[0]?.id ?? "")}>
                  Ajustar saldo
                </BotaoFin>
              </>
            )}
            <BotaoExportar
              assunto="Contas" empresa={empresaNome} linhas={visiveis}
              colunas={[
                { cabecalho: "Nome", valor: (c) => c.nome },
                { cabecalho: "Tipo", valor: (c) => LABEL_CONTA_TIPO[c.tipo] ?? c.tipo },
                { cabecalho: "Instituição", valor: (c) => c.instituicao ?? "" },
                { cabecalho: "Saldo inicial", valor: (c) => numeroCSV(c.saldo_inicial) },
                { cabecalho: "Saldo atual", valor: (c) => numeroCSV(c.saldo) },
                { cabecalho: "Entra no saldo", valor: (c) => (c.inclui_no_saldo ? "Sim" : "Não") },
                { cabecalho: "Última movimentação", valor: (c) => ultimaMovimentacaoDe(c) },
                { cabecalho: "Responsável", valor: (c) => responsavelDe(c) },
                { cabecalho: "Status", valor: (c) => (c.ativa ? "Ativa" : "Inativa") },
              ]}
            />
          </>
        }
      />

      {schemaPendente && <AvisoSchema />}

      <LinhaKpi>
        <KpiSeta
          icone="building-warehouse"
          rotulo="Contas cadastradas"
          valor={String(ativas.length)}
          detalhe={`${ativas.filter((c) => c.tipo === "cartao").length} com cartão`}
          aoAbrir={() => setVisao("bancos")}
          tituloDaSeta="Ver as contas"
        />
        <KpiSeta
          icone="wallet"
          rotulo="Saldo total"
          valor={moeda(saldoTotal)}
          tom={saldoTotal < 0 ? "perigo" : "ok"}
          detalhe="em todas as contas"
        />
        <KpiSeta
          icone="hourglass-high"
          rotulo={`A pagar · ${rotuloDoPeriodo}`}
          valor={moeda(totalAPagar)}
          detalhe={`${contasComPagamento} ${contasComPagamento === 1 ? "conta com compromissos" : "contas com compromissos"}`}
          aoAbrir={() => setVisao("bancos")}
          tituloDaSeta="Ver o que sai de cada conta"
        />
        <KpiSeta
          icone="trending-up"
          rotulo="Entradas em 30 dias"
          valor={moeda(entradas30)}
          tom="atencao"
          detalhe="últimos 30 dias"
        />
      </LinhaKpi>


      {/* Os painéis em CIMA, na horizontal: os cartões de conta precisam da
          largura inteira pra caberem lado a lado. */}
      <FaixaDePaineis largura={300}>
        <Cartao>
          <TituloCartao icone="chart-dots">Distribuição de saldos por banco</TituloCartao>
          {fatiasSaldo.length ? (
            <Rosca fatias={fatiasSaldo} total={moeda(somaDaRosca)} rotuloTotal="nestas contas" tamanho={150} />
          ) : (
            <Vazio
              compacto
              icone="chart-dots"
              titulo="Nada para distribuir"
              detalhe="Só entram contas ativas com saldo positivo que somam no caixa."
            />
          )}
        </Cartao>

        <PainelRolante
          icone="history"
          titulo="Últimas movimentações"
          direita={<VerTudo href="/financeiro/compromissos" />}
        >
            <ListaLateral
              itens={ultimas}
              vazio={
                <Vazio
                  compacto
                  icone="history"
                  titulo="Nenhuma movimentação"
                  detalhe="Baixa de compromisso, transferência e ajuste aparecem aqui assim que acontecerem."
                />
              }
            />
        </PainelRolante>

        <PainelRolante
          icone="calendar-event"
          titulo="Próximos vencimentos"
          direita={<VerTudo href="/financeiro/compromissos" />}
        >
            <Agenda
              itens={itensAPagar.slice(0, 6).map((i) => ({
                chave: i.id,
                vencimento: i.vencimento,
                titulo: i.descricao,
                sub: i.conta_id ? nomeDaConta.get(i.conta_id) ?? "sem conta" : "sem conta definida",
                valor: i.valor,
                atrasado: i.atrasado,
              }))}
              vazio={<Vazio compacto icone="circle-check" titulo="Nada a pagar no período" />}
            />
        </PainelRolante>
      </FaixaDePaineis>

        <Cartao>
          <TituloCartao
            icone="wallet"
            direita={
              <TrocaDeVisao
                valor={visao}
                aoTrocar={setVisao}
                opcoes={[
                  { id: "bancos", icone: "layout-grid", titulo: "Ver como cartões" },
                  { id: "lista", icone: "layout-list", titulo: "Ver como tabela" },
                ]}
              />
            }
          >
            Contas bancárias e gateways
          </TituloCartao>
          <p style={{ marginTop: -10, marginBottom: 14, fontSize: 12, color: "var(--text-dim)" }}>
            Acompanhe o saldo, o que há pra pagar e as ações de cada conta.
          </p>
          <BuscaDaLista valor={busca} aoBuscar={setBusca} placeholder="Buscar conta ou banco…" />

          {visao === "bancos" ? (
            <>
              <Filtros>
                <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} hoje={hoje} />
                <LimparFiltros ativo={periodo !== periodoPadrao} aoLimpar={() => setPeriodo(periodoPadrao)} />
              </Filtros>
              <PorBanco
                contas={lista}
                itens={itensAPagar}
                atrasadosFora={atrasadosFora}
                hoje={hoje}
                rotuloDoPeriodo={rotuloDoPeriodo}
                empresas={empresas}
                geral={geral}
                logos={logos}
                podeEscrever={podeEscrever}
                aoAbrir={(c) => { setErro(""); setConta(daConta(c)); }}
                aoNovaConta={() => { setErro(""); setConta(novaConta()); }}
                aoNovoCartao={novoCartaoEm}
                aoPagarFatura={pagarFaturaDe}
                aoAjustar={(c) => abrirAjuste(c.id)}
              />
            </>
          ) : (
          <>
          <Filtros>
            <Filtro
              rotulo="Tipo"
              valor={tipo}
              aoMudar={setTipo}
              opcoes={CONTA_TIPOS.map((t) => ({ valor: t, label: LABEL_CONTA_TIPO[t] }))}
            />
            <Filtro
              rotulo="Instituição"
              valor={instituicao}
              aoMudar={setInstituicao}
              opcoes={opcoesInstituicao}
            />
            <Filtro
              rotulo="Status"
              valor={situacao}
              aoMudar={setSituacao}
              opcoes={[{ valor: "ativa", label: "Ativa" }, { valor: "inativa", label: "Inativa" }]}
            />
            <LimparFiltros ativo={temFiltro} aoLimpar={limparFiltros} />
          </Filtros>

          <ColunasPorEmpresa linhas={visiveis} empresas={empresas} empresaId={empresaId} empresaNome={empresaNome} rotulo={{ um: "conta", muitos: "contas" }}>
            {(l) => (
              <Tabela
                linhas={l}
                chaveDe={(c) => c.id}
                paginar={10}
                rotuloItem="registros"
                aoClicar={(c) => { setErro(""); setConta(daConta(c)); }}
                vazio={
                  <Vazio
                    icone="wallet"
                    titulo={lista.length ? "Nada com esses filtros" : "Nenhuma conta cadastrada"}
                    detalhe="Cadastre bancos, gateways e cartões para o saldo da empresa aparecer aqui."
                    acao={podeEscrever && !lista.length
                      ? <BotaoFin icone="plus" onClick={() => setConta(novaConta())}>Nova conta</BotaoFin>
                      : undefined}
                  />
                }
                colunas={[
                  {
                    chave: "tipo", label: "Tipo", largura: "minmax(min(100%, 92px), 0.7fr)",
                    celula: (c) => LABEL_CONTA_TIPO[c.tipo] ?? c.tipo,
                  },
                  {
                    // O mockup chama a coluna de "Instituição", mas quem identifica
                    // a conta aqui é o NOME: duas contas do mesmo banco têm a mesma
                    // instituição, e a linha ficaria repetida. Por isso o nome é o
                    // título (e o título do card no celular) e a instituição é a
                    // segunda linha — nenhuma das duas informações se perde.
                    chave: "instituicao", label: "Instituição", largura: "minmax(min(100%, 132px), 1.7fr)", titulo: true,
                    celula: (c) => (
                      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        {/* O ícone do aplicativo do banco. Sem logo subido, cai no
                            ícone do tipo — nenhuma linha aparece sem marca. */}
                        <Marca
                          marca={{ nome: c.nome, logo: logos[c.id] ?? null, icone: c.icone ?? ICONE_CONTA_TIPO[c.tipo], cor: c.cor }}
                          tamanho={28}
                          raio={8}
                        />
                        <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                          <strong style={{ fontWeight: 700 }}>{c.nome}</strong>
                          <small style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-dim)" }}>
                            {c.instituicao || "sem instituição"}
                          </small>
                        </span>
                      </span>
                    ),
                  },
                  {
                    // "Saldo / limite" no mockup. `fin_contas` guarda dia de
                    // fechamento e de vencimento do cartão, mas NÃO guarda limite —
                    // então a coluna mostra só o saldo. Escrever "/ R$ 20.000,00"
                    // aqui seria um número inventado com cara de dado do banco.
                    chave: "saldo", label: "Saldo", largura: "minmax(min(100%, 104px), 0.9fr)", fim: true,
                    celula: (c) => (
                      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                        <strong style={{ fontVariantNumeric: "tabular-nums", color: c.saldo < 0 ? "var(--perigo)" : "var(--text)" }}>
                          {moeda(c.saldo)}
                        </strong>
                        {c.tipo !== "cartao" && ehPagarme(c) && <AReceberNoGateway contaId={c.id} />}
                        {/* Cartão: o que importa não é o saldo negativo, é quanto
                            da fatura está aberto e quanto ainda cabe. Os dois
                            saem da view (`usado`, `disponivel`), nunca de coluna. */}
                        {c.tipo === "cartao" && c.usado != null ? (
                          <>
                            <small style={{ fontSize: 11, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                              {c.limite != null
                                ? `${moeda(c.usado)} de ${moeda(c.limite)}`
                                : `${moeda(c.usado)} em uso`}
                            </small>
                            {/* A RÉGUA do limite, viva: cada pagamento no cartão é
                                um movimento e a view recalcula o usado — a barra
                                acompanha sem ninguém digitar nada. Cor de ESTADO
                                (semântica), nunca da rampa: 90% de limite comido
                                significa perigo em qualquer paleta. */}
                            {c.limite != null && c.limite > 0 && (() => {
                              const fracao = Math.min(1, c.usado! / c.limite!);
                              const corDaRegua = fracao >= 0.9 ? "var(--perigo)" : fracao >= 0.7 ? "var(--atencao)" : "var(--ok)";
                              return (
                                <span aria-hidden style={{ display: "block", height: 4, borderRadius: 999, background: "color-mix(in srgb, var(--text) 10%, transparent)", overflow: "hidden" }}>
                                  <span style={{ display: "block", height: "100%", width: `${Math.round(fracao * 100)}%`, borderRadius: 999, background: corDaRegua, transition: "width var(--duration-slow) var(--ease-smooth-out)" }} />
                                </span>
                              );
                            })()}
                            {/* Pagar a fatura em UM toque: abre a transferência já
                                preenchida — do banco do cartão, para o cartão, no
                                valor aberto. Confirmar zera o usado e o limite
                                volta na hora. `stopPropagation`: o clique é na
                                ação, não na linha (que abriria a ficha). */}
                            {podeEscrever && c.usado > 0 && (
                              <Botao
                                variante="sutil"
                                tamanho="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setErro("");
                                  setTransferencia({
                                    de_id: c.conta_mae_id ?? "", para_id: c.id,
                                    valor: c.usado!.toFixed(2), data: hojeISO(),
                                    descricao: `Fatura do cartão ${c.nome}`,
                                  });
                                }}
                                style={{ justifySelf: "end" }}
                              >
                                pagar fatura
                              </Botao>
                            )}
                          </>
                        ) : !c.inclui_no_saldo && (
                          <small style={{ fontSize: 11, color: "var(--text-dim)" }}>fora do caixa</small>
                        )}
                      </span>
                    ),
                  },
                  {
                    chave: "ultima", label: "Última movimentação", largura: "minmax(min(100%, 112px), 1fr)",
                    celula: (c) => (
                      <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                        {ultimaMovimentacaoDe(c) || "—"}
                      </span>
                    ),
                  },
                  {
                    chave: "responsavel", label: "Responsável", largura: "minmax(min(100%, 96px), 0.9fr)",
                    celula: (c) => responsavelDe(c) || "—",
                  },
                  {
                    chave: "status", label: "Status", largura: "100px", fim: true,
                    celula: (c) => <Selo selo={c.ativa ? SELO_ATIVA : SELO_INATIVA} />,
                  },
                ]}
              />
            )}
          </ColunasPorEmpresa>
          </>
          )}
        </Cartao>



      {conta && (
        <PainelLateral
          centrado
          titulo={conta.id ? "Editar conta" : "Nova conta"}
          soFechaNoX
          subtitulo={conta.id ? "Saldo não entra aqui — ele é a soma dos movimentos." : undefined}
          onFechar={() => setConta(null)}
          largura={520}
          rodape={
            <Acoes>
              <Botao onClick={() => setConta(null)}>Cancelar</Botao>
              {conta.id && (
                <Botao icone="adjustments-horizontal" onClick={() => abrirAjuste(conta.id as string)} disabled={salvando}>
                  Ajustar saldo
                </Botao>
              )}
              {conta.id && podeEscrever && (
                <BotaoApagar
                  tipo="conta" id={conta.id} nome={conta.nome ?? ""}
                  aoApagar={() => { setConta(null); router.refresh(); }}
                />
              )}
              <Esp />
              {podeEscrever && (
                <Botao variante="primario" icone="check" carregando={salvando} onClick={salvarConta}>Salvar</Botao>
              )}
            </Acoes>
          }
        >
          {erro && (
            <p style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
          )}

          <SoLeitura ativo={!podeEscrever} motivo="Você abre a conta, mas não edita: falta a permissão de contas do Financeiro.">
          {/* A FOTO DA CONTA — no próprio cadastro, inclusive na criação. O
              ícone do aplicativo do banco é como a pessoa reconhece a conta na
              lista, e mandar para outra tela escolhê-lo era o mesmo que não ter. */}
          <CampoMarca
            tipo="conta"
            id={conta.id}
            nome={conta.nome || "Conta"}
            logo={conta.id ? logos[conta.id] ?? null : null}
            icone={ICONE_CONTA_TIPO[conta.tipo]}
            aoTrocar={() => router.refresh()}
            aoEscolherPendente={setFotoPendente}
          />

          <Campos>
            {!conta.id && !empresaId && empresas.length > 0 && (
              <Campo label="Empresa" largo dica="Em “Visão geral” a conta precisa dizer em qual empresa nasce.">
                {(id) => (
                  <SeletorEmpresa id={id} empresas={empresas} valor={conta.empresa_id}
                    aoMudar={(v) => setConta({ ...conta, empresa_id: v })} />
                )}
              </Campo>
            )}
            <Campo label="Nome" largo>
              {(id) => (
                <input
                  id={id}
                  value={conta.nome}
                  onChange={(e) => setConta({ ...conta, nome: e.target.value })}
                  placeholder="Itaú — conta corrente"
                />
              )}
            </Campo>

            <Campo label="Tipo">
              {(id) => (
                <select
                  id={id}
                  value={conta.tipo}
                  onChange={(e) => {
                    const t = e.target.value as ContaTipo;
                    setConta({ ...conta, tipo: t, inclui_no_saldo: conta.id ? conta.inclui_no_saldo : t !== "cartao" });
                  }}
                >
                  {CONTA_TIPOS.map((t) => <option key={t} value={t}>{LABEL_CONTA_TIPO[t]}</option>)}
                </select>
              )}
            </Campo>

            <Campo label="Instituição">
              {(id) => (
                <input
                  id={id}
                  value={conta.instituicao}
                  onChange={(e) => setConta({ ...conta, instituicao: e.target.value })}
                  placeholder="Itaú, Mercado Pago, Stone…"
                />
              )}
            </Campo>

            {conta.tipo !== "cartao" && (
              <>
                <Campo label="Agência">
                  {(id) => (
                    <input
                      id={id} inputMode="numeric"
                      value={conta.agencia}
                      onChange={(e) => setConta({ ...conta, agencia: e.target.value })}
                      placeholder="1234"
                    />
                  )}
                </Campo>

                <Campo label="Conta" dica="Com o dígito. É o que vai no comprovante de quem paga a empresa.">
                  {(id) => (
                    <input
                      id={id} inputMode="numeric"
                      value={conta.numero}
                      onChange={(e) => setConta({ ...conta, numero: e.target.value })}
                      placeholder="56789-0"
                    />
                  )}
                </Campo>
              </>
            )}

            {conta.id ? (
              <Campo label="Saldo inicial" dica="Só se define no cadastro. Para corrigir o saldo de hoje, use Ajustar saldo.">
                <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", paddingTop: 8 }}>
                  {moeda(numero(conta.saldo_inicial))}
                </div>
              </Campo>
            ) : (
              <Campo label="Saldo inicial" dica="Quanto já havia na conta no dia em que ela entrou no controle.">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={conta.saldo_inicial}
                    onChange={(e) => setConta({ ...conta, saldo_inicial: e.target.value })}
                    placeholder="0,00"
                  />
                )}
              </Campo>
            )}

            <Campo label="Entra no saldo disponível?" dica="Cartão de crédito fica fora: limite não é dinheiro em caixa.">
              {(id) => (
                <select
                  id={id}
                  value={conta.inclui_no_saldo ? "1" : "0"}
                  onChange={(e) => setConta({ ...conta, inclui_no_saldo: e.target.value === "1" })}
                >
                  <option value="1">Sim, soma no caixa</option>
                  <option value="0">Não</option>
                </select>
              )}
            </Campo>

            {conta.tipo === "cartao" && (
              <>
                <Campo label="Limite" dica="Quanto o cartão aguenta. O que está em uso é calculado da fatura, nunca digitado.">
                  {(id) => (
                    <input
                      id={id} type="number" step="0.01" min="0" inputMode="decimal"
                      value={conta.limite}
                      onChange={(e) => setConta({ ...conta, limite: e.target.value })}
                      placeholder="5.000,00"
                    />
                  )}
                </Campo>

                <Campo label="Banco do cartão" dica="Em qual conta a fatura é paga.">
                  {(id) => (
                    <select
                      id={id}
                      value={conta.conta_mae_id}
                      onChange={(e) => setConta({ ...conta, conta_mae_id: e.target.value })}
                    >
                      <option value="">Sem banco definido</option>
                      {/* Só banco da MESMA empresa: em "Visão geral" a lista
                          tem os bancos de todas, e um cartão da Tridi
                          pendurado no Itaú da Gedux pagaria a fatura com o
                          dinheiro errado. */}
                      {lista
                        .filter((x) => x.tipo !== "cartao" && x.id !== conta.id
                          && x.empresa_id === (conta.empresa_id || empresaId || x.empresa_id))
                        .map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                    </select>
                  )}
                </Campo>

                <Campo label="Bandeira">
                  {(id) => (
                    <select
                      id={id}
                      value={conta.bandeira}
                      onChange={(e) => setConta({ ...conta, bandeira: e.target.value })}
                    >
                      <option value="">—</option>
                      {BANDEIRAS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  )}
                </Campo>

                <Campo label="Final" dica="Os quatro últimos dígitos — é como se reconhece o cartão.">
                  {(id) => (
                    <input
                      id={id} inputMode="numeric" maxLength={4}
                      value={conta.final}
                      onChange={(e) => setConta({ ...conta, final: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      placeholder="4321"
                    />
                  )}
                </Campo>
              </>
            )}

            {conta.id && (
              <Campo label="Situação" dica="Conta inativa some das escolhas de pagamento e continua explicando o extrato antigo.">
                {(id) => (
                  <select id={id} value={conta.ativa ? "1" : "0"} onChange={(e) => setConta({ ...conta, ativa: e.target.value === "1" })}>
                    <option value="1">Ativa</option>
                    <option value="0">Inativa</option>
                  </select>
                )}
              </Campo>
            )}
          </Campos>
          </SoLeitura>
        </PainelLateral>
      )}

      {transferencia && (
        <PainelLateral
          centrado
          titulo="Transferir entre contas"
          soFechaNoX
          subtitulo="Dinheiro mudando de lugar — nunca uma despesa."
          onFechar={() => setTransferencia(null)}
          largura={520}
          rodape={
            <Acoes>
              <Botao onClick={() => setTransferencia(null)}>Cancelar</Botao>
              <Esp />
              <Botao variante="primario" icone="arrows-split" carregando={salvando} onClick={salvarTransferencia}>
                Transferir
              </Botao>
            </Acoes>
          }
        >
          {erro && (
            <p style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
          )}

          <Campos>
            <Campo label="De">
              {(id) => (
                <Escolha
  id={id}
  valor={transferencia.de_id}
  semVazio
  vazio="Escolha a origem"
  placeholder="Buscar conta…"
  aoEscolher={(v) => setTransferencia({ ...transferencia, de_id: v })}
  opcoes={ativas.map((c) => ({ id: c.id, nome: c.nome, marca: { nome: c.nome, icone: "wallet" } }))}
/>
              )}
            </Campo>

            <Campo label="Para">
              {(id) => (
                <Escolha
  id={id}
  valor={transferencia.para_id}
  semVazio
  vazio="Escolha o destino"
  placeholder="Buscar conta…"
  aoEscolher={(v) => setTransferencia({ ...transferencia, para_id: v })}
  opcoes={ativas.map((c) => ({ id: c.id, nome: c.nome, marca: { nome: c.nome, icone: "wallet" } }))}
/>
              )}
            </Campo>

            <Campo label="Valor">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={transferencia.valor}
                  onChange={(e) => setTransferencia({ ...transferencia, valor: e.target.value })}
                  placeholder="0,00"
                />
              )}
            </Campo>

            <Campo label="Data">
              {(id) => (
                <input id={id} type="date" value={transferencia.data} onChange={(e) => setTransferencia({ ...transferencia, data: e.target.value })} />
              )}
            </Campo>

            <Campo label="Descrição" largo dica="Em branco, vira “Transferência conta de origem → conta de destino”.">
              {(id) => (
                <input
                  id={id}
                  value={transferencia.descricao}
                  onChange={(e) => setTransferencia({ ...transferencia, descricao: e.target.value })}
                  placeholder="Reforço do caixa da semana"
                />
              )}
            </Campo>
          </Campos>

          <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
            Nascem dois movimentos ligados pelo mesmo grupo: um saindo, um entrando. O total da
            empresa não muda — e nenhuma despesa é criada.
          </p>
        </PainelLateral>
      )}

      {ajuste && (
        <PainelLateral
          centrado
          titulo="Ajustar saldo"
          soFechaNoX
          subtitulo="Vira um movimento no extrato, com motivo e assinatura."
          onFechar={() => setAjuste(null)}
          largura={520}
          rodape={
            <Acoes>
              <Botao onClick={() => setAjuste(null)}>Cancelar</Botao>
              <Esp />
              <Botao variante="primario" icone="check" carregando={salvando} onClick={salvarAjuste}>Lançar ajuste</Botao>
            </Acoes>
          }
        >
          {erro && (
            <p style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
          )}

          <Campos>
            <Campo label="Conta" largo>
              {(id) => (
                <select id={id} value={ajuste.conta_id} onChange={(e) => setAjuste({ ...ajuste, conta_id: e.target.value })}>
                  <option value="">Escolha a conta</option>
                  {ativas.map((c) => <option key={c.id} value={c.id}>{c.nome} — {moeda(c.saldo)}</option>)}
                </select>
              )}
            </Campo>

            <Campo
              label="Diferença"
              dica={contaDoAjuste
                ? `Hoje ${moeda(contaDoAjuste.saldo)} — depois do ajuste, ${moeda(centavos(contaDoAjuste.saldo + numero(ajuste.valor)))}.`
                : "Positivo entra, negativo sai."}
            >
              {(id) => (
                <input
                  id={id}
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={ajuste.valor}
                  onChange={(e) => setAjuste({ ...ajuste, valor: e.target.value })}
                  placeholder="0,00"
                />
              )}
            </Campo>

            <Campo label="Motivo" largo dica="Obrigatório: é o que alguém vai ler daqui a seis meses para entender o número.">
              {(id) => (
                <textarea
                  id={id}
                  rows={3}
                  value={ajuste.motivo}
                  onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })}
                  placeholder="Tarifa de manutenção não lançada"
                />
              )}
            </Campo>
          </Campos>
        </PainelLateral>
      )}
    </>
  );
}
