// ── Marketing · Aquecimento — núcleo puro ────────────────────────────────────
// Sem `next/headers` e sem Supabase de propósito: a tela client importa daqui.
// Tudo o que decide alguma coisa (ritmo, congelamento, fila do dia) mora neste
// arquivo justamente pra poder ser testado sem banco — é a regra do módulo, não
// um detalhe de layout.

export type TipoAtivo = "bm" | "conta" | "numero";

export type StatusAtivo =
  | "novo" | "aquecendo" | "aquecido" | "em_uso" | "restrito" | "banido" | "aposentado";

// Cor SEMPRE por token semântico do `globals.css` — nunca hex na mão. Token tem
// valor calibrado nos dois temas; hex tem o valor do tema em que foi escrito, e
// no outro o número some da tela. Há teste que quebra o build por isso
// (`paleta-por-tema.test.ts`).
export const STATUS: { key: StatusAtivo; label: string; cor: string }[] = [
  { key: "novo",       label: "Novo",           cor: "var(--info)" },
  { key: "aquecendo",  label: "Em aquecimento", cor: "var(--atencao)" },
  { key: "aquecido",   label: "Aquecido",       cor: "var(--ok)" },
  { key: "em_uso",     label: "Em uso",         cor: "var(--azul)" },
  { key: "restrito",   label: "Restrito",       cor: "var(--perigo)" },
  { key: "banido",     label: "Banido",         cor: "var(--perigo-forte)" },
  { key: "aposentado", label: "Aposentado",     cor: "var(--neutro)" },
];

export const rotuloStatus = (s: StatusAtivo) => STATUS.find((x) => x.key === s)?.label ?? s;
export const corStatus = (s: StatusAtivo) => STATUS.find((x) => x.key === s)?.cor ?? "var(--text-dim)";

/** Status que CONGELAM o roteiro. Um ativo restrito ou banido não está atrasado:
 *  está parado. Sem isso ele grita "12 dias atrasado" pra sempre e o bloco "Fora
 *  do prazo" vira ruído — alerta que sempre aparece é alerta que não existe. */
export const CONGELA: StatusAtivo[] = ["restrito", "banido", "aposentado"];
export const congelado = (s: StatusAtivo) => CONGELA.includes(s);

/** Status em que o ativo AINDA está sendo aquecido — os únicos que entram na
 *  fila de trabalho do dia.
 *
 *  `aquecido` e `em_uso` não estão aqui de propósito. Quem terminou o
 *  aquecimento e deixou a última etapa sem marcar (o caso normal: a pessoa muda
 *  o status e considera encerrado) ficaria cobrando essa etapa TODO DIA, para
 *  sempre, sem que ninguém jamais fosse fazê-la. Uma fila que pede o
 *  impossível é uma fila que se aprende a ignorar — e aí ela deixa de proteger
 *  os ativos que de fato estão atrasados. */
export const EM_AQUECIMENTO: StatusAtivo[] = ["novo", "aquecendo"];
export const emAquecimento = (s: StatusAtivo) => EM_AQUECIMENTO.includes(s);

export const TIPOS: { key: TipoAtivo; label: string; icone: string }[] = [
  { key: "bm",     label: "BM",              icone: "briefcase" },
  { key: "conta",  label: "Conta de anúncio", icone: "credit-card" },
  { key: "numero", label: "Número",           icone: "device-mobile" },
];

export interface Etapa {
  id: string; roteiroId: string; ordem: number; dia: number;
  titulo: string; detalhe: string | null; removidaEm: string | null;
}

export interface Roteiro {
  id: string; nome: string; tipo: TipoAtivo; ativo: boolean; etapas: Etapa[];
}

export interface Marco {
  id: string; ativoId: string; etapaId: string; feitoEm: string;
  autorId: string | null; autorNome: string | null;
}

export interface Evento {
  id: string; ativoId: string; tipo: "nota" | "etapa" | "status" | "criacao";
  texto: string | null; statusAntes: StatusAtivo | null; statusDepois: StatusAtivo | null;
  etapaId: string | null; autorNome: string | null; createdAt: string;
}

export interface Ativo {
  id: string; tipo: TipoAtivo; nome: string; identificador: string | null;
  paiId: string | null; status: StatusAtivo; roteiroId: string | null;
  iniciadoEm: string; pausadoEm: string | null;
  responsavelId: string | null; responsavelNome: string | null;
  /** Foto de perfil de quem responde (vem de `employees.photo_url`, casada pelo
   *  `responsavel_id`). Opcional em toda tela: quem não tem foto cai nas
   *  iniciais, e ativo com responsável só no NOME (digitado à mão, sem id)
   *  nunca terá — por isso ninguém pode depender dela pra desenhar a linha. */
  responsavelFoto: string | null;
  aparelho: string | null; operadora: string | null; obs: string | null;
}

