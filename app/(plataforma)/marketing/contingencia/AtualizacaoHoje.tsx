"use client";

// ── Atualização de Hoje ──────────────────────────────────────────────────────
// A tela que existe pra ser rápida: tudo o que muda no dia a dia numa folha
// só, e UM botão. Nada é gravado até "Salvar atualização" — a pessoa mexe em
// vinte coisas, confere e salva uma vez; o servidor aplica em ordem e grava o
// snapshot do dia.

import { useMemo, useState } from "react";
import { PainelLateral, Botao, Acoes, Campo, Campos, Caixa } from "../../ui/controles";
import { Avatar } from "../aquecimento/pecas";
import {
  STATUS, chaveAtendente, indiceDeProxies, temProxy, SITUACAO_CELULAR, fmtBRL,
  type Painel, type StatusAtivo, type SituacaoCelular,
} from "@/lib/contingencia-const";

type Corpo = Record<string, unknown>;

export function AtualizacaoHoje({ painel, onFechar, onSalvar }: {
  painel: Painel; onFechar: () => void; onSalvar: (body: Corpo) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<Record<string, StatusAtivo>>({});
  const [proxyDe, setProxyDe] = useState<Record<string, string>>({});     // numeroId → proxyId | ""
  const [situacao, setSituacao] = useState<Record<string, SituacaoCelular>>({});
  const [custos, setCustos] = useState<Record<string, string>>({});
  const [pend, setPend] = useState<Record<string, boolean>>({});
  const [chips, setChips] = useState({ quantidade: "", operadora: "Fluke" });
  const [proxies, setProxies] = useState({ quantidade: "", custoMensal: "" });
  const [novoPlano, setNovoPlano] = useState({ descricao: "", valor: "" });
  const [salvando, setSalvando] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});

  const idx = useMemo(() => indiceDeProxies(painel.proxies), [painel.proxies]);
  const numeros = painel.ativos.filter((n) => n.tipo === "numero" && n.status !== "aposentado");
  const proxiesLivres = painel.proxies.filter((p) => p.status === "ativo" && !p.numeroId && !p.aparelhoNome);
  const proxyAtualDe = (id: string) => painel.proxies.find((p) => p.numeroId === id)?.id ?? "";

  // Agrupa por atendente, sem atendente por último.
  const grupos = useMemo(() => {
    const m = new Map<string, { nome: string; foto: string | null; itens: typeof numeros }>();
    for (const n of numeros) {
      const k = chaveAtendente(n.responsavelId, n.responsavelNome) || "~sem";
      const g = m.get(k) ?? { nome: k === "~sem" ? "Sem atendente" : (n.responsavelNome || "Sem nome"), foto: n.responsavelFoto, itens: [] };
      g.itens.push(n);
      if (!g.foto && n.responsavelFoto) g.foto = n.responsavelFoto;
      m.set(k, g);
    }
    return [...m.entries()].sort((a, b) => (a[0] === "~sem" ? 1 : b[0] === "~sem" ? -1 : a[1].nome.localeCompare(b[1].nome)));
  }, [numeros]);

  const alteracoes =
    Object.keys(status).length + Object.keys(proxyDe).length + Object.keys(situacao).length +
    Object.keys(custos).length + Object.keys(pend).length +
    (Number(chips.quantidade) > 0 ? 1 : 0) + (Number(proxies.quantidade) > 0 ? 1 : 0) + (novoPlano.descricao && novoPlano.valor ? 1 : 0);

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    const body: Corpo = {};
    const ns = Object.entries(status).map(([id, s]) => ({ id, status: s }));
    if (ns.length) body.numeros = ns;
    // Proxy → número: quem tinha o número antes solta, quem foi escolhido pega.
    const ps: Corpo[] = [];
    for (const [numeroId, proxyId] of Object.entries(proxyDe)) {
      const antes = proxyAtualDe(numeroId);
      if (antes && antes !== proxyId) ps.push({ id: antes, numeroId: null });
      if (proxyId) ps.push({ id: proxyId, numeroId, aparelhoNome: null });
    }
    if (ps.length) body.proxies = ps;
    const cs = Object.entries(situacao).map(([id, s]) => ({ id, situacao: s }));
    if (cs.length) body.celulares = cs;
    const ks = Object.entries(custos).map(([id, v]) => ({ id, valor: v }));
    if (ks.length) body.custos = ks;
    const pd = Object.entries(pend).map(([id, feita]) => ({ id, status: feita ? "feita" : "aberta" }));
    if (pd.length) body.pendencias = pd;
    if (Number(chips.quantidade) > 0) body.novosChips = { quantidade: Number(chips.quantidade), operadora: chips.operadora };
    if (Number(proxies.quantidade) > 0) body.novosProxies = { quantidade: Number(proxies.quantidade), custoMensal: proxies.custoMensal || 0 };
    if (novoPlano.descricao && novoPlano.valor) body.novosCustos = [{ tipo: "plano_chip", descricao: novoPlano.descricao, valor: novoPlano.valor }];
    const ok = await onSalvar(body);
    setSalvando(false);
    if (ok) onFechar();
  }

  const abertas = painel.pendencias.filter((p) => p.status === "aberta");
  const c = painel.consolidado;

  return (
    <PainelLateral titulo="Atualização de Hoje" largura={720} centrado soFechaNoX onFechar={onFechar}
      subtitulo={`Nada é gravado até salvar. ${alteracoes ? `${alteracoes} alteração${alteracoes === 1 ? "" : "ões"} pendente${alteracoes === 1 ? "" : "s"}.` : "Salvar sem mexer em nada só grava o snapshot do dia."}`}
      rodape={
        <Acoes>
          <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" icone="check" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar atualização"}</Botao>
        </Acoes>
      }>
      <div className="ct-scope ct-tel" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* ── Resumo do que está valendo ── */}
        <div className="ct-grade" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 120px), 1fr))" }}>
          {[
            ["Celulares", c.celulares.total], ["Prontos", c.numeros.prontos], ["Aquecendo", c.numeros.emAquecimento],
            ["Não aquecidos", c.numeros.naoAquecidos], ["Com proxy", c.numeros.comProxy], ["Em estoque", c.numeros.emEstoque],
          ].map(([r, v]) => (
            <div key={String(r)} className="ct-kpi" style={{ padding: "10px 12px" }}>
              <div className="ct-kpi-rot" style={{ fontSize: 11.5 }}>{r}</div>
              <div className="ct-kpi-val" style={{ fontSize: 22 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* ── Números por atendente ── */}
        <Secao titulo="Números por atendente" sub="Status e proxy de cada chip. Restringido e bloqueado entram aqui.">
          {grupos.length ? grupos.map(([k, g]) => {
            const aberto = abertos[k] ?? grupos.length <= 3;
            return (
              <div key={k} style={{ border: "1px solid var(--border)", borderRadius: 14, marginBottom: 8, overflow: "hidden" }}>
                <button type="button" onClick={() => setAbertos((a) => ({ ...a, [k]: !aberto }))} aria-expanded={aberto}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 12px", minHeight: "var(--tap)", background: "var(--surface-2)", border: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left" }}>
                  <Avatar nome={g.nome} foto={g.foto} tam={26} />
                  <span style={{ fontWeight: 680, flex: 1 }}>{g.nome}</span>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{g.itens.length} número{g.itens.length === 1 ? "" : "s"} {aberto ? "▴" : "▾"}</span>
                </button>
                {aberto && (
                  <div style={{ padding: "4px 12px 8px" }}>
                    {g.itens.map((n) => {
                      const st = status[n.id] ?? n.status;
                      const px = proxyDe[n.id] ?? proxyAtualDe(n.id);
                      const protegidoPeloAparelho = !px && temProxy(n, idx);
                      return (
                        <div key={n.id} className="ct-hoje-l">
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 620, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.nome}</div>
                            <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{[n.operadora, n.aparelho].filter(Boolean).join(" · ") || "sem operadora"}</div>
                          </div>
                          <select className="ct-sel" value={st} aria-label={`Status de ${n.nome}`}
                            style={status[n.id] && status[n.id] !== n.status ? { borderColor: "var(--ct-cor)" } : undefined}
                            onChange={(e) => setStatus((s) => ({ ...s, [n.id]: e.target.value as StatusAtivo }))}>
                            {STATUS.filter((s) => s.key !== "aposentado" || n.status === "aposentado").map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                          </select>
                          <select className="ct-sel" value={px} aria-label={`Proxy de ${n.nome}`}
                            style={proxyDe[n.id] !== undefined && proxyDe[n.id] !== proxyAtualDe(n.id) ? { borderColor: "var(--ct-cor)" } : undefined}
                            onChange={(e) => setProxyDe((p) => ({ ...p, [n.id]: e.target.value }))}>
                            <option value="">{protegidoPeloAparelho ? "Proxy do aparelho" : "Sem proxy"}</option>
                            {px && !proxiesLivres.some((p) => p.id === px) && (() => { const atual = painel.proxies.find((p) => p.id === px); return atual ? <option value={atual.id}>{atual.identificacao}</option> : null; })()}
                            {proxiesLivres.map((p) => <option key={p.id} value={p.id}>{p.identificacao}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }) : <p className="ct-sub">Nenhum número cadastrado ainda. Use o lote abaixo ou o Aquecimento.</p>}
          {proxiesLivres.length === 0 && painel.proxies.length > 0 && <p className="ct-sub">Nenhum proxy livre pra associar — cadastre no lote abaixo.</p>}
        </Secao>

        {/* ── Lotes ── */}
        <Secao titulo="Chegou material" sub="Cadastra em lote. Chips entram como “novo”, sem aparelho — ou seja, em estoque.">
          <Campos min={140}>
            <Campo label="Chips novos (qtd)">{(id) => <input id={id} type="number" min={0} max={200} className="ct-num" value={chips.quantidade} onChange={(e) => setChips({ ...chips, quantidade: e.target.value })} />}</Campo>
            <Campo label="Operadora">{(id) => <input id={id} list={`${id}-ops`} value={chips.operadora} onChange={(e) => setChips({ ...chips, operadora: e.target.value })} />}</Campo>
            <Campo label="Proxies novos (qtd)">{(id) => <input id={id} type="number" min={0} max={200} className="ct-num" value={proxies.quantidade} onChange={(e) => setProxies({ ...proxies, quantidade: e.target.value })} />}</Campo>
            <Campo label="Custo mensal de cada (R$)">{(id) => <input id={id} type="number" min={0} step="0.01" className="ct-num" value={proxies.custoMensal} onChange={(e) => setProxies({ ...proxies, custoMensal: e.target.value })} />}</Campo>
          </Campos>
          <datalist id="ops-lista">{c.operadoras.map((o) => <option key={o.rotulo} value={o.rotulo} />)}</datalist>
        </Secao>

        {/* ── Celulares ── */}
        {painel.celulares.length > 0 && (
          <Secao titulo="Celulares" sub="Só a situação: disponível e em uso o sistema deduz pelos números de dentro.">
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
              {painel.celulares.filter((x) => x.situacao !== "aposentado" || situacao[x.id]).map((cel) => (
                <label key={cel.id} style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 620, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cel.nome}</span>
                  <select className="ct-sel" value={situacao[cel.id] ?? cel.situacao}
                    style={situacao[cel.id] && situacao[cel.id] !== cel.situacao ? { borderColor: "var(--ct-cor)" } : undefined}
                    onChange={(e) => setSituacao((s) => ({ ...s, [cel.id]: e.target.value as SituacaoCelular }))}>
                    {SITUACAO_CELULAR.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </Secao>
        )}

        {/* ── Custos ── */}
        <Secao titulo="Gastos do mês" sub={`Proxies: ${fmtBRL(c.custos.proxies)} (soma dos proxies ativos). Planos e outros abaixo.`}>
          {painel.custos.filter((k) => k.ativo).map((k) => (
            <div key={k.id} className="ct-hoje-l" style={{ gridTemplateColumns: "minmax(0,1fr) 150px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 620, fontSize: 13.5 }}>{k.descricao}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{k.tipo === "plano_chip" ? "plano de chip" : "outro"} · {k.periodicidade}</div>
              </div>
              <input className="ct-num" type="number" min={0} step="0.01" value={custos[k.id] ?? String(k.valor)} aria-label={`Valor de ${k.descricao}`}
                style={custos[k.id] !== undefined && Number(custos[k.id]) !== k.valor ? { borderColor: "var(--ct-cor)" } : undefined}
                onChange={(e) => setCustos((s) => ({ ...s, [k.id]: e.target.value }))} />
            </div>
          ))}
          <Campos min={160}>
            <Campo label="Novo plano de chip (descrição)">{(id) => <input id={id} value={novoPlano.descricao} onChange={(e) => setNovoPlano({ ...novoPlano, descricao: e.target.value })} placeholder="Plano Fluke" />}</Campo>
            <Campo label="Valor mensal (R$)">{(id) => <input id={id} type="number" min={0} step="0.01" className="ct-num" value={novoPlano.valor} onChange={(e) => setNovoPlano({ ...novoPlano, valor: e.target.value })} />}</Campo>
          </Campos>
        </Secao>

        {/* ── Pendências ── */}
        {abertas.length > 0 && (
          <Secao titulo="Pendências" sub="Marque o que foi feito.">
            {abertas.map((p) => (
              <label key={p.id} className="ct-pend" data-feita={pend[p.id] ? "1" : "0"}>
                <Caixa marcado={!!pend[p.id]} onChange={(marc) => setPend((s) => { const n = { ...s }; if (marc) n[p.id] = true; else delete n[p.id]; return n; })} />
                <span className="ct-pend-t" style={{ fontWeight: 620, fontSize: 13.5 }}>{p.titulo}</span>
              </label>
            ))}
          </Secao>
        )}
      </div>
    </PainelLateral>
  );
}

function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ fontSize: 14.5, fontWeight: 760, letterSpacing: "-0.01em" }}>{titulo}</h3>
      {sub && <p className="ct-sub" style={{ marginBottom: 10 }}>{sub}</p>}
      {children}
    </section>
  );
}
