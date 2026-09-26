import { describe, it, expect } from "vitest";
import { calcBanco } from "../banco-horas";
import type { PontoRegistro, Justificativa } from "../ponto";
import {
  ROTULO_TIPO, SELO_STATUS, STATUS_JUSTIFICATIVA, TIPOS_JUSTIFICATIVA,
  minutosDaJanela, minutosDoRecorte, resumirJustificativas,
} from "../ponto-justificativas";
import { ICONS } from "@/app/(plataforma)/Icon";
import { LEITURA_POR_AREA } from "../armazenamento/referencia";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ── Justificar HORAS, não só dias ────────────────────────────────────────────
//
// O modelo antigo tinha um booleano: ou a empresa perdoava o dia inteiro, ou
// não perdoava nada. Isso cobre "faltou" e mais nada — e a vida real do RH é
// quase toda o contrário: o atestado que cobre só a manhã, a consulta de 1h no
// meio da tarde, a pessoa que sai 14h e volta 16h.
//
// O que este arquivo trava são as quatro formas de a conta mentir:
//
//  1. perdoar HORA QUE NÃO EXISTE (abono maior que o déficit vira crédito, e
//     crédito vira dinheiro na folha);
//  2. perdoar hora que a pessoa nunca deveu (a janela que atravessa o almoço);
//  3. pedido PENDENTE mexendo em conta (seria autoabono com outro nome);
//  4. "a serviço da empresa" entrando como perdão em vez de trabalho.

const SEM_FERIADO = new Set<string>();
// Escala 08:00–17:00 com almoço 12:00–13:00 → 8h de jornada devida.
const PESSOA = {
  id: "p1", nome: "Bruno", fotoUrl: null,
  jornadaMin: 480,
  entradaPrevista: "08:00", saidaPrevista: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoMin: null,
};
const JORNADA = {
  entradaPrevista: "08:00", saidaPrevista: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00", jornadaMin: 480,
};

let seq = 0;
const bat = (dia: string, hhmm: string): PontoRegistro => {
  const [h, m] = hhmm.split(":").map(Number);
  const iso = new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString();
  return { id: `r${++seq}`, pessoaId: "p1", tipo: "entrada", batidoEm: iso, selfieUrl: null, confianca: null, origem: "tablet" };
};

// Quarta-feira, dia útil comum. `HOJE` é depois, então o dia já fechou.
const DIA = "2026-09-09";
const HOJE = "2026-09-11";

/** Batidas do dia: pares entrada/saída. Sem argumento = não veio ninguém. */
const registros = (...pares: [string, string][]): PontoRegistro[] =>
  pares.flatMap(([de, ate]) => [bat(DIA, de), bat(DIA, ate)]);

let jid = 0;
const just = (p: Partial<Justificativa>): Justificativa => ({
  id: `j${++jid}`, pessoaId: "p1", dia: DIA, motivo: null, abona: true,
  tipo: "atestado", efeito: "abona", status: "aprovada",
  horaDe: null, horaAte: null, minutos: null, ...p,
});

const doDia = (regs: PontoRegistro[], js: Justificativa[] = []) => {
  const b = calcBanco(PESSOA, regs, { de: DIA, ate: DIA }, HOJE, SEM_FERIADO, js, 480, [], "23:59", []);
  return b.dias.find((d) => d.dia === DIA)!;
};

describe("a janela vira minutos de JORNADA, não de relógio", () => {
  it("atestado das 08:00 às 13:00 vale 4h — o almoço não é jornada", () => {
    // 5h de relógio, 4h de trabalho: as 12:00–13:00 no meio não são devidas.
    // Perdoar as 5h daria 1h de crédito que a pessoa nunca ia trabalhar.
    expect(minutosDaJanela("08:00", "13:00", JORNADA)).toBe(240);
  });

  it("a janela é cortada pela escala: sair 17:00 e voltar 20:00 não perdoa nada", () => {
    expect(minutosDaJanela("17:00", "20:00", JORNADA)).toBe(0);
  });

  it("janela maior que o expediente não passa da jornada do dia", () => {
    expect(minutosDaJanela("00:00", "23:59", JORNADA)).toBe(480);
  });

  it("sem escala cadastrada vale o relógio, limitado à jornada", () => {
    const semEscala = { entradaPrevista: null, saidaPrevista: null, almocoInicio: null, almocoFim: null, jornadaMin: 480 };
    expect(minutosDaJanela("08:00", "13:00", semEscala)).toBe(300);
    expect(minutosDaJanela("00:00", "23:00", semEscala)).toBe(480);
  });

  it("minutos digitados vencem a janela — é o que o gestor escreveu", () => {
    expect(minutosDoRecorte({ minutos: 120, horaDe: "08:00", horaAte: "13:00" }, JORNADA)).toBe(120);
  });

  it("sem recorte nenhum é O DIA INTEIRO (null), que é o sentido de sempre", () => {
    expect(minutosDoRecorte({}, JORNADA)).toBeNull();
  });
});

