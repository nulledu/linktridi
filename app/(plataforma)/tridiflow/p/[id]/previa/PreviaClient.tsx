"use client";

// Prévia do rascunho, em tela cheia, com celular de verdade ao lado do botão.
//
// Roda em modo "publicado" de propósito: é assim que os gatilhos de tempo, o
// contador e o vídeo se comportam no ar — uma prévia que congela tudo não
// serviria pra conferir uma VSL. O que NÃO acontece aqui: evento de métrica
// (onEvento fica vazio) e envio de lead, senão a prévia sujaria os números.

import { useState } from "react";
import Link from "next/link";
import { Icon } from "../../../../Icon";
import type { PaginaDoc } from "@/lib/tridiflow-pagina";
import { ADIANTAR_TUDO, CENARIOS_PREVIA } from "@/lib/tridiflow-pagina-runtime";
import { RenderPagina } from "@/app/p/RenderPagina";
import { GlassSelect } from "../../../../GlassPicker";
import { BotaoIcone } from "../../../../ui/controles";

const LARGURA: Record<"desktop" | "mobile", number | "100%"> = { desktop: "100%", mobile: 390 };

export function PreviaClient({ id, nome, doc, publicada }: {
  id: string; nome: string; doc: PaginaDoc; publicada: boolean;
}) {
  const [viewport, setViewport] = useState<"desktop" | "mobile">("mobile");
  const [recarregar, setRecarregar] = useState(0);
  // Cenário simulado: "como abre", "5 min depois", "vídeo concluído", "mostrar
  // tudo". É faz-de-conta só aqui — não grava progresso nem dispara evento.
  const [cenario, setCenario] = useState("inicio");
  const adiantar = cenario === "tudo"
    ? ADIANTAR_TUDO
    : CENARIOS_PREVIA.find((c) => c.id === cenario)?.adiantar ?? null;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <header style={{
        flex: "none", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 10,
      }}>
        <Link href={`/tridiflow/p/${id}`} title="Voltar ao editor"
          style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 9, border: "1px solid var(--border)", textDecoration: "none" }}>
          <Icon name="chevron-left" size={17} color="var(--text-dim)" />
        </Link>

        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block", fontSize: 14, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</strong>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            Prévia do rascunho{publicada ? " · a versão no ar pode estar diferente" : " · ainda não publicada"}
          </span>
        </div>

        <span style={{ flex: 1 }} />

        {/* Ver a página como ela fica DEPOIS, sem esperar o relógio. O que
            aparece aqui é o mesmo cálculo de liberação da página no ar — só o
            tempo é adiantado. */}
        <GlassSelect
          value={cenario}
          onChange={setCenario}
          title="Ver a página em outro momento, sem esperar"
          style={{ width: "auto", minWidth: 170, minHeight: 34, fontSize: 12.5, fontWeight: 600 }}
          options={[
            ...CENARIOS_PREVIA.map((c) => ({ value: c.id, label: c.rotulo })),
            { value: "tudo", label: "Mostrar tudo" },
          ]}
        />

        {/* Reinicia os gatilhos: pra conferir "oferta aos 5 min" sem recarregar
            a página inteira e perder o lugar. */}
        <BotaoIcone icone="refresh" titulo="Reiniciar a contagem dos gatilhos" variante="secundario" tamanho="sm" onClick={() => setRecarregar((n) => n + 1)} />

        <div style={{ display: "flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--surface-2)" }}>
          {([["desktop", "device-desktop", "Computador"], ["mobile", "device-mobile", "Celular"]] as const).map(([v, ic, t]) => (
            <button key={v} onClick={() => setViewport(v)} title={t}
              style={{
                display: "grid", placeItems: "center", width: 34, height: 28, borderRadius: 8, border: "none", cursor: "pointer",
                background: viewport === v ? "var(--primary)" : "transparent",
              }}>
              <Icon name={ic} size={15} color={viewport === v ? "#fff" : "var(--text-dim)"} />
            </button>
          ))}
        </div>
      </header>

      <main style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: viewport === "mobile" ? "20px 12px 40px" : 0 }}>
        <div style={{
          marginInline: "auto",
          width: LARGURA[viewport],
          maxWidth: "100%",
          ...(viewport === "mobile" ? {
            border: "1px solid var(--border)", borderRadius: 22, overflow: "hidden",
            boxShadow: "0 18px 50px rgba(0,0,0,.18)", background: "#fff",
          } : {}),
        }}>
          <RenderPagina
            key={`${viewport}-${recarregar}`}   // trocar de aparelho ou reiniciar recomeça os gatilhos
            doc={doc}
            // Chave própria: o progresso salvo da prévia não pode se misturar
            // com o do visitante real da página publicada.
            paginaId={`previa:${id}`}
            modo="publicado"
            viewport={viewport}
            adiantar={adiantar}
            simular
          />
        </div>
      </main>
    </div>
  );
}


