import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * A migração nasce sobre o Financeiro que já está em uso. PGlite garante que
 * as regras de unicidade, PL/pgSQL e a transação da RPC sejam as do Postgres.
 */
const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (arquivo: string) => readFileSync(join(RAIZ, "supabase", arquivo), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

const schemaBase = [
  sql("financeiro.sql"),
  sql("financeiro_fornecedor_completo.sql"),
  sql("financeiro_contato_banco_recorrencia.sql"),
  sql("financeiro_contato_empresa.sql"),
].join("\n");
const migracao = sql("financeiro_cadastro_unificado.sql");

const TRIDI = "00000000-0000-0000-0000-000000000001";
const GEDUX = "00000000-0000-0000-0000-000000000002";
const USER = "00000000-0000-0000-0000-000000000099";

let db: PGlite;

async function salvar(entrada: Record<string, unknown>) {
  const { rows } = await db.query<{ salvo: { contato_id: string; fornecedor_id: string | null } }>(
    "select public.fin_salvar_parte($1::jsonb, $2::uuid) as salvo",
    [JSON.stringify(entrada), USER],
  );
  return rows[0].salvo;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(schemaBase);
  await db.query(
    `insert into public.fin_empresas (id, slug, nome, ordem)
     values ($1, 'tridi-teste', 'Tridi teste', 101),
            ($2, 'gedux-teste', 'Gedux teste', 102)`,
    [TRIDI, GEDUX],
  );
});

