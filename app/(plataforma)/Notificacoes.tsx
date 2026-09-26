"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { Botao } from "./ui/controles";
import { Digitos, Fila, origemDaAncora, useAbrirFechar, type OrigemFolha } from "./ui/micro";
import { useIsMobile } from "./ui/useMediaQuery";
import { usePollComRecuo } from "./ui/usePoll";
import { EnviarAviso } from "./EnviarAviso";

interface Notif { id: string; tipo: string; titulo: string; corpo: string | null; link: string | null; lida: boolean; de_nome: string | null; created_at: string }

const TIPO: Record<string, { icon: string; cor: string }> = {
  mensagem: { icon: "message", cor: "var(--azul)" },
  tarefa: { icon: "checklist", cor: "var(--primary-texto)" },
  lembrete: { icon: "clock", cor: "var(--atencao)" },
  solicitacao: { icon: "inbox", cor: "var(--atencao)" },
  sistema: { icon: "settings", cor: "var(--text-dim)" },
  admin: { icon: "bell", cor: "var(--roxo)" },
};
const quando = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora"; if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`; return `${Math.floor(s / 86400)}d`;
};

// `podeAvisar` = tem a chave que antes abria a aba "Notificações" da
// Administração. A ação mora AQUI porque o sino é o objeto que recebe aviso —
// mandar e receber são o mesmo assunto, e uma tela própria só pra quatro campos
// era um lugar aonde ninguém lembrava de ir.
export function Notificacoes({ podeAvisar = false }: { podeAvisar?: boolean }) {
  const [avisando, setAvisando] = useState(false);
  const [lista, setLista] = useState<Notif[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [origem, setOrigem] = useState<OrigemFolha>("top-left");
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const ultimaContagem = useRef(-1);
  const celular = useIsMobile();
  // O painel sobrevive ao `aberto: false` pelo tempo da saída. Sem isso o sino
  // fechava por corte seco — e no celular, onde ele é folha presa embaixo, a
  // folha desaparecia sem descer.
  const { montado, classe } = useAbrirFechar(aberto, "--dropdown-close-dur");

  function toggle() {
    if (!aberto && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // Abre à direita/abaixo do sininho, sempre DENTRO da tela: sem o piso de
      // 8px o `left` virava negativo abaixo de 348px e o painel nascia fora.
      const p = { top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 328)) };
      setPos(p);
      // De qual canto crescer é MEDIDO, não fixo: quando o sino está no fim da
      // barra o painel é empurrado pra esquerda e quem encosta nele passa a ser
      // o canto direito — crescer do esquerdo faria a folha vir do lugar errado.
      setOrigem(origemDaAncora(r, p));
    }
    setAberto((v) => !v);
  }

  const carregar = useCallback(async () => {
    try { const r = await fetch("/api/notificacoes", { cache: "no-store" }); const d = await r.json(); setLista(d.notificacoes ?? []); setNaoLidas(d.naoLidas ?? 0); } catch { /* */ }
  }, []);
  // Enquanto o painel está FECHADO só o número importa (`?contagem=1`, resposta de
  // ~20 bytes). A lista completa vem quando alguém abre o sino.
  // Devolve `true` quando o número mudou — o poll usa isso pra decidir se
  // mantém o ritmo curto (chegou coisa nova, deve chegar mais) ou recua.
  const contar = useCallback(async () => {
    try {
      const r = await fetch("/api/notificacoes?contagem=1", { cache: "no-store" });
      const d = await r.json();
      const n = d.naoLidas ?? 0;
      // Comparação por ref: o updater do `useState` não roda em tempo de ler o
      // resultado aqui (e roda duas vezes no StrictMode), então ele não serve
      // pra decidir "mudou".
      const mudou = ultimaContagem.current !== n;
      ultimaContagem.current = n;
      setNaoLidas(n);
      return mudou;
    } catch { return false; }
  }, []);
  useEffect(() => { contar(); }, [contar]);
  // O sino vive no Shell, ou seja, em TODA tela do sistema: era 1 invocação por
  // minuto por aba aberta, o dia inteiro, mesmo com a pessoa em outra janela.
  // Agora recua até 5min na tela parada e volta a 1min ao primeiro toque.
  usePollComRecuo(contar, 60_000, 300_000);
  useEffect(() => { if (aberto) carregar(); }, [aberto, carregar]);

  async function marcarTodas() { setNaoLidas(0); setLista((l) => l.map((n) => ({ ...n, lida: true }))); await fetch("/api/notificacoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ todas: true }) }); }
  async function abrir(n: Notif) {
    if (!n.lida) { setLista((l) => l.map((x) => x.id === n.id ? { ...x, lida: true } : x)); setNaoLidas((v) => Math.max(0, v - 1)); fetch("/api/notificacoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: n.id }) }); }
    setAberto(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div style={{ position: "relative" }}>
      <button ref={btnRef} onClick={toggle} title="Notificações" style={{ position: "relative", width: 38, height: 38, borderRadius: 11, border: "1px solid var(--border)", background: aberto ? "var(--surface-2)" : "var(--surface)", cursor: "pointer", display: "grid", placeItems: "center", boxShadow: "none" }}>
        <Icon name="bell" size={18} color="var(--text)" />
        {/* O número re-entra quando muda: chegou aviso com a pessoa olhando pra
            outra parte da tela, e um selo que troca de 2 pra 3 sem se mexer não
            é notado. Saturado ("9+") é texto, não conta — e `Digitos` só
            trabalha com número. */}
        {naoLidas > 0 && <span style={{ position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 9, background: "var(--perigo)", color: "#fff", fontSize: 10.5, fontWeight: 800, display: "grid", placeItems: "center" }}>{naoLidas > 9 ? "9+" : <Digitos valor={naoLidas} />}</span>}
      </button>

      {montado && pos && createPortal(
        <>
          {/* O véu acompanha a folha nos dois sentidos e para de receber clique
              enquanto ela sai — senão o primeiro toque depois de fechar era
              engolido por um retângulo invisível de tela inteira. */}
          <div onClick={() => setAberto(false)} style={{ position: "fixed", inset: 0, zIndex: 9998, background: celular ? "rgba(0,0,0,.45)" : "transparent",
            opacity: classe === "is-open" ? 1 : 0, pointerEvents: aberto ? undefined : "none",
            transition: `opacity var(${classe === "is-closing" ? "--dropdown-close-dur" : "--dropdown-open-dur"}) var(--dropdown-ease)` }} />
          <div className={`glass pop-solid t-dropdown ${classe}`} data-origin={origem} style={celular
            // No celular vira folha presa embaixo: cabe sempre e fica na altura
            // do polegar, em vez de um cartão ancorado que sai pela direita.
            ? { position: "fixed", left: 8, right: 8, bottom: "calc(8px + var(--safe-b))", maxHeight: "min(72dvh, 560px)", display: "flex", flexDirection: "column", borderRadius: 18, border: "1px solid var(--border)", boxShadow: "0 -12px 50px rgba(0,0,0,.45)", zIndex: 9999, overflow: "hidden" }
            : { position: "fixed", top: pos.top, left: pos.left, width: 320, maxWidth: "calc(100vw - 24px)", maxHeight: "min(440px, calc(100dvh - 80px))", display: "flex", flexDirection: "column", borderRadius: 16, border: "1px solid var(--border)", boxShadow: "0 16px 50px rgba(0,0,0,.45)", zIndex: 9999, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <strong style={{ fontSize: 14, flex: 1 }}>Notificações</strong>
            {naoLidas > 0 && <Botao variante="sutil" tamanho="sm" onClick={marcarTodas}>Marcar lidas</Botao>}
          </div>
          {/* Escalonada: "chegaram cinco avisos" em vez de "cinco avisos já
              estavam aqui". O atraso satura no teto da fundação. */}
          <Fila style={{ overflowY: "auto", flex: 1 }}>
            {lista.length === 0 ? (
              <div style={{ padding: 28, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Nenhuma notificação.</div>
            ) : lista.map((n) => {
              const t = TIPO[n.tipo] ?? TIPO.sistema;
              return (
                <button key={n.id} onClick={() => abrir(n)} style={{ width: "100%", textAlign: "left", display: "flex", gap: 11, padding: "11px 14px", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", boxShadow: "none", background: n.lida ? "transparent" : "color-mix(in srgb, var(--primary) 7%, transparent)" }}>
                  <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${t.cor} 16%, transparent)` }}><Icon name={t.icon} size={15} color={t.cor} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.titulo}</span>
                      <span style={{ fontSize: 11, color: "var(--text-dim)", flex: "none" }}>{quando(n.created_at)}</span>
                    </span>
                    {n.corpo && <span style={{ display: "block", fontSize: 12.5, color: "var(--text-dim)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.corpo}</span>}
                  </span>
                  {!n.lida && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--primary)", flex: "none", marginTop: 5 }} />}
                </button>
              );
            })}
          </Fila>
          {podeAvisar && (
            <button onClick={() => { setAberto(false); setAvisando(true); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: "var(--tap)", padding: "12px 14px", border: "none", borderTop: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name="send" size={15} color="var(--primary-texto, var(--primary))" /> Enviar aviso
            </button>
          )}
        </div>
        </>,
        document.body
      )}

      {avisando && <EnviarAviso onFechar={() => setAvisando(false)} />}
    </div>
  );
}
