import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { AREA_BASICA, AREA_KEYS, SUB_FULL_KEYS } from "../areas";
import { SETOR_KEYS } from "../permissions";

/**
 * Trava de PARIDADE DE PORTÃO.
 *
 * O contrato da grade de permissões (lib/areas.ts) é: "ligar o card libera a
 * página E as APIs daquela área". Duas vezes esse contrato foi quebrado do
 * mesmo jeito — a página passou a ser gateada por ÁREA e a API continuou
 * exigindo `role === "admin"`. O efeito é sempre o mesmo report: "as permissões
 * estão ativas e configuradas corretamente, e a pessoa continua bloqueada".
 *
 * Foi assim que a área "Colaboradores" liberada abria uma tela sem lista, e as
 * sub-permissões de Configurações apareciam na grade sem nunca funcionar.
 *
 * Duas verificações:
 *  1. Toda chave usada num gate existe no catálogo — senão o gate é
 *     inalcançável (foi o caso de `set:financeiro`, que a grade não gravava).
 *  2. Rota de API não decide acesso SÓ pelo papel. Ou combina com a chave da
 *     área, ou está na lista abaixo com o motivo escrito.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const CATALOGO = new Set<string>([...AREA_BASICA, ...AREA_KEYS, ...SUB_FULL_KEYS, ...SETOR_KEYS]);

// Rotas que decidem por PAPEL de propósito. Não é "mais uma tela": é poder
// sobre o sistema ou sobre o registro de jornada de gente de verdade.
const SO_ADMIN: Record<string, string> = {
  "app/api/colaboradores/route.ts": "POST cria pessoa e login — distribui acesso, não é gestão de equipe.",
  "app/api/colaboradores/[id]/route.ts": "papel, senha, ativo e a própria grade de permissões (o PUT de RH já é por área).",
  "app/api/colaboradores/bulk/route.ts": "cria gente em lote.",
  "app/api/colaboradores/import-erp/route.ts": "importa gente do ERP criando login.",
  "app/api/colaboradores/[id]/erp-email/route.ts": "mexe no e-mail de LOGIN da pessoa.",
  "app/api/perfis/route.ts": "templates de permissão — é poder sobre poder.",
  "app/api/ponto/preencher/route.ts": "reescreve a jornada do mês inteiro de todo mundo.",
  "app/api/ponto/intervalos/route.ts": "lança batidas de intervalo no ponto de várias pessoas, retroativo.",
  "app/api/ponto/gerar-ativos/route.ts": "cria o registro de ponto de toda a empresa.",
  "app/api/central/chat/categorias/route.ts": "moderação do chat interno, que não é área da grade.",
  "app/api/central/chamados/route.ts": "suporte interno: quem resolve chamado é papel de gestão, não área.",
  "app/api/central/solicitacoes/route.ts": "quem resolve é papel de gestão OU a pessoa nomeada no pedido — não passa por área.",
};

const IGNORAR_DIR = new Set(["node_modules", ".next", ".git", ".claude", ".worktrees"]);

function varrer(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR_DIR.has(nome)) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, out);
    else if (/\.tsx?$/.test(nome) && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

const arquivosApi = varrer(join(RAIZ, "app", "api"));
const arquivosPlataforma = varrer(join(RAIZ, "app", "(plataforma)")).concat(varrer(join(RAIZ, "lib")));

const CHAVE_EM_GATE = /(?:getProfileForModule|requireModuleKeys|requireModule)\(\s*"([^"]+)"/g;
const CHAVE_EM_ANY = /getProfileForAnyModule\(([^)]*)\)/g;

describe("Gate por área — vocabulário", () => {
  it("toda chave usada num gate existe no catálogo da grade", () => {
    const desconhecidas: string[] = [];
    for (const f of [...arquivosApi, ...arquivosPlataforma]) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(CHAVE_EM_GATE)) {
        if (!CATALOGO.has(m[1])) desconhecidas.push(`${relative(RAIZ, f)} → ${m[1]}`);
      }
      for (const m of src.matchAll(CHAVE_EM_ANY)) {
        for (const k of m[1].match(/"([^"]+)"/g) ?? []) {
          const chave = k.slice(1, -1);
          if (!CATALOGO.has(chave)) desconhecidas.push(`${relative(RAIZ, f)} → ${chave}`);
        }
      }
    }
    expect(desconhecidas, "chave de gate que a grade nunca concede").toEqual([]);
  });

  it("as chaves que a tela do Analytics lê são concedíveis pela grade", () => {
    for (const k of SETOR_KEYS) expect(CATALOGO.has(k), k).toBe(true);
  });
});

describe("Gate por área — nada decide só pelo papel", () => {
  it("rota de API combina papel com a chave da área (ou está na lista com motivo)", () => {
    const soPapel: string[] = [];
    for (const f of arquivosApi) {
      const rel = relative(RAIZ, f);
      if (SO_ADMIN[rel]) continue;
      const src = readFileSync(f, "utf8");
      // Só conta código, não comentário: a explicação do fix cita o padrão.
      const codigo = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");
      // Comparação EXPLÍCITA de papel (`role === "admin"`, lista de papéis).
      // Passar `me.role` adiante não conta: quem decide é a função chamada.
      const usaPapel = /role\s*[!=]==\s*"(?:admin|gerente[a-z_]*|estoquista|colaborador)"|\.includes\(\s*\w*\.?role\s*\)/.test(codigo);
      // `apiFinanceiro` e `apiRh` são os gates de ÁREA dos seus módulos — cada
      // um chama `getProfileForModule` por dentro (lib/financeiro/gate.ts,
      // lib/rh/gate.ts) e ainda confere a sub. Sem eles aqui, uma rota que
      // gateia certo pela área e compara papel para uma decisão FINA (quem vê
      // a grade de permissões, que é do papel admin) era acusada de decidir só
      // pelo papel — e a saída teria sido pôr a rota na lista de exceção, que
      // é justamente o que este teste existe para evitar.
      const usaArea = /getProfileForModule|getProfileForAnyModule|resolveMyModuleKeys|requireModuleKeys|getAdminProfile|apiFinanceiro\(|apiRh\(/.test(codigo);
      if (usaPapel && !usaArea) soPapel.push(rel);
    }
    expect(soPapel, "gate por papel sem a chave da área — a grade liberada não vai funcionar").toEqual([]);
  });

  it("a lista de exceções não guarda arquivo que não existe mais", () => {
    const existentes = new Set(arquivosApi.map((f) => relative(RAIZ, f)));
    for (const rel of Object.keys(SO_ADMIN)) expect(existentes.has(rel), rel).toBe(true);
  });
});
