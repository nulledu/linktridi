import { describe, it, expect } from "vitest";
import {
  SAIDAS, defDaSaida, normalizarImpressora, normalizarLista, validarImpressora,
  escolherImpressora, diagnosticarSaida, saidaRecomendada,
  type Ambiente, type ImpressoraLocal,
} from "../impressora-local";
import {
  ALTURA_MAXIMA_MM, LARGURA_MAXIMA_MM, LARGURA_MINIMA_MM,
} from "../estoque-etiqueta-config";

// As impressoras desta máquina. Toda falha de impressão local é MUDA — a API
// que não existe no Safari, o driver do Windows segurando o cabo, o agente
// desligado — e as três chegam como "não imprime". Este arquivo trava as
// frases que transformam cada uma numa instrução.

const AMBIENTE_LIMPO: Ambiente = { temWebUsb: true, temAgente: false, ehWindows: false, seguro: true };

function imp(extra: Partial<ImpressoraLocal> = {}): ImpressoraLocal {
  return normalizarImpressora({ id: "a", nome: "Zebra do galpão", saida: "zebra_usb", dpi: 203, larguraMm: 72, alturaMm: 18, ...extra });
}

describe("o cadastro aguenta o que vem do localStorage", () => {
  // localStorage é texto editável, e sobrevive a versões antigas do app.

  it("dpi inválido cai em 203 em vez de dividir por zero no gerador", () => {
    expect(normalizarImpressora({ dpi: 0 }).dpi).toBe(203);
    expect(normalizarImpressora({ dpi: 600 }).dpi).toBe(203);
    expect(normalizarImpressora({ dpi: "300" }).dpi).toBe(300);
  });

  it("tamanho absurdo é preso na faixa — não alimenta meio rolo numa etiqueta", () => {
    expect(normalizarImpressora({ alturaMm: 9999 }).alturaMm).toBe(ALTURA_MAXIMA_MM);
    expect(normalizarImpressora({ larguraMm: 1 }).larguraMm).toBe(LARGURA_MINIMA_MM);
    expect(normalizarImpressora({ larguraMm: 500 }).larguraMm).toBe(LARGURA_MAXIMA_MM);
  });

  it("saída desconhecida vira o diálogo do navegador — o caminho que sempre funciona", () => {
    expect(normalizarImpressora({ saida: "impressora_3d" }).saida).toBe("navegador");
  });

  it("lixo total não estoura", () => {
    expect(normalizarLista(null)).toEqual([]);
    expect(normalizarLista("nada")).toEqual([]);
    expect(normalizarImpressora(undefined).nome).toBe("Impressora");
  });

  it("duas marcadas como padrão viram UMA — a última", () => {
    // Duas abas salvando ao mesmo tempo alcançam esse estado sozinhas, e aí
    // "a impressora de todo dia" passa a depender da ordem da lista.
    const lista = normalizarLista([
      { id: "a", nome: "A", padrao: true },
      { id: "b", nome: "B", padrao: true },
    ]);
    expect(lista.filter((p) => p.padrao).map((p) => p.id)).toEqual(["b"]);
  });
});

describe("o que impede de salvar", () => {
  it("sem nome não salva — com duas no galpão, “Impressora” não diz qual é", () => {
    expect(validarImpressora({ nome: "  ", dpi: 203 }).join(" ")).toMatch(/nome/i);
  });

  it("sem resolução não salva, e a frase diz onde achar", () => {
    const p = validarImpressora({ nome: "Zebra", dpi: undefined }).join(" ");
    expect(p).toMatch(/203 ou 300 dpi/);
    expect(p).toMatch(/etiqueta de identificação/);
  });

  it("Browser Print sem aparelho escolhido não salva", () => {
    expect(validarImpressora({ nome: "Zebra", dpi: 203, saida: "zebra_agente" }).join(" "))
      .toMatch(/qual aparelho/i);
    expect(validarImpressora({ nome: "Zebra", dpi: 203, saida: "zebra_agente", agenteUid: "ZD421" })).toEqual([]);
  });

  it("cadastro completo passa", () => {
    expect(validarImpressora(imp())).toEqual([]);
  });
});

describe("qual usar agora", () => {
  it("sem nenhuma cadastrada devolve null — e isso não é erro", () => {
    // Sem impressora, o caminho é o diálogo do navegador. Um erro aqui faria a
    // tela pedir cadastro pra imprimir o que ela já sabia imprimir.
    expect(escolherImpressora([])).toBeNull();
  });

  it("a pedida ganha da padrão", () => {
    const lista = [imp({ id: "a" }), imp({ id: "b", padrao: true })];
    expect(escolherImpressora(lista, "a")!.id).toBe("a");
  });

  it("sem pedida, a padrão; sem padrão, a primeira", () => {
    expect(escolherImpressora([imp({ id: "a" }), imp({ id: "b", padrao: true })])!.id).toBe("b");
    expect(escolherImpressora([imp({ id: "a" }), imp({ id: "b" })])!.id).toBe("a");
  });

  it("id que não existe mais cai na padrão, em vez de devolver null", () => {
    const lista = [imp({ id: "a", padrao: true })];
    expect(escolherImpressora(lista, "apagada")!.id).toBe("a");
  });
});

