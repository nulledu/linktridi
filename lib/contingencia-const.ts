// ── Marketing · Gerenciador de Contingência — núcleo puro ────────────────────
// Sem `next/headers` e sem Supabase: a tela client importa daqui, e tudo o que
// DECIDE alguma coisa (o que conta como "pronto", as quatro taxas, quando um
// atendente está em risco) mora neste arquivo pra ser testado sem banco.
//
// O chip da contingência É o `aquecimento_ativo` de tipo `numero`. Este módulo
// não inventa status: ele LÊ o status que o time já mantém na aba Aquecimento
// e o traduz pro vocabulário da contingência. A tabela abaixo é o contrato:
//
//   aquecimento        │ contingência
//   ───────────────────┼──────────────────────────────────────────────
//   novo               │ não aquecido (ainda não começou)
//   aquecendo          │ em aquecimento
//   aquecido           │ PRONTO para entregar (aquecido e ainda não em uso)
//   em_uso             │ aquecido e em uso por um atendente
//   restrito           │ restringido
//   banido             │ bloqueado
//   aposentado         │ fora das contagens (só aparece em listas)
//
// "Chips aquecidos" nas fórmulas = aquecido + em_uso (terminou o aquecimento).
// "Prontos" na linha principal = só `aquecido` (o que dá pra entregar hoje).

import type { Ativo, StatusAtivo } from "@/lib/marketing-aquecimento-const";
export { rotuloStatus, corStatus, STATUS } from "@/lib/marketing-aquecimento-const";
export type { Ativo, StatusAtivo } from "@/lib/marketing-aquecimento-const";

// ── Entidades próprias ───────────────────────────────────────────────────────

export type SituacaoCelular = "ok" | "manutencao" | "aposentado";

/** A ficha do aparelho, com o que a contingência acrescentou. `situacao` é só
 *  o OVERRIDE manual: disponível/em uso são derivados de ter número dentro. */
export interface Celular {
  id: string;
  nome: string;
  modelo: string | null;
  fotoUrl: string | null;
  lugar: string | null;
  obs: string | null;
  situacao: SituacaoCelular;
  identificacao: string | null;
  responsavelId: string | null;
  responsavelNome: string | null;
}

export type StatusProxy = "ativo" | "inativo" | "expirado";

export interface Proxy {
  id: string;
  identificacao: string;
  status: StatusProxy;
  custoMensal: number;
  numeroId: string | null;
  aparelhoNome: string | null;
  compradoEm: string | null;
  obs: string | null;
}

export type TipoCusto = "plano_chip" | "outro";
export type Periodicidade = "mensal" | "unico";

export interface Custo {
  id: string;
  tipo: TipoCusto;
  descricao: string;
  valor: number;
  periodicidade: Periodicidade;
  data: string;
  ativo: boolean;
  obs: string | null;
}

export interface PendenciaOperacional {
  id: string;
  titulo: string;
  descricao: string | null;
  status: "aberta" | "feita";
  responsavelId: string | null;
  responsavelNome: string | null;
  data: string | null;
  concluidaEm: string | null;
  createdAt: string;
}

/** Limites que decidem a cor do atendente. Nunca são número no código: quem
 *  calibra é quem opera, em Configurações. */
export interface Limites {
  /** Reservas (prontos, não entregues) iguais ou abaixo disto = atenção. */
  reservaAtencao: number;
  /** Reservas iguais ou abaixo disto E nada em aquecimento = crítico. */
  reservaCritico: number;
  /** Aquecidos com proxy iguais ou abaixo disto = atenção. */
  protegidosAtencao: number;
}

export const LIMITES_PADRAO: Limites = { reservaAtencao: 2, reservaCritico: 0, protegidosAtencao: 1 };

export const STATUS_PROXY: { key: StatusProxy; label: string; cor: string }[] = [
  { key: "ativo",    label: "Ativo",    cor: "var(--ok)" },
  { key: "inativo",  label: "Inativo",  cor: "var(--neutro)" },
  { key: "expirado", label: "Expirado", cor: "var(--atencao)" },
];

