"use client";

// ── Produção do dia ──────────────────────────────────────────────────────────
// A regra de reposição já existia (verificarReabastecimento, o botão "Repor
// estoque" do Catálogo) — o que faltava era um lugar que respondesse, SEM
// clicar em nada, "o que está abaixo do mínimo agora, o que já tem gente
// produzindo, e o que ainda não tem". É esta tela.
//
// Import type-only: lib/requisicoes.ts e lib/estoque-automacao.ts importam o
// cliente admin do Supabase (server-only). "import type" some no build — o
// mesmo padrão de PainelGeral.tsx puxando tipos de lib/ponto.ts.
import { useCallback, useEffect, useState } from "react";
import type { LinhaProducaoDia, ResumoReabastece } from "@/lib/requisicoes";
import { hierarquiaLabel } from "@/lib/estoque-hierarquia";
import { Icon } from "../Icon";
import { Switch } from "../Switch";
import { Botao } from "../ui/controles";
import { DataList, type Coluna } from "../ui/DataList";
import { Alerta } from "../ui/Alerta";

/** A linha pode vir com a CADEIA (SQL de producao_em_cadeia.sql rodado):
 *  o interruptor por item e a memória da dispensa. Ausente = painel de sempre. */
type LinhaComCadeia = LinhaProducaoDia & {
  producaoAutomatica?: boolean;
  dispensa?: { saldo: number; por: string | null; motivo: string | null; em: string | null } | null;
};

/** Uma ordem travada esperando material — atividade (tablet) ou programação
 *  (máquina), com o que falta pra ela poder andar. */
interface OrdemAguardando {
  ordem: "atividade" | "programacao";
  id: string;
  produto: string | null;
  alvo: number;
  origem: string | null;
  faltas: { nome: string; falta: number }[];
}

interface Resposta {
  automacao: { ativa: boolean; ultimaVarredura: string | null };
  /** Exigir o bipe do material antes de a atividade abrir no tablet da bancada.
   *  Pode faltar numa resposta antiga em cache — ausente é DESLIGADO, que é o
   *  lado seguro (ligado sem etiqueta no material tranca a bancada). */
  bipeParaIniciar?: boolean;
  linhas: LinhaComCadeia[];
  /** Pode faltar (resposta antiga / SQL da cadeia não rodado). */
  cadeia?: { aguardando: OrdemAguardando[] };
  /** `aguardando` pode faltar numa resposta antiga em cache — trate como 0. */
  totais: { itens: number; aProduzir: number; aguardando?: number };
}

// "24/07" a partir de "2024-07-24" — sem passar por Date/fuso, a string do
// servidor já é o dia certo em São Paulo (hojeSP em estoque-automacao.ts).
function dataBR(yyyyMmDd: string): string {
  const [, m, d] = yyyyMmDd.split("-");
  return `${d}/${m}`;
}

