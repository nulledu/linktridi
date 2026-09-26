"use client";

// ── Tridify · Kit visual compartilhado ──────────────────────────────────────
// Fonte ÚNICA dos padrões de card/estado/indicador da área de tráfego. A regra
// central: slots SEMPRE reservados. Card sem delta ou sem subtítulo ocupa o
// mesmo espaço de um card completo — é isso que mantém toda a fileira alinhada
// (a causa nº 1 dos "cards com alturas diferentes" era slot condicional).
// Tokens: usa as escalas do .tf-scope (--tf-r-*, --tf-sp-*, --tf-chart-*).

import { tfSet } from "./ajustes-na-conta";
import { Children, createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { MonoFaisca } from "../ui/graficos";
import { Botao, Interruptor } from "../ui/controles";
import { NumeroVivo } from "../ui/micro";
import { TfChart } from "./TfChart";
// Movimento do módulo (entrada em cascata, hover lift, chip, barra de meta,
// botão Atualizar). Importado aqui porque toda tela da Tridify passa pelo kit.
import "./tridify-motion.css";

// ── Favoritos (§16) — reusável para conta/campanha/anúncio/produto/visão ────
// Persiste por usuário no localStorage. As chaves são "<tipo>:<id>" pra um só
// store cobrir todos os alvos. (Igual ao resto da Tridify, que já usa
// localStorage por usuário; migrar pra user_prefs é evolução opcional.)
export function useFavoritos(userId: string) {
  const chave = `trafego.favoritos.${userId}`;
  const [set, setSet] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { const s = localStorage.getItem(chave); if (s) setSet(new Set(JSON.parse(s) as string[])); } catch { /* */ }
  }, [chave]);
  const has = (id: string) => set.has(id);
  const toggle = (id: string) => setSet((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    try { tfSet(chave, JSON.stringify([...n])); } catch { /* */ }
    return n;
  });
  return { has, toggle, count: set.size };
}

// Estrela clicável (Tabler star). Preenchida = favorito. SVG próprio porque o
// <Icon> força fill:none; aqui preciso alternar o preenchimento.
const STAR_PATH = "M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z";

/**
 * Só o DESENHO da estrela, sem botão em volta.
 *
 * Existe porque a estrela aparece em dois papéis diferentes e só um deles é
 * clicável: na linha da campanha ela É o botão de favoritar, mas no chip
 * "Favoritas" do topo ela é apenas o ícone do filtro — e ali o clique já é do
 * chip. Usar o `EstrelaFavorito` inteiro nesse segundo caso punha um `<button>`
 * dentro de outro: HTML inválido que o React recusa a hidratar, então ele
 * descartava o HTML do servidor e repintava a tela toda no cliente.
 */
export function IconeEstrela({ on, size = 16 }: { on: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden
      fill={on ? "var(--tf-gold, #b9975b)" : "none"}
      stroke={on ? "var(--tf-gold, #b9975b)" : "currentColor"}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={STAR_PATH} />
    </svg>
  );
}

export function EstrelaFavorito({ on, onToggle, size = 16, title }: { on: boolean; onToggle: () => void; size?: number; title?: string }) {
  return (
    <button onClick={(e) => { e.stopPropagation(); onToggle(); }} title={title ?? (on ? "Remover dos favoritos" : "Favoritar")}
      aria-pressed={on} style={{ display: "inline-flex", border: "none", background: "none", cursor: "pointer", padding: 2, lineHeight: 0 }}>
      <svg width={size} height={size} viewBox="0 0 24 24"
        fill={on ? "var(--tf-gold, #b9975b)" : "none"}
        stroke={on ? "var(--tf-gold, #b9975b)" : "var(--text-dim)"}
        strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={STAR_PATH} />
      </svg>
    </button>
  );
}

export type Rumo = "sobe" | "desce" | "igual";
/** `rumo` é opcional para não quebrar quem monta um DeltaInfo à mão: sem ele o
 *  `ComparisonIndicator` só imprime o texto, como antes. Com ele, desenha o
 *  ícone do Tabler. */
export interface DeltaInfo { txt: string; cor: string; rumo?: Rumo }

// Delta vs período anterior. `invert` = subir é ruim (CPA, CPM, gasto…).
// Não trata toda alta como positiva: quem decide a cor é o significado.
export function deltaDe(now: number, prev: number | null | undefined, invert = false): DeltaInfo | null {
  if (prev == null || prev === 0 || !isFinite(now)) return null;
  const ch = (now - prev) / prev;
  if (!isFinite(ch) || Math.abs(ch) < 0.005) return null;
  const bom = invert ? ch < 0 : ch > 0;
  // `txt` sai SEM glifo e o rumo vem separado. Antes o ▲/▼ vinha grudado na
  // string, então quem renderizasse `{d.txt}` desenhava um caractere
  // tipográfico no lugar de um ícone — exatamente o que a regra "nada de emoji,
  // tudo Tabler" existe pra tirar da interface: o glifo troca de desenho e de
  // peso a cada fonte do sistema, e não aceita `stroke` nem tamanho.
  return {
    txt: `${Math.abs(ch * 100).toFixed(0)}%`,
    cor: bom ? "var(--tf-pos)" : "var(--tf-neg)",
    rumo: ch > 0 ? "sobe" : "desce",
  };
}

/** Ícone do rumo. Um lugar só decide qual seta é qual — as três cópias à mão
 *  desta conta (aqui, no TrafegoOverview e no Snapshots) já divergiram uma vez. */
export function IconeRumo({ rumo, cor, size = 14 }: { rumo: Rumo; cor?: string; size?: number }) {
  return (
    <Icon
      name={rumo === "igual" ? "minus" : rumo === "sobe" ? "trending-up" : "trending-down"}
      size={size}
      color={cor}
      style={{ flex: "none" }}
    />
  );
}

// ── Valores formatados (numeral tabular sempre) ─────────────────────────────
// Fonte única de formatação: BRL, número e percentual. O .stat garante
// font-variant-numeric: tabular-nums — o dígito não "dança" ao trocar de valor.
export function CurrencyValue({ v, cor, className }: { v: number | null; cor?: string; className?: string }) {
  return <span className={`stat ${className ?? ""}`} style={{ color: cor }}>{v == null ? "—" : fmtBRL2(v)}</span>;
}
export function NumberValue({ v, cor, className }: { v: number | null; cor?: string; className?: string }) {
  return <span className={`stat ${className ?? ""}`} style={{ color: cor }}>{v == null ? "—" : fmtNum(v)}</span>;
}
export function PercentageValue({ v, casas = 1, cor, className }: { v: number | null; casas?: number; cor?: string; className?: string }) {
  return <span className={`stat ${className ?? ""}`} style={{ color: cor }}>{v == null ? "—" : `${v.toFixed(casas)}%`}</span>;
}

// ── ComparisonIndicator — "▲ 12% vs anterior" ───────────────────────────────
// UM componente canônico (antes era copiado à mão em cada card/tabela, com
// drift entre as cópias). Recebe now/prev + invert, ou um DeltaInfo pronto.
export function ComparisonIndicator({ now, prev, invert = false, dl, base = "vs anterior", size = 11.5 }: {
  now?: number; prev?: number | null; invert?: boolean; dl?: DeltaInfo | null; base?: string; size?: number;
}) {
  const d = dl !== undefined ? dl : (now != null ? deltaDe(now, prev, invert) : null);
  if (!d) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: size, fontWeight: 800, color: d.cor }}>
      {d.rumo && <IconeRumo rumo={d.rumo} cor={d.cor} size={size + 1.5} />}
      {d.txt} <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>{base}</span>
    </span>
  );
}

// ── FilterChip — chip de filtro (ativo/removível) ───────────────────────────
export function FilterChip({ label, valor, ativo = true, onClear, onClick }: {
  label?: string; valor: string; ativo?: boolean; onClear?: () => void; onClick?: () => void;
}) {
  return (
    <span onClick={onClick} className="tf-chip" style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999,
      fontSize: "var(--tf-fs-rotulo)", fontWeight: 700, cursor: onClick ? "pointer" : "default", whiteSpace: "nowrap",
      border: `1px solid ${ativo ? "color-mix(in srgb, var(--primary) 40%, transparent)" : "var(--border)"}`,
      background: ativo ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
      color: ativo ? "var(--primary-texto)" : "var(--text-dim)",
    }}>
      {label && <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>{label}</span>}
      {valor}
      {onClear && (
        <button className="ui-toque" onClick={(e) => { e.stopPropagation(); onClear(); }} title="Remover" aria-label="Remover filtro"
          style={{ display: "inline-flex", border: "none", background: "none", cursor: "pointer", padding: 0, margin: "0 -2px 0 1px", color: "inherit" }}>
          <Icon name="x" size={13} color="currentColor" />
        </button>
      )}
    </span>
  );
}

// ── Switch — alternador on/off (ex.: pausar/ativar campanha) ────────────────
// `estado`: undefined = desconhecido (neutro/cinza), true = ligado (verde),
// false = desligado. `pendente` gira na bolinha e ignora cliques enquanto aplica.
// Visual e movimento: `Interruptor` do kit. O halo de 44px só existe no toque
// (`.ui-toque` é `pointer: coarse`) — no desktop ele aumentaria a área de um
// botão que pausa campanha de verdade, e um clique de raspão viraria acidente.
// Para a propagação porque mora dentro de linha clicável da tabela.
export function Switch({ estado, onToggle, disabled, pendente, titulo }: {
  estado: boolean | undefined; onToggle: () => void; disabled?: boolean; pendente?: boolean; titulo?: string;
}) {
  return (
    <Interruptor ligado={estado === true} onChange={() => onToggle()} indefinido={estado === undefined}
      pendente={pendente} desativado={disabled} titulo={titulo} cor="var(--tf-pos)" tamanho="sm" pararPropagacao />
  );
}

// ── SyncStatus — selo de sincronização em segundo plano ─────────────────────
export function SyncStatus({ rodando, restantes = 0 }: { rodando: boolean; restantes?: number }) {
  if (!rodando) return null;
  return (
    <span title="Os dados na tela já são utilizáveis; isto busca o que chegou depois." style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 999,
      fontSize: "var(--tf-fs-detalhe)", fontWeight: 700, color: "var(--primary-texto, var(--primary))",
      background: "color-mix(in srgb, var(--primary) 10%, transparent)",
      border: "1px solid color-mix(in srgb, var(--primary) 25%, transparent)",
    }}>
      <span className="spin" style={{ display: "inline-flex" }}><Icon name="refresh" size={12} color="var(--primary-texto)" /></span>
      Sincronizando dados novos{restantes > 0 ? ` · ${restantes} conta(s)` : ""}
    </span>
  );
}

// ── StatusCard — ícone + título + estado + descrição + ação (§4/§16) ────────
export function StatusCard({ icon, titulo, estado, estadoCor = "var(--text-dim)", descricao, acao }: {
  icon: string; titulo: string; estado: string; estadoCor?: string; descricao?: string;
  acao?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", height: "100%" }}>
      <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <Icon name={icon} size={17} color={estadoCor} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--tf-fs-realce)", fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</span>
          <span style={{ fontSize: "var(--tf-fs-detalhe)", fontWeight: 800, color: estadoCor }}>{estado}</span>
        </div>
        {descricao && <div style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", marginTop: 2, lineHeight: 1.45 }}>{descricao}</div>}
        {acao && <Botao variante="secundario" tamanho="sm" onClick={acao.onClick} style={{ marginTop: 6 }}>{acao.label}</Botao>}
      </div>
    </div>
  );
}

// ── InsightCard / OpportunityCard / RiskCard (§11/§12) ──────────────────────
// Item de diagnóstico. A FAIXA lateral colorida saiu (decisão do dono, 18/09):
// uma barra de 3px sem função lia como decoração pesada — e em lote, como
// defeito. A cor agora é APOIO e mora onde tem papel: no chip do ícone (que
// diz o TIPO do diagnóstico de relance) e na linha de ação (que diz o que
// fazer). O resto é tipografia: título micro, fato em corpo, ação com seta.
// `acoes` permite "transformar em tarefa/anotação/…".
export type InsightTom = "op" | "risco" | "info";
export function InsightCard({ tom, severidade = "media", titulo, texto, acao, acoes }: {
  tom: InsightTom; severidade?: "boa" | "media" | "alta"; titulo: string; texto: string;
  acao?: string; acoes?: React.ReactNode;
}) {
  const cor = tom === "op" ? "var(--tf-pos)" : tom === "info" ? "var(--tf-info)"
    : severidade === "alta" ? "var(--tf-neg)" : "var(--tf-warn)";
  const icone = tom === "op" ? "trending-up" : tom === "info" ? "activity" : "alert-triangle";
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: "var(--tf-r-sm, 10px)", background: "var(--surface-2)", alignItems: "flex-start" }}>
      <span aria-hidden style={{ width: 26, height: 26, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", marginTop: 1, background: `color-mix(in srgb, ${cor} 12%, transparent)` }}>
        <Icon name={icone} size={14} color={cor} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: "var(--tf-fs-micro)", fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</div>
        <div style={{ fontSize: "var(--tf-fs-corpo)", color: "var(--text)", marginTop: 2, lineHeight: 1.45 }}>{texto}</div>
        {acao && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--tf-fs-detalhe)", fontWeight: 700, color: cor, marginTop: 4 }}>
            {acao}<Icon name="arrow-right" size={12} color={cor} />
          </div>
        )}
        {acoes && <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>{acoes}</div>}
      </div>
    </div>
  );
}
export const OpportunityCard = (p: Omit<Parameters<typeof InsightCard>[0], "tom">) => <InsightCard tom="op" {...p} />;
export const RiskCard = (p: Omit<Parameters<typeof InsightCard>[0], "tom">) => <InsightCard tom="risco" {...p} />;

