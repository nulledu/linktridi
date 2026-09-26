package com.tridi.estoque.impressora

// ── O desenho da etiqueta, em pontos ─────────────────────────────────────────
//
// Aqui não se desenha nada: aqui se DECIDE onde cada coisa vai. Toda a
// aritmética que separa uma etiqueta legível de uma etiqueta com o código de
// barras espremido mora neste arquivo, em Kotlin puro, para poder ser conferida
// em teste — a alternativa é olhar tira de papel impressa e chutar.
//
// A ETIQUETA EMPILHA: 72 × 18mm, texto em cima, BARRAS NA LARGURA INTEIRA,
// texto embaixo.
//
//     ┌──────────────────────────────────────────────────────────────────────┐
//     │ Folha de alavanca      Branco · 2750×1840     GAL-A · C3    ┌──────┐ │
//     │ ║│║│║ ║║│ ║│║│║ ║║ ║│║│║ ║║│ ║│║│║ ║║ ║│║│║ ║║│ ║│║│║ ║║ ║ │ 50 un│ │
//     │ MDF6MM-BR-18-000042                            04/08 18:57 · João    │
//     └──────────────────────────────────────────────────────────────────────┘
//
//  • faixa do TOPO: nome (negrito), cor · dimensões, local · detalhe (negrito)
//    e, quando a etiqueta é caixa, o selo no canto;
//  • as BARRAS, centradas na largura útil inteira;
//  • faixa do PÉ: o código escrito à esquerda e "quando · quem" à direita.
//
// ── POR QUE ISTO DEIXOU DE SER TRÊS COLUNAS ──────────────────────────────────
//
// O dono comparou as tiras: "a etiqueta de teste está boa e as outras está
// ruim". A de teste é a impressão livre (`EtiquetaLivreLayout`), e a diferença
// medível não era gosto — era o MÓDULO, a largura da barra mais fina.
//
// No desenho de três colunas as barras moravam na coluna do meio, com teto de
// 60% da largura útil. Um código de 264 módulos (o SKU do galpão mais o
// sequencial) recebia (576 × 3/5) ÷ 264 = 1 ponto por módulo, 0,125mm — o
// mínimo absoluto que a cabeça térmica queima, e o que o comentário da etiqueta
// livre já chamava de "uma mancha que ninguém pega". Empilhado, o mesmo código
// recebe a largura útil inteira: 560 ÷ 264 = 2 pontos, 0,25mm. É a MESMA barra
// da etiqueta que ele aprovou.
//
// Só trocar a constante não resolvia, e isso está medido: exigir 2 pontos com
// as barras presas na coluna do meio faz "MDF6MM-BR-18-000042" pedir 66mm de
// barras e "TESTE-IMPRESSORA-000001" pedir 77mm — num papel de 72mm isso vira
// RECUSA, e etiqueta que não sai é pior que etiqueta borrada. Três colunas e
// barra legível não cabem juntas em 80mm. O que cabe é empilhar.
//
// ── O QUE ISSO CUSTOU, PORQUE CUSTOU ─────────────────────────────────────────
//
// Barra na largura inteira quer dizer que o texto não sobe mais AO LADO dela:
// ele tem de morar acima ou abaixo, e aí cada linha de texto custa altura da
// etiqueta INTEIRA. Em 18mm cabem exatamente duas faixas de texto e uma barra
// de 9,25mm — nem uma linha a mais. O nome perdeu a segunda linha (a coluna de
// 21mm virou uma faixa de 33mm, então ele corta em ~24 caracteres em vez de
// ~34) e a cor, o local e o detalhe passaram a disputar LARGURA em vez de
// altura. A ordem de quem cede está em `Peca`, e cada uma tem o motivo escrito.
object EtiquetaLayout {

    /** 80mm de papel, 72mm imprimíveis, 576 pontos a 203 dpi. */
    const val LARGURA_PADRAO_PONTOS = EscPos.LARGURA_PONTOS
    const val PONTOS_POR_MM = EscPos.PONTOS_POR_MM

    // ── Largura: o que a cabeça térmica ALCANÇA, e por que ela é ajustável ────
    //
    // Até aqui a largura era constante (`EscPos.LARGURA_PONTOS`) e o único
    // tamanho de etiqueta possível era 72mm de largura. O dono pediu tamanho
    // personalizado, e a largura é metade do tamanho.
    //
    // O NÚMERO É A ÁREA IMPRIMÍVEL, não o rolo. São coisas diferentes e
    // confundi-las é o erro caro: um rolo de 80mm tem ~72mm que a cabeça
    // alcança (4mm de cada borda ela não toca), e um rolo de 58mm tem ~48mm.
    // Guardar "80" e descontar 8 daria a resposta errada pro rolo de 58, onde o
    // desconto é 10. Guardando o que de fato vira tinta, a conta é uma só e o
    // que a tela desenha é o que sai.
    //
    // 72mm é o TETO e não é escolha: é a cabeça desta impressora. Pedir mais
    // não imprime mais — o excedente simplesmente não sai, em silêncio, e a
    // pessoa descobre no papel. Por isso a faixa para AQUI em vez de aceitar o
    // número e cortar depois.
    //
    // 25mm é o piso, e é generoso de propósito: nesta largura ainda cabe um
    // código curto ("GAL-A3" pede ~15mm de barras). O que recusa uma etiqueta
    // estreita demais não é este número, é `problemaDaLargura` — ele conhece o
    // código de verdade, e códigos têm comprimentos diferentes.
    const val LARGURA_PADRAO_MM = 72
    const val LARGURA_MINIMA_MM = 25
    const val LARGURA_MAXIMA_MM = 72

    /**
     * O módulo (a barra mais fina) não desce de UM ponto.
     *
     * Não é preferência: um ponto é o menor traço que a cabeça térmica sabe
     * queimar. A 203 dpi isso dá 0,125mm.
     *
     * Este número é a REGRA DE RECUSA, não o alvo: se `módulos × 1 ponto` não
     * cabe na largura escolhida, NÃO existe desenho possível — o código sairia
     * cortado na borda, e código cortado não é código incompleto, é código que
     * escaneia outra coisa. Ver `problemaDaLargura`.
     *
     * O ALVO é `MODULO_ALVO_PONTOS`, e quem o alcança é o desenho empilhado, não
     * uma constante: dando a largura útil inteira às barras, um código de 264
     * módulos sai com 2 pontos a 72mm sem que ninguém peça. Subir o PISO para 2
     * está tentado e medido, e não dá — recusaria "TESTE-IMPRESSORA-000001",
     * que pede 308 módulos e não cabe em 560 pontos nem com o papel inteiro.
     * Um código comprido demais sai borrado com aviso; sair não sair, nunca.
     */
    const val MODULO_MINIMO_PONTOS = 1

    /**
     * O módulo que a etiqueta PROCURA: dois pontos, 0,25mm.
     *
     * É o mesmo da etiqueta livre, que é a que o dono aprovou olhando o papel.
     * Não é piso e não recusa nada — é o número contra o qual o `aviso` diz "o
     * código está comprido demais para esta largura". Quem lê o aviso pode
     * encurtar o SKU ou alargar a tira; quem não pode fazer nem uma coisa nem
     * outra ainda imprime, com a barra fina.
     */
    const val MODULO_ALVO_PONTOS = 2

