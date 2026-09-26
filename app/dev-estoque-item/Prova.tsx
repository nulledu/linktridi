"use client";

// Banco de provas do editor de item do Estoque. O modal real só existe atrás de
// login, e credencial não se digita aqui — então ele é montado com um item de
// mentira, do mesmo jeito que o /dev-market-produto faz com o modal do
// mercadinho. Serve pra medir 320px, alvo de toque e os dois temas.
//
// Os seletores de Fornecedor e Localização nascem vazios de propósito: as rotas
// deles chegam num plano seguinte, e o editor tem que abrir mesmo sem elas.

import { useState } from "react";
import { ItemEditor } from "../(plataforma)/estoque/ItemEditor";
import { AjusteDeQuantidade } from "../(plataforma)/estoque/AjusteDeQuantidade";
import type { Item } from "../(plataforma)/estoque/tipos";

const ITEM: Item = {
  id: "prova-1",
  nome: "MDF 6mm Branco",
  hierarquia: "componente",
  produzido: true,
  serializado: false,
  categoria: "Insumos",
  imagem_url: null,
  unidade: "ch",
  quantidade: 48,
  qtd_minima: 10,
  ativo: true,
  custo: 87.5,
  sku: "MDF6MM-BR-18",
  estoque_ideal: 60,
  requisitavel: true,
  setor_requisicao: "Produção",
  largura_mm: 2750,
  altura_mm: 1840,
  espessura_mm: 6,
  dim_unidade: "mm",
  cor: "Branco",
};

// O catálogo do dono, como está no banco de produção: é dele que o gerador tira
// as famílias (CRB, AC, CHN, AMF). Sem `itens` o editor tenta baixar o catálogo
// da API — que aqui não responde — e a fileira de sugestões nasce com um chip
// só: justo o caso que NÃO mede nada a 320px.
const CATALOGO = [
  { id: "c4", nome: "Carimbo 4cm", hierarquia: "produto", sku: "CRB04" },
  { id: "c12", nome: "Carimbo 12cm", hierarquia: "produto", sku: "CRB12" },
  { id: "c15", nome: "Carimbo 15cm", hierarquia: "produto", sku: "CRB15" },
  { id: "a3", nome: "Carimbo Acrílico 3cm", hierarquia: "produto", sku: "AC03" },
  { id: "a5", nome: "Carimbo Acrílico 5cm", hierarquia: "produto", sku: "AC05" },
  { id: "h1", nome: "Chancela 4cm", hierarquia: "produto", sku: "CHN01" },
  { id: "h2", nome: "Chancela 5cm", hierarquia: "produto", sku: "CHN02" },
  { id: "m6", nome: "Almofada 11", hierarquia: "produto", sku: "AMF06" },
  { id: "m8", nome: "Almofada 16", hierarquia: "produto", sku: "AMF08" },
];

/** Qual modal está na tela. "ajuste" é o que vira FOLHA no celular. */
type Qual = "editar" | "novo" | "ajuste";

export function Prova() {
  const [aberto, setAberto] = useState(true);
  // O gerador é o motivo desta página existir agora, e ele tem dois retratos
  // diferentes: no item NOVO o campo acompanha a sugestão, no item que já
  // existe o SKU gravado manda e as sugestões ficam ao lado.
  const [qual, setQual] = useState<Qual>("editar");
  const novo = qual === "novo";
  return (
    <div style={{ padding: 20, minHeight: "100dvh" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>Prova — editor de item do Estoque</h1>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
        Meça <code>scrollWidth − clientWidth</code> a 320/375/430 e os alvos por <code>offsetHeight</code>.
        No item novo, digite <strong>Carimbo 16cm</strong> pra ver a família do dono nas sugestões.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {([["editar", "Editar item"], ["novo", "Item novo"], ["ajuste", "Ajustar quantidade"]] as const).map(([k, rotulo]) => (
          <button key={k} onClick={() => { setQual(k); setAberto(true); }}
            style={{ minHeight: "var(--tap)", padding: "0 16px", borderRadius: "var(--r-sm)", cursor: "pointer", fontWeight: 700,
              border: `1.5px solid ${qual === k ? "var(--primary)" : "var(--border)"}`,
              background: qual === k ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
              color: "var(--text)" }}>
            {rotulo}
          </button>
        ))}
      </div>
      {/* Um pouco de conteúdo atrás: é ele que vazava pela folha "transparente",
          e sem nada por trás o defeito não aparece. */}
      <div style={{ display: "grid", gap: 8, marginTop: 20 }}>
        {["Chapa MDF 6mm", "Alavanca", "Almofada 22x22", "Tinta preta", "Fita crepe"].map((n) => (
          <div key={n} className="glass glass-spec" style={{ padding: "14px 16px", borderRadius: "var(--r-sm)", fontWeight: 700 }}>{n}</div>
        ))}
      </div>
      {aberto && qual === "ajuste" && (
        <AjusteDeQuantidade item={ITEM} classe="is-open" onClose={() => setAberto(false)} onSalvo={() => setAberto(false)} />
      )}
      {aberto && qual !== "ajuste" && (novo
        ? <ItemEditor hierarquiaInit="produto" itens={CATALOGO} podeVerCusto onClose={() => setAberto(false)} onSaved={() => setAberto(false)} />
        : <ItemEditor item={ITEM} itens={CATALOGO} podeVerCusto onClose={() => setAberto(false)} onSaved={() => setAberto(false)} />)}
    </div>
  );
}