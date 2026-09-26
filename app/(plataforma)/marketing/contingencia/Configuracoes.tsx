"use client";

// ── Configurações ────────────────────────────────────────────────────────────
// Os limites de saúde, os cadastros que não moram no Aquecimento (proxies,
// custos, pendências, dados de celular) e o lugar das credenciais — que é o
// Cofre de senhas (Acessos & Infra), não esta tela.

import { useState } from "react";
import Link from "next/link";
import { Icon } from "../../Icon";
import { Botao, BotaoIcone, Campo, Campos, Acoes, Caixa } from "../../ui/controles";
import { Bloco } from "./pecas";
import type { Chamar } from "./ContingenciaClient";
import {
  fmtBRL, STATUS_PROXY, SITUACAO_CELULAR,
  type Painel, type Proxy, type Custo, type Celular, type StatusProxy, type SituacaoCelular,
} from "@/lib/contingencia-const";

export function Configuracoes({ painel, chamar }: { painel: Painel; chamar: Chamar }) {
  return (
    <div className="ct-tel ct-secoes">
      <Limites painel={painel} chamar={chamar} />
      <div className="duo duo-eq">
        <Credenciais />
        <Pendencias painel={painel} chamar={chamar} />
      </div>
      <Proxies painel={painel} chamar={chamar} />
      <Custos painel={painel} chamar={chamar} />
      <Celulares painel={painel} chamar={chamar} />
    </div>
  );
}

// ── Limites ──────────────────────────────────────────────────────────────────
export function Limites({ painel, chamar }: { painel: Painel; chamar: Chamar }) {
  const [l, setL] = useState(painel.limites);
  const [salvando, setSalvando] = useState(false);
  const mudou = JSON.stringify(l) !== JSON.stringify(painel.limites);
  const invalido = l.reservaCritico > l.reservaAtencao;
  return (
    <Bloco titulo="Limites de atenção e crítico" icone="adjustments-horizontal"
      sub="Decidem a cor do atendente. Não são fixos no código: calibre pela operação.">
      <Campos min={200}>
        <Campo label="Atenção: reservas ≤" dica="Números prontos e ainda não entregues.">
          {(id) => <input id={id} type="number" min={0} className="ct-num" value={l.reservaAtencao} onChange={(e) => setL({ ...l, reservaAtencao: Math.max(0, Number(e.target.value) || 0) })} />}
        </Campo>
        <Campo label="Crítico: reservas ≤" dica="E nada em aquecimento." erro={invalido ? "Crítico não pode passar de atenção." : undefined}>
          {(id) => <input id={id} type="number" min={0} className="ct-num" value={l.reservaCritico} onChange={(e) => setL({ ...l, reservaCritico: Math.max(0, Number(e.target.value) || 0) })} />}
        </Campo>
        <Campo label="Atenção: aquecidos com proxy ≤" dica="Linhas prontas e protegidas.">
          {(id) => <input id={id} type="number" min={0} className="ct-num" value={l.protegidosAtencao} onChange={(e) => setL({ ...l, protegidosAtencao: Math.max(0, Number(e.target.value) || 0) })} />}
        </Campo>
      </Campos>
      <Acoes style={{ marginTop: 12 }}>
        <Botao variante="primario" disabled={!mudou || invalido || salvando} onClick={async () => {
          setSalvando(true);
          await chamar("/api/marketing/contingencia/config", "PUT", { limites: l });
          setSalvando(false);
        }}>{salvando ? "Salvando…" : "Salvar limites"}</Botao>
      </Acoes>
    </Bloco>
  );
}

