"use client";

import { useCallback, useEffect, useState } from "react";
import type { MarketDeviceHealth, MarketOverview, MarketProfile } from "../../../../lib/tridimarket/types";
import { Icon } from "../../Icon";
import { Cabecalho, useFiltros } from "../Filtros";
import { montarPeriodo, paramsDoPeriodo } from "../../../../lib/tridimarket/periodo";
import { Aviso } from "../DashboardClient";
import { Badge, Card, Empty, INDIGO, PanelTitle, SkelLinhas, SkelStats, Stat, haQuantoTempo, marketRequest } from "../ui";
import { campo, rotulo } from "../produtos/ProdutosClient";
import { Botao, BotaoIcone } from "../../ui/controles";

type Settings = { profiles: MarketProfile[]; schemaReady: boolean };

export function TabletsClient() {
  const [filtros, setFiltros] = useFiltros();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tablets, setTablets] = useState<MarketDeviceHealth[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [gerando, setGerando] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<MarketDeviceHealth | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const perfilAtivo = filtros.profileId || settings?.profiles[0]?.id || "";
  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    const [conf, visao] = await Promise.allSettled([
      marketRequest<Settings>("settings"),
      // A saúde dos tablets vem calculada no overview (minutos desde o último
      // contato), então não há dois lugares fazendo a mesma conta. O período
      // aqui é irrelevante — só os campos de dispositivo são usados.
      marketRequest<MarketOverview>(`overview?${paramsDoPeriodo(montarPeriodo("hoje"))}`),
    ]);
    if (conf.status === "fulfilled") setSettings(conf.value);
    if (visao.status === "fulfilled") setTablets(visao.value.devices);
    else setErro(visao.reason instanceof Error ? visao.reason.message : "Falha ao carregar os tablets.");
    setCarregando(false);
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function gerar(e: React.FormEvent) {
    e.preventDefault();
    setGerando(true); setErro(null); setCodigo(null);
    try {
      const r = await marketRequest<{ code: string }>("devices", { method: "POST", body: JSON.stringify({ profileId: perfilAtivo, name: nome }) });
      setCodigo(r.code); setNome(""); await carregar();
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível gerar o código."); }
    finally { setGerando(false); }
  }

  // Nome e empresa são campos SEPARADOS na rota (cada um com sua validação e
  // seu registro na auditoria), então saem em duas chamadas — e só sai a que
  // de fato mudou.
  async function renomear(id: string, novoNome: string, empresaId: string) {
    setErro(null); setAviso(null);
    const alvo = tablets.find((d) => d.id === id);
    const empresaAtual = settings?.profiles.find((p) => p.name === alvo?.unitName)?.id ?? "";
    try {
      if (alvo && novoNome !== alvo.name) {
        await marketRequest("devices", { method: "PATCH", body: JSON.stringify({ id, name: novoNome }) });
      }
      if (empresaId && empresaId !== empresaAtual) {
        await marketRequest("devices", { method: "PATCH", body: JSON.stringify({ id, profileId: empresaId }) });
      }
      const nomeEmpresa = settings?.profiles.find((p) => p.id === empresaId)?.name;
      setAviso(empresaId !== empresaAtual
        ? `"${novoNome}" agora tira do estoque de ${nomeEmpresa}.`
        : `Tablet renomeado para "${novoNome}".`);
      setRenomeando(null); await carregar();
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível salvar o tablet."); }
  }

  // Apagar de vez. Revogar já tira o aparelho do ar; isto é pra faxina —
  // tablet trocado, aparelho de teste. As compras que ele mandou ficam: o
  // vínculo em `operacoes_compra` é `on delete set null`.
  async function remover(d: { id: string; name: string; pendingOperations: number }) {
    if (d.pendingOperations > 0) {
      setErro(`"${d.name}" ainda tem ${d.pendingOperations} compra(s) na fila. Espere subirem antes de remover — elas vivem NO APARELHO, e removê-lo aqui não as traz.`);
      return;
    }
    if (!confirm(`Remover "${d.name}" do cadastro? O histórico de vendas dele continua; o aparelho precisará de um código novo pra voltar.`)) return;
    setErro(null); setAviso(null);
    try {
      await marketRequest(`devices?id=${encodeURIComponent(d.id)}`, { method: "DELETE" });
      setAviso(`"${d.name}" removido.`); await carregar();
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível remover o tablet."); }
  }

  const semContato = tablets.filter((d) => d.active && !d.online);
  const presos = tablets.reduce((s, d) => s + d.pendingOperations, 0);

  return (
    <>
      <Cabecalho titulo="Tablets" descricao={`${tablets.filter((d) => d.active).length} ativo(s)`}
        filtros={filtros} setFiltros={setFiltros} perfis={settings?.profiles ?? []} carregando={carregando} onAtualizar={() => void carregar()} />

      {erro && <Aviso tom="neg" icone="circle-x" titulo="Não foi possível concluir">{erro}</Aviso>}
      {aviso && <Aviso tom="pos" icone="circle-check" titulo="Pronto">{aviso}</Aviso>}
      {semContato.length > 0 && (
        <Aviso tom="warn" icone="alert-triangle" titulo={`${semContato.length} tablet(s) sem falar com o servidor`}>
          Quase sempre é o Wi-Fi do local. As compras feitas nesse tempo ficam guardadas no aparelho e sobem sozinhas quando a rede voltar — nada se perde.
        </Aviso>
      )}

      {carregando && !tablets.length ? <SkelStats n={3} /> : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12, marginBottom: 14 }}>
        <Stat label="Online agora" value={String(tablets.filter((d) => d.online).length)} icon="device-mobile" tone="pos" hint="visto nos últimos 30 min" />
        <Stat label="Sem contato" value={String(semContato.length)} icon="alert-triangle" tone={semContato.length ? "warn" : "neutral"} hint="ativos, mas calados" />
        <Stat label="Compras na fila" value={String(presos)} icon="clock" tone={presos ? "warn" : "neutral"} hint="ainda não sincronizadas" />
      </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 14 }} className="tm-grid-2">
        <Card>
          <PanelTitle title="Aparelhos" hint="último contato com o servidor" />
          {carregando && !tablets.length ? <SkelLinhas n={4} /> : tablets.length ? (
            <div style={{ display: "grid", gap: 2 }}>
              {tablets.map((d) => (
                // No celular o selo (~90px) + o botão de 44px não cabem ao lado do
                // nome; com a quebra eles descem em vez de espremer o texto.
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", flex: "none", background: !d.active ? "var(--tf-neutral)" : d.online ? "var(--tf-pos)" : "var(--tf-warn)" }} />
                  <div style={{ minWidth: 150, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 650, color: "var(--text)" }}>{d.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {d.unitName ?? "sem unidade"} · visto {haQuantoTempo(d.lastSeenAt)}
                      {d.pendingOperations > 0 && ` · ${d.pendingOperations} compra(s) na fila`}
                    </div>
                  </div>
                  {!d.active ? <Badge>revogado</Badge> : d.online ? <Badge tone="pos">online</Badge> : <Badge tone="warn">sem contato</Badge>}
                  <BotaoIcone icone="edit" titulo={`Editar ${d.name}`} tamanho="sm" onClick={() => setRenomeando(d)} style={{ marginLeft: 2, flex: "none" }} />
                  <BotaoIcone icone="circle-x" titulo={`Remover ${d.name}`} tamanho="sm" onClick={() => void remover(d)} style={{ flex: "none" }} />
                </div>
              ))}
            </div>
          ) : <Empty icon="device-mobile" title="Nenhum tablet ativado" text="Gere um código ao lado e digite-o no aparelho." />}
        </Card>

        <Card>
          <PanelTitle title="Ativar um tablet" hint="o código vale por 24 horas" />
          <form onSubmit={gerar}>
            <label style={rotulo}>Nome do aparelho</label>
            <input required minLength={2} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Mesa Carimbos" style={campo} />
            <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "10px 0 0" }}>
              O tablet fica vinculado a <strong style={{ color: "var(--text)" }}>{settings?.profiles.find((p) => p.id === perfilAtivo)?.name ?? "—"}</strong>: é de lá que o estoque sai. Qualquer pessoa, de qualquer empresa, pode comprar nele.
            </p>
            <Botao variante="primario" type="submit" bloco carregando={gerando} disabled={!perfilAtivo || !nome} style={{ marginTop: 16 }}>Gerar código de ativação</Botao>
          </form>

          {codigo && (
            <div style={{ marginTop: 16, padding: 16, borderRadius: "var(--r-sm)", background: `color-mix(in srgb, ${INDIGO} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${INDIGO} 26%, transparent)`, textAlign: "center" }}>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}>Digite no tablet</div>
              <strong style={{ display: "block", fontSize: 34, letterSpacing: "0.16em", fontWeight: 800, color: "var(--text)", marginTop: 6 }}>{codigo}</strong>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 6 }}>Válido por 24 horas · use uma vez só</div>
            </div>
          )}
        </Card>
      </div>

      {renomeando && (
        <ModalRenomear device={renomeando} empresas={settings?.profiles ?? []}
          onFechar={() => setRenomeando(null)} onSalvar={renomear} />
      )}
    </>
  );
}

