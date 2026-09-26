"use client";

// ── Criar atividade do zero ──────────────────────────────────────────────────
//
// O Lançador parte de um ITEM (produto/componente) e das atividades dele. Nem
// todo trabalho da bancada é de um item: "limpar a máquina", "organizar o
// estoque de MDF", "ajudar a Logística a embalar". Aqui a pessoa escreve a
// atividade que quiser e manda — mesmo destino (tablet do setor ou pessoas),
// mesma régua de quem recebe (só Produção/Máquinas/Preparo/Logística), mesma
// rota POST /api/atividades.
//
// Toda atividade enviada daqui fica SALVA (catálogo, categoria "Do zero") e
// volta como atalho no topo do pop-up: tocar preenche nome e setor. Tocar de
// novo solta; com uma escolhida aparece "Tirar dos salvos".

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Botao, Chip, PainelLateral } from "../ui/controles";
import { GlassSelect } from "../GlassPicker";
import { confirmar, toast } from "../Toast";
import { Bloco, ChipSetor, LinhaPessoa, POOL, vazio } from "./LancadorDeAtividade";
import { faixaDoSetor, pessoasDoSetor, setorDoPool, setoresDisponiveis } from "@/lib/atividades-lancador";
import { PRIORIDADES, ROTULO_PRIORIDADE, type Colaborador, type Prioridade } from "@/lib/atividades-catalog";

const campo = {
  width: "100%", boxSizing: "border-box", minHeight: "var(--tap)", padding: "8px 12px", borderRadius: "var(--r-sm)",
  border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, font: "inherit",
} as const;

const DO_ZERO = "Do zero";
interface Salva { id: string; setor: string; nome: string }

