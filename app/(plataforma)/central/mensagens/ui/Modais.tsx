"use client";

// Modais do módulo. No celular todos viram folha presa embaixo (regra do
// `.ch-modal` no CSS), com rolagem interna e botão principal alcançável.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../Icon";
import { Avatar } from "./Avatar";
import { api } from "../data/api";
import { nomeDoGrupo, previa } from "@/lib/chat/regras";
import type { Canal, Categoria, Mensagem, Pessoa } from "@/lib/chat/tipos";
import { GlassSelect } from "../../../GlassPicker";
import { atributosDe } from "../../../ui/campos";
import { Botao, Caixa } from "../../../ui/controles";

// ── Casca ───────────────────────────────────────────────────────────────────
function Modal({
  titulo, aoFechar, children, rodape,
}: { titulo: string; aoFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aoFechar]);

  return createPortal(
    <div className="ch-modal-fundo" onClick={aoFechar} role="dialog" aria-modal aria-label={titulo}>
      <div className="ch-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ch-modal__topo">{titulo}</div>
        <div className="ch-modal__corpo">{children}</div>
        {rodape && <div className="ch-modal__rodape">{rodape}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ── Seletor de pessoas (reaproveitado por 3 modais) ─────────────────────────
function SeletorPessoas({
  pessoas, escolhidas, aoAlternar, excluir = [],
}: { pessoas: Pessoa[]; escolhidas: Set<string>; aoAlternar: (p: Pessoa) => void; excluir?: string[] }) {
  const [busca, setBusca] = useState("");
  const fora = useMemo(() => new Set(excluir), [excluir]);
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pessoas.filter((p) => !fora.has(p.id) && (!q || p.name.toLowerCase().includes(q))).slice(0, 60);
  }, [pessoas, busca, fora]);

  return (
    <>
      <input {...atributosDe("busca")} className="ch-campo" placeholder="Buscar pessoa" value={busca}
        onChange={(e) => setBusca(e.target.value)} aria-label="Buscar pessoa" />
      <div style={{ marginTop: 8 }}>
        {lista.map((p) => {
          const on = escolhidas.has(p.id);
          return (
            <button key={p.id} type="button" className="ch-linha-lista" onClick={() => aoAlternar(p)}
              style={on ? { background: "var(--ch-ativo)" } : undefined}>
              <Avatar nome={p.name} src={p.avatar} size={30} />
              <span className="ch-linha-lista__corpo">
                <span style={{ display: "block" }}>{p.name}</span>
                {p.setor && <span className="ch-linha-lista__sub" style={{ display: "block" }}>{p.setor}</span>}
              </span>
              <Icon name={on ? "circle-check" : "circle"} size={18} color={on ? "var(--primary-texto)" : "var(--text-dim)"} />
            </button>
          );
        })}
        {!lista.length && <div className="ch-vazio" style={{ minHeight: 100 }}><p>Ninguém encontrado.</p></div>}
      </div>
    </>
  );
}

// ── Nova conversa / grupo / canal ───────────────────────────────────────────
// Três coisas diferentes, um botão só:
//   Conversa → uma pessoa (única por par; reabre a que já existe).
//   Grupo    → várias pessoas, privado, nome opcional (sai dos participantes).
//   Canal    → tema da empresa, com nome, descrição, cor e categoria; pode ser aberto.
const CORES = ["var(--primary-texto)", "var(--azul)", "var(--ok)", "var(--atencao)", "var(--perigo)", "var(--indigo)", "var(--info)", "var(--amarelo)"];

export type ModoNovo = "direta" | "grupo" | "canal";

