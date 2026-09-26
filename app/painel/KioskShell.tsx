"use client";

import { useEffect, useState } from "react";
import type { PanelConfig } from "@/lib/types";
import { Icon } from "./slides/Icon";
import { getDeviceTipo, setDeviceTipo, clearDeviceTipo, getDevicePerfil, setDevicePerfil, getDeviceGiro, setDeviceGiro, type PainelTipo } from "./cache";
import { PolyfillCompat } from "./PolyfillCompat";

// Casca comum dos painéis de TV: palco escalado pra preencher a tela (1280×720
// por padrão; o painel de logística passa 720×1280, retrato), tema dinâmico
// (com contraste por luminância), marca, relógio e selo offline.
/**
 * A PELE CLARA da parede — o mesmo fundo lavanda dos blocos (`widgets.css`).
 *
 * Vive aqui, e não em `config.theme.background`, porque não é preferência: é o
 * desenho. O tema configurável continua valendo para os painéis que ainda não
 * foram redesenhados (produção, logística, máquinas), e é por isso que a pele
 * é uma OPÇÃO do invólucro em vez de uma troca no `DEFAULT_CONFIG` — trocar o
 * padrão repintaria de branco, sem aviso, a TV do galpão que ninguém desenhou
 * ainda.
 */
export const PELE_CLARA = "#f5f4fa";

export function KioskShell({
  config, updatedAt, offline, cachedAt, children, comPerfis = false, palco, pele, rotacao,
}: {
  config: PanelConfig; updatedAt?: string; offline?: boolean; cachedAt?: string | null; children: React.ReactNode;
  /**
   * Mostrar a lista de telas no menu do aparelho.
   *
   * Só o painel de VENDAS é montado por perfil. No de produção a lista existiria
   * como uma escolha que não muda nada na tela — pior que não ter.
   */
  comPerfis?: boolean;
  /** Dimensões do palco. Retrato (`h > w`) libera o "Girar tela" no menu. */
  palco?: { w: number; h: number };
  /** `"claro"` usa a pele desenhada da parede em vez do fundo configurado. */
  pele?: "claro";
  /**
   * Rotação entre telas (opcional, quem gira é o painel): mostra o fio de
   * progresso no pé do palco e "atual → próxima". `chave` muda a cada troca e
   * reinicia o fio; `ms` é a duração da tela atual.
   */
  rotacao?: { atual: string; proxima?: string; ms: number; chave: string | number };
}) {
  const w = palco?.w ?? 1280, h = palco?.h ?? 720;
  const retrato = h > w;
  const [scale, setScale] = useState(1);
  // Palco girado 90°: TV pendurada de lado cujo sistema não gira a imagem.
  // Nasce `false` no servidor e liga no primeiro efeito — é o mesmo padrão do
  // `getDeviceTipo`, e evita divergência de hidratação.
  const [girado, setGirado] = useState(false);

  useEffect(() => {
    const fit = () => {
      const g = getDeviceGiro() && retrato;
      setGirado(g);
      // Girado, o palco ocupa a tela DEITADO: a largura dele corre na altura
      // da janela e vice-versa.
      setScale(g
        ? Math.min(window.innerWidth / h, window.innerHeight / w)
        : Math.min(window.innerWidth / w, window.innerHeight / h));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [w, h, retrato]);

  const fundo = pele === "claro" ? PELE_CLARA : config.theme.background;

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--primary", config.theme.primary);
    r.style.setProperty("--secondary", config.theme.secondary);
    r.style.setProperty("--bg", fundo);
    const light = isLight(fundo);
    r.style.setProperty("--text", light ? "#0f0f12" : "#f5f5f7");
    r.style.setProperty("--text-dim", light ? "#44454c" : "#c2c2cc");
    r.style.setProperty("--border", light ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.14)");
    r.style.setProperty("--surface", light ? "rgba(0,0,0,0.045)" : "rgba(255,255,255,0.06)");
    r.style.setProperty("--surface-2", light ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.1)");
    r.classList.toggle("light", light);
  }, [config.theme, fundo]);

  return (
    <main style={fullscreen}>
      {/* Faz o painel sair igual ao navegador no WebView velho da TV box —
          carrega o polyfill de container-query só quando falta suporte. */}
      <PolyfillCompat />
      {/* `pele-clara` é o escopo que reveste o que NÃO é bloco: as telas de
          setor (produção, logística, máquinas) e os slides clássicos são
          escritos à mão com o `.glass` do globals, que foi desenhado para
          fundo preto. Ver a nota no fim do `widgets.css`. */}
      <div className={pele === "claro" ? "pele-clara" : undefined}
        style={{ width: w, height: h, position: "relative", background: fundo, transform: `${girado ? "rotate(90deg) " : ""}scale(${scale})`, transformOrigin: "center center", flex: "none" }}>
        {/* A tela entra com 250ms de opacidade + escala mínima (tv-tokens.css);
            a `key` da rotação refaz a entrada a cada troca de tela. */}
        <div key={rotacao?.chave} className="tv-tela-entra" style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: retrato ? "40px 36px" : "48px 64px" }}>
          {children}
        </div>

        {rotacao && rotacao.ms > 0 && (
          <>
            <div className="tv-rota" aria-hidden>
              <div key={rotacao.chave} className="tv-rota-fio" style={{ ["--tv-rota-ms" as string]: `${rotacao.ms}ms` } as React.CSSProperties} />
            </div>
            <div className="tv-rota-rotulo">
              <span>{rotacao.atual}</span>
              {rotacao.proxima && rotacao.proxima !== rotacao.atual && (
                <span className="tv-rota-prox" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {/* chevron-right do Tabler — não existe no mapa de slides/Icon */}
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6l-6 6" /></svg>{rotacao.proxima}
                </span>
              )}
            </div>
          </>
        )}

        {/*
          A tarja do aparelho: hora, data, última sincronia e o menu, tudo num
          canto só. A marca saiu do palco — o logo de 46px com "Tridi" ao lado
          ficava POR CIMA da primeira letra de qualquer título posto na primeira
          célula da grade, e o nome da empresa não é informação que a parede
          precise repetir o dia inteiro.
        */}
        <TarjaDoAparelho
          updatedAt={updatedAt}
          offline={offline}
          cachedAt={cachedAt}
          perfis={comPerfis ? config.perfis ?? null : null}
          comGiro={retrato}
          clara={pele === "claro"}
        />
      </div>
    </main>
  );
}

