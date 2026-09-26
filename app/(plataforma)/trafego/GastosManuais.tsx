"use client";

// ── Gastos manuais e BMs do widget "Gasto + imposto" (Tridify) ──────────────
// Extensão do widget, não uma área nova: um menu "⋯" no canto do card abre
//   · Adicionar gasto manual  → valor, BM, data, observação (4 campos)
//   · Gasto por BM            → quanto cada BM custou no período (com imposto)
//   · Gerenciar BMs           → renomear/remover BM cadastrada, apagar gasto
//   · Nova BM                 → cadastra uma BM que o Meta não mostra
//
// O gasto manual é BRUTO: o imposto de importação é aplicado pelo snapshot em
// cima do gasto total (Meta + manual), então ele entra no ROAS, no lucro e na
// comissão igual à fatura do Meta. Depois de salvar, `avisarGastoManual()`
// faz o TrafegoClient reler o snapshot sem cache; até ele voltar, o widget
// soma o valor na hora (otimista).
//
// Rota: /api/trafego/gastos-manuais. SQL: supabase/trafego_gastos_manuais.sql.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtBRL2 } from "@/lib/format";
import { Icon } from "../Icon";
import { Dropdown } from "../ui/Dropdown";
import { Modal } from "../ui/Modal";
import { Acoes, Botao, BotaoIcone, Campo } from "../ui/controles";
import { GlassDate, GlassSelect } from "../GlassPicker";
import { toast } from "../Toast";
import { avisarGastoManual, useAtualizacao } from "./atualizacao";
import { lerValor, linhasPorBm, type DadosGastos as Dados } from "@/lib/trafego-gastos-conta";


const NOVA = "__nova__";
const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const dataBR = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

