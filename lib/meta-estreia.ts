// ── Estreia do criativo na Meta (servidor) ──────────────────────────────────
// "Quando esse criativo subiu num anúncio pela primeira vez?" A Tridify não
// responde com o que já tem: a lista de anúncios só traz quem teve GASTO no
// período, e o anúncio original costuma estar pausado há meses enquanto a
// "— Cópia" roda. O menor `created_time` da lista seria a data da cópia.
//
// Quem guarda a data certa é a PEÇA. Vídeo e imagem têm `created_time` do
// upload na conta de anúncios, e duplicar o anúncio reaproveita a mesma peça
// (mesmo `video_id`, mesmo hash), então essa data não anda. Fica a mais antiga
// entre o upload da peça e a criação de cada anúncio do grupo — a segunda
// cobre carrossel e criativo dinâmico, que não têm UM vídeo/hash pra perguntar.
//
// O token é por conta e quem chama só tem o id do anúncio: varre os tokens
// como a prévia (`lib/meta-preview.ts`).
import { getAllTokens } from "@/lib/meta-tokens";
import { ehAdId } from "@/lib/meta-preview";
import { isoDaMeta, maisAntiga, type EstreiaCriativo } from "@/lib/criativos-estreia";

const GRAPH = "https://graph.facebook.com/v21.0";
// A conexão com a Meta às vezes para sem erro nenhum; sem prazo a rota fica
// pendurada até o teto da função.
const PRAZO_MS = 6_000;
const CAMPOS_ANUNCIO = "created_time,account_id,creative{video_id,image_hash}";
/** Teto de anúncios por pergunta. Grupo real tem poucos; o teto segura a varredura de tokens. */
export const MAX_ANUNCIOS_ESTREIA = 25;

type Json = Record<string, unknown>;

async function graph(url: string): Promise<Json> {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(PRAZO_MS) });
    return (await r.json()) as Json;
  } catch (e) {
    return { error: { message: String(e) } };
  }
}

const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
const semErro = (d: unknown): d is Json => !!d && typeof d === "object" && !(d as Json).error;

interface AnuncioLido {
  token: string;
  conta: string | null;
  criadoEm: string | null;
  videoId: string | null;
  imageHash: string | null;
}

function lerAnuncio(token: string, d: unknown): AnuncioLido | null {
  if (!semErro(d)) return null;
  const cr = (d.creative ?? {}) as Json;
  return { token, conta: texto(d.account_id), criadoEm: isoDaMeta(d.created_time), videoId: texto(cr.video_id), imageHash: texto(cr.image_hash) };
}

/**
 * Lê os anúncios com o token que enxergar cada um. Primeiro em lote por token
 * (no caso comum uma chamada resolve o grupo inteiro); a Meta recusa o lote
 * INTEIRO quando um id é de conta que o token não vê, então quem sobra vai
 * um a um.
 */
async function lerAnuncios(ids: string[], tokens: string[]): Promise<AnuncioLido[]> {
  const lidos = new Map<string, AnuncioLido>();
  const faltam = () => ids.filter((id) => !lidos.has(id));
  const campos = encodeURIComponent(CAMPOS_ANUNCIO);
  for (const token of tokens) {
    const pendentes = faltam();
    if (!pendentes.length) break;
    const lote = await graph(`${GRAPH}/?ids=${encodeURIComponent(pendentes.join(","))}&fields=${campos}&access_token=${token}`);
    if (lote.error) continue;
    for (const id of pendentes) {
      const a = lerAnuncio(token, lote[id]);
      if (a) lidos.set(id, a);
    }
  }
  await Promise.all(faltam().map(async (id) => {
    for (const token of tokens) {
      const a = lerAnuncio(token, await graph(`${GRAPH}/${id}?fields=${campos}&access_token=${token}`));
      if (a) { lidos.set(id, a); return; }
    }
  }));
  return [...lidos.values()];
}

/** Upload de cada vídeo: `created_time` do nó do vídeo, lido com o token do anúncio que o usa. */
async function uploadsDeVideo(anuncios: AnuncioLido[]): Promise<EstreiaCriativo[]> {
  const porToken = new Map<string, Set<string>>();
  for (const a of anuncios) if (a.videoId) porToken.set(a.token, (porToken.get(a.token) ?? new Set<string>()).add(a.videoId));
  const saida: EstreiaCriativo[] = [];
  await Promise.all([...porToken].map(async ([token, videos]) => {
    const ids = [...videos];
    const lote = await graph(`${GRAPH}/?ids=${encodeURIComponent(ids.join(","))}&fields=created_time&access_token=${token}`);
    const respostas = lote.error
      ? await Promise.all(ids.map((id) => graph(`${GRAPH}/${id}?fields=created_time&access_token=${token}`)))
      : ids.map((id) => lote[id]);
    for (const d of respostas) {
      const em = semErro(d) ? isoDaMeta(d.created_time) : null;
      if (em) saida.push({ em, fonte: "video" });
    }
  }));
  return saida;
}

/** Upload de cada imagem: o hash só existe dentro da conta, então a pergunta é `act_X/adimages`. */
async function uploadsDeImagem(anuncios: AnuncioLido[]): Promise<EstreiaCriativo[]> {
  const porConta = new Map<string, { token: string; hashes: Set<string> }>();
  for (const a of anuncios) {
    if (!a.imageHash || !a.conta) continue;
    const e = porConta.get(a.conta) ?? { token: a.token, hashes: new Set<string>() };
    e.hashes.add(a.imageHash);
    porConta.set(a.conta, e);
  }
  const saida: EstreiaCriativo[] = [];
  await Promise.all([...porConta].map(async ([conta, { token, hashes }]) => {
    const d = await graph(`${GRAPH}/act_${conta}/adimages?hashes=${encodeURIComponent(JSON.stringify([...hashes]))}&fields=hash,created_time&access_token=${token}`);
    if (d.error) return;
    for (const img of (d.data as Json[] | undefined) ?? []) {
      const em = isoDaMeta(img.created_time);
      if (em) saida.push({ em, fonte: "imagem" });
    }
  }));
  return saida;
}

/**
 * Quando o criativo formado por estes anúncios subiu na Meta pela primeira vez.
 * Sem token, sem permissão ou sem data em nenhuma fonte → null ("não sei",
 * nunca uma data inventada).
 */
export async function estreiaDoCriativo(adIds: string[]): Promise<EstreiaCriativo | null> {
  const ids = [...new Set(adIds.map((id) => id.trim()).filter(ehAdId))].slice(0, MAX_ANUNCIOS_ESTREIA);
  if (!ids.length) return null;
  let tokens: string[];
  try { tokens = await getAllTokens(); } catch { return null; }
  if (!tokens.length) return null;

  const anuncios = await lerAnuncios(ids, tokens);
  if (!anuncios.length) return null;
  const [videos, imagens] = await Promise.all([uploadsDeVideo(anuncios), uploadsDeImagem(anuncios)]);
  const criacoes = anuncios.flatMap((a): EstreiaCriativo[] => (a.criadoEm ? [{ em: a.criadoEm, fonte: "anuncio" }] : []));
  return maisAntiga([...videos, ...imagens, ...criacoes]);
}
