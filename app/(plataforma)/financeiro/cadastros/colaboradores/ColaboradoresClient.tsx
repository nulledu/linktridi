"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../Icon";
import { Switch } from "../../../Switch";
import { confirmar, toast } from "../../../Toast";
import { Acoes, Botao, BotaoIcone, Campo, Campos, Esp, PainelLateral, Caixa } from "../../../ui/controles";
import { duracaoCss } from "../../../ui/micro";
import { useBuscaAtual } from "../../../ui/useBuscaAtual";
import { RolagemPresa, type ControleRolagem } from "../../../ui/RolagemPresa";
import { corDaSerie, curto } from "../../../ui/graficos";
import { AvisoSchema, BotaoFin, Cabecalho, Cartao, Filtro, LimparFiltros, Kpi, LinhaKpi, Rosca, Vazio, SeletorEmpresa, enviarMarca, CampoMarca, Escolha, Alternativas, BotaoApagar, Marca, Filtros, Selo, Tabela } from "../../ui";
import { dataBR, hojeISO, moeda } from "@/lib/financeiro/calculos";
import {
  AUTOMATICO_DESDE, bonusDoMes, comissaoDoMes, COMISSAO_PARTES, dataLimiteDePagamento, descontoPorFaltas,
  entradaAutomatica, LABEL_VINCULO, liquidoDoMes, mercadinhoAutomatico, podeComissaoDeVendas,
  nomeCurto, horasLegiveis, VINCULOS, type AutoParte, type FolhaDoMes, type PontoDaPessoa, type Vinculo,
} from "@/lib/financeiro/folha-mensal";
import { montarCSV, nomeDoArquivo } from "@/lib/financeiro/csv";
import { montarXLSX } from "@/lib/financeiro/xlsx";

import {
  COLABORADOR_STATUS, LANCAMENTO, LANCAMENTO_TIPOS, SELO_COLABORADOR,
  type Colaborador, type ColaboradorStatus, type FolhaLancamento, type LancamentoTipo,
} from "@/lib/financeiro/tipos";
import type { ComissaoCalculada } from "@/lib/comissao-gestor-servidor";

interface Rascunho {
  id: string | null;
  /** Em "Visão geral" a tela não tem empresa: a pessoa nova pergunta. */
  empresa_id: string;
  nome: string; setor: string; cargo: string;
  /** CLT, MEI, PF ou Estágio. */
  vinculo: string;
  salario_base: string; beneficios: string; dia_pagamento: string;
  admissao: string; status: ColaboradorStatus;
  /** A pessoa do ERP, quando existe. Vazio para quem só está na folha. */
  employee_id: string;
  /** Fixo mensal, somado ao salário — diferente do bônus, que é do mês. */
  gratificacao: string;
  valor_hora: string;
  /** A conta DA EMPRESA que paga esta pessoa (não a conta dela). */
  conta_id: string;
  banco: string; agencia: string; conta_numero: string;
  pix_tipo: string; pix_chave: string; whatsapp: string;
}

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

const VAZIO_EXTRA = {
  employee_id: "", gratificacao: "", valor_hora: "", conta_id: "",
  banco: "", agencia: "", conta_numero: "", pix_tipo: "", pix_chave: "", whatsapp: "",
};

const novoRascunho = (diaPadrao = 5): Rascunho => ({
  id: null, empresa_id: "", nome: "", setor: "", cargo: "", vinculo: "",
  salario_base: "", beneficios: "", dia_pagamento: String(diaPadrao),
  admissao: hojeISO(), status: "ativo",
  ...VAZIO_EXTRA,
});

const daPessoa = (c: Colaborador): Rascunho => ({
  id: c.id, empresa_id: c.empresa_id, nome: c.nome, setor: c.setor ?? "", cargo: c.cargo ?? "", vinculo: c.vinculo ?? "",
  salario_base: String(c.salario_base), beneficios: String(c.beneficios),
  dia_pagamento: c.dia_pagamento == null ? "" : String(c.dia_pagamento),
  admissao: c.admissao ?? "", status: c.status,
  employee_id: c.employee_id ?? "",
  // Zero vira campo VAZIO, e não "0": um "0" escrito num campo de dinheiro
  // parece valor combinado, e a pessoa não sabe se é assim mesmo ou se alguém
  // digitou. Vazio lê como "não tem".
  gratificacao: c.gratificacao ? String(c.gratificacao) : "",
  valor_hora: c.valor_hora ? String(c.valor_hora) : "",
  conta_id: c.conta_id ?? "",
  banco: c.banco ?? "", agencia: c.agencia ?? "", conta_numero: c.conta_numero ?? "",
  pix_tipo: c.pix_tipo ?? "", pix_chave: c.pix_chave ?? "", whatsapp: c.whatsapp ?? "",
});

/** Os cinco tipos que o Banco Central aceita — o resto é digitação errada. */
const PIX_TIPOS = [
  { id: "cpf", label: "CPF" },
  { id: "cnpj", label: "CNPJ" },
  { id: "email", label: "E-mail" },
  { id: "telefone", label: "Telefone" },
  { id: "aleatoria", label: "Chave aleatória" },
];

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** 'AAAA-MM' → 'agosto de 2026'. O <input type="month"> fala AAAA-MM; gente não. */
function competenciaBR(am: string): string {
  const [ano, mes] = am.split("-").map(Number);
  return MESES[mes - 1] ? `${MESES[mes - 1]} de ${ano}` : am;
}

/** O que a última geração devolveu — é o que a tela repete em palavras. */
interface ResultadoFolha {
  competencia: string;
  criados: number;
  total: number;
  /** A mesma competência já tinha sido gerada nesta sessão, com o mesmo número. */
  repetida: boolean;
}

const SEM_FOLHA: FolhaDoMes[] = [];

