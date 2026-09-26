"use client";

// Banco de provas do Recebimento: a aba real só existe atrás de login, e
// credencial não se digita aqui. A `RedeFalsa` (a mesma do /dev-mobile) só
// responde a GET — POST/PATCH continuam falhando de verdade, senão a prova
// mentiria sobre o que acontece ao gravar.
//
// A ordem das chaves importa: a rede casa por PREFIXO e usa a PRIMEIRA que
// bate, então o detalhe ("/api/recebimento/compras/") vem antes da listagem.

import { useState } from "react";
import { RedeFalsa } from "../dev-mobile/RedeFalsa";
import { RecebimentoPanel } from "../(plataforma)/estoque/RecebimentoPanel";
import { LocaisPanel } from "../(plataforma)/estoque/LocaisPanel";
import { FornecedoresPanel } from "../(plataforma)/estoque/FornecedoresPanel";
import { Abas } from "../(plataforma)/ui/Abas";

const COMPRAS = [
  {
    id: "c1", item_nome: "Almofada N.3 vermelha", categoria: "Almofadas", unidade: "un",
    estoque_item_id: "i1", quantidade_comprada: 100, quantidade_recebida: 0,
    fornecedor: "Feltros Brasil", fornecedor_id: "f1", local_id: "l1", preco_unit: 7.5,
    codigo_rastreio: "BR123456789BR", codigo_recebimento: null, nota_fiscal: "12345", pedido_ref: "PED-889",
    palavra_chave: "girassol", prioridade: "alta", previsao_entrega: "2026-08-20", status: "aguardando_entrega",
    solicitante: "Marina", criado_por: "Financeiro", observacoes: null, estoque_erro: null,
    comprado_em: "2026-08-01T10:00:00Z", created_at: "2026-08-01T10:00:00Z", updated_at: "2026-08-01T10:00:00Z",
  },
  {
    id: "c2", item_nome: "Cola branca 5kg", categoria: "Colas", unidade: "cx",
    estoque_item_id: null, quantidade_comprada: 12, quantidade_recebida: 12,
    fornecedor: null, fornecedor_id: null, local_id: null, preco_unit: 92,
    codigo_rastreio: null, codigo_recebimento: null, nota_fiscal: null, pedido_ref: null,
    palavra_chave: null, prioridade: "critica", previsao_entrega: null, status: "divergencia",
    solicitante: null, criado_por: "Financeiro", observacoes: null,
    estoque_erro: "o item do catálogo está sem hierarquia, então não dá pra gerar o SKU das etiquetas",
    comprado_em: "2026-07-28T10:00:00Z", created_at: "2026-07-28T10:00:00Z", updated_at: "2026-08-02T10:00:00Z",
  },
  {
    id: "c3", item_nome: "Chapa MDF 6mm branca 2750x1840", categoria: "Matéria-prima", unidade: "ch",
    estoque_item_id: "i2", quantidade_comprada: 40, quantidade_recebida: 18,
    fornecedor: "Madeireira Central", fornecedor_id: "f2", local_id: null, preco_unit: 187.9,
    codigo_rastreio: null, codigo_recebimento: "REC-4412", nota_fiscal: null, pedido_ref: null,
    palavra_chave: null, prioridade: "normal", previsao_entrega: "2026-08-14", status: "chegou_parcial",
    solicitante: "Produção", criado_por: "Financeiro", observacoes: null, estoque_erro: null,
    comprado_em: "2026-08-05T10:00:00Z", created_at: "2026-08-05T10:00:00Z", updated_at: "2026-08-09T10:00:00Z",
  },
  // A fila do corredor: chegou e ninguém guardou. Sem uma compra assim, o
  // filtro "A guardar", a marca roxa no card e o bloco "Dar entrada no estoque"
  // não são desenhados em lugar nenhum fora de produção — e a parte nova da
  // tela ficaria sem como ser medida a 320px.
  {
    id: "c4", item_nome: "Tinta base d'água para clichê — cartucho 1kg", categoria: "Tintas", unidade: "un",
    estoque_item_id: "i3", quantidade_comprada: 24, quantidade_recebida: 24, quantidade_guardada: 0,
    fornecedor: "Química Sul", fornecedor_id: "f1", local_id: "l2", preco_unit: 128,
    codigo_rastreio: null, codigo_recebimento: "REC-9001", nota_fiscal: null, pedido_ref: null,
    palavra_chave: null, prioridade: "normal", previsao_entrega: null, status: "chegou",
    chegou_em: "2026-08-12T12:30:00Z", chegou_por: "Recepção",
    solicitante: "Produção", criado_por: "Financeiro", observacoes: null, estoque_erro: null,
    comprado_em: "2026-08-06T10:00:00Z", created_at: "2026-08-06T10:00:00Z", updated_at: "2026-08-12T12:30:00Z",
  },
];

