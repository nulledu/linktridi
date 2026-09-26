import { after } from "next/server";
import { headers } from "next/headers";
import {
  dispositivoDe, ehPrefetch, ehRobo, paisDaRequisicaoDaVitrine, ufDaRequisicao,
  type Canal,
} from "@/lib/lojas-analytics";
import { CAB } from "@/lib/lojas-visitante";
import { registrarAcesso } from "@/lib/lojas-analytics-db";

/**
 * Registra a visualização de uma página da vitrine.
 *
 * Chamada de dentro da página, e o trabalho todo acontece em `after()` — ou
 * seja, DEPOIS que o HTML já saiu para quem está comprando. O visitante não
 * espera um milissegundo pelo analytics, e a gravação não custa invocação
 * nenhuma: ela pega carona na invocação que a página já ia gastar.
 *
 * Era esse o motivo de não usar pixel. Ver o cabeçalho de `lib/lojas-analytics.ts`.
 */
export async function registrarVisualizacao(lojaId: string, template: string, caminho: string): Promise<void> {
  const h = await headers();

  const visitante = h.get(CAB.visitante);
  const sessao = h.get(CAB.sessao);
  // Sem identidade não há o que contar. Acontece em três casos, e todos são
  // deliberados: robô e prefetch (o middleware não dá cookie a eles) e a
  // requisição que não passou pelo middleware.
  if (!visitante || !sessao) return;

  // Segunda checagem, e não é redundância boba: os cabeçalhos `x-lj-*` chegam
  // da requisição, e requisição é coisa que se forja. O middleware limpa e
  // reescreve, mas a página é quem renderiza o dado — conferir aqui é o que
  // impede alguém de inflar o relatório de um lojista com `curl`.
  if (ehRobo(h.get("user-agent")) || ehPrefetch(h)) return;

  const acesso = {
    lojaId,
    visitante,
    sessao,
    novo: h.get(CAB.novo) === "1",
    primeira: h.get(CAB.primeira) === "1",
    // Sem a query: `?utm_source=x` não é uma página diferente, e contá-la como
    // tal encheria o relatório de "páginas mais vistas" com a mesma página.
    caminho: caminho.split("?")[0],
    template,
    uf: ufDaRequisicao(h),
    pais: paisDaRequisicaoDaVitrine(h),
    dispositivo: dispositivoDe(h.get("user-agent")),
    canal: (h.get(CAB.canal) || "direto") as Canal,
    fonte: h.get(CAB.fonte),
    campanha: h.get(CAB.campanha),
    referencia: null,
  };

  after(() => registrarAcesso(acesso));
}