export function ProducaoDiaClient() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);
  const [switchBusy, setSwitchBusy] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<ResumoReabastece | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/estoque/producao-dia", { cache: "no-store" });
    if (!r.ok) { setErroCarga(true); setLoading(false); return; }
    const d = await r.json().catch(() => null);
    if (!d || !d.automacao) { setErroCarga(true); setLoading(false); return; }
    setDados(d);
    setErroCarga(false);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function alternarAutomacao(ativa: boolean) {
    if (!dados) return;
    setSwitchBusy(true);
    // Otimista: quem clicou vê o trilho mudar na hora, não só depois do round-trip.
    setDados({ ...dados, automacao: { ...dados.automacao, ativa } });
    try {
      const r = await fetch("/api/estoque/producao-dia", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativa }),
      });
      if (!r.ok) { setDados((cur) => cur && { ...cur, automacao: { ...cur.automacao, ativa: !ativa } }); return; }
      // Recarrega em vez de só aplicar a resposta do PATCH: é o GET, não o PATCH,
      // que roda `varrerSeNecessario`. Se ligou agora e ninguém mais abriu a tela
      // hoje, é ESTA pessoa que vai ver a varredura acontecer e a lista mudar —
      // exatamente o que a frase abaixo do interruptor promete.
      await load();
    } finally {
      setSwitchBusy(false);
    }
  }

  /**
   * O segundo interruptor: exigir o bipe do material antes de a atividade abrir
   * no tablet da bancada.
   *
   * Não recarrega a tela depois, ao contrário do irmão acima — aquele dispara a
   * varredura e MUDA a lista na frente de quem clicou; este só troca um
   * booleano que o tablet vai ler no próximo ciclo. Recarregar aqui seria uma
   * busca inteira pra redesenhar a mesma tela.
   */
  async function alternarBipe(exige: boolean) {
    if (!dados) return;
    setSwitchBusy(true);
    setDados({ ...dados, bipeParaIniciar: exige });
    try {
      const r = await fetch("/api/estoque/producao-dia", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bipeParaIniciar: exige }),
      });
      if (!r.ok) setDados((cur) => cur && { ...cur, bipeParaIniciar: !exige });
    } finally {
      setSwitchBusy(false);
    }
  }

  /** O interruptor POR ITEM: "só os que eu ativar" geram atividade sozinhos. */
  async function alternarItem(itemId: string, ligar: boolean) {
    if (!dados) return;
    setDados({
      ...dados,
      linhas: dados.linhas.map((l) => String(l.itemId) === itemId ? { ...l, producaoAutomatica: ligar } : l),
    });
    const r = await fetch("/api/estoque/producao-dia", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, producaoAutomatica: ligar }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      setDados((cur) => cur && {
        ...cur,
        linhas: cur.linhas.map((l) => String(l.itemId) === itemId ? { ...l, producaoAutomatica: !ligar } : l),
      });
      if (d?.detalhe) setAvisoCadeia(String(d.detalhe));
    }
  }

  const [avisoCadeia, setAvisoCadeia] = useState<string | null>(null);

  /** "Não precisa fazer" numa ordem travada — o fallback da automação. */
  async function dispensarOrdem(atividadeId: string) {
    const r = await fetch("/api/atividades/dispensar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ atividadeId }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => null);
      setAvisoCadeia(String(d?.detalhe ?? "Não deu pra dispensar agora."));
      return;
    }
    await load();
  }

  async function gerarAtividades() {
    setGerando(true);
    setResultado(null);
    try {
      const r = await fetch("/api/estoque/producao-dia", { method: "POST" });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.resumo) {
        setResultado(d.resumo);
        await load(); // a lista (em andamento / a produzir) mudou depois de gerar
      } else {
        setResultado(null);
      }
    } finally {
      setGerando(false);
    }
  }

  if (loading) return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  if (erroCarga || !dados) {
    return (
      <div className="glass" style={{ padding: 24, borderRadius: "var(--r-md)", color: "var(--text-dim)" }}>
        Não foi possível carregar a produção do dia agora. Se persistir, confira se o SQL de fundação (estoque_automacao.sql) foi executado.
      </div>
    );
  }

  const { automacao, linhas, totais } = dados;

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14 }}>
        A mesma regra do botão &quot;Repor estoque&quot; do Catálogo, mas sem esperar
        alguém abrir a tela pra ver: o que está abaixo do mínimo hoje, o que já
        tem gente produzindo e o que ainda não tem ninguém cobrindo.
      </p>

      <PainelAutomacao automacao={automacao} busy={switchBusy} onAlternar={alternarAutomacao} />
      <PainelBipe exige={dados.bipeParaIniciar === true} busy={switchBusy} onAlternar={alternarBipe} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "20px 0 12px" }}>
        <h2 style={{ fontSize: 15, fontWeight: 750, margin: 0 }}>
          O que falta
          {linhas.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>
              {totais.itens} {totais.itens === 1 ? "item" : "itens"} abaixo do mínimo
              {totais.aProduzir > 0 ? ` · ${totais.aProduzir} pç ainda sem cobertura` : " · tudo já coberto"}
            </span>
          )}
        </h2>
        <Botao variante="primario" icone="refresh" carregando={gerando} onClick={gerarAtividades}>
          Gerar atividades
        </Botao>
      </div>

      {resultado && <ResultadoBanner resumo={resultado} />}

      {avisoCadeia && (
        <Alerta tom="atencao" style={{ marginBottom: 14 }}>{avisoCadeia}</Alerta>
      )}

      {(dados.cadeia?.aguardando?.length ?? 0) > 0 && (
        <FaixaAguardandoMaterial ordens={dados.cadeia!.aguardando} onDispensar={dispensarOrdem} />
      )}

      {/* Sem esta faixa, a pergunta "por que o item está abaixo do mínimo e
          ninguém está produzindo?" não tem resposta em tela nenhuma: as peças
          existem, estão prontas, e o que falta é o gerente conferir. */}
      {(totais.aguardando ?? 0) > 0 && <FaixaAguardando pecas={totais.aguardando ?? 0} />}

      {linhas.length === 0 ? (
        <div className="glass glass-spec" style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderRadius: "var(--r-md)" }}>
          <Icon name="circle-check" size={20} color="var(--ok)" />
          <div>
            <strong style={{ fontSize: 13.5 }}>Nada abaixo do mínimo</strong>
            <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "2px 0 0" }}>O catálogo inteiro está com o estoque em dia.</p>
          </div>
        </div>
      ) : (
        <DataList itens={linhas} colunas={colunasDaProducao(alternarItem)} chaveDe={(l) => String(l.itemId)}
          rotulo="Produção do dia" minWidth={760} densa />
      )}
    </div>
  );
}

