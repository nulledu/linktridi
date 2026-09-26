"use client";

// ── Hospedagens ──────────────────────────────────────────────────────────────
// Onde as coisas rodam (Hostinger, VPS, Vercel, Railway…): quanto custa, quando
// cobra e com qual credencial do cofre se entra no painel.

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { toast, confirmar } from "../Toast";
import { GlassSelect } from "../GlassPicker";
import { Botao, BotaoIcone, Acoes, Campo, Campos, PainelLateral } from "../ui/controles";
import { Fila } from "../ui/micro";
import type { DadosDaEquipe } from "../colaboradores/GestaoDeEquipe";
import type { OpcaoCredencial } from "./InfraHub";
import { moeda, dataBR, diasAte } from "./comum";

interface Hospedagem {
  id: string; nome: string; provedor: string | null; urlPainel: string | null;
  valor: number | null; periodicidade: "mensal" | "anual" | "unico";
  proximaCobranca: string | null; responsavelId: string | null;
  observacao: string | null; credencialId: string | null;
}

type Rascunho = {
  id?: string; nome: string; provedor: string; urlPainel: string; valor: string;
  periodicidade: Hospedagem["periodicidade"]; proximaCobranca: string;
  responsavelId: string; observacao: string; credencialId: string;
};

const vazio = (): Rascunho => ({
  nome: "", provedor: "", urlPainel: "", valor: "", periodicidade: "mensal",
  proximaCobranca: "", responsavelId: "", observacao: "", credencialId: "",
});

const PERIODO_ROTULO: Record<Hospedagem["periodicidade"], string> = {
  mensal: "Mensal", anual: "Anual", unico: "Pagamento único",
};

const GRID = "minmax(min(100%, 170px), 1.4fr) minmax(min(100%, 110px), .9fr) minmax(min(100%, 110px), .9fr) minmax(min(100%, 120px), .9fr) minmax(min(100%, 130px), 1fr) auto";

