"use client";

// Turnos — os horários da empresa cadastrados uma vez e reusados nas pessoas.
//
// A jornada NÃO é digitada: sai do horário menos o almoço. Assim mudar a saída
// de um turno não deixa a meta do banco de horas desatualizada — que era o risco
// de ter "horas por dia" solto no cadastro de cada pessoa.

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Botao, ChaveVisual } from "../ui/controles";
import { confirmar, toast } from "../Toast";

interface Turno {
  id: string; nome: string; entrada: string; saida: string;
  almocoInicio: string | null; almocoFim: string | null;
  trabalhaSabado: boolean; sabadoEntrada: string | null; sabadoSaida: string | null;
  ordem: number; ativo: boolean;
}

const minDoRelogio = (v: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec((v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};
const dur = (de: string | null | undefined, ate: string | null | undefined): number => {
  const a = minDoRelogio(de), b = minDoRelogio(ate);
  if (a == null || b == null) return 0;
  return b >= a ? b - a : (24 * 60 - a) + b;
};
const hm = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
};
const jornadaDe = (t: { entrada: string; saida: string; almocoInicio: string | null; almocoFim: string | null }) =>
  Math.max(0, dur(t.entrada, t.saida) - (t.almocoInicio && t.almocoFim ? dur(t.almocoInicio, t.almocoFim) : 0));

const VAZIO: Turno = {
  id: "", nome: "", entrada: "08:00", saida: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoEntrada: "08:00", sabadoSaida: "12:00",
  ordem: 99, ativo: true,
};

export function PontoTurnos() {
  const [turnos, setTurnos] = useState<Turno[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Turno | null>(null);

  const load = useCallback(() => {
    fetch("/api/ponto/turnos", { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (d.error) setErro(d.error); else { setTurnos(d.turnos ?? []); setErro(null); } })
      .catch(() => setErro("Sem conexão."));
  }, []);
  useEffect(() => { load(); }, [load]);

  const salvar = async (t: Turno) => {
    const r = await fetch("/api/ponto/turnos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...t, id: t.id || undefined }),
    });
    const d = await r.json();
    if (!r.ok) {
      toast.erro(d.error === "migracao_pendente" ? "Rode supabase/ponto_turnos.sql primeiro." : d.error || "Falha ao salvar.");
      return;
    }
    toast.ok("Turno salvo.");
    setEditando(null);
    load();
  };

  const desativar = async (t: Turno) => {
    const ok = await confirmar(`Desativar o turno "${t.nome}"?`, {
      detalhe: "Ele some da lista de escolha. Quem já está nele continua com o horário atual — ninguém fica sem jornada.",
    });
    if (!ok) return;
    await fetch(`/api/ponto/turnos?id=${t.id}`, { method: "DELETE" });
    toast.ok("Turno desativado.");
    load();
  };

  if (erro) {
    return (
      <div className="glass" style={{ padding: 26, borderRadius: 16, color: "var(--text-dim)", fontSize: 13.5 }}>
        Não foi possível carregar os turnos. Se a tabela ainda não existe, rode <strong>supabase/ponto_turnos.sql</strong> no Supabase.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <strong style={{ fontSize: 15, color: "var(--text)" }}>Turnos</strong>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2 }}>
            Horários prontos pra aplicar nas pessoas. A jornada é calculada do horário menos o almoço.
          </div>
        </div>
        <Botao variante="primario" icone="plus" onClick={() => setEditando({ ...VAZIO })}>Novo turno</Botao>
      </div>

      {!turnos ? (
        <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando…</div>
      ) : turnos.length === 0 ? (
        <div className="glass" style={{ padding: 26, borderRadius: 16, textAlign: "center", color: "var(--text-dim)", fontSize: 13.5 }}>
          Nenhum turno ainda. Rode <strong>supabase/ponto_turnos.sql</strong> pra criar os da empresa, ou cadastre um aqui.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {turnos.map((t) => (
            <div key={t.id} className="glass" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 13, flexWrap: "wrap" }}>
              {/* `flex-basis` no lugar de `min-width`: continua empurrando os botões
                  pra segunda linha quando não cabe, mas pode encolher abaixo de
                  200px — com min-width fixo a linha estourava a 320px. */}
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{t.nome}</div>
                {/* Horário/jornada/almoço é a informação principal do turno — 11.5px
                    era pequeno demais pra ler no celular. */}
                <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.45 }}>
                  {t.entrada}–{t.saida} · <strong>{hm(jornadaDe(t))}/dia</strong>
                  {t.almocoInicio && t.almocoFim ? ` · almoço ${t.almocoInicio}–${t.almocoFim}` : " · sem almoço"}
                  {t.trabalhaSabado && t.sabadoEntrada && t.sabadoSaida ? ` · sábado ${t.sabadoEntrada}–${t.sabadoSaida}` : " · sem sábado"}
                </div>
              </div>
              <Botao tamanho="sm" icone="edit" onClick={() => setEditando(t)}>Editar</Botao>
              <Botao tamanho="sm" variante="perigo" icone="trash" onClick={() => desativar(t)}>Desativar</Botao>
            </div>
          ))}
        </div>
      )}

      {editando && <ModalTurno turno={editando} onFechar={() => setEditando(null)} onSalvar={salvar} />}
    </div>
  );
}