/** A ficha do aparelho físico — a foto e onde ele está.
 *
 *  Não substitui `Ativo.aparelho`: quem agrupa a visão WhatsApp continua sendo
 *  aquele TEXTO, e esta ficha se encaixa nele por igualdade de `nome`. Toda a
 *  tela funciona sem nenhuma ficha (cai na ilustração), porque a tabela é
 *  opcional — ver `supabase/marketing_aquecimento_aparelho.sql`. */
export interface Aparelho {
  nome: string;
  modelo: string | null;
  fotoUrl: string | null;
  lugar: string | null;
  obs: string | null;
}

// ── Datas ────────────────────────────────────────────────────────────────────
// Tudo em "YYYY-MM-DD" e tudo em UTC. Usar o fuso local aqui faz o dia virar
// antes ou depois da hora dependendo de quem abre a tela, e "venceu ontem" passa
// a depender de onde a pessoa está — que é a última coisa que se quer num prazo.

const MS_DIA = 86_400_000;

export function emDias(iso: string): number {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(a, (m ?? 1) - 1, d ?? 1) / MS_DIA);
}

export function somaDias(iso: string, n: number): string {
  return new Date((emDias(iso) + n) * MS_DIA).toISOString().slice(0, 10);
}

/** `ate - de`, em dias. Positivo = `ate` é mais tarde. */
export const diffDias = (de: string, ate: string) => emDias(ate) - emDias(de);

export const hojeISO = () => new Date().toISOString().slice(0, 10);

// ── Ritmo ────────────────────────────────────────────────────────────────────
// Progresso não é risco. O que derruba conta e chip não é ir devagar — é ir
// RÁPIDO DEMAIS, cumprindo em 4 dias um roteiro pensado pra 12. Nenhuma planilha
// mede isso, e é o motivo desta tela valer mais que uma planilha.

export type EstadoRitmo = "no_ritmo" | "atrasado" | "apressado" | "pausado";

/** Abaixo disso é ruído de rotina (fim de semana, feriado), não desvio de ritmo. */
export const LIMIAR_RITMO = 2;

export const RITMO: Record<EstadoRitmo, { label: string; cor: string }> = {
  no_ritmo:  { label: "No ritmo",  cor: "var(--ok)" },
  atrasado:  { label: "Atrasado",  cor: "var(--atencao)" },
  // Rosa e não vermelho de propósito: "apressado" não é um problema acontecendo,
  // é um problema sendo criado. Dividir a cor com `restrito` faria a tela dizer
  // que os dois são a mesma coisa — e o apressado é justamente o que ainda dá
  // pra evitar.
  apressado: { label: "Apressado", cor: "var(--rosa)" },
  pausado:   { label: "Pausado",   cor: "var(--neutro)" },
};

export interface Ritmo {
  estado: EstadoRitmo;
  /** Dias de desvio da ÚLTIMA etapa cumprida. Negativo = adiantado. */
  desvio: number;
  /** Quantas etapas foram cumpridas antes do dia previsto. */
  apressadas: number;
}

/** Desvio da última etapa cumprida — e não a soma de todas.
 *
 *  Cinco etapas um dia adiantadas cada não deixam o ativo cinco dias à frente:
 *  deixam UM. O que importa é onde ele está no calendário agora, que é
 *  exatamente o desvio do marco mais recente. Somar inflaria o alarme até todo
 *  ativo saudável aparecer como "apressado". */
export function ritmoDe(ativo: Ativo, etapas: Etapa[], marcos: Marco[]): Ritmo {
  if (congelado(ativo.status)) return { estado: "pausado", desvio: 0, apressadas: 0 };

  const porEtapa = new Map(etapas.map((e) => [e.id, e]));
  const feitos = marcos
    .filter((m) => porEtapa.has(m.etapaId))
    .map((m) => ({ m, e: porEtapa.get(m.etapaId)!, desvio: diffDias(somaDias(ativo.iniciadoEm, porEtapa.get(m.etapaId)!.dia), m.feitoEm) }))
    .sort((a, b) => a.e.dia - b.e.dia);

  const apressadas = feitos.filter((f) => f.desvio < 0).length;
  if (!feitos.length) return { estado: "no_ritmo", desvio: 0, apressadas: 0 };

  const desvio = feitos[feitos.length - 1].desvio;
  if (desvio <= -LIMIAR_RITMO) return { estado: "apressado", desvio, apressadas };
  if (desvio >= LIMIAR_RITMO) return { estado: "atrasado", desvio, apressadas };
  return { estado: "no_ritmo", desvio, apressadas };
}

// ── Pendências ───────────────────────────────────────────────────────────────

