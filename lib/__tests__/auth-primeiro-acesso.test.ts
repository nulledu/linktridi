import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { permiteCadastroAnonimoDeSenha } from "@/lib/auth-primeiro-acesso";

// O buraco que isto fecha: o login cadastrava a senha de QUEM DIGITASSE primeiro
// quando `password_set` era falso. Como username é o nome da pessoa, qualquer um
// adivinhava e entrava no ERP como ela. Havia 12 contas nesse estado em produção.
//
// Quem autoriza agora é um LINK gerado por admin. Aqui a trava é dupla: a regra
// diz não, e o código do login não pode ter o caminho de cadastro anônimo.

describe("cadastro anônimo de senha", () => {
  it("nunca é permitido", () => {
    expect(permiteCadastroAnonimoDeSenha()).toBe(false);
  });
});

describe("o login não cadastra senha por conta própria", () => {
  const login = readFileSync(join(process.cwd(), "app/api/auth/login/route.ts"), "utf8");

  it("não chama updateUserById com a senha digitada", () => {
    // Era esta chamada que transformava "adivinhei o usuário" em "tomei a conta".
    expect(login).not.toContain("updateUserById");
  });

  it("não tem mais o conceito de primeiro acesso no login", () => {
    expect(login).not.toContain("firstAccess");
  });
});