    /**
     * Larguras mínimas das vagas da faixa do topo.
     *
     * Os números saem de MEDIÇÃO, não de gosto — medidos em Arial a 2,8mm, que
     * é a fonte e o corpo que o papel recebe:
     *
     *   "Folha de alavanca"        24,1mm   (nome de galpão típico)
     *   "Branco · 2750×1840"       25,4mm
     *   "GAL-A"                     8,9mm
     *   "GAL-A · C3 · B2"          21,0mm
     *
     * 10mm de nome são ~7 caracteres: pouco, e ainda assim é o que distingue
     * "MDF6…" de "COMP…" quando a pessoa está de frente pra pilha. O local pede
     * 8mm porque "GAL-A" tem 5 caracteres por construção.
     *
     * O DETALHE só entra se a vaga do local chegar aos 21mm que ele mede — não
     * um número redondo, o número dele. Abaixo disso "GAL-A · C3 · B…" sairia
     * cortado no meio do código da prateleira, mandando procurar numa baia que
     * não existe: pior que não sair.
     *
     * A consequência é uma escolha real e declarada: em 72mm o nome, a cor e o
     * detalhe da prateleira pedem 70,5mm de texto nos 67 que sobram depois dos
     * vãos. O detalhe cede primeiro (é a ordem de `Peca`) — e volta inteiro se
     * o escritório desligar a cor e as dimensões, que é exatamente pra isso que
     * a lista de campos existe.
     *
     * Abaixo do mínimo a vaga não informa, só ocupa — e o espaço dela vale mais
     * como nome. Quem decide o que cede é `montar`, e a ordem está em `Peca`.
     */
    val LARGURA_MINIMA_DO_NOME = mmParaPontos(10)
    val LARGURA_MINIMA_DA_COR = mmParaPontos(10)

    /**
     * A vaga do local é RESERVA FIXA, não proporção — como a do selo.
     *
     * "GAL-A" tem cinco caracteres por construção (8,9mm): ao contrário do nome
     * e da cor, o tamanho dele não depende do cadastro. Reparti-lo por peso dava
     * dois defeitos ao mesmo tempo — a 72mm sobrava vaga vazia à direita, e a
     * 56mm a fatia dele caía abaixo do mínimo e derrubava a COR junto, que é a
     * ordem de sacrifício ao contrário.
     */
    val LARGURA_DO_LOCAL = mmParaPontos(10)

    /**
     * Mínimos da faixa do pé.
     *
     * O código escrito corta com reticências sem prejuízo grave (ele é a rede
     * de segurança de quando a barra borra, e quem digita tem a peça na mão),
     * então 12mm bastam. O rodapé NÃO: "04/08 18:5…" é uma hora que não existe,
     * e o único jeito de cortar sem mentir é perder o nome de quem imprimiu.
     * 15mm é o que `04/08 18:57` mede a 2,8mm — abaixo disso a faixa inteira
     * cede em vez de sair pela metade.
     */
    val LARGURA_MINIMA_DO_CODIGO_LEGIVEL = mmParaPontos(12)
    val LARGURA_MINIMA_DO_RODAPE = mmParaPontos(15)

    /**
     * O detalhe da prateleira desceu pra faixa do PÉ, e o número explica por quê.
     *
     * Na faixa do topo ele custava 21mm — "GAL-A · C3 · B2" colado —, e com ele
     * o nome e a cor caíam de 30 e 27mm para 24,3 e 21,6: a etiqueta padrão
     * passava a sair com dois campos cortados E um aviso permanente na tela.
     * Aviso que está sempre aceso é aviso que ninguém lê.
     *
     * Sozinho, "C3 · B2" mede 9,6mm, e na faixa do pé sobra: 31,9 do código
     * escrito + 9,6 dele + 23,3 do horário + dois vãos = 67,8mm nos 70 que a
     * tira tem. TUDO cabe, sem uma reticência e sem aviso nenhum.
     *
     * A leitura também melhora: "GAL-A" em cima diz o galpão, de relance e em
     * negrito; "C3 · B2" embaixo é o endereço fino, que só interessa a quem já
     * está na frente da estante guardando a peça.
     */
    val LARGURA_MINIMA_DO_DETALHE = mmParaPontos(9)

    /** A largura em pontos de um ajuste em mm, presa na faixa que a cabeça alcança. */
    fun pontosDaLargura(mm: Int): Int = mmParaPontos(mm.coerceIn(LARGURA_MINIMA_MM, LARGURA_MAXIMA_MM))

    /** Respiro entre duas vagas da mesma faixa, como na web. */
    val VAO = mmParaPontos(1.5)

    /**
     * Os pesos da faixa do topo e da faixa do pé.
     *
     * Saem do que cada texto MEDE a 2,8mm, e o porquê de cada um está em
     * `montar`. Ficam aqui em cima porque a web reparte as mesmas faixas com os
     * mesmos números (`faixasDaEtiqueta` em lib/estoque-etiqueta-config.ts) e a
     * prévia tem de desenhar o que a impressora produz.
     */
    const val PESO_DO_NOME = 1
    const val PESO_DA_COR = 1
    const val PESO_DO_CODIGO_LEGIVEL = 10
    const val PESO_DO_DETALHE = 3
    const val PESO_DO_RODAPE = 7

    /**
     * Vão entre a faixa do topo e as barras — o mesmo 1mm da etiqueta livre.
     *
     * Ele existe porque barra colada em texto faz o leitor pegar a perna do "p"
     * como se fosse a primeira barra e devolver lixo. Embaixo das barras o vão
     * não é preciso: o código escrito já nasce com a descida da linha de cima
     * separando os dois.
     */
    val VAO_ANTES_DAS_BARRAS = mmParaPontos(1.0)

    /**
     * 18mm — o tamanho que o dono fixou, e é ELE que faz o empilhado caber.
     *
     * Era 15mm, e ele pediu 18: "aumenta um pouco a etiqueta pra ficar com
     * 18mm". No desenho de colunas os 3mm a mais eram luxo (viravam barra mais
     * alta e nada além). No empilhado eles são a diferença entre caber e não
     * caber: 144 pontos = 8 de margem + 35 da faixa do topo com selo + 8 de vão
     * + 66 de barra + 27 da faixa do pé. Não sobra um ponto.
     *
     * Segue AJUSTÁVEL na tela (ver `ConfigImpressora`) porque rolo e lâmina
     * variam por unidade, mas 18mm não é um degrau degradado: é o alvo do
     * desenho. O que existe abaixo dele é rede de segurança, não plano B — a
     * 15mm a faixa do pé já não cabe, e a tela avisa antes do lote sair.
     */
    const val ALTURA_PADRAO_MM = 18

    /**
     * Mínimo de barra que um leitor comum lê: 8mm de altura de barra.
     *
     * Não é preciosismo. Abaixo disso o leitor precisa estar quase
     * perpendicular à etiqueta para pegar uma varredura inteira dentro das
     * barras; a pessoa passa a bipar três vezes por peça e conclui que "o
     * leitor está ruim". A norma (ISO/IEC 15416) fala em 15% da largura do
     * símbolo ou 6,4mm, o que for maior; 8mm é a folga que a prática pede.
     */
    const val ALTURA_MINIMA_BARRAS_MM = 8

    /** Piso e teto do que a tela deixa ajustar. */
    const val ALTURA_MINIMA_MM = 10
    const val ALTURA_MAXIMA_MM = 80

    fun mmParaPontos(mm: Int): Int = mm * PONTOS_POR_MM

    /**
     * Versão decimal — tamanho de LETRA não cai em milímetro inteiro.
     *
     * Com 8 pontos por milímetro, arredondar 2,8mm pra 3mm é um salto de 2
     * pontos de altura numa caixa de 22: muda visivelmente o que cabe na
     * coluna. As medidas de layout (colunas, margens) seguem em inteiro; só a
     * tipografia precisa desta resolução.
     */
    fun mmParaPontos(mm: Double): Int = Math.round(mm * PONTOS_POR_MM).toInt()

    fun pontosParaMm(pontos: Int): Float = pontos / PONTOS_POR_MM.toFloat()

    /** Uma coluna: onde começa e quanto ocupa, em pontos. */
    data class Faixa(val x: Int, val largura: Int) {
        val fim: Int get() = x + largura
    }

    /** Uma barra preta já em PONTOS (não mais em módulos). */
    data class Barra(val x: Int, val largura: Int)