export interface Pendencia {
  etapa: Etapa;
  /** Dia em que a etapa vence, já com o congelamento aplicado. */
  venceEm: string;
  /** Dias de atraso. 0 = vence hoje. Negativo = ainda vai vencer. */
  atraso: number;
}

/** Etapas que faltam, com o prazo de cada uma.
 *
 *  `pausadoEm` congela a régua: o prazo de um ativo restrito para de correr no dia
 *  em que ele foi restrito. Senão o atraso cresce sozinho até o fim dos tempos. */
export function pendenciasDe(
  ativo: Ativo, etapas: Etapa[], marcos: Marco[], hoje = hojeISO(),
): Pendencia[] {
  const feitas = new Set(marcos.map((m) => m.etapaId));
  const referencia = ativo.pausadoEm && congelado(ativo.status) ? ativo.pausadoEm : hoje;
  return etapas
    .filter((e) => !e.removidaEm && !feitas.has(e.id))
    .map((e) => {
      const venceEm = somaDias(ativo.iniciadoEm, e.dia);
      return { etapa: e, venceEm, atraso: diffDias(venceEm, referencia) };
    })
    .sort((a, b) => a.etapa.dia - b.etapa.dia);
}

/** Só o que já venceu (hoje inclusive). É a fila de trabalho do dia. */
export const vencidas = (p: Pendencia[]) => p.filter((x) => x.atraso >= 0);

export function progressoDe(etapas: Etapa[], marcos: Marco[]) {
  const vivas = etapas.filter((e) => !e.removidaEm);
  const feitas = new Set(marcos.map((m) => m.etapaId));
  const feito = vivas.filter((e) => feitas.has(e.id)).length;
  return { feito, total: vivas.length, fracao: vivas.length ? feito / vivas.length : 0 };
}

// ── Fila do dia ──────────────────────────────────────────────────────────────
// Agrupa POR ETAPA, não por ativo: seis chips no mesmo "dia 7 — 20 conversas" é
// uma ação só, e uma linha só. Agrupar por ativo obrigaria a abrir seis gavetas
// pra fazer seis vezes a mesma coisa.

export interface ItemFila {
  chave: string;            // roteiroId + etapaId — a etapa é a mesma pra todos
  titulo: string;
  dia: number;
  venceEm: string;
  atraso: number;           // do mais atrasado do grupo
  alvos: { ativo: Ativo; etapaId: string }[];
}

export function filaDoDia(
  ativos: Ativo[],
  etapasPorRoteiro: Map<string, Etapa[]>,
  marcosPorAtivo: Map<string, Marco[]>,
  hoje = hojeISO(),
): ItemFila[] {
  const grupos = new Map<string, ItemFila>();
  for (const a of ativos) {
    if (!emAquecimento(a.status) || !a.roteiroId) continue;
    const etapas = etapasPorRoteiro.get(a.roteiroId) ?? [];
    for (const p of vencidas(pendenciasDe(a, etapas, marcosPorAtivo.get(a.id) ?? [], hoje))) {
      const chave = `${a.roteiroId}:${p.etapa.id}`;
      const g = grupos.get(chave);
      if (g) {
        g.alvos.push({ ativo: a, etapaId: p.etapa.id });
        if (p.atraso > g.atraso) g.atraso = p.atraso;
      } else {
        grupos.set(chave, {
          chave, titulo: p.etapa.titulo, dia: p.etapa.dia,
          venceEm: p.venceEm, atraso: p.atraso,
          alvos: [{ ativo: a, etapaId: p.etapa.id }],
        });
      }
    }
  }
  // Mais atrasado primeiro; empate desempata pela etapa mais antiga do roteiro.
  return [...grupos.values()].sort((x, y) => y.atraso - x.atraso || x.dia - y.dia);
}

/** Ativos que merecem olhada mesmo sem etapa vencendo hoje. */
export function emRisco(
  ativos: Ativo[], etapasPorRoteiro: Map<string, Etapa[]>, marcosPorAtivo: Map<string, Marco[]>,
): { ativo: Ativo; ritmo: Ritmo }[] {
  return ativos
    .map((a) => ({ ativo: a, ritmo: ritmoDe(a, etapasPorRoteiro.get(a.roteiroId ?? "") ?? [], marcosPorAtivo.get(a.id) ?? []) }))
    .filter((x) => x.ritmo.estado === "apressado" || x.ativo.status === "restrito")
    .sort((x, y) => x.ritmo.desvio - y.ritmo.desvio);
}

// ── Sobrevivência do roteiro ─────────────────────────────────────────────────
// O que transforma cadastro em aprendizado: depois de N ativos, qual roteiro
// realmente sobrevive? Sai de um group by, sem tabela nova.

export interface Sobrevivencia {
  total: number; aquecidos: number; banidos: number;
  taxaAquecido: number; taxaBanido: number;
  /** Duração real média, em dias, dos que chegaram ao fim. */
  duracaoMedia: number | null;
}

