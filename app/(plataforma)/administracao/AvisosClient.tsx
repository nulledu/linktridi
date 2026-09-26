"use client";

// ── Avisos de parede ─────────────────────────────────────────────────────────
// O recado que alguém escreve aqui e que aparece na TV sem ninguém ir até ela.
//
// Mora no MESMO JSON da configuração (`/api/config`), que a TV já lê a cada
// ciclo: o aviso chega pelo caminho que existe, sem tabela nova, sem rota nova
// e sem uma requisição a mais por TV — que é a conta que já pausou este projeto
// uma vez (ver CLAUDE.md, "poll é RITMO").

import { useEffect, useRef, useState } from "react";
import type { AvisoInput } from "@/lib/config-schema";
import { TOM_DO_AVISO } from "@/lib/painel-avisos";
import type { PanelConfig } from "@/lib/types";
import { Botao, BotaoIcone, Campo, Caixa } from "../ui/controles";
import { Icon } from "../Icon";
import { Momento } from "../ui/Momento";
import { confirmar } from "../Toast";

const TONS = Object.keys(TOM_DO_AVISO) as (keyof typeof TOM_DO_AVISO)[];

function avisoNovo(): AvisoInput {
  return {
    id: `av-${Date.now().toString(36)}`,
    titulo: "",
    texto: "",
    ativo: true,
    tom: "aviso",
    de: null,
    ate: null,
    perfis: [],
    assumeTela: false,
  };
}

