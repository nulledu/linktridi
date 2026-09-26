// ── Detalhes silenciosos do GAIUS ────────────────────────────────────────────
// Não são "conquistas", não pontuam, não desbloqueiam nada e não mudam nenhuma
// funcionalidade. São frases curtas que aparecem, respiram e somem — do mesmo
// jeito que a marca no canto da tela de login: parte da identidade, não brinde.
//
// Valores que sustentam cada frase: simplicidade, preservação, conhecimento,
// constância, futuro e ordem. Latim com tradução curta, sempre discreto.

export interface Egg {
  /** Rótulo pequeno em maiúsculas (contexto). */
  titulo: string;
  /** A frase em si — curta. */
  frase: string;
  /** Tradução/leitura em português, menor ainda. */
  nota: string;
}

/** Coordenadas do Svalbard Global Seed Vault, em Longyearbyen. */
export const SVALBARD = { lat: 78.2232, lon: 15.6469, rotulo: "78.2232° N, 15.6469° E" };

/** Primeiro commit do sistema — a data de nascimento do GAIUS. */
export const NASCIMENTO = { mes: 6, dia: 13, ano: 2026 };

export const EGG_SVALBARD: Egg = {
  titulo: "Svalbard Global Seed Vault",
  frase: "Quod servatur, crescit.",
  nota: "o que se guarda volta a crescer",
};

export const EGG_NOME: Egg = {
  titulo: "Gaius",
  frase: "Simplex sigillum veri.",
  nota: "o simples é o selo do verdadeiro",
};

export const EGG_MEIA_NOITE: Egg = {
  titulo: "00:00",
  frase: "Nox custodit.",
  nota: "a noite guarda o que o dia construiu",
};

export function eggAniversario(anos: number): Egg {
  return {
    titulo: anos === 1 ? "Um ano de GAIUS" : `${anos} anos de GAIUS`,
    frase: "Constantia vincit.",
    nota: "a constância vence",
  };
}

export function eggMarco(n: number, oQue: string): Egg {
  return {
    titulo: `${n.toLocaleString("pt-BR")} ${oQue}`,
    frase: "Paulatim, sed constanter.",
    nota: "pouco a pouco, mas sem parar",
  };
}

// ── Momento ──────────────────────────────────────────────────────────────────

/** Anos completos desde o primeiro commit (só no dia exato do aniversário). */
export function anosDeSistema(d: Date): number | null {
  if (d.getMonth() + 1 !== NASCIMENTO.mes || d.getDate() !== NASCIMENTO.dia) return null;
  const anos = d.getFullYear() - NASCIMENTO.ano;
  return anos >= 1 ? anos : null;
}

/**
 * A frase do momento, se houver alguma. Aniversário tem precedência sobre a
 * virada do dia; fora dessas janelas volta `null` — que é o caso quase sempre.
 */
export function eggDoMomento(agora: Date = new Date()): Egg | null {
  const anos = anosDeSistema(agora);
  if (anos) return eggAniversario(anos);
  // Janela estreita da virada: dos 00:00 aos 00:04.
  if (agora.getHours() === 0 && agora.getMinutes() < 5) return EGG_MEIA_NOITE;
  return null;
}

/** Digitou o nome do sistema num campo de busca. */
export function ehONome(texto: string): boolean {
  return texto.trim().toLowerCase() === "gaius";
}

// ── Marcos ───────────────────────────────────────────────────────────────────

const MARCOS = [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000];

/** O maior marco redondo já alcançado por `total` (ou `null`). */
export function marcoAlcancado(total: number): number | null {
  let m: number | null = null;
  for (const n of MARCOS) if (total >= n) m = n;
  return m;
}

// ── Memória (nunca repete o mesmo detalhe) ───────────────────────────────────

/**
 * `true` só na primeira vez que essa chave aparece neste navegador. Sem
 * localStorage (modo privado, WebView travado) devolve `false`: na dúvida o
 * sistema fica quieto — melhor não mostrar do que mostrar toda hora.
 */
export function primeiraVez(chave: string): boolean {
  try {
    const k = `gaius.egg.${chave}`;
    if (localStorage.getItem(k)) return false;
    localStorage.setItem(k, "1");
    return true;
  } catch {
    return false;
  }
}
