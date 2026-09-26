"use client";

// Aba Ajustes do TridiMarket. Duas coisas, ambas no roxo do sistema:
//
//  1) Regras globais (valem pra TODAS as empresas): cheque especial + limite
//     extra, limite padrão de quem não tem limite próprio, e bloquear
//     inadimplente a partir de X dias. Antes tudo isso era fixo no código.
//
//  2) Score de cada funcionário (0..100). Começa em 0 e sobe/desce sozinho pelo
//     comportamento; o gestor pode dar uma NOTA à mão (congela o automático) ou
//     voltar pro automático.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../../Icon";
import type { MarketPerson, MarketSettings } from "../../../../lib/tridimarket/types";
import { formatMarketCurrency } from "../../../../lib/tridimarket/view";
import { reaisInteirosDoTexto, textoDeReaisInteiros } from "../../../../lib/tridimarket/moeda";
import { Avatar, Card, Empty, INDIGO, PanelTitle, SkelLinhas, SkelStats, marketRequest } from "../ui";
import { useIsMobile } from "../../ui/useMediaQuery";
import { atributosDe } from "../../ui/campos";
import { Botao, BotaoIcone, Interruptor } from "../../ui/controles";
import { Alerta } from "../../ui/Alerta";

export function AjustesClient() {
  const [settings, setSettings] = useState<MarketSettings | null>(null);
  const [pessoas, setPessoas] = useState<MarketPerson[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async () => {
    setErro(null);
    try {
      const [cfg, gente] = await Promise.all([
        marketRequest<{ settings: MarketSettings }>("settings"),
        marketRequest<MarketPerson[]>("employees"),
      ]);
      setSettings(cfg.settings);
      setPessoas(gente);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os Ajustes.");
    }
  };
  useEffect(() => { void carregar(); }, []);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", display: "grid", gap: 18 }}>
      <header>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", color: "var(--text)", margin: 0 }}>Ajustes</h1>
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "4px 0 0" }}>
          Regras do mercadinho e score dos funcionários. As regras valem para todas as empresas.
        </p>
      </header>

      {erro && <Aviso tone="neg" icon="alert-triangle" texto={erro} acao={{ label: "Tentar de novo", onClick: () => void carregar() }} />}

      <RegrasGlobais settings={settings} onSalvo={(s) => setSettings(s)} />
      <ScorePainel pessoas={pessoas} onScore={(id, r) => {
        setPessoas((atual) => atual?.map((p) => p.scoreEmployeeId === id ? { ...p, score: r.score, scoreManual: r.manual } : p) ?? atual);
      }} />
      <StatusCard />
    </div>
  );
}

// ── Atalho pra página de status ──────────────────────────────────────────────
// /status é pública, mas só quem tem a área tridimarket entra aqui — então o
// atalho já nasce restrito a quem opera o mercadinho, sem chave nova nenhuma.
function StatusCard() {
  return (
    <Card>
      <PanelTitle title="Status dos sistemas" hint="Veja se o mercadinho, o ERP e os serviços de terceiros estão no ar." />
      <Link href="/status" style={{
        display: "inline-flex", alignItems: "center", gap: 8, minHeight: "var(--tap)",
        padding: "0 16px", borderRadius: 10, background: INDIGO, color: "#fff",
        fontSize: 13.5, fontWeight: 700, textDecoration: "none",
      }}>
        <Icon name="activity" size={16} color="#fff" /> Abrir página de status
        <Icon name="arrow-right" size={15} color="#fff" />
      </Link>
    </Card>
  );
}

