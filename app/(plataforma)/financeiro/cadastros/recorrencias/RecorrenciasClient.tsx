"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../Icon";
import { useParamDaUrl } from "../../../ui/useParamDaUrl";
import { confirmar, toast } from "../../../Toast";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral, Caixa } from "../../../ui/controles";
import { AvisoSchema, Barras, BotaoExportar, BotaoFin, Cabecalho, Cartao, Filtro, Filtros, CampoMarca, LimparFiltros, LinhaKpi, Marca, Selo, SoLeitura, Tabela, TituloCartao, Vazio, SeletorEmpresa, enviarMarca, BotaoApagar, Escolha, FiltroPeriodo, Rosca, FaixaDePaineis, type Coluna, BuscaDaLista } from "../../ui";
import { Agenda, BotaoLargo, CartaoEmpresa, Etiqueta, GradeDeEmpresas, KpiSeta, PainelRolante, TrocaDeVisao, VerTudo } from "../../blocos";
import { agruparPorEmpresa, cobraNoMes, ehMes, janelaDoMes, mesRelativo, rotuloDoMes } from "@/lib/financeiro/periodo";
import {
  diaDoVencimento,
  dataBR, dentroDaJanela, diaSeguro, equivalenteMensal, fatias, hojeISO, moeda, somarDias,
} from "@/lib/financeiro/calculos";
import { dataCSV, numeroCSV } from "@/lib/financeiro/csv";
import { idsDoRelacionado, marcaRelacionada } from "@/lib/financeiro/marca-relacionada";
import type { FornecedorRelacionado, RelacionadoFinanceiro } from "@/lib/financeiro/marca-relacionada";
import {
  acharCategoria, CATEGORIAS_COMPROMISSO, LABEL_PERIODICIDADE, PERIODICIDADES,
  RECORRENCIA_STATUS, SELO_RECORRENCIA,
  type Periodicidade, type Recorrencia, type RecorrenciaStatus,
} from "@/lib/financeiro/tipos";

interface Opcao { id: string; nome: string }

interface Rascunho {
  lancar_primeira: boolean;
  /** Para QUEM se paga, quando não é fornecedor do cadastro. */
  contato_id: string;
  /** Em "Visão geral" a tela não tem empresa: a regra nova pergunta. */
  empresa_id: string;
  id: string | null;
  descricao: string; categoria: string; valor: string; valor_variavel: boolean;
  periodicidade: Periodicidade; intervalo_meses: string; dia_vencimento: string;
  inicio: string; fim: string; conta_id: string; fornecedor_id: string;
  /** Em qual conta ENTRA — para a regra que é receita, não despesa. */
  conta_destino_id: string;
  forma_pagamento: string;
  /** Quem cuida desta regra. Pessoa da folha. */
  responsavel_id: string;
}

/** Chave do filtro "conta" para as regras que não apontam para conta nenhuma. */
const SEM_CONTA = "__sem_conta__";

/** Janela de "está chegando" — vale para os dois KPIs de 30 dias e para o texto. */
const JANELA_DIAS = 30;

/**
 * `r.ok` sozinho já não mente: rota de API deste módulo nunca redireciona, e o
 * middleware devolve 401 em JSON — o que chega aqui é o erro escrito pela rota,
 * que é o que a pessoa consegue agir ("já existe", "informe um valor").
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

const novoRascunho = (podeLancarPrimeira = true): Rascunho => ({
  lancar_primeira: podeLancarPrimeira,
  contato_id: "",
  empresa_id: "",
  id: null, descricao: "", categoria: "outros", valor: "", valor_variavel: false,
  periodicidade: "mensal", intervalo_meses: "1",
  // Vazio = "o dia do início". Nascer com o dia de HOJE aqui era o defeito:
  // início 05/10 cadastrado no dia 9 cobrava todo dia 9.
  dia_vencimento: "",
  inicio: hojeISO(), fim: "", conta_id: "", fornecedor_id: "",
  conta_destino_id: "", forma_pagamento: "", responsavel_id: "",
});

const daRegra = (r: Recorrencia): Rascunho => ({
  lancar_primeira: false,
  contato_id: r.contato_id ?? "",
  empresa_id: r.empresa_id,
  id: r.id, descricao: r.descricao, categoria: r.categoria, valor: String(r.valor),
  valor_variavel: r.valor_variavel ?? false,
  periodicidade: r.periodicidade, intervalo_meses: String(r.intervalo_meses ?? 1),
  dia_vencimento: String(r.dia_vencimento), inicio: r.inicio, fim: r.fim ?? "",
  conta_id: r.conta_id ?? "", fornecedor_id: r.fornecedor_id ?? "",
  conta_destino_id: r.conta_destino_id ?? "", forma_pagamento: r.forma_pagamento ?? "",
  responsavel_id: r.responsavel_id ?? "",
});

const ritmo = (r: Pick<Recorrencia, "periodicidade" | "intervalo_meses">) =>
  r.periodicidade === "customizada"
    ? `A cada ${r.intervalo_meses} ${r.intervalo_meses === 1 ? "mês" : "meses"}`
    : LABEL_PERIODICIDADE[r.periodicidade];

/**
 * Quando esta regra cobra da próxima vez.
 *
 * `proxima_competencia` é o 1º dia do mês (é assim que competência é gravada); o
 * dia real vem do `dia_vencimento`, e quem faz a conta é o `diaSeguro` — "todo
 * dia 31" em fevereiro é dia 28, e não 3 de março. Sem `proxima_competencia` a
 * régua é o `inicio`, que é de onde o gerador também parte.
 */
function proximoVencimento(r: Recorrencia): string {
  const [ano, mes] = (r.proxima_competencia ?? r.inicio).slice(0, 10).split("-").map(Number);
  return diaSeguro(ano, mes, r.dia_vencimento);
}