export const SITUACAO_CELULAR: { key: SituacaoCelular; label: string }[] = [
  { key: "ok",         label: "Em operação" },
  { key: "manutencao", label: "Em manutenção" },
  { key: "aposentado", label: "Aposentado" },
];

// ── Normalização ─────────────────────────────────────────────────────────────

export const normalizar = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export const ehFluke = (operadora: string | null | undefined) => normalizar(operadora) === "fluke";

/** "Claro" e "claro " são a mesma operadora. O rótulo mostrado é o primeiro
 *  que apareceu, com a caixa de quem digitou. */
export const rotuloOperadora = (op: string | null | undefined) => (op ?? "").trim() || "Sem operadora";
export const rotuloModelo = (m: string | null | undefined) => (m ?? "").trim() || "Sem modelo";

// ── Números: classificação de um chip ────────────────────────────────────────

export interface FlagsNumero {
  ativo: boolean;            // não aposentado
  naoAquecido: boolean;      // novo
  emAquecimento: boolean;    // aquecendo
  pronto: boolean;           // aquecido (pronto pra entregar)
  emUso: boolean;            // em_uso
  aquecido: boolean;         // aquecido + em_uso
  restrito: boolean;
  bloqueado: boolean;
  caido: boolean;            // restrito + bloqueado
  fluke: boolean;
  comProxy: boolean;
  emEstoque: boolean;        // novo, sem aparelho, sem atendente
}

/** Um número está protegido quando um proxy ATIVO aponta pra ele ou pro
 *  aparelho onde ele mora. O proxy no aparelho cobre todos os chips de dentro:
 *  é assim que o time compra (um proxy por celular). */
export function indiceDeProxies(proxies: Proxy[]) {
  const porNumero = new Set<string>();
  const porAparelho = new Set<string>();
  for (const p of proxies) {
    if (p.status !== "ativo") continue;
    if (p.numeroId) porNumero.add(p.numeroId);
    if (p.aparelhoNome) porAparelho.add(normalizar(p.aparelhoNome));
  }
  return { porNumero, porAparelho };
}

export type IndiceProxies = ReturnType<typeof indiceDeProxies>;

export function temProxy(n: Ativo, idx: IndiceProxies): boolean {
  return idx.porNumero.has(n.id) || (!!n.aparelho && idx.porAparelho.has(normalizar(n.aparelho)));
}

export function flagsDe(n: Ativo, idx: IndiceProxies): FlagsNumero {
  const s = n.status;
  const pronto = s === "aquecido";
  const emUso = s === "em_uso";
  const restrito = s === "restrito";
  const bloqueado = s === "banido";
  return {
    ativo: s !== "aposentado",
    naoAquecido: s === "novo",
    emAquecimento: s === "aquecendo",
    pronto, emUso, aquecido: pronto || emUso,
    restrito, bloqueado, caido: restrito || bloqueado,
    fluke: ehFluke(n.operadora),
    comProxy: temProxy(n, idx),
    emEstoque: s === "novo" && !n.aparelho && !n.responsavelId && !n.responsavelNome,
  };
}

// ── Taxas (fórmulas EXATAMENTE como informadas) ──────────────────────────────
// Denominador zero não é erro matemático: é "sem dados suficientes", e a tela
// mostra os dois lados da conta pra pessoa ver por que não há resultado.

export interface Taxa {
  chave: "produtividade" | "aquecimento" | "protegidos" | "qualidade";
  rotulo: string;
  descricao: string;
  numerador: { rotulo: string; valor: number };
  denominador: { rotulo: string; valor: number };
  /** `null` quando o denominador é zero. */
  valor: number | null;
}

