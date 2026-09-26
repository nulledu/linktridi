"use client";

// Editor de MÉTRICA POR FÓRMULA — compartilhado (Campanhas + Relatório).
// Parametrizado nas variáveis disponíveis e no exemplo de prévia, porque cada
// tela expõe um conjunto diferente de campos. Avaliador seguro em lib/formula.ts
// (sem eval). O formato do resultado (moeda/número/%/×) é escolhido pelo usuário.

import { useMemo, useState } from "react";
import { compilarFormula } from "@/lib/formula";
import { GlassSelect } from "../GlassPicker";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Botao } from "../ui/controles";

export type TipoFmt = "moeda" | "numero" | "percentual" | "multiplicador";
export interface MetricaCustom {
  id: string;
  nome: string;
  formula: string;
  tipo: TipoFmt;
  alto?: "bom" | "ruim";   // liga cor/heat na coluna (opcional)
}

export const fmtPorTipo: Record<TipoFmt, (v: number | null) => string> = {
  moeda: (v) => (v == null ? "—" : fmtBRL2(v)),
  numero: (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })),
  percentual: (v) => (v == null ? "—" : `${v.toFixed(1)}%`),
  multiplicador: (v) => (v == null ? "—" : `${v.toFixed(2)}×`),
};

export const novoIdMetrica = () => Math.random().toString(36).slice(2, 9);

const campo: React.CSSProperties = { padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5, width: "100%", boxSizing: "border-box" };

export function EditorMetrica({ inicial, variaveis, exemplo, onSalvar, onCancelar }: {
  inicial?: MetricaCustom;
  variaveis: string[];               // nomes usáveis na fórmula
  exemplo: Record<string, number>;   // valores p/ a prévia
  onSalvar: (m: MetricaCustom) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [formula, setFormula] = useState(inicial?.formula ?? "");
  const [tipo, setTipo] = useState<TipoFmt>(inicial?.tipo ?? "numero");
  const [alto, setAlto] = useState<"" | "bom" | "ruim">(inicial?.alto ?? "");

  // Valida enquanto digita: fórmula quebrada ou variável inexistente não salva.
  const compilada = useMemo(() => (formula.trim() ? compilarFormula(formula) : null), [formula]);
  const desconhecidas = compilada ? compilada.variaveis.filter((v) => !variaveis.includes(v)) : [];
  const erro = !formula.trim() ? null
    : !compilada ? "Expressão inválida."
    : desconhecidas.length ? `Não existe: ${desconhecidas.join(", ")}.`
    : null;
  const podeSalvar = !!nome.trim() && !!compilada && !erro;

  const previa = useMemo(() => {
    if (!compilada || erro) return null;
    return fmtPorTipo[tipo](compilada.calcular(exemplo));
  }, [compilada, erro, tipo, exemplo]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da métrica (ex.: Lucro por clique)" style={campo} />
      <div>
        <input value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="(revenue - spend) / clicks"
          style={{ ...campo, fontFamily: "ui-monospace, monospace", borderColor: erro ? "var(--perigo)" : "var(--border)" }} />
        <div style={{ fontSize: 11, color: erro ? "var(--perigo)" : "var(--text-dim)", marginTop: 4, lineHeight: 1.5 }}>
          {erro ?? <>Use <code>+ - * / ( )</code> com: {variaveis.join(", ")}.</>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <GlassSelect value={tipo} onChange={(v) => setTipo(v as TipoFmt)} style={{ ...campo, width: "auto", flex: "1 1 150px" }}
          options={[
            { value: "numero", label: "Número" },
            { value: "moeda", label: "Moeda (R$)" },
            { value: "percentual", label: "Percentual (%)" },
            { value: "multiplicador", label: "Multiplicador (×)" },
          ]} />
        <GlassSelect value={alto} onChange={(v) => setAlto(v as "" | "bom" | "ruim")} style={{ ...campo, width: "auto", flex: "1 1 150px" }}
          title="Destacar com cor (bom = verde alto; ruim = verde baixo)"
          options={[
            { value: "", label: "Sem cor" },
            { value: "bom", label: "Maior é melhor" },
            { value: "ruim", label: "Menor é melhor" },
          ]} />
      </div>
      {previa && (
        <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
          Prévia com o exemplo: <strong style={{ color: "var(--text)" }}>{previa}</strong>
        </div>
      )}
      <div style={{ display: "flex", gap: 7 }}>
        <Botao variante="primario" disabled={!podeSalvar}
          onClick={() => onSalvar({ id: inicial?.id ?? novoIdMetrica(), nome: nome.trim(), formula: formula.trim(), tipo, ...(alto ? { alto } : {}) })}>
          Salvar métrica
        </Botao>
        <Botao variante="secundario" onClick={onCancelar}>Cancelar</Botao>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>Dica: {fmtNum(1234)} vira 1.234; use as chaves acima como estão.</div>
    </div>
  );
}