    /**
     * O menor tamanho de letra que AINDA SE LÊ nesta impressora.
     *
     * A 203 dpi são 8 pontos por milímetro, então 2mm de letra é uma caixa de
     * 16 pontos — no limite teórico e abaixo do prático: em papel térmico
     * barato, com a cabeça já usada, sai borrão. Medido no galpão, com a tira
     * na mão: a linha embaixo da localização e o rodapé estavam ilegíveis.
     *
     * Por isso 2,8mm. Abaixo disto o layout NÃO encolhe: prefere CORTAR TEXTO —
     * uma linha a menos, ou reticências. Nome cortado que se lê vale mais que
     * nome inteiro que ninguém decifra; a identidade da peça está no código de
     * barras, não na terceira palavra do nome.
     */
    private const val LETRA_MINIMA_LEGIVEL_MM = 2.8

    /**
     * Margem LATERAL. 1mm além dos 4mm de papel que a cabeça térmica já não
     * alcança de cada lado (80mm de papel, 72mm imprimíveis) — folga de sobra.
     */
    val MARGEM = mmParaPontos(1)

    /**
     * Margem de CIMA e de BAIXO — metade da lateral, e é ela que compra a
     * faixa do pé.
     *
     * A conta: 18mm são 144 pontos. Com 1mm em cima e embaixo sobrariam 128, e
     * a etiqueta de caixa cheia pede 136 (35 + 8 + 66 + 27) — a faixa do pé
     * cairia por 8 pontos, um milímetro. Com 0,5mm sobram 136 e ela cabe justo.
     *
     * Lateralmente a folga é de graça (o papel já não é impresso na borda);
     * verticalmente não existe esse presente, e cada ponto aqui sai da altura
     * útil. Meio milímetro de papel branco não é o que faz a etiqueta parecer
     * apertada — texto faltando é.
     */
    val MARGEM_VERTICAL = mmParaPontos(0.5)

    /**
     * Tamanhos de fonte, em pontos de impressora.
     *
     * TODOS no piso de 2,8mm, e no empilhado isso deixou de ser escolha e
     * virou aritmética: cada faixa de texto custa a altura da etiqueta INTEIRA,
     * e em 18mm cabem exatamente duas. Subir o nome para 4mm empurraria a faixa
     * do topo de 27 para 40 pontos e comeria 1,6mm de barra — a barra é a razão
     * de a etiqueta existir.
     *
     * A hierarquia sai do PESO (nome e local em negrito), da POSIÇÃO (o nome
     * abre a faixa de cima; a data fecha a de baixo) e da LARGURA de vaga que
     * cada um recebe. Nunca do tamanho da letra.
     *
     * A altura que sobra vai toda para as BARRAS. É o melhor uso possível dela:
     * barra mais alta é leitor que pega de mais longe e mais torto.
     */
    object Fonte {
        val PISO = mmParaPontos(LETRA_MINIMA_LEGIVEL_MM)

        val NOME = PISO            // negrito — é o que se reconhece de relance
        val DETALHE = PISO         // cor · dimensões
        val RODAPE = PISO          // data · responsável
        val LOCAL = PISO           // negrito
        val LOCAL_DETALHE = PISO   // o "C3 · B2" que se procura na prateleira
        val CODIGO_LEGIVEL = PISO  // digitado à mão quando a barra borra
        val QUANTIDADE = PISO      // o selo da caixa lacrada
    }

    /**
     * Altura de uma linha de texto com a descida da letra inclusa (1,25 ×
     * corpo). É a caixa que a repartição vertical empilha; a linha de base fica
     * no topo dela mais o corpo da fonte.
     */
    fun caixaDaLinha(fonte: Int): Int = fonte * 5 / 4

    /** Quanto a letra desce abaixo da linha de base (o "g", o "p"). */
    fun descida(fonte: Int): Int = fonte / 4

    /**
     * Reparte uma faixa horizontal entre as vagas que de fato existem, na
     * proporção dos PESOS e descontando os vãos.
     *
     * É o irmão horizontal do `empilhar` que a etiqueta de colunas usava, e
     * existe pelo mesmo motivo: este arquivo é puro e não mede texto, então
     * `montar` reparte pelo PIOR CASO (a peça tem nome, cor · dimensões e
     * local) e quem desenha chama isto de novo com o que a peça de fato tem.
     *
     * Sem isso, cada vaga era desenhada na largura que RESERVOU e a reserva não
     * usada virava buraco. Não é hipótese: o caminho de todo dia do tablet
     * (`ServicoDeImpressao.etiquetaDaUnidade`) imprime o SKU e NÃO tem
     * cor · dimensões — a vaga do meio nascia vazia e o nome, que é a única
     * coisa que se lê de relance, ficava preso em 33mm quando havia 54mm de
     * papel branco à direita dele.
     *
     * Divide-se a proporção ACUMULADA, não vaga a vaga: arredondar uma vez por
     * vaga deixaria até `n-1` pontos sem dono e a última vaga não encostaria na
     * margem direita — meio milímetro de branco que faz a etiqueta parecer
     * torta na tira ao lado.
     */
    fun repartir(x: Int, disponivel: Int, pesos: List<Int>, vao: Int = VAO): List<Faixa> {
        if (pesos.isEmpty()) return emptyList()
        val sobra = (disponivel - vao * (pesos.size - 1)).coerceAtLeast(0)
        val total = pesos.sum().coerceAtLeast(1)
        var cursor = x
        var ate = 0
        var borda = 0
        return pesos.map { peso ->
            ate += peso
            val fim = sobra * ate / total
            val largura = fim - borda
            borda = fim
            val faixa = Faixa(cursor, largura)
            cursor += largura + vao
            faixa
        }
    }

    // ── O selo da caixa ──────────────────────────────────────────────────────
    //
    // Uma etiqueta pode valer 50 folhas de alavanca: a caixa é lacrada, e quem
    // a pega na prateleira não tem como conferir quantas peças tem dentro sem
    // romper o lacre. Se o número não estiver impresso, ele não existe.
    //
    // Etiqueta de UMA peça não imprime nada a respeito. Não é economia de
    // papel: um campo que repete "1 un" em quase toda etiqueta para de ser
    // lido, e aí o dia em que ele diz 50 passa batido. O padrão da etiqueta É
    // uma peça — a exceção é que precisa gritar.
    //
    // No empilhado o selo SUBIU: ele fecha a faixa do topo, encostado na borda
    // direita, logo depois do local. "Onde está" e "quantas tem" continuam
    // sendo a mesma pergunta pra quem está de frente pra prateleira, e agora
    // são lidas na mesma linha. O que ele custa é altura de todo mundo — o
    // quadro é 8 pontos mais alto que uma linha de texto, e a faixa do topo
    // inteira cresce com ele —, e por isso ele só existe quando a etiqueta é
    // caixa de verdade.

    /** Medidas do quadro em volta do número. */
    object Selo {
        val PADDING_X = mmParaPontos(0.7)
        val PADDING_Y = mmParaPontos(0.4)
        const val TRACO = 1

        /** Altura do quadro inteiro, traço incluso. */
        val ALTURA = caixaDaLinha(Fonte.QUANTIDADE) + 2 * (PADDING_Y + TRACO)

        /**
         * Largura RESERVADA na faixa do topo, sem medir texto.
         *
         * O layout é puro e não conhece fonte, mas lado a lado com o local o
         * selo precisa de um pedaço seu — senão os dois se sobrepõem. 10mm é
         * "50 un" a 2,8mm em negrito (~8mm) mais o quadro (2 × 0,7mm de
         * respiro e 2 traços). Um número maior não estoura nada: quem desenha
         * mede de verdade e `textoDaCaixa` desce pro degrau do número pelado.
         *
         * Quem paga são o nome e o local, e só na etiqueta de CAIXA. É o preço
         * certo: o número de peças dentro de um lacre não está escrito em
         * nenhum outro lugar do mundo.
         */
        val LARGURA_RESERVADA = mmParaPontos(10)
    }