export function ColaboradoresClient({
  empresaId, lista, contas, lancamentos, mesAberto, pessoasDoSistema, empresas = [], logos = {},
  folhaDiaPadrao = 5, comissoes, comissaoMarketplace = null, comissoesVendas = {}, podeGerarFolha, schemaPendente, lancamentosPendentes,
  // `SEM_FOLHA` e não `[]`: o efeito que espelha a folha depende da REFERÊNCIA,
  // e um `[]` novo a cada render (prova sem folha) virava "Maximum update depth".
  folhaInicial = SEM_FOLHA, mercadinhoInicial = {}, folhaMensalPendente = false, pontoInicial = {},
}: {
  empresaId: string;
  lista: Colaborador[];
  /** Contas DA EMPRESA — de onde sai o pagamento. */
  contas: { id: string; nome: string }[];
  /** O que muda no mês corrente, de todo mundo. A ficha filtra pela pessoa. */
  lancamentos: FolhaLancamento[];
  /** 'AAAA-MM-01' — o mês aberto. Não confundir com o `competencia` do estado
   *  logo abaixo, que é o mês ESCOLHIDO no painel de gerar a folha. */
  mesAberto: string;
  /** Gente do ERP, para o cadastro puxar em vez de redigitar. */
  pessoasDoSistema: { id: string; nome: string }[];
  /** As empresas liberadas — a pessoa diz em qual entra quando a tela está em "Visão geral". */
  empresas?: { id: string; nome: string }[];
  /** `colaborador.id` → link ASSINADO da foto. Vem da página, vence em 1h. */
  logos?: Record<string, string>;
  /** O dia de pagamento que a pessoa nova já traz preenchido (configuração). */
  folhaDiaPadrao?: number;
  /** Comissão de tráfego do mês, por `employee_id`. Vazio quando ninguém tem
   *  acordo vinculado — aí o KPI e o bloco da ficha nem aparecem. */
  comissoes: Record<string, ComissaoCalculada>;
  /** Comissão do gerenciador dos MARKETPLACES no mês (uma pessoa só, por
   *  `employee_id`). `null` = sem acordo ativo ou conta indisponível. */
  comissaoMarketplace?: { pessoaId: string; valor: number } | null;
  /** Comissão de VENDAS do mês (planilha do ERP), por `employee_id`. */
  comissoesVendas?: Record<string, number>;
  /** `financeiro:folha` E `financeiro:compromissos` — as duas que a rota exige. */
  podeGerarFolha: boolean;
  schemaPendente: boolean;
  /** `fin_folha_lancamentos` ainda não existe: o bloco do mês some. */
  lancamentosPendentes: boolean;
  /** A folha do mês corrente, uma linha por pessoa (materializada ou não). */
  folhaInicial?: FolhaDoMes[];
  /** `colaborador_id` → consumo do mercadinho no mês, para o botão de puxar. */
  mercadinhoInicial?: Record<string, number>;
  /** `fin_folha_mensal` ainda não existe: a tabela mostra o calculado e avisa. */
  folhaMensalPendente?: boolean;
  /** Extras, banco e faltas do mês, direto do ponto. Vazio = coluna em N/A. */
  pontoInicial?: Record<string, PontoDaPessoa>;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  // A foto escolhida ANTES de a pessoa existir na folha. Sobe logo depois do POST.
  const [fotoPendente, setFotoPendente] = useState<File | null>(null);
  // Em "Visão geral" a folha é gerada para a empresa ESCOLHIDA aqui.
  const [empresaFolha, setEmpresaFolha] = useState(empresaId);
  // Comissão do acordo vinculado a uma pessoa da folha. O vínculo é o
  // `employee_id` (mesmo id de `profiles`), preenchido no cadastro do ERP —
  // cadastro só do Financeiro, sem employee_id, não tem como casar.
  const comissaoDe = (c: Colaborador) => (c.employee_id ? comissoes[c.employee_id] : undefined);
  const temComissao = Object.keys(comissoes).length > 0;
  const acordos = Object.values(comissoes);
  const totalComissao = acordos.reduce((s, k) => s + (k.valor ?? 0), 0);
  const qtdComissao = acordos.length;
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [folhaAberta, setFolhaAberta] = useState(false);
  const [competencia, setCompetencia] = useState(() => hojeISO().slice(0, 7));
  const [gerando, setGerando] = useState(false);
  const [erroFolha, setErroFolha] = useState("");
  const [resultado, setResultado] = useState<ResultadoFolha | null>(null);
  // Quantos compromissos cada competência já rendeu NESTA sessão. É o que
  // permite dizer "não duplicou" com honestidade: a rota devolve sempre o total
  // de linhas enviadas, e não quantas de fato nasceram.
  const jaGeradas = useRef(new Map<string, number>());

  const ativos = lista.filter((c) => c.status === "ativo").length;
  const afastados = lista.filter((c) => c.status === "afastado").length;
  // A folha do mês é de quem NÃO está desligado: o afastado continua custando.
  const folhaMes = lista
    .filter((c) => c.status !== "desligado")
    .reduce((s, c) => s + c.salario_base + c.beneficios, 0);

  // A prévia da geração, calculada com a MESMA régra do servidor: entra quem
  // não está desligado e tem salário + benefícios acima de zero. Zerado é
  // cadastro pela metade, não obrigação de R$ 0,00 na agenda.
  const naFolha = useMemo(
    () => lista.filter((c) => c.status !== "desligado" && c.salario_base + c.beneficios > 0),
    [lista],
  );
  const totalPrevia = naFolha.reduce((s, c) => s + c.salario_base + c.beneficios, 0);
  const semSalario = lista.filter(
    (c) => c.status !== "desligado" && c.salario_base + c.beneficios <= 0,
  ).length;

  // ── Folha MENSAL ───────────────────────────────────────────────────────────
  // O mês escolhido manda em tudo: as linhas, a data-limite, o lote.
  const [mesDaFolha, setMesDaFolha] = useState(mesAberto);
  const [folha, setFolha] = useState<Map<string, FolhaDoMes>>(
    () => new Map(folhaInicial.map((l) => [l.colaborador_id, l])));
  const [mercadinhoSugerido, setMercadinhoSugerido] = useState(mercadinhoInicial);
  const [ponto, setPonto] = useState(pontoInicial);
  // Comissão do acordo, POR MÊS: "gestor de tráfego e comercial ganham
  // comissão, seria bom ir automaticamente". Vinculada mas EDITÁVEL: enquanto
  // a célula está em zero, vale a conta do sistema; digitou, o número digitado
  // vence; e ao FECHAR o pagamento a sugestão vigente é gravada — o mês
  // congela com o valor que a pessoa viu, não com um cálculo que muda depois.
  const [comissaoAuto, setComissaoAuto] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {};
    for (const c of lista) {
      const v = c.employee_id ? comissoes[c.employee_id]?.valor : null;
      if (typeof v === "number" && v > 0) inicial[c.id] = v;
    }
    return inicial;
  });
  // A mesma régua para o gerenciador dos MARKETPLACES (aba Canais do
  // Comercial): % do bruto de Shopee/ML/TikTok, sugerida na parte Marketplace.
  const [comissaoMkt, setComissaoMkt] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {};
    if (comissaoMarketplace && comissaoMarketplace.valor > 0) {
      for (const c of lista) if (c.employee_id && c.employee_id === comissaoMarketplace.pessoaId) inicial[c.id] = comissaoMarketplace.valor;
    }
    return inicial;
  });
  // A das VENDEDORAS: soma do valor_comissao da planilha do ERP no mês.
  const [comissaoVendas, setComissaoVendas] = useState<Record<string, number>>(() => {
    const inicial: Record<string, number> = {};
    for (const c of lista) {
      const v = c.employee_id ? comissoesVendas[c.employee_id] : undefined;
      if (typeof v === "number" && v > 0) inicial[c.id] = v;
    }
    return inicial;
  });
  /** O setor de cada pessoa — é ele que decide quem pode ter comissão de
   *  VENDAS sugerida (só Design, Marketing e Comercial). */
  const setorDe = useMemo(() => new Map(lista.map((c) => [c.id, c.setor])), [lista]);
  /** A sugestão de VENDAS que vale para esta pessoa: a planilha do ERP credita
   *  quem ATENDEU o pagamento, e quem é de TI/Produção às vezes fecha uma
   *  venda no lugar da vendedora. Fora dos setores que vendem, zero — digitar
   *  à mão continua valendo. */
  const vendasDaPessoa = (colaboradorId: string): number =>
    podeComissaoDeVendas(setorDe.get(colaboradorId)) ? comissaoVendas[colaboradorId] ?? 0 : 0;
  /** A sugestão de UMA área, se ela pode entrar sozinha neste mês: entrada
   *  automática ligada (por mês e por área — setembro/2026 em diante por
   *  padrão), a parte ainda em zero e o mês não pago. Fora disso, zero. */
  const sugestaoDe = (m: FolhaDoMes, parte: AutoParte): number => {
    if (m.pago || !entradaAutomatica(m, parte)) return 0;
    if (m[`comissao_${parte}`] !== 0) return 0;
    if (parte === "vendas") return vendasDaPessoa(m.colaborador_id);
    return (parte === "trafego" ? comissaoAuto : comissaoMkt)[m.colaborador_id] ?? 0;
  };
  /** O consumo do mercadinho que entra sozinho: só a partir de setembro/2026
   *  ("mercadinho também deve ser puxado por padrão"), enquanto a célula está
   *  em zero e o mês não foi pago. Antes disso, continua a pedido. */
  const sugestaoMercadinho = (m: FolhaDoMes): number =>
    mercadinhoAutomatico(m) ? mercadinhoSugerido[m.colaborador_id] ?? 0 : 0;
  /** A linha do mês com os valores EFETIVOS: nas áreas automáticas em zero,
   *  vale a conta do sistema (comissões e mercadinho) — "outros" e o bônus do
   *  mês são sempre digitados. */
  const mesEfetivo = (id: string): FolhaDoMes | undefined => {
    const m = folha.get(id);
    if (!m) return undefined;
    if (m.pago) return m;
    const vendas = sugestaoDe(m, "vendas");
    const auto = sugestaoDe(m, "trafego");
    const mkt = sugestaoDe(m, "marketplace");
    const merc = sugestaoMercadinho(m);
    let r = m;
    if (vendas > 0) r = { ...r, comissao: r.comissao + vendas, comissao_vendas: vendas };
    if (auto > 0) r = { ...r, comissao: r.comissao + auto, comissao_trafego: auto };
    if (mkt > 0) r = { ...r, comissao: r.comissao + mkt, comissao_marketplace: mkt };
    if (merc > 0) r = { ...r, mercadinho: merc };
    return r;
  };

  // "Removi/atualizei algo, já aparece na hora." Salvar pelo drawer e excluir
  // rodam `router.refresh()`, que refaz a árvore do SERVIDOR e manda
  // `folhaInicial` novo — mas o estado do cliente sobrevive, e a folha ficava
  // presa no retrato antigo (a MESMA armadilha da ficha-cópia dos contatos,
  // pela terceira vez). A sincronia é por REFERÊNCIA: o servidor manda um
  // array novo a cada refresh, e o efeito espelha; a edição local continua
  // ganhando porque cada PUT devolve a linha e a grava no mapa por cima.
  // ...MAS o retrato do servidor é de UM mês — o `mesAberto` com que a página
  // foi montada. Quem trocou a competência no cliente e depois provocou um
  // refresh (salvar pelo drawer, excluir, o bônus recorrente nascendo) via a
  // folha de AGOSTO ser substituída pelas linhas de SETEMBRO sem tocar no
  // seletor: o mês certo em cima, o dinheiro do outro embaixo.
  useEffect(() => {
    if (mesAberto !== mesDaFolha) return;
    setFolha(new Map(folhaInicial.map((l) => [l.colaborador_id, l])));
    setMercadinhoSugerido(mercadinhoInicial);
    setPonto(pontoInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folhaInicial, mesAberto, mesDaFolha]);
  const [folhaPendente, setFolhaPendente] = useState(folhaMensalPendente);
  const [carregandoMes, setCarregandoMes] = useState(false);
  /** Carimbo de sequência da leitura por competência — ver `trocarMes`. */
  const buscaAtual = useBuscaAtual();
  const [loteAberto, setLoteAberto] = useState(false);
  const [faltasDe, setFaltasDe] = useState<string | null>(null);
  // Quem está com o painel de FECHAR PAGAMENTO aberto. Marcar pago não é um
  // clique seco: é o momento de conferir faltas do ponto e decidir das horas.
  const [pagandoDe, setPagandoDe] = useState<string | null>(null);
  // Quem está com a REGRINHA da comissão aberta (vendas + tráfego +
  // marketplace + outros — a folha soma o total).
  const [regrinhaDe, setRegrinhaDe] = useState<string | null>(null);

  /**
   * As SUGESTÕES do sistema chegam DEPOIS do primeiro paint.
   *
   * Tráfego, marketplace e vendas dependem do snapshot de vendas e da planilha
   * do ERP; cada conta desiste em 2,5 s, e no render do servidor elas eram um
   * piso de espera para uma tela que já tinha o salário de todo mundo em mãos.
   * Aqui a folha aparece primeiro e o número entra quando chega — a mesma
   * régua que já vale para a comissão não segurar a página.
   *
   * Não é poll: roda uma vez por competência.
   */
  useEffect(() => {
    let vivo = true;
    const q = empresaId ? `&empresa=${encodeURIComponent(empresaId)}` : "";
    fetch(`/api/financeiro/folha/sugestoes?competencia=${mesDaFolha}${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: null | {
        comissaoSugerida?: Record<string, number>;
        comissaoMarketplaceSugerida?: Record<string, number>;
        comissaoVendasSugerida?: Record<string, number>;
        bonusCriados?: number;
      }) => {
        if (!vivo || !d) return;
        setComissaoAuto(d.comissaoSugerida ?? {});
        setComissaoMkt(d.comissaoMarketplaceSugerida ?? {});
        setComissaoVendas(d.comissaoVendasSugerida ?? {});
        // O bônus "todo mês" nasceu agora: os lançamentos que a página trouxe
        // são de antes dele, então o servidor precisa contar de novo.
        if (d.bonusCriados) router.refresh();
      })
      .catch(() => { /* sugestão é informação a mais; a folha abre sem ela */ });
    return () => { vivo = false; };
  }, [mesDaFolha, empresaId, router]);

  /**
   * Troca o mês: busca as linhas daquela competência na rota.
   *
   * O CARIMBO é obrigatório. Ir para setembro e voltar para agosto dispara
   * duas leituras, e a de setembro pode chegar DEPOIS — quem escreve por
   * último vence, e a tela fica com o dinheiro de setembro embaixo do
   * seletor de agosto. Não há poll que conserte isso sozinho: o número
   * errado fica até alguém recarregar a página. Só a busca mais nova
   * escreve; as atrasadas caem fora sem tocar em nada.
   */
  async function trocarMes(nova: string) {
    if (!/^\d{4}-\d{2}$/.test(nova)) return;
    const comp = `${nova}-01`;
    const souAtual = buscaAtual();   // carimbo desta leitura
    setMesDaFolha(comp);
    setCarregandoMes(true);
    try {
      const q = empresaId ? `&empresa=${encodeURIComponent(empresaId)}` : "";
      const r = await fetch(`/api/financeiro/folha/mensal?competencia=${comp}${q}`);
      const d = (await r.json().catch(() => ({}))) as {
        linhas?: FolhaDoMes[]; mercadinhoSugerido?: Record<string, number>; pendente?: boolean; erro?: string;
        ponto?: Record<string, PontoDaPessoa>; comissaoSugerida?: Record<string, number>;
        comissaoMarketplaceSugerida?: Record<string, number>;
        comissaoVendasSugerida?: Record<string, number>;
      };
      if (!souAtual()) return;   // chegou leitura mais nova: esta não escreve
      if (!r.ok) { toast.erro(d.erro ?? "Não deu para carregar o mês."); return; }
      setFolha(new Map((d.linhas ?? []).map((l) => [l.colaborador_id, l])));
      setMercadinhoSugerido(d.mercadinhoSugerido ?? {});
      setFolhaPendente(!!d.pendente);
      setPonto(d.ponto ?? {});
      setComissaoAuto(d.comissaoSugerida ?? {});
      setComissaoMkt(d.comissaoMarketplaceSugerida ?? {});
      setComissaoVendas(d.comissaoVendasSugerida ?? {});
    } finally {
      // Só a busca mais nova apaga o "carregando" — a atrasada terminando
      // antes dela faria a tela dizer que já chegou o que ainda está no ar.
      if (souAtual()) setCarregandoMes(false);
    }
  }

  /** Grava campos do mês de UMA pessoa e espelha a resposta na tabela. */
  async function gravarMes(colaboradorId: string, patch: Record<string, unknown>): Promise<boolean> {
    try {
      const r = await fetch("/api/financeiro/folha/mensal", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ colaborador_id: colaboradorId, competencia: mesDaFolha, ...patch }),
      });
      const d = (await r.json().catch(() => ({}))) as { linha?: FolhaDoMes; erro?: string };
      if (!r.ok || !d.linha) { toast.erro(d.erro ?? "Não deu para gravar."); return false; }
      setFolha((m) => new Map(m).set(colaboradorId, d.linha as FolhaDoMes));
      return true;
    } catch {
      toast.erro("Sem resposta do servidor.");
      return false;
    }
  }

  /**
   * Fecha o pagamento do mês de UMA pessoa: grava pago (com as faltas do
   * ponto, se a pessoa confirmou) e, se ela disse que as extras foram pagas,
   * manda dar baixa no banco de horas — o servidor calcula o teto real.
   */
  async function fecharPagamento(
    colaboradorId: string,
    opcoes: { faltas?: string[]; pagarHoras: boolean; baixarMercadinho: boolean },
  ) {
    try {
      const r = await fetch("/api/financeiro/folha/mensal", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          colaborador_id: colaboradorId, competencia: mesDaFolha, pago: true,
          ...(opcoes.faltas ? { faltas: opcoes.faltas } : {}),
          ...(opcoes.pagarHoras ? { pagar_horas: true } : {}),
          ...(opcoes.baixarMercadinho ? { baixar_mercadinho: true } : {}),
          // A comissão automática vira NÚMERO GRAVADO no fechamento: o mês
          // pago não pode mudar porque o tráfego recalculou depois.
          ...(() => {
            const m = folha.get(colaboradorId);
            const vendas = m ? sugestaoDe(m, "vendas") : 0;
            return m && m.comissao_vendas === 0 && vendas > 0 ? { comissao_vendas: vendas } : {};
          })(),
          ...(() => {
            const m = folha.get(colaboradorId);
            const auto = m ? sugestaoDe(m, "trafego") : 0;
            return m && m.comissao_trafego === 0 && auto > 0 ? { comissao_trafego: auto } : {};
          })(),
          ...(() => {
            const m = folha.get(colaboradorId);
            const mkt = m ? sugestaoDe(m, "marketplace") : 0;
            return m && m.comissao_marketplace === 0 && mkt > 0 ? { comissao_marketplace: mkt } : {};
          })(),
          // O mercadinho automático também congela no fechamento.
          ...(() => {
            const m = folha.get(colaboradorId);
            const merc = m ? sugestaoMercadinho(m) : 0;
            return m && m.mercadinho === 0 && merc > 0 ? { mercadinho: merc } : {};
          })(),
        }),
      });
      const d = (await r.json().catch(() => ({}))) as {
        linha?: FolhaDoMes; erro?: string; horasPagasMin?: number; horasAviso?: string;
        mercadinhoBaixado?: number; mercadinhoAviso?: string;
      };
      if (!r.ok || !d.linha) { toast.erro(d.erro ?? "Não deu para fechar o pagamento."); return; }
      setFolha((m) => new Map(m).set(colaboradorId, d.linha as FolhaDoMes));
      const min = d.horasPagasMin ?? 0;
      if (min > 0) {
        // O banco da linha encolhe NA HORA — o servidor já esqueceu o cache,
        // mas esta aba não precisa esperar o próximo carregamento para bater.
        setPonto((pt) => {
          const atual = pt[colaboradorId];
          if (!atual) return pt;
          return { ...pt, [colaboradorId]: { ...atual, bancoMin: atual.bancoMin - min, extrasMesMin: Math.max(0, atual.extrasMesMin - min), pagasMesMin: atual.pagasMesMin + min } };
        });
        toast.ok(`Pagamento fechado — ${(horasLegiveis(min) ?? "0h").replace("+", "")} saíram do banco de horas.`);
      } else if (d.horasAviso) {
        toast.info(`Pagamento fechado, mas as horas não baixaram: ${d.horasAviso}`);
      } else {
        toast.ok("Pagamento fechado.");
      }
      // A baixa do mercadinho tem voz própria: é dívida em OUTRO sistema, e
      // silenciar a falha dela deixaria a pessoa devendo o que já pagou.
      if (d.mercadinhoAviso) toast.info(`A conta do TridiMarket não baixou: ${d.mercadinhoAviso}`);
      else if (opcoes.baixarMercadinho && (d.mercadinhoBaixado ?? 0) > 0) {
        toast.ok(`TridiMarket quitado — ${moeda(d.mercadinhoBaixado ?? 0)} baixados.`);
      }
      setPagandoDe(null);
    } catch {
      toast.erro("Sem resposta do servidor.");
    }
  }

  /** Aplica a sugestão do mercadinho em quem tem — a pedido, nunca sozinho. */
  async function puxarMercadinho() {
    const alvos = visiveis.filter((c) => {
      const sugerido = mercadinhoSugerido[c.id];
      return typeof sugerido === "number" && sugerido !== (folha.get(c.id)?.mercadinho ?? 0);
    });
    if (!alvos.length) { toast.info("Ninguém com consumo novo no mercadinho neste mês."); return; }
    let ok = 0;
    for (const c of alvos) {
      if (await gravarMes(c.id, { mercadinho: mercadinhoSugerido[c.id] })) ok += 1;
    }
    toast.ok(`Consumo do mercadinho aplicado em ${ok} pessoa(s).`);
  }

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((c) =>
      (!status || c.status === status) &&
      (!q
        || c.nome.toLowerCase().includes(q)
        || (c.setor ?? "").toLowerCase().includes(q)
        || (c.cargo ?? "").toLowerCase().includes(q)));
  }, [lista, busca, status]);

  /**
   * Exporta O QUE ESTÁ NA TELA (as pessoas filtradas, com os valores efetivos
   * do mês) em CSV ou Excel — no navegador, sem rota: os dados já estão aqui.
   * O Excel é escrito à mão (lib/financeiro/xlsx.ts), sem biblioteca.
   */
  function exportar(formato: "csv" | "xlsx") {
    const linhas = visiveis.map((c) => ({ c, m: mesEfetivo(c.id) }));
    const colunas = [
      { cabecalho: "Pessoa", valor: ({ c }: typeof linhas[number]) => c.nome },
      { cabecalho: "Setor", valor: ({ c }: typeof linhas[number]) => c.setor ?? "" },
      { cabecalho: "Cargo", valor: ({ c }: typeof linhas[number]) => c.cargo ?? "" },
      { cabecalho: "Vínculo", valor: ({ c }: typeof linhas[number]) => LABEL_VINCULO[(c.vinculo || "pf") as Vinculo] ?? c.vinculo ?? "" },
      { cabecalho: "Situação", valor: ({ c }: typeof linhas[number]) => SELO_COLABORADOR[c.status].label },
      { cabecalho: "Salário", valor: ({ m }: typeof linhas[number]) => m?.salario ?? 0 },
      { cabecalho: "Bônus", valor: ({ m }: typeof linhas[number]) => (m ? bonusDoMes(m) : 0) },
      { cabecalho: "Comissão", valor: ({ m }: typeof linhas[number]) => (m ? comissaoDoMes(m) : 0) },
      { cabecalho: "Gratificação", valor: ({ m }: typeof linhas[number]) => m?.gratificacao ?? 0 },
      { cabecalho: "Benefícios", valor: ({ m }: typeof linhas[number]) => m?.beneficios ?? 0 },
      { cabecalho: "Vale", valor: ({ m }: typeof linhas[number]) => m?.vale ?? 0 },
      { cabecalho: "Farmácia", valor: ({ m }: typeof linhas[number]) => m?.convenio_farmacia ?? 0 },
      { cabecalho: "Mercadinho", valor: ({ m }: typeof linhas[number]) => m?.mercadinho ?? 0 },
      { cabecalho: "Faltas (dias)", valor: ({ m }: typeof linhas[number]) => m?.faltas.length ?? 0 },
      { cabecalho: "Faltas (R$)", valor: ({ m }: typeof linhas[number]) => (m ? descontoPorFaltas(m.faltas, m.salario).total : 0) },
      { cabecalho: "Banco de horas", valor: ({ c }: typeof linhas[number]) => horasLegiveis(ponto[c.id]?.bancoMin ?? 0) ?? "" },
      { cabecalho: "Bruto", valor: ({ m }: typeof linhas[number]) => (m ? liquidoDoMes(m).ganhos : 0) },
      { cabecalho: "Descontos", valor: ({ m }: typeof linhas[number]) => (m ? liquidoDoMes(m).descontos : 0) },
      { cabecalho: "Líquido", valor: ({ m }: typeof linhas[number]) => (m ? liquidoDoMes(m).liquido : 0) },
      { cabecalho: "Pago", valor: ({ m }: typeof linhas[number]) => (m?.pago ? "sim" : "não") },
    ];
    const empresaNome = empresas.find((e) => e.id === empresaId)?.nome ?? "geral";
    const nome = nomeDoArquivo(`folha-${mesDaFolha.slice(0, 7)}`, empresaNome, hojeISO());
    const blob = formato === "csv"
      ? new Blob([montarCSV(linhas, colunas)], { type: "text/csv;charset=utf-8" })
      : new Blob([montarXLSX(linhas, colunas, `Folha ${mesDaFolha.slice(0, 7)}`).buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = formato === "csv" ? nome : nome.replace(/\.csv$/, ".xlsx");
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function salvar() {
    if (!rascunho) return;
    setSalvando(true);
    setErro("");
    try {
      const corpo = {
        nome: rascunho.nome,
        setor: rascunho.setor || null,
        cargo: rascunho.cargo || null,
        salario_base: numero(rascunho.salario_base),
        vinculo: rascunho.vinculo || "pf",
        beneficios: numero(rascunho.beneficios),
        dia_pagamento: rascunho.dia_pagamento === "" ? null : Number(rascunho.dia_pagamento),
        admissao: rascunho.admissao || null,
        status: rascunho.status,
        employee_id: rascunho.employee_id || null,
        gratificacao: numero(rascunho.gratificacao),
        valor_hora: numero(rascunho.valor_hora),
        conta_id: rascunho.conta_id || null,
        banco: rascunho.banco || null,
        agencia: rascunho.agencia || null,
        conta_numero: rascunho.conta_numero || null,
        pix_tipo: rascunho.pix_tipo || null,
        pix_chave: rascunho.pix_chave || null,
        whatsapp: rascunho.whatsapp || null,
      };
      if (rascunho.id) await chamar(`/api/financeiro/colaboradores/${rascunho.id}`, "PATCH", corpo);
      else {
        const alvo = rascunho.empresa_id || empresaId;
        if (!alvo) { setErro("Escolha em qual empresa a pessoa entra na folha."); setSalvando(false); return; }
        const criada = await chamar("/api/financeiro/colaboradores", "POST", { empresa_id: alvo, ...corpo });
        if (fotoPendente && typeof criada.id === "string") {
          const erroFoto = await enviarMarca("colaborador", criada.id, fotoPendente);
          if (erroFoto) toast.erro(`Cadastro salvo, mas a foto não subiu: ${erroFoto}`);
        }
      }
      setFotoPendente(null);
      setRascunho(null);
      toast.ok("Cadastro salvo.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSalvando(false);
    }
  }

  async function desligar(id: string, nome: string) {
    if (!(await confirmar(`Desligar ${nome}?`, {
      detalhe: "O cadastro continua: ele explica a folha das competências passadas e o patrimônio que estava com a pessoa. Só sai das somas daqui pra frente.",
      perigo: true,
    }))) return;
    setSalvando(true);
    setErro("");
    try {
      await chamar(`/api/financeiro/colaboradores/${id}`, "PATCH", { status: "desligado" });
      setRascunho(null);
      toast.ok("Pessoa desligada da folha.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSalvando(false);
    }
  }

  async function gerarFolha() {
    setGerando(true);
    setErroFolha("");
    try {
      const alvo = empresaFolha || empresaId;
      if (!alvo) { setErroFolha("Escolha a empresa da folha."); setGerando(false); return; }
      const r = await chamar("/api/financeiro/folha", "POST", {
        empresa_id: alvo,
        competencia,
      });
      const criados = Number(r.criados ?? 0);
      const total = Number(r.total ?? 0);
      const antes = jaGeradas.current.get(competencia);
      jaGeradas.current.set(competencia, criados);
      // "Repetida" só faz sentido quando de fato havia o que criar: com zero
      // pessoas na folha, `antes === criados` seria 0 === 0 e a tela diria que
      // não duplicou algo que nunca existiu.
      setResultado({ competencia, criados, total, repetida: criados > 0 && antes === criados });
      toast.ok(criados === 0
        ? "Nada para lançar nesta competência."
        : `${criados} ${criados === 1 ? "compromisso de folha criado" : "compromissos de folha criados"}.`);
      router.refresh();
    } catch (e) {
      setErroFolha(recado(e));
    } finally {
      setGerando(false);
    }
  }

  return (
    <>
      <Cabecalho
        titulo="Colaboradores"
        sub="Acompanhe o desempenho e os ganhos da equipe."
        busca={busca}
        aoBuscar={setBusca}
        acoes={
          <>
            <BotaoFin icone="download" onClick={() => exportar("csv")} titulo="Baixar a folha deste mês em CSV">CSV</BotaoFin>
            <BotaoFin icone="table" onClick={() => exportar("xlsx")} titulo="Baixar a folha deste mês em Excel">Excel</BotaoFin>
            <BotaoFin icone="users" onClick={() => setLoteAberto(true)}>Bônus em lote</BotaoFin>
            {podeGerarFolha && (
              <BotaoFin
                icone="calendar-plus"
                onClick={() => { setErroFolha(""); setResultado(null); setFolhaAberta(true); }}
                titulo="Lançar a folha do mês na agenda de compromissos"
              >
                Gerar folha do mês
              </BotaoFin>
            )}
            <BotaoFin icone="user-plus" primario onClick={() => { setErro(""); setRascunho(novoRascunho(folhaDiaPadrao)); }}>
              Nova pessoa
            </BotaoFin>
          </>
        }
      />

      {schemaPendente && <AvisoSchema />}

      {/* ── Os números do mês, na ordem em que o dono lê (desenho de 01/09/2026) ── */}
      {(() => {
        // Tudo sobre a folha EFETIVA do mês (sugestões já aplicadas), de quem
        // não foi desligado — o afastado continua custando.
        const ativas = lista.filter((c) => c.status !== "desligado");
        const meses = ativas.map((c) => mesEfetivo(c.id)).filter(Boolean) as FolhaDoMes[];
        // Quem ainda não tem linha do mês entra pela projeção do cadastro —
        // senão a folha "encolhe" até alguém tocar na linha de cada pessoa.
        const liquidoMes = ativas.reduce((s, c) => {
          const m = mesEfetivo(c.id);
          return s + (m ? liquidoDoMes(m).liquido : c.salario_base + c.beneficios);
        }, 0);
        const pagas = meses.filter((m) => m.pago).length;
        const comissaoTotal = meses.reduce((s, m) => s + comissaoDoMes(m), 0);
        const comComissao = meses.filter((m) => comissaoDoMes(m) > 0).length;
        return (
          <LinhaKpi>
            <Kpi
              icone="users"
              rotulo="Pessoas ativas"
              valor={String(ativos)}
              cor="var(--roxo)"
              detalhe={afastados ? `${afastados} ${afastados === 1 ? "afastado" : "afastados"}` : "colaboradores ativos"}
            />
            <Kpi
              icone="cash"
              rotulo="Folha do mês"
              valor={moeda(liquidoMes)}
              detalhe={`${naFolha.length} ${naFolha.length === 1 ? "pessoa" : "pessoas"} com valor · ${pagas} ${pagas === 1 ? "paga" : "pagas"}`}
            />
            <Kpi
              icone="target"
              rotulo="Comissão total"
              valor={moeda(comissaoTotal)}
              cor="var(--ok)"
              detalhe={`${comComissao} ${comComissao === 1 ? "pessoa" : "pessoas"} · deste mês`}
            />
            <Kpi
              icone="alert-triangle"
              rotulo="Sem salário cadastrado"
              valor={String(semSalario)}
              cor={semSalario ? "var(--atencao)" : "var(--neutro)"}
              detalhe="não entram na geração"
            />
          </LinhaKpi>
        );
      })()}

      {/* ── Três roscas de DINHEIRO: para onde vai a folha do mês ──
          Contagem de pessoas já está nos KPIs acima; aqui o que se quer saber
          é quanto CUSTA cada vínculo, cada setor e cada parcela do bruto —
          pedido do dono ("donut com valor gasto para cada modalidade/setor").
          Tudo na base EFETIVA do mês, a mesma da tabela. */}
      {(() => {
        const naCasa = lista.filter((c) => c.status !== "desligado");
        const brutoDe = (c: Colaborador) => {
          const m = mesEfetivo(c.id);
          return m ? liquidoDoMes(m).ganhos : c.salario_base + c.beneficios;
        };
        const soma = (xs: Colaborador[]) => xs.reduce((s, c) => s + brutoDe(c), 0);
        const total = soma(naCasa);

        const porVinculo = VINCULOS
          .map((v) => ({ id: v, label: LABEL_VINCULO[v], valor: soma(naCasa.filter((c) => (c.vinculo || "pf") === v)) }))
          .filter((f) => f.valor > 0)
          .sort((a, b) => b.valor - a.valor);

        const setores = new Map<string, number>();
        for (const c of naCasa) {
          const k = (c.setor || "Sem setor").trim();
          setores.set(k, (setores.get(k) ?? 0) + brutoDe(c));
        }
        // Seis fatias é o teto legível; o resto vira "Outros" para a soma
        // continuar batendo com o total no buraco.
        const ordenados = [...setores.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        const porSetor = ordenados.slice(0, 5).map(([nome, valor]) => ({ id: nome, label: nome, valor }));
        const resto = ordenados.slice(5).reduce((s, [, v]) => s + v, 0);
        if (resto > 0) porSetor.push({ id: "outros-setores", label: `Outros (${ordenados.length - 5})`, valor: resto });

        const meses = naCasa.map((c) => mesEfetivo(c.id)).filter(Boolean) as FolhaDoMes[];
        const parcela = (f: (m: FolhaDoMes) => number) => meses.reduce((s, m) => s + f(m), 0);
        const composicao = [
          { id: "salario", label: "Salário", valor: parcela((m) => m.salario) },
          { id: "bonus", label: "Bônus", valor: parcela(bonusDoMes) },
          { id: "comissao", label: "Comissão", valor: parcela(comissaoDoMes) },
          { id: "gratificacao", label: "Gratificação", valor: parcela((m) => m.gratificacao) },
          { id: "beneficios", label: "Benefícios", valor: parcela((m) => m.beneficios) },
        ].filter((f) => f.valor > 0);
        const totalComposicao = composicao.reduce((s, f) => s + f.valor, 0);

        // Uma cor por fatia (a rampa do destaque da pessoa) e a proporção que
        // a legenda usa — a rosca não recalcula nada por conta própria.
        const fatiasDe = (xs: { id: string; label: string; valor: number }[]) => {
          const t = xs.reduce((s, x) => s + x.valor, 0);
          return xs.map((x, i) => ({ ...x, cor: corDaSerie(i), proporcao: t ? x.valor / t : 0 }));
        };
        const titulo = (t: string, sub: string) => (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800 }}>{t}</div>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{sub}</div>
          </div>
        );
        const vazio = (texto: string) => (
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", padding: "26px 0", textAlign: "center" }}>{texto}</div>
        );
        return (
          <div style={{ display: "grid", gap: 14, marginBottom: 18, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 400px), 1fr))" }}>
            <Cartao estatico>
              {titulo("Gasto por vínculo", `Bruto do mês · ${rotuloDoMes(mesDaFolha)}`)}
              {porVinculo.length
                ? <Rosca tamanho={128} total={`R$ ${curto(total)}`} rotuloTotal="bruto do mês" fatias={fatiasDe(porVinculo)} />
                : vazio("Ninguém com valor neste mês.")}
            </Cartao>
            <Cartao estatico>
              {titulo("Gasto por setor", "Quanto cada área custa no mês")}
              {porSetor.length
                ? <Rosca tamanho={128} total={`R$ ${curto(total)}`} rotuloTotal="bruto do mês" fatias={fatiasDe(porSetor)} />
                : vazio("Ninguém com valor neste mês.")}
            </Cartao>
            <Cartao estatico>
              {titulo("Composição do bruto", "Salário, bônus, comissão e o resto")}
              {composicao.length
                ? <Rosca tamanho={128} total={`R$ ${curto(totalComposicao)}`} rotuloTotal="soma dos ganhos" fatias={fatiasDe(composicao)} />
                : vazio("O mês ainda não tem lançamento.")}
            </Cartao>
          </div>
        );
      })()}

      {/* `estatico`: o Cartao padrão responde ao ponteiro com scale — certo
          para card clicável, errado para uma GRADE DE EDIÇÃO: cada clique em
          célula fazia a tabela inteira afundar ("quando eu clico ela balança"). */}
      <Cartao estatico>
        {/* ── FOLHA DE PAGAMENTO · a competência dita com todas as letras ──
            "Agosto" aqui é o mês TRABALHADO, não o mês em que se paga — e a
            tela antiga chamava aquilo só de "mês", que lia como "o que estou
            pagando em agosto". Agora o título separa os dois conceitos
            (competência × pagamento previsto) e o seletor se chama
            Competência; a data é a obrigação legal (CLT 459 §1º): 5º dia
            útil do mês SEGUINTE — sábado conta, domingo e feriado não. */}
        {/* ── A barra do mês: filtro · ano e os doze meses · quando se paga ──
            "Agosto" aqui é o mês TRABALHADO; a data é a obrigação legal (CLT
            459 §1º): 5º dia útil do mês SEGUINTE — sábado conta, domingo e
            feriado não. */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 14, minWidth: 0 }}>
          <Filtro
            rotulo="Situação"
            valor={status}
            aoMudar={setStatus}
            opcoes={COLABORADOR_STATUS.map((s) => ({ valor: s, label: SELO_COLABORADOR[s].label }))}
          />
          {(!!status || !!busca) && (
            <LimparFiltros ativo aoLimpar={() => { setStatus(""); setBusca(""); }} />
          )}
          {/* `overflowX: auto` no invólucro: os doze meses somam ~650px e, num
              monitor estreito, vazavam por cima do "Pagar até". Aqui a fileira
              rola por dentro (e o `.tab-strip` traz o mês atual à vista). */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", border: "1px solid var(--border)", borderRadius: 14, minWidth: 0, maxWidth: "100%", flex: "1 1 320px", overflowX: "auto", scrollbarWidth: "none" }}>
            <MapaDosMeses valor={mesDaFolha} aoEscolher={(m) => void trocarMes(m)} />
          </div>
          <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap", fontSize: 12.5, color: "var(--text-dim)" }}>
            Pagar até
            <strong style={{ fontSize: 16, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{dataBR(dataLimiteDePagamento(mesDaFolha))}</strong>
            <span style={{ fontSize: 11.5 }}>(5º dia útil)</span>
          </span>
          {/* Antes de setembro/2026 o mercadinho não entra sozinho: o botão
              continua ali só nesses meses. */}
          {mesDaFolha.slice(0, 10) < AUTOMATICO_DESDE && (
            <BotaoFin icone="shopping-cart" onClick={() => void puxarMercadinho()}>Puxar mercadinho</BotaoFin>
          )}
        </div>

        {/* ── A faixa: gastos por vínculo e comissão por setor ── */}
        {(() => {
          const linhas = visiveis.map((c) => ({ c, m: mesEfetivo(c.id) })).filter((x) => x.m) as { c: Colaborador; m: FolhaDoMes }[];
          const gasto = (v: Vinculo) => linhas.filter(({ c }) => (c.vinculo || "pf") === v).reduce((s, { m }) => s + liquidoDoMes(m).ganhos, 0);
          const porSetor = new Map<string, { comissao: number; pessoas: number }>();
          for (const { c, m } of linhas) {
            const k = (c.setor || "Sem setor").trim();
            const a = porSetor.get(k) ?? { comissao: 0, pessoas: 0 };
            a.comissao += comissaoDoMes(m); a.pessoas += 1;
            porSetor.set(k, a);
          }
          const setores = [...porSetor.entries()]
            .sort((a, b) => b[1].comissao - a[1].comissao || b[1].pessoas - a[1].pessoas)
            .slice(0, 3);
          const itens: { rot: string; val: number; icone: string }[] = [
            { rot: "Gastos CLT", val: gasto("clt"), icone: "id-badge" },
            { rot: "Gastos PF", val: gasto("pf"), icone: "user" },
            { rot: "Gastos MEI", val: gasto("mei"), icone: "briefcase" },
            ...setores.map(([setor, a]) => ({ rot: `Comissão ${setor}`, val: a.comissao, icone: "target" })),
          ];
          return (
            <div
              className="kpi-row"
              style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
                border: "1px solid var(--border)", borderRadius: 12, marginBottom: 16, overflow: "hidden",
              }}
            >
              {itens.map((it, i) => (
                <div key={it.rot} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", minWidth: 0, borderLeft: i ? "1px solid var(--border)" : "none" }}>
                  {/* Uma cor por item, da mesma rampa das roscas: a faixa e os
                      gráficos falam dos mesmos grupos, então falam na mesma cor. */}
                  <span aria-hidden style={{ width: 36, height: 36, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${corDaSerie(i)} 15%, transparent)` }}>
                    <Icon name={it.icone} size={18} color={corDaSerie(i)} />
                  </span>
                  <span style={{ display: "grid", minWidth: 0 }}>
                    <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.rot}</span>
                    <strong style={{ fontSize: 15, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{moeda(it.val)}</strong>
                  </span>
                </div>
              ))}
            </div>
          );
        })()}

        {folhaPendente && (
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--atencao-texto, var(--text-dim))", lineHeight: 1.5 }}>
            Falta rodar <code>supabase/financeiro_folha_mensal.sql</code> — os valores abaixo são
            calculados do cadastro e ainda não podem ser gravados por mês.
          </p>
        )}

        {visiveis.length === 0 ? (
          <Vazio
            icone="users"
            titulo={lista.length ? "Nada com esses filtros" : "Ninguém na folha ainda"}
            detalhe="Cadastre quem recebe pela empresa para a folha do mês aparecer na Visão Geral."
            acao={!lista.length
              ? <BotaoFin icone="user-plus" onClick={() => setRascunho(novoRascunho(folhaDiaPadrao))}>Nova pessoa</BotaoFin>
              : undefined}
          />
        ) : (
          <FolhaTabela
            pessoas={visiveis}
            folha={folha}
            ponto={ponto}
            logos={logos}
            ocupado={carregandoMes}
            aoAbrirFicha={(c) => { setErro(""); setRascunho(daPessoa(c)); }}
            aoGravar={gravarMes}
            aoAbrirFaltas={(id) => setFaltasDe(id)}
            aoFecharPagamento={(id) => setPagandoDe(id)}
            aoAbrirComissao={(id) => setRegrinhaDe(id)}
            efetivoDe={mesEfetivo}
          />
        )}
      </Cartao>

      {rascunho && (
        <PainelLateral
          centrado
          titulo={rascunho.id ? "Editar pessoa" : "Nova pessoa"}
          soFechaNoX
          subtitulo="Valores de projeção da folha — o fechamento confirma o mês."
          onFechar={() => setRascunho(null)}
          largura={520}
          rodape={
            <Acoes>
              <Botao onClick={() => setRascunho(null)}>Cancelar</Botao>
              {rascunho.id && rascunho.status !== "desligado" && (
                <Botao
                  variante="perigo"
                  icone="user-off"
                  onClick={() => desligar(rascunho.id as string, rascunho.nome)}
                  disabled={salvando}
                >
                  Desligar
                </Botao>
              )}
              {rascunho.id && (
                // Apagar ≠ desligar: desligar preserva a história (a pessoa sai
                // das somas e fica no cadastro); apagar é para quem entrou por
                // engano. A rota recusa (409) quem tem mês de folha PAGO.
                <BotaoApagar
                  tipo="colaborador"
                  id={rascunho.id}
                  nome={rascunho.nome}
                  aoApagar={() => { setRascunho(null); router.refresh(); }}
                />
              )}
              <Esp />
              <Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar</Botao>
            </Acoes>
          }
        >
          {erro && (
            <p style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
          )}

          {/* A FOTO DA PESSOA, no próprio cadastro — já na criação. */}
          <CampoMarca
            tipo="colaborador"
            id={rascunho.id}
            nome={rascunho.nome || "Pessoa"}
            logo={rascunho.id ? logos[rascunho.id] ?? null : null}
            icone="user"
            aoTrocar={() => router.refresh()}
            aoEscolherPendente={setFotoPendente}
          />

          <Campos>
            {!rascunho.id && !empresaId && empresas.length > 0 && (
              <Campo label="Empresa" largo dica="Em “Visão geral” a pessoa precisa dizer em qual empresa entra na folha.">
                {(id) => (
                  <SeletorEmpresa id={id} empresas={empresas} valor={rascunho.empresa_id}
                    aoMudar={(v) => setRascunho({ ...rascunho, empresa_id: v })} />
                )}
              </Campo>
            )}
            <Campo label="Nome" largo>
              {(id) => (
                <input
                  id={id}
                  value={rascunho.nome}
                  onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                  placeholder="Nome completo"
                />
              )}
            </Campo>

            <Campo label="Setor">
              {(id) => (
                <input
                  id={id}
                  value={rascunho.setor}
                  onChange={(e) => setRascunho({ ...rascunho, setor: e.target.value })}
                  placeholder="Produção"
                />
              )}
            </Campo>

            <Campo label="Cargo">
              {(id) => (
                <input
                  id={id}
                  value={rascunho.cargo}
                  onChange={(e) => setRascunho({ ...rascunho, cargo: e.target.value })}
                  placeholder="Operador"
                />
              )}
            </Campo>

            <Campo label="Vínculo" dica="Muda encargos e o que a lei espera do pagamento.">
              {(id) => (
                <Alternativas
                  id={id}
                  valor={(rascunho.vinculo || "pf") as string}
                  aoEscolher={(v) => setRascunho({ ...rascunho, vinculo: v })}
                  opcoes={VINCULOS.map((v) => ({ id: v as string, label: LABEL_VINCULO[v] }))}
                />
              )}
            </Campo>

            <Campo label="Salário-base" dica="Projeção mensal. O fechamento é que confirma o valor pago.">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={rascunho.salario_base}
                  onChange={(e) => setRascunho({ ...rascunho, salario_base: e.target.value })}
                  placeholder="0,00"
                />
              )}
            </Campo>

            <Campo label="Benefícios" dica="Vale, plano, ajuda de custo — o que soma na folha todo mês.">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  value={rascunho.beneficios}
                  onChange={(e) => setRascunho({ ...rascunho, beneficios: e.target.value })}
                  placeholder="0,00"
                />
              )}
            </Campo>

            <Campo label="Dia de pagamento">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min="1"
                  max="31"
                  inputMode="numeric"
                  value={rascunho.dia_pagamento}
                  onChange={(e) => setRascunho({ ...rascunho, dia_pagamento: e.target.value })}
                  placeholder="5"
                />
              )}
            </Campo>

            <Campo label="Admissão">
              {(id) => (
                <input
                  id={id}
                  type="date"
                  value={rascunho.admissao}
                  onChange={(e) => setRascunho({ ...rascunho, admissao: e.target.value })}
                />
              )}
            </Campo>

            <Campo label="Situação" dica="Afastado continua na folha do mês; desligado sai das somas e fica no histórico.">
              {(id) => (
<Alternativas
                  id={id}
                  valor={rascunho.status}
                  aoEscolher={(v) => setRascunho({ ...rascunho, status: v as ColaboradorStatus })}
                  opcoes={COLABORADOR_STATUS.map((st) => ({ id: st as string, label: SELO_COLABORADOR[st].label }))}
                />
              )}
            </Campo>

            <Campo
              label="Pessoa do sistema"
              dica="Liga esta ficha ao login do ERP. Fica vazio para quem trabalha e não tem login — a folha não pode esperar o RH."
            >
              {(id) => (
<Escolha
                  id={id}
                  valor={rascunho.employee_id}
                  vazio="Sem login no sistema"
                  placeholder="Buscar pessoa do ERP…"
                  aoEscolher={(employee_id) => {
                    const p = pessoasDoSistema.find((x) => x.id === employee_id);
                    // Puxar a pessoa preenche o nome quando ele ainda está em
                    // branco. Sobrescrever um nome já digitado seria pior: a
                    // folha às vezes usa o nome de registro, e o ERP o apelido.
                    setRascunho({
                      ...rascunho,
                      employee_id,
                      nome: rascunho.nome.trim() || (p?.nome ?? ""),
                    });
                  }}
                  opcoes={pessoasDoSistema.map((x) => ({ id: x.id, nome: x.nome, marca: { nome: x.nome, icone: "user" } }))}
                />
              )}
            </Campo>

            <Campo label="Gratificação" dica="Fixo, todo mês, somado ao salário. Bônus de um mês só se lança no bloco “Este mês”.">
              {(id) => (
                <input
                  id={id} type="number" step="0.01" min="0" inputMode="decimal"
                  value={rascunho.gratificacao}
                  onChange={(e) => setRascunho({ ...rascunho, gratificacao: e.target.value })}
                  placeholder="0,00"
                />
              )}
            </Campo>

            <Campo label="Valor da hora" dica="Só para sugerir o valor ao lançar hora extra. Não entra na folha sozinho.">
              {(id) => (
                <input
                  id={id} type="number" step="0.01" min="0" inputMode="decimal"
                  value={rascunho.valor_hora}
                  onChange={(e) => setRascunho({ ...rascunho, valor_hora: e.target.value })}
                  placeholder="0,00"
                />
              )}
            </Campo>

            <Campo label="Paga por" dica="A conta DA EMPRESA de onde sai o pagamento — não a conta da pessoa.">
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

            <Campo label="WhatsApp">
              {(id) => (
                <input
                  id={id} type="tel" inputMode="tel"
                  value={rascunho.whatsapp}
                  onChange={(e) => setRascunho({ ...rascunho, whatsapp: e.target.value })}
                  placeholder="(11) 90000-0000"
                />
              )}
            </Campo>
          </Campos>

          {/* Dados bancários DA PESSOA. Bloco à parte porque é o que se copia na
              hora de pagar, e porque texto solto é de propósito: banco de
              terceiro não vira cadastro nosso. */}
          <h3 style={{ margin: "20px 0 0", fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-dim)", textTransform: "uppercase" }}>
            Para onde vai o dinheiro
          </h3>
          <div style={{ marginTop: 8 }}>
            <Campos>
              <Campo label="Banco">
                {(id) => (
                  <input
                    id={id}
                    value={rascunho.banco}
                    onChange={(e) => setRascunho({ ...rascunho, banco: e.target.value })}
                    placeholder="Itaú"
                  />
                )}
              </Campo>

              <Campo label="Agência">
                {(id) => (
                  <input
                    id={id} inputMode="numeric"
                    value={rascunho.agencia}
                    onChange={(e) => setRascunho({ ...rascunho, agencia: e.target.value })}
                    placeholder="1234"
                  />
                )}
              </Campo>

              <Campo label="Conta">
                {(id) => (
                  <input
                    id={id} inputMode="numeric"
                    value={rascunho.conta_numero}
                    onChange={(e) => setRascunho({ ...rascunho, conta_numero: e.target.value })}
                    placeholder="56789-0"
                  />
                )}
              </Campo>

              <Campo label="Tipo da chave PIX">
                {(id) => (
<Escolha
                    id={id}
                    valor={rascunho.pix_tipo}
                    vazio="Sem PIX"
                    aoEscolher={(v) => setRascunho({ ...rascunho, pix_tipo: v })}
                    opcoes={PIX_TIPOS.map((t) => ({ id: t.id, nome: t.label }))}
                  />
                )}
              </Campo>

              <Campo label="Chave PIX" largo>
                {(id) => (
                  <input
                    id={id}
                    value={rascunho.pix_chave}
                    onChange={(e) => setRascunho({ ...rascunho, pix_chave: e.target.value })}
                    placeholder="CPF, e-mail, telefone ou chave aleatória"
                  />
                )}
              </Campo>
            </Campos>
          </div>

          {/* O QUE MUDA NESTE MÊS. Fora do formulário de propósito: o cadastro
              é o que vale até alguém mudar; isto aqui zera na virada do mês.
              Misturados no mesmo "Salvar", o vale de julho viraria vale eterno. */}
          {rascunho.id && !lancamentosPendentes && (
            <LancamentosDoMes
              colaboradorId={rascunho.id}
              competencia={mesAberto}
              valorHora={numero(rascunho.valor_hora)}
              linhas={lancamentos.filter((l) => l.colaborador_id === rascunho.id)}
              base={numero(rascunho.salario_base) + numero(rascunho.beneficios) + numero(rascunho.gratificacao)}
            />
          )}

          {/* Comissão de tráfego — leitura, não campo. Quem muda o acordo é o
              admin, no painel do Tráfego; aqui a folha só PRECISA enxergar o
              valor na hora de pagar, sem abrir outro módulo e refazer a conta. */}
          {(() => {
            const atual = rascunho.id ? lista.find((c) => c.id === rascunho.id) : undefined;
            const k = atual ? comissaoDe(atual) : undefined;
            if (!k) return null;
            return (
              <div style={{ marginTop: 18, border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>Comissão de tráfego</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>{k.nome} · {k.periodo}</div>
                  </div>
                  <strong style={{ fontSize: 22, fontVariantNumeric: "tabular-nums", color: "var(--ok)" }}>
                    {k.valor == null ? "—" : moeda(k.valor)}
                  </strong>
                </div>
                <p style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.55, marginTop: 8, marginBottom: 0 }}>
                  {k.valor == null
                    ? "Sem gasto em anúncios no período — não dá para calcular o fator de eficiência."
                    : `${k.pctFaturamento.toLocaleString("pt-BR")}% do faturamento do tráfego, multiplicado pelo fator de eficiência (${k.pctEficiencia.toLocaleString("pt-BR")}% do total da empresa ÷ gasto com imposto). Não entra na folha automática.`}
                </p>
              </div>
            );
          })()}
        </PainelLateral>
      )}

      {folhaAberta && (
        <PainelLateral
          centrado
          titulo="Gerar folha do mês"
          soFechaNoX
          subtitulo="Cria um compromisso previsto por pessoa — não paga nada."
          onFechar={() => setFolhaAberta(false)}
          largura={480}
          rodape={
            <Acoes>
              <Botao onClick={() => setFolhaAberta(false)}>Fechar</Botao>
              <Esp />
              <Botao
                variante="primario"
                icone="calendar-plus"
                carregando={gerando}
                disabled={!competencia || !naFolha.length}
                title={naFolha.length
                  ? `Lançar ${moeda(totalPrevia)} em compromissos previstos`
                  : "Ninguém com salário cadastrado para lançar"}
                onClick={gerarFolha}
              >
                Gerar folha
              </Botao>
            </Acoes>
          }
        >
          <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
            {erroFolha && (
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erroFolha}</p>
            )}

            <Campos>
              {!empresaId && empresas.length > 0 && (
                <Campo label="Empresa" largo dica="Em “Visão geral” a folha é gerada para uma empresa de cada vez.">
                  {(id) => <SeletorEmpresa id={id} empresas={empresas} valor={empresaFolha} aoMudar={setEmpresaFolha} />}
                </Campo>
              )}
              <Campo
                label="Competência"
                largo
                dica="O mês a que a folha se refere. O vencimento de cada pessoa sai do dia de pagamento dela."
              >
                {(id) => (
                  <input
                    id={id}
                    type="month"
                    value={competencia}
                    onChange={(e) => setCompetencia(e.target.value)}
                  />
                )}
              </Campo>
            </Campos>

            {/* A prévia não é enfeite: gerar a folha cria dezenas de milhares de
                reais de obrigação na agenda de uma vez. O número tem que estar
                na frente da pessoa ANTES de ela confirmar, não depois. */}
            <section
              style={{
                display: "grid", gap: 12, minWidth: 0, padding: 14,
                borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "1px solid var(--border)",
              }}
            >
              <h3 style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".01em", color: "var(--text-dim)" }}>
                O que vai ser criado {competencia ? `em ${competenciaBR(competencia)}` : ""}
              </h3>

              <div
                style={{
                  display: "grid", gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
                }}
              >
                <Numero rotulo="Pessoas na folha" valor={String(naFolha.length)} />
                <Numero rotulo="Total previsto" valor={moeda(totalPrevia)} cor="var(--atencao)" />
              </div>

              <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
                Entra quem está ativo ou afastado e tem salário ou benefício acima de zero.
                Desligado não entra — e quem está zerado também não, porque compromisso
                de {moeda(0)} só suja a agenda.
              </p>
            </section>

            {semSalario > 0 && (
              <p
                style={{
                  padding: "10px 12px", borderRadius: "var(--r-sm)", fontSize: 12.5, lineHeight: 1.55,
                  color: "var(--atencao)", background: "color-mix(in srgb, var(--atencao) 10%, transparent)",
                }}
              >
                {semSalario === 1
                  ? "1 pessoa está sem salário cadastrado e fica de fora."
                  : `${semSalario} pessoas estão sem salário cadastrado e ficam de fora.`}{" "}
                Se não for de propósito, é isso que faz a folha sair menor do que devia.
              </p>
            )}

            <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
              Cada linha nasce como <strong>previsto</strong>, com vencimento no dia de pagamento da
              pessoa. O salário-base é projeção: quem confirma o mês é o fechamento, editando o
              valor do compromisso antes de pagar.
            </p>

            {resultado && (
              <section
                style={{
                  display: "grid", gap: 7, minWidth: 0, padding: "12px 14px",
                  borderRadius: "var(--r-sm)",
                  background: "color-mix(in srgb, var(--ok) 9%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--ok) 30%, var(--border))",
                }}
              >
                <strong style={{ fontSize: 13.5, fontWeight: 800, color: "var(--ok)" }}>
                  {resultado.criados === 0
                    ? "Nada foi criado nesta competência."
                    : resultado.criados === 1
                      ? `1 compromisso de folha criado, total ${moeda(resultado.total)}`
                      : `${resultado.criados} compromissos de folha criados, total ${moeda(resultado.total)}`}
                </strong>
                <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
                  Competência {competenciaBR(resultado.competencia)}. Os compromissos estão na agenda
                  como previstos, esperando o fechamento.
                </span>
                <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55, overflowWrap: "anywhere" }}>
                  {resultado.repetida
                    ? "Esta competência já tinha sido gerada agora há pouco: são os mesmos compromissos, nenhum nasceu de novo."
                    : "Gerar de novo a mesma competência não duplica nada."}{" "}
                  A chave é{" "}
                  <code style={{ padding: "1px 6px", borderRadius: 6, background: "var(--surface-2)", fontSize: 11.5 }}>
                    folha:&lt;pessoa&gt;:{resultado.competencia}
                  </code>{" "}
                  — uma por pessoa por mês, para sempre.
                </span>
              </section>
            )}
          </div>
        </PainelLateral>
      )}

      {faltasDe && (() => {
        const pessoa = lista.find((c) => c.id === faltasDe);
        const mes = folha.get(faltasDe);
        if (!pessoa || !mes) return null;
        return (
          <FaltasPainel
            nome={nomeCurto(pessoa.nome)}
            competencia={mesDaFolha}
            faltas={mes.faltas}
            faltasDoPonto={ponto[faltasDe]?.faltasDoPonto ?? []}
            salario={mes.salario}
            aoFechar={() => setFaltasDe(null)}
            aoGravar={async (faltas) => {
              const ok = await gravarMes(faltasDe, { faltas });
              if (ok) setFaltasDe(null);
            }}
          />
        );
      })()}

      {regrinhaDe && (() => {
        const pessoa = lista.find((c) => c.id === regrinhaDe);
        const mes = folha.get(regrinhaDe);
        if (!pessoa || !mes) return null;
        return (
          <ComissaoPainel
            nome={nomeCurto(pessoa.nome)}
            competencia={mesDaFolha}
            mes={mes}
            sugestaoVendas={vendasDaPessoa(regrinhaDe)}
            setorVende={podeComissaoDeVendas(pessoa.setor)}
            sugestaoTrafego={comissaoAuto[regrinhaDe] ?? 0}
            sugestaoMarketplace={comissaoMkt[regrinhaDe] ?? 0}
            aoFechar={() => setRegrinhaDe(null)}
            aoGravar={async (partes) => {
              const ok = await gravarMes(regrinhaDe, partes);
              if (ok) setRegrinhaDe(null);
            }}
          />
        );
      })()}

      {pagandoDe && (() => {
        const pessoa = lista.find((c) => c.id === pagandoDe);
        const mes = mesEfetivo(pagandoDe);
        if (!pessoa || !mes) return null;
        return (
          <FecharPagamentoPainel
            nome={nomeCurto(pessoa.nome)}
            competencia={mesDaFolha}
            mes={mes}
            doPonto={ponto[pagandoDe]}
            aoFechar={() => setPagandoDe(null)}
            aoConfirmar={(opcoes) => fecharPagamento(pagandoDe, opcoes)}
          />
        );
      })()}

      {loteAberto && (
        <LotePainel
          pessoas={visiveis}
          competencia={mesDaFolha}
          aoFechar={() => setLoteAberto(false)}
          aoAplicar={async (ids, campo, valor) => {
            const r = await fetch("/api/financeiro/folha/mensal", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ competencia: mesDaFolha, ids, campo, valor }),
            });
            const d = (await r.json().catch(() => ({}))) as { gravados?: number; erro?: string };
            if (!r.ok && !d.gravados) { toast.erro(d.erro ?? "Não deu para aplicar."); return; }
            toast.ok(`Aplicado em ${d.gravados ?? ids.length} pessoa(s).`);
            setLoteAberto(false);
            await trocarMes(mesDaFolha.slice(0, 7));   // relê o mês inteiro
          }}
        />
      )}

    </>
  );
}