describe("supabase/financeiro_cadastro_unificado.sql", () => {
  it("liga fornecedor a uma identidade sem fundir homônimos", async () => {
    await db.query(
      `insert into public.fin_fornecedores (id, empresa_id, nome, cnpj)
       values ('00000000-0000-0000-0000-000000000010', $1, 'Atlas', null),
              ('00000000-0000-0000-0000-000000000011', $1, 'Atlas', null)`,
      [TRIDI],
    );

    await db.exec(migracao);

    const { rows } = await db.query<{ n: number }>(
      "select count(distinct contato_id)::int as n from public.fin_fornecedores where nome = 'Atlas'",
    );
    expect(rows[0].n).toBe(2);
  }, 120_000);

  it("roda duas vezes sem trocar a identidade já vinculada", async () => {
    await db.query(
      "insert into public.fin_fornecedores (empresa_id, nome) values ($1, 'Madeira Boa')",
      [TRIDI],
    );
    await db.exec(migracao);
    const antes = await db.query<{ contato_id: string }>(
      "select contato_id from public.fin_fornecedores where nome = 'Madeira Boa'",
    );

    await expect(db.exec(migracao)).resolves.toBeTruthy();

    const depois = await db.query<{ contato_id: string }>(
      "select contato_id from public.fin_fornecedores where nome = 'Madeira Boa'",
    );
    expect(depois.rows[0].contato_id).toBe(antes.rows[0].contato_id);
  }, 120_000);

  it("usa CNPJ normalizado para ligar uma identidade inequívoca", async () => {
    await db.exec(migracao);
    const { rows: contato } = await db.query<{ id: string }>(
      `insert into public.fin_contatos (empresa_id, nome, cnpj, papeis)
       values ($1, 'Aço Atlas', '12345678000199', array['parceiro']::text[])
       returning id`,
      [TRIDI],
    );
    await db.query(
      "insert into public.fin_fornecedores (empresa_id, nome, cnpj) values ($1, 'Atlas Aços', '12.345.678/0001-99')",
      [TRIDI],
    );

    await db.exec(migracao);

    const { rows } = await db.query<{ contato_id: string; papeis: string[] }>(
      `select f.contato_id, c.papeis from public.fin_fornecedores f
        join public.fin_contatos c on c.id = f.contato_id
       where f.nome = 'Atlas Aços'`,
    );
    expect(rows[0].contato_id).toBe(contato[0].id);
    expect(rows[0].papeis).toContain("fornecedor");
  }, 120_000);

  it("normaliza CNPJ e recusa a segunda identidade da mesma empresa", async () => {
    await db.exec(migracao);
    await salvar({
      empresa_id: TRIDI,
      nome: "Atlas Comércio",
      natureza: "empresa",
      papeis: ["fornecedor"],
      cnpj: "12.345.678/0001-99",
      fornecedor: { prazo_dias: 30 },
    });

    await expect(salvar({
      empresa_id: TRIDI,
      nome: "Atlas repetida",
      natureza: "empresa",
      papeis: ["fornecedor"],
      cnpj: "12345678000199",
      fornecedor: { prazo_dias: 15 },
    })).rejects.toThrow();
  }, 120_000);

  it("recusa natureza fora de pessoa ou empresa em escrita direta", async () => {
    await db.exec(migracao);

    await expect(db.query(
      "insert into public.fin_contatos (empresa_id, nome, natureza) values ($1, 'Inválido', 'associacao')",
      [TRIDI],
    )).rejects.toThrow();
  }, 120_000);

  it("persiste organização textual e cargo canônicos na criação e edição", async () => {
    await db.exec(migracao);
    const salvo = await salvar({
      empresa_id: TRIDI,
      nome: "Ana Compras",
      natureza: "pessoa",
      papeis: ["contato"],
      organizacao: "Atlas antiga",
      cargo: "Compradora",
    });

    const criado = await db.query<{ organizacao: string | null; cargo: string | null }>(
      "select organizacao, cargo from public.fin_contatos where id = $1",
      [salvo.contato_id],
    );
    expect(criado.rows[0]).toEqual({ organizacao: "Atlas antiga", cargo: "Compradora" });

    await salvar({
      id: salvo.contato_id,
      empresa_id: TRIDI,
      nome: "Ana Compras",
      natureza: "pessoa",
      papeis: ["contato"],
      organizacao: "Atlas nova",
      cargo: "Gerente de compras",
    });

    const { rows } = await db.query<{ organizacao: string | null; cargo: string | null }>(
      "select organizacao, cargo from public.fin_contatos where id = $1",
      [salvo.contato_id],
    );
    expect(rows[0]).toEqual({ organizacao: "Atlas nova", cargo: "Gerente de compras" });
  }, 120_000);

  it("sincroniza os espelhos legados do fornecedor na criação e edição canônicas", async () => {
    await db.exec(migracao);
    const salvo = await salvar({
      empresa_id: TRIDI,
      nome: "Casa Nova",
      natureza: "empresa",
      papeis: ["fornecedor"],
      categorias: ["Ferragens", "Insumos"],
      telefones: ["(14) 3333-4444", "(14) 3333-5555"],
      email: "compras@casanova.test",
      site: "https://casanova.test",
      endereco: "Rua Um, 10",
      observacao: "Recebe de manhã",
      fornecedor: { contato_nome: "Ana", cidade: "Bauru", uf: "SP" },
    });

    const lerEspelhos = () => db.query<{
      categoria: string | null; categorias: string[] | null;
      contato_nome: string | null; contato_email: string | null; contato_fone: string | null;
      whatsapp: string | null; site: string | null; endereco: string | null;
      observacao: string | null; cidade: string | null; uf: string | null; ativo: boolean;
    }>(
      `select categoria, categorias, contato_nome, contato_email, contato_fone,
              whatsapp, site, endereco, observacao, cidade, uf, ativo
         from public.fin_fornecedores where contato_id = $1`,
      [salvo.contato_id],
    );

    expect((await lerEspelhos()).rows[0]).toEqual({
      categoria: "Ferragens",
      categorias: ["Ferragens", "Insumos"],
      contato_nome: "Ana",
      contato_email: "compras@casanova.test",
      contato_fone: "(14) 3333-4444",
      whatsapp: "(14) 3333-4444",
      site: "https://casanova.test",
      endereco: "Rua Um, 10",
      observacao: "Recebe de manhã",
      cidade: "Bauru",
      uf: "SP",
      ativo: true,
    });

    await salvar({
      id: salvo.contato_id,
      empresa_id: TRIDI,
      nome: "Casa Nova",
      natureza: "empresa",
      papeis: ["fornecedor"],
      categorias: ["Máquinas"],
      telefones: ["(14) 4444-5555"],
      email: "financeiro@casanova.test",
      site: "https://nova.casanova.test",
      endereco: "Rua Dois, 20",
      observacao: "Recebe à tarde",
      fornecedor: {
        id: salvo.fornecedor_id,
        contato_nome: "Bia",
        cidade: "Marília",
        uf: "SP",
      },
    });

    expect((await lerEspelhos()).rows[0]).toEqual({
      categoria: "Máquinas",
      categorias: ["Máquinas"],
      contato_nome: "Bia",
      contato_email: "financeiro@casanova.test",
      contato_fone: "(14) 4444-5555",
      whatsapp: "(14) 4444-5555",
      site: "https://nova.casanova.test",
      endereco: "Rua Dois, 20",
      observacao: "Recebe à tarde",
      cidade: "Marília",
      uf: "SP",
      ativo: true,
    });

    await salvar({
      id: salvo.contato_id,
      empresa_id: TRIDI,
      nome: "Casa Nova",
      natureza: "empresa",
      papeis: ["parceiro"],
      categorias: ["Serviços"],
      telefones: ["(14) 5555-6666"],
      email: "contato@casanova.test",
      site: "https://parceira.casanova.test",
      endereco: "Rua Três, 30",
      observacao: "Cadastro sem fornecimento ativo",
    });

    expect((await lerEspelhos()).rows[0]).toEqual({
      categoria: "Serviços",
      categorias: ["Serviços"],
      contato_nome: "Bia",
      contato_email: "contato@casanova.test",
      contato_fone: "(14) 5555-6666",
      whatsapp: "(14) 5555-6666",
      site: "https://parceira.casanova.test",
      endereco: "Rua Três, 30",
      observacao: "Cadastro sem fornecimento ativo",
      cidade: "Marília",
      uf: "SP",
      ativo: false,
    });
  }, 120_000);

  it("espelha o status canônico ao criar, inativar e reativar mantendo o papel", async () => {
    await db.exec(migracao);
    const salvo = await salvar({
      empresa_id: TRIDI,
      nome: "Fornecedor sazonal",
      natureza: "empresa",
      papeis: ["fornecedor"],
      ativo: false,
      fornecedor: { prazo_dias: 15 },
    });

    const lerStatus = async () => (await db.query<{
      contato_ativo: boolean; fornecedor_ativo: boolean; papeis: string[];
    }>(
      `select c.ativo as contato_ativo, f.ativo as fornecedor_ativo, c.papeis
         from public.fin_contatos c
         join public.fin_fornecedores f on f.contato_id = c.id
        where c.id = $1`,
      [salvo.contato_id],
    )).rows[0];

    expect(await lerStatus()).toEqual({
      contato_ativo: false, fornecedor_ativo: false, papeis: ["fornecedor"],
    });

    for (const ativo of [true, false, true]) {
      await salvar({
        id: salvo.contato_id,
        empresa_id: TRIDI,
        nome: "Fornecedor sazonal",
        natureza: "empresa",
        papeis: ["fornecedor"],
        ativo,
        fornecedor: { id: salvo.fornecedor_id, prazo_dias: 15 },
      });
      expect(await lerStatus()).toEqual({
        contato_ativo: ativo, fornecedor_ativo: ativo, papeis: ["fornecedor"],
      });
    }
  }, 120_000);

  it("leva os dados compartilhados do adaptador legado para a identidade", async () => {
    await db.exec(migracao);
    const salvo = await salvar({
      empresa_id: TRIDI,
      nome: "Ferragens Aurora",
      natureza: "empresa",
      papeis: ["fornecedor"],
      fornecedor: {
        categoria: "Ferragens",
        contato_fone: "(14) 99999-1111",
        contato_email: "compras@aurora.test",
        endereco: "Rua das Chapas, 10",
        site: "https://aurora.test",
        pix_chave: "pix-aurora",
      },
    });

    const { rows } = await db.query<{
      telefone: string | null; email: string | null; endereco: string | null; site: string | null;
      pix_chave: string | null;
    }>(
      `select c.telefone, c.email, c.endereco, c.site, f.pix_chave
         from public.fin_contatos c
         join public.fin_fornecedores f on f.contato_id = c.id
        where c.id = $1`,
      [salvo.contato_id],
    );
    expect(rows[0]).toMatchObject({
      telefone: "(14) 99999-1111",
      email: "compras@aurora.test",
      endereco: "Rua das Chapas, 10",
      site: "https://aurora.test",
      pix_chave: "pix-aurora",
    });
  }, 120_000);

  it("desfaz a identidade quando a extensão aponta para outra empresa", async () => {
    await db.exec(migracao);
    await db.query(
      `insert into public.fin_fornecedores (id, empresa_id, nome)
       values ('00000000-0000-0000-0000-000000000020', $1, 'Fornecedor Gedux')`,
      [GEDUX],
    );

    await expect(salvar({
      empresa_id: TRIDI,
      nome: "Não pode sobrar",
      natureza: "empresa",
      papeis: ["fornecedor"],
      fornecedor: { id: "00000000-0000-0000-0000-000000000020" },
    })).rejects.toThrow(/outra empresa/);

    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fin_contatos where nome = 'Não pode sobrar'",
    );
    expect(rows[0].n).toBe(0);
  }, 120_000);
});
