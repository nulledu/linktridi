import { describe, expect, it } from "vitest";
import { mapJob, STATUS_PRO_BANCO } from "../tridimarket/notas";

// `lib/tridimarket/notas.ts` nasceu contra `public.market_worker_jobs` e foi
// migrado PELA METADE pra `mercadinho.worker_jobs`. As duas tabelas têm nomes
// diferentes pra quase tudo, e o meio-caminho quebrou o fluxo da nota em quatro
// lugares — todos silenciosos, todos só visíveis em produção:
//
//   • insert com `kind`/`unidade_id`/`image_path` → 42703, coluna inexistente;
//   • claim filtrando `status = 'queued'` depois de selecionar `'pendente'` →
//     o update não casa NUNCA e o worker nunca recebe job;
//   • `mapJob` lendo `result`/`error`/`attempts` → metade dos campos vazia;
//   • `completarJob` gravando `status = 'done'` → recusado pelo CHECK da
//     coluna, que só aceita 'pendente','processando','ok','erro'.
//
// O que este teste trava é a fronteira: o banco fala
// tipo/payload/resultado/erro/tentativas em português, o worker e a tela falam
// queued/processing/done em inglês, e a tradução tem que ser fiel nos dois
// sentidos.

// Linha como o Postgres devolve de `mercadinho.worker_jobs`.
const linhaDoBanco = {
  id: 42,
  tipo: "nota_ocr",
  status: "processando",
  payload: { profileId: "u-1", companyId: 4, imagePath: "u-1/123-abc.jpg", createdBy: "a-1" },
  resultado: { fonte: "ocr", itens: [{ nome: "Nutry cereal coco", quantidade: 2, precoUnitario: 1.9 }] },
  erro: null,
  tentativas: 1,
  criado_em: "2026-08-15T10:00:00Z",
  atualizado_em: "2026-08-15T10:01:00Z",
};

describe("fila da nota · fronteira entre o banco e o worker", () => {
  it("lê os campos que a tabela realmente tem", () => {
    const job = mapJob(linhaDoBanco);
    expect(job.id).toBe("42");
    expect(job.kind).toBe("nota_ocr");
    // `tentativas` → attempts, `resultado` → result, e o payload abre nos três.
    expect(job.attempts).toBe(1);
    expect(job.result?.itens[0].nome).toBe("Nutry cereal coco");
    expect(job.profileId).toBe("u-1");
    expect(job.companyId).toBe(4);
    expect(job.imagePath).toBe("u-1/123-abc.jpg");
    expect(job.createdAt).toBe("2026-08-15T10:00:00Z");
  });

  it("traduz o status do banco pro vocabulário do worker", () => {
    expect(mapJob({ ...linhaDoBanco, status: "pendente" }).status).toBe("queued");
    expect(mapJob({ ...linhaDoBanco, status: "processando" }).status).toBe("processing");
    expect(mapJob({ ...linhaDoBanco, status: "ok" }).status).toBe("done");
    expect(mapJob({ ...linhaDoBanco, status: "erro" }).status).toBe("error");
  });

  it("e de volta, sempre para um valor que o CHECK aceita", () => {
    const aceitos = new Set(["pendente", "processando", "ok", "erro"]);
    for (const v of Object.values(STATUS_PRO_BANCO)) {
      expect(aceitos.has(v), `"${v}" não passa no CHECK da coluna`).toBe(true);
    }
    // `confirmed` e `failed` existem só no vocabulário de fora: precisam cair
    // em algo válido, senão a devolução do worker é recusada.
    expect(STATUS_PRO_BANCO.confirmed).toBe("ok");
    expect(STATUS_PRO_BANCO.failed).toBe("erro");
  });

  it("job recém-criado, sem resultado nem payload, não explode", () => {
    const job = mapJob({ id: 7, tipo: "nota_ocr", status: "pendente", criado_em: "x", atualizado_em: "x" });
    expect(job.status).toBe("queued");
    expect(job.result).toBeNull();
    expect(job.profileId).toBeNull();
    expect(job.attempts).toBe(0);
  });
});
