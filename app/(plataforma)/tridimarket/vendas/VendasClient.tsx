"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import type { MarketPerson, MarketProduct, MarketProfile } from "../../../../lib/tridimarket/types";
import { formatMarketCurrency } from "../../../../lib/tridimarket/view";
import { centavosDoTexto, reaisDeCentavos, textoDeCentavos } from "../../../../lib/tridimarket/moeda";
import { Cabecalho, intervaloDe, useDadosDoFiltro, useFiltros } from "../Filtros";
import { paramsDoPeriodo } from "../../../../lib/tridimarket/periodo";
import { Aviso } from "../DashboardClient";
import { SeletorPessoa, type OpcaoPessoa } from "../SeletorPessoa";
import { Avatar, Badge, Card, Empty, INDIGO, SkelStats, SkelTabela, Stat, haQuantoTempo, marketRequest } from "../ui";
import { Busca } from "../pessoas/PessoasClient";
import { useIsMobile } from "../../ui/useMediaQuery";
import { atributosDe } from "../../ui/campos";
import { TrocaIcone } from "../../ui/micro";
import { Botao } from "../../ui/controles";

type Settings = { profiles: MarketProfile[]; schemaReady: boolean };
type ItemVenda = { name: string; imageUrl: string | null; quantity: number; total: number };
type Venda = {
  id: number; at: string; paid: boolean;
  employeeId: number; employeeName: string; employeeImage: string | null;
  unitName: string | null; items: ItemVenda[]; total: number;
};