// ── Caber na caixa: as duas peças que fazem o conteúdo obedecer ao card ─────
// O card do painel tem tamanho fixo (P/M/G). Aparar o excedente com `overflow`
// corta LINHA NO MEIO — é o que deixava "Vega Checkout" pela metade na borda de
// baixo. Conteúdo que não cabe tem que se ajustar, e há só dois jeitos honestos
// de fazer isso: mostrar menos itens, ou desenhar tudo menor.

/**
 * Lista que mostra só o que CABE e resume o resto num "+N".
 *
 * Mede em duas passadas: primeiro renderiza tudo pra colher a altura de cada
 * item (guardada num ref, senão ela se perde quando os itens somem), depois
 * corta na conta e repinta. As duas passadas acontecem em `useLayoutEffect`,
 * antes do paint — ninguém vê a lista completa piscar.
 */
export function ListaQueCabe({ children, className = "", style, rotuloResto }: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Texto do resumo. Padrão: "+3 linhas". */
  rotuloResto?: (n: number) => string;
}) {
  // toArray já descarta `false`/`null` das linhas condicionais — o que sobra é
  // exatamente o que vira <div> filha, que é o que a medição conta.
  const itens = Children.toArray(children);
  const caixa = useRef<HTMLDivElement>(null);
  // null = medindo (mostra tudo). Número = quantos cabem.
  const [cabem, setCabem] = useState<number | null>(null);
  const total = itens.length;

  // Item novo: volta a medir do zero.
  useLayoutEffect(() => { setCabem(null); }, [total]);

  // SEM array de dependência, de propósito. O gatilho é a altura da caixa, e
  // ela muda por caminhos que não passam por dep nenhuma: o botão P/M/G
  // re-renderiza sem mexer em `total`, e ResizeObserver não existe em jsdom
  // nem dispara em todo navegador embutido. Medir a cada render é barato
  // (duas leituras de layout) e para sozinho.
  const ultimaAltura = useRef(-1);
  const remedicoes = useRef(0);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const disponivel = el.clientHeight;

    // Já medido: só remede se a CAIXA mudou de tamanho (trocou P por M, girou
    // a tela). Não pode ser "mudou de altura" genérico — ver o parágrafo abaixo.
    //
    // E remede NO MÁXIMO oito vezes por período de instabilidade: se a altura
    // da caixa oscilar entre a medição e o corte (aconteceu uma vez, numa
    // hidratação com resize no meio — irreproduzível depois), o pior resultado
    // permitido é um corte levemente desatualizado. Sem o teto, o pior
    // resultado era "Maximum update depth exceeded" derrubando a TELA inteira
    // no ErrorBoundary — o mesmo modo de falha que a trava do <CabeNaCaixa>
    // já fecha do lado do zoom.
    if (cabem !== null) {
      if (disponivel !== ultimaAltura.current) {
        ultimaAltura.current = disponivel;
        if (remedicoes.current < 8) { remedicoes.current++; setCabem(null); }
      } else {
        remedicoes.current = 0;   // altura estável: crédito de volta
      }
      return;
    }

    // Medindo, com TODOS os itens na tela.
    ultimaAltura.current = disponivel;
    // Coube inteiro — inclusive o caso do celular, onde a caixa tem altura
    // automática e portanto nunca transborda. Esta saída é o que impede o laço:
    // sem ela, tirar linha encolhia a caixa, a caixa menor pedia nova medição,
    // a medição devolvia as linhas, e o React estourava em "Maximum update
    // depth" na primeira largura de telefone.
    if (disponivel <= 0 || el.scrollHeight <= disponivel + 1) { setCabem(total); return; }

    const gap = parseFloat(getComputedStyle(el).rowGap) || 0;
    const alturas = ([...el.children] as HTMLElement[]).map((f) => f.offsetHeight);
    let soma = 0, n = 0;
    for (const h of alturas) {
      const proximo = soma + (n ? gap : 0) + h;
      if (proximo > disponivel) break;
      soma = proximo; n++;
    }
    // Sobrou item de fora: o "+N" também ocupa uma linha, e ela tem altura
    // PRÓPRIA (11px) — descontar "um item qualquer" errava por alguns pixels e
    // deixava a última linha encostando na borda.
    if (n < total) {
      const reserva = 16 + gap;
      while (n > 1 && soma + reserva > disponivel) { soma -= alturas[n - 1] + gap; n--; }
    }
    setCabem(Math.max(1, Math.min(total, n)));
  });

  const mostrados = cabem === null ? itens : itens.slice(0, cabem);
  const ocultos = total - mostrados.length;
  const resto = rotuloResto ?? ((n: number) => `+${n} ${n === 1 ? "linha" : "linhas"}`);
  return (
    // `visibility: hidden` enquanto mede (19/09, o flash "dentro do widget"):
    // o layout effect corta antes da pintura DEPOIS de hidratar, mas o HTML
    // do servidor chega com a lista INTEIRA e fica visível até o JS rodar —
    // era o conteúdo gigante da carga. Invisível mede igual; aparece já
    // cortado.
    <div ref={caixa} className={`tf-w-corpo tf-w-lista ${className}`.trim()} style={{ ...style, visibility: cabem === null ? "hidden" : undefined }}>
      {mostrados}
      {ocultos > 0 && (
        <div style={{ flex: "none", fontSize: "var(--tf-fs-micro)", fontWeight: 700, color: "var(--text-dim)" }}>{resto(ocultos)}</div>
      )}
    </div>
  );
}

