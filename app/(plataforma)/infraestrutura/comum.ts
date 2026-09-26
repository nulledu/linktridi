// Miúdos compartilhados entre Domínios e Hospedagens.

export const moeda = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "aaaa-mm-dd" → "dd/mm/aa". Sem `new Date(iso)` de propósito: data pura
 *  interpretada como UTC volta um dia no fuso de São Paulo. */
export const dataBR = (iso: string | null) => {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
};

/** Dias até a data (negativo = já passou), contando em dias de calendário
 *  locais — mesma razão do dataBR: nada de UTC deslocando o dia. */
export const diasAte = (iso: string | null): number | null => {
  if (!iso) return null;
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(a, m - 1, d).getTime();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje.getTime()) / 86_400_000);
};
