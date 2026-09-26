"use client";

// ── Domínios ─────────────────────────────────────────────────────────────────
// A tela existe pra responder UMA pergunta: quais domínios vamos renovar e
// quais vamos parar de pagar? Por isso a decisão é uma coluna da tabela (e não
// um detalhe do formulário), o topo conta só os quatro números que importam, e
// quem vence em breve acende sozinho.

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { toast, confirmar } from "../Toast";
import { GlassSelect } from "../GlassPicker";
import { Botao, BotaoIcone, Acoes, Campo, Campos, PainelLateral, Interruptor } from "../ui/controles";
import { Fila, NumeroVivo } from "../ui/micro";
import { Abas } from "../ui/Abas";
import type { DadosDaEquipe } from "../colaboradores/GestaoDeEquipe";
import type { OpcaoCredencial } from "./InfraHub";
import { moeda, dataBR, diasAte } from "./comum";

interface Dominio {
  id: string; dominio: string; registrador: string | null; vencimento: string | null;
  valorRenovacao: number | null; renovacaoAutomatica: boolean;
  decisao: "renovar" | "avaliar" | "nao_renovar";
  ativo: boolean;
  responsavelId: string | null; observacao: string | null;
  hospedagemId: string | null; credencialId: string | null;
}

type Rascunho = {
  id?: string; dominio: string; registrador: string; vencimento: string;
  valorRenovacao: string; renovacaoAutomatica: boolean;
  decisao: Dominio["decisao"]; ativo: boolean; responsavelId: string; observacao: string;
  hospedagemId: string; credencialId: string;
};

const vazio = (): Rascunho => ({
  dominio: "", registrador: "", vencimento: "", valorRenovacao: "",
  renovacaoAutomatica: false, decisao: "avaliar", ativo: true, responsavelId: "", observacao: "",
  hospedagemId: "", credencialId: "",
});

type FiltroAtivo = "todos" | "ativo" | "inativo";
const FILTRO_ITENS: { valor: FiltroAtivo; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" }, { valor: "ativo", rotulo: "Ativos" }, { valor: "inativo", rotulo: "Inativos" },
];

const DECISAO_ROTULO: Record<Dominio["decisao"], string> = {
  renovar: "Renovar", avaliar: "Avaliar", nao_renovar: "Não renovar",
};
// Cor de ESTADO vem da paleta semântica — verde significa "vai renovar" e não
// pode virar rosa quando alguém troca o destaque.
const DECISAO_COR: Record<Dominio["decisao"], string> = {
  renovar: "var(--ok)", avaliar: "var(--atencao)", nao_renovar: "var(--perigo)",
};

const GRID = "minmax(min(100%, 170px), 1.4fr) minmax(min(100%, 110px), .9fr) minmax(min(100%, 100px), .8fr) minmax(min(100%, 110px), .9fr) minmax(min(100%, 130px), 1fr) auto";

