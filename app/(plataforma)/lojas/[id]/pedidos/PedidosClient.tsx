"use client";

// ── Pedidos ──────────────────────────────────────────────────────────────────
// Tabela dos pedidos recentes: quem comprou, quanto, se pagou e se foi enviado.
//
// Pagamento e envio são DUAS colunas, não uma. Já foram uma só ("status") e a
// pergunta que a pessoa faz de manhã — "o que está pago e ainda não saiu?" —
// não tinha resposta na tela: exigia abrir pedido por pedido. É por isso que
// existe o filtro "A enviar", que é justamente o cruzamento dos dois.

import { useMemo, useState } from "react";
import { Icon } from "../../../Icon";
import { PageHead } from "../../../ui/mobile";
import { DataList, type Coluna } from "../../../ui/DataList";
import { Botao, PainelLateral } from "../../../ui/controles";
import {
  ROTULO_ENVIO, ROTULO_PAGAMENTO, moeda,
  type Pedido, type StatusEnvio, type StatusPagamento,
} from "@/lib/lojas";

const POR_PAGINA = 8;

type Filtro = "todos" | "a_enviar" | StatusPagamento;
const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "a_enviar", label: "A enviar" },
  { key: "pago", label: "Pagos" },
  { key: "pendente", label: "Pendentes" },
  { key: "estornado", label: "Estornados" },
];

/** Pago e ainda parado: é a fila de trabalho de quem despacha. */
const aEnviar = (p: Pedido) => p.pagamento === "pago" && (p.envio === "nao_enviado" || p.envio === "preparando");

function Selo({ txt, cor, forte }: { txt: string; cor: string; forte?: boolean }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
      fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999,
      background: forte ? `color-mix(in srgb, ${cor} 16%, transparent)` : "transparent",
      color: cor,
    }}>
      {forte && <span style={{ width: 6, height: 6, borderRadius: "50%", background: cor }} aria-hidden="true" />}
      {txt}
    </span>
  );
}

const Pagamento = ({ s }: { s: StatusPagamento }) => <Selo txt={ROTULO_PAGAMENTO[s].txt} cor={ROTULO_PAGAMENTO[s].cor} forte />;
const Envio = ({ s }: { s: StatusEnvio }) => <Selo txt={ROTULO_ENVIO[s].txt} cor={ROTULO_ENVIO[s].cor} />;

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const dataLonga = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const pecas = (p: Pedido) => p.itens.reduce((s, i) => s + i.quantidade, 0);