/** Número da prévia. Fica aqui porque só a folha precisa dele — o `Kpi` do kit
 *  é cartão de página inteira e dentro da folha do celular ele fica gigante. */
function Numero({ rotulo, valor, cor = "var(--text)" }: {
  rotulo: string; valor: string; cor?: string;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-dim)" }}>{rotulo}</div>
      <strong
        style={{
          display: "block", fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", color: cor,
          fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere",
        }}
      >
        {valor}
      </strong>
    </div>
  );
}

/**
 * O que muda NESTE mês: bônus, hora extra, vale, falta, farmácia, mercadinho.
 *
 * Vive fora do formulário de propósito. O cadastro guarda o que vale até alguém
 * mudar — salário, gratificação, chave PIX. Isto aqui zera na virada do mês, e
 * misturar os dois no mesmo "Salvar" transformaria o vale de julho em desconto
 * eterno, que é exatamente o defeito que ninguém percebe até a terceira folha.
 *
 * Por isso também não há botão de salvar: cada linha entra e sai sozinha, na
 * hora. Um rascunho de lançamentos esperando confirmação seria uma segunda
 * verdade em cima da primeira.
 *
 * Nada aqui PAGA nada. Quem soma isso é `gerarFolha`, na próxima vez que a
 * competência for gerada — e compromisso já criado não é reescrito por fora.
 */
function LancamentosDoMes({ colaboradorId, competencia, linhas, valorHora, base }: {
  colaboradorId: string;
  competencia: string;
  linhas: FolhaLancamento[];
  /** Sugere o valor ao lançar hora extra. Zero = sem sugestão. */
  valorHora: number;
  /** Salário + benefícios + gratificação, para mostrar o líquido projetado. */
  base: number;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<LancamentoTipo>("bonus");
  const [valor, setValor] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [descricao, setDescricao] = useState("");
  // "O bônus pode se repetir caso na hora de adicionar marque que ele é
  // recorrente" — só o bônus tem a caixa; o resto é fato do mês.
  const [recorrente, setRecorrente] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const unidade = LANCAMENTO[tipo].unidade;

  // O total já sai com o sinal do catálogo — quem digita nunca vê um menos.
  const ajuste = linhas.reduce((s, l) => s + (LANCAMENTO[l.tipo]?.sinal ?? 0) * l.valor, 0);
  const liquido = Math.max(0, base + ajuste);

  async function lancar() {
    const v = numero(valor);
    if (v <= 0) { setErro("Informe um valor maior que zero."); return; }
    setOcupado(true);
    setErro("");
    try {
      const resposta = await chamar("/api/financeiro/folha/lancamentos", "POST", {
        colaborador_id: colaboradorId,
        competencia,
        tipo,
        valor: v,
        quantidade: quantidade.trim() ? numero(quantidade) : null,
        descricao: descricao.trim() || null,
        recorrente: tipo === "bonus" && recorrente,
      }) as { aviso?: string } | undefined;
      setValor(""); setQuantidade(""); setDescricao(""); setRecorrente(false);
      if (resposta?.aviso) toast.info(resposta.aviso);
      else toast.ok(tipo === "bonus" && recorrente ? "Bônus lançado — repete todo mês." : `${LANCAMENTO[tipo].label} lançado.`);
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setOcupado(false);
    }
  }

  async function remover(l: FolhaLancamento) {
    // Bônus que repete tem duas perguntas: só este mês, ou daqui pra frente?
    // A cópia sai e a origem aprende; a origem só para de gerar (o bônus
    // deste mês fica) — apagar de vez é a última opção, nunca a primeira.
    let alcance: "" | "mes" | "futuro" = "";
    if (l.origem_id) {
      if (await confirmar(`Tirar este bônus de ${moeda(l.valor)} SÓ deste mês?`, {
        detalhe: "Os próximos meses continuam recebendo. Cancelar aqui abre a opção de parar daqui pra frente.",
      })) alcance = "mes";
      else if (await confirmar("Parar de repetir este bônus daqui pra frente?", {
        detalhe: "Sai deste mês e dos seguintes. Os meses já pagos não mudam.", perigo: true,
      })) alcance = "futuro";
      else return;
    } else if (l.recorrente) {
      if (await confirmar(`Parar de repetir este bônus de ${moeda(l.valor)} daqui pra frente?`, {
        detalhe: "O bônus deste mês fica; os próximos meses não recebem mais. Cancelar aqui abre a opção de apagar o lançamento.",
      })) alcance = "futuro";
      else if (!(await confirmar(`Apagar o bônus de ${moeda(l.valor)} deste mês?`, {
        detalhe: "As repetições já criadas nos outros meses ficam como lançamentos comuns.", perigo: true,
      }))) return;
    } else if (!(await confirmar(`Tirar ${LANCAMENTO[l.tipo].label} de ${moeda(l.valor)}?`, {
      detalhe: "O lançamento some do mês. A folha já gerada não muda sozinha — ela é refeita na próxima geração.",
      perigo: true,
    }))) return;
    setOcupado(true);
    try {
      const r = await fetch(`/api/financeiro/folha/lancamentos?id=${l.id}${alcance ? `&alcance=${alcance}` : ""}`, { method: "DELETE" });
      const dados = (await r.json().catch(() => ({}))) as { erro?: string; parou?: boolean };
      if (!r.ok) throw new Error(dados.erro ?? "Não deu para remover.");
      toast.ok(dados.parou ? "Este bônus não repete mais." : alcance === "mes" ? "Tirado só deste mês." : "Lançamento removido.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section style={{ marginTop: 18, border: "1px solid var(--border)", borderRadius: 12, padding: 14, minWidth: 0 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>
            Este mês · {competenciaBR(competencia.slice(0, 7))}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
            Bônus e hora extra somam; vale, falta, farmácia e mercadinho descontam.
          </div>
        </div>
        <div style={{ textAlign: "end" }}>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>A pagar</div>
          <strong style={{ fontSize: 22, fontVariantNumeric: "tabular-nums" }}>{moeda(liquido)}</strong>
        </div>
      </header>

      {linhas.length > 0 && (
        <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 6 }}>
          {linhas.map((l) => {
            const soma = LANCAMENTO[l.tipo].sinal > 0;
            return (
              <li
                key={l.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, minWidth: 0,
                  padding: "6px 4px 6px 8px", borderRadius: "var(--r-sm)", background: "var(--surface-2)",
                }}
              >
                <Icon name={LANCAMENTO[l.tipo].icone} size={15} color={soma ? "var(--ok)" : "var(--perigo)"} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  <strong style={{ fontWeight: 700 }}>{LANCAMENTO[l.tipo].label}</strong>
                  {(l.recorrente || l.origem_id) && (
                    <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "var(--surface)", color: "var(--text-dim)", verticalAlign: "middle" }}>
                      {l.origem_id ? "repetição" : "todo mês"}
                    </span>
                  )}
                  {l.quantidade != null && LANCAMENTO[l.tipo].unidade && (
                    <span style={{ color: "var(--text-dim)" }}>
                      {" "}· {l.quantidade} {LANCAMENTO[l.tipo].unidade}
                    </span>
                  )}
                  {l.descricao && (
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", overflowWrap: "anywhere" }}>
                      {l.descricao}
                    </span>
                  )}
                </span>
                {/* O sinal aparece AQUI, na leitura — nunca no campo de digitar. */}
                <strong
                  style={{
                    fontSize: 13.5, fontVariantNumeric: "tabular-nums",
                    color: soma ? "var(--ok)" : "var(--perigo)",
                  }}
                >
                  {soma ? "+" : "−"} {moeda(l.valor)}
                </strong>
                <BotaoIcone
                  variante="perigo"
                  icone="trash"
                  titulo={`Remover ${LANCAMENTO[l.tipo].label}`}
                  onClick={() => remover(l)}
                  disabled={ocupado}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ marginTop: 12 }}>
        <Campos min={150}>
          <Campo label="O que">
            {(id) => (
<Escolha
                id={id}
                valor={tipo}
                semVazio
                vazio="Bônus"
                aoEscolher={(v) => {
                  setTipo(v as LancamentoTipo);
                  // Trocar o tipo limpa a quantidade: "8" que valia horas não
                  // vale dias, e um número herdado do tipo anterior é o tipo de
                  // erro que passa despercebido porque parece preenchido.
                  setQuantidade("");
                }}
                opcoes={LANCAMENTO_TIPOS.map((t) => ({
                  id: t as string,
                  nome: LANCAMENTO[t].label,
                  // O sinal separa os grupos: ninguém lança "falta" achando que
                  // é crédito quando a lista diz de que lado ela entra.
                  grupo: LANCAMENTO[t].sinal > 0 ? "Créditos" : "Descontos",
                }))}
              />
            )}
          </Campo>

          {unidade && (
            <Campo label={`Quantas ${unidade}`}>
              {(id) => (
                <input
                  id={id} type="number" step="0.5" min="0" inputMode="decimal"
                  value={quantidade}
                  onChange={(e) => {
                    const q = e.target.value;
                    setQuantidade(q);
                    // Hora extra com valor da hora cadastrado calcula sozinha —
                    // mas só enquanto o valor não foi mexido à mão, senão a
                    // conta sobrescreveria o número que a pessoa escolheu.
                    if (tipo === "horas_extras" && valorHora > 0) {
                      setValor(q.trim() ? String(Math.round(numero(q) * valorHora * 100) / 100) : "");
                    }
                  }}
                  placeholder="0"
                />
              )}
            </Campo>
          )}

          <Campo label="Valor">
            {(id) => (
              <input
                id={id} type="number" step="0.01" min="0" inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            )}
          </Campo>

          <Campo label="Observação" largo>
            {(id) => (
              <input
                id={id}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Compra do dia 12, adiantamento combinado…"
              />
            )}
          </Campo>
        </Campos>

        {tipo === "bonus" && (
          <div style={{ marginTop: 8 }}>
            <Switch
              checked={recorrente}
              onChange={setRecorrente}
              label={recorrente ? "Repete todo mês — até alguém parar" : "Só neste mês"}
            />
          </div>
        )}

        {erro && (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }} role="alert">
            {erro}
          </p>
        )}

        <Acoes>
          <Esp />
          <Botao variante="primario" icone="plus" carregando={ocupado} onClick={lancar}>
            Lançar
          </Botao>
        </Acoes>
      </div>
    </section>
  );
}