export function AvisosClient() {
  const [cfg, setCfg] = useState<PanelConfig | null>(null);
  const [avisos, setAvisos] = useState<AvisoInput[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const salvoRef = useRef<string>("");

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c: PanelConfig & { avisos?: AvisoInput[] | null }) => {
        setCfg(c);
        const lista = c.avisos ?? [];
        setAvisos(lista);
        salvoRef.current = JSON.stringify(lista);
      })
      .catch(() => setMsg({ t: "Não consegui ler a configuração.", ok: false }));
  }, []);

  const sujo = JSON.stringify(avisos) !== salvoRef.current;

  function trocar(i: number, muda: (a: AvisoInput) => AvisoInput) {
    setAvisos((lista) => lista.map((a, k) => (k === i ? muda(a) : a)));
  }

  async function salvar() {
    if (!cfg) return;
    setSalvando(true);
    try {
      // Manda a configuração INTEIRA de volta: o PUT valida o objeto todo, e
      // mandar só os avisos apagaria o resto.
      const corpo = JSON.stringify({ ...cfg, avisos });
      const r = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: corpo,
      });
      const d = await r.json();
      if (r.ok) {
        salvoRef.current = JSON.stringify(avisos);
        setCfg(d);
        setMsg({ t: "Avisos salvos. As TVs aplicam em até um minuto.", ok: true });
      } else {
        setMsg({
          t: d.issues
            ? `Inválido: ${d.issues[0]?.path?.join(".")} ${d.issues[0]?.message}`
            : d.detail || d.error || "Falha ao salvar.",
          ok: false,
        });
      }
    } finally {
      setSalvando(false);
    }
  }

  async function remover(i: number) {
    if (!(await confirmar("Apagar este aviso?", { detalhe: "Só sai das TVs ao salvar." }))) return;
    setAvisos((lista) => lista.filter((_, k) => k !== i));
  }

  if (!cfg) return <div style={{ color: "var(--text-dim)", padding: 24 }}>Carregando…</div>;

  const perfis = cfg.perfis ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Avisos de parede</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
            Entram no rodízio das TVs. Um aviso pode tomar a tela inteira e parar o rodízio.
          </div>
        </div>
        <Botao icone="plus" onClick={() => setAvisos((l) => [...l, avisoNovo()])}>
          Novo aviso
        </Botao>
        <Botao variante="primario" icone="check" carregando={salvando} disabled={!sujo} onClick={salvar}>
          {sujo ? "Salvar" : "Salvo"}
        </Botao>
      </div>

      {msg && (
        <div
          style={{
            fontSize: 13, fontWeight: 600, borderRadius: 12, padding: "10px 14px",
            color: msg.ok ? "var(--ok)" : "var(--perigo)",
            background: msg.ok
              ? "color-mix(in srgb, var(--ok) 12%, transparent)"
              : "color-mix(in srgb, var(--perigo) 12%, transparent)",
          }}
        >
          {msg.t}
        </div>
      )}

      {avisos.length === 0 && (
        <div className="glass" style={{ borderRadius: "var(--r-md)" }}>
          <Momento
            icone="speakerphone"
            titulo="Nenhum aviso no ar"
            texto="Escreva um recado aqui e ele aparece nas TVs — com prazo, para sumir sozinho quando não valer mais."
          />
        </div>
      )}

      {avisos.map((a, i) => {
        const tom = TOM_DO_AVISO[a.tom];
        return (
          <div
            key={a.id}
            className="glass"
            style={{
              borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12,
              minWidth: 0, opacity: a.ativo ? 1 : 0.55,
              boxShadow: `inset 3px 0 0 ${tom.cor}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Icon name={tom.icone} size={18} color={tom.cor} />
              <strong style={{ fontSize: 14, color: tom.cor }}>{tom.rotulo}</strong>
              <span style={{ flex: 1 }} />
              {/* Ligar/desligar sem apagar: o recado de sexta volta na sexta
                  seguinte, e reescrever tudo de novo é o que faz ninguém usar. */}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13, color: "var(--text-dim)", minHeight: "var(--tap)" }}>
                <Caixa marcado={a.ativo} onChange={(marc) => trocar(i, (x) => ({ ...x, ativo: marc }))} />
                No ar
              </label>
              <BotaoIcone icone="trash" titulo="Apagar aviso" onClick={() => remover(i)} />
            </div>

            <Campo label="Título (opcional)">
              <input
                className="ui-input"
                value={a.titulo}
                maxLength={60}
                placeholder="Ex.: Reunião geral"
                onChange={(e) => trocar(i, (x) => ({ ...x, titulo: e.target.value }))}
              />
            </Campo>

            <Campo label="Recado" dica={`${a.texto.length}/280 — a TV lê isto a três metros, então frase curta.`}>
              <textarea
                className="ui-input"
                value={a.texto}
                maxLength={280}
                rows={2}
                placeholder="Ex.: Reunião geral hoje às 15h no refeitório."
                onChange={(e) => trocar(i, (x) => ({ ...x, texto: e.target.value }))}
                style={{ resize: "vertical", minHeight: 62, paddingTop: 10 }}
              />
            </Campo>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12 }}>
              <Campo label="Tom">
                {/* `<div>` e não `<label>` em volta do grupo: clicar no rótulo
                    dispararia o primeiro botão e trocaria a seleção sozinho. */}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {TONS.map((t) => (
                    <Botao
                      key={t}
                      tamanho="sm"
                      variante={a.tom === t ? "primario" : "secundario"}
                      onClick={() => trocar(i, (x) => ({ ...x, tom: t }))}
                    >
                      {TOM_DO_AVISO[t].rotulo}
                    </Botao>
                  ))}
                </div>
              </Campo>

              <Campo label="Vale de" dica="vazio = já vale">
                <input
                  className="ui-input" type="date" value={a.de ?? ""}
                  onChange={(e) => trocar(i, (x) => ({ ...x, de: e.target.value || null }))}
                />
              </Campo>

              <Campo label="Vale até" dica="vazio = sem prazo (vira paisagem)">
                <input
                  className="ui-input" type="date" value={a.ate ?? ""}
                  onChange={(e) => trocar(i, (x) => ({ ...x, ate: e.target.value || null }))}
                />
              </Campo>
            </div>

            {perfis.length > 0 && (
              <Campo label="Em quais telas" dica="nenhuma marcada = todas as paredes">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {perfis.map((p) => {
                    const on = a.perfis.includes(p.id);
                    return (
                      <Botao
                        key={p.id}
                        tamanho="sm"
                        variante={on ? "primario" : "secundario"}
                        onClick={() =>
                          trocar(i, (x) => ({
                            ...x,
                            perfis: on ? x.perfis.filter((q) => q !== p.id) : [...x.perfis, p.id],
                          }))
                        }
                      >
                        {p.nome}
                      </Botao>
                    );
                  })}
                </div>
              </Campo>
            )}

            <label
              style={{
                display: "flex", alignItems: "center", gap: 10, fontSize: 13.5,
                color: "var(--text)", minHeight: "var(--tap)", cursor: "pointer",
              }}
            >
              <Caixa marcado={a.assumeTela} onChange={(marc) => trocar(i, (x) => ({ ...x, assumeTela: marc }))} />
              <span>
                <strong>Tomar a tela inteira</strong>
                <span style={{ color: "var(--text-dim)" }}>
                  {" "}— para o rodízio e mostra só este aviso enquanto valer.
                </span>
              </span>
            </label>
          </div>
        );
      })}
    </div>
  );
}
