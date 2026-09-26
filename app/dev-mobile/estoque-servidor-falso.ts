// TEMPORÁRIO — o pedaço de SERVIDOR que o banco de provas precisa ter.
//
// O mapa de `telas-estoque.ts` responde GET e resolve as telas de leitura. Mas
// os dois fluxos que este módulo existe pra provar têm o miolo num POST:
//
//   • importar planilha → o passo do meio ("o que vai mudar") só aparece depois
//     de um POST que devolve o PLANO;
//   • classificar em lote → só prova que classifica depois de um POST que
//     escreve.
//
// Sem isto, `/dev-mobile?ws=estoque` desenha os dois painéis vazios e a
// primeira tentativa cai em "Não foi possível classificar" — que é exatamente
// o que aconteceu ao medir pela primeira vez.
//
// O QUE ISTO NÃO É: uma segunda implementação das regras. A decisão inteira
// (quais linhas são novas, o que muda em cada item, qual hierarquia é válida)
// vem das MESMAS funções puras que `app/api/estoque/importar/route.ts` e
// `app/api/estoque-itens/classificar/route.ts` chamam. O que fica de fora é só
// a persistência — aqui um array em memória, lá o Postgres. Portanto os números
// que aparecem na tela são os do planejador de verdade; o que esta prova não
// cobre é o banco (RLS, trigger do serializado, unique de nome).

import {
  chaveDeFornecedor, lerPlanilha, planejarImportacao,
  type FornecedorDoCatalogo, type ItemDoCatalogo,
} from "@/lib/estoque-importacao";
import { isHierarquia } from "@/lib/estoque-hierarquia";
import type { Handler, RespostaFalsa } from "./RedeFalsa";
import { ESTOQUE_FORNECEDORES, ESTOQUE_ITENS } from "./telas-estoque";

type ItemFalso = (typeof ESTOQUE_ITENS.itens)[number];

// ── O "banco": vive enquanto a aba estiver aberta ────────────────────────────
// Recarregar a página volta ao catálogo inicial, o que é bom pra prova: cada
// medição começa do mesmo lugar.
const itens: ItemFalso[] = ESTOQUE_ITENS.itens.map((i) => ({ ...i }));
const fornecedores: FornecedorDoCatalogo[] = ESTOQUE_FORNECEDORES.fornecedores.map((f) => ({ id: f.id, nome: f.nome }));
let sequencia = 0;

/** O recorte de colunas que a rota de verdade lê do Postgres. */
const paraPlanejador = (): ItemDoCatalogo[] => itens.map((i) => ({
  id: i.id, nome: i.nome, serializado: i.serializado, quantidade: i.quantidade,
  qtd_minima: i.qtd_minima, unidade: i.unidade, fornecedor_id: i.fornecedor_id,
}));

const ok = (corpo: unknown): RespostaFalsa => ({ corpo });
const recusa = (status: number, corpo: unknown): RespostaFalsa => ({ status, corpo });

// ── GET /api/estoque-itens ───────────────────────────────────────────────────
// Precisa ser handler (e não entrada do mapa estático) porque depois de
// classificar ou importar a lista MUDOU: um objeto congelado devolveria o
// catálogo de antes e a tela pareceria não ter salvado nada.
const catalogo: Handler = () => ok({ podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: true, itens });