function ModalTurno({ turno, onFechar, onSalvar }: { turno: Turno; onFechar: () => void; onSalvar: (t: Turno) => void }) {
  const [t, setT] = useState<Turno>(turno);
  const [comAlmoco, setComAlmoco] = useState(!!(turno.almocoInicio && turno.almocoFim));
  const set = <K extends keyof Turno>(k: K, v: Turno[K]) => setT((x) => ({ ...x, [k]: v }));

  const jornada = jornadaDe({ ...t, almocoInicio: comAlmoco ? t.almocoInicio : null, almocoFim: comAlmoco ? t.almocoFim : null });

  const enviar = () => {
    const nome = t.nome.trim() || `${t.entrada}–${t.saida}${comAlmoco ? ` · almoço ${t.almocoInicio}–${t.almocoFim}` : " · sem almoço"}`;
    onSalvar({
      ...t, nome,
      almocoInicio: comAlmoco ? t.almocoInicio : null,
      almocoFim: comAlmoco ? t.almocoFim : null,
    });
  };

  return (
    <div onClick={onFechar} className="sheet-host" style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(16,24,40,.5)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} className="glass sheet"
        style={{ width: "min(520px, 100%)", maxHeight: "88dvh", overflowY: "auto", borderRadius: 18, padding: 20, background: "var(--bg)", border: "1px solid var(--border)" }}>
        <strong style={{ fontSize: 16, color: "var(--text)" }}>{turno.id ? "Editar turno" : "Novo turno"}</strong>

        <label style={rot}>Nome
          <input value={t.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Deixe vazio pra gerar do horário" style={campo} />
        </label>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={rot}>Entra
            <input type="time" value={t.entrada} onChange={(e) => set("entrada", e.target.value)} style={{ ...campo, width: 130 }} />
          </label>
          <label style={rot}>Sai
            <input type="time" value={t.saida} onChange={(e) => set("saida", e.target.value)} style={{ ...campo, width: 130 }} />
          </label>
        </div>

        <button type="button" role="switch" aria-checked={comAlmoco} className="ui-chave-dono" onClick={() => setComAlmoco((v) => !v)} style={toggle(comAlmoco)}>
          <ChaveVisual ligado={comAlmoco} cor="var(--primary)" />
          <span>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Tem almoço</span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>
              {comAlmoco ? "O almoço é descontado da jornada e conferido na tolerância." : "Turno direto, sem intervalo."}
            </span>
          </span>
        </button>

        {comAlmoco && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={rot}>Sai pro almoço
              <input type="time" value={t.almocoInicio ?? ""} onChange={(e) => set("almocoInicio", e.target.value)} style={{ ...campo, width: 130 }} />
            </label>
            <label style={rot}>Volta
              <input type="time" value={t.almocoFim ?? ""} onChange={(e) => set("almocoFim", e.target.value)} style={{ ...campo, width: 130 }} />
            </label>
          </div>
        )}

        <button type="button" role="switch" aria-checked={t.trabalhaSabado} className="ui-chave-dono" onClick={() => set("trabalhaSabado", !t.trabalhaSabado)} style={toggle(t.trabalhaSabado)}>
          <ChaveVisual ligado={t.trabalhaSabado} cor="var(--primary)" />
          <span>
            <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Trabalha sábado</span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>No sábado ninguém almoça — conta o horário cheio.</span>
          </span>
        </button>

        {t.trabalhaSabado && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={rot}>Sábado entra
              <input type="time" value={t.sabadoEntrada ?? ""} onChange={(e) => set("sabadoEntrada", e.target.value)} style={{ ...campo, width: 130 }} />
            </label>
            <label style={rot}>Sábado sai
              <input type="time" value={t.sabadoSaida ?? ""} onChange={(e) => set("sabadoSaida", e.target.value)} style={{ ...campo, width: 130 }} />
            </label>
          </div>
        )}

        <div style={{ marginTop: 14, padding: "11px 13px", borderRadius: 12, background: "color-mix(in srgb, var(--primary) 9%, var(--surface))", border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)" }}>
          <span style={{ fontSize: 12.5, color: "var(--text)" }}>
            Jornada calculada: <strong>{hm(jornada)} por dia</strong>
            {t.trabalhaSabado ? <> · sábado <strong>{hm(dur(t.sabadoEntrada, t.sabadoSaida))}</strong></> : null}
          </span>
        </div>

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 16 }}>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={enviar}>Salvar</Botao>
        </div>
      </div>
    </div>
  );
}

const rot: React.CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginTop: 12 };
const campo: React.CSSProperties = {
  display: "block", width: "100%", marginTop: 5, padding: "10px 13px", borderRadius: 11,
  border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14,
};
const toggle = (on: boolean): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 11, marginTop: 12, padding: "10px 13px", borderRadius: 12,
  border: "1px solid var(--border)", cursor: "pointer", textAlign: "left", width: "100%",
  background: on ? "color-mix(in srgb, var(--primary) 10%, var(--surface))" : "var(--surface)",
});
