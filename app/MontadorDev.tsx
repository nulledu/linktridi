"use client";

// ── Montador (só nas páginas /dev-*, só fora de produção) ────────────────────
// O dono vê o banco de provas e sabe o que NÃO quer ali — mas "tira aquele
// card do meio" não chega ao código com endereço. Aqui ele clica na peça e
// marca: TIRAR (some na hora, pra ver como fica), TROCAR POR (peça do kit ou
// widget da página) ou ESTILO, com nota. Cada marca leva o caminho da peça no
// DOM E a cadeia de componentes React que a desenham — é isso que deixa o
// Claude achar o arquivo certo. As marcas vão pra `docs/montagem/<rota>.json`
// (rota /api/dev-montagem) e valem pra toda página /dev-* nova sem cadastro.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Icon } from "./(plataforma)/Icon";
import { Botao, BotaoIcone } from "./(plataforma)/ui/controles";

type Acao = "tirar" | "trocar" | "estilo" | "nota";
type Marca = {
  id: string; acao: Acao; seletor: string; componentes: string[]; texto: string;
  trocarPor?: string; nota?: string; tamanho: string; criadoEm: string;
};
type Alvo = { el: HTMLElement; seletor: string; componentes: string[]; texto: string; tamanho: string };

const ACOES: { k: Acao; rot: string; icone: string; dica: string }[] = [
  { k: "tirar", rot: "Tirar", icone: "eye-off", dica: "Some da tela agora; o Claude remove do código" },
  { k: "trocar", rot: "Trocar por", icone: "arrows-exchange", dica: "Outra peça do kit ou outro widget no lugar" },
  { k: "estilo", rot: "Estilo", icone: "palette", dica: "Cor, tamanho, espaço, tipo de gráfico…" },
  { k: "nota", rot: "Nota", icone: "notes", dica: "Qualquer outro pedido sobre esta peça" },
];

const RAIZ_ID = "montador-dev";

/** Cadeia de componentes React (do mais próximo pro mais longe) que desenham o elemento. */
function componentesDe(el: HTMLElement): string[] {
  const chave = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  let f = chave ? (el as unknown as Record<string, unknown>)[chave] as { type?: unknown; return?: unknown } | null : null;
  const nomes: string[] = [];
  let passos = 0;
  // Daqui pra cima é o esqueleto do Next (roteador, limites de erro): não
  // diz nada sobre a peça.
  const NEXT = /^(SegmentViewNode|InnerLayoutRouter|OuterLayoutRouter|LayoutRouter|RenderFromTemplateContext|ScrollAndFocusHandler|RedirectErrorBoundary|RedirectBoundary|HTTPAccessFallback|ErrorBoundary|LoadingBoundary|InnerScrollAndFocusHandler|AppRouter|Router|HotReload|ServerRoot|ClientPageRoot|ClientSegmentRoot)/;
  while (f && nomes.length < 6 && passos++ < 200) {
    const t = f.type as { name?: string; displayName?: string; render?: { name?: string } } | string | undefined;
    const nome = typeof t === "function" ? ((t as { displayName?: string; name?: string }).displayName || (t as { name?: string }).name)
      : t && typeof t === "object" ? (t.displayName || t.render?.name) : null;
    if (nome && NEXT.test(nome)) break;
    if (nome && /^[A-Z]/.test(nome) && !nomes.includes(nome) && !/^(Provider|Consumer|Fragment|Suspense|Portal)$/.test(nome)) nomes.push(nome);
    f = f.return as typeof f;
  }
  return nomes;
}

/** Caminho estável: âncora no widget (data-wkey) ou id mais próximo; senão nth-of-type desde o body. */
function seletorDe(el: HTMLElement): string {
  const partes: string[] = [];
  let e: HTMLElement | null = el;
  let ancorou = false;
  while (e && e !== document.body && partes.length < 12) {
    if (e.dataset?.wkey) { partes.unshift(`[data-wkey="${e.dataset.wkey}"]`); ancorou = true; break; }
    if (e.id && !e.id.startsWith(":")) { partes.unshift(`#${CSS.escape(e.id)}`); ancorou = true; break; }
    const pai: HTMLElement | null = e.parentElement;
    if (!pai) break;
    const irmaos = [...pai.children].filter((c) => c.tagName === e!.tagName);
    partes.unshift(irmaos.length > 1 ? `${e.tagName.toLowerCase()}:nth-of-type(${irmaos.indexOf(e) + 1})` : e.tagName.toLowerCase());
    e = pai;
  }
  return (ancorou ? "" : "body > ") + partes.join(" > ");
}