export function ModalNovoCanal({
  pessoas, categorias, meuId, modoInicial = "direta", aoFechar, aoCriado,
}: {
  pessoas: Pessoa[]; categorias: Categoria[]; meuId: string; modoInicial?: ModoNovo;
  aoFechar: () => void; aoCriado: (id: string) => void;
}) {
  const [modo, setModo] = useState<ModoNovo>(modoInicial);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [privado, setPrivado] = useState(false);
  const [cor, setCor] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string>("");
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alternar = useCallback((p: Pessoa) => {
    setEscolhidas((s) => {
      const n = new Set(s);
      if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
      return n;
    });
  }, []);

  // Em "Conversa" escolher alguém já conversa — não tem segundo passo.
  const escolherUma = useCallback((p: Pessoa) => {
    setEscolhidas(new Set([p.id]));
  }, []);

  const nomesEscolhidos = useMemo(
    () => pessoas.filter((p) => escolhidas.has(p.id)).map((p) => p.name),
    [pessoas, escolhidas],
  );

  async function criar() {
    if (salvando) return;
    setSalvando(true); setErro(null);
    try {
      const r = await api.criarCanal({
        tipo: modo,
        nome: modo === "direta" ? undefined : nome.trim() || undefined,
        descricao: modo === "canal" ? descricao.trim() : undefined,
        privado: modo === "canal" ? privado : true,
        cor: modo === "canal" ? cor : null,
        categoria_id: modo === "canal" ? categoria || null : null,
        membros: [...escolhidas],
      });
      aoCriado(r.canal_id);
    } catch (e) {
      setErro((e as Error).message === "forbidden" ? "Você não tem permissão para criar canais." : "Não deu para criar agora.");
      setSalvando(false);
    }
  }

  const valido = modo === "direta" ? escolhidas.size === 1
    : modo === "grupo" ? escolhidas.size >= 2
    : nome.trim().length >= 2;

  const titulo = modo === "direta" ? "Nova conversa" : modo === "grupo" ? "Novo grupo" : "Novo canal";
  const rotuloOk = modo === "direta" ? "Conversar" : modo === "grupo" ? "Criar grupo" : "Criar canal";

  return (
    <Modal
      titulo={titulo}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={criar} disabled={!valido || salvando}>
            {salvando ? "Criando…" : rotuloOk}
          </Botao>
        </>
      }
    >
      <div className="ch-abas tab-strip" style={{ padding: "0 0 10px", borderBottom: "none" }} role="tablist">
        <button type="button" role="tab" className="ch-aba" aria-selected={modo === "direta"} onClick={() => setModo("direta")}>
          <Icon name="user" size={14} /> Conversa
        </button>
        <button type="button" role="tab" className="ch-aba" aria-selected={modo === "grupo"} onClick={() => setModo("grupo")}>
          <Icon name="users" size={14} /> Grupo
        </button>
        <button type="button" role="tab" className="ch-aba" aria-selected={modo === "canal"} onClick={() => setModo("canal")}>
          <Icon name="hash" size={14} /> Canal
        </button>
      </div>

      {modo === "grupo" && (
        <>
          <label className="ch-rotulo" htmlFor="ch-nome-grupo">Nome do grupo <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(opcional)</span></label>
          <input id="ch-nome-grupo" className="ch-campo" value={nome} maxLength={60}
            placeholder={nomesEscolhidos.length ? nomeDoGrupo(nomesEscolhidos) : "ex: Projeto loja nova"}
            onChange={(e) => setNome(e.target.value)} />
          <label className="ch-rotulo">Participantes <span style={{ fontWeight: 400, color: "var(--text-dim)" }}>(pelo menos 2)</span></label>
        </>
      )}

      {modo === "canal" && (
        <>
          <label className="ch-rotulo" htmlFor="ch-nome">Nome</label>
          <input id="ch-nome" className="ch-campo" placeholder="ex: marketing" value={nome}
            onChange={(e) => setNome(e.target.value)} autoFocus maxLength={60} />

          <label className="ch-rotulo" htmlFor="ch-desc">Descrição</label>
          <input id="ch-desc" className="ch-campo" placeholder="Para que serve este canal?" value={descricao}
            onChange={(e) => setDescricao(e.target.value)} maxLength={160} />

          {categorias.length > 0 && (
            <>
              <label className="ch-rotulo" htmlFor="ch-cat">Categoria</label>
              <GlassSelect id="ch-cat" value={categoria} onChange={setCategoria}
                options={[{ value: "", label: "Sem categoria" }, ...categorias.map((c) => ({ value: c.id, label: c.nome }))]} />
            </>
          )}

          <label className="ch-rotulo">Cor de contexto</label>
          <div className="ch-chips">
            <button type="button" className="ch-chip" onClick={() => setCor(null)}
              style={{ background: cor === null ? undefined : "transparent", color: "var(--text-dim)" }}>
              automática
            </button>
            {CORES.map((c) => (
              <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setCor(c)}
                style={{
                  width: 30, height: 30, borderRadius: "50%", cursor: "pointer", background: c,
                  border: cor === c ? "2px solid var(--text)" : "2px solid transparent", boxShadow: "none",
                }} />
            ))}
          </div>

          <label className="ch-alternar">
            <Caixa marcado={privado} onChange={(marc) => setPrivado(marc)} />
            <span className="ch-alternar__texto">
              Canal privado
              <span className="ch-alternar__sub">Só quem for convidado vê e entra.</span>
            </span>
          </label>

          <label className="ch-rotulo">Membros iniciais</label>
        </>
      )}

      {escolhidas.size > 0 && modo !== "direta" && (
        <div className="ch-chips" style={{ marginBottom: 8 }}>
          {pessoas.filter((p) => escolhidas.has(p.id)).map((p) => (
            <button key={p.id} type="button" className="ch-chip" onClick={() => alternar(p)} aria-label={`Tirar ${p.name}`}>
              <Avatar nome={p.name} src={p.avatar} size={20} />
              {p.name.split(" ")[0]}
              <Icon name="x" size={12} />
            </button>
          ))}
        </div>
      )}

      <SeletorPessoas pessoas={pessoas} escolhidas={escolhidas}
        aoAlternar={modo === "direta" ? escolherUma : alternar} excluir={[meuId]} />
      {erro && <p style={{ color: "var(--perigo)", fontSize: 13, marginTop: 10 }}>{erro}</p>}
    </Modal>
  );
}

