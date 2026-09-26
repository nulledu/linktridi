import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { quantidadeDoItem } from "@/lib/estoque-catalogo-consulta";
import {
  acharPorCodigo, caminhoDe, descendentesDe, filhosDe, type LocalDaArvore,
} from "@/lib/estoque-locais-arvore";
import { Icon } from "@/app/(plataforma)/Icon";
import { AjustarNoLugar } from "./AjustarNoLugar";

// ── /g/<codigo> — a etiqueta de prateleira aberta no celular ─────────────────
//
// É a página que o QR impresso na prateleira abre: qualquer pessoa no galpão
// (ou um cliente conferindo uma entrega) aponta a câmera e vê o que está
// registrado naquele lugar. PÚBLICA por decisão do dono — sem login, só
// leitura, nenhum preço/custo/fornecedor viaja daqui. O middleware libera o
// prefixo /g (PUBLIC_PREFIXES) e sai cedo, sem montar cliente de auth.
//
// `revalidate = 60`: QR é bipado o dia inteiro, e cada scan NÃO pode virar uma
// invocação + duas idas ao Supabase — foi execução (não egress) que pausou o
// projeto na Vercel em agosto. Com ISR a Vercel serve o HTML pronto do cache e
// só re-renderiza uma vez por minuto por etiqueta; um mutirão de conferência
// inteiro custa o mesmo que uma pessoa. Um minuto de atraso não atrapalha
// ninguém que está DE PÉ olhando a prateleira.
export const revalidate = 60;

/** Teto da tabela de locais (~80 linhas hoje; ver estoque_locais). */
const LIMITE_LOCAIS = 1000;
/** Teto de itens numa folha só. Acima disso a lista avisa que está cortada em
 *  vez de fingir que o lugar tem menos coisa do que tem. */
const LIMITE_ITENS = 300;

interface ItemDoLugar {
  id: string;
  nome: string;
  sku: string | null;
  quantidade: number;
  unidade: string;
  local_id: string | null;
  foto: string | null;
}

type Carga =
  | { estado: "indisponivel" }
  | { estado: "nao-achou" }
  | {
      estado: "ok";
      lugar: LocalDaArvore;
      caminho: LocalDaArvore[];
      filhos: { local: LocalDaArvore; itens: number }[];
      itens: ItemDoLugar[];
      cortado: boolean;
      codigoPorLocal: Map<string, string>;
    };

async function carregar(codigo: string): Promise<Carga> {
  // Sem env, sem página — mas com uma frase, nunca um stack. A etiqueta já
  // está impressa e colada: quem bipou não tem o que fazer com um erro 500.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { estado: "indisponivel" };
  }
  try {
    const db = createSupabaseAdminClient();
    // A árvore INTEIRA numa ida só (~80 linhas): resolver pai/filho aqui é o
    // que evita uma query por nível da hierarquia a cada scan.
    const { data: locais, error } = await db.from("estoque_locais")
      .select("id,nome,codigo,pai_id,ativo,ordem")
      .limit(LIMITE_LOCAIS);
    if (error) return { estado: "indisponivel" };

    const arvore = (locais ?? []) as LocalDaArvore[];
    const lugar = acharPorCodigo(codigo, arvore);
    if (!lugar) return { estado: "nao-achou" };

    const ids = descendentesDe(lugar.id, arvore);
    // `imagem_url` é a mesma coluna que a faxina de fotos preenche — quando o
    // item tem foto, ela é o que confirma "é isso mesmo" pra quem confere.
    const { data: linhas, error: erroItens } = await db.from("estoque_itens")
      .select("id,nome,sku,quantidade,unidade,local_id,imagem_url")
      .eq("ativo", true)
      .in("local_id", ids)
      .order("nome", { ascending: true })
      .limit(LIMITE_ITENS);
    if (erroItens) return { estado: "indisponivel" };

    const itens: ItemDoLugar[] = ((linhas ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id ?? ""),
      nome: String(r.nome ?? ""),
      sku: r.sku ? String(r.sku) : null,
      quantidade: quantidadeDoItem(r.quantidade),
      unidade: r.unidade ? String(r.unidade) : "un",
      local_id: r.local_id ? String(r.local_id) : null,
      foto: r.imagem_url ? String(r.imagem_url) : null,
    })).filter((i) => i.id && i.nome);

    // Contagem por sublugar: cada filho direto soma os itens da SUBÁRVORE dele
    // — a etiqueta da Rua diz quantas coisas há em cada estante, não só o que
    // foi gravado apontando pra própria rua.
    const filhos = filhosDe(lugar.id, arvore)
      .filter((f) => f.ativo !== false)
      .map((f) => {
        const sub = new Set(descendentesDe(f.id, arvore));
        return { local: f, itens: itens.filter((i) => i.local_id && sub.has(i.local_id)).length };
      });

    return {
      estado: "ok",
      lugar,
      caminho: caminhoDe(lugar.id, arvore),
      filhos,
      itens,
      cortado: itens.length >= LIMITE_ITENS,
      codigoPorLocal: new Map(arvore.map((l) => [l.id, l.codigo])),
    };
  } catch {
    return { estado: "indisponivel" };
  }
}

