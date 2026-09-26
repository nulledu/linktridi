"use client";

// EDITOR DE PÁGINAS — a casca. Segue o mesmo desenho do editor de fluxos:
// barra superior, painel esquerdo (estrutura), centro (a página de verdade) e
// painel direito (só o bloco selecionado). Auto-save com debounce e ⌘S.
//
// O centro usa o MESMO RenderPagina da página publicada. Nada de preview
// aproximado: o que está na tela é o que vai pro ar.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../Icon";
import { toast } from "../../../Toast";
import type { BotCompleto, Dominio } from "@/lib/tridiflow-db";
import { ICONE_BLOCO, ROTULO_BLOCO, temVideo, type BlocoTipo, type PaginaDoc } from "@/lib/tridiflow-pagina";
import {
  acharSelecionado, addBloco, addSecao, alternarOculto, duplicarBlocoNoDoc, moverBloco, moverBlocoPara,
  moverSecao, patchBloco, patchEstiloBloco, patchEstiloSecao, patchSecao, removerBloco, removerSecao,
  secaoDoBloco, setVisibilidade,
} from "@/lib/tridiflow-pagina-edicao";
import { ROTULO_VARIANTE, type Variante } from "@/lib/tridiflow-ab";
import { RenderPagina } from "@/app/p/RenderPagina";
import { ArvorePagina } from "./ArvorePagina";
import { PaletaBlocos } from "./PaletaBlocos";
import { InspetorConteudo } from "./InspetorConteudo";
import { InspetorEstilo } from "./InspetorEstilo";
import { InspetorTema } from "./InspetorTema";
import { PublicarPaginaModal } from "./PublicarPaginaModal";
import { Campo, Texto, Vazio } from "../_ui";
import { BarraFerramentas, BotaoBarra, GrupoAlternar, GrupoBarra, SeparadorBarra } from "../../../ui/BarraFerramentas";

const MAX_HISTORICO = 60;
// Digitação vira UM passo de histórico enquanto as teclas vêm seguidas. Sem
// isto, desfazer voltava letra por letra e ninguém conseguia desfazer "a frase".
const JANELA_DIGITACAO = 900;
// Rascunho local: só serve pra não perder texto quando o save falha (rede caiu,
// aba fechou). É apagado assim que o servidor confirma.
const chaveRascunho = (id: string) => `tridiflow.pagina.rascunho.${id}`;

type EstadoSalvamento = "ok" | "pendente" | "salvando" | "erro" | "offline";

