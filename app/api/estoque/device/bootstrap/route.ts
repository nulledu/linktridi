import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { MOTIVOS_BAIXA } from "@/lib/estoque-unidades";
import { lerConfigImpressao, lerSkusDeCaixa } from "@/lib/estoque-etiqueta-config";
import { trabalhosParaOTablet } from "@/lib/estoque-impressao-fila";
import { authorizeDevice, deviceAuthFailure } from "../_device";
import { saltDoDispositivo, verificadorDeCodigo } from "../_sessao";
import { freioDevice, origemDe, resposta429 } from "../_freio";

export const dynamic = "force-dynamic";

// GET /api/estoque/device/bootstrap — o "estado do mundo" que o leitor precisa
// pra funcionar sem rede: diretório de operadores (código → verificador, o
// código em si NUNCA sai daqui), motivos de baixa e as compras aguardando
// entrega. Chamado no login do aparelho e depois em ritmo baixo (não é poll de
// tela — é o próprio aparelho decidindo quando resincronizar seu estado local).
export async function GET(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta429();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();
  const device = auth.device;
  const db = createSupabaseAdminClient();

  return NextResponse.json({
    operadores: await diretorioDeOperadores(db, device.id),
    salt: saltDoDispositivo(device.id),
    motivos: MOTIVOS_BAIXA.map((m) => ({ key: m.key, label: m.label })),
    compras: await comprasAguardandoEntrega(db),
    impressao: await impressaoDoEscritorio(db),
    // Os trabalhos de impressão que o escritório mandou pra ESTE aparelho.
    //
    // Pegam carona aqui, e não numa rota própria com ritmo próprio, porque uma
    // fila de impressão convida a um poll de dois segundos — e este projeto já
    // caiu duas vezes por consumo, a segunda por INVOCAÇÕES (um tick que
    // responde 20 bytes custa uma execução inteira). O bootstrap já roda a cada
    // ciclo do worker; anexar a fila a ele custa uma consulta a mais no mesmo
    // ciclo, e no ciclo comum ela volta VAZIA.
    //
    // O preço é o atraso: até ~15 minutos entre apertar o botão e o papel sair.
    // Ele é aceitável porque está DITO na tela antes do clique — quem precisa
    // de papel agora usa a folha A4 do navegador, que não passa por aqui.
    trabalhos: await trabalhosParaOTablet(db, device.id),
  });
}

/**
 * Como o escritório decidiu que a etiqueta sai, e quais SKUs são CAIXA.
 *
 * Desce por AQUI e não por uma rota nova porque o bootstrap já é o canal do
 * "estado do mundo" do aparelho — e porque o tablet trabalha OFFLINE: uma rota
 * que ele precisasse chamar na hora de imprimir seria uma rota que falha
 * exatamente no meio do galpão, onde não há Wi-Fi. Ele guarda o que recebeu e
 * imprime com a última configuração conhecida.
 *
 * `definida: false` quer dizer "ninguém decidiu ainda" (o SQL não rodou), e o
 * tablet então CONTINUA MANDANDO no próprio ajuste. É a diferença entre um
 * silêncio e uma ordem: mandar 15mm como se fosse decisão do escritório
 * travaria todos os aparelhos num número que ninguém escolheu.
 */
async function impressaoDoEscritorio(db: ReturnType<typeof createSupabaseAdminClient>) {
  const config = await lerConfigImpressao(db);
  const { skus } = await lerSkusDeCaixa(db);
  return {
    definida: config.definida,
    alturaMm: config.alturaMm,
    larguraMm: config.larguraMm,
    copias: config.copias,
    // Os campos que o escritório mandou NÃO imprimir. Vem a lista dos
    // DESLIGADOS (o normal é vazia) e não a dos ligados: um campo novo numa
    // versão futura do ERP nasce ligado num tablet antigo, em vez de sumir da
    // etiqueta porque a lista que ele conhece não o citava.
    ocultos: config.ocultos,
    // Só os SKUs que FOGEM do padrão viajam — o normal é este vetor vir vazio,
    // que é o mesmo cuidado do resto do bootstrap (ver o comentário do
    // catálogo em net/Contracts.kt: nada de mandar a lista inteira por ciclo).
    caixas: skus,
  };
}