    /**
     * O texto do selo, ou `null` quando a etiqueta vale uma peça só.
     *
     * Dois degraus, e NUNCA reticências. O resto da etiqueta corta com "…" sem
     * prejuízo (nome cortado que se lê vale mais que nome inteiro ilegível, e a
     * identidade da peça está no código de barras). Com o número é o contrário:
     * "100…" para 1000 não é informação incompleta, é informação ERRADA, e sai
     * impressa em papel pra alguém contar estoque em cima dela. Por isso o
     * último degrau é o número pelado, que cabe em qualquer coluna.
     *
     * A PALAVRA "CAIXA" SAIU. Ela era o primeiro degrau e nunca mais vai ser
     * impressa: medido na renderização da web, "CAIXA 1000 un" pede ~15mm e
     * vazava pra fora da borda; aqui a coluna 3 tem ~12mm e o aperto é o mesmo.
     * Escolher entre a palavra e o número é fácil. E a palavra fazia menos
     * falta do que o comentário antigo supunha: o quadro só é DESENHADO quando
     * a quantidade passa de 1, então a moldura já avisa que aquilo é lacre com
     * mais de uma peça dentro.
     *
     * QUANDO ele aparece deixou de ser só "quantidade > 1": o item pode ser do
     * TIPO caixa no catálogo, e aí o número sai mesmo valendo 1 — uma caixa de
     * chancelas com uma chancela dentro continua sendo um lacre. O padrão do
     * parâmetro é a regra antiga, então quem não sabe do tipo não muda de
     * comportamento.
     *
     * @param ehCaixa esta etiqueta é caixa? Ver `DadosEtiqueta.ehCaixa`.
     * @param medir largura do texto na tinta que vai desenhar — o layout é
     *              puro e não conhece fonte, então quem chama mede.
     */
    fun textoDaCaixa(
        quantidade: Int,
        largura: Int,
        ehCaixa: Boolean = quantidade > 1,
        medir: (String) -> Int,
    ): String? {
        if (!ehCaixa) return null
        // Quantidade zerada/negativa nunca chega aqui vinda do servidor, mas se
        // chegasse imprimiria "0 un" num lacre que tem alguma coisa dentro —
        // pior que não imprimir nada.
        if (quantidade < 1) return null
        val degraus = listOf("$quantidade un", "$quantidade")
        return degraus.firstOrNull { medir(it) <= largura } ?: degraus.last()
    }

    /**
     * O que a etiqueta deixou de fora nesta altura e nesta largura.
     *
     * Substituiu o enum `Compactacao` (COMPLETA / SEM_RODAPE / SO_BARRAS)
     * porque um enum de três valores não descreve DOIS EIXOS de sacrifício sem
     * virar produto cartesiano com nome de degrau. Uma LISTA do que caiu
     * descreve, e é ela que a tela lê pra avisar.
     *
     * ── O QUE MUDOU COM O EMPILHADO ──────────────────────────────────────────
     *
     * No desenho de colunas o texto subia AO LADO das barras, então perder uma
     * linha da coluna 1 não devolvia um ponto de altura pro código: o eixo
     * "quantas linhas cabem" era quase todo cosmético. Empilhado, os dois eixos
     * ficaram limpos e cada um tem um dono:
     *
     *  · ALTURA — só a FAIXA DO PÉ cede. É a única coisa que mora abaixo das
     *    barras, então é a única que devolve altura pra elas. Dentro dela o
     *    código escrito e a data caem JUNTOS: dividem a mesma linha, e meia
     *    linha não existe. (`SEGUNDA_LINHA_DO_NOME` saiu daqui e do desenho: no
     *    empilhado o nome tem uma faixa de ~33mm em vez de uma coluna de 21mm,
     *    e a segunda linha custaria 27 pontos de barra.)
     *
     *  · LARGURA — as vagas da faixa do topo cedem, na ordem abaixo. O nome
     *    NUNCA cede: ele e as barras são a etiqueta. (`COLUNA_DO_NOME` saiu
     *    pelo mesmo motivo — com as barras fora da disputa, não existe mais
     *    largura em que o nome não caiba.)
     *
     * A ORDEM DE SACRIFÍCIO É A ORDEM DESTE ENUM, porque `naoCoube` é ordenada
     * pelo ordinal e é essa a ordem da frase que a tela lê.
     */
    enum class Peca(val descricao: String, val porLargura: Boolean = false) {
        // ── O que a ALTURA come ──────────────────────────────────────────────
        //
        // Os dois moram na faixa do pé e caem juntos, mas continuam sendo duas
        // entradas: a frase precisa dizer as duas coisas que sumiram, senão
        // quem lê "não cabe o código escrito" cola a tira achando que a data
        // saiu. Desligar UM no escritório não devolve altura nenhuma — a faixa
        // continua de pé por causa do outro. Desligar OS DOIS devolve 3,4mm
        // direto pras barras, e é o maior ganho que a lista de campos tem.
        CODIGO_LEGIVEL("o código escrito embaixo das barras"),
        DATA_E_RESPONSAVEL("a data e o responsável"),

        // ── O que a LARGURA come, na ordem em que cede ───────────────────────
        //
        //  1. O DETALHE DA PRATELEIRA. É o mais barato: "GAL-A" continua
        //     impresso e a pessoa acha a prateleira andando dois metros. E
        //     cortá-lo pela metade seria pior que perdê-lo — "C3 · B…" manda
        //     procurar numa baia que não existe.
        //  2. A COR E AS DIMENSÕES. É a única linha que se confere OLHANDO a
        //     peça: a chapa branca é branca, e 2750×1840 se mede com a trena.
        //  3. O LOCAL. Onde a peça está se descobre olhando a prateleira em que
        //     ela está — é a última informação da etiqueta que o mundo repete.
        //     O SELO NÃO CEDE COM ELE: o quadro tem vaga própria encostada na
        //     borda direita, então numa tira estreita a etiqueta de caixa perde
        //     o "GAL-A" e mantém o "50 un". É a ordem certa — quantas peças tem
        //     dentro de um lacre não está escrito em nenhum outro lugar do
        //     mundo, e no desenho de colunas isso custava a coluna inteira.
        DETALHE_DO_LOCAL("o detalhe da prateleira", porLargura = true),
        COR_DIMENSOES("a cor e as dimensões", porLargura = true),
        LOCAL("o local ao lado do nome", porLargura = true),
    }

    // ── O que o escritório MANDOU imprimir ───────────────────────────────────
    //
    // O layout sempre soube tirar coisa da etiqueta quando o tamanho apertava;
    // o que ele não sabia era que ALGUMAS COISAS NINGUÉM QUER. Um galpão que
    // não usa prateleira numerada imprime "C3 · B2" vazio; um que refaz a
    // etiqueta toda semana não tem uso pra data.
    //
    // ── POR QUE ISSO NÃO É "MAIS UM INTERRUPTOR" ─────────────────────────────
    //
    // Porque desligar um campo DEVOLVE espaço em vez de gastar — e no
    // empilhado ficou claro em qual EIXO cada um devolve.
    //
    // `COR_DIMENSOES` e `LOCAL_DETALHE` devolvem LARGURA: a vaga sai da faixa
    // do topo e o nome, que é a primeira vaga, engorda na hora. `CODIGO_LEGIVEL`
    // e `DATA_RESPONSAVEL` devolvem ALTURA, e só JUNTOS: os dois dividem a
    // faixa do pé, então desligar um deixa a faixa de pé pelo outro. Desligados
    // os dois, os 27 pontos dela (3,4mm) voltam DIRETO pra barra — a 14mm a
    // barra sai com 9mm em vez de 5,6, que é a diferença entre bipar e não
    // bipar. É o que faz a etiqueta pequena valer a pena.
    //
    // ── O QUE NÃO ENTRA NESTA LISTA, E POR QUÊ ───────────────────────────────
    //
    //  · o NOME e as BARRAS. São a etiqueta. Sem barras não há por que imprimir
    //    papel, e sem nome ninguém reconhece a peça de relance na pilha.
    //  · o LOCAL e o SELO DA CAIXA. Já somem sozinhos quando a peça não os tem
    //    (`temLocal`, `ehCaixa`) — um interruptor aqui não acrescentaria poder
    //    nenhum, só uma segunda maneira de a mesma coisa estar desligada. E o
    //    selo é o único número da etiqueta que ninguém confere sem romper o
    //    lacre.
    //
    // A chave é a MESMA string dos três lados (banco, servidor e aqui). Um mapa
    // de tradução entre snake_case e enum seria a quarta coisa a manter em dia,
    // e a primeira a divergir sem ninguém notar.
    enum class CampoEtiqueta(val chave: String) {
        COR_DIMENSOES("cor_dimensoes"),
        DATA_RESPONSAVEL("data_responsavel"),
        CODIGO_LEGIVEL("codigo_legivel"),
        LOCAL_DETALHE("local_detalhe");

