"use client";

import { isValidElement, useMemo, useState, type ReactNode, type SyntheticEvent } from "react";
import { Table, type SortDescriptor } from "@heroui/react";
import { Icon } from "../Icon";
import "./tabela.css";
import { Fila } from "./micro";
import { useIsMobile } from "./useMediaQuery";

// ── DataList: UMA definição de colunas → tabela no desktop, cartões no celular ──
//
// O problema que isto resolve: 8 telas do sistema tinham tabela com largura mínima de 600px.
// No celular a tabela rolava de lado — o que é um paliativo, não uma solução: a
// pessoa perde a coluna de referência (o nome) assim que arrasta, e as ações da
// última coluna ficam a 400px de distância. Aqui a MESMA definição vira uma lista
// de cartões, cada um com o nome no topo e os campos em pares rótulo→valor.
//
// Não há versão paralela da tela: quem escreve define as colunas uma vez.

export type PapelColuna =
  /** vira o título do cartão no celular (normalmente o nome) */
  | "titulo"
  /** valor em evidência ao lado do título (normalmente o número que importa) */
  | "destaque"
  /** par rótulo→valor no corpo do cartão — é o padrão */
  | "meta"
  /** fica no rodapé do cartão, alinhado à direita (botões) */
  | "acoes"
  /** existe na tabela, some no cartão (colunas redundantes) */
  | "oculta";

export interface Coluna<T> {
  chave: string;
  titulo: string;
  render: (item: T) => ReactNode;
  papel?: PapelColuna;
  alinhar?: "left" | "right" | "center";
  largura?: number | string;
  /** Torna a coluna ordenável: devolve o valor que ordena (número ou texto). */
  ordenar?: (item: T) => string | number | null | undefined;
}

