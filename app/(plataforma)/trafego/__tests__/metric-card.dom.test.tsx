import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MetricCard, TamanhoDoCard } from "../TfKit";

/**
 * O card de métrica numa casa M/G quando a série NÃO dá curva.
 *
 * O caso que escapou: o banco de provas sempre tem 14 dias de série, então o
 * card grande sempre tinha curva — e a exigência `temSpark` no branch parecia
 * inofensiva. Em produção, no primeiro período de UM dia (hoje), um ponto não
 * desenha linha, todo card M caía no layout compacto dentro de uma caixa dupla
 * e o painel amanheceu cheio de vãos. A captura do dono era isto.
 *
 * A regra: a casa decide o layout, a série decide só se HÁ curva. Sem curva o
 * número assume a caixa (`data-so-numero`), com rótulo, apoio e comparação —
 * nunca um card compacto boiando num canto de caixa dupla.
 */

const dentroDeM = (ui: React.ReactElement) =>
  render(<TamanhoDoCard.Provider value={2}>{ui}</TamanhoDoCard.Provider>);

describe("MetricCard · casa M sem curva", () => {
  afterEach(() => cleanup());

  it("um ponto de série não devolve o card ao layout compacto", () => {
    const { container } = dentroDeM(
      <MetricCard label="Investimento" valor="R$ 2.467,00" sub="gasto em anúncios"
        dl={{ txt: "219%", cor: "var(--tf-neg)", rumo: "sobe" }}
        spark={{ vals: [2467], cor: "var(--tf-neutral)" }} />,
    );
    // O layout grande é reconhecível pelo delta INLINE (junto do apoio), que o
    // compacto não tem — lá o delta mora num slot próprio.
    expect(container.textContent).toContain("Investimento");
    expect(container.textContent).toContain("vs anterior");
    // Sem curva: o único svg é o ícone do rumo, de 13px — a linha do período
    // (o svg largo do MonoFaisca) não existe. Contar por tamanho e não por
    // "nenhum svg", porque o delta LEGITIMAMENTE desenha um ícone.
    const svgs = [...container.querySelectorAll("svg")];
    expect(svgs.length).toBe(1);
    expect(svgs[0].getAttribute("width")).toBe("13");
    // …e o número assume a caixa.
    expect(container.querySelector("[data-so-numero]")).not.toBeNull();
    // Sem rodapé mínimo/médio/máximo de um ponto só.
    expect(container.textContent).not.toContain("mínimo");
  });

  it("com série de verdade, a curva volta e o número devolve o espaço", () => {
    const { container } = dentroDeM(
      <MetricCard label="Investimento" valor="R$ 2.467,00" sub="gasto em anúncios"
        spark={{ vals: [100, 300, 220, 400], cor: "var(--tf-neutral)" }} />,
    );
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector('[data-so-numero]')).toBeNull();
    expect(container.textContent).toContain("mínimo");
  });

  it("fora da grade nada disso vale — o card segue compacto", () => {
    const { container } = render(
      <MetricCard label="Investimento" valor="R$ 2.467,00" sub="gasto em anúncios"
        spark={{ vals: [2467], cor: "var(--tf-neutral)" }} />,
    );
    // Compacto: o slot da faísca existe (reservado) e está declarado vazio.
    expect(container.querySelector('.tf-w-slot[data-vazio]')).not.toBeNull();
    expect(container.textContent).not.toContain("mínimo");
  });
});
