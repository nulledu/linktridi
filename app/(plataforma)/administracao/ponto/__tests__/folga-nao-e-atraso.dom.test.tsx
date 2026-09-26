import { describe, it, expect } from "vitest";
import { estadoDe } from "../PainelGeral";
import type { StatusPessoa } from "@/lib/ponto";

/**
 * Quem não trabalha sábado não está ATRASADO no sábado.
 *
 * O horário previsto mora no cadastro e vale todo dia — comparar com o relógio
 * sem olhar o calendário pintava metade da equipe de vermelho todo sábado (e
 * todo feriado). `expediente` é o servidor dizendo "hoje é dia dessa pessoa".
 */
const pessoa = (extra: Partial<StatusPessoa> = {}): StatusPessoa => ({
  id: "p1", nome: "Beatriz", fotoUrl: null,
  situacao: "ausente", entrada: null, ultima: null, ultimoTipo: null,
  entradaPrevista: "08:00", saidaPrevista: "17:00", batidas: 0, expediente: true,
  ...extra,
});

const AS_10H = 10 * 60;

describe("painel do ponto — folga não é atraso", () => {
  it("sem expediente hoje, aparece FOLGA e não pesa como problema", () => {
    const e = estadoDe(pessoa({ expediente: false }), AS_10H);
    expect(e.rotulo).toBe("Folga");
    expect(e.tom).toBe("neutro");
  });

  it("de férias, o painel diz FÉRIAS — não \"Folga\", não \"Ausente\"", () => {
    // Era a mentira mais visível do módulo: quem estava na praia entrava na
    // contagem de ausentes do painel que o gestor olha de manhã.
    const e = estadoDe(pessoa({ expediente: false, motivo: "Férias" }), AS_10H);
    expect(e.rotulo).toBe("Férias");
    expect(e.foraDaEscala).toBe(true);
    expect(e.tom).toBe("neutro");
  });

  it("no feriado o painel diz o NOME do feriado", () => {
    const e = estadoDe(pessoa({ expediente: false, motivo: "Independência do Brasil" }), AS_10H);
    expect(e.rotulo).toBe("Independência do Brasil");
    expect(e.foraDaEscala).toBe(true);
  });

  it("quem sai da escala é marcado por ESTRUTURA, não pelo texto do rótulo", () => {
    // A contagem de ausentes comparava `rotulo === "Folga"`. Assim que o dia
    // ganhou nome próprio ("Férias"), a pessoa voltava a ser cobrada.
    for (const motivo of ["Férias", "Atestado", "Folga compensatória", undefined]) {
      expect(estadoDe(pessoa({ expediente: false, motivo }), AS_10H).foraDaEscala, motivo ?? "sem motivo").toBe(true);
    }
    expect(estadoDe(pessoa({ expediente: true }), AS_10H).foraDaEscala).toBeFalsy();
  });

  it("com expediente, duas horas depois do previsto continua ATRASADO", () => {
    const e = estadoDe(pessoa({ expediente: true }), AS_10H);
    expect(e.rotulo).toBe("Atrasado");
    expect(e.tom).toBe("perigo");
  });

  it("de folga mas bateu ponto: está presente (o que trabalhar vira crédito)", () => {
    const e = estadoDe(pessoa({ expediente: false, situacao: "presente", batidas: 1 }), AS_10H);
    expect(e.rotulo).toBe("Presente");
  });

  it("antes do horário previsto continua sendo \"a chegar\"", () => {
    const e = estadoDe(pessoa(), 7 * 60);
    expect(e.rotulo).toBe("A chegar");
  });

  it("resposta sem `expediente` (payload antigo) não vira folga silenciosa", () => {
    const { expediente: _, ...semCampo } = pessoa();
    const e = estadoDe(semCampo as StatusPessoa, AS_10H);
    expect(e.rotulo).toBe("Atrasado");
  });
});
