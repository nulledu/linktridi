"use client";

// Listagem de produtos: busca, filtro por status, paginação.
//
// A tabela do computador e os cards do celular saem da MESMA definição de
// colunas (`DataList`, a tabela do sistema) — não é uma tela duplicada. No
// celular uma tabela de cinco colunas ou rola de lado ou fica ilegível; virar
// card resolve sem ninguém manter duas listas.

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../../../Icon";
import { PageHead } from "../../../ui/mobile";
import { DataList, type Coluna } from "../../../ui/DataList";
import { Botao } from "../../../ui/controles";
import { TrazerProdutos } from "./TrazerProdutos";
import { baseDoModulo } from "../../base";
import {
  ROTULO_PRODUTO, descontoPercentual, moeda, precoVigente,
  type Produto, type StatusProduto,
} from "@/lib/lojas";

const POR_PAGINA = 6;

const FILTROS: { key: "todos" | StatusProduto; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "ativo", label: "Ativos" },
  { key: "rascunho", label: "Rascunhos" },
  { key: "inativo", label: "Inativos" },
];

function Etiqueta({ status }: { status: StatusProduto }) {
  const r = ROTULO_PRODUTO[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: `color-mix(in srgb, ${r.cor} 16%, transparent)`, color: r.cor, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.cor }} aria-hidden="true" />
      {r.txt}
    </span>
  );
}

/** Estoque conta uma história curta: 0 é vermelho, pouco é laranja. */
function corEstoque(p: Produto): string {
  if (p.estoque === 0) return p.venderSemEstoque ? "var(--text-dim)" : "var(--perigo)";
  if (p.estoque <= 5) return "var(--atencao)";
  return "var(--text)";
}

// Uma definição: tabela no computador, cartão no celular. O produto (com foto
// e SKU) é o título do cartão e o preço o número em evidência. Sem `ordenar`:
// a lista é paginada, e ordenar só os 6 da página daria "o mais caro" errado.
const COLUNAS: Coluna<Produto>[] = [
  {
    chave: "produto", titulo: "Produto", papel: "titulo",
    render: (p) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, flex: "none", background: "var(--surface-2)", display: "grid", placeItems: "center", overflow: "hidden" }}>
          {p.imagens[0]
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.imagens[0].url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <Icon name="photo" size={16} color="var(--neutro)" />}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>{p.titulo}</div>
          <div style={{ fontSize: 11, fontWeight: 400, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6 }}>
            {p.sku}
            {p.compartilhado && <span className="lj-compartilhado">de outra loja</span>}
          </div>
        </div>
      </div>
    ),
  },
  { chave: "status", titulo: "Status", render: (p) => <Etiqueta status={p.status} /> },
  {
    chave: "estoque", titulo: "Estoque",
    render: (p) => (
      <span style={{ fontWeight: 700, color: corEstoque(p) }}>
        {p.estoque === 0 && p.venderSemEstoque ? "Sob encomenda" : p.estoque}
      </span>
    ),
  },
  { chave: "categoria", titulo: "Categoria", render: (p) => <span style={{ color: "var(--text-dim)" }}>{p.categorias.join(", ") || "—"}</span> },
  {
    chave: "preco", titulo: "Preço", papel: "destaque", alinhar: "right",
    render: (p) => {
      const off = descontoPercentual(p);
      return (
        <>
          <div style={{ fontWeight: 800, color: "var(--text)" }}>{moeda(precoVigente(p))}</div>
          {off != null && <div style={{ fontSize: 11, color: "var(--ok)", fontWeight: 700 }}>{off}% OFF</div>}
        </>
      );
    },
  },
];

export function ProdutosClient({ lojaId, produtos }: { lojaId: string; produtos: Produto[] }) {
  const [trazendo, setTrazendo] = useState(false);
  const router = useRouter();
  const base = `${baseDoModulo(usePathname())}/${lojaId}/produtos`;
  const q = (useSearchParams().get("q") ?? "").trim().toLowerCase();
  const [filtro, setFiltro] = useState<"todos" | StatusProduto>("todos");
  const [pagina, setPagina] = useState(1);

  const filtrados = useMemo(() => {
    return produtos.filter((p) => {
      if (filtro !== "todos" && p.status !== filtro) return false;
      if (!q) return true;
      return p.titulo.toLowerCase().includes(q)
        || p.sku.toLowerCase().includes(q)
        || p.categorias.some((c) => c.toLowerCase().includes(q));
    });
  }, [produtos, filtro, q]);

  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  // Trocar o filtro pode encolher a lista abaixo da página em que a pessoa
  // estava. Sem este travamento ela veria uma lista vazia e concluiria que o
  // filtro não achou nada.
  const atual = Math.min(pagina, paginas);
  const visiveis = filtrados.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA);

  const trocarFiltro = (k: "todos" | StatusProduto) => { setFiltro(k); setPagina(1); };
  const abrir = (p: Produto) => router.push(`${base}/${p.id}`);

  return (
    <>
      <PageHead
        title="Produtos"
        sub={`${produtos.length} no catálogo`}
        right={
          <>
            {/* Loja é ORGANIZAÇÃO: quem separa "Carimbos" de "Chancelas" em
                duas vitrines quase sempre vende as MESMAS peças nas duas.
                Trazer é vínculo, não cópia — o estoque continua sendo um só. */}
            <Botao variante="secundario" icone="package-import" onClick={() => setTrazendo(true)}>
              Usar de outra loja
            </Botao>
            <Link href={`${base}/novo`} className="ui-btn" data-v="primario" data-t="md">
              <Icon name="plus" size={15.5} color="var(--on-primary, #fff)" /> Adicionar produto
            </Link>
          </>
        }
      />

      {/* `.tab-strip` é a fileira que rola de lado quando não cabe — a 320px
          quatro filtros não entram na largura. */}
      <div className="tab-strip" style={{ background: "var(--surface-2)", marginBottom: 14 }}>
        {FILTROS.map((f) => {
          const on = filtro === f.key;
          return (
            <button key={f.key} type="button" onClick={() => trocarFiltro(f.key)} aria-pressed={on}
              className="ui-btn" data-t="sm" data-v={on ? "primario" : "sutil"}>
              {f.label}
            </button>
          );
        })}
      </div>

      {q && (
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
          {filtrados.length} resultado{filtrados.length === 1 ? "" : "s"} para <strong>{q}</strong>
          {" · "}
          <Link href={base} style={{ color: "var(--primary-texto)" }}>limpar</Link>
        </p>
      )}

      {filtrados.length === 0 ? (
        <div className="lj-card" style={{ textAlign: "center", padding: 34 }}>
          <Icon name="package" size={26} color="var(--text-dim)" />
          <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 10 }}>
            {q ? "Nenhum produto com esse termo." : "Nenhum produto neste filtro."}
          </p>
        </div>
      ) : (
        <DataList
          itens={visiveis}
          colunas={COLUNAS}
          chaveDe={(p) => p.id}
          onAbrir={abrir}
          rotulo="Produtos da loja"
          minWidth={620}
        />
      )}

      {paginas > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 16 }}>
          <Botao tamanho="sm" icone="chevron-left" disabled={atual === 1} onClick={() => setPagina(atual - 1)}>Anterior</Botao>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
            {atual} de {paginas}
          </span>
          <Botao tamanho="sm" disabled={atual === paginas} onClick={() => setPagina(atual + 1)}>Próxima</Botao>
        </div>
      )}

      {trazendo && <TrazerProdutos lojaId={lojaId} onFechar={() => setTrazendo(false)} />}
    </>
  );
}