        companion object {
            /**
             * Lê a lista que veio do escritório, ignorando o que não conhece.
             *
             * Ignorar é a decisão certa AQUI e o oposto do que o servidor faz
             * (lá uma chave desconhecida é 400 com frase). A diferença é quem
             * está do outro lado: no servidor há uma pessoa esperando resposta
             * e capaz de corrigir; aqui há um tablet offline no galpão, e um
             * campo novo que uma versão futura do ERP mande derrubaria a
             * impressão do lote inteiro por causa de uma palavra desconhecida.
             */
            fun deChaves(chaves: Iterable<String>): Set<CampoEtiqueta> =
                chaves.mapNotNull { bruto ->
                    val limpo = bruto.trim()
                    entries.firstOrNull { it.chave == limpo }
                }.toSet()
        }
    }

    data class LayoutEtiqueta(
        val larguraPontos: Int,
        val alturaPontos: Int,
        val margem: Int,
        val margemVertical: Int,

        // ── Faixa do topo: o que é, como é, onde está, quantas tem ───────────
        /** Nome do produto — abre a faixa, à esquerda, em negrito. */
        val faixaNome: Faixa,
        /** Cor · dimensões. `null` quando a largura não comportou ou o escritório desligou. */
        val faixaCorDimensoes: Faixa?,
        /** Local — "GAL-A", em negrito. `null` quando cedeu. */
        val faixaLocal: Faixa?,
        /** O quadro do selo, encostado na borda direita. `null` quando não é caixa. */
        val faixaSelo: Faixa?,
        /** Linha de BASE de todo texto da faixa do topo. */
        val baseDoTopo: Int,
        /** Borda de BAIXO do quadro do selo; `null` quando a etiqueta não é caixa. */
        val baseSelo: Int?,
        /** Altura que a faixa do topo ocupa — cresce quando o selo entra. */
        val alturaDoTopo: Int,

        // ── As barras, na largura ÚTIL inteira ───────────────────────────────
        val barras: List<Barra>,
        /** Largura de UM módulo, em pontos. É o "X dimension" do código. */
        val moduloPontos: Int,
        val topoBarras: Int,
        val alturaBarras: Int,
        /** Onde as barras começam e terminam — centradas na largura útil. */
        val faixaBarras: Faixa,

        // ── Faixa do pé: qual código, de quando, de quem ─────────────────────
        /** O código escrito, à esquerda. `null` quando a faixa do pé não coube. */
        val faixaCodigoLegivel: Faixa?,
        /** "C3 · B2", no meio da faixa do pé. `null` quando cedeu ou foi desligado. */
        val faixaDetalheDoLocal: Faixa?,
        /** "04/08 18:57 · João", encostado na borda direita. `null` idem. */
        val faixaRodape: Faixa?,
        /** Linha de BASE do texto da faixa do pé; `null` quando ela não coube. */
        val baseDoPe: Int?,

        val naoCoube: List<Peca>,
        val aviso: String?,
    ) {
        val alturaBarrasMm: Float get() = pontosParaMm(alturaBarras)
        val larguraMm: Float get() = pontosParaMm(larguraPontos)
        val barrasLegiveis: Boolean get() = alturaBarras >= mmParaPontos(ALTURA_MINIMA_BARRAS_MM)

        /** O módulo alcançado chegou nos 0,25mm que a etiqueta procura? */
        val moduloNoAlvo: Boolean get() = moduloPontos >= MODULO_ALVO_PONTOS

        /** O "C3 · B2" saiu impresso? Quem desenha e a tela perguntam assim. */
        val mostraDetalheDoLocal: Boolean get() = faixaDetalheDoLocal != null

        /** A última linha de pontos em que se pode queimar tinta. */
        val limiteDeBaixo: Int get() = alturaPontos - margemVertical
    }

