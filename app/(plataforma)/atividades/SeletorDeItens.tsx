"use client";

// ── Lista marcável do catálogo do Estoque ────────────────────────────────────
// A mesma peça do "Personalizar" (quais itens aparecem na Visão geral) e do
// "Categorias" (quais itens entram numa categoria): busca, filtro por tipo e a
// lista com caixa de marcar. Controlada de fora — quem guarda a seleção é quem
// usa.

import { useMemo, useState, type CSSProperties } from "react";
import { Icon } from "../Icon";
import { gruposPorHierarquia } from "@/lib/atividades-lancador";
import { hierarquiaLabel } from "@/lib/estoque-hierarquia";

export type ItemDoCatalogo = { id: string; nome: string; categoria: string | null; hierarquia: string | null; imagem_url: string | null };
const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

const chip = (ativo: boolean): CSSProperties => ({
  flex: "none", minHeight: 36, padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
  border: `1px solid ${ativo ? "transparent" : "var(--border)"}`,
  background: ativo ? "var(--primary-acao, var(--primary))" : "var(--bg)", color: ativo ? "var(--on-primary, #fff)" : "var(--text)",
});

export function SeletorDeItens({ catalogo, marcados, onAlternar }: {
  catalogo: ItemDoCatalogo[];
  marcados: Set<string>;
  onAlternar: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState("todos");
  const grupos = useMemo(() => gruposPorHierarquia(catalogo), [catalogo]);
  const grupoDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of grupos) for (const i of g.itens) m.set(i.id, g.chave);
    return m;
  }, [grupos]);
  const visiveis = useMemo(() => {
    const q = normal(busca);
    return catalogo.filter((i) =>
      (grupo === "todos" || (grupo === "marcados" ? marcados.has(i.id) : grupoDe.get(i.id) === grupo))
      && (!q || normal(i.nome).includes(q)));
  }, [catalogo, busca, grupo, grupoDe, marcados]);

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 12, top: 0, bottom: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
          <Icon name="search" size={16} color="var(--text-dim)" />
        </span>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item do estoque..." aria-label="Buscar item do estoque"
          style={{ width: "100%", boxSizing: "border-box", minHeight: "var(--tap)", padding: "9px 12px 9px 36px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14 }} />
      </div>
      <div className="tab-strip" role="group" aria-label="Filtrar por tipo" style={{ display: "flex", gap: 8 }}>
        <button type="button" aria-pressed={grupo === "todos"} onClick={() => setGrupo("todos")} style={chip(grupo === "todos")}>
          Todos ({catalogo.length})
        </button>
        <button type="button" aria-pressed={grupo === "marcados"} onClick={() => setGrupo("marcados")} style={chip(grupo === "marcados")}>
          Marcados ({marcados.size})
        </button>
        {grupos.map((g) => (
          <button key={g.chave} type="button" aria-pressed={grupo === g.chave} onClick={() => setGrupo(g.chave)} style={chip(grupo === g.chave)}>
            {g.rotulo} ({g.itens.length})
          </button>
        ))}
      </div>
      {visiveis.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>Nada com esse filtro.</p>}
      <div style={{ display: "grid", gap: 6 }}>
        {visiveis.map((i) => {
          const marcado = marcados.has(i.id);
          return (
            <button key={i.id} type="button" role="checkbox" aria-checked={marcado} onClick={() => onAlternar(i.id)}
              style={{
                display: "flex", alignItems: "center", gap: 12, minHeight: "var(--tap)", padding: "8px 12px", textAlign: "left", font: "inherit", cursor: "pointer",
                borderRadius: "var(--r-sm)", border: `1px solid ${marcado ? "var(--primary)" : "var(--border)"}`, color: "var(--text)",
                background: marcado ? "color-mix(in srgb, var(--primary) 8%, var(--bg))" : "var(--bg)", minWidth: 0,
              }}>
              <span aria-hidden style={{
                flex: "none", width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center",
                border: `2px solid ${marcado ? "var(--primary)" : "var(--border)"}`, background: marcado ? "var(--primary-acao, var(--primary))" : "transparent",
              }}>{marcado && <Icon name="check" size={13} color="var(--on-primary, #fff)" />}</span>
              {i.imagem_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={i.imagem_url} alt="" loading="lazy" style={{ width: 36, height: 36, borderRadius: "var(--r-sm)", objectFit: "cover", flex: "none" }} />
                : <span style={{ flex: "none", width: 36, height: 36, borderRadius: "var(--r-sm)", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 10%, transparent)" }}>
                    <Icon name="box" size={17} color="var(--primary-texto)" />
                  </span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.nome}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)" }}>{hierarquiaLabel(i.hierarquia)}{i.categoria ? ` · ${i.categoria}` : ""}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
