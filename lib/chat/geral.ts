// Canal Geral — o chat de toda a empresa.
//
// Nasce sozinho na primeira abertura do chat e cada pessoa entra sozinha na
// primeira vez que carrega a lista. Não existe SQL para rodar: é uma linha comum
// de `central_conversas` marcada com contexto de sistema (`eGeral`), e a
// filiação é uma linha comum de `central_conversa_membros` — a RLS do Realtime
// entrega as mensagens do Geral pelo mesmo caminho dos outros canais.
//
// Custo: o id fica em cache por 10 minutos; a filiação é conferida contra a
// lista de canais que a rota já tinha em mãos. No ciclo comum não há escrita.

import { cached, invalidate } from "@/lib/cache";
import { GERAL } from "./regras";
import { esqueceCanais, type Db } from "./servidor";

const CHAVE = "chat:geral:id";

// Coluna/tabela ausente é resposta ESTÁVEL (o SQL ainda não rodou): pode ficar
// no cache, porque a próxima leitura daria o mesmo. Timeout, 5xx e queda de
// conexão são passageiros e sobem — ver `cached()` em lib/cache.ts.
const COLUNA_AUSENTE = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

/**
 * Procura a linha do Geral.
 *
 * `podeCriar: false` é o único jeito de dizer "a leitura não aconteceu, mas a
 * resposta é estável" — sem o esquema novo não há o que criar. Falha passageira
 * LANÇA: antes, ela caía no caminho de CRIAR, o insert falhava junto, a
 * releitura falhava junto, e `null` ficava guardado por 10 min. Uma empresa
 * inteira sem o canal Geral por causa de um soluço de meio segundo.
 */
async function lerGeral(db: Db): Promise<{ id: string | null; podeCriar: boolean }> {
  const { data, error } = await db.from("central_conversas")
    .select("id").eq("contexto_tipo", GERAL.contexto_tipo).eq("contexto_ref", GERAL.contexto_ref)
    .limit(1).maybeSingle();
  if (error) {
    if (COLUNA_AUSENTE.has(error.code)) return { id: null, podeCriar: false };
    throw error;
  }
  return { id: data?.id ? String(data.id) : null, podeCriar: true };
}

/** Id do Geral, criando-o se ainda não existe. `null` só sem o esquema novo. */
export async function idDoGeral(db: Db, criadoPor: string): Promise<string | null> {
  return cached(CHAVE, 10 * 60_000, async () => {
    const achado = await lerGeral(db);
    if (achado.id || !achado.podeCriar) return achado.id;
    const { data: novo, error } = await db.from("central_conversas").insert({
      tipo: "canal", nome: "Geral", slug: "geral", criada_por: criadoPor,
      descricao: "Todo mundo da empresa. Avisos e conversa geral.",
      privado: false, somente_leitura: false, arquivado: false,
      contexto_tipo: GERAL.contexto_tipo, contexto_ref: GERAL.contexto_ref,
    }).select("id").single();
    if (!error && novo) return String(novo.id);
    // Dois processos criando ao mesmo tempo: o segundo relê em vez de duplicar.
    // A releitura lança se o banco estiver com soluço — e aí nada fica no cache.
    return (await lerGeral(db)).id;
  });
}

/**
 * Garante que a pessoa é membro do Geral. Recebe os ids de canais que a rota já
 * carregou para não ir ao banco no ciclo comum. Devolve o id do Geral e se a
 * lista precisa ser relida (a pessoa acabou de entrar).
 */
export async function garantirGeral(
  db: Db, meuId: string, meusCanais: string[],
): Promise<{ id: string | null; entrou: boolean }> {
  // Leitura com falha sobe do `idDoGeral` de propósito (é o que impede o cache
  // de guardar a falha por 10 min), mas a sidebar não morre por isso: este ciclo
  // segue sem o Geral e o próximo pergunta de novo.
  const id = await idDoGeral(db, meuId).catch(() => null);
  if (!id) return { id: null, entrou: false };
  if (meusCanais.includes(id)) return { id, entrou: false };
  const { error } = await db.from("central_conversa_membros")
    .upsert({ conversa_id: id, user_id: meuId, papel: "membro" }, { onConflict: "conversa_id,user_id" });
  if (error) {
    // O id em cache pode apontar para um Geral apagado à mão no banco: esquece e
    // deixa a próxima abertura recriar.
    invalidate(CHAVE);
    return { id: null, entrou: false };
  }
  esqueceCanais(meuId);
  return { id, entrou: true };
}
