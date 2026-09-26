"use client";

// Centrais de Tutoriais — a listagem. Cada central é um projeto de página
// (template central_tutoriais) publicado em /p/<slug>; o card mostra o estado
// e o endereço público, e as ações moram no próprio card. O vazio ensina o
// fluxo em três passos em vez de só constatar que não há nada.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { confirmar, toast } from "../../Toast";
import { Botao, BotaoIcone } from "../../ui/controles";
import { BotaoPublicar } from "../../ui/BotaoPublicar";

type Central = {
  id: string; nome: string; slug: string; status: "rascunho" | "publicado";
  templatePagina?: string; updatedAt: string; dominioHost: string | null;
  responsavel?: { id: string; nome: string };
};

const DOMINIO_PADRAO = "gedux.com.br";
const linkDe = (c: Central) => `https://${c.dominioHost || DOMINIO_PADRAO}/p/${c.slug}`;
const fmtData = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

function Selo({ publicado }: { publicado: boolean }) {
  return <span style={{
    display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 999,
    fontSize: 11, fontWeight: 800, letterSpacing: ".01em",
    background: publicado ? "color-mix(in srgb, var(--ok) 14%, transparent)" : "var(--surface-2)",
    color: publicado ? "var(--ok)" : "var(--text-dim)",
  }}>
    <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor" }} />
    {publicado ? "Publicada" : "Rascunho"}
  </span>;
}

