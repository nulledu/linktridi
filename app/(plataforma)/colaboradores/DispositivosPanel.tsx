"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import { GlassSelect } from "../GlassPicker";
import { confirmar } from "../Toast";
import { Momento } from "../ui/Momento";

interface Device { id: string; nome_mesa: string | null; setor: string | null; ativo: boolean; last_sync: string | null; created_at: string; tipo?: string; categorias?: string[] | null }
interface Code { code: string; nome_mesa: string | null; setor: string | null; expires_at: string; tipo?: string; device_id?: string | null; categorias?: string[] | null }

// Bancada do tablet: que ordens ele recebe. Vazio = todas (comportamento antigo).
// Clichê e Carimbo são a mesma bancada.
const BANCADAS = [
  { key: "", label: "Todas" },
  { key: "Chancela", label: "Chancela" },
  { key: "Carimbo", label: "Carimbo / Clichê" },
] as const;
const bancadaDe = (c?: string[] | null) => (c && c.length ? c[0] : "");

// Gestão dos tablets de produção: gera código de liberação (provisionamento),
// lista dispositivos ativos e permite desativar. Admin.
export function DispositivosPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [codes, setCodes] = useState<Code[]>([]);
  const [tipo, setTipo] = useState<"producao" | "ponto">("producao");
  const [nomeMesa, setNomeMesa] = useState("Produção - Mesa 1");
  const [setor, setSetor] = useState("Produção");
  const [bancada, setBancada] = useState<string>("");
  const [gerado, setGerado] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function load() {
    const r = await fetch("/api/devices", { cache: "no-store" });
    const d = await r.json();
    setDevices(d.devices ?? []); setCodes(d.codes ?? []);
  }
  useEffect(() => { load(); }, []);

  async function gerar() {
    setBusy(true); setGerado(null);
    try {
      const nome = tipo === "ponto" ? (nomeMesa.trim() || "Ponto") : nomeMesa;
      const r = await fetch("/api/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome_mesa: nome, setor: tipo === "ponto" ? null : setor, tipo, categorias: tipo === "producao" && bancada ? [bancada] : null }) });
      const d = await r.json();
      if (r.ok && d.code) { setGerado(d.code); load(); }
    } finally { setBusy(false); }
  }
  // Define a bancada de um tablet já pareado (que ordens ele recebe).
  async function definirBancada(id: string, valor: string) {
    setErro(null);
    const r = await fetch("/api/devices", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, categorias: valor ? [valor] : null }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(d?.error === "sql_pendente" ? "Rode o supabase/devices_categorias.sql primeiro." : "Não consegui salvar a bancada."); return; }
    load();
  }
  async function desativar(id: string) {
    if (!(await confirmar("Desativar este dispositivo?", { detalhe: "Ele precisará ser liberado de novo.", perigo: true }))) return;
    setErro(null);
    const r = await fetch(`/api/devices?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setErro("Não consegui desativar o tablet. Ele continua ativo — tente de novo.");
    load();
  }

  const inp: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 12px", color: "var(--text)", fontSize: 14 };

  return (
    <div className="glass glass-spec" style={{ padding: 22, borderRadius: "var(--r-md)" }}>
      <h2 style={{ fontSize: 18, fontWeight: 800 }}>Tablets</h2>
      <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 3, marginBottom: 14 }}>Gere um código de 6 dígitos e digite-o no app do tablet para liberá-lo (uma vez). Escolha o que o tablet é: mesa de <strong>produção</strong> ou o de <strong>bater ponto</strong>.</p>

      {/* Os dois botões somam ~300px: sem wrap, o segundo era cortado em 320px. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {([["producao", "Produção (mesa)", "device-mobile"], ["ponto", "Bater ponto", "clock"]] as const).map(([k, label, ic]) => (
          <button key={k} onClick={() => { setTipo(k); if (k === "ponto" && nomeMesa.startsWith("Produção")) setNomeMesa("Ponto"); }} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: "var(--r-sm)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${tipo === k ? "var(--primary)" : "var(--border)"}`, background: tipo === k ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)", color: tipo === k ? "var(--primary-texto)" : "var(--text)" }}>
            <Icon name={ic} size={16} color={tipo === k ? "var(--primary-texto)" : "var(--text-dim)"} /> {label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "block" }}><span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>{tipo === "ponto" ? "Nome do tablet" : "Nome da mesa"}</span>
          <div style={{ marginTop: 5 }}><input value={nomeMesa} onChange={(e) => setNomeMesa(e.target.value)} style={inp} /></div></label>
        {tipo === "producao" && (
          <>
            <label style={{ display: "block" }}><span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>Setor</span>
              <div style={{ marginTop: 5 }}><input value={setor} onChange={(e) => setSetor(e.target.value)} style={{ ...inp, width: 140 }} /></div></label>
            <label style={{ display: "block" }}><span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>Bancada (que ordens recebe)</span>
              <div style={{ marginTop: 5 }}>
                <GlassSelect value={bancada} onChange={setBancada} style={{ ...inp, width: 170 }}
                  options={BANCADAS.map((b) => ({ value: b.key, label: b.label }))} />
              </div></label>
          </>
        )}
        <Botao variante="primario" onClick={gerar} carregando={busy}>Gerar código</Botao>
      </div>
      {tipo === "ponto" && <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginTop: 10 }}>O tablet de ponto mostra todo mundo que tem cadastro no ponto — não precisa marcar pessoa por pessoa.</p>}

      {/* Código em 40px + letterSpacing 6 já ocupa a linha inteira do celular:
          a explicação desce em vez de disputar espaço com ele. */}
      {gerado && (
        <div className="glass" style={{ marginTop: 16, padding: "16px 20px", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>Código do tablet (não expira)</div>
            <div className="stat" style={{ fontSize: "clamp(30px, 9vw, 40px)", letterSpacing: 6, color: "var(--primary-texto, var(--primary))" }}>{gerado}</div>
          </div>
          <div style={{ flex: "1 1 200px", fontSize: 13, color: "var(--text-dim)" }}>Digite no tablet → &quot;Liberar tablet&quot;.<br />Guarde: o mesmo código re-conecta este tablet quando precisar.</div>
        </div>
      )}

      {codes.length > 0 && (() => {
        // Os códigos vinham numa lista só, e 7 dos 12 diziam "em uso — digite de
        // novo pra re-conectar". Quem abre esta tela quase sempre quer LIBERAR
        // um tablet novo, e pra isso precisa de um código que ninguém usou —
        // que estava espalhado no meio dos usados. Mesmo padrão do "aguardando
        // 1º acesso" na aba Equipe: o que exige ação vem primeiro, e o resto
        // continua acessível sem ocupar a vista.
        const livres = codes.filter((c) => !c.device_id);
        const usados = codes.filter((c) => c.device_id);
        const Linha = ({ c, livre }: { c: (typeof codes)[number]; livre: boolean }) => (
          <div key={c.code} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, padding: "6px 0", flexWrap: "wrap" }}>
            <strong style={{ letterSpacing: 2, color: livre ? "var(--primary-texto, var(--primary))" : "var(--text-dim)", flex: "none" }}>{c.code}</strong>
            <span style={{ color: "var(--text-dim)" }}>{c.nome_mesa || "—"} · {c.setor || "todos"}</span>
          </div>
        );
        return (
          <div style={{ marginTop: 16 }}>
            {livres.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 6 }}>
                  Prontos pra usar · {livres.length}
                </div>
                {livres.map((c) => <Linha key={c.code} c={c} livre />)}
              </>
            )}
            {usados.length > 0 && (
              // Recolhido: o código de um tablet que JÁ está conectado só
              // interessa no dia em que ele precisar reconectar. Fica a um
              // clique, e não ocupando dois terços da tela até lá.
              <details style={{ marginTop: livres.length ? 14 : 0 }}>
                <summary style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", cursor: "pointer", minHeight: "var(--tap)", display: "flex", alignItems: "center" }}>
                  Já em uso · {usados.length}
                </summary>
                <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "2px 0 8px" }}>
                  Digitar de novo reconecta o mesmo tablet — o código não expira.
                </p>
                {usados.map((c) => <Linha key={c.code} c={c} livre={false} />)}
              </details>
            )}
          </div>
        );
      })()}

      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 8 }}>Dispositivos ({devices.filter((d) => d.ativo).length} ativos)</div>
        {erro && <p style={{ color: "var(--perigo)", fontSize: 12.5, marginBottom: 8 }}>{erro}</p>}
        <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginTop: -2, marginBottom: 10 }}>
          A <strong>bancada</strong> decide que ordens caem em cada tablet: marque <strong>Chancela</strong> num e <strong>Carimbo / Clichê</strong> no outro pra não misturar. <strong>Todas</strong> = recebe tudo.
        </p>
        {devices.length === 0 && (
          <Momento
            compacto
            icone="device-tv"
            titulo="Nenhum tablet liberado"
            texto="Gere um código acima e digite no app do tablet. Ele fica liberado pra sempre — o mesmo código reconecta depois."
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {devices.map((d) => (
            // Nome + bancada + "desativar" não cabem numa linha de 320px:
            // com wrap, o seletor e a ação descem em vez de vazar pra fora.
            <div key={d.id} className="glass" style={{ padding: "11px 14px", borderRadius: "var(--r-sm)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", opacity: d.ativo ? 1 : 0.5 }}>
              <Icon name={d.tipo === "ponto" ? "clock" : "device-tv"} size={18} color={d.ativo ? "var(--primary-texto)" : "var(--text-dim)"} />
              <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                {/* `flex-wrap` no nome: a etiqueta "Produção" empurrava o nome
                    e ele quebrava no meio ("Mesa / Chancela") mesmo sobrando
                    espaço na linha. Deixar a ETIQUETA descer preserva o nome
                    inteiro, que é o que identifica o tablet. */}
                <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  {d.nome_mesa || "Tablet"}
                  <span style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 999, padding: "1px 8px", color: d.tipo === "ponto" ? "var(--azul)" : "var(--primary-texto)", background: d.tipo === "ponto" ? "color-mix(in srgb, var(--azul) 16%, transparent)" : "color-mix(in srgb, var(--primary) 14%, transparent)" }}>{d.tipo === "ponto" ? "Ponto" : "Produção"}</span>
                  {d.tipo !== "ponto" && <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 500 }}>· {d.setor || "todos"}</span>}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{d.last_sync ? `último sync ${new Date(d.last_sync).toLocaleString("pt-BR")}` : "nunca sincronizou"}</div>
              </div>
              {d.tipo !== "ponto" && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                  {/* `flex: none` no rótulo, e não só no <label> que o contém:
                      sem isso o span era espremido a 32px — cabem quatro letras
                      de "Bancada" — e como o overflow é visível, o resto do
                      texto não sumia, ficava ESCONDIDO ATRÁS do seletor ao
                      lado. É o mesmo padrão de sempre: filho de flex sem
                      `flex: none` encolhe até caber no que sobrou. */}
                  {/* `.desk-only`: no estreito o rótulo é a primeira coisa a
                      sair. O seletor já mostra o valor ("Chancela"), e a
                      explicação do que é bancada está no parágrafo acima da
                      lista — repetir a palavra em cada linha custa a largura
                      que o botão de desativar precisa pra caber. */}
                  <span className="desk-only" style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600, flex: "none", whiteSpace: "nowrap" }}>Bancada</span>
                  <GlassSelect value={bancadaDe(d.categorias)} onChange={(v) => definirBancada(d.id, v)}
                    style={{ minHeight: 30, padding: "5px 8px", fontSize: 12.5 }}
                    options={BANCADAS.map((b) => ({ value: b.key, label: b.label }))} />
                </label>
              )}
              {d.ativo
                // Destrutivo com o piso de toque (era 15px de altura) e longe
                // do seletor de bancada (eram 10px). A regra do projeto é
                // explícita: ação destrutiva não fica colada em outra
                // clicável — no celular, 10px é a distância de um erro.
                ? <Botao tamanho="sm" variante="perigo" onClick={() => desativar(d.id)} style={{ flex: "none", marginLeft: "auto" }}>desativar</Botao>
                : <span style={{ fontSize: 12, color: "var(--text-dim)" }}>inativo</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
