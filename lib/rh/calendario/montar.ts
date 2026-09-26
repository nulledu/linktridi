// ── Montagem do ano (pura) ───────────────────────────────────────────────────
// Recebe o que o servidor leu — equipe, fichas, eventos gravados, feriados
// fundidos — e devolve a lista plana de acontecimentos do ano, ordenada por
// dia. É a única função que sabe transformar "linha do banco" em "coisa na
// célula", e por ser pura é onde a regra de recorrência e a de aniversário
// de desligado ficam testáveis sem Supabase.

import type { ColaboradorRh } from "../tipos";
import type { Afastamento, Compensacao } from "@/lib/jornada/tipos";
import { ROTULO_COMPENSACAO, SELO_COMPENSACAO } from "@/lib/jornada/tipos";
import { mesmaDataNoAno } from "./datas";
import { comemorativasBase } from "./feriados-base";
import {
  LABEL_CATEGORIA, LABEL_ESFERA, TIPO_DA_ESFERA,
  type Acontecimento, type EventoRh, type FeriadoRh, type PessoaDoAcontecimento,
} from "./tipos";

export interface FichaMinima { employee_id: string; data_nascimento: string | null }

export interface EntradaDoAno {
  ano: number;
  colaboradores: ColaboradorRh[];
  fichas: FichaMinima[];
  eventos: EventoRh[];
  feriados: FeriadoRh[];
  /** Quem gerencia setores enxerga as datas desativadas (para reativar). */
  verInativos?: boolean;
  /** Férias e atestados do ano, por `employee_id`. Só as FÉRIAS viram
   *  acontecimento: atestado é dado de saúde e tem chave própria — pintá-lo no
   *  calendário do RH mostraria doença pra quem só tem `rh:calendario`. */
  afastamentos?: Map<string, Afastamento[]>;
  /** Pares de compensação do ano, por `employee_id`. */
  compensacoes?: Map<string, Compensacao[]>;
}

const pessoaDe = (c: ColaboradorRh): PessoaDoAcontecimento => ({
  id: c.id, nome: c.nome, foto: c.foto, cargo: c.cargo, setor: c.setor,
});

const ordenar = (a: Acontecimento, b: Acontecimento) =>
  a.dia < b.dia ? -1 : a.dia > b.dia ? 1
  : (a.hora ?? "99") < (b.hora ?? "99") ? -1 : (a.hora ?? "99") > (b.hora ?? "99") ? 1
  : a.titulo.localeCompare(b.titulo, "pt-BR");

/**
 * O evento gravado ocorre neste ano? Devolve o dia da ocorrência ou null.
 * "Anual" repete a partir do primeiro ano (nunca antes de ter sido criado —
 * o "Dia da Produção" cadastrado para 2026 não aparece em 2024).
 */
export function ocorrenciaNoAno(e: Pick<EventoRh, "dia" | "recorrencia">, ano: number): string | null {
  const anoOrigem = Number(e.dia.slice(0, 4));
  if (e.recorrencia === "anual") return ano >= anoOrigem ? mesmaDataNoAno(e.dia, ano) : null;
  return anoOrigem === ano ? e.dia : null;
}

/** Os dias de um intervalo fechado que caem DENTRO do ano. Férias de 28/12 a
 *  10/01 aparecem nos dois anos, cada um com a sua fatia. */
export function diasNoAno(de: string, ate: string, ano: number): string[] {
  const inicio = de > `${ano}-01-01` ? de : `${ano}-01-01`;
  const fim = ate < `${ano}-12-31` ? ate : `${ano}-12-31`;
  if (fim < inicio) return [];
  const out: string[] = [];
  for (let t = Date.parse(`${inicio}T00:00:00Z`); t <= Date.parse(`${fim}T00:00:00Z`); t += 864e5) {
    out.push(new Date(t).toISOString().slice(0, 10));
    if (out.length > 366) break;   // teto de sanidade: um ano não tem mais que isso
  }
  return out;
}

