// ── A cor da loja ────────────────────────────────────────────────────────────
// Uma cor só, e a loja inteira acompanha.
//
// O tema tem ~30 campos de cor: destaque, link, botão, cabeçalho, rodapé, preço,
// título de produto, fundo da barra de anúncio, fundo da seção de coleção com
// imagem… No Shopify quem troca a cor da marca mexe nos trinta, um a um, e
// esquece três. Aqui existe uma COR DE ASSINATURA, e trocar ela reescreve todas
// as que pertencem à família dela.
//
// Duas regras, e é só isso:
//
//   1. **Papel conhecido** (destaque, link, botão, cabeçalho, rodapé, título de
//      produto) recebe a cor derivada da assinatura — cada papel com o seu
//      ajuste de luminosidade, porque cabeçalho e link não podem ser o mesmo
//      tom sem o texto sumir.
//   2. **Qualquer outra cor da FAMÍLIA da assinatura** — matiz a até 25° da
//      antiga — gira junto, mantendo o próprio brilho e a própria saturação. É
//      o que faz o roxo claro da barra de anúncio virar um verde claro quando a
//      assinatura vira verde, em vez de ficar roxo no meio de uma loja verde.
//
// O que NÃO muda: cor de ESTADO. Verde de "em estoque", vermelho de erro,
// laranja de selo. Verde significa uma coisa e não pode virar rosa porque
// alguém trocou a marca — é a mesma regra que a paleta de gráfico do ERP já
// segue.

import { escurecer, clarear, luminosidade, paraRGB, textoSobre } from "./cor";
import { esquemaDaSecao } from "./registro";
import type { Tema } from "./tipos";

/** Papéis derivados da assinatura, com o desvio de luminosidade de cada um. */
const PAPEIS: { id: string; ajuste: number; texto?: boolean }[] = [
  { id: "accent_color", ajuste: 0 },
  { id: "link_color", ajuste: -8 },
  { id: "heading_color", ajuste: -30 },
  { id: "primary_button_background", ajuste: 0 },
  { id: "secondary_button_background", ajuste: -12 },
  { id: "header_background", ajuste: -14 },
  { id: "header_accent_color", ajuste: 0 },
  { id: "footer_background", ajuste: -6 },
  { id: "product_cor_dos_titles", ajuste: -8 },
];

/** Cores que a assinatura NÃO toca: elas significam estado, não marca. */
const INTOCADAS = new Set([
  "error_color", "success_color",
  "product_in_stock_color", "product_low_stock_color", "product_sold_out_color",
  "product_on_sale_accent", "product_cor_do_preco", "product_star_color",
  "background", "secondary_background", "border_color", "text_color",
]);

const hsl = (cor: string): { h: number; s: number; l: number } => {
  const { r, g, b } = paraRGB(cor);
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6
    : max === gg ? ((bb - rr) / d + 2) / 6
    : ((rr - gg) / d + 4) / 6;
  return { h: h * 360, s, l };
};

