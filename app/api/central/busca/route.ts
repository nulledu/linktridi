import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { buscarPedidos } from "@/lib/comercial-pedidos";
import { PODE_RESOLVER } from "@/lib/central-solicitacoes";

export const dynamic = "force-dynamic";

// Camada REMOTA da busca universal — do Início da Central e da paleta ⌘K.
//
// Os DOIS chamam esta rota, e é por isso que tarefa e solicitação estão aqui
// embaixo mesmo já existindo na camada local do Início. Eram duas buscas
// diferentes com o mesmo desenho: o ⌘K achava só PÁGINA, a barra do meio achava
// conteúdo. Quem aprendia o atalho ficava com a busca pior. Agora a resposta é
// a mesma nos dois lugares — o Início continua com a camada local por cima
// (instantânea, sem rede) e descarta o que voltar repetido, casando pelo `id`.
//
// Não é poll: é reação a digitação, com 2 letras de mínimo, 250ms de debounce e
// a requisição anterior abortada a cada tecla, tudo do lado do cliente. Cada
// tipo tem colunas nomeadas e `.limit(5)`.
//
// Cada bloco é liberado pelo acesso da PESSOA, e a checagem é aqui e não só na
// tela: esconder o resultado no cliente não impede um GET direto na rota. Quem
// não tem Estoque não recebe produto — e nem chega a consultar a tabela.
const TETO = 5;

/** PostgREST usa vírgula e parênteses como sintaxe do `or`; `%` e `*` são curinga. */
const limpar = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const termo = limpar((req.nextUrl.searchParams.get("q") || "").trim()).slice(0, 60);
  if (termo.length < 2) return NextResponse.json({ itens: [] });

  const chaves = await resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username });
  const tem = (k: string) => chaves.includes(k);
  const db = createSupabaseAdminClient();

  // Tarefa não tem chave de módulo: é da PESSOA. O recorte é o mesmo de
  // `listMinhasTarefas` (responsável ou criador), menos as concluídas — achar
  // de volta o que já se fechou não é o que se procura numa busca.
  const tarefasDela = async () => {
    const { data, error } = await db.from("tarefas")
      .select("id,titulo,status,origem_label,prazo")
      .or(`responsavel_id.eq.${me.id},criador_id.eq.${me.id}`)
      .neq("status", "concluida")
      .ilike("titulo", `%${termo}%`).limit(TETO);
    return error ? [] : (data ?? []);
  };

  // Solicitação que a pessoa pode RESOLVER — o mesmo critério do contador do
  // Início e da caixa de entrada. Quem resolve a fila do setor vê todas as
  // pendentes que não escreveu; quem não resolve vê só as endereçadas a si, e
  // `destinatario_id` chega por SQL que o usuário roda à mão: sem a coluna, o
  // bloco devolve vazio em vez de derrubar a busca inteira.
  const podeResolver = PODE_RESOLVER.includes(me.role);
  const solicitacoesDele = async () => {
    const base = () => db.from("central_solicitacoes")
      .select("id,titulo,tipo,setor_destino,status,autor_id")
      .eq("status", "pendente").neq("autor_id", me.id)
      .ilike("titulo", `%${termo}%`).limit(TETO);
    const { data, error } = podeResolver ? await base() : await base().eq("destinatario_id", me.id);
    return error ? [] : (data ?? []);
  };

  const [pessoas, produtos, pedidos, tarefas, solicitacoes] = await Promise.all([
    tem("colaboradores")
      ? db.from("profiles").select("id,name,username,role")
          .or(`name.ilike.%${termo}%,username.ilike.%${termo}%`).limit(TETO)
      : Promise.resolve({ data: null }),
    tem("estoque")
      ? db.from("estoque_itens").select("id,nome,sku,categoria")
          .or(`nome.ilike.%${termo}%,sku.ilike.%${termo}%`).limit(TETO)
      : Promise.resolve({ data: null }),
    tem("comercial") ? buscarPedidos(termo).catch(() => []) : Promise.resolve([]),
    tarefasDela().catch(() => []),
    solicitacoesDele().catch(() => []),
  ]);

  type Linha = { id: string; tipo: string; titulo: string; sub: string; href: string; icon: string };
  const itens: Linha[] = [];

  // `tf_`/`sl_` são os MESMOS prefixos da camada local do Início — é por eles
  // que ela descarta o repetido. Mudar um lado sem o outro faz cada tarefa
  // aparecer duas vezes na lista.
  for (const t of (tarefas as { id: string; titulo: string; origem_label: string | null; prazo: string | null }[])) {
    itens.push({
      id: `tf_${t.id}`, tipo: "tarefa", titulo: t.titulo,
      sub: t.origem_label || (t.prazo ? `Prazo ${t.prazo}` : "Tarefa"),
      href: "/central/tarefas", icon: "checklist",
    });
  }

  for (const s of (solicitacoes as { id: string; titulo: string; tipo: string; setor_destino: string | null }[])) {
    itens.push({
      id: `sl_${s.id}`, tipo: "solicitacao", titulo: s.titulo,
      sub: `Solicitação · ${s.setor_destino || s.tipo}`,
      href: "/central/solicitacoes", icon: "inbox",
    });
  }

  for (const p of (pessoas.data ?? []) as { id: string; name: string | null; username: string; role: string | null }[]) {
    itens.push({
      id: `ps_${p.id}`, tipo: "pessoa", titulo: p.name || p.username,
      sub: `@${p.username}${p.role ? ` · ${p.role}` : ""}`,
      // A ficha não tem rota própria: a lista de Pessoas abre já filtrada.
      href: `/colaboradores?busca=${encodeURIComponent(p.name || p.username)}`,
      icon: "user",
    });
  }

  for (const it of (produtos.data ?? []) as { id: string; nome: string; sku: string | null; categoria: string | null }[]) {
    itens.push({
      id: `pd_${it.id}`, tipo: "produto", titulo: it.nome,
      sub: [it.sku, it.categoria].filter(Boolean).join(" · ") || "Estoque",
      href: `/estoque?busca=${encodeURIComponent(it.sku || it.nome)}`,
      icon: "package",
    });
  }

  for (const p of (pedidos as { ref: string; cliente: string; quando: string | null }[])) {
    itens.push({
      id: `pe_${p.ref}`, tipo: "pedido", titulo: p.cliente,
      sub: `Pedido #${p.ref}${p.quando ? ` · ${p.quando.slice(0, 10).split("-").reverse().join("/")}` : ""}`,
      href: `/comercial?pedido=${encodeURIComponent(p.ref)}`,
      icon: "receipt",
    });
  }

  return NextResponse.json({ itens }, { headers: { "Cache-Control": "no-store" } });
}
