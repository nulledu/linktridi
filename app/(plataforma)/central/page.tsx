import { getProfile } from "@/lib/require-auth";
import { redirect } from "next/navigation";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { MODULES, MODULOS_DISCRETOS } from "@/lib/rbac";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { contarNaoLidas } from "@/lib/chat/servidor";
import { listMinhasTarefas } from "@/lib/tarefas";
import { PODE_RESOLVER, listarSolicitacoes } from "@/lib/central-solicitacoes";
import { listAtividadesAtivas } from "@/lib/atividades";
import { meuPontoHoje } from "@/lib/ponto";
import { InicioClient, type Destino, type ItemBusca } from "./inicio/InicioClient";

export const dynamic = "force-dynamic";

/** Primeira letra maiúscula e ponto final — sem duplicar o ponto se já houver. */
const capitalizar = (s: string) => {
  const t = s.trim();
  if (!t) return t;
  return t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".");
};

// A porta da Central: uma busca no meio e quatro destinos com número vivo.
//
// A tela de boas-vindas ANTIGA foi removida por bom motivo — era uma grade de
// atalhos para as mesmas abas que já estavam na fileira logo acima dela, uma
// parada obrigatória que não acrescentava nada. Esta é diferente em duas
// coisas, e as duas são o motivo de ela existir: a busca acha CONTEÚDO (tarefa,
// pessoa, produto, pedido), não só a página; e cada destino chega com o número
// que responde à pergunta antes do clique ("3 precisam de você", "na empresa
// desde 08:12").
//
// Sem poll: é tela de passagem, não de monitoramento. Os números são do
// instante em que a página carregou, e voltar pra cá recarrega.
export default async function CentralInicioPage() {
  const me = await getProfile();
  if (!me) redirect("/login");

  const db = createSupabaseAdminClient();
  // Tudo em paralelo: nenhuma leitura depende da outra.
  const [chaves, tarefas, atividades, solicitacoes, naoLidas, ponto] = await Promise.all([
    resolveMyModuleKeys({ id: me.id, role: me.role, username: me.username }),
    listMinhasTarefas(me.id).catch(() => []),
    listAtividadesAtivas({ para_id: me.id }).catch(() => []),
    listarSolicitacoes().catch(() => []),
    contarNaoLidas(db, me.id).catch(() => ({ total: 0, mencoes: 0 })),
    meuPontoHoje(me.id).catch(() => null),
  ]);

  // "Precisa de você" = o que está em aberto E é seu pra resolver. Concluída
  // não conta, e solicitação que VOCÊ mandou também não — ela está esperando
  // outra pessoa. Um número que inclui o que já foi resolvido é um número que
  // ensina a pessoa a não olhar pro número.
  //
  // O critério de "é minha" é o mesmo `podeResolverEsta` da caixa de entrada
  // (destinatário direto, ou papel que resolve a fila do setor): se o card
  // dissesse 7 e a lista abrisse com 2, o card estaria mentindo.
  const podeResolver = PODE_RESOLVER.includes(me.role);
  const emAberto = tarefas.filter((t) => t.status !== "concluida").length
    + atividades.filter((a) => a.status !== "concluida").length;
  const minhasSolic = solicitacoes.filter((s) =>
    s.status === "pendente" && s.autor_id !== me.id && (podeResolver || s.destinatario_id === me.id));
  const pendentes = minhasSolic.length;

  const tem = (k: string) => chaves.includes(k);

  // `meuPontoHoje` devolve o rótulo como pedaço de frase, minúsculo e sem
  // ponto ("na empresa desde" + "07:58"), porque quem o escreveu montava outra
  // coisa com ele. No card ele virava a linha inteira e ficava do lado de "O
  // que você tem pra fazer." — duas frases na mesma fileira, uma com maiúscula
  // e ponto e a outra sem, lendo como se viessem de sistemas diferentes.
  const frasePonto = ponto
    ? capitalizar(`${ponto.rotulo}${ponto.desde ? ` ${ponto.desde}` : ""}`)
    : "Suas horas e seu banco.";

  // `numero: 0` (e não `null`) nos destinos que CONTAM: zerado é resposta.
  // Ver o comentário de `Destino` — `null` fica só pra quem não tem contador.
  const destinos: Destino[] = [
    {
      href: "/central/tarefas", icon: "checklist", titulo: "Tarefas",
      linha: "O que você tem pra fazer.",
      numero: emAberto,
      unidade: "em aberto",
      vazio: "Nada em aberto",
    },
    {
      href: "/central/solicitacoes", icon: "inbox", titulo: "Solicitações",
      linha: "Pedidos esperando a sua resposta.",
      numero: pendentes,
      unidade: "esperando você",
      vazio: "Nada esperando você",
    },
    {
      href: "/central/banco-horas", icon: "clock", titulo: "Meu ponto",
      linha: frasePonto,
      numero: null, unidade: null,
    },
    ...(tem("mensagens") ? [{
      href: "/mensagens", icon: "message", titulo: "Mensagens",
      linha: "Conversas dos setores e diretas.",
      numero: naoLidas.total,
      unidade: naoLidas.mencoes ? `não lidas · ${naoLidas.mencoes} citam você` : naoLidas.total === 1 ? "não lida" : "não lidas",
      vazio: "Tudo lido",
    } satisfies Destino] : []),
    {
      href: "/central/suporte", icon: "lifebuoy", titulo: "Suporte",
      linha: "Como se faz cada coisa no sistema.",
      numero: null, unidade: null,
    },
  ];

  // Camada local da busca: páginas que a pessoa pode abrir + o que a Central já
  // tem em mãos. Zero rede — o resultado aparece na mesma tecla.
  const paginas: ItemBusca[] = MODULES
    .filter((m) => chaves.includes(m.key) && !MODULOS_DISCRETOS.has(m.key))
    .map((m) => ({ id: `pg_${m.key}`, tipo: "pagina", titulo: m.label, sub: "Ir para", href: m.href, icon: m.icon }));

  const locais: ItemBusca[] = [
    ...paginas,
    ...tarefas.filter((t) => t.status !== "concluida").slice(0, 60).map((t) => ({
      id: `tf_${t.id}`, tipo: "tarefa" as const, titulo: t.titulo,
      sub: t.origemLabel || (t.prazo ? `Prazo ${t.prazo}` : "Tarefa"),
      href: "/central/tarefas", icon: "checklist",
    })),
    ...minhasSolic.slice(0, 60).map((s) => ({
      id: `sl_${s.id}`, tipo: "solicitacao" as const, titulo: s.titulo,
      sub: `Solicitação · ${s.setor_destino || s.tipo}`, href: "/central/solicitacoes", icon: "inbox",
    })),
  ];

  return (
    <InicioClient
      nome={(me.name || me.username || "").split(" ")[0]}
      destinos={destinos}
      locais={locais}
      podeBuscarPessoas={tem("colaboradores")}
      podeBuscarEstoque={tem("estoque")}
      podeBuscarPedidos={tem("comercial")}
    />
  );
}
