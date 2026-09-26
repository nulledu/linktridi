import { describe, expect, it } from "vitest";
import {
  ehFaixa, entradasDaVisao, faixaDoSetor, gruposPorHierarquia, itensComONome, limparGrupos, opcoesDoItem,
  pessoasDoSetor, produtoDoModelo, relacionadasAoItem, resumoDoGrupo, setorDoPool, setoresDisponiveis, podeReceberAtividade,
} from "../atividades-lancador";
import { LABEL_PRODUTO, PRODUTOS } from "../producao-receita";
import type { Atividade, Colaborador } from "../atividades-catalog";
import type { ItemDaVisao } from "../atividades-visao";

// O pop-up da Visão geral (pedido do dono, 11/09/2026): Carimbo › Puxador ›
// "Cortar peças do puxador" (Máquinas) ou "Montar puxador" (Produção); o setor
// vem marcado e aparecem as pessoas dele — com a MESMA régua do pool do tablet.

const GENTE: Colaborador[] = [
  { id: "davi", nome: "Davi", setor: "Produção", especialidade: "Máquinas" },
  { id: "mikael", nome: "Mikael", setor: "Produção", especialidade: "Carimbo" },
  { id: "joao", nome: "João", setor: "Produção", especialidade: "Preparo" },
  // Como está no cadastro de verdade: setor Produção, departamento Logística.
  { id: "felipe", nome: "Felipe", setor: "Produção", departamento: "Logística", especialidade: null },
  { id: "henrique", nome: "Henrique", setor: "Produção", departamento: "Logística", especialidade: null },
  { id: "carla", nome: "Carla", setor: "Logística", especialidade: null },
];

const item = (p: Partial<ItemDaVisao>): ItemDaVisao => ({
  id: "i1", nome: "Puxador", categoria: "Puxadores", hierarquia: "componente", imagem_url: null,
  quantidade: 3, qtd_minima: 10, unidade: "un", setor_responsavel: null, ...p,
});

describe("setor e pessoas", () => {
  it("as três faixas da produção vêm primeiro, depois os outros setores do cadastro", () => {
    expect(setoresDisponiveis(GENTE)).toEqual(["Máquinas", "Produção", "Preparo", "Logística"]);
    expect(faixaDoSetor("Máquinas")).toBe("maquinas");
    expect(faixaDoSetor("Logística")).toBeNull();
  });

  it("cada setor mostra só quem o tablet deixaria pegar", () => {
    const nomes = (s: string) => pessoasDoSetor(GENTE, s).map((c) => c.nome);
    expect(nomes("Máquinas")).toEqual(["Davi"]);
    expect(nomes("Produção")).toEqual(["Mikael"]);        // Felipe fica fora: sem especialidade
    expect(nomes("Preparo")).toEqual(["João"]);
    expect(nomes("Logística")).toEqual(["Carla", "Felipe", "Henrique"]);
  });

  it("a Logística aparece na escolha mesmo quando só o departamento diz Logística", () => {
    // Era o defeito: ninguém tinha SETOR Logística, e a opção sumia do pop-up.
    const soDepartamento = GENTE.filter((c) => c.id !== "carla");
    expect(setoresDisponiveis(soDepartamento)).toEqual(["Máquinas", "Produção", "Preparo", "Logística"]);
    expect(pessoasDoSetor(soDepartamento, "Logística").map((c) => c.nome)).toEqual(["Felipe", "Henrique"]);
    // Outros setores NÃO recebem atividade (decisão de 23/09/2026).
    expect(setoresDisponiveis([...soDepartamento, { id: "a", nome: "Ana", setor: "Administrativo" }]))
      .toEqual(["Máquinas", "Produção", "Preparo", "Logística"]);
  });

  it("só Produção (e faixas) e Logística podem receber — a régua das rotas", () => {
    expect(podeReceberAtividade({ setor: "Produção" })).toBe(true);
    expect(podeReceberAtividade({ setor: "Máquinas" })).toBe(true);
    expect(podeReceberAtividade({ setor: "Produção", departamento: "Logística" })).toBe(true);
    expect(podeReceberAtividade({ setor: null, departamento: "Logística" })).toBe(true);
    expect(podeReceberAtividade({ setor: "Marketing", departamento: "Marketing" })).toBe(false);
    expect(podeReceberAtividade({ setor: "Administrativo" })).toBe(false);
    expect(podeReceberAtividade({})).toBe(false);
  });

  it("o pool das faixas mora no setor Produção; os outros usam o próprio nome", () => {
    expect(setorDoPool("Máquinas")).toBe("Produção");
    expect(setorDoPool("Logística")).toBe("Logística");
    expect(ehFaixa("maquinas")).toBe(true);
    expect(ehFaixa("Máquinas")).toBe(false);
  });
});

