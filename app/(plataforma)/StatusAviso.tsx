"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon } from "./Icon";
import { BotaoIcone } from "./ui/controles";
import { Fila, origemDaAncora, useAbrirFechar, type OrigemFolha } from "./ui/micro";
import { useIsMobile } from "./ui/useMediaQuery";
import { usePollComRecuo } from "./ui/usePoll";
import { toast } from "./Toast";
import { Alerta } from "./ui/Alerta";

// Página de status (Gatus na VPS do gedux, status.gedux.com.br). O navegador
// lê DIRETO de lá: nenhuma invocação da Vercel, nenhum byte do Supabase. O
// Traefik só libera CORS pro Gaius (config/status.yaml na VPS).
//
// Tudo verde = este componente não desenha nada. Só aparece quando algo caiu:
// o selo vermelho ao lado do sino, que abre a lista do que está fora e o
// "Ver mais" pra página completa.
export const STATUS_URL = "https://status.gedux.com.br";
// A API do Gatus deixou de ser aberta (entregava o nome de todo funil a
// qualquer um): o selo lê a rota do Gaius, que confere a chave
// `administracao:status` e responde `{mudou:false}` quando nada mudou.
const API = "/api/status";
let assinatura = "";

interface Resultado {
  success: boolean;
  status?: number;
  timestamp?: string;
  errors?: string[];
  conditionResults?: { condition: string; success: boolean }[];
}
export interface ItemStatus { key: string; name: string; group?: string; results?: Resultado[] }
export interface Caido { key: string; nome: string; grupo: string; motivo: string; quando: string | null }

/** Traduz a falha do Gatus pra uma frase que diz O QUE aconteceu. */
export function motivoDaQueda(r?: Resultado): string {
  if (!r) return "Sem verificação ainda";
  // Erro de rede ou o texto que o coletor empurrou (Meta/AWS).
  if (r.errors?.length) return r.errors[0].slice(0, 160);
  const falhou = (r.conditionResults ?? []).filter((c) => !c.success).map((c) => c.condition);
  if (falhou.some((c) => c.includes("Este link"))) return "O funil abriu dizendo que o link não está disponível";
  if (falhou.some((c) => c.includes("indicator"))) return "A página oficial marca instabilidade grave";
  if (falhou.some((c) => c.startsWith("[STATUS]"))) return r.status ? `Respondeu com erro ${r.status}` : "Não respondeu";
  return "Falhou na última verificação";
}

/** Só quem está vermelho AGORA (último resultado). */
export function caidosDe(lista: ItemStatus[]): Caido[] {
  return lista
    .filter((i) => i.results?.length && i.results[i.results.length - 1].success === false)
    .map((i) => {
      const r = i.results![i.results!.length - 1];
      return { key: i.key, nome: i.name, grupo: i.group ?? "", motivo: motivoDaQueda(r), quando: r.timestamp ?? null };
    });
}

// O selo mora no Shell em DOIS lugares (sidebar e barra do celular), montados
// ao mesmo tempo. Uma busca só serve os dois: quem pedir de novo em menos de
// 20 s recebe a mesma resposta, e dois pedidos juntos dividem a mesma ida.
let ultimo: { em: number; caidos: Caido[] } | null = null;
let voando: Promise<Caido[] | null> | null = null;
function buscar(): Promise<Caido[] | null> {
  if (ultimo && Date.now() - ultimo.em < 20_000) return Promise.resolve(ultimo.caidos);
  if (voando) return voando;
  voando = (async () => {
    try {
      // Prazo de 15 s: resposta que nunca chega não pode prender a `voando`
      // (e com ela todo selo/aviso da aba) pra sempre.
      const ctl = new AbortController();
      const prazo = setTimeout(() => ctl.abort(), 15_000);
      const r = await fetch(assinatura ? `${API}?assinatura=${assinatura}` : API, { cache: "no-store", signal: ctl.signal })
        .finally(() => clearTimeout(prazo));
      if (!r.ok) return null;
      const d = await r.json();
      // Nada mudou desde a última leitura: o tick volta vazio e vale o que se sabia.
      if (d?.mudou === false && ultimo) { ultimo = { em: Date.now(), caidos: ultimo.caidos }; return ultimo.caidos; }
      if (d?.publico !== false || !Array.isArray(d.itens)) return null; // sem a chave: não é pra ver
      assinatura = typeof d.assinatura === "string" ? d.assinatura : "";
      const c = caidosDe(d.itens);
      ultimo = { em: Date.now(), caidos: c };
      return c;
    } catch {
      // A página de status fora do ar não é "tudo caiu": mantém o que se sabia.
      return null;
    } finally {
      voando = null;
    }
  })();
  return voando;
}
/** Só pros testes: esquece a última resposta. */
export function _zerarStatusAviso() { ultimo = null; voando = null; assinatura = ""; }

const haQuanto = (iso: string | null) => {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  return `há ${Math.floor(s / 3600)} h`;
};

/**
 * `faixa`: versão da sidebar — linha inteira abaixo da marca, com o texto
 * ("3 fora do ar"). Ao lado do sino não cabia: o selo passava por cima do
 * "GAIUS". Com o rail encolhido o texto some (`rail-oculto`) e fica o ícone.
 */
