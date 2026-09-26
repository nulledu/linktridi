// Ritmo do setor: quando o pedido CHEGA, quando SAI, se está acumulando e
// quanto tempo fica parado — para CADA setor, separadamente.
//
// Entrada Logística e Logística são times diferentes com filas diferentes, e
// misturar os dois números esconde justamente o que se quer ver (a Entrada pode
// estar acumulando enquanto a Logística despacha bem, e a leitura somada mostra
// "tudo certo"). Por isso cada setor tem a sua entrada e a sua saída:
//
//   Entrada Logística → entra: pedido vai para a etapa 10
//                       sai:   pedido passa para a etapa 11
//   Logística         → entra: pedido vai para a etapa 11
//                       sai:   data_envio (despachado)
//
// Custo: as duas fontes têm preços muito diferentes.
//   · `pedidos.data_envio` é coluna indexada, barata, sempre funciona.
//   · As trocas de etapa saem do log de texto `historicos_pedidos`, sem índice —
//     a mesma tabela que já derruba a busca de caixa por timeout.
// Uma única leitura do log serve os dois setores (as etapas 10 e 11 saem do
// mesmo resultado), e se ela falhar `etapasIndisponiveis` fica true e a tela
// mostra o que sobra. Nada aqui pode derrubar a página de logística.

import { cached } from "@/lib/cache";
import { etapaDaLinha } from "@/lib/logistica-pedido";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON = process.env.LEGACY_ANON_KEY || "";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const headers = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

// São Paulo = UTC-3. O ERP grava em UTC; ler a hora "crua" jogaria o pico das
// 16h para as 19h e a leitura inteira perderia o sentido.
const TZ_OFFSET_H = -3;

export interface PorHora { hora: number; total: number }
export interface PorDia { dia: string; entradas: number; saidas: number }

export interface SetorRitmo {
  chave: "entrada" | "logistica";
  label: string;
  rotuloEntrada: string;          // "Chegadas" / "Recebidos da Entrada"
  rotuloSaida: string;            // "Passaram p/ Logística" / "Enviados"
  entradasPorHora: PorHora[];
  saidasPorHora: PorHora[];
  porDia: PorDia[];
  totalEntradas: number;
  totalSaidas: number;
  entradasIndisponiveis: boolean; // a fonte da entrada falhou
  saidasIndisponiveis: boolean;
  /**
   * `false` quando a entrada do setor não é um FLUXO da janela e sim a foto da
   * fila de agora. A Entrada Logística cai neste caso: o ERP só grava troca de
   * etapa para algumas etapas (1, 2, 7 e 11 no log observado) e a chegada na
   * etapa 10 nunca é registrada. O que existe é `data_status`, que marca quando
   * cada pedido PARADO ali chegou — exato para a fila atual, mas nada diz sobre
   * quem já passou. Com isso `false`, o "entrou × saiu por dia" e o saldo
   * ignoram a entrada, porque comparar estoque com fluxo daria número errado.
   */
  fluxoEntradaDisponivel: boolean;
  notaEntrada?: string;
  horasMedia: number | null;      // tempo médio de quem está na fila agora
  pedidosNaFila: number;
}

export interface RitmoLogistica {
  janelaDias: number;
  setores: SetorRitmo[];
  etapasIndisponiveis: boolean;   // o log do ERP não respondeu
  diasLidosEtapas: number;        // janela que o ERP realmente aguentou ler
  atualizadoEm: string;
}

// Data/hora local de SP a partir do ISO em UTC.
function emSP(iso: string): Date {
  return new Date(new Date(iso).getTime() + TZ_OFFSET_H * 3600 * 1000);
}
const diaSP = (iso: string) => emSP(iso).toISOString().slice(0, 10);
const horaSP = (iso: string) => emSP(iso).getUTCHours();

function contarPorHora(isos: string[]): PorHora[] {
  const buckets: PorHora[] = Array.from({ length: 24 }, (_, hora) => ({ hora, total: 0 }));
  for (const iso of isos) {
    const h = horaSP(iso);
    if (h >= 0 && h < 24) buckets[h].total++;
  }
  return buckets;
}

// Lista de dias da janela, em ordem, para o gráfico não ter buraco em dia sem
// movimento (dia parado é informação, não ausência de dado).
function diasDaJanela(dias: number): string[] {
  const hoje = emSP(new Date().toISOString());
  const saida: string[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    saida.push(new Date(hoje.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return saida;
}

function montarPorDia(dias: number, entradas: string[], saidas: string[]): PorDia[] {
  const mapa = new Map<string, PorDia>(
    diasDaJanela(dias).map((dia) => [dia, { dia, entradas: 0, saidas: 0 }]),
  );
  for (const iso of entradas) { const d = mapa.get(diaSP(iso)); if (d) d.entradas++; }
  for (const iso of saidas) { const d = mapa.get(diaSP(iso)); if (d) d.saidas++; }
  return [...mapa.values()];
}

// ── Envios (barato, indexado) ────────────────────────────────────────────────
async function lerEnvios(desde: string): Promise<string[]> {
  const res = await fetch(
    `${LEGACY_URL}/rest/v1/pedidos?select=data_envio&data_envio=gte.${desde}`
    + `&arquivado=eq.false&order=data_envio.desc&limit=5000`,
    { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
  );
  if (!res.ok) throw new Error(`pedidos data_envio ${res.status}`);
  const dados = await res.json() as Array<{ data_envio: string | null }>;
  return (Array.isArray(dados) ? dados : []).map((p) => p.data_envio).filter(Boolean) as string[];
}

// ── Trocas de etapa (caro, texto sem índice) ─────────────────────────────────
// Uma leitura só serve os dois setores: a etapa 10 é a entrada da Entrada e a
// etapa 11 é ao mesmo tempo a SAÍDA da Entrada e a ENTRADA da Logística.
// O filtro `conteudo=ilike.*etapa*` tem curinga no início e não usa índice; o
// que segura a consulta é o recorte de data mais o limite.
async function lerTrocasDeEtapa(janelaDias: number): Promise<{ para10: string[]; para11: string[]; diasLidos: number }> {
  // O ERP tem statement timeout de 8s e esta consulta varre texto: medida em
  // duas rodadas seguidas, a mesma janela de 7 dias voltou em 5,7s e depois
  // estourou. Então tenta de novo com a janela pela metade em vez de desistir —
  // meia janela de dado é muito melhor que "indisponível". Mesmo recuo que o
  // histórico de caixa já usa.
  const janelas = [janelaDias, Math.ceil(janelaDias / 2), Math.ceil(janelaDias / 4)];
  let ultimoErro: unknown = null;

  for (const dias of janelas) {
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
    try {
      const r = await fetch(
        `${LEGACY_URL}/rest/v1/historicos_pedidos?select=created_at,conteudo`
        + `&created_at=gte.${desde}&conteudo=ilike.*etapa*&order=created_at.desc&limit=5000`,
        { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
      );
      if (!r.ok) { ultimoErro = new Error(`historicos_pedidos ${r.status}`); continue; }
      return { ...separaEtapas(await r.json()), diasLidos: dias };
    } catch (e) { ultimoErro = e; }
  }
  throw ultimoErro ?? new Error("historicos_pedidos indisponível");
}

function separaEtapas(dados: unknown): { para10: string[]; para11: string[] } {

  // A leitura da frase mora em `etapaDaLinha` (lib/logistica-pedido.ts) — um
  // formato, um lugar. Reescrever o padrão aqui foi exatamente o que produziu
  // zero resultado: o log escreve "adicionou 11 no campo etapa_id", com o
  // número ANTES do nome do campo, e a segunda cópia procurava depois.
  const para10: string[] = [], para11: string[] = [];
  const linhas = (Array.isArray(dados) ? dados : []) as Array<{ created_at: string; conteudo: string }>;
  for (const h of linhas) {
    const etapa = etapaDaLinha(String(h.conteudo).replace(/\*\*/g, ""));
    if (etapa === 10) para10.push(h.created_at);
    else if (etapa === 11) para11.push(h.created_at);
  }
  return { para10, para11 };
}

// ── Fila atual de cada etapa ─────────────────────────────────────────────────
// Tempo médio de quem ESTÁ na etapa agora, medido desde a aprovação. Não é o
// tempo de ciclo fechado (esse exigiria parear entrada e saída de cada pedido
// no log caro) — é "há quanto tempo a fila está parada", que é a pergunta
// operacional de quem olha o painel.
// `data_status` é o carimbo da última mudança de status do pedido — para quem
// está parado numa etapa, é a hora em que chegou nela. É a única fonte exata da
// chegada na Entrada Logística, já que o log não registra essa troca.
async function lerFila(etapa: number): Promise<{ horasMedia: number | null; pedidos: number; chegadas: string[] }> {
  try {
    const res = await fetch(
      `${LEGACY_URL}/rest/v1/pedidos?select=data_aprovado,data_status&etapa_id=eq.${etapa}`
      + `&arquivado=eq.false&concluido=eq.false&limit=500`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return { horasMedia: null, pedidos: 0, chegadas: [] };
    const dados = await res.json() as Array<{ data_aprovado: string | null; data_status: string | null }>;
    const lista = Array.isArray(dados) ? dados : [];
    const agora = Date.now();
    const horas = lista
      .map((p) => p.data_aprovado).filter(Boolean)
      .map((d) => (agora - new Date(d as string).getTime()) / 36e5)
      .filter((h) => h >= 0);
    return {
      horasMedia: horas.length ? Math.round(horas.reduce((a, b) => a + b, 0) / horas.length) : null,
      pedidos: lista.length,
      chegadas: lista.map((p) => p.data_status).filter(Boolean) as string[],
    };
  } catch { return { horasMedia: null, pedidos: 0, chegadas: [] }; }
}

async function montar(janelaDias: number): Promise<RitmoLogistica> {
  const desde = new Date(Date.now() - janelaDias * 86_400_000).toISOString();

  // `allSettled`: a leitura cara (log de etapas) falhando não pode levar junto
  // a barata (envios), que é a que sempre funciona.
  const [etapasRes, enviosRes, fila10, fila11] = await Promise.allSettled([
    lerTrocasDeEtapa(janelaDias), lerEnvios(desde), lerFila(10), lerFila(11),
  ]);

  const etapas = etapasRes.status === "fulfilled" ? etapasRes.value : { para10: [], para11: [], diasLidos: 0 };
  const envios = enviosRes.status === "fulfilled" ? enviosRes.value : [];
  const semEtapas = etapasRes.status !== "fulfilled";
  const semEnvios = enviosRes.status !== "fulfilled";
  const vazia = { horasMedia: null, pedidos: 0, chegadas: [] as string[] };
  const f10 = fila10.status === "fulfilled" ? fila10.value : vazia;
  const f11 = fila11.status === "fulfilled" ? fila11.value : vazia;

  // A chegada na Entrada não está no log (ver `fluxoEntradaDisponivel`); usa-se
  // `data_status` da fila atual, que é exato para quem está lá agora.
  const chegadasEntrada = f10.chegadas;

  const setores: SetorRitmo[] = [
    {
      chave: "entrada", label: "Entrada Logística",
      rotuloEntrada: "Chegada de quem está na fila", rotuloSaida: "Passaram p/ Logística",
      entradasPorHora: contarPorHora(chegadasEntrada),
      saidasPorHora: contarPorHora(etapas.para11),
      // Só a saída entra no dia a dia: a entrada aqui é a foto da fila, não o
      // fluxo da janela, e somar as duas daria um saldo inventado.
      porDia: montarPorDia(janelaDias, [], etapas.para11),
      totalEntradas: chegadasEntrada.length, totalSaidas: etapas.para11.length,
      entradasIndisponiveis: false, saidasIndisponiveis: semEtapas,
      fluxoEntradaDisponivel: false,
      notaEntrada: "O ERP não registra a entrada nesta etapa, então não dá para montar a série da janela. "
        + "Estas são as horas em que chegaram os pedidos que estão parados aqui agora.",
      horasMedia: f10.horasMedia, pedidosNaFila: f10.pedidos,
    },
    {
      chave: "logistica", label: "Logística",
      rotuloEntrada: "Recebidos da Entrada", rotuloSaida: "Enviados",
      entradasPorHora: contarPorHora(etapas.para11),
      saidasPorHora: contarPorHora(envios),
      porDia: montarPorDia(janelaDias, etapas.para11, envios),
      totalEntradas: etapas.para11.length, totalSaidas: envios.length,
      entradasIndisponiveis: semEtapas, saidasIndisponiveis: semEnvios,
      fluxoEntradaDisponivel: !semEtapas,
      horasMedia: f11.horasMedia, pedidosNaFila: f11.pedidos,
    },
  ];

  return {
    janelaDias, setores,
    etapasIndisponiveis: semEtapas,
    // Menor que `janelaDias` quando o ERP só aguentou uma janela menor.
    diasLidosEtapas: etapas.diasLidos,
    atualizadoEm: new Date().toISOString(),
  };
}

// Cache no SERVIDOR, não no navegador: a fatura do Supabase/ERP é a leitura na
// origem, então só cortar ali abate alguma coisa (CLAUDE.md, "Dados").
export function ritmoLogistica(janelaDias: number): Promise<RitmoLogistica> {
  const j = janelaDias === 30 ? 30 : 7;
  return cached(`logi:ritmo:${j}`, 10 * 60_000, () => montar(j));
}
