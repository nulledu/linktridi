"use client";

// ── Visão Geral ──────────────────────────────────────────────────────────────
// O painel de gestão da contingência, no desenho do dono (23/09/26): cinco
// números do topo com a faísca dos últimos dias, a contingência de tráfego,
// a evolução do parque, o que fazer agora e onde os chips estão parados.
//
// Nada é métrica inventada: todo número sai do consolidado de hoje, e toda
// curva sai dos snapshots diários (uma leitura só, ao abrir — sem poll).

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { Abas } from "../../ui/Abas";
import { Botao } from "../../ui/controles";
import { KpiIcone, Selo, variacao } from "../../ui/primitives";
import { CartaoPainel, VazioPainel } from "../../ui/CartaoPainel";
import { DataList, type Coluna } from "../../ui/DataList";
import { MonoArea, MonoLegenda, corDaSerie } from "../../ui/graficos";
import type { Visao, Chamar } from "./ContingenciaClient";
import type { AlvoEdicao } from "./EditorVisao";
import { hojeSP, type Consolidado, type Painel, type Snapshot, type StatusAtivo } from "@/lib/contingencia-const";
import "../../operacao/geral/visao-geral.css";
import "./visao-geral.css";

// Snapshots antigos nasceram antes de alguns campos (a Estrutura Meta entrou
// depois): leitura tolerante, campo ausente vale zero.
type Pega = (c: Consolidado) => number;
const seguro = (f: Pega): Pega => (c) => { try { return Number(f(c)) || 0; } catch { return 0; } };

const saudaveisPct = (c: Consolidado) => {
  const at = c.atendentes ?? [];
  return at.length ? Math.round((at.filter((a) => a.saude === "saudavel").length / at.length) * 100) : 0;
};
const coberturaPct = (c: Consolidado) => (c.numeros.total ? Math.round((c.numeros.comProxy / c.numeros.total) * 100) : 0);

type Serie = "chips" | "celulares" | "proxy";
const SERIES: Record<Serie, { rotulo: string; linhas: { nome: string; pega: Pega }[] }> = {
  chips: { rotulo: "Chips", linhas: [
    { nome: "Prontos", pega: (c) => c.numeros.prontos },
    { nome: "Em uso", pega: (c) => c.numeros.emUso },
    { nome: "Aquecendo", pega: (c) => c.numeros.emAquecimento },
  ] },
  celulares: { rotulo: "Celulares", linhas: [
    { nome: "Disponíveis", pega: (c) => c.celulares.disponiveis },
    { nome: "Em uso", pega: (c) => c.celulares.emUso },
    { nome: "Manutenção", pega: (c) => c.celulares.manutencao },
  ] },
  proxy: { rotulo: "Proxy", linhas: [
    { nome: "Com proxy", pega: (c) => c.numeros.comProxy },
    { nome: "Sem proxy", pega: (c) => c.numeros.semProxy },
    { nome: "Proxies ativos", pega: (c) => c.proxies.ativos },
  ] },
};

// ── Onde os chips estão parados: uma linha por etapa do aquecimento ──────────
interface Etapa {
  chave: string; rotulo: string; status: StatusAtivo[]; qtd: number; antes: number | null;
  idade: number | null; bomQuandoSobe: boolean; tom: "perigo" | "atencao" | "ok"; cor: string;
}
const TOM_ROTULO = { perigo: "Alta", atencao: "Média", ok: "Baixa" } as const;