describe("o diagnóstico — cada falha muda vira uma instrução", () => {
  it("Safari/Firefox: a API de USB não existe, e a frase diz o navegador certo", () => {
    const d = diagnosticarSaida("zebra_usb", { ...AMBIENTE_LIMPO, temWebUsb: false });
    expect(d.veredito).toBe("indisponivel");
    expect(d.frase).toMatch(/Safari e do Firefox/);
    expect(d.saida).toBe("navegador");
  });

  it("…e se o agente estiver rodando, manda pra ele em vez de pro diálogo", () => {
    const d = diagnosticarSaida("zebra_usb", { ...AMBIENTE_LIMPO, temWebUsb: false, temAgente: true });
    expect(d.saida).toBe("zebra_agente");
  });

  it("página sem https não fala USB — e a frase não menciona navegador à toa", () => {
    const d = diagnosticarSaida("zebra_usb", { ...AMBIENTE_LIMPO, seguro: false });
    expect(d.veredito).toBe("indisponivel");
    expect(d.frase).toMatch(/https/);
  });

  it("Windows AVISA sobre o driver antes do clique, não depois do erro", () => {
    // O `NotFoundError` que o Windows devolve quando o driver segura o cabo não
    // menciona driver nenhum. Sem este aviso, "a impressora não aparece na
    // lista" é onde a investigação morre.
    const d = diagnosticarSaida("zebra_usb", { ...AMBIENTE_LIMPO, ehWindows: true });
    expect(d.veredito).toBe("pede_permissao");
    expect(d.frase).toMatch(/driver da Zebra está segurando o cabo/);
    expect(d.saida).toBe("zebra_agente");
  });

  it("agente desligado diz ONDE ele fica", () => {
    const d = diagnosticarSaida("zebra_agente", AMBIENTE_LIMPO);
    expect(d.veredito).toBe("indisponivel");
    expect(d.frase).toMatch(/bandeja do sistema/);
  });

  it("nenhuma resposta indisponível deixa a pessoa sem caminho", () => {
    // Beco sem saída é o que faz alguém desistir e escrever a etiqueta à mão.
    const ambientes: Ambiente[] = [
      { temWebUsb: false, temAgente: false, ehWindows: false, seguro: true },
      { temWebUsb: false, temAgente: false, ehWindows: true, seguro: false },
      { temWebUsb: true, temAgente: false, ehWindows: true, seguro: true },
      { temWebUsb: false, temAgente: true, ehWindows: false, seguro: true },
    ];
    for (const amb of ambientes) {
      for (const s of SAIDAS) {
        const d = diagnosticarSaida(s.key, amb);
        if (d.veredito !== "pronta") expect(d.saida, `${s.key} sem alternativa`).toBeTruthy();
      }
    }
  });

  it("diálogo e tablet estão sempre prontos — não dependem desta máquina", () => {
    const cego: Ambiente = { temWebUsb: false, temAgente: false, ehWindows: true, seguro: false };
    expect(diagnosticarSaida("navegador", cego).veredito).toBe("pronta");
    expect(diagnosticarSaida("tablet", cego).veredito).toBe("pronta");
  });
});

describe("a saída recomendada é a de MENOS passos até sair papel", () => {
  it("Mac/Linux com Chrome: USB direto, que não instala nada", () => {
    expect(saidaRecomendada(AMBIENTE_LIMPO)).toBe("zebra_usb");
  });

  it("Windows com o agente já instalado: o agente, e não a briga com o driver", () => {
    expect(saidaRecomendada({ temWebUsb: true, temAgente: true, ehWindows: true, seguro: true })).toBe("zebra_agente");
  });

  it("Windows sem agente ainda tenta o USB — pode não haver driver segurando", () => {
    expect(saidaRecomendada({ temWebUsb: true, temAgente: false, ehWindows: true, seguro: true })).toBe("zebra_usb");
  });

  it("sem nada, o diálogo", () => {
    expect(saidaRecomendada({ temWebUsb: false, temAgente: false, ehWindows: false, seguro: false })).toBe("navegador");
  });
});

describe("catálogo das saídas", () => {
  it("toda saída tem ícone, resumo e o que exige", () => {
    for (const s of SAIDAS) {
      expect(s.icon, s.key).toBeTruthy();
      expect(s.resumo.length, s.key).toBeGreaterThan(20);
      expect(s.exige.length, s.key).toBeGreaterThan(4);
    }
  });

  it("saída desconhecida devolve o diálogo, nunca undefined", () => {
    expect(defDaSaida("inventada" as never).key).toBe("navegador");
  });
});