// ── 1) Regras globais ────────────────────────────────────────────────────────
function RegrasGlobais({ settings, onSalvo }: { settings: MarketSettings | null; onSalvo: (s: MarketSettings) => void }) {
  const [rascunho, setRascunho] = useState<MarketSettings | null>(settings);
  const [salvando, setSalvando] = useState(false);
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { setRascunho(settings); }, [settings]);

  const sujo = useMemo(() => {
    if (!settings || !rascunho) return false;
    return (["chequeEspecial", "limiteExtra", "limitePadrao", "bloquearInadimplente", "diasInadimplencia"] as const)
      .some((k) => settings[k] !== rascunho[k]);
  }, [settings, rascunho]);

  const salvar = async () => {
    if (!rascunho || salvando) return;
    setSalvando(true); setErro(null); setFeito(false);
    try {
      const salvo = await marketRequest<MarketSettings>("settings", { method: "PATCH", body: JSON.stringify(rascunho) });
      onSalvo(salvo);
      setFeito(true); setTimeout(() => setFeito(false), 2200);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally { setSalvando(false); }
  };

  if (!rascunho) {
    return <Card><PanelTitle title="Regras do mercadinho" /><SkelStats n={2} /></Card>;
  }

  const set = <K extends keyof MarketSettings>(k: K, v: MarketSettings[K]) => setRascunho({ ...rascunho, [k]: v });

  return (
    <Card>
      <PanelTitle title="Regras do mercadinho" hint="Valem para todas as empresas." />
      <div style={{ display: "grid", gap: 4 }}>
        <Linha
          titulo="Cheque especial"
          desc="Deixa a pessoa gastar além do limite normal, até o valor extra abaixo."
        >
          <Interruptor ligado={rascunho.chequeEspecial} onChange={(v) => set("chequeEspecial", v)} titulo="Cheque especial" cor={INDIGO} />
        </Linha>
        {rascunho.chequeEspecial && (
          <Linha titulo="Limite extra de crédito" desc="Quanto de saldo a mais liberar além do limite normal." recuo>
            <CampoLimite valor={rascunho.limiteExtra} onChange={(r) => set("limiteExtra", r)} />
          </Linha>
        )}
        <Linha titulo="Limite padrão de novos" desc="Limite de quem não tem um limite próprio marcado no cadastro.">
          <CampoLimite valor={rascunho.limitePadrao} onChange={(r) => set("limitePadrao", r)} />
        </Linha>
        <Linha
          titulo="Bloquear inadimplente"
          desc="Barra a compra de quem tem dívida vencida (acima do prazo abaixo)."
        >
          <Interruptor ligado={rascunho.bloquearInadimplente} onChange={(v) => set("bloquearInadimplente", v)} titulo="Bloquear inadimplente" cor={INDIGO} />
        </Linha>
        <Linha titulo="Prazo de inadimplência" desc="A partir de quantos dias uma dívida em aberto vira “vencida”.">
          <CampoDias valor={rascunho.diasInadimplencia} onChange={(d) => set("diasInadimplencia", d)} />
        </Linha>
      </div>

      {erro && <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--tf-neg)" }}>{erro}</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, justifyContent: "flex-end" }}>
        {feito && <span style={{ fontSize: 12.5, color: "var(--tf-pos)", display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="check" size={15} color="var(--tf-pos)" /> Salvo</span>}
        <BotaoRoxo disabled={!sujo || salvando} onClick={() => void salvar()}>
          {salvando ? "Salvando…" : "Salvar regras"}
        </BotaoRoxo>
      </div>
    </Card>
  );
}

function Linha({ titulo, desc, children, recuo }: { titulo: string; desc: string; children: React.ReactNode; recuo?: boolean }) {
  return (
    // No celular a explicação sobraria com ~110px ao lado do campo; com a quebra
    // o texto fica inteiro em cima e o controle desce. No computador nada muda.
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      padding: "13px 0", borderTop: "1px solid var(--border)",
      paddingLeft: recuo ? 16 : 0, flexWrap: "wrap",
    }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{titulo}</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ flex: "none" }}>{children}</div>
    </div>
  );
}