/**
 * Bloco que DESENHA MENOR quando não cabe (funil, cartão de vendas, tabela).
 * Para conteúdo que não é lista e portanto não dá pra cortar por item.
 *
 * Usa `zoom`, não `transform: scale`: transform vira bloco de contenção de
 * `position: fixed` (a armadilha de sempre) e ainda mente no
 * `getBoundingClientRect`. `zoom` refaz o layout de verdade.
 */
export function CabeNaCaixa({ children, minimo = 0.62 }: { children: React.ReactNode; minimo?: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const miolo = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(1);
  // Mesma regra do ListaQueCabe (19/09): o HTML do servidor chega em escala 1
  // e fica na tela até o JS hidratar — o conteúdo "gigante" da carga. Fica
  // invisível até a PRIMEIRA medição decidir a escala; invisível mede igual.
  const [mediu, setMediu] = useState(false);

  // Sem array de dependência pelo mesmo motivo do ListaQueCabe: a altura da
  // caixa muda sem que nenhuma prop mude. Converge num passo — com `zoom: z`
  // aplicado, `rect.height / z` devolve sempre a altura natural, então o alvo
  // calculado na segunda passada é igual ao da primeira e o setZ não repete.
  //
  // "Converge num passo" vale enquanto a altura natural do conteúdo NÃO depender
  // do zoom. Um grid `auto-fit` dentro daqui quebra essa premissa: encolher o
  // zoom alarga o conteúdo em colunas, o número de colunas muda, a altura pula,
  // e o zoom pula de volta — laço infinito, e o laço aqui não deixa um widget
  // torto, derruba a TELA INTEIRA no ErrorBoundary (foi o que as Métricas do
  // Meta fizeram a 800px de largura). O contador é a rede: seis ajustes é muito
  // mais do que a convergência honesta precisa, e o sétimo para com o último
  // valor em vez de matar a página.
  const ajustes = useRef(0);
  useLayoutEffect(() => {
    // Revela ANTES dos retornos antecipados: o `mediu` existe só pra cobrir a
    // pré-hidratação (HTML do servidor em escala 1). Revelar apenas após uma
    // medição BEM-SUCEDIDA prendia o card invisível enquanto o dado não
    // chegava (caixa/conteúdo com altura 0 pulava o setMediu) — era o
    // "Vendas da Yampi só aparece quando carrega".
    if (!mediu) setMediu(true);
    const fora = caixa.current, dentro = miolo.current;
    if (!fora || !dentro) return;
    const disponivel = fora.clientHeight;
    if (disponivel <= 0) return;
    const natural = dentro.getBoundingClientRect().height / (z || 1);
    if (natural <= 0) return;
    const alvo = Math.min(1, Math.max(minimo, disponivel / natural));
    if (Math.abs(alvo - z) > 0.015 && ajustes.current < 6) { ajustes.current++; setZ(alvo); }
  });

  // flex-start, não center: centralizar reparte a sobra em DOIS — metade vira
  // faixa vazia ACIMA do conteúdo, e o card passa a parecer que carregou pela
  // metade (era o vão no topo do "Yampi · faturamento e vendas" e do "BMs e
  // contas"). Encostando no topo a sobra fica toda embaixo, onde é só folga.
  return (
    <div ref={caixa} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", justifyContent: "flex-start", visibility: mediu ? undefined : "hidden" }}>
      <div ref={miolo} style={{ zoom: z }}>{children}</div>
    </div>
  );
}

// ── Tamanho do card, por contexto ───────────────────────────────────────────
/**
 * Quanto de caixa o widget tem: 1 = P (342×176), 2 = M (697×366), 4 = G.
 *
 * Vai por CONTEXTO, não por prop, porque quem sabe o tamanho é a grade e quem
 * precisa da resposta é um componente a três níveis de distância — no meio há
 * 44 chamadas de <MetricCard> escritas uma a uma no catálogo. Passar prop
 * significaria editar as 44 e lembrar de passar nas próximas; por contexto, o
 * card se adapta e o catálogo continua dizendo só QUAL métrica é.
 *
 * `null` = fora da grade (a fileira de KPIs do topo da Visão geral, que não tem
 * caixa fixa). Lá o card segue compacto, que é o certo: o tamanho é do
 * conteúdo, não de uma casa.
 */
export const TamanhoDoCard = createContext<number | null>(null);
export const useTamanhoDoCard = () => useContext(TamanhoDoCard);

/**
 * O ícone Tabler do widget, vindo do CATÁLOGO — que sempre teve um por widget
 * e nunca o entregava ao card. No design novo o KPI abre com o chip de ícone
 * (quadradinho roxo-claro), como no sistema de referência do dono. Contexto
 * pela mesma razão do tamanho: 44 chamadas de <MetricCard> escritas uma a uma.
 */
export const IconeDoCard = createContext<string | null>(null);

/** O chip: fundo roxo muito claro, ícone no destaque. Só dentro da grade. */
export function ChipDeIcone({ icone }: { icone: string }) {
  return (
    <span aria-hidden style={{ width: 34, height: 34, borderRadius: 10, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 10%, var(--surface-2))" }}>
      <Icon name={icone} size={17} color="var(--primary-texto, var(--primary))" />
    </span>
  );
}

/**
 * Altura que sobrou na caixa, pra conteúdo que precisa dela em PIXEL (o
 * <TfChart> desenha num viewBox de altura fixa).
 *
 * Mede o que o irmão já ocupa (`scrollHeight - altura atual`) e devolve o
 * resto. Converge num passo porque essa sobra não depende da altura devolvida.
 * Sem array de dependência pelo mesmo motivo do <ListaQueCabe>: a caixa muda de
 * tamanho sem que prop nenhuma mude (o botão P/M/G).
 */
export function useAlturaQueSobra(mínimo = 120) {
  const caixa = useRef<HTMLDivElement>(null);
  const [altura, setAltura] = useState(mínimo);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const disponivel = el.clientHeight;
    if (disponivel < mínimo) return;                 // caixa ainda não existe
    const ocupado = Math.max(0, el.scrollHeight - altura);
    const novo = Math.max(mínimo, disponivel - ocupado);
    if (Math.abs(novo - altura) > 2) setAltura(novo);
  });
  return { caixa, altura };
}

