import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { syncFatia, statusSync, rodadaDeSync } from "@/lib/meta-warehouse";
import { resolvePeriod } from "@/lib/period";

export const dynamic = "force-dynamic";
// Hobby corta em 60s (e cron 1×/dia). Por isso o sync trabalha em FATIAS com
// prazo e devolve `restantes`: quem chamou repete até zerar. Não aumente este
// número sem antes conferir o plano da conta — acima do limite o deploy falha.
export const maxDuration = 60;
const PRAZO_MS = 45_000;   // folga pro resto da requisição dentro dos 60s

// Cron da Vercel manda Bearer CRON_SECRET. Sem secret = recusa (fail-closed).
function autorizadoCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed: sem CRON_SECRET ninguém passa
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

const hojeSp = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const menosDias = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") - n * 864e5).toISOString().slice(0, 10);
/** Todos os dias do intervalo, inclusive as pontas — a lista que `refazer` pede. */
function listarDias(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let d = de; d <= ate; d = menosDias(d, -1)) out.push(d);
  return out;
}

// Fatia um intervalo em blocos de N dias (a Meta penaliza consulta grande).
function blocos(since: string, until: string, tam = 7): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  let ini = since;
  while (ini <= until) {
    const fim = menosDias(ini, -(tam - 1)) > until ? until : menosDias(ini, -(tam - 1));
    out.push([ini, fim]);
    ini = menosDias(fim, -1);
  }
  return out;
}

