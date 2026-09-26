import type { MarketEmployee, MarketPerson } from "./types";
import { financialStatus, roundMoney } from "./domain";

// ── Quem é a MESMA pessoa ────────────────────────────────────────────────────
// Aqui várias pessoas têm cadastro em mais de uma empresa (Pedro em 4, Douglas
// em 3, Daniel/Dani em 3, Leozão em 2). Cada cadastro tem carteira própria, e
// somados eles são a dívida real de UMA pessoa — mas o painel mostrava quatro
// linhas de "Pedro", cada uma com um pedaço.
//
// O que identifica a pessoa é o CÓDIGO DE ACESSO, não o nome: é o mesmo código
// que ela digita em qualquer tablet, e o login do totem já trata assim (regra
// verificada contra os 49 cadastros ativos).
//
// O nome sozinho é fraco. "Felipe", "Douglas", "Caio" se repetem entre pessoas
// diferentes, e existem cadastros duplicados dentro da MESMA empresa. Por isso
// o nome só une quando é um nome COMPLETO (duas palavras ou mais) — e mesmo
// assim só na falta de código.

export function normalizarNome(nome: string | null | undefined): string {
  return (nome ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

// Apelido conta como o mesmo nome ("Dani" × "Daniel", "Ana" × "Ana Júlia"):
// um é prefixo do outro. Nomes distintos = pessoas distintas.
export function nomesCompativeis(a: string, b: string): boolean {
  const x = normalizarNome(a), y = normalizarNome(b);
  if (!x || !y) return false;
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
  return longo === curto || longo.startsWith(curto + " ") || longo.startsWith(curto);
}

export type ContaComCodigo = MarketEmployee & {
  codigoAcesso?: string | null;
  /** Empresa principal escolhida à mão no painel (quando existir). */
  empresaPrincipalManual?: string | null;
};

// A chave do grupo vai para o navegador (é o React key e o id de expansão da
// linha), então NÃO pode carregar o código de acesso. Só precisa ser estável
// dentro da resposta e não reversível de cabeça — não é segredo criptográfico,
// é evitar publicar o código numa chave de lista.
function opaco(codigo: string): string {
  let h = 2166136261;
  for (let i = 0; i < codigo.length; i++) { h ^= codigo.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Agrupa os cadastros em pessoas. Devolve as chaves de agrupamento, nunca o
// código em si — ele não deve sair do servidor.
export function unirPessoas(contas: ContaComCodigo[], gastoPorConta?: Map<number, number>): MarketPerson[] {
  const grupos = new Map<string, ContaComCodigo[]>();

  for (const conta of contas) {
    const codigo = (conta.codigoAcesso ?? "").trim();
    const nome = normalizarNome(conta.name);
    // Chave por código; sem código, só nome COMPLETO. Nome de uma palavra fica
    // sozinho de propósito — unir "Felipe" com "Felipe" pode juntar duas
    // pessoas diferentes, e misturar dívida alheia é pior que listar duas linhas.
    const chave = codigo ? `codigo:${opaco(codigo)}` : (nome.includes(" ") ? `nome:${nome}` : `conta:${conta.id}`);
    const grupo = grupos.get(chave);
    if (!grupo) { grupos.set(chave, [conta]); continue; }
    // Trava de segurança: mesmo com código igual, nomes incompatíveis são
    // pessoas diferentes dividindo um código — aí NÃO se une (a conta vai para
    // um grupo próprio e o painel mostra o conflito).
    if (grupo.every((g) => nomesCompativeis(g.name, conta.name))) grupo.push(conta);
    else grupos.set(`conflito:${conta.id}`, [conta]);
  }

  return [...grupos.entries()].map(([chave, grupo]) => montarPessoa(chave, grupo, gastoPorConta))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
}

// A empresa PRINCIPAL de quem tem cadastro em várias: onde a pessoa mais
// GASTOU. É o melhor sinal de onde ela realmente trabalha — melhor que a
// dívida (que só diz onde ela ainda não pagou) e que a ordem dos ids.
// Sem consumo em lugar nenhum, cai na maior dívida e depois no menor id, pra
// a escolha ser sempre determinística.
export function empresaPrincipal(contas: MarketEmployee[], gastoPorConta?: Map<number, number>, escolhaManual?: string | null): string {
  // Um ajuste manual do gestor manda mais que qualquer heurística — ele sabe
  // de transferências e mudanças de setor que o histórico ainda não mostra.
  if (escolhaManual && contas.some((c) => c.profileId === escolhaManual)) return escolhaManual;
  const porGasto = [...contas].sort((a, b) => {
    const ga = gastoPorConta?.get(a.id) ?? 0;
    const gb = gastoPorConta?.get(b.id) ?? 0;
    if (gb !== ga) return gb - ga;
    if (b.open !== a.open) return b.open - a.open;
    return a.id - b.id;
  });
  return porGasto[0]?.profileId ?? "";
}

function montarPessoa(chave: string, contas: ContaComCodigo[], gastoPorConta?: Map<number, number>): MarketPerson {
  // O nome exibido é o mais completo do grupo ("Daniel", não "Dani").
  const nome = contas.map((c) => c.name).reduce((a, b) => (b.length > a.length ? b : a));
  const manual = contas.find((c) => c.empresaPrincipalManual)?.empresaPrincipalManual ?? null;
  // Só cadastros ATIVOS entram na soma. Um cadastro velho/desativado (comum:
  // a mesma pessoa recadastrada, como Felipe 122 ativo + 123 inativo com o
  // mesmo código) NÃO deve inflar a dívida/gasto da pessoa. Os inativos
  // continuam visíveis em `accounts` (aparecem ao expandir), só não somam.
  // Se TUDO estiver inativo, soma tudo — senão a pessoa sumiria com saldo zero.
  const ativos = contas.filter((c) => c.active);
  const somar = ativos.length ? ativos : contas;
  const open = roundMoney(somar.reduce((s, c) => s + c.open, 0));
  const overdue = roundMoney(somar.reduce((s, c) => s + c.overdue, 0));
  const cycleOpen = roundMoney(somar.reduce((s, c) => s + c.cycleOpen, 0));
  const previousOpen = roundMoney(somar.reduce((s, c) => s + c.previousOpen, 0));
  const closedUntil = roundMoney(somar.reduce((s, c) => s + (c.closedUntil ?? 0), 0));
  const currentMonth = roundMoney(somar.reduce((s, c) => s + (c.currentMonth ?? 0), 0));
  // Limite somado = o que ela REALMENTE consegue gastar hoje, porque cada
  // carteira tem o próprio teto e todas valem ao mesmo tempo.
  const normalLimit = roundMoney(somar.reduce((s, c) => s + c.normalLimit, 0));
  const overdraftLimit = roundMoney(somar.reduce((s, c) => s + c.overdraftLimit, 0));
  const spent = roundMoney(somar.reduce((s, c) => s + (gastoPorConta?.get(c.id) ?? 0), 0));
  const bloqueada = somar.some((c) => c.status === "blocked");
  const mainProfileId = empresaPrincipal(somar, gastoPorConta, manual);
  // O score da pessoa é o da conta principal; o override do gestor mira nesse
  // employee_id. Sem conta principal casada, cai na primeira.
  const principal = somar.find((c) => c.profileId === mainProfileId) ?? somar[0];
  return {
    key: chave,
    name: nome,
    imageUrl: contas.find((c) => c.imageUrl)?.imageUrl ?? null,
    active: contas.some((c) => c.active),
    accounts: contas.map(({ codigoAcesso: _codigo, empresaPrincipalManual: _manual, ...conta }) => conta).sort((a, b) => b.open - a.open),
    unified: contas.length > 1,
    mainProfileId,
    mainProfileManual: !!manual,
    open, cycleOpen, previousOpen, closedUntil, currentMonth, overdue, normalLimit, overdraftLimit, spent,
    available: roundMoney(Math.max(0, normalLimit + overdraftLimit - cycleOpen)),
    status: financialStatus(cycleOpen, overdue, normalLimit + overdraftLimit, bloqueada),
    score: principal?.score ?? 0,
    scoreManual: principal?.scoreManual ?? false,
    scoreEmployeeId: principal?.id ?? 0,
  };
}