function taxa(
  chave: Taxa["chave"], rotulo: string, descricao: string,
  num: { rotulo: string; valor: number }, den: { rotulo: string; valor: number },
): Taxa {
  return { chave, rotulo, descricao, numerador: num, denominador: den, valor: den.valor > 0 ? num.valor / den.valor : null };
}

export const fmtTaxa = (t: Taxa | number | null) => {
  const v = typeof t === "number" || t === null ? t : t.valor;
  return v === null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
};

export const SEM_DADOS = "Sem dados suficientes";

// ── Atendente ────────────────────────────────────────────────────────────────

export type Saude = "saudavel" | "atencao" | "critico";

export const SAUDE: Record<Saude, { label: string; cor: string; descricao: string }> = {
  saudavel: { label: "Saudável", cor: "var(--ok)",      descricao: "Linhas aquecidas e protegidas em número suficiente." },
  atencao:  { label: "Atenção",  cor: "var(--atencao)", descricao: "Poucos números reservas ou poucos protegidos por proxy." },
  critico:  { label: "Crítico",  cor: "var(--perigo)",  descricao: "Risco de ficar sem número utilizável." },
};

export interface ResumoAtendente {
  /** `responsavelId` quando existe; senão `nome:<nome normalizado>`. */
  chave: string;
  id: string | null;
  nome: string;
  foto: string | null;
  numeros: number;
  aquecidos: number;        // aquecido + em_uso
  emUso: number;
  reservas: number;         // aquecido (pronto, não entregue)
  emAquecimento: number;
  naoAquecidos: number;
  comProxy: number;
  semProxy: number;
  aquecidosComProxy: number;
  caidos: number;
  celulares: number;
  saude: Saude;
  motivo: string;
}

/** A regra da cor, com os limites vindos de fora. Crítico só quando não há
 *  reserva E não vem nada no forno; atenção é o aviso antes disso. */
export function saudeDe(
  r: Pick<ResumoAtendente, "reservas" | "emAquecimento" | "aquecidosComProxy" | "numeros">,
  limites: Limites = LIMITES_PADRAO,
): { saude: Saude; motivo: string } {
  if (r.numeros === 0) return { saude: "critico", motivo: "Sem nenhum número." };
  if (r.reservas <= limites.reservaCritico && r.emAquecimento === 0) {
    return { saude: "critico", motivo: `${r.reservas} reserva${r.reservas === 1 ? "" : "s"} e nada em aquecimento.` };
  }
  if (r.reservas <= limites.reservaAtencao) {
    return { saude: "atencao", motivo: `Só ${r.reservas} número${r.reservas === 1 ? "" : "s"} reserva${r.reservas === 1 ? "" : "s"}.` };
  }
  if (r.aquecidosComProxy <= limites.protegidosAtencao) {
    return { saude: "atencao", motivo: `Só ${r.aquecidosComProxy} aquecido${r.aquecidosComProxy === 1 ? "" : "s"} com proxy.` };
  }
  return { saude: "saudavel", motivo: SAUDE.saudavel.descricao };
}

export const chaveAtendente = (id: string | null | undefined, nome: string | null | undefined) =>
  id || (nome ? `nome:${normalizar(nome)}` : "");

// ── Consolidado ──────────────────────────────────────────────────────────────
// A foto inteira de hoje. É o que a tela desenha e o que o snapshot guarda.
// Só números e listas curtas (agrupamentos, atendentes) — nunca a lista de
// chips, que já mora na própria tabela.

export interface Contagem { rotulo: string; qtd: number }

// ── Contingência de tráfego: a Estrutura Meta do aquecimento ─────────────────
// BM e conta de anúncio JÁ vivem no aquecimento (tipo `bm`/`conta`). A visão de
// tráfego não inventa métrica: conta o que existe, por status. Aposentadas
// ficam fora, igual aos chips.

export interface ResumoMeta {
  bms: { total: number; porStatus: Contagem[]; caidas: number };
  contas: { total: number; porStatus: Contagem[]; prontas: number; aquecendo: number; naoAquecidas: number; caidas: number };
}

