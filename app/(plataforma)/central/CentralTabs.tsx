"use client";
import { usePathname } from "next/navigation";
import { Abas } from "../ui/Abas";

// Cada aba responde a uma pergunta diferente: pra onde eu vou, o que eu tenho
// pra fazer, o que estão me pedindo, quanto eu trabalhei, e como faço alguma
// coisa no sistema.
//
// Eram seis, caíram pra três, e o Início voltou — mas não como era. O antigo
// era uma grade de atalhos pras abas que já estavam na fileira logo acima dele:
// uma parada obrigatória que não dizia nada. Este tem busca de conteúdo
// (tarefa, pessoa, produto, pedido) e número vivo em cada destino, e é por isso
// que ele existe: ele responde antes de você clicar.
//
// "Solicitações" voltou a ser aba própria. Ela tinha sido fundida em "Tarefas"
// com o argumento de que um pedido é uma tarefa que alguém te mandou — verdade
// pra quem recebe, e só. Tarefa se CONCLUI; solicitação se APROVA ou se RECUSA,
// com motivo e com imagem. Fundidas, a lista carregava um item sem caixinha pra
// marcar, um filtro que só valia pra ele e um painel de detalhe paralelo.
//
// "Mensagens" segue fora daqui — tem entrada própria na barra lateral, e
// comunicação síncrona não é fluxo de trabalho.
//
// `naBarra`: este destino JÁ está na barra de baixo do celular, que é fixa e
// fica ao alcance do polegar. Repetir aqui dava três caminhos pro mesmo lugar
// (gaveta + esta fileira + barra de baixo). No computador não há barra de
// baixo, então lá a aba continua — a fileira é a navegação de seção de verdade.
const TABS = [
  { href: "/central", label: "Início", naBarra: true },
  { href: "/central/tarefas", label: "Tarefas" },
  { href: "/central/solicitacoes", label: "Solicitações" },
  { href: "/central/banco-horas", label: "Meu ponto" },
  { href: "/central/suporte", label: "Suporte" },
];

export function CentralTabs({ rotaDeProva }: {
  /**
   * Só a página `/dev-mobile` usa isto. Ali o `pathname` é `/dev-mobile`, então
   * nenhuma aba casa e a fileira aparece sem indicador nenhum — o que torna
   * impossível conferir sem login justamente a peça que mais precisa de
   * conferência visual: a pílula que viaja.
   */
  rotaDeProva?: string;
} = {}) {
  const real = usePathname();
  const pathname = rotaDeProva ?? real;
  const ativo = TABS.find((t) =>
    t.href === "/central" ? pathname === "/central" : pathname.startsWith(t.href))?.href ?? "";

  return (
    // A folga abaixo é da NAVEGAÇÃO, não da página: sem ela o título nascia
    // encostado na fileira de abas (medido: 0px entre as duas) e os dois liam
    // como um bloco só. Fica aqui, e não no `.ui-abas` da fundação, porque as
    // outras 30 fileiras do sistema são de conteúdo — nem toda aba precisa de
    // respiro, esta precisa por estar acima do cabeçalho da página.
    <div style={{ marginBottom: 18 }}>
      {/* O indicador é UMA pílula que viaja entre as abas, em vez de a cor sumir
          de uma e aparecer na outra. Trocar de seção deixou de ser um corte. */}
      <Abas
        className="glass"
        ariaLabel="Seções da Central"
        valor={ativo}
        itens={TABS.map((t) => ({
          valor: t.href,
          href: t.href,
          rotulo: t.label,
          // Some no celular quando a barra de baixo já leva ao mesmo lugar.
          // Escondido por CSS, não removido do HTML: a aba ATUAL precisa
          // continuar existindo pro indicador ter o que medir.
          className: t.naBarra && t.href !== ativo ? "desk-only" : undefined,
        }))}
      />
    </div>
  );
}
