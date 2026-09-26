"use client";

// Tridify — Contas de anúncio: a classificação de cada conta e o teto de gasto
// do mês.
//
// Isto morava DENTRO do Analytics (Vendas › Marketing › "Gastos por conta"):
// uma tabela de leitura com um `select` de tipo por linha, um campo de teto e
// um botão "Salvar classificação e teto" no rodapé. Três problemas de uma vez:
//
//  1. Configuração escondida numa tela de análise. Quem abre o Analytics vai
//     LER número, não mudar regra do sistema — e a regra mudava a base de
//     cálculo de outra tela sem nenhum aviso.
//  2. O portão era `analytics`, mas o que se salvava é config do TRÁFEGO. Quem
//     tinha Analytics e não tinha Tráfego via os campos e tomava 403 ao salvar.
//  3. Ficava ao lado dos números que ela própria altera, o que convida a mexer
//     na classificação até o número ficar bonito.
//
// Aqui ela é o que é: uma tela de configuração, no módulo dono do assunto.
//
// AVISO QUE A TELA DÁ EM VOZ ALTA: esta classificação é POR CONTA, e o nome da
// conta engana. A conta "VSL - Carimbos Ma1" roda campanha `{CH}` o tempo todo.
// A linha de produto de verdade sai da TAG DA CAMPANHA (ver
// `lib/marketing-produto.ts` e Marketing › Desempenho); o que se define aqui é
// só o agrupamento grosso de carteira, usado nos totais de carimbo × chancela
// do Analytics.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { Icon } from "../Icon";
import { SectionHeader, EmptyState } from "./TfKit";
import { Botao } from "../ui/controles";
import "./carteira-fontes.css";
import { toast } from "../Toast";
import type { ContaTipo } from "@/lib/marketing-config";

interface ContaLinha {
  id: string; nome: string; bmId: string; bmNome: string;
  spend: number; purchases: number; revenue: number;
}
type Tipo = ContaTipo | "";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const OPCOES: { v: Tipo; label: string; cor: string; desc: string }[] = [
  { v: "carimbo", label: "Carimbo", cor: "var(--tf-pos)", desc: "a carteira soma no grupo Carimbo" },
  { v: "chancela", label: "Chancela", cor: "var(--tf-info)", desc: "a carteira soma no grupo Chancela" },
  { v: "", label: "Sem grupo", cor: "var(--text-dim)", desc: "a conta fica fora dos dois grupos" },
];