export function resumoMeta(ativos: Ativo[]): ResumoMeta {
  const vivas = (t: "bm" | "conta") => ativos.filter((a) => a.tipo === t && a.status !== "aposentado");
  const porStatus = (xs: Ativo[]): Contagem[] =>
    STATUS_ORDEM.map((s) => ({ rotulo: s.label, qtd: xs.filter((a) => a.status === s.key).length })).filter((c) => c.qtd > 0);
  const bms = vivas("bm"), contas = vivas("conta");
  const caidas = (xs: Ativo[]) => xs.filter((a) => a.status === "restrito" || a.status === "banido").length;
  return {
    bms: { total: bms.length, porStatus: porStatus(bms), caidas: caidas(bms) },
    contas: {
      total: contas.length, porStatus: porStatus(contas),
      prontas: contas.filter((a) => a.status === "aquecido" || a.status === "em_uso").length,
      aquecendo: contas.filter((a) => a.status === "aquecendo").length,
      naoAquecidas: contas.filter((a) => a.status === "novo").length,
      caidas: caidas(contas),
    },
  };
}

const STATUS_ORDEM: { key: StatusAtivo; label: string }[] = [
  { key: "em_uso", label: "Em uso" }, { key: "aquecido", label: "Aquecida" }, { key: "aquecendo", label: "Em aquecimento" },
  { key: "novo", label: "Nova" }, { key: "restrito", label: "Restrita" }, { key: "banido", label: "Banida" },
];

export interface Consolidado {
  geradoEm: string;
  meta: ResumoMeta;
  numeros: {
    total: number; prontos: number; emUso: number; aquecidos: number;
    emAquecimento: number; naoAquecidos: number; restritos: number; bloqueados: number;
    aposentados: number; fluke: number; comProxy: number; semProxy: number;
    emEstoque: number; emEstoqueFluke: number;
    aquecidosComProxy: number; comProxyAquecidos: number; comProxyCaidos: number;
  };
  celulares: {
    total: number; disponiveis: number; emUso: number; manutencao: number; aposentados: number;
    comProxy: number; semProxy: number;
    porModelo: Contagem[];
  };
  operadoras: (Contagem & { fluke: boolean; aquecidos: number; emAquecimento: number; naoAquecidos: number })[];
  proxies: { comprados: number; ativos: number; associados: number; livres: number; gastoMensal: number };
  custos: { proxies: number; planos: number; outros: number; total: number };
  atendentes: ResumoAtendente[];
  taxas: { produtividade: Taxa; aquecimento: Taxa; protegidos: Taxa; qualidade: Taxa };
  pendenciasAbertas: number;
}

export interface Entrada {
  /** Todos os ativos do aquecimento (número, BM e conta). Os chips são filtrados aqui. */
  ativos: Ativo[];
  celulares: Celular[];
  proxies: Proxy[];
  custos: Custo[];
  pendencias: PendenciaOperacional[];
  limites?: Limites;
  agora?: string;
}

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const arred = (v: number) => Math.round(v * 100) / 100;