const MAPA = {
  // Antes da chave genérica: a rede casa por PREFIXO e usa a PRIMEIRA que bate,
  // então este detalhe é o único jeito de abrir a compra que está no corredor.
  "/api/recebimento/compras/c4": { compra: COMPRAS[3], recebimentos: [
    {
      id: "r2", recebido_por: "Recepção", quantidade_recebida: 24, correto: true, etapa: "chegada",
      divergencia_motivo: null, observacoes: null, foto_url: null, checklist: null,
      created_at: "2026-08-12T12:30:00Z",
    },
  ] },
  "/api/recebimento/compras/": {
    compra: COMPRAS[1],
    recebimentos: [
      {
        id: "r1", recebido_por: "Diego", quantidade_recebida: 12, correto: false,
        divergencia_motivo: "Duas caixas vieram amassadas", observacoes: null, foto_url: null,
        checklist: { produto_correto: true, quantidade_correta: true, embalagem_ok: false, bom_estado: false, nota_recebida: true, foto: true },
        created_at: "2026-08-02T13:22:00Z",
      },
    ],
  },
  "/api/recebimento/compras": {
    compras: COMPRAS,
    dashboard: { aguardando: 1, recebidosHoje: 2, divergencias: 1, parciais: 1, criticos: 1, abaixoMinimo: 7, comprasPendentes: 3, aGuardar: 1 },
  },
  "/api/estoque-itens": {
    podeGerir: true,
    itens: [
      { id: "i1", nome: "Almofada N.3 vermelha", hierarquia: "peca", categoria: "Almofadas", unidade: "un", quantidade: 12, qtd_minima: 5, ativo: true, produzido: true, serializado: false, imagem_url: null },
      { id: "i2", nome: "Chapa MDF 6mm branca 2750x1840", hierarquia: "materia_prima", categoria: "Matéria-prima", unidade: "ch", quantidade: 48, qtd_minima: 10, ativo: true, produzido: false, serializado: true, imagem_url: null },
      { id: "i3", nome: "Fita de borda branca 22mm", hierarquia: "insumo_direto", categoria: "Insumos", unidade: "rolo", quantidade: 3, qtd_minima: 4, ativo: true, produzido: false, serializado: false, imagem_url: null },
    ],
  },
  "/api/estoque/fornecedores": {
    podeGerir: true,
    fornecedores: [
      { id: "f1", nome: "Feltros Brasil", ativo: true },
      { id: "f2", nome: "Madeireira Central", ativo: true },
    ],
  },
  "/api/estoque/locais": {
    podeGerir: true,
    locais: [
      { id: "l1", nome: "Depósito", codigo: "DEP", pai_id: null, ativo: true, ordem: 0 },
      { id: "l2", nome: "Prateleira B2", codigo: "B2", pai_id: "l1", ativo: true, ordem: 1 },
      { id: "l3", nome: "Corredor da serra (arquivado)", codigo: "SER", pai_id: null, ativo: false, ordem: 2 },
    ],
  },
  // A aba Fornecedores também lê a base de custos legada da Tridi.
  "/api/tridi/estoque": {
    podeVerCusto: true,
    fornecedores: [{ id: 1, nome: "Feltros Brasil", materiais: 12, valorTotal: 4820.5 }],
    materiais: [{ id: 1, nome: "Feltro 3mm", categoria: "Insumos", cor: "#7C5CFF", fornecedor: "Feltros Brasil", unidade: "m", valor: 18.4 }],
  },
};

type Tela = "recebimento" | "locais" | "fornecedores";

export function Prova() {
  const [tela, setTela] = useState<Tela>("recebimento");
  return (
    <div style={{ padding: 16, minHeight: "100dvh", maxWidth: 1120, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Prova — Recebimento, Localização e Fornecedores</h1>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 16 }}>
        Meça <code>scrollWidth − clientWidth</code> a 320/390/430 e os alvos por <code>offsetHeight</code>.
        Abra &quot;Registrar compra&quot;, o detalhe da compra em divergência e os editores de lugar/fornecedor.
      </p>
      <div style={{ marginBottom: 14 }}>
        <Abas<Tela> ariaLabel="Tela em prova" valor={tela} onMuda={setTela}
          itens={[
            { valor: "recebimento", rotulo: "Recebimento" },
            { valor: "locais", rotulo: "Localização" },
            { valor: "fornecedores", rotulo: "Fornecedores" },
          ]} />
      </div>
      <RedeFalsa mapa={MAPA}>
        {tela === "recebimento" && <RecebimentoPanel />}
        {tela === "locais" && <LocaisPanel />}
        {tela === "fornecedores" && <FornecedoresPanel />}
      </RedeFalsa>
    </div>
  );
}
