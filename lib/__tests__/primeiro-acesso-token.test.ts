import { describe, expect, it } from "vitest";
import {
  avaliarLink, gerarTokenPrimeiroAcesso, hashConfere, hashDoToken, montarLink,
  normalizarEmailEscolhido, senhaAceitavel, tokenTemFormato, validarUsuarioEscolhido,
  VALIDADE_LINK_DIAS,
} from "@/lib/primeiro-acesso-token";
import { ehSuperusuario } from "@/lib/superusuario";

// O link substitui o "digite qualquer senha e ela vira a sua". O que estes
// testes guardam é o que torna a troca segura: o segredo é o LINK (não o nome de
// usuário), o banco nunca guarda o token em claro, e o link vale uma vez só.

const AGORA = new Date("2026-08-13T12:00:00Z");
const daquiA = (h: number) => new Date(AGORA.getTime() + h * 3600 * 1000).toISOString();
const atras = (h: number) => new Date(AGORA.getTime() - h * 3600 * 1000).toISOString();

describe("gerarTokenPrimeiroAcesso", () => {
  it("gera token imprevisível e nunca repete", () => {
    const a = gerarTokenPrimeiroAcesso(AGORA);
    const b = gerarTokenPrimeiroAcesso(AGORA);
    expect(a.token).not.toBe(b.token);
    expect(tokenTemFormato(a.token)).toBe(true);
  });

  it("guarda o HASH, nunca o token — vazar a tabela não entrega link nenhum", () => {
    const { token, hash } = gerarTokenPrimeiroAcesso(AGORA);
    expect(hash).not.toContain(token);
    expect(hash).toBe(hashDoToken(token));
    expect(hash).toHaveLength(64);   // sha256 hex
  });

  it("vence em 14 dias", () => {
    const { expiraEm } = gerarTokenPrimeiroAcesso(AGORA);
    expect(expiraEm).toBe(daquiA(VALIDADE_LINK_DIAS * 24));
  });
});

describe("tokenTemFormato", () => {
  it("aceita o formato gerado e rejeita lixo (não gasta consulta ao banco)", () => {
    expect(tokenTemFormato(gerarTokenPrimeiroAcesso(AGORA).token)).toBe(true);
    for (const mau of ["", "curto", null, undefined, 123, "a".repeat(200), "tem espaço aqui!"]) {
      expect(tokenTemFormato(mau)).toBe(false);
    }
  });
});

describe("avaliarLink", () => {
  const bom = {
    primeiro_acesso_token_hash: "abc",
    primeiro_acesso_expira_em: daquiA(48),
    primeiro_acesso_usado_em: null,
  };

  it("link novo vale", () => {
    expect(avaliarLink(bom, AGORA)).toEqual({ valido: true });
  });

  it("USO ÚNICO: link já usado não vale de novo", () => {
    const usado = { ...bom, primeiro_acesso_usado_em: atras(1) };
    expect(avaliarLink(usado, AGORA)).toEqual({ valido: false, motivo: "ja_usado" });
  });

  it("link vencido não vale", () => {
    expect(avaliarLink({ ...bom, primeiro_acesso_expira_em: atras(1) }, AGORA))
      .toEqual({ valido: false, motivo: "expirado" });
  });

  it("sem link gerado não vale — conta pendente NÃO é conta aberta", () => {
    // É o coração da correção: dezenas de contas podem ficar pendentes por meses
    // sem que nenhuma delas seja reivindicável.
    expect(avaliarLink({ primeiro_acesso_token_hash: null }, AGORA))
      .toEqual({ valido: false, motivo: "nao_encontrado" });
    expect(avaliarLink(null, AGORA)).toEqual({ valido: false, motivo: "nao_encontrado" });
  });

  it("sem prazo gravado é tratado como vencido, nunca como válido", () => {
    expect(avaliarLink({ ...bom, primeiro_acesso_expira_em: null }, AGORA).valido).toBe(false);
    expect(avaliarLink({ ...bom, primeiro_acesso_expira_em: "não é data" }, AGORA).valido).toBe(false);
  });
});

describe("hashConfere", () => {
  it("compara certo e rejeita diferente", () => {
    const h = hashDoToken("x");
    expect(hashConfere(h, h)).toBe(true);
    expect(hashConfere(h, hashDoToken("y"))).toBe(false);
    expect(hashConfere(h, "curto")).toBe(false);
  });
});

describe("senhaAceitavel", () => {
  it("exige 8 caracteres — o mesmo piso da troca voluntária", () => {
    expect(senhaAceitavel("12345678")).toBe(true);
    expect(senhaAceitavel("1234567")).toBe(false);
    expect(senhaAceitavel(null)).toBe(false);
  });
});

describe("validarUsuarioEscolhido", () => {
  const reservado = (u: string) => ehSuperusuario(null, u);

  it("BLOQUEIA username de superusuário — senão o 1º acesso vira tomada do sistema", () => {
    // ehSuperusuario casa por USERNAME (lib/superusuario.ts). Sem esta trava,
    // digitar "caio" na própria tela de primeiro acesso daria acesso a tudo.
    const r = validarUsuarioEscolhido("caio", reservado);
    expect(r.ok).toBe(false);
    expect(r).toEqual({ ok: false, motivo: "reservado" });
    // E não adianta disfarçar com maiúscula/acento/pontuação.
    expect(validarUsuarioEscolhido("CAIO", reservado).ok).toBe(false);
    expect(validarUsuarioEscolhido(" caio ", reservado).ok).toBe(false);
  });

  it("aceita usuário comum e normaliza", () => {
    expect(validarUsuarioEscolhido("João Vitor", reservado)).toEqual({ ok: true, valor: "joaovitor" });
    expect(validarUsuarioEscolhido("maria.silva", reservado)).toEqual({ ok: true, valor: "maria.silva" });
  });

  it("recusa usuário curto demais", () => {
    expect(validarUsuarioEscolhido("ab", reservado)).toEqual({ ok: false, motivo: "curto" });
    expect(validarUsuarioEscolhido("!!!", reservado).ok).toBe(false);
  });
});

describe("normalizarEmailEscolhido", () => {
  it("aceita e-mail real e deixa minúsculo", () => {
    expect(normalizarEmailEscolhido(" Ana@Tridixp.com.BR ")).toEqual({ ok: true, valor: "ana@tridixp.com.br" });
  });
  it("vazio é válido — o campo é opcional", () => {
    expect(normalizarEmailEscolhido("  ")).toEqual({ ok: true, valor: null });
  });
  it("recusa formato inválido e o domínio sintético", () => {
    expect(normalizarEmailEscolhido("nao-e-email").ok).toBe(false);
    // Aceitar @tridi.local faria a pessoa achar que tem recuperação por e-mail.
    expect(normalizarEmailEscolhido("joao@tridi.local").ok).toBe(false);
  });
});

describe("montarLink", () => {
  it("usa a origem da requisição e não duplica barra", () => {
    expect(montarLink("https://x.com", "tok")).toBe("https://x.com/primeiro-acesso?t=tok");
    expect(montarLink("https://x.com/", "tok")).toBe("https://x.com/primeiro-acesso?t=tok");
  });
});
