// ── O que a página pública de candidatura precisa pra abrir ─────────────────
// Um lugar só pros dois servidores que servem `/candidatura`:
//
//   • o Gaius (tem banco): lê config + formulário + vaga, com cache de 60 s —
//     a página é pública e divulgada; mil visitas viram uma leitura por minuto;
//   • o site público www.carimbostridii.com.br (`PLAYER_API_BASE`, SEM banco):
//     pede o mesmo pacote ao Gaius por HTTP (`/api/candidatura/config`).
//
// Se o Gaius não responder, o site público abre o formulário PADRÃO em vez de
// cair — o envio passa pelo Gaius de qualquer jeito e é lá que a regra vale.

import { cached } from "@/lib/cache";
import { PLAYER_API_BASE, modoRemoto } from "@/lib/player-remoto";
import { FORMULARIO_PADRAO, normalizarFormulario, normalizarPerguntasDaVaga, perguntasSemGabarito, semGabarito, type ConfigFormulario, type Pergunta } from "./formulario";

export interface DadosDaCandidatura {
  fechado: boolean;
  config: ConfigFormulario;
  vaga: { id: string; titulo: string; perguntas: Pergunta[] } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê do banco (só no Gaius). */
export async function dadosLocais(vagaId: string | null, previa: boolean): Promise<DadosDaCandidatura> {
  const { configCrua, lerFormulario, listarVagas } = await import("./dados");
  const base = await cached("rh:candidatura:publico", 60_000, async () => {
    const [{ dados: cfg }, { dados: form }, { dados: vagas }] = await Promise.all([configCrua(), lerFormulario(), listarVagas()]);
    return {
      ativo: cfg?.formulario_ativo !== false,
      config: form.config,
      vagas: vagas.map((v) => ({ id: v.id, titulo: v.titulo, status: v.status, perguntas: v.perguntas ?? [] })),
    };
  });
  let vaga: DadosDaCandidatura["vaga"] = null;
  if (vagaId && UUID.test(vagaId)) {
    // Na prévia vale também vaga pausada — é o RH conferindo antes de publicar.
    const v = base.vagas.find((x) => x.id === vagaId && (x.status === "aberta" || (previa && x.status === "pausada")));
    if (v) vaga = { id: v.id, titulo: v.titulo, perguntas: perguntasSemGabarito(v.perguntas) };
  }
  // Sem o gabarito: isto vai pro navegador do candidato.
  return { fechado: !previa && !base.ativo, config: semGabarito(base.config), vaga };
}

/** No site público: pergunta ao Gaius. Falhou → formulário padrão, aberto. */
async function dadosRemotos(vagaId: string | null, previa: boolean): Promise<DadosDaCandidatura> {
  const q = new URLSearchParams();
  if (vagaId) q.set("vaga", vagaId);
  if (previa) q.set("previa", "1");
  try {
    const r = await fetch(`${PLAYER_API_BASE}/api/candidatura/config?${q}`, { next: { revalidate: 60 }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as Partial<DadosDaCandidatura>;
    const vaga = j.vaga && typeof j.vaga.id === "string" && UUID.test(j.vaga.id)
      ? { id: j.vaga.id, titulo: String(j.vaga.titulo ?? "").slice(0, 120), perguntas: normalizarPerguntasDaVaga(j.vaga.perguntas) }
      : null;
    return { fechado: j.fechado === true, config: semGabarito(normalizarFormulario(j.config)), vaga };
  } catch {
    return { fechado: false, config: semGabarito(structuredClone(FORMULARIO_PADRAO)), vaga: null };
  }
}

export function dadosDaCandidatura(vagaId: string | null, previa: boolean): Promise<DadosDaCandidatura> {
  return modoRemoto() ? dadosRemotos(vagaId, previa) : dadosLocais(vagaId, previa);
}