// ── Cartão do kit — a gramática de cartão FORA da grade ─────────────────────
// Os cinco padrões que o dono pediu vendo exemplos do HeroUI, traduzidos pros
// tokens da casa (as "variants" de lá são as nossas superfícies com outro
// nome). Fora da grade porque dentro dela quem manda é a casa fixa + `.tf-w`;
// isto aqui é pra telas, painéis laterais e listas — altura livre, rodapé
// ancorado com margin-top:auto (o que NÃO fere a regra da sobra-embaixo: ela
// vale pra caixa fixa; em altura livre o rodapé ancorado é o desenho certo).
function CartaoBase({ proeminencia, horizontal, destaque, compacto, imagem, style, className = "", children }: {
  /** plano (sem fundo, pra aninhar) · padrão · media (--surface-2) · alta (--surface-3). */
  proeminencia?: "plano" | "media" | "alta";
  horizontal?: boolean;
  /** O cartão "Recomendado": borda no destaque + lavado de 8% no canto. */
  destaque?: boolean;
  /** Linha de feed: miniatura de 64px, respiro apertado. */
  compacto?: boolean;
  /** Com <Cartao.Fundo>: a imagem preenche e o conteúdo flutua por cima. */
  imagem?: boolean;
  style?: React.CSSProperties; className?: string; children: React.ReactNode;
}) {
  return (
    <section className={`tf-panel tf-cartao${destaque ? " tf-cartao-destaque" : ""} ${className}`.trim()}
      data-proeminencia={proeminencia} data-horizontal={horizontal ? "" : undefined}
      data-compacto={compacto ? "" : undefined} data-imagem={imagem ? "" : undefined} style={style}>
      {children}
    </section>
  );
}
const CartaoMidia = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div className="tf-cartao-midia" style={style}>{children}</div>
);
const CartaoCorpo = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div className="tf-cartao-corpo" style={style}>{children}</div>
);
const CartaoTitulo = ({ children }: { children: React.ReactNode }) => (
  <h3 style={{ margin: 0, fontSize: "var(--tf-fs-realce)", fontWeight: 700, color: "var(--text)" }}>{children}</h3>
);
const CartaoDescricao = ({ children }: { children: React.ReactNode }) => (
  <p style={{ margin: 0, fontSize: "var(--tf-fs-corpo)", color: "var(--text-dim)", lineHeight: 1.5 }}>{children}</p>
);
const CartaoRodape = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div className="tf-cartao-rodape" style={style}>{children}</div>
);
/**
 * Fundo de imagem do cartão: a foto preenche e o conteúdo flutua por cima.
 * `veu` (ligado por padrão) é o degradê escuro que garante o contraste do
 * rodapé sobre QUALQUER foto — sem ele, a legibilidade depende da sorte da
 * imagem. `children` no lugar de `src` aceita um fundo desenhado (degradê de
 * marca, capa gerada).
 */
const CartaoFundo = ({ src, alt = "", veu = true, children }: { src?: string; alt?: string; veu?: boolean; children?: React.ReactNode }) => (
  <>
    <div className="tf-cartao-fundo" aria-hidden={alt === "" ? true : undefined}>
      {src ? <img src={src} alt={alt} loading="lazy" /> : children}
    </div>
    {veu && <div className="tf-cartao-veu" aria-hidden />}
  </>
);
export const Cartao = Object.assign(CartaoBase, {
  Midia: CartaoMidia, Corpo: CartaoCorpo, Titulo: CartaoTitulo, Descricao: CartaoDescricao, Rodape: CartaoRodape,
  Fundo: CartaoFundo,
});

/**
 * O rodapé-link do cartão ("Ver todas →", "Ir para ajustes →"): âncora quando
 * tem destino, botão quando tem ação — nunca um span fingindo. Alvo de toque
 * de 44px por regra da fundação.
 */
export function LinkDeAcao({ children, href, onClick, externo }: { children: React.ReactNode; href?: string; onClick?: () => void; externo?: boolean }) {
  const estilo: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, minHeight: "var(--tap)",
    padding: 0, border: "none", background: "none", cursor: "pointer",
    fontSize: "var(--tf-fs-corpo)", fontWeight: 700, color: "var(--primary-texto, var(--primary))",
    textDecoration: "none",
  };
  const miolo = <>{children}<Icon name="arrow-right" size={14} color="var(--primary-texto, var(--primary))" /></>;
  return href
    ? <a href={href} style={estilo} {...(externo ? { target: "_blank", rel: "noreferrer" } : undefined)}>{miolo}</a>
    : <button type="button" onClick={onClick} style={estilo}>{miolo}</button>;
}

/** O selo do cartão ("Recomendado", "Novo") — pill no destaque. */
export function Selo({ children }: { children: React.ReactNode }) {
  return <span className="tf-selo">{children}</span>;
}

/**
 * Avatar miúdo pra byline de rodapé ("Por Marcela"). Sem foto, as INICIAIS no
 * roxo-claro — nunca um quadrado quebrado de <img> sem src.
 */
