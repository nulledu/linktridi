"use client";

// ── Contingência Telefônica ──────────────────────────────────────────────────
// A hierarquia pedida, sem gráfico: linha principal (4 cards grandes), segunda
// área (estoque, Fluke, proxies, custo), atendentes, as quatro taxas, e só
// então a estrutura (modelos, operadoras, situação, proxies, custos) e a lista
// de números com filtros.

import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "../../Icon";
import { Botao } from "../../ui/controles";
import { PillStatus, Pill } from "../aquecimento/pecas";
import { Kpi, Bloco, Distribuicao, TaxaCard, CartaoAtendente, Vazio, Origem } from "./pecas";
import {
  fmtBRL, filtrarNumeros, flagsDe, indiceDeProxies, chaveAtendente, FILTROS,
  type Painel, type ChaveFiltro,
} from "@/lib/contingencia-const";

export function Telefonica({ painel, verAtendente, inventario, onNovoNumero, onAbrirNumero }: {
  painel: Painel; verAtendente: (chave: string) => void;
  /** O inventário do aquecimento (aparelhos com seus chips), montado pelo cliente. */
  inventario?: ReactNode; onNovoNumero?: () => void;
  /** Abre a gaveta do chip — é onde nome, operadora, aparelho, responsável,
   *  status, roteiro e anotação são editados. Sem isto a lista é só leitura. */
  onAbrirNumero?: (id: string) => void;
}) {
  const c = painel.consolidado;
  const cobertura = c.numeros.total ? c.numeros.comProxy / c.numeros.total : null;
  const idx = useMemo(() => indiceDeProxies(painel.proxies), [painel.proxies]);

  const [chaves, setChaves] = useState<ChaveFiltro[]>([]);
  const [atendente, setAtendente] = useState("");
  const [operadora, setOperadora] = useState("");
  const [modelo, setModelo] = useState("");
  const [mostrar, setMostrar] = useState(30);

  const alterna = (k: ChaveFiltro) => setChaves((cur) => cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]);
  const filtrados = useMemo(
    () => filtrarNumeros(painel.ativos, painel.proxies, painel.celulares, { chaves, atendente: atendente || null, operadora: operadora || null, modelo: modelo || null }),
    [painel, chaves, atendente, operadora, modelo]);
  const temFiltro = chaves.length > 0 || !!atendente || !!operadora || !!modelo;

  const emRisco = c.atendentes.filter((a) => a.saude !== "saudavel");
  const proxiesLivres = c.proxies.livres;

  return (
    <div className="ct-tel ct-secoes">
      {/* ── Linha principal ── */}
      <div className="ct-grade ct-grade-4 kpi-row">
        <Kpi tom="contexto" icone="device-mobile" rotulo="Celulares disponíveis" valor={c.celulares.disponiveis}
          sub={`${c.celulares.total} no parque · ${c.celulares.emUso} em uso${c.celulares.manutencao ? ` · ${c.celulares.manutencao} em manutenção` : ""}`}
          origem="contado das fichas de aparelho" />
        <Kpi tom="contexto" icone="circle-check" rotulo="Números prontos" valor={c.numeros.prontos}
          sub={`prontos para entregar · ${c.numeros.emUso} já em uso`} origem="status “aquecido” no Aquecimento" />
        <Kpi tom="contexto" icone="flame" rotulo="Números em aquecimento" valor={c.numeros.emAquecimento}
          sub={`${c.numeros.naoAquecidos} ainda não aquecidos`} origem="status “aquecendo” / “novo”" />
        <Kpi tom={cobertura !== null && cobertura < 0.5 ? "alerta" : "contexto"} icone="shield-check" rotulo="Cobertura de proxy"
          valor={cobertura === null ? "—" : Math.round(cobertura * 100)} unidade={cobertura === null ? undefined : "%"}
          sub={`${c.numeros.comProxy} com proxy · ${c.numeros.semProxy} sem`} cobertura={cobertura} origem="proxies ativos × números" />
      </div>

      {/* ── Segunda área ── */}
      <div className="ct-grade ct-grade-4">
        <Kpi icone="box" rotulo="Chips em estoque" valor={c.numeros.emEstoque}
          sub={`${c.numeros.emEstoqueFluke} Fluke · novos, fora de aparelho`} origem="status “novo”, sem aparelho e sem atendente" />
        <Kpi icone="bolt" rotulo="Chips Fluke" valor={c.numeros.fluke}
          sub={`de ${c.numeros.total} números ativos`} origem="operadora = Fluke" />
        <Kpi icone="shield" rotulo="Proxies comprados" valor={c.proxies.comprados}
          sub={`${c.proxies.ativos} ativos · ${c.proxies.associados} em uso · ${proxiesLivres} livre${proxiesLivres === 1 ? "" : "s"}`} origem="cadastro de proxies" />
        <Kpi icone="cash" rotulo="Custo mensal" valor={fmtBRL(c.custos.total)}
          sub={`proxies ${fmtBRL(c.custos.proxies)} + planos ${fmtBRL(c.custos.planos)}`} origem="proxies (soma) + planos (informado)" />
      </div>

      {/* ── Atendentes ── */}
      <Bloco titulo="Atendentes" icone="users"
        sub={c.atendentes.length ? `${c.atendentes.length} com número · ${emRisco.length} precisando de olho` : "Ninguém com número atribuído ainda."}>
        {c.atendentes.length ? (
          <div className="ct-atendentes">
            {c.atendentes.map((a) => <CartaoAtendente key={a.chave} a={a} onClick={() => verAtendente(a.chave)} />)}
          </div>
        ) : <Vazio icone="users" titulo="Sem perfis ainda" texto="Defina o responsável de cada chip no Aquecimento." />}
      </Bloco>

      {/* ── Métricas ── */}
      <section>
        <div className="ct-bloco-cab" style={{ marginBottom: 10 }}>
          <div>
            <h2 className="ct-h2"><Icon name="percentage" size={17} color="var(--ct-cor)" />Métricas de contingência</h2>
            <p className="ct-sub">Calculadas dos números acima. “—” quando falta dado pra dividir.</p>
          </div>
        </div>
        <div className="ct-grade ct-grade-4">
          <TaxaCard taxa={c.taxas.produtividade} />
          <TaxaCard taxa={c.taxas.aquecimento} />
          <TaxaCard taxa={c.taxas.protegidos} />
          <TaxaCard taxa={c.taxas.qualidade} />
        </div>
      </section>

      {/* ── Estrutura ── */}
      <div className="ct-grade" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", alignItems: "start" }}>
        <Bloco titulo="Modelos de celular" icone="device-mobile" sub={`${c.celulares.total} aparelho${c.celulares.total === 1 ? "" : "s"} ativos`}>
          <Distribuicao itens={c.celulares.porModelo} vazio="Nenhum celular cadastrado." />
          <Origem>agrupado sozinho pelo modelo da ficha</Origem>
        </Bloco>
        <Bloco titulo="Chips por operadora" icone="bolt" sub="Agrupamento automático — operadora nova entra sozinha.">
          <Distribuicao itens={c.operadoras.map((o) => ({ rotulo: o.rotulo, qtd: o.qtd }))} vazio="Nenhum chip cadastrado." />
          {c.operadoras.length > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 4, fontSize: 12, color: "var(--text-dim)" }}>
              {c.operadoras.map((o) => (
                <div key={o.rotulo} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{o.rotulo}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{o.aquecidos} aquec. · {o.emAquecimento} aquecendo · {o.naoAquecidos} não</span>
                </div>
              ))}
            </div>
          )}
        </Bloco>
        <Bloco titulo="Situação dos números" icone="list-check" sub={`${c.numeros.total} ativos · ${c.numeros.aposentados} aposentados fora da conta`}>
          <Distribuicao itens={[
            { rotulo: "Prontos para entregar", qtd: c.numeros.prontos },
            { rotulo: "Em uso", qtd: c.numeros.emUso },
            { rotulo: "Em aquecimento", qtd: c.numeros.emAquecimento },
            { rotulo: "Não aquecidos", qtd: c.numeros.naoAquecidos },
            { rotulo: "Restringidos", qtd: c.numeros.restritos },
            { rotulo: "Bloqueados", qtd: c.numeros.bloqueados },
          ]} />
        </Bloco>
        <Bloco titulo="Proxies" icone="shield" sub={`${fmtBRL(c.proxies.gastoMensal)} por mês`}>
          <Distribuicao itens={[
            { rotulo: "Números com proxy", qtd: c.numeros.comProxy },
            { rotulo: "Números sem proxy", qtd: c.numeros.semProxy },
            { rotulo: "Celulares com proxy", qtd: c.celulares.comProxy },
            { rotulo: "Celulares sem proxy", qtd: c.celulares.semProxy },
            { rotulo: "Proxies livres", qtd: c.proxies.livres },
          ]} />
          <Origem>associação em Atualização de Hoje ou Configurações</Origem>
        </Bloco>
        <Bloco titulo="Custos mensais" icone="cash" sub="Proxies + planos dos chips.">
          <div style={{ display: "grid", gap: 8 }}>
            <Linha rot="Proxies" val={fmtBRL(c.custos.proxies)} sub="soma dos proxies ativos" />
            <Linha rot="Planos dos chips" val={fmtBRL(c.custos.planos)} sub="informado à mão" />
            {c.custos.outros > 0 && <Linha rot="Outros" val={fmtBRL(c.custos.outros)} sub="fora do total" />}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <Linha rot="Total da contingência telefônica" val={fmtBRL(c.custos.total)} forte />
            </div>
          </div>
        </Bloco>
      </div>

      {/* ── Números ── */}
      <Bloco titulo="Números" icone="device-mobile" sub={`${filtrados.length} de ${c.numeros.total}${temFiltro ? " com o filtro" : ""}`}
        acoes={<>
          {temFiltro && <Botao variante="sutil" tamanho="sm" onClick={() => { setChaves([]); setAtendente(""); setOperadora(""); setModelo(""); }}>Limpar filtros</Botao>}
          {onNovoNumero && <Botao tamanho="sm" icone="plus" onClick={onNovoNumero}>Novo número</Botao>}
        </>}>
        <div className="ct-chips" style={{ marginBottom: 10 }}>
          {FILTROS.map((f) => (
            <button key={f.key} type="button" className="ct-chip" aria-pressed={chaves.includes(f.key)} onClick={() => alterna(f.key)}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", marginBottom: 6 }}>
          <select className="ct-sel" value={atendente} onChange={(e) => setAtendente(e.target.value)} aria-label="Atendente">
            <option value="">Todos os atendentes</option>
            {c.atendentes.map((a) => <option key={a.chave} value={a.chave}>{a.nome}</option>)}
          </select>
          <select className="ct-sel" value={operadora} onChange={(e) => setOperadora(e.target.value)} aria-label="Operadora">
            <option value="">Todas as operadoras</option>
            {c.operadoras.map((o) => <option key={o.rotulo} value={o.rotulo}>{o.rotulo}</option>)}
          </select>
          <select className="ct-sel" value={modelo} onChange={(e) => setModelo(e.target.value)} aria-label="Modelo de celular">
            <option value="">Todos os modelos</option>
            {c.celulares.porModelo.map((m) => <option key={m.rotulo} value={m.rotulo}>{m.rotulo}</option>)}
          </select>
        </div>
        {filtrados.length ? (
          <div style={{ overflow: "hidden" }}>
            <div className="ct-linha ct-linha-cab"><span>Número</span><span>Operadora</span><span>Atendente · aparelho</span><span>Status</span><span>Proxy</span></div>
            {filtrados.slice(0, mostrar).map((n) => {
              const f = flagsDe(n, idx);
              const at = c.atendentes.find((a) => a.chave === chaveAtendente(n.responsavelId, n.responsavelNome));
              const conteudo = (
                <>
                  <span style={{ fontWeight: 620, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.nome}</span>
                  <span className="ct-c-mid">
                    <span>{n.operadora || "sem operadora"}</span>
                    <span className="mob-only">· {at?.nome ?? "sem atendente"}{n.aparelho ? ` · ${n.aparelho}` : ""}</span>
                  </span>
                  <span className="desk-only" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-dim)" }}>
                    {at?.nome ?? "—"}{n.aparelho ? ` · ${n.aparelho}` : ""}
                  </span>
                  <PillStatus status={n.status} />
                  <Pill cor={f.comProxy ? "var(--ok)" : "var(--neutro)"}>{f.comProxy ? "Proxy" : "Sem proxy"}</Pill>
                </>
              );
              return onAbrirNumero ? (
                <button key={n.id} type="button" className="ct-linha ct-linha-btn" onClick={() => onAbrirNumero(n.id)}
                  title={`Abrir ${n.nome} para editar`}>{conteudo}</button>
              ) : <div key={n.id} className="ct-linha">{conteudo}</div>;
            })}
            {filtrados.length > mostrar && (
              <Botao tamanho="sm" style={{ marginTop: 10 }} onClick={() => setMostrar((m) => m + 50)}>
                Ver mais {Math.min(50, filtrados.length - mostrar)}
              </Botao>
            )}
          </div>
        ) : <Vazio titulo={temFiltro ? "Nenhum número com esse filtro" : "Nenhum número cadastrado"} texto={temFiltro ? undefined : "Cadastre chips no Aquecimento ou em lote na Atualização de Hoje."} />}
      </Bloco>

      {/* O inventário do aquecimento (aparelho com seus chips) fecha a visão:
          é onde se cadastra número novo e se abre a linha do tempo. */}
      {inventario}
    </div>
  );
}

function Linha({ rot, val, sub, forte }: { rot: string; val: string; sub?: string; forte?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, fontSize: forte ? 14 : 13 }}>
      <span style={{ minWidth: 0 }}>{rot}{sub && <small style={{ display: "block", color: "var(--text-dim)", fontSize: 11 }}>{sub}</small>}</span>
      <b style={{ fontVariantNumeric: "tabular-nums", fontSize: forte ? 17 : 14 }}>{val}</b>
    </div>
  );
}