/**
 * A tarja do aparelho, no canto de baixo à direita.
 *
 * Antes esta informação ocupava a faixa inteira do topo: logo de 46px e o nome
 * da empresa à esquerda, três selos com ícone à direita. Numa parede que fica
 * ligada o dia todo, isso é moldura permanente em volta do que interessa — e
 * ainda cobria a primeira letra de qualquer título posto na primeira célula.
 *
 * Agora é uma linha só, apagada (35%), que ACENDE quando alguém se aproxima:
 * qualquer mouse, toque ou tecla devolve opacidade cheia por 4 segundos. Quem
 * está de longe vê a hora e nada mais; quem chega perto lê tudo.
 *
 * Duas coisas NÃO obedecem a essa regra, de propósito:
 * • O selo de OFFLINE fica sempre aceso. É aviso — se a parede está mostrando
 *   número velho, esconder isso é a única coisa pior que mostrar o número.
 * • O menu, uma vez aberto, fica aceso enquanto estiver aberto.
 */
function TarjaDoAparelho({
  updatedAt, offline, cachedAt, perfis, comGiro = false, clara = false,
}: {
  updatedAt?: string;
  offline?: boolean;
  cachedAt?: string | null;
  perfis: { id: string; nome: string }[] | null;
  comGiro?: boolean;
  /** Pele clara: o menu deixa de ser vidro escuro e vira lavanda chapada. */
  clara?: boolean;
}) {
  const [aceso, setAceso] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  // A hora do relógio. Um minuto de resolução basta numa parede — e este é um
  // timer VISUAL, não uma busca de dados: não pesa na conta de invocação.
  const [agora, setAgora] = useState(() => horaLabel());

  useEffect(() => {
    const id = setInterval(() => setAgora(horaLabel()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let apagar: ReturnType<typeof setTimeout>;
    const acender = () => {
      setAceso(true);
      clearTimeout(apagar);
      apagar = setTimeout(() => setAceso(false), 4000);
    };
    // `pointermove` cobre mouse e toque; `keydown` cobre o controle remoto da
    // TV, que é como se mexe numa parede sem teclado à mão.
    window.addEventListener("pointermove", acender, { passive: true });
    window.addEventListener("keydown", acender);
    return () => {
      clearTimeout(apagar);
      window.removeEventListener("pointermove", acender);
      window.removeEventListener("keydown", acender);
    };
  }, []);

  const visivel = aceso || menuAberto || offline;

  return (
    <div
      style={{
        position: "absolute",
        right: 22,
        bottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 10,
        zIndex: 6,
        fontSize: 12.5,
        fontWeight: 600,
        color: "var(--text-dim)",
        opacity: visivel ? 1 : 0.35,
        // Só opacidade: é a única propriedade que o compositor anima de graça,
        // e mover a tarja chamaria mais atenção do que ela merece.
        // Acende em 250ms, apaga em 150ms (fechar é sair da frente).
        transition: visivel ? "opacity var(--tv-entra) var(--tv-curva-entra)" : "opacity var(--tv-sai) var(--tv-curva-sai)",
      }}
    >
      {offline && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--atencao)", background: "color-mix(in srgb,var(--atencao) 16%,transparent)", padding: "3px 9px", borderRadius: 999 }}>
          <Icon name="alert-triangle" size={13} color="var(--atencao)" />
          Offline · dados de {cachedAt ? agoLabel(cachedAt) : "antes"}
        </span>
      )}
      {/*
        Um ÍCONE antes de cada dado. A tarja é uma linha só de texto cinza a
        35% de opacidade: sem a silhueta na frente, "27 de ago de 2026" e
        "sincronizado agora" viram a mesma mancha, e quem chega perto tem que
        LER para descobrir o que é cada coisa. O relógio, o calendário e o
        visto resolvem isso antes da leitura.
      */}
      <span style={sel}>
        <Icon name="clock" size={14} color="var(--text-dim)" />
        {/* Hora primeiro: é o único dado daqui que se lê de longe, e o que diz
            num relance que a tela não congelou. */}
        <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text)", fontWeight: 700 }}>{agora}</span>
      </span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span style={sel}>
        <Icon name="calendar" size={14} color="var(--text-dim)" />
        {todayLabel()}
      </span>
      {updatedAt && (
        <>
          <span style={{ opacity: 0.5 }}>·</span>
          {/* A sincronia é a única da fileira com cor: é o dado que responde
              "isto aqui está vivo?", e é o primeiro que alguém procura quando
              desconfia do número. */}
          <span style={{ ...sel, color: "var(--primary-acao, var(--primary))" }}>
            <Icon name="circle-check" size={14} color="currentColor" />
            sincronizado {agoLabel(updatedAt)}
          </span>
        </>
      )}
      <DeviceMenu perfis={perfis} onAbrir={setMenuAberto} comGiro={comGiro} clara={clara} />
    </div>
  );
}

