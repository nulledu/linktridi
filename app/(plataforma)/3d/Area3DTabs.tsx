"use client";

// ── 3D · a central da operação ───────────────────────────────────────────────
// Seis abas numa porta só: Visão geral · Programação · Kanban · Máquinas ·
// Arquivos · Histórico. Máquinas e programações ATIVAS são carregadas UMA vez
// aqui e compartilhadas (visão geral, kanban, máquinas e programação leem o
// mesmo estado — mudar um status atualiza todas). Arquivos e Histórico buscam
// o próprio dado ao montar: aba que ninguém abriu não paga nada.
//
// Sem poll: a operação muda quando alguém mexe, não sozinha. O refresh é o
// botão Atualizar (e toda escrita já devolve a linha atualizada).

import { useCallback, useEffect, useState } from "react";
import { useSticky } from "../useSticky";
import { toast } from "../Toast";
import { Abas } from "../ui/Abas";
import { PageHead } from "../ui/mobile";
import { Botao, BotaoIcone } from "../ui/controles";
import type { Arquivo3D, Maquina3D, Programacao3D, StatusProgramacao } from "@/lib/impressao3d-const";
import { Biblioteca3D } from "./Biblioteca3D";
import { NovaProgramacao } from "./NovaProgramacao";
import { VisaoGeral3D } from "./VisaoGeral3D";
import { ProgramacaoDia3D } from "./ProgramacaoDia3D";
import { Kanban3D } from "./Kanban3D";
import { Maquinas3D } from "./Maquinas3D";
import { Historico3D } from "./Historico3D";
import type { Pessoa } from "./pecas3d";

type Aba = "visao" | "programacao" | "kanban" | "maquinas" | "arquivos" | "historico";

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "visao", rotulo: "Visão geral" },
  { valor: "programacao", rotulo: "Programação" },
  { valor: "kanban", rotulo: "Kanban" },
  { valor: "maquinas", rotulo: "Máquinas" },
  { valor: "arquivos", rotulo: "Arquivos" },
  { valor: "historico", rotulo: "Histórico" },
];

export function Area3DTabs({ pessoas, provaMaquinas, provaProgramacoes }: {
  pessoas: Pessoa[];
  /** Banco de provas (/dev-3d): dado pronto, sem rede. */
  provaMaquinas?: Maquina3D[];
  provaProgramacoes?: Programacao3D[];
}) {
  const soProva = provaMaquinas != null;
  const [aba, setAba] = useSticky<Aba>("3d.aba", "visao");
  const [maquinas, setMaquinas] = useState<Maquina3D[] | null>(provaMaquinas ?? null);
  const [programacoes, setProgramacoes] = useState<Programacao3D[] | null>(provaProgramacoes ?? null);
  // O painel de programar: null fechado; {edicao} edita; {arquivo} pré-seleciona.
  const [painel, setPainel] = useState<{ edicao: Programacao3D | null; arquivo?: Arquivo3D | null } | null>(null);

  const carregar = useCallback(async () => {
    if (soProva) return;
    const [rm, rp] = await Promise.all([
      fetch("/api/3d/maquinas").then((x) => x.json()).catch(() => null),
      // As ativas + o que terminou recente (a visão geral mostra "concluídas
      // hoje"); o histórico completo é da aba Histórico, com a própria busca.
      fetch("/api/3d/programacoes?limite=300").then((x) => x.json()).catch(() => null),
    ]);
    setMaquinas(rm?.ok ? (rm.maquinas as Maquina3D[]) : []);
    setProgramacoes(rp?.ok ? (rp.programacoes as Programacao3D[]) : []);
    if ((rm && !rm.ok) || (rp && !rp.ok)) toast.erro("Não deu pra carregar a operação 3D.");
  }, [soProva]);
  useEffect(() => { void carregar(); }, [carregar]);

  // ── Mutações compartilhadas ───────────────────────────────────────────────
  const trocarLocal = useCallback((p: Programacao3D) => {
    setProgramacoes((l) => {
      const lista = l ?? [];
      return lista.some((x) => x.id === p.id) ? lista.map((x) => (x.id === p.id ? p : x)) : [p, ...lista];
    });
  }, []);

  const mudarStatus = useCallback(async (p: Programacao3D, status: StatusProgramacao) => {
    if (soProva) { trocarLocal({ ...p, status }); return; }
    // Otimista: o card anda na hora; se a rota recusar, volta.
    trocarLocal({ ...p, status });
    const r = await fetch(`/api/3d/programacoes/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      trocarLocal(p);
      toast.erro("Não deu pra mudar o status.");
      return;
    }
    trocarLocal(r.programacao as Programacao3D);
  }, [soProva, trocarLocal]);

  const abrirProgramacao = useCallback((p: Programacao3D) => setPainel({ edicao: p }), []);
  const programarArquivo = useCallback((a: Arquivo3D) => {
    setPainel({ edicao: null, arquivo: a });
  }, []);

  const prontas = maquinas !== null && programacoes !== null;

  return (
    <div>
      <PageHead
        title="3D"
        sub="A central das impressoras: arquivos, programação, kanban e histórico."
        right={
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <BotaoIcone icone="refresh" titulo="Atualizar" onClick={() => void carregar()} />
            <Botao variante="primario" icone="calendar-plus" onClick={() => setPainel({ edicao: null })}>
              Programar impressão
            </Botao>
          </span>
        }
      />
      {/* ≥6 abas: a faixa rola de lado quando não cabe (regra do kit). */}
      <div style={{ overflowX: "auto", marginBottom: 18 }}>
        <Abas itens={ABAS} valor={aba} onMuda={setAba} ariaLabel="Seções do 3D" />
      </div>

      {!prontas ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Carregando…</div>
      ) : aba === "visao" ? (
        <VisaoGeral3D maquinas={maquinas!} programacoes={programacoes!}
          onAbrir={abrirProgramacao} onStatus={mudarStatus} onIrPara={(a) => setAba(a as Aba)} />
      ) : aba === "programacao" ? (
        <ProgramacaoDia3D programacoes={programacoes!} onAbrir={abrirProgramacao} onStatus={mudarStatus} />
      ) : aba === "kanban" ? (
        <Kanban3D programacoes={programacoes!} onAbrir={abrirProgramacao} onStatus={mudarStatus} />
      ) : aba === "maquinas" ? (
        <Maquinas3D maquinas={maquinas!} programacoes={programacoes!} soProva={soProva}
          onMudou={(lista) => setMaquinas(lista)} onAbrir={abrirProgramacao} onFila={trocarLocal} />
      ) : aba === "arquivos" ? (
        <Biblioteca3D semCabecalho aoProgramar={programarArquivo} inicial={soProva ? [] : undefined} />
      ) : (
        <Historico3D soProva={soProva} maquinas={maquinas!} provaLista={soProva ? programacoes! : undefined} onAbrir={abrirProgramacao} />
      )}

      {painel && (
        <NovaProgramacao
          edicao={painel.edicao}
          arquivoInicial={painel.arquivo}
          maquinas={maquinas ?? []}
          pessoas={pessoas}
          soProva={soProva}
          onFechar={() => setPainel(null)}
          onSalvou={trocarLocal}
          onApagou={(id) => setProgramacoes((l) => (l ?? []).filter((x) => x.id !== id))}
        />
      )}
    </div>
  );
}