export function Dominios({ equipe, credenciais, podeCofre }: {
  equipe: Promise<DadosDaEquipe>;
  credenciais: OpcaoCredencial[];
  podeCofre: boolean;
}) {
  const { colaboradores } = use(equipe);
  const [dominios, setDominios] = useState<Dominio[] | null>(null);
  const [hospedagens, setHospedagens] = useState<{ value: string; label: string }[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [filtroAtivo, setFiltroAtivo] = useState<FiltroAtivo>("todos");

  const carregar = useCallback(() => {
    fetch("/api/infraestrutura/dominios", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setAviso(d.detalhe || d.error); setDominios([]); return; }
        setAviso(null); setDominios(d?.dominios ?? []);
      })
      .catch(() => { setAviso("Não consegui carregar os domínios."); setDominios([]); });
  }, []);
  useEffect(carregar, [carregar]);

  // As hospedagens só servem o vínculo — uma ida, sem poll.
  useEffect(() => {
    fetch("/api/infraestrutura/hospedagens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setHospedagens(
        ((d?.hospedagens ?? []) as { id: string; nome: string }[]).map((h) => ({ value: h.id, label: h.nome })),
      ))
      .catch(() => {});
  }, []);

  const nomeDe = useCallback((id: string | null) =>
    id ? (colaboradores.find((c) => c.id === id)?.name ?? "—") : "—", [colaboradores]);
  const opcoesPessoa = useMemo(
    () => colaboradores.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name })),
    [colaboradores],
  );

  // Os quatro números do topo — o resumo da decisão, não um dashboard.
  const resumo = useMemo(() => {
    const l = dominios ?? [];
    return {
      total: l.length,
      vencendo: l.filter((d) => { const n = diasAte(d.vencimento); return n != null && n >= 0 && n <= 30; }).length,
      renovar: l.filter((d) => d.decisao === "renovar").length,
      naoRenovar: l.filter((d) => d.decisao === "nao_renovar").length,
    };
  }, [dominios]);

  const salvar = useCallback(async () => {
    if (!rascunho) return;
    if (!rascunho.dominio.trim()) { toast("Diga qual é o domínio.", "erro"); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/infraestrutura/dominios", {
        method: rascunho.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rascunho),
      });
      const d = await r.json();
      if (!r.ok || d?.error) { toast(d?.detalhe || "Não consegui salvar.", "erro"); return; }
      toast(rascunho.id ? "Domínio atualizado." : "Domínio cadastrado.");
      setRascunho(null);
      carregar();
    } finally { setSalvando(false); }
  }, [rascunho, carregar]);

  const apagar = useCallback(async (d: Dominio) => {
    const ok = await confirmar(`Apagar o domínio "${d.dominio}"?`, {
      detalhe: "Some do cadastro. Isto não cancela nada no registrador.", perigo: true,
    });
    if (!ok) return;
    const r = await fetch(`/api/infraestrutura/dominios?id=${d.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) { toast(j?.detalhe || "Não consegui apagar.", "erro"); return; }
    toast("Domínio apagado.");
    carregar();
  }, [carregar]);

  const editar = (d: Dominio) => setRascunho({
    id: d.id, dominio: d.dominio, registrador: d.registrador ?? "",
    vencimento: d.vencimento ?? "", valorRenovacao: d.valorRenovacao == null ? "" : String(d.valorRenovacao),
    renovacaoAutomatica: d.renovacaoAutomatica, decisao: d.decisao, ativo: d.ativo,
    responsavelId: d.responsavelId ?? "", observacao: d.observacao ?? "",
    hospedagemId: d.hospedagemId ?? "", credencialId: d.credencialId ?? "",
  });

  const listaFiltrada = useMemo(() => (dominios ?? []).filter((d) =>
    filtroAtivo === "todos" ? true : filtroAtivo === "ativo" ? d.ativo : !d.ativo,
  ), [dominios, filtroAtivo]);

  return (
    <div>
      {aviso && (
        <div role="status" style={{
          display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16, padding: "12px 14px",
          borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface-2)",
        }}>
          <Icon name="alert-triangle" size={17} color="var(--atencao, var(--text-dim))" />
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>{aviso}</p>
        </div>
      )}

      {/* Resumo. `.kpi-row` da fundação: no celular vira carrossel com encaixe. */}
      <div className="kpi-row" style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <Numero rotulo="Domínios" valor={resumo.total} />
        <Numero rotulo="Vencem em 30 dias" valor={resumo.vencendo} cor={resumo.vencendo ? "var(--atencao)" : undefined} />
        <Numero rotulo="Vamos renovar" valor={resumo.renovar} cor="var(--ok)" />
        <Numero rotulo="Não renovar" valor={resumo.naoRenovar} cor={resumo.naoRenovar ? "var(--perigo)" : undefined} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <Abas valor={filtroAtivo} onMuda={setFiltroAtivo} ariaLabel="Filtrar domínios por status" itens={FILTRO_ITENS} />
        <Botao variante="primario" icone="plus" onClick={() => setRascunho(vazio())}>
          <span className="desk-only">Adicionar domínio</span>
          <span className="mob-only">Adicionar</span>
        </Botao>
      </div>

      {dominios === null ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando os domínios…</p>
      ) : dominios.length === 0 ? (
        <div style={{ padding: "40px 16px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "var(--r-md)" }}>
          <Icon name="world-www" size={26} color="var(--text-dim)" />
          <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--text-dim)" }}>Nenhum domínio cadastrado ainda.</p>
        </div>
      ) : listaFiltrada.length === 0 ? (
        <div style={{ padding: "40px 16px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "var(--r-md)" }}>
          <Icon name="world-www" size={26} color="var(--text-dim)" />
          <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--text-dim)" }}>
            Nenhum domínio {filtroAtivo === "ativo" ? "ativo" : "inativo"} agora.
          </p>
        </div>
      ) : (
        <section style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", overflow: "hidden" }}>
          <div className="tab-linha-head" style={{
            display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "8px 16px",
            fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em",
          }}>
            <span>Domínio</span><span>Vencimento</span><span>Valor</span><span>Decisão</span><span>Responsável</span>
            <span style={{ textAlign: "right" }}>Ações</span>
          </div>
          {/* `<Fila>` (.mt-fila): as linhas entram escalonadas em vez de
              aparecerem todas de uma vez — o repertório do kinetics, no tempo
              da escala do app. */}
          <Fila>
          {listaFiltrada.map((d, i) => {
            const dias = diasAte(d.vencimento);
            const vencido = dias != null && dias < 0;
            const emBreve = dias != null && dias >= 0 && dias <= 30;
            return (
              <div key={d.id} className="tab-linha" style={{
                display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "10px 16px",
                alignItems: "center", borderTop: i > 0 ? "1px solid var(--border)" : "none",
              }}>
                <span className="tl-titulo" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Icon name="world-www" size={15} color="var(--text-dim)" />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{d.dominio}</span>
                    {d.registrador && <span style={{ fontSize: 12, color: "var(--text-dim)" }}> · {d.registrador}</span>}
                  </span>
                  {!d.ativo && (
                    <span style={{
                      flexShrink: 0, display: "inline-flex", alignItems: "center", padding: "1px 7px",
                      borderRadius: 999, fontSize: 10.5, fontWeight: 800, color: "var(--text-dim)",
                      border: "1px solid var(--border)", background: "var(--surface-2)",
                    }}>Inativo</span>
                  )}
                </span>

                {/* Quem vence em breve acende; quem já venceu grita. */}
                <span data-l="Vencimento" style={{
                  fontSize: 12.5, fontVariantNumeric: "tabular-nums",
                  color: vencido ? "var(--perigo)" : emBreve ? "var(--atencao)" : "var(--text-dim)",
                  fontWeight: vencido || emBreve ? 700 : 400,
                }}>
                  {dataBR(d.vencimento)}
                  {vencido && " · vencido"}
                  {emBreve && ` · ${dias === 0 ? "hoje" : `${dias} d`}`}
                </span>

                <span data-l="Valor" style={{ fontSize: 12.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                  {moeda(d.valorRenovacao)}
                  {d.renovacaoAutomatica && <span title="Renovação automática ligada"> · auto</span>}
                </span>

                <span data-l="Decisão">
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 9px",
                    borderRadius: 999, fontSize: 11.5, fontWeight: 800,
                    border: "1px solid var(--border)", color: DECISAO_COR[d.decisao], background: "var(--surface-2)",
                  }}>
                    {DECISAO_ROTULO[d.decisao]}
                  </span>
                </span>

                <span data-l="Responsável" style={{ fontSize: 12.5, color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nomeDe(d.responsavelId)}
                </span>

                <span className="tl-largo" data-l="Ações" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <BotaoIcone icone="pencil" titulo={`Editar ${d.dominio}`} onClick={() => editar(d)} />
                  <BotaoIcone icone="trash" variante="perigo" titulo={`Apagar ${d.dominio}`}
                    style={{ marginLeft: 8 }} onClick={() => apagar(d)} />
                </span>
              </div>
            );
          })}
          </Fila>
        </section>
      )}

      {rascunho && (
        <PainelLateral
          titulo={rascunho.id ? "Editar domínio" : "Novo domínio"}
          onFechar={() => setRascunho(null)}
          soFechaNoX
          centrado
          largura={480}
          rodape={
            <Acoes>
              <Botao onClick={() => setRascunho(null)}>Cancelar</Botao>
              <Botao variante="primario" carregando={salvando} onClick={salvar}>Salvar</Botao>
            </Acoes>
          }
        >
          <Campos>
            <Campo label="Domínio" largo>
              {(id) => (
                <input id={id} value={rascunho.dominio} placeholder="tridi.com.br"
                  onChange={(e) => setRascunho((r) => r && { ...r, dominio: e.target.value })} />
              )}
            </Campo>
            <Campo label="Registrador">
              {(id) => (
                <input id={id} value={rascunho.registrador} placeholder="Registro.br, Hostinger…"
                  onChange={(e) => setRascunho((r) => r && { ...r, registrador: e.target.value })} />
              )}
            </Campo>
            <Campo label="Vencimento">
              {(id) => (
                <input id={id} type="date" value={rascunho.vencimento}
                  onChange={(e) => setRascunho((r) => r && { ...r, vencimento: e.target.value })} />
              )}
            </Campo>
            <Campo label="Valor da renovação (R$)">
              {(id) => (
                <input id={id} value={rascunho.valorRenovacao} inputMode="decimal" placeholder="49,90"
                  onChange={(e) => setRascunho((r) => r && { ...r, valorRenovacao: e.target.value })} />
              )}
            </Campo>
            <Campo label="Decisão">
              {(id) => (
                <GlassSelect id={id} value={rascunho.decisao}
                  onChange={(v) => setRascunho((r) => r && { ...r, decisao: v as Dominio["decisao"] })}
                  options={(["renovar", "avaliar", "nao_renovar"] as const).map((d) => ({ value: d, label: DECISAO_ROTULO[d] }))}
                />
              )}
            </Campo>
            <Campo label="Domínio ativo" largo>
              {() => (
                <Interruptor
                  ligado={rascunho.ativo}
                  onChange={(v) => setRascunho((r) => r && { ...r, ativo: v })}
                  rotulo="Desligue quando o domínio sair do ar (redirecionado, sem site)."
                />
              )}
            </Campo>
            <Campo label="Renovação automática" largo>
              {() => (
                <Interruptor
                  ligado={rascunho.renovacaoAutomatica}
                  onChange={(v) => setRascunho((r) => r && { ...r, renovacaoAutomatica: v })}
                  rotulo="O registrador cobra e renova sozinho."
                />
              )}
            </Campo>
            <Campo label="Responsável" largo>
              {(id) => (
                <GlassSelect id={id} value={rascunho.responsavelId}
                  onChange={(v) => setRascunho((r) => r && { ...r, responsavelId: v })}
                  options={[{ value: "", label: "Sem responsável" }, ...opcoesPessoa]}
                  placeholder="Escolher pessoa…" searchable
                />
              )}
            </Campo>
            <Campo label="Hospedagem vinculada" largo dica="Onde este domínio está hospedado.">
              {(id) => (
                <GlassSelect id={id} value={rascunho.hospedagemId}
                  onChange={(v) => setRascunho((r) => r && { ...r, hospedagemId: v })}
                  options={[{ value: "", label: "Sem vínculo" }, ...hospedagens]}
                  placeholder="Escolher hospedagem…" searchable
                />
              )}
            </Campo>
            {/* O seletor só existe pra quem tem o cofre — a lista de credenciais
                sai de /api/acessos, que gateia por `infraestrutura:cofre`. */}
            {podeCofre && (
              <Campo label="Credencial vinculada" largo dica="Qual acesso do cofre abre o painel deste domínio. Só o vínculo — a senha continua saindo pelo cofre.">
                {(id) => (
                  <GlassSelect id={id} value={rascunho.credencialId}
                    onChange={(v) => setRascunho((r) => r && { ...r, credencialId: v })}
                    options={[{ value: "", label: "Sem vínculo" }, ...credenciais]}
                    placeholder="Escolher credencial…" searchable
                  />
                )}
              </Campo>
            )}
            <Campo label="Observação" largo>
              {(id) => (
                <textarea id={id} rows={3} value={rascunho.observacao}
                  onChange={(e) => setRascunho((r) => r && { ...r, observacao: e.target.value })} />
              )}
            </Campo>
          </Campos>
        </PainelLateral>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, padding: "12px 14px", border: "1px solid var(--border)",
      borderRadius: "var(--r-md)", background: "var(--surface)",
    }}>
      <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rotulo}</p>
      {/* `NumeroVivo` (mt-num): o número conta até o valor quando entra na
          tela; quem pediu menos movimento recebe o final na hora. */}
      <NumeroVivo as="div" valor={valor}
        style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: cor ?? "var(--text)", fontVariantNumeric: "tabular-nums" }} />
    </div>
  );
}