/** Distância entre dois matizes, em graus, pelo caminho curto do círculo. */
const distanciaDeMatiz = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Gira o matiz de uma cor, preservando saturação e luminosidade. */
function girarMatiz(cor: string, graus: number): string {
  const { h, s, l } = hsl(cor);
  const novo = (((h + graus) % 360) + 360) % 360;
  const f = (n: number) => {
    const k = (n + novo / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(Math.max(0, Math.min(255, v * 255)));
  };
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

const derivar = (assinatura: string, ajuste: number): string =>
  ajuste === 0 ? assinatura : ajuste < 0 ? escurecer(assinatura, -ajuste) : clarear(assinatura, ajuste);

/**
 * A cor de assinatura em vigor.
 *
 * Guardada explicitamente quando alguém já escolheu; senão é o destaque, que é
 * o campo que sempre carregou esse papel no tema. Assim um tema antigo — e o
 * modelo importado do Shopify — já chega com uma assinatura coerente, sem
 * migração.
 */
export const corDeAssinatura = (tema: Tema): string =>
  String(tema.ajustes.signature_color || tema.ajustes.accent_color || "#00badb");

/** Todos os campos de cor do tema: os globais e os de cada seção e bloco. */
function camposDeCor(tema: Tema): { ler: () => string; escrever: (v: string) => void; id: string }[] {
  const campos: { ler: () => string; escrever: (v: string) => void; id: string }[] = [];

  for (const id of Object.keys(tema.ajustes)) {
    if (/color|background|_cor_/.test(id) && typeof tema.ajustes[id] === "string") {
      campos.push({ id, ler: () => String(tema.ajustes[id]), escrever: (v) => { tema.ajustes[id] = v; } });
    }
  }

  for (const secao of Object.values(tema.secoes)) {
    const esquema = esquemaDaSecao(secao.tipo);
    if (!esquema) continue;
    for (const a of esquema.ajustes) {
      if (a.tipo !== "cor") continue;
      const id = a.id;
      campos.push({ id, ler: () => String(secao.ajustes[id] ?? ""), escrever: (v) => { secao.ajustes[id] = v; } });
    }
    for (const [, bloco] of Object.entries(secao.blocos ?? {})) {
      const eb = esquema.blocos?.find((x) => x.tipo === bloco.tipo);
      for (const a of eb?.ajustes ?? []) {
        if (a.tipo !== "cor") continue;
        const id = a.id;
        campos.push({ id, ler: () => String(bloco.ajustes[id] ?? ""), escrever: (v) => { bloco.ajustes[id] = v; } });
      }
    }
  }

  return campos;
}

/** Matiz a até isto de distância conta como "família da assinatura". */
export const TOLERANCIA_DE_FAMILIA = 25;

/**
 * Repinta o tema a partir de uma cor de assinatura nova.
 *
 * Função PURA, como todo o resto do motor: recebe tema, devolve tema. É o que
 * deixa o desfazer do editor funcionar num passo só — trocar a cor da loja é
 * UMA ação, não trinta.
 */
export function aplicarCorAssinatura(tema: Tema, nova: string): Tema {
  const antiga = corDeAssinatura(tema);
  const t = JSON.parse(JSON.stringify(tema)) as Tema;
  t.ajustes.signature_color = nova;

  const giro = hsl(nova).h - hsl(antiga).h;
  const derivadas = new Map(PAPEIS.map((p) => [p.id, derivar(nova, p.ajuste)]));

  for (const campo of camposDeCor(t)) {
    const atual = campo.ler();
    if (!atual || INTOCADAS.has(campo.id)) continue;

    // Preto, branco e cinza ficam onde estão — nos DOIS caminhos.
    //
    // No giro é óbvio: cinza não tem matiz, e girá-lo pintaria de roxo todo
    // texto que era branco. No papel é menos óbvio e mais importante: um título
    // PRETO é uma decisão de tipografia, não a cor da marca. Derivá-lo da
    // assinatura transformava o `#000000` da Carimbos num verde-quase-preto que
    // ninguém pediu.
    const { s, l } = hsl(atual);
    const semMatiz = s < 0.12 || l > 0.96 || l < 0.04;
    if (semMatiz) continue;

    // Papel conhecido: recebe a cor do papel, venha de onde vier.
    const doPapel = derivadas.get(campo.id);
    if (doPapel) { campo.escrever(doPapel); continue; }

    if (distanciaDeMatiz(hsl(atual).h, hsl(antiga).h) <= TOLERANCIA_DE_FAMILIA) {
      campo.escrever(girarMatiz(atual, giro));
    }
  }

  // Texto sobre o cabeçalho e sobre o rodapé segue a regra do tema: branco ou
  // preto conforme a luminosidade do fundo. Sem isso, uma assinatura clara
  // deixa texto branco sobre fundo claro — ilegível, e ninguém entende por quê.
  const cab = String(t.ajustes.header_background ?? nova);
  t.ajustes.header_text_color = textoSobre(cab);
  t.ajustes.header_light_text_color = luminosidade(cab) < 65
    ? clarear(cab, 34)
    : escurecer(cab, 34);
  const rod = String(t.ajustes.footer_background ?? nova);
  t.ajustes.footer_text_color = textoSobre(rod);

  return t;
}
