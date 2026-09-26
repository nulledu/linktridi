import { describe, it, expect, vi } from "vitest";
import { lerConfig, salvarConfig } from "@/lib/estoque-automacao";

/**
 * O interruptor que exige o bipe do material pra abrir a atividade.
 *
 * Ele nasceu por SQL: quem o construiu não era dono da tela do Estoque, então a
 * única forma de ligá-lo era um UPDATE à mão. Este arquivo trava o caminho que
 * fecha esse buraco — e, mais importante, o que acontece enquanto a coluna
 * ainda NÃO existe no banco, que é o estado de hoje (supabase/
 * atividades_bipe_material.sql não foi rodado).
 *
 * A regra que importa: **ausente é DESLIGADO**. Ligado sem etiqueta no material
 * tranca a bancada inteira atrás de um bipe impossível — 24 pessoas paradas por
 * causa de um default. Desligado por engano só significa que o livro fica vazio
 * até alguém ligar.
 */

/** Banco falso: `respostas` é a fila que cada `await` na cadeia consome. */
function fakeDb(respostas: { data?: unknown; error?: { message: string } | null }[]) {
  const usadas: string[] = [];
  const from = () => {
    const alvo: Record<string, unknown> = {};
    for (const m of ["select", "eq", "maybeSingle", "upsert"]) {
      alvo[m] = (arg?: unknown) => {
        if (m === "select" && typeof arg === "string") usadas.push(arg);
        return alvo;
      };
    }
    (alvo as { then: unknown }).then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(respostas.shift() ?? { data: null, error: null }).then(ok);
    return alvo;
  };
  return { db: { from } as never, usadas };
}

const SEM_COLUNA = { message: `column estoque_config.bipe_para_iniciar does not exist` };
const SEM_TABELA = { message: `relation "public.estoque_config" does not exist` };

describe("interruptor do bipe: ausente é desligado", () => {
  it("com a coluna no banco, lê o valor de lá", async () => {
    const { db } = fakeDb([
      { data: { automacao_ativa: true, ultima_varredura: null, bipe_para_iniciar: true }, error: null },
    ]);
    expect((await lerConfig(db)).bipe_para_iniciar).toBe(true);
  });

  it("SEM a coluna (o estado de hoje), relê sem ela e devolve DESLIGADO", async () => {
    // Duas respostas: a primeira falha por coluna ausente, a segunda é o SELECT
    // reduzido. O que se prova aqui é que a automação NÃO se perde no caminho —
    // ela funciona há semanas e não pode cair por causa de um campo novo.
    const { db, usadas } = fakeDb([
      { data: null, error: SEM_COLUNA },
      { data: { automacao_ativa: true, ultima_varredura: "2026-08-10" }, error: null },
    ]);
    const c = await lerConfig(db);

    expect(c.bipe_para_iniciar).toBe(false);
    expect(c.automacao_ativa).toBe(true);          // o irmão sobreviveu
    expect(c.ultima_varredura).toBe("2026-08-10");
    // O segundo SELECT tem de ser o REDUZIDO: repetir o mesmo pediria a coluna
    // inexistente de novo e falharia igual, num laço silencioso.
    expect(usadas[1]).not.toContain("bipe_para_iniciar");
  });

  it("sem a TABELA inteira devolve o padrão, sem estourar a tela", async () => {
    const { db } = fakeDb([{ data: null, error: SEM_TABELA }]);
    const c = await lerConfig(db);
    expect(c).toEqual({ automacao_ativa: false, ultima_varredura: null, bipe_para_iniciar: false });
  });

  it("gravar só o bipe NÃO apaga a automação", async () => {
    // O upsert manda apenas o que veio no patch. Se ele mandasse o objeto
    // inteiro com os campos ausentes como `false`, ligar o bipe DESLIGARIA a
    // automação de reposição — e ninguém ligaria uma coisa na outra.
    const gravado: Record<string, unknown>[] = [];
    const db = {
      from: () => {
        const alvo: Record<string, unknown> = {};
        for (const m of ["select", "eq", "maybeSingle"]) alvo[m] = () => alvo;
        alvo.upsert = (row: Record<string, unknown>) => { gravado.push(row); return alvo; };
        (alvo as { then: unknown }).then = (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: { automacao_ativa: true, ultima_varredura: null, bipe_para_iniciar: true }, error: null }).then(ok);
        return alvo;
      },
    } as never;

    await salvarConfig(db, { bipe_para_iniciar: true }, "quem-ligou");
    expect(gravado[0]).toHaveProperty("bipe_para_iniciar", true);
    expect(gravado[0]).not.toHaveProperty("automacao_ativa");
    // Auditoria: "quem ligou isso" é a primeira pergunta quando a bancada trava.
    expect(gravado[0]).toHaveProperty("atualizado_por", "quem-ligou");
  });
});
