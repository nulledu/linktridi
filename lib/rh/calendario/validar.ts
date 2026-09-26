// ── Validação do corpo de um evento (pura) ───────────────────────────────────
// Compartilhada pelas rotas de eventos e de setores: o formulário é o mesmo,
// só a chave que abre a porta muda. Devolve a linha pronta para gravar ou a
// mensagem que a tela mostra — em português e dizendo O QUE corrigir.

import { ehDiaISO, ehHora } from "./datas";
import {
  ehCategoriaEvento, ehRecorrencia, ehTipoGravado,
  type CategoriaEvento, type Recorrencia, type TipoGravado,
} from "./tipos";

export interface LinhaParaGravar {
  tipo: TipoGravado;
  categoria: CategoriaEvento | null;
  nome: string;
  descricao: string | null;
  observacoes: string | null;
  dia: string;
  hora: string | null;
  hora_fim: string | null;
  setor: string | null;
  colaboradores: string[];
  recorrencia: Recorrencia;
  ativo: boolean;
}

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `tiposAceitos` é o que a ROTA deixa gravar: a de setores só aceita `setor`,
 * a de eventos aceita `evento` e `comemorativa`. Sem isso, quem tem a chave
 * de datas do setor criaria evento interno pela rota errada.
 */
export function validarEvento(
  corpo: Record<string, unknown>,
  tiposAceitos: readonly TipoGravado[],
): { ok: true; linha: LinhaParaGravar } | { ok: false; erro: string } {
  const tipo = corpo.tipo;
  if (!ehTipoGravado(tipo)) return { ok: false, erro: "Tipo inválido." };
  if (!tiposAceitos.includes(tipo)) return { ok: false, erro: "Este tipo não é gravado por esta rota." };

  const nome = texto(corpo.nome, 120);
  if (!nome) return { ok: false, erro: "Dê um nome ao evento." };

  const dia = corpo.dia;
  if (!ehDiaISO(dia)) return { ok: false, erro: "Informe a data (dia, mês e ano)." };

  const hora = corpo.hora == null || corpo.hora === "" ? null : corpo.hora;
  if (hora !== null && !ehHora(hora)) return { ok: false, erro: "Horário inválido — use HH:MM." };
  const horaFim = corpo.hora_fim == null || corpo.hora_fim === "" ? null : corpo.hora_fim;
  if (horaFim !== null && !ehHora(horaFim)) return { ok: false, erro: "Horário de término inválido — use HH:MM." };
  if (hora && horaFim && horaFim <= hora) return { ok: false, erro: "O término precisa ser depois do início." };

  const setor = texto(corpo.setor, 60);
  if (tipo === "setor" && !setor) return { ok: false, erro: "Data de setor precisa de um setor." };

  let categoria: CategoriaEvento | null = null;
  if (tipo === "evento") {
    if (!ehCategoriaEvento(corpo.categoria)) return { ok: false, erro: "Escolha o tipo do evento." };
    categoria = corpo.categoria;
  }

  const recorrencia: Recorrencia = ehRecorrencia(corpo.recorrencia) ? corpo.recorrencia : (tipo === "setor" ? "anual" : "nenhuma");

  const colaboradores = Array.isArray(corpo.colaboradores)
    ? [...new Set(corpo.colaboradores.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)))].slice(0, 200)
    : [];

  return {
    ok: true,
    linha: {
      tipo, categoria, nome,
      descricao: texto(corpo.descricao, 2000),
      observacoes: texto(corpo.observacoes, 2000),
      dia, hora: hora as string | null, hora_fim: horaFim as string | null,
      setor, colaboradores, recorrencia,
      ativo: typeof corpo.ativo === "boolean" ? corpo.ativo : true,
    },
  };
}
