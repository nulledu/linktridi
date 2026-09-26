// ── Clientes da loja ─────────────────────────────────────────────────────────
// Não existe cadastro de cliente, e não vai existir: quem compra numa vitrine
// pública não faz conta. O cliente é o que se DEDUZ dos pedidos — e essa
// dedução tem uma decisão no meio que vale explicar, porque ela decide se duas
// compras são de duas pessoas ou da mesma.
//
// ── Quem é "a mesma pessoa" ─────────────────────────────────────────────────
// Na ordem: e-mail, depois telefone, depois nome. E-mail primeiro porque é o
// campo que mais raramente se digita de dois jeitos; telefone depois porque
// varia na formatação mas normaliza bem; nome por último e a contragosto —
// duas "Maria Silva" viram uma só, e não há como saber. O campo usado fica
// guardado em `chave`, então dá pra auditar por que dois pedidos foram
// juntados.
//
// O nome é normalizado com acento e caixa removidos justamente porque "José" e
// "jose" são a mesma pessoa digitando com pressa.

import type { Pedido } from "./lojas";

export interface Cliente {
  /** Como as compras foram agrupadas — serve pra auditar o agrupamento. */
  chave: string;
  criterio: "email" | "telefone" | "nome";
  nome: string;
  email: string;
  telefone: string;
  pedidos: number;
  /** Só o que foi PAGO. Pendente é promessa e estornado voltou. */
  gasto: number;
  primeiroEm: string;
  ultimoEm: string;
}

export type Segmento = "todos" | "novos" | "recorrentes" | "inativos";

export const ROTULO_SEGMENTO: Record<Segmento, string> = {
  todos: "Todos",
  novos: "Novos",
  recorrentes: "Recorrentes",
  inativos: "Sumidos",
};

/** Sem comprar há mais que isto, a pessoa entra em "sumidos". */
export const DIAS_PARA_SUMIR = 60;

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Só os dígitos, e sem o 55 do país — `+55 (14) 99999-9999` e `14999999999`
 *  são o mesmo telefone digitado por duas pessoas diferentes. */
const soDigitos = (s: string) => {
  const d = (s || "").replace(/\D/g, "");
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
};

function identidade(p: Pedido): { chave: string; criterio: Cliente["criterio"] } | null {
  const email = semAcento(p.clienteEmail ?? "");
  if (email.includes("@")) return { chave: `e:${email}`, criterio: "email" };
  const fone = soDigitos(p.clienteTelefone ?? "");
  if (fone.length >= 8) return { chave: `t:${fone}`, criterio: "telefone" };
  const nome = semAcento(p.cliente ?? "");
  return nome ? { chave: `n:${nome}`, criterio: "nome" } : null;
}

/**
 * Agrupa os pedidos em clientes.
 *
 * PURA e exportada pra ser testada sem banco: o agrupamento é a parte que erra
 * em silêncio — uma chave mal escolhida transforma dez clientes fiéis em trinta
 * clientes de uma compra só, e o relatório de recorrência passa a mentir sem
 * parecer quebrado.
 */
export function agruparClientes(pedidos: Pedido[]): Cliente[] {
  const mapa = new Map<string, Cliente>();

  for (const p of pedidos) {
    const id = identidade(p);
    if (!id) continue;

    const atual = mapa.get(id.chave) ?? {
      chave: id.chave,
      criterio: id.criterio,
      nome: p.cliente ?? "",
      email: p.clienteEmail ?? "",
      telefone: p.clienteTelefone ?? "",
      pedidos: 0,
      gasto: 0,
      primeiroEm: p.feitoEm,
      ultimoEm: p.feitoEm,
    };

    atual.pedidos += 1;
    if (p.pagamento === "pago") atual.gasto += p.total;
    if (p.feitoEm < atual.primeiroEm) atual.primeiroEm = p.feitoEm;
    if (p.feitoEm > atual.ultimoEm) {
      atual.ultimoEm = p.feitoEm;
      // O nome e o contato mais RECENTES vencem: quem corrigiu o telefone no
      // último pedido quer ser achado pelo novo, não pelo antigo.
      atual.nome = p.cliente || atual.nome;
      atual.email = p.clienteEmail || atual.email;
      atual.telefone = p.clienteTelefone || atual.telefone;
    }

    mapa.set(id.chave, atual);
  }

  return [...mapa.values()].sort((a, b) => b.gasto - a.gasto || b.pedidos - a.pedidos);
}

export function classificar(c: Cliente, hojeISO: string): Exclude<Segmento, "todos">[] {
  const marcas: Exclude<Segmento, "todos">[] = [];
  if (c.pedidos === 1) marcas.push("novos");
  if (c.pedidos > 1) marcas.push("recorrentes");

  const dias = Math.floor(
    (Date.parse(`${hojeISO}T12:00:00Z`) - Date.parse(`${c.ultimoEm.slice(0, 10)}T12:00:00Z`)) / 86_400_000,
  );
  if (dias >= DIAS_PARA_SUMIR) marcas.push("inativos");
  return marcas;
}

export function filtrarPorSegmento(clientes: Cliente[], segmento: Segmento, hojeISO: string): Cliente[] {
  if (segmento === "todos") return clientes;
  return clientes.filter((c) => classificar(c, hojeISO).includes(segmento));
}

/** Os números do topo da tela. */
export function resumoDeClientes(clientes: Cliente[], hojeISO: string) {
  const gasto = clientes.reduce((s, c) => s + c.gasto, 0);
  const pedidos = clientes.reduce((s, c) => s + c.pedidos, 0);
  return {
    total: clientes.length,
    recorrentes: clientes.filter((c) => c.pedidos > 1).length,
    sumidos: clientes.filter((c) => classificar(c, hojeISO).includes("inativos")).length,
    // Quanto uma pessoa gasta na loja ao longo da vida dela como cliente. É a
    // conta que decide quanto vale pagar por um cliente novo.
    gastoMedio: clientes.length ? gasto / clientes.length : 0,
    pedidosPorCliente: clientes.length ? pedidos / clientes.length : 0,
  };
}