export function montarAno({ ano, colaboradores, fichas, eventos, feriados, verInativos, afastamentos, compensacoes }: EntradaDoAno): Acontecimento[] {
  const out: Acontecimento[] = [];
  const porId = new Map(colaboradores.map((c) => [c.id, c]));

  // Aniversários — só de quem está na empresa. Desligado sai: mostrar o
  // aniversário dele como se fosse ativo é a regra que o pedido proíbe.
  const nascimento = new Map(fichas.map((f) => [f.employee_id, f.data_nascimento]));
  for (const c of colaboradores) {
    if (c.situacao === "desligado") continue;
    const nasc = nascimento.get(c.id);
    if (!nasc) continue;
    const dia = mesmaDataNoAno(nasc, ano);
    out.push({
      chave: `aniversario:${c.id}:${dia}`, tipo: "aniversario", dia,
      titulo: c.nome, sub: ["Aniversário", c.setor].filter(Boolean).join(" · "),
      setor: c.setor, hora: null, hora_fim: null, descricao: null, observacoes: null,
      pessoa: pessoaDe(c), envolvidos: [], origem: "ficha", id: null, recorrencia: "anual",
      categoria: null, inativo: false,
    });
  }

  // Feriados — já fundidos por `fundirFeriados`.
  for (const f of feriados) {
    if (f.dia.slice(0, 4) !== String(ano)) continue;
    const tipo = TIPO_DA_ESFERA[f.esfera];
    out.push({
      chave: `${tipo}:${f.id ?? f.origem}:${f.dia}:${f.nome}`, tipo, dia: f.dia,
      titulo: f.nome,
      sub: `${LABEL_ESFERA[f.esfera]}${f.facultativo ? " · ponto facultativo" : ""}`,
      setor: null, hora: null, hora_fim: null, descricao: null, observacoes: null,
      pessoa: null, envolvidos: [], origem: f.origem, id: f.id ?? null, recorrencia: null,
      categoria: null, inativo: false,
    });
  }

  // Comemorativas do piso — as próprias vêm da tabela, logo abaixo.
  for (const c of comemorativasBase(ano)) {
    out.push({
      chave: `comemorativa:base:${c.dia}:${c.nome}`, tipo: "comemorativa", dia: c.dia,
      titulo: c.nome, sub: "Data comemorativa", setor: null, hora: null, hora_fim: null,
      descricao: null, observacoes: null, pessoa: null, envolvidos: [], origem: "base",
      id: null, recorrencia: "anual", categoria: null, inativo: false,
    });
  }

  // Eventos gravados: evento interno, data de setor, comemorativa própria.
  for (const e of eventos) {
    if (!e.ativo && !(verInativos && e.tipo === "setor")) continue;
    const dia = ocorrenciaNoAno(e, ano);
    if (!dia) continue;
    const envolvidos = e.colaboradores.map((id) => porId.get(id)).filter((c): c is ColaboradorRh => !!c).map(pessoaDe);
    const sub =
      e.tipo === "setor" ? (e.setor ?? "Setor") :
      e.tipo === "comemorativa" ? "Data comemorativa" :
      [e.categoria ? LABEL_CATEGORIA[e.categoria] : "Evento", e.setor].filter(Boolean).join(" · ");
    out.push({
      chave: `${e.tipo}:${e.id}:${dia}`, tipo: e.tipo, dia,
      titulo: e.nome, sub, setor: e.setor, hora: e.hora, hora_fim: e.hora_fim,
      descricao: e.descricao, observacoes: e.observacoes, pessoa: null, envolvidos,
      origem: "manual", id: e.id, recorrencia: e.recorrencia, categoria: e.categoria,
      inativo: !e.ativo,
    });
  }

  // ── As três camadas de PESSOA ──────────────────────────────────────────────
  // Nascem desligadas na legenda (ver `TIPOS_DE_PESSOA`) e acendem quando o
  // filtro escolhe alguém. Sem isso, uma empresa de 50 pessoas encheria toda
  // célula de setembro com "Fulano de férias".
  const diasDeFeriado = new Set(feriados.filter((f) => f.dia.slice(0, 4) === String(ano)).map((f) => f.dia));

  for (const [employeeId, lista] of afastamentos ?? []) {
    const c = porId.get(employeeId);
    if (!c) continue;
    for (const a of lista) {
      if (a.tipo !== "ferias") continue;   // atestado é dado de saúde: não entra
      for (const dia of diasNoAno(a.de, a.ate, ano)) {
        out.push({
          chave: `ferias:${a.id}:${dia}`, tipo: "ferias", dia,
          titulo: c.nome, sub: ["Férias", a.situacao].filter(Boolean).join(" · "),
          setor: c.setor, hora: null, hora_fim: null,
          descricao: `Férias de ${brDia(a.de)} a ${brDia(a.ate)}`, observacoes: null,
          pessoa: pessoaDe(c), envolvidos: [], origem: "ficha", id: a.id,
          recorrencia: null, categoria: null, inativo: false,
        });
      }
    }
  }

  for (const [employeeId, lista] of compensacoes ?? []) {
    const c = porId.get(employeeId);
    if (!c) continue;
    for (const comp of lista) {
      const selo = SELO_COMPENSACAO[comp.status].label;
      // O dia de FOLGA — o que o RH procura quando pergunta "qual dia foi usado
      // como compensação".
      if (comp.diaFolga.slice(0, 4) === String(ano)) {
        out.push({
          chave: `folga:${comp.id}:${comp.diaFolga}`, tipo: "folga_compensatoria", dia: comp.diaFolga,
          titulo: c.nome, sub: `${ROTULO_COMPENSACAO[comp.tipo].label} · ${selo}`,
          setor: c.setor, hora: null, hora_fim: null,
          descricao: `Folga referente a ${brDia(comp.diaOrigem)} · ${horas(comp.minutos)}`,
          observacoes: comp.observacao,
          pessoa: pessoaDe(c), envolvidos: [], origem: "ponto", id: comp.id,
          recorrencia: null, categoria: null, inativo: comp.status !== "aprovada",
        });
      }
      // O dia TRABALHADO. Só se chama "feriado trabalhado" quando o dia é mesmo
      // feriado; um sábado esticado devolvido em folga é outra coisa, e o
      // rótulo diz qual.
      if (comp.diaOrigem.slice(0, 4) === String(ano)) {
        const ehFeriadoDoDia = diasDeFeriado.has(comp.diaOrigem);
        out.push({
          chave: `trabalhado:${comp.id}:${comp.diaOrigem}`, tipo: "feriado_trabalhado", dia: comp.diaOrigem,
          titulo: c.nome,
          sub: `${ehFeriadoDoDia ? "Trabalhou no feriado" : "Dia trabalhado a mais"} · ${selo}`,
          setor: c.setor, hora: null, hora_fim: null,
          descricao: `Compensado com folga em ${brDia(comp.diaFolga)} · ${horas(comp.minutos)}`,
          observacoes: comp.observacao,
          pessoa: pessoaDe(c), envolvidos: [], origem: "ponto", id: comp.id,
          recorrencia: null, categoria: null, inativo: comp.status !== "aprovada",
        });
      }
    }
  }

  return out.sort(ordenar);
}

/** "15/09" a partir do ISO, sem `Date` (fuso não entra na conta). */
const brDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const horas = (min: number) => (min % 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${Math.floor(min / 60)}h`);

// ── Filtro (puro, compartilhado com a tela) ─────────────────────────────────

export interface FiltroCalendario {
  tipos: Acontecimento["tipo"][];
  setor: string;
  pessoa: string;
}

export function filtrar(lista: Acontecimento[], f: FiltroCalendario): Acontecimento[] {
  return lista.filter((a) => {
    if (!f.tipos.includes(a.tipo)) return false;
    if (f.setor && a.setor !== f.setor && !a.envolvidos.some((p) => p.setor === f.setor)) return false;
    if (f.pessoa && a.pessoa?.id !== f.pessoa && !a.envolvidos.some((p) => p.id === f.pessoa)) return false;
    return true;
  });
}

/** Os próximos `n` a partir de hoje (inclusive), em ordem. */
export function proximos(lista: Acontecimento[], hoje: string, n = 8): Acontecimento[] {
  return lista.filter((a) => a.dia >= hoje && !a.inativo).slice(0, n);
}

export function doDia(lista: Acontecimento[], dia: string): Acontecimento[] {
  return lista.filter((a) => a.dia === dia);
}
