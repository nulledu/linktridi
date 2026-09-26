import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { lerProduto } from "../lojas-entrada";

/**
 * A foto do produto tem que vir do NOSSO Storage.
 *
 * O corpo da rota é JSON: nada impede quem tem sessão de mandar
 * `imagens: [{ url: "https://site-de-fora/foto.jpg" }]` direto, sem passar pela
 * tela. Gravar isso aponta a vitrine pra um endereço de terceiro — que pode
 * mudar de conteúdo DEPOIS de alguém aprovar a imagem, ou sumir e deixar o
 * catálogo cheio de imagem quebrada.
 *
 * É teste e não comentário na rota porque a checagem é um `for` de três linhas:
 * cai fora numa refatoração distraída sem nada quebrar visivelmente, e o
 * estrago só apareceria na vitrine, semanas depois. Mesma lógica da trava da
 * faxina de fotos (lib/__tests__/foto-do-nosso-bucket.test.ts).
 */

const BASE = "https://exemplo.supabase.co";
const NOSSA = `${BASE}/storage/v1/object/public/photos/lojas/abc/1a2b3c.jpg`;

const base = (extra: Record<string, unknown> = {}) => ({
  titulo: "Carimbo Personalizado",
  descricao: "",
  imagens: [],
  preco: 89.9,
  precoPromocional: null,
  custo: null,
  estoque: 10,
  venderSemEstoque: false,
  sku: "",
  codigoBarras: "",
  categorias: [],
  status: "ativo",
  ...extra,
});

const antes = process.env.NEXT_PUBLIC_SUPABASE_URL;
beforeAll(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = BASE; });
afterAll(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = antes; });

describe("produto só aceita foto do nosso bucket", () => {
  it("aceita a URL que o upload devolve", () => {
    const r = lerProduto(base({ imagens: [{ id: "1", url: NOSSA, alt: "carimbo" }] }));
    expect(r.ok).toBe(true);
  });

  it("recusa endereço de fora, mesmo com o resto do produto válido", () => {
    const r = lerProduto(base({ imagens: [{ id: "1", url: "https://site-de-fora/foto.jpg", alt: "" }] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/fora do sistema/i);
  });

  it("uma foto de fora no meio de fotos boas derruba o salvamento inteiro", () => {
    // Não é pra filtrar em silêncio: a pessoa mandou três fotos e receberia
    // duas, sem saber por quê.
    const r = lerProduto(base({
      imagens: [
        { id: "1", url: NOSSA, alt: "" },
        { id: "2", url: "http://192.168.0.9/foto.jpg", alt: "" },
      ],
    }));
    expect(r.ok).toBe(false);
  });

  it("recusa `blob:` — endereço local que só existe naquela aba", () => {
    const r = lerProduto(base({ imagens: [{ id: "1", url: "blob:http://localhost:3000/abc", alt: "" }] }));
    expect(r.ok).toBe(false);
  });

  it("produto sem foto continua válido", () => {
    expect(lerProduto(base()).ok).toBe(true);
  });

  it("a regra de negócio continua valendo junto com a da foto", () => {
    // A validação da foto não pode ter passado na frente e escondido o erro
    // de preço — a pessoa consertaria a foto e levaria outro erro em seguida.
    const r = lerProduto(base({ preco: 50, precoPromocional: 80 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/promocional/i);
  });
});
