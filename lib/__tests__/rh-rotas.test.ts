/**
 * As rotas e as páginas do RH — conferidas LENDO O CÓDIGO-FONTE.
 *
 * Irmão de `rh-area-restrita.test.ts` (lá se prova que a CHAVE não vaza) e de
 * `gate-por-area.test.ts` (lá, que a chave do portão existe na grade). Aqui se
 * prova que TODA porta tem portão — e, no RH, que a porta certa está em cada
 * porta: um `apiRh("ver")` no `PUT` da ficha anamnésica deixaria qualquer
 * pessoa com acesso de leitura escrever histórico de saúde.
 *
 * POR QUE FONTE, E NÃO CHAMAR A ROTA: um handler do App Router só responde
 * depois que a sessão do Supabase existe, o schema `rh_*` está no banco e o
 * `next/headers` tem um request de verdade por trás. Montar isso custaria três
 * camadas de mentira, e cada uma mentiria a favor — o gate passaria porque o
 * mock devolveu um perfil, e o teste ficaria verde justamente na regressão que
 * deveria pegar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { AREA_BY_KEY } from "../areas";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const DIR_API = join(RAIZ, "app", "api", "rh");
const DIR_PAGINAS = join(RAIZ, "app", "(plataforma)", "rh");

function varrer(dir: string, alvo: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, alvo, out);
    else if (nome === alvo) out.push(full);
  }
  return out;
}

/** Comentário não é código: estes arquivos EXPLICAM o padrão em prosa. */
const semComentario = (src: string) => src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");