export function consolidar(e: Entrada): Consolidado {
  const limites = e.limites ?? LIMITES_PADRAO;
  const idx = indiceDeProxies(e.proxies);
  const todos = e.ativos.filter((n) => n.tipo === "numero");
  const flags = new Map(todos.map((n) => [n.id, flagsDe(n, idx)]));
  const vivos = todos.filter((n) => flags.get(n.id)!.ativo);
  const conta = (f: (x: FlagsNumero) => boolean) => vivos.filter((n) => f(flags.get(n.id)!)).length;

  // ── celulares ──
  const numerosPorAparelho = new Map<string, Ativo[]>();
  for (const n of vivos) {
    if (!n.aparelho) continue;
    const k = normalizar(n.aparelho);
    const l = numerosPorAparelho.get(k);
    if (l) l.push(n); else numerosPorAparelho.set(k, [n]);
  }
  const celularesVivos = e.celulares.filter((c) => c.situacao !== "aposentado");
  const celularComProxy = (c: Celular) => {
    const k = normalizar(c.nome);
    if (idx.porAparelho.has(k)) return true;
    return (numerosPorAparelho.get(k) ?? []).some((n) => idx.porNumero.has(n.id));
  };
  const emUsoCel = celularesVivos.filter((c) => c.situacao === "ok" && (numerosPorAparelho.get(normalizar(c.nome))?.length ?? 0) > 0);
  const disponiveis = celularesVivos.filter((c) => c.situacao === "ok" && !(numerosPorAparelho.get(normalizar(c.nome))?.length));
  const porModelo = agrupar(celularesVivos.map((c) => rotuloModelo(c.modelo)));

  // ── operadoras ──
  const opMap = new Map<string, { rotulo: string; qtd: number; fluke: boolean; aquecidos: number; emAquecimento: number; naoAquecidos: number }>();
  for (const n of vivos) {
    const k = normalizar(n.operadora) || "sem operadora";
    const f = flags.get(n.id)!;
    const cur = opMap.get(k) ?? { rotulo: rotuloOperadora(n.operadora), qtd: 0, fluke: f.fluke, aquecidos: 0, emAquecimento: 0, naoAquecidos: 0 };
    cur.qtd++;
    if (f.aquecido) cur.aquecidos++;
    if (f.emAquecimento) cur.emAquecimento++;
    if (f.naoAquecido) cur.naoAquecidos++;
    opMap.set(k, cur);
  }
  const operadoras = [...opMap.values()].sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo));

  // ── proxies e custos ──
  const proxiesAtivos = e.proxies.filter((p) => p.status === "ativo");
  const associados = proxiesAtivos.filter((p) => p.numeroId || p.aparelhoNome).length;
  const gastoProxies = arred(soma(proxiesAtivos.map((p) => p.custoMensal)));
  const custosMensais = e.custos.filter((c) => c.ativo && c.periodicidade === "mensal");
  const planos = arred(soma(custosMensais.filter((c) => c.tipo === "plano_chip").map((c) => c.valor)));
  const outros = arred(soma(custosMensais.filter((c) => c.tipo === "outro").map((c) => c.valor)));

  // ── atendentes ──
  const atMap = new Map<string, { id: string | null; nome: string; foto: string | null; numeros: Ativo[]; celulares: number }>();
  for (const n of vivos) {
    const chave = chaveAtendente(n.responsavelId, n.responsavelNome);
    if (!chave) continue;
    const cur = atMap.get(chave) ?? { id: n.responsavelId, nome: n.responsavelNome || "Sem nome", foto: n.responsavelFoto, numeros: [], celulares: 0 };
    cur.numeros.push(n);
    if (!cur.foto && n.responsavelFoto) cur.foto = n.responsavelFoto;
    atMap.set(chave, cur);
  }
  for (const c of celularesVivos) {
    const chave = chaveAtendente(c.responsavelId, c.responsavelNome);
    if (!chave) continue;
    const cur = atMap.get(chave) ?? { id: c.responsavelId, nome: c.responsavelNome || "Sem nome", foto: null, numeros: [], celulares: 0 };
    cur.celulares++;
    atMap.set(chave, cur);
  }
  const atendentes: ResumoAtendente[] = [...atMap.entries()].map(([chave, a]) => {
    const fs = a.numeros.map((n) => flags.get(n.id)!);
    const c = (f: (x: FlagsNumero) => boolean) => fs.filter(f).length;
    const base = {
      chave, id: a.id, nome: a.nome, foto: a.foto,
      numeros: fs.length,
      aquecidos: c((f) => f.aquecido), emUso: c((f) => f.emUso), reservas: c((f) => f.pronto),
      emAquecimento: c((f) => f.emAquecimento), naoAquecidos: c((f) => f.naoAquecido),
      comProxy: c((f) => f.comProxy), semProxy: c((f) => !f.comProxy),
      aquecidosComProxy: c((f) => f.aquecido && f.comProxy), caidos: c((f) => f.caido),
      celulares: a.celulares,
    };
    return { ...base, ...saudeDe(base, limites) };
  }).sort((x, y) => ordemSaude(x.saude) - ordemSaude(y.saude) || x.reservas - y.reservas || x.nome.localeCompare(y.nome));

  // ── as quatro taxas ──
  const celTotal = celularesVivos.length;
  const celComProxy = celularesVivos.filter(celularComProxy).length;
  const aquecidos = conta((f) => f.aquecido);
  const naoAquecidos = conta((f) => f.naoAquecido);
  const aquecidosComProxy = conta((f) => f.aquecido && f.comProxy);
  const comProxyCaidos = conta((f) => f.comProxy && f.caido);

  const taxas = {
    produtividade: taxa("produtividade", "Taxa de produtividade", "Celulares ÷ celulares com proxy",
      { rotulo: "Celulares", valor: celTotal }, { rotulo: "Celulares com proxy", valor: celComProxy }),
    aquecimento: taxa("aquecimento", "Taxa de aquecimento", "Chips aquecidos ÷ chips não aquecidos",
      { rotulo: "Chips aquecidos", valor: aquecidos }, { rotulo: "Chips não aquecidos", valor: naoAquecidos }),
    protegidos: taxa("protegidos", "Taxa de números protegidos", "Chips aquecidos ÷ chips aquecidos com proxy",
      { rotulo: "Chips aquecidos", valor: aquecidos }, { rotulo: "Aquecidos com proxy", valor: aquecidosComProxy }),
    qualidade: taxa("qualidade", "Qualidade do aquecimento", "Chips com proxy aquecidos ÷ chips com proxy restringidos ou bloqueados",
      { rotulo: "Com proxy aquecidos", valor: aquecidosComProxy }, { rotulo: "Com proxy restringidos/bloqueados", valor: comProxyCaidos }),
  };

  return {
    geradoEm: e.agora ?? new Date().toISOString(),
    meta: resumoMeta(e.ativos),
    numeros: {
      total: vivos.length,
      prontos: conta((f) => f.pronto), emUso: conta((f) => f.emUso), aquecidos,
      emAquecimento: conta((f) => f.emAquecimento), naoAquecidos,
      restritos: conta((f) => f.restrito), bloqueados: conta((f) => f.bloqueado),
      aposentados: todos.length - vivos.length,
      fluke: conta((f) => f.fluke),
      comProxy: conta((f) => f.comProxy), semProxy: conta((f) => !f.comProxy),
      emEstoque: conta((f) => f.emEstoque), emEstoqueFluke: conta((f) => f.emEstoque && f.fluke),
      aquecidosComProxy, comProxyAquecidos: aquecidosComProxy, comProxyCaidos,
    },
    celulares: {
      total: celTotal, disponiveis: disponiveis.length, emUso: emUsoCel.length,
      manutencao: celularesVivos.filter((c) => c.situacao === "manutencao").length,
      aposentados: e.celulares.length - celTotal,
      comProxy: celComProxy, semProxy: celTotal - celComProxy,
      porModelo,
    },
    operadoras,
    proxies: {
      comprados: e.proxies.length, ativos: proxiesAtivos.length, associados,
      livres: proxiesAtivos.length - associados, gastoMensal: gastoProxies,
    },
    custos: { proxies: gastoProxies, planos, outros, total: arred(gastoProxies + planos) },
    atendentes,
    taxas,
    pendenciasAbertas: e.pendencias.filter((p) => p.status === "aberta").length,
  };
}

