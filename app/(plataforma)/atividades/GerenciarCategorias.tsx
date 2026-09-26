"use client";

// ── Categorias da Visão geral (criadas à mão) ────────────────────────────────
// Pedido do dono (11/09/2026): juntar vários itens num cartão só — "Almofada"
// com todos os tamanhos dentro. Clicar no cartão abre os tamanhos; escolher um
// abre as atividades dele (LancadorDeAtividade). A lista vale pra equipe
// inteira (`atividades_config.visao_grupos`) e quem muda é quem tem
// Atividades › Configurar. Nada aqui mexe no estoque: é só como a tela agrupa.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { Botao, BotaoIcone, PainelLateral } from "../ui/controles";
import { confirmar, toast } from "../Toast";
import { SeletorDeItens, type ItemDoCatalogo } from "./SeletorDeItens";
import { itensComONome, limparGrupos, type GrupoDaVisao } from "@/lib/atividades-lancador";

type Rascunho = { id: string; nome: string; itens: Set<string>; novo: boolean };

const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

export function GerenciarCategorias({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [catalogo, setCatalogo] = useState<ItemDoCatalogo[] | null>(null);
  const [grupos, setGrupos] = useState<GrupoDaVisao[]>([]);
  const [erro, setErro] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/atividades/visao?catalogo=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { setCatalogo(d.itens ?? []); setGrupos(limparGrupos(d.grupos)); })
      .catch(() => setErro(true));
  }, []);

  const porId = useMemo(() => new Map((catalogo ?? []).map((i) => [i.id, i])), [catalogo]);
  const casam = useMemo(
    () => (rascunho ? itensComONome(catalogo ?? [], rascunho.nome).filter((i) => !rascunho.itens.has(i.id)) : []),
    [catalogo, rascunho],
  );

  async function gravar(lista: GrupoDaVisao[], aviso: string): Promise<boolean> {
    setSalvando(true);
    try {
      const r = await fetch("/api/atividades/visao", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grupos: lista }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        setGrupos(limparGrupos(d.grupos ?? lista));
        toast.ok(aviso);
        onSalvo();
        return true;
      }
      toast.erro(d.error === "sem_tabela" ? "Falta rodar o SQL atividades_itens_da_visao pra guardar grupos." : "Não foi possível salvar agora.");
      return false;
    } catch {
      toast.erro("A conexão caiu. Tente de novo.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function salvarRascunho() {
    if (!rascunho) return;
    const g: GrupoDaVisao = { id: rascunho.id, nome: rascunho.nome.trim(), itens: [...rascunho.itens] };
    const lista = rascunho.novo ? [...grupos, g] : grupos.map((x) => (x.id === g.id ? g : x));
    if (await gravar(lista, `Grupo "${g.nome}" salvo com ${g.itens.length} ${g.itens.length === 1 ? "item" : "itens"}.`)) setRascunho(null);
  }

  async function apagar(g: GrupoDaVisao) {
    const vai = await confirmar(`Apagar o grupo "${g.nome}"?`, {
      detalhe: "Os produtos dele voltam a aparecer soltos na Visão geral. Nada muda no estoque.", perigo: true,
    });
    if (vai) await gravar(grupos.filter((x) => x.id !== g.id), `Grupo "${g.nome}" apagado.`);
  }

  function alternar(id: string) {
    setRascunho((r) => {
      if (!r) return r;
      const itens = new Set(r.itens);
      if (itens.has(id)) itens.delete(id); else itens.add(id);
      return { ...r, itens };
    });
  }

  const podeSalvar = !!rascunho && rascunho.nome.trim().length > 0 && rascunho.itens.size > 0;

  return (
    <PainelLateral largura={560} onFechar={onFechar} soFechaNoX={!!rascunho}
      titulo={rascunho ? (rascunho.novo ? "Novo grupo" : `Editar ${rascunho.nome || "grupo"}`) : "Grupos de produtos"}
      subtitulo={rascunho
        ? "Dê um nome e marque os produtos que entram nele."
        : "Junte produtos parecidos num cartão só — ex.: Almofada com todos os tamanhos."}
      rodape={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", width: "100%" }}>
          {rascunho ? (
            <>
              <Botao variante="sutil" onClick={() => setRascunho(null)} disabled={salvando}>Cancelar</Botao>
              <Botao variante="primario" onClick={salvarRascunho} carregando={salvando} disabled={!podeSalvar}>
                Salvar grupo
              </Botao>
            </>
          ) : (
            <Botao variante="primario" icone="plus" disabled={!catalogo}
              onClick={() => setRascunho({ id: novoId(), nome: "", itens: new Set(), novo: true })}>
              Novo grupo
            </Botao>
          )}
        </div>
      }>
      {erro && <p style={{ margin: 0, fontSize: 13, color: "var(--perigo)" }}>Não deu pra carregar o catálogo. Feche e abra de novo.</p>}
      {!catalogo && !erro && <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>Carregando…</p>}

      {catalogo && rascunho && (
        <div style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Nome do grupo</span>
            <input autoFocus value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              placeholder="Ex.: Almofada" maxLength={60}
              style={{ width: "100%", boxSizing: "border-box", minHeight: "var(--tap)", padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 15 }} />
          </label>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>
              Itens do grupo <span style={{ fontWeight: 600, color: "var(--text-dim)" }}>· {rascunho.itens.size} marcados</span>
            </span>
            {casam.length > 0 && (
              <Botao variante="secundario" tamanho="sm" icone="checks"
                onClick={() => setRascunho({ ...rascunho, itens: new Set([...rascunho.itens, ...casam.map((i) => i.id)]) })}>
                {casam.length === 1
                  ? `Marcar o item que tem “${rascunho.nome.trim()}”`
                  : `Marcar os ${casam.length} que têm “${rascunho.nome.trim()}”`}
              </Botao>
            )}
          </div>
          <SeletorDeItens catalogo={catalogo} marcados={rascunho.itens} onAlternar={alternar} />
        </div>
      )}

      {catalogo && !rascunho && (
        grupos.length === 0
          ? <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
              Nenhum grupo ainda. Crie um pra juntar produtos parecidos — eles viram um cartão só, e clicar abre cada um.
            </p>
          : (
            <div style={{ display: "grid", gap: 8 }}>
              {grupos.map((g) => {
                const dentro = g.itens.map((id) => porId.get(id)).filter((i): i is ItemDoCatalogo => !!i);
                const fotos = dentro.filter((i) => i.imagem_url).slice(0, 3);
                return (
                  <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", minWidth: 0 }}>
                    <span style={{ display: "flex", flex: "none" }}>
                      {fotos.length
                        // eslint-disable-next-line @next/next/no-img-element
                        ? fotos.map((f, k) => <img key={f.id} src={f.imagem_url!} alt="" loading="lazy" style={{ width: 34, height: 34, borderRadius: "var(--r-xs)", objectFit: "cover", marginLeft: k ? -12 : 0, boxShadow: "0 0 0 2px var(--bg)" }} />)
                        : <span style={{ width: 34, height: 34, borderRadius: "var(--r-xs)", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}><Icon name="layout-grid" size={16} color="var(--primary-texto)" /></span>}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.nome}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {dentro.length} {dentro.length === 1 ? "item" : "itens"}{dentro.length ? ` · ${dentro.slice(0, 3).map((i) => i.nome).join(", ")}${dentro.length > 3 ? "…" : ""}` : ""}
                      </span>
                    </span>
                    <Botao variante="sutil" tamanho="sm" onClick={() => setRascunho({ id: g.id, nome: g.nome, itens: new Set(g.itens), novo: false })}>Editar</Botao>
                    <BotaoIcone icone="trash" titulo={`Apagar ${g.nome}`} onClick={() => apagar(g)} />
                  </div>
                );
              })}
            </div>
          )
      )}
    </PainelLateral>
  );
}
