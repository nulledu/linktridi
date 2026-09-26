"use client";

// Banco de provas do controle de produtos num lugar. O painel real está atrás
// de login; aqui ele é montado com um catálogo de mentira do mesmo tamanho do
// de produção (244 itens), que é o que faz o teto da lista aparecer.
//
// A gravação bate em `/api/estoque/locais/itens`, que aqui responde 401 — e é
// o certo: o que se mede nesta rota é GEOMETRIA e legibilidade, e um painel em
// estado de erro ocupa o mesmo espaço.

import { useState } from "react";
import { PainelLateral } from "../(plataforma)/ui/controles";
import { GuardarNoLugar } from "../(plataforma)/estoque/GuardarNoLugar";
import type { Item } from "../(plataforma)/estoque/tipos";

const RUA = { id: "L1", nome: "Rua A · Módulo 2 · Nível 1", codigo: "RUA-A-M2-N1" };
const OUTRA = { id: "L2", nome: "Rua B", codigo: "RUA-B" };

function item(id: string, nome: string, sku: string, extra: Partial<Item> = {}): Item {
  return {
    id, nome, sku, hierarquia: "produto", produzido: false, serializado: false,
    categoria: null, imagem_url: null, unidade: "un", quantidade: 12, qtd_minima: 0,
    ativo: true, ...extra,
  } as Item;
}

const DENTRO = [
  item("i1", "Almofada 22x22", "PRD-0003", { quantidade: 4, local_id: "L1" }),
  item("i2", "Etiqueta Adesiva Serrilhada 6cm", "PRD-0017", { quantidade: 250, local_id: "L1" }),
  item("i3", "Caixa M", "PRD-0040", { quantidade: 750, local_id: "L1" }),
];

// 244 itens: o tamanho real do catálogo. É ele que prova o teto da lista.
const CATALOGO: Item[] = [
  ...DENTRO,
  item("o1", "Tinta preta", "PRD-0022", { local_id: "L2" }),
  ...Array.from({ length: 244 }, (_, i) =>
    item(`g${i}`, `Produto de catálogo ${i + 1}`, `PRD-${String(i + 30).padStart(4, "0")}`)),
];

/** A RUA: lugar-PAI, cujos produtos moram nos níveis abaixo dela. */
const RUA_MAE = { id: "L0", nome: "Rua A · Expedição", codigo: "A" };

export function Prova() {
  const [aberto, setAberto] = useState(true);
  const [podeMover, setPodeMover] = useState(true);
  // "rua" é o caso que o dono reclamou: quer guardar coisa em A, em B — nos
  // lugares-PAI, não só nas folhas. Aqui `dentro` é VAZIO (nada mora na placa
  // da rua em si) e todo o conteúdo está nos níveis.
  const [qual, setQual] = useState<"folha" | "rua">("rua");
  const lugar = qual === "rua" ? RUA_MAE : RUA;
  const dentro = qual === "rua" ? [] : DENTRO;

  return (
    <div style={{ padding: 20, minHeight: "100dvh" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Prova — produtos num lugar</h1>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
        Meça <code>scrollWidth − clientWidth</code> a 320/390/430 e os alvos por <code>offsetHeight</code>.
        A gravação responde 401 aqui — o que se confere é geometria e legibilidade.
        <strong> RUA</strong> é o caso do lugar-pai vazio: tem de oferecer “Guardar produto aqui” igual.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([["rua", "Rua (lugar-pai, vazia)"], ["folha", "Nível (com itens)"]] as const).map(([v, rotulo]) => (
          <button key={v} onClick={() => { setQual(v); setAberto(true); }}
            style={{ minHeight: "var(--tap)", padding: "0 16px", borderRadius: "var(--r-sm)", cursor: "pointer", fontWeight: 700,
              border: `1.5px solid ${qual === v ? "var(--primary)" : "var(--border)"}`,
              background: qual === v ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
              color: "var(--text)" }}>
            {rotulo}
          </button>
        ))}
        {([[true, "Pode mover"], [false, "Só leitura"]] as const).map(([v, rotulo]) => (
          <button key={rotulo} onClick={() => { setPodeMover(v); setAberto(true); }}
            style={{ minHeight: "var(--tap)", padding: "0 16px", borderRadius: "var(--r-sm)", cursor: "pointer", fontWeight: 700,
              border: `1.5px solid ${podeMover === v ? "var(--primary)" : "var(--border)"}`,
              background: podeMover === v ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
              color: "var(--text)" }}>
            {rotulo}
          </button>
        ))}
      </div>
      {aberto && (
        <PainelLateral
          titulo={<><strong>{lugar.codigo}</strong> · {lugar.nome}</>}
          subtitulo={`${dentro.length} itens guardados`}
          onFechar={() => setAberto(false)}
          largura={460}
        >
          <GuardarNoLugar
            local={lugar} dentro={dentro} catalogo={CATALOGO} locais={[RUA, OUTRA, RUA_MAE]}
            podeMover={podeMover} aoMudar={() => {}}
          />
        </PainelLateral>
      )}
    </div>
  );
}
