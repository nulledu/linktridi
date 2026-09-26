"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassSelect } from "../../GlassPicker";
import type { MarketPerson, MarketProfile } from "../../../../lib/tridimarket/types";
import { formatMarketCurrency } from "../../../../lib/tridimarket/view";
import { centavosDeReais, centavosDoTexto, reaisDeCentavos, textoDeCentavos } from "../../../../lib/tridimarket/moeda";
import { Cabecalho, intervaloDe, useDadosDoFiltro, useFiltros } from "../Filtros";
import { paramsDoPeriodo } from "../../../../lib/tridimarket/periodo";
import { SeletorPessoa } from "../SeletorPessoa";
import { Aviso } from "../DashboardClient";
import { Avatar, Card, Empty, INDIGO, PanelTitle, SkelLinhas, SkelStats, Stat, marketRequest } from "../ui";
import { campo, rotulo } from "../produtos/ProdutosClient";
import { Botao } from "../../ui/controles";
import { atributosDe } from "../../ui/campos";

type Settings = { profiles: MarketProfile[]; schemaReady: boolean };

const METODOS = [
  { valor: "pix", label: "Pix" },
  { valor: "cash", label: "Dinheiro" },
  { valor: "card", label: "Cartão" },
  { valor: "transfer", label: "Transferência" },
  { valor: "other", label: "Outro" },
];

