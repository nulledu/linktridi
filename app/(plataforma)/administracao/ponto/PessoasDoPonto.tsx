"use client";

// ── Pessoas no ponto ─────────────────────────────────────────────────────────
// O cadastro de quem bate ponto: rosto (é o que o tablet reconhece), turno e
// jornada. Mora em "Gestão de equipe" junto do resto do cadastro — antes era
// uma aba dentro do Ponto, o que obrigava a ir num lugar pra cadastrar a pessoa
// e noutro pra cadastrar a MESMA pessoa.
//
// A grade de cartões virou tabela porque cartão gasta a largura toda pra dizer
// nome + "3 foto(s)". Na tabela cabe o que se procura: turno, jornada, fotos e
// se está ativa — e a linha inteira é a porta pro drawer da pessoa.

import { useMemo, useRef, useState } from "react";
import { Icon } from "../../Icon";
import { toast, confirmar } from "../../Toast";
import { Avatar } from "../../ui/Avatar";
import { Botao } from "../../ui/controles";
import { PessoaModal } from "../PontoPanel";
import { PessoaDrawer } from "./PessoaDrawer";
import type { PontoPessoa } from "@/lib/ponto";
import { useAbrirFechar } from "../../ui/micro";

const fmtJornada = (min: number | null) => (min && min > 0 ? `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, "0") : "00"}` : "8h00");