// ── Interruptor da automação ─────────────────────────────────────────────────
function PainelAutomacao({ automacao, busy, onAlternar }: {
  automacao: { ativa: boolean; ultimaVarredura: string | null };
  busy: boolean;
  onAlternar: (v: boolean) => void;
}) {
  return (
    <div className="glass glass-spec" style={{ padding: "16px 18px", borderRadius: "var(--r-md)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <strong style={{ fontSize: 14 }}>Criar atividades de reposição sozinho</strong>
          {/* Frase que o pedido exige literalmente: quem liga isto precisa saber
              que dispara na PRÓXIMA visita de alguém, não numa hora agendada
              invisível — porque cria trabalho pra outras pessoas. */}
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "4px 0 0", lineHeight: 1.5 }}>
            Ligado, a primeira pessoa que abrir esta tela a cada dia faz o sistema
            gerar as atividades do que está faltando. Desligado, nenhuma atividade
            nasce sozinha — nem a varredura automática, nem os botões &quot;Repor
            estoque&quot;/&quot;Gerar atividades&quot;, nem pedido de insumo ou peça
            faltante no tablet. Toda produção sai da sua mão.
          </p>
        </div>
        <Switch checked={automacao.ativa} onChange={onAlternar} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-dim)", opacity: busy ? 0.6 : 1 }}>
        <Icon name="history" size={14} color="var(--text-dim)" />
        {automacao.ultimaVarredura
          ? <span>Última varredura: <strong style={{ color: "var(--text)" }}>{dataBR(automacao.ultimaVarredura)}</strong></span>
          : <span>Ainda não rodou hoje.</span>}
      </div>
    </div>
  );
}