const diaCurto = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const umaCasa = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function VisaoGeral({ painel, aquecimento, irPara, abrirHoje, chamar, verAtendente, podeEditar, offline, snapshotsIniciais, editar }: {
  painel: Painel; aquecimento: { etapas: number; emRisco: number };
  irPara: (v: Visao) => void; abrirHoje: () => void; chamar: Chamar;
  /** Leva pra aba Atendentes já com a pessoa aberta. */
  verAtendente: (chave: string) => void;
  podeEditar: boolean; offline: boolean; snapshotsIniciais?: Snapshot[];
  /** Abre o editor dos campos por trás de um número. Sem permissão de
   *  escrita não vem, e o clique só navega pra aba. */
  editar?: (a: AlvoEdicao) => void;
}) {
  // Com escrita: o clique EDITA. Sem: leva pra aba onde o número mora.
  const abrir = (a: AlvoEdicao, v: Visao) => () => (editar ? editar(a) : irPara(v));
  const lapis = editar ? "edit" : undefined;
  const c = painel.consolidado;
  const ant = painel.anterior;

  // Uma leitura dos últimos 14 dias alimenta as faíscas e a curva.
  const [snaps, setSnaps] = useState<Snapshot[] | null>(snapshotsIniciais ?? null);
  useEffect(() => {
    if (offline || snapshotsIniciais) return;
    let vivo = true;
    fetch("/api/marketing/contingencia/historico?dias=14").then((x) => x.json()).then((r) => {
      if (vivo) setSnaps(r?.ok ? (r.snapshots as Snapshot[]) : []);
    }).catch(() => { if (vivo) setSnaps([]); });
    return () => { vivo = false; };
  }, [offline, snapshotsIniciais]);

  // Os dias fechados + HOJE contado agora (o snapshot de hoje, se existe, é
  // uma foto mais velha que o cadastro — o ponto de hoje é sempre o vivo).
  const dias = useMemo(() => {
    const hoje = hojeSP();
    const antes = (snaps ?? []).filter((s) => s.dia < hoje).slice(-13);
    return [...antes.map((s) => ({ dia: s.dia, dados: s.dados })), { dia: hoje, dados: c }];
  }, [snaps, c]);
  const faisca = (f: Pega) => dias.map((d) => seguro(f)(d.dados));

  const [serie, setSerie] = useState<Serie>("chips");
  const linhas = SERIES[serie].linhas.map((l) => ({
    nome: l.nome, pontos: dias.map((d) => ({ rotulo: d.dia, valor: seguro(l.pega)(d.dados) })),
  }));

  const cobertura = coberturaPct(c);
  const atendentes = c.atendentes.length;
  const saudaveis = c.atendentes.filter((a) => a.saude === "saudavel").length;

  // ── Pendências / próximas ações: o que pede mão agora, do mais grave ──────
  const emRisco = c.atendentes.filter((a) => a.saude !== "saudavel");
  const abertas = painel.pendencias.filter((p) => p.status === "aberta");
  type Acao = { id: string; icone: string; tom: "perigo" | "atencao" | "destaque"; titulo: string; sub: string; botao: string; primario?: boolean; fazer: () => void };
  const acoes: Acao[] = [];
  if (aquecimento.etapas) acoes.push({
    id: "etapas", icone: "alert-circle", tom: "perigo", primario: true,
    titulo: `${aquecimento.etapas} etapa${aquecimento.etapas === 1 ? "" : "s"} vencida${aquecimento.etapas === 1 ? "" : "s"}`,
    sub: "Marque na fila do aquecimento pra não perder o ciclo.", botao: "Abrir fila", fazer: () => irPara("hoje"),
  });
  if (aquecimento.emRisco) acoes.push({
    id: "risco", icone: "flame", tom: "atencao",
    titulo: `${aquecimento.emRisco} ativo${aquecimento.emRisco === 1 ? "" : "s"} em risco`,
    sub: "Apressados ou restritos no roteiro.", botao: "Ver fila", fazer: () => irPara("hoje"),
  });
  for (const a of emRisco.slice(0, 3)) acoes.push({
    id: `at-${a.chave}`, icone: "user-exclamation", tom: a.saude === "critico" ? "perigo" : "atencao",
    titulo: `${a.nome} em ${a.saude === "critico" ? "estado crítico" : "atenção"}`, sub: a.motivo,
    botao: "Ver atendente", fazer: () => verAtendente(a.chave),
  });
  if (c.numeros.semProxy) acoes.push({
    id: "proxy", icone: "shield", tom: "atencao",
    titulo: `${c.numeros.semProxy} chip${c.numeros.semProxy === 1 ? "" : "s"} sem proxy`,
    sub: "Números vivos sem proxy ativo no chip nem no aparelho.", botao: "Ver chips", fazer: () => irPara("telefonica"),
  });
  for (const p of abertas.slice(0, 4)) acoes.push({
    id: `p-${p.id}`, icone: "checklist", tom: "destaque", titulo: p.titulo,
    sub: [p.responsavelNome, p.data ? `até ${p.data.split("-").reverse().join("/")}` : null, p.descricao].filter(Boolean).join(" · ") || "Pendência operacional",
    botao: "Concluir", fazer: () => void chamar("/api/marketing/contingencia/pendencia", "PATCH", { id: p.id, status: "feita" }),
  });

  // ── Etapas: quantos chips em cada uma, há quanto tempo, e se piorou ──────
  const etapas = useMemo<Etapa[]>(() => {
    const agora = Date.now();
    const numeros = painel.ativos.filter((a) => a.tipo === "numero");
    const idade = (st: StatusAtivo[]) => {
      const xs = numeros.filter((a) => st.includes(a.status) && a.iniciadoEm)
        .map((a) => (agora - new Date(`${a.iniciadoEm}T12:00:00-03:00`).getTime()) / 86_400_000)
        .filter((d) => Number.isFinite(d) && d >= 0);
      return xs.length ? xs.reduce((s, d) => s + d, 0) / xs.length : null;
    };
    const n = c.numeros, a = ant?.numeros;
    const base: Omit<Etapa, "idade" | "tom" | "cor">[] = [
      { chave: "novo", rotulo: "Não aquecidos", status: ["novo"], qtd: n.naoAquecidos, antes: a?.naoAquecidos ?? null, bomQuandoSobe: false },
      { chave: "aquecendo", rotulo: "Em aquecimento", status: ["aquecendo"], qtd: n.emAquecimento, antes: a?.emAquecimento ?? null, bomQuandoSobe: true },
      { chave: "aquecido", rotulo: "Prontos (reserva)", status: ["aquecido"], qtd: n.prontos, antes: a?.prontos ?? null, bomQuandoSobe: true },
      { chave: "em_uso", rotulo: "Em uso", status: ["em_uso"], qtd: n.emUso, antes: a?.emUso ?? null, bomQuandoSobe: true },
      { chave: "restrito", rotulo: "Restringidos", status: ["restrito"], qtd: n.restritos, antes: a?.restritos ?? null, bomQuandoSobe: false },
      { chave: "banido", rotulo: "Bloqueados", status: ["banido"], qtd: n.bloqueados, antes: a?.bloqueados ?? null, bomQuandoSobe: false },
    ];
    return base.map((e, i) => {
      // Alta: chip caído parado na etapa. Média: fila sem saída (tem chip
      // esperando e nada no forno, ou mais esperando que prontos). Resto: baixa.
      const tom: Etapa["tom"] = (e.chave === "restrito" || e.chave === "banido") && e.qtd > 0 ? "perigo"
        : e.chave === "novo" && e.qtd > 0 && (n.emAquecimento === 0 || e.qtd > n.prontos) ? "atencao"
        : e.chave === "aquecido" && e.qtd === 0 && n.total > 0 ? "atencao"
        : "ok";
      return { ...e, idade: idade(e.status), tom, cor: corDaSerie(i) };
    });
  }, [painel.ativos, c.numeros, ant]);

  const colunas: Coluna<Etapa>[] = [
    { chave: "etapa", titulo: "Etapa", papel: "titulo", render: (e) => (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 600 }}>
        <span aria-hidden className="cv-ponto" style={{ background: e.cor }} />{e.rotulo}
      </span>
    ) },
    { chave: "qtd", titulo: "Chips", alinhar: "right", render: (e) => <span className="mt-num">{e.qtd}</span> },
    { chave: "idade", titulo: "Tempo médio", alinhar: "right",
      render: (e) => <span className="mt-num" style={{ color: "var(--text-dim)" }}>{e.idade == null ? "—" : `${umaCasa(e.idade)} dia${e.idade >= 2 ? "s" : ""}`}</span> },
    { chave: "var", titulo: "Variação", alinhar: "right", render: (e) => {
      const d = variacao(e.qtd, e.antes);
      if (d == null) return <span style={{ color: "var(--text-dim)" }}>—</span>;
      const bom = d === 0 ? null : e.bomQuandoSobe ? d > 0 : d < 0;
      const cor = bom == null ? "var(--text-dim)" : bom ? "var(--ok)" : "var(--perigo)";
      return (
        <span className="mt-num" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 650, color: cor }}>
          <Icon name={d > 0 ? "arrow-up" : d < 0 ? "arrow-down" : "arrows-horizontal"} size={12} color={cor} />
          {d > 0 ? "+" : d < 0 ? "−" : ""}{Math.abs(d)}%
        </span>
      );
    } },
    { chave: "status", titulo: "Atenção", papel: "destaque", render: (e) => <Selo tom={e.tom}>{TOM_ROTULO[e.tom]}</Selo> },
  ];

  const tudoCalmo = acoes.length === 0;
  const [comoFunciona, setComoFunciona] = useState(false);
  const meta = c.meta;

  return (
    <div className="og cv">
      {/* ── Os cinco números do topo ──────────────────────────────────── */}
      <div className="cv-kpis kpi-row">
        <KpiIcone label="Celulares disponíveis" icon="device-mobile" value={c.celulares.disponiveis}
          ajuda="Contado das fichas de aparelho: celular em ordem e sem número dentro."
          faisca={faisca((x) => x.celulares.disponiveis)}
          sub={`${c.celulares.total} no parque · ${c.celulares.emUso} em uso`}
          selo={c.celulares.manutencao
            ? <Selo tom="atencao"><Icon name="tool" size={12} color="currentColor" style={{ marginRight: 4 }} />{c.celulares.manutencao} em manutenção</Selo>
            : <Selo tom="ok"><Icon name="circle-check" size={12} color="currentColor" style={{ marginRight: 4 }} />Todos em ordem</Selo>}
          acao={lapis} onClick={abrir({ tipo: "celulares" }, "telefonica")} />
        <KpiIcone label="Números prontos" icon="hash" value={c.numeros.prontos}
          ajuda="Status “aquecido” no Aquecimento: pronto pra entregar a um atendente."
          faisca={faisca((x) => x.numeros.prontos)} anterior={ant ? ant.numeros.prontos : undefined}
          sub={`${c.numeros.emUso} em uso · ${c.numeros.naoAquecidos} aguardando`}
          acao={lapis} onClick={abrir({ tipo: "chips", titulo: "Números prontos", status: ["aquecido"] }, "telefonica")} />
        <KpiIcone label="Em aquecimento" icon="clock" value={c.numeros.emAquecimento}
          ajuda="Status “aquecendo”: chips seguindo o roteiro."
          faisca={faisca((x) => x.numeros.emAquecimento)} anterior={ant ? ant.numeros.emAquecimento : undefined}
          sub={`${c.numeros.naoAquecidos} aguardando início`}
          acao={lapis} onClick={abrir({ tipo: "chips", titulo: "Chips em aquecimento", status: ["aquecendo", "novo"] }, "hoje")} />
        <KpiIcone label="Cobertura de proxy" icon="shield" value={c.numeros.total ? `${cobertura}%` : "—"} atual={cobertura}
          ajuda="Números vivos com proxy ativo no chip ou no aparelho ÷ números vivos."
          faisca={faisca(coberturaPct)}
          sub={`${c.numeros.semProxy} sem proxy · ${c.proxies.ativos} proxies ativos`}
          selo={c.numeros.semProxy
            ? <Selo tom="atencao">{c.numeros.semProxy} descoberto{c.numeros.semProxy === 1 ? "" : "s"}</Selo>
            : <Selo tom="ok"><Icon name="circle-check" size={12} color="currentColor" style={{ marginRight: 4 }} />Estável</Selo>}
          acao={lapis} onClick={abrir({ tipo: "proxies" }, "config")} />
        <KpiIcone label="Atendentes saudáveis" icon="shield-check" value={atendentes ? `${Math.round((saudaveis / atendentes) * 100)}%` : "—"}
          atual={atendentes ? Math.round((saudaveis / atendentes) * 100) : 0}
          ajuda="Atendentes com reservas e proxies acima dos limites de Configurações ÷ atendentes com número."
          faisca={faisca(saudaveisPct)} anterior={ant && ant.atendentes?.length ? saudaveisPct(ant) : undefined}
          sub={`${saudaveis} de ${atendentes} atendente${atendentes === 1 ? "" : "s"}`}
          acao={lapis} onClick={abrir({ tipo: "atendentes" }, "atendentes")} />
      </div>

      <div className="og-grade">
        <div className="og-principal">
          {/* ── Contingência de Tráfego ─────────────────────────────── */}
          <CartaoPainel icone="brand-meta" titulo="Contingência de Tráfego"
            sub="BMs e contas de anúncio da Estrutura Meta, pelo status do aquecimento." onVer={() => irPara("trafego")}>
            <div className="cv-celulas">
              <Celula aoClicar={editar && (() => editar({ tipo: "meta", titulo: "BMs", ativo: "bm" }))} icone="briefcase" rotulo="BMs ativas" valor={meta.bms.total}
                sub={meta.bms.caidas ? `${meta.bms.caidas} restrita(s)/banida(s)` : "nenhuma restrita"} />
              <Celula aoClicar={editar && (() => editar({ tipo: "meta", titulo: "Contas de anúncio", ativo: "conta" }))} icone="credit-card" rotulo="Contas de anúncio" valor={meta.contas.total}
                sub={`${meta.contas.naoAquecidas} ainda sem aquecer`} />
              <Celula aoClicar={editar && (() => editar({ tipo: "meta", titulo: "Contas prontas", ativo: "conta", status: ["aquecido", "em_uso"] }))} icone="circle-check" rotulo="Contas prontas" valor={meta.contas.prontas} cor="var(--ok)"
                sub="aquecidas ou em uso" />
              <Celula aoClicar={editar && (() => editar({ tipo: "meta", titulo: "Contas em aquecimento", ativo: "conta", status: ["aquecendo", "novo", "restrito", "banido"] }))} icone="flame" rotulo="Contas em aquecimento" valor={meta.contas.aquecendo} cor="var(--perigo)"
                sub={`${meta.contas.caidas} restrita(s)/banida(s)`} />
            </div>
          </CartaoPainel>

          {/* ── Evolução ────────────────────────────────────────────── */}
          <CartaoPainel icone="chart-line" titulo="Evolução da Contingência"
            sub="Comparativo de chips, celulares e proxies nos últimos dias."
            acoes={
              <Abas className="ui-abas--sub" valor={serie} onMuda={setSerie} ariaLabel="Série do gráfico"
                itens={(Object.keys(SERIES) as Serie[]).map((k) => ({ valor: k, rotulo: SERIES[k].rotulo }))} />
            }>
            <div className="mono-legenda"><MonoLegenda itens={linhas.map((l) => ({ nome: l.nome }))} /></div>
            {dias.length < 2 ? (
              <VazioPainel texto="A curva começa quando houver dois dias salvos — o cron grava um por dia." />
            ) : (
              <MonoArea series={linhas} altura={210} rotuloDe={diaCurto} />
            )}
          </CartaoPainel>
        </div>

        <aside className="og-lado">
          {/* ── Acesso rápido ───────────────────────────────────────── */}
          <CartaoPainel icone="bolt" titulo="Acesso rápido">
            <ul className="og-lista cv-atalhos">
              {podeEditar && <Atalho icone="edit" titulo="Atualização de Hoje" sub="Registre o que mudou e grave o snapshot" onClick={abrirHoje} />}
              <Atalho icone="device-mobile" titulo="Gerenciar chips" sub="Celulares, números e operadoras" onClick={abrir({ tipo: "chips", titulo: "Todos os chips" }, "telefonica")} />
              <Atalho icone="world" titulo="Configurar proxies" sub="Quem cada proxy protege, status e custo" onClick={abrir({ tipo: "proxies" }, "config")} />
              {editar && <Atalho icone="credit-card" titulo="Gastos" sub="Planos de chip e outros custos do mês" onClick={() => editar({ tipo: "custos" })} />}
              <Atalho icone="flame" titulo="Aquecimento do dia" sub="A fila de etapas, agrupada por passo" onClick={() => irPara("hoje")} />
            </ul>
          </CartaoPainel>

          {/* ── Pendências / próximas ações ─────────────────────────── */}
          <CartaoPainel icone="checklist"
            titulo={<>Pendências / próximas ações{acoes.length > 0 && <span className="cv-conta mt-num">{acoes.length > 99 ? "99+" : acoes.length}</span>}</>}
            onVer={abrir({ tipo: "pendencias" }, "config")} verRotulo={editar ? "Editar" : "Ver todas"}>
            {tudoCalmo ? (
              <p className="og-limpo"><Icon name="circle-check" size={17} color="var(--ok)" /> Nada pendente agora.</p>
            ) : (
              <ul className="og-lista">
                {acoes.slice(0, 5).map((a) => (
                  <li key={a.id} className="cv-acao">
                    <span aria-hidden className="cv-acao-icone" style={{ ["--cv-tom" as string]: a.tom === "destaque" ? "var(--primary)" : `var(--${a.tom})` }}>
                      <Icon name={a.icone} size={17} color="currentColor" />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="og-linha-tit">{a.titulo}</span>
                      <span className="og-linha-sub cv-quebra">{a.sub}</span>
                    </div>
                    <Botao tamanho="sm" variante={a.primario ? "primario" : "secundario"} onClick={a.fazer}>{a.botao}</Botao>
                  </li>
                ))}
              </ul>
            )}
          </CartaoPainel>
        </aside>
      </div>

      {/* ── Rodapé: etapas, análises, estado ──────────────────────────── */}
      <div className="cv-rodape">
        <CartaoPainel icone="hourglass-empty" titulo="Onde os chips estão parados"
          sub="Etapas do aquecimento com mais chips ou há mais tempo.">
          <DataList itens={etapas} colunas={colunas} chaveDe={(e) => e.chave} densa minWidth={0}
            onAbrir={editar ? (e) => editar({ tipo: "chips", titulo: e.rotulo, status: e.status }) : undefined}
            rotulo="Chips por etapa do aquecimento" vazio="Nenhum chip cadastrado." />
        </CartaoPainel>

        <CartaoPainel icone="chart-bar" titulo="Análises e relatórios"
          sub="O desempenho da contingência, visto de cada ângulo.">
          <ul className="og-lista cv-atalhos">
            <Atalho icone="chart-line" titulo="Uso de chips por período" sub="Um snapshot por dia, com a comparação" onClick={() => irPara("historico")} />
            <Atalho icone="alert-triangle" titulo="Falhas e restrições" sub="Restringidos e bloqueados por operadora" onClick={() => irPara("telefonica")} />
            <Atalho icone="users" titulo="Saúde por atendente" sub="Reservas, proxies e números de cada pessoa" onClick={() => irPara("atendentes")} />
            <Atalho icone="brand-meta" titulo="Estrutura Meta" sub="BMs e contas por situação" onClick={() => irPara("trafego")} />
          </ul>
        </CartaoPainel>

        <section className="mc-card cv-calma" data-alerta={tudoCalmo ? undefined : "1"}>
          <span aria-hidden className="cv-calma-arte">
            <Icon name="device-mobile" size={46} color="currentColor" />
            <span className="cv-calma-escudo"><Icon name="shield-check" size={22} color="#fff" /></span>
          </span>
          <h2>{tudoCalmo ? "Tudo sob controle" : `${acoes.length} ponto${acoes.length === 1 ? "" : "s"} pede${acoes.length === 1 ? "" : "m"} atenção`}</h2>
          <p>
            {tudoCalmo
              ? "A contingência garante que a operação continue ativa, mesmo quando um número cai."
              : "Resolva as pendências ao lado pra manter reserva e proxy em cada atendente."}
          </p>
          {comoFunciona && (
            <p className="cv-calma-mais">
              Chip novo entra no roteiro de aquecimento, vira pronto (reserva) e só então vai pra um atendente.
              Cada atendente precisa de reservas e de proxy — os limites de atenção e crítico ficam em Configurações.
            </p>
          )}
          <Botao tamanho="sm" variante="secundario" onClick={() => setComoFunciona((v) => !v)}>
            {comoFunciona ? "Entendi" : "Como funciona?"}
          </Botao>
        </section>
      </div>
    </div>
  );
}

