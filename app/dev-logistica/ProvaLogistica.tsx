"use client";

// Dados fixos cobrindo os três estados que o rastreio agora distingue:
// travado com motivo, sem resposta do ERP ("motivo não identificado") e
// liberado com prova. Serve para medir os blocos a 320px sem login.

import type { LogiPedido } from "@/lib/logistica";
import type { RitmoLogistica } from "@/lib/logistica-ritmo";
import { FilaPedidos } from "../(plataforma)/logistica/LogisticaClient";
import { CaixaBusca } from "../(plataforma)/logistica/CaixaBusca";
import { SetorPainel } from "../(plataforma)/logistica/Ritmo";
import { PedidoCard } from "../(plataforma)/logistica/PedidoCard";
import { useState } from "react";

const base = {
  nome: "Maria Aparecida do Nascimento Silva", contato: "5511972056846",
  responsavel: "Letícia Valentim", urgente: false,
  dataAprovado: "2026-07-20T13:00:00Z", criadoEm: "2026-07-18T10:00:00Z",
  itens: [
    { nome: "Carimbo Automático 38x14mm", tipo: "Carimbo", feito: false, imagem: null, vetor: null },
    { nome: "Chancela MDF 4cm", tipo: "Chancela", feito: true, imagem: null, vetor: null },
  ],
  faltam: 1, feitos: 1, temFalta: true, formularioPendente: false,
};

const PEDIDOS: LogiPedido[] = [
  {
    ...base, id: 1, idProprio: "70441", caixa: "138", cliente: "70441", dias: 11,
    pronto: false, bloqueado: true, indefinido: false,
    checks: [
      { chave: "itens", label: "Itens produzidos", estado: "bloqueio", detalhe: "falta Carimbo" },
      { chave: "formulario", label: "Formulário", estado: "ok" },
      { chave: "arte", label: "Arte vetorizada", estado: "bloqueio", detalhe: "sem vetor em Carimbo" },
      { chave: "caixa", label: "Caixa separadora", estado: "ok", detalhe: "#138" },
      { chave: "flag_erp", label: "Conferência da logística", estado: "bloqueio", detalhe: "marcado como item faltante" },
    ],
    pendencias: ["Itens produzidos", "Arte vetorizada", "Conferência da logística"],
  },
  {
    // O caso que antes aparecia como "Pronto p/ avançar" sem ninguém ter conferido.
    ...base, id: 2, idProprio: "70502", caixa: null, cliente: "70502", dias: 6,
    pronto: false, bloqueado: false, indefinido: true,
    checks: [
      { chave: "itens", label: "Itens produzidos", estado: "indefinido", detalhe: "2 item(ns) sem marcação de conferência" },
      { chave: "formulario", label: "Formulário", estado: "indefinido", detalhe: "campo vazio no ERP" },
      { chave: "flag_erp", label: "Conferência da logística", estado: "indefinido", detalhe: "campo vazio no ERP" },
    ],
    pendencias: ["? Itens produzidos", "? Formulário", "? Conferência da logística"],
  },
  {
    ...base, id: 3, idProprio: "70510", caixa: "42", cliente: "70510", dias: 2, urgente: true,
    itens: base.itens.map((i) => ({ ...i, feito: true })), faltam: 0, feitos: 2, temFalta: false,
    pronto: true, bloqueado: false, indefinido: false,
    checks: [
      { chave: "itens", label: "Itens produzidos", estado: "ok", detalhe: "2 item(ns) conferido(s)" },
      { chave: "formulario", label: "Formulário", estado: "ok" },
      { chave: "caixa", label: "Caixa separadora", estado: "ok", detalhe: "#42" },
      { chave: "flag_erp", label: "Conferência da logística", estado: "ok" },
    ],
    pendencias: [],
  },
];

const horas = (pico: number, alto: number) =>
  Array.from({ length: 24 }, (_, hora) => ({
    hora, total: hora < 7 || hora > 20 ? 0 : Math.max(0, alto - Math.abs(hora - pico) * 6),
  }));

const porDia = (be: number, bs: number) =>
  Array.from({ length: 7 }, (_, i) => ({
    dia: `2026-07-${String(25 + i).padStart(2, "0")}`,
    entradas: be + ((i * 7) % 19), saidas: bs + ((i * 5) % 15),
  }));

const RITMO: RitmoLogistica = {
  janelaDias: 7,
  setores: [
    {
      chave: "entrada", label: "Entrada Logística",
      rotuloEntrada: "Chegada de quem está na fila", rotuloSaida: "Passaram p/ Logística",
      entradasPorHora: horas(10, 42), saidasPorHora: horas(14, 31),
      porDia: porDia(0, 24), totalEntradas: 34, totalSaidas: 168,
      entradasIndisponiveis: false, saidasIndisponiveis: false,
      fluxoEntradaDisponivel: false,
      notaEntrada: "O ERP não registra a entrada nesta etapa, então não dá para montar a série da janela. "
        + "Estas são as horas em que chegaram os pedidos que estão parados aqui agora.",
      horasMedia: 96, pedidosNaFila: 34,
    },
    {
      chave: "logistica", label: "Logística",
      rotuloEntrada: "Recebidos da Entrada", rotuloSaida: "Enviados",
      entradasPorHora: horas(14, 31), saidasPorHora: horas(16, 55),
      porDia: porDia(24, 27), totalEntradas: 168, totalSaidas: 189,
      entradasIndisponiveis: false, saidasIndisponiveis: false,
      fluxoEntradaDisponivel: true,
      horasMedia: 19, pedidosNaFila: 12,
    },
  ],
  etapasIndisponiveis: false,
  diasLidosEtapas: 7,
  atualizadoEm: new Date().toISOString(),
};

export function ProvaLogistica() {
  // O card busca o pedido na API, que exige sessão; aqui ele cai no estado de
  // erro. Serve para medir o cabeçalho, o bloco da passagem e os alvos de toque.
  const [card, setCard] = useState(false);

  return (
    <div style={{ padding: 16, maxWidth: 1180, margin: "0 auto" }}>
      <h1 style={{ fontSize: "clamp(20px, 5vw, 28px)", fontWeight: 800, marginBottom: 14 }}>Prova — Logística</h1>

      <button onClick={() => setCard(true)} style={{ minHeight: "var(--tap)", padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "inherit", cursor: "pointer", marginBottom: 14 }}>
        Abrir card do pedido (passagem pela caixa)
      </button>
      {card && (
        <PedidoCard pedido={67353} onClose={() => setCard(false)}
          contexto={{ caixa: "131", de: "2026-07-16T13:00:00Z", ate: "2026-07-23T18:30:00Z", colocou: "Luiz Santos", tirou: "Mariana Rosetto" }} />
      )}

      <div style={{ marginBottom: 18 }}><CaixaBusca /></div>

      {RITMO.setores.map((s) => (
        <div key={s.chave} className="glass glass-spec" style={{ padding: 20, borderRadius: 20, marginTop: 18 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Ritmo — {s.label}</h2>
          <SetorPainel setor={s} janelaDias={RITMO.janelaDias} />
        </div>
      ))}

      <FilaPedidos entrada={PEDIDOS} logistica={[]} />
    </div>
  );
}