// ── A tabela da folha do mês ─────────────────────────────────────────────────

/** As colunas de dinheiro editáveis, na ordem em que aparecem. */
const COLUNAS_DINHEIRO: { campo: "salario" | "bonus" | "comissao" | "gratificacao" | "beneficios" | "vale" | "convenio_farmacia" | "mercadinho"; label: string; desconto?: boolean }[] = [
  { campo: "salario", label: "Salário" },
  { campo: "bonus", label: "Bônus" },
  { campo: "comissao", label: "Comissão" },
  { campo: "gratificacao", label: "Gratif." },
  { campo: "beneficios", label: "Benefícios" },
  { campo: "vale", label: "Vale", desconto: true },
  { campo: "convenio_farmacia", label: "Farmácia", desconto: true },
  { campo: "mercadinho", label: "Mercadinho", desconto: true },
];

/**
 * A folha do mês, editável NA CÉLULA.
 *
 * Abrir a ficha para trocar um bônus era o custo que fez o pedido existir:
 * quinze pessoas × quatro campos é uma tarde clicando em drawer. Aqui cada
 * número é um input, gravado ao sair do campo — e o clique no NOME continua
 * abrindo a ficha, porque cadastro (PIX, conta, vínculo) é assunto dela.
 *
 * Dezesseis colunas não cabem em tela nenhuma: o bloco ROLA POR DENTRO, que é
 * a regra da fundação — a página nunca rola de lado. Três coisas fazem essa
 * rolagem EXISTIR de verdade, e cada uma faltou uma vez:
 *  · a pessoa fica GRUDADA à esquerda, senão no meio da rolagem ninguém sabe
 *    de quem é a linha que está editando;
 *  · dá para ARRASTAR a própria tabela para o lado (fora dos campos) — em
 *    desktop sem trackpad, a barra fininha era o único jeito e ninguém a via;
 *  · o cabeçalho gruda no topo do rolador, senão a 15ª linha vira adivinhação.
 */
