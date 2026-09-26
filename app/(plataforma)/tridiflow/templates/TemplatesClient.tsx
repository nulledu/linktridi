"use client";

// Biblioteca de Templates — os TRÊS tipos de projeto num só lugar, com busca,
// cards com mini-fluxo e métricas reais.
//
// Antes esta tela listava só `FUNIL_TEMPLATES`: dois itens, os dois de chat. Os
// 5 de página só apareciam no modal "o que você deseja criar?" e os 4 de quiz
// em lugar nenhum. A porta de entrada do produto mostrava 2 de 11.
//
// As abas agora são por TIPO e não pela categoria antiga ("Vendas",
// "Atendimento"): a primeira pergunta de quem chega aqui é "o que eu vou
// montar?", e só depois "pra quê".
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import {
  ICONE_TIPO, ROTULO_TIPO, ROTULO_TIPO_PLURAL, catalogoCompleto, editorDoTipo, filtrarCatalogo,
  type ItemCatalogo,
} from "@/lib/tridiflow-catalogo";
import type { TipoProjeto } from "@/lib/tridiflow-db";
import { Botao } from "../../ui/controles";
import { importarArquivo } from "../_shared/transfer-cliente";

const DICAS = [
  { icone: "target-arrow", titulo: "Defina seu objetivo", texto: "Saber o que você quer alcançar é o primeiro passo." },
  { icone: "users", titulo: "Conheça sua audiência", texto: "Entenda a necessidade e o momento do seu público." },
  { icone: "rocket", titulo: "Comece simples", texto: "Templates prontos são fáceis de personalizar e testar." },
  { icone: "chart-line", titulo: "Meça e otimize", texto: "Acompanhe os resultados e melhore sua jornada." },
];

const TIPOS: TipoProjeto[] = ["flow", "quiz", "page"];

export function TemplatesClient() {
  const [tipo, setTipo] = useState<TipoProjeto | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState(false);
  // `catalogoCompleto` monta os documentos das páginas — uma vez só, não a
  // cada tecla digitada na busca.
  const catalogo = useMemo(() => catalogoCompleto(), []);
  // Aba escolhida sempre à vista quando a fileira rola de lado.
  const abasRef = useRef<HTMLDivElement>(null);
  // Importar: o botão só abre o seletor de arquivo — a validação e a criação
  // moram em transfer-cliente/lib. O input zera o value ao final pra deixar
  // importar o MESMO arquivo duas vezes (útil pra clonar um modelo).
  const arquivoRef = useRef<HTMLInputElement>(null);
  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const r = await importarArquivo(f);
      if (r) window.location.href = editorDoTipo(r.tipo, r.id);
    } finally { setBusy(false); }
  }
  useEffect(() => {
    abasRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [tipo]);

  /** Cria o projeto e abre no editor DAQUELE tipo. Mandar todo mundo pro editor
   *  de chat era o que acontecia antes: um template de página abria num canvas
   *  de grafo vazio. */
  async function usar(item?: ItemCatalogo) {
    setBusy(true);
    try {
      const body = item ? { tipo: item.tipo, template: item.templateId } : { nome: "Novo bot", tipo: "flow" };
      const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { toast.erro(d.error || "Falha ao criar."); return; }
      window.location.href = editorDoTipo(item?.tipo ?? "flow", d.bot.id);
    } finally { setBusy(false); }
  }

  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of catalogo) m.set(t.tipo, (m.get(t.tipo) ?? 0) + 1);
    return m;
  }, [catalogo]);
  const filtrados = useMemo(() => filtrarCatalogo(catalogo, tipo, busca), [catalogo, tipo, busca]);

  return (
    <div style={{ maxWidth: 1240 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Biblioteca de Templates</h1>
          <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>Escolha um template pronto e personalize para acelerar seus resultados.</p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input ref={arquivoRef} type="file" accept=".json,application/json" onChange={importar} style={{ display: "none" }} aria-hidden />
          <Botao icone="upload" onClick={() => arquivoRef.current?.click()} disabled={busy}
            title="Arquivo .tridiflow.json exportado de outro projeto (menu Mais → Exportar arquivo)">
            Importar template
          </Botao>
          <Botao variante="primario" icone="plus" onClick={() => usar()} disabled={busy}>
            Criar do zero
          </Botao>
        </div>
      </div>

      {/* Abas de categoria — rolam de lado quando não cabem (.tab-strip) */}
      <div ref={abasRef} className="tab-strip" style={{ display: "flex", gap: 8, marginBottom: 16, padding: 0, width: "100%" }}>
        <Aba label="Todos os templates" n={catalogo.length} ativo={tipo === "todos"} onClick={() => setTipo("todos")} />
        {TIPOS.map((t) => (
          <Aba key={t} label={ROTULO_TIPO_PLURAL[t]} icone={ICONE_TIPO[t]} n={contagem.get(t) ?? 0}
            ativo={tipo === t} onClick={() => setTipo(t)} />
        ))}
      </div>

      {/* flexWrap: a coluna de dicas (260px) vira linha cheia abaixo de 760px,
          onde a fundação já a manda ocupar 100%. */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Busca */}
          <div style={{ position: "relative", maxWidth: 380, marginBottom: 16 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }}><Icon name="search" size={15} color="var(--text-dim)" /></span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar template…"
              style={{ width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 11, padding: "11px 12px 11px 36px", color: "var(--text)", fontSize: 13.5, outline: "none" }} />
          </div>

          {/* Cards */}
          {filtrados.length === 0 ? (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 40, textAlign: "center", color: "var(--text-dim)" }}>Nenhum template com esse filtro.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 16 }}>
              {filtrados.map((t) => <CardTemplate key={t.chave} t={t} busy={busy} onUsar={() => usar(t)} />)}
            </div>
          )}
        </div>

        {/* Dicas */}
        <aside style={{ width: 260, flex: "none", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text)", marginBottom: 12 }}>Dicas para escolher o template ideal</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {DICAS.map((d) => (
              <div key={d.titulo} style={{ display: "flex", gap: 11 }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
                  <Icon name={d.icone} size={16} color="var(--primary-texto)" />
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{d.titulo}</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4, marginTop: 1 }}>{d.texto}</div>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Aba({ label, n, ativo, onClick, icone }: { label: string; n: number; ativo: boolean; onClick: () => void; icone?: string }) {
  return (
    <button onClick={onClick} aria-current={ativo ? "page" : undefined} style={{
      display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px", minHeight: "var(--tap, 44px)", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
      border: `1px solid ${ativo ? "transparent" : "var(--border)"}`, background: ativo ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: ativo ? "var(--on-primary, #fff)" : "var(--text)",
    }}>
      {icone && <Icon name={icone} size={15} color={ativo ? "#fff" : "var(--text-dim)"} />}
      {label}
      <span style={{ fontSize: 11, fontWeight: 800, padding: "1px 7px", borderRadius: 999, background: ativo ? "rgba(255,255,255,.25)" : "var(--surface-2)", color: ativo ? "#fff" : "var(--text-dim)" }}>{n}</span>
    </button>
  );
}