export async function generateMetadata({ params }: { params: Promise<{ codigo: string }> }): Promise<Metadata> {
  const { codigo } = await params;
  // Sem ida ao banco no metadata: o título é o código da etiqueta, que a
  // pessoa acabou de ler na prateleira — é o nome certo da aba.
  return { title: `${decodeURIComponent(codigo).toUpperCase()} · Conferência` };
}

// A quantidade como o galpão fala: inteiro sem casa, fração com até 2.
const qtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export default async function LugarPublico({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const carga = await carregar(decodeURIComponent(codigo));

  if (carga.estado === "nao-achou") notFound();
  if (carga.estado === "indisponivel") {
    return (
      <main className="g-scope" style={estilos.pagina}>
        <div style={estilos.folha}>
          <Icon name="plug-off" size={28} color="var(--text-dim)" />
          <h1 style={{ ...estilos.codigo, fontSize: 22 }}>Consulta indisponível</h1>
          <p style={estilos.dim}>
            Não deu pra consultar o estoque agora. Tente de novo em instantes —
            a etiqueta continua valendo.
          </p>
        </div>
      </main>
    );
  }

  const { lugar, caminho, filhos, itens, cortado, codigoPorLocal } = carga;

  return (
    <main className="g-scope" style={estilos.pagina}>
      <div style={estilos.folha}>
        {/* O código GRANDE primeiro: é o que está impresso na placa — a pessoa
            confere de relance que abriu a etiqueta certa. */}
        <header style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="building-warehouse" size={26} color="var(--primary)" />
            <h1 style={estilos.codigo}>{lugar.codigo}</h1>
          </div>
          {lugar.nome && lugar.nome !== lugar.codigo && (
            <div style={{ fontSize: 17, fontWeight: 600 }}>{lugar.nome}</div>
          )}
          {caminho.length > 1 && (
            <nav style={estilos.caminho} aria-label="Caminho do lugar">
              {caminho.map((p, i) => (
                <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {i > 0 && <Icon name="chevron-right" size={13} color="var(--text-dim)" />}
                  <span style={i === caminho.length - 1 ? { color: "var(--text)" } : undefined}>{p.nome}</span>
                </span>
              ))}
            </nav>
          )}
        </header>

        {filhos.length > 0 && (
          <section style={estilos.bloco}>
            <h2 style={estilos.titulo}>Dentro deste lugar</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {filhos.map((f) => (
                <Link key={f.local.id} href={`/g/${encodeURIComponent(f.local.codigo.toLowerCase())}`} style={estilos.sublugar}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 700 }}>{f.local.codigo}</span>
                    {f.local.nome !== f.local.codigo && (
                      <span style={{ color: "var(--text-dim)" }}> · {f.local.nome}</span>
                    )}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={estilos.dimPequeno}>{f.itens === 1 ? "1 item" : `${f.itens} itens`}</span>
                    <Icon name="chevron-right" size={16} color="var(--text-dim)" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section style={estilos.bloco}>
          <h2 style={estilos.titulo}>
            {filhos.length ? "Itens aqui e nos sublugares" : "Itens neste lugar"}
          </h2>
          {itens.length === 0 ? (
            <p style={estilos.dim}>Nada registrado neste lugar ainda.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {itens.map((i) => (
                <div key={i.id} style={estilos.item}>
                  {i.foto && (
                    // eslint-disable-next-line @next/next/no-img-element -- foto
                    // vinda do bucket do Supabase; next/image exigiria liberar o
                    // domínio e otimização paga por scan, pra um thumb de 44px.
                    <img src={i.foto} alt="" width={44} height={44} style={estilos.foto} loading="lazy" />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{i.nome}</div>
                    <div style={estilos.dimPequeno}>
                      {i.sku && <span>{i.sku}</span>}
                      {/* Só quando o item está ABAIXO do lugar bipado: na folha
                          da própria prateleira o código dela seria ruído. */}
                      {i.local_id && i.local_id !== lugar.id && codigoPorLocal.get(i.local_id) && (
                        <span style={estilos.chip}>{codigoPorLocal.get(i.local_id)}</span>
                      )}
                    </div>
                  </div>
                  <div style={estilos.quantidade}>
                    {qtd(i.quantidade)}
                    <span style={estilos.unidade}> {i.unidade}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* ── A metade que escreve ─────────────────────────────────────
              Nasce fechada e só pergunta a permissão no TOQUE: a página é
              pública e cacheada (ISR de 60s) porque foi execução que pausou
              este projeto na Vercel, e quem só apontou a câmera pra ver o que
              tem na prateleira não pode pagar uma invocação por isso. */}
          <AjustarNoLugar
            local={lugar.codigo}
            localId={lugar.id}
            itens={itens.map((i) => ({
              id: i.id, nome: i.nome, quantidade: i.quantidade, unidade: i.unidade,
              // Item que veio de um SUBLUGAR não recebe o "tirar daqui": ele não
              // mora nesta placa, e movê-lo seria mexer num endereço que a
              // pessoa não está olhando.
              deSublugar: !!i.local_id && i.local_id !== lugar.id,
            }))}
          />
          {cortado && (
            <p style={{ ...estilos.dim, marginTop: 10 }}>
              Mostrando os primeiros {LIMITE_ITENS} itens — este lugar tem mais do que cabe numa folha.
            </p>
          )}
        </section>

        <footer style={{ ...estilos.dimPequeno, textAlign: "center", paddingBottom: "var(--safe-b, 0px)" }}>
          {/* Era "somente leitura", e deixou de ser verdade: quem tem permissão
              ajusta o número, guarda produto aqui e tira daqui. Rodapé que
              descreve errado o que a tela faz ensina a não confiar nela. */}
          Conferência de estoque · quem tem permissão também corrige
        </footer>
      </div>
    </main>
  );
}

// Inline e mobile-first de propósito: a página está FORA de (plataforma) e não
// carrega CSS de tela nenhuma — só os TOKENS do globals.css (importado no
// layout raiz), que já trocam de valor com o tema (html.light). Nenhuma medida
// fixa de largura: coluna única com teto, então 320px nunca estoura.
const estilos: Record<string, CSSProperties> = {
  pagina: {
    minHeight: "100dvh",
    background: "var(--bg)",
    color: "var(--text)",
    fontFamily: "var(--font)",
    display: "flex",
    justifyContent: "center",
    padding: "max(16px, var(--safe-t, 0px)) max(14px, var(--safe-r, 0px)) max(24px, var(--safe-b, 0px)) max(14px, var(--safe-l, 0px))",
  },
  folha: { width: "100%", maxWidth: 560, display: "grid", gap: 18, alignContent: "start" },
  codigo: { fontSize: 30, fontWeight: 800, letterSpacing: 0.5, margin: 0, overflowWrap: "anywhere" },
  caminho: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", fontSize: 13.5, color: "var(--text-dim)" },
  bloco: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 14,
  },
  titulo: { fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text-dim)", margin: "0 0 10px" },
  // Link de sublugar é ALVO: 44px de altura mínima (--tap), o dedo no meio do
  // galpão não acerta menos que isso.
  sublugar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    minHeight: "var(--tap, 44px)",
    padding: "8px 12px",
    borderRadius: 12,
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    textDecoration: "none",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: "var(--tap, 44px)",
    padding: "8px 10px",
    borderRadius: 12,
    background: "var(--surface-2)",
  },
  foto: { borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "var(--surface)" },
  quantidade: { fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 },
  unidade: { fontSize: 12, fontWeight: 600, color: "var(--text-dim)" },
  chip: {
    display: "inline-block",
    marginLeft: 6,
    padding: "1px 7px",
    borderRadius: 999,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    fontSize: 11.5,
    fontWeight: 700,
  },
  dim: { color: "var(--text-dim)", fontSize: 14.5, margin: 0, lineHeight: 1.5 },
  dimPequeno: { color: "var(--text-dim)", fontSize: 12.5, display: "flex", alignItems: "center", flexWrap: "wrap" },
};