// ── Interruptor do bipe do material ──────────────────────────────────────────
//
// O irmão do de cima, e o mais perigoso dos dois: ligado, ninguém abre uma
// atividade sem bipar o material. É por isso que a frase abaixo dele avisa o
// que precisa estar pronto ANTES — não é cautela genérica, é a única coisa que
// separa "rastreabilidade" de "a bancada inteira parada esperando um bipe que
// não existe".
function PainelBipe({ exige, busy, onAlternar }: {
  exige: boolean;
  busy: boolean;
  onAlternar: (v: boolean) => void;
}) {
  return (
    <div className="glass glass-spec" style={{ padding: "16px 18px", borderRadius: "var(--r-md)", display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 260px" }}>
          <strong style={{ fontSize: 14 }}>Exigir o bipe do material pra começar</strong>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "4px 0 0", lineHeight: 1.5 }}>
            Ligado, quem for fazer uma atividade no tablet da bancada precisa bipar
            a etiqueta do material antes de começar. É isso que liga a peça pronta
            ao material que entrou nela — e a quem produziu esse material.
          </p>
        </div>
        <Switch checked={exige} onChange={onAlternar} />
      </div>
      {/* O aviso muda com o estado: ligado, o que fazer se travar; desligado, o
          que precisa existir antes de ligar. Aviso que não muda vira paisagem. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 7, fontSize: 12, color: "var(--text-dim)", opacity: busy ? 0.6 : 1, lineHeight: 1.5 }}>
        <Icon name={exige ? "info-circle" : "alert-triangle"} size={14} color={exige ? "var(--text-dim)" : "var(--atencao)"} />
        {exige
          ? <span>Quem não conseguir bipar (etiqueta descolada, material sem etiqueta) toca em <strong style={{ color: "var(--text)" }}>“Não deu pra bipar”</strong>, escolhe o motivo e começa mesmo assim — o motivo fica registrado.</span>
          : <span>Antes de ligar: o material precisa estar <strong style={{ color: "var(--text)" }}>etiquetado</strong> e a bancada precisa ter <strong style={{ color: "var(--text)" }}>leitor</strong>. Sem isso, todo mundo cai na saída de emergência e o registro do primeiro mês não vale nada.</span>}
      </div>
    </div>
  );
}

// ── Resultado do botão "Gerar atividades" ────────────────────────────────────
// "Tudo coberto" é uma resposta real e frequente — precisa ler como sucesso,
// não como "nada aconteceu". Distingue três casos: nada abaixo do mínimo,
// tudo que estava abaixo já tem gente produzindo o suficiente, e criou algo.
function ResultadoBanner({ resumo }: { resumo: ResumoReabastece }) {
  let texto: string; let tom: "ok" | "atencao";
  if (resumo.abaixo === 0) {
    texto = "Nada abaixo do mínimo — nenhuma atividade foi necessária.";
    tom = "ok";
  } else if (resumo.criadas > 0) {
    const restante = resumo.abaixo - resumo.criadas;
    texto = `${resumo.criadas} atividade${resumo.criadas === 1 ? "" : "s"} de reposição criada${resumo.criadas === 1 ? "" : "s"} (${resumo.abaixo} item(ns) abaixo do mínimo)${restante > 0 ? `, ${restante} já coberto(s)` : ""}.`;
    tom = "ok";
  } else if (resumo.itens.some((i) => i.resultado === "automacao_desligada")) {
    // Interruptor geral desligado (ou o item não está ativado pra reposição
    // sozinha): nenhuma atividade foi criada, mas os itens abaixo do mínimo
    // são reais — "tudo coberto" mentiria aqui.
    texto = `${resumo.abaixo} item(ns) abaixo do mínimo, mas a automação está desligada — nenhuma atividade foi criada. Ligue o interruptor acima, ou crie a atividade na mão.`;
    tom = "atencao";
  } else if (resumo.itens.some((i) => i.resultado === "sem_ficha")) {
    // Falta CADASTRO, não material. Nomear os itens é o ponto: sem os nomes,
    // a pessoa não tem por onde começar a arrumar.
    const nomes = resumo.itens.filter((i) => i.resultado === "sem_ficha").map((i) => i.nome);
    texto = `${nomes.length} item(ns) esperando ficha técnica — a ordem não vai pra bancada sem saber do que a peça é feita: ${nomes.slice(0, 6).join(", ")}${nomes.length > 6 ? "…" : ""}.`;
    tom = "atencao";
  } else if (resumo.itens.some((i) => i.resultado === "sem_especialista")) {
    texto = `${resumo.abaixo} item(ns) abaixo do mínimo, mas sem especialista disponível pra assumir agora.`;
    tom = "atencao";
  } else {
    texto = `Tudo coberto — os ${resumo.abaixo} item(ns) abaixo do mínimo já têm produção em andamento suficiente.`;
    tom = "ok";
  }
  return <Alerta tom={tom} style={{ marginBottom: 14 }}>{texto}</Alerta>;
}

// ── "Tem peça pronta esperando o gerente" ────────────────────────────────────
// Faixa informativa (não é erro): as peças existem, o ciclo só não terminou.
// Antes desta conta o motor de reposição não enxergava essas peças e mandava
// produzir de novo o que já estava pronto na caixa.
// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
function FaixaAguardando({ pecas }: { pecas: number }) {
  return (
    <Alerta tom="info" icone="hourglass-high" style={{ marginBottom: 14 }}>
      {/* ── Uma frase por número, não seis ternários costurados ──────────────
          A versão anterior montava a frase com `{n === 1 ? "ela" : "elas"}`
          no meio do texto e saía ERRADA nas duas pontas:

          1. O espaço depois de `}` era engolido — o compilador tira o branco
             que abre um bloco de texto JSX de VÁRIAS linhas, e a tela mostrava
             "por isso elascontam como cobertura", sem espaço. (O irmão logo
             acima já contornava isso pondo o espaço DENTRO da string:
             `" espera"`.)
          2. Com uma peça só a concordância quebrava: "ela contam", "não
             entram", "Elas só viram" — o plural estava fixo no resto da frase.

          Duas frases inteiras não têm como colar palavra nem discordar. */}
      {pecas === 1 ? (
          <><strong>1 peça</strong> já está pronta e espera conferência — por isso ela conta como cobertura e não entra no &quot;a produzir&quot;. Ela só vira estoque quando alguém abrir a aba <strong>Conferir</strong> e liberar.</>
        ) : (
          <><strong>{pecas} peças</strong> já estão prontas e esperam conferência — por isso elas contam como cobertura e não entram no &quot;a produzir&quot;. Elas só viram estoque quando alguém abrir a aba <strong>Conferir</strong> e liberar.</>
      )}
    </Alerta>
  );
}