describe("atestado de meio período", () => {
  it("não veio de manhã: as 4h da manhã são abonadas, a tarde é trabalhada", () => {
    const d = doDia(registros(["13:00", "17:00"]), [just({ horaDe: "08:00", horaAte: "13:00" })]);
    expect(d.trabalhadoMin).toBe(240);
    expect(d.abonadoMin).toBe(240);
    expect(d.saldoMin).toBe(0);          // 240 trabalhadas + 240 abonadas = 480
    expect(d.abonada).toBe(true);
    expect(d.classe).toBe("justificada");
  });

  it("não veio à tarde: mesma conta, do outro lado do dia", () => {
    const d = doDia(registros(["08:00", "12:00"]), [just({ horaDe: "13:00", horaAte: "17:00" })]);
    expect(d.abonadoMin).toBe(240);
    expect(d.saldoMin).toBe(0);
  });

  it("ficou 2h fora: perdoa 2h e o dia fecha", () => {
    // 08:00–12:00 e 15:00–17:00 = 6h. Faltam 2h, e o recorte cobre exatamente.
    const d = doDia(registros(["08:00", "12:00"], ["15:00", "17:00"]), [just({ minutos: 120 })]);
    expect(d.trabalhadoMin).toBe(360);
    expect(d.abonadoMin).toBe(120);
    expect(d.saldoMin).toBe(0);
  });
});

describe("o abono tem teto — e o teto é o buraco", () => {
  it("perdão maior que o déficit NÃO vira crédito", () => {
    // Dia cheio (8h) com um atestado de 2h em cima. Se o abono fosse somado,
    // a pessoa sairia com +2h de hora extra por ter ido trabalhar.
    const d = doDia(registros(["08:00", "12:00"], ["13:00", "17:00"]), [just({ minutos: 120 })]);
    expect(d.trabalhadoMin).toBe(480);
    expect(d.saldoMin).toBe(0);
    expect(d.abonadoMin).toBeUndefined();   // não perdoou nada: não havia o que perdoar
  });

  it("recorte menor que o buraco perdoa só o que cobre — o resto continua devido", () => {
    // Faltou o dia inteiro (480 min) com um atestado de só 2h.
    const d = doDia([], [just({ minutos: 120 })]);
    expect(d.abonadoMin).toBe(120);
    expect(d.saldoMin).toBe(-360);
    expect(d.abonada).toBe(false);          // o dia NÃO está quite
    expect(d.justificada).toBe(true);       // mas o motivo está registrado
  });

  it("duas justificativas no mesmo dia somam — dentista de manhã, banco à tarde", () => {
    const d = doDia(registros(["09:00", "12:00"], ["13:00", "16:00"]), [
      just({ horaDe: "08:00", horaAte: "09:00" }),
      just({ tipo: "consulta", horaDe: "16:00", horaAte: "17:00" }),
    ]);
    expect(d.trabalhadoMin).toBe(360);
    expect(d.abonadoMin).toBe(120);
    expect(d.saldoMin).toBe(0);
  });

  it("janelas que se encavalam por engano não passam da jornada do dia", () => {
    const r = resumirJustificativas(
      [{ efeito: "abona", horaDe: "08:00", horaAte: "17:00" }, { efeito: "abona", horaDe: "08:00", horaAte: "17:00" }],
      JORNADA,
    );
    expect(r.abonaMin).toBe(480);
  });
});