    /**
     * Monta o layout de uma etiqueta.
     *
     * A ordem em que as decisões são tomadas é a ordem em que elas se
     * atropelam, e trocá-la muda o desenho:
     *
     *  1. as BARRAS levam a largura útil inteira — é a decisão que define o
     *     resto, e é ela que devolveu o módulo de 0,25mm;
     *  2. a FAIXA DO PÉ pergunta se sobra altura pra ela depois dos 8mm de
     *     barra; se não sobra, ela inteira cai e a altura volta pras barras;
     *  3. a FAIXA DO TOPO reparte a largura entre nome, cor e local, cedendo na
     *     ordem de `Peca` até que cada vaga que ficou esteja acima do mínimo
     *     dela;
     *  4. a altura que ninguém reclamou é das barras.
     *
     * @param codigo    o texto do código de barras (e do código legível).
     * @param temLocal  se a peça tem local conhecido. Sem local E sem caixa, a
     *                  vaga da direita some e a largura volta pro nome — vaga
     *                  vazia é pior que vaga nenhuma.
     * @param ehCaixa   se a etiqueta vale mais de uma peça. Muda a geometria de
     *                  verdade: o selo reserva 10mm à direita da faixa do topo
     *                  E deixa a faixa 8 pontos mais alta, porque o quadro é
     *                  mais alto que uma linha de texto.
     * @param alturaMm  altura da etiqueta, ajuste da tela.
     * @param larguraPontos  largura IMPRIMÍVEL em pontos, ajuste da tela. Presa
     *                  na faixa que a cabeça alcança — pedir mais que 72mm não
     *                  imprime mais, só some em silêncio na borda do papel.
     * @param ocultos   os campos que o escritório mandou NÃO imprimir. Vazio é
     *                  a etiqueta de sempre; cada campo desligado devolve o
     *                  espaço dele pros que ficaram. Ver `CampoEtiqueta`.
     */
    fun montar(
        codigo: String,
        temLocal: Boolean,
        ehCaixa: Boolean = false,
        alturaMm: Int = ALTURA_PADRAO_MM,
        larguraPontos: Int = LARGURA_PADRAO_PONTOS,
        ocultos: Set<CampoEtiqueta> = emptySet(),
    ): LayoutEtiqueta {
        require(Code128.aceita(codigo)) { "código \"$codigo\" não cabe no Code128-B" }

        val altura = mmParaPontos(alturaMm.coerceIn(ALTURA_MINIMA_MM, ALTURA_MAXIMA_MM))
        val largura = larguraPontos.coerceIn(mmParaPontos(LARGURA_MINIMA_MM), mmParaPontos(LARGURA_MAXIMA_MM))
        val margem = MARGEM
        val margemVertical = MARGEM_VERTICAL
        val util = largura - 2 * margem

        // O código não cabe nem no menor módulo possível: não existe desenho, e
        // desenhar assim mesmo cortaria as barras na borda do papel — o que não
        // é um código incompleto, é um código que escaneia OUTRA coisa. Recusa
        // com a frase, como já se recusa caractere fora do Code128-B.
        val estreitaDemais = problemaDaLargura(codigo, largura)
        require(estreitaDemais == null) { estreitaDemais!! }

        val naoCoube = ArrayList<Peca>()

        // ── 1. As barras, na largura ÚTIL inteira ────────────────────────────
        //
        // Não há mais teto de 60% e não há mais coluna do meio: o código toma o
        // que a margem deixou. É a linha que este redesenho existe pra escrever
        // — com 560 pontos e um código de 264 módulos o módulo sai 2 (0,25mm),
        // que é o da etiqueta que o dono aprovou; no desenho de colunas o mesmo
        // código recebia 336 pontos e o módulo caía pra 1 (0,125mm).
        //
        // O módulo tem que ser um número INTEIRO de pontos. Módulo fracionário
        // (ex.: 1,4 ponto) faz o desenhista arredondar cada barra pra um lado
        // diferente: uma barra de 2 módulos ora sai com 3 pontos, ora com 2, e
        // a PROPORÇÃO entre barras — que é o que o leitor mede — deixa de
        // fechar. Código de barras não se estica, ele se dimensiona.
        val modulos = Code128.totalDeModulos(codigo)
        val modulo = (util / modulos).coerceAtLeast(MODULO_MINIMO_PONTOS)
        val larguraCodigo = modulos * modulo
        // Centrado, e o que sobra é papel branco dos dois lados. Encostar as
        // barras na margem esquerda deixaria a sobra toda de um lado só e a
        // tira pareceria impressa torta.
        val faixaBarras = Faixa(margem + (util - larguraCodigo) / 2, larguraCodigo)

        val disponivelEmAltura = (altura - 2 * margemVertical).coerceAtLeast(1)
        val minimoBarras = mmParaPontos(ALTURA_MINIMA_BARRAS_MM)

        // ── 2. A faixa do topo, e quanto ela custa de altura ─────────────────
        //
        // O quadro do selo é 8 pontos mais alto que uma linha de texto, então
        // ele empurra a faixa inteira. Isso só acontece na etiqueta de caixa —
        // que é onde vale a pena, porque o número do lacre não está escrito em
        // nenhum outro lugar do mundo.
        val caixaDeTexto = caixaDaLinha(Fonte.NOME)
        val alturaDoTopo = if (ehCaixa) maxOf(caixaDeTexto, Selo.ALTURA) else caixaDeTexto
        val baseDoTopo = margemVertical + (alturaDoTopo - caixaDeTexto) / 2 + Fonte.NOME
        val baseSelo = if (ehCaixa) margemVertical + alturaDoTopo else null

        // ── 3. A faixa do pé: a única coisa que devolve altura ───────────────
        //
        // Ela é a única que mora ABAIXO das barras, então cortá-la é a única
        // maneira de a etiqueta baixa continuar com barra legível. Cai INTEIRA:
        // o código escrito e o rodapé dividem uma linha só, e meia linha não
        // existe. Por isso desligar só um dos dois no escritório não devolve
        // altura nenhuma — e desligar os dois devolve os 27 pontos completos.
        val caixaDoPe = caixaDaLinha(Fonte.CODIGO_LEGIVEL)
        val querOCodigo = CampoEtiqueta.CODIGO_LEGIVEL !in ocultos
        val querRodape = CampoEtiqueta.DATA_RESPONSAVEL !in ocultos
        val alguemNoPe = querOCodigo || querRodape
        val sobraSemOPe = disponivelEmAltura - alturaDoTopo - VAO_ANTES_DAS_BARRAS
        val cabeOPe = alguemNoPe && sobraSemOPe - caixaDoPe >= minimoBarras
        // `quer… &&`: campo desligado nunca é "não coube". A tela leria como
        // "aumente a altura", e a altura não traz de volta o que ninguém pediu.
        if (alguemNoPe && !cabeOPe) {
            if (querOCodigo) naoCoube += Peca.CODIGO_LEGIVEL
            if (querRodape) naoCoube += Peca.DATA_E_RESPONSAVEL
        }

        val topoBarras = margemVertical + alturaDoTopo + VAO_ANTES_DAS_BARRAS
        val fimBarras = if (cabeOPe) altura - margemVertical - caixaDoPe else altura - margemVertical
        val alturaBarras = (fimBarras - topoBarras).coerceAtLeast(1)
        val baseDoPe = if (cabeOPe) altura - margemVertical - descida(Fonte.CODIGO_LEGIVEL) else null

        // ── 4. Repartir a faixa do topo ──────────────────────────────────────
        //
        // O local sai FIXO (10mm) e o que sobra é dividido IGUAL entre o nome e
        // a cor. Igual porque os dois medem quase o mesmo — "Folha de alavanca"
        // 24,1mm e "Branco · 2750×1840" 25,4mm —, e a 72mm isso dá 28,5mm pra
        // cada: os dois saem inteiros, com folga em vez de raspando.
        //
        // Uma proporção a favor do nome (9 : 8, que foi a primeira tentativa)
        // deixava a cor com 25,3mm contra os 25,4 que ela mede, e a diferença
        // aparecia como reticência na tela. Décimo de milímetro não é margem de
        // desenho: é sorte.
        //
        // A pergunta "cabe?" é feita na PROPORÇÃO final, nunca na soma dos
        // mínimos. A diferença é um degrau que já existiu aqui: somando, uma
        // vaga passa e a proporção a deixa abaixo do mínimo DELA — e o
        // resultado era uma etiqueta que PIORAVA ao ser alargada. Quem alarga a
        // tira e vê o nome encolher conclui que o ajuste está quebrado, e
        // conclui certo.
        val querCorDimensoes = CampoEtiqueta.COR_DIMENSOES !in ocultos
        val querDetalheDoLocal = CampoEtiqueta.LOCAL_DETALHE !in ocultos
        val querLocal = temLocal

        val larguraDoSelo = if (ehCaixa) minOf(Selo.LARGURA_RESERVADA, util) else 0
        val paraOTexto = (util - (if (ehCaixa) larguraDoSelo + VAO else 0)).coerceAtLeast(0)

        var comCor = querCorDimensoes
        var comLocal = querLocal
        var vagas = medirOTopo(paraOTexto, comCor, comLocal)
        // A ordem destes passos É a ordem de sacrifício, e ela é a de `Peca`.
        if (vagas == null && comCor) {
            comCor = false
            naoCoube += Peca.COR_DIMENSOES
            vagas = medirOTopo(paraOTexto, comCor, comLocal)
        }
        if (vagas == null && comLocal) {
            comLocal = false
            naoCoube += Peca.LOCAL
            vagas = medirOTopo(paraOTexto, comCor, comLocal)
        }
        // Nem o nome sozinho passa do mínimo: a tira é estreita demais pra
        // qualquer texto. Desenha-se o que houver — o nome cortado com
        // reticências ainda distingue duas pilhas, e o código de barras, que é
        // a identidade da peça, já foi garantido lá em cima pela recusa.
        val faixas = vagas ?: repartir(margem, paraOTexto, listOf(1))
        val faixaNome = faixas[0]
        var proxima = 1
        val faixaCorDimensoes = if (comCor && faixas.size > proxima) faixas[proxima++] else null
        val faixaLocal = if (comLocal && faixas.size > proxima) faixas[proxima] else null
        val faixaSelo = if (ehCaixa) Faixa(margem + util - larguraDoSelo, larguraDoSelo) else null

        // ── 5. Repartir a faixa do pé ────────────────────────────────────────
        //
        // Peso 3 : 2 pro código escrito, e não porque ele valha mais que a data
        // — é que ele é MONOESPAÇADO, e monoespaçada a 2,8mm gasta 1,7mm por
        // caractere. "MDF6MM-BR-18-000042" pede 32mm; "04/08 18:57 · João" pede
        // 25mm em sans. Com peso igual o código cortaria a 72mm, que é a
        // largura em que ele deveria caber inteiro.
        //
        // O RODAPÉ FECHA A ETIQUETA, encostado na borda direita, e é ali que o
        // horário mora. Discreto pela POSIÇÃO e não pelo tamanho: o piso de
        // 2,8mm não deixa encolher letra nenhuma, então o que faz a data não
        // competir com o nome é ela abrir o canto de menos tráfego da tira —
        // o inferior direito, depois das barras, onde o olho só vai quando
        // procura. Antes ela dividia a coluna 1 com o nome e disputava
        // caractere a caractere com ele.
        // O DETALHE DA PRATELEIRA mora aqui, entre os dois. Ele só existe se a
        // peça tem local (senão "C3 · B2" não quer dizer nada) e se a vaga dele
        // chega aos 9,6mm que ele mede — cortado no meio ("C3 · B…") ele manda
        // procurar numa baia que não existe, que é pior que não sair.
        var comDetalhe = querDetalheDoLocal && comLocal
        var pesosDoPe = pesosDoPe(querOCodigo, comDetalhe, querRodape)
        var faixasDoPe = if (cabeOPe) medirOPe(util, pesosDoPe, querOCodigo, comDetalhe, querRodape) else null
        if (cabeOPe && faixasDoPe == null && comDetalhe) {
            comDetalhe = false
            naoCoube += Peca.DETALHE_DO_LOCAL
            pesosDoPe = pesosDoPe(querOCodigo, comDetalhe, querRodape)
            faixasDoPe = medirOPe(util, pesosDoPe, querOCodigo, comDetalhe, querRodape)
        }
        // Nem no piso: o código escrito e o horário cortam com reticências, que
        // é o que eles já faziam. Reticências no código são aceitáveis (quem
        // digita tem a peça na mão); no horário quem cede é o nome de quem
        // imprimiu, nunca a data. Ver `DadosEtiqueta.rodape`.
        val doPe = faixasDoPe ?: if (cabeOPe) repartir(margem, util, pesosDoPe) else emptyList()
        var noPe = 0
        val faixaCodigoLegivel = if (cabeOPe && querOCodigo) doPe[noPe++] else null
        val faixaDetalheDoLocal = if (cabeOPe && comDetalhe) doPe[noPe++] else null
        val faixaRodape = if (cabeOPe && querRodape) doPe[noPe] else null

        val barras = Code128.barras(codigo).map {
            Barra(x = faixaBarras.x + it.inicio * modulo, largura = it.largura * modulo)
        }

        naoCoube.sort()
        return LayoutEtiqueta(
            larguraPontos = largura,
            alturaPontos = altura,
            margem = margem,
            margemVertical = margemVertical,
            faixaNome = faixaNome,
            faixaCorDimensoes = faixaCorDimensoes,
            faixaLocal = faixaLocal,
            faixaSelo = faixaSelo,
            baseDoTopo = baseDoTopo,
            baseSelo = baseSelo,
            alturaDoTopo = alturaDoTopo,
            barras = barras,
            moduloPontos = modulo,
            topoBarras = topoBarras,
            alturaBarras = alturaBarras,
            faixaBarras = faixaBarras,
            faixaCodigoLegivel = faixaCodigoLegivel,
            faixaDetalheDoLocal = faixaDetalheDoLocal,
            faixaRodape = faixaRodape,
            baseDoPe = baseDoPe,
            naoCoube = naoCoube,
            aviso = aviso(alturaBarras, minimoBarras, modulo, naoCoube),
        )
    }

