import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { authorizeDevice, deviceAuthFailure } from "../_device";
import { freioDevice, origemDe, resposta429 } from "../_freio";
import { isColunaAusente } from "@/lib/estoque-colunas";
import {
  assinaturaDoCatalogo, montarCatalogo, type ItemCru, type LinhaCatalogo, type LocalDoGalpao,
} from "@/lib/estoque-catalogo-consulta";

export const dynamic = "force-dynamic";

// Teto da sincronização. O galpão tem 192 itens hoje; 1000 dá espaço de sobra
// e ainda assim a resposta cabe em ~100 KB. Estourar o teto não pode passar
// calado: o aparelho recebe `truncado` e diz na tela que a busca não cobre o
// catálogo inteiro — senão a pessoa procura, não acha, e conclui que o item
// não existe.
const LIMITE = 1000;

// As colunas depois de supabase/estoque_hierarquia_unidades.sql. `sku` e
// `local_id` nascem lá; num banco onde o SQL não rodou o `select` inteiro
// volta 42703 e a consulta morreria — por isso o fallback abaixo.
const COLUNAS = "id,nome,sku,categoria,unidade,quantidade,local_id";
const COLUNAS_LEGADO = "id,nome,categoria,unidade,quantidade";

/**
 * GET /api/estoque/device/catalogo — "quantos temos disso, e onde fica?"
 *
 * É a função que o tablet passa a ter ANTES de qualquer fila existir. As três
 * telas de trabalho (Bipar, Receber, Conferir) são filas: enquanto ninguém
 * recebeu mercadoria, concluiu atividade nem etiquetou peça, elas estão vazias
 * com razão. Consultar o estoque usa o dado que JÁ está lá — 192 itens — e
 * serve desde o primeiro dia.
 *
 * ── Por que não vem no bootstrap ──
 * O bootstrap roda a cada ciclo do worker. Enfiar o catálogo nele seria mandar
 * ~40 KB por ciclo por aparelho pra dizer "nada mudou" — exatamente o padrão
 * que estourou o egress do Supabase em julho. Aqui o aparelho manda a
 * assinatura que já tem (`?assinatura=`) e o caso comum responde
 * `{ mudou: false }`, 20 bytes. A rota também não é chamada por timer nenhum:
 * quem a chama é o login e a abertura da tela de consulta — gente, não relógio.
 */
export async function GET(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta429();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();

  const db = createSupabaseAdminClient();
  let itens: LinhaCatalogo[];
  let truncado = false;
  try {
    const lido = await lerCatalogo(db);
    itens = lido.itens;
    truncado = lido.truncado;
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String((e as Error)?.message ?? e).slice(0, 160) }, { status: 500 });
  }

  const assinatura = assinaturaDoCatalogo(itens);
  // O tick comum: a assinatura bate e o catálogo NÃO viaja de novo.
  if (req.nextUrl.searchParams.get("assinatura") === assinatura) {
    return NextResponse.json({ mudou: false, assinatura });
  }
  return NextResponse.json({ mudou: true, assinatura, truncado, itens });
}

type Db = ReturnType<typeof createSupabaseAdminClient>;

async function lerCatalogo(db: Db): Promise<{ itens: LinhaCatalogo[]; truncado: boolean }> {
  // Só item ATIVO: o catálogo tem itens desativados que ninguém vai procurar
  // na prateleira, e mostrá-los faria a busca devolver material que saiu de
  // linha como se estivesse lá.
  const consulta = (colunas: string) =>
    db.from("estoque_itens").select(colunas).eq("ativo", true)
      .order("nome", { ascending: true }).limit(LIMITE);

  let { data, error } = await consulta(COLUNAS);
  if (error && isColunaAusente(error)) ({ data, error } = await consulta(COLUNAS_LEGADO));
  if (error) throw error;

  const rows = (data ?? []) as unknown as ItemCru[];
  return { itens: montarCatalogo(rows, await lerLocais(db, rows)), truncado: rows.length >= LIMITE };
}

/**
 * Os locais dos itens lidos — UMA consulta pro lote, nunca embed por item.
 *
 * Tolerante de propósito: `estoque_locais` nasce no SQL que roda na mão, e o
 * galpão tem ZERO locais cadastrados hoje. Sem a tabela (ou sem local nenhum)
 * a consulta continua respondendo a pergunta principal — "quantos temos
 * disso" — e a linha simplesmente não traz onde fica.
 */
async function lerLocais(db: Db, rows: ItemCru[]): Promise<LocalDoGalpao[]> {
  const ids = [...new Set(rows.map((r) => String(r.local_id ?? "")).filter(Boolean))].slice(0, 500);
  if (!ids.length) return [];
  try {
    const { data } = await db.from("estoque_locais").select("id,codigo,nome").in("id", ids).limit(500);
    return (data ?? []) as LocalDoGalpao[];
  } catch {
    return [];
  }
}