describe("só o APROVADO mexe em conta", () => {
  it("pedido pendente não perdoa um minuto — mas aparece no dia", () => {
    const d = doDia([], [just({ status: "pendente" })]);
    expect(d.saldoMin).toBe(-480);
    expect(d.classe).toBe("falta");
    expect(d.justificada).toBe(false);
    expect(d.justPendentes).toBe(1);
  });

  it("falta com pedido pendente SEGUE na lista de faltas a justificar", () => {
    // O contrário esconderia a falta do gestor no mesmo instante em que o
    // colaborador pede — e o pedido ainda não foi decidido por ninguém.
    // O ledger é CORRIDO (desde o início do banco), então ele traz todo dia
    // útil sem batida do histórico. O que importa é que o dia do pedido
    // pendente continua lá dentro — e sai da lista quando alguém aprova.
    const faltas = (js: Justificativa[]) =>
      calcBanco(PESSOA, [], { de: DIA, ate: DIA }, HOJE, SEM_FERIADO, js, 480, [], "23:59", [])
        .ledger.faltasNaoJustificadas.map((f) => f.dia);
    expect(faltas([just({ status: "pendente" })])).toContain(DIA);
    expect(faltas([just({ status: "aprovada" })])).not.toContain(DIA);
  });

  it("pedido recusado não conta nem como motivo", () => {
    const d = doDia([], [just({ status: "recusada" })]);
    expect(d.saldoMin).toBe(-480);
    expect(d.justificada).toBe(false);
  });
});

describe("a serviço da empresa conta como TRABALHO, não como perdão", () => {
  it("2h no banco entram nas horas trabalhadas do dia", () => {
    const d = doDia(registros(["08:00", "12:00"], ["13:00", "15:00"]), [
      just({ tipo: "empresa", efeito: "trabalhada", minutos: 120 }),
    ]);
    expect(d.trabalhadoMin).toBe(480);   // 6h de batida + 2h fora
    expect(d.foraMin).toBe(120);
    expect(d.saldoMin).toBe(0);
    expect(d.abonadoMin).toBeUndefined();
  });

  it("dia inteiro fora a serviço da empresa não é falta", () => {
    const d = doDia([], [just({ tipo: "empresa", efeito: "trabalhada" })]);
    expect(d.trabalhadoMin).toBe(480);
    expect(d.saldoMin).toBe(0);
    expect(d.classe).toBe("trabalhado");
  });
});

describe("compensar só registra o motivo", () => {
  it("as horas continuam devidas — é o `abona: false` de sempre", () => {
    const d = doDia(registros(["08:00", "12:00"], ["13:00", "16:00"]), [
      just({ tipo: "atraso", efeito: "compensar", minutos: 60, abona: false }),
    ]);
    expect(d.saldoMin).toBe(-60);
    expect(d.justificada).toBe(true);
    expect(d.abonada).toBe(false);
    expect(d.classe).toBe("parcial");
  });
});

describe("o registro antigo continua valendo", () => {
  it("linha só com `abona: true` perdoa o dia inteiro, como antes da v2", () => {
    // É o que o banco devolve enquanto o `ponto_justificativas_v2.sql` não
    // rodou: sem `efeito`, sem `status`, sem recorte.
    const antiga = { id: "velha", pessoaId: "p1", dia: DIA, motivo: "folga combinada", abona: true } as Justificativa;
    const d = doDia([], [antiga]);
    expect(d.saldoMin).toBe(0);
    expect(d.abonada).toBe(true);
    expect(d.motivo).toBe("folga combinada");
  });

  it("linha só com `abona: false` registra e continua devendo", () => {
    const antiga = { id: "velha2", pessoaId: "p1", dia: DIA, motivo: "particular", abona: false } as Justificativa;
    const d = doDia([], [antiga]);
    expect(d.saldoMin).toBe(-480);
    expect(d.justificada).toBe(true);
  });
});

