import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CATALOGO, perfisPadrao, widgetPadrao, widgetTipos, COLUNAS, LINHAS,
  metricas, ROTULO_METRICA, comTelasAtualizadas, assinaturaDeSlide, METRICAS_PRODUCAO, METRICAS_EXPEDICAO, METRICAS_ESTOQUE,
  podeSeparar, separarEmBlocos, cabeSeparar, PERDAS_AO_SEPARAR, faixaPorAlvo,
  type Widget, type WidgetTipo,
} from "@/lib/painel-layout";
import { fmtCurto } from "@/lib/format";

/**
 * O perfil não pode PIORAR a parede.
 *
 * Enquanto não havia perfil salvo, `/painel` caía no carrossel clássico — pódio
 * com foto, batalha, financeiro em vidro. O editor, por outro lado, só sabia
 * montar blocos soltos. Ou seja: no dia em que alguém salvasse um perfil, a TV
 * trocaria a tela bonita por uma versão mais pobre dela mesma, sem ninguém ter
 * pedido isso. As telas clássicas viraram blocos justamente para fechar essa
 * porta, e é isso que este arquivo guarda.
 */

const CLASSICOS = [
  "classico-ranking",
  "classico-batalha",
  "classico-financeiro",
  "classico-trafego",
  "classico-produtos",
] as const;