// ── Pessoas (diretório) ─────────────────────────────────────────────────────
// Todo mundo da empresa, por setor, com busca. Clicar abre (ou reabre) a
// conversa direta — é o "ver todas" das sugestões de contato.
export function ModalPessoas({
  pessoas, canais, aoFechar, aoFalarCom,
}: { pessoas: Pessoa[]; canais: Canal[]; aoFechar: () => void; aoFalarCom: (p: Pessoa) => void }) {
  const [busca, setBusca] = useState("");
  const jaFalo = useMemo(
    () => new Set(canais.filter((c) => c.tipo === "direta" && c.parceiro_id).map((c) => c.parceiro_id as string)),
    [canais],
  );
  const setores = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = pessoas.filter((p) => !q || p.name.toLowerCase().includes(q) || (p.setor ?? "").toLowerCase().includes(q));
    const mapa = new Map<string, Pessoa[]>();
    for (const p of lista) {
      const k = p.setor?.trim() || "Sem setor";
      mapa.set(k, [...(mapa.get(k) ?? []), p]);
    }
    return [...mapa.entries()].sort(([a], [b]) => (a === "Sem setor" ? 1 : b === "Sem setor" ? -1 : a.localeCompare(b, "pt-BR")));
  }, [pessoas, busca]);

  return (
    <Modal titulo="Pessoas" aoFechar={aoFechar}
      rodape={<Botao onClick={aoFechar}>Fechar</Botao>}>
      <input {...atributosDe("busca")} className="ch-campo" placeholder="Buscar por nome ou setor" value={busca}
        onChange={(e) => setBusca(e.target.value)} aria-label="Buscar pessoa" autoFocus />
      {setores.map(([setor, lista]) => (
        <div key={setor}>
          <div className="ch-painel__secao">{setor} <span style={{ fontWeight: 400 }}>· {lista.length}</span></div>
          {lista.map((p) => (
            <button key={p.id} type="button" className="ch-linha-lista" onClick={() => aoFalarCom(p)}>
              <Avatar nome={p.name} src={p.avatar} size={30} />
              <span className="ch-linha-lista__corpo">{p.name}</span>
              <span className="ch-linha-lista__sub" style={{ flex: "none" }}>{jaFalo.has(p.id) ? "Abrir" : "Conversar"}</span>
              <Icon name="chevron-right" size={16} color="var(--text-dim)" />
            </button>
          ))}
        </div>
      ))}
      {!setores.length && <div className="ch-vazio" style={{ minHeight: 100 }}><p>Ninguém encontrado.</p></div>}
    </Modal>
  );
}

