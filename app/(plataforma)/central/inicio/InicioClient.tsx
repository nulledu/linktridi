"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { Fila, useOnda } from "../../ui/micro";

export type TipoItem = "pagina" | "tarefa" | "solicitacao" | "pessoa" | "produto" | "pedido";

export interface ItemBusca {
  id: string;
  tipo: TipoItem;
  titulo: string;
  sub: string;
  href: string;
  icon: string;
}

export interface Destino {
  href: string;
  icon: string;
  titulo: string;
  linha: string;
  /**
   * `null` = este destino não conta nada (Meu ponto, Suporte). `0` = conta e
   * está zerado — e aí o card diz `vazio` com um ✓, não um badge "0".
   *
   * A distinção existe porque as duas coisas ficavam iguais: o card caía na
   * `linha` descritiva e virava um botão com uma frase, isto é, a mesma aba da
   * fileira logo acima, de novo. O motivo de este card existir é responder
   * ANTES do clique — e "nada em aberto" responde tanto quanto "3 em aberto".
   * O que continua proibido é o badge "0", que treina a pessoa a ignorar badge.
   */
  numero: number | null;
  unidade: string | null;
  /** Frase do estado zerado. Só faz sentido quando `numero` é um número. */
  vazio?: string;
}

/** Ordem dos grupos no resultado — o mais barato de conferir primeiro. */
const GRUPOS: { tipo: TipoItem; rotulo: string }[] = [
  { tipo: "pagina", rotulo: "Ir para" },
  { tipo: "tarefa", rotulo: "Tarefas" },
  { tipo: "solicitacao", rotulo: "Solicitações" },
  { tipo: "pessoa", rotulo: "Pessoas" },
  { tipo: "produto", rotulo: "Estoque" },
  { tipo: "pedido", rotulo: "Pedidos" },
];