describe("as telas clássicas como bloco", () => {
  it("os cinco tipos existem no schema e na paleta", () => {
    for (const tipo of CLASSICOS) {
      expect(widgetTipos as readonly string[], tipo).toContain(tipo);
      const item = CATALOGO.find((c) => c.tipo === tipo);
      expect(item, tipo).toBeTruthy();
      // Grupo próprio: quem abre a paleta procura "a tela de sempre", não um
      // bloco no meio dos avulsos.
      expect(item!.grupo, tipo).toBe("Telas prontas");
    }
  });

  it("tela clássica nasce ocupando a tela toda", () => {
    // Meia tela de pódio não é meio pódio, é um pódio cortado: elas foram
    // desenhadas como slide inteiro e o padrão precisa refletir isso.
    for (const tipo of CLASSICOS) {
      const w = widgetPadrao(tipo, "x");
      expect([w.w, w.h], tipo).toEqual([COLUNAS, LINHAS]);
      expect([w.x, w.y], tipo).toEqual([0, 0]);
    }
  });

  it("o perfil Comercial É o painel de sempre, tela por tela — só que em blocos", () => {
    /*
     * O perfil nasce SEPARADO, e a receita é a mesma do botão "Separar em
     * blocos". Duas listas para o mesmo desenho divergiriam na primeira
     * correção: alguém arruma a posição do pódio num lugar e o outro continua
     * com a antiga, e aí o botão passa a produzir uma tela diferente da que o
     * perfil padrão mostra.
     */
    const comercial = perfisPadrao().find((p) => p.nome === "Comercial");
    expect(comercial).toBeTruthy();
    // Desde 09/09/2026 o Comercial tem DUAS telas: o ranking do mês
    // (comercial-simples) e a batalha. As outras continuam na paleta.
    const TELAS_DO_COMERCIAL = ["comercial-simples", "classico-batalha"] as const;
    expect(comercial!.slides.length).toBe(TELAS_DO_COMERCIAL.length);

    comercial!.slides.forEach((s, i) => {
      const tipo = TELAS_DO_COMERCIAL[i];
      let n = 0;
      const receita = separarEmBlocos(
        { id: "x", tipo, x: 0, y: 0, w: COLUNAS, h: LINHAS, opcoes: {} } as Widget,
        () => `r${n++}`,
      );
      expect(s.ativo, s.nome).toBe(true);
      expect(s.widgets.length, s.nome).toBe(receita.length);
      // Mesma peça, no mesmo lugar, com as mesmas opções — só o id difere.
      s.widgets.forEach((w, j) => {
        const r = receita[j];
        expect([w.tipo, w.x, w.y, w.w, w.h], `${s.nome} peça ${j}`).toEqual([r.tipo, r.x, r.y, r.w, r.h]);
        expect(w.opcoes, `${s.nome} peça ${j} opções`).toEqual(r.opcoes);
      });
      // Id estável: sorteado a cada chamada, o editor marcaria "não salvo"
      // sozinho, sem ninguém ter tocado em nada.
      expect(new Set(s.widgets.map((w) => w.id)).size, s.nome).toBe(s.widgets.length);
    });
    expect(perfisPadrao()).toEqual(perfisPadrao());
  });

  it("a escala curta encurta sem mentir a ordem de grandeza", () => {
    /*
     * "R$ 59,9 mil" na parede e "R$ 59.925" no relatório precisam ser o MESMO
     * número lido de duas distâncias. Os casos abaixo são as bordas: onde a
     * escala vira, onde a casa decimal aparece e onde ela atrapalha.
     */
    expect(fmtCurto(999, true)).toBe(fmtCurto(999, true));   // abaixo de mil, exato
    expect(fmtCurto(1_000, true)).toBe("R$ 1 mil");
    expect(fmtCurto(59_925, true)).toBe("R$ 60 mil");
    expect(fmtCurto(9_400, true)).toBe("R$ 9,4 mil");        // < 10: uma casa ajuda
    expect(fmtCurto(1_250_000, true)).toBe("R$ 1,3 mi");
    expect(fmtCurto(-2_400, true)).toBe("-R$ 2,4 mil");      // o sinal vem antes do R$
    expect(fmtCurto(1_500, false)).toBe("1,5 mil");          // contagem não leva R$
  });

  it("métrica de rota separada avisa quem precisa buscá-la", () => {
    /*
     * Produção e expedição não vêm no `/api/sales`: o painel só busca a rota
     * delas quando o layout usa. Uma métrica nova que fique de fora da lista
     * não quebra nada visivelmente — ela mostra "—" para sempre, que é o mesmo
     * símbolo de "dado ausente". Ninguém descobre olhando a tela.
     */
    for (const m of metricas) {
      if (m.startsWith("producao_")) expect(METRICAS_PRODUCAO.has(m), m).toBe(true);
      if (m.startsWith("expedicao_")) expect(METRICAS_EXPEDICAO.has(m), m).toBe(true);
    }
    // E o contrário: lista que cita métrica que não existe mais é gatilho morto.
    for (const m of [...METRICAS_PRODUCAO, ...METRICAS_EXPEDICAO]) {
      expect((metricas as readonly string[]).includes(m), m).toBe(true);
    }
  });

  it("quem busca a produção olha o KPI, não só o bloco", () => {
    // O gatilho vive em dois lugares (web e app) e os dois já erraram isto:
    // o perfil de Produção existia, o bloco estava no perfil e a verificação
    // procurava no `layout` solto — a TV ficou em "carregando" para sempre.
    const web = readFileSync(join(process.cwd(), "app/painel/Panel.tsx"), "utf8");
    expect(web).toContain("METRICAS_PRODUCAO");
    const app = readFileSync(
      join(process.cwd(), "tv-central/panel/administracao/src/main/kotlin/com/tridi/tv/panel/administracao/ui/AdminViewModel.kt"),
      "utf8",
    );
    expect(app).toContain('startsWith("producao_")');
  });

  it("separar não muda o lugar: as peças ficam DENTRO do retângulo da tela", () => {
    /*
     * A promessa da separação é "mesmo desenho, mesmo lugar". Peça que nasce
     * fora do retângulo do bloco cai em cima do vizinho — e quem separou vai
     * culpar o arrasto, não a separação.
     */
    for (const tipo of CLASSICOS) {
      // Tela cheia (o caso normal) e um retângulo qualquer no meio da grade.
      for (const caixa of [{ x: 0, y: 0, w: 12, h: 8 }, { x: 4, y: 2, w: 8, h: 6 }]) {
        const bloco = { ...widgetPadrao(tipo, "b"), ...caixa } as Widget;
        const pecas = separarEmBlocos(bloco, (() => { let n = 0; return () => `p${n++}`; })());
        expect(pecas.length, tipo).toBeGreaterThan(0);
        expect(cabeSeparar(bloco), tipo).toBe(true);
        for (const p of pecas) {
          expect(p.w, `${tipo} ${p.tipo} largura`).toBeGreaterThanOrEqual(1);
          expect(p.h, `${tipo} ${p.tipo} altura`).toBeGreaterThanOrEqual(1);
          expect(p.x, `${tipo} ${p.tipo} x`).toBeGreaterThanOrEqual(caixa.x);
          expect(p.y, `${tipo} ${p.tipo} y`).toBeGreaterThanOrEqual(caixa.y);
          expect(p.x + p.w, `${tipo} ${p.tipo} passa da direita`).toBeLessThanOrEqual(caixa.x + caixa.w);
          expect(p.y + p.h, `${tipo} ${p.tipo} passa de baixo`).toBeLessThanOrEqual(caixa.y + caixa.h);
        }
      }
    }
  });

  it("as peças não se sobrepõem, e cada uma existe na paleta", () => {
    /*
     * As caixas menores não são capricho: `separarEmBlocos` remapeia cada peça
     * EM PROPORÇÃO ao retângulo de origem, com arredondamento. Fronteira que
     * não sobrevive à divisão (1/8 de 6 linhas = 0,75) faz duas peças caírem
     * na mesma linha — e testar só a tela cheia não pega isso: em 12×8 a conta
     * é a identidade e passa sempre.
     */
    for (const tipo of CLASSICOS) {
      for (const caixa of [
        { x: 0, y: 0, w: COLUNAS, h: LINHAS },
        { x: 4, y: 2, w: 8, h: 6 },
        { x: 0, y: 0, w: 6, h: 4 },
        { x: 2, y: 1, w: 9, h: 7 },
      ]) {
        const bloco = { ...widgetPadrao(tipo, "b"), ...caixa } as Widget;
        let n = 0;
        const pecas = separarEmBlocos(bloco, () => `p${n++}`);
        // Caixa pequena demais responde VAZIO em vez de empilhar peça em cima
        // de peça — o editor esconde o botão nesse caso.
        if (pecas.length === 0) continue;
        for (const p of pecas) {
          // Bloco que o editor não sabe adicionar é bloco que ninguém consegue
          // recriar depois de apagar sem querer.
          expect(CATALOGO.find((c) => c.tipo === p.tipo), `${tipo} → ${p.tipo}`).toBeTruthy();
        }
        for (let i = 0; i < pecas.length; i++) {
          for (let j = i + 1; j < pecas.length; j++) {
            const a = pecas[i], b = pecas[j];
            const cruza = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
            expect(cruza, `${tipo} em ${caixa.w}x${caixa.h}: ${a.tipo} sobre ${b.tipo}`).toBe(false);
          }
        }
      }
    }
  });

  it("toda tela separável diz o que se perde ao separar", () => {
    // A frase aparece ANTES do clique. Tela separável sem essa frase é uma
    // troca silenciosa: a pessoa descobre o que sumiu depois de rearranjar.
    for (const tipo of widgetTipos) {
      if (podeSeparar(tipo as WidgetTipo)) {
        expect(PERDAS_AO_SEPARAR[tipo as WidgetTipo], tipo).toBeTruthy();
      }
    }
    // E só tela clássica separa: bloco solto já é a menor peça.
    for (const tipo of widgetTipos) {
      if (!tipo.startsWith("classico-") && tipo !== "comercial-simples") {
        expect(podeSeparar(tipo as WidgetTipo), tipo).toBe(false);
      }
    }
  });

  it("alvo ZERO é um alvo — 'nenhuma impedida' é a meta óbvia de um contador de problema", () => {
    /*
     * `faixaPorAlvo` recusava alvo 0 e devolvia "neutro": quem escrevia zero em
     * "impedidas" ficava sem cor nenhuma e a opção parecia quebrada. A razão
     * não serve aqui (0/0 é NaN), então a regra é direta — e só vale quando
     * MENOS é melhor.
     */
    expect(faixaPorAlvo(0, 0, "menor")).toBe("ok");
    expect(faixaPorAlvo(1, 0, "menor")).toBe("critico");
    expect(faixaPorAlvo(5, 0, "menor")).toBe("critico");
    // No sentido contrário, alvo zero não quer dizer nada.
    expect(faixaPorAlvo(0, 0, "maior")).toBe("neutro");
    expect(faixaPorAlvo(9, 0, "maior")).toBe("neutro");
    // E o resto do semáforo continua como era.
    expect(faixaPorAlvo(100, 100, "maior")).toBe("ok");
    expect(faixaPorAlvo(50, 100, "maior")).toBe("critico");
  });

  it("o KPI de impedidas do perfil de Produção usa esse alvo — e ele é lido", () => {
    // A opção que o componente ignora é enfeite. Aqui ela precisa existir no
    // perfil E ser um número, porque é `Number.isFinite` que distingue
    // "sem alvo" de "alvo zero" na hora de pintar.
    const prod = perfisPadrao().find((p) => p.nome === "Produção");
    const impedidas = prod!.slides
      .flatMap((s) => s.widgets)
      .find((w) => w.opcoes.metrica === "producao_impedidas");
    expect(impedidas, "o perfil de Produção precisa mostrar as impedidas").toBeTruthy();
    expect(Number.isFinite(Number(impedidas!.opcoes.alvo))).toBe(true);
    expect(impedidas!.opcoes.direcao).toBe("menor");
  });

  /*
   * O estoque só chega na parede se TRÊS coisas concordarem: a métrica existe,
   * o renderizador sabe ler o campo e a busca é disparada. O modo de falha é
   * silencioso — a TV mostra "—" para sempre, que é o mesmo símbolo de "dado
   * ausente" —, então cada elo tem uma trava aqui.
   */
  it("a tela de estoque do galpão está montada de ponta a ponta", () => {
    const prod = perfisPadrao().find((p) => p.nome.toLowerCase().includes("produção"));
    const tela = prod?.slides.find((s) => s.id === "s-prod-estoque");
    expect(tela, "o perfil de Produção perdeu a tela de estoque").toBeTruthy();

    // Os três números do topo têm alvo ZERO: item abaixo do mínimo, item
    // zerado e peça esperando conferência são todos "não deveria existir".
    const kpis = tela!.widgets.filter((w) => w.tipo === "kpi");
    expect(kpis.map((w) => w.opcoes.metrica).sort())
      .toEqual(["estoque_abaixo", "estoque_conferir", "estoque_zerados"]);
    for (const k of kpis) {
      expect(k.opcoes.alvo, `${k.opcoes.metrica} sem alvo não vira alarme`).toBe(0);
      expect(k.opcoes.direcao).toBe("menor");
    }
    expect(tela!.widgets.some((w) => w.tipo === "estoque")).toBe(true);
    expect(tela!.widgets.some((w) => w.tipo === "alertas")).toBe(true);

    // Nenhum bloco pode sair da grade nem cobrir o vizinho.
    const ocupado = new Set<string>();
    for (const w of tela!.widgets) {
      expect(w.x + w.w).toBeLessThanOrEqual(COLUNAS);
      expect(w.y + w.h).toBeLessThanOrEqual(LINHAS);
      for (let x = w.x; x < w.x + w.w; x++) {
        for (let y = w.y; y < w.y + w.h; y++) {
          expect(ocupado.has(`${x},${y}`), `${w.id} cobre outro bloco`).toBe(false);
          ocupado.add(`${x},${y}`);
        }
      }
    }

    // O elo que já quebrou uma vez com a produção: o painel só busca a rota
    // quando o layout de fato usa estoque, e `alertas` conta — é lá que "item
    // zerado" aparece para quem não montou a tela inteira do galpão.
    const painel = readFileSync(join(process.cwd(), "app/painel/Panel.tsx"), "utf8");
    expect(painel).toContain("/api/estoque/painel");
    expect(painel).toMatch(/usa\(\["estoque", "alertas"\], \[\.\.\.METRICAS_ESTOQUE\]\)/);
    for (const m of METRICAS_ESTOQUE) expect(metricas).toContain(m);

    // E o mesmo gatilho no Kotlin, senão a TV de verdade fica em branco.
    const vm = readFileSync(
      join(process.cwd(), "tv-central/panel/administracao/src/main/kotlin/com/tridi/tv/panel/administracao/ui/AdminViewModel.kt"),
      "utf8",
    );
    expect(vm).toContain("usaEstoque");
    expect(vm).toContain('w.tipo == "estoque" || w.tipo == "alertas"');
  });

  it("a TV em Kotlin desenha os mesmos tipos que o web", () => {
    /*
     * Os dois renderizadores leem o MESMO layout, vindo do mesmo `/api/config`.
     * Quando um tipo existe só no web, a TV cai no bloco vazio de reserva e a
     * parede mostra um retângulo sem nada — sem erro, sem log, sem ninguém para
     * ver. É o pior modo de falha do projeto, e por isso ele é verificado por
     * texto: é barato e pega o esquecimento no mesmo commit.
     */
    const kt = readFileSync(
      join(
        process.cwd(),
        "tv-central/panel/administracao/src/main/kotlin/com/tridi/tv/panel/administracao/ui/widgets/Widgets.kt",
      ),
      "utf8",
    );
    for (const tipo of widgetTipos) {
      expect(kt.includes(`"${tipo}"`), `a TV não desenha "${tipo}"`).toBe(true);
    }
  });
});

