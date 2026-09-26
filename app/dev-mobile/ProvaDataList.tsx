"use client";

// Banco de provas do DataList/DesktopOnlyNotice: mesma definição de colunas
// virando tabela no desktop e cartões no celular, pra conferir os dois em 320px.
import { DataList, DesktopOnlyNotice, type Coluna } from "../(plataforma)/ui/DataList";
import { Icon } from "../(plataforma)/Icon";

interface Venda { id: string; cliente: string; produto: string; valor: number; status: string; dia: string }

const VENDAS: Venda[] = [
  { id: "1", cliente: "Maria Aparecida de Souza Nascimento", produto: "Carimbo automático 38×14mm", valor: 189.9, status: "Pago", dia: "27/07" },
  { id: "2", cliente: "João Pedro", produto: "Placa de sinalização", valor: 1249.5, status: "Em aberto", dia: "26/07" },
  { id: "3", cliente: "Distribuidora Vale Verde LTDA", produto: "Kit refil tinta preta", valor: 42, status: "Atrasado", dia: "22/07" },
];

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COR: Record<string, string> = { Pago: "var(--ok)", "Em aberto": "var(--atencao)", Atrasado: "var(--perigo)" };

const COLUNAS: Coluna<Venda>[] = [
  { chave: "cliente", titulo: "Cliente", papel: "titulo", render: (v) => v.cliente, ordenar: (v) => v.cliente },
  { chave: "valor", titulo: "Valor", papel: "destaque", alinhar: "right", render: (v) => brl(v.valor), ordenar: (v) => v.valor },
  { chave: "produto", titulo: "Produto", render: (v) => v.produto },
  { chave: "dia", titulo: "Dia", render: (v) => v.dia, ordenar: (v) => v.dia.split("/").reverse().join("") },
  {
    chave: "status", titulo: "Status",
    // Status nunca só por cor: o ponto colorido vem acompanhado do rótulo.
    render: (v) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <i style={{ width: 7, height: 7, borderRadius: "50%", background: COR[v.status], flex: "none" }} />
        {v.status}
      </span>
    ),
  },
  {
    chave: "acoes", titulo: "", papel: "acoes", alinhar: "right",
    render: () => (
      <button style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
        <Icon name="receipt" size={14} color="var(--text-dim)" /> Recibo
      </button>
    ),
  },
];

export function ProvaDataList() {
  return (
    <>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "18px 0 8px" }}>DataList</h2>
      <div id="datalist" className="glass" style={{ padding: 12, borderRadius: 16 }}>
        <DataList itens={VENDAS} colunas={COLUNAS} chaveDe={(v) => v.id} onAbrir={() => {}} minWidth={640} rotulo="Vendas" />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "18px 0 8px" }}>DataList vazio</h2>
      <div className="glass" style={{ padding: 12, borderRadius: 16 }}>
        <DataList itens={[]} colunas={COLUNAS} chaveDe={(v: Venda) => v.id} vazio="Nenhuma venda no período." />
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: "18px 0 8px" }}>DesktopOnlyNotice</h2>
      <div id="somentedesktop" className="glass" style={{ padding: 12, borderRadius: 16 }}>
        <DesktopOnlyNotice
          titulo="O editor de fluxo precisa de tela grande"
          motivo="Arrastar blocos num canvas não funciona bem no toque. No computador você vê o fluxo inteiro de uma vez.">
          <div style={{ padding: 20 }}>conteúdo do editor</div>
        </DesktopOnlyNotice>
      </div>
    </>
  );
}