function alvoDe(el: HTMLElement): Alvo {
  const r = el.getBoundingClientRect();
  return {
    el, seletor: seletorDe(el),
    // Card do painel: o widget vem primeiro — é a chave do catálogo que o Claude procura.
    componentes: [...(el.closest<HTMLElement>("[data-wkey]") ? [`widget:${el.closest<HTMLElement>("[data-wkey]")!.dataset.wkey}`] : []), ...componentesDe(el)],
    texto: (el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 120),
    tamanho: `${Math.round(r.width)}×${Math.round(r.height)}`,
  };
}

const dentroDoMontador = (n: EventTarget | null) => n instanceof Element && !!n.closest(`#${RAIZ_ID}`);

export default function MontadorDev() {
  const rota = usePathname() || "";
  const [ligado, setLigado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [kit, setKit] = useState<string[]>([]);
  const [alvo, setAlvo] = useState<Alvo | null>(null);
  const [acao, setAcao] = useState<Acao>("tirar");
  const [trocarPor, setTrocarPor] = useState("");
  const [nota, setNota] = useState("");
  const [verTirados, setVerTirados] = useState(false);
  const [salvo, setSalvo] = useState<string | null>(null);
  const realce = useRef<HTMLDivElement>(null);
  const carregou = useRef(false);
  // Só grava depois de uma mudança DA PESSOA: abrir a página não pode criar
  // arquivo vazio (parecia pedido onde não havia nenhum).
  const mexeu = useRef(false);

  // Carrega as marcas da rota (e a lista do kit).
  useEffect(() => {
    carregou.current = false;
    fetch(`/api/dev-montagem?rota=${encodeURIComponent(rota)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { mexeu.current = false; if (j) { setMarcas(Array.isArray(j.marcas) ? j.marcas : []); setKit(j.kit ?? []); } carregou.current = true; })
      .catch(() => { carregou.current = true; });
  }, [rota]);

  // Grava (debounce) a cada mudança depois da carga.
  useEffect(() => {
    if (!carregou.current || !mexeu.current) return;
    const t = setTimeout(() => {
      fetch("/api/dev-montagem", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rota, marcas }) })
        .then((r) => r.json()).then((j) => setSalvo(j?.arquivo ?? null)).catch(() => setSalvo(null));
    }, 400);
    return () => clearTimeout(t);
  }, [marcas, rota]);

  // "Tirar" vale na hora: some da tela (a chave "ver tirados" traz de volta, marcados).
  const css = useMemo(() => marcas.filter((m) => m.acao === "tirar").map((m) => verTirados
    ? `${m.seletor}{outline:2px dashed var(--perigo)!important;opacity:.35!important}`
    : `${m.seletor}{display:none!important}`).join("\n"), [marcas, verTirados]);

  // Modo de escolha: realce no que está sob o ponteiro, clique escolhe.
  useEffect(() => {
    if (!ligado) return;
    const mover = (ev: PointerEvent) => {
      if (dentroDoMontador(ev.target) || !realce.current) { if (realce.current) realce.current.style.opacity = "0"; return; }
      const el = ev.target as HTMLElement;
      const r = el.getBoundingClientRect();
      Object.assign(realce.current.style, { opacity: "1", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    const clicar = (ev: MouseEvent) => {
      if (dentroDoMontador(ev.target)) return;
      ev.preventDefault(); ev.stopPropagation();
      setAlvo(alvoDe(ev.target as HTMLElement));
      setAcao("tirar"); setTrocarPor(""); setNota("");
      setLigado(false); setAberto(true);
    };
    const tecla = (ev: KeyboardEvent) => { if (ev.key === "Escape") setLigado(false); };
    const bloquear = (ev: Event) => { if (!dentroDoMontador(ev.target)) { ev.preventDefault(); ev.stopPropagation(); } };
    document.addEventListener("pointermove", mover, true);
    document.addEventListener("click", clicar, true);
    document.addEventListener("pointerdown", bloquear, true);
    document.addEventListener("keydown", tecla);
    document.body.style.cursor = "crosshair";
    return () => {
      document.removeEventListener("pointermove", mover, true);
      document.removeEventListener("click", clicar, true);
      document.removeEventListener("pointerdown", bloquear, true);
      document.removeEventListener("keydown", tecla);
      document.body.style.cursor = "";
      if (realce.current) realce.current.style.opacity = "0";
    };
  }, [ligado]);

  // Moldura fixa em volta da peça escolhida enquanto o painel está aberto.
  const [caixa, setCaixa] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!alvo) { setCaixa(null); return; }
    const medir = () => setCaixa(alvo.el.isConnected ? alvo.el.getBoundingClientRect() : null);
    medir();
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    return () => { window.removeEventListener("scroll", medir, true); window.removeEventListener("resize", medir); };
  }, [alvo]);

  const subir = useCallback(() => {
    const pai = alvo?.el.parentElement;
    if (pai && pai !== document.body) setAlvo(alvoDe(pai));
  }, [alvo]);

  const widgets = useMemo(() => (aberto ? [...new Set([...document.querySelectorAll<HTMLElement>("[data-wkey]")].map((e) => `widget: ${e.dataset.wkey}`))] : []), [aberto]);

  const guardar = () => {
    if (!alvo) return;
    const m: Marca = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      acao, seletor: alvo.seletor, componentes: alvo.componentes, texto: alvo.texto, tamanho: alvo.tamanho,
      trocarPor: acao === "trocar" ? trocarPor.trim() || undefined : undefined,
      nota: nota.trim() || undefined, criadoEm: new Date().toISOString(),
    };
    mexeu.current = true;
    setMarcas((ms) => [...ms, m]);
    setAlvo(null);
  };

  const mostrarMarca = (m: Marca) => {
    const el = document.querySelector<HTMLElement>(m.seletor);
    if (!el) return;
    if (m.acao === "tirar") setVerTirados(true);
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.animate?.([{ outline: "3px solid var(--primary)" }, { outline: "3px solid transparent" }], { duration: 1400 });
    });
  };

  if (!rota.startsWith("/dev-")) return null;
  const falta = acao === "trocar" ? !trocarPor.trim() : acao !== "tirar" && !nota.trim();

  return createPortal(
    <div id={RAIZ_ID} className="montador">
      <style>{css}</style>
      <div ref={realce} className="montador-realce" aria-hidden />
      {caixa && <div className="montador-alvo" aria-hidden style={{ left: caixa.left, top: caixa.top, width: caixa.width, height: caixa.height }} />}

      {ligado && <div className="montador-aviso"><Icon name="hand-click" size={16} /> Clique na peça que você quer mudar · Esc sai</div>}

      {!aberto && (
        <div className="montador-fab">
          <Botao variante={ligado ? "primario" : "secundario"} icone="hand-click" onClick={() => setLigado((v) => !v)}>
            {ligado ? "Escolhendo…" : "Montar"}
          </Botao>
          <BotaoIcone icone="notes" titulo={`Marcas desta página (${marcas.length})`} onClick={() => setAberto(true)} />
          {marcas.length > 0 && <span className="montador-conta">{marcas.length}</span>}
        </div>
      )}

      {aberto && (
        <section className="montador-painel" aria-label="Montador da página">
          <header className="montador-cab">
            <Icon name="layout-grid" size={16} />
            <b>Montador</b>
            <span className="montador-dim">{rota}</span>
            <span style={{ marginLeft: "auto" }} />
            <BotaoIcone icone="x" titulo="Fechar" onClick={() => { setAberto(false); setAlvo(null); }} />
          </header>

          {alvo ? (
            <div className="montador-corpo">
              <div className="montador-dim">Peça escolhida · {alvo.tamanho}</div>
              <div className="montador-chips">
                {alvo.componentes.length ? alvo.componentes.map((c) => <code key={c}>{c}</code>) : <code>{alvo.el.tagName.toLowerCase()}</code>}
              </div>
              {alvo.texto && <div className="montador-texto">“{alvo.texto}”</div>}
              <div className="montador-linha">
                <Botao variante="sutil" icone="arrow-up" onClick={subir}>Pegar o bloco de fora</Botao>
                <Botao variante="sutil" icone="hand-click" onClick={() => { setAlvo(null); setAberto(false); setLigado(true); }}>Escolher outra</Botao>
              </div>

              <div className="montador-acoes" role="radiogroup" aria-label="O que fazer">
                {ACOES.map((a) => (
                  <button key={a.k} type="button" role="radio" aria-checked={acao === a.k} title={a.dica}
                    className="montador-acao" data-on={acao === a.k ? "" : undefined} onClick={() => setAcao(a.k)}>
                    <Icon name={a.icone} size={16} /> {a.rot}
                  </button>
                ))}
              </div>

              {acao === "trocar" && (
                <label className="montador-campo">
                  <span>Trocar por</span>
                  <input list="montador-kit" value={trocarPor} onChange={(e) => setTrocarPor(e.target.value)} placeholder="Peça do kit, widget ou descreva" />
                  <datalist id="montador-kit">
                    {[...widgets, ...kit].map((k) => <option key={k} value={k} />)}
                  </datalist>
                </label>
              )}
              <label className="montador-campo">
                <span>{acao === "estilo" ? "Como deve ficar" : acao === "tirar" ? "Por quê (opcional)" : "Nota"}</span>
                <textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder={acao === "estilo" ? "Ex.: gráfico de barras em vez de rosca; número maior; sem borda" : acao === "tirar" ? "Ex.: repetido com o card de cima" : ""} />
              </label>
              <div className="montador-linha">
                <Botao variante="primario" icone="check" onClick={guardar} disabled={falta}>Marcar</Botao>
                <Botao variante="secundario" onClick={() => setAlvo(null)}>Cancelar</Botao>
              </div>
            </div>
          ) : (
            <div className="montador-corpo">
              <div className="montador-linha">
                <Botao variante="primario" icone="hand-click" onClick={() => { setAberto(false); setLigado(true); }}>Escolher uma peça</Botao>
                <Botao variante="sutil" icone={verTirados ? "eye-off" : "eye"} onClick={() => setVerTirados((v) => !v)}>
                  {verTirados ? "Esconder tirados" : "Ver tirados"}
                </Botao>
              </div>
              {marcas.length === 0 ? (
                <div className="montador-dim">Nenhuma marca nesta página ainda.</div>
              ) : (
                <ol className="montador-lista">
                  {marcas.map((m) => (
                    <li key={m.id}>
                      <button type="button" className="montador-item" onClick={() => mostrarMarca(m)} title="Mostrar na página">
                        <Icon name={ACOES.find((a) => a.k === m.acao)?.icone ?? "notes"} size={15} />
                        <span>
                          <b>{ACOES.find((a) => a.k === m.acao)?.rot}</b>{m.trocarPor ? ` → ${m.trocarPor}` : ""}
                          <span className="montador-dim"> · {m.componentes[0] ?? m.seletor.split(" > ").pop()}</span>
                          {m.nota && <span className="montador-nota">{m.nota}</span>}
                        </span>
                      </button>
                      <BotaoIcone icone="trash" titulo="Desfazer esta marca" onClick={() => { mexeu.current = true; setMarcas((ms) => ms.filter((x) => x.id !== m.id)); }} />
                    </li>
                  ))}
                </ol>
              )}
              <div className="montador-dim">
                {salvo ? <>Salvo em <code>{salvo}</code> — é de lá que o Claude lê.</> : "Salvando…"}
              </div>
            </div>
          )}
        </section>
      )}
    </div>,
    document.body,
  );
}