// ── "Aguardando material": as ordens que a cadeia travou ─────────────────────
// A transparência do motor: cada ordem invisível pra bancada aparece AQUI, com
// o que falta em números — e o botão de dispensar quando ela nem precisava
// existir. Sem esta faixa, "cadê a atividade que o sistema disse que criou?"
// não teria resposta em tela nenhuma.
// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
function FaixaAguardandoMaterial({ ordens, onDispensar }: {
  ordens: OrdemAguardando[];
  onDispensar: (atividadeId: string) => void;
}) {
  return (
    <Alerta tom="atencao" icone="hourglass-high" titulo={<>Aguardando material ({ordens.length})</>} style={{ marginBottom: 14 }}>
      {ordens.map((o) => (
        <span key={o.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <span style={{ minWidth: 0, flex: "1 1 220px", lineHeight: 1.5 }}>
            <strong>Produzir {o.alvo}× {o.produto ?? "item"}</strong>
            <span style={{ color: "var(--text-dim)" }}>
              {" "}({o.ordem === "programacao" ? "máquina" : "tablet"}) — falta{" "}
              {o.faltas.length
                ? o.faltas.map((f) => `${f.falta}× ${f.nome}`).join(", ")
                : "material (detalhe indisponível)"}
            </span>
            {o.origem && <span style={{ color: "var(--text-dim)" }}> · {o.origem}</span>}
          </span>
          {o.ordem === "atividade" && (
            <Botao variante="sutil" tamanho="sm" onClick={() => onDispensar(o.id)}>
              Não precisa fazer
            </Botao>
          )}
        </span>
      ))}
      <span style={{ display: "block", marginTop: 8 }}>
        Essas ordens não aparecem no tablet nem na fila de máquinas — liberam
        sozinhas quando o material entrar (conferência, recebimento ou entrada
        por leitura).
      </span>
    </Alerta>
  );
}

// ── Colunas (tabela no computador, cartão no celular) ─────────────────────────
// Uma definição só pros dois desenhos: antes eram `LinhaTabela` e `LinhaCard`,
// e cada coluna nova precisava ser lembrada duas vezes.
function colunasDaProducao(onAlternarAuto: (itemId: string, ligar: boolean) => void): Coluna<LinhaComCadeia>[] {
  const num = { fontVariantNumeric: "tabular-nums" } as const;
  return [
    {
      chave: "auto", titulo: "Auto",
      render: (l) => l.producaoAutomatica !== undefined
        ? <Switch checked={l.producaoAutomatica} onChange={(v) => onAlternarAuto(String(l.itemId), v)} />
        : <span style={{ color: "var(--text-dim)" }}>—</span>,
    },
    {
      chave: "item", titulo: "Item", papel: "titulo", ordenar: (l) => l.nome,
      render: (l) => (
        <span style={{ fontWeight: 650 }}>
          {l.nome}
          {l.dispensa && (
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>
              dispensada{l.dispensa.por ? ` por ${l.dispensa.por}` : ""} — volta se o saldo cair abaixo de {l.dispensa.saldo}
            </span>
          )}
        </span>
      ),
    },
    {
      chave: "hierarquia", titulo: "Hierarquia", ordenar: (l) => hierarquiaLabel(l.hierarquia as string | null),
      render: (l) => <span style={{ color: "var(--text-dim)" }}>{hierarquiaLabel(l.hierarquia as string | null)}</span>,
    },
    {
      chave: "estoque", titulo: "Estoque", ordenar: (l) => l.quantidade,
      render: (l) => <span style={num}>{l.quantidade} <span style={{ color: "var(--text-dim)" }}>/ mín. {l.minima}</span></span>,
    },
    { chave: "falta", titulo: "Falta até o ideal", ordenar: (l) => l.falta, render: (l) => <span style={num}>{l.falta}</span> },
    {
      chave: "andamento", titulo: "Em andamento", ordenar: (l) => l.emAndamento,
      render: (l) => <span style={{ ...num, color: l.emAndamento > 0 ? "var(--text)" : "var(--text-dim)" }}>{l.emAndamento}</span>,
    },
    {
      chave: "aguardando", titulo: "Aguardando conferência", ordenar: (l) => l.aguardando ?? 0,
      render: (l) => {
        const n = l.aguardando ?? 0;
        return <span style={{ ...num, color: n > 0 ? "var(--info)" : "var(--text-dim)", fontWeight: n > 0 ? 700 : 400 }}>{n}</span>;
      },
    },
    {
      // No cartão é o número ao lado do nome: "quanto falta fazer" é a
      // pergunta que abre esta tela.
      chave: "produzir", titulo: "A produzir", papel: "destaque", ordenar: (l) => l.aProduzir,
      render: (l) => l.aProduzir === 0
        ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "var(--ok)", whiteSpace: "nowrap" }}><Icon name="circle-check" size={13} color="var(--ok)" /> coberto</span>
        : <strong style={{ ...num, color: "var(--atencao)" }}>{l.aProduzir}</strong>,
    },
  ];
}