export function TutoriaisClient({ embutido = false }: {
  /** Dentro do Marketing · Geral: o título vira de seção (h2), porque a
   *  página já tem o seu h1. */
  embutido?: boolean;
} = {}) {
  const [centrais, setCentrais] = useState<Central[] | null>(null);
  const [criando, setCriando] = useState(false);
  const carregar = useCallback(() => {
    fetch("/api/tridiflow/bots?tipo=page&escopo=marketing", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      setCentrais(((j.bots ?? []) as Central[]).filter((b) => b.templatePagina === "central_tutoriais"));
    }).catch(() => setCentrais([]));
  }, []);
  useEffect(() => carregar(), [carregar]);

  const criar = async () => {
    setCriando(true);
    try {
      const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "page", template: "central_tutoriais", nome: "Central de Tutoriais" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast.erro(j.error || "Não deu para criar a central.");
      window.location.href = `/marketing/tutoriais/${j.bot.id}`;
    } finally { setCriando(false); }
  };
  const acao = async (id: string, acao: "publicar" | "despublicar") => {
    const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, acao }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.erro(j.error || "Não deu para atualizar."); return false; }
    toast.ok(acao === "publicar" ? "Central publicada." : "Central despublicada."); carregar();
    return true;
  };
  const excluir = async (c: Central) => {
    if (!(await confirmar(`Excluir “${c.nome}”?`, { detalhe: "Tutoriais, categorias e a publicação serão apagados. Não dá pra desfazer.", perigo: true }))) return;
    const r = await fetch(`/api/tridiflow/bots?id=${c.id}`, { method: "DELETE" });
    if (!r.ok) return toast.erro("Não deu para excluir.");
    setCentrais((xs) => (xs ?? []).filter((x) => x.id !== c.id));
  };
  const copiarLink = async (c: Central) => {
    try { await navigator.clipboard.writeText(linkDe(c)); toast.ok("Link copiado."); }
    catch { toast.erro("Não deu para copiar o link."); }
  };

  return <section style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1240 }}>
    <header style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        {embutido
          ? <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-.02em" }}>Central de Tutoriais</h2>
          : <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, letterSpacing: "-.02em" }}>Centrais de Tutoriais</h1>}
        <p style={{ color: "var(--text-dim)", fontSize: 14, marginTop: 4 }}>Guias visuais publicados no mesmo domínio das suas páginas — categorias, busca e passo a passo.</p>
      </div>
      {(centrais?.length ?? 0) > 0 && (
        <Botao variante="primario" icone="plus" carregando={criando} onClick={criar}>Nova central</Botao>
      )}
    </header>

    {/* Carregando: silhuetas do card, não uma frase solta. */}
    {centrais === null && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,300px),1fr))", gap: 14 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="t-skel" style={{ height: 168, borderRadius: 18, background: "var(--surface)", border: "1px solid var(--border)" }} />
        ))}
      </div>
    )}

    {centrais && centrais.length > 0 && (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,300px),1fr))", gap: 14 }}>
        {centrais.map((c) => (
          <article key={c.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 42, height: 42, borderRadius: 13, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb,var(--primary) 13%,transparent)" }}>
                <Icon name="help-circle" size={21} color="var(--primary-texto)" />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</h2>
                <div style={{ marginTop: 3 }}><Selo publicado={c.status === "publicado"} /></div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <Icon name="world-www" size={14} color="var(--text-dim)" />
              <span style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{linkDe(c).replace("https://", "")}</span>
              <BotaoIcone icone="copy" titulo="Copiar link" tamanho="sm" onClick={() => copiarLink(c)} />
            </div>

            <p style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
              Atualizada em {fmtData(c.updatedAt)}{c.responsavel?.nome ? ` · por ${c.responsavel.nome}` : ""}
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "auto" }}>
              <Link className="ui-btn mt-anel" data-v="primario" data-t="md" href={`/marketing/tutoriais/${c.id}`}><Icon name="pencil" size={15} />Editar</Link>
              {c.status === "publicado" && (
                <a className="ui-btn mt-anel" data-v="secundario" data-t="md" href={linkDe(c)} target="_blank" rel="noreferrer"><Icon name="external-link" size={15} />Ver</a>
              )}
              {c.status === "publicado"
                ? <Botao tamanho="md" onClick={() => acao(c.id, "despublicar")}>Despublicar</Botao>
                : <BotaoPublicar onPublicar={() => acao(c.id, "publicar")} />}
              <BotaoIcone icone="trash" titulo={`Excluir ${c.nome}`} onClick={() => excluir(c)} />
            </div>
          </article>
        ))}
      </div>
    )}

    {/* Vazio: mostra o caminho inteiro, não só a constatação. */}
    {centrais?.length === 0 && (
      <div style={{ border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 20, padding: "clamp(24px, 5vw, 48px)", display: "grid", justifyItems: "center", textAlign: "center", gap: 8 }}>
        <span style={{ width: 56, height: 56, borderRadius: 18, display: "grid", placeItems: "center", background: "color-mix(in srgb,var(--primary) 13%,transparent)" }}>
          <Icon name="help-circle" size={28} color="var(--primary-texto)" />
        </span>
        <h2 style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>Monte a sua central de tutoriais</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13.5, maxWidth: 440 }}>
          Uma página pública com as dúvidas que mais se repetem: categorias com foto, busca e tutoriais em passo a passo, vídeo ou leitura.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,170px),1fr))", gap: 10, width: "100%", maxWidth: 620, margin: "10px 0 4px" }}>
          {([["circle-plus", "1. Crie a central", "Nome e endereço próprios, no seu domínio."],
             ["list-check", "2. Adicione tutoriais", "Blocos prontos: texto, passo, vídeo, produto."],
             ["world-www", "3. Publique o link", "Compartilhe /p/… com clientes e equipe."]] as const).map(([icone, titulo, texto]) => (
            <div key={titulo} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 14, textAlign: "left", display: "grid", gap: 6 }}>
              <Icon name={icone} size={18} color="var(--primary-texto)" />
              <strong style={{ fontSize: 13 }}>{titulo}</strong>
              <span style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45 }}>{texto}</span>
            </div>
          ))}
        </div>
        <Botao variante="primario" icone="plus" carregando={criando} onClick={criar}>Criar minha primeira central</Botao>
      </div>
    )}
  </section>;
}
