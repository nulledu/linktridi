"use client";

// ── Tridify · pra onde este anúncio manda ───────────────────────────────────
//
// A tabela dizia quanto o anúncio gastou e quanto trouxe, mas não PRA ONDE ele
// manda — e é isso que decide se o criativo que está performando aponta pro
// funil certo ou ficou no link velho.
//
// São duas respostas porque elas discordam com frequência, e a divergência é o
// achado:
//   DECLARADO — o destino configurado no criativo (lib/meta-link.ts).
//   OBSERVADO — onde as pessoas caíram de verdade, das nossas sessões do
//               TridiFlow (`utm_content` do Meta = ad id), com sessões, leads e
//               VENDAS do anúncio. É a única resposta quando a Meta não expõe o
//               link — anúncio nascido de post do Instagram devolve só o id do
//               post, e ler o post pede permissão que a conta não tem.
//
// Mora aqui, e não dentro de uma das telas, porque a gaveta de detalhes e o
// modal do criativo mostram a MESMA coisa em dois tamanhos: duas cópias
// divergiriam na primeira correção feita só de um lado.
import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Alerta } from "../ui/Alerta";
import { toast } from "../Toast";
import { fmtNum } from "@/lib/format";
import { Botao, BotaoIcone } from "../ui/controles";

interface Declarado { url: string | null; base: string | null; host: string | null; utm: Record<string, string>; origem: string | null; instagram: string | null }
interface ProjetoObs { botId: string; nome: string; url: string | null; sessoes: number; leads: number; vendas: number; receita: number }
interface LinkResp { declarado: Declarado | null; observado: { resumo: { sessoes: number; leads: number; vendas: number; receita: number } | null; projetos: ProjetoObs[] }; error?: string }

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");

/** Endereço comparável: sem UTM e sem barra final. Sem isso todo link com
 *  `utm_content` pareceria divergir do destino do criativo. */
