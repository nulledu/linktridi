// Logs de atividades — feed do que aconteceu no workspace (bots editados/
// publicados + leads capturados/concluídos), derivado dos dados reais.
// As linhas chegam como registros de um diário: escalonadas, de cima pra baixo
// (Kinetics 054/096) — só CSS, então o componente continua sendo do servidor.
import "../_shared/config-micro.css";
import { Icon } from "../../Icon";
import { atividadeRecente, type AtividadeItem } from "@/lib/tridiflow-db";

const ESTILO: Record<AtividadeItem["tipo"], { icone: string; cor: string; texto: (n: string) => string }> = {
  editado: { icone: "edit", cor: "var(--primary-texto)", texto: (n) => `Bot “${n}” foi editado` },
  publicado: { icone: "rocket", cor: "var(--ok)", texto: (n) => `Bot “${n}” está publicado` },
  lead: { icone: "user-check", cor: "var(--azul, #0084FF)", texto: (n) => `Novo lead capturado em “${n}”` },
  concluido: { icone: "circle-check", cor: "var(--ok)", texto: (n) => `Funil concluído em “${n}”` },
};

function tempoRel(ts: string): string {
  const d = new Date(ts).getTime();
  if (Number.isNaN(d)) return "";
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return "agora há pouco";
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `há ${h} h`;
  const dias = Math.floor(h / 24); if (dias < 30) return `há ${dias} dia${dias > 1 ? "s" : ""}`;
  return new Date(ts).toLocaleDateString("pt-BR");
}

export async function LogsAtividades() {
  const itens = await atividadeRecente(60).catch(() => [] as AtividadeItem[]);
  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Logs de atividades</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>O que aconteceu por aqui — edições, publicações e leads.</p>
      </div>

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "6px 18px" }}>
        {itens.length === 0 ? (
          <div style={{ padding: "34px 0", textAlign: "center", color: "var(--text-dim)" }}>
            <Icon name="history" size={30} color="var(--text-dim)" />
            <p style={{ fontSize: 13, marginTop: 8 }}>Nenhuma atividade ainda. Crie ou edite um bot pra começar.</p>
          </div>
        ) : (
          <div className="tfm-fila">
            {itens.map((it, i) => {
              const e = ESTILO[it.tipo];
              return (
                <div key={i} style={{ ["--i" as string]: Math.min(i, 12), display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${e.cor} 14%, transparent)` }}>
                    <Icon name={e.icone} size={17} color={e.cor} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.texto(it.botNome)}</span>
                  <time dateTime={it.ts} style={{ flex: "none", fontSize: 12, color: "var(--text-dim)" }}>{tempoRel(it.ts)}</time>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