describe("as atividades possíveis de um item", () => {
  it("as criadas pro item primeiro, cada uma com o seu setor, e o Produzir com o setor do item", () => {
    const o = opcoesDoItem(item({ setor_responsavel: "Máquinas" }), [
      { id: "b", item_id: "i1", nome: "Montar puxador", setor: "Produção", ordem: 1 },
      { id: "a", item_id: "i1", nome: "Cortar peças do puxador", setor: "Máquinas", ordem: 0 },
    ], []);
    expect(o.map((x) => [x.nome, x.setor, x.produz])).toEqual([
      ["Cortar peças do puxador", "Máquinas", false],
      ["Montar puxador", "Produção", false],
      ["Produzir Puxador", "Máquinas", true],
    ]);
  });

  it("nome repetido entra uma vez (a criada vence)", () => {
    const o = opcoesDoItem(item({}), [{ id: "x", item_id: "i1", nome: "produzir puxador", setor: "Preparo", ordem: 0 }], []);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ origem: "salva", setor: "Preparo" });
  });

  it("produto de modelo (Carimbos) mostra as etapas do modelo, sem Produzir", () => {
    const p = PRODUTOS.find((k) => LABEL_PRODUTO[k].toLowerCase().startsWith("carimbo"))!;
    const carimbo = item({ nome: "Carimbo", categoria: LABEL_PRODUTO[p], hierarquia: "produto" });
    expect(produtoDoModelo(carimbo)).toBe(p);
    const o = opcoesDoItem(carimbo, [], [
      { produto: p, fase: 2, tarefa: "Montar carimbo" },
      { produto: p, fase: 1, tarefa: "Preparar chapa" },
      { produto: "outro", fase: 1, tarefa: "Não é daqui" },
    ]);
    expect(o.map((x) => [x.nome, x.setor, x.fase])).toEqual([["Preparar chapa", "Preparo", 1], ["Montar carimbo", "Produção", 2]]);
  });
});

describe("o que já está rolando com o item", () => {
  const at = (p: Partial<Atividade>): Atividade => ({
    id: Math.random().toString(36).slice(2), categoria: "Geral", tarefa: "x", detalhe: null, para_id: null, para_nome: null,
    por_id: "x", por_nome: "x", status: "pendente", prazo: null, quantidade_alvo: 1, quantidade_feita: 0,
    tempo_estimado_min: null, iniciada_at: null, produto_id: null, produto_nome: null, estoque_lancado: false,
    created_at: "2026-09-10T10:00:00Z", concluida_at: null, foto_url: null, ...p,
  });
  it("pelo produto, pela categoria e pelas opções; aberto antes de concluído", () => {
    const r = relacionadasAoItem([
      at({ tarefa: "feita", produto_nome: "Puxador", status: "concluida", created_at: "2026-09-11T10:00:00Z" }),
      at({ tarefa: "da categoria", categoria: "puxador" }),
      at({ tarefa: "Cortar peças do puxador" }),
      at({ tarefa: "de outro item", produto_nome: "Chapa" }),
    ], "Puxador", ["Cortar peças do puxador"]);
    expect(r.map((a) => a.tarefa)).toEqual(["da categoria", "Cortar peças do puxador", "feita"]);
  });
});