export function sobrevivenciaDe(
  roteiroId: string, ativos: Ativo[], marcosPorAtivo: Map<string, Marco[]>,
): Sobrevivencia {
  const meus = ativos.filter((a) => a.roteiroId === roteiroId);
  const total = meus.length;
  const chegou = (a: Ativo) => a.status === "aquecido" || a.status === "em_uso";
  const aquecidos = meus.filter(chegou).length;
  const banidos = meus.filter((a) => a.status === "banido").length;

  const duracoes = meus.filter(chegou).map((a) => {
    const ms = marcosPorAtivo.get(a.id) ?? [];
    if (!ms.length) return null;
    const ultimo = ms.reduce((x, y) => (emDias(y.feitoEm) > emDias(x.feitoEm) ? y : x));
    return diffDias(a.iniciadoEm, ultimo.feitoEm);
  }).filter((d): d is number => d !== null);

  return {
    total, aquecidos, banidos,
    taxaAquecido: total ? aquecidos / total : 0,
    taxaBanido: total ? banidos / total : 0,
    duracaoMedia: duracoes.length
      ? Math.round(duracoes.reduce((a, b) => a + b, 0) / duracoes.length)
      : null,
  };
}

// ── Resumo de um bloco do inventário ─────────────────────────────────────────
// O inventário virou bloco (um aparelho, uma BM), e bloco precisa dizer em uma
// linha o que a lista dizia em N. Mora aqui, e não na tela, pelo mesmo motivo
// que o ritmo: é regra — decide o que a pessoa olha primeiro — e regra tem que
// caber num teste sem banco.

/** Ordem de GRAVIDADE, do que pede olho agora ao que já está resolvido.
 *
 *  `aposentado` fica por último de propósito, embora congele o prazo igual a
 *  `restrito`: aparelho aposentado é decisão tomada, não problema aberto. Se ele
 *  liderasse, todo celular na gaveta pintaria o bloco de cinza e esconderia o
 *  chip banido que ainda mora nele. */
export const GRAVIDADE: StatusAtivo[] =
  ["banido", "restrito", "aquecendo", "novo", "em_uso", "aquecido", "aposentado"];

export function piorStatus(status: StatusAtivo[]): StatusAtivo | null {
  let pior: StatusAtivo | null = null;
  for (const s of status) {
    if (pior === null || GRAVIDADE.indexOf(s) < GRAVIDADE.indexOf(pior)) pior = s;
  }
  return pior;
}

export interface ResumoGrupo {
  total: number;
  /** Ainda em aquecimento (novo + aquecendo). */
  aquecendo: number;
  /** Terminou o aquecimento (aquecido + em uso) — o que o roteiro produziu. */
  prontos: number;
  /** Restrito + banido: o que o aquecimento perdeu pelo caminho. */
  caidos: number;
  /** Etapas já vencidas somadas — o trabalho parado neste bloco HOJE. */
  vencendo: number;
  /** Ativos com ritmo apressado: o padrão que costuma anteceder o bloqueio. */
  apressados: number;
  pior: StatusAtivo | null;
  /** Progresso médio de quem ainda está aquecendo. Quem terminou sai da média:
   *  senão um aparelho com cinco chips prontos e um recém-nascido mostraria 90%
   *  e esconderia justamente o único que dá trabalho. */
  fracao: number;
}

export function resumoGrupo(
  filhos: Ativo[],
  etapasPorRoteiro: Map<string, Etapa[]>,
  marcosPorAtivo: Map<string, Marco[]>,
  hoje = hojeISO(),
): ResumoGrupo {
  let vencendo = 0, apressados = 0;
  const fracoes: number[] = [];

  for (const a of filhos) {
    const etapas = etapasPorRoteiro.get(a.roteiroId ?? "") ?? [];
    const marcos = marcosPorAtivo.get(a.id) ?? [];
    if (emAquecimento(a.status)) {
      vencendo += vencidas(pendenciasDe(a, etapas, marcos, hoje)).length;
      if (etapas.length) fracoes.push(progressoDe(etapas, marcos).fracao);
    }
    if (ritmoDe(a, etapas, marcos).estado === "apressado") apressados++;
  }

  return {
    total: filhos.length,
    aquecendo: filhos.filter((a) => emAquecimento(a.status)).length,
    prontos: filhos.filter((a) => a.status === "aquecido" || a.status === "em_uso").length,
    caidos: filhos.filter((a) => a.status === "restrito" || a.status === "banido").length,
    vencendo, apressados,
    pior: piorStatus(filhos.map((a) => a.status)),
    fracao: fracoes.length ? fracoes.reduce((x, y) => x + y, 0) / fracoes.length : 0,
  };
}
