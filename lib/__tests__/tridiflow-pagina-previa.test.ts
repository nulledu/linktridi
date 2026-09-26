import { describe, expect, it } from "vitest";
import {
  ADIANTAR_TUDO, CENARIOS_PREVIA, ESTADO_INICIAL, deveMostrar,
  type Adiantar, type EstadoRuntime,
} from "../tridiflow-pagina-runtime";
import type { Visibilidade } from "../tridiflow-pagina";

// Simulação da PRÉVIA: adiantar o relógio/vídeo pra ver a página como ela fica
// depois, sem esperar. O cálculo de liberação é o MESMO da página no ar — o
// que muda é só o estado que entra nele.

/** Espelha o `estadoVisto` do RenderPagina: adiantar entra por cima, nunca volta atrás. */
function aplicar(estado: EstadoRuntime, a: Adiantar | null): EstadoRuntime {
  if (!a) return estado;
  return {
    ...estado,
    segundosPagina: Math.max(estado.segundosPagina, a.segundosPagina ?? 0),
    segundosVideo: Math.max(estado.segundosVideo, a.segundosVideo ?? 0),
    percentualVideo: Math.max(estado.percentualVideo, a.percentualVideo ?? 0),
    videoIniciou: estado.videoIniciou || !!a.videoIniciou,
    videoTerminou: estado.videoTerminou || !!a.videoTerminou,
    videoReporta: estado.videoReporta || !!a.videoReporta,
  };
}

const cenario = (id: string) => CENARIOS_PREVIA.find((c) => c.id === id)!.adiantar;
const visto = (id: string) => aplicar(ESTADO_INICIAL, cenario(id));

const APOS_5MIN: Visibilidade = { modo: "apos_tempo", segundos: 300 };
const METADE_DO_VIDEO: Visibilidade = { modo: "apos_percentual", percentual: 50 };
const NO_FIM: Visibilidade = { modo: "ao_terminar" };

describe("prévia: ver a página em outro momento", () => {
  it("'Como abre' mostra só o que já nasce visível", () => {
    const e = visto("inicio");
    expect(deveMostrar({ modo: "sempre" }, e)).toBe(true);
    expect(deveMostrar(APOS_5MIN, e)).toBe(false);
    expect(deveMostrar(METADE_DO_VIDEO, e)).toBe(false);
    expect(deveMostrar(NO_FIM, e)).toBe(false);
  });

  it("'1 min depois' ainda não libera a oferta dos 5 min", () => {
    expect(deveMostrar(APOS_5MIN, visto("1min"))).toBe(false);
  });

  it("'5 min depois' libera o que espera 5 min e a metade do vídeo", () => {
    const e = visto("5min");
    expect(deveMostrar(APOS_5MIN, e)).toBe(true);
    expect(deveMostrar(METADE_DO_VIDEO, e)).toBe(true);
    expect(deveMostrar(NO_FIM, e)).toBe(false);   // o vídeo ainda não acabou
  });

  it("'Vídeo concluído' libera também o que espera o fim", () => {
    expect(deveMostrar(NO_FIM, visto("fim"))).toBe(true);
  });

  it("'Mostrar tudo' libera qualquer regra, inclusive tempo longo", () => {
    const e = aplicar(ESTADO_INICIAL, ADIANTAR_TUDO);
    for (const v of [APOS_5MIN, METADE_DO_VIDEO, NO_FIM, { modo: "apos_tempo", segundos: 3600 } as Visibilidade]) {
      expect(deveMostrar(v, e)).toBe(true);
    }
  });

  it("o cenário finge que o player informa progresso — senão % não liberaria nada", () => {
    // Sem `videoReporta`, a regra real cai em "só quando terminar".
    const semReporte = aplicar(ESTADO_INICIAL, { percentualVideo: 50 });
    expect(deveMostrar(METADE_DO_VIDEO, semReporte)).toBe(false);
    expect(deveMostrar(METADE_DO_VIDEO, visto("5min"))).toBe(true);
  });

  it("adiantar nunca ANDA PARA TRÁS sobre o que já aconteceu de verdade", () => {
    // Visitante que já viu 8 min: escolher "1 min depois" não pode esconder o
    // que já estava liberado.
    const real: EstadoRuntime = { ...ESTADO_INICIAL, segundosPagina: 480 };
    expect(aplicar(real, cenario("1min")).segundosPagina).toBe(480);
  });

  it("sem cenário escolhido, o estado é exatamente o real", () => {
    const real: EstadoRuntime = { ...ESTADO_INICIAL, segundosPagina: 42 };
    expect(aplicar(real, null)).toEqual(real);
  });
});
