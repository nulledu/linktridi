"use client";

// ── 3D · Histórico ───────────────────────────────────────────────────────────
// O que já saiu da máquina: programações concluídas e canceladas. Não é uma
// tabela nova — é a própria programação com os carimbos, lida com filtro de
// status. Busca e filtros locais (a lista chega limitada do servidor);
// DataList vira cards no celular sozinho.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { GlassSelect } from "../GlassPicker";
import { toast } from "../Toast";
import { Momento } from "../ui/Momento";
import { DataList, type Coluna } from "../ui/DataList";
import type { Maquina3D, Programacao3D } from "@/lib/impressao3d-const";
import { BolinhaStatus, dataCurta } from "./pecas3d";

export function Historico3D({ maquinas, onAbrir, provaLista, soProva }: {
  maquinas: Maquina3D[];
  onAbrir: (p: Programacao3D) => void;
  provaLista?: Programacao3D[];
  soProva?: boolean;
}) {
  const [lista, setLista] = useState<Programacao3D[] | null>(
    provaLista ? provaLista.filter((p) => p.status === "concluido" || p.status === "cancelado") : null,
  );
  const [busca, setBusca] = useState("");
  const [maquina, setMaquina] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (soProva) return;
    let vivo = true;
    fetch("/api/3d/programacoes?status=concluido,cancelado&limite=500")
      .then((x) => x.json())
      .then((r) => {
        if (!vivo) return;
        if (r?.ok) setLista(r.programacoes as Programacao3D[]);
        else { setLista([]); toast.erro("Não deu pra carregar o histórico."); }
      })
      .catch(() => { if (vivo) setLista([]); });
    return () => { vivo = false; };
  }, [soProva]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (lista ?? []).filter((p) => {
      if (maquina && p.maquinaId !== maquina) return false;
      if (status && p.status !== status) return false;
      if (!t) return true;
      return (
        p.arquivoNome.toLowerCase().includes(t) ||
        (p.responsavelNome || "").toLowerCase().includes(t) ||
        p.observacoes.toLowerCase().includes(t)
      );
    });
  }, [lista, busca, maquina, status]);

  const colunas: Coluna<Programacao3D>[] = [
    { chave: "arquivo", titulo: "Arquivo", papel: "titulo", render: (p) => p.arquivoNome || "—", ordenar: (p) => p.arquivoNome },
    { chave: "maquina", titulo: "Máquina", render: (p) => p.maquinaNome || "—", ordenar: (p) => p.maquinaNome ?? "" },
    { chave: "data", titulo: "Dia", render: (p) => dataCurta(p.data), ordenar: (p) => p.data ?? "" },
    { chave: "qtde", titulo: "Qtde", alinhar: "right", render: (p) => `${p.quantidade}×`, ordenar: (p) => p.quantidade },
    { chave: "resp", titulo: "Responsável", render: (p) => p.responsavelNome || "—", ordenar: (p) => p.responsavelNome ?? "" },
    { chave: "status", titulo: "Status", render: (p) => <BolinhaStatus status={p.status} />, ordenar: (p) => p.status },
    {
      chave: "fim", titulo: "Terminou em", papel: "meta",
      render: (p) => (p.concluidoEm ? new Date(p.concluidoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"),
      ordenar: (p) => p.concluidoEm ?? "",
    },
  ];

  if (lista !== null && lista.length === 0) {
    return (
      <Momento compacto icone="history" titulo="Nada no histórico ainda"
        texto="Quando uma impressão for concluída (ou cancelada), ela entra aqui com data, máquina e responsável." />
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "inline-flex" }}>
            <Icon name="search" size={15} color="var(--text-dim)" />
          </span>
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por arquivo ou responsável" aria-label="Buscar no histórico"
            style={{ width: "100%", paddingLeft: 34, minHeight: "var(--tap)" }} />
        </div>
        <GlassSelect value={maquina} onChange={setMaquina} aria-label="Filtrar por máquina" placeholder="Todas as máquinas"
          options={[{ value: "", label: "Todas as máquinas" }, ...maquinas.map((m) => ({ value: m.id, label: m.nome }))]}
          style={{ width: 190 }} />
        <GlassSelect value={status} onChange={setStatus} aria-label="Filtrar por status" placeholder="Concluídas e canceladas"
          options={[
            { value: "", label: "Concluídas e canceladas" },
            { value: "concluido", label: "Só concluídas" },
            { value: "cancelado", label: "Só canceladas" },
          ]}
          style={{ width: 200 }} />
      </div>

      <DataList
        itens={visiveis}
        colunas={colunas}
        chaveDe={(p) => p.id}
        onAbrir={onAbrir}
        rotulo="Histórico de impressões"
        vazio="Nada casa com a busca e os filtros."
        ordemInicial={{ coluna: "fim", sentido: "desc" }}
      />
    </div>
  );
}