export function FinanceiroClient() {
  const [filtros, setFiltros] = useFiltros();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pessoas, setPessoas] = useState<MarketPerson[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Movimento do razão DENTRO do período escolhido (consumo × pagamento), por
  // cadastro. O saldo em aberto é do AGORA; isto responde "o que rolou nesse
  // intervalo", que é o que o seletor de período controla.
  const [movimento, setMovimento] = useState<Map<number, { consumed: number; paid: number }>>(new Map());
  const [totaisPeriodo, setTotaisPeriodo] = useState({ consumido: 0, pago: 0 });
  const { desatualizado, marcarCarregado } = useDadosDoFiltro(filtros);

  // `quem` é o id de um CADASTRO, não da pessoa: o pagamento tem que cair na
  // carteira certa. Quem tem conta em várias empresas escolhe em qual quitar.
  const [quem, setQuem] = useState("");
  // `valorCent` guarda o valor em CENTAVOS (inteiro). O input mostra sempre em
  // Reais formatado, digitando pela direita — ver lib/tridimarket/moeda.ts.
  const [valorCent, setValorCent] = useState(0);
  const [metodo, setMetodo] = useState("pix");
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);

  const escopo = filtros.profileId ? `?profileId=${encodeURIComponent(filtros.profileId)}` : "";
  const intervalo = intervaloDe(filtros);
  const escopoPeriodo = filtros.profileId ? `&profileId=${encodeURIComponent(filtros.profileId)}` : "";
  const chaveIntervalo = `${intervalo.de}|${intervalo.ate}`;
  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    type Mov = { movimento: Array<{ employeeId: number; consumed: number; paid: number }>; totalConsumido: number; totalPago: number };
    const [conf, lista, mov] = await Promise.allSettled([
      marketRequest<Settings>("settings"),
      marketRequest<MarketPerson[]>(`employees${escopo}`),
      marketRequest<Mov>(`finance/periodo?${paramsDoPeriodo(intervalo)}${escopoPeriodo}`),
    ]);
    if (conf.status === "fulfilled") setSettings(conf.value);
    if (lista.status === "fulfilled") { setPessoas(lista.value); marcarCarregado(); }
    else setErro(lista.reason instanceof Error ? lista.reason.message : "Falha ao carregar as carteiras.");
    if (mov.status === "fulfilled") {
      setMovimento(new Map(mov.value.movimento.map((m) => [m.employeeId, { consumed: m.consumed, paid: m.paid }])));
      setTotaisPeriodo({ consumido: mov.value.totalConsumido, pago: mov.value.totalPago });
    } else { setMovimento(new Map()); setTotaisPeriodo({ consumido: 0, pago: 0 }); }
    setCarregando(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escopo, chaveIntervalo, escopoPeriodo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const devedores = useMemo(() => pessoas.filter((p) => p.open > 0).sort((a, b) => b.open - a.open), [pessoas]);
  const unidades = useMemo(() => Object.fromEntries((settings?.profiles ?? []).map((p) => [p.id, p.name])), [settings]);
  // Cadastros que devem, achatados: um pagamento sempre quita UMA carteira.
  const carteiras = useMemo(() => devedores.flatMap((p) =>
    p.accounts.filter((c) => c.open > 0).map((c) => ({ conta: c, pessoa: p }))), [devedores]);
  const selecionado = carteiras.find((c) => String(c.conta.id) === quem);
  const totalAberto = pessoas.reduce((s, p) => s + p.open, 0);
  const totalAtraso = pessoas.reduce((s, p) => s + p.overdue, 0);
  // Movimento de uma pessoa no período = soma dos cadastros dela.
  const movDaPessoa = (p: MarketPerson) => p.accounts.reduce(
    (acc, c) => { const m = movimento.get(c.id); return m ? { consumed: acc.consumed + m.consumed, paid: acc.paid + m.paid } : acc; },
    { consumed: 0, paid: 0 },
  );

  const valorReais = reaisDeCentavos(valorCent);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!selecionado || valorCent <= 0) return;
    setSalvando(true); setErro(null); setAviso(null);
    try {
      // A baixa vai para a unidade do CADASTRO escolhido — é lá que a dívida
      // foi registrada, mesmo que a pessoa tenha comprado no tablet de outra
      // empresa. Somar tudo numa carteira só desequilibraria as outras.
      await marketRequest("finance", { method: "POST", body: JSON.stringify({
        employeeId: selecionado.conta.id, profileId: selecionado.conta.profileId,
        amount: valorReais, method: metodo, note: nota || undefined,
      }) });
      setAviso(`Pagamento de ${formatMarketCurrency(valorReais)} lançado na carteira de ${selecionado.pessoa.name} em ${unidades[selecionado.conta.profileId] ?? "sua empresa"}.`);
      setValorCent(0); setNota(""); await carregar();
    } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível registrar."); }
    finally { setSalvando(false); }
  }

  return (
    <>
      <Cabecalho titulo="Financeiro" descricao={`${devedores.length} pessoa(s) com saldo em aberto`}
        filtros={filtros} setFiltros={setFiltros} perfis={settings?.profiles ?? []} carregando={carregando} onAtualizar={() => void carregar()} />

      {erro && <Aviso tom="neg" icone="circle-x" titulo="Não foi possível concluir">{erro}</Aviso>}
      {aviso && <Aviso tom="pos" icone="circle-check" titulo="Pagamento registrado">{aviso}</Aviso>}

      {desatualizado && !erro ? <SkelStats n={5} /> : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12, marginBottom: 14 }}>
        {/* Saldo em aberto e atraso são do AGORA — não mudam com o período. */}
        <Stat label="Total em aberto" value={formatMarketCurrency(totalAberto)} icon="clock" tone="warn" hint="saldo atual, todas as carteiras" />
        <Stat label="Em atraso" value={formatMarketCurrency(totalAtraso)} icon="alert-triangle" tone={totalAtraso > 0 ? "neg" : "neutral"} hint="mais de 30 dias" />
        <Stat label="Pessoas devendo" value={String(devedores.length)} icon="users" hint={`de ${pessoas.length} cadastradas`} />
        {/* Consumido e pago SEGUEM o período escolhido no topo. */}
        <Stat label="Consumido no período" value={formatMarketCurrency(totaisPeriodo.consumido)} icon="shopping-cart" hint="compras no intervalo" />
        <Stat label="Pago no período" value={formatMarketCurrency(totaisPeriodo.pago)} icon="receipt" tone="pos" hint="recebido no intervalo" />
      </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.1fr)", gap: 14 }} className="tm-grid-2">
        <Card>
          <PanelTitle title="Registrar pagamento" hint="baixa direta na carteira interna" />
          <form onSubmit={registrar}>
            <label style={rotulo}>Carteira</label>
            <SeletorPessoa
              valor={quem}
              onEscolher={setQuem}
              placeholder="Buscar quem vai pagar"
              opcoes={carteiras.map(({ conta, pessoa }) => ({
                id: conta.id,
                nome: pessoa.name,
                imagem: pessoa.imageUrl,
                // A empresa só aparece para quem tem cadastro em mais de uma —
                // repetir a unidade em todo mundo só faria ruído.
                detalhe: pessoa.unified ? (unidades[conta.profileId] ?? "empresa") : null,
                valor: conta.open,
              }))}
            />

            {selecionado && (
              <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "8px 0 0" }}>
                Nesta carteira: <strong style={{ color: "var(--text)" }}>{formatMarketCurrency(selecionado.conta.open)}</strong>
                {" · "}
                <button type="button" onClick={() => setValorCent(centavosDeReais(selecionado.conta.open))}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: INDIGO, fontWeight: 700, fontSize: 12 }}>
                  quitar tudo
                </button>
                {selecionado.pessoa.unified && (
                  <> · a pessoa deve <strong style={{ color: "var(--text)" }}>{formatMarketCurrency(selecionado.pessoa.open)}</strong> somando as {selecionado.pessoa.accounts.length} empresas</>
                )}
              </p>
            )}

            <label style={{ ...rotulo, marginTop: 14 }}>Valor</label>
            {/* `text` + inputMode numérico: o campo mostra "R$ 12,50" enquanto
                se digita, então não pode ser type="number" (que recusa a
                máscara). O teclado do celular continua abrindo em números. */}
            <input {...atributosDe("dinheiro")}
              type="text"
              inputMode="numeric"
              required
              value={textoDeCentavos(valorCent)}
              onChange={(e) => setValorCent(centavosDoTexto(e.target.value))}
              placeholder="R$ 0,00"
              style={{ ...campo, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}
            />

            <label style={{ ...rotulo, marginTop: 14 }}>Método</label>
            <GlassSelect value={metodo} onChange={setMetodo} style={campo}
              options={METODOS.map((m) => ({ value: m.valor, label: m.label }))} />

            <label style={{ ...rotulo, marginTop: 14 }}>Observação (opcional)</label>
            <input value={nota} onChange={(e) => setNota(e.target.value)} style={campo} />

            <Botao variante="primario" type="submit" bloco carregando={salvando} disabled={!selecionado || valorCent <= 0} style={{ marginTop: 18 }}>Registrar pagamento</Botao>
          </form>
        </Card>

        <Card>
          <PanelTitle title="Maiores saldos em aberto" hint="dívida atual · movimento do período" />
          {/* `!erro` junto: sem ele, uma falha na busca deixava ESTE bloco em
              esqueleto para sempre — o aviso de erro aparecia lá em cima e a
              lista continuava "carregando" sem nunca mais tentar. */}
          {desatualizado && !erro ? <SkelLinhas n={7} /> : devedores.length ? (
            <div style={{ display: "grid", gap: 2 }}>
              {devedores.slice(0, 12).map((p) => {
                const maior = [...p.accounts].sort((a, b) => b.open - a.open)[0];
                const mov = movDaPessoa(p);
                return (
                  // No celular o valor + "receber" descem pra segunda linha: lado
                  // a lado com o nome sobrariam ~58px pra ele.
                  <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                    <Avatar name={p.name} url={p.imageUrl} size={28} />
                    <div style={{ minWidth: 150, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: p.overdue > 0 ? "var(--tf-neg)" : "var(--text-dim)" }}>
                        {p.overdue > 0 && `${formatMarketCurrency(p.overdue)} em atraso`}
                        {p.overdue > 0 && p.unified && " · "}
                        {p.unified && `em ${p.accounts.length} empresas`}
                      </div>
                      {/* O que ESTA pessoa consumiu e pagou no período escolhido
                          — a "seleção de período" pedida, por pessoa. */}
                      {(mov.consumed > 0 || mov.paid > 0) && (
                        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 1 }}>
                          consumiu <strong style={{ color: "var(--text)" }}>{formatMarketCurrency(mov.consumed)}</strong>
                          {" · "}pagou <strong style={{ color: "var(--tf-pos)" }}>{formatMarketCurrency(mov.paid)}</strong> no período
                        </div>
                      )}
                    </div>
                    {/* marginLeft auto vale 0 no computador (o bloco flex:1 já
                        comeu a sobra) e alinha o par à direita quando quebra. */}
                    <strong style={{ fontSize: 13.5, fontWeight: 750, color: p.overdue > 0 ? "var(--tf-neg)" : "var(--text)", flex: "none", marginLeft: "auto" }}>{formatMarketCurrency(p.open)}</strong>
                    {/* Leva para a carteira com maior saldo — a mais provável
                        de ser quitada primeiro; as outras ficam na lista. */}
                    <button onClick={() => { setQuem(String(maior.id)); setValorCent(centavosDeReais(maior.open)); }}
                      style={{ background: "none", border: "none", cursor: "pointer", color: INDIGO, fontWeight: 700, fontSize: 12, flex: "none" }}>receber</button>
                  </div>
                );
              })}
            </div>
          ) : <Empty icon="circle-check" title="Ninguém devendo" text="Todas as carteiras estão zeradas." />}
        </Card>
      </div>
    </>
  );
}