describe("categorias criadas à mão (Almofada com os tamanhos dentro)", () => {
  const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const alm = (n: number, p: Partial<ItemDaVisao>) => item({ id: U(n), nome: `Almofada ${n}`, hierarquia: "produto", ...p });

  it("a categoria vira UM cartão e os itens dela saem da lista solta", () => {
    const itens = [alm(11, {}), alm(16, {}), item({ id: U(99), nome: "Chapa EVA", hierarquia: "mp_processada" })];
    const e = entradasDaVisao(itens, [{ id: "g1", nome: "Almofada", itens: [U(11), U(16)] }]);
    expect(e.map((x) => [x.tipo, x.nome])).toEqual([["grupo", "Almofada"], ["item", "Chapa EVA"]]);
    expect(e[0]).toMatchObject({ hierarquia: "produto" });
  });

  it("categoria sem item ativo some; item em duas categorias aparece nas duas", () => {
    const itens = [alm(11, {})];
    const e = entradasDaVisao(itens, [
      { id: "vazia", nome: "Sumiu", itens: [U(50)] },
      { id: "a", nome: "Almofada", itens: [U(11)] },
      { id: "b", nome: "Quadradas", itens: [U(11)] },
    ]);
    expect(e.map((x) => x.nome)).toEqual(["Almofada", "Quadradas"]);
  });

  it("o resumo mostra o pior selo de dentro e soma o saldo só com a mesma unidade", () => {
    expect(resumoDoGrupo([alm(11, { quantidade: 141, qtd_minima: 30 }), alm(22, { quantidade: 0, qtd_minima: 5 })]))
      .toEqual({ pior: "sem_estoque", quantos: 1, saldo: 141, unidade: "un" });
    expect(resumoDoGrupo([alm(11, { quantidade: 10, qtd_minima: 20 }), alm(16, { quantidade: 5, qtd_minima: 0, unidade: "cx" })]))
      .toMatchObject({ pior: "no_minimo", quantos: 1, saldo: null });
    expect(resumoDoGrupo([alm(11, { quantidade: 40, qtd_minima: 20 })])).toMatchObject({ pior: "em_estoque", quantos: 1, saldo: 40 });
  });

  it("o atalho do nome pega plural, caixa e acento", () => {
    const cat = [{ nome: "Almofadas 22x22" }, { nome: "almofada 11" }, { nome: "Chapa" }];
    expect(itensComONome(cat, "Almofada").map((i) => i.nome)).toEqual(["Almofadas 22x22", "almofada 11"]);
    expect(itensComONome(cat, "a")).toEqual([]);
  });

  it("o que vem do banco ou do corpo é limpo: sem nome, sem id ou com uuid inválido sai", () => {
    expect(limparGrupos([
      { id: "g1", nome: "  Almofada  ", itens: [U(1), U(1), "lixo", 3] },
      { id: "g2", nome: "", itens: [] },
      { id: "g1", nome: "Duplicada", itens: [] },
      "nada",
    ])).toEqual([{ id: "g1", nome: "Almofada", itens: [U(1)] }]);
    expect(limparGrupos(null)).toEqual([]);
  });
});

describe("grupos da seção", () => {
  it("produtos, depois componentes, peças, matérias-primas… e o resto em Outros", () => {
    const g = gruposPorHierarquia([
      { nome: "Chapa", hierarquia: "mp_processada" }, { nome: "Carimbo", hierarquia: "produto" },
      { nome: "Puxador", hierarquia: "componente" }, { nome: "Sem tipo", hierarquia: null },
    ]);
    expect(g.map((x) => x.rotulo)).toEqual(["Produtos", "Componentes", "Matérias-primas processadas", "Outros"]);
  });
});