// ── Credenciais ──────────────────────────────────────────────────────────────
function Credenciais() {
  return (
    <Bloco titulo="Credenciais dos aparelhos" icone="lock"
      sub="Senha de celular e de pasta segura nunca ficam nesta tela.">
      <p style={{ fontSize: 13, lineHeight: 1.5 }}>
        Guarde as senhas no <b>Cofre de senhas</b> (Acessos &amp; Infra › Cofre): elas são cifradas no
        banco, ficam mascaradas, só quem tem a chave do cofre revela — com um botão explícito —
        e cada revelação fica registrada com quem e quando. Cadastre como serviço
        &quot;Celular da contingência&quot; no nome da pessoa que usa o aparelho.
      </p>
      <Acoes style={{ marginTop: 12 }}>
        <Link href="/infraestrutura" prefetch={false} className="ui-btn" data-variante="secundario" style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: "var(--tap)", padding: "0 16px", borderRadius: 12, border: "1px solid var(--border)", textDecoration: "none", color: "inherit", fontWeight: 650, fontSize: 13.5 }}>
          <Icon name="lock" size={15} color="currentColor" /> Abrir Acessos &amp; Infra › Cofre de senhas
        </Link>
      </Acoes>
    </Bloco>
  );
}

// ── Pendências ───────────────────────────────────────────────────────────────
export function Pendencias({ painel, chamar }: { painel: Painel; chamar: Chamar }) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [data, setData] = useState("");
  const [mostrarFeitas, setMostrarFeitas] = useState(false);
  const lista = painel.pendencias.filter((p) => mostrarFeitas || p.status === "aberta");
  return (
    <Bloco titulo="Pendências / próximas ações" icone="checklist" sub={`${painel.consolidado.pendenciasAbertas} aberta${painel.consolidado.pendenciasAbertas === 1 ? "" : "s"}`}
      acoes={<button type="button" className="ct-chip" aria-pressed={mostrarFeitas} onClick={() => setMostrarFeitas((v) => !v)}>Mostrar feitas</button>}>
      <div>
        {lista.map((p) => (
          <div key={p.id} className="ct-pend" data-feita={p.status === "feita" ? "1" : "0"}>
            <Caixa marcado={p.status === "feita"} titulo={`Concluir: ${p.titulo}`}
              onChange={() => void chamar("/api/marketing/contingencia/pendencia", "PATCH", { id: p.id, status: p.status === "feita" ? "aberta" : "feita" })} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="ct-pend-t" style={{ fontWeight: 620, fontSize: 13.5 }}>{p.titulo}</div>
              {(p.descricao || p.responsavelNome || p.data) && <div className="ct-sub">{[p.responsavelNome, p.data ? `até ${p.data.split("-").reverse().join("/")}` : null, p.descricao].filter(Boolean).join(" · ")}</div>}
            </div>
            <BotaoIcone icone="trash" titulo="Apagar pendência" variante="sutil" tamanho="sm"
              onClick={() => { if (confirm(`Apagar "${p.titulo}"?`)) void chamar(`/api/marketing/contingencia/pendencia?id=${p.id}`, "DELETE"); }} />
          </div>
        ))}
        {!lista.length && <p className="ct-sub" style={{ marginInline: "auto" }}>Nada pendente.</p>}
      </div>
      <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <Campos min={160}>
          <Campo label="Nova pendência" largo>{(id) => <input id={id} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Fazer novos suportes de celular" />}</Campo>
          <Campo label="Responsável">{(id) => <input id={id} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />}</Campo>
          <Campo label="Prazo">{(id) => <input id={id} type="date" value={data} onChange={(e) => setData(e.target.value)} />}</Campo>
          <Campo label="Detalhe" largo>{(id) => <input id={id} value={descricao} onChange={(e) => setDescricao(e.target.value)} />}</Campo>
        </Campos>
        <Acoes style={{ marginTop: 10 }}>
          <Botao variante="secundario" icone="plus" disabled={!titulo.trim()} onClick={async () => {
            const r = await chamar("/api/marketing/contingencia/pendencia", "POST", { titulo, descricao, responsavelNome: responsavel, data: data || null });
            if (r) { setTitulo(""); setDescricao(""); setResponsavel(""); setData(""); }
          }}>Adicionar</Botao>
        </Acoes>
      </div>
    </Bloco>
  );
}

