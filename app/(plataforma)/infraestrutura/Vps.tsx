"use client";

// ── VPS ──────────────────────────────────────────────────────────────────────
// Os servidores próprios (VPS Produção, servidor de chats…): endereço, quanto
// custa, quando cobra e com qual credencial do cofre se entra. O IP não é
// segredo — quem entra precisa da chave, que mora no cofre.

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { toast, confirmar } from "../Toast";
import { GlassSelect } from "../GlassPicker";
import { Botao, BotaoIcone, Acoes, Campo, Campos, PainelLateral } from "../ui/controles";
import { Fila } from "../ui/micro";
import type { DadosDaEquipe } from "../colaboradores/GestaoDeEquipe";
import type { OpcaoCredencial } from "./InfraHub";
import { moeda, dataBR, diasAte } from "./comum";

interface Vps {
  id: string; nome: string; provedor: string | null; ip: string | null;
  portaSsh: number | null; urlPainel: string | null;
  valor: number | null; periodicidade: "mensal" | "anual" | "unico";
  proximaCobranca: string | null; responsavelId: string | null;
  observacao: string | null; credencialId: string | null;
}

type Rascunho = {
  id?: string; nome: string; provedor: string; ip: string; portaSsh: string;
  urlPainel: string; valor: string; periodicidade: Vps["periodicidade"];
  proximaCobranca: string; responsavelId: string; observacao: string; credencialId: string;
};

const vazio = (): Rascunho => ({
  nome: "", provedor: "", ip: "", portaSsh: "", urlPainel: "", valor: "",
  periodicidade: "mensal", proximaCobranca: "", responsavelId: "", observacao: "", credencialId: "",
});

const PERIODO_ROTULO: Record<Vps["periodicidade"], string> = {
  mensal: "Mensal", anual: "Anual", unico: "Pagamento único",
};

const GRID = "minmax(min(100%, 160px), 1.3fr) minmax(min(100%, 140px), 1.1fr) minmax(min(100%, 100px), .8fr) minmax(min(100%, 110px), .9fr) minmax(min(100%, 120px), .9fr) auto";