const METODO = /export\s+async\s+function\s+(GET|POST|PATCH|PUT|DELETE)\s*\(/g;
const METODO_FORA_DO_PADRAO = /export\s+(?:const|let|var|function)\s+(?:GET|POST|PATCH|PUT|DELETE)\b/;
const RESPOSTA_COM_ERROR = /NextResponse\.json\(\s*\{[^{}]*\berror\s*:/;

const SUBS_DO_CATALOGO = new Set((AREA_BY_KEY.rh?.subs ?? []).map((s) => s.key));

interface Rota { rel: string; fonte: string; metodos: { nome: string; corpo: string }[] }

const rotas: Rota[] = varrer(DIR_API, "route.ts").map((f) => {
  const fonte = semComentario(readFileSync(f, "utf8"));
  const marcas = [...fonte.matchAll(METODO)];
  return {
    rel: relative(RAIZ, f),
    fonte,
    metodos: marcas.map((m, i) => ({
      nome: m[1],
      corpo: fonte.slice(m.index!, marcas[i + 1]?.index ?? fonte.length),
    })),
  };
});

const paginas = varrer(DIR_PAGINAS, "page.tsx").map((f) => ({
  rel: relative(RAIZ, f),
  fonte: semComentario(readFileSync(f, "utf8")),
}));

describe("RH — o scanner enxerga tudo", () => {
  it("achou as rotas (varredura quebrada seria uma suíte verde que não testa nada)", () => {
    expect(rotas.length, `nenhum route.ts em ${relative(RAIZ, DIR_API)} — conferir o caminho da varredura`)
      .toBeGreaterThanOrEqual(4);
  });

  it("achou as páginas", () => {
    expect(paginas.length, `nenhum page.tsx em ${relative(RAIZ, DIR_PAGINAS)}`).toBeGreaterThanOrEqual(4);
  });

  it("todo route.ts exporta pelo menos um método no formato que o scanner lê", () => {
    expect(rotas.filter((r) => !r.metodos.length).map((r) => r.rel)).toEqual([]);
  });

  it("nenhum handler escapa por `export const GET = …`", () => {
    const outros = rotas.filter((r) => METODO_FORA_DO_PADRAO.test(r.fonte)).map((r) => r.rel);
    expect(
      outros,
      "handler declarado como const/function solta: o scanner não o vê e ele passaria SEM gate — declare `export async function`",
    ).toEqual([]);
  });
});

describe("RH — todo método tem o seu portão", () => {
  it("cada método exportado chama apiRh()", () => {
    const semGate: string[] = [];
    for (const r of rotas) {
      for (const m of r.metodos) if (!/apiRh\(/.test(m.corpo)) semGate.push(`${r.rel} → ${m.nome}`);
    }
    expect(
      semGate,
      'método sem gate: abre para qualquer pessoa logada — comece o handler com `const eu = await apiRh("<sub>"); if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });`',
    ).toEqual([]);
  });

  it("a conta fecha: um apiRh por método exportado", () => {
    const desencontro: string[] = [];
    for (const r of rotas) {
      const gates = (r.fonte.match(/apiRh\(/g) ?? []).length;
      if (gates !== r.metodos.length) desencontro.push(`${r.rel}: ${r.metodos.length} método(s), ${gates} gate(s)`);
    }
    expect(
      desencontro,
      "sobrou ou faltou gate. Gate a mais dentro do mesmo método é gate morto (só o primeiro barra); gate a menos é porta aberta",
    ).toEqual([]);
  });

  it("a sub usada no gate existe na grade de permissões", () => {
    const inventadas: string[] = [];
    for (const r of rotas) {
      for (const m of r.fonte.matchAll(/apiRh\(\s*"([^"]+)"/g)) {
        if (!SUBS_DO_CATALOGO.has(m[1])) inventadas.push(`${r.rel} → "${m[1]}"`);
      }
    }
    expect(
      inventadas,
      `sub que a grade nunca concede: o gate fica inalcançável e a rota responde 403 para todo mundo. Use uma de: ${[...SUBS_DO_CATALOGO].join(", ")} (lib/areas.ts → AREAS.rh.subs)`,
    ).toEqual([]);
  });

  it("nenhuma rota de API redireciona", () => {
    // Rota que redireciona vira 200 com HTML, e o `r.ok` do cliente lê isso
    // como sucesso — a memória "sessão expirada virava salvo".
    const redirecionam = rotas.filter((r) => /\bredirect\s*\(/.test(r.fonte)).map((r) => r.rel);
    expect(redirecionam, "rota de API não redireciona: devolva 403 com { erro }").toEqual([]);
  });

  it("o erro sai no campo que a tela lê (`erro`, não `error`)", () => {
    const erradas = rotas.filter((r) => RESPOSTA_COM_ERROR.test(r.fonte)).map((r) => r.rel);
    expect(erradas, "o RH nasceu no padrão do Financeiro: `{ erro: \"…\" }`").toEqual([]);
  });
});

describe("RH — cada método exige a chave DAQUELA gaveta", () => {
  // O erro que este bloco pega é de uma linha: copiar um handler e esquecer de
  // trocar a sub. O gate continua lá, o teste de "todo método tem portão"
  // continua verde, e a rota passa a deixar quem só LÊ escrever.
  //
  // Por MÉTODO, e não por arquivo: desde que a ficha virou pop-up, a rota do
  // colaborador tem um GET (que alimenta o painel, e só lê) ao lado do PUT.
  const LER = new Set(["GET", "HEAD"]);
  const esperado: Record<string, { ler?: string; escrever: string }> = {
    "app/api/rh/documentos/route.ts": { escrever: "documentos_editar" },
    "app/api/rh/atestados/route.ts": { escrever: "atestados_editar" },
    "app/api/rh/ferias/route.ts": { escrever: "ferias_editar" },
    // Conferir o período é LEITURA: mostra os feriados da janela e os choques
    // antes de salvar. Quem só lê férias pode conferir; quem grava é o POST.
    "app/api/rh/ferias/conflitos/route.ts": { ler: "ferias", escrever: "ferias_editar" },
    // Ler o par vem com o banco de horas (é lá que ele aparece); registrar e
    // aprovar é chave própria — aprovar perdoa uma jornada inteira.
    "app/api/rh/compensacoes/route.ts": { ler: "banco_horas", escrever: "compensacoes_editar" },
    "app/api/rh/compensacoes/conferir/route.ts": { ler: "compensacoes_editar", escrever: "compensacoes_editar" },
    "app/api/rh/anamnese/route.ts": { escrever: "anamnese_editar" },
    "app/api/rh/colaboradores/[id]/route.ts": { ler: "ver", escrever: "editar" },
    "app/api/rh/calendario/eventos/route.ts": { escrever: "calendario_editar" },
    "app/api/rh/calendario/setores/route.ts": { escrever: "calendario_setores" },
    "app/api/rh/calendario/feriados/route.ts": { escrever: "calendario_feriados" },
    // A DECISÃO de o feriado valer no Ponto: ler abre com o calendário, decidir
    // é a mesma chave de gerenciar feriado — mexe no que a folha considera dia útil.
    "app/api/rh/calendario/feriados-ponto/route.ts": { ler: "calendario", escrever: "calendario_feriados" },
    // Currículos: cada gaveta tem a sua chave, e a lista NÃO abre nenhuma.
    "app/api/rh/curriculos/[id]/route.ts": { ler: "curriculos", escrever: "curriculos_editar" },
    "app/api/rh/curriculos/[id]/status/route.ts": { escrever: "curriculos_status" },
    "app/api/rh/curriculos/[id]/observacoes/route.ts": { escrever: "curriculos_editar" },
    "app/api/rh/curriculos/[id]/visto/route.ts": { escrever: "curriculos" },
    "app/api/rh/curriculos/respostas/route.ts": { ler: "curriculos_respostas", escrever: "curriculos_respostas" },
    "app/api/rh/curriculos/vagas/route.ts": { escrever: "curriculos_editar" },
    "app/api/rh/curriculos/integracao/route.ts": { escrever: "curriculos_integracao" },
    // O formulário configurável: ler e gravar são da mesma chave do link.
    "app/api/rh/curriculos/formulario/route.ts": { ler: "curriculos_integracao", escrever: "curriculos_integracao" },
    // As colunas do Kanban são configuração do processo, como o formulário.
    "app/api/rh/curriculos/etapas/route.ts": { escrever: "curriculos_integracao" },
  };

  for (const [rel, regra] of Object.entries(esperado)) {
    it(`${rel} usa a sub certa em cada método`, () => {
      const r = rotas.find((x) => x.rel.replace(/\\/g, "/") === rel);
      expect(r, `rota não encontrada: ${rel} — se ela mudou de lugar, atualize este mapa`).toBeTruthy();
      expect(r!.metodos.length).toBeGreaterThan(0);

      for (const m of r!.metodos) {
        const usada = m.corpo.match(/apiRh\(\s*"([^"]+)"/)?.[1];
        const devia = LER.has(m.nome) ? regra.ler : regra.escrever;
        expect(
          usada,
          `${rel} → ${m.nome} pede "${usada}" e devia pedir "${devia}"` +
          (LER.has(m.nome) && !regra.ler ? " (esta rota não devia ter método de leitura)" : ""),
        ).toBe(devia);
      }
    });
  }
});

describe("RH — a ficha anamnésica não vaza pela porta lateral", () => {
  // A aba de Histórico abre para quem tem `rh:ver`, SEM a chave de anamnese e
  // sem a de atestados. Se a rota escrever o conteúdo clínico no
  // `rh_historico`, o dado que a permissão separada protege aparece para todo
  // mundo do RH — e ninguém percebe, porque a tela que o mostra é outra.
  // O que NÃO pode aparecer é conteúdo CLÍNICO. Um `dados: { atestado_id }` é
  // ponteiro, não diagnóstico: só resolve para quem tem a chave de atestados.
  const clinico = ["cid", "medicamentos", "condicoes", "alergias", "profissional"];

  it("o histórico do atestado não carrega CID, diagnóstico nem observação", () => {
    const r = rotas.find((x) => x.rel.includes("atestados"));
    expect(r).toBeTruthy();
    for (const bloco of r!.fonte.matchAll(/anotarNoHistorico\(\{[\s\S]*?\}\);/g)) {
      for (const termo of clinico) {
        expect(
          new RegExp(`\\b${termo}\\b`).test(bloco[0]),
          `"${termo}" dentro de anotarNoHistorico em ${r!.rel}: o histórico é lido por quem só tem rh:ver`,
        ).toBe(false);
      }
    }
  });

  it("a LEITURA do histórico nunca traz a coluna `dados`", () => {
    // Esta é a garantia estrutural, e vale mais que a inspeção acima: `dados`
    // guarda o de/para cru de cada evento, e a aba de Histórico abre com
    // `rh:ver`. Enquanto a coluna não for selecionada, nada do que as rotas
    // gravarem ali chega ao navegador de quem não tem a chave da gaveta.
    const fonte = semComentario(readFileSync(join(RAIZ, "lib", "rh", "dados.ts"), "utf8"));
    const select = fonte.match(/from\("rh_historico"\)[\s\S]{0,200}?\.select\(\s*"([^"]+)"/);
    expect(select, "a leitura de rh_historico mudou de forma — reveja esta trava").toBeTruthy();
    expect(
      select![1].split(",").map((c) => c.trim()),
      "`dados` não pode entrar no select do histórico",
    ).not.toContain("dados");
  });

  it("o histórico da anamnese registra QUE mudou, nunca O QUE mudou", () => {
    const r = rotas.find((x) => x.rel.includes("anamnese"));
    expect(r).toBeTruthy();
    for (const bloco of r!.fonte.matchAll(/anotarNoHistorico\(\{[\s\S]*?\}\);/g)) {
      expect(
        /\bdados\b|\bdetalhe\b/.test(bloco[0]),
        `anotarNoHistorico da anamnese não pode levar conteúdo — só o fato de ter sido atualizada`,
      ).toBe(false);
    }
  });
});

describe("RH — toda página tem gate", () => {
  it("cada page.tsx do módulo chama requireRh", () => {
    // O layout já exige a ÁREA, mas cada tela exige a sua sub: sem isto, quem
    // recebeu só o Calendário abriria a lista de todo mundo pela URL.
    // Página que só redireciona (endereço antigo que mudou de casa) não
    // renderiza nada: quem gateia é o destino. Ela não pode ler dado nenhum.
    const soRedireciona = (f: string) =>
      /\bredirect\(/.test(f) && !/from\s+["']@\/lib\/(?!.*navigation)/.test(f) && !/<[A-Z]\w*[\s/>]/.test(f);
    const sem = paginas.filter((p) => !/requireRh\(/.test(p.fonte) && !soRedireciona(p.fonte)).map((p) => p.rel);
    expect(sem, "página sem gate: o layout cobre a área, mas a sub é de cada tela").toEqual([]);
  });

  it("a ficha do colaborador não LÊ a anamnese sem a chave", () => {
    // Esta asserção morava na página `[id]`. A ficha virou pop-up e a página
    // deixou de existir — a garantia foi junto para a rota que alimenta o
    // painel, que é onde o dado de saúde é de fato buscado.
    //
    // Esconder a aba no cliente depois de o servidor já ter mandado o conteúdo
    // é decoração: o dado viajou e quem abre o inspetor o encontra.
    const r = rotas.find((x) => x.rel.replace(/\\/g, "/") === "app/api/rh/colaboradores/[id]/route.ts");
    expect(r).toBeTruthy();
    const get = r!.metodos.find((m) => m.nome === "GET");
    expect(get, "o GET que alimenta o painel sumiu — reveja esta trava").toBeTruthy();
    expect(
      /p\.anamnese\s*\?\s*\(await\s+anamneseDe\(/.test(get!.corpo),
      "a chamada a anamneseDe() tem de ficar atrás de `p.anamnese ?` dentro do GET",
    ).toBe(true);
  });

  it("nenhuma rota do RH devolve a anamnese junto do resto sem conferir", () => {
    // O jeito de furar sem mexer no `if`: pôr `anamneseDe` dentro do
    // `Promise.all` das outras gavetas. Ali ela roda para todo mundo.
    const r = rotas.find((x) => x.rel.includes("colaboradores"));
    const all = r!.fonte.match(/Promise\.all\(\[[\s\S]*?\]\)/g) ?? [];
    for (const bloco of all) {
      expect(
        /anamneseDe\(/.test(bloco),
        "anamneseDe() dentro de um Promise.all: ela roda para quem não tem a chave",
      ).toBe(false);
    }
  });
});
