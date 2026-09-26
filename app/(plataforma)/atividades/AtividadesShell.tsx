"use client";

// ── A área Atividades, em abas ───────────────────────────────────────────────
// Visão geral (os números, as recentes, os produtos e as matérias-primas),
// Histórico (as recusadas no tablet esperando supervisor, em cima do kanban
// único: Pendente, Em andamento, Concluída e Cancelada) e
// O histórico continua em rota
// própria, pelo botão "Produção de verdade" do quadro.
//
// A Visão geral manda PEDIDOS pro quadro ("nova atividade já
// com esta tarefa", "mostre só esta tarefa"): trocam de aba e o quadro cumpre.
// `n` muda a cada pedido — dois cliques iguais seguidos também funcionam.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSticky } from "../useSticky";
import { Abas } from "../ui/Abas";
import { PageHead, agoLabel } from "../ui/mobile";
import { Icon } from "../Icon";
import { Historico, type PedidoAoHistorico } from "./Historico";
import { BotaoCodigoSupervisor } from "./CodigoSupervisor";
import { FilaRecusadas } from "./FilaRecusadas";
import type { Recusada } from "@/lib/atividades-recusadas";
import { VisaoGeral, type PedidoAoQuadro, type PedidoDeNova } from "./VisaoGeral";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";
import type { ItemDaVisao, LinhaDeModelo, PresencaDaEquipe } from "@/lib/atividades-visao";
import type { NivelAtividades } from "@/lib/atividades-acesso";
import type { GrupoDaVisao } from "@/lib/atividades-lancador";

type Aba = "visao" | "historico";

export function AtividadesShell({ pode, colaboradores, initial, canceladas = [], modelos, itensVisao, personalizado = false, grupos = [], configPronta = true, presenca = null, recusadas = [] }: {
  pode: Record<NivelAtividades, boolean>;
  colaboradores: Colaborador[];
  initial: Atividade[];
  /** As canceladas (status `cancelada`), que ficam fora das listas de trabalho
   *  e só existem na coluna Cancelada do Histórico. */
  canceladas?: Atividade[];
  modelos: LinhaDeModelo[];
  itensVisao: ItemDaVisao[];
  /** A seção de itens mostra a escolha do "Personalizar" (e não o padrão). */
  personalizado?: boolean;
  /** Categorias criadas à mão ("Almofada" com os tamanhos dentro). */
  grupos?: GrupoDaVisao[];
  /** Tabela da escolha/grupos existe (supabase/atividades_itens_da_visao.sql rodou). */
  configPronta?: boolean;
  /** Quem o ponto diz que está na empresa agora — as bolinhas da equipe. */
  presenca?: PresencaDaEquipe | null;
  /** Recusadas no tablet esperando supervisor (só vem pra atividades:autorizar). */
  recusadas?: Recusada[];
}) {
  const router = useRouter();
  const [abaSalva, setAba] = useSticky<Aba>("atividades.aba", "visao");
  // Quem deixou salvo o antigo "calendario" volta pra Visão geral.
  const aba: Aba = abaSalva === "historico" ? "historico" : "visao";
  const [pedido, setPedido] = useState<PedidoAoHistorico | undefined>(undefined);
  const [lidoEm, setLidoEm] = useState(() => new Date().toISOString());
  const [atualizando, iniciar] = useTransition();
  useEffect(() => { setLidoEm(new Date().toISOString()); }, [initial]);

  const abrirQuadro = (p?: PedidoAoQuadro) => { setPedido({ n: Date.now(), busca: p?.busca ?? "" }); setAba("historico"); };
  const novaAtividade = () => { setPedido({ n: Date.now(), nova: true }); setAba("historico"); };

  const atualizado = <RotuloAtualizado lidoEm={lidoEm} atualizando={atualizando} onAtualizar={() => iniciar(() => router.refresh())} />;

  return (
    <div>
      <PageHead title="Atividades" sub="Gerencie as atividades da equipe, acompanhe o progresso e mantenha tudo em dia."
        right={pode.autorizar
          ? <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>{atualizado}<BotaoCodigoSupervisor /></div>
          : atualizado} />
      <Abas<Aba>
        itens={[
          { valor: "visao", rotulo: <><Icon name="home" size={17} /> Visão geral</> },
          { valor: "historico", rotulo: <><Icon name="checkbox" size={17} /> Histórico</> },
        ]}
        valor={aba} onMuda={setAba} ariaLabel="Seções de Atividades"
      />
      <div style={{ marginTop: 20 }}>
        {aba === "visao" && (
          <VisaoGeral
            lista={initial} colaboradores={colaboradores} modelos={modelos} itens={itensVisao}
            podeAtribuir={pode.atribuir} podeConfigurar={pode.configurar} personalizado={personalizado} grupos={grupos}
            configPronta={configPronta} presenca={presenca}
            onAbrirQuadro={abrirQuadro} onNovaAtividade={novaAtividade}
          />
        )}
        {aba === "historico" && pode.autorizar && <FilaRecusadas recusadas={recusadas} />}
        {aba === "historico" && (
          <Historico
            lista={initial} canceladas={canceladas} colaboradores={colaboradores}
            itens={itensVisao} grupos={grupos} modelos={modelos}
            podeAtribuir={pode.atribuir} podeConfigurar={pode.configurar} pedido={pedido}
          />
        )}
      </div>
    </div>
  );
}

// Relógio do "Atualizado há X" isolado numa folha: o tick de 60s repinta SÓ
// este rótulo — antes ele morava no shell e re-renderizava a área inteira de
// Atividades (quadro + histórico) a cada minuto só pra trocar o texto. Mesmo
// padrão do AtualizadoHa do Tráfego.
function RotuloAtualizado({ lidoEm, atualizando, onAtualizar }: { lidoEm: string; atualizando: boolean; onAtualizar: () => void }) {
  const [, tique] = useState(0);
  useEffect(() => { const t = setInterval(() => tique((n) => n + 1), 60_000); return () => clearInterval(t); }, []);
  return (
    <button type="button" className="ui-toque" onClick={onAtualizar} title="Atualizar agora"
      style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "none", background: "none", cursor: "pointer", color: "var(--text-dim)", fontSize: 12.5, padding: "4px 0" }}>
      {atualizando ? "Atualizando…" : `Atualizado ${agoLabel(lidoEm)}`}
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: "var(--ok)" }} />
    </button>
  );
}