// Menu discreto no canto: 3 risquinhos que expandem com animação liquid glass.
// Permite trocar o painel deste aparelho. Também abre com a tecla "M" (útil em
// controles/teclados de TV).
function DeviceMenu({ perfis, onAbrir, comGiro = false, clara = false }: {
  perfis: { id: string; nome: string }[] | null;
  /** A tarja fica acesa enquanto o menu estiver aberto. */
  onAbrir?: (aberto: boolean) => void;
  /** Painel retrato: oferece o "Girar tela" pra TV pendurada de lado. */
  comGiro?: boolean;
  /** Pele clara: lavanda chapada no lugar do vidro escuro. */
  clara?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => { onAbrir?.(open); }, [open, onAbrir]);
  const [tipo, setTipo] = useState<PainelTipo | null>(null);
  const [perfil, setPerfil] = useState<string | null>(null);

  useEffect(() => { setTipo(getDeviceTipo()); setPerfil(getDevicePerfil()); }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "m" || e.key === "M") setOpen((o) => !o);
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function trocar(t: PainelTipo) {
    if (t === tipo) { setOpen(false); return; }
    setDeviceTipo(t);
    location.reload();
  }

  function trocarPerfil(id: string) {
    setDevicePerfil(id);
    // Sai levando o `?perfil=` embora: a URL tem prioridade sobre a escolha do
    // aparelho, então mantê-la faria o clique parecer que não funcionou.
    location.href = location.pathname;
  }

  // A escolha em vigor: a URL manda, depois o aparelho, depois o primeiro.
  const daUrl = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("perfil")?.trim().toLowerCase()
    : null;
  const emUso = (p: { id: string; nome: string }) => {
    const alvo = daUrl || perfil?.toLowerCase() || perfis?.[0]?.id.toLowerCase();
    return p.id.toLowerCase() === alvo || p.nome.toLowerCase() === alvo;
  };

  return (
    <div style={{ position: "relative", zIndex: 20, display: "flex" }}>
      {/* botão 3 riscos — menor, porque agora divide a tarja com o texto */}
      {/* Na pele clara o vidro (branco a 9% sobre lavanda) some: o botão vira
          um quadrado da mesma lavanda dos selos, que é o que o desenho pede. */}
      <button onClick={() => setOpen((o) => !o)} aria-label="Menu do painel"
        className={clara ? "" : "glass glass-spec"}
        style={{ width: 30, height: 30, borderRadius: 10, border: "none", cursor: "pointer", display: "grid", placeItems: "center", padding: 0,
          background: clara ? "#ece7fe" : undefined,
          transition: "opacity .25s ease" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{
              width: 13, height: 2, borderRadius: 2, background: "var(--text)",
              transition: "transform .3s cubic-bezier(.2,.8,.2,1), opacity .2s ease",
              transform: open ? (i === 0 ? "translateY(5px) rotate(45deg)" : i === 2 ? "translateY(-5px) rotate(-45deg)" : "scaleX(0)") : "none",
              opacity: open && i === 1 ? 0 : 1,
            }} />
          ))}
        </span>
      </button>

      {/* painel expansível */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: -1 }} />
          <div className="glass glass-spec tv-menu-entra" style={{
            // Abre PARA CIMA: a tarja mora no rodapé, e um painel que descesse
            // sairia da tela. Nasce do canto que o abriu (o guia da Apple chama
            // de âncora), então o vínculo botão→painel fica óbvio.
            position: "absolute", bottom: 40, right: 0, width: 248, borderRadius: 18, padding: 8,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-dim)", padding: "6px 10px 4px" }}>Painel deste aparelho</div>
            {([["vendas", "Painel de Vendas", "trending-up"], ["producao", "Painel de Produção", "tools"], ["logistica", "Painel de Logística", "truck-delivery"], ["maquinas", "Painel de Máquinas", "printer"]] as const).map(([t, lbl, ic]) => {
              const on = tipo === t;
              return (
                <button key={t} onClick={() => trocar(t)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 10px", borderRadius: 11, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
                    background: on ? "color-mix(in srgb, var(--primary) 18%, transparent)" : "transparent", color: "var(--text)", textAlign: "left" }}>
                  <Icon name={ic} size={18} color={on ? "var(--primary-texto)" : "var(--text-dim)"} />
                  <span style={{ flex: 1 }}>{lbl}</span>
                  {on && <Icon name="circle-check" size={16} color="var(--primary-texto)" />}
                </button>
              );
            })}
            {/* As telas montadas no ERP. Sem isto, a única forma de escolher
                era digitar `?perfil=` no navegador da televisão — com controle
                remoto, e de novo a cada reinício que voltasse para `/painel`. */}
            {perfis && perfis.length > 1 && (
              <>
                <div style={{ height: 1, background: "var(--border)", margin: "6px 8px" }} />
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-dim)", padding: "6px 10px 4px" }}>Tela desta TV</div>
                <div style={{ maxHeight: 190, overflowY: "auto" }}>
                  {perfis.map((p) => {
                    const on = emUso(p);
                    return (
                      <button key={p.id} onClick={() => trocarPerfil(p.id)}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 11, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 600,
                          background: on ? "color-mix(in srgb, var(--primary) 18%, transparent)" : "transparent", color: "var(--text)", textAlign: "left" }}>
                        <Icon name="device-tv" size={17} color={on ? "var(--primary-texto)" : "var(--text-dim)"} />
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                        {on && <Icon name="circle-check" size={16} color="var(--primary-texto)" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {/* TV pendurada de lado: o sistema de algumas TVs não gira a
                imagem, então o palco retrato gira por conta própria. Só
                aparece em painel retrato — no 16:9 seria uma escolha que não
                muda nada. */}
            {comGiro && (
              <>
                <div style={{ height: 1, background: "var(--border)", margin: "6px 8px" }} />
                <button onClick={() => { setDeviceGiro(!getDeviceGiro()); location.href = location.pathname; }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px", borderRadius: 11, border: "none", cursor: "pointer", fontSize: 13.5, color: "var(--text)", background: "transparent", textAlign: "left" }}>
                  <Icon name="refresh" size={17} color="var(--text-dim)" />
                  <span>Girar tela (TV deitada)</span>
                </button>
              </>
            )}
            <div style={{ height: 1, background: "var(--border)", margin: "6px 8px" }} />
            <button onClick={() => { clearDeviceTipo(); location.reload(); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px", borderRadius: 11, border: "none", cursor: "pointer", fontSize: 13.5, color: "var(--text-dim)", background: "transparent", textAlign: "left" }}>
              <Icon name="refresh" size={17} color="var(--text-dim)" />
              <span>Perguntar de novo (resetar)</span>
            </button>
            <div style={{ fontSize: 10.5, color: "var(--text-dim)", padding: "4px 10px 6px", opacity: 0.7 }}>Dica: aperte a tecla “M” no controle.</div>
          </div>
        </>
      )}
    </div>
  );
}

/** Ícone + dado, colados: cada informação da tarja é uma unidade só. */
const sel: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5 };

const fullscreen: React.CSSProperties = {
  width: "100%", height: "100dvh", overflow: "hidden", position: "relative",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
};

function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function todayLabel() {
  const s = new Date(Date.now() - 3 * 3600 * 1000);
  return `${String(s.getUTCDate()).padStart(2, "0")} de ${MESES[s.getUTCMonth()]} de ${s.getUTCFullYear()}`;
}
/** "14:32" no fuso de Brasília — sem depender do relógio do aparelho. */
function horaLabel() {
  const s = new Date(Date.now() - 3 * 3600 * 1000);
  return `${String(s.getUTCHours()).padStart(2, "0")}:${String(s.getUTCMinutes()).padStart(2, "0")}`;
}

function agoLabel(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

// Ícone de device-tv (não existe no Icon do painel) — registrado aqui via fallback.