const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function InicioClient({ nome, destinos, locais, podeBuscarPessoas, podeBuscarEstoque, podeBuscarPedidos }: {
  nome: string;
  destinos: Destino[];
  locais: ItemBusca[];
  podeBuscarPessoas: boolean;
  podeBuscarEstoque: boolean;
  podeBuscarPedidos: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [remotos, setRemotos] = useState<ItemBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [idx, setIdx] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  const buscaRemota = podeBuscarPessoas || podeBuscarEstoque || podeBuscarPedidos;
  const termo = q.trim();

  // ── Camada local: sem rede, aparece na mesma tecla ────────────────────────
  const achadosLocais = useMemo(() => {
    if (!termo) return [];
    const n = norm(termo);
    return locais.filter((i) => norm(i.titulo).includes(n) || norm(i.sub).includes(n)).slice(0, 12);
  }, [termo, locais]);

  // ── Camada remota: 2 letras, 250ms parado, e a anterior é abortada ────────
  //
  // Não é poll: é reação a digitação. Sem o debounce, "cadeira" seriam sete
  // requisições ao banco — seis delas já obsoletas quando a resposta chegasse.
  useEffect(() => {
    if (!buscaRemota || termo.length < 2) { setRemotos([]); setBuscando(false); return; }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/central/busca?q=${encodeURIComponent(termo)}`, { signal: ac.signal, cache: "no-store" });
        const j = await r.json();
        setRemotos(Array.isArray(j.itens) ? j.itens : []);
      } catch { /* abortada ou offline: o local continua valendo */ }
      finally { if (!ac.signal.aborted) setBuscando(false); }
    }, 250);
    return () => { clearTimeout(t); ac.abort(); };
  }, [termo, buscaRemota]);

  const grupos = useMemo(() => {
    // A rota agora devolve tarefa e solicitação também — ela virou a busca do
    // ⌘K, que não tem camada local nenhuma. Aqui as duas camadas se encontram,
    // então o repetido cai pelo `id` (`tf_…`, `sl_…`, os mesmos dos dois
    // lados) e o LOCAL ganha: ele chegou primeiro e sem rede.
    const vistos = new Set(achadosLocais.map((i) => i.id));
    const todos = [...achadosLocais, ...remotos.filter((i) => !vistos.has(i.id))];
    return GRUPOS
      .map((g) => ({ ...g, itens: todos.filter((i) => i.tipo === g.tipo) }))
      .filter((g) => g.itens.length);
  }, [achadosLocais, remotos]);

  // Lista achatada na ORDEM EM QUE APARECE — é o que o ↑↓ percorre. Navegar por
  // uma ordem diferente da desenhada faz a seleção "pular" na tela.
  const chapada = useMemo(() => grupos.flatMap((g) => g.itens), [grupos]);
  const sel = Math.min(idx, Math.max(0, chapada.length - 1));
  useEffect(() => { setIdx(0); }, [termo]);

  const abrir = useCallback((i: ItemBusca | undefined) => {
    if (i) router.push(i.href);
  }, [router]);

  // `/` foca a busca de qualquer ponto da tela — menos de dentro de um campo,
  // onde a barra é só uma barra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
      e.preventDefault();
      campo.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const saudacao = useSaudacao();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {/* ── Busca ─────────────────────────────────────────────────────────── */}
      {/*
        Tudo nasce na MESMA borda esquerda das abas, dos cards e dos atalhos.
        A saudação e a busca já foram centralizadas, e o resultado era uma
        página com dois eixos: a fileira de abas colada na esquerda, o cabeçalho
        boiando no meio e os cards voltando pra esquerda de novo. Cada bloco
        estava certo sozinho e errado junto — ler a tela virava um ziguezague.
      */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* `page-head` é do INVÓLUCRO, não do `h1` — estava no título, então o
            `margin-bottom: 24px` da classe caía entre a saudação e a linha de
            apoio e as duas liam como blocos separados. No lugar certo ela dá os
            7px de dentro do cabeçalho e o respiro de mobile. */}
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1 style={{ fontSize: "clamp(22px, 5vw, 32px)", fontWeight: 800, letterSpacing: "-.02em" }}>
            {saudacao}{nome ? `, ${nome}` : ""}
          </h1>
          <p style={{ marginTop: 6, fontSize: "clamp(13px, 3.4vw, 15px)", color: "var(--text-dim)" }}>
            Procure alguma coisa, ou escolha por onde começar.
          </p>
        </div>

        {/* `position: relative` na caixa toda: a lista de resultados é ancorada
            nela, e no celular ela vira um bloco no fluxo (nada de flutuar sobre
            o polegar). */}
        <div style={{ position: "relative", width: "min(680px, 100%)" }}>
          <div className="glass" style={{
            display: "flex", alignItems: "center", gap: 12,
            minHeight: "var(--tap)", padding: "0 16px",
            borderRadius: 16, border: "1px solid var(--border)",
          }}>
            <Icon name="search" size={18} color="var(--text-dim)" />
            <input
              ref={campo}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, chapada.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
                else if (e.key === "Enter") { e.preventDefault(); abrir(chapada[sel]); }
                else if (e.key === "Escape") { setQ(""); campo.current?.blur(); }
              }}
              // Sem `autoFocus`: no celular ele abriria o teclado na chegada e
              // comeria metade da tela antes de a pessoa pedir.
              placeholder="Buscar tarefa, pessoa, produto, pedido ou página…"
              aria-label="Buscar na Central"
              style={{
                flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent",
                color: "var(--text)", fontSize: 15.5, fontWeight: 500, padding: "13px 0",
              }}
            />
            {buscando && <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600, flex: "none" }}>buscando…</span>}
            {q && !buscando && (
              <button onClick={() => { setQ(""); campo.current?.focus(); }} title="Limpar"
                style={{ border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center", flex: "none", padding: 10, margin: -10 }}>
                <Icon name="x" size={17} color="var(--text-dim)" />
              </button>
            )}
            {!q && <span className="desk-only" style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 7px", flex: "none" }}>/</span>}
          </div>

          {termo && (
            <Resultados
              grupos={grupos}
              sel={sel}
              vazio={!chapada.length && !buscando}
              termo={termo}
              onEscolher={abrir}
              onApontar={setIdx}
            />
          )}
        </div>
      </section>

      {/* ── Destinos ──────────────────────────────────────────────────────── */}
      {/* 200px, e não 230: com os cinco destinos (Mensagens entra quando a
          pessoa tem o módulo) 230 estourava a coluna por ~100px no monitor
          comum e a fileira quebrava em 4 + 1 — um card sozinho embaixo, com um
          rombo do lado. A 200 os cinco cabem numa linha só, e a quebra volta a
          acontecer só quando a coluna realmente aperta. */}
      <Fila as="section" style={{
        display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
      }}>
        {destinos.map((d) => <CardDestino key={d.href} d={d} />)}
      </Fila>

      <Recentes />
    </div>
  );
}

// ── Resultados ───────────────────────────────────────────────────────────────

function Resultados({ grupos, sel, vazio, termo, onEscolher, onApontar }: {
  grupos: { tipo: TipoItem; rotulo: string; itens: ItemBusca[] }[];
  sel: number;
  vazio: boolean;
  termo: string;
  onEscolher: (i: ItemBusca) => void;
  onApontar: (i: number) => void;
}) {
  let n = -1;
  return (
    // No computador flutua sobre o conteúdo (ancorado na caixa de busca); no
    // celular a classe `res-fluxo` derruba o `absolute` e ela empurra a página,
    // porque uma lista flutuante ali nasce debaixo do teclado.
    <div className="glass pop-solid res-lista" style={{
      position: "absolute", left: 0, right: 0, top: "calc(100% + 8px)", zIndex: 60,
      borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden",
      boxShadow: "0 24px 60px -20px rgba(0,0,0,.45)",
      maxHeight: "min(52dvh, 420px)", overflowY: "auto", padding: 7,
    }}>
      {vazio ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)", fontSize: 13.5 }}>
          Nada encontrado para “{termo}”.
        </div>
      ) : grupos.map((g) => (
        <div key={g.tipo}>
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-dim)", padding: "9px 11px 5px" }}>
            {g.rotulo}
          </div>
          {g.itens.map((it) => {
            n += 1;
            const meu = n;
            const on = meu === sel;
            return (
              <button key={it.id} onPointerDown={() => onEscolher(it)} onMouseEnter={() => onApontar(meu)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left",
                  minHeight: "var(--tap)", padding: "8px 11px", borderRadius: 12, border: "none",
                  cursor: "pointer", boxShadow: "none",
                  background: on ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent",
                }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: on ? "var(--primary)" : "var(--surface-2)" }}>
                  <Icon name={it.icon} size={16} color={on ? "var(--on-primary)" : "var(--text)"} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.titulo}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.sub}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Card de destino ──────────────────────────────────────────────────────────

function CardDestino({ d, style }: { d: Destino; style?: CSSProperties }) {
  // A onda confirma que o toque chegou: entre o dedo e a tela seguinte há uns
  // 300ms de nada, e é neles que a pessoa toca de novo.
  const onda = useOnda();
  return (
    // `ui-card-alvo` é o que faz o cartão se comportar como alvo: acende a
    // borda no hover, afunde no toque e ganhe anel de foco no teclado. Sem
    // ela era um <a> mudo — a regra de `--pressao` da fundação casa `button` e
    // filho de fileira, e um cartão numa grade não é nem um nem outro.
    <Link href={d.href} className="ui-card-alvo mt-anel" onPointerDown={onda} style={{
      display: "flex", flexDirection: "column", gap: 10, textDecoration: "none",
      minHeight: 124, padding: 16, borderRadius: "var(--r-md)",
      border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
      // Por último: é por aqui que chega o `--mt-i` da `Fila`.
      ...style,
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2)" }}>
          <Icon name={d.icon} size={17} color="var(--text)" />
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{d.titulo}</span>
      </span>
      {d.numero ? (
        <span style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: "auto" }}>
          <strong style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: "var(--primary)" }}>{d.numero > 99 ? "99+" : d.numero}</strong>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>{d.unidade}</span>
        </span>
      ) : d.numero === 0 && d.vazio ? (
        // Zerado é resposta, não ausência de resposta: quem contou e achou
        // nada diz isso com todas as letras, em vez de cair na frase genérica
        // que descreve a aba. O ✓ carrega a cor; o texto fica discreto pra
        // não competir com o card que tem número de verdade.
        <span style={{ display: "flex", alignItems: "center", gap: 7, marginTop: "auto" }}>
          <Icon name="circle-check" size={16} color="var(--ok)" />
          <span style={{ fontSize: 12.5, color: "var(--text-dim)", fontWeight: 600 }}>{d.vazio}</span>
        </span>
      ) : (
        <span style={{ marginTop: "auto", fontSize: 12.5, color: "var(--text-dim)" }}>{d.linha}</span>
      )}
    </Link>
  );
}

// ── Recentes ─────────────────────────────────────────────────────────────────

/**
 * Os últimos módulos abertos, guardados pelo Shell em `gaius:recent`. É a
 * resposta mais barata para "pra onde eu quero ir": na prática a pessoa volta
 * pros mesmos três ou quatro lugares. Some quando não há histórico — uma fileira
 * vazia com o rótulo "Recentes" é pior que fileira nenhuma.
 */
function Recentes() {
  const [itens, setItens] = useState<{ href: string; label: string; icon: string }[]>([]);
  useEffect(() => {
    try {
      const bruto = JSON.parse(localStorage.getItem("gaius:recent") || "[]");
      if (Array.isArray(bruto)) setItens(bruto.filter((r) => r && r.href && r.label).slice(0, 6));
    } catch { /* localStorage sem permissão ou json podre */ }
  }, []);
  if (!itens.length) return null;
  return (
    <section>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 9 }}>
        Onde você estava
      </div>
      <div className="tab-strip" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {itens.map((r) => (
          <Link key={r.href} href={r.href} style={{
            display: "flex", alignItems: "center", gap: 8, minHeight: "var(--tap)", padding: "0 14px",
            borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)",
            color: "var(--text)", textDecoration: "none", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
          }}>
            <Icon name={r.icon || "layout-grid"} size={15} color="var(--text-dim)" />
            {r.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Saudação ─────────────────────────────────────────────────────────────────

/**
 * Calculada NO CLIENTE, depois da montagem. A hora do servidor é UTC e a da
 * pessoa não é: renderizar "Boa noite" no servidor às 21h UTC e "Boa tarde" no
 * cliente às 18h local dá erro de hidratação. Começa em "Olá" (igual nos dois
 * lados) e vira a saudação certa no primeiro quadro.
 */
function useSaudacao() {
  const [s, setS] = useState("Olá");
  useEffect(() => {
    const h = new Date().getHours();
    setS(h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite");
  }, []);
  return s;
}