const limpo = (u: string | null | undefined) => (u || "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

function useLinkDoAnuncio(adId: string) {
  const [d, setD] = useState<LinkResp | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setD(null); setErro(false);
    fetch(`/api/trafego/ad-link?adId=${encodeURIComponent(adId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((x) => { if (!vivo) return; if (x.error) setErro(true); else setD(x); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [adId]);

  const declarado = d?.declarado ?? null;
  const projetos = d?.observado?.projetos ?? [];
  return {
    d, erro, declarado, projetos,
    resumo: d?.observado?.resumo ?? null,
    // O destino observado só é "outro" quando de fato aponta pra outro lugar.
    divergente: !!declarado?.base && projetos.length > 0 && !projetos.some((p) => limpo(p.url) === limpo(declarado.base)),
    // O melhor endereço que temos: o do criativo, senão o que as pessoas abriram.
    melhor: declarado?.base || projetos[0]?.url || null,
    melhorCompleto: declarado?.url || projetos[0]?.url || null,
  };
}

const copiar = (url: string) => { navigator.clipboard?.writeText(url); toast.ok("Link copiado."); };

const btnMini: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
  minHeight: "var(--tap, 44px)", padding: "8px 13px", borderRadius: 10,
  border: "1px solid var(--tf-line, var(--border))", background: "var(--surface)", color: "var(--text)",
  fontSize: 12.5, fontWeight: 700, cursor: "pointer",
};

/** Bloco completo — gaveta de detalhes do anúncio. */
export function LinkDeVenda({ adId }: { adId: string }) {
  const { d, erro, declarado, projetos, resumo, divergente } = useLinkDoAnuncio(adId);

  return (
    <div>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".04em" }}>Link de venda</div>

      {!d && !erro && <div className="tf-panel" style={{ padding: "12px 13px", fontSize: 12.5, color: "var(--text-dim)" }}>Lendo o criativo na Meta…</div>}
      {erro && <Alerta tom="perigo">Não deu pra ler o destino deste anúncio agora.</Alerta>}

      {d && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="tf-panel" style={{ padding: "12px 13px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "var(--text-dim)", marginBottom: 6 }}>
              <Icon name="link" size={13} color="var(--text-dim)" /> DESTINO DO CRIATIVO
            </div>
            {declarado?.url ? (
              <>
                <div style={{ fontSize: 12.5, color: "var(--text)", wordBreak: "break-all", fontFamily: "ui-monospace, Menlo, monospace", lineHeight: 1.5 }}>{declarado.base}</div>
                {Object.keys(declarado.utm).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                    {Object.entries(declarado.utm).map(([k, val]) => (
                      <span key={k} title={`${k}=${val}`} style={{ maxWidth: "100%", padding: "3px 8px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--tf-line, var(--border))", fontSize: 10.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {k.replace(/^utm_/, "")}: {val}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
                  <Botao variante="secundario" icone="copy" onClick={() => copiar(declarado.url as string)}>Copiar</Botao>
                  <a href={declarado.url} target="_blank" rel="noreferrer" className="ui-toque" style={{ ...btnMini, textDecoration: "none" }}>
                    <Icon name="external-link" size={13} color="var(--text-dim)" /> Abrir
                  </a>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
                A Meta não expõe o destino deste criativo — costuma ser anúncio feito a partir de um post do Instagram.
                {declarado?.instagram && <> <a href={declarado.instagram} target="_blank" rel="noreferrer" style={{ color: "var(--primary-texto, var(--primary))", fontWeight: 700 }}>Ver o post</a>.</>}
                {projetos.length > 0 && " Abaixo está pra onde as pessoas caíram de verdade."}
              </div>
            )}
          </div>

          {projetos.length > 0 && (
            <div className="tf-panel" style={{ padding: "12px 13px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, color: "var(--text-dim)", marginBottom: 8 }}>
                <Icon name="target-arrow" size={13} color="var(--text-dim)" /> ONDE AS PESSOAS CAÍRAM
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {projetos.map((p) => (
                  <div key={p.botId}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", wordBreak: "break-word" }}>{p.nome}</div>
                    {p.url && <div style={{ fontSize: 11, color: "var(--text-dim)", wordBreak: "break-all", fontFamily: "ui-monospace, Menlo, monospace", marginTop: 1 }}>{p.url}</div>}
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 5, fontSize: 11.5, color: "var(--text-dim)" }}>
                      <span>{fmtNum(p.sessoes)} visita(s)</span>
                      <span>{fmtNum(p.leads)} lead(s)</span>
                      <span style={{ fontWeight: 800, color: p.vendas ? "var(--ok)" : "var(--text-dim)" }}>{fmtNum(p.vendas)} venda(s)</span>
                      {p.receita > 0 && <span style={{ fontWeight: 700, color: "var(--ok)" }}>{brl(p.receita)}</span>}
                    </div>
                  </div>
                ))}
              </div>
              {resumo && resumo.sessoes > 0 && (
                <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--tf-line-soft, var(--border))", fontSize: 11.5, color: "var(--text-dim)" }}>
                  Vendas ligadas ao contato deixado no funil (últimos 30 dias) — não é a conversão do pixel.
                </div>
              )}
            </div>
          )}

          {divergente && <AvisoDivergente />}

          {!declarado?.url && projetos.length === 0 && (
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
              Sem destino no criativo e sem visita registrada nos nossos funis — o anúncio pode mandar pra fora do TridiFlow (loja, WhatsApp) ou não ter rodado no período.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
function AvisoDivergente() {
  return (
    <Alerta tom="atencao">
      O criativo aponta pra um endereço e as visitas chegaram em outro. Confira se o link do anúncio foi trocado ou se há redirecionamento no caminho.
    </Alerta>
  );
}

/**
 * Uma linha só — rodapé do modal de criativo, onde a altura é apertada
 * (o modal tem teto de 90dvh e todos os blocos são `flex: none`).
 */
export function LinkDeVendaLinha({ adId }: { adId: string }) {
  const { d, erro, declarado, projetos, melhor, melhorCompleto, divergente } = useLinkDoAnuncio(adId);
  if (erro) return null;

  const vendas = projetos.reduce((s, p) => s + p.vendas, 0);
  const rotulo = declarado?.url ? "Leva para" : projetos.length ? "As visitas caíram em" : "Destino";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 16px 13px", flexWrap: "wrap", fontSize: 11.5, minWidth: 0 }}>
      <Icon name="link" size={13} color="var(--text-dim)" />
      <span style={{ color: "var(--text-dim)", fontWeight: 700, flex: "none" }}>{rotulo}:</span>
      {!d ? (
        <span style={{ color: "var(--text-dim)" }}>lendo…</span>
      ) : melhor ? (
        <>
          <span title={melhorCompleto ?? undefined} style={{ flex: "1 1 160px", minWidth: 0, color: "var(--text)", fontFamily: "ui-monospace, Menlo, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {melhor.replace(/^https?:\/\//, "")}
          </span>
          {vendas > 0 && <span style={{ flex: "none", fontWeight: 800, color: "var(--ok)" }}>{vendas} venda(s)</span>}
          {divergente && <Icon name="alert-triangle" size={13} color="var(--atencao)" />}
          {melhorCompleto && (
            <BotaoIcone icone="copy" titulo="Copiar link" variante="secundario" onClick={() => copiar(melhorCompleto)} style={{ flex: "none" }} />
          )}
        </>
      ) : (
        <span style={{ color: "var(--text-dim)" }}>a Meta não expõe o link deste criativo.</span>
      )}
    </div>
  );
}