const ordemSaude = (s: Saude) => (s === "critico" ? 0 : s === "atencao" ? 1 : 2);

export function agrupar(rotulos: string[]): Contagem[] {
  const m = new Map<string, Contagem>();
  for (const r of rotulos) {
    const k = normalizar(r);
    const cur = m.get(k);
    if (cur) cur.qtd++; else m.set(k, { rotulo: r, qtd: 1 });
  }
  return [...m.values()].sort((a, b) => b.qtd - a.qtd || a.rotulo.localeCompare(b.rotulo));
}

// ── Filtros (poucos, e todos derivados das flags) ────────────────────────────

export type ChaveFiltro =
  | "fluke" | "outras" | "comProxy" | "semProxy"
  | "aquecido" | "emAquecimento" | "naoAquecido" | "bloqueado" | "restrito" | "pronto" | "emEstoque";

export const FILTROS: { key: ChaveFiltro; label: string }[] = [
  { key: "pronto",        label: "Pronto para entrega" },
  { key: "aquecido",      label: "Aquecido" },
  { key: "emAquecimento", label: "Em aquecimento" },
  { key: "naoAquecido",   label: "Não aquecido" },
  { key: "comProxy",      label: "Com proxy" },
  { key: "semProxy",      label: "Sem proxy" },
  { key: "fluke",         label: "Fluke" },
  { key: "outras",        label: "Outras operadoras" },
  { key: "restrito",      label: "Restringido" },
  { key: "bloqueado",     label: "Bloqueado" },
  { key: "emEstoque",     label: "Em estoque" },
];

