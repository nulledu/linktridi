"use client";

// ── Compromissos (§6) ────────────────────────────────────────────────────────
// A agenda central: tudo que a empresa deve, venha de onde vier — conta
// digitada à mão, parcela de compra, recorrência ou folha.
//
// Os dados chegam PRONTOS do servidor. Filtrar, buscar, somar os cartões e
// montar os resumos acontece aqui, sobre a mesma lista que a tabela mostra —
// nenhuma consulta nova por tecla digitada. Escrita é o contrário: sai por rota
// de API, disparada por clique, e termina em `router.refresh()`, que recarrega
// a árvore do servidor. É por isso que a tela não remenda o próprio estado
// depois de pagar: o número que aparece depois veio do banco, não da memória.

import { useMemo, useRef, useState, useEffect } from "react";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import { Acoes, Botao, Campo, Campos, PainelLateral, Caixa } from "../../ui/controles";
import { useParamDaUrl } from "../../ui/useParamDaUrl";
import type { PrevisaoDaAgenda } from "@/lib/financeiro/previsoes";
import { useAtualizar } from "../../ui/useAtualizar";
import { Secao } from "../../ui/Secao";
import { interpretarLinha } from "@/lib/financeiro/linha-rapida";
import { agruparPorEmpresa, ehMes, janelaDoMes, mesRelativo, noMes, rotuloDoMes } from "@/lib/financeiro/periodo";
import { Anexos, Atualizando, AvisoSchema, Barras, BotaoFin, Cabecalho, Cartao, Filtro, FiltroPeriodo, Filtros, LimparFiltros, LinhaKpi, Marca, Selo, Tabela, TituloCartao, Vazio, BotaoExportar, SeletorEmpresa, LinhaRapida, BotaoApagar, Escolha, Rosca, FaixaDePaineis } from "../ui";
import { Agenda, BotaoLargo, CartaoEmpresa, GradeDeEmpresas, KpiSeta, PainelRolante } from "../blocos";
import { DesfazerAviso } from "../../ui/Desfazer";
import {
  diaDoVencimento,
  centavos, dataBR, diasEntre, emAberto, fatias, moeda, somarDias, statusEfetivo,
} from "@/lib/financeiro/calculos";
import {
  iconeDaCategoria,
  acharCategoria, CATEGORIAS_COMPROMISSO, LABEL_ORIGEM, SELO_COMPROMISSO,
} from "@/lib/financeiro/tipos";
import type {
  Compromisso, CompromissoStatus, Conta,
} from "@/lib/financeiro/tipos";
import type { PoderesFinanceiro } from "@/lib/financeiro/gate";
import { dataCSV, numeroCSV } from "@/lib/financeiro/csv";
import { idsDoRelacionado, marcaRelacionada } from "@/lib/financeiro/marca-relacionada";
import type {
  EmpresaRelacionada, FornecedorRelacionado, RelacionadoFinanceiro,
} from "@/lib/financeiro/marca-relacionada";

// ── Vocabulário da tela ──────────────────────────────────────────────────────

/** Os atalhos que convivem com os meses no seletor de período. */
const ATALHOS_DE_PERIODO = [
  { valor: "vencidos", label: "Já vencidos" },
  { valor: "hoje", label: "Vence hoje" },
  { valor: "7", label: "Próximos 7 dias" },
  { valor: "30", label: "Próximos 30 dias" },
];

// Pagar e cancelar têm caminho próprio (movimento na conta, baixa reversível),
// então a edição só alcança estes três — os mesmos que a rota aceita.
const STATUS_EDITAVEL = ["previsto", "pendente", "agendado"] as const;
type StatusEditavel = (typeof STATUS_EDITAVEL)[number];

const paraEditavel = (s: CompromissoStatus): StatusEditavel =>
  s === "previsto" || s === "agendado" ? s : "pendente";

interface Rascunho {
  id: string | null;
  /** Em "Visão geral" a tela não tem empresa: o formulário pergunta. */
  empresa_id: string;
  descricao: string;
  categoria: string;
  valor: string;
  vencimento: string;
  status: StatusEditavel;
  conta_id: string;
  fornecedor_id: string;
  contato_id: string;
  repetir: boolean;
  periodicidade: "mensal" | "bimestral" | "trimestral" | "semestral" | "anual" | "customizada";
  intervalo_meses: string;
  dia_vencimento: string;
  fim_recorrencia: string;
  observacao: string;
}

const rascunhoNovo = (hoje: string): Rascunho => ({
  id: null, empresa_id: "", descricao: "", categoria: "outros", valor: "", vencimento: hoje,
  status: "pendente", conta_id: "", fornecedor_id: "", contato_id: "", repetir: false,
  periodicidade: "mensal", intervalo_meses: "1", dia_vencimento: "", fim_recorrencia: "", observacao: "",
});

const rascunhoDe = (c: Compromisso): Rascunho => ({
  id: c.id, empresa_id: c.empresa_id, descricao: c.descricao, categoria: c.categoria,
  // Duas casas sempre: `String(1200.5)` chega no campo como "1200.5" e a pessoa
  // lê "mil e duzentos e cinco".
  valor: c.valor.toFixed(2), vencimento: c.vencimento, status: paraEditavel(c.status),
  conta_id: c.conta_id ?? "", fornecedor_id: c.fornecedor_id ?? "", contato_id: c.contato_id ?? "",
  repetir: false, periodicidade: "mensal", intervalo_meses: "1", dia_vencimento: "",
  fim_recorrencia: "", observacao: c.observacao ?? "",
});

interface Resposta { ok: boolean; erro?: string; jaEstava?: boolean; id?: string | null }

/**
 * Toda escrita passa por aqui. O `r.ok` sozinho não basta: sessão expirada já
 * devolveu 200 com HTML neste repositório e 129 telas leram isso como sucesso.
 * Hoje o middleware responde 401 em JSON — e o corpo é lido antes de qualquer
 * comemoração.
 */
async function enviar(url: string, metodo: string, corpo?: unknown): Promise<Resposta> {
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = (await r.json().catch(() => null)) as Resposta | null;
    if (!r.ok) return { ok: false, erro: dados?.erro || "Não foi possível concluir." };
    return { ok: true, jaEstava: !!dados?.jaEstava, id: typeof dados?.id === "string" ? dados.id : null };
  } catch {
    return { ok: false, erro: "Sem conexão com o servidor." };
  }
}

const numero = (v: string): number => Number(v.replace(/\s/g, "").replace(",", "."));

// ── Tela ─────────────────────────────────────────────────────────────────────

