import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice, deviceAceitaCategoria, podePegarDoPool, setorCasa, idadeNaFila, liberadaAgora, type FilaRow } from "@/lib/device";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { presencaAgora } from "@/lib/ponto";

export const dynamic = "force-dynamic";

const norm = (s: string | null | undefined) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// POST /api/device/claim  { colaborador_id, colaborador_nome }
// Modelo Uber: o funcionário LIVRE puxa a próxima atividade do POOL do setor.
// - Se já tem uma em andamento, devolve ela (idempotente: uma por vez).
// - Senão, reivindica a mais antiga do pool do setor de forma atômica.
export async function POST(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const device = auth.device;
  let b: { colaborador_id?: string; colaborador_nome?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const colaborador = String(b.colaborador_id || "");
  if (!colaborador) return NextResponse.json({ error: "missing_colaborador" }, { status: 400 });
  const nome = b.colaborador_nome ? String(b.colaborador_nome) : null;
  const db = createSupabaseAdminClient();

  // Já tem uma reservada/em andamento? Devolve (uma de cada vez).
  const { data: atual } = await db.from("atividades").select("*")
    .eq("para_id", colaborador).eq("status", "em_andamento")
    .order("claimed_at", { ascending: true }).limit(1).maybeSingle();
  if (atual) return NextResponse.json({ atividade: atual, ja_tinha: true });
  // Tem uma DIRIGIDA esperando (pendente com dono) ou uma pausada? Não puxa do
  // pool por cima: a pessoa receberia duas ordens em sequência e ficaria com
  // duas abertas ao mesmo tempo.
  const { data: espera } = await db.from("atividades").select("id")
    .eq("para_id", colaborador).eq("status", "pendente").limit(1).maybeSingle();
  if (espera) return NextResponse.json({ atividade: null, ocupado: true });

  // Só manda ordem pra quem está PRESENTE (bateu ponto). Se a pessoa está
  // cadastrada no ponto e não está dentro, não recebe. Sem ponto configurado
  // (registrados vazio) → não bloqueia.
  const pres = await presencaAgora([colaborador]).catch(() => null);
  if (pres && pres.registrados.has(colaborador) && !pres.presentes.has(colaborador))
    return NextResponse.json({ atividade: null, ausente: true });

  // Especialidade (produção) da pessoa — filtra o pool por HABILIDADE (só cai
  // chancela pra quem faz chancela, etc.). Tolerante: sem a coluna, não filtra.
  let esp: string | null = null;
  try { const { data: emp } = await db.from("employees").select("especialidade").eq("id", colaborador).maybeSingle(); esp = (emp as { especialidade?: string | null } | null)?.especialidade ?? null; } catch { esp = null; }

  // Candidatas do pool: pendentes, sem dono, deste tablet (alvo) ou do setor do device.
  const setorD = norm(device.setor);
  const M = device.nome_mesa;
  const { data: cands } = await db.from("atividades").select("*")
    .eq("status", "pendente").eq("pool", true).is("para_id", null)
    // Teto alto de propósito: a janela ANTIGA era 20, e as 20 mais velhas do
    // pool podem ser todas de outra bancada (5 ordens de "Carimbos" paradas
    // desde 05/09 num galpão que só tem tablet de Chancela). Com a janela
    // curta, a fila inteira do tablet morre atrás de ordens que ele nunca vai
    // poder pegar.
    .order("created_at", { ascending: true }).limit(300);
  const fila = (cands ?? []).filter((a: { setor: string | null; mesa_alvo?: string | null; categoria?: string | null; faixa?: string | null }) =>
    // Pool com tablet-alvo → só naquele tablet; senão → setor casa. Além disso:
    // (a) o TABLET tem que ser da bancada da ordem (chancela × carimbo/clichê),
    // (b) a PESSOA tem que fazer aquela categoria (especialidade), e
    // (c) a PESSOA tem que ser da FAIXA da ordem (maquinas/producao/preparo) —
    //     Davi/Bruno só máquinas, João só preparo, o resto só produção.
    ((a.mesa_alvo != null) ? a.mesa_alvo === M : setorCasa(device.setor, a.setor)) &&
    deviceAceitaCategoria(device, a.categoria) &&
    // (b)+(c): a regra única da pessoa × ordem (lib/device.ts).
    podePegarDoPool(esp, a) &&
    // (d) não recusada — recusada espera o supervisor (fila de recusadas).
    liberadaAgora(a as { liberada_apos?: string | null; impedida?: boolean | null })
  )
    // URGENTE fura a fila; depois por FASE (ordem asc), depois o mais antigo.
    // "Mais antigo" usa devolvida_em quando existe: ordem devolvida ("não consigo
    // — falta material") reentra na fila como a MAIS NOVA e vai pro fim, em vez
    // de voltar na hora pra mesma pessoa.
    .sort((a: FilaRow, b: FilaRow) => {
      const ua = a.urgente ? 0 : 1, ub = b.urgente ? 0 : 1;
      if (ua !== ub) return ua - ub;
      const oa = a.ordem == null ? Infinity : Number(a.ordem);
      const ob = b.ordem == null ? Infinity : Number(b.ordem);
      return oa !== ob ? oa - ob : idadeNaFila(a).localeCompare(idadeNaFila(b));
    });

  // Reserva a 1ª que conseguir travar (update condicional evita corrida entre tablets).
  // OFERECIDA: fica em_andamento com iniciada_at NULL — o relógio só começa quando a
  // pessoa toca "Aceitar" (rota /api/device/accept). Até lá, o tablet fica chamando.
  for (const cand of fila) {
    const { data: claimed } = await db.from("atividades")
      .update({ para_id: colaborador, para_nome: nome, status: "em_andamento", claimed_at: new Date().toISOString() })
      .eq("id", cand.id).eq("status", "pendente").is("para_id", null)
      .select("*").maybeSingle();
    if (claimed) return NextResponse.json({ atividade: claimed });
  }
  // Pool vazio agora.
  return NextResponse.json({ atividade: null });
}