export interface Filtro {
  chaves?: ChaveFiltro[];
  atendente?: string | null;     // chave do atendente
  operadora?: string | null;
  modelo?: string | null;        // modelo do celular (via ficha)
}

export function filtrarNumeros(
  numeros: Ativo[], proxies: Proxy[], celulares: Celular[], f: Filtro,
): Ativo[] {
  const idx = indiceDeProxies(proxies);
  const modeloDe = new Map(celulares.map((c) => [normalizar(c.nome), normalizar(rotuloModelo(c.modelo))]));
  return numeros.filter((n) => {
    if (n.tipo !== "numero") return false;
    const fl = flagsDe(n, idx);
    if (!fl.ativo) return false;
    if (f.atendente && chaveAtendente(n.responsavelId, n.responsavelNome) !== f.atendente) return false;
    if (f.operadora && normalizar(n.operadora) !== normalizar(f.operadora)) return false;
    if (f.modelo && (modeloDe.get(normalizar(n.aparelho)) ?? "") !== normalizar(f.modelo)) return false;
    for (const c of f.chaves ?? []) {
      const passa = c === "outras" ? !fl.fluke : c === "semProxy" ? !fl.comProxy : fl[c];
      if (!passa) return false;
    }
    return true;
  });
}

// ── Comparação entre dias (Histórico) ────────────────────────────────────────

export interface Variacao { chave: string; rotulo: string; antes: number; agora: number; delta: number; bomQuandoSobe: boolean }

const CAMPOS_HISTORICO: { chave: string; rotulo: string; pega: (c: Consolidado) => number; bomQuandoSobe: boolean }[] = [
  { chave: "celulares",       rotulo: "Celulares",             pega: (c) => c.celulares.total,          bomQuandoSobe: true },
  { chave: "prontos",         rotulo: "Números prontos",       pega: (c) => c.numeros.prontos,          bomQuandoSobe: true },
  { chave: "emAquecimento",   rotulo: "Em aquecimento",        pega: (c) => c.numeros.emAquecimento,    bomQuandoSobe: true },
  { chave: "naoAquecidos",    rotulo: "Não aquecidos",         pega: (c) => c.numeros.naoAquecidos,     bomQuandoSobe: false },
  { chave: "comProxy",        rotulo: "Com proxy",             pega: (c) => c.numeros.comProxy,         bomQuandoSobe: true },
  { chave: "bloqueados",      rotulo: "Bloqueados",            pega: (c) => c.numeros.bloqueados,       bomQuandoSobe: false },
  { chave: "restritos",       rotulo: "Restringidos",          pega: (c) => c.numeros.restritos,        bomQuandoSobe: false },
  { chave: "emEstoque",       rotulo: "Chips em estoque",      pega: (c) => c.numeros.emEstoque,        bomQuandoSobe: true },
  { chave: "proxies",         rotulo: "Proxies comprados",     pega: (c) => c.proxies.comprados,        bomQuandoSobe: true },
  { chave: "custoTotal",      rotulo: "Custo mensal",          pega: (c) => c.custos.total,             bomQuandoSobe: false },
];