export function CompromissosClient({
  previsoes = [], empresas = [], empresaId, empresaNome, hoje, de, ate, linhas, cortado = false, contas, fornecedores,
  relacionados = [], relacionadosSelecionaveis, logosRelacionados = {}, poderes, schemaPendente,
}: {
  /** As empresas liberadas — o cadastro diz em qual nasce quando a tela está em "Visão geral". */
  empresas?: EmpresaRelacionada[];
  /** O que as recorrências ainda vão cobrar — o "título previsto" do ERP. */
  previsoes?: PrevisaoDaAgenda[];
  empresaId: string;
  empresaNome: string;
  hoje: string;
  /** Desde quando os PAGOS e CANCELADOS descem. Os em aberto vêm todos. */
  de: string;
  ate: string;
  linhas: Compromisso[];
  /** A consulta bateu no teto do servidor: a lista não é tudo, e a tela diz. */
  cortado?: boolean;
  contas: Conta[];
  /** Resumo deliberadamente sem dados bancários; esta tela também é de leitores. */
  fornecedores: FornecedorRelacionado[];
  relacionados?: RelacionadoFinanceiro[];
  relacionadosSelecionaveis?: { contatoIds: string[]; fornecedorIds: string[] };
  logosRelacionados?: Record<string, string>;
  poderes: PoderesFinanceiro;
  schemaPendente: boolean;
}) {
  // `router.refresh()` que diz quando terminou: os botões continuam girando e
  // a lista avisa "Atualizando…" até o dado novo estar na tela.
  const { atualizar, atualizando } = useAtualizar();

  const [busca, setBusca] = useState("");
  // Nasce no mês de hoje: quem abre a agenda quer o mês em que está, e o
  // "Todas" com contas de 2024 no meio era a primeira coisa a ser filtrada.
  // As setas do filtro andam de mês em mês; "Limpar" volta pra hoje.
  const [periodo, setPeriodo] = useState(() => mesRelativo(hoje, 0));
  const periodoPadrao = mesRelativo(hoje, 0);
  const janela = janelaDoMes(periodo);
  const rotuloDoPeriodo = ehMes(periodo)
    ? rotuloDoMes(periodo, hoje)
    : ATALHOS_DE_PERIODO.find((a) => a.valor === periodo)?.label ?? "Todas";
  const [categoria, setCategoria] = useState("");
  const [conta, setConta] = useState("");
  const [status, setStatus] = useState("");
  const [recorrenciaFiltro, setRecorrenciaFiltro] = useState("");
  useParamDaUrl("recorrencia", setRecorrenciaFiltro);
  // A tela de Bancos linka "ver todas" de um cartão com `?conta=<id>`.
  useParamDaUrl("conta", setConta);

  // Um cartão por empresa mostra as primeiras linhas; "Ver todos" abre UMA
  // empresa em largura inteira, sem sair da tela.
  const [empresaFoco, setEmpresaFoco] = useState("");
  // Ao abrir UMA empresa, o "Ver todos" que tinha o foco some da tela; sem
  // isto o foco caía no <body> e o leitor de tela recomeçava do topo.
  const voltarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (empresaFoco) voltarRef.current?.focus(); }, [empresaFoco]);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [previsaoSelecionada, setPrevisaoSelecionada] = useState<PrevisaoDaAgenda | null>(null);
  const [form, setForm] = useState<Rascunho | null>(null);
  const [pagamento, setPagamento] = useState<{ conta_id: string; valor: string; data: string } | null>(null);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  // O pagamento que acabou de sair: vira o aviso com "Desfazer" embaixo. Guarda
  // o id próprio porque a pessoa pode fechar a ficha ou abrir outra antes.
  const [pagoAgora, setPagoAgora] = useState<{ id: string; descricao: string; valor: number } | null>(null);
  const [salvando, setSalvando] = useState(false);
  // As previsões vêm LIGADAS: é o retrato honesto do que se deve. Quem quer só
  // o que já existe desliga aqui.
  const [mostrarPrevistos, setMostrarPrevistos] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  // A Visão Geral linka `?novo=1` e o alerta de atraso linka `?status=atrasado`.
  // São sementes: depois da primeira leitura o estado é da tela, e mexer no
  // filtro não reescreve a URL.
  useParamDaUrl("novo", () => {
    if (poderes.compromissos) setForm(rascunhoNovo(hoje));
    // O `?novo=1` já cumpriu o papel. Deixá-lo na barra faria o formulário
    // reabrir sozinho num F5 — e, com a tela remontando ao trocar de empresa,
    // a cada troca.
    const url = new URL(window.location.href);
    url.searchParams.delete("novo");
    window.history.replaceState(window.history.state, "", url);
  });

  // A LINHA RÁPIDA: "Aluguel 8.000 dia 10" preenche descrição, valor e
  // vencimento a cada tecla. Só no cadastro novo — na edição os campos já
  // têm dono. Ver `interpretarLinha`.
  const [linha, setLinha] = useState("");
  const [entendido, setEntendido] = useState<string[]>([]);
  const escreverLinha = (texto: string) => {
    setLinha(texto);
    if (!form || form.id) return;
    const r = interpretarLinha(texto, { hoje, fornecedores: fornecedoresDoSeletor, contas });
    setEntendido(r.entendido);
    if (!texto.trim()) return;
    setForm({
      ...form,
      descricao: r.descricao,
      valor: r.valor != null ? r.valor.toFixed(2) : form.valor,
      vencimento: r.data ?? form.vencimento,
      fornecedor_id: r.fornecedor?.id ?? form.fornecedor_id,
      contato_id: r.fornecedor ? "" : form.contato_id,
      conta_id: r.conta?.id ?? form.conta_id,
    });
    setErros({});
  };

  // ERRO EMBAIXO DO CAMPO, não no fim do formulário. `tentativa` faz o campo
  // tremer de novo numa segunda tentativa com a mesma mensagem.
  const [erros, setErros] = useState<{ descricao?: string; valor?: string; vencimento?: string; empresa?: string }>({});
  const [tentativa, setTentativa] = useState(0);
  const descRef = useRef<HTMLInputElement>(null);
  const valorRef = useRef<HTMLInputElement>(null);
  const vencRef = useRef<HTMLInputElement>(null);
  const focarOQueFalta = () => {
    if (!form) return;
    if (!form.descricao.trim()) descRef.current?.focus();
    else if (!(numero(form.valor) > 0)) valorRef.current?.focus();
    else if (!form.vencimento) vencRef.current?.focus();
    else void salvar();
  };
  useParamDaUrl("status", setStatus);
  useParamDaUrl("busca", setBusca);

  const nomeConta = useMemo(() => new Map(contas.map((c) => [c.id, c.nome])), [contas]);
  const contatoSelecionavel = useMemo(
    () => new Set(relacionadosSelecionaveis?.contatoIds ?? relacionados.map((item) => item.id)),
    [relacionadosSelecionaveis, relacionados],
  );
  const fornecedorSelecionavel = useMemo(
    () => new Set(relacionadosSelecionaveis?.fornecedorIds ?? fornecedores.map((item) => item.id)),
    [relacionadosSelecionaveis, fornecedores],
  );
  const fornecedoresDoSeletor = useMemo(() => {
    const canonicos = relacionados
      .filter((item) => item.fornecedor && fornecedorSelecionavel.has(item.fornecedor.id))
      .map((item) => ({
        id: item.fornecedor!.id,
        empresa_id: item.empresa_id,
        nome: item.nome,
      }));
    const idsCanonicos = new Set(canonicos.map((item) => item.id));
    return [
      ...canonicos,
      ...fornecedores
        .filter((item) => fornecedorSelecionavel.has(item.id) && !idsCanonicos.has(item.id))
        .map((item) => ({ id: item.id, empresa_id: item.empresa_id, nome: item.nome })),
    ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [relacionados, fornecedores, fornecedorSelecionavel]);
  const nomeFornecedor = useMemo(
    () => new Map(fornecedoresDoSeletor.map((f) => [f.id, f.nome])),
    [fornecedoresDoSeletor],
  );
  const nomeContato = useMemo(
    () => new Map(relacionados.map((item) => [item.id, item.nome])),
    [relacionados],
  );
  /** O nome da empresa da linha — em "Visão geral" ele é metade da resposta. */
  const nomeDaEmpresa = (id: string) => empresas.find((e) => e.id === id)?.nome ?? empresaNome;

  const empresaPorId = useMemo(
    () => new Map(empresas.map((item) => [item.id, item])),
    [empresas],
  );
  const contaPorId = useMemo(() => new Map(contas.map((item) => [item.id, item])), [contas]);

  /**
   * Cria o contato SEM SAIR do lançamento.
   *
   * Antes, um fornecedor novo custava: descobrir que ele não está na lista,
   * fechar o formulário (perdendo o que já foi digitado), ir em Cadastros,
   * criar, voltar e começar de novo. Cinco passos para uma informação que a
   * pessoa já tem na mão — e é assim que o campo acaba em branco "para
   * resolver depois", que é quando ele nunca é preenchido.
   *
   * Nasce com o mínimo: nome e o papel de contato. O resto (telefone, CNPJ,
   * condições) se completa na ficha, quando houver o que preencher — pedir
   * tudo agora seria trocar cinco passos por um formulário no meio de outro.
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
      if (!r.ok || !d.id) {
        toast.erro(d.erro ?? "Não deu para criar o contato.");
        return null;
      }
      toast.ok(`“${nome}” criado.`);
      // A lista de relacionados vem do servidor: sem recarregar, o contato
      // novo aparece escolhido mas sem nome nem foto até o próximo refresh.
      atualizar();
      return `contato:${d.id}`;
    } catch {
      toast.erro("Sem resposta do servidor.");
      return null;
    }
  }

  const marcaDe = (
    compromisso: Pick<Compromisso, "empresa_id" | "conta_id" | "contato_id" | "fornecedor_id"> & { categoria?: string },
  ) => {
    const categoriaDaLinha = compromisso.categoria ?? "outros";
    const dona = empresaPorId.get(compromisso.empresa_id) ?? {
      id: compromisso.empresa_id,
      nome: empresaNome,
      icone: "building-warehouse",
    };
    const resolvida = marcaRelacionada(
      compromisso,
      relacionados,
      fornecedores,
      dona,
      compromisso.conta_id ? contaPorId.get(compromisso.conta_id) : undefined,
    );
    const logo = resolvida.logo_url ? logosRelacionados[resolvida.logo_url] ?? null : null;
    const categoria = acharCategoria(CATEGORIAS_COMPROMISSO, categoriaDaLinha);
    return {
      origem: resolvida.origem,
      id: resolvida.id,
      nome: resolvida.nome,
      logo,
      // Sem foto própria, a CARA é a da categoria — a logo do banco de onde o
      // boleto sai identificaria outra entidade que não a da linha.
      icone: logo ? resolvida.icone : iconeDaCategoria(categoriaDaLinha),
      cor: logo ? null : categoria.cor,
    };
  };

  // "Atrasado" é lido do relógio, nunca do banco (ver `statusEfetivo`): o efetivo
  // acompanha cada linha desde aqui para não haver duas versões do mesmo status
  // na mesma tela.
  const comStatus = useMemo(
    () => linhas.map((c) => ({ ...c, efetivo: statusEfetivo(c, hoje) })),
    [linhas, hoje],
  );

  // O período vale pra TUDO que está no vencimento: linha lançada, previsão,
  // barras e números. Antes só a lista obedecia e a previsão de dezembro
  // aparecia no meio de "Este mês".
  const noPeriodo = (vencimento: string): boolean => {
    if (periodo === "vencidos") return vencimento < hoje;
    if (periodo === "hoje") return vencimento === hoje;
    if (periodo === "7") return vencimento >= hoje && vencimento <= somarDias(hoje, 7);
    if (periodo === "30") return vencimento >= hoje && vencimento <= somarDias(hoje, 30);
    return noMes(periodo, vencimento);
  };

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const em30 = somarDias(hoje, 30);

    return comStatus.filter((c) => {
      if (status && c.efetivo !== status) return false;
      if (categoria && c.categoria !== categoria) return false;
      if (conta && c.conta_id !== conta) return false;

      if (!noPeriodo(c.vencimento)) return false;

      if (termo) {
        const fornecedor = c.fornecedor_id ? nomeFornecedor.get(c.fornecedor_id) ?? "" : "";
        const contato = c.contato_id ? nomeContato.get(c.contato_id) ?? "" : "";
        const alvo = `${c.descricao} ${fornecedor} ${contato} ${c.observacao ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `noPeriodo` só lê periodo/hoje
  }, [comStatus, busca, status, categoria, conta, periodo, hoje, nomeFornecedor, nomeContato]);

  // Os números são DO PERÍODO — o mesmo que a lista mostra. O único que não
  // obedece é "Atrasados": conta atrasada é dívida em qualquer mês, e o cartão
  // existe justamente pra ninguém deixar de vê-la por estar olhando outubro.
  // Só as previsões que caem no período entram no "a pagar": sem elas o
  // número mentiria pra menos, porque metade do mês ainda não foi gerada.
  const kpis = useMemo(() => {
    const soma = (lista: { valor: number }[]) => centavos(lista.reduce((s, c) => s + c.valor, 0));
    const doPeriodo = comStatus.filter((c) => noPeriodo(c.vencimento));
    const previstos = previsoes.filter((p) => noPeriodo(p.vencimento));
    const abertos = doPeriodo.filter((c) => emAberto(c.efetivo));
    const quitadas = doPeriodo.filter((c) => c.efetivo === "pago");
    const atrasadas = comStatus.filter((c) => emAberto(c.efetivo) && c.vencimento < hoje);
    const aPagar = soma(abertos) + soma(previstos);
    const pago = soma(quitadas.map((c) => ({ valor: c.pago_valor ?? c.valor })));
    return {
      aPagar,
      atrasado: soma(atrasadas),
      pago,
      previsto: soma(previstos),
      contas: abertos.length + previstos.length,
      quitados: quitadas.length,
      atrasadas: atrasadas.length,
      // O total da rosca: o que a empresa deve e o que já pagou no período.
      total: aPagar + pago,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `noPeriodo` só lê periodo/hoje
  }, [comStatus, previsoes, periodo, hoje]);

  /**
   * A rosca do resumo: as quatro fatias que a pessoa já viu nos números.
   *
   * Cor de ESTADO, nunca da rampa de gráfico: verde é "pago" e vermelho é
   * "atrasado" em qualquer paleta, e trocar o destaque do painel não pode
   * fazer o atrasado virar rosa.
   */
  const fatiasDoResumo = useMemo(() => {
    const bruto = [
      { id: "apagar", label: "A pagar", cor: "var(--primary)", valor: kpis.aPagar },
      { id: "pago", label: "Pagos", cor: "var(--ok)", valor: kpis.pago },
      { id: "atrasado", label: "Atrasados", cor: "var(--perigo)", valor: kpis.atrasado },
      { id: "previsto", label: "Previstos", cor: "var(--text-dim)", valor: kpis.previsto },
    ];
    const soma = bruto.reduce((t, f) => t + f.valor, 0);
    return bruto.map((f) => ({ ...f, proporcao: soma > 0 ? f.valor / soma : 0 }));
  }, [kpis]);

  const barrasCategoria = useMemo(
    () => fatias(
      filtradas.filter((c) => c.efetivo !== "cancelado"),
      (c) => c.categoria,
      (c) => c.valor,
      (id) => acharCategoria(CATEGORIAS_COMPROMISSO, id),
    ),
    [filtradas],
  );

  // A agenda ignora o filtro de propósito: ela é um calendário, não um resumo
  // da lista. Com o filtro "pago" ligado, um resumo ficaria vazio — e some
  // justamente a informação que faz alguém abrir esta tela.
  /**
   * O que vence nos próximos 7 dias — lançado E previsto, porque metade do
   * mês costuma não ter nascido ainda e uma agenda que esconde isso mente
   * pra menos. Ignora o filtro de propósito: é calendário, não resumo da
   * lista, e com o filtro "pago" ligado ela ficaria vazia justamente na hora
   * em que a pessoa abriu a tela pra ver o que vem.
   */
  const agenda = useMemo(() => {
    const limite = somarDias(hoje, 7);
    const lancados = comStatus
      .filter((c) => emAberto(c.efetivo) && c.vencimento >= hoje && c.vencimento <= limite)
      .map((c) => ({
        chave: c.id, vencimento: c.vencimento, titulo: c.descricao, valor: c.valor,
        sub: `${nomeDaEmpresa(c.empresa_id)} · ${acharCategoria(CATEGORIAS_COMPROMISSO, c.categoria).label}`,
        atrasado: false, aoAbrir: () => abrirDetalhes(c.id),
      }));
    const previstos = previsoes
      .filter((p) => p.vencimento >= hoje && p.vencimento <= limite)
      .map((p) => ({
        chave: p.id, vencimento: p.vencimento, titulo: p.descricao, valor: p.valor,
        sub: `${nomeDaEmpresa(p.empresa_id)} · previsto`,
        atrasado: false, aoAbrir: () => setPrevisaoSelecionada(p),
      }));
    return [...lancados, ...previstos]
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as duas funções só leem estado estável
  }, [comStatus, previsoes, hoje]);

  // Só as categorias que EXISTEM nesta empresa. O catálogo tem nove; oferecer
  // as nove num filtro em que seis não devolvem nada é ruído. A categoria
  // ESCOLHIDA fica na lista mesmo que a última linha dela tenha sumido depois
  // de um refresh — senão o filtro continua valendo sem aparecer em lugar nenhum.
  const opcoesCategoria = useMemo(() => {
    const ids = [...new Set([...linhas.map((c) => c.categoria), categoria].filter(Boolean))];
    return ids
      .map((id) => ({ valor: id, label: acharCategoria(CATEGORIAS_COMPROMISSO, id).label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [linhas, categoria]);

  // Mesma regra: quem filtrou por "Atrasado" e pagou a única conta atrasada
  // continua vendo "Atrasado" no seletor — e entende por que a lista está vazia.
  const opcoesStatus = useMemo(
    () => [...new Set([...comStatus.map((c) => c.efetivo), status].filter(Boolean))]
      .filter((s): s is CompromissoStatus => s in SELO_COMPROMISSO)
      .map((s) => ({ valor: s, label: SELO_COMPROMISSO[s].label })),
    [comStatus, status],
  );

  const temFiltro = !!(periodo !== periodoPadrao || categoria || conta || status || busca);
  const limparFiltros = () => {
    setPeriodo(periodoPadrao); setCategoria(""); setConta(""); setStatus(""); setBusca("");
  };

  // O selecionado é derivado do id, nunca guardado como objeto: depois de pagar,
  // `router.refresh()` traz a linha nova e o painel precisa mostrar ELA. Guardar
  // a cópia deixaria "Pendente" na tela de um compromisso recém-pago.
  const selecionado = selecionadoId ? comStatus.find((c) => c.id === selecionadoId) ?? null : null;
  const marcaDoSelecionado = selecionado ? marcaDe(selecionado) : null;
  const marcaDaPrevisao = previsaoSelecionada ? marcaDe(previsaoSelecionada) : null;
  const empresaDoFormulario = form?.empresa_id || empresaId;
  const pessoasDoFormulario = relacionados.filter(
    (item) => item.empresa_id === empresaDoFormulario
      && contatoSelecionavel.has(item.id)
      && !(item.fornecedor && fornecedorSelecionavel.has(item.fornecedor.id))
      && item.natureza === "pessoa",
  );
  const organizacoesDoFormulario = relacionados.filter(
    (item) => item.empresa_id === empresaDoFormulario
      && contatoSelecionavel.has(item.id)
      && !(item.fornecedor && fornecedorSelecionavel.has(item.fornecedor.id))
      && item.natureza === "empresa",
  );
  const fornecedoresDoFormulario = fornecedoresDoSeletor.filter(
    (item) => item.empresa_id === empresaDoFormulario,
  );
  const relacionadoDoFormulario = form?.contato_id
    ? `contato:${form.contato_id}`
    : form?.fornecedor_id
      ? `fornecedor:${form.fornecedor_id}`
      : "";

  // Trocar de linha zera o "tem certeza?" e o recado da linha anterior: herdar
  // a confirmação de um compromisso no outro seria cancelar o errado num clique.
  const abrirDetalhes = (id: string) => {
    setSelecionadoId(id); setPagamento(null); setConfirmandoCancelar(false);
    setErro(""); setAviso("");
  };

  const fecharPainel = () => {
    setSelecionadoId(null); setPagamento(null); setConfirmandoCancelar(false);
    setErro(""); setAviso("");
  };

  const abrirForm = (r: Rascunho) => {
    setForm(r); setErro(""); setAviso(""); setConfirmandoCancelar(false);
  };

  // ── Escrita ────────────────────────────────────────────────────────────────

  /**
   * A previsão vira compromisso.
   *
   * Não é um POST comum: manda a `idempotency_key` que a geração usaria, então
   * clicar duas vezes (ou clicar aqui e mandar gerar as recorrências no mesmo
   * minuto) não cria a conta duas vezes — o banco recusa a segunda pelo índice
   * único, e a rota devolve `jaEstava`.
   */
  async function lancarPrevisao(p: PrevisaoDaAgenda, opts: { ePagar?: boolean } = {}) {
    if (gerando) return;
    setGerando(true);
    setErro("");
    const r = await enviar("/api/financeiro/recorrencias/materializar", "POST", {
      empresa_id: p.empresa_id,
      recorrencia_id: p.recorrencia_id,
      competencia: p.competencia,
    });
    setGerando(false);
    if (!r.ok) { setErro(r.erro ?? "Não deu para lançar."); return; }
    setPrevisaoSelecionada(null);
    atualizar();
    // "Lançar e pagar": a conta que vence mês que vem sendo paga hoje não
    // pode exigir lançar, achar a linha de novo e clicar "Pagar". A rota
    // devolve o id; o painel de detalhes abre nele assim que a lista nova
    // chegar (o selecionado é derivado do id) já com a baixa preenchida.
    const id = typeof r.id === "string" ? r.id : null;
    if (opts.ePagar && id && poderes.pagar) {
      setSelecionadoId(id); setConfirmandoCancelar(false); setAviso("");
      setPagamento({ conta_id: p.conta_id ?? contas[0]?.id ?? "", valor: p.valor.toFixed(2), data: hoje });
      return;
    }
    setAviso(r.jaEstava ? "Essa conta já estava lançada." : "Conta lançada na agenda.");
  }

  async function salvar() {
    if (!form) return;
    const valor = numero(form.valor);
    const novos: typeof erros = {};
    if (!form.descricao.trim()) novos.descricao = "Escreva a descrição.";
    if (!Number.isFinite(valor) || valor <= 0) novos.valor = "Informe um valor maior que zero.";
    if (!form.vencimento) novos.vencimento = "Informe o vencimento.";
    if (!form.id && !(form.empresa_id || empresaId)) novos.empresa = "Escolha em qual empresa o compromisso nasce.";
    if (Object.keys(novos).length) {
      setErros(novos);
      setTentativa((t) => t + 1);
      // O foco vai ao primeiro campo errado: a pessoa não precisa procurar.
      if (novos.descricao) descRef.current?.focus();
      else if (novos.valor) valorRef.current?.focus();
      else if (novos.vencimento) vencRef.current?.focus();
      return;
    }
    setErros({});

    setSalvando(true); setErro("");
    const r = form.id
      ? await enviar(`/api/financeiro/compromissos/${form.id}`, "PATCH", {
          descricao: form.descricao.trim(),
          categoria: form.categoria,
          valor,
          vencimento: form.vencimento,
          status: form.status,
          conta_id: form.conta_id,
          observacao: form.observacao.trim(),
        })
      : await enviar("/api/financeiro/compromissos", "POST", {
          empresa_id: form.empresa_id || empresaId,
          descricao: form.descricao.trim(),
          categoria: form.categoria,
          valor,
          vencimento: form.vencimento,
          conta_id: form.conta_id || undefined,
          fornecedor_id: form.fornecedor_id || undefined,
          contato_id: form.contato_id || undefined,
          observacao: form.observacao.trim() || undefined,
          ...(form.repetir ? { recorrencia: {
            ativa: true, periodicidade: form.periodicidade,
            intervalo_meses: Number(form.intervalo_meses) || 1,
            dia_vencimento: diaDoVencimento(form.dia_vencimento, form.vencimento),
            fim: form.fim_recorrencia || null,
          } } : {}),
        });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro ?? ""); return; }
    setForm(null);
    atualizar();
  }

  async function pagar() {
    if (!selecionado || !pagamento) return;
    if (!pagamento.conta_id) { setErro("Escolha a conta de onde o dinheiro sai."); return; }
    const valor = numero(pagamento.valor);
    if (!Number.isFinite(valor) || valor <= 0) { setErro("Informe um valor maior que zero."); return; }

    setSalvando(true); setErro(""); setAviso("");
    const r = await enviar(`/api/financeiro/compromissos/${selecionado.id}/pagar`, "POST", {
      conta_id: pagamento.conta_id,
      valor,
      data: pagamento.data,
    });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro ?? ""); return; }
    // Repetido não é falha: o estado final é o que a pessoa pediu. Dizer "erro"
    // aqui faria alguém pagar de novo por outro caminho.
    if (r.jaEstava) setAviso("Este compromisso já estava pago.");
    else setPagoAgora({ id: selecionado.id, descricao: selecionado.descricao, valor });
    setPagamento(null);
    atualizar();
  }

  /** O "Desfazer" do aviso: a MESMA rota do botão "Desfazer pagamento" da
   *  ficha — nenhum caminho novo, só um atalho de 6 segundos até ele. */
  async function desfazerPago(id: string): Promise<boolean> {
    const r = await enviar(`/api/financeiro/compromissos/${id}/pagar`, "DELETE");
    if (!r.ok) { toast.erro(r.erro || "Não deu pra desfazer o pagamento."); return false; }
    atualizar();
    return true;
  }

  async function reverter() {
    if (!selecionado) return;
    setSalvando(true); setErro(""); setAviso("");
    const r = await enviar(`/api/financeiro/compromissos/${selecionado.id}/pagar`, "DELETE");
    setSalvando(false);
    if (!r.ok) { setErro(r.erro ?? ""); return; }
    atualizar();
  }

  async function cancelar() {
    if (!selecionado) return;
    setSalvando(true); setErro(""); setAviso("");
    const r = await enviar(`/api/financeiro/compromissos/${selecionado.id}`, "DELETE");
    setSalvando(false);
    setConfirmandoCancelar(false);
    if (!r.ok) { setErro(r.erro ?? ""); return; }
    atualizar();
  }

  // ── Desenho ────────────────────────────────────────────────────────────────

  // Quem pagina é a <Tabela>. Havia um segundo teto aqui (80 linhas + "Mostrar
  // mais") por cima das páginas de 10, e o rodapé dizia "80 compromissos" numa
  // lista de 300 — dois mecanismos contando a mesma coisa de jeitos diferentes.
  /**
   * A agenda mostra o que EXISTE e o que VAI existir.
   *
   * A previsão é o "título previsto" de qualquer ERP: a próxima volta do
   * aluguel, da assinatura, do contador. Sem ela, "a pagar em 7 dias" mostra
   * um número MENOR que a realidade, porque metade das contas do mês ainda não
   * foi gerada — e número de caixa que engana para menos é pior que nenhum.
   *
   * Ela não é um compromisso: não tem id no banco, não se paga e não se edita.
   * Clicar oferece LANÇAR — e aí vira um compromisso de verdade.
   */
  const linhasPrevistas = useMemo(() => previsoes.map((p) => ({
    id: p.id,
    empresa_id: p.empresa_id,
    descricao: p.descricao,
    categoria: p.categoria,
    valor: p.valor,
    vencimento: p.vencimento,
    competencia: p.competencia,
    status: "pendente" as const,
    origem: "recorrencia" as const,
    origem_id: p.recorrencia_id,
    parcela_numero: null, parcela_total: null,
    conta_id: p.conta_id, fornecedor_id: p.fornecedor_id, contato_id: p.contato_id, colaborador_id: null,
    pago_em: null, pago_valor: null, observacao: null,
    efetivo: "pendente" as CompromissoStatus,
    /** O que separa a linha prevista da lançada. */
    prevista: p,
  })), [previsoes]);

  // "Visão geral" = sem empresa aberta e mais de uma liberada: a lista sai em
  // colunas, uma por empresa, como em Bancos e Recorrências.
  const geral = !empresaId && empresas.length > 1;

  const visiveis = useMemo(() => {
    if (!mostrarPrevistos || !linhasPrevistas.length) return filtradas.map((c) => ({ ...c, prevista: null }));
    const termo = busca.trim().toLowerCase();
    const previstasFiltradas = linhasPrevistas.filter((c) => {
      if (recorrenciaFiltro && c.origem_id !== recorrenciaFiltro) return false;
      if (categoria && c.categoria !== categoria) return false;
      if (conta && c.conta_id !== conta) return false;
      // O filtro de STATUS não se aplica: "previsto" não é um status do banco,
      // e esconder a previsão quando alguém filtra "pendente" faria o total
      // mentir de novo. Quem não quer previsão desliga no interruptor.
      // O MESMO período da lista: a previsão de dezembro não aparece em
      // "Este mês". (Antes era a janela do servidor, de um ano.)
      if (!noPeriodo(c.vencimento) || !noMes(periodo, c.vencimento)) return false;
      if (termo && !c.descricao.toLowerCase().includes(termo)) return false;
      return true;
    });
    const lancadas = recorrenciaFiltro ? filtradas.filter((c) => c.origem_id === recorrenciaFiltro) : filtradas;
    return [...lancadas.map((c) => ({ ...c, prevista: null })), ...previstasFiltradas]
      .sort((x, y) => x.vencimento.localeCompare(y.vencimento));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `noPeriodo` só lê periodo/hoje
  }, [filtradas, linhasPrevistas, mostrarPrevistos, categoria, conta, busca, periodo, hoje, recorrenciaFiltro]);

  /** Quantas linhas cada cartão de empresa mostra antes do "Ver todos". */
  const POR_BLOCO = 5;
  const blocosDaLista = useMemo(() => {
    const todos = geral
      ? agruparPorEmpresa(visiveis, empresas, { incluirVazias: true })
      : [{ empresa: { id: empresaId, nome: empresaNome }, itens: visiveis }];
    return empresaFoco ? todos.filter((b) => b.empresa.id === empresaFoco) : todos;
  }, [geral, visiveis, empresas, empresaId, empresaNome, empresaFoco]);
  const emFoco = !!empresaFoco;
  /** Com uma empresa só, ou com o foco aberto, a lista inteira aparece. */
  const limiteDoBloco = (id: string) => (!geral || empresaFoco === id ? visiveis.length : POR_BLOCO);

  return (
    <>
      <Cabecalho
        titulo="Compromissos"
        sub="Acompanhe e gerencie todos os seus compromissos em um só lugar."
        busca={busca}
        aoBuscar={setBusca}
        acoes={
          <>
            {/* O período mora no CABEÇALHO: ele manda em tudo que a tela
                mostra (números, painéis e lista), não só na tabela. */}
            <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} hoje={hoje} atalhos={ATALHOS_DE_PERIODO} />
            {poderes.compromissos && (
              <BotaoFin icone="plus" primario onClick={() => abrirForm(rascunhoNovo(hoje))}>Novo compromisso</BotaoFin>
            )}
            {/* Exporta o que está VISÍVEL — filtro e busca aplicados. Baixar a
                tabela inteira quando a pessoa acabou de filtrar por "atrasado"
                entrega o arquivo errado sem avisar. */}
            <BotaoExportar
              assunto="Compromissos" empresa={empresaNome} linhas={visiveis}
              colunas={[
                { cabecalho: "Vencimento", valor: (c) => dataCSV(c.vencimento) },
                { cabecalho: "Descrição", valor: (c) => c.descricao },
                { cabecalho: "Categoria", valor: (c) => acharCategoria(CATEGORIAS_COMPROMISSO, c.categoria).label },
                { cabecalho: "Conta", valor: (c) => contas.find((x) => x.id === c.conta_id)?.nome ?? "" },
                { cabecalho: "Relacionado a", valor: (c) => marcaDe(c).nome },
                { cabecalho: "Origem", valor: (c) => LABEL_ORIGEM[c.origem] ?? c.origem },
                { cabecalho: "Valor", valor: (c) => numeroCSV(c.valor) },
                { cabecalho: "Status", valor: (c) => SELO_COMPROMISSO[statusEfetivo(c, hoje)].label },
                { cabecalho: "Pago em", valor: (c) => dataCSV(c.pago_em) },
              ]}
            />
          </>
        }
      />

      {schemaPendente && <AvisoSchema />}

      {/* Cada número LEVA à sua lista: a seta filtra a tela, em vez de
          deixar a pessoa traduzir "R$ 104 mil a pagar" em "filtrar por em
          aberto" na mão. */}
      <LinhaKpi>
        <KpiSeta
          icone="hourglass-high"
          rotulo="A pagar"
          valor={moeda(kpis.aPagar)}
          detalhe={`${kpis.contas} ${kpis.contas === 1 ? "conta" : "contas"}, previstas incluídas`}
          aoAbrir={() => { setStatus("pendente"); setMostrarPrevistos(true); }}
          tituloDaSeta="Ver o que está em aberto"
        />
        <KpiSeta
          icone="circle-check"
          rotulo="Pagos"
          valor={moeda(kpis.pago)}
          tom="ok"
          detalhe={`${kpis.quitados} ${kpis.quitados === 1 ? "compromisso quitado" : "compromissos quitados"}`}
          aoAbrir={() => { setStatus("pago"); setMostrarPrevistos(false); }}
          tituloDaSeta="Ver os pagos"
        />
        <KpiSeta
          icone="alert-triangle"
          rotulo="Atrasados"
          valor={moeda(kpis.atrasado)}
          tom={kpis.atrasadas ? "perigo" : "ok"}
          detalhe={kpis.atrasadas
            ? `${kpis.atrasadas} ${kpis.atrasadas === 1 ? "conta vencida" : "contas vencidas"}`
            : "Nenhum compromisso"}
          aoAbrir={kpis.atrasadas ? () => { setPeriodo("vencidos"); setStatus(""); } : undefined}
          tituloDaSeta="Ver os atrasados"
        />
        <KpiSeta
          icone="refresh"
          rotulo="Previstos"
          valor={moeda(kpis.previsto)}
          detalhe="Ainda não lançados"
          aoAbrir={() => { setMostrarPrevistos(true); setStatus(""); }}
          tituloDaSeta="Mostrar os previstos"
        />
      </LinhaKpi>

      {/* Os painéis em CIMA, na horizontal: a lista precisa da largura inteira
          pra virar um cartão por empresa. */}
      <FaixaDePaineis largura={300}>
        <Cartao>
          <TituloCartao icone="chart-pie">Resumo financeiro</TituloCartao>
          <p style={{ marginTop: -10, marginBottom: 14, fontSize: 12, color: "var(--text-dim)" }}>
            Visão geral dos compromissos de {rotuloDoPeriodo.toLocaleLowerCase("pt-BR")}
          </p>
          <Rosca fatias={fatiasDoResumo} total={moeda(kpis.total)} rotuloTotal="no período" tamanho={150} />
        </Cartao>

        <Cartao>
          <TituloCartao icone="chart-bar">Compromissos por categoria</TituloCartao>
          <p style={{ marginTop: -10, marginBottom: 14, fontSize: 12, color: "var(--text-dim)" }}>
            Distribuição de valores de {rotuloDoPeriodo.toLocaleLowerCase("pt-BR")}
          </p>
          <Barras fatias={barrasCategoria} />
        </Cartao>

        <PainelRolante
          icone="calendar-event"
          titulo="Agenda rápida"
          direita={<small style={{ fontSize: 11.5, color: "var(--text-dim)", whiteSpace: "nowrap" }}>Próximos 7 dias</small>}
          rodape={
            <BotaoLargo onClick={() => document.getElementById("lista-compromissos")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" })}>
              Ver agenda completa
            </BotaoLargo>
          }
        >
            <Agenda
              itens={agenda}
              vazio={<Vazio compacto icone="circle-check" titulo="Nada vencendo" detalhe="Nenhuma conta em aberto nos próximos 7 dias." />}
            />
        </PainelRolante>
      </FaixaDePaineis>

      <Cartao id="lista-compromissos">
            <TituloCartao
              icone="list-check"
              direita={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <Atualizando ativo={atualizando} />
                  <BotaoFin icone="filter" primario={filtrosAbertos} onClick={() => setFiltrosAbertos((v) => !v)}>
                    Filtros
                  </BotaoFin>
                </span>
              }
            >
              Lista de compromissos
            </TituloCartao>
            <p style={{ marginTop: -10, marginBottom: 14, fontSize: 12, color: "var(--text-dim)" }}>
              {geral ? "Organizados por empresa para facilitar sua visualização." : `${empresaNome} · ${rotuloDoPeriodo.toLocaleLowerCase("pt-BR")}`}
            </p>

            {/* Os filtros nascem FECHADOS: cinco seletores acima da lista
                empurravam as contas pra fora da primeira dobra, e o período
                (o que a pessoa mais troca) já mora no cabeçalho da tela. */}
            {filtrosAbertos && (
            <Filtros>
              <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} hoje={hoje} atalhos={ATALHOS_DE_PERIODO} />
              <Filtro rotulo="Categoria" valor={categoria} opcoes={opcoesCategoria} aoMudar={setCategoria} />
              <Filtro
                rotulo="Conta"
                valor={conta}
                opcoes={contas.map((c) => ({ valor: c.id, label: c.nome }))}
                aoMudar={setConta}
              />
              <Filtro rotulo="Status" valor={status} opcoes={opcoesStatus} aoMudar={setStatus} />
              <BotaoFin icone={mostrarPrevistos ? "eye-off" : "eye"} onClick={() => setMostrarPrevistos((v) => !v)}>
                {mostrarPrevistos ? "Ocultar previstos" : "Mostrar previstos"}
              </BotaoFin>
              {/* A peça do kit, não um botão próprio: esta tela tinha um
                  "Limpar" com outro rótulo e outro desenho, e o mesmo gesto
                  aparecia de dois jeitos no mesmo módulo. */}
              <LimparFiltros ativo={temFiltro} aoLimpar={limparFiltros} />
            </Filtros>
            )}

            {emFoco && (
              <Botao ref={voltarRef} icone="chevron-left" onClick={() => setEmpresaFoco("")} style={{ marginBottom: 10 }}>
                Voltar para todas as empresas
              </Botao>
            )}
            <GradeDeEmpresas>
            {blocosDaLista.map((b) => {
              const abertos = b.itens.filter((c) => c.efetivo !== "cancelado");
              const mostrando = Math.min(b.itens.length, limiteDoBloco(b.empresa.id));
              return (
              <CartaoEmpresa
                key={b.empresa.id || "unica"}
                nome={b.empresa.nome || empresaNome}
                contagem={`${b.itens.length} ${b.itens.length === 1 ? "compromisso" : "compromissos"}`}
                total={moeda(abertos.reduce((t, c) => t + c.valor, 0))}
                acao={geral && !emFoco && b.itens.length > POR_BLOCO
                  ? <BotaoFin icone="arrow-right" onClick={() => setEmpresaFoco(b.empresa.id)}>Ver todos</BotaoFin>
                  : undefined}
                rodape={
                  mostrando < b.itens.length ? (
                    <BotaoLargo onClick={() => setEmpresaFoco(b.empresa.id)}>
                      Ver todos os {b.itens.length} compromissos
                    </BotaoLargo>
                  ) : (
                    <small style={{ display: "block", fontSize: 12, color: "var(--text-dim)" }}>
                      Mostrando {mostrando} de {b.itens.length} {b.itens.length === 1 ? "compromisso" : "compromissos"}
                    </small>
                  )
                }
              >
                  <Tabela
                    linhas={b.itens.slice(0, limiteDoBloco(b.empresa.id))}
                  // Página só quando o cartão está ABERTO (empresa em foco, ou
                  // uma empresa só): fechado ele mostra 5 linhas e o rodapé já
                  // diz "5 de 11" — dois contadores diriam a mesma coisa duas
                  // vezes, com números diferentes.
                  paginar={limiteDoBloco(b.empresa.id) > POR_BLOCO ? 10 : undefined}
                    chaveDe={(c) => c.id}
                                      rotuloItem="compromissos"
                    aoClicar={(c) => (c.prevista ? setPrevisaoSelecionada(c.prevista) : abrirDetalhes(c.id))}
                    vazio={
                      <Vazio
                        icone="calendar-off"
                        titulo={temFiltro ? "Nenhum compromisso com esses filtros" : "Nenhum compromisso por aqui"}
                        detalhe={temFiltro
                          ? "Troque o período, o status ou limpe os filtros."
                          : "Contas digitadas à mão, parcelas de compra e recorrências aparecem nesta agenda."}
                        acao={temFiltro
                          ? <BotaoFin icone="x" onClick={limparFiltros}>Limpar filtros</BotaoFin>
                          : poderes.compromissos
                            ? <BotaoFin icone="plus" primario onClick={() => abrirForm(rascunhoNovo(hoje))}>Novo compromisso</BotaoFin>
                            : undefined}
                      />
                    }
                    colunas={[
                      {
                        chave: "vencimento", label: "Vencimento", largura: "80px",
                        celula: (c) => (
                          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{dataBR(c.vencimento)}</span>
                        ),
                      },
                      {
                        chave: "descricao", label: "Descrição", largura: "minmax(min(100%, 140px), 1.8fr)", titulo: true,
                        celula: (c) => {
                          const marca = marcaDe(c);
                          return (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                              <Marca marca={marca} tamanho={32} raio={9} />
                              <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                  {c.prevista && <Icon name="refresh" size={14} color="var(--text-dim)" />}
                                  <span style={{ color: c.prevista ? "var(--text-dim)" : undefined, overflowWrap: "anywhere" }}>
                                    {c.descricao}
                                  </span>
                                </span>
                                {/* A CONTA entra aqui porque a coluna "Conta" só
                                    existe no computador — no celular era a única
                                    informação que sumia da linha. */}
                                <small style={{ color: "var(--text-dim)", fontSize: 11.5, overflowWrap: "anywhere" }}>
                                  {marca.nome}
                                  {c.conta_id && nomeConta.get(c.conta_id) ? ` · ${nomeConta.get(c.conta_id)}` : ""}
                                </small>
                              </span>
                            </span>
                          );
                        },
                      },
                      {
                        chave: "categoria", label: "Categoria", largura: "minmax(min(100%, 82px), 1fr)", soNoComputador: true,
                        celula: (c) => acharCategoria(CATEGORIAS_COMPROMISSO, c.categoria).label,
                      },
                      {
                        chave: "valor", label: "Valor", largura: "minmax(min(100%, 84px), 0.8fr)", fim: true,
                        celula: (c) => <strong style={{ fontVariantNumeric: "tabular-nums" }}>{moeda(c.valor)}</strong>,
                      },
                      {
                        chave: "status", label: "Status", largura: "88px", fim: true,
                        celula: (c) => (c.prevista
                          // "Estimado" é diferente de "Previsto": os dois ainda não
                          // existem, mas o previsto tem VALOR combinado e o estimado
                          // é palpite da regra variável. Sem separar, o total de "a
                          // pagar" mistura número conferido com chute e ninguém sabe
                          // qual parte é qual.
                          ? <Selo selo={c.prevista.estimado
                            ? { label: "Estimado", cor: "var(--atencao)" }
                            : { label: "Previsto", cor: "var(--text-dim)" }} />
                          : <Selo selo={SELO_COMPROMISSO[c.efetivo]} />),
                      },
                    ]}
                  />
              </CartaoEmpresa>
              );
            })}
            </GradeDeEmpresas>

            {cortado && (
              <p style={{ marginTop: 14, fontSize: 12, color: "var(--atencao)", lineHeight: 1.6 }}>
                A lista bateu no teto do servidor e não é tudo: use os filtros de status e período para achar o resto.
              </p>
            )}
      </Cartao>

      {previsaoSelecionada && (
        <PainelLateral
          centrado
          titulo={previsaoSelecionada.descricao}
          subtitulo={`Previsto para ${dataBR(previsaoSelecionada.vencimento)}`}
          onFechar={() => { setPrevisaoSelecionada(null); setErro(""); }}
          largura={460}
          rodape={
            <Acoes>
              <Botao onClick={() => setPrevisaoSelecionada(null)}>Fechar</Botao>
              {poderes.compromissos && (
                <Botao icone="calendar-plus" carregando={gerando || atualizando}
                  onClick={() => lancarPrevisao(previsaoSelecionada)}>
                  Lançar
                </Botao>
              )}
              {poderes.compromissos && poderes.pagar && (
                <Botao variante="primario" icone="cash" carregando={gerando || atualizando}
                  onClick={() => lancarPrevisao(previsaoSelecionada, { ePagar: true })}>
                  Lançar e pagar
                </Botao>
              )}
            </Acoes>
          }
        >
          <div style={{ display: "grid", gap: 12 }}>
            {marcaDaPrevisao && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Marca marca={marcaDaPrevisao} tamanho={42} raio={11} />
                <div style={{ minWidth: 0 }}>
                  <small style={{ display: "block", color: "var(--text-dim)", fontSize: 11.5 }}>Relacionado a</small>
                  <strong style={{ display: "block", overflowWrap: "anywhere" }}>{marcaDaPrevisao.nome}</strong>
                </div>
              </div>
            )}
            <Selo selo={{ label: "Previsto", cor: "var(--text-dim)" }} />
            <strong style={{ fontSize: 24, fontVariantNumeric: "tabular-nums" }}>{moeda(previsaoSelecionada.valor)}</strong>
            <p style={{ color: "var(--text-dim)", lineHeight: 1.6 }}>
              Esta ocorrência vem de uma recorrência e ainda não é uma obrigação lançada. Ao lançar, ela entra como pendente sem duplicar a competência. Dá para pagar antes do vencimento: "Lançar e pagar" já abre a baixa com a data de hoje.
            </p>
            {erro && <p role="alert" style={{ color: "var(--perigo)" }}>{erro}</p>}
          </div>
        </PainelLateral>
      )}

      {/* ── Detalhes do compromisso ── */}
      {selecionado && !form && (
        <PainelLateral
          centrado
          titulo={selecionado.descricao}
          subtitulo={`Vence em ${dataBR(selecionado.vencimento)} · ${LABEL_ORIGEM[selecionado.origem] ?? selecionado.origem}`}
          onFechar={fecharPainel}
          largura={460}
          rodape={
            <Acoes>
              {pagamento ? (
                <>
                  <Botao onClick={() => { setPagamento(null); setErro(""); }}>Voltar</Botao>
                  <Botao variante="primario" icone="cash" carregando={salvando || atualizando} onClick={pagar}>
                    Confirmar pagamento
                  </Botao>
                </>
              ) : (
                <>
                  {/* ORDEM IMPORTA. O rodapé inverte no celular, então esta
                      ordem no código vira, na tela: Pagar → Editar → Cancelar.
                      O destrutivo fica por ÚLTIMO, longe do polegar que vai
                      para "Pagar" — antes ele nascia entre os dois, a 10px do
                      botão mais clicado da tela (CLAUDE.md: ação destrutiva não
                      fica colada em outra clicável). */}
                  {/* APAGAR ≠ CANCELAR, e as duas precisam existir.
                      Cancelar é o certo para a conta que existiu e não vai
                      mais ser paga: ela fica na lista, explicando o mês. Só que
                      a conta lançada POR ENGANO também só podia ser cancelada,
                      e então ficava para sempre marcada "Cancelado" — uma linha
                      errada não é história, é sujeira. Apagar some com ela.
                      O servidor recusa (409) o que tem movimento ou pagamento. */}
                  {poderes.compromissos && selecionado.efetivo !== "pago" && (
                    <BotaoApagar
                      tipo="compromisso"
                      id={selecionado.id}
                      nome={selecionado.descricao}
                      detalhe={selecionado.origem === "recorrencia"
                        ? "Esta conta veio de uma recorrência: a regra continua valendo e pode gerá-la de novo. Para não voltar, encerre a recorrência."
                        : undefined}
                      aoApagar={() => { setSelecionadoId(null); atualizar(); }}
                    />
                  )}
                  {poderes.compromissos && emAberto(selecionado.efetivo) && (
                    <Botao
                      variante="perigo"
                      icone="ban"
                      carregando={salvando || atualizando}
                      onClick={() => (confirmandoCancelar ? cancelar() : setConfirmandoCancelar(true))}
                    >
                      {confirmandoCancelar ? "Cancelar mesmo assim" : "Cancelar"}
                    </Botao>
                  )}
                  {poderes.compromissos && emAberto(selecionado.efetivo) && (
                    <Botao icone="pencil" onClick={() => abrirForm(rascunhoDe(selecionado))}>Editar</Botao>
                  )}
                  {poderes.pagar && emAberto(selecionado.efetivo) && (
                    <Botao
                      variante="primario"
                      icone="cash"
                      onClick={() => {
                        setErro(""); setConfirmandoCancelar(false);
                        setPagamento({
                          conta_id: selecionado.conta_id ?? contas[0]?.id ?? "",
                          valor: selecionado.valor.toFixed(2),
                          data: hoje,
                        });
                      }}
                    >
                      Pagar
                    </Botao>
                  )}
                  {poderes.pagar && selecionado.efetivo === "pago" && (
                    <Botao icone="arrow-back-up" carregando={salvando || atualizando} onClick={reverter}>
                      Desfazer pagamento
                    </Botao>
                  )}
                  {selecionado.origem === "recorrencia" && selecionado.origem_id && (
                    <Botao icone="refresh" onClick={() => {
                      window.location.href = `/financeiro/cadastros/recorrencias?regra=${encodeURIComponent(selecionado.origem_id as string)}`;
                    }}>
                      Ver recorrência
                    </Botao>
                  )}
                </>
              )}
            </Acoes>
          }
        >
          <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
            {marcaDoSelecionado && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Marca marca={marcaDoSelecionado} tamanho={44} raio={12} />
                <div style={{ minWidth: 0 }}>
                  <small style={{ display: "block", color: "var(--text-dim)", fontSize: 11.5 }}>Relacionado a</small>
                  <strong style={{ display: "block", overflowWrap: "anywhere" }}>{marcaDoSelecionado.nome}</strong>
                </div>
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
                {moeda(selecionado.valor)}
              </strong>
              <Selo selo={SELO_COMPROMISSO[selecionado.efetivo]} />
            </div>

            <Recado tipo="erro" texto={erro} />
            <Recado tipo="aviso" texto={aviso} />

            {pagamento ? (
              <div style={{ display: "grid", gap: 13 }}>
                {contas.length === 0 ? (
                  <Vazio
                    icone="wallet"
                    titulo="Nenhuma conta cadastrada"
                    detalhe="A baixa precisa sair de algum lugar. Cadastre um banco, gateway ou carteira antes de pagar."
                  />
                ) : (
                  <Campos>
                    <Campo label="Conta" dica="De onde o dinheiro sai.">
                      {(id) => (
                        <Escolha
  id={id}
  valor={pagamento.conta_id}
  vazio="Escolha a conta"
  placeholder="Buscar banco ou cartão…"
  aoEscolher={(v) => setPagamento({ ...pagamento, conta_id: v })}
  opcoes={contas.map((c) => ({ id: c.id, nome: c.nome, marca: { nome: c.nome, icone: "wallet" } }))}
/>
                      )}
                    </Campo>
                    <Campo label="Valor pago" dica="Vem do compromisso; mude se houve desconto ou juros.">
                      {(id) => (
                        <input
                          id={id}
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={pagamento.valor}
                          onChange={(e) => setPagamento({ ...pagamento, valor: e.target.value })}
                        />
                      )}
                    </Campo>
                    <Campo label="Data do pagamento">
                      {(id) => (
                        <input
                          id={id}
                          type="date"
                          value={pagamento.data}
                          onChange={(e) => setPagamento({ ...pagamento, data: e.target.value })}
                        />
                      )}
                    </Campo>
                  </Campos>
                )}
              </div>
            ) : (
              <dl style={{ display: "grid", gap: 2, margin: 0 }}>
                <Detalhe rotulo="Vencimento" valor={`${dataBR(selecionado.vencimento)} · ${prazoEmPalavras(hoje, selecionado.vencimento, selecionado.efetivo)}`} />
                <Detalhe rotulo="Categoria" valor={acharCategoria(CATEGORIAS_COMPROMISSO, selecionado.categoria).label} />
                <Detalhe rotulo="Conta" valor={selecionado.conta_id ? nomeConta.get(selecionado.conta_id) ?? "—" : "—"} />
                <Detalhe
                  rotulo="Relacionado a"
                  valor={marcaDoSelecionado?.nome ?? "—"}
                />
                <Detalhe rotulo="Origem" valor={LABEL_ORIGEM[selecionado.origem] ?? selecionado.origem} />
                {(selecionado.parcela_total ?? 0) > 1 && (
                  <Detalhe rotulo="Parcela" valor={`${selecionado.parcela_numero}/${selecionado.parcela_total}`} />
                )}
                {selecionado.pago_em && (
                  <Detalhe
                    rotulo="Pago em"
                    valor={`${dataBR(selecionado.pago_em.slice(0, 10))}${selecionado.pago_valor != null ? ` · ${moeda(selecionado.pago_valor)}` : ""}`}
                  />
                )}
                {selecionado.observacao && <Detalhe rotulo="Observação" valor={selecionado.observacao} />}
              </dl>
            )}

            {/* Fora do formulário de baixa: durante o "pagar" a folha é só os
                três campos, e um bloco de arquivos no meio disputaria a atenção
                com o valor que está sendo confirmado. */}
            {!pagamento && (
              <Anexos
                tipo="compromisso"
                owner_id={selecionado.id}
                empresa_id={empresaId}
                podeEditar={poderes.pagar}
                titulo="Comprovante"
                dica="Recibo, boleto quitado ou print da transferência — o papel que prova esta baixa."
              />
            )}

            {!pagamento && selecionado.efetivo === "pago" && (
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
                Compromisso pago não é editado direto: o movimento na conta já aconteceu. Para mudar valor ou
                vencimento, desfaça o pagamento primeiro — o movimento original é preservado e ganha um estorno.
              </p>
            )}
          </div>
        </PainelLateral>
      )}

      {/* ── Novo / editar ── */}
      {form && (
        <PainelLateral
          centrado
          titulo={form.id ? "Editar compromisso" : "Novo compromisso"}
          soFechaNoX
          subtitulo={form.id ? undefined : "A conta entra na agenda como pendente e já conta no “a pagar” do dia."}
          onFechar={() => { setForm(null); setErro(""); }}
          largura={480}
          rodape={
            <Acoes>
              <Botao onClick={() => { setForm(null); setErro(""); }}>Fechar</Botao>
              <Botao variante="primario" icone="check" carregando={salvando || atualizando} onClick={salvar}>
                {form.id ? "Salvar" : "Lançar compromisso"}
              </Botao>
            </Acoes>
          }
        >
          <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
            <Recado tipo="erro" texto={erro} />

            {!form.id && (
              <LinhaRapida
                valor={linha}
                aoMudar={escreverLinha}
                entendido={entendido}
                placeholder="Aluguel 8.000 dia 10"
                aoEnter={focarOQueFalta}
              />
            )}

            <Campos>
              {!form.id && !empresaId && empresas.length > 0 && (
                <Campo label="Empresa" largo erro={erros.empresa} sinal={tentativa} dica="Em “Visão geral” o compromisso precisa dizer em qual empresa nasce.">
                  {(id) => (
                    <SeletorEmpresa id={id} empresas={empresas} valor={form.empresa_id}
                      aoMudar={(v) => setForm({
                        ...form, empresa_id: v, contato_id: "", fornecedor_id: "",
                      })} />
                  )}
                </Campo>
              )}
              <Campo label="Descrição" largo erro={erros.descricao} sinal={tentativa}>
                {(id) => (
                  <input
                    ref={descRef}
                    id={id}
                    value={form.descricao}
                    onChange={(e) => { setForm({ ...form, descricao: e.target.value }); if (erros.descricao) setErros({ ...erros, descricao: undefined }); }}
                    placeholder="Aluguel do galpão, licença do software..."
                  />
                )}
              </Campo>

              <Campo label="Valor" erro={erros.valor} sinal={tentativa}>
                {(id) => (
                  <input
                    ref={valorRef}
                    id={id}
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={form.valor}
                    onChange={(e) => { setForm({ ...form, valor: e.target.value }); if (erros.valor) setErros({ ...erros, valor: undefined }); }}
                    placeholder="0,00"
                  />
                )}
              </Campo>

              <Campo label="Vencimento" erro={erros.vencimento} sinal={tentativa}>
                {(id) => (
                  <input
                    ref={vencRef}
                    id={id}
                    type="date"
                    value={form.vencimento}
                    onChange={(e) => { setForm({ ...form, vencimento: e.target.value }); if (erros.vencimento) setErros({ ...erros, vencimento: undefined }); }}
                  />
                )}
              </Campo>

              <Campo label="Categoria">
                {(id) => (
                  <select
                    id={id}
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  >
                    {CATEGORIAS_COMPROMISSO.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                )}
              </Campo>

              <Campo label="Conta prevista" dica="Opcional — de onde deve sair quando for pago.">
                {(id) => (
                  <Escolha
  id={id}
  valor={form.conta_id}
  vazio="Decidir na hora de pagar"
  placeholder="Buscar banco ou cartão…"
  aoEscolher={(v) => setForm({ ...form, conta_id: v })}
  opcoes={contas.map((c) => ({ id: c.id, nome: c.nome, marca: { nome: c.nome, icone: "wallet" } }))}
/>
                )}
              </Campo>

            {/* PARA QUEM SE PAGA NÃO É DETALHE.
                Estava dentro de "Mais detalhes", fechado: para vincular o
                aluguel ao locador era preciso descobrir uma seção recolhida.
                O campo mais consultado depois do valor não pode exigir um
                toque a mais para existir. */}
              {!form.id && (
                <Campo
                  label="Relacionado a"
                  dica={empresaDoFormulario ? "Opcional — pessoa, empresa ou fornecedor." : "Escolha primeiro a empresa proprietária."}
                >
                  {(id) => (
                    // Dez fornecedores hoje, e crescendo. Num `<select>` nativo
                    // achar um nome é rolar procurando com o olho: não há busca,
                    // não há foto, e o teclado só salta pela primeira letra.
                    <Escolha
                      id={id}
                      valor={relacionadoDoFormulario}
                      disabled={!empresaDoFormulario}
                      vazio="Sem relacionado"
                      placeholder="Buscar pessoa, empresa ou fornecedor…"
                      aoEscolher={(v) => setForm({ ...form, ...idsDoRelacionado(v) })}
                      rotuloCriar="Criar contato"
                      aoCriar={criarContato}
                      opcoes={[
                        ...pessoasDoFormulario.map((x) => ({
                          id: `contato:${x.id}`, nome: x.nome, grupo: "Pessoas",
                          marca: { nome: x.nome, logo: logosRelacionados[x.id] ?? null, icone: "user" },
                        })),
                        ...organizacoesDoFormulario.map((x) => ({
                          id: `contato:${x.id}`, nome: x.nome, grupo: "Empresas",
                          marca: { nome: x.nome, logo: logosRelacionados[x.id] ?? null, icone: "building-warehouse" },
                        })),
                        ...fornecedoresDoFormulario.map((x) => ({
                          id: `fornecedor:${x.id}`, nome: x.nome, grupo: "Fornecedores",
                          marca: { nome: x.nome, logo: logosRelacionados[x.id] ?? null, icone: "truck" },
                        })),
                      ]}
                    />
                  )}
                </Campo>
              )}

            </Campos>

            {/* O que quase ninguém preenche no ato de criar fica um nível
                abaixo — fechado no cadastro novo, aberto na edição quando tem
                algo. A regra da Apple: o caminho comum primeiro, o avançado
                um toque depois. */}
            <Secao
              icone="adjustments-horizontal"
              titulo="Mais detalhes"
              resumo="Situação e observação"
              inicialAberta={!!form.id && !!(form.observacao || form.status !== "pendente")}
            >
              <Campos>
              {/* O vínculo só muda no lançamento: a rota de edição não troca
                  o favorecido. O valor codificado mantém as duas FKs existentes
                  mutuamente exclusivas sem expor essa implementação na UI. */}

              {form.id && (
                <Campo label="Situação" dica="Pagar e cancelar têm botão próprio.">
                  {(id) => (
                    <select
                      id={id}
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as StatusEditavel })}
                    >
                      {STATUS_EDITAVEL.map((s) => (
                        <option key={s} value={s}>{SELO_COMPROMISSO[s].label}</option>
                      ))}
                    </select>
                  )}
                </Campo>
              )}

              <Campo label="Observação" largo>
                {(id) => (
                  <textarea
                    id={id}
                    rows={3}
                    value={form.observacao}
                    onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                    placeholder="Número do boleto, contato, o que ajudar depois."
                  />
                )}
              </Campo>
              </Campos>
            </Secao>

            {!form.id && poderes.cadastros && (
              <Secao
                icone="refresh"
                titulo="Recorrência"
                resumo={form.repetir ? "Este compromisso se repetirá" : "Criar só uma vez"}
                inicialAberta={form.repetir}
              >
                <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", cursor: "pointer" }}>
                  <Caixa marcado={form.repetir} onChange={(marc) => setForm({ ...form, repetir: marc })} />
                  <strong>Repetir este compromisso</strong>
                </label>
                {form.repetir && (
                  <Campos>
                    <Campo label="Periodicidade">{(id) => (
                      <select id={id} value={form.periodicidade}
                        onChange={(e) => setForm({ ...form, periodicidade: e.target.value as Rascunho["periodicidade"] })}>
                        <option value="mensal">Mensal</option>
                        <option value="bimestral">Bimestral</option>
                        <option value="trimestral">Trimestral</option>
                        <option value="semestral">Semestral</option>
                        <option value="anual">Anual</option>
                        <option value="customizada">Personalizada</option>
                      </select>
                    )}</Campo>
                    {form.periodicidade === "customizada" && (
                      <Campo label="A cada quantos meses">{(id) => (
                        <input id={id} type="number" min="1" max="60" inputMode="numeric"
                          value={form.intervalo_meses}
                          onChange={(e) => setForm({ ...form, intervalo_meses: e.target.value })} />
                      )}</Campo>
                    )}
                    {/* Vazio no rascunho = "o mesmo dia do vencimento". O campo
                        MOSTRA esse dia (não um dia de hoje que ninguém escolheu)
                        e acompanha a data enquanto a pessoa não digitar outro. */}
                    <Campo label="Dia do vencimento" dica="Acompanha a data acima; mude só se a cobrança cair em outro dia.">{(id) => (
                      <input id={id} type="number" min="1" max="31" inputMode="numeric"
                        value={form.dia_vencimento || String(diaDoVencimento("", form.vencimento))}
                        onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })} />
                    )}</Campo>
                    <Campo label="Termina em" dica="Opcional.">{(id) => (
                      <input id={id} type="date" value={form.fim_recorrencia}
                        onChange={(e) => setForm({ ...form, fim_recorrencia: e.target.value })} />
                    )}</Campo>
                  </Campos>
                )}
              </Secao>
            )}

          </div>
        </PainelLateral>
      )}

      {pagoAgora && (
        <DesfazerAviso
          key={pagoAgora.id}
          tom="ok"
          icone="circle-check"
          titulo="Pagamento registrado"
          detalhe={`${pagoAgora.descricao} · ${moeda(pagoAgora.valor)}`}
          aoDesfazer={() => desfazerPago(pagoAgora.id)}
          aoSumir={() => setPagoAgora(null)}
        />
      )}
    </>
  );
}