export function PessoasDoPonto({ pessoas, podeGerir, onChange }: {
  pessoas: PontoPessoa[] | null;
  podeGerir: boolean;
  onChange: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<PontoPessoa | "nova" | null>(null);
  const mPessoa = useAbrirFechar(!!editando, "--modal-close-dur");
  const ultimoEditando = useRef<PontoPessoa | "nova" | null>(null);
  if (editando) ultimoEditando.current = editando;
  const [aberta, setAberta] = useState<PontoPessoa | null>(null);
  const [gerando, setGerando] = useState(false);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const arr = [...(pessoas ?? [])].sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome));
    return q ? arr.filter((p) => p.nome.toLowerCase().includes(q)) : arr;
  }, [pessoas, busca]);

  async function remover(p: PontoPessoa) {
    const ok = await confirmar(`Remover “${p.nome}” do ponto?`, { detalhe: "Os registros de batidas dela também somem.", perigo: true });
    if (!ok) return;
    const r = await fetch(`/api/ponto/pessoas?id=${p.id}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    // Sem este ramo a falha era MUDA: o botão não fazia nada e a pessoa
    // continuava na lista, sem uma linha dizendo por quê.
    if (!r.ok || !d?.ok) { toast.erro(d?.error === "tabela_ausente" ? "Rode o supabase/ponto.sql primeiro." : d?.error || "Não consegui remover do ponto."); return; }
    toast.ok("Pessoa removida"); setAberta(null); onChange();
  }

  // Arquivar = tirar do tablet SEM apagar as batidas. É o que quase sempre se
  // quer quando alguém sai: "Remover" leva o histórico junto.
  async function arquivar(p: PontoPessoa) {
    const arquivando = p.ativo;
    if (arquivando && !(await confirmar(`Tirar “${p.nome}” do ponto?`, { detalhe: "Ela some do tablet e para de bater ponto. As batidas e o banco de horas continuam guardados." }))) return;
    const r = await fetch("/api/ponto/pessoas", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, ativo: !arquivando }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d?.error) { toast.erro(d?.error === "tabela_ausente" ? "Rode o supabase/ponto.sql primeiro." : d?.error || "Não consegui mudar."); return; }
    toast.ok(arquivando ? `${p.nome} saiu do ponto.` : `${p.nome} voltou pro ponto.`);
    setAberta(null); onChange();
  }

  // Cria/vincula uma pessoa de ponto pra cada usuário ATIVO do sistema. Idempotente.
  async function gerarAtivos() {
    const ok = await confirmar("Gerar ponto para todos os usuários ativos?", { detalhe: "Cria um cadastro de ponto (vinculado ao login) pra quem ainda não tem. Não duplica nem mexe em quem já existe. Cada pessoa cadastra o rosto depois, no tablet." });
    if (!ok) return;
    setGerando(true);
    try {
      const r = await fetch("/api/ponto/gerar-ativos", { method: "POST" });
      const d = await r.json();
      if (!r.ok) { toast.erro(d?.error || "Falha ao gerar."); return; }
      toast.ok((d.criados?.length ?? 0) + (d.vinculados?.length ?? 0) > 0
        ? `${d.criados?.length ?? 0} criado(s), ${d.vinculados?.length ?? 0} vinculado(s).`
        : "Todos os ativos já tinham ponto.");
      onChange();
    } finally { setGerando(false); }
  }

  const GRID = "minmax(0,2fr) 1fr 78px 92px 96px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Busca + ações. A busca é o filtro desta seção — não precisa de rótulo. */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 220px", minWidth: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "0 12px", minHeight: "var(--ctl-md)" }}>
          <Icon name="search" size={15} color="var(--text-dim)" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa…"
            style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontFamily: "inherit", fontSize: 13.5, padding: "9px 0" }} />
          {busca && <button onClick={() => setBusca("")} aria-label="Limpar busca" style={{ border: "none", background: "none", cursor: "pointer", display: "grid", placeItems: "center" }}><Icon name="x" size={14} color="var(--text-dim)" /></button>}
        </label>
        {podeGerir && <Botao icone="clock" onClick={gerarAtivos} carregando={gerando}>Gerar pros ativos</Botao>}
        {podeGerir && <Botao variante="primario" icone="users" onClick={() => setEditando("nova")}>Cadastrar pessoa</Botao>}
      </div>

      {pessoas === null ? <div style={{ color: "var(--text-dim)", fontSize: 13.5, padding: 20 }}>Carregando…</div>
        : filtradas.length === 0 ? (
          <div className="glass" style={{ padding: 34, borderRadius: "var(--r-md)", textAlign: "center", color: "var(--text-dim)", fontSize: 14 }}>
            {busca ? `Ninguém com “${busca}”.` : "Ninguém cadastrado ainda. Cadastre a primeira pessoa com uma boa foto de rosto."}
          </div>
        ) : (
          <div style={{ borderRadius: "var(--r-md)", overflow: "hidden", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="tab-linha-head" style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "10px 16px", background: "var(--surface-2)", fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em" }}>
              <span>Pessoa</span><span>Turno</span><span>Jornada</span><span>Rosto</span><span />
            </div>
            {filtradas.map((p, i) => (
              <div key={p.id} className="tab-linha ponto-linha" onClick={() => setAberta(p)}
                style={{ display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "10px 16px", alignItems: "center", cursor: "pointer", borderTop: i > 0 ? "1px solid var(--border)" : "none", opacity: p.ativo ? 1 : 0.55 }}>
                <span className="tl-titulo" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <Avatar url={p.fotoUrl} nome={p.nome} size={30} formato="redondo" />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                    {!p.ativo && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>inativa</span>}
                  </span>
                </span>
                <span className="stat" data-l="Turno" style={{ fontSize: 13, color: p.entradaPrevista ? "var(--text)" : "var(--text-dim)" }}>
                  {p.entradaPrevista && p.saidaPrevista ? `${p.entradaPrevista}–${p.saidaPrevista}` : "sem turno"}
                </span>
                <span className="stat" data-l="Jornada" style={{ fontSize: 13, color: "var(--text-dim)" }}>{fmtJornada(p.jornadaMin)}</span>
                {/* Reconhecimento facial depende de FOTO: sem nenhuma, o tablet
                    não reconhece a pessoa — é um estado que precisa saltar. */}
                <span data-l="Rosto" style={{ fontSize: 12.5, color: 1 + p.fotos.length > 1 ? "var(--text-dim)" : "var(--atencao)", fontWeight: 1 + p.fotos.length > 1 ? 400 : 700 }}>
                  {1 + p.fotos.length} foto(s)
                </span>
                <span className="tl-acao" onClick={(ev) => ev.stopPropagation()} style={{ display: "flex", justifyContent: "flex-end" }}>
                  {podeGerir && <Botao tamanho="sm" icone="pencil" onClick={() => setEditando(p)}>Editar</Botao>}
                </span>
              </div>
            ))}
          </div>
        )}

      {mPessoa.montado && ultimoEditando.current && (
        <PessoaModal classe={mPessoa.classe} pessoa={ultimoEditando.current === "nova" ? null : ultimoEditando.current} onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); onChange(); }} />
      )}
      {aberta && (
        <PessoaDrawer
          pessoa={{ id: aberta.id, nome: aberta.nome, fotoUrl: aberta.fotoUrl, entradaPrevista: aberta.entradaPrevista, saidaPrevista: aberta.saidaPrevista }}
          cadastro={aberta}
          podeGerir={podeGerir}
          onRemover={podeGerir ? () => remover(aberta) : undefined}
          onArquivar={podeGerir ? () => arquivar(aberta) : undefined}
          onFechar={() => setAberta(null)}
          onMudou={onChange}
        />
      )}
    </div>
  );
}

// ── Tablet ───────────────────────────────────────────────────────────────────
export function TabletPair() {
  const [code, setCode] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    setGerando(true);
    try {
      const r = await fetch("/api/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome_mesa: "Ponto — Tablet", setor: "ponto" }) });
      const d = await r.json();
      if (d?.code) setCode(d.code);
      else toast.erro(d?.error || "Falha ao gerar o código.");
    } finally { setGerando(false); }
  }

  return (
    <div style={{ maxWidth: 620, paddingTop: 10 }}>
      <ol style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.9, paddingLeft: 18, margin: "0 0 14px" }}>
        <li>Instale o app <strong>Ponto Tridi</strong> (APK) no tablet.</li>
        <li>Gere um código abaixo (vale por 24h, uso único).</li>
        <li>No app, digite o código — pronto: o tablet baixa as pessoas e já reconhece.</li>
      </ol>
      {code ? (
        // O código em 34px com tracking de .18em mais o botão somavam ~330px numa
        // tela de 320. Fonte e respiro fluidos + wrap: no desktop sai igual.
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 14, rowGap: 10 }}>
          <span className="stat" style={{ fontSize: "clamp(24px, 6.5vw, 34px)", fontWeight: 900, letterSpacing: "0.18em", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "10px clamp(12px, 4vw, 22px)" }}>{code}</span>
          <Botao onClick={gerar} carregando={gerando}>Gerar outro</Botao>
        </div>
      ) : (
        <Botao variante="primario" icone="device-tv" onClick={gerar} carregando={gerando}>Gerar código de pareamento</Botao>
      )}
    </div>
  );
}