function FolhaTabela({ pessoas, folha, ponto, logos, ocupado, aoAbrirFicha, aoGravar, aoAbrirFaltas, aoFecharPagamento, aoAbrirComissao, efetivoDe }: {
  pessoas: Colaborador[];
  folha: Map<string, FolhaDoMes>;
  ponto: Record<string, PontoDaPessoa>;
  logos: Record<string, string>;
  ocupado: boolean;
  aoAbrirFicha: (c: Colaborador) => void;
  aoGravar: (colaboradorId: string, patch: Record<string, unknown>) => Promise<boolean>;
  aoAbrirFaltas: (colaboradorId: string) => void;
  aoFecharPagamento: (colaboradorId: string) => void;
  aoAbrirComissao: (colaboradorId: string) => void;
  /** A linha do mês com as sugestões do sistema já aplicadas (ou a gravada). */
  efetivoDe: (colaboradorId: string) => FolhaDoMes | undefined;
}) {
  const rolador = useRef<HTMLDivElement>(null);
  /** Por onde o rolador avisa a barra do rodapé que rolou. */
  const barra = useRef<ControleRolagem>(null);
  const arrasto = useRef<{ x: number; scroll: number; pegou: boolean } | null>(null);

  /**
   * Arrastar-para-rolar, de QUALQUER ponto — inclusive de cima de um campo.
   *
   * A regra antiga ("pega o fundo da tabela, nunca um campo ou botão") deixava
   * a rolagem sem lugar de onde pegar: quase toda a superfície da folha É
   * campo de dinheiro, então sobravam os fiapos entre as células. Era esse o
   * "não consigo rolar na tabela".
   *
   * A cura é a mesma dos gestos do sistema: HISTERESE. O ponteiro desce e
   * nada acontece; só depois de ~8px na horizontal o arrasto assume, captura
   * o ponteiro e passa a rolar. Um clique seco nunca chega aos 8px, então
   * digitar na célula continua sendo digitar na célula.
   */
  function pegar(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    arrasto.current = { x: e.clientX, scroll: rolador.current?.scrollLeft ?? 0, pegou: false };
  }
  function mover(e: React.PointerEvent) {
    const a = arrasto.current;
    if (!a || !rolador.current) return;
    const dx = e.clientX - a.x;
    if (!a.pegou) {
      if (Math.abs(dx) < 8) return;
      a.pegou = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    rolador.current.scrollLeft = a.scroll - dx;
  }
  function soltar() { arrasto.current = null; }

  const grudada: React.CSSProperties = {
    position: "sticky", left: 0, zIndex: 1,
    // O fundo vem da LINHA (`--folha-fundo`, no globals). Pintar aqui inline
    // era o que fazia a coluna grudada ignorar o realce da linha sob o cursor.
    background: "var(--folha-fundo, var(--card, var(--surface)))",
    // Fio nítido + um sopro de sombra. A sombra grossa de antes virava uma
    // MANCHA escura repetida linha a linha — borda é o que separa; sombra só
    // insinua que existe conteúdo passando por baixo.
    borderRight: "1px solid color-mix(in srgb, var(--text) 11%, transparent)",
    boxShadow: "6px 0 8px -8px rgba(0,0,0,.16)",
  };
  /* Fio que separa os GRUPOS (ganha · desconta · resultado). Uma linha a cada
     cinco colunas dá a região; uma linha a cada coluna daria uma planilha. */
  const divisa: React.CSSProperties = {
    borderLeft: "1px solid color-mix(in srgb, var(--text) 12%, transparent)",
  };
  /* O RESULTADO se destaca por TIPO, não por fundo: a faixa cinza atrás da
     coluna virava uma laje com borda dura no meio da tabela, e ainda brigava
     com o realce da linha. Peso e tamanho separam sem sujar. */
  const palco: React.CSSProperties = { color: "var(--text)" };
  const th: React.CSSProperties = {
    padding: "9px 6px", fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em",
    // Rótulo em cinza-claro sobre superfície clara não passava de leitura
    // decorativa; 68% do texto é legível e continua abaixo do dado.
    textTransform: "uppercase", color: "color-mix(in srgb, var(--text) 68%, transparent)",
    textAlign: "right", whiteSpace: "nowrap",
    position: "sticky", top: 0, background: "var(--card, var(--surface))", zIndex: 2,
  };
  /* O cabeçalho fecha com um fio mais firme que o das linhas: é a borda entre
     rótulo e dado, e sem ela o primeiro nome parecia mais um título. */
  const thBase: React.CSSProperties = {
    ...th, top: 33, borderBottom: "1px solid color-mix(in srgb, var(--text) 14%, transparent)",
  };
  // Hairline a 7%: separa sem desenhar uma grade — grade cheia briga com os
  // números, e são os números que importam.
  const td: React.CSSProperties = {
    padding: "9px 6px", textAlign: "right", whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums",
    borderBottom: "1px solid color-mix(in srgb, var(--text) 7%, transparent)",
  };

  return (
    <>
    <div
      ref={rolador}
      onPointerDown={pegar}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onScroll={() => barra.current?.atualizar()}
      style={{
        // SEM teto de altura: com maxHeight 70dvh a lista cortava em ~17 de 21
        // pessoas num monitor grande, e a rolagem interna (barra invisível até
        // ser tocada) fazia os últimos parecerem CADASTROS SUMIDOS. A folha
        // mostra todo mundo e quem rola é a página — funcionário nunca some
        // atrás de um scroll que ninguém percebe.
        overflowX: "auto",
        // `overscroll-behavior: contain` NOS DOIS EIXOS era o motivo de a roda
        // do mouse não fazer nada em cima da tabela: declarar overflow-x já faz
        // o overflow-y virar `auto`, então este bloco é um rolador vertical
        // também — um que não tem o que rolar. Com `contain` no Y ele engole a
        // roda e não deixa a PÁGINA rolar; a tabela parecia travada. No X o
        // contain fica, que é o que impede o gesto lateral de virar "voltar"
        // do navegador.
        overscrollBehaviorX: "contain", overscrollBehaviorY: "auto",
        WebkitOverflowScrolling: "touch",
        maxWidth: "none", minWidth: 0,
        opacity: ocupado ? 0.6 : 1, cursor: "grab",
        // A tabela ocupa o cartão de ponta a ponta: as 16 colunas precisam de
        // cada pixel, e os 18px de respiro de cada lado eram 36 que faltavam
        // no fim. O fio de cima e o de baixo continuam desenhando o bloco.
        margin: "0 -18px", borderRadius: 0,
        borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Piso de largura: sem ele as dezesseis colunas se espremiam até o
          rótulo quebrar em duas linhas e a coluna de dinheiro caber "1.7…".
          O bloco que rola em volta é o `rolador` logo acima (overflow-x auto)
          e a barra do rodapé é o que anuncia o gesto. */}
      <table className="folha-tab" style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 940 }}>
        <thead>
          {/* Dois níveis: dezesseis rótulos soltos são sopa; três GRUPOS
              (ganha · desconta · ponto) deixam o olho pular direto para a
              região certa. Agrupar é hierarquia mais barata que cor. */}
          {/* Altura FIXA na linha de grupo: a segunda linha gruda em top:33,
              e isso só é verdade se esta medir exatamente 33 — sem a trava, um
              zoom ou uma fonte maior descolam as duas no meio da rolagem. */}
          <tr style={{ height: 33 }}>
            <th style={{ ...th, ...grudada, zIndex: 3, padding: 0, height: 33 }} aria-hidden />
            {/* A FAIXA pinta o grupo, não só o rótulo: o olho pega a região
                inteira antes de ler a palavra. */}
            <th colSpan={5} style={{ ...th, textAlign: "center",
              color: "color-mix(in srgb, var(--ok) 62%, var(--text))",
              background: "color-mix(in srgb, var(--ok) 10%, var(--card, var(--surface)))" }}>Ganhos</th>
            {/* Falta É desconto — morava depois do ponto e o olho não a somava
                com vale/farmácia/mercadinho, que são a mesma natureza. */}
            <th colSpan={4} style={{ ...th, ...divisa, textAlign: "center",
              color: "color-mix(in srgb, var(--perigo) 62%, var(--text))",
              background: "color-mix(in srgb, var(--perigo) 10%, var(--card, var(--surface)))" }}>Descontos</th>
            <th style={{ ...th, ...divisa, padding: 0, height: 33 }} colSpan={3} aria-hidden />
          </tr>
          <tr>
            <th style={{ ...thBase, ...grudada, zIndex: 3, textAlign: "left", minWidth: 168, paddingLeft: 10 }}>Pessoa</th>
            {COLUNAS_DINHEIRO.map((c) => (
              <th key={c.campo} style={{ ...thBase, ...(c.campo === "vale" ? divisa : null) }}>{c.label}</th>
            ))}
            <th style={thBase}>Faltas</th>
            {/* Uma coluna só de horas: extra do mês e banco corrido eram dois
                números dizendo quase a mesma coisa — o BANCO é o que se paga,
                e o detalhe do mês aparece na hora de fechar o pagamento. */}
            <th style={{ ...thBase, ...divisa }} title="Banco de horas corrido, do sistema de ponto — o extra do mês aparece ao fechar o pagamento">Banco</th>
            <th style={{ ...thBase, ...palco }} title="Líquido = bruto (salário + bônus + comissão + gratificação + benefícios) menos vale, farmácia, mercadinho e faltas. Bônus inclui tráfego e marketplace; comissão é vendas + outros.">Líquido</th>
            <th style={{ ...thBase, textAlign: "center", paddingRight: 16 }}>Pago</th>
          </tr>
        </thead>
        <tbody>
          {pessoas.map((c, i) => {
            const mes = folha.get(c.id);
            // A linha EFETIVA: vendas, tráfego, marketplace e mercadinho entram
            // só onde a área é automática neste mês e a célula está em zero.
            const ef = mes ? efetivoDe(c.id) ?? mes : undefined;
            const totais = ef ? liquidoDoMes(ef) : null;
            // Bônus = bônus do mês + tráfego + marketplace; comissão = vendas +
            // outros. Itálico onde o número veio do sistema, não de alguém.
            const bonusEf = ef ? bonusDoMes(ef) : 0;
            const comissaoEf = ef ? comissaoDoMes(ef) : 0;
            const bonusAuto = !!(mes && ef) && bonusDoMes(ef) !== bonusDoMes(mes);
            const comissaoAuto = !!(mes && ef) && comissaoDoMes(ef) !== comissaoDoMes(mes);
            const mercadinhoAuto = mes && ef && ef.mercadinho !== mes.mercadinho ? ef.mercadinho : 0;
            const doPonto = ponto[c.id];
            // A linha CONTA o próprio estado: paga ganha um véu verde e o
            // conteúdo assenta. A zebra saiu no redesenho — com as linhas mais
            // altas e o fio de 7%, o fundo alternado era ruído, não guia; quem
            // guia é o realce da linha sob o cursor (`.folha-linha`, globals).
            void i;
            return (
              <tr
                key={c.id}
                className="folha-linha"
                data-pago={mes?.pago ? "1" : undefined}
                style={{ opacity: mes?.pago ? 0.72 : 1 }}
              >
                <td className="folha-pessoa" style={{ ...td, ...grudada, textAlign: "left" }}>
                  <button
                    type="button"
                    onClick={() => aoAbrirFicha(c)}
                    className="ui-card-alvo"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 9, minHeight: 46,
                      border: "none", background: "transparent", cursor: "pointer",
                      padding: "0 4px", fontSize: 13.5, fontWeight: 700, color: "var(--text)", minWidth: 0,
                    }}
                    title={`${c.nome} — abrir ficha`}
                  >
                    {/* Status é um PONTO: a cor diz tudo, o title diz a palavra. */}
                    <span
                      aria-label={SELO_COLABORADOR[c.status].label}
                      title={SELO_COLABORADOR[c.status].label}
                      style={{
                        width: 8, height: 8, borderRadius: "50%", flex: "none",
                        background: c.status === "ativo" ? "var(--ok)" : c.status === "afastado" ? "var(--atencao)" : "var(--perigo)",
                      }}
                    />
                    <Marca marca={{ nome: c.nome, logo: logos[c.id] ?? null, icone: "user" }} tamanho={30} raio={9} />
                    {/* SEM rolagem lateral — pedido literal. Setor e vínculo
                        empilham sob o nome em vez de ter coluna própria: duas
                        colunas a menos é o que faz a folha caber na tela. */}
                    <span style={{ display: "grid", minWidth: 0, textAlign: "left" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 148 }}>
                        {nomeCurto(c.nome)}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 148 }}>
                        {c.setor || "—"} · {LABEL_VINCULO[(c.vinculo || "pf") as Vinculo] ?? c.vinculo}
                      </span>
                    </span>
                  </button>
                </td>
                {COLUNAS_DINHEIRO.map((col) => (
                  <td key={col.campo} style={col.campo === "vale" ? { ...td, ...divisa } : td}>
                    {!mes ? "—" : col.campo === "comissao" || col.campo === "bonus" ? (
                      /* Bônus e comissão são SOMAS da regrinha: bônus = bônus
                         do mês + tráfego + marketplace; comissão = vendas +
                         outros. O total abre o detalhe, não se digita por cima
                         — digitar aqui esconderia as partes. */
                      (() => {
                        const valor = col.campo === "bonus" ? bonusEf : comissaoEf;
                        const auto = col.campo === "bonus" ? bonusAuto : comissaoAuto;
                        return (
                          <button
                            type="button"
                            onClick={() => aoAbrirComissao(c.id)}
                            className="ui-card-alvo"
                            title={col.campo === "bonus"
                              ? "Bônus do mês + tráfego + marketplace — abre o detalhe"
                              : "Comissão de vendas + outros — abre o detalhe"}
                            style={{
                              width: "100%", minHeight: 38, padding: "0 6px", borderRadius: 8,
                              border: "1px solid transparent", background: "transparent", cursor: "pointer",
                              textAlign: "right", fontSize: 13, fontVariantNumeric: "tabular-nums",
                              fontStyle: auto ? "italic" : undefined,
                              color: valor > 0 ? (auto ? "var(--text-dim)" : "var(--text)") : "var(--text-dim)",
                            }}
                          >
                            {valor > 0 ? dinheiroBR(valor) : "0,00"}
                          </button>
                        );
                      })()
                    ) : (
                      <CelulaDinheiro
                        valor={mes[col.campo]}
                        sugestao={col.campo === "mercadinho" ? mercadinhoAuto : 0}
                        desconto={col.desconto}
                        campo={col.campo}
                        aoGravar={(v) => aoGravar(c.id, { [col.campo]: v })}
                      />
                    )}
                  </td>
                ))}
                <td style={td}>
                  <button
                    type="button"
                    onClick={() => aoAbrirFaltas(c.id)}
                    className="ui-card-alvo"
                    title="Relatar faltas — cada falta desconta o dia e o descanso da semana"
                    style={{
                      minHeight: 32, padding: "0 12px", borderRadius: 999, cursor: "pointer",
                      border: mes?.faltas.length
                        ? "1px solid color-mix(in srgb, var(--perigo) 40%, transparent)"
                        : "1px solid transparent",
                      // Pílula com superfície própria: borda fina sobre fundo
                      // igual ao da linha lia-se como campo vazio, não como ação.
                      background: mes?.faltas.length
                        ? "color-mix(in srgb, var(--perigo) 10%, transparent)"
                        : "var(--surface-2)",
                      fontSize: 12, fontWeight: 700,
                      color: mes?.faltas.length ? "var(--perigo)" : "color-mix(in srgb, var(--text) 62%, transparent)",
                    }}
                  >
                    {mes?.faltas.length
                      ? `${mes.faltas.length} · −${moeda(descontoPorFaltas(mes.faltas, mes.salario).total)}`
                      : "marcar"}
                  </button>
                </td>
                {/* Horas do PONTO — a folha não recalcula, só mostra. Negativo
                    ou zero vira N/A: pedido literal do dono. */}
                <td style={{ ...td, ...divisa, color: "var(--ok)" }}>
                  {(doPonto && horasLegiveis(doPonto.bancoMin)) ?? <span style={{ color: "var(--text-dim)" }}>N/A</span>}
                </td>
                <td style={{ ...td, ...palco }}>
                  {totais ? (
                    <span style={{ display: "grid", justifyItems: "end", gap: 1 }}>
                      {/* Tracking negativo no número grande: quanto maior o
                          corpo, mais soltas as letras parecem. */}
                      <strong style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-.012em", lineHeight: 1.15 }}>
                        {moeda(totais.liquido)}
                      </strong>
                      <span style={{ fontSize: 10.5, lineHeight: 1.2, color: "color-mix(in srgb, var(--text) 52%, transparent)" }}>
                        bruto {moeda(totais.ganhos)}
                      </span>
                    </span>
                  ) : "—"}
                </td>
                <td style={{ ...td, textAlign: "center", paddingRight: 16 }}>
                  <CheckPago
                    marcado={mes?.pago ?? false}
                    disabled={!mes}
                    nome={nomeCurto(c.nome)}
                    aoMudar={(v) => { if (v) aoFecharPagamento(c.id); else void aoGravar(c.id, { pago: false }); }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {/* A barra de rolagem de lado, PRESA no rodapé da tela enquanto a tabela
        está à vista. Sem ela, a barra nativa ficava no fim de 21 linhas e
        "não dava pra rolar dentro da tabela" com mouse. */}
    <RolagemPresa alvo={rolador} controle={barra} />
    </>
  );
}

/**
 * Um número editável no lugar. Quieto até ser tocado: a borda só aparece no
 * hover/foco — dezesseis caixinhas com borda transformavam a folha numa
 * planilha de imposto. Grava ao SAIR do campo, só quando mudou; falhou, o
 * valor volta — a célula nunca mostra um número que o banco não tem.
 */
function CelulaDinheiro({ valor, sugestao = 0, desconto, campo, aoGravar }: {
  valor: number;
  /** Valor calculado pelo sistema (comissão do acordo). Vale enquanto a
   *  célula está em zero; aparece esmaecido e entra no líquido, mas só vira
   *  número GRAVADO quando alguém edita ou fecha o pagamento. */
  sugestao?: number;
  desconto?: boolean;
  /** Nome da coluna — é o que deixa o Enter descer para a linha de baixo. */
  campo: string;
  aoGravar: (v: number) => Promise<boolean>;
}) {
  const [texto, setTexto] = useState(String(valor || "").replace(".", ","));
  const [gravando, setGravando] = useState(false);
  const [focado, setFocado] = useState(false);
  // O pulso de "gravou": um instante de verde na borda, no MOMENTO do commit.
  // Causalidade — o feedback nasce do evento que o causou, não de um toast a
  // meia tela de distância. Some sozinho; quem salvou dezesseis células não
  // pode acumular dezesseis avisos.
  const [salvou, setSalvou] = useState(false);
  const ultimo = useRef(valor);

  useEffect(() => {
    if (valor !== ultimo.current) { ultimo.current = valor; setTexto(String(valor || "").replace(".", ",")); }
  }, [valor]);

  useEffect(() => {
    if (!salvou) return;
    // O hold é um momento de ênfase — e ênfase tem token (500ms). Lido do CSS
    // para nunca sair de sincronia com a escala; 700 era número solto.
    const t = setTimeout(() => setSalvou(false), duracaoCss("--duration-very-slow", 500));
    return () => clearTimeout(t);
  }, [salvou]);

  const cancelado = useRef(false);

  async function confirmar() {
    setFocado(false);
    // Esc: o blur que vem em seguida NÃO grava — cancelar tem de ser
    // cancelar, não "gravar do mesmo jeito ao sair".
    const cru = () => String(ultimo.current || "").replace(".", ",");
    if (cancelado.current) { cancelado.current = false; setTexto(cru()); return; }
    const n = numeroBR(texto);
    if (Number.isNaN(n) || n === ultimo.current || n < 0) { setTexto(cru()); return; }
    setGravando(true);
    const ok = await aoGravar(n);
    setGravando(false);
    if (!ok) setTexto(cru());
    else setSalvou(true);
  }

  /**
   * Enter DESCE A COLUNA — o fluxo real de quem fecha folha: digitar o bônus
   * de todo mundo, um embaixo do outro, sem tocar no mouse. O próximo campo é
   * o MESMO campo da linha de baixo (ordem do DOM), achado pelo `data-celula`;
   * o texto chega selecionado para digitar por cima, como numa planilha.
   */
  function descerColuna(atual: HTMLInputElement) {
    const campo = atual.dataset.celula;
    if (!campo) return;
    const todos = [...document.querySelectorAll<HTMLInputElement>(`input[data-celula="${campo}"]`)];
    const proximo = todos[todos.indexOf(atual) + 1];
    if (proximo) requestAnimationFrame(() => { proximo.focus(); proximo.select(); });
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={focado ? texto : valor ? dinheiroBR(valor) : sugestao > 0 ? dinheiroBR(sugestao) : ""}
      disabled={gravando}
      onFocus={(e) => { setFocado(true); setTexto(String(ultimo.current || sugestao || "").replace(".", ",")); e.target.select(); }}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => void confirmar()}
      onKeyDown={(e) => {
        const el = e.target as HTMLInputElement;
        if (e.key === "Enter") { e.preventDefault(); descerColuna(el); el.blur(); }
        if (e.key === "Escape") { cancelado.current = true; el.blur(); }
      }}
      data-celula={campo}
      placeholder="0,00"
      title={!valor && sugestao > 0 ? "Comissão do acordo, calculada pelo sistema — edite para travar outro valor" : undefined}
      style={{
        width: "100%", minWidth: 0, minHeight: 38, textAlign: "right", fontSize: 13,
        fontVariantNumeric: "tabular-nums", padding: "0 6px", borderRadius: 8,
        border: salvou ? "1px solid var(--ok)" : focado ? "1px solid var(--primary)" : "1px solid transparent",
        background: salvou ? "color-mix(in srgb, var(--ok) 10%, transparent)" : focado ? "var(--surface)" : "transparent",
        color: desconto && (valor > 0 || (focado && numeroBR(texto) > 0)) ? "var(--perigo)"
          : !focado && !valor && sugestao > 0 ? "var(--text-dim)" : "var(--text)",
        fontStyle: !focado && !valor && sugestao > 0 ? "italic" : undefined,
        opacity: gravando ? 0.5 : 1,
        transition: "border-color var(--duration-quick) var(--ease-out), background var(--duration-quick) var(--ease-out)",
      }}
    />
  );
}

