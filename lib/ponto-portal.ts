// ── Portal de início de turno ────────────────────────────────────────────────
// Quando a pessoa bate ENTRADA/RETORNO, mostra as prioridades do dia do SETOR
// dela — puxadas AO VIVO do ERP (nada digitado à mão). O setor vem do vínculo
// com o colaborador (employees.departamento). Cache de 2 min por setor pra não
// martelar o ERP a cada batida.
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

async function countErp(query: string): Promise<number> {
  try {
    const res = await fetch(`${LEGACY_URL}/rest/v1/pedidos?${query}`, {
      headers: { ...headers, Range: "0-0", "Range-Unit": "items", Prefer: "count=exact" },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    const cr = res.headers.get("content-range") || "";
    const total = cr.split("/")[1];
    return total && total !== "*" ? Number(total) : 0;
  } catch { return 0; }
}
const ativos = (extra: string) => countErp(`select=id&${extra}&arquivado=eq.false&concluido=eq.false`);

export interface PortalItem { label: string; valor: number; urgente: boolean }
export interface Portal { setor: string; itens: PortalItem[] }

// Itens (prioridades) por departamento — cada um é 1 número ao vivo do ERP.
async function itensDoSetor(dep: string): Promise<PortalItem[]> {
  switch (dep) {
    case "Produção": {
      // Fila da máquina = Aprovado (7). A etapa 16 "Máquinas" está oculta no
      // ERP e vive vazia: o pedido vai de Aprovado direto para Em produção (9)
      // quando é programado.
      const [fila, prod, urg] = await Promise.all([ativos("etapa_id=eq.7"), ativos("etapa_id=eq.9"), ativos("urgente=eq.true")]);
      return [
        { label: "Aguardando máquina", valor: fila, urgente: false },
        { label: "Em produção", valor: prod, urgente: prod > 250 },
        { label: "Urgentes na fila", valor: urg, urgente: urg > 0 },
      ];
    }
    case "Logística": {
      const [sep, log, semForm] = await Promise.all([ativos("etapa_id=eq.10"), ativos("etapa_id=eq.11"), ativos("formulario_copiado=eq.false&etapa_id=eq.11")]);
      return [
        { label: "Para separar", valor: sep, urgente: sep > 60 },
        { label: "Na logística", valor: log, urgente: false },
        { label: "Sem formulário", valor: semForm, urgente: semForm > 0 },
      ];
    }
    case "Design": {
      const [arte, aprov, naoAprov] = await Promise.all([ativos("etapa_id=eq.2"), ativos("etapa_id=eq.5"), ativos("etapa_id=eq.4")]);
      return [
        { label: "Com arte (vetorizar)", valor: arte, urgente: false },
        { label: "Aguardando aprovação", valor: aprov, urgente: false },
        { label: "Não aprovadas", valor: naoAprov, urgente: naoAprov > 40 },
      ];
    }
    case "Estoque": {
      // Estoque em falta vem do catálogo NOVO (Supabase novo), não do ERP legado.
      try {
        const db = createSupabaseAdminClient();
        const { data } = await db.from("estoque_itens").select("quantidade,qtd_minima").eq("ativo", true);
        const linhas = (data ?? []) as { quantidade: number | null; qtd_minima: number | null }[];
        const falta = linhas.filter((i) => (i.quantidade ?? 0) <= 0 || ((i.qtd_minima ?? 0) > 0 && (i.quantidade ?? 0) <= (i.qtd_minima ?? 0))).length;
        return [{ label: "Itens em falta", valor: falta, urgente: falta > 0 }, { label: "Itens cadastrados", valor: linhas.length, urgente: false }];
      } catch { return []; }
    }
    default:
      return [];   // Marketing/Vendas/Administrativo → sem números de chão de fábrica
  }
}

// Cache 2 min por setor.
const cache = new Map<string, { at: number; portal: Portal }>();
const TTL = 2 * 60 * 1000;

// Portal da pessoa (via colaborador vinculado). null se sem vínculo/setor ou
// setor sem prioridades. Só chamar em entrada/retorno (início de turno).
export async function portalParaPessoa(colaboradorId: string | null): Promise<Portal | null> {
  if (!colaboradorId) return null;
  let dep: string | null = null;
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("employees").select("departamento,setor").eq("id", colaboradorId).maybeSingle();
    dep = (data?.departamento as string) || (data?.setor as string) || null;
  } catch { return null; }
  if (!dep) return null;

  const hit = cache.get(dep);
  if (hit && Date.now() - hit.at < TTL) return hit.portal.itens.length ? hit.portal : null;

  const itens = await itensDoSetor(dep);
  const portal: Portal = { setor: dep, itens };
  cache.set(dep, { at: Date.now(), portal });
  return itens.length ? portal : null;
}