export function CriarAtividade({ colaboradores, onFechar }: { colaboradores: Colaborador[]; onFechar: () => void }) {
  const router = useRouter();
  const setores = useMemo(() => setoresDisponiveis(colaboradores), [colaboradores]);
  const [nome, setNome] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [setor, setSetor] = useState("Produção");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [qtd, setQtd] = useState("1");
  const [tempo, setTempo] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("media");
  const [enviando, setEnviando] = useState(false);
  const [salvas, setSalvas] = useState<Salva[]>([]);
  const pessoas = useMemo(() => pessoasDoSetor(colaboradores, setor), [colaboradores, setor]);
  const escolhida = salvas.find((s) => s.nome === nome.trim() && s.setor === setor) ?? null;

  // Uma leitura ao abrir o pop-up (catálogo curto) — não é poll.
  useEffect(() => {
    let vivo = true;
    fetch("/api/atividades-catalogo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { itens: [] }))
      .then((d: { itens?: (Salva & { categoria: string })[] }) => {
        if (vivo) setSalvas((d.itens ?? []).filter((i) => i.categoria === DO_ZERO).map(({ id, setor, nome }) => ({ id, setor, nome })));
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  function usarSalva(s: Salva) {
    if (escolhida?.id === s.id) { setNome(""); return; }
    setNome(s.nome);
    if (s.setor !== setor && setores.includes(s.setor)) { setSetor(s.setor); setSel(new Set()); }
  }

  async function tirarDosSalvos(s: Salva) {
    const r = await fetch(`/api/atividades-catalogo?id=${encodeURIComponent(s.id)}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) { toast.erro("Não foi possível tirar dos salvos agora."); return; }
    setSalvas((l) => l.filter((x) => x.id !== s.id));
    setNome("");
  }

  // Guarda a atividade pra próxima vez. Falhar aqui não desfaz o envio.
  function salvar(tarefa: string) {
    if (salvas.some((s) => s.nome === tarefa && s.setor === setor)) return;
    fetch("/api/atividades-catalogo", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setor, categoria: DO_ZERO, nome: tarefa }),
    }).catch(() => {});
  }
  const pessoasSel = [...sel].filter((id) => id !== POOL);

  // Tablet do setor OU pessoas — nunca os dois (duplicava a atividade).
  function alternar(id: string) {
    setSel((s) => {
      if (s.has(id)) { const n = new Set(s); n.delete(id); return n; }
      if (id === POOL) return new Set([POOL]);
      const n = new Set(s); n.delete(POOL); n.add(id); return n;
    });
  }

  async function enviar() {
    const tarefa = nome.trim();
    if (!tarefa || sel.size === 0) return;
    const faixa = faixaDoSetor(setor);
    const base = {
      categoria: "Geral", tarefa, detalhe: detalhe.trim() || null, prazo: null, prioridade,
      quantidade_alvo: Math.max(1, Math.round(Number(qtd) || 1)),
      tempo_estimado_min: Math.round(Number(tempo)) > 0 ? Math.round(Number(tempo)) : null,
      ...(faixa ? { faixa } : {}),
    };
    const post = (corpo: object) => fetch("/api/atividades", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    });
    const foram: string[] = [];
    let falhou = 0;
    setEnviando(true);
    try {
      if (sel.has(POOL)) {
        const r = await post({ ...base, pool: true, setor: setorDoPool(setor), confirmar: false });
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.atividade) foram.push(`o tablet de ${setor}`); else falhou++;
      }
      for (const id of pessoasSel) {
        const p = colaboradores.find((c) => c.id === id);
        let r = await post({ ...base, para_id: id, confirmar: false });
        let d = await r.json().catch(() => ({}));
        if (r.status === 409 && d.error === "nao_presente") {
          const vai = await confirmar(`${d.nome ?? p?.nome ?? "A pessoa"} não bateu ponto hoje. Mandar mesmo assim?`, {
            detalhe: "Cai no tablet como pedido pra aceitar quando ela chegar.",
          });
          if (!vai) continue;
          r = await post({ ...base, para_id: id, confirmar: true });
          d = await r.json().catch(() => ({}));
        }
        if (r.ok && d.atividade) foram.push(p?.nome ?? "?"); else falhou++;
      }
    } catch {
      falhou++;
    } finally {
      setEnviando(false);
    }
    if (foram.length) {
      salvar(tarefa);
      toast.ok(`${tarefa}: enviada pra ${foram.join(", ")}.`);
      router.refresh();
      onFechar();
    }
    if (falhou) toast.erro(foram.length ? `${falhou} envio(s) não passaram. Confira no quadro.` : "Não foi possível enviar agora.");
  }

  return (
    <PainelLateral centrado largura={640} onFechar={onFechar} soFechaNoX
      titulo="Criar atividade" subtitulo="Escreva a atividade, escolha quem faz e mande."
      rodape={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", width: "100%" }}>
          <Botao variante="sutil" onClick={onFechar} disabled={enviando}>Cancelar</Botao>
          <Botao variante="primario" icone="send" onClick={enviar} carregando={enviando} disabled={!nome.trim() || sel.size === 0}>
            {sel.size <= 1 ? "Enviar" : `Enviar pra ${sel.size}`}
          </Botao>
        </div>
      }>
      <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
        {salvas.length > 0 && (
          <Bloco titulo="Salvas" ajuda="Atividades já criadas do zero. Toque pra usar de novo.">
            <div role="group" aria-label="Atividades salvas" style={{ display: "flex", gap: 6, flexWrap: "wrap", maxHeight: 176, overflowY: "auto", minWidth: 0 }}>
              {salvas.map((s) => (
                <Chip key={s.id} ativo={escolhida?.id === s.id} icone="bookmark" onClick={() => usarSalva(s)}
                  titulo={`${s.nome} · ${s.setor}`}>
                  <span style={{ display: "inline-block", maxWidth: "min(240px, 52vw)", overflow: "hidden", textOverflow: "ellipsis", verticalAlign: "bottom" }}>{s.nome}</span>
                  {s.setor !== setor && <span style={{ color: "var(--text-dim)", fontWeight: 500 }}> · {s.setor}</span>}
                </Chip>
              ))}
            </div>
            {escolhida && (
              <div>
                <Botao variante="sutil" icone="trash" onClick={() => tirarDosSalvos(escolhida)}>Tirar dos salvos</Botao>
              </div>
            )}
          </Bloco>
        )}
        <Bloco titulo="Atividade">
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120}
            placeholder="Ex.: Limpar a máquina de corte" aria-label="Nome da atividade" style={campo} />
        </Bloco>
        <Bloco titulo="Detalhes (opcional)" ajuda="O que precisa ser feito, onde, com o quê.">
          <textarea value={detalhe} onChange={(e) => setDetalhe(e.target.value)} rows={3} maxLength={500}
            aria-label="Detalhes da atividade" style={{ ...campo, resize: "vertical", minHeight: 80 }} />
        </Bloco>
        <Bloco titulo="Setor">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {setores.map((s) => <ChipSetor key={s} setor={s} ativo={s === setor} onClick={() => { setSetor(s); setSel(new Set()); }} />)}
          </div>
        </Bloco>
        <Bloco titulo={`Quem faz · ${setor}`} ajuda="O tablet do setor (quem estiver livre pega) ou pessoas específicas.">
          <div style={{ display: "grid", gap: 6 }}>
            <LinhaPessoa marcado={sel.has(POOL)} onClick={() => alternar(POOL)} titulo={`Tablet de ${setor}`}
              sub="Quem estiver livre pega" icone="device-mobile" />
            {pessoas.length === 0
              ? <p style={vazio}>Ninguém de {setor} cadastrado. A especialidade de cada pessoa fica na ficha, em Pessoas.</p>
              : pessoas.map((p) => (
                <LinhaPessoa key={p.id} marcado={sel.has(p.id)} onClick={() => alternar(p.id)} titulo={p.nome}
                  sub={p.especialidade || p.departamento || p.setor || ""} foto={p.fotoUrl} />
              ))}
          </div>
        </Bloco>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
          <Bloco titulo="Quantidade">
            <input type="number" min={1} inputMode="numeric" value={qtd} onChange={(e) => setQtd(e.target.value)} aria-label="Quantidade" style={campo} />
          </Bloco>
          <Bloco titulo="Tempo (minutos)">
            <input type="number" min={1} inputMode="numeric" value={tempo} onChange={(e) => setTempo(e.target.value)}
              placeholder="60" aria-label="Tempo da atividade em minutos" style={campo} />
          </Bloco>
          <Bloco titulo="Prioridade">
            <GlassSelect value={prioridade} onChange={(v) => setPrioridade(v as Prioridade)}
              options={PRIORIDADES.map((p) => ({ value: p, label: ROTULO_PRIORIDADE[p] }))} />
          </Bloco>
        </div>
      </div>
    </PainelLateral>
  );
}