/**
 * As faltas do mês — uma GRADE de dias, não um input de data.
 *
 * O `<input type="date">` nativo era o defeito: formato gringo, visual de
 * sistema, e "acrescentar" uma data por vez para algo que se pensa olhando o
 * calendário. Aqui o mês inteiro está na tela, em português, e faltou = tocou
 * no dia. Os domingos aparecem apagados — não são marcáveis, são o que se
 * PERDE (o DSR da semana), e o desconto ao vivo mostra isso antes de salvar.
 *
 * "Puxar do ponto" traz os dias que o sistema de ponto já sabe que ficaram
 * sem batida e sem justificativa — a pessoa confere e salva; o ponto sugere,
 * quem decide é quem paga.
 */
/**
 * A REGRINHA da comissão — quatro áreas que somam o total do mês.
 *
 * "Alguns têm comissão em mais de uma área": um número só escondia de onde o
 * valor veio, e dois meses depois ninguém sabia se os R$ 900 tinham a parte do
 * marketplace. Aqui cada área tem seu campo, o tráfego chega calculado do
 * acordo (aplicável num toque, editável sempre), e o que a folha soma no bruto
 * é o TOTAL — mantido por gatilho no banco, para nunca divergir das partes.
 */
function ComissaoPainel({ nome, competencia, mes, sugestaoVendas = 0, setorVende = true, sugestaoTrafego, sugestaoMarketplace = 0, aoFechar, aoGravar }: {
  nome: string;
  competencia: string;
  mes: FolhaDoMes;
  /** A das vendedoras — soma do valor_comissao da planilha do ERP no mês. */
  sugestaoVendas?: number;
  /** O setor desta pessoa vende? Fora de Design/Marketing/Comercial a parte
   *  de vendas nunca é sugerida — só digitada. */
  setorVende?: boolean;
  sugestaoTrafego: number;
  /** A do gerenciador dos marketplaces — mesma régua, na parte Marketplace. */
  sugestaoMarketplace?: number;
  aoFechar: () => void;
  aoGravar: (partes: Record<string, number | boolean>) => Promise<void>;
}) {
  const sugestao: Record<string, number> = {
    comissao_vendas: sugestaoVendas, comissao_trafego: sugestaoTrafego, comissao_marketplace: sugestaoMarketplace,
  };
  const parteDe = (campo: string): AutoParte | null =>
    campo === "comissao_vendas" ? "vendas" : campo === "comissao_trafego" ? "trafego" : campo === "comissao_marketplace" ? "marketplace" : null;
  // O "menuzinho" do mês: por área, a entrada automática ligada ou não. O
  // valor gravado vence; sem ele, a data decide (setembro/2026 em diante).
  const [auto, setAuto] = useState<Record<AutoParte, boolean>>(() => ({
    vendas: entradaAutomatica(mes, "vendas"),
    trafego: entradaAutomatica(mes, "trafego"),
    marketplace: entradaAutomatica(mes, "marketplace"),
  }));
  // "Venda em tráfego e marketplace é bônus, e não comissão": as partes ficam
  // gravadas onde estão, mas a tela as agrupa como BÔNUS (com o bônus do mês
  // digitado) e deixa em COMISSÃO só vendas e outros.
  const CAMPOS = [{ campo: "bonus", label: "Bônus do mês" } as const, ...COMISSAO_PARTES] as { campo: "bonus" | (typeof COMISSAO_PARTES)[number]["campo"]; label: string }[];
  const GRUPOS: { titulo: string; campos: string[] }[] = [
    { titulo: "Bônus", campos: ["bonus", "comissao_trafego", "comissao_marketplace"] },
    { titulo: "Comissão", campos: ["comissao_vendas", "comissao_outros"] },
  ];
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS.map((pt) => {
      const v = mes[pt.campo];
      const parte = parteDe(pt.campo);
      // Área automática e ainda em zero: o campo já nasce com a conta do
      // sistema — salvar congela o número que a pessoa viu.
      const s = parte && !mes.pago && entradaAutomatica(mes, parte) && !v ? sugestao[pt.campo] : 0;
      const n = v || s;
      return [pt.campo, n ? String(n).replace(".", ",") : ""];
    })));
  const [salvando, setSalvando] = useState(false);

  const numeros = Object.fromEntries(CAMPOS.map((pt) => {
    const n = numeroBR(valores[pt.campo] ?? "");
    return [pt.campo, Number.isNaN(n) ? 0 : n];
  }));
  // Só as PARTES da comissão passam por aqui — o bônus do mês tem coluna própria.
  const totalComissoes = COMISSAO_PARTES.map((pt) => numeros[pt.campo]).reduce((s, n) => s + n, 0);
  const totalBonus = numeros.bonus + numeros.comissao_trafego + numeros.comissao_marketplace;
  const totalComissao = numeros.comissao_vendas + numeros.comissao_outros;
  const total = numeros.bonus + totalComissoes;
  const interruptores = { auto_vendas: auto.vendas, auto_trafego: auto.trafego, auto_marketplace: auto.marketplace };

  return (
    <PainelLateral
      centrado
      titulo={`Bônus e comissão — ${nome}`}
      subtitulo={`${rotuloDoMes(competencia)} · bônus = do mês + tráfego + marketplace · comissão = vendas + outros`}
      onFechar={aoFechar}
      rodape={
        <Acoes>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Esp />
          <Botao
            variante="primario" icone="check" carregando={salvando}
            onClick={() => {
              setSalvando(true);
              void aoGravar({ ...numeros, ...interruptores }).finally(() => setSalvando(false));
            }}
          >
            Salvar · {moeda(total)}
          </Botao>
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {GRUPOS.map((g) => (
          <div key={g.titulo} style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-dim)", marginTop: 4 }}>
            {g.titulo} · {moeda(g.titulo === "Bônus" ? totalBonus : totalComissao)}
          </div>
        )).flatMap((cabecalho, gi) => [cabecalho, ...CAMPOS.filter((pt) => GRUPOS[gi].campos.includes(pt.campo)).map((pt) => {
          const parte = parteDe(pt.campo);
          const sug = sugestao[pt.campo] ?? 0;
          const vazio = numeros[pt.campo] === 0 && !valores[pt.campo]?.trim();
          return (
            <div key={pt.campo} style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <label htmlFor={`cm-${pt.campo}`} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)", flex: "1 1 120px" }}>
                  {pt.label}
                </label>
                {/* O interruptor do MÊS: vale só para esta competência desta pessoa. */}
                {parte && !mes.pago && (
                  <Switch
                    checked={auto[parte]}
                    onChange={(v) => setAuto({ ...auto, [parte]: v })}
                    label={auto[parte] ? "Automático" : "Manual"}
                  />
                )}
              </div>
              <input
                id={`cm-${pt.campo}`}
                inputMode="decimal"
                value={valores[pt.campo] ?? ""}
                onChange={(e) => setValores({ ...valores, [pt.campo]: e.target.value })}
                placeholder="0,00"
                style={{
                  width: "100%", minHeight: "var(--tap)", padding: "0 12px", textAlign: "right",
                  borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
                  background: "var(--surface-2)", color: "var(--text)", fontSize: 14,
                  fontVariantNumeric: "tabular-nums", outline: "none",
                }}
              />
              {parte && sug > 0 && vazio && (
                <button
                  type="button"
                  onClick={() => setValores({ ...valores, [pt.campo]: String(sug).replace(".", ",") })}
                  className="ui-card-alvo"
                  style={{
                    justifySelf: "start", minHeight: 30, padding: "0 10px", borderRadius: 999,
                    border: "1px dashed var(--border)", background: "transparent", cursor: "pointer",
                    fontSize: 12, fontWeight: 700, color: "var(--primary-texto)",
                  }}
                >
                  {parte === "vendas" ? "usar a da planilha" : "usar a do acordo"} · {moeda(sug)}
                </button>
              )}
              {parte && sug === 0 && auto[parte] && (
                <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                  {parte === "vendas"
                    ? (setorVende ? "Sem pagamento com comissão na planilha neste mês." : "Este setor não recebe comissão de vendas — se for exceção, digite o valor.")
                    : "Sem acordo calculado para este mês."}
                </span>
              )}
            </div>
          );
        })])}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)",
          fontSize: 15, fontVariantNumeric: "tabular-nums",
        }}>
          <span>Total do mês</span><b>{moeda(total)}</b>
        </div>
      </div>
    </PainelLateral>
  );
}

/**
 * Fechar o pagamento do mês — a CONFERÊNCIA antes do pago.
 *
 * Marcar pago era um clique seco, e o clique seco deixava duas perguntas sem
 * dono: as faltas que o ponto registrou entram neste pagamento? e as horas
 * extras foram pagas junto? Aqui as duas são feitas UMA vez, no momento certo
 * — e a resposta padrão das horas é NÃO, porque debitar banco de horas por
 * padrão seria tirar hora de alguém no silêncio de um checkbox.
 */