interface Operador { id: string; nome: string; verificador: string }

// Quem tem CÓDIGO DE ACESSO e está ativo entra no diretório — o mesmo desenho
// do totem do mercadinho, e pela mesma razão: quem manda aqui é o APARELHO, não
// a pessoa. O leitor é um kiosk físico no galpão, ativado por um admin e
// travado em lock task; bipar nele é "entrou material / saiu material", a
// operação de quem trabalha ali, não um poder à parte como mexer em orçamento.
//
// Antes isto exigia `estoque:bipar` por pessoa. Na prática significava liberar
// um a um vinte pessoas que fazem isso o dia inteiro — atrito puro, e pior:
// gravar a permissão liga o modelo NOVO de acesso pra quem ainda está no
// acesso por NÍVEL, que passaria a ter só o que o objeto listasse. O controle
// de quem bipa é o cadastro do código, que já existe e é por pessoa.
//
// A sub `estoque:bipar` continua existindo — ela gateia a aba Bipar DENTRO do
// ERP web, que é outra superfície: navegador com sessão, sem kiosk nenhum.
async function diretorioDeOperadores(db: ReturnType<typeof createSupabaseAdminClient>, deviceId: string): Promise<Operador[]> {
  // employees.codigo_acesso pode não existir ainda (supabase/estoque_dispositivos.sql
  // não rodado) — tolerante: sem a coluna, diretório vazio em vez de derrubar
  // o bootstrap inteiro (compras/motivos continuam funcionando).
  const { data: comCodigo, error } = await db
    .from("employees").select("id,codigo_acesso").not("codigo_acesso", "is", null).limit(200);
  if (error || !comCodigo?.length) return [];

  const codigoPorId = new Map<string, string>(
    (comCodigo as { id: string; codigo_acesso: string }[]).map((e) => [String(e.id), e.codigo_acesso]),
  );

  const { data: perfis } = await db
    .from("profiles").select("id,username,name,role,active")
    .in("id", [...codigoPorId.keys()]).eq("active", true).limit(200);

  const salt = saltDoDispositivo(deviceId);
  const candidatos = (perfis ?? []) as { id: string; name: string; active: boolean }[];
  return candidatos.flatMap((p) => {
    const codigo = codigoPorId.get(p.id);
    if (!codigo) return [];
    return [{ id: p.id, nome: p.name, verificador: verificadorDeCodigo(codigo, salt) } satisfies Operador];
  });
}

interface CompraPendente { id: string; itemNome: string; quantidade: number; fornecedor: string | null; previsao: string | null }

async function comprasAguardandoEntrega(db: ReturnType<typeof createSupabaseAdminClient>): Promise<CompraPendente[]> {
  try {
    const { data } = await db
      .from("compras")
      .select("id,item_nome,quantidade_comprada,quantidade_recebida,fornecedor,previsao_entrega")
      .eq("status", "aguardando_entrega")
      .order("previsao_entrega", { ascending: true, nullsFirst: false })
      .limit(200);
    return ((data ?? []) as {
      id: string; item_nome: string; quantidade_comprada: number; quantidade_recebida: number;
      fornecedor: string | null; previsao_entrega: string | null;
    }[]).map((c) => ({
      id: c.id, itemNome: c.item_nome,
      // O que ainda falta chegar, não o total pedido — é o número que importa
      // pra quem vai conferir a entrega no galpão.
      quantidade: Math.max(0, Number(c.quantidade_comprada || 0) - Number(c.quantidade_recebida || 0)),
      fornecedor: c.fornecedor, previsao: c.previsao_entrega,
    }));
  } catch { return []; }
}