export function AvatarMiudo({ nome, src, tamanho = 20 }: { nome: string; src?: string; tamanho?: number }) {
  // As iniciais podem descer do piso de 11px: são MONOGRAMA decorativo
  // (aria-hidden), não texto de leitura — 11px de letra não cabe num círculo
  // de 20 e o nome está sempre escrito ao lado.
  const iniciais = nome.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return (
    <span aria-hidden style={{ width: tamanho, height: tamanho, borderRadius: "50%", flex: "none", overflow: "hidden", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 14%, var(--surface-2))", color: "var(--primary-texto, var(--primary))", fontWeight: 800, fontSize: Math.max(9, Math.round(tamanho * 0.42)) }}>
      {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : iniciais}
    </span>
  );
}

// ── MetricCard — card de métrica compacto ───────────────────────────────────
// Estrutura fixa: rótulo → valor → subtítulo (slot reservado) → delta (slot
// reservado) → sparkline (opcional, cola no rodapé). Numerais tabulares via
// .stat: o valor não "dança" quando o número troca.
export function MetricCard({ label, valor, cor = "var(--text)", sub, dl, spark, title, reservarSpark = true, n, fmt, origem, acoes }: {
  label: string; valor: string; cor?: string; sub?: string;
  /** Controle pequeno no fim da linha do rótulo (ex.: alternar a fonte do
   *  número). Fica à direita, sem empurrar o rótulo pra fora. */
  acoes?: React.ReactNode;
  /** De ONDE vem o número, quando não é do ERP (ex.: "Yampi"). Vira um selo ao
   *  lado do rótulo — o painel mistura fontes, e dois "Vendas" iguais de fontes
   *  diferentes lado a lado sem isso parecem o mesmo número divergindo. */
  origem?: string;
  dl?: DeltaInfo | null; title?: string;
  spark?: { vals: (number | null)[]; cor: string; labels?: string[]; fmt?: (v: number) => string };
  reservarSpark?: boolean;   // reserva a área do mini-gráfico mesmo SEM spark → cards da mesma linha ficam da MESMA altura
  /** Valor NUMÉRICO + formatação: com os dois, o número conta até o alvo
   *  (Kinetics 062) e, no Atualizar, desliza do valor velho pro novo em vez de
   *  trocar seco (100). Sem eles (ou com `n` nulo), mostra `valor` como antes. */
  n?: number | null; fmt?: (v: number) => string;
}) {
  const temSpark = !!spark && spark.vals.filter((v) => v != null && Number.isFinite(v)).length >= 2;
  const vivo = n != null && Number.isFinite(n) && !!fmt;
  // M e G não são "o mesmo card maior": a caixa dobra de altura, então a linha
  // deixa de ser um fio decorativo de 34px e vira o gráfico do período, com o
  // mínimo/médio/máximo escrito embaixo. Tudo sai da série que o card já
  // recebia — o que faltava era espaço, e agora há.
  // M/G SEM exigir série. A exigência parecia inofensiva no banco de provas
  // (a amostra sempre tem 14 dias) e desmoronou em produção no primeiro
  // período de UM dia: um ponto não desenha curva, todo card M caía no layout
  // compacto dentro de uma caixa dupla, e o painel amanheceu cheio de vãos.
  // Sem curva o card grande vira rótulo + número que CRESCE + apoio + delta —
  // menos que o ideal, mas nunca um terço de card num canto de caixa.
  const tamanho = useTamanhoDoCard();
  const icone = useContext(IconeDoCard);
  const naGrade = tamanho != null;
  const grande = (tamanho ?? 1) >= 2;
  if (grande) return <MetricCardGrande {...{ label, valor, cor, sub, dl, spark: temSpark ? spark : undefined, title, n, fmt, vivo, icone, origem, acoes }} />;
  // DENTRO da grade o P segue a anatomia da referência: chip de ícone + rótulo
  // em cima, número forte, apoio, comparação. A faísca sai do P — no design do
  // dono o KPI compacto não tem gráfico; curva é assunto do card M, que tem
  // caixa pra um gráfico de verdade. Fora da grade (fileira da Visão geral),
  // nada muda.
  return (
    <div title={title} className="tf-surge tf-w" data-so-numero={!dl && !temSpark ? "" : undefined}>
      <div className="tf-w-topo" style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {naGrade && icone && <ChipDeIcone icone={icone} />}
        <span className="tf-w-rotulo" style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {origem && <span style={{ flexShrink: 0 }}><Selo>{origem}</Selo></span>}
        {acoes && <span style={{ marginLeft: "auto", flexShrink: 0 }}>{acoes}</span>}
      </div>
      {/* .tf-w-num: o corpo do número sai do CSS, não do inline — é o que deixa
          ele CRESCER com a caixa do card (14cqh) em vez de ficar em 26px fixos
          num card de 366px. Cor continua aqui, que é decisão do chamador. */}
      <div className="stat tf-w-num" style={{ color: cor, marginTop: 4 }}>
        {vivo ? <NumeroVivo valor={n as number} formatar={fmt!} duracao={800} /> : valor}
      </div>
      {/* Slots RESERVADOS: sem sub/delta a linha existe vazia e a fileira alinha.
          O `data-vazio` declara que ela está reservando NADA — dentro da grade
          do painel (`.tf-grid`, fileira de altura fixa) o CSS a some, porque
          ali o alinhamento já vem da casa e o slot só rendia vão: num P de
          176px eram 58px de nada embaixo do número (delta 16 + faísca 42), a
          "metade do card vazia" do MER e do ROAS de equilíbrio. FORA da grade,
          onde a fileira mede pelo card mais alto, ele continua valendo. */}
      <div className="tf-w-slot" data-vazio={sub ? undefined : ""} style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)", marginTop: 2, minHeight: 15 }}>{sub ?? " "}</div>
      <div className={dl ? "tf-w-slot tf-delta" : "tf-w-slot"} data-vazio={dl ? undefined : ""} style={{ fontSize: "var(--tf-fs-detalhe)", fontWeight: 800, marginTop: 4, minHeight: 15, color: dl?.cor ?? "transparent", display: "flex", alignItems: "center", gap: 4 }}>
        {dl ? <>{dl.rumo && <IconeRumo rumo={dl.rumo} cor={dl.cor} size={13} />}{dl.txt}<span style={{ color: "var(--text-dim)", fontWeight: 500 }}>vs anterior</span></> : " "}
      </div>
      {/* overflow VISIBLE: o tooltip da sparkline sobe acima da linha e era
          cortado por overflow:hidden. A linha em si já cabe nos 42px. */}
      {!naGrade && (reservarSpark
        ? <div className="tf-w-slot" data-vazio={temSpark ? undefined : ""} style={{ marginTop: "auto", paddingTop: 8, height: 42, display: "flex", alignItems: "flex-end", overflow: "visible" }}>{temSpark ? <MiniSpark vals={spark!.vals} cor={spark!.cor} labels={spark!.labels} fmt={spark!.fmt} /> : null}</div>
        : (temSpark && <div style={{ marginTop: "auto", paddingTop: 8 }}><MiniSpark vals={spark!.vals} cor={spark!.cor} labels={spark!.labels} fmt={spark!.fmt} /></div>))}
    </div>
  );
}

/**
 * O mesmo KPI num card M/G: a linha ocupa a altura que sobrou e ganha um
 * rodapé com o menor, o médio e o maior do período.
 *
 * Por que NÃO é o <TfChart> aqui: ele traz legenda e os botões de CSV/PNG, que
 * numa série única viram três controles em volta de uma linha só. O card de
 * KPI responde "quanto, e está subindo?" — eixo e exportação são pergunta da
 * aba de análise, não do azulejo.
 */