// ── Proxies ──────────────────────────────────────────────────────────────────
export function Proxies({ painel, chamar }: { painel: Painel; chamar: Chamar }) {
  const [novo, setNovo] = useState({ identificacao: "", custoMensal: "", compradoEm: "" });
  const numeros = painel.ativos.filter((n) => n.tipo === "numero" && n.status !== "aposentado");
  const alvoDe = (p: Proxy) => (p.numeroId ? `n:${p.numeroId}` : p.aparelhoNome ? `a:${p.aparelhoNome}` : "");
  const trocarAlvo = (p: Proxy, v: string) => {
    const body = v.startsWith("n:") ? { numeroId: v.slice(2), aparelhoNome: null }
      : v.startsWith("a:") ? { numeroId: null, aparelhoNome: v.slice(2) } : { numeroId: null, aparelhoNome: null };
    void chamar("/api/marketing/contingencia/proxy", "PATCH", { id: p.id, ...body });
  };
  return (
    <Bloco titulo="Proxies" icone="shield" sub={`${painel.proxies.length} comprado${painel.proxies.length === 1 ? "" : "s"} · ${fmtBRL(painel.consolidado.proxies.gastoMensal)} por mês nos ativos`}>
      <div style={{ overflow: "hidden" }}>
        {painel.proxies.map((p) => (
          <div key={p.id} className="ct-linha ct-linha-proxy">
            <span style={{ fontWeight: 620, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.identificacao}</span>
            <select className="ct-sel ct-c-mid" value={alvoDe(p)} onChange={(e) => trocarAlvo(p, e.target.value)} aria-label={`Proteção do proxy ${p.identificacao}`}>
              <option value="">— livre —</option>
              <optgroup label="Celulares">{painel.celulares.map((c) => <option key={c.id} value={`a:${c.nome}`}>{c.nome}</option>)}</optgroup>
              <optgroup label="Números">{numeros.map((n) => <option key={n.id} value={`n:${n.id}`}>{n.nome}</option>)}</optgroup>
            </select>
            <select className="ct-sel" value={p.status} aria-label="Status do proxy"
              onChange={(e) => void chamar("/api/marketing/contingencia/proxy", "PATCH", { id: p.id, status: e.target.value as StatusProxy })}>
              {STATUS_PROXY.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <input className="ct-num" type="number" min={0} step="0.01" defaultValue={p.custoMensal} aria-label="Custo mensal"
              onBlur={(e) => { const v = Number(e.target.value); if (v !== p.custoMensal && v >= 0) void chamar("/api/marketing/contingencia/proxy", "PATCH", { id: p.id, custoMensal: v }); }} />
            <BotaoIcone icone="trash" titulo="Apagar proxy" variante="sutil" tamanho="sm"
              onClick={() => { if (confirm(`Apagar o proxy ${p.identificacao}?`)) void chamar(`/api/marketing/contingencia/proxy?id=${p.id}`, "DELETE"); }} />
          </div>
        ))}
        {!painel.proxies.length && <p className="ct-sub" style={{ marginInline: "auto" }}>Nenhum proxy cadastrado.</p>}
      </div>
      <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <Campos min={160}>
          <Campo label="Identificação">{(id) => <input id={id} value={novo.identificacao} onChange={(e) => setNovo({ ...novo, identificacao: e.target.value })} placeholder="PX-07" />}</Campo>
          <Campo label="Custo mensal (R$)">{(id) => <input id={id} type="number" min={0} step="0.01" value={novo.custoMensal} onChange={(e) => setNovo({ ...novo, custoMensal: e.target.value })} />}</Campo>
          <Campo label="Comprado em">{(id) => <input id={id} type="date" value={novo.compradoEm} onChange={(e) => setNovo({ ...novo, compradoEm: e.target.value })} />}</Campo>
        </Campos>
        <Acoes style={{ marginTop: 10 }}>
          <Botao variante="secundario" icone="plus" disabled={!novo.identificacao.trim()} onClick={async () => {
            const r = await chamar("/api/marketing/contingencia/proxy", "POST", { identificacao: novo.identificacao, custoMensal: novo.custoMensal || 0, compradoEm: novo.compradoEm || null });
            if (r) setNovo({ identificacao: "", custoMensal: "", compradoEm: "" });
          }}>Adicionar proxy</Botao>
        </Acoes>
        <p className="ct-sub" style={{ marginTop: 8 }}>Pra comprar vários de uma vez, use o lote na Atualização de Hoje.</p>
      </div>
    </Bloco>
  );
}

// ── Custos ───────────────────────────────────────────────────────────────────
export function Custos({ painel, chamar }: { painel: Painel; chamar: Chamar }) {
  const [novo, setNovo] = useState<{ tipo: Custo["tipo"]; descricao: string; valor: string; periodicidade: Custo["periodicidade"] }>({ tipo: "plano_chip", descricao: "", valor: "", periodicidade: "mensal" });
  return (
    <Bloco titulo="Custos (planos dos chips e outros)" icone="cash"
      sub={`Planos ${fmtBRL(painel.consolidado.custos.planos)} por mês · o gasto com proxy sai do cadastro de proxies.`}>
      <div style={{ overflow: "hidden" }}>
        {painel.custos.map((c) => (
          <div key={c.id} className="ct-linha ct-linha-custo">
            <span style={{ fontWeight: 620, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.descricao}</span>
            <span className="ct-c-mid" style={{ color: "var(--text-dim)" }}>{c.tipo === "plano_chip" ? "Plano de chip" : "Outro"} · {c.periodicidade === "mensal" ? "mensal" : "único"}</span>
            <input className="ct-num" type="number" min={0} step="0.01" defaultValue={c.valor} aria-label="Valor"
              onBlur={(e) => { const v = Number(e.target.value); if (v !== c.valor && v >= 0) void chamar("/api/marketing/contingencia/custo", "PATCH", { id: c.id, valor: v }); }} />
            <button type="button" className="ct-chip" aria-pressed={c.ativo} onClick={() => void chamar("/api/marketing/contingencia/custo", "PATCH", { id: c.id, ativo: !c.ativo })}>{c.ativo ? "Ativo" : "Pausado"}</button>
            <BotaoIcone icone="trash" titulo="Apagar custo" variante="sutil" tamanho="sm"
              onClick={() => { if (confirm(`Apagar "${c.descricao}"?`)) void chamar(`/api/marketing/contingencia/custo?id=${c.id}`, "DELETE"); }} />
          </div>
        ))}
        {!painel.custos.length && <p className="ct-sub" style={{ marginInline: "auto" }}>Nenhum custo informado.</p>}
      </div>
      <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <Campos min={160}>
          <Campo label="Descrição" largo>{(id) => <input id={id} value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} placeholder="Plano Fluke 30 chips" />}</Campo>
          <Campo label="Tipo">{(id) => (
            <select id={id} className="ct-sel" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as Custo["tipo"] })}>
              <option value="plano_chip">Plano de chip</option><option value="outro">Outro</option>
            </select>)}
          </Campo>
          <Campo label="Valor (R$)">{(id) => <input id={id} type="number" min={0} step="0.01" value={novo.valor} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} />}</Campo>
          <Campo label="Periodicidade">{(id) => (
            <select id={id} className="ct-sel" value={novo.periodicidade} onChange={(e) => setNovo({ ...novo, periodicidade: e.target.value as Custo["periodicidade"] })}>
              <option value="mensal">Mensal</option><option value="unico">Único</option>
            </select>)}
          </Campo>
        </Campos>
        <Acoes style={{ marginTop: 10 }}>
          <Botao variante="secundario" icone="plus" disabled={!novo.descricao.trim() || novo.valor === ""} onClick={async () => {
            const r = await chamar("/api/marketing/contingencia/custo", "POST", novo);
            if (r) setNovo({ tipo: "plano_chip", descricao: "", valor: "", periodicidade: "mensal" });
          }}>Adicionar custo</Botao>
        </Acoes>
      </div>
    </Bloco>
  );
}

