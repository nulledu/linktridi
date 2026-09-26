// ── Fusão das camadas de feriado (pura) ──────────────────────────────────────
// Quatro origens chegam aqui: o piso calculado (`base`), a fonte externa
// (`api`), o cadastro manual (`manual`) e o que o Ponto já mantém em
// `ponto_feriados` (`ponto`). A regra de quem ganha, por dia+esfera:
//
//   manual > api > ponto > base
//
// Manual ganha de tudo porque é a correção humana — se a fonte externa
// trouxe "Confraternização mundial" e o RH prefere "Confraternização
// Universal", a preferência fica. A base perde de todos porque é o chute
// informado: certo quase sempre, mas sem saber de decreto novo.

import { feriadosBase } from "./feriados-base";
import type { Esfera, FeriadoRh } from "./tipos";

const PESO: Record<FeriadoRh["origem"], number> = { manual: 4, api: 3, ponto: 2, base: 1 };

/**
 * Feriados do Ponto não têm esfera: a tabela nasceu antes deste calendário.
 * Inferência: bate com um feriado nacional/estadual do piso no mesmo dia →
 * é aquele; senão é municipal — quem cadastra à mão um dia que não é nem
 * nacional nem estadual está cadastrando o local.
 */
export function esferaInferida(dia: string, ano: number): Esfera {
  const base = feriadosBase(ano).find((f) => f.dia === dia);
  return base ? base.esfera : "municipal";
}

export function fundirFeriados(camadas: FeriadoRh[][]): FeriadoRh[] {
  const porChave = new Map<string, FeriadoRh>();
  for (const camada of camadas) {
    for (const f of camada) {
      const chave = `${f.dia}|${f.esfera}`;
      const atual = porChave.get(chave);
      if (!atual || PESO[f.origem] > PESO[atual.origem]) porChave.set(chave, f);
    }
  }
  return [...porChave.values()].sort((a, b) =>
    a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : ordemEsfera(a.esfera) - ordemEsfera(b.esfera),
  );
}

const ordemEsfera = (e: Esfera) => (e === "nacional" ? 0 : e === "estadual" ? 1 : 2);
