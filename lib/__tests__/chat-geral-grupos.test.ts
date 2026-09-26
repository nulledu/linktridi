import { describe, it, expect } from "vitest";
import {
  eGeral, nomeDoGrupo, sugerirContatos, podeSairOuExcluir, GERAL,
} from "@/lib/chat/regras";
import type { Canal, Pessoa } from "@/lib/chat/tipos";

// ── Canal Geral ──────────────────────────────────────────────────────────────
// É o canal de TODO MUNDO: nasce sozinho, cada pessoa entra sozinha na primeira
// abertura e ninguém sai, arquiva ou exclui — se pudesse, o "chat geral" da
// empresa viraria "chat de quem lembrou de entrar".

function canal(p: Partial<Canal> = {}): Canal {
  return {
    id: "c1", tipo: "canal", nome: "x", descricao: null, topico: null, slug: null, avatar: null, cor: null,
    categoria_id: null, contexto_tipo: null, contexto_ref: null, privado: false, somente_leitura: false,
    arquivado: false, membros: 1, favorita: false, papel: "dono", notificar: "todas", mudo_ate: null,
    atualizado_em: "2026-09-01T00:00:00Z", ultima: null, nao_lidas: 0, mencoes: 0, ...p,
  };
}

describe("canal Geral", () => {
  it("é reconhecido pelo contexto de sistema, não pelo nome", () => {
    expect(eGeral(canal({ contexto_tipo: GERAL.contexto_tipo, contexto_ref: GERAL.contexto_ref, nome: "Qualquer" }))).toBe(true);
    expect(eGeral(canal({ nome: "Geral" }))).toBe(false);
    expect(eGeral(canal({ contexto_tipo: "modulo", contexto_ref: "geral" }))).toBe(false);
  });

  it("nem o dono sai, exclui ou arquiva o Geral", () => {
    const geral = canal({ contexto_tipo: "sistema", contexto_ref: "geral", papel: "dono" });
    expect(podeSairOuExcluir(geral)).toBe(false);
    expect(podeSairOuExcluir(canal({ papel: "membro" }))).toBe(true);
  });
});

// ── Grupo sem nome ───────────────────────────────────────────────────────────
// Grupo é conversa com mais gente: quem cria não quer inventar título. O nome
// vem dos participantes, como no WhatsApp antes de batizar o grupo.

describe("nomeDoGrupo", () => {
  it("junta os primeiros nomes dos OUTROS participantes", () => {
    expect(nomeDoGrupo(["Douglas Franco", "Letícia Valentim"])).toBe("Douglas e Letícia");
    expect(nomeDoGrupo(["Douglas Franco", "Letícia Valentim", "Davi"])).toBe("Douglas, Letícia e Davi");
  });
  it("satura em três nomes e conta o resto", () => {
    expect(nomeDoGrupo(["A B", "C D", "E F", "G H", "I J"])).toBe("A, C, E +2");
  });
  it("sem ninguém vira 'Grupo'", () => {
    expect(nomeDoGrupo([])).toBe("Grupo");
  });
});

// ── Sugestões de contato ─────────────────────────────────────────────────────
// Quem ainda não tem conversa direta comigo, o mesmo setor primeiro. Quem já
// tem conversa não é sugestão — já está na lista.

function pessoa(id: string, name: string, setor: string | null): Pessoa {
  return { id, name, setor, avatar: null };
}

describe("sugerirContatos", () => {
  const pessoas = [
    pessoa("p1", "Ana", "Marketing"),
    pessoa("p2", "Bruno", "Produção"),
    pessoa("p3", "Carla", "Marketing"),
    pessoa("p4", "Davi", null),
  ];
  const canais = [canal({ id: "d1", tipo: "direta", parceiro_id: "p1" })];

  it("exclui quem já tem conversa direta e põe o meu setor na frente", () => {
    const s = sugerirContatos(pessoas, canais, "Marketing", 10).map((p) => p.id);
    expect(s).toEqual(["p3", "p2", "p4"]);
  });

  it("respeita o limite", () => {
    expect(sugerirContatos(pessoas, canais, null, 2)).toHaveLength(2);
  });

  it("sem setor meu, ordem alfabética", () => {
    expect(sugerirContatos(pessoas, [], null, 10).map((p) => p.name)).toEqual(["Ana", "Bruno", "Carla", "Davi"]);
  });
});
