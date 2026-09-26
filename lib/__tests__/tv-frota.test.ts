import { describe, it, expect } from "vitest";
import {
  comandoValido, precisaAtualizar, montarSync, TIPOS_COMANDO,
  type VersaoPublicada,
} from "@/lib/tv-frota";

/**
 * A fronteira da gestão remota da frota.
 *
 * Duas coisas que o teste existe pra travar: nenhum comando fora do conjunto
 * fechado passa (execução remota arbitrária é o que NÃO pode existir), e a
 * atualização só desce quando a versão publicada é MAIOR que a instalada
 * (senão a caixa entra em loop de baixar a mesma coisa).
 */

const pub: VersaoPublicada = {
  versionCode: 5, versionName: "1.5",
  url: "https://cdn/tv-1.5.apk", sha256: "abc", obrigatoria: false,
};

describe("comandoValido", () => {
  it("aceita os tipos do conjunto fechado", () => {
    // Cada tipo com os argumentos que ELE exige. `girar` sem graus e
    // `abrir_painel` sem alvo continuam sendo recusados — é o que os testes
    // abaixo cobrem.
    const argsDe: Record<string, Record<string, unknown>> = {
      abrir_painel: { painel: "producao" },
      girar: { graus: 90 },
    };
    for (const t of TIPOS_COMANDO) {
      expect(comandoValido(t, argsDe[t] ?? {})).not.toBeNull();
    }
  });

  it("abrir_painel aceita um PERFIL, não só o painel cru", () => {
    // Trocar a parede para um desenho publicado no ERP é o caso comum de quem
    // usa o console; sem isto seria preciso ir até a TV.
    expect(comandoValido("abrir_painel", { perfil: "p-comercial" }))
      .toEqual({ tipo: "abrir_painel", args: { perfil: "p-comercial" } });
  });

  it("girar só aceita as quatro posições de parede", () => {
    for (const g of [0, 90, 180, 270]) {
      expect(comandoValido("girar", { graus: g })).toEqual({ tipo: "girar", args: { graus: g } });
    }
    // Um giro arbitrário deixaria a TV numa posição que ninguém pediu e que
    // não corresponde a nenhuma forma de pendurar o aparelho.
    expect(comandoValido("girar", { graus: 45 })).toBeNull();
    expect(comandoValido("girar", {})).toBeNull();
  });

  it("recusa tipo desconhecido (nada de shell arbitrário)", () => {
    expect(comandoValido("rm -rf", {})).toBeNull();
    expect(comandoValido("shell", { cmd: "reboot" })).toBeNull();
    expect(comandoValido(42, {})).toBeNull();
  });

  it("abrir_painel exige um painel válido e descarta o resto", () => {
    expect(comandoValido("abrir_painel", { painel: "maquinas" })).toEqual({ tipo: "abrir_painel", args: { painel: "maquinas" } });
    expect(comandoValido("abrir_painel", { painel: "inexistente" })).toBeNull();
    expect(comandoValido("abrir_painel", {})).toBeNull();
  });

  it("comando sem argumento ignora lixo que venha junto", () => {
    expect(comandoValido("reiniciar", { qualquer: "coisa", cmd: "x" })).toEqual({ tipo: "reiniciar", args: {} });
  });
});

describe("precisaAtualizar", () => {
  it("atualiza só quando a publicada é MAIOR", () => {
    expect(precisaAtualizar(4, pub)).toBe(true);
    expect(precisaAtualizar(5, pub)).toBe(false);   // já está na versão
    expect(precisaAtualizar(6, pub)).toBe(false);   // instalado é mais novo — nunca "volta"
  });

  it("sem versão publicada, nunca atualiza", () => {
    expect(precisaAtualizar(4, null)).toBe(false);
  });

  it("caixa que não reportou versão recebe a atual", () => {
    expect(precisaAtualizar(NaN, pub)).toBe(true);
  });
});

describe("montarSync", () => {
  it("entrega a atualização e os comandos válidos, na ordem", () => {
    const r = montarSync(4, pub, [
      { id: "c1", tipo: "reiniciar", args: {} },
      { id: "c2", tipo: "abrir_painel", args: { painel: "logistica" } },
    ]);
    expect(r.atualizacao?.versionCode).toBe(5);
    expect(r.comandos.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("filtra comando inválido que por acaso esteja na fila", () => {
    const r = montarSync(5, pub, [
      { id: "ok", tipo: "logs", args: {} },
      { id: "ruim", tipo: "formatar", args: {} },
    ]);
    expect(r.atualizacao).toBeNull();       // já está em dia
    expect(r.comandos.map((c) => c.id)).toEqual(["ok"]);
  });

  it("caixa em dia e sem comando recebe resposta vazia (o tick comum volta vazio)", () => {
    const r = montarSync(5, pub, []);
    expect(r).toEqual({ atualizacao: null, comandos: [] });
  });
});