export function VendasClient() {
  // Balcão é celular: abaixo de 700px a tabela de 7 colunas vira lista de
  // cartões (ver ListaCartoes). No computador continua tabela, sem uma vírgula
  // de diferença.
  const celular = useIsMobile();
  const [filtros, setFiltros] = useFiltros();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<number | null>(null);
  const [aba, setAba] = useState<"todos" | "pendentes" | "pagos">("todos");
  const [marcando, setMarcando] = useState<number | null>(null);
  const [lancando, setLancando] = useState(false);
  const [avisoOk, setAvisoOk] = useState<string | null>(null);
  // Compras que o tablet deu como enviadas e que não têm venda no sistema.
  const [semVenda, setSemVenda] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // Trocar de dia/empresa limpa a tabela na hora (esqueleto), em vez de manter
  // as vendas do recorte anterior até a nova resposta chegar.
  const { chave, desatualizado, marcarCarregado } = useDadosDoFiltro(filtros);

  const escopo = filtros.profileId ? `&profileId=${encodeURIComponent(filtros.profileId)}` : "";
  const intervalo = intervaloDe(filtros);
  const chaveIntervalo = `${intervalo.de}|${intervalo.ate}`;
  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    const [conf, lista] = await Promise.allSettled([
      marketRequest<Settings>("settings"),
      marketRequest<{ vendas: Venda[]; operacoesSemVenda?: number }>(`vendas?${paramsDoPeriodo(intervalo)}${escopo}`),
    ]);
    if (conf.status === "fulfilled") setSettings(conf.value);
    if (lista.status === "fulfilled") {
      setVendas(lista.value.vendas);
      setSemVenda(lista.value.operacoesSemVenda ?? 0);
      marcarCarregado();
    }
    else setErro(lista.reason instanceof Error ? lista.reason.message : "Falha ao carregar as vendas.");
    setCarregando(false);
  // `chave` junto: mudança de recorte sem mudança de consulta também precisa
  // disparar busca, senão o esqueleto fica preso sem erro e sem saída.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, chaveIntervalo, escopo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const visiveis = useMemo(() => {
    const termo = busca.toLowerCase().trim();
    return vendas
      .filter((v) => aba === "todos" || (aba === "pagos" ? v.paid : !v.paid))
      .filter((v) => !termo
        || v.employeeName.toLowerCase().includes(termo)
        || v.items.some((i) => i.name.toLowerCase().includes(termo)));
  }, [vendas, busca, aba]);

  // Marca UMA venda como paga (ou volta a pendente). Atualiza a linha na hora,
  // sem recarregar a lista inteira — a resposta é instantânea.
  async function marcarPago(id: number, paid: boolean) {
    setMarcando(id); setErro(null);
    try {
      await marketRequest("vendas", { method: "PATCH", body: JSON.stringify({ id, paid }) });
      setVendas((vs) => vs.map((v) => (v.id === id ? { ...v, paid } : v)));
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível atualizar."); }
    finally { setMarcando(null); }
  }

  // Exporta o que está VISÍVEL (respeita tab, busca e período) para um CSV que o
  // Excel abre direto. Separador ';' e BOM porque é o que o Excel pt-BR espera.
  function exportar() {
    const cabecalho = ["Usuário", "Data", "Unidade", "Itens", "Total", "Situação"];
    const linhas = visiveis.map((v) => [
      v.employeeName,
      new Date(v.at).toLocaleString("pt-BR"),
      v.unitName ?? "",
      String(v.items.reduce((s, i) => s + i.quantity, 0)),
      formatMarketCurrency(v.total).replace(/ /g, " "),
      v.paid ? "Pago" : "Em aberto",
    ]);
    const escapar = (c: string) => `"${String(c).replace(/"/g, '""')}"`;
    const csv = "﻿" + [cabecalho, ...linhas].map((l) => l.map(escapar).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vendas-tridimarket-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const total = visiveis.reduce((s, v) => s + v.total, 0);
  const itens = visiveis.reduce((s, v) => s + v.items.reduce((x, i) => x + i.quantity, 0), 0);
  const emAberto = visiveis.filter((v) => !v.paid).reduce((s, v) => s + v.total, 0);

  return (
    <>
      <Cabecalho titulo="Vendas" descricao={`${visiveis.length} compra(s)`}
        filtros={filtros} setFiltros={setFiltros} perfis={settings?.profiles ?? []}
        carregando={carregando} onAtualizar={() => void carregar()}
        acoes={
          <>
            <Botao variante="primario" icone="plus" onClick={() => setLancando(true)}>Lançar venda</Botao>
            <Botao icone="download" onClick={exportar} disabled={!visiveis.length}>Exportar Excel</Botao>
          </>
        } />

      {erro && <Aviso tom="neg" icone="circle-x" titulo="Não foi possível carregar">{erro}</Aviso>}
      {avisoOk && <Aviso tom="pos" icone="circle-check" titulo="Pronto">{avisoOk}</Aviso>}
      {/* O tablet considera essas compras entregues e nunca vai reenviá-las: o
          aviso é a única forma de alguém saber que elas existiram. Aparece
          independente do filtro de período, porque a venda apagada não tem mais
          data para cair dentro dele. */}
      {semVenda > 0 && (
        <Aviso tom="neg" icone="alert-triangle" titulo="Compras sem venda no sistema">
          {semVenda === 1
            ? "1 compra registrada no tablet não tem venda correspondente — a venda foi excluída depois de sincronizada."
            : `${semVenda} compras registradas no tablet não têm venda correspondente — as vendas foram excluídas depois de sincronizadas.`}
          {" "}O tablet não reenvia essas compras: se elas valiam, precisam ser lançadas à mão.
        </Aviso>
      )}

      {desatualizado && !erro ? <SkelStats n={3} /> : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 12, marginBottom: 14 }}>
        <Stat label="Total vendido" value={formatMarketCurrency(total)} icon="shopping-cart" hint="no período e filtro" />
        <Stat label="Ainda em aberto" value={formatMarketCurrency(emAberto)} icon="clock" tone={emAberto > 0 ? "warn" : "neutral"} hint="não quitado" />
        <Stat label="Itens levados" value={String(itens)} icon="package" hint="unidades" />
      </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        {/* .tab-strip: se os três botões não couberem, a fileira rola de lado em
            vez de ser cortada. No computador não muda nada. */}
        <div role="group" aria-label="Situação" className="tab-strip" style={{ display: "flex", background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: 3, gap: 2 }}>
          {([["todos", "Todos"], ["pendentes", "Pendentes"], ["pagos", "Pagos"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)} aria-pressed={aba === k}
              style={{
                border: "none", cursor: "pointer", padding: "8px 16px", borderRadius: "var(--r-xs)", fontSize: 12.5, fontWeight: 700,
                background: aba === k ? INDIGO : "transparent", color: aba === k ? "#fff" : "var(--text-dim)",
              }}>{label}</button>
          ))}
        </div>
        <Busca valor={busca} onChange={setBusca} placeholder="Buscar por pessoa ou produto" />
      </div>

      {desatualizado && !erro ? <SkelTabela n={8} colunas={6} /> : (
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {celular && visiveis.length > 0 ? (
          <ListaCartoes vendas={visiveis} aberta={aberta} setAberta={setAberta} marcando={marcando} marcarPago={marcarPago} />
        ) : visiveis.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 620 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-dim)", fontSize: 11.5 }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Pessoa</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Quando</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Unidade</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Itens</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Total</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Situação</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((v) => {
                  const expandida = aberta === v.id;
                  return (
                    <Fragment key={v.id}>
                      <tr onClick={() => setAberta(expandida ? null : v.id)}
                        style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}>
                        <td style={{ padding: "10px 16px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <Avatar name={v.employeeName} url={v.employeeImage} size={28} />
                            <span style={{ fontWeight: 650, color: "var(--text)" }}>{v.employeeName}</span>
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", color: "var(--text-dim)" }}>{haQuantoTempo(v.at)}</td>
                        <td style={{ padding: "10px 16px", color: "var(--text-dim)" }}>{v.unitName ?? "—"}</td>
                        <td style={{ padding: "10px 16px" }}>
                          {/* Chevron deixa claro que a linha ABRE e mostra o que
                              a pessoa levou — sem ele ninguém descobria o
                              detalhe da compra. */}
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: expandida ? INDIGO : "var(--text-dim)", fontWeight: 600 }}>
                            <Icon name={expandida ? "chevron-down" : "chevron-right"} size={14} color={expandida ? INDIGO : "var(--text-dim)"} />
                            {v.items.reduce((s, i) => s + i.quantity, 0)} {v.items.reduce((s, i) => s + i.quantity, 0) === 1 ? "item" : "itens"}
                          </span>
                        </td>
                        <td style={{ padding: "10px 16px", color: "var(--text)", fontWeight: 650 }}>{formatMarketCurrency(v.total)}</td>
                        <td style={{ padding: "10px 16px" }}><Badge tone={v.paid ? "pos" : "warn"}>{v.paid ? "pago" : "em aberto"}</Badge></td>
                        {/* stopPropagation: o clique na linha expande os itens;
                            o botão de pagar não pode disparar isso junto. */}
                        <td style={{ padding: "10px 16px", textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                          {v.paid ? (
                            <Botao variante="sutil" tamanho="sm" onClick={() => marcarPago(v.id, false)} carregando={marcando === v.id}>Reabrir</Botao>
                          ) : (
                            <Botao variante="primario" tamanho="sm" onClick={() => marcarPago(v.id, true)} carregando={marcando === v.id} style={{ whiteSpace: "nowrap" }}>Definir como pago</Botao>
                          )}
                        </td>
                      </tr>
                      {expandida && (
                        <tr style={{ background: "var(--surface-2)" }}>
                          <td colSpan={7} style={{ padding: "10px 16px 14px 52px" }}>
                            {/* O QUE foi levado. Sem isto não há como responder
                                a quem contesta uma cobrança. */}
                            <div style={{ display: "grid", gap: 6 }}>
                              {v.items.map((i, idx) => (
                                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                                  <Miniatura url={i.imageUrl} nome={i.name} />
                                  <span style={{ flex: 1, color: "var(--text)" }}>{i.name}</span>
                                  <span style={{ color: "var(--text-dim)" }}>{i.quantity}×</span>
                                  <strong style={{ color: "var(--text)", minWidth: 76, textAlign: "right" }}>{formatMarketCurrency(i.total)}</strong>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="shopping-cart" title="Nenhuma venda no período" text="Ajuste o período, a empresa ou a busca." />}
      </Card>
      )}

      {lancando && (
        <ModalVendaManual
          onFechar={() => setLancando(false)}
          onLancada={(msg) => { setLancando(false); setAvisoOk(msg); void carregar(); }}
        />
      )}
    </>
  );
}

// Mesma venda, mesmas informações, sem tabela: no celular a linha de 620px só
// rolava de lado e, ao arrastar, o nome de quem comprou saía da tela junto — o
// botão de "pago" ficava a meia tela de distância da pessoa. Aqui cada venda é
// um cartão, e o toque no cabeçalho abre O QUE foi levado (o mesmo acordeão da
// tabela). Não usa o DataList porque ele não tem linha que expande, e o detalhe
// da compra é justamente o que resolve contestação de cobrança.
function ListaCartoes({ vendas, aberta, setAberta, marcando, marcarPago }: {
  vendas: Venda[];
  aberta: number | null;
  setAberta: (id: number | null) => void;
  marcando: number | null;
  marcarPago: (id: number, paid: boolean) => void;
}) {
  return (
    <ul style={{ display: "grid", gap: 8, listStyle: "none", margin: 0, padding: 10 }}>
      {vendas.map((v) => {
        const expandida = aberta === v.id;
        const qtd = v.items.reduce((s, i) => s + i.quantity, 0);
        return (
          <li key={v.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-2)", padding: 12, display: "grid", gap: 10 }}>
            <button type="button" onClick={() => setAberta(expandida ? null : v.id)} aria-expanded={expandida}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: 0, border: "none", background: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <Avatar name={v.employeeName} url={v.employeeImage} size={34} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.employeeName}
                </span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {haQuantoTempo(v.at)}{v.unitName ? ` · ${v.unitName}` : ""}
                </span>
              </span>
              <span style={{ flex: "none", textAlign: "right" }}>
                <strong style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: "var(--text)" }}>{formatMarketCurrency(v.total)}</strong>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 600, color: expandida ? INDIGO : "var(--text-dim)" }}>
                  <Icon name={expandida ? "chevron-down" : "chevron-right"} size={13} color={expandida ? INDIGO : "var(--text-dim)"} />
                  {qtd} {qtd === 1 ? "item" : "itens"}
                </span>
              </span>
            </button>

            {expandida && (
              <div style={{ display: "grid", gap: 8, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                {v.items.map((i, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5 }}>
                    <Miniatura url={i.imageUrl} nome={i.name} />
                    <span style={{ flex: 1, minWidth: 0, color: "var(--text)" }}>{i.name}</span>
                    <span style={{ flex: "none", color: "var(--text-dim)" }}>{i.quantity}×</span>
                    <strong style={{ flex: "none", color: "var(--text)", minWidth: 68, textAlign: "right" }}>{formatMarketCurrency(i.total)}</strong>
                  </div>
                ))}
              </div>
            )}

            {/* Situação e ação no rodapé: o alvo de "definir como pago" fica na
                altura do polegar e longe do cabeçalho que expande. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <Badge tone={v.paid ? "pos" : "warn"}>{v.paid ? "pago" : "em aberto"}</Badge>
              {v.paid ? (
                <Botao onClick={() => marcarPago(v.id, false)} carregando={marcando === v.id}>Reabrir</Botao>
              ) : (
                <Botao variante="primario" onClick={() => marcarPago(v.id, true)} carregando={marcando === v.id}>Definir como pago</Botao>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Lançar venda à mão: escolhe a pessoa (dropdown com busca), o valor e,
// opcionalmente, o produto. Carrega pessoas e produtos ao abrir.
function ModalVendaManual({ onFechar, onLancada }: { onFechar: () => void; onLancada: (msg: string) => void }) {
  const [pessoas, setPessoas] = useState<MarketPerson[]>([]);
  const [produtos, setProdutos] = useState<MarketProduct[]>([]);
  const [quem, setQuem] = useState("");
  const [valorCent, setValorCent] = useState(0);
  const [produtoId, setProdutoId] = useState<number | null>(null);
  const [buscaProd, setBuscaProd] = useState("");
  const [prodAberto, setProdAberto] = useState(false);
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [ps, pr] = await Promise.allSettled([marketRequest<MarketPerson[]>("employees"), marketRequest<MarketProduct[]>("products")]);
      if (ps.status === "fulfilled") setPessoas(ps.value);
      if (pr.status === "fulfilled") setProdutos(pr.value);
    })();
  }, []);

  // Uma opção por pessoa: o cadastro da empresa principal recebe a venda.
  const opcoes: OpcaoPessoa[] = useMemo(() => pessoas.map((p) => {
    const conta = p.accounts.find((c) => c.profileId === p.mainProfileId) ?? p.accounts[0];
    return { id: conta?.id ?? 0, nome: p.name, imagem: p.imageUrl, detalhe: p.unified ? `${p.accounts.length} empresas` : null, valor: p.open };
  }).filter((o) => o.id > 0), [pessoas]);

  const produtoEscolhido = produtos.find((p) => p.id === produtoId) ?? null;
  const prodVisiveis = useMemo(() => {
    const t = buscaProd.trim().toLowerCase();
    return (t ? produtos.filter((p) => p.name.toLowerCase().includes(t) || (p.barcode ?? "").includes(t)) : produtos).slice(0, 40);
  }, [produtos, buscaProd]);

  const valor = reaisDeCentavos(valorCent);

  async function lancar() {
    if (!quem || valorCent <= 0) return;
    setSalvando(true); setErro(null);
    try {
      await marketRequest("vendas", { method: "POST", body: JSON.stringify({ employeeId: Number(quem), amount: valor, productId: produtoId, note: nota || undefined }) });
      const pessoa = opcoes.find((o) => String(o.id) === quem)?.nome ?? "a pessoa";
      onLancada(`Venda de ${formatMarketCurrency(valor)} lançada para ${pessoa}.`);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível lançar a venda."); }
    finally { setSalvando(false); }
  }

  return (
    // .sheet-host/.sheet: no celular o modal cru vira folha presa embaixo, com
    // rolagem interna — sem isso "Lançar venda" nascia fora da tela assim que o
    // teclado subia. No computador as classes não existem.
    <div onClick={onFechar} className="sheet-host" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 22, width: "min(480px, 100%)" }} className="tm-workspace sheet">
        <strong style={{ fontSize: 17, color: "var(--text)", display: "block" }}>Lançar venda manual</strong>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "6px 0 16px" }}>
          Cai na conta da pessoa como uma compra. O produto é opcional — sem ele, é só um valor.
        </p>
        {erro && <div style={{ fontSize: 12.5, color: "var(--tf-neg)", marginBottom: 12, fontWeight: 600 }}>{erro}</div>}

        <label style={rotuloVM}>Pessoa</label>
        <SeletorPessoa opcoes={opcoes} valor={quem} onEscolher={setQuem} placeholder="Selecione quem levou" />

        <label style={{ ...rotuloVM, marginTop: 14 }}>Valor</label>
        <input {...atributosDe("dinheiro")} type="text" inputMode="numeric" value={textoDeCentavos(valorCent)} placeholder="R$ 0,00"
          onChange={(e) => setValorCent(centavosDoTexto(e.target.value))}
          style={{ ...campoVM, fontVariantNumeric: "tabular-nums", fontWeight: 600 }} />

        <label style={{ ...rotuloVM, marginTop: 14 }}>Produto (opcional)</label>
        <div style={{ position: "relative" }}>
          <button type="button" onClick={() => setProdAberto((v) => !v)}
            style={{ ...campoVM, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", textAlign: "left" }}>
            <span style={{ color: produtoEscolhido ? "var(--text)" : "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {produtoEscolhido?.name ?? "Sem produto"}
            </span>
            <TrocaIcone ligado={prodAberto} a="chevron-down" b="chevron-up" size={16} corA="var(--text-dim)" corB="var(--text-dim)" />
          </button>
          {prodAberto && (
            <div className="tm-menu" style={{ position: "absolute", zIndex: 60, top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--tm-menu, var(--surface))", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", boxShadow: "0 18px 40px -12px rgba(0,0,0,.45)", overflow: "hidden" }}>
              <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
                <input {...atributosDe("busca")} autoFocus value={buscaProd} onChange={(e) => setBuscaProd(e.target.value)} placeholder="Buscar produto"
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "var(--r-xs)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13 }} />
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto" }}>
                <button type="button" onClick={() => { setProdutoId(null); setProdAberto(false); }}
                  style={{ width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "transparent", cursor: "pointer", color: "var(--text-dim)", fontSize: 13 }}>Sem produto</button>
                {prodVisiveis.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setProdutoId(p.id); setProdAberto(false); }}
                    style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: 8, textAlign: "left", padding: "9px 12px", border: "none", background: p.id === produtoId ? `color-mix(in srgb, ${INDIGO} 12%, transparent)` : "transparent", cursor: "pointer", color: "var(--text)", fontSize: 13 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    <span style={{ color: "var(--text-dim)", flex: "none" }}>{formatMarketCurrency(p.price)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {produtoEscolhido && valorCent === 0 && (
          <button type="button" onClick={() => setValorCent(Math.round(produtoEscolhido.price * 100))}
            style={{ background: "none", border: "none", padding: "6px 0 0", cursor: "pointer", color: INDIGO, fontWeight: 700, fontSize: 12 }}>
            Usar o preço ({formatMarketCurrency(produtoEscolhido.price)})
          </button>
        )}

        <label style={{ ...rotuloVM, marginTop: 14 }}>Observação (opcional)</label>
        <input value={nota} onChange={(e) => setNota(e.target.value)} style={campoVM} />

        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 20 }}>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={lancar} carregando={salvando} disabled={!quem || valorCent <= 0}>Lançar venda</Botao>
        </div>
      </div>
    </div>
  );
}

const rotuloVM: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginBottom: 5 };
const campoVM: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14 };

function Miniatura({ url, nome }: { url: string | null; nome: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    // `contain` + fundo branco: a foto do catálogo é quadrada com fundo branco,
    // e cortar tirava marca e sabor da embalagem.
    return <img src={url} alt="" style={{ width: 26, height: 26, borderRadius: "var(--r-xs)", objectFit: "contain", flex: "none", background: "#fff" }} />;
  }
  return <span style={{ width: 26, height: 26, borderRadius: "var(--r-xs)", flex: "none", display: "grid", placeItems: "center", background: "var(--surface)", color: "var(--text-dim)", fontSize: 11, fontWeight: 800 }}>{nome[0]?.toUpperCase()}</span>;
}