function Celula({ icone, rotulo, valor, sub, cor = "var(--primary)", aoClicar }: { icone: string; rotulo: string; valor: number; sub: string; cor?: string; aoClicar?: () => void }) {
  const Tag = aoClicar ? "button" : "div";
  return (
    <Tag type={aoClicar ? "button" : undefined} onClick={aoClicar} className={"cv-celula" + (aoClicar ? " cv-celula-btn ui-card-alvo" : "")}>
      <span className="cv-celula-rot">
        <span aria-hidden className="cv-celula-icone" style={{ color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)` }}>
          <Icon name={icone} size={14} color="currentColor" />
        </span>
        {rotulo}
        {aoClicar && <span aria-hidden className="cv-lapis"><Icon name="edit" size={14} color="currentColor" /></span>}
      </span>
      <b className="stat mt-num" style={cor !== "var(--primary)" && valor > 0 ? { color: cor } : undefined}>{valor}</b>
      <span className="cv-celula-sub">{sub}</span>
    </Tag>
  );
}

function Atalho({ icone, titulo, sub, onClick }: { icone: string; titulo: string; sub: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="og-alerta cv-atalho" onClick={onClick}>
        <span aria-hidden className="og-cartao-icone"><Icon name={icone} size={17} color="var(--primary)" /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className="og-linha-tit">{titulo}</span>
          <span className="og-linha-sub">{sub}</span>
        </span>
        <Icon name="chevron-right" size={16} color="var(--text-dim)" style={{ flex: "none" }} />
      </button>
    </li>
  );
}