export function StatusAviso({ faixa = false }: { faixa?: boolean } = {}) {
  const [caidos, setCaidos] = useState<Caido[]>([]);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [origem, setOrigem] = useState<OrigemFolha>("top-left");
  const btnRef = useRef<HTMLButtonElement>(null);
  const assinatura = useRef("");
  const celular = useIsMobile();
  const { montado, classe } = useAbrirFechar(aberto, "--dropdown-close-dur");

  // Devolve `true` quando a lista de caídos mudou: segura o ritmo de 1 min
  // enquanto o assunto está quente; parado, recua até 5 min.
  const checar = useCallback(async () => {
    const c = await buscar();
    if (!c) return false;
    const a = c.map((x) => x.key).sort().join("|");
    const mudou = a !== assinatura.current;
    assinatura.current = a;
    setCaidos(c);
    if (c.length === 0) setAberto(false);
    return mudou;
  }, []);
  useEffect(() => { checar(); }, [checar]);
  usePollComRecuo(checar, 60_000, 300_000);

  function toggle() {
    if (!aberto && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const p = { top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 328)) };
      setPos(p);
      setOrigem(origemDaAncora(r, p));
    }
    setAberto((v) => !v);
  }

  if (caidos.length === 0 && !montado) return null;
  const n = caidos.length;
  const rotulo = n === 1 ? "1 fora do ar" : `${n} fora do ar`;

  return (
    <div style={{ position: "relative", flex: "none", width: faixa ? "100%" : undefined }}>
      <button ref={btnRef} onClick={toggle} aria-label={rotulo} aria-expanded={aberto} title={rotulo}
        style={{ height: celular ? "var(--tap)" : 38, minWidth: celular ? "var(--tap)" : 38, width: faixa ? "100%" : undefined, padding: "0 10px", borderRadius: 11,
          border: "1px solid color-mix(in srgb, var(--perigo) 45%, transparent)",
          background: "color-mix(in srgb, var(--perigo) 14%, transparent)", color: "var(--perigo)",
          display: "inline-flex", alignItems: "center", justifyContent: faixa ? "flex-start" : "center", gap: faixa ? 9 : 6,
          fontSize: faixa ? 13 : 12.5, fontWeight: 750, cursor: "pointer", boxShadow: "none" }}>
        <Icon name="alert-triangle" size={17} color="var(--perigo)" />
        {faixa
          ? <span className="rail-oculto" style={{ flex: 1, minWidth: 0, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rotulo}</span>
          : <span>{n}</span>}
      </button>

      {montado && pos && createPortal(
        <>
          <div onClick={() => setAberto(false)} style={{ position: "fixed", inset: 0, zIndex: 9998, background: celular ? "rgba(0,0,0,.45)" : "transparent",
            opacity: classe === "is-open" ? 1 : 0, pointerEvents: aberto ? undefined : "none",
            transition: `opacity var(${classe === "is-closing" ? "--dropdown-close-dur" : "--dropdown-open-dur"}) var(--dropdown-ease)` }} />
          <div role="dialog" aria-label="Fora do ar agora" className={`glass pop-solid t-dropdown ${classe}`} data-origin={origem} style={celular
            // Celular: folha presa embaixo, na altura do polegar.
            ? { position: "fixed", left: 8, right: 8, bottom: "calc(8px + var(--safe-b))", maxHeight: "min(72dvh, 560px)", display: "flex", flexDirection: "column", borderRadius: 18, border: "1px solid var(--border)", boxShadow: "0 -12px 50px rgba(0,0,0,.45)", zIndex: 9999, overflow: "hidden" }
            : { position: "fixed", top: pos.top, left: pos.left, width: 320, maxWidth: "calc(100vw - 24px)", maxHeight: "min(440px, calc(100dvh - 80px))", display: "flex", flexDirection: "column", borderRadius: 16, border: "1px solid var(--border)", boxShadow: "0 16px 50px rgba(0,0,0,.45)", zIndex: 9999, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
              <Icon name="alert-triangle" size={16} color="var(--perigo)" />
              <strong style={{ fontSize: 14, flex: 1 }}>Fora do ar agora</strong>
              {celular && (
                <BotaoIcone icone="x" titulo="Fechar" style={{ margin: "-10px -10px -10px 0" }} onClick={() => setAberto(false)} />
              )}
            </div>
            <Fila style={{ overflowY: "auto", flex: 1 }}>
              {caidos.length === 0 ? (
                <div style={{ padding: 28, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Tudo voltou ao normal.</div>
              ) : caidos.map((c) => (
                <div key={c.key} style={{ display: "flex", gap: 11, padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--perigo) 16%, transparent)" }}>
                    <Icon name="circle-x" size={15} color="var(--perigo)" />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
                      <span style={{ fontSize: 11, color: "var(--text-dim)", flex: "none" }}>{c.grupo}</span>
                    </span>
                    <span style={{ display: "block", fontSize: 12.5, color: "var(--text-dim)", marginTop: 2, overflowWrap: "anywhere" }}>{c.motivo}</span>
                    {c.quando && <span style={{ display: "block", fontSize: 11, color: "var(--text-dim)", marginTop: 3 }}>Verificado {haQuanto(c.quando)}</span>}
                  </span>
                </div>
              ))}
            </Fila>
            {/* A página de status mora no Gaius (/status); a UI do Gatus em
                status.gedux.com.br é só a reserva pra quando o Gaius cair. */}
            <Link href="/status" onClick={() => setAberto(false)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: "var(--tap)", padding: "0 14px", borderTop: "1px solid var(--border)", fontSize: 13, fontWeight: 650, color: "var(--primary-texto, var(--primary))", textDecoration: "none" }}>
              Ver mais
              <Icon name="arrow-right" size={15} color="currentColor" />
            </Link>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// ── Aviso NA TELA quando algo cai ───────────────────────────────────────────
// O selo é discreto: quem está trabalhando noutra parte da tela não repara que
// ele apareceu. Quando chega uma queda NOVA, sobe um cartão fixo no canto com o
// que caiu e o atalho pra /status — e ele fica até a pessoa dispensar. Cada
// queda avisa UMA vez: o que já foi avisado mora no localStorage, então nem
// recarregar a página nem abrir outra aba repete o aviso. A volta vira toast.
const CHAVE_AVISADOS = "gaius:status-avisados";
export type Avisado = { key: string; nome: string };
function lerAvisados(): Avisado[] {
  try { const v = JSON.parse(localStorage.getItem(CHAVE_AVISADOS) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function gravarAvisados(v: Avisado[]) {
  try { localStorage.setItem(CHAVE_AVISADOS, JSON.stringify(v)); } catch { /* modo privado: avisa de novo, sem quebrar */ }
}

/** O que caiu desde o último aviso, o que voltou, e o estado pra gravar. */
export function novidadesDeStatus(caidos: Caido[], antes: Avisado[]) {
  const novos = caidos.filter((c) => !antes.some((a) => a.key === c.key));
  const voltaram = antes.filter((a) => !caidos.some((c) => c.key === a.key));
  return { novos, voltaram, agora: caidos.map((c) => ({ key: c.key, nome: c.nome })) };
}

export function StatusAlerta() {
  const [alerta, setAlerta] = useState<Caido[]>([]);
  const celular = useIsMobile();

  const checar = useCallback(async () => {
    const c = await buscar();
    if (!c) return false;
    const { novos, voltaram, agora } = novidadesDeStatus(c, lerAvisados());
    gravarAvisados(agora);
    // O cartão mostra só o que CONTINUA caído: voltou, sai dele sozinho.
    setAlerta((a) => [...a.filter((x) => c.some((y) => y.key === x.key)), ...novos]);
    if (voltaram.length) toast(voltaram.length === 1 ? `Voltou: ${voltaram[0].nome}` : `Voltaram: ${voltaram.map((v) => v.nome).join(", ")}`, "ok");
    return novos.length > 0 || voltaram.length > 0;
  }, []);
  useEffect(() => { checar(); }, [checar]);
  usePollComRecuo(checar, 60_000, 300_000);

  if (alerta.length === 0) return null;
  const titulo = alerta.length === 1 ? `Caiu: ${alerta[0].nome}` : `${alerta.length} coisas caíram`;

  // O cartão é o `Alerta` flutuante (ui/Alerta.tsx), o mesmo desenho do toast:
  // aviso de sistema é uma peça só. Aqui ele só ganha lugar fixo — no canto no
  // computador, acima da barra de baixo no celular (altura do polegar).
  return createPortal(
    <div style={{ position: "fixed", zIndex: 1250,
      ...(celular
        ? { left: 8, right: 8, bottom: "calc(var(--tabbar-h, 64px) + var(--safe-b) + 8px)" }
        : { right: 20, bottom: 20, width: 360, maxWidth: "calc(100vw - 40px)" }) }}>
      <Alerta flutuante tom="perigo" titulo={titulo} role="alert" aria-live="assertive"
        aoFechar={() => setAlerta([])} rotuloFechar="Dispensar aviso"
        style={{ width: "100%" }}>
        <div style={{ display: "grid", gap: 6, marginTop: 4, maxHeight: "min(40dvh, 240px)", overflowY: "auto" }}>
          {alerta.slice(0, 4).map((c) => (
            <div key={c.key} style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>{c.nome}</span>
              {c.grupo && <span> · {c.grupo}</span>}
              <div>{c.motivo}</div>
            </div>
          ))}
          {alerta.length > 4 && <div>e mais {alerta.length - 4}</div>}
        </div>
        {/* Embaixo da lista, não ao lado: a 360px a ação à direita espremeria
            os motivos numa coluna estreita. */}
        <Link href="/status" onClick={() => setAlerta([])} className="ui-btn mt-anel" data-v="secundario" data-t="sm"
          style={{ marginTop: 10, textDecoration: "none" }}>
          Ver o status <Icon name="arrow-right" size={14} />
        </Link>
      </Alerta>
    </div>,
    document.body,
  );
}