// ── Editar canal ────────────────────────────────────────────────────────────
export function ModalEditarCanal({
  canal, categorias, aoFechar, aoSalvo,
}: { canal: Canal; categorias: Categoria[]; aoFechar: () => void; aoSalvo: () => void }) {
  const [nome, setNome] = useState(canal.nome);
  const [descricao, setDescricao] = useState(canal.descricao ?? "");
  const [topico, setTopico] = useState(canal.topico ?? "");
  const [cor, setCor] = useState(canal.cor);
  const [categoria, setCategoria] = useState(canal.categoria_id ?? "");
  const [privado, setPrivado] = useState(canal.privado);
  const [somenteLeitura, setSomenteLeitura] = useState(canal.somente_leitura);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    try {
      await api.atualizarCanal({
        id: canal.id, nome: nome.trim(), descricao, topico, cor,
        categoria_id: categoria || null, privado, somente_leitura: somenteLeitura,
      });
      aoSalvo();
    } finally { setSalvando(false); }
  }

  return (
    <Modal titulo={canal.tipo === "grupo" ? "Editar grupo" : "Editar canal"} aoFechar={aoFechar} rodape={
      <>
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar} disabled={salvando || nome.trim().length < 2}>
          {salvando ? "Salvando…" : "Salvar"}
        </Botao>
      </>
    }>
      <label className="ch-rotulo" htmlFor="ed-nome">Nome</label>
      <input id="ed-nome" className="ch-campo" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />

      <label className="ch-rotulo" htmlFor="ed-desc">Descrição</label>
      <input id="ed-desc" className="ch-campo" value={descricao} onChange={(e) => setDescricao(e.target.value)} />

      <label className="ch-rotulo" htmlFor="ed-top">Tópico do momento</label>
      <input id="ed-top" className="ch-campo" value={topico} onChange={(e) => setTopico(e.target.value)}
        placeholder="No que o canal está focado agora" />

      {categorias.length > 0 && (
        <>
          <label className="ch-rotulo" htmlFor="ed-cat">Categoria</label>
          <GlassSelect id="ed-cat" value={categoria} onChange={setCategoria}
            options={[{ value: "", label: "Sem categoria" }, ...categorias.map((c) => ({ value: c.id, label: c.nome }))]} />
        </>
      )}

      <label className="ch-rotulo">Cor de contexto</label>
      <div className="ch-chips">
        <button type="button" className="ch-chip" onClick={() => setCor(null)} style={{ color: "var(--text-dim)" }}>automática</button>
        {CORES.map((c) => (
          <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => setCor(c)}
            style={{
              width: 30, height: 30, borderRadius: "50%", cursor: "pointer", background: c,
              border: cor === c ? "2px solid var(--text)" : "2px solid transparent", boxShadow: "none",
            }} />
        ))}
      </div>

      {canal.tipo !== "grupo" && (
        <label className="ch-alternar">
          <Caixa marcado={privado} onChange={(marc) => setPrivado(marc)} />
          <span className="ch-alternar__texto">
            Canal privado
            <span className="ch-alternar__sub">Sai da lista de canais abertos.</span>
          </span>
        </label>
      )}
      <label className="ch-alternar">
        <Caixa marcado={somenteLeitura} onChange={(marc) => setSomenteLeitura(marc)} />
        <span className="ch-alternar__texto">
          Somente leitura
          <span className="ch-alternar__sub">Só dono e admins escrevem — bom para avisos.</span>
        </span>
      </label>
    </Modal>
  );
}

// ── Adicionar membros ───────────────────────────────────────────────────────
export function ModalMembros({
  canal, pessoas, aoFechar, aoSalvo,
}: { canal: Canal; pessoas: Pessoa[]; aoFechar: () => void; aoSalvo: () => void }) {
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const [jaMembros, setJaMembros] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.membros(canal.id).then((d) => setJaMembros(d.membros.map((m) => m.id))).catch(() => {});
  }, [canal.id]);

  const alternar = useCallback((p: Pessoa) => {
    setEscolhidas((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; });
  }, []);

  async function salvar() {
    setSalvando(true);
    try { await api.adicionarMembros(canal.id, [...escolhidas]); aoSalvo(); }
    finally { setSalvando(false); }
  }

  return (
    <Modal titulo={`Adicionar a ${canal.nome}`} aoFechar={aoFechar} rodape={
      <>
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={salvar} disabled={!escolhidas.size || salvando}>
          {salvando ? "Adicionando…" : `Adicionar${escolhidas.size ? ` (${escolhidas.size})` : ""}`}
        </Botao>
      </>
    }>
      <SeletorPessoas pessoas={pessoas} escolhidas={escolhidas} aoAlternar={alternar} excluir={jaMembros} />
    </Modal>
  );
}