export function RecorrenciasClient({
  empresaId, empresaNome, podeEscrever, podeLancarPrimeira, regras, contas, fornecedores, pessoas = [], logos = {}, empresas = [],
  formasDePagamento = [], relacionados = [], logosRelacionados = {}, schemaPendente, geral = false,
}: {
  /** "Visão geral" ligada: a lista sai em blocos, um por empresa. */
  geral?: boolean;
  empresaId: string;
  empresaNome: string;
  podeEscrever: boolean;
  podeLancarPrimeira: boolean;
  regras: Recorrencia[];
  contas: Opcao[];
  fornecedores: FornecedorRelacionado[];
  /** Pessoas da folha — só id e nome — para dizer quem cuida da regra. */
  pessoas?: Opcao[];
  /** `regra.id` → link ASSINADO da foto. Vem da página, vence em 1h. */
  logos?: Record<string, string>;
  /** As empresas liberadas — a regra diz em qual nasce quando a tela está em "Visão geral". */
  empresas?: { id: string; nome: string }[];
  /** As formas de pagamento da configuração, como sugestão. */
  formasDePagamento?: string[];
  /** Pessoas e organizações canônicas, com a extensão reduzida ao seu ID. */
  relacionados?: RelacionadoFinanceiro[];
  /** `contato.id` → link ASSINADO da foto, para o seletor mostrar a marca. */
  logosRelacionados?: Record<string, string>;
  schemaPendente: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [periodicidade, setPeriodicidade] = useState("");
  const [conta, setConta] = useState("");
  const [status, setStatus] = useState("");
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  useParamDaUrl("regra", (id) => {
    const regra = regras.find((r) => r.id === id);
    if (regra) setRascunho(daRegra(regra));
  });
  // A foto escolhida ANTES de a regra existir. Sobe logo depois do POST.
  const [fotoPendente, setFotoPendente] = useState<File | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [ultimaGeracao, setUltimaGeracao] = useState<number | null>(null);

  const nomeDaConta = useMemo(() => new Map(contas.map((c) => [c.id, c.nome])), [contas]);

  const ativas = useMemo(() => regras.filter((r) => r.status === "ativa"), [regras]);
  const mensal = ativas.reduce((s, r) => s + equivalenteMensal(r), 0);

  const hoje = hojeISO();
  // Nasce no mês de hoje — padrão do módulo inteiro (set/2026). O que a tela
  // lista é o que COBRA nesse mês (pela cadência da regra, não pelo "onde o
  // gerador parou"); as setas andam de mês em mês e "Todas" mostra o cadastro.
  const [periodo, setPeriodo] = useState(() => mesRelativo(hoje, 0));
  const periodoPadrao = mesRelativo(hoje, 0);
  const rotuloDoPeriodo = ehMes(periodo) ? rotuloDoMes(periodo, hoje) : "Todas";
  const cobramNoPeriodo = useMemo(() => ativas.filter((r) => cobraNoMes(r, periodo)), [ativas, periodo]);
  // O vencimento QUE A TELA MOSTRA é o do mês escolhido: dia 10 em setembro é
  // 10/09, mesmo que o gerador tenha parado em agosto ou já esteja em
  // outubro. Mostrar `proxima_competencia` aqui era o "vencimento bugado":
  // a lista de setembro dizia 10/08 numa linha e 08/10 na outra.
  const vencimentoNoPeriodo = (r: Recorrencia): string => {
    const j = janelaDoMes(periodo);
    if (!j) return proximoVencimento(r);
    const [a, m] = j.de.split("-").map(Number);
    return diaSeguro(a, m, r.dia_vencimento);
  };
  const totalDoPeriodo = cobramNoPeriodo.reduce((s, r) => s + r.valor, 0);
  const limiteJanela = somarDias(hoje, JANELA_DIAS);
  const vencemNaJanela = ativas.filter((r) => dentroDaJanela(proximoVencimento(r), hoje, limiteJanela)).length;
  // Renovação/encerramento olha o campo `fim` — é a data em que o contrato de
  // fato acaba. Não confundir com o vencimento da parcela do mês, que é o KPI
  // ao lado: uma assinatura mensal vence todo mês e só "renova" uma vez.
  const renovamNaJanela = ativas.filter((r) => r.fim && dentroDaJanela(r.fim, hoje, limiteJanela)).length;

  // O status vem da LISTA, não do rascunho: pausar e retomar são PATCH de
  // `status` e não passam pelo formulário, então o rascunho continuaria com o
  // valor de quando o painel abriu.
  const emEdicao = rascunho?.id ? regras.find((r) => r.id === rascunho.id) ?? null : null;

  const empresaDoFormulario = rascunho?.empresa_id || empresaId;
  const relacionadosDaEmpresa = relacionados.filter((item) => item.empresa_id === empresaDoFormulario);
  const pessoasDoFormulario = relacionadosDaEmpresa.filter((item) => item.natureza === "pessoa");
  const organizacoesDoFormulario = relacionadosDaEmpresa.filter((item) => item.natureza === "empresa");
  const fornecedoresDoFormulario = fornecedores.filter((item) => item.empresa_id === empresaDoFormulario);
  const relacionadoDoFormulario = rascunho?.contato_id
    ? `contato:${rascunho.contato_id}`
    : rascunho?.fornecedor_id
      ? `fornecedor:${rascunho.fornecedor_id}`
      : "";

  /**
   * O contato por trás do valor escolhido — é o que o atalho "Abrir cadastro
   * completo" precisa.
   *
   * Fornecedor tem ficha no MESMO diretório: a migração do cadastro unificado
   * deu a ele um `contato_id`, e a identidade passou a ser o contato. Então os
   * dois caminhos terminam no mesmo lugar; o que muda é de onde sai o id.
   */
  /**
   * Escolher o relacionado APROVEITA o que o cadastro já sabe.
   *
   * Quem escolhe "Madeiranit" já disse quase tudo: a categoria dela, como se
   * paga, em quantos dias. Repetir isso campo a campo é pedir que a pessoa
   * decore o cadastro — e é assim que o dado diverge, porque metade das vezes
   * ela digita diferente do que está lá.
   *
   * SÓ preenche o que está VAZIO. O que a pessoa escreveu manda sempre:
   * sobrescrever uma escolha explícita seria pior que não sugerir nada, porque
   * o campo mudaria sozinho depois de já estar certo.
   */
  /**
   * Cria o contato SEM SAIR do cadastro da regra. Mesmo caminho de
   * Compromissos: um fornecedor novo custava fechar o formulário, ir em
   * Cadastros, criar e recomeçar — cinco passos que fazem o campo acabar em
   * branco "para resolver depois".
   */
  async function criarContato(nome: string): Promise<string | null> {
    const empresa = empresaDoFormulario;
    if (!empresa) return null;
    try {
      const r = await fetch("/api/financeiro/contatos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ empresa_id: empresa, nome, natureza: "empresa", papeis: ["contato"] }),
      });
      const d = (await r.json().catch(() => ({}))) as { id?: string; erro?: string };
      if (!r.ok || !d.id) { toast.erro(d.erro ?? "Não deu para criar o contato."); return null; }
      toast.ok(`“${nome}” criado.`);
      // Sem recarregar, o contato novo fica escolhido mas sem nome nem foto.
      router.refresh();
      return `contato:${d.id}`;
    } catch {
      toast.erro("Sem resposta do servidor.");
      return null;
    }
  }

  function escolherRelacionado(valor: string) {
    if (!rascunho) return;
    const ids = idsDoRelacionado(valor);
    const escolhido = valor.startsWith("contato:")
      ? relacionados.find((r) => r.id === valor.slice("contato:".length))
      : relacionados.find((r) => `fornecedor:${r.fornecedor?.id}` === valor);
    const s = escolhido?.sugestao;
    setRascunho({
      ...rascunho, ...ids,
      // `categoria` nasce "outros": trocar POR uma sugestão é preencher, não
      // sobrescrever — ninguém escolhe "outros" de propósito.
      categoria: rascunho.categoria && rascunho.categoria !== "outros"
        ? rascunho.categoria
        : (s?.categoria && CATEGORIAS_COMPROMISSO.some((c) => c.id === s.categoria)
          ? s.categoria : rascunho.categoria),
      forma_pagamento: rascunho.forma_pagamento || (s?.forma_pagamento ?? ""),
    });
  }

  /**
   * A cara da regra: a DELA se alguém escolheu uma, senão a do relacionado.
   *
   * A lista mostrava só a foto da própria recorrência — que quase nunca tem
   * uma. O aluguel da Madeiranit aparecia com o ícone genérico de repetição, ao
   * lado de um contato que TEM foto e nome. A informação existia no cadastro e
   * a tela não a usava; Compromissos já resolvia assim, e as duas telas
   * mostrando a mesma conta de jeitos diferentes é o que faz parecer que uma
   * delas está errada.
   *
   * A foto própria vence quando existe: escolher uma é uma decisão, e o
   * automático não pode passar por cima dela.
   */
  const contasPorId = useMemo(
    () => new Map(contas.map((c) => [c.id, { id: c.id, nome: c.nome, empresa_id: empresaId }])),
    [contas, empresaId]);

  function marcaDaRegra(r: Recorrencia) {
    if (logos[r.id]) return { nome: r.descricao, logo: logos[r.id], icone: r.icone ?? "refresh", cor: null };
    const dona = { id: empresaId, nome: empresaNome, icone: "building-warehouse" };
    const resolvida = marcaRelacionada(
      {
        empresa_id: r.empresa_id,
        conta_id: r.conta_id ?? null,
        contato_id: r.contato_id ?? null,
        fornecedor_id: r.fornecedor_id ?? null,
      },
      relacionados, fornecedores, dona,
      // A conta é o último degrau da cadeia (contato → fornecedor → conta →
      // empresa): a regra sem relacionado ainda pode mostrar a cara do banco
      // de onde ela sai.
      r.conta_id ? contasPorId.get(r.conta_id) : undefined,
    );
    return {
      // O NOME da linha continua sendo a descrição da regra ("Aluguel"), não o
      // do contato: é ela que diz o que a conta é. O que vem do relacionado é
      // a cara.
      nome: r.descricao,
      logo: resolvida.logo_url ? logosRelacionados[resolvida.logo_url] ?? null : null,
      icone: resolvida.icone ?? r.icone ?? "refresh",
      cor: null,
    };
  }

  const contatoRelacionado = rascunho?.contato_id
    ?? (rascunho?.fornecedor_id
      // A busca é pelo OUTRO lado: o contato é que aponta para o fornecedor
      // (`fornecedor: { id }`), porque a identidade passou a ser o contato e a
      // linha de fornecedor virou extensão dele.
      ? relacionados.find((r) => r.fornecedor?.id === rascunho.fornecedor_id)?.id ?? null
      : null);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return regras.filter((r) =>
      cobraNoMes(r, periodo) &&
      (!status || r.status === status) &&
      (!categoria || (r.categoria || "outros") === categoria) &&
      (!periodicidade || r.periodicidade === periodicidade) &&
      (!conta || (conta === SEM_CONTA ? !r.conta_id : r.conta_id === conta)) &&
      (!q || r.descricao.toLowerCase().includes(q)));
  }, [regras, busca, status, categoria, periodicidade, conta, periodo]);

  // Em "Visão geral" a lista sai em BLOCOS, um por empresa: a recorrência da
  // Tridi e a da Gedux não são a mesma coisa e não podem virar uma lista só.
  /** Quantas linhas cada cartão de empresa mostra antes do "Ver tudo". */
  const POR_BLOCO = 5;
  const [empresaFoco, setEmpresaFoco] = useState("");
  // Ao abrir UMA empresa, o "Ver todos" que tinha o foco some da tela; sem
  // isto o foco caía no <body> e o leitor de tela recomeçava do topo.
  const voltarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (empresaFoco) voltarRef.current?.focus(); }, [empresaFoco]);
  // Cartões por empresa (o padrão) ou uma tabela corrida com tudo — a mesma
  // lista, dois jeitos de olhar.
  const [visao, setVisao] = useState<"cartoes" | "lista">("cartoes");
  const blocos = useMemo(() => {
    const todos = geral
      ? agruparPorEmpresa(lista, empresas, { incluirVazias: true })
      : [{ empresa: { id: empresaId, nome: empresaNome }, itens: lista }];
    return empresaFoco ? todos.filter((b) => b.empresa.id === empresaFoco) : todos;
  }, [geral, lista, empresas, empresaId, empresaNome, empresaFoco]);
  const emFoco = !!empresaFoco;
  const limiteDoBloco = (id: string) => (!geral || empresaFoco === id ? lista.length : POR_BLOCO);

  // As opções saem do que EXISTE no cadastro, não de um catálogo fixo: um filtro
  // que oferece "Semestral" e devolve zero linhas faz a pessoa achar que a tela
  // está quebrada. Categoria fora do catálogo aparece como ela mesma (é o que o
  // `acharCategoria` faz) em vez de sumir do filtro.
  const opcoesCategoria = useMemo(() => {
    const vistas = [...new Set(regras.map((r) => r.categoria || "outros"))];
    return vistas
      .map((id) => ({ valor: id, label: acharCategoria(CATEGORIAS_COMPROMISSO, id).label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [regras]);

  const opcoesPeriodicidade = useMemo(() => {
    const vistas = new Set(regras.map((r) => r.periodicidade));
    return PERIODICIDADES.filter((p) => vistas.has(p)).map((p) => ({ valor: p, label: LABEL_PERIODICIDADE[p] }));
  }, [regras]);

  const opcoesConta = useMemo(() => {
    const vistas = new Set(regras.map((r) => r.conta_id ?? SEM_CONTA));
    const out = contas.filter((c) => vistas.has(c.id)).map((c) => ({ valor: c.id, label: c.nome }));
    if (vistas.has(SEM_CONTA)) out.push({ valor: SEM_CONTA, label: "Sem conta" });
    return out;
  }, [regras, contas]);

  const opcoesStatus = useMemo(() => {
    const vistos = new Set(regras.map((r) => r.status));
    return RECORRENCIA_STATUS.filter((s) => vistos.has(s)).map((s) => ({ valor: s, label: SELO_RECORRENCIA[s].label }));
  }, [regras]);

  const temFiltro = !!(busca || categoria || periodicidade || conta || status || periodo !== periodoPadrao);
  const limparFiltros = () => {
    setBusca(""); setCategoria(""); setPeriodicidade(""); setConta(""); setStatus(""); setPeriodo(periodoPadrao);
  };

  // Resumo e próximas cobranças olham as ATIVAS, não a lista filtrada: o painel
  // da direita tem que fechar com o KPI "Valor recorrente do mês" que está logo
  // acima. Um resumo que muda de total quando alguém mexe num chip vira uma
  // segunda verdade sobre o mesmo dinheiro.
  const porCategoria = useMemo(
    () => fatias(
      ehMes(periodo) ? cobramNoPeriodo : ativas,
      (r) => r.categoria,
      (r) => (ehMes(periodo) ? r.valor : equivalenteMensal(r)),
      (id) => {
        const c = acharCategoria(CATEGORIAS_COMPROMISSO, id);
        return { label: c.label, cor: c.cor };
      },
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só lê periodo
    [ativas, cobramNoPeriodo, periodo],
  );

  // As cobranças DO MÊS escolhido, na ordem do dia; fora de um mês, as
  // próximas de cada regra.
  /**
   * A rosca conta REGRAS, a barra soma DINHEIRO. Duas perguntas no mesmo
   * painel: "onde está o meu dinheiro" e "de quantas coisas eu cuido". Uma
   * assinatura de R$ 12 e o aluguel de R$ 8.000 pesam igual aqui.
   */
  const quantasPorCategoria = useMemo(
    () => fatias(
      ehMes(periodo) ? cobramNoPeriodo : ativas,
      (r) => r.categoria,
      () => 1,
      (id) => {
        const c = acharCategoria(CATEGORIAS_COMPROMISSO, id);
        return { label: c.label, cor: c.cor };
      },
    ),
    [ativas, cobramNoPeriodo, periodo],
  );

  const proximas = useMemo(
    () => (ehMes(periodo) ? cobramNoPeriodo : ativas)
      .map((r) => ({ regra: r, vencimento: vencimentoNoPeriodo(r) }))
      // 'AAAA-MM-DD' ordena igual como texto — não precisa virar Date para isso.
      .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `vencimentoNoPeriodo` só lê periodo
    [ativas, cobramNoPeriodo, periodo],
  );

  async function salvar() {
    if (!rascunho) return;
    setSalvando(true);
    setErro("");
    try {
      const corpo = {
        descricao: rascunho.descricao,
        categoria: rascunho.categoria,
        valor: Number(rascunho.valor.replace(",", ".")) || 0,
        valor_variavel: rascunho.valor_variavel,
        periodicidade: rascunho.periodicidade,
        intervalo_meses: Number(rascunho.intervalo_meses) || 1,
        dia_vencimento: diaDoVencimento(rascunho.dia_vencimento, rascunho.inicio),
        inicio: rascunho.inicio,
        fim: rascunho.fim || null,
        conta_id: rascunho.conta_id || null,
        fornecedor_id: rascunho.fornecedor_id || null,
        contato_id: rascunho.contato_id || null,
        forma_pagamento: rascunho.forma_pagamento || null,
        ...(!rascunho.id ? { lancar_primeira: rascunho.lancar_primeira } : {}),
      };
      if (rascunho.id) await chamar(`/api/financeiro/recorrencias/${rascunho.id}`, "PATCH", corpo);
      else {
        const alvo = rascunho.empresa_id || empresaId;
        if (!alvo) { setErro("Escolha em qual empresa a recorrência nasce."); setSalvando(false); return; }
        const criada = await chamar("/api/financeiro/recorrencias", "POST", { empresa_id: alvo, ...corpo });
        if (fotoPendente && typeof criada.id === "string") {
          const erroFoto = await enviarMarca("recorrencia", criada.id, fotoPendente);
          if (erroFoto) toast.erro(`Recorrência salva, mas a foto não subiu: ${erroFoto}`);
        }
      }
      setFotoPendente(null);
      setRascunho(null);
      toast.ok("Recorrência salva.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSalvando(false);
    }
  }

  async function mudarStatus(id: string, novo: RecorrenciaStatus) {
    if (novo === "encerrada" && !(await confirmar("Encerrar esta recorrência?", {
      detalhe: "Ela para de gerar novos compromissos. Os que já existem continuam na agenda.",
    }))) return;
    setSalvando(true);
    setErro("");
    try {
      await chamar(`/api/financeiro/recorrencias/${id}`, "PATCH", { status: novo });
      setRascunho(null);
      toast.ok(novo === "ativa" ? "Recorrência retomada."
        : novo === "pausada" ? "Recorrência pausada." : "Recorrência encerrada.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSalvando(false);
    }
  }

  async function gerar() {
    setGerando(true);
    try {
      // Em "Visão geral" não há UMA empresa: gera para cada uma, em sequência.
      // Uma chamada por empresa e não uma "gerar tudo" na rota: a rota já
      // confere o acesso empresa a empresa, e é isso que deve continuar valendo.
      const alvos = empresaId ? [empresaId] : empresas.map((e) => e.id);
      let r: Record<string, unknown> = { criados: 0 };
      for (const alvo of alvos) {
        const parcial = await chamar("/api/financeiro/recorrencias/gerar", "POST", { empresa_id: alvo });
        r = { ...parcial, criados: Number(r.criados ?? 0) + Number(parcial.criados ?? 0) };
      }
      const criados = Number(r.criados ?? 0);
      setUltimaGeracao(criados);
      toast.ok(criados === 0 ? "Nada novo para criar." : criados === 1
        ? "1 compromisso criado." : `${criados} compromissos criados.`);
      router.refresh();
    } catch (e) {
      toast.erro(recado(e));
    } finally {
      setGerando(false);
    }
  }

  /** As colunas da lista — as mesmas nos dois modos de ver. */
  const colunasDaTabela: Coluna<Recorrencia>[] = [
    {
      chave: "descricao", label: "Descrição", largura: "minmax(min(100%, 140px), 1.8fr)", titulo: true,
      celula: (r) => (
        <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <Marca
            marca={marcaDaRegra(r)}
            tamanho={28}
            raio={8}
          />
          {/* A CONTA desce pra segunda linha: como coluna ela custava 84px
              de largura mínima e fazia a tabela rolar de lado dentro do cartão
              da empresa. A PERIODICIDADE saiu de vez da visualização (set/2026,
              "pouco importa na visualização") — continua no CSV exportado e
              na ficha da regra, onde é decisão e não enfeite. */}
          <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <span style={{ overflowWrap: "anywhere" }}>{r.descricao}</span>
            {r.conta_id && nomeDaConta.get(r.conta_id) && (
              <small style={{ fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {nomeDaConta.get(r.conta_id)}
              </small>
            )}
          </span>
        </span>
      ),
    },
    {
      chave: "categoria", label: "Categoria", largura: "minmax(min(100%, 78px), 1fr)",
      celula: (r) => {
      const c = acharCategoria(CATEGORIAS_COMPROMISSO, r.categoria);
      return <Etiqueta texto={c.label} cor={c.cor} />;
    },
    },
    {
      chave: "vencimento", label: ehMes(periodo) ? "Vencimento" : "Próximo vencimento", largura: "minmax(min(100%, 76px), 1fr)", fim: true,
      celula: (r) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{dataBR(vencimentoNoPeriodo(r), { curta: true })}</span>
      ),
    },
    {
      chave: "valor", label: "Valor", largura: "minmax(min(100%, 84px), 0.9fr)", fim: true,
      celula: (r) => <strong style={{ fontVariantNumeric: "tabular-nums" }}>{moeda(r.valor)}</strong>,
    },
    {
      chave: "status", label: "Status", largura: "82px", fim: true,
      celula: (r) => <Selo selo={SELO_RECORRENCIA[r.status]} />,
    },
  ];

  return (
    <>
      <Cabecalho
        titulo="Recorrências"
        sub="Acompanhe e gerencie todas as suas cobranças recorrentes em um só lugar."
        busca={busca}
        aoBuscar={setBusca}
        acoes={
          <>
            <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} hoje={hoje} />
            {podeEscrever && (
              <>
                <BotaoFin icone="plus" primario onClick={() => { setErro(""); setRascunho(novoRascunho(podeLancarPrimeira)); }}>
                  Nova recorrência
                </BotaoFin>
                <BotaoFin
                  icone={gerando ? "loader" : "calendar-plus"}
                  onClick={gerando ? undefined : gerar}
                  titulo="Criar os compromissos que ainda faltam"
                >
                  Gerar compromissos
                </BotaoFin>
              </>
            )}
            {/* Exportar não pede permissão de escrita: quem enxerga a tela pode
                levar o que está nela. As linhas são as JÁ FILTRADAS. */}
            <BotaoExportar
              assunto="Recorrências"
              empresa={empresaNome}
              linhas={lista}
              colunas={[
                { cabecalho: "Descrição", valor: (r) => r.descricao },
                { cabecalho: "Categoria", valor: (r) => acharCategoria(CATEGORIAS_COMPROMISSO, r.categoria).label },
                { cabecalho: "Periodicidade", valor: (r) => ritmo(r) },
                { cabecalho: ehMes(periodo) ? "Vencimento" : "Próximo vencimento", valor: (r) => dataCSV(vencimentoNoPeriodo(r)) },
                { cabecalho: "Valor", valor: (r) => numeroCSV(r.valor) },
                { cabecalho: "Equivalente mensal", valor: (r) => numeroCSV(equivalenteMensal(r)) },
                { cabecalho: "Conta", valor: (r) => (r.conta_id ? nomeDaConta.get(r.conta_id) ?? "" : "") },
                { cabecalho: "Status", valor: (r) => SELO_RECORRENCIA[r.status].label },
                { cabecalho: "Início", valor: (r) => dataCSV(r.inicio) },
                { cabecalho: "Fim", valor: (r) => dataCSV(r.fim) },
              ]}
            />
          </>
        }
      />

      {schemaPendente && <AvisoSchema />}

      <LinhaKpi>
        <KpiSeta
          icone="refresh"
          rotulo="Recorrências ativas"
          valor={String(ativas.length)}
          detalhe={`de ${regras.length} ${regras.length === 1 ? "recorrência" : "recorrências"}`}
          aoAbrir={() => setStatus("ativa")}
          tituloDaSeta="Ver as ativas"
        />
        <KpiSeta
          icone="cash"
          rotulo={ehMes(periodo) ? `Cobranças · ${rotuloDoPeriodo}` : "Valor recorrente por mês"}
          valor={moeda(ehMes(periodo) ? totalDoPeriodo : mensal)}
          tom="ok"
          detalhe={ehMes(periodo)
            ? `${cobramNoPeriodo.length} ${cobramNoPeriodo.length === 1 ? "cobrança neste mês" : "cobranças neste mês"}`
            : "anual e trimestral rateadas"}
          aoAbrir={() => { setStatus(""); setPeriodo(periodoPadrao); }}
          tituloDaSeta="Ver as cobranças do mês"
        />
        <KpiSeta
          icone="calendar-event"
          rotulo="Próximos vencimentos"
          valor={String(vencemNaJanela)}
          detalhe="nos próximos 30 dias"
          aoAbrir={() => setStatus("ativa")}
          tituloDaSeta="Ver o que vence"
        />
        <KpiSeta
          icone="clock"
          rotulo="Renovações em 30 dias"
          valor={String(renovamNaJanela)}
          tom={renovamNaJanela ? "atencao" : "neutro"}
          detalhe={renovamNaJanela ? "contratos acabando" : "nenhum contrato acabando"}
        />
      </LinhaKpi>

      {/* Os painéis em CIMA, na horizontal: a lista precisa da largura inteira
          pra virar um cartão por empresa. */}
      <FaixaDePaineis largura={300}>
        <Cartao>
          <TituloCartao icone="chart-bar">
            {ehMes(periodo) ? `Por categoria · ${rotuloDoPeriodo}` : "Por categoria (peso mensal)"}
          </TituloCartao>
          <Barras fatias={porCategoria} />
        </Cartao>

        <Cartao>
          <TituloCartao icone="chart-pie">Distribuição de recorrências</TituloCartao>
          <Rosca
            fatias={quantasPorCategoria}
            total={String(ehMes(periodo) ? cobramNoPeriodo.length : ativas.length)}
            rotuloTotal="recorrências"
            tamanho={150}
            formatar={(v) => String(v)}
          />
        </Cartao>

        <PainelRolante
          icone="calendar-event"
          titulo="Próximos vencimentos"
          direita={<VerTudo href="/financeiro/compromissos" />}
          rodape={<BotaoLargo href="/financeiro/compromissos">Ver todas as cobranças</BotaoLargo>}
        >
            <Agenda
              itens={proximas.slice(0, 6).map(({ regra, vencimento }) => ({
                chave: regra.id,
                vencimento,
                titulo: regra.descricao,
                sub: acharCategoria(CATEGORIAS_COMPROMISSO, regra.categoria).label,
                valor: regra.valor,
                atrasado: vencimento < hoje,
                aoAbrir: () => { setErro(""); setRascunho(daRegra(regra)); },
              }))}
              vazio={
                <Vazio
                  compacto
                  icone="calendar-off"
                  titulo="Nenhuma cobrança prevista"
                  detalhe="Só recorrência ativa entra aqui — pausada e encerrada não geram mais nada."
                />
              }
            />
        </PainelRolante>
      </FaixaDePaineis>

      <Cartao>
          <TituloCartao
            icone="list"
            direita={
              <TrocaDeVisao
                valor={visao}
                aoTrocar={setVisao}
                opcoes={[
                  { id: "cartoes", icone: "layout-grid", titulo: "Ver por empresa" },
                  { id: "lista", icone: "layout-list", titulo: "Ver como tabela" },
                ]}
              />
            }
          >
            Lista de recorrências
          </TituloCartao>
          <p style={{ marginTop: -10, marginBottom: 14, fontSize: 12, color: "var(--text-dim)" }}>
            {geral ? "Organizadas por empresa para facilitar sua visualização." : `${empresaNome} · ${rotuloDoPeriodo.toLocaleLowerCase("pt-BR")}`}
          </p>
          <BuscaDaLista valor={busca} aoBuscar={setBusca} placeholder="Buscar recorrências…" />

          <Filtros>
            <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} hoje={hoje} />
            <Filtro rotulo="Categoria" valor={categoria} aoMudar={setCategoria} opcoes={opcoesCategoria} />
            <Filtro rotulo="Periodicidade" valor={periodicidade} aoMudar={setPeriodicidade} opcoes={opcoesPeriodicidade} />
            <Filtro rotulo="Conta" valor={conta} aoMudar={setConta} opcoes={opcoesConta} />
            <Filtro rotulo="Status" valor={status} aoMudar={setStatus} opcoes={opcoesStatus} />
            <LimparFiltros ativo={temFiltro} aoLimpar={limparFiltros} />
          </Filtros>

          {/* A linha inteira abre o painel — é lá que moram Pausar, Retomar e
              Encerrar, junto do formulário. Um menu "⋮" por linha não cabe
              aqui: a linha JÁ é um <button>, e botão dentro de botão é HTML
              inválido — o clique no menu viraria clique na linha. */}
          {(geral && blocos.length === 0) && (
            <Vazio
              icone="refresh"
              titulo={regras.length ? (ehMes(periodo) ? `Nada cobra em ${rotuloDoPeriodo.toLocaleLowerCase("pt-BR")}` : "Nada com esses filtros") : "Nenhuma recorrência cadastrada"}
              detalhe="Troque o mês nas setas ou limpe os filtros."
            />
          )}
          {emFoco && (
            <Botao ref={voltarRef} icone="chevron-left" onClick={() => setEmpresaFoco("")} style={{ marginBottom: 10 }}>
              Voltar para todas as empresas
            </Botao>
          )}
          {visao === "cartoes" ? (
          <GradeDeEmpresas>
          {blocos.map((b) => {
            const mostrando = Math.min(b.itens.length, limiteDoBloco(b.empresa.id));
            return (
            <CartaoEmpresa
              key={b.empresa.id || "unica"}
              nome={b.empresa.nome || empresaNome}
              contagem={`${b.itens.length} ${b.itens.length === 1 ? "recorrência" : "recorrências"}`}
              total={`${moeda(b.itens.filter((r) => r.status === "ativa").reduce((t, r) => t + r.valor, 0))} / mês`}
              acao={geral && !emFoco && b.itens.length > POR_BLOCO
                ? <BotaoFin icone="arrow-right" onClick={() => setEmpresaFoco(b.empresa.id)}>Ver tudo</BotaoFin>
                : undefined}
              rodape={
                mostrando < b.itens.length ? (
                  <BotaoLargo onClick={() => setEmpresaFoco(b.empresa.id)}>
                    Ver todas as {b.itens.length} recorrências
                  </BotaoLargo>
                ) : (
                  <small style={{ display: "block", fontSize: 12, color: "var(--text-dim)" }}>
                    Mostrando {mostrando} de {b.itens.length} {b.itens.length === 1 ? "recorrência" : "recorrências"}
                  </small>
                )
              }
            >
              {b.itens.length === 0 ? (
                <Vazio compacto icone="refresh" titulo="Nenhuma recorrência cadastrada para esta empresa" />
              ) : (
                <Tabela
                  linhas={b.itens.slice(0, limiteDoBloco(b.empresa.id))}
                  // Página só quando o cartão está ABERTO (empresa em foco, ou
                  // uma empresa só): fechado ele mostra 5 linhas e o rodapé já
                  // diz "5 de 11" — dois contadores diriam a mesma coisa duas
                  // vezes, com números diferentes.
                  paginar={limiteDoBloco(b.empresa.id) > POR_BLOCO ? 10 : undefined}
                  chaveDe={(r) => r.id}
                  rotuloItem="recorrências"
                  aoClicar={(r) => { setErro(""); setRascunho(daRegra(r)); }}
                  vazio={
                    <Vazio
                      icone="refresh"
                      titulo={regras.length ? (ehMes(periodo) ? `Nada cobra em ${rotuloDoPeriodo.toLocaleLowerCase("pt-BR")}` : "Nada com esses filtros") : "Nenhuma recorrência cadastrada"}
                      detalhe="Assinaturas, aluguel e contratos fixos entram aqui uma vez e viram compromisso todo mês."
                      acao={podeEscrever && !regras.length
                        ? <BotaoFin icone="plus" onClick={() => setRascunho(novoRascunho(podeLancarPrimeira))}>Nova recorrência</BotaoFin>
                        : undefined}
                    />
                  }
              colunas={colunasDaTabela}
                />
              )}
            </CartaoEmpresa>
            );
          })}
          </GradeDeEmpresas>
          ) : (
            <Tabela
              linhas={lista}
              chaveDe={(r) => r.id}
              paginar={10}
              rotuloItem="recorrências"
              aoClicar={(r) => { setErro(""); setRascunho(daRegra(r)); }}
              vazio={<Vazio icone="refresh" titulo="Nada com esses filtros" detalhe="Troque o mês nas setas ou limpe os filtros." />}
              colunas={colunasDaTabela}
            />
          )}
          {ultimaGeracao !== null && (
            <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
              {ultimaGeracao === 0 ? "Na última geração não faltava nenhum compromisso."
                : ultimaGeracao === 1 ? "Na última geração nasceu 1 compromisso."
                : `Na última geração nasceram ${ultimaGeracao} compromissos.`}
            </p>
          )}
      </Cartao>



      {rascunho && (
        <PainelLateral
          centrado
          titulo={rascunho.id ? "Editar recorrência" : "Nova recorrência"}
          soFechaNoX
          subtitulo="A regra gera os compromissos; ela mesma nunca é paga."
          onFechar={() => setRascunho(null)}
          largura={520}
          rodape={
            <Acoes>
              <Botao onClick={() => setRascunho(null)}>Cancelar</Botao>
              {emEdicao && (
                <Botao
                  icone={emEdicao.status === "ativa" ? "clock" : "refresh"}
                  onClick={() => mudarStatus(emEdicao.id, emEdicao.status === "ativa" ? "pausada" : "ativa")}
                  disabled={salvando}
                >
                  {emEdicao.status === "ativa" ? "Pausar" : "Retomar"}
                </Botao>
              )}
              {emEdicao && (
                // Encerrar guarda a história; apagar some com a regra. A rota
                // recusa apagar o que já gerou compromisso, e diz isso.
                <BotaoApagar
                  tipo="recorrencia" id={emEdicao.id} nome={emEdicao.descricao}
                  aoApagar={() => { setRascunho(null); router.refresh(); }}
                />
              )}
              {emEdicao && emEdicao.status !== "encerrada" && (
                <Botao variante="perigo" icone="ban" onClick={() => mudarStatus(emEdicao.id, "encerrada")} disabled={salvando}>
                  Encerrar
                </Botao>
              )}
              {emEdicao && (
                <Botao icone="calendar-event" onClick={() => {
                  window.location.href = `/financeiro/compromissos?recorrencia=${encodeURIComponent(emEdicao.id)}`;
                }}>
                  Ver compromissos
                </Botao>
              )}
              <Esp />
              {podeEscrever && (
                <Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar</Botao>
              )}
            </Acoes>
          }
        >
          <CampoMarca
            tipo="recorrencia"
            id={rascunho.id}
            nome={rascunho.descricao || "Recorrência"}
            logo={rascunho.id ? logos[rascunho.id] ?? null : null}
            icone="refresh"
            aoTrocar={() => router.refresh()}
            aoEscolherPendente={setFotoPendente}
          />

          {erro && (
            <p style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
          )}

          <SoLeitura ativo={!podeEscrever} motivo="Você abre a regra, mas não edita: falta a permissão de cadastros do Financeiro.">
          <Campos>
            {!rascunho.id && !empresaId && empresas.length > 0 && (
              <Campo label="Empresa" largo dica="Em “Visão geral” a recorrência precisa dizer em qual empresa nasce.">
                {(id) => (
                  <SeletorEmpresa id={id} empresas={empresas} valor={rascunho.empresa_id}
                    aoMudar={(v) => setRascunho({
                      ...rascunho, empresa_id: v, contato_id: "", fornecedor_id: "",
                    })} />
                )}
              </Campo>
            )}
            <Campo label="Descrição" largo>
              {(id) => (
                <input
                  id={id}
                  value={rascunho.descricao}
                  onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
                  placeholder="Aluguel do galpão"
                />
              )}
            </Campo>

            <Campo label="Categoria">
              {(id) => (
                <Escolha
                  id={id}
                  valor={rascunho.categoria}
                  vazio="Outros"
                  placeholder="Buscar categoria…"
                  aoEscolher={(v) => setRascunho({ ...rascunho, categoria: v || "outros" })}
                  opcoes={CATEGORIAS_COMPROMISSO.map((c) => ({ id: c.id, nome: c.label }))}
                />
              )}
            </Campo>

            <Campo
              label={rascunho.valor_variavel ? "Valor estimado" : "Valor"}
              dica={rascunho.valor_variavel
                ? "Aparece no “a pagar” enquanto o número do mês não chega."
                : undefined}
            >
              {(id) => (
                <input
                  id={id}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={rascunho.valor}
                  onChange={(e) => setRascunho({ ...rascunho, valor: e.target.value })}
                  placeholder="0,00"
                />
              )}
            </Campo>

            {/* VALOR QUE MUDA TODO MÊS — luz, água, cartão, comissão.
                Com um valor só, a regra obriga a escolher entre duas mentiras:
                repetir o número do mês passado (a agenda mostra algo que
                ninguém combinou) ou deixar zero (o "a pagar" some, e previsão
                que engana PARA MENOS é a pior direção, porque ninguém
                desconfia dela). Ligado, o valor vira estimativa declarada: a
                linha aparece marcada como palpite até alguém informar o
                número, e aí a marca some. */}
            <Campo label="Como é o valor" largo>
              {() => (
                // `flex: 1` + `minWidth: 0` no texto: sem isso ele encolhe até
                // a menor palavra dentro da linha flex e sai UMA POR LINHA —
                // foi assim que este bloco nasceu, ocupando meia tela.
                <label
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    minHeight: "var(--tap)", padding: "10px 0", cursor: "pointer", minWidth: 0,
                  }}
                >
                  <Caixa marcado={rascunho.valor_variavel} onChange={(marc) => setRascunho({ ...rascunho, valor_variavel: marc })} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5 }}>
                    Muda todo mês
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                      A conta nasce com o valor estimado e marcada como palpite. Informe o número
                      de cada mês na ficha da regra, e ele passa a valer.
                    </span>
                  </span>
                </label>
              )}
            </Campo>

            <Campo label="Periodicidade">
              {(id) => (
                <Escolha
                  id={id}
                  valor={rascunho.periodicidade}
                  vazio="Mensal"
                  placeholder="Buscar…"
                  aoEscolher={(v) => setRascunho({ ...rascunho, periodicidade: (v || "mensal") as Periodicidade })}
                  opcoes={PERIODICIDADES.map((x) => ({ id: x, nome: LABEL_PERIODICIDADE[x] }))}
                />
              )}
            </Campo>

            {rascunho.periodicidade === "customizada" && (
              <Campo label="A cada quantos meses">
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min="1"
                    max="60"
                    inputMode="numeric"
                    value={rascunho.intervalo_meses}
                    onChange={(e) => setRascunho({ ...rascunho, intervalo_meses: e.target.value })}
                  />
                )}
              </Campo>
            )}

            <Campo label="Dia do vencimento" dica="Acompanha o início; mude só se a cobrança cair em outro dia. Dia 31 vira o último dia nos meses que não têm 31.">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min="1"
                  max="31"
                  inputMode="numeric"
                  value={rascunho.dia_vencimento || String(diaDoVencimento("", rascunho.inicio))}
                  onChange={(e) => setRascunho({ ...rascunho, dia_vencimento: e.target.value })}
                />
              )}
            </Campo>

            <Campo label="Início">
              {(id) => (
                <input id={id} type="date" value={rascunho.inicio} onChange={(e) => setRascunho({ ...rascunho, inicio: e.target.value })} />
              )}
            </Campo>

            <Campo label="Fim" dica="Deixe em branco enquanto o contrato não tem data para acabar.">
              {(id) => (
                <input id={id} type="date" value={rascunho.fim} onChange={(e) => setRascunho({ ...rascunho, fim: e.target.value })} />
              )}
            </Campo>

            <Campo label="Conta de pagamento" dica="Sugestão para a baixa; dá para trocar na hora de pagar.">
              {(id) => (
                <Escolha
                  id={id}
                  valor={rascunho.conta_id}
                  vazio="Sem conta definida"
                  placeholder="Buscar banco ou cartão…"
                  aoEscolher={(v) => setRascunho({ ...rascunho, conta_id: v })}
                  opcoes={contas.map((c) => ({ id: c.id, nome: c.nome, marca: { nome: c.nome, icone: "wallet" } }))}
                />
              )}
            </Campo>

            {/* A apresentação é única, mas os valores codificados preservam as
                duas FKs do gerador e da criação cruzada. */}
            <Campo
              label="Relacionado a"
              dica={empresaDoFormulario ? "Opcional — pessoa, empresa ou fornecedor." : "Escolha primeiro a empresa proprietária."}
            >
              {(id) => (
                // Foto e nome vêm do contato, e a lista se pesquisa. Num
                // `<select>` nativo o nome é tudo o que existe: dez
                // fornecedores viram dez linhas de texto iguais, e reconhecer
                // uma marca é mais rápido do que ler.
                <Escolha
                  id={id}
                  valor={relacionadoDoFormulario}
                  disabled={!empresaDoFormulario}
                  vazio="Sem relacionado"
                  placeholder="Buscar pessoa, empresa ou fornecedor…"
                  aoEscolher={escolherRelacionado}
                  rotuloCriar="Criar contato"
                  aoCriar={criarContato}
                  opcoes={[
                    ...pessoasDoFormulario.map((x) => ({
                      id: `contato:${x.id}`, nome: x.nome, grupo: "Pessoas",
                      marca: { nome: x.nome, logo: x.logo_url ? logosRelacionados[x.logo_url] ?? null : null, icone: "user" },
                    })),
                    ...organizacoesDoFormulario.map((x) => ({
                      id: `contato:${x.id}`, nome: x.nome, grupo: "Empresas",
                      marca: { nome: x.nome, logo: x.logo_url ? logosRelacionados[x.logo_url] ?? null : null, icone: "building-warehouse" },
                    })),
                    ...fornecedoresDoFormulario.map((x) => ({
                      id: `fornecedor:${x.id}`, nome: x.nome, grupo: "Fornecedores",
                      marca: { nome: x.nome, logo: x.logo_url ? logosRelacionados[x.logo_url] ?? null : null, icone: "truck" },
                    })),
                  ]}
                />
              )}
            </Campo>

            {rascunho.id && rascunho.valor_variavel && (
              <Campo label="Valor de cada mês" largo dica="O número informado vence a estimativa e tira a marca de palpite.">
                {() => <ValoresPorMes recorrenciaId={rascunho.id as string} estimativa={rascunho.valor} />}
              </Campo>
            )}

            {/* VER A FICHA INTEIRA sem sair daqui.
                O seletor mostra nome e foto — o que basta para escolher, e não
                para conferir. Quem lança um aluguel quer olhar o telefone e o
                PIX do locador antes de salvar, e o caminho era decorar o nome,
                abrir Contatos noutra aba e procurar. O atalho abre a ficha já
                no cadastro certo (`?editar=<id>`), o mesmo endereço que
                Patrimônio e Compromissos já usam. */}
            {contatoRelacionado && (
              <Campo label="Ficha do relacionado" largo>
                {() => (
                  <BotaoFin
                    icone="external-link"
                    href={`/financeiro/cadastros/contatos?editar=${encodeURIComponent(contatoRelacionado)}`}
                  >
                    Abrir cadastro completo
                  </BotaoFin>
                )}
              </Campo>
            )}


            <Campo label="Forma de pagamento">
              {(id) => (
                <input
                  id={id}
                  value={rascunho.forma_pagamento}
                  onChange={(e) => setRascunho({ ...rascunho, forma_pagamento: e.target.value })}
                  placeholder="PIX, boleto, débito automático…"
                  list="fin-formas-pagamento"
                />
              )}
            </Campo>

          </Campos>

          {!rascunho.id && podeLancarPrimeira && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", marginTop: 14, cursor: "pointer" }}>
              <Caixa marcado={rascunho.lancar_primeira} onChange={(marc) => setRascunho({ ...rascunho, lancar_primeira: marc })} />
              <span>
                <strong style={{ display: "block" }}>Lançar a primeira ocorrência agora</strong>
                <small style={{ color: "var(--text-dim)" }}>Desligado, ela aparece como previsão em Compromissos.</small>
              </span>
            </label>
          )}

          <datalist id="fin-formas-pagamento">
            {/* As formas da configuração primeiro, depois as que a tela sempre
                sugeriu — sem repetir. Sugestão, não prisão: texto livre vale. */}
            {[...new Set([...formasDePagamento, "PIX", "Boleto", "Débito automático", "Cartão de crédito", "Transferência"])].map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
          </SoLeitura>

          <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
            Pausar suspende a cobrança daqui pra frente — não adia os meses parados nem apaga o que
            já foi gerado. Encerrar é o fim do contrato: a regra fica no cadastro para explicar os
            compromissos antigos.
          </p>
        </PainelLateral>
      )}
    </>
  );
}