function useGastosManuais(de: string, ate: string) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);
  const carregar = useCallback(() => {
    const q = de && ate ? new URLSearchParams({ period: "custom", from: de, to: ate }).toString() : "period=mes";
    fetch(`/api/trafego/gastos-manuais?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: Dados) => { setDados(j); setErro(false); })
      .catch(() => setErro(true));
  }, [de, ate]);
  useEffect(carregar, [carregar]);
  useAtualizacao(carregar);
  return { dados, erro, carregar };
}

export type Aberto = null | "gasto" | "porBm" | "gerenciar" | "novaBm";

/**
 * Menu do widget + os modais. `taxa` é o multiplicador do imposto que o
 * snapshot usou (gastoComImposto ÷ gasto), pra prévia bater com o card.
 * `onOtimista` recebe o bruto recém-lançado (ou apagado, negativo).
 */
export function MenuGastos({ de, ate, taxa, gastoMeta, onOtimista, aberto, setAberto }: {
  de: string; ate: string; taxa: number; gastoMeta: number;
  onOtimista: (delta: number) => void;
  /** Controlado pelo card: a linha "Ver por BM" abre o mesmo modal do menu. */
  aberto: Aberto; setAberto: (a: Aberto) => void;
}) {
  const { dados, erro, carregar } = useGastosManuais(de, ate);
  const fechar = () => setAberto(null);
  const mudou = (delta = 0) => { if (delta) onOtimista(delta); carregar(); avisarGastoManual(); };

  return (
    <>
      <Dropdown
        titulo="Gastos manuais e BMs" icone="dots" alinhar="fim" largura={240}
        itens={[
          { id: "gasto", rotulo: "Adicionar gasto manual", icone: "plus", onSelect: () => setAberto("gasto") },
          { id: "porBm", rotulo: "Gasto por BM", icone: "chart-bar", onSelect: () => setAberto("porBm") },
          { id: "gerenciar", rotulo: "Gerenciar BMs e gastos", icone: "settings", onSelect: () => setAberto("gerenciar") },
          { id: "novaBm", rotulo: "Nova BM", icone: "building", onSelect: () => setAberto("novaBm") },
        ]}
      />
      {aberto === "gasto" && (
        <NovoGasto dados={dados} erroBms={erro} taxa={taxa} onFechar={fechar}
          onSalvo={(valor) => { fechar(); mudou(valor); }} />
      )}
      {aberto === "porBm" && (
        <GastoPorBm dados={dados} erro={erro} taxa={taxa} gastoMeta={gastoMeta} onFechar={fechar}
          onAdicionar={() => setAberto("gasto")} />
      )}
      {aberto === "gerenciar" && (
        <GerenciarBms dados={dados} onFechar={fechar} onMudou={mudou} onNovaBm={() => setAberto("novaBm")} />
      )}
      {aberto === "novaBm" && (
        <NovaBm onFechar={fechar} onSalvo={() => { fechar(); carregar(); }} />
      )}
    </>
  );
}

// ── Adicionar gasto manual ──────────────────────────────────────────────────
function NovoGasto({ dados, erroBms, taxa, onFechar, onSalvo }: {
  dados: Dados | null; erroBms: boolean; taxa: number; onFechar: () => void; onSalvo: (valor: number) => void;
}) {
  const [valorTxt, setValorTxt] = useState("");
  const [bm, setBm] = useState("");
  const [novaBm, setNovaBm] = useState("");
  const [data, setData] = useState(hojeSP());
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(0);
  const [erro, setErro] = useState("");

  const valor = lerValor(valorTxt);
  const valido = Number.isFinite(valor) && valor > 0;
  const imposto = valido ? valor * (taxa - 1) : 0;
  const opcoes = [
    ...(dados?.bms ?? []).map((b) => ({ value: b.chave, label: b.origem === "meta" ? `${b.nome} · Meta` : b.nome })),
    { value: NOVA, label: "+ Nova BM…" },
  ];
  const erroValor = tentou && !valido ? "Informe um valor maior que zero." : undefined;
  const erroBm = tentou && (!bm || (bm === NOVA && !novaBm.trim())) ? (bm === NOVA ? "Dê um nome à BM nova." : "Escolha a BM do gasto.") : undefined;

  async function salvar() {
    setTentou((n) => n + 1); setErro("");
    if (!valido || !bm || (bm === NOVA && !novaBm.trim()) || !data) return;
    setSalvando(true);
    try {
      const escolhida = dados?.bms.find((b) => b.chave === bm);
      const r = await fetch("/api/trafego/gastos-manuais", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: "gasto", valor, data, descricao,
          ...(bm === NOVA ? { novaBm: novaBm.trim() } : { bmChave: bm, bmNome: escolhida?.nome ?? "" }),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "falhou");
      toast(`Gasto de ${fmtBRL2(valor)} lançado — ${fmtBRL2(valor * taxa)} com imposto`, "ok");
      onSalvo(valor);
    } catch (e) {
      setErro(String((e as Error).message) === "data_invalida" ? "Data inválida." : "Não foi possível salvar. Tente de novo.");
    } finally { setSalvando(false); }
  }

  return (
    <Modal aberto onFechar={onFechar} soFechaNoX icone="cash" titulo="Adicionar gasto manual" tamanho="sm"
      rodape={<Acoes><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Lançar gasto</Botao></Acoes>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Campo label="Valor do gasto" erro={erroValor} sinal={tentou}>
          {(id) => (
            <input id={id} inputMode="decimal" autoFocus placeholder="0,00" value={valorTxt}
              onChange={(e) => setValorTxt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void salvar(); }} />
          )}
        </Campo>

        {/* Valor informado → imposto → valor considerado: a conta à vista. */}
        <div aria-live="polite" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 10px", padding: "10px 12px", borderRadius: 10, background: "var(--surface-2, var(--surface))", border: "1px solid var(--border)", fontSize: 13 }}>
          <span style={{ color: "var(--text-dim)" }}>Valor informado</span>
          <span className="stat" style={{ textAlign: "right" }}>{fmtBRL2(valido ? valor : 0)}</span>
          <span style={{ color: "var(--text-dim)" }}>Imposto de importação ({((taxa - 1) * 100).toFixed(2).replace(".", ",")}%)</span>
          <span className="stat" style={{ textAlign: "right", color: "var(--aviso, var(--text))" }}>+ {fmtBRL2(imposto)}</span>
          <span style={{ fontWeight: 700, borderTop: "1px solid var(--border)", paddingTop: 5 }}>Valor considerado</span>
          <span className="stat" style={{ textAlign: "right", fontWeight: 800, borderTop: "1px solid var(--border)", paddingTop: 5 }}>{fmtBRL2(valido ? valor + imposto : 0)}</span>
        </div>

        <Campo label="BM / conta" erro={erroBm} sinal={tentou}>
          {(id) => <GlassSelect id={id} value={bm} onChange={setBm} options={opcoes} searchable={opcoes.length > 8} placeholder={dados || erroBms ? "Escolha a BM" : "Carregando BMs…"} />}
        </Campo>
        {bm === NOVA && (
          <Campo label="Nome da nova BM" dica="Fica salva pra os próximos gastos.">
            {(id) => <input id={id} autoFocus value={novaBm} maxLength={80} placeholder="BM 04" onChange={(e) => setNovaBm(e.target.value)} />}
          </Campo>
        )}

        <Campo label="Data do gasto">
          {(id) => <GlassDate id={id} value={data} onChange={(v) => setData(v || hojeSP())} clearable={false} max={hojeSP()} />}
        </Campo>
        <Campo label="Observação (opcional)">
          {(id) => <input id={id} value={descricao} maxLength={300} placeholder="Ex.: boleto da BM de backup" onChange={(e) => setDescricao(e.target.value)} />}
        </Campo>
        {erro && <div role="alert" style={{ color: "var(--perigo)", fontSize: 13 }}>{erro}</div>}
      </div>
    </Modal>
  );
}

// ── Gasto por BM ────────────────────────────────────────────────────────────
function GastoPorBm({ dados, erro, taxa, gastoMeta, onFechar, onAdicionar }: {
  dados: Dados | null; erro: boolean; taxa: number; gastoMeta: number; onFechar: () => void; onAdicionar: () => void;
}) {
  const q = useMemo(() => (dados ? linhasPorBm(dados, gastoMeta, taxa) : null), [dados, gastoMeta, taxa]);
  return (
    <Modal aberto onFechar={onFechar} icone="chart-bar" titulo="Gasto por BM" subtitulo="No período, com imposto" tamanho="sm"
      rodape={<Acoes><Botao variante="secundario" icone="plus" onClick={onAdicionar}>Adicionar gasto</Botao></Acoes>}>
      {erro && !dados ? <div style={{ color: "var(--text-dim)" }}>Não foi possível carregar as BMs.</div>
        : !q ? <div style={{ color: "var(--text-dim)" }}>Carregando…</div>
        : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {q.linhas.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 13, padding: "8px 0" }}>Sem gasto no período.</div>}
            {q.linhas.map((l) => (
              <div key={l.chave} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)", minHeight: "var(--tap)" }}>
                <Icon name={l.chave.startsWith("meta:") ? "brand-meta" : "building"} size={16} color="var(--text-dim)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nome}</div>
                  {l.manual > 0 && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>inclui {fmtBRL2(l.manual * taxa)} manual</div>}
                </div>
                <span className="stat" style={{ fontWeight: 700, flex: "none" }}>{fmtBRL2(l.total)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", color: "var(--text-dim)", fontSize: 13 }}>
              <span>Gastos manuais</span><span className="stat">{fmtBRL2(q.manualComImposto)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 9, borderTop: "1px solid var(--border)", fontWeight: 800 }}>
              <span>Total</span><span className="stat">{fmtBRL2(q.total)}</span>
            </div>
          </div>
        )}
    </Modal>
  );
}

// ── Gerenciar BMs e gastos manuais ──────────────────────────────────────────
function GerenciarBms({ dados, onFechar, onMudou, onNovaBm }: {
  dados: Dados | null; onFechar: () => void; onMudou: (delta?: number) => void; onNovaBm: () => void;
}) {
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const [ocupado, setOcupado] = useState("");
  const cadastradas = (dados?.bms ?? []).filter((b) => b.origem === "manual");
  const meta = (dados?.bms ?? []).filter((b) => b.origem === "meta");

  async function chamar(id: string, url: string, init: RequestInit, ok: string, delta = 0) {
    setOcupado(id);
    try {
      const r = await fetch(url, init);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "falhou");
      toast(ok, "ok"); setEditando(null); onMudou(delta);
    } catch (e) {
      toast(String((e as Error).message) === "bm_com_gastos" ? "Essa BM tem gastos lançados. Apague os gastos antes." : "Não foi possível salvar.", "erro");
    } finally { setOcupado(""); }
  }

  const titulo = (t: string) => <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", margin: "14px 0 4px" }}>{t}</div>;
  const linha = { display: "flex", alignItems: "center", gap: 8, minHeight: "var(--tap)", borderBottom: "1px solid var(--border)" } as const;

  return (
    <Modal aberto onFechar={onFechar} icone="settings" titulo="BMs e gastos manuais" tamanho="md"
      rodape={<Acoes><Botao variante="secundario" icone="building" onClick={onNovaBm}>Nova BM</Botao></Acoes>}>
      {!dados ? <div style={{ color: "var(--text-dim)" }}>Carregando…</div> : (
        <div>
          {titulo("Gastos manuais do período")}
          {dados.gastos.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 13, padding: "6px 0" }}>Nenhum gasto manual no período.</div>}
          {dados.gastos.map((g) => (
            <div key={g.id} style={linha}>
              <span className="stat" style={{ fontSize: 12, color: "var(--text-dim)", flex: "none", width: 38 }}>{dataBR(g.data)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.bmNome}</div>
                {g.descricao && <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.descricao}</div>}
              </div>
              <span className="stat" style={{ fontWeight: 700, flex: "none" }}>{fmtBRL2(g.valor)}</span>
              <BotaoIcone icone="trash" titulo="Apagar gasto" carregando={ocupado === g.id}
                onClick={() => chamar(g.id, `/api/trafego/gastos-manuais?gasto=${g.id}`, { method: "DELETE" }, "Gasto apagado", -g.valor)} />
            </div>
          ))}

          {titulo("BMs cadastradas")}
          {cadastradas.length === 0 && <div style={{ color: "var(--text-dim)", fontSize: 13, padding: "6px 0" }}>Nenhuma BM cadastrada à mão.</div>}
          {cadastradas.map((b) => (
            <div key={b.chave} style={linha}>
              <Icon name="building" size={16} color="var(--text-dim)" />
              {editando?.id === b.id ? (
                <>
                  <div className="ui-campo" style={{ flex: 1, minWidth: 0 }}>
                  <input autoFocus aria-label="Nome da BM" value={editando!.nome} maxLength={80}
                    onChange={(e) => setEditando({ id: b.id!, nome: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter" && editando!.nome.trim()) void chamar(b.id!, "/api/trafego/gastos-manuais", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editando!) }, "BM renomeada"); if (e.key === "Escape") setEditando(null); }} />
                  </div>
                  <BotaoIcone icone="check" titulo="Salvar nome" carregando={ocupado === b.id} disabled={!editando!.nome.trim()}
                    onClick={() => chamar(b.id!, "/api/trafego/gastos-manuais", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editando!) }, "BM renomeada")} />
                  <BotaoIcone icone="x" titulo="Cancelar" onClick={() => setEditando(null)} />
                </>
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nome}</span>
                  <BotaoIcone icone="pencil" titulo="Renomear BM" onClick={() => setEditando({ id: b.id!, nome: b.nome })} />
                  <BotaoIcone icone="trash" titulo="Remover BM" carregando={ocupado === b.id}
                    onClick={() => chamar(b.id!, `/api/trafego/gastos-manuais?bm=${b.id}`, { method: "DELETE" }, "BM removida")} />
                </>
              )}
            </div>
          ))}

          {meta.length > 0 && (
            <>
              {titulo("BMs do Meta")}
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>Vêm da integração — dá pra vincular gasto, não editar.</div>
              {meta.map((b) => (
                <div key={b.chave} style={linha}>
                  <Icon name="brand-meta" size={16} color="var(--text-dim)" />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nome}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ── Nova BM ─────────────────────────────────────────────────────────────────
function NovaBm({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(0);
  async function salvar() {
    setTentou((n) => n + 1);
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/trafego/gastos-manuais", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "bm", nome }) });
      if (!r.ok) throw new Error();
      toast(`BM "${nome.trim()}" cadastrada`, "ok");
      onSalvo();
    } catch { toast("Não foi possível cadastrar a BM.", "erro"); }
    finally { setSalvando(false); }
  }
  return (
    <Modal aberto onFechar={onFechar} icone="building" titulo="Nova BM" tamanho="xs"
      rodape={<Acoes><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Cadastrar</Botao></Acoes>}>
      <Campo label="Nome da BM" dica="Fica disponível na lista dos próximos gastos." erro={tentou && !nome.trim() ? "Dê um nome à BM." : undefined} sinal={tentou}>
        {(id) => <input id={id} autoFocus value={nome} maxLength={80} placeholder="BM 04" onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void salvar(); }} />}
      </Campo>
    </Modal>
  );
}