// ── POST /api/estoque-itens/classificar ──────────────────────────────────────
const classificar: Handler = ({ metodo, corpo }) => {
  if (metodo !== "POST") return recusa(405, { error: "method_not_allowed" });
  const b = (corpo ?? {}) as Record<string, unknown>;
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map((v) => String(v ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return recusa(400, { error: "sem_itens", detalhe: "Nenhum item foi marcado." });
  // A MESMA guarda da rota: hierarquia fora do vocabulário é recusada aqui
  // também, senão a prova aceitaria o que a produção nega.
  if (!isHierarquia(b.hierarquia)) {
    return recusa(400, { error: "hierarquia_invalida", detalhe: "Escolha uma das oito hierarquias antes de classificar." });
  }
  const categoriaNova = b.categoria === undefined ? undefined : (b.categoria === null ? null : String(b.categoria).trim() || null);
  let atualizados = 0;
  for (const it of itens) {
    if (!ids.includes(it.id)) continue;
    it.hierarquia = String(b.hierarquia);
    if (categoriaNova !== undefined) it.categoria = categoriaNova;
    atualizados++;
  }
  return ok({ ok: true, atualizados });
};

// ── POST /api/estoque/importar ───────────────────────────────────────────────
const importar: Handler = ({ metodo, corpo }) => {
  if (metodo !== "POST") return recusa(405, { error: "method_not_allowed" });
  const b = (corpo ?? {}) as Record<string, unknown>;
  const texto = String(b.texto ?? "");
  if (!texto.trim()) return recusa(400, { error: "sem_texto", detalhe: "Cole a lista (ou escolha o arquivo) antes de conferir." });

  const leitura = lerPlanilha(texto);
  if (leitura.linhas.length === 0) {
    return recusa(400, {
      error: "sem_linhas",
      detalhe: "Não achei nenhuma linha com conteúdo. Cada linha é um item: nome, estoque, ponto de reposição, unidade, fornecedor.",
    });
  }
  const plano = planejarImportacao({ linhas: leitura.linhas, itens: paraPlanejador(), fornecedores, podeCriarFornecedor: true });
  const resumo = { comCabecalho: leitura.comCabecalho, colunas: leitura.colunas, separador: leitura.separador, linhas: leitura.linhas.length };

  if (!b.confirmar) return ok({ ok: true, aplicado: false, leitura: resumo, plano });

  // ── Grava (em memória) ─────────────────────────────────────────────────────
  const idPorFornecedor = new Map<string, string>(fornecedores.map((f) => [chaveDeFornecedor(f.nome), f.id]));
  let fornecedoresCriados = 0;
  for (const nome of plano.fornecedoresNovos) {
    const novo = { id: `ff${++sequencia}`, nome };
    fornecedores.push(novo);
    idPorFornecedor.set(chaveDeFornecedor(nome), novo.id);
    fornecedoresCriados++;
  }
  const idDoFornecedor = (nome: string | null) => (nome ? idPorFornecedor.get(chaveDeFornecedor(nome)) ?? null : null);

  let criados = 0;
  for (const n of plano.novos) {
    const c = n.escrita.campos;
    itens.push({
      id: `fi${++sequencia}`, nome: String(c.nome), hierarquia: null, categoria: null,
      produzido: false, serializado: false, imagem_url: null,
      unidade: String(c.unidade ?? "un"), quantidade: Number(c.quantidade ?? 0),
      qtd_minima: Number(c.qtd_minima ?? 0), ativo: true, custo: null, sku: null,
      estoque_ideal: null, fornecedor_id: idDoFornecedor(n.escrita.fornecedor), local_id: null, cor: null,
    });
    criados++;
  }

  let atualizados = 0;
  for (const a of plano.atualizados) {
    const alvo = itens.find((i) => i.id === a.id);
    if (!alvo) continue;
    const c = a.escrita.campos;
    if (c.quantidade !== undefined) alvo.quantidade = Number(c.quantidade);
    if (c.qtd_minima !== undefined) alvo.qtd_minima = Number(c.qtd_minima);
    if (c.unidade !== undefined) alvo.unidade = String(c.unidade);
    const fid = idDoFornecedor(a.escrita.fornecedor);
    if (fid) alvo.fornecedor_id = fid;
    atualizados++;
  }

  return ok({
    ok: true, aplicado: true, criados, atualizados, fornecedoresCriados,
    pulados: plano.pulados.length, falhas: [], leitura: resumo, plano,
  });
};

/**
 * A ORDEM importa, como no `REDE_ESTOQUE`: o casamento é por `startsWith` e
 * `/api/estoque-itens` é prefixo de `/api/estoque-itens/classificar`. A chave
 * mais genérica tem de vir por último.
 */
export const HANDLERS_ESTOQUE: Record<string, Handler> = {
  "/api/estoque-itens/classificar": classificar,
  "/api/estoque/importar": importar,
  "/api/estoque-itens": catalogo,
};