function ModalRenomear({ device, empresas, onFechar, onSalvar }: {
  device: MarketDeviceHealth;
  empresas: Array<{ id: string; name: string }>;
  onFechar: () => void;
  onSalvar: (id: string, nome: string, empresaId: string) => Promise<void>;
}) {
  const [nome, setNome] = useState(device.name);
  // A empresa vem do aparelho. Quando o cadastro não bate com nenhuma da lista
  // (unidade removida numa fusão, por exemplo), abre vazio e OBRIGA a escolher
  // — melhor do que fingir que está tudo certo.
  const [empresa, setEmpresa] = useState(empresas.find((e) => e.name === device.unitName)?.id ?? "");
  const [salvando, setSalvando] = useState(false);
  const empresaAtual = empresas.find((e) => e.name === device.unitName)?.id ?? "";
  const mudou = nome.trim() !== device.name || empresa !== empresaAtual;
  const valido = nome.trim().length >= 2 && !!empresa && mudou;
  return (
    // .sheet-host/.sheet: no celular o modal vira folha presa embaixo, com o
    // "Salvar" na altura do polegar. No computador as classes não fazem nada.
    <div onClick={onFechar} className="sheet-host" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}>
      <form onClick={(e) => e.stopPropagation()} className="sheet"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valido) return;
          // Tira o foco antes de esperar a rede: no celular o teclado fica de pé
          // cobrindo a folha enquanto o "Salvando…" acontece atrás dele.
          (document.activeElement as HTMLElement | null)?.blur?.();
          setSalvando(true);
          await onSalvar(device.id, nome.trim(), empresa);
          setSalvando(false);
        }}
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 22, width: "min(440px, 100%)" }}>
        <strong style={{ fontSize: 17, color: "var(--text)", display: "block" }}>Editar tablet</strong>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "6px 0 16px" }}>
          O nome aparece aqui e nos avisos de tablet sem contato. A empresa decide
          de qual estoque cada compra sai.
        </p>
        <label style={rotulo} htmlFor="tablet-nome">Nome do aparelho</label>
        <input id="tablet-nome" autoFocus required minLength={2} maxLength={100} value={nome} onChange={(e) => setNome(e.target.value)} style={campo} />

        <label style={{ ...rotulo, marginTop: 14 }} htmlFor="tablet-empresa">Empresa</label>
        <select id="tablet-empresa" required value={empresa} onChange={(e) => setEmpresa(e.target.value)}
          style={{ ...campo, minHeight: "var(--tap)" }}>
          <option value="" disabled>Escolha a empresa…</option>
          {empresas.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {empresa && empresa !== empresaAtual && (
          <p style={{ fontSize: 12, color: "var(--tf-warn)", margin: "7px 0 0" }}>
            As próximas compras vão tirar do estoque de{" "}
            <strong>{empresas.find((e) => e.id === empresa)?.name}</strong>. As já
            registradas ficam onde estão.
          </p>
        )}

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 20 }}>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" type="submit" carregando={salvando} disabled={!valido}>{salvando ? "Salvando…" : "Salvar"}</Botao>
        </div>
      </form>
    </div>
  );
}