// Uma definição: tabela no computador, cartão no celular. O cliente é o título
// do cartão e o total o número em evidência — é o que se lê primeiro num
// pedido. Sem `ordenar`: a lista é paginada, e ordenar só as 8 da página
// responderia errado a "qual o maior pedido?"; a ordem é a da data, no filtro.
const COLUNAS: Coluna<Pedido>[] = [
  { chave: "numero", titulo: "Pedido", render: (p) => <strong style={{ fontWeight: 800 }}>#{p.numero}</strong> },
  { chave: "cliente", titulo: "Cliente", papel: "titulo", render: (p) => <span style={{ fontWeight: 650 }}>{p.cliente}</span> },
  { chave: "data", titulo: "Data", render: (p) => <span style={{ color: "var(--text-dim)" }}>{dataCurta(p.feitoEm)}</span> },
  { chave: "pagamento", titulo: "Pagamento", render: (p) => <Pagamento s={p.pagamento} /> },
  { chave: "envio", titulo: "Envio", render: (p) => <Envio s={p.envio} /> },
  { chave: "itens", titulo: "Itens", alinhar: "right", render: (p) => pecas(p) },
  { chave: "total", titulo: "Total", papel: "destaque", alinhar: "right", render: (p) => <strong style={{ fontWeight: 800 }}>{moeda(p.total)}</strong> },
];

export function PedidosClient({ pedidos }: { pedidos: Pedido[] }) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [pagina, setPagina] = useState(1);
  const [aberto, setAberto] = useState<Pedido | null>(null);

  const filtrados = useMemo(() => {
    const lista = pedidos.filter((p) => {
      if (filtro === "todos") return true;
      if (filtro === "a_enviar") return aEnviar(p);
      return p.pagamento === filtro;
    });
    // Mais recente primeiro: "pedidos recentes" é o que a tela promete.
    return [...lista].sort((a, b) => b.feitoEm.localeCompare(a.feitoEm));
  }, [pedidos, filtro]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const atual = Math.min(pagina, paginas);
  const visiveis = filtrados.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);

  const totalPago = pedidos.filter((p) => p.pagamento === "pago").reduce((s, p) => s + p.total, 0);
  const fila = pedidos.filter(aEnviar).length;

  return (
    <>
      <PageHead
        title="Pedidos"
        sub={`${pedidos.length} no total · ${moeda(totalPago)} recebido${fila ? ` · ${fila} esperando envio` : ""}`}
      />

      <div className="tab-strip" style={{ background: "var(--surface-2)", marginBottom: 14 }}>
        {FILTROS.map((f) => {
          const on = filtro === f.key;
          return (
            <button key={f.key} type="button" aria-pressed={on}
              onClick={() => { setFiltro(f.key); setPagina(1); }}
              className="ui-btn" data-t="sm" data-v={on ? "primario" : "sutil"}>
              {f.label}
            </button>
          );
        })}
      </div>

      {filtrados.length === 0 ? (
        <div className="lj-card" style={{ textAlign: "center", padding: 34 }}>
          <Icon name="shopping-cart" size={26} color="var(--text-dim)" />
          <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 10 }}>Nenhum pedido neste filtro.</p>
        </div>
      ) : (
        <DataList
          itens={visiveis}
          colunas={COLUNAS}
          chaveDe={(p) => p.id}
          onAbrir={setAberto}
          rotulo="Pedidos da loja"
          minWidth={620}
        />
      )}

      {paginas > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 16 }}>
          <Botao tamanho="sm" icone="chevron-left" disabled={atual === 1} onClick={() => setPagina(atual - 1)}>Anterior</Botao>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{atual} de {paginas}</span>
          <Botao tamanho="sm" disabled={atual === paginas} onClick={() => setPagina(atual + 1)}>Próxima</Botao>
        </div>
      )}

      {/* Clicar numa linha que não faz nada é pior que linha não clicável: o
          detalhe é onde estão os ITENS, que a tabela não tem espaço pra mostrar. */}
      {aberto && (
        <PainelLateral
          titulo={`Pedido #${aberto.numero}`}
          subtitulo={dataLonga(aberto.feitoEm)}
          onFechar={() => setAberto(null)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div className="ui-campo-rot">Cliente</div>
              <strong style={{ fontSize: 15 }}>{aberto.cliente}</strong>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div>
                <div className="ui-campo-rot">Pagamento</div>
                <Pagamento s={aberto.pagamento} />
              </div>
              <div>
                <div className="ui-campo-rot">Envio</div>
                <Selo txt={ROTULO_ENVIO[aberto.envio].txt} cor={ROTULO_ENVIO[aberto.envio].cor} forte />
              </div>
            </div>

            <div>
              <div className="ui-campo-rot">Itens</div>
              <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {aberto.itens.map((it, i) => (
                  <div key={it.produtoId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderTop: i ? "1px solid var(--border)" : "none", background: "var(--surface)" }}>
                    <span style={{ flex: "none", minWidth: 26, fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{it.quantidade}×</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflowWrap: "anywhere" }}>{it.titulo}</span>
                    <strong style={{ flex: "none", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{moeda(it.precoUnitario * it.quantidade)}</strong>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Total</span>
                  <strong style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{moeda(aberto.total)}</strong>
                </div>
              </div>
            </div>

            <p className="ui-campo-dica">
              Mudar pagamento e envio por aqui entra junto com a persistência — hoje a tela só lê.
            </p>
          </div>
        </PainelLateral>
      )}
    </>
  );
}
