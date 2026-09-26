"use client";

// LinkTridi dentro do Marketing · Geral (aba Páginas). Lista PRÓPRIA, no mesmo
// desenho da lista da Central de Tutoriais ao lado: cartão com o estado, o
// link público e as ações. Antes a aba montava o gerenciador inteiro de
// projetos do TridiFlow (pastas, "starts", "crie seu primeiro projeto") preso
// num tipo — e o botão do vazio abria um menu em que o LinkTridi estava
// desligado. A API é a mesma (/api/tridiflow/bots?escopo=marketing): quem tem
// a área `marketing` lista, cria e mexe — só nas páginas do Marketing.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { confirmar, toast } from "../../Toast";
import { Botao, BotaoIcone } from "../../ui/controles";
import { BotaoPublicar } from "../../ui/BotaoPublicar";

type LinkTridi = {
  id: string; nome: string; slug: string; status: "rascunho" | "publicado";
  tipo?: string; arquivado?: boolean; updatedAt: string; dominioHost: string | null;
};

const DOMINIO_PADRAO = "gedux.com.br";
const linkDe = (b: LinkTridi) => `https://${b.dominioHost || DOMINIO_PADRAO}/f/${b.slug}`;
const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
const GRADE = "repeat(auto-fill,minmax(min(100%,300px),1fr))";

function Selo({ publicado }: { publicado: boolean }) {
  return <span style={{
    display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999,
    fontSize: 11, fontWeight: 800, letterSpacing: ".01em",
    background: publicado ? "color-mix(in srgb, var(--ok) 14%, transparent)" : "var(--surface-2)",
    color: publicado ? "var(--ok)" : "var(--text-dim)",
  }}>
    <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor" }} />
    {publicado ? "No ar" : "Rascunho"}
  </span>;
}

export function LinkTridiLista({ podeEditar }: { podeEditar: boolean }) {
  const [itens, setItens] = useState<LinkTridi[] | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(() => {
    fetch("/api/tridiflow/bots?escopo=marketing", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setItens(((j.bots ?? []) as LinkTridi[]).filter((b) => b.tipo === "linktridi" && !b.arquivado));
    }).catch(() => setItens([]));
  }, []);
  useEffect(() => carregar(), [carregar]);

  const criar = async () => {
    setCriando(true);
    try {
      const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "linktridi", nome: "Meu LinkTridi" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast.erro(j.error || "Não deu para criar o LinkTridi.");
      window.location.href = `/marketing/linktridi/${j.bot.id}`;
    } finally { setCriando(false); }
  };
  const acao = async (id: string, a: "publicar" | "despublicar" | "duplicar") => {
    const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, acao: a }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.erro(j.error || "Não deu para atualizar."); return false; }
    toast.ok(a === "publicar" ? "LinkTridi no ar." : a === "despublicar" ? "LinkTridi fora do ar." : "Cópia criada.");
    carregar();
    return true;
  };
  const excluir = async (b: LinkTridi) => {
    if (!(await confirmar(`Excluir “${b.nome}”?`, { detalhe: "O link deixa de abrir e os cartões são apagados. Não dá pra desfazer.", perigo: true }))) return;
    const r = await fetch(`/api/tridiflow/bots?id=${b.id}`, { method: "DELETE" });
    if (!r.ok) return toast.erro("Não deu para excluir.");
    setItens((xs) => (xs ?? []).filter((x) => x.id !== b.id));
  };
  const copiarLink = async (b: LinkTridi) => {
    try { await navigator.clipboard.writeText(linkDe(b)); toast.ok("Link copiado."); }
    catch { toast.erro("Não deu para copiar o link."); }
  };

  return <section style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1240 }}>
    <header style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>LinkTridi</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 4 }}>O link da bio: sua marca no topo e cartões que levam pro produto e pro checkout.</p>
      </div>
      {podeEditar && (itens?.length ?? 0) > 0 && (
        <Botao variante="primario" icone="plus" carregando={criando} onClick={criar}>Novo LinkTridi</Botao>
      )}
    </header>

    {itens === null && (
      <div style={{ display: "grid", gridTemplateColumns: GRADE, gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="t-skel" style={{ height: 168, borderRadius: 18, background: "var(--surface)", border: "1px solid var(--border)" }} />
        ))}
      </div>
    )}

    {itens && itens.length > 0 && (
      <div style={{ display: "grid", gridTemplateColumns: GRADE, gap: 14 }}>
        {itens.map((b) => (
          <article key={b.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 42, height: 42, borderRadius: 13, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb,var(--primary) 13%,transparent)" }}>
                <Icon name="link" size={21} color="var(--primary-texto)" />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nome}</h3>
                <div style={{ marginTop: 3 }}><Selo publicado={b.status === "publicado"} /></div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <Icon name="world-www" size={14} color="var(--text-dim)" />
              <span style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{linkDe(b).replace("https://", "")}</span>
              <BotaoIcone icone="copy" titulo="Copiar link" tamanho="sm" onClick={() => copiarLink(b)} />
            </div>

            <p style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Atualizado em {fmtData(b.updatedAt)}</p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
              <Link className="ui-btn mt-anel" data-v="primario" data-t="md" href={`/marketing/linktridi/${b.id}`}>
                <Icon name={podeEditar ? "pencil" : "eye"} size={15} />{podeEditar ? "Editar" : "Abrir"}
              </Link>
              {b.status === "publicado" && (
                <a className="ui-btn mt-anel" data-v="secundario" data-t="md" href={linkDe(b)} target="_blank" rel="noreferrer"><Icon name="external-link" size={15} />Ver</a>
              )}
              {podeEditar && (b.status === "publicado"
                ? <Botao tamanho="md" onClick={() => acao(b.id, "despublicar")}>Tirar do ar</Botao>
                : <BotaoPublicar onPublicar={() => acao(b.id, "publicar")} />)}
              {podeEditar && <BotaoIcone icone="copy-plus" titulo={`Duplicar ${b.nome}`} onClick={() => acao(b.id, "duplicar")} />}
              {podeEditar && <BotaoIcone icone="trash" titulo={`Excluir ${b.nome}`} onClick={() => excluir(b)} />}
            </div>
          </article>
        ))}
      </div>
    )}

    {itens?.length === 0 && (
      <div style={{ border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 20, padding: "clamp(24px, 5vw, 48px)", display: "grid", justifyItems: "center", textAlign: "center", gap: 8 }}>
        <span style={{ width: 56, height: 56, borderRadius: 18, display: "grid", placeItems: "center", background: "color-mix(in srgb,var(--primary) 13%,transparent)" }}>
          <Icon name="link" size={28} color="var(--primary-texto)" />
        </span>
        <h3 style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>Crie o link da sua bio</h3>
        <p style={{ color: "var(--text-dim)", fontSize: 13.5, maxWidth: 440 }}>
          Uma página com a sua marca e uma vitrine de cartões — produto, catálogo, WhatsApp — pra colocar no Instagram e no TikTok.
        </p>
        {podeEditar
          ? <Botao variante="primario" icone="plus" carregando={criando} onClick={criar}>Criar LinkTridi</Botao>
          : <p style={{ color: "var(--text-dim)", fontSize: 12.5 }}>Peça a quem cuida do Marketing a permissão de criar LinkTridi.</p>}
      </div>
    )}
  </section>;
}