/**
 * Os valores mês a mês de uma regra que varia.
 *
 * Existe porque a alternativa é pior: sem lugar para informar o número, a
 * pessoa espera a conta nascer com a estimativa e edita o compromisso um por
 * um — e aí a REGRA continua sem saber, então o mês seguinte repete o palpite.
 * Aqui o número mora na regra, e é ela que alimenta a agenda.
 *
 * Carrega sob demanda: a lista só viaja quando alguém abre uma regra variável,
 * que é a minoria. Fazer a página inteira trazer isso seria uma consulta a mais
 * em toda abertura para servir um caso raro.
 */
function ValoresPorMes({ recorrenciaId, estimativa }: { recorrenciaId: string; estimativa: string }) {
  // A tela inteira usa `router.refresh()`; seguir o mesmo caminho evita dois
  // jeitos de recarregar convivendo no mesmo arquivo.
  const router = useRouter();
  const [linhas, setLinhas] = useState<{ competencia: string; valor: number }[] | null>(null);
  const [pendente, setPendente] = useState(false);
  const [mes, setMes] = useState("");
  const [valor, setValor] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/financeiro/recorrencias/${recorrenciaId}/valores`);
      const d = (await r.json().catch(() => ({}))) as {
        valores?: { competencia: string; valor: number }[]; pendente?: boolean; erro?: string;
      };
      if (d.erro) { setErro(d.erro); setLinhas([]); return; }
      setLinhas(d.valores ?? []);
      setPendente(!!d.pendente);
    } catch {
      setErro("Não deu para ler os valores.");
      setLinhas([]);
    }
  }, [recorrenciaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  async function informar() {
    if (!mes) { setErro("Escolha o mês."); return; }
    setOcupado(true); setErro("");
    try {
      const r = await fetch(`/api/financeiro/recorrencias/${recorrenciaId}/valores`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ competencia: mes, valor: Number(valor.replace(",", ".")) || 0 }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string; aviso?: string };
      if (!r.ok) { setErro(d.erro ?? "Não deu para guardar."); return; }
      if (d.aviso) toast.erro(d.aviso); else toast.ok("Valor do mês guardado.");
      setMes(""); setValor("");
      await carregar();
      // A agenda muda junto: o compromisso daquele mês passa a valer o número.
      router.refresh();
    } finally {
      setOcupado(false);
    }
  }

  async function esquecer(competencia: string) {
    setOcupado(true);
    try {
      await fetch(
        `/api/financeiro/recorrencias/${recorrenciaId}/valores?competencia=${competencia.slice(0, 7)}`,
        { method: "DELETE" },
      );
      await carregar();
    } finally { setOcupado(false); }
  }

  if (linhas === null) {
    return <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Carregando os meses…</p>;
  }

  return (
    <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
      {pendente && (
        <p style={{ fontSize: 12.5, color: "var(--alerta-texto, var(--text-dim))", lineHeight: 1.5 }}>
          Falta rodar <code>supabase/financeiro_recorrencia_variavel.sql</code> para guardar valores por mês.
          Até lá a regra usa sempre a estimativa.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          aria-label="Mês"
          style={{ flex: "1 1 150px", minWidth: 0 }}
        />
        <input
          type="number" step="0.01" min="0" inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={estimativa ? `Estimado ${moeda(Number(estimativa) || 0)}` : "0,00"}
          aria-label="Valor deste mês"
          style={{ flex: "1 1 130px", minWidth: 0 }}
        />
        <BotaoFin icone="check" onClick={() => void informar()}>
          {ocupado ? "Guardando…" : "Informar"}
        </BotaoFin>
      </div>

      {erro && (
        <p role="alert" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }}>{erro}</p>
      )}

      {linhas.length === 0 ? (
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Nenhum mês informado ainda — todos usam a estimativa.
        </p>
      ) : (
        <ul style={{ display: "grid", gap: 4, listStyle: "none" }}>
          {linhas.map((l) => (
            <li
              key={l.competencia}
              style={{
                display: "flex", alignItems: "center", gap: 10, minHeight: 38,
                padding: "0 10px", borderRadius: 9, background: "var(--surface)", minWidth: 0,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                {l.competencia.slice(5, 7)}/{l.competencia.slice(0, 4)}
              </span>
              <strong style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{moeda(Number(l.valor))}</strong>
              <BotaoFin icone="trash" onClick={() => void esquecer(l.competencia)}>Tirar</BotaoFin>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