// GET → cron de sincronização incremental (grava no warehouse local).
//   ?status=1 → só devolve o status por conta (admin).
export async function GET(req: NextRequest) {
  const sp = new URL(req.url).searchParams;

  if (sp.get("status") === "1") {
    if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ contas: await statusSync() });
  }

  // Cron OU usuário logado com acesso a Tráfego. O cron é 1×/dia e não drena a
  // fila sozinho: quem drena é a TELA, chamando em laço até restantes zerar.
  // Sem esta segunda porta o navegador levaria 401 em produção (CRON_SECRET).
  if (!autorizadoCron(req) && !(await getProfileForModule("trafego"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Modo "agora": só a parte VOLÁTIL do período que está na tela ──────────
  // É o botão "Atualizar" da Tridify, e ele existe porque o clique recalculava
  // a tela em cima de um warehouse que ele mesmo não atualizava. Medido em
  // produção às 12h51: o Graph dizia R$ 1.069,21 de gasto hoje, o warehouse
  // dizia R$ 905,68, e três das cinco contas com entrega estavam com a última
  // escrita de 39 minutos antes. Os KPIs do topo (que vão ao Graph ao vivo)
  // mudavam a cada clique; a tabela de campanhas, que sai do banco, não mudava
  // NUNCA — 0 de 21 linhas com gasto diferente entre dois recálculos.
  //
  // O que é volátil é só hoje e ontem: a Meta ainda mexe neles. Dia mais antigo
  // já foi reconciliado pelo cron e não vale a viagem. Então a janela é a
  // INTERSEÇÃO de [ontem, hoje] com o período visível — no máximo dois dias,
  // sempre. Período que nem toca esses dois dias não tem o que atualizar e sai
  // sem chamar a Meta uma vez sequer.
  if (sp.get("agora") === "1") {
    const r = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
    const hojeA = hojeSp();
    const de = r.fromDate > menosDias(hojeA, 1) ? r.fromDate : menosDias(hojeA, 1);
    const ate = r.toDate < hojeA ? r.toDate : hojeA;
    if (de > ate) {
      return NextResponse.json({ agora: true, janela: null, contas: 0, restantes: 0, linhas: 0, concluido: true, erros: [] });
    }
    const contasPedidas = (sp.get("contas") || "").split(",").map((c) => c.trim().replace(/^act_/, "")).filter(Boolean);
    const rr = await syncFatia([[de, ate]], {
      // Prazo curto: alguém está esperando olhando pro botão. O que não couber
      // sai na rodada de fundo, que continua rodando atrás.
      prazoMs: 25_000,
      paralelo: 4,
      incremental: true,
      // A janela inteira é forçada: hoje/ontem no banco estão sempre por
      // terminar, então "já tenho essas datas" não é motivo pra não rebaixar.
      refazer: listarDias(de, ate),
      contas: contasPedidas.length ? contasPedidas : undefined,
    });
    return NextResponse.json({
      agora: true, janela: `${de}..${ate}`,
      contas: rr.processadas, restantes: rr.restantes, linhas: rr.linhas,
      concluido: rr.restantes === 0, erros: rr.erros.slice(0, 10),
    });
  }

  // Cobertura por FRESCOR: o dado recente muda toda hora, o antigo quase não.
  //   hoje/ontem         → movimento novo, resync sempre
  //   últimos 7 dias     → a Meta reprocessa conversão com atraso; reconcilia
  //   dias 8–30          → mantém os 30 dias "completinhos", já estáveis
  // Tudo por UPSERT, então rever um dia não duplica nada. A ordem importa: as
  // janelas frescas vêm primeiro, então se o prazo estourar o que ficou de fora
  // é o pedaço mais estável (e a próxima rodada do dreno pega).
  const hoje = hojeSp();
  const ontem = menosDias(hoje, 1);
  const janelas: Array<[string, string]> = [
    [hoje, hoje],
    [ontem, ontem],
    [menosDias(hoje, 7), menosDias(hoje, 2)],
    [menosDias(hoje, 30), menosDias(hoje, 8)],
  ];
  // Uma RODADA de dreno é o instante em que ela começou. A tela recebe o carimbo
  // na primeira resposta e devolve nas seguintes: assim cada volta só pega as
  // contas que ainda não foram tentadas nesta rodada, `restantes` cai de verdade
  // e o laço termina. Sem carimbo (cron, ou "Sincronizar agora") começa rodada
  // nova — que é justamente o que força tudo a rebaixar.
  const rodada = rodadaDeSync(sp.get("rodada"), Date.now());
  // `contas`: só estas (o "Atualizar" com filtro de conta não precisa rebaixar
  // as 21 da casa). Vazio = todas.
  const contas = (sp.get("contas") || "").split(",").map((s) => s.trim().replace(/^act_/, "")).filter(Boolean);

  // Incremental: hoje/ontem SEMPRE rebaixados (a Meta ainda mexe neles); os dias
  // mais antigos que já estão no banco são pulados — só busca o que falta.
  const r = await syncFatia(janelas, {
    prazoMs: PRAZO_MS, incremental: true, refazer: [hoje, ontem], desdeRodada: rodada,
    contas: contas.length ? contas : undefined,
  });
  return NextResponse.json({
    sincronizadoEm: new Date().toISOString(),
    rodada,
    contas: r.processadas, restantes: r.restantes, linhas: r.linhas,
    // O cron é 1×/dia e não dá conta de todas as contas numa passada. Quem
    // realmente drena a fila é a tela, chamando de novo enquanto sobrar.
    concluido: r.restantes === 0,
    erros: r.erros.slice(0, 10),
  });
}

// POST { since, until } → sync manual de um período (admin). Fatia em blocos de
// 7 dias pra não estourar a Meta. Usado pra carga inicial/backfill.
export async function POST(req: NextRequest) {
  if (!(await getProfileForModule("trafego"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { since?: string; until?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!b.since || !b.until || !iso.test(b.since) || !iso.test(b.until) || b.since > b.until) {
    return NextResponse.json({ error: "periodo_invalido" }, { status: 400 });
  }
  // Um backfill longo NÃO cabe em 60s. Processa blocos até o prazo e devolve
  // `proximo`: a data de onde continuar. Quem chamou repete com since=proximo
  // até vir concluido:true. Como o gravador é UPSERT, repetir um bloco por
  // engano não duplica nada.
  const prazo = Date.now() + PRAZO_MS;
  const partes: Record<string, unknown>[] = [];
  let proximo: string | null = null;

  for (const [de, ate] of blocos(b.since, b.until, 7)) {
    if (Date.now() >= prazo) { proximo = de; break; }
    const r = await syncFatia([[de, ate]], { prazoMs: Math.max(5_000, prazo - Date.now()), pularJanelaJaFeita: true, incremental: true });
    partes.push({ periodo: `${de}..${ate}`, contas: r.processadas, linhas: r.linhas, erros: r.erros.slice(0, 5) });
    // Estourou o prazo no meio das contas deste bloco: refaz o bloco inteiro na
    // próxima chamada (upsert torna isso seguro).
    if (r.restantes > 0) { proximo = de; break; }
  }

  return NextResponse.json({ ok: true, concluido: proximo === null, proximo, blocos: partes });
}