export const CAMPOS_SERIE = CAMPOS_HISTORICO.map(({ chave, rotulo, bomQuandoSobe }) => ({ chave, rotulo, bomQuandoSobe }));

export function valorDaSerie(c: Consolidado, chave: string): number {
  return CAMPOS_HISTORICO.find((x) => x.chave === chave)?.pega(c) ?? 0;
}

export function variacoes(agora: Consolidado, antes: Consolidado | null): Variacao[] {
  if (!antes) return [];
  return CAMPOS_HISTORICO
    .map((c) => ({ chave: c.chave, rotulo: c.rotulo, antes: c.pega(antes), agora: c.pega(agora), delta: c.pega(agora) - c.pega(antes), bomQuandoSobe: c.bomQuandoSobe }))
    .filter((v) => v.delta !== 0);
}

// ── O que a rota devolve pra tela ────────────────────────────────────────────
// Tipos puros aqui (e não em `contingencia.ts`) porque a tela client importa o
// formato da resposta, e o módulo de dados puxa o Supabase junto.

export interface Snapshot { dia: string; dados: Consolidado; origem: string; autorNome: string | null; atualizadoEm: string }

export interface Painel {
  consolidado: Consolidado;
  /** Todos os ativos do aquecimento (número, BM, conta). */
  ativos: Ativo[];
  celulares: Celular[];
  proxies: Proxy[];
  custos: Custo[];
  pendencias: PendenciaOperacional[];
  limites: Limites;
  ultimoSnapshot: { dia: string; atualizadoEm: string; autorNome: string | null; origem: string } | null;
  /** Último snapshot de um dia anterior a hoje — a base do "comparado com". */
  anterior: Consolidado | null;
  /** SQL da contingência ainda não rodado. */
  sqlPendente: boolean;
}

// ── Validação ────────────────────────────────────────────────────────────────
// Número negativo e valor que não é número não entram: a tela recusa antes, a
// rota recusa de novo. Devolve `null` em vez de lançar, pra rota responder 422.

export function inteiroNaoNegativo(v: unknown, max = 100_000): number | null {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max || Math.floor(n) !== n) return null;
  return n;
}

export function valorMonetario(v: unknown, max = 10_000_000): number | null {
  const n = typeof v === "string" ? Number(v.replace(/\./g, "").replace(",", ".")) : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}

export function limitesValidos(v: unknown): Limites | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const a = inteiroNaoNegativo(o.reservaAtencao ?? LIMITES_PADRAO.reservaAtencao, 999);
  const c = inteiroNaoNegativo(o.reservaCritico ?? LIMITES_PADRAO.reservaCritico, 999);
  const p = inteiroNaoNegativo(o.protegidosAtencao ?? LIMITES_PADRAO.protegidosAtencao, 999);
  if (a === null || c === null || p === null) return null;
  // Crítico acima de atenção faria o aviso pular direto pro vermelho.
  if (c > a) return null;
  return { reservaAtencao: a, reservaCritico: c, protegidosAtencao: p };
}

export const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ── Data no fuso da operação ─────────────────────────────────────────────────
// O snapshot é POR DIA, e o dia é o de São Paulo: em UTC, salvar às 22h
// gravaria a atualização de hoje na linha de amanhã.
export function hojeSP(agora = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(agora);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}