export function Hospedagens({ equipe, credenciais, podeCofre }: {
  equipe: Promise<DadosDaEquipe>;
  credenciais: OpcaoCredencial[];
  podeCofre: boolean;
}) {
  const { colaboradores } = use(equipe);
  const [hospedagens, setHospedagens] = useState<Hospedagem[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    fetch("/api/infraestrutura/hospedagens", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setAviso(d.detalhe || d.error); setHospedagens([]); return; }
        setAviso(null); setHospedagens(d?.hospedagens ?? []);
      })
      .catch(() => { setAviso("Não consegui carregar as hospedagens."); setHospedagens([]); });
  }, []);
  useEffect(carregar, [carregar]);

  const nomeDe = useCallback((id: string | null) =>
    id ? (colaboradores.find((c) => c.id === id)?.name ?? "—") : "—", [colaboradores]);
  const opcoesPessoa = useMemo(
    () => colaboradores.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name })),
    [colaboradores],
  );

  const salvar = useCallback(async () => {
    if (!rascunho) return;
    if (!rascunho.nome.trim()) { toast("Diga o nome da hospedagem.", "erro"); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/infraestrutura/hospedagens", {
        method: rascunho.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rascunho),
      });
      const d = await r.json();
      if (!r.ok || d?.error) { toast(d?.detalhe || "Não consegui salvar.", "erro"); return; }
      toast(rascunho.id ? "Hospedagem atualizada." : "Hospedagem cadastrada.");
      setRascunho(null);
      carregar();
    } finally { setSalvando(false); }
  }, [rascunho, carregar]);

  const apagar = useCallback(async (h: Hospedagem) => {
    const ok = await confirmar(`Apagar a hospedagem "${h.nome}"?`, {
      detalhe: "Some do cadastro (e desfaz o vínculo nos domínios). Isto não cancela nada no provedor.", perigo: true,
    });
    if (!ok) return;
    const r = await fetch(`/api/infraestrutura/hospedagens?id=${h.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) { toast(j?.detalhe || "Não consegui apagar.", "erro"); return; }
    toast("Hospedagem apagada.");
    carregar();
  }, [carregar]);

  const editar = (h: Hospedagem) => setRascunho({
    id: h.id, nome: h.nome, provedor: h.provedor ?? "", urlPainel: h.urlPainel ?? "",
    valor: h.valor == null ? "" : String(h.valor), periodicidade: h.periodicidade,
    proximaCobranca: h.proximaCobranca ?? "", responsavelId: h.responsavelId ?? "",
    observacao: h.observacao ?? "", credencialId: h.credencialId ?? "",
  });

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

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <Botao variante="primario" icone="plus" onClick={() => setRascunho(vazio())}>
          <span className="desk-only">Adicionar hospedagem</span>
          <span className="mob-only">Adicionar</span>
        </Botao>
      </div>

      {hospedagens === null ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando as hospedagens…</p>
      ) : hospedagens.length === 0 ? (
        <div style={{ padding: "40px 16px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "var(--r-md)" }}>
          <Icon name="stack-2" size={26} color="var(--text-dim)" />
          <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--text-dim)" }}>Nenhuma hospedagem cadastrada ainda.</p>
        </div>
      ) : (
        <section style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", overflow: "hidden" }}>
          <div className="tab-linha-head" style={{
            display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "8px 16px",
            fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em",
          }}>
            <span>Hospedagem</span><span>Provedor</span><span>Valor</span><span>Próx. cobrança</span><span>Responsável</span>
            <span style={{ textAlign: "right" }}>Ações</span>
          </div>
          {/* `<Fila>` (.mt-fila): linhas entram escalonadas — kinetics na
              escala do app. */}
          <Fila>
          {hospedagens.map((h, i) => {
            const dias = diasAte(h.proximaCobranca);
            const emBreve = dias != null && dias >= 0 && dias <= 7;
            return (
              <div key={h.id} className="tab-linha" style={{
                display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "10px 16px",
                alignItems: "center", borderTop: i > 0 ? "1px solid var(--border)" : "none",
              }}>
                <span className="tl-titulo" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Icon name="stack-2" size={15} color="var(--text-dim)" />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.urlPainel
                      ? <a href={h.urlPainel} target="_blank" rel="noreferrer noopener" style={{ color: "inherit" }}>{h.nome}</a>
                      : h.nome}
                  </span>
                </span>

                <span data-l="Provedor" style={{ fontSize: 12.5, color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {h.provedor || "—"}
                </span>

                <span data-l="Valor" style={{ fontSize: 12.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                  {moeda(h.valor)}
                  {h.valor != null && ` · ${PERIODO_ROTULO[h.periodicidade].toLowerCase()}`}
                </span>

                <span data-l="Próx. cobrança" style={{
                  fontSize: 12.5, fontVariantNumeric: "tabular-nums",
                  color: emBreve ? "var(--atencao)" : "var(--text-dim)", fontWeight: emBreve ? 700 : 400,
                }}>
                  {dataBR(h.proximaCobranca)}
                </span>

                <span data-l="Responsável" style={{ fontSize: 12.5, color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nomeDe(h.responsavelId)}
                </span>

                <span className="tl-largo" data-l="Ações" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <BotaoIcone icone="pencil" titulo={`Editar ${h.nome}`} onClick={() => editar(h)} />
                  <BotaoIcone icone="trash" variante="perigo" titulo={`Apagar ${h.nome}`}
                    style={{ marginLeft: 8 }} onClick={() => apagar(h)} />
                </span>
              </div>
            );
          })}
          </Fila>
        </section>
      )}

      {rascunho && (
        <PainelLateral
          titulo={rascunho.id ? "Editar hospedagem" : "Nova hospedagem"}
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
            <Campo label="Nome" largo>
              {(id) => (
                <input id={id} value={rascunho.nome} placeholder="VPS Produção, Vercel…"
                  onChange={(e) => setRascunho((r) => r && { ...r, nome: e.target.value })} />
              )}
            </Campo>
            <Campo label="Provedor">
              {(id) => (
                <input id={id} value={rascunho.provedor} placeholder="Hostinger, AWS…"
                  onChange={(e) => setRascunho((r) => r && { ...r, provedor: e.target.value })} />
              )}
            </Campo>
            <Campo label="Link do painel">
              {(id) => (
                <input id={id} value={rascunho.urlPainel} placeholder="https://…" inputMode="url"
                  onChange={(e) => setRascunho((r) => r && { ...r, urlPainel: e.target.value })} />
              )}
            </Campo>
            <Campo label="Valor (R$)">
              {(id) => (
                <input id={id} value={rascunho.valor} inputMode="decimal" placeholder="89,90"
                  onChange={(e) => setRascunho((r) => r && { ...r, valor: e.target.value })} />
              )}
            </Campo>
            <Campo label="Periodicidade">
              {(id) => (
                <GlassSelect id={id} value={rascunho.periodicidade}
                  onChange={(v) => setRascunho((r) => r && { ...r, periodicidade: v as Hospedagem["periodicidade"] })}
                  options={(["mensal", "anual", "unico"] as const).map((p) => ({ value: p, label: PERIODO_ROTULO[p] }))}
                />
              )}
            </Campo>
            <Campo label="Próxima cobrança">
              {(id) => (
                <input id={id} type="date" value={rascunho.proximaCobranca}
                  onChange={(e) => setRascunho((r) => r && { ...r, proximaCobranca: e.target.value })} />
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
            {podeCofre && (
              <Campo label="Credencial vinculada" largo dica="Qual acesso do cofre abre o painel. Só o vínculo — a senha continua saindo pelo cofre.">
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
