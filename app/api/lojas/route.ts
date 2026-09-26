import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProfileForModule } from "@/lib/require-auth";
import { criarLoja, listLojas, LojasTabelaAusente } from "@/lib/lojas-db";

export const dynamic = "force-dynamic";

// O gate usa a MESMA chave que a página (`requireModule("lojas")` no layout do
// segmento). Divergir aqui é o bug que já derrubou o ERP uma vez: a tela abre e
// toda requisição volta 403, sem ninguém entender por quê.
const gate = () => getProfileForModule("lojas");

export function semTabela() {
  return NextResponse.json(
    { error: "tabela_ausente", detalhe: "Rode o supabase/lojas.sql no Supabase." },
    { status: 409 },
  );
}

export async function GET() {
  if (!(await gate())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ lojas: await listLojas() });
  } catch (e) {
    if (e instanceof LojasTabelaAusente) return semTabela();
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}

const Nova = z.object({ nome: z.string().trim().min(2, "Nome curto demais.").max(80) });

// Como a loja vende. Editável só por quem tem a sub que publica — ligar a
// venda muda o que o público enxerga e passa a gerar pedido de verdade.
const Ajuste = z.object({
  lojaId: z.string().uuid(),
  checkout: z.enum(["nenhum", "whatsapp", "proprio", "ambos"]),
  whatsapp: z.string().trim().max(40).default(""),
});

/**
 * Publicar, pausar ou voltar ao rascunho.
 *
 * Corpo SEPARADO do ajuste de checkout de propósito: são duas decisões
 * diferentes ("como eu vendo" × "a loja está no ar"), e juntá-las num schema só
 * obrigaria a mandar checkout pra publicar.
 */
const AjusteDeStatus = z.object({
  lojaId: z.string().uuid(),
  status: z.enum(["rascunho", "publicada", "pausada"]),
});

/**
 * Nome, logo, favicon e como a loja aparece na busca.
 *
 * Os limites são os do MUNDO, não do banco: 60 caracteres é o que o Google
 * mostra num título antes de cortar, e 160 é o da descrição. Deixar digitar
 * 300 e cortar em silêncio depois é pior que avisar antes.
 */
const AjusteDeIdentidade = z.object({
  lojaId: z.string().uuid(),
  nome: z.string().trim().min(2, "O nome da loja não pode ficar vazio.").max(80, "Nome muito longo."),
  logoUrl: z.string().trim().max(600).default(""),
  faviconUrl: z.string().trim().max(600).default(""),
  seoTitulo: z.string().trim().max(70, "O título passa de 60 caracteres e vai ser cortado na busca.").default(""),
  seoDescricao: z.string().trim().max(180, "A descrição passa de 160 caracteres e vai ser cortada na busca.").default(""),
});

export async function PATCH(req: NextRequest) {
  const { getProfileForAnyModule } = await import("@/lib/require-auth");
  if (!(await getProfileForAnyModule("lojas:publicar"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const corpo = await req.json().catch(() => ({}));

  // Publicar é o caminho curto: sem `checkout` no corpo, é status.
  const st = AjusteDeStatus.safeParse(corpo);
  if (st.success && !("checkout" in (corpo as Record<string, unknown>))) {
    const { ajustarStatus, LojasTabelaAusente } = await import("@/lib/lojas-db");
    try {
      await ajustarStatus(st.data.lojaId, st.data.status);
      return NextResponse.json({ ok: true, status: st.data.status });
    } catch (e) {
      if (e instanceof LojasTabelaAusente) {
        return NextResponse.json(
          { error: "tabela_ausente", detalhe: "Rode o supabase/lojas.sql no Supabase." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
    }
  }

  // Identidade: reconhecida por `nome` no corpo.
  if ("nome" in (corpo as Record<string, unknown>)) {
    const ident = AjusteDeIdentidade.safeParse(corpo);
    if (!ident.success) {
      return NextResponse.json({ error: ident.error.issues[0]?.message ?? "dados_invalidos" }, { status: 400 });
    }
    const { ajustarIdentidade, IdentidadeParcial, LojasTabelaAusente } = await import("@/lib/lojas-db");
    try {
      await ajustarIdentidade(ident.data.lojaId, ident.data);
      return NextResponse.json({ ok: true });
    } catch (e) {
      // Meio caminho: o nome gravou, o resto não. Dizer isso é mais honesto que
      // um "salvo" que esconde metade, e mais útil que um erro que some com o
      // que deu certo.
      if (e instanceof IdentidadeParcial) {
        return NextResponse.json({
          ok: true,
          parcial: true,
          detalhe: "O nome foi salvo. Logo, ícone e busca precisam do supabase/lojas-identidade.sql.",
        });
      }
      if (e instanceof LojasTabelaAusente) {
        return NextResponse.json(
          { error: "tabela_ausente", detalhe: "Rode o supabase/lojas.sql no Supabase." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
    }
  }

  const c = Ajuste.safeParse(corpo);
  if (!c.success) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  const { normalizarWhatsApp, ACEITA_WHATSAPP } = await import("@/lib/lojas");
  const numero = normalizarWhatsApp(c.data.whatsapp);
  // A mesma regra que o banco garante, dita aqui com palavras que a pessoa
  // entende — o erro de constraint diria "lojas_whatsapp_chk".
  if (ACEITA_WHATSAPP(c.data.checkout) && !numero) {
    return NextResponse.json(
      { error: "Para vender pelo WhatsApp, informe um número válido com DDD." },
      { status: 400 },
    );
  }

  try {
    const { ajustarCheckout } = await import("@/lib/lojas-db");
    await ajustarCheckout(c.data.lojaId, c.data.checkout, numero);
    return NextResponse.json({ ok: true, whatsapp: numero });
  } catch (e) {
    if (e instanceof LojasTabelaAusente) return semTabela();
    const msg = String((e as Error).message);
    // A coluna só existe depois do segundo SQL — a mensagem certa é a mesma.
    if (/column .*(checkout|whatsapp).* does not exist|Could not find the '(checkout|whatsapp)' column/i.test(msg)) {
      return NextResponse.json(
        { error: "tabela_ausente", detalhe: "Rode o supabase/lojas-checkout.sql no Supabase." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await gate())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const corpo = Nova.safeParse(await req.json().catch(() => ({})));
  if (!corpo.success) {
    return NextResponse.json({ error: corpo.error.issues[0]?.message ?? "dados_invalidos" }, { status: 400 });
  }
  try {
    return NextResponse.json({ loja: await criarLoja(corpo.data.nome) });
  } catch (e) {
    if (e instanceof LojasTabelaAusente) return semTabela();
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
