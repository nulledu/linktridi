import { NextRequest, NextResponse } from "next/server";
import {
  COLS_MSG_BASE, COLS_MSG_NOVO, meusCanais, naoAutenticado,
  paraMensagem, sessao, temEsquemaNovo, type Db,
} from "@/lib/chat/servidor";
import type { Canal, Mensagem, Pessoa, ResultadoBusca } from "@/lib/chat/tipos";

export const dynamic = "force-dynamic";

const LIMITE = 8;

// Busca do ⌘K: pessoas, canais, mensagens e arquivos numa resposta só.
// As quatro consultas são independentes e vão em paralelo — o custo de rede é o
// da mais lenta, não a soma.
export async function GET(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const termo = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const soCanal = req.nextUrl.searchParams.get("canal");
  const vazio: ResultadoBusca = { mensagens: [], canais: [], pessoas: [], arquivos: [] };
  if (termo.length < 2) return NextResponse.json(vazio);

  const meus = await meusCanais(db, me.id);
  if (!meus.length) return NextResponse.json(vazio);
  const alvo = soCanal ? (meus.includes(soCanal) ? [soCanal] : []) : meus;
  if (!alvo.length) return NextResponse.json(vazio);

  const novo = await temEsquemaNovo(db);
  const [msgs, canais, pessoas, arquivos] = await Promise.all([
    buscarMensagens(db, alvo, termo, novo, me.id),
    soCanal ? Promise.resolve([]) : buscarCanais(db, meus, termo),
    soCanal ? Promise.resolve([]) : buscarPessoas(db, termo, me.id),
    novo ? buscarArquivos(db, alvo, termo) : Promise.resolve([]),
  ]);

  // Nome do canal de cada mensagem encontrada (o resultado precisa dizer "onde").
  const idsCanais = [...new Set(msgs.map((m) => m.conversa_id))];
  const { data: convs } = idsCanais.length
    ? await db.from("central_conversas").select("id,nome,tipo").in("id", idsCanais)
    : { data: [] };
  const info = new Map(((convs ?? []) as { id: string; nome: string | null; tipo: string }[])
    .map((c) => [c.id, { id: c.id, nome: c.nome || "Conversa", tipo: c.tipo as Canal["tipo"] }]));

  const resultado: ResultadoBusca = {
    mensagens: msgs.map((m) => ({
      mensagem: m,
      canal: info.get(m.conversa_id) ?? { id: m.conversa_id, nome: "Conversa", tipo: "grupo" },
    })),
    canais, pessoas, arquivos,
  };
  return NextResponse.json(resultado);
}

async function buscarMensagens(db: Db, canais: string[], termo: string, novo: boolean, meuId: string): Promise<Mensagem[]> {
  if (novo) {
    // Índice GIN de full-text: ranqueia por relevância e não faz varredura.
    const { data, error } = await db.rpc("central_buscar_mensagens", {
      p_user: meuId, p_termo: termo, p_limite: 40,
    });
    if (!error && Array.isArray(data)) {
      const permitidos = new Set(canais);
      const achadas = (data as Record<string, unknown>[])
        .filter((l) => permitidos.has(String(l.conversa_id)))
        .slice(0, LIMITE * 2);
      if (achadas.length) return achadas.map((l) => paraMensagem({ ...l, tipo: "texto" }));
    }
  }
  // Reserva (sem o SQL rodado, ou termo que o tsquery não casa): ILIKE limitado.
  const { data } = await db.from("central_mensagens")
    .select(novo ? COLS_MSG_NOVO : COLS_MSG_BASE)
    .in("conversa_id", canais)
    .ilike("texto", `%${termo.replace(/[%_]/g, "")}%`)
    .order("created_at", { ascending: false })
    .limit(LIMITE * 2);
  return ((data ?? []) as Record<string, unknown>[]).map(paraMensagem).filter((m) => !m.excluida_em);
}

async function buscarCanais(db: Db, meus: string[], termo: string): Promise<Canal[]> {
  const { data } = await db.from("central_conversas")
    .select("id,tipo,nome,setor,created_at")
    .in("id", meus)
    .ilike("nome", `%${termo.replace(/[%_]/g, "")}%`)
    .limit(LIMITE);
  type L = { id: string; tipo: string; nome: string | null; setor: string | null; created_at: string };
  return ((data ?? []) as L[])
    .filter((c) => c.tipo !== "direta")     // conversa direta aparece em "Pessoas"
    .map((c): Canal => ({
      id: c.id, tipo: c.tipo as Canal["tipo"], nome: c.nome || c.setor || "Canal",
      descricao: null, topico: null, slug: null, avatar: null, cor: null, categoria_id: null,
      contexto_tipo: null, contexto_ref: null, privado: false, somente_leitura: false, arquivado: false,
      membros: 0, favorita: false, papel: "membro", notificar: "todas", mudo_ate: null,
      atualizado_em: c.created_at, ultima: null, nao_lidas: 0, mencoes: 0,
    }));
}

async function buscarPessoas(db: Db, termo: string, meuId: string): Promise<Pessoa[]> {
  const { data } = await db.from("profiles")
    .select("id,name,username,active,employees(setor,photo_url)")
    .ilike("name", `%${termo.replace(/[%_]/g, "")}%`)
    .limit(LIMITE + 1);
  type L = { id: string; name: string | null; username: string; active?: boolean; employees: { setor: string | null; photo_url: string | null }[] | { setor: string | null; photo_url: string | null } | null };
  return ((data ?? []) as L[])
    .filter((p) => p.id !== meuId && p.active !== false)
    .map((p) => {
      const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
      return { id: p.id, name: p.name || p.username, setor: emp?.setor ?? null, avatar: emp?.photo_url ?? null };
    })
    .slice(0, LIMITE);
}

async function buscarArquivos(db: Db, canais: string[], termo: string) {
  const { data } = await db.from("central_anexos")
    .select("id,conversa_id,url,nome,mime,tamanho,largura,altura,created_at")
    .in("conversa_id", canais)
    .ilike("nome", `%${termo.replace(/[%_]/g, "")}%`)
    .order("created_at", { ascending: false })
    .limit(LIMITE);
  type L = { conversa_id: string; url: string; nome: string; mime: string; tamanho: number | null; largura: number | null; altura: number | null; created_at: string };
  return ((data ?? []) as L[]).map((a) => ({ ...a, canal: "" }));
}