function MetricCardGrande({ label, valor, cor, sub, dl, spark, title, n, fmt, vivo, icone, origem, acoes }: {
  label: string; valor: string; cor: string; sub?: string; dl?: DeltaInfo | null; origem?: string; acoes?: React.ReactNode;
  spark?: { vals: (number | null)[]; cor: string; labels?: string[]; fmt?: (v: number) => string };
  title?: string; n?: number | null; fmt?: (v: number) => string; vivo: boolean; icone?: string | null;
}) {
  // 96 de piso: abaixo disso a linha não tem amplitude pra mostrar nada e o
  // rodapé encosta nela.
  const { caixa, altura } = useAlturaQueSobra(96);
  const nums = (spark?.vals ?? []).filter((v): v is number => v != null && Number.isFinite(v));
  const f = spark?.fmt ?? fmt ?? ((x: number) => fmtNum(x));
  const resumo = nums.length >= 2 ? [
    { rot: "mínimo", v: Math.min(...nums) },
    { rot: "médio", v: nums.reduce((a, b) => a + b, 0) / nums.length },
    { rot: "máximo", v: Math.max(...nums) },
  ] : [];
  return (
    // Sem curva o número assume a caixa: `data-so-numero` é o mesmo mecanismo
    // do card compacto sem nada além do número.
    <div title={title} className="tf-surge tf-w" data-so-numero={spark ? undefined : ""}>
      <div className="tf-w-topo">
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {icone && <ChipDeIcone icone={icone} />}
          <span className="tf-w-rotulo" style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
          {origem && <span style={{ flexShrink: 0 }}><Selo>{origem}</Selo></span>}
          {acoes && <span style={{ marginLeft: "auto", flexShrink: 0 }}>{acoes}</span>}
        </div>
        <div className="stat tf-w-num" style={{ color: cor, marginTop: 4 }}>
          {vivo ? <NumeroVivo valor={n as number} formatar={fmt!} duracao={800} /> : valor}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 3, minHeight: 16 }}>
          {sub && <span style={{ fontSize: "var(--tf-fs-detalhe)", color: "var(--text-dim)" }}>{sub}</span>}
          {dl && (
            <span className="tf-delta" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--tf-fs-detalhe)", fontWeight: 800, color: dl.cor }}>
              {dl.rumo && <IconeRumo rumo={dl.rumo} cor={dl.cor} size={13} />}{dl.txt}
              <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>vs anterior</span>
            </span>
          )}
        </div>
      </div>
      {/* GRÁFICO de verdade, não a faísca esticada: uma faísca de 34px ampliada
          pra 200 vira uma mancha sem eixo, sem grade e sem rótulo — foi
          exatamente o que o dono rejeitou. No card M/G entra o <TfChart> em
          modo simples: linha na tinta da pessoa, grade discreta, rótulos de
          dia e tooltip; a legenda e os botões de exportar ficam pra aba de
          análise. */}
      {spark && (
        <div ref={caixa} style={{ flex: 1, minHeight: 0, marginTop: 12 }}>
          <TfChart simples height={Math.max(120, altura - 8)} titulo={label}
            labels={spark.labels ?? spark.vals.map((_, i) => String(i + 1))}
            series={[{ key: "v", label, cor: "var(--tf-spark, var(--graf-1, var(--primary)))", vals: spark.vals, fmt: spark.fmt ?? fmt }]} />
        </div>
      )}
      {resumo.length > 0 && (
        <div style={{ flex: "none", display: "flex", gap: 14, marginTop: 10, paddingTop: 9, borderTop: "1px solid var(--tf-panel-line)" }}>
          {resumo.map((r) => (
            <div key={r.rot} style={{ minWidth: 0 }}>
              <div style={{ fontSize: "var(--tf-fs-micro)", fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em" }}>{r.rot}</div>
              <div className="stat" style={{ fontSize: "var(--tf-fs-realce)", fontWeight: 800, color: "var(--text)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f(r.v)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// Sparkline INTERATIVA: passar o ponteiro mostra guia + ponto + tooltip com o
// valor (e o dia, quando o chamador passa `labels`). Antes era um <polyline>
// morto — hover não fazia nada. Mesma leitura do TfChart, em miniatura.
//
// Quem desenha é o <MonoFaisca> do kit de gráficos: a mesma curva monótona e o
// mesmo traço do resto do sistema. Aqui em volta fica só a leitura ao ponteiro.
export function MiniSpark({ vals, cor, alt = 34, labels, fmt }: {
  vals: (number | null)[]; cor: string; alt?: number;
  labels?: string[];                 // rótulo por índice da série ORIGINAL (ex.: "07-14")
  fmt?: (v: number) => string;       // formatação do valor no tooltip
}) {
    // A tinta REAL da faísca passa pelo token do escopo: no design novo toda
  // curva do painel sai numa tinta só (a da pessoa — roxo por padrão), decisão
  // que mora no `.tf-scope` via `--tf-spark`. Fora de um escopo que o defina,
  // vale a cor que o chamador pediu — nada muda nas outras telas.
  const tinta = `var(--tf-spark, ${cor})`;
const [hi, setHi] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  // Ignora dias sem dado (ROAS é null em dia sem gasto): coagir pra 0 criava
  // um penhasco falso e a linha "despencava" — parecia bug, era ruído injetado.
  // Guarda o índice ORIGINAL junto pra o rótulo do tooltip continuar batendo.
  const pares = (vals || []).map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v != null && Number.isFinite(p.v));
  const nums = pares.map((p) => p.v);
  if (nums.length < 2) return null;
  const min = Math.min(...nums), max = Math.max(...nums);
  const maxAbs = Math.max(Math.abs(min), Math.abs(max)) || 1;

  // Piso de amplitude: série quase plana (ex.: ROAS ~1,0) NÃO vira montanha.
  // O MonoFaisca sempre estica min→max na altura que recebe, então quem segura
  // a amplitude é a ALTURA da faísca: ela encolhe na proporção da variação
  // REAL e fica centrada na caixa. Sem isso um ROAS oscilando de 0,98 a 1,02
  // desenharia um penhasco — amplificava ruído e "não fazia sentido".
  const PAD = 3;                                   // a mesma folga interna do MonoFaisca
  const util = Math.max(2, alt - PAD * 2);
  const altFaisca = Math.round(Math.min(1, (max - min) / Math.max(maxAbs * 0.12, 1e-9)) * util) + PAD * 2;
  const topo = (alt - altFaisca) / 2;
  const yOf = (v: number) => topo + PAD + (1 - (v - min) / (max - min || 1)) * (altFaisca - PAD * 2);
  // O MonoFaisca desenha num viewBox de 120 com 3 de folga nas pontas — 2,5%
  // de cada lado. A guia e o ponto precisam da MESMA conta, senão descolam do
  // traço justamente no primeiro e no último dia.
  const xPct = (i: number) => 2.5 + (i / (nums.length - 1)) * 95;
  const cruzaZero = min < 0 && max > 0;   // série que vira prejuízo: marca o zero

  // Índice mais próximo do ponteiro (a viewBox é esticada, então mede pelo DOM).
  const mover = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    const t = (clientX - r.left) / r.width;
    setHi(Math.max(0, Math.min(nums.length - 1, Math.round(t * (nums.length - 1)))));
  };
  const p = hi != null ? pares[hi] : null;
  const rotulo = p && labels ? labels[p.i] : null;
  const texto = p ? (fmt ? fmt(p.v) : p.v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })) : "";

  return (
    <div ref={box} style={{ position: "relative", width: "100%", height: alt, cursor: "crosshair" }}
      onPointerMove={(e) => mover(e.clientX)} onPointerLeave={() => setHi(null)} onPointerCancel={() => setHi(null)}>
      {cruzaZero && (
        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, top: yOf(0), borderTop: "1px dashed var(--mono-apoio)", pointerEvents: "none" }} />
      )}
      {/* O degradê só entra quando a faísca ocupa a caixa inteira: numa série
          achatada ele terminaria no ar, no meio do cartão. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: topo }}>
        <MonoFaisca valores={nums} altura={altFaisca} cor={tinta} area={altFaisca === alt} />
      </div>
      {p && (
        <span aria-hidden style={{
          position: "absolute", left: `${xPct(hi!)}%`, top: 0, bottom: 0,
          borderLeft: "1px dashed var(--mono-apoio)", pointerEvents: "none",
        }} />
      )}
      {/* Ponto em HTML, não em SVG: com preserveAspectRatio="none" o eixo X é
          esticado e um <circle> sairia OVAL. Em y a escala é 1:1 (a viewBox tem
          a altura em px), então basta posicionar em yOf(v). */}
      {p && (
        <span aria-hidden style={{
          position: "absolute", left: `${xPct(hi!)}%`, top: yOf(p.v),
          width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5, borderRadius: "50%",
          background: tinta, boxShadow: "0 0 0 1.5px var(--surface)", pointerEvents: "none",
        }} />
      )}
      {p && (
        <div style={{
          position: "absolute", bottom: alt + 4, left: `${xPct(hi!)}%`,
          transform: `translateX(${hi! > nums.length / 2 ? "-100%" : "0"})`,
          pointerEvents: "none", zIndex: 5, whiteSpace: "nowrap",
          background: "var(--pop-bg)", border: "1px solid var(--border)", borderRadius: 8,
          padding: "4px 7px", fontSize: "var(--tf-fs-micro)", fontWeight: 700, color: "var(--text)",
          boxShadow: "0 6px 18px -8px rgba(0,0,0,.5)",
        }}>
          {rotulo && <span style={{ color: "var(--text-dim)", fontWeight: 600, marginRight: 5 }}>{rotulo}</span>}
          <span style={{ color: tinta }}>{texto}</span>
        </div>
      )}
    </div>
  );
}

// ── SectionHeader — título de seção com ações à direita ─────────────────────
export function SectionHeader({ titulo, sub, acoes }: { titulo: string; sub?: string; acoes?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "var(--tf-sp-2, 10px)", flexWrap: "wrap", marginBottom: "var(--tf-sp-2, 10px)" }}>
      <h3 style={{ margin: 0, fontSize: "var(--tf-fs-realce)", fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>{titulo}</h3>
      {sub && <span style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)" }}>{sub}</span>}
      {acoes && <span style={{ marginLeft: "auto", display: "inline-flex", gap: 8, alignItems: "center" }}>{acoes}</span>}
    </div>
  );
}

// ── EmptyState — estado vazio explicativo, centrado, com ação ───────────────
// Nunca deixar card em branco ou "0" mudo: dizer o que aconteceu e o que fazer.
export function EmptyState({ icon = "chart-line", titulo, descricao, acao }: {
  icon?: string; titulo: string; descricao?: string;
  acao?: { label: string; onClick: () => void };
}) {
  return (
    <div style={{ minHeight: 96, height: "100%", display: "grid", placeItems: "center", textAlign: "center", padding: "var(--tf-sp-4, 18px)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, maxWidth: 320 }}>
        <span className="tf-vazio-selo" style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <Icon name={icon} size={17} color="var(--text-dim)" />
        </span>
        <div style={{ fontSize: "var(--tf-fs-realce)", fontWeight: 700, color: "var(--text)" }}>{titulo}</div>
        {descricao && <div style={{ fontSize: "var(--tf-fs-rotulo)", color: "var(--text-dim)", lineHeight: 1.55 }}>{descricao}</div>}
        {acao && (
          <Botao variante="primario" onClick={acao.onClick} style={{ marginTop: 4 }}>
            {acao.label}
          </Botao>
        )}
      </div>
    </div>
  );
}

// Compat: estado vazio simples de widget (texto centrado, sem ação).
/**
 * "Não há o que mostrar", em uma linha.
 *
 * Num card M ou G a linha sozinha no meio de 697×366 lê como tela quebrada, não
 * como ausência de dado — então a partir de M ela ganha a mesma anatomia do
 * <EmptyState> (selo + mensagem). Quem decide é o tamanho da CASA, via
 * contexto: fora da grade (e são 172 usos de <Vazio> no app, a maioria em
 * tabela e lista de outros módulos) nada muda, que é o ponto de gatear por
 * contexto em vez de trocar o componente pra todo mundo.
 */
export const Vazio = ({ children, icon = "info-circle" }: { children: React.ReactNode; icon?: string }) => {
  const daCasa = (useTamanhoDoCard() ?? 0) >= 2;
  if (!daCasa) return (
    <div style={{ minHeight: 64, height: "100%", display: "grid", placeItems: "center", textAlign: "center", color: "var(--text-dim)", fontSize: "var(--tf-fs-corpo)", padding: "8px 4px" }}>
      {children}
    </div>
  );
  return (
    <div style={{ minHeight: 96, height: "100%", display: "grid", placeItems: "center", textAlign: "center", padding: "var(--tf-sp-4, 18px)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, maxWidth: 320 }}>
        <span className="tf-vazio-selo" style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <Icon name={icon} size={17} color="var(--text-dim)" />
        </span>
        <div style={{ fontSize: "var(--tf-fs-corpo)", color: "var(--text-dim)", lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
};

// Esqueleto de card KPI — mesma silhueta (rótulo · valor grande · linha de
// detalhe) do card real, pra quando um widget carrega mais devagar que os
// vizinhos (ex.: espera o ERP enquanto o Meta já chegou) o "pop-in" não pareça
// quebrado. Reaproveita a animação global `.skeleton` do globals.css.
export function CardSkeleton({ linhas = 2 }: { linhas?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", justifyContent: "center" }} aria-hidden>
      <div className="skeleton" style={{ width: "48%", height: 11 }} />
      <div className="skeleton" style={{ width: "72%", height: 24 }} />
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="skeleton" style={{ width: i === linhas - 1 ? "40%" : "85%", height: 10 }} />
      ))}
    </div>
  );
}