function FecharPagamentoPainel({ nome, competencia, mes, doPonto, aoFechar, aoConfirmar }: {
  nome: string;
  competencia: string;
  mes: FolhaDoMes;
  doPonto?: PontoDaPessoa;
  aoFechar: () => void;
  aoConfirmar: (opcoes: { faltas?: string[]; pagarHoras: boolean; baixarMercadinho: boolean }) => void;
}) {
  // Faltas que o ponto viu e a folha ainda não tem — a pergunta só existe
  // quando há divergência; ponto e folha de acordo não merecem burocracia.
  const novasFaltas = (doPonto?.faltasDoPonto ?? []).filter((f) => !mes.faltas.includes(f));
  const [usarFaltas, setUsarFaltas] = useState(true);
  const [pagarHoras, setPagarHoras] = useState<"nao" | "sim">("nao");
  // Desligado por padrão, pela mesma razão das horas: quitar dívida em outro
  // sistema no silêncio de um checkbox seria mexer no dinheiro de alguém sem
  // que ninguém tenha dito que mexeu.
  const [baixarMercadinho, setBaixarMercadinho] = useState<"nao" | "sim">("nao");
  const [salvando, setSalvando] = useState(false);

  const faltasFinais = usarFaltas && novasFaltas.length
    ? [...new Set([...mes.faltas, ...novasFaltas])].sort()
    : mes.faltas;
  const totais = liquidoDoMes({ ...mes, faltas: faltasFinais });
  // `extrasMesMin` JÁ é o crédito aberto do mês (a baixa em dinheiro sai dele),
  // então subtrair as horas pagas de novo descontava duas vezes e o painel
  // dizia "nada a pagar" com hora a favor no banco.
  const extrasDoMes = doPonto ? Math.max(0, doPonto.extrasMesMin) : 0;
  const dias = (fs: string[]) => fs.map((f) => f.slice(8, 10)).join(", ");

  const linhaResumo: React.CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "baseline",
    fontSize: 13.5, fontVariantNumeric: "tabular-nums",
  };

  return (
    <PainelLateral
      centrado
      titulo={`Fechar pagamento — ${nome}`}
      subtitulo={`Competência ${rotuloDoMes(competencia)} · pagamento em ${rotuloDoMes(mesSeguinteDe(competencia))}`}
      onFechar={aoFechar}
      rodape={
        <Acoes>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Esp />
          <Botao
            variante="primario" icone="check" carregando={salvando}
            onClick={() => {
              setSalvando(true);
              aoConfirmar({
                faltas: usarFaltas && novasFaltas.length ? faltasFinais : undefined,
                pagarHoras: pagarHoras === "sim",
                baixarMercadinho: baixarMercadinho === "sim",
              });
            }}
          >
            Confirmar · {moeda(totais.liquido)}
          </Botao>
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gap: 6, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)" }}>
          <div style={linhaResumo}><span style={{ color: "var(--text-dim)" }}>Bruto</span><b>{moeda(totais.ganhos)}</b></div>
          <div style={linhaResumo}><span style={{ color: "var(--text-dim)" }}>Descontos</span><b style={{ color: totais.descontos ? "var(--perigo)" : undefined }}>−{moeda(totais.descontos)}</b></div>
          <div style={{ ...linhaResumo, fontSize: 16, paddingTop: 6, borderTop: "1px solid var(--border)" }}>
            <span>Líquido</span><b>{moeda(totais.liquido)}</b>
          </div>
        </div>

        {novasFaltas.length > 0 && (
          <section style={{
            display: "grid", gap: 8, padding: "12px 14px", borderRadius: 12,
            border: "1px solid color-mix(in srgb, var(--atencao) 45%, transparent)",
            background: "color-mix(in srgb, var(--atencao) 8%, transparent)",
          }}>
            <b style={{ fontSize: 13 }}>
              O ponto registrou {novasFaltas.length} falta{novasFaltas.length > 1 ? "s" : ""} sem justificativa
              {" "}— dia{novasFaltas.length > 1 ? "s" : ""} {dias(novasFaltas)}.
            </b>
            <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
              É isso mesmo? Cada falta desconta o dia e o descanso da semana
              (−{moeda(descontoPorFaltas(faltasFinais, mes.salario).total - descontoPorFaltas(mes.faltas, mes.salario).total)} neste pagamento).
            </span>
            <Alternativas
              valor={usarFaltas ? "sim" : "nao"}
              aoEscolher={(v) => setUsarFaltas(v === "sim")}
              opcoes={[
                { id: "sim", label: "Descontar as faltas" },
                { id: "nao", label: "Ignorar por enquanto" },
              ]}
            />
          </section>
        )}

        {doPonto && (
          <section style={{ display: "grid", gap: 8, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)" }}>
            <b style={{ fontSize: 13 }}>Foram pagas as horas extras?</b>
            <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
              {extrasDoMes > 0
                ? `${(horasLegiveis(extrasDoMes) ?? "").replace("+", "")} a favor no mês. Respondendo sim, elas saem do banco de horas ao confirmar.`
                : doPonto.pagasMesMin > 0
                  ? `As horas deste mês já foram baixadas (${(horasLegiveis(doPonto.pagasMesMin) ?? "").replace("+", "")}).`
                  : "Sem hora a favor neste mês — nada a baixar."}
            </span>
            {extrasDoMes > 0 && (
              <Alternativas
                valor={pagarHoras}
                aoEscolher={(v) => setPagarHoras(v as "nao" | "sim")}
                opcoes={[
                  { id: "nao", label: "Não" },
                  { id: "sim", label: "Sim — dar baixa no banco" },
                ]}
              />
            )}
          </section>
        )}

        {mes.mercadinho > 0 && (
          <section style={{ display: "grid", gap: 8, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border)" }}>
            <b style={{ fontSize: 13 }}>Ele pagou a conta do TridiMarket?</b>
            <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
              {moeda(mes.mercadinho)} de consumo já estão descontados deste líquido.
              Respondendo sim, a dívida é quitada no TridiMarket ao confirmar —
              senão ela continua aberta lá e a pessoa paga duas vezes.
            </span>
            <Alternativas
              valor={baixarMercadinho}
              aoEscolher={(v) => setBaixarMercadinho(v as "nao" | "sim")}
              opcoes={[
                { id: "nao", label: "Não" },
                { id: "sim", label: "Sim — dar baixa na conta" },
              ]}
            />
          </section>
        )}
      </div>
    </PainelLateral>
  );
}

function FaltasPainel({ nome, competencia, faltas, faltasDoPonto = [], salario, aoFechar, aoGravar }: {
  nome: string;
  competencia: string;
  faltas: string[];
  faltasDoPonto?: string[];
  salario: number;
  aoFechar: () => void;
  aoGravar: (faltas: string[]) => Promise<void>;
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(faltas));
  const [salvando, setSalvando] = useState(false);
  const d = descontoPorFaltas([...marcadas], salario);
  const [ano, mes] = competencia.split("-").map(Number);
  const dias = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const primeiroDiaSemana = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();   // 0 = domingo
  const sugestoes = faltasDoPonto.filter((f) => !marcadas.has(f));

  function alternar(dia: number) {
    const f = `${competencia.slice(0, 7)}-${String(dia).padStart(2, "0")}`;
    setMarcadas((m) => {
      const novo = new Set(m);
      if (novo.has(f)) novo.delete(f); else novo.add(f);
      return novo;
    });
  }

  return (
    <PainelLateral
      centrado
      titulo={`Faltas — ${nome}`}
      subtitulo={`${rotuloDoMes(competencia)} · toque no dia; cada falta desconta o dia e o descanso da semana`}
      onFechar={aoFechar}
      rodape={
        <Acoes>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Esp />
          <Botao variante="primario" icone="check" carregando={salvando}
            onClick={() => { setSalvando(true); void aoGravar([...marcadas].sort()).finally(() => setSalvando(false)); }}>
            Salvar faltas
          </Botao>
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {sugestoes.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 11, background: "color-mix(in srgb, var(--atencao) 9%, var(--surface))", flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 200px", fontSize: 12.5, lineHeight: 1.5 }}>
              O ponto registrou <strong>{sugestoes.length} dia(s)</strong> sem batida e sem justificativa.
            </span>
            <BotaoFin icone="clock" onClick={() => setMarcadas((m) => new Set([...m, ...faltasDoPonto]))}>
              Puxar do ponto
            </BotaoFin>
          </div>
        )}

        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {["D", "S", "T", "Q", "Q", "S", "S"].map((l, i) => (
              <span key={i} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 800, color: "var(--text-dim)" }}>{l}</span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
            {Array.from({ length: primeiroDiaSemana }, (_, i) => <span key={`v${i}`} />)}
            {Array.from({ length: dias }, (_, i) => {
              const dia = i + 1;
              const f = `${competencia.slice(0, 7)}-${String(dia).padStart(2, "0")}`;
              const domingo = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() === 0;
              const marcado = marcadas.has(f);
              const sugerido = !marcado && faltasDoPonto.includes(f);
              return (
                <button
                  key={dia}
                  type="button"
                  disabled={domingo}
                  onClick={() => alternar(dia)}
                  aria-pressed={marcado}
                  title={domingo ? "Domingo — é o descanso que a falta desconta" : sugerido ? "O ponto registrou falta neste dia" : undefined}
                  style={{
                    minHeight: 40, borderRadius: 9, cursor: domingo ? "default" : "pointer",
                    fontSize: 13, fontWeight: marcado ? 800 : 600, fontVariantNumeric: "tabular-nums",
                    border: sugerido ? "1px dashed var(--atencao)" : "1px solid var(--border)",
                    background: marcado ? "var(--perigo)" : "transparent",
                    color: marcado ? "#fff" : domingo ? "var(--text-dim)" : "var(--text)",
                    opacity: domingo ? 0.45 : 1,
                    transition: "background var(--duration-quick) var(--ease-out)",
                  }}
                >
                  {dia}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "12px 14px", borderRadius: 11, background: "var(--surface)", display: "grid", gap: 4, fontSize: 12.5 }}>
          <span>{d.dias} dia(s) × diária = <strong>−{moeda(d.valorDias)}</strong></span>
          <span>{d.semanasComFalta} semana(s) com falta → perde o domingo (DSR) = <strong>−{moeda(d.valorDsr)}</strong></span>
          <span style={{ fontSize: 13.5, fontWeight: 800 }}>Desconto total: −{moeda(d.total)}</span>
        </div>
      </div>
    </PainelLateral>
  );
}

/**
 * O mesmo valor para várias pessoas de uma vez — o "bônus do mês" da equipe.
 *
 * O checklist é o pedido literal: marcar todos, alguns, desmarcar todos. O
 * campo é escolhível (bônus por padrão) porque a mesma dor existe para
 * benefícios e comissão — e duplicar o painel por campo seria três painéis
 * iguais.
 */
function LotePainel({ pessoas, competencia, aoFechar, aoAplicar }: {
  pessoas: Colaborador[];
  competencia: string;
  aoFechar: () => void;
  aoAplicar: (ids: string[], campo: string, valor: number) => Promise<void>;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(pessoas.map((p) => p.id)));
  const [campo, setCampo] = useState("bonus");
  const [valor, setValor] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const todos = marcados.size === pessoas.length;

  return (
    <PainelLateral
      centrado
      titulo="Aplicar em lote"
      subtitulo={`${competencia.slice(5, 7)}/${competencia.slice(0, 4)} · o mesmo valor para as pessoas marcadas`}
      onFechar={aoFechar}
      rodape={
        <Acoes>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Esp />
          <Botao
            variante="primario" icone="check" carregando={aplicando}
            disabled={!marcados.size || !valor.trim()}
            onClick={() => {
              setAplicando(true);
              void aoAplicar([...marcados], campo, Number(valor.replace(",", ".")) || 0)
                .finally(() => setAplicando(false));
            }}
          >
            Aplicar em {marcados.size}
          </Botao>
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <Campos>
          <Campo label="O que">
            {(id) => (
              <EscolhaDoLote id={id} valor={campo} aoEscolher={setCampo} />
            )}
          </Campo>
          <Campo label="Valor">
            {(id) => (
              <input id={id} type="number" step="0.01" min="0" inputMode="decimal"
                value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
            )}
          </Campo>
        </Campos>

        <div style={{ display: "flex", gap: 8 }}>
          <BotaoFin onClick={() => setMarcados(new Set(pessoas.map((p) => p.id)))}>Marcar todos</BotaoFin>
          <BotaoFin onClick={() => setMarcados(new Set())}>Desmarcar todos</BotaoFin>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 12.5, color: "var(--text-dim)", alignSelf: "center" }}>
            {todos ? "todo mundo" : `${marcados.size} de ${pessoas.length}`}
          </span>
        </div>

        <ul style={{ display: "grid", gap: 4, listStyle: "none", maxHeight: 320, overflowY: "auto", overscrollBehavior: "contain" }}>
          {pessoas.map((c) => (
            <li key={c.id}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", padding: "0 10px", borderRadius: 9, background: "var(--surface)", cursor: "pointer" }}>
                <Caixa marcado={marcados.has(c.id)} onChange={(marc) => setMarcados((m) => {
                    const novo = new Set(m);
                    if (marc) novo.add(c.id); else novo.delete(c.id);
                    return novo;
                  })} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nomeCurto(c.nome)}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{c.setor || ""}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </PainelLateral>
  );
}

/** O seletor de campo do lote — vocabulário curto, controle segmentado. */
function EscolhaDoLote({ id, valor, aoEscolher }: { id?: string; valor: string; aoEscolher: (v: string) => void }) {
  return (
    <Alternativas
      id={id}
      valor={valor}
      aoEscolher={aoEscolher}
      opcoes={[
        { id: "bonus", label: "Bônus" },
        { id: "beneficios", label: "Benefícios" },
        { id: "gratificacao", label: "Gratificação" },
      ]}
    />
  );
}

/** A competência seguinte, no mesmo formato 'AAAA-MM-01'. */
function mesSeguinteDe(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** "1.234,56" — o número como o Brasil escreve. Sem R$: a coluna já diz. */
function dinheiroBR(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Lê o que a pessoa digitou, nos DOIS costumes: "1.500,50" (ponto de milhar,
 * vírgula decimal) e "1500.50" (decimal com ponto, de quem veio de planilha
 * gringa). A regra que desambigua: TEM vírgula → pontos são milhar; NÃO tem →
 * o ponto é decimal. Sem ela, "1500.5" viraria 15005 — um aumento de salário
 * por acidente de formatação.
 */
function numeroBR(t: string): number {
  const s = t.trim();
  if (!s) return 0;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * O check de PAGO — receita 25 (checkbox check) do transitions.dev.
 *
 * Marcar como pago é O momento da folha: dinheiro saiu, mês fechou. A caixa
 * preenche e o traço SE DESENHA — o gesto parece conquistado, não clicado.
 * Desmarcar reverte rápido e sem desenho: desfazer não é cerimônia.
 *
 * `role="checkbox"` + `aria-checked` porque é um botão fazendo papel de
 * checkbox: sem isso o leitor de tela anuncia "botão" e não diz o estado.
 */
function CheckPago({ marcado, nome, disabled, aoMudar }: {
  marcado: boolean;
  nome: string;
  disabled?: boolean;
  aoMudar: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcado}
      aria-label={`Pago: ${nome}`}
      disabled={disabled}
      onClick={() => aoMudar(!marcado)}
      className="t-check ui-card-alvo"
      style={{
        width: 24, height: 24, borderRadius: 7, cursor: disabled ? "default" : "pointer",
        display: "inline-grid", placeItems: "center", padding: 0,
        border: marcado ? "1px solid var(--ok)" : "1px solid var(--border)",
        background: marcado ? "var(--ok)" : "transparent",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <svg viewBox="0 0 10.1668 10.1668" width={13} height={13} aria-hidden>
        <path
          d="M1 5.52L3.92 9.17L9.17 1"
          fill="none" stroke="#fff" strokeWidth={1.7}
          strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** "setembro de 2026" — o mês como se fala, nunca "2026-09". */
function rotuloDoMes(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(ano, mes - 1, 1)));
}

/**
 * O MAPA dos meses — o ano com os doze à vista, em vez de seta-seta-seta.
 *
 * Trocar de mês na folha é ir direto a um mês ("cadê julho?"), não caminhar
 * um passo por vez: com as setas, voltar quatro meses eram quatro cliques e
 * quatro esperas. Aqui é um clique no cartão do mês; o ano, que muda raro,
 * fica num stepper pequeno. `.tab-strip`: no celular a fileira rola de lado
 * e o mês escolhido é trazido para a vista.
 */
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function MapaDosMeses({ valor, aoEscolher }: {
  /** Competência atual, 'AAAA-MM-01'. */
  valor: string;
  /** Recebe 'AAAA-MM' — o que `trocarMes` espera. */
  aoEscolher: (mes: string) => void;
}) {
  const [ano, mes] = valor.split("-").map(Number);
  const faixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    faixa.current?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [valor]);

  // Pílula ativa INVERTIDA (tinta cheia): a competência escolhida é O dado da
  // tela — tinta a 13% lia como "quase escolhido".
  const pilula = (ativo: boolean): React.CSSProperties => ({
    minWidth: "var(--tap)", minHeight: "var(--tap)", padding: "0 6px", flex: "none",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: "var(--r-sm)", cursor: "pointer", fontSize: 12,
    fontWeight: ativo ? 800 : 600, textTransform: "uppercase", letterSpacing: ".02em",
    background: ativo ? "var(--primary)" : "transparent",
    border: "1px solid transparent",
    color: ativo ? "var(--on-primary, #fff)" : "var(--text-dim)",
    transition: "background var(--duration-quick) var(--ease-smooth-out), color var(--duration-quick) var(--ease-smooth-out)",
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 2, flex: "none" }}>
        <BotaoIcone icone="chevron-left" titulo="Ano anterior"
          onClick={() => aoEscolher(`${ano - 1}-${String(mes).padStart(2, "0")}`)} />
        <strong style={{ fontSize: 14.5, fontVariantNumeric: "tabular-nums" }}>{ano}</strong>
        <BotaoIcone icone="chevron-right" titulo="Ano seguinte"
          onClick={() => aoEscolher(`${ano + 1}-${String(mes).padStart(2, "0")}`)} />
      </div>
      <div ref={faixa} className="tab-strip" role="tablist" aria-label="Mês da folha"
        style={{ display: "flex", gap: 2, minWidth: 0, padding: 0 }}>
        {MESES_CURTOS.map((rotulo, i) => {
          const ativo = i + 1 === mes;
          return (
            <button
              key={rotulo} type="button" role="tab" aria-selected={ativo}
              className="ui-card-alvo" style={pilula(ativo)}
              // A frase inteira no title: competência × pagamento são dois
              // meses diferentes, e é aqui que a confusão morria.
              title={`${rotulo.toUpperCase()} ${ano} · paga em ${MESES_CURTOS[i === 11 ? 0 : i + 1].toUpperCase()} ${i === 11 ? ano + 1 : ano}`}
              onClick={() => aoEscolher(`${ano}-${String(i + 1).padStart(2, "0")}`)}
            >
              {rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