// ── Encaminhar ──────────────────────────────────────────────────────────────
export function ModalEncaminhar({
  mensagens, canais, aoFechar, aoEnviado,
}: { mensagens: Mensagem[]; canais: Canal[]; aoFechar: () => void; aoEnviado: (n: number) => void }) {
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [comentario, setComentario] = useState("");
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return canais.filter((c) => !c.arquivado && (!q || c.nome.toLowerCase().includes(q))).slice(0, 40);
  }, [canais, busca]);

  async function enviar() {
    setEnviando(true);
    try {
      const r = await api.encaminhar(mensagens.map((m) => m.id), [...escolhidos], comentario.trim() || undefined);
      aoEnviado(r.enviadas);
    } finally { setEnviando(false); }
  }

  return (
    <Modal titulo={`Encaminhar ${mensagens.length} ${mensagens.length === 1 ? "mensagem" : "mensagens"}`}
      aoFechar={aoFechar} rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={enviar} disabled={!escolhidos.size || enviando}>
            {enviando ? "Enviando…" : "Encaminhar"}
          </Botao>
        </>
      }>
      <div style={{ background: "var(--ch-fundo)", border: "1px solid var(--ch-linha)", borderRadius: "var(--r-sm)", padding: 10, marginBottom: 12 }}>
        {mensagens.slice(0, 3).map((m) => (
          <div key={m.id} style={{ fontSize: 12.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <b style={{ fontWeight: 600, color: "var(--text)" }}>{m.autor_nome}</b>: {previa(m)}
          </div>
        ))}
        {mensagens.length > 3 && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>+{mensagens.length - 3} …</div>}
      </div>

      <input className="ch-campo" placeholder="Comentário (opcional)" value={comentario}
        onChange={(e) => setComentario(e.target.value)} />

      <label className="ch-rotulo">Para onde</label>
      <input {...atributosDe("busca")} className="ch-campo" placeholder="Buscar canal" value={busca} onChange={(e) => setBusca(e.target.value)} />
      <div style={{ marginTop: 8 }}>
        {lista.map((c) => {
          const on = escolhidos.has(c.id);
          return (
            <button key={c.id} type="button" className="ch-linha-lista"
              style={on ? { background: "var(--ch-ativo)" } : undefined}
              onClick={() => setEscolhidos((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}>
              <Icon name={c.tipo === "direta" ? "user" : c.privado ? "lock" : "hash"} size={16} color="var(--text-dim)" />
              <span className="ch-linha-lista__corpo">{c.nome}</span>
              <Icon name={on ? "circle-check" : "circle"} size={18} color={on ? "var(--primary-texto)" : "var(--text-dim)"} />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Confirmação ─────────────────────────────────────────────────────────────
export function ModalConfirmar({
  titulo, texto, rotuloOk, perigo, aoFechar, aoConfirmar,
}: {
  titulo: string; texto: string; rotuloOk: string; perigo?: boolean;
  aoFechar: () => void; aoConfirmar: () => void;
}) {
  return (
    <Modal titulo={titulo} aoFechar={aoFechar} rodape={
      <>
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante={perigo ? "perigo" : "primario"} onClick={() => { aoConfirmar(); aoFechar(); }}>
          {rotuloOk}
        </Botao>
      </>
    }>
      <p style={{ fontSize: 14, lineHeight: 1.55, color: "var(--text-dim)", margin: "0 0 8px" }}>{texto}</p>
    </Modal>
  );
}

// ── Histórico de edições ────────────────────────────────────────────────────
export function ModalEdicoes({ mensagem, aoFechar }: { mensagem: Mensagem; aoFechar: () => void }) {
  const [edicoes, setEdicoes] = useState<{ texto_anterior: string; created_at: string }[] | null>(null);
  useEffect(() => {
    api.edicoes(mensagem.id).then((d) => setEdicoes(d.edicoes)).catch(() => setEdicoes([]));
  }, [mensagem.id]);

  return (
    <Modal titulo="Histórico de edições" aoFechar={aoFechar}
      rodape={<Botao onClick={aoFechar}>Fechar</Botao>}>
      <div className="ch-painel__secao">Agora</div>
      <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: "0 0 6px", whiteSpace: "pre-wrap" }}>{mensagem.texto}</p>
      {edicoes === null && <span className="ch-esqueleto" style={{ display: "block", height: 40 }} />}
      {edicoes?.map((e, i) => (
        <div key={i}>
          <div className="ch-painel__secao">{new Date(e.created_at).toLocaleString("pt-BR")}</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.5, margin: 0, color: "var(--text-dim)", whiteSpace: "pre-wrap" }}>
            {e.texto_anterior}
          </p>
        </div>
      ))}
      {edicoes?.length === 0 && <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Sem versões anteriores guardadas.</p>}
    </Modal>
  );
}