describe("comercial enxuto", () => {
  it("as duas métricas do mockup existem com rótulo", () => {
    expect(metricas as readonly string[]).toContain("meta_pct");
    expect(metricas as readonly string[]).toContain("pedidos_dia");
    expect(ROTULO_METRICA.meta_pct).toBe("Meta do mês");
    expect(ROTULO_METRICA.pedidos_dia).toBe("Vendas hoje");
  });

  it("comercial-simples é tela pronta e o Comercial padrão tem só ela e a batalha", () => {
    expect(CATALOGO.find((c) => c.tipo === "comercial-simples")?.grupo).toBe("Telas prontas");
    const com = perfisPadrao().find((p) => p.id === "p-comercial")!;
    expect(com.slides.map((s) => s.nome)).toEqual(["Ranking", "Batalha"]);
    const tipos = com.slides[0].widgets.map((w) => w.tipo);
    expect(tipos).toEqual(["texto", "relogio", "podio", "kpi", "kpi", "kpi", "kpi", "equipe"]);
    expect(com.slides[0].widgets.map((w) => w.opcoes.metrica).filter(Boolean))
      .toEqual(["faturamento_mes", "meta_pct", "pedidos_dia", "ticket_medio"]);
  });

  function perfilComercialAntigo() {
    const tipos: WidgetTipo[] = ["classico-ranking", "classico-batalha", "classico-financeiro", "classico-trafego", "classico-produtos"];
    const ids = ["s-c-rank", "s-c-bat", "s-c-fin", "s-c-traf", "s-c-prod"];
    let n = 0;
    return {
      id: "p-comercial", nome: "Comercial", descricao: "", paraTela: "16:9" as const, polegadas: 65, numeroCurto: true,
      slides: tipos.map((tipo, i) => ({
        id: ids[i], nome: ids[i], duracaoMs: null, ativo: true,
        widgets: separarEmBlocos({ id: ids[i], tipo, x: 0, y: 0, w: COLUNAS, h: LINHAS, opcoes: {} }, () => `w-${n++}`),
      })),
    };
  }

  it("o Comercial de fábrica com 5 telas vira o de 2 na leitura; o mexido fica", () => {
    const antigo = perfilComercialAntigo();
    const [novo] = comTelasAtualizadas([antigo]);
    expect(novo.slides.map((s) => s.nome)).toEqual(["Ranking", "Batalha"]);
    // As preferências do perfil são da pessoa e sobrevivem.
    expect([novo.polegadas, novo.numeroCurto]).toEqual([65, true]);
    // Sem a tela de produtos (aposentada por versão anterior) ainda é de
    // fábrica — é exatamente o que está gravado no banco em set/2026.
    const semProdutos = { ...antigo, slides: antigo.slides.slice(0, 4) };
    expect(comTelasAtualizadas([semProdutos])[0].slides.map((s) => s.nome)).toEqual(["Ranking", "Batalha"]);
    const mexido = { ...antigo, slides: antigo.slides.slice(0, 3) };
    expect(comTelasAtualizadas([mexido])[0].slides).toHaveLength(3);
    // Um bloco movido numa das cinco também segura o perfil (a tela de
    // produtos de fábrica é aposentada na leitura, como sempre foi: sobram 4).
    const movido = { ...antigo, slides: antigo.slides.map((s, i) => i !== 2 ? s : { ...s, widgets: s.widgets.map((w, j) => j ? w : { ...w, x: w.x + 1 }) }) };
    const sobrou = comTelasAtualizadas([movido])[0].slides;
    expect(sobrou).toHaveLength(4);
    expect(sobrou.map((s) => s.id)).toEqual(["s-c-rank", "s-c-bat", "s-c-fin", "s-c-traf"]);
    // O Comercial novo não é reconhecido como "de fábrica antiga" na volta.
    expect(assinaturaDeSlide(novo.slides[0].widgets)).toContain("relogio:8,0,4,1");
  });
});