describe("o vocabulário é o mesmo nas duas pontas", () => {
  it("todo tipo tem ícone que EXISTE no mapa do Tabler", () => {
    // Ícone faltando renderiza vazio em silêncio — o chip do tipo viraria um
    // retângulo em branco e ninguém saberia o que está escolhendo.
    for (const t of TIPOS_JUSTIFICATIVA) {
      expect(ICONS[ROTULO_TIPO[t].icone], `${t} → ${ROTULO_TIPO[t].icone}`).toBeTruthy();
    }
  });

  it("o selo de cada status também tem ícone que existe", () => {
    for (const st of STATUS_JUSTIFICATIVA) {
      expect(ICONS[SELO_STATUS[st].icone], `${st} → ${SELO_STATUS[st].icone}`).toBeTruthy();
    }
  });

  it("nenhum rótulo usa emoji — iconografia é Tabler", () => {
    for (const t of TIPOS_JUSTIFICATIVA) {
      const r = ROTULO_TIPO[t];
      expect(`${r.label} ${r.ajuda}`).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("só 'empresa' nasce contando como trabalho", () => {
    // Qualquer outro tipo nascendo "trabalhada" seria hora inventada por
    // padrão — o efeito que soma trabalho tem que ser escolha explícita.
    const contam = TIPOS_JUSTIFICATIVA.filter((t) => ROTULO_TIPO[t].efeito === "trabalhada");
    expect(contam).toEqual(["empresa"]);
  });
});

// ── A porta: quem pede não se autoaprova ─────────────────────────────────────
// Lido da FONTE, como as outras travas de rota da casa: chamar o handler de
// verdade exigiria sessão do Supabase e schema no banco, e cada mentira montada
// pra isso mentiria a favor — o gate passaria porque o mock devolveu um perfil.
describe("rota de justificativas: o caminho do colaborador é cercado", () => {
  const fonte = readFileSync(
    fileURLToPath(new URL("../../app/api/ponto/justificativas/route.ts", import.meta.url)), "utf8",
  ).replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");

  it("todo método exportado começa conferindo quem é", () => {
    const metodos = [...fonte.matchAll(/export\s+async\s+function\s+(GET|POST|PATCH|DELETE)\s*\(/g)];
    expect(metodos.length).toBe(4);
    const marcas = metodos.map((m, i) => fonte.slice(m.index!, metodos[i + 1]?.index ?? fonte.length));
    for (const corpo of marcas) expect(corpo).toMatch(/await (gestor\(\)|getProfile\(\))/);
  });

  it("PATCH (a decisão) é SÓ do gestor", () => {
    const patch = fonte.slice(fonte.indexOf("export async function PATCH"));
    expect(patch).toMatch(/const eu = await gestor\(\);/);
    expect(patch).toMatch(/if \(!eu\) return NextResponse\.json\(\{ error: "forbidden" \}, \{ status: 403 \}\);/);
  });

  it("quem não é gestor tem o pessoaId do corpo DESCARTADO", () => {
    // Conferir e recusar já seria dizer que dá pra tentar. Pedido de
    // colaborador é sempre sobre ele mesmo.
    expect(fonte).toMatch(/if \(!souGestor\)[\s\S]{0,400}pessoaId = minha\.id;/);
  });

  it("pedido de quem não é gestor nasce PENDENTE", () => {
    expect(fonte).toMatch(/status: souGestor \? "aprovada" : "pendente"/);
  });

  it("quem não é gestor não escolhe o EFEITO — ele sai do tipo", () => {
    // "conta como trabalhada" pedido por quem faltou seria autoabono com
    // outro nome.
    expect(fonte).toMatch(/const efeito = souGestor \? pedido\.efeito : ROTULO_TIPO\[pedido\.tipo\]\.efeito;/);
  });

  it("o anexo tem que ser um arquivo NOSSO, da área de atestados", () => {
    expect(fonte).toMatch(/areaDaChave\(chave\) === "atestados"/);
  });
});

describe("o atestado não abre pra qualquer logado", () => {
  it("a área tem leitura restrita — nunca `null`", () => {
    expect(LEITURA_POR_AREA.atestados).not.toBeNull();
    expect(LEITURA_POR_AREA.atestados).toEqual(["rh:atestados", "administracao", "colaboradores"]);
  });

  it("a exceção do DONO existe e vale só pra essa área", () => {
    const rota = readFileSync(
      fileURLToPath(new URL("../../app/api/arquivos/[...chave]/route.ts", import.meta.url)), "utf8",
    );
    expect(rota).toMatch(/area === "atestados" && \(await donoDoAnexoDoPonto\(/);
  });
});