export function Vps({ equipe, credenciais, podeCofre }: {
  equipe: Promise<DadosDaEquipe>;
  credenciais: OpcaoCredencial[];
  podeCofre: boolean;
}) {
  const { colaboradores } = use(equipe);
  const [servidores, setServidores] = useState<Vps[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    fetch("/api/infraestrutura/vps", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setAviso(d.detalhe || d.error); setServidores([]); return; }
        setAviso(null); setServidores(d?.vps ?? []);
      })
      .catch(() => { setAviso("Não consegui carregar as VPS."); setServidores([]); });
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
    if (!rascunho.nome.trim()) { toast("Diga o nome da VPS.", "erro"); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/infraestrutura/vps", {
        method: rascunho.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rascunho),
      });
      const d = await r.json();
      if (!r.ok || d?.error) { toast(d?.detalhe || "Não consegui salvar.", "erro"); return; }
      toast(rascunho.id ? "VPS atualizada." : "VPS cadastrada.");
      setRascunho(null);
      carregar();
    } finally { setSalvando(false); }
  }, [rascunho, carregar]);

  const apagar = useCallback(async (v: Vps) => {
    const ok = await confirmar(`Apagar a VPS "${v.nome}"?`, {
      detalhe: "Some do cadastro. Isto não desliga nem cancela nada no provedor.", perigo: true,
    });
    if (!ok) return;
    const r = await fetch(`/api/infraestrutura/vps?id=${v.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) { toast(j?.detalhe || "Não consegui apagar.", "erro"); return; }
    toast("VPS apagada.");
    carregar();
  }, [carregar]);

  const editar = (v: Vps) => setRascunho({
    id: v.id, nome: v.nome, provedor: v.provedor ?? "", ip: v.ip ?? "",
    portaSsh: v.portaSsh == null ? "" : String(v.portaSsh), urlPainel: v.urlPainel ?? "",
    valor: v.valor == null ? "" : String(v.valor), periodicidade: v.periodicidade,
    proximaCobranca: v.proximaCobranca ?? "", responsavelId: v.responsavelId ?? "",
    observacao: v.observacao ?? "", credencialId: v.credencialId ?? "",
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
          <span className="desk-only">Adicionar VPS</span>
          <span className="mob-only">Adicionar</span>
        </Botao>
      </div>

      {servidores === null ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando as VPS…</p>
      ) : servidores.length === 0 ? (
        <div style={{ padding: "40px 16px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "var(--r-md)" }}>
          <Icon name="database" size={26} color="var(--text-dim)" />
          <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--text-dim)" }}>Nenhuma VPS cadastrada ainda.</p>
        </div>
      ) : (
        <section style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface)", overflow: "hidden" }}>
          <div className="tab-linha-head" style={{
            display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "8px 16px",
            fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em",
          }}>
            <span>VPS</span><span>IP / host</span><span>Provedor</span><span>Valor</span><span>Responsável</span>
            <span style={{ textAlign: "right" }}>Ações</span>
          </div>
          {/* `<Fila>` (.mt-fila): linhas entram escalonadas — kinetics na
              escala do app. */}
          <Fila>
          {servidores.map((v, i) => {
            const dias = diasAte(v.proximaCobranca);
            const emBreve = dias != null && dias >= 0 && dias <= 7;
            return (
              <div key={v.id} className="tab-linha" style={{
                display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "10px 16px",
                alignItems: "center", borderTop: i > 0 ? "1px solid var(--border)" : "none",
              }}>
                <span className="tl-titulo" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Icon name="database" size={15} color="var(--text-dim)" />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>
                      {v.urlPainel
                        ? <a href={v.urlPainel} target="_blank" rel="noreferrer noopener" style={{ color: "inherit" }}>{v.nome}</a>
                        : v.nome}
                    </span>
                    {v.proximaCobranca && (
                      <span style={{ fontSize: 12, color: emBreve ? "var(--atencao)" : "var(--text-dim)", fontWeight: emBreve ? 700 : 400 }}>
                        {" "}· cobra {dataBR(v.proximaCobranca)}
                      </span>
                    )}
                  </span>
                </span>

                {/* O IP não é segredo; copiar é local, sem auditoria — a chave
                    de entrar mora no cofre. */}
                <span data-l="IP / host" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <code style={{ flex: 1, fontSize: 12.5, color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.ip ? (v.portaSsh ? `${v.ip}:${v.portaSsh}` : v.ip) : "—"}
                  </code>
                  {v.ip && (
                    <BotaoIcone icone="copy" titulo={`Copiar o IP de ${v.nome}`}
                      onClick={async () => {
                        try { await navigator.clipboard.writeText(v.ip!); toast("IP copiado."); }
                        catch { toast("O navegador bloqueou a cópia.", "erro"); }
                      }} />
                  )}
                </span>

                <span data-l="Provedor" style={{ fontSize: 12.5, color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.provedor || "—"}
                </span>

                <span data-l="Valor" style={{ fontSize: 12.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                  {moeda(v.valor)}
                  {v.valor != null && ` · ${PERIODO_ROTULO[v.periodicidade].toLowerCase()}`}
                </span>

                <span data-l="Responsável" style={{ fontSize: 12.5, color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {nomeDe(v.responsavelId)}
                </span>

                <span className="tl-largo" data-l="Ações" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <BotaoIcone icone="pencil" titulo={`Editar ${v.nome}`} onClick={() => editar(v)} />
                  <BotaoIcone icone="trash" variante="perigo" titulo={`Apagar ${v.nome}`}
                    style={{ marginLeft: 8 }} onClick={() => apagar(v)} />
                </span>
              </div>
            );
          })}
          </Fila>
        </section>
      )}

      {rascunho && (
        <PainelLateral
          titulo={rascunho.id ? "Editar VPS" : "Nova VPS"}
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
                <input id={id} value={rascunho.nome} placeholder="VPS Produção, servidor de chats…"
                  onChange={(e) => setRascunho((r) => r && { ...r, nome: e.target.value })} />
              )}
            </Campo>
            <Campo label="Provedor">
              {(id) => (
                <input id={id} value={rascunho.provedor} placeholder="Hostinger, Contabo…"
                  onChange={(e) => setRascunho((r) => r && { ...r, provedor: e.target.value })} />
              )}
            </Campo>
            <Campo label="Link do painel">
              {(id) => (
                <input id={id} value={rascunho.urlPainel} placeholder="https://…" inputMode="url"
                  onChange={(e) => setRascunho((r) => r && { ...r, urlPainel: e.target.value })} />
              )}
            </Campo>
            <Campo label="IP / host">
              {(id) => (
                <input id={id} value={rascunho.ip} placeholder="203.0.113.10" autoComplete="off"
                  onChange={(e) => setRascunho((r) => r && { ...r, ip: e.target.value })} />
              )}
            </Campo>
            <Campo label="Porta SSH" dica="Em branco = a padrão (22).">
              {(id) => (
                <input id={id} value={rascunho.portaSsh} inputMode="numeric" placeholder="22"
                  onChange={(e) => setRascunho((r) => r && { ...r, portaSsh: e.target.value })} />
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
                  onChange={(v) => setRascunho((r) => r && { ...r, periodicidade: v as Vps["periodicidade"] })}
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
              <Campo label="Credencial vinculada" largo dica="Qual acesso do cofre entra nesta VPS (SSH ou painel). Só o vínculo — a senha continua saindo pelo cofre.">
                {(id) => (
                  <GlassSelect id={id} value={rascunho.credencialId}
                    onChange={(v) => setRascunho((r) => r && { ...r, credencialId: v })}
                    options={[{ value: "", label: "Sem vínculo" }, ...credenciais]}
                    placeholder="Escolher credencial…" searchable
                  />
                )}
              </Campo>
            )}
            <Campo label="Observação" largo dica="O que roda nela, particularidades do deploy…">
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