    /**
     * As vagas da faixa do topo NESTA combinação, ou `null` quando alguma delas
     * ficaria abaixo do mínimo dela.
     *
     * Devolver `null` em vez de "a maior que couber" é o que faz a etiqueta
     * NUNCA piorar ao ser alargada: quem pergunta tenta a combinação mais rica
     * primeiro e vai cedendo na ordem de `Peca`, então uma tira mais larga
     * nunca responde `null` onde a mais estreita respondeu com faixas.
     */
    private fun medirOTopo(disponivel: Int, comCor: Boolean, comLocal: Boolean): List<Faixa>? {
        // O local sai FIXO da conta antes de qualquer proporção — o tamanho dele
        // não depende do cadastro. O que sobra é do nome e da cor, 9 : 8, que é
        // a proporção do que os dois MEDEM ("Folha de alavanca" 24,1mm,
        // "Branco · 2750×1840" 25,4mm). A 72mm isso dá 30 e 27: inteiros.
        val doLocal = if (comLocal) LARGURA_DO_LOCAL else 0
        val paraNomeECor = disponivel - doLocal - (if (comLocal) VAO else 0)
        if (paraNomeECor <= 0) return null

        val pesos = buildList {
            add(PESO_DO_NOME)
            if (comCor) add(PESO_DA_COR)
        }
        // Sem cor, o nome leva tudo — é o caminho de todo dia do tablet.
        val minimos = buildList {
            add(LARGURA_MINIMA_DO_NOME)
            if (comCor) add(LARGURA_MINIMA_DA_COR)
        }
        val faixas = repartir(MARGEM, paraNomeECor, pesos)
        if (faixas.indices.any { faixas[it].largura < minimos[it] }) return null

        return if (comLocal) faixas + Faixa(faixas.last().fim + VAO, doLocal) else faixas
    }

    private fun pesosDoPe(comCodigo: Boolean, comDetalhe: Boolean, comRodape: Boolean): List<Int> =
        buildList {
            if (comCodigo) add(PESO_DO_CODIGO_LEGIVEL)
            if (comDetalhe) add(PESO_DO_DETALHE)
            if (comRodape) add(PESO_DO_RODAPE)
        }

    /**
     * As vagas da faixa do pé, ou `null` quando o DETALHE não teria os 9,6mm
     * que ele mede.
     *
     * Só o detalhe faz a conta falhar. O código escrito e o horário cortam com
     * reticências desde sempre e continuam cortando — a diferença é o que um
     * corte significa: "MDF6MM-BR-18-00…" ainda é reconhecível com a peça na
     * mão, e "04/08 18:57 · Jo" ainda diz o turno; "C3 · B…" manda procurar
     * numa baia que não existe.
     *
     * 10 : 3 : 7 é a proporção do que os três MEDEM (31,9 · 9,6 · 23,3mm). A
     * 72mm dá 33,5 · 10 · 23,4: os três inteiros.
     */
    private fun medirOPe(
        disponivel: Int,
        pesos: List<Int>,
        comCodigo: Boolean,
        comDetalhe: Boolean,
        comRodape: Boolean,
    ): List<Faixa>? {
        if (pesos.isEmpty()) return emptyList()
        val faixas = repartir(MARGEM, disponivel, pesos)
        if (!comDetalhe) return faixas
        val ondeEstaODetalhe = if (comCodigo) 1 else 0
        return if (faixas[ondeEstaODetalhe].largura >= LARGURA_MINIMA_DO_DETALHE) faixas else null
    }

    /**
     * A frase que a tela mostra ao lado do ajuste de altura. Diz o que está
     * acontecendo AGORA com o número escolhido — quem reduz a altura merece
     * saber o que está perdendo antes de sair imprimindo o lote.
     *
     * Ela é montada a partir da lista `naoCoube`, e não de um texto por degrau,
     * exatamente para não poder mentir: se um dia alguém acrescentar uma peça
     * ao layout e esquecer do aviso, a peça não aparece na lista e o teste
     * `o aviso lista exatamente o que sumiu` acusa.
     */
    private fun aviso(alturaBarras: Int, minimoBarras: Int, modulo: Int, naoCoube: List<Peca>): String? {
        if (alturaBarras < minimoBarras) {
            return "Barras com ${"%.1f".format(pontosParaMm(alturaBarras))}mm — abaixo dos " +
                "${ALTURA_MINIMA_BARRAS_MM}mm que um leitor comum precisa. Aumente a altura."
        }
        // Altura e largura comem coisas diferentes, e dizer "nesta altura não
        // cabe a coluna do local" mandaria a pessoa mexer no número errado —
        // ela aumentaria a altura, nada mudaria, e a conclusão seria que o
        // ajuste não funciona. Duas frases, cada uma apontando pro seu botão.
        val porAltura = naoCoube.filter { !it.porLargura }
        val porLargura = naoCoube.filter { it.porLargura }
        val frases = buildList {
            if (porAltura.isNotEmpty()) add("Nesta altura não cabe ${emLista(porAltura.map { it.descricao })}.")
            if (porLargura.isNotEmpty()) add("Nesta largura não cabe ${emLista(porLargura.map { it.descricao })}.")
            // A barra FINA é um terceiro assunto, e vem por último de propósito:
            // a etiqueta sai, e sai completa. O que ela diz é que este código é
            // comprido demais pra esta tira — a barra fica no piso de 0,125mm em
            // vez dos 0,25mm que o leitor pega de primeira. Recusar seria pior
            // (etiqueta que não sai é pior que etiqueta borrada), calar também.
            if (modulo < MODULO_ALVO_PONTOS) {
                add(
                    "As barras saem com ${"%.3f".format(pontosParaMm(modulo))}mm de traço — " +
                        "o código é comprido demais pra esta largura, e o leitor vai precisar de " +
                        "duas ou três passadas. Alargue a tira ou encurte o código.",
                )
            }
        }
        return frases.joinToString(" ").takeIf { it.isNotEmpty() }
    }