// ── 2) Score dos funcionários ────────────────────────────────────────────────
function ScorePainel({ pessoas, onScore }: {
  pessoas: MarketPerson[] | null;
  onScore: (employeeId: number, r: { score: number; manual: boolean }) => void;
}) {
  const [busca, setBusca] = useState("");
  // O PanelTitle é uma linha só (título | ação) e não quebra. No celular a busca
  // de 190px deixaria ~55px pro título, então ela sai do cabeçalho e vira uma
  // linha própria de largura cheia. No computador continua ao lado do título.
  const celular = useIsMobile();

  const lista = useMemo(() => {
    if (!pessoas) return null;
    const q = busca.trim().toLowerCase();
    const filtradas = q ? pessoas.filter((p) => p.name.toLowerCase().includes(q)) : pessoas;
    // Menor score primeiro (quem precisa de atenção aparece no topo).
    return [...filtradas].sort((a, b) => a.score - b.score || a.name.localeCompare(b.name));
  }, [pessoas, busca]);

  const campoBusca = <BuscaPessoa valor={busca} onChange={setBusca} larga={celular} />;

  return (
    <Card>
      <PanelTitle
        title="Score dos funcionários"
        hint="Começa em 0. Sobe quando a pessoa paga, desce quando atrasa. Você pode dar uma nota à mão."
        right={celular ? undefined : campoBusca}
      />
      {celular && <div style={{ marginBottom: 12 }}>{campoBusca}</div>}
      {!lista ? <SkelLinhas n={6} />
        : lista.length === 0 ? <Empty icon="users" title="Ninguém encontrado" text="Ajuste a busca." />
        : (
          <div style={{ display: "grid", gap: 2 }}>
            {lista.map((p, i) => <LinhaScore key={p.key} pessoa={p} primeiro={i === 0} onScore={onScore} />)}
          </div>
        )}
    </Card>
  );
}

function BuscaPessoa({ valor, onChange, larga }: { valor: string; onChange: (v: string) => void; larga: boolean }) {
  return (
    <div style={{ position: "relative", width: larga ? "100%" : undefined }}>
      <Icon name="search" size={15} color="var(--text-dim)" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
      <input {...atributosDe("busca")}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar pessoa"
        style={{
          height: 34, width: larga ? "100%" : 190, padding: "0 10px 0 30px", borderRadius: "var(--r-xs)", fontSize: 13,
          border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)",
        }}
      />
    </div>
  );
}

function LinhaScore({ pessoa, primeiro, onScore }: {
  pessoa: MarketPerson; primeiro: boolean;
  onScore: (employeeId: number, r: { score: number; manual: boolean }) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(pessoa.score));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const abrir = () => { setValor(String(pessoa.score)); setEditando(true); setErro(false); setTimeout(() => ref.current?.select(), 0); };

  const enviar = async (score: number | null) => {
    if (salvando) return;
    setSalvando(true); setErro(false);
    try {
      const r = await marketRequest<{ score: number; manual: boolean }>("scores", {
        method: "POST",
        body: JSON.stringify({ employeeId: pessoa.scoreEmployeeId, score }),
      });
      onScore(pessoa.scoreEmployeeId, r);
      setEditando(false);
    } catch { setErro(true); }
    finally { setSalvando(false); }
  };

  const salvarNota = () => {
    const n = Math.max(0, Math.min(100, Math.round(Number(valor) || 0)));
    void enviar(n);
  };

  return (
    // Avatar + nome + barra de 150px + botão não cabem nos ~256px úteis de um
    // celular. Com a quebra, a barra e a ação descem pra segunda linha em vez de
    // espremer o nome até sumir. Acima de ~600px de largura útil nada muda.
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
      borderTop: primeiro ? "none" : "1px solid var(--border)", flexWrap: "wrap",
    }}>
      <Avatar name={pessoa.name} url={pessoa.imageUrl} size={34} />
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pessoa.name}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 1 }}>
          {pessoa.scoreManual ? "nota do gestor" : "automático"}
          {pessoa.overdue > 0 && <span style={{ color: "var(--tf-neg)" }}> · {formatMarketCurrency(pessoa.overdue)} vencido</span>}
        </div>
      </div>

      <BarraScore valor={pessoa.score} />

      {editando ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            ref={ref}
            value={valor}
            inputMode="numeric"
            onChange={(e) => setValor(e.target.value.replace(/\D/g, "").slice(0, 3))}
            onKeyDown={(e) => { if (e.key === "Enter") salvarNota(); if (e.key === "Escape") setEditando(false); }}
            style={{
              width: 56, height: 34, textAlign: "center", fontSize: 14, fontWeight: 700,
              borderRadius: "var(--r-xs)", border: `1px solid ${erro ? "var(--tf-neg)" : INDIGO}`, background: "var(--surface-2)", color: "var(--text)",
            }}
          />
          <BotaoRoxo compacto disabled={salvando} onClick={salvarNota}>{salvando ? "…" : "OK"}</BotaoRoxo>
          {pessoa.scoreManual && (
            <BotaoIcone icone="refresh" titulo="Voltar ao automático" variante="secundario" tamanho="sm" onClick={() => void enviar(null)} disabled={salvando} />
          )}
          <BotaoIcone icone="x" titulo="Cancelar" variante="secundario" tamanho="sm" onClick={() => setEditando(false)} />
        </div>
      ) : (
        <Botao tamanho="sm" icone="edit" onClick={abrir}>Nota</Botao>
      )}
    </div>
  );
}

