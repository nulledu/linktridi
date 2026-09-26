// ── Do payload do TridiFlow ao candidato ─────────────────────────────────────
// Função PURA: recebe o corpo que `enviarLeadWebhook` (lib/tridiflow-db.ts)
// manda e devolve a linha de `rh_candidatos`. Sem banco, sem rede — é o que a
// trava em lib/__tests__/rh-curriculos.test.ts exercita.
//
// O corpo do TridiFlow é PLANO: `{ evento, bot, bot_id, sessao_id, quando,
// parcial?, ...respostas, ...utm, tags[] }`. Nome, e-mail e telefone chegam
// com a chave que a pessoa deu à variável no editor ("nome", "seu_nome",
// "whatsapp"…) — os apelidos são os mesmos que o CRM do TridiFlow já usa.

import { emailDoLead, nomeDoLead, telefoneDoLead } from "@/lib/tridiflow-leads";
import { perguntaDe } from "./formulario";
import type { CurriculoAnexo, RespostaCandidato } from "./tipos";

/** Chaves que são do ENVELOPE, não resposta do candidato. */
const ENVELOPE = new Set(["evento", "bot", "bot_id", "sessao_id", "quando", "parcial", "tags", "resultado", "pontuacao"]);
const CHAVES_NOME = ["nome", "name", "seu_nome", "primeiro_nome", "nome_completo"];
const CHAVES_EMAIL = ["email", "e-mail", "e_mail", "seu_email", "mail"];
const CHAVES_TELEFONE = ["telefone", "whatsapp", "celular", "phone", "fone", "tel", "seu_whatsapp"];
const CHAVES_CIDADE = ["cidade", "city", "cidade_uf", "onde_mora", "municipio"];
const CHAVES_VAGA = ["vaga", "cargo", "posicao", "vaga_desejada", "funcao"];
const CHAVES_CV = ["curriculo", "cv", "resume", "arquivo", "anexo"];

const texto = (v: unknown): string => (v == null ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)).trim();

function achar(corpo: Record<string, unknown>, chaves: string[]): string {
  for (const k of Object.keys(corpo)) {
    if (chaves.includes(k.toLowerCase())) {
      const v = texto(corpo[k]);
      if (v) return v;
    }
  }
  return "";
}

export interface CandidatoRecebido {
  nome: string;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  /** Texto da vaga como veio (o chamador resolve contra `rh_vagas`). */
  vaga_texto: string | null;
  externo_id: string | null;
  parcial: boolean;
  respostas: RespostaCandidato[];
  curriculo: CurriculoAnexo | null;
  origem_detalhe: Record<string, unknown>;
  dados: Record<string, unknown>;
  recebido_em: string;
}

/** Devolve `{ erro }` quando o corpo não tem nem nome nem contato — não é candidato. */
export function candidatoDoWebhook(corpo: unknown, agora = new Date()): { ok: true; candidato: CandidatoRecebido } | { ok: false; erro: string } {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { ok: false, erro: "Corpo inválido: esperado um objeto JSON." };
  const c = corpo as Record<string, unknown>;

  const plano: Record<string, string> = {};
  for (const [k, v] of Object.entries(c)) if (!ENVELOPE.has(k)) plano[k] = texto(v);

  const nome = nomeDoLead(plano) || achar(c, CHAVES_NOME);
  const email = emailDoLead(plano) || achar(c, CHAVES_EMAIL) || null;
  const telefone = telefoneDoLead(plano) || achar(c, CHAVES_TELEFONE) || null;
  if (!nome && !email && !telefone) return { ok: false, erro: "Sem nome, e-mail nem telefone: não dá pra criar o candidato." };

  const cidade = achar(c, CHAVES_CIDADE) || null;
  const vaga_texto = achar(c, CHAVES_VAGA) || null;

  // Currículo: a chave que o quiz de candidatura usa, ou qualquer valor que
  // seja um link privado do Gaius (`/api/arquivos/<chave>`).
  let curriculo: CurriculoAnexo | null = null;
  for (const [k, v] of Object.entries(plano)) {
    const ehChaveCv = CHAVES_CV.includes(k.toLowerCase());
    const m = v.match(/^(?:https?:\/\/[^/]+)?\/api\/arquivos\/(curriculos\/[\w./-]+)$/);
    if (m && (ehChaveCv || !curriculo)) {
      const chave = m[1];
      const nomeArq = chave.split("/").pop() ?? "curriculo";
      const ext = nomeArq.includes(".") ? nomeArq.split(".").pop()!.toLowerCase() : "";
      curriculo = {
        chave, url: `/api/arquivos/${chave}`, nome: nomeArq,
        tipo: ext === "pdf" ? "application/pdf" : "application/octet-stream",
        tamanho: 0, enviado_em: agora.toISOString(),
      };
      if (ehChaveCv) break;
    }
  }

  // Tudo o que sobrou vira resposta, na ordem em que veio. Contato e cidade
  // têm coluna própria, então saem daqui; utm vai pra origem_detalhe.
  const contato = new Set([...CHAVES_NOME, ...CHAVES_EMAIL, ...CHAVES_TELEFONE, ...CHAVES_CIDADE, ...CHAVES_VAGA, ...CHAVES_CV]);
  const respostas: RespostaCandidato[] = [];
  const utm: Record<string, string> = {};
  for (const [k, v] of Object.entries(plano)) {
    if (!v) continue;
    const kl = k.toLowerCase();
    if (kl.startsWith("utm_")) { utm[kl] = v; continue; }
    if (contato.has(kl)) continue;
    if (curriculo && v.includes(curriculo.chave)) continue;
    respostas.push({ chave: k, pergunta: perguntaDe(k), resposta: v });
  }

  const sessao = texto(c.sessao_id);
  const tags = Array.isArray(c.tags) ? c.tags.map(texto).filter(Boolean) : [];
  const quando = texto(c.quando);
  const recebido_em = quando && !Number.isNaN(Date.parse(quando)) ? new Date(quando).toISOString() : agora.toISOString();

  return {
    ok: true,
    candidato: {
      nome: nome || email || telefone || "Candidato",
      email, telefone, cidade, vaga_texto,
      externo_id: sessao ? `tridiflow:${sessao}` : null,
      parcial: c.parcial === true,
      respostas, curriculo,
      origem_detalhe: {
        fonte: "webhook", bot: texto(c.bot) || null, bot_id: texto(c.bot_id) || null,
        ...(Object.keys(utm).length ? { utm } : {}),
        ...(tags.length ? { tags } : {}),
        ...(c.resultado != null ? { resultado: texto(c.resultado) } : {}),
      },
      dados: {},
      recebido_em,
    },
  };
}

/** Acha a vaga pelo texto que o candidato/bot mandou (título, sem acento nem caixa). */
export function vagaPeloTexto<T extends { id: string; titulo: string }>(vagas: T[], textoVaga: string | null): T | null {
  if (!textoVaga) return null;
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const alvo = norm(textoVaga);
  return vagas.find((v) => norm(v.titulo) === alvo) ?? vagas.find((v) => alvo.includes(norm(v.titulo)) || norm(v.titulo).includes(alvo)) ?? null;
}