export function EditorPaginaClient({ inicial, dominios, autor }: {
  inicial: BotCompleto; dominios: Dominio[]; autor: string;
}) {
  const [doc, setDocBruto] = useState<PaginaDoc>(inicial.pagina);
  // Settings do projeto (só a parte que a página usa: o iframe por cima).
  const [settings, setSettings] = useState(inicial.settings);
  const [nome, setNome] = useState(inicial.nome);
  const [slug, setSlug] = useState(inicial.slug);
  const [dominioId, setDominioId] = useState<string | null>(inicial.dominioId);
  const [status, setStatus] = useState(inicial.status);
  const [sel, setSel] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<EstadoSalvamento>("ok");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  // Qual versão do teste A/B o canvas desenha. Sem isto não haveria como editar
  // a versão B: os blocos dela não renderizam quando a A está ativa.
  const [variante, setVariante] = useState<Variante>("a");
  const [paleta, setPaleta] = useState<string | null>(null);   // seção alvo
  const [publicar, setPublicar] = useState(false);
  const [publicando, setPublicando] = useState(false);
  // Celular: as três colunas não cabem em 320px — somadas dão 560px, e o corpo
  // do editor estourava a tela em 105px (que a fundação CORTA, então metade do
  // inspetor ficava inalcançável). Abaixo de 900px o canvas fica sozinho na
  // coluna e os dois painéis viram folha presa embaixo, uma de cada vez.
  const [painelMob, setPainelMob] = useState<null | "estrutura" | "inspetor">(null);

  // ── Histórico (desfazer/refazer) ───────────────────────────────────────────
  const passado = useRef<PaginaDoc[]>([]);
  const futuro = useRef<PaginaDoc[]>([]);
  const [versao, setVersao] = useState(0);   // força re-render dos botões

  // `agrupar` junta alterações consecutivas do MESMO campo num passo só de
  // histórico (digitar um título = 1 desfazer, não 1 por letra). Ações
  // estruturais (mover, duplicar, excluir) nunca agrupam.
  const ultimoGrupo = useRef<{ chave: string; em: number } | null>(null);
  const setDoc = useCallback((proximo: PaginaDoc | ((d: PaginaDoc) => PaginaDoc), agrupar?: string) => {
    setDocBruto((atual) => {
      const novo = typeof proximo === "function" ? (proximo as (d: PaginaDoc) => PaginaDoc)(atual) : proximo;
      if (novo === atual) return atual;
      const agora = Date.now();
      const anterior = ultimoGrupo.current;
      const continua = !!agrupar && !!anterior && anterior.chave === agrupar && agora - anterior.em < JANELA_DIGITACAO;
      // Continuando a digitar no mesmo campo: NÃO empilha estado novo — o
      // primeiro estado do grupo já está lá e é pra ele que o desfazer volta.
      if (!continua) passado.current = [...passado.current.slice(-MAX_HISTORICO), atual];
      ultimoGrupo.current = agrupar ? { chave: agrupar, em: agora } : null;
      futuro.current = [];
      setVersao((v) => v + 1);
      return novo;
    });
  }, []);

  const desfazer = useCallback(() => {
    ultimoGrupo.current = null;   // fecha o grupo: digitar depois começa passo novo
    setDocBruto((atual) => {
      const anterior = passado.current.pop();
      if (!anterior) return atual;
      futuro.current = [...futuro.current, atual];
      setVersao((v) => v + 1);
      return anterior;
    });
  }, []);

  const refazer = useCallback(() => {
    ultimoGrupo.current = null;
    setDocBruto((atual) => {
      const proximo = futuro.current.pop();
      if (!proximo) return atual;
      passado.current = [...passado.current, atual];
      setVersao((v) => v + 1);
      return proximo;
    });
  }, []);

  // ── Auto-save (debounce 800 ms, igual ao editor de fluxos) ─────────────────
  const primeiro = useRef(true);
  // Nº de ordem de cada envio. A resposta só vale se for do ÚLTIMO envio: sem
  // isso, uma resposta lenta de uma versão velha chegava depois e marcava
  // "Salvo" (ou "erro") sobre uma edição mais nova.
  const seq = useRef(0);
  const ultimoAplicado = useRef(0);

  const salvarAgora = useCallback(async (corpo: Record<string, unknown>) => {
    const meu = ++seq.current;
    setSalvando("salvando");
    try {
      const r = await fetch("/api/tridiflow/bots", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inicial.id, ...corpo }),
      });
      const d = await r.json().catch(() => ({}));
      const atrasada = meu < ultimoAplicado.current;   // já chegou resposta mais nova
      if (!atrasada) ultimoAplicado.current = meu;
      if (!r.ok) {
        if (!atrasada) setSalvando("erro");
        // Endereço duplicado é erro de quem edita: precisa aparecer, não sumir.
        if (d?.code === "caminho_em_uso") toast.erro("Esse endereço já é usado por outro projeto.");
        return false;
      }
      if (!atrasada) {
        // "Salvo" só DEPOIS do servidor confirmar — e só se nada novo entrou na
        // fila enquanto isso.
        setSalvando(meu === seq.current ? "ok" : "pendente");
        try { localStorage.removeItem(chaveRascunho(inicial.id)); } catch { /* sem storage */ }
      }
      return true;
    } catch {
      if (meu >= ultimoAplicado.current) {
        setSalvando(navigator.onLine === false ? "offline" : "erro");
        // Guarda o que não subiu: recarregar a página não perde o trabalho.
        try { localStorage.setItem(chaveRascunho(inicial.id), JSON.stringify({ em: Date.now(), corpo })); } catch { /* cota cheia */ }
      }
      return false;
    }
  }, [inicial.id]);

  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    // "Alterações não salvas" enquanto o debounce corre — antes já dizia
    // "Salvando…" sem ter mandado nada.
    setSalvando("pendente");
    const t = setTimeout(() => { void salvarAgora({ pagina: doc, nome, slug, dominioId, settings }); }, 800);
    return () => clearTimeout(t);
  }, [doc, nome, slug, dominioId, settings, salvarAgora]);

  // Voltou a rede: tenta de novo sozinho o que ficou pendente.
  useEffect(() => {
    const online = () => { if (salvando === "offline" || salvando === "erro") void salvarAgora({ pagina: doc, nome, slug, dominioId, settings }); };
    const offline = () => setSalvando((s) => (s === "ok" ? s : "offline"));
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, [salvando, doc, nome, slug, dominioId, settings, salvarAgora]);

  // Proteção contra perda: sair com alteração pendente avisa.
  useEffect(() => {
    const aoSair = (e: BeforeUnloadEvent) => {
      if (salvando === "ok") return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [salvando]);

  // ⌘S / Ctrl+S salva na hora · ⌘Z / ⇧⌘Z histórico
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "s") { e.preventDefault(); void salvarAgora({ pagina: doc, nome, slug, dominioId, settings }); }
      if (e.key.toLowerCase() === "z") {
        // Não sequestra o desfazer de quem está digitando num campo.
        const alvo = e.target as HTMLElement | null;
        if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
        e.preventDefault();
        if (e.shiftKey) refazer(); else desfazer();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [doc, nome, slug, dominioId, settings, salvarAgora, desfazer, refazer]);

  // ── Ações ──────────────────────────────────────────────────────────────────
  const selecionado = useMemo(() => acharSelecionado(doc, sel), [doc, sel]);
  const paginaTemVideo = useMemo(() => temVideo(doc), [doc]);

  const escolherBloco = (tipo: BlocoTipo) => {
    const secaoId = paleta;
    setPaleta(null);
    if (!secaoId) return;
    setDoc((d) => addBloco(d, secaoId, tipo));
  };

  const abrirPaleta = () => {
    // A paleta é um modal por cima de tudo; no celular ela é aberta de DENTRO
    // da folha de estrutura, e folha aberta por baixo de modal é lixo visual
    // (e rouba o toque de fora).
    setPainelMob(null);
    // Sem seção nenhuma, cria uma antes — senão o botão não faria nada.
    if (doc.secoes.length === 0) {
      setDoc((d) => addSecao(d));
      setTimeout(() => setPaleta(null), 0);
      return;
    }
    const alvo = (sel && secaoDoBloco(doc, sel)) || doc.secoes[doc.secoes.length - 1].id;
    setPaleta(alvo);
  };

  const acaoPublicar = async () => {
    setPublicando(true);
    try {
      // Garante que o rascunho no banco é o que está na tela antes de congelar.
      const ok = await salvarAgora({ pagina: doc, nome, slug, dominioId, settings });
      if (!ok) { toast.erro("Salve as alterações antes de publicar."); return false; }
      const r = await fetch("/api/tridiflow/bots", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "publicar", id: inicial.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(d?.error || "Não foi possível publicar."); return false; }
      setStatus("publicado");
      toast.ok("Página publicada.");
      // A folha só fecha depois que o botão terminou de virar "Publicado" —
      // fechar na hora engolia a única confirmação que a pessoa ia ver.
      setTimeout(() => setPublicar(false), 1100);
      return true;
    } finally { setPublicando(false); }
  };

  const acaoDespublicar = async () => {
    setPublicando(true);
    try {
      await fetch("/api/tridiflow/bots", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "despublicar", id: inicial.id }),
      });
      setStatus("rascunho");
      toast.ok("Página despublicada.");
    } finally { setPublicando(false); }
  };

  const host = dominios.find((d) => d.id === dominioId)?.host;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: "var(--bg)" }}>
      {/* ── Barra superior ── */}
      <header style={{
        flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", flexWrap: "wrap",
        borderBottom: "1px solid var(--border)", background: "var(--surface)",
      }}>
        <Link href="/tridiflow/meus-bots" title="Voltar aos projetos" style={{ display: "flex", padding: 6, borderRadius: 8, color: "var(--text-dim)" }}>
          <Icon name="chevron-left" size={19} color="var(--text-dim)" />
        </Link>

        <input
          value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da página"
          style={{
            border: "1px solid transparent", background: "transparent", color: "var(--text)",
            fontSize: 14.5, fontWeight: 800, padding: "6px 8px", borderRadius: 8, minWidth: 120, maxWidth: 280, outline: "none",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface-2)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent"; }}
        />

        <IndicadorSalvamento estado={salvando} />

        <span style={{ flex: 1 }} />

        {/* As duas portas dos painéis — só no celular, onde eles saíram da
            coluna. No computador nada muda: os painéis continuam à vista. */}
        <button className="epg-mob" onClick={() => setPainelMob("estrutura")} title="Estrutura da página"
          style={BOTAO_FOLHA}>
          <Icon name="layout-rows" size={15} color="var(--text-dim)" />
        </button>
        <button className="epg-mob" onClick={() => setPainelMob("inspetor")} title={selecionado ? "Editar o bloco selecionado" : "Tema da página"}
          style={BOTAO_FOLHA}>
          <Icon name="adjustments-horizontal" size={15} color="var(--text-dim)" />
        </button>

        <BarraFerramentas rotulo="Ferramentas do editor">
          <GrupoBarra>
            <BotaoBarra icone="arrow-back-up" titulo="Desfazer" onClick={desfazer} desabilitado={passado.current.length === 0} />
            <BotaoBarra icone="arrow-forward-up" titulo="Refazer" onClick={refazer} desabilitado={futuro.current.length === 0} separado />
          </GrupoBarra>
          <SeparadorBarra />
          <GrupoAlternar rotulo="Tamanho da prévia" valor={viewport} onChange={setViewport} opcoes={[
            { id: "desktop", icone: "device-desktop", titulo: "Computador" },
            { id: "mobile", icone: "device-mobile", titulo: "Celular" },
          ]} />
          {/* Alternador de versão — só aparece com o teste ligado. O canvas
              desenha UMA versão por vez, igual ao visitante; sem este botão a
              versão B não teria como ser editada. */}
          {doc.config.teste?.ativo && (<>
            <SeparadorBarra />
            <GrupoAlternar rotulo="Versão do teste A/B" valor={variante} onChange={setVariante} opcoes={
              (["a", "b"] as const).map((v) => ({ id: v, texto: v.toUpperCase(), titulo: ROTULO_VARIANTE(doc.config.teste, v) }))
            } />
          </>)}
        </BarraFerramentas>

        {/* Prévia do RASCUNHO, não /p/<slug>: aquele endereço só existe depois
            de publicar, então antes da publicação ele respondia "link não
            disponível" — que era o que acontecia aqui. */}
        <a href={`/tridiflow/p/${inicial.id}/previa`} target="_blank" rel="noreferrer" title="Ver como vai ficar (rascunho)"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9,
            border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)",
            fontSize: 12.5, fontWeight: 700, textDecoration: "none",
          }}>
          <Icon name="eye" size={14} color="var(--text-dim)" /> Prévia
        </a>

        <button onClick={() => setPublicar(true)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 9,
            border: "none", cursor: "pointer", background: "var(--tf-accent, var(--primary))", color: "#fff",
            fontSize: 13, fontWeight: 800,
          }}>
          <Icon name="rocket" size={15} color="#fff" />
          {status === "publicado" ? "Republicar" : "Publicar"}
        </button>
      </header>

      {/* ── Corpo: estrutura | página | inspetor ── */}
      {/* As três faixas moram no CSS, não aqui: faixa rígida escrita inline não
          tem como ser colapsada por media query sem `!important`, e era
          exatamente por isso que este corpo media 560px num celular de 320. */}
      <div className="epg-corpo" style={{ flex: 1, minHeight: 0, display: "grid" }}>
        <aside className="epg-lado" data-aberto={painelMob === "estrutura" ? "1" : "0"}
          style={{ borderRight: "1px solid var(--border)", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="epg-folha-topo epg-mob">
            <strong style={{ fontSize: 13, fontWeight: 800 }}>Estrutura</strong>
            <button onClick={() => setPainelMob(null)} title="Fechar" style={BOTAO_X}>
              <Icon name="x" size={16} color="var(--text-dim)" />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <ArvorePagina
              doc={doc}
              selecionado={sel}
              // No celular a árvore é uma folha por cima do canvas: escolher um
              // bloco e continuar com ela aberta esconderia justamente o que a
              // pessoa acabou de selecionar.
              onSelecionar={(id) => { setSel(id); setPainelMob(null); }}
              onAddSecao={() => setDoc((d) => addSecao(d))}
              onAddBloco={(secaoId) => { setPainelMob(null); setPaleta(secaoId); }}
              onMoverBloco={(id, dir) => setDoc((d) => moverBloco(d, id, dir))}
              onMoverSecao={(id, dir) => setDoc((d) => moverSecao(d, id, dir))}
              onDuplicar={(id) => setDoc((d) => duplicarBlocoNoDoc(d, id))}
              onRemover={(id) => { setDoc((d) => removerBloco(d, id)); if (sel === id) setSel(null); }}
              onAlternarOculto={(id) => setDoc((d) => alternarOculto(d, id))}
              onRemoverSecao={(id) => { setDoc((d) => removerSecao(d, id)); if (sel === id) setSel(null); }}
              onRenomearSecao={(id, n) => setDoc((d) => patchSecao(d, id, { nome: n }), `sec:${id}:nome`)}
              onArrastar={(blocoId, secaoId, indice) => setDoc((d) => moverBlocoPara(d, blocoId, secaoId, indice))}
            />
          </div>
          <button onClick={abrirPaleta}
            style={{
              flex: "none", margin: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
              border: "none", background: "var(--tf-accent, var(--primary))", color: "#fff", fontSize: 12.5, fontWeight: 800,
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}>
            <Icon name="plus" size={15} color="#fff" /> Adicionar bloco
          </button>
        </aside>

        {/* Centro — a página real, numa moldura que simula o dispositivo. */}
        <main style={{ overflowY: "auto", padding: viewport === "mobile" ? "22px 12px" : "22px", background: "var(--bg)" }}>
          <div style={{
            // min(390px,100%): a moldura de celular não pode ser mais larga que
            // a área útil — em 320px ela vazava 70px pra fora.
            marginInline: "auto", width: viewport === "mobile" ? "min(390px, 100%)" : "100%", maxWidth: viewport === "mobile" ? 390 : 1080,
            borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)",
            boxShadow: "0 10px 40px rgba(16,24,40,.10)", background: "#fff",
            transition: "width .18s ease",
          }}>
            <RenderPagina
              doc={doc}
              paginaId={inicial.id}
              modo="preview"
              viewport={viewport}
              variante={variante}
              selecionado={sel}
              onSelecionar={setSel}
              onEditarTexto={(blocoId, texto) => setDoc((d) => patchBloco(d, blocoId, { texto }), `c:${blocoId}:texto`)}
              revelarTudo
              // Ações direto no canvas (aparecem só com o mouse em cima). São as
              // MESMAS operações da árvore — mesma função de edição, mesmo
              // histórico —, só que ao alcance de onde a pessoa está olhando.
              onAcaoBloco={(blocoId, acao) => {
                if (acao === "excluir") { setSel((s) => (s === blocoId ? null : s)); setDoc((d) => removerBloco(d, blocoId)); return; }
                if (acao === "duplicar") { setDoc((d) => duplicarBlocoNoDoc(d, blocoId)); return; }
                if (acao === "ocultar") { setDoc((d) => alternarOculto(d, blocoId)); return; }
                setDoc((d) => moverBloco(d, blocoId, acao === "subir" ? -1 : 1));
              }}
              // Arrastar no canvas usa a MESMA função da árvore lateral
              // (moverBlocoPara), então as duas formas de mover entram no
              // histórico igual e não podem divergir.
              onMoverBloco={(blocoId, secaoId, indice) => setDoc((d) => moverBlocoPara(d, blocoId, secaoId, indice))}
            />
          </div>
          <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--text-dim)", marginTop: 12, lineHeight: 1.5 }}>
            Clique duas vezes num título ou texto para editar direto na página.<br />
            Blocos com liberação por tempo aparecem aqui o tempo todo, marcados — no ar eles respeitam o gatilho.
          </p>
        </main>

        {/* Inspetor */}
        <aside className="epg-lado" data-aberto={painelMob === "inspetor" ? "1" : "0"}
          style={{ borderLeft: "1px solid var(--border)", background: "var(--surface)", minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="epg-folha-topo epg-mob">
            <strong style={{ fontSize: 13, fontWeight: 800 }}>{selecionado ? "Bloco" : "Tema da página"}</strong>
            <button onClick={() => setPainelMob(null)} title="Fechar" style={BOTAO_X}>
              <Icon name="x" size={16} color="var(--text-dim)" />
            </button>
          </div>
          {!selecionado ? (
            // Nada selecionado = você está editando a PÁGINA, não um bloco.
            // É onde mora o tema — mesma lógica dos editores visuais: clicou
            // fora, aparecem as configurações do documento.
            <>
              <div style={{ flex: "none", padding: "12px 14px 8px", borderBottom: "1px solid var(--border)" }}>
                <strong style={{ display: "block", fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Tema da página</strong>
                <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Selecione um bloco para editar só ele.</span>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 14px 20px" }}>
                <InspetorTema
                  config={doc.config}
                  onConfig={(patch) => setDoc((d) => ({ ...d, config: { ...d.config, ...patch } }))}
                />
              </div>
            </>
          ) : (
            <>
              {/* Cabeçalho: o que está selecionado. Antes quem dizia isso eram
                  as abas; sem elas, o painel precisa se identificar sozinho. */}
              <div style={{ flex: "none", padding: "12px 14px 8px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name={selecionado.tipo === "bloco" ? ICONE_BLOCO[selecionado.bloco.tipo] : "layout-rows"} size={15} color="var(--text-dim)" />
                <strong style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selecionado.tipo === "bloco" ? ROTULO_BLOCO[selecionado.bloco.tipo] : (selecionado.secao.nome || "Seção")}
                </strong>
              </div>
              {/* Grupos EMPILHADOS, não abas. Aba esconde metade dos controles
                  atrás de um clique que ninguém dá — quem procurava "espaçamento"
                  não olhava numa aba chamada "Aparência". Empilhado, tudo aparece
                  na mesma rolagem; o que é secundário nasce fechado. */}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 14px 20px" }}>
                {selecionado.tipo === "bloco" ? (
                  <>
                    <InspetorConteudo
                      bloco={selecionado.bloco}
                      // A chave do grupo inclui o CAMPO: trocar de campo abre um
                      // passo novo de histórico, digitar no mesmo campo continua o passo.
                      onPatch={(patch) => setDoc(
                        (d) => patchBloco(d, selecionado.bloco.id, patch),
                        `c:${selecionado.bloco.id}:${Object.keys(patch).join(",")}`,
                      )}
                    />
                    <InspetorEstilo
                      recolhido
                      estilo={selecionado.bloco.estilo}
                      visivel={selecionado.bloco.visivel}
                      paginaTemVideo={paginaTemVideo}
                      onEstilo={(patch) => setDoc(
                        (d) => patchEstiloBloco(d, selecionado.bloco.id, patch),
                        `e:${selecionado.bloco.id}:${Object.keys(patch).join(",")}`,
                      )}
                      onVisivel={(v) => setDoc((d) => setVisibilidade(d, selecionado.bloco.id, v))}
                      testeAtivo={!!doc.config.teste?.ativo}
                      teste={selecionado.bloco.teste}
                      onTeste={(t) => setDoc((d) => patchBloco(d, selecionado.bloco.id, { teste: t }))}
                    />
                  </>
                ) : (
                  <>
                  <div style={{ padding: "0 0 12px" }}>
                    <Campo label="Âncora" hint="Link direto pra esta seção: /p/pagina#totem. Letras, números e hífen.">
                      <Texto valor={selecionado.secao.ancora} placeholder="ex.: totem"
                        onChange={(v) => setDoc((d) => patchSecao(d, selecionado.secao.id, { ancora: v || undefined }), `sec:${selecionado.secao.id}:ancora`)} />
                    </Campo>
                  </div>
                  <InspetorEstilo
                    estilo={selecionado.secao.estilo}
                    paginaTemVideo={paginaTemVideo}
                    mostrarVisibilidade={false}
                    onEstilo={(patch) => setDoc(
                      (d) => patchEstiloSecao(d, selecionado.secao.id, patch),
                      `es:${selecionado.secao.id}:${Object.keys(patch).join(",")}`,
                    )}
                    onVisivel={() => {}}
                  />
                  </>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Véu da folha — só existe no celular, e só com painel aberto. */}
      {painelMob && <div className="epg-veu" onClick={() => setPainelMob(null)} />}

      <PaletaBlocos aberta={!!paleta} onFechar={() => setPaleta(null)} onEscolher={escolherBloco} />

      {publicar && (
        <PublicarPaginaModal
          paginaId={inicial.id}
          doc={doc}
          // "Corrigir" fecha o modal e já deixa o bloco selecionado, com o
          // inspetor aberto no conteúdo — é onde o conserto acontece.
          onIrParaBloco={(blocoId) => setSel(blocoId)}
          dominioPadrao={host || (typeof window !== "undefined" ? window.location.host : "")}
          dominios={dominios}
          dominioId={dominioId} setDominioId={setDominioId}
          slug={slug} setSlug={setSlug}
          settings={settings} onSettings={setSettings}
          publicado={status === "publicado"}
          publicando={publicando}
          onPublicar={acaoPublicar}
          onDespublicar={acaoDespublicar}
          onFechar={() => setPublicar(false)}
        />
      )}
      <style>{CSS}</style>
    </div>
  );
}

const BOTAO_FOLHA: React.CSSProperties = {
  padding: 7, borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface-2)", cursor: "pointer",
};
const BOTAO_X: React.CSSProperties = {
  width: "var(--tap, 44px)", height: "var(--tap, 44px)", display: "grid", placeItems: "center",
  background: "none", border: "none", cursor: "pointer", flex: "none", marginLeft: "auto",
};

// O editor nasceu com três colunas fixas (254 + 1fr + 306). Somadas, o corpo
// media 560px: num celular de 320px sobravam 105px que a fundação CORTA
// (`overflow-x: clip`) — ou seja, o inspetor inteiro ficava fora do alcance,
// sem nem a rolagem lateral pra chegar nele.
//
// Abaixo de 900px o canvas fica sozinho na coluna e cada painel vira folha
// presa embaixo, aberta por um botão da barra. Os keyframes/estados terminam em
// `transform: none` (nunca `translateY(0)`): transform residual vira bloco de
// contenção de `position: fixed` e quebraria a paleta de blocos e os popovers
// que nascem daqui de dentro.
const CSS = `
.epg-corpo { grid-template-columns: 254px minmax(0, 1fr) 306px; }
.epg-mob { display: none !important; }
.epg-veu { display: none; }

@media (max-width: 900px) {
  .epg-corpo { grid-template-columns: minmax(0, 1fr); }

  .epg-mob { display: inline-flex !important; align-items: center; justify-content: center; }
  .epg-folha-topo.epg-mob {
    display: flex !important; flex: none; align-items: center; gap: 10px;
    padding: 6px 6px 6px 14px; border-bottom: 1px solid var(--border);
  }

  .epg-lado {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: var(--z-sheet, 1201);
    height: min(72dvh, 620px); width: auto;
    border: 1px solid var(--border) !important;
    border-bottom: none !important; border-radius: 18px 18px 0 0;
    background: var(--surface); box-shadow: 0 -18px 60px rgba(0, 0, 0, .45);
    padding-bottom: var(--safe-b, 0px);
    transform: translateY(101%); transition: transform .22s ease, visibility .22s;
    visibility: hidden;
  }
  .epg-lado[data-aberto="1"] { transform: none; visibility: visible; }

  .epg-veu {
    display: block; position: fixed; inset: 0; z-index: var(--z-scrim, 1200);
    background: color-mix(in srgb, #000 46%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .epg-lado { transition: none; }
}
`;

// Status discreto na barra — sem toast a cada auto-save. Os cinco estados são
// distinguíveis: pendente ≠ salvando (um é "ainda vou mandar", o outro é "está
// no ar"), e sem rede tem texto próprio pra ninguém achar que é bug do editor.
const ESTADO_SALVAMENTO: Record<EstadoSalvamento, { icone: string; cor: string; texto: string; dica?: string }> = {
  ok: { icone: "check", cor: "var(--tf-pos, var(--ok))", texto: "Salvo" },
  pendente: { icone: "clock", cor: "var(--text-dim)", texto: "Alterações não salvas", dica: "Salvando em instantes. ⌘S salva agora." },
  salvando: { icone: "loader", cor: "var(--text-dim)", texto: "Salvando…" },
  erro: { icone: "alert-triangle", cor: "var(--tf-neg, var(--perigo))", texto: "Falha ao salvar", dica: "A última alteração não subiu. Ela fica guardada aqui no navegador; tentamos de novo sozinho." },
  offline: { icone: "wifi-off", cor: "var(--tf-warn, var(--atencao))", texto: "Sem conexão", dica: "Suas alterações ficam guardadas e sobem sozinhas quando a internet voltar." },
};

function IndicadorSalvamento({ estado }: { estado: EstadoSalvamento }) {
  const cfg = ESTADO_SALVAMENTO[estado] ?? ESTADO_SALVAMENTO.ok;
  return (
    <span title={cfg.dica}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: cfg.cor }}>
      <Icon name={cfg.icone} size={13} color={cfg.cor} /> {cfg.texto}
    </span>
  );
}