// ── Peças pequenas desta tela ────────────────────────────────────────────────

function Detalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "baseline", gap: 12, minWidth: 0,
        padding: "9px 0", borderBottom: "1px solid var(--border)",
      }}
    >
      <dt style={{ flex: "none", width: 108, fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)" }}>{rotulo}</dt>
      <dd style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 13.5, fontWeight: 600, overflowWrap: "anywhere" }}>
        {valor}
      </dd>
    </div>
  );
}

function Recado({ tipo, texto }: { tipo: "erro" | "aviso"; texto: string }) {
  if (!texto) return null;
  const cor = tipo === "erro" ? "var(--perigo)" : "var(--atencao)";
  return (
    <p
      role={tipo === "erro" ? "alert" : "status"}
      style={{
        display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px",
        borderRadius: "var(--r-sm)", fontSize: 13, lineHeight: 1.5, color: cor,
        background: `color-mix(in srgb, ${cor} 11%, transparent)`,
      }}
    >
      <Icon name={tipo === "erro" ? "alert-triangle" : "info-circle"} size={17} color={cor} />
      {texto}
    </p>
  );
}

/** "vence em 3 dias" / "atrasado há 5 dias" — o número que muda a urgência. */
function prazoEmPalavras(hoje: string, vencimento: string, efetivo: CompromissoStatus): string {
  if (efetivo === "pago") return "pago";
  if (efetivo === "cancelado") return "cancelado";
  const dias = diasEntre(hoje, vencimento);
  if (dias === 0) return "vence hoje";
  if (dias === 1) return "vence amanhã";
  if (dias > 0) return `vence em ${dias} dias`;
  return `atrasado há ${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"}`;
}