// ── Celulares ────────────────────────────────────────────────────────────────
export function Celulares({ painel, chamar }: { painel: Painel; chamar: Chamar }) {
  const [novo, setNovo] = useState({ nome: "", modelo: "", identificacao: "", responsavelNome: "" });
  const patch = (c: Celular, b: Record<string, unknown>) => void chamar("/api/marketing/contingencia/celular", "PATCH", { id: c.id, ...b });
  return (
    <Bloco titulo="Celulares" icone="device-mobile"
      sub="A ficha vem do Aquecimento (foto e lugar são editados lá). Aqui entram modelo, identificação, situação e responsável.">
      <div style={{ overflow: "hidden" }}>
        {painel.celulares.map((c) => (
          <div key={c.id} className="ct-linha ct-linha-celular">
            {/* O nome é editável aqui porque é ele que casa o celular com os
                chips: a rota do aparelho renomeia e leva junto os chips e os
                proxies que apontavam pro nome antigo. */}
            <input className="ct-sel" defaultValue={c.nome} aria-label="Nome do aparelho" style={{ fontWeight: 620 }}
              onBlur={(e) => {
                const novo = e.target.value.trim();
                if (!novo) { e.target.value = c.nome; return; }
                if (novo !== c.nome) void chamar("/api/marketing/aquecimento/aparelho", "PATCH", { nome: c.nome, renomear: novo });
              }} />
            <input className="ct-sel ct-c-mid" defaultValue={c.modelo ?? ""} placeholder="Modelo" aria-label="Modelo"
              onBlur={(e) => { if (e.target.value !== (c.modelo ?? "")) patch(c, { modelo: e.target.value }); }} />
            <input className="ct-sel" defaultValue={c.identificacao ?? ""} placeholder="Identificação (IMEI, etiqueta)" aria-label="Identificação"
              onBlur={(e) => { if (e.target.value !== (c.identificacao ?? "")) patch(c, { identificacao: e.target.value }); }} />
            <select className="ct-sel" value={c.situacao} aria-label="Situação" onChange={(e) => patch(c, { situacao: e.target.value as SituacaoCelular })}>
              {SITUACAO_CELULAR.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <input className="ct-sel" defaultValue={c.responsavelNome ?? ""} placeholder="Responsável" aria-label="Responsável"
              onBlur={(e) => { if (e.target.value !== (c.responsavelNome ?? "")) patch(c, { responsavelNome: e.target.value }); }} />
          </div>
        ))}
        {!painel.celulares.length && <p className="ct-sub" style={{ marginInline: "auto" }}>Nenhum celular com ficha.</p>}
      </div>
      <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <Campos min={160}>
          <Campo label="Nome do aparelho" dica="Igual ao campo “aparelho” dos chips, pra casar.">{(id) => <input id={id} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Moto G54 · mesa 3" />}</Campo>
          <Campo label="Modelo">{(id) => <input id={id} value={novo.modelo} onChange={(e) => setNovo({ ...novo, modelo: e.target.value })} placeholder="Moto G54" />}</Campo>
          <Campo label="Identificação">{(id) => <input id={id} value={novo.identificacao} onChange={(e) => setNovo({ ...novo, identificacao: e.target.value })} />}</Campo>
          <Campo label="Responsável">{(id) => <input id={id} value={novo.responsavelNome} onChange={(e) => setNovo({ ...novo, responsavelNome: e.target.value })} />}</Campo>
        </Campos>
        <Acoes style={{ marginTop: 10 }}>
          <Botao variante="secundario" icone="plus" disabled={!novo.nome.trim()} onClick={async () => {
            const r = await chamar("/api/marketing/contingencia/celular", "POST", novo);
            if (r) setNovo({ nome: "", modelo: "", identificacao: "", responsavelNome: "" });
          }}>Adicionar celular</Botao>
        </Acoes>
      </div>
    </Bloco>
  );
}