export function ContasAnuncioView() {
  const [contas, setContas] = useState<ContaLinha[] | null>(null);
  const [tipos, setTipos] = useState<Record<string, Tipo>>({});
  const [salvos, setSalvos] = useState<Record<string, Tipo>>({});
  const [teto, setTeto] = useState("");
  const [tetoSalvo, setTetoSalvo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      // As duas perguntas em paralelo: quem gastou (warehouse) e como está
      // classificado hoje (config). Em série, a tela abria em dois tempos.
      const [rc, rg] = await Promise.all([
        // Janela fixa no MÊS, e não o seletor da tela: o teto é mensal, então
        // "gasto do mês × teto do mês" é a única leitura que fecha. Com um
        // seletor por cima, o teto de 90 mil apareceria 12% usado porque
        // alguém tinha escolhido "hoje".
        fetch("/api/trafego/contas?period=mes", { cache: "no-store" }),
        fetch("/api/marketing-config", { cache: "no-store" }),
      ]);
      const jc = await rc.json().catch(() => null);
      const jg = await rg.json().catch(() => null);
      if (!rc.ok || !Array.isArray(jc?.data?.contas)) throw new Error("Não foi possível carregar as contas.");
      const lista: ContaLinha[] = jc.data.contas as ContaLinha[];
      setContas(lista.slice().sort((a, b) => b.spend - a.spend));
      const daConfig = (jg?.contas ?? {}) as Record<string, ContaTipo>;
      // A conta que gastou no período mas nunca foi classificada entra como
      // "" — o estado precisa ter TODAS as linhas, senão o botão de "Sem
      // grupo" nasce apagado nelas.
      const mapa: Record<string, Tipo> = {};
      for (const c of lista) mapa[c.id] = daConfig[c.id] ?? "";
      for (const [id, v] of Object.entries(daConfig)) if (!(id in mapa)) mapa[id] = v;
      setTipos(mapa); setSalvos(mapa);
      const t = String(jg?.teto ?? 0);
      setTeto(t === "0" ? "" : t); setTetoSalvo(t === "0" ? "" : t);
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar."); }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  // Segue o botão "Atualizar" da Tridify (ver `atualizacao.ts`).
  useAtualizacao(carregar);

  // "Sujo" comparado ao que está SALVO, não a um sinalizador ligado no clique:
  // clicar em Carimbo e voltar pra Chancela original não é mudança nenhuma, e o
  // botão ficava aceso pedindo pra salvar o que já estava lá.
  const sujo = useMemo(() => {
    if (teto !== tetoSalvo) return true;
    const chaves = new Set([...Object.keys(tipos), ...Object.keys(salvos)]);
    for (const k of chaves) if ((tipos[k] ?? "") !== (salvos[k] ?? "")) return true;
    return false;
  }, [tipos, salvos, teto, tetoSalvo]);

  async function salvar() {
    if (!sujo || salvando) return;
    setSalvando(true); setErro(null);
    try {
      const r = await fetch("/api/marketing-config", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teto: Number(teto) || 0,
          contas: Object.fromEntries(Object.entries(tipos).filter(([, v]) => v)),
        }),
      });
      if (!r.ok) throw new Error(r.status === 403 ? "Sem permissão para salvar a config do Tráfego." : "Não foi possível salvar.");
      setSalvos(tipos); setTetoSalvo(teto);
      toast.ok("Carteira e teto salvos.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao salvar.";
      setErro(msg); toast.erro(msg);
    } finally { setSalvando(false); }
  }

  if (erro && !contas) {
    return <EmptyState icon="alert-triangle" titulo="Não foi possível carregar" descricao={erro}
      acao={{ label: "Tentar de novo", onClick: () => void carregar() }} />;
  }

  const gastoTotal = (contas ?? []).reduce((s, c) => s + c.spend, 0);
  const tetoNum = Number(teto) || 0;
  const usoReal = tetoNum > 0 ? (gastoTotal / tetoNum) * 100 : null;
  const uso = usoReal != null ? Math.round(usoReal) : null;
  // Estado pela paleta semântica: passou do teto = perigo, 85%+ = atenção.
  const corUso = uso == null ? "var(--graf-1)" : uso >= 100 ? "var(--tf-neg, var(--perigo))" : uso >= 85 ? "var(--tf-warn, var(--atencao))" : "var(--tf-pos, var(--ok))";
  const { restantes, total: diasMes, hoje } = diasDoMes();
  const falta = tetoNum - gastoTotal;
  // Ritmo: o que sobra dividido pelos dias que faltam (hoje incluso).
  const porDia = tetoNum > 0 && falta > 0 && restantes > 0 ? falta / restantes : null;
  const projecao = hoje > 0 ? (gastoTotal / hoje) * diasMes : 0;
  // Agrupado por BM: é como a operação enxerga a carteira, e uma lista de 20
  // contas soltas não diz de quem é cada uma.
  const porBM = new Map<string, { nome: string; linhas: ContaLinha[]; gasto: number }>();
  for (const c of contas ?? []) {
    const g = porBM.get(c.bmId) ?? { nome: c.bmNome, linhas: [], gasto: 0 };
    g.linhas.push(c); g.gasto += c.spend; porBM.set(c.bmId, g);
  }
  const maiorGasto = Math.max(1, ...(contas ?? []).map((c) => c.spend));

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SectionHeader
        titulo="Carteira e teto de gasto"
        sub="Grupo de cada conta e o limite do mês."
        acoes={<span className="cf-ajuda" tabIndex={0} role="img" aria-label={AJUDA_CARTEIRA} data-dica={AJUDA_CARTEIRA}>
          <Icon name="help-circle" size={17} color="var(--text-dim)" />
        </span>}
      />

      {/* Medidor do teto: o gasto é a manchete, o teto é a régua. */}
      <section className="cf-card" aria-label="Teto de gasto no mês">
        <div className="cf-medidor-topo">
          <div style={{ minWidth: 0 }}>
            <div className="cf-rotulo">Gasto no mês</div>
            <div style={{ marginTop: 4 }}>
              <span className="cf-grande cf-num">{brl(gastoTotal)}</span>
              {tetoNum > 0 && <span className="cf-de cf-num">de {brl(tetoNum)}</span>}
            </div>
          </div>
          <div className="cf-teto-campo">
            <label htmlFor="tf-teto">Teto</label>
            <input id="tf-teto" type="number" min={0} inputMode="numeric" value={teto}
              onChange={(e) => setTeto(e.target.value)} placeholder="sem teto" />
          </div>
        </div>

        {uso != null ? (
          <>
            <div className="cf-trilho" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, uso)} aria-label="Uso do teto">
              <span style={{ width: `${Math.min(100, usoReal ?? 0)}%`, background: corUso }} />
            </div>
            <div className="cf-rodape">
              <span className="cf-pct cf-num" style={{ color: corUso }}>{uso}% do teto</span>
              {falta >= 0
                ? <span>faltam <b className="cf-num">{brl(falta)}</b></span>
                : <span>passou <b className="cf-num" style={{ color: corUso }}>{brl(-falta)}</b></span>}
              <span><b className="cf-num">{restantes}</b> {restantes === 1 ? "dia restante" : "dias restantes"}</span>
              {porDia != null && <span>até <b className="cf-num">{brl(porDia)}</b>/dia</span>}
              {projecao > 0 && <span>ritmo atual fecha em <b className="cf-num">{brl(projecao)}</b></span>}
            </div>
          </>
        ) : (
          <div className="cf-rodape">Sem teto definido. Digite um valor pra acompanhar o uso do mês.</div>
        )}
      </section>

      {!contas ? <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando contas…</div>
        : contas.length === 0 ? <EmptyState icon="speakerphone" titulo="Nenhuma conta gastou neste mês" descricao="Conecte o Meta acima, ou espere a primeira campanha do mês rodar." />
        : [...porBM.entries()].map(([bmId, g]) => (
          <section key={bmId} className="cf-grupo" aria-label={g.nome}>
            <div className="cf-grupo-cab">
              <strong>{g.nome}</strong>
              <span>{g.linhas.length} {g.linhas.length === 1 ? "conta" : "contas"}</span>
              <span className="cf-num">{brl(g.gasto)}</span>
            </div>
            {g.linhas.map((c) => {
              const t = tipos[c.id] ?? "";
              const mudou = t !== (salvos[c.id] ?? "");
              return (
                <div key={c.id} className="cf-linha" data-mudou={mudou ? "1" : undefined}>
                  <div className="cf-linha-topo">
                    <span className="cf-nome">{c.nome}</span>
                    <span className="cf-valor">{brl(c.spend)}</span>
                  </div>
                  <div className="cf-barra" aria-hidden><span style={{ width: `${(c.spend / maiorGasto) * 100}%` }} /></div>
                  <div className="cf-linha-base">
                    <span className="cf-apoio">{c.purchases.toLocaleString("pt-BR")} vendas · {brl(c.revenue)}</span>
                    {/* Grupo de botões num <div>, nunca num <label>: com <label>
                        envolvendo, clicar no rótulo dispara o PRIMEIRO botão e a
                        seleção troca sozinha. */}
                    <div role="group" aria-label={`Carteira de ${c.nome}`} className="cf-seg" style={{ marginLeft: "auto" }}>
                      {OPCOES.map((o) => (
                        <button key={o.v || "sem"} type="button" onClick={() => setTipos((p) => ({ ...p, [c.id]: o.v }))}
                          data-dica={o.desc} aria-pressed={t === o.v}
                          style={{ ["--cf-cor" as string]: o.cor } as React.CSSProperties}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        ))}

      {erro && contas && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--tf-neg, var(--perigo))" }}>
          <Icon name="alert-triangle" size={15} color="currentColor" />{erro}
        </div>
      )}

      <div className="cf-rodape-acoes">
        {sujo && !salvando && <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>há mudanças não salvas</span>}
        <Botao variante="primario" onClick={() => void salvar()} disabled={!sujo} carregando={salvando} icone="circle-check">
          Salvar
        </Botao>
      </div>
    </div>
  );
}

const AJUDA_CARTEIRA = "A carteira é o agrupamento grosso da conta e vale para os totais de carimbo × chancela do Analytics. "
  + "A linha de produto de cada venda sai da tag da campanha ({CRB} / {CH}), porque o nome da conta engana. "
  + "O corte por linha de produto está em Marketing › Desempenho.";

/** Dia do mês e dias restantes (hoje incluso), no fuso de São Paulo. */
function diasDoMes() {
  const [a, m, d] = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  const total = new Date(a, m, 0).getDate();
  return { hoje: d, total, restantes: total - d + 1 };
}

