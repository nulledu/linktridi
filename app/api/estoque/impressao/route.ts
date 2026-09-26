import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  lerConfigImpressao, gravarConfigImpressao, lerSkusDeCaixa, validarConfig, FRASE_SEM_SQL,
} from "@/lib/estoque-etiqueta-config";
import { podeLerImpressao, podeConfigurarImpressao, quemEstaPedindo } from "./_gate";

export const dynamic = "force-dynamic";

/**
 * GET /api/estoque/impressao — o que a folha de etiquetas e a tela de
 * configuração precisam saber: a altura da tira, quantas vias saem de cada
 * etiqueta e quais SKUs são CAIXA.
 *
 * Os SKUs vêm em vez dos ids porque o código de uma unidade é
 * `<SKU>-<sequencial>`: quem tem a etiqueta na mão consegue deduzir o tipo sem
 * uma segunda consulta. É a mesma dedução que o tablet faz offline.
 */
export async function GET() {
  const me = await quemEstaPedindo();
  if (!me || !(await podeLerImpressao(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = createSupabaseAdminClient();
  const config = await lerConfigImpressao(db);
  const { skus: caixas, faltaSql: pendente } = await lerSkusDeCaixa(db);

  return NextResponse.json({
    ok: true,
    config: {
      alturaMm: config.alturaMm, larguraMm: config.larguraMm,
      copias: config.copias, ocultos: config.ocultos,
    },
    definida: config.definida,
    atualizadoEm: config.atualizadoEm,
    caixas,
    // Só quando a COLUNA falta. Uma queda de rede também deixa `definida:
    // false`, e mandar "rode o SQL" nesse caso é apontar o dedo pro lugar
    // errado — quem lê a frase é o dono, com o SQL Editor aberto.
    pendente: config.faltaSql || pendente ? FRASE_SEM_SQL : null,
  });
}

/**
 * PATCH /api/estoque/impressao — grava a altura, a largura e o número de vias.
 *
 * ── POR QUE ELE RECUSA EM VEZ DE APARAR ─────────────────────────────────────
 *
 * Antes, um corpo com 200mm de largura era simplesmente preso na faixa e
 * gravado como 72 — e a resposta era `ok`. Quem mandou 200 voltava pro galpão
 * achando que a etiqueta tinha mudado de tamanho, e o papel dizia outra coisa.
 * Conserto silencioso numa ESCRITA é mentira com cara de sucesso.
 *
 * A leitura continua aparando (`normalizarConfig`), e isso não é incoerência: lá
 * o valor certo é conhecido — o padrão do desenho — e a impressão do galpão não
 * pode parar por causa de uma linha antiga fora da faixa. Aqui não há valor
 * certo a supor: há alguém pedindo uma coisa que não existe, e a resposta é a
 * frase que diz por quê.
 *
 * O banco tem o mesmo `check` como última linha. Não é redundância à toa: a
 * tela é a primeira defesa e é a única que um `fetch` na mão contorna.
 */
export async function PATCH(req: NextRequest) {
  const me = await quemEstaPedindo();
  if (!me || !(await podeConfigurarImpressao(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let corpo: { alturaMm?: unknown; larguraMm?: unknown; copias?: unknown; ocultos?: unknown };
  try { corpo = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const problemas = validarConfig(corpo);
  if (problemas.length > 0) {
    return NextResponse.json({ error: "fora_da_faixa", detalhe: problemas.join(" "), problemas }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  const atual = await lerConfigImpressao(db);
  const resultado = await gravarConfigImpressao(db, {
    // Campo ausente mantém o que já estava: a tela salva um ajuste por vez, e
    // um `undefined` virando o padrão do desenho devolveria a altura pra 15mm
    // sem ninguém ter pedido.
    alturaMm: corpo.alturaMm ?? atual.alturaMm,
    larguraMm: corpo.larguraMm ?? atual.larguraMm,
    copias: corpo.copias ?? atual.copias,
    // Lista VAZIA é um pedido ("liga tudo de novo") e não uma ausência, então o
    // `??` tem de olhar `undefined`/`null` e não o tamanho: `[] || atual` (ou um
    // `.length ? :`) deixaria a última caixinha impossível de desmarcar.
    ocultos: corpo.ocultos ?? atual.ocultos,
  }, me.id);

  if (!resultado.ok) {
    if (resultado.motivo === "sem_sql") {
      return NextResponse.json({ error: "schema_desatualizado", detalhe: FRASE_SEM_SQL }, { status: 409 });
    }
    return NextResponse.json({ error: resultado.motivo }, { status: 500 });
  }
  return NextResponse.json({ ok: true, config: resultado.config });
}