export function CardTemplate({ t, busy, onUsar }: { t: ItemCatalogo; busy: boolean; onUsar: () => void }) {
  const passos = t.passos.slice(0, 4);
  const restantes = t.passos.length - passos.length;
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 12, height: "100%", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ width: 42, height: 42, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
          <Icon name={t.icone} size={22} color="var(--primary-texto)" />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{t.nome}</span>
            {/* O TIPO vem primeiro: com os três catálogos juntos, saber se
                aquilo é um chat, um quiz ou uma página é o que separa um card
                do outro. A categoria antiga (só o de chat tem) fica ao lado. */}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary-texto, var(--primary))", whiteSpace: "nowrap" }}>
              <Icon name={ICONE_TIPO[t.tipo]} size={11} color="var(--primary-texto)" /> {ROTULO_TIPO[t.tipo]}
            </span>
            {t.categoria && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "var(--surface-2)", color: "var(--text-dim)", whiteSpace: "nowrap" }}>{t.categoria}</span>
            )}
          </div>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45, margin: "5px 0 0", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 54 }}>{t.descricao}</p>
        </div>
      </div>

      {/* Mini-fluxo (etapas) — uma linha só, alinhando as métricas entre os cards */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", overflow: "hidden", padding: "10px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        {passos.map((p, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {i > 0 && <Icon name="chevron-right" size={13} color="var(--text-dim)" />}
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", background: "var(--surface-2)", borderRadius: 8, padding: "4px 9px", whiteSpace: "nowrap", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{p}</span>
          </span>
        ))}
        {restantes > 0 && <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700 }}>+{restantes}</span>}
      </div>

      {/* Métricas reais — cada tipo mede o que faz sentido pra ele: fluxo conta
          blocos e variáveis, quiz conta perguntas e tags, página conta seções. */}
      <div style={{ display: "flex", gap: 20 }}>
        {t.metricas.map((m) => <Metric key={m.label} label={m.label} valor={String(m.valor)} />)}
      </div>

      <Botao bloco onClick={onUsar} disabled={busy} style={{ marginTop: "auto" }}>
        Usar template
      </Botao>
    </div>
  );
}
function Metric({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: "var(--text-dim)", fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{valor}</div>
    </div>
  );
}