export function DataList<T>({
  itens, colunas, chaveDe, onAbrir, vazio = "Nada por aqui.", minWidth = 640, densa = false,
  rotulo = "Lista", ordemInicial,
}: {
  itens: T[];
  colunas: Coluna<T>[];
  chaveDe: (item: T, i: number) => string;
  /** Cartão/linha inteira clicável. No celular também vira o alvo principal. */
  onAbrir?: (item: T) => void;
  vazio?: ReactNode;
  minWidth?: number;
  densa?: boolean;
  /** Nome da tabela pro leitor de tela. */
  rotulo?: string;
  /** Coluna (com `ordenar`) que já nasce ordenada. */
  ordemInicial?: { coluna: string; sentido?: "asc" | "desc" };
}) {
  const celular = useIsMobile();
  const [ordem, setOrdem] = useState<SortDescriptor | undefined>(() =>
    ordemInicial ? { column: ordemInicial.coluna, direction: ordemInicial.sentido === "desc" ? "descending" : "ascending" } : undefined);
  const titulo = colunas.find((c) => c.papel === "titulo") ?? colunas[0];

  // A ordem vale nos DOIS desenhos: quem ordenou no computador e abriu no
  // celular vê a mesma sequência.
  const { ordenados, porChave } = useMemo(() => {
    const lista = itens.map((item, i) => ({ item, chave: chaveDe(item, i) }));
    const col = ordem && colunas.find((c) => c.chave === ordem.column);
    if (col?.ordenar) {
      const f = col.ordenar;
      const s = ordem!.direction === "descending" ? -1 : 1;
      lista.sort((a, b) => {
        const va = f(a.item), vb = f(b.item);
        const vazio = (v: unknown) => v == null || v === "";
        if (vazio(va) || vazio(vb)) return comparar(va, vb);
        return comparar(va, vb) * s;
      });
    }
    return { ordenados: lista, porChave: new Map(lista.map((l) => [l.chave, l.item])) };
  }, [itens, colunas, chaveDe, ordem]);

  if (!itens.length) {
    return (
      <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--text-dim)", fontSize: 13.5 }}>
        {vazio}
      </div>
    );
  }

  // ── Celular: cartões ──
  if (celular) {
    const destaque = colunas.find((c) => c.papel === "destaque");
    const acoes = colunas.filter((c) => c.papel === "acoes");
    const metas = colunas.filter((c) => c !== titulo && c !== destaque && c.papel !== "acoes" && c.papel !== "oculta");

    return (
      // `Fila` carimba o `--mt-i` em cada `<li>`: os cartões entram em cascata,
      // e o atraso satura no `--mt-teto` pra que o último de uma lista longa
      // não fique esperando a fila inteira passar.
      <Fila as="ul" style={{ display: "grid", gap: 8, listStyle: "none", margin: 0, padding: 0 }}>
        {ordenados.map(({ item, chave }) => (
          <li key={chave}
            style={{
              border: "1px solid var(--border)", borderRadius: 14, padding: densa ? 11 : 13,
              background: "var(--surface)", display: "grid", gap: 9,
            }}>
            <div
              onClick={onAbrir ? () => onAbrir(item) : undefined}
              role={onAbrir ? "button" : undefined}
              tabIndex={onAbrir ? 0 : undefined}
              onKeyDown={onAbrir ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(item); } } : undefined}
              style={{ display: "flex", alignItems: "flex-start", gap: 10, minHeight: onAbrir ? "var(--tap)" : undefined, cursor: onAbrir ? "pointer" : undefined }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: "var(--text)" }}>
                {titulo.render(item)}
              </div>
              {destaque && (
                <div style={{ flex: "none", fontSize: 14.5, fontWeight: 800, color: "var(--text)", textAlign: "right" }}>
                  {destaque.render(item)}
                </div>
              )}
              {onAbrir && <Icon name="chevron-right" size={16} color="var(--text-dim)" />}
            </div>

            {metas.length > 0 && (
              <dl style={{ display: "grid", gap: 5, margin: 0 }}>
                {metas.map((c) => (
                  <div key={c.chave} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 12.5 }}>
                    <dt style={{ flex: "none", color: "var(--text-dim)", fontWeight: 600 }}>{c.titulo}</dt>
                    <dd style={{ flex: 1, minWidth: 0, margin: 0, textAlign: "right", color: "var(--text)", overflowWrap: "anywhere" }}>
                      {c.render(item)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {acoes.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, paddingTop: 2 }}>
                {acoes.map((c) => <div key={c.chave}>{c.render(item)}</div>)}
              </div>
            )}
          </li>
        ))}
      </Fila>
    );
  }

  // ── Desktop: a tabela do HeroUI (bandeja + cartão), ver ui/tabela.css ──
  return (
    <Table className="ui-tabela" data-densa={densa ? "1" : undefined} data-abre={onAbrir ? "1" : undefined}>
      <Table.ScrollContainer>
        <Table.Content
          aria-label={rotulo}
          style={{ minWidth }}
          sortDescriptor={ordem}
          onSortChange={setOrdem}
          onRowAction={onAbrir ? (k) => { const it = porChave.get(String(k)); if (it) onAbrir(it); } : undefined}
        >
          <Table.Header>
            {colunas.map((c) => (
              <Table.Column key={c.chave} id={c.chave} isRowHeader={c === titulo}
                allowsSorting={!!c.ordenar}
                style={{ width: c.largura, textAlign: c.alinhar ?? "left" }}>
                {({ sortDirection }) => c.ordenar ? (
                  <Table.SortableColumnHeader sortDirection={sortDirection}
                    style={{ justifyContent: c.alinhar === "right" ? "flex-end" : c.alinhar === "center" ? "center" : "flex-start" }}
                    indicator={<span><Icon name="chevron-up" size={12} /></span>}>
                    {c.titulo}
                  </Table.SortableColumnHeader>
                ) : c.titulo}
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body className="mt-fila">
            {ordenados.map(({ item, chave }, i) => (
              <Table.Row key={chave} id={chave} textValue={texto(titulo.render(item)) || chave}
                className="mt-linha" style={{ ["--mt-i" as string]: i }}>
                {colunas.map((c) => (
                  <Table.Cell key={c.chave} style={{ textAlign: c.alinhar ?? "left" }}>
                    {/* Botão/link/campo dentro da linha é dele, não da linha:
                        sem isto, tocar "Excluir" também abriria o detalhe. */}
                    <div className="ui-tabela__cel" onPointerDown={soDoFilho} onClick={soDoFilho}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") soDoFilho(e); }}>
                      {c.render(item)}
                    </div>
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

const INTERATIVO = "button, a[href], input, select, textarea, label, [role=button], [role=switch], [role=checkbox], [contenteditable=true]";

/** Pára o evento quando nasceu num controle dentro da célula. */
function soDoFilho(e: SyntheticEvent) {
  const alvo = e.target as HTMLElement;
  const ctl = alvo.closest?.(INTERATIVO);
  if (ctl && e.currentTarget.contains(ctl)) e.stopPropagation();
}

/** Texto plano de um nó (pro `textValue` da linha — busca por digitação). */
function texto(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(texto).join("");
  if (isValidElement(n)) return texto((n.props as { children?: ReactNode }).children);
  return "";
}

function comparar(a: string | number | null | undefined, b: string | number | null | undefined): number {
  // Vazio sempre por último, nos dois sentidos — é o que ninguém quer ver primeiro.
  const va = a == null || a === "", vb = b == null || b === "";
  if (va || vb) return va === vb ? 0 : va ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
}

// ── Aviso "melhor no computador" ────────────────────────────────────────────
// Para editores que NÃO valem redesenho mobile (canvas de fluxo, editor de
// página, studio de criativos): em vez de entregar uma tela quebrada fingindo
// que funciona, avisa — e deixa entrar assim mesmo, porque bloquear seria pior.
export function DesktopOnlyNotice({ titulo, motivo, children }: {
  titulo: string;
  motivo: string;
  children: ReactNode;
}) {
  const celular = useIsMobile();
  const [entrar, setEntrar] = useState(false);
  if (!celular || entrar) return <>{children}</>;

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60dvh", padding: 20 }}>
      <div style={{ maxWidth: 380, textAlign: "center", display: "grid", gap: 12, justifyItems: "center" }}>
        <span style={{ width: 52, height: 52, borderRadius: 16, display: "grid", placeItems: "center", background: "var(--surface-2)" }}>
          <Icon name="device-desktop" size={26} color="var(--text-dim)" />
        </span>
        <strong style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{titulo}</strong>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-dim)", margin: 0 }}>{motivo}</p>
        <button onClick={() => setEntrar(true)}
          style={{ marginTop: 4, padding: "11px 18px", minHeight: "var(--tap)", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>
          Abrir assim mesmo
        </button>
      </div>
    </div>
  );
}