    /**
     * O que impede ESTE código de virar barras NESTA largura, ou `null`.
     *
     * A conta é curta e a consequência não: o Code128 gasta um número fixo de
     * módulos (11 por caractere, mais START, checksum, STOP e as duas zonas
     * quietas), e o menor módulo que a cabeça térmica sabe queimar é UM ponto.
     * Se o total não cabe na largura, não existe desenho — só existe barra
     * cortada na borda do papel, que escaneia OUTRA coisa ou nada.
     *
     * Por que uma função separada, e pura: a mesma pergunta é feita em três
     * lugares e nenhum deles pode responder diferente — a tela (pra avisar
     * antes), o `montar` (pra recusar) e o `prepararLote` (pra não derrubar um
     * lote inteiro por causa de um código comprido). Espelho em TypeScript:
     * `problemaDaLargura` em lib/estoque-etiqueta-config.ts.
     */
    fun problemaDaLargura(codigo: String, larguraPontos: Int = LARGURA_PADRAO_PONTOS): String? {
        if (!Code128.aceita(codigo)) return "o código \"$codigo\" não cabe no Code128-B"
        val largura = larguraPontos.coerceIn(mmParaPontos(LARGURA_MINIMA_MM), mmParaPontos(LARGURA_MAXIMA_MM))
        val util = largura - 2 * MARGEM
        val pedido = Code128.totalDeModulos(codigo) * MODULO_MINIMO_PONTOS
        if (pedido <= util) return null
        return "o código \"$codigo\" pede ${"%.0f".format(pontosParaMm(pedido))}mm de barras e nesta " +
            "largura de ${"%.0f".format(pontosParaMm(largura))}mm sobram " +
            "${"%.0f".format(pontosParaMm(util))}mm. Aumente a largura ou encurte o código"
    }

    /** O maior código (em caracteres) que ainda vira barras nesta largura. */
    fun maxCaracteresDoCodigo(larguraPontos: Int = LARGURA_PADRAO_PONTOS): Int {
        val largura = larguraPontos.coerceIn(mmParaPontos(LARGURA_MINIMA_MM), mmParaPontos(LARGURA_MAXIMA_MM))
        val util = largura - 2 * MARGEM
        // START + checksum + STOP com a barra de terminação = 35 módulos, mais
        // 10 de zona quieta de cada lado. Cada caractere custa 11.
        val fixos = 35 + 2 * Code128.ZONA_QUIETA
        return ((util / MODULO_MINIMO_PONTOS - fixos) / 11).coerceAtLeast(0)
    }

    /** "a, b nem c" — a vírgula do meio e o "nem" do fim, como se fala. */
    private fun emLista(itens: List<String>): String =
        if (itens.size <= 1) itens.joinToString()
        else itens.dropLast(1).joinToString(", ") + " nem " + itens.last()

    // ── Do bitmap para os bytes do GS v 0 ────────────────────────────────────

    /**
     * Empacota pixels ARGB em 1 bit por ponto, do jeito que `GS v 0` espera:
     * bit 1 = ponto PRETO, bit mais significativo = ponto mais à esquerda,
     * cada linha começando num byte novo.
     *
     * Está aqui, em Kotlin puro e recebendo `IntArray`, e não junto do
     * `android.graphics.Canvas`, exatamente para poder ser testado: inverter o
     * sentido do bit produz uma etiqueta em NEGATIVO — fundo todo preto — que
     * gasta o rolo inteiro e a cabeça térmica junto.
     *
     * O limiar é grosseiro de propósito. Impressora térmica não tem cinza: ou
     * queima o ponto ou não queima. Meio-tom vira ruído, e ruído dentro de um
     * código de barras é barra fantasma.
     */
    fun empacotar(pixels: IntArray, largura: Int, altura: Int, limiar: Int = 128): ByteArray {
        require(pixels.size >= largura * altura) {
            "empacotar: ${pixels.size} pixels para ${largura}x$altura"
        }
        val larguraBytes = (largura + 7) / 8
        val saida = ByteArray(larguraBytes * altura)
        for (y in 0 until altura) {
            val baseLinha = y * largura
            val baseSaida = y * larguraBytes
            for (x in 0 until largura) {
                val p = pixels[baseLinha + x]
                // Luminância aproximada. Como só existem preto e branco no
                // desenho, qualquer aproximação razoável dá o mesmo resultado;
                // a fórmula está aqui para o caso de o antialiasing do Canvas
                // deixar cinza na borda da letra.
                val r = (p shr 16) and 0xFF
                val g = (p shr 8) and 0xFF
                val b = p and 0xFF
                val luz = (r * 77 + g * 151 + b * 28) shr 8
                if (luz < limiar) {
                    saida[baseSaida + (x shr 3)] =
                        (saida[baseSaida + (x shr 3)].toInt() or (0x80 shr (x and 7))).toByte()
                }
            }
        }
        return saida
    }
}

/**
 * O que vai impresso numa etiqueta.
 *
 * `nome` e `local` são anuláveis porque o tablet nem sempre sabe: a
 * sincronização devolve os CÓDIGOS das unidades geradas, não a ficha do
 * produto. Quando o nome falta, o SKU (que está dentro do próprio código)
 * ocupa o lugar — é a informação verdadeira mais próxima. Inventar um nome
 * seria pior que não ter: uma etiqueta com o produto errado escrito é uma
 * peça perdida no galpão.
 */
data class DadosEtiqueta(
    val codigo: String,
    val nome: String,
    /**
     * Quantas PEÇAS esta etiqueta vale. O padrão é 1 — etiqueta antiga, e
     * qualquer fila que só conheça o código da unidade, valem uma peça, que é
     * como o galpão funcionava antes da caixa existir. Ler ausência como zero
     * zeraria a prateleira em silêncio; é a mesma decisão de
     * `pecasDaUnidade()` no lado TypeScript (lib/estoque-unidades.ts).
     */
    val quantidade: Int = 1,
    /**
     * O item é do TIPO caixa no catálogo (`estoque_itens.etiqueta_tipo`).
     *
     * Existe porque `quantidade > 1` sozinho errava o caso que importa: uma
     * caixa de chancelas com UMA chancela dentro saía pelada, e quem a pega
     * assume peça avulsa e abre o lacre pra conferir — que é o que o lacre
     * existia pra evitar.
     *
     * Quem preenche é o `ServicoDeImpressao`, cruzando o SKU de dentro do
     * código com a lista que veio do escritório no bootstrap. `false` é o
     * padrão e reproduz o comportamento de sempre.
     */
    val tipoCaixa: Boolean = false,
    val corDimensoes: String? = null,
    val local: String? = null,
    val localDetalhe: String? = null,
    val responsavel: String? = null,
    val data: String? = null,
) {
    /**
     * A etiqueta escreve quantas peças vale.
     *
     * O TIPO decide o caso do 1, e só ele: `tipoCaixa` escreve sempre, e sem
     * ele o número aparece quando há de fato mais de uma peça. Essa segunda
     * metade é trava, não descuido — "peça única" quer dizer "não invente um
     * '1 un' que ninguém vai ler", nunca "esconda o número". Uma etiqueta de
     * chapa valendo 4 tem 4 peças na pilha, e alguém vai contar estoque em
     * cima do papel.
     */
    val ehCaixa: Boolean get() = tipoCaixa || quantidade > 1

    val rodape: String?
        get() = listOfNotNull(data?.takeIf { it.isNotBlank() }, responsavel?.takeIf { it.isNotBlank() })
            .joinToString(" · ")
            .takeIf { it.isNotBlank() }
}