function BarraScore({ valor }: { valor: number }) {
  const pct = Math.max(0, Math.min(100, valor));
  const cor = pct >= 70 ? "var(--tf-pos)" : pct >= 40 ? "var(--tf-warn)" : "var(--tf-neg)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, width: 150, flex: "none" }}>
      <div style={{ flex: 1, height: 7, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: cor, borderRadius: 999 }} />
      </div>
      <strong style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", width: 26, textAlign: "right" }}>{pct}</strong>
    </div>
  );
}

// ── Peças de formulário ──────────────────────────────────────────────────────
function CampoLimite({ valor, onChange }: { valor: number; onChange: (reais: number) => void }) {
  // Reais INTEIROS, não centavos: limite é 50/100/500, e a máscara de terminal
  // de cartão que havia aqui fazia "500" virar R$ 5,00. Ver lib/tridimarket/moeda.ts.
  const [reais, setReais] = useState(() => Math.round(valor));
  useEffect(() => { setReais(Math.round(valor)); }, [valor]);
  return (
    <input {...atributosDe("dinheiro")}
      value={textoDeReaisInteiros(reais)}
      onChange={(e) => { const r = reaisInteirosDoTexto(e.target.value); setReais(r); onChange(r); }}
      inputMode="numeric"
      placeholder="R$ 500"
      style={{
        width: 130, height: 36, textAlign: "right", padding: "0 11px", fontSize: 14, fontWeight: 700,
        borderRadius: "var(--r-xs)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)",
      }}
    />
  );
}

function CampoDias({ valor, onChange }: { valor: number; onChange: (dias: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <input
        value={String(valor)}
        inputMode="numeric"
        onChange={(e) => onChange(Math.max(1, Math.min(365, Number(e.target.value.replace(/\D/g, "")) || 1)))}
        style={{
          width: 66, height: 36, textAlign: "center", fontSize: 14, fontWeight: 700,
          borderRadius: "var(--r-xs)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)",
        }}
      />
      <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>dias</span>
    </div>
  );
}

function BotaoRoxo({ children, onClick, disabled, compacto }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; compacto?: boolean }) {
  return (
    <Botao variante="primario" tamanho={compacto ? "sm" : "md"} onClick={onClick} disabled={disabled}>{children}</Botao>
  );
}

// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
function Aviso({ tone, icon, texto, acao }: { tone: "neg"; icon: string; texto: string; acao?: { label: string; onClick: () => void } }) {
  return (
    <Alerta tom={tone === "neg" ? "perigo" : "neutro"} icone={icon}
      acao={acao && <Botao tamanho="sm" variante="perigo" onClick={acao.onClick}>{acao.label}</Botao>}>
      {texto}
    </Alerta>
  );
}

