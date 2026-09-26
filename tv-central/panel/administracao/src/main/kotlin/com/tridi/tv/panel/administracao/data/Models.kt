package com.tridi.tv.panel.administracao.data

import kotlinx.serialization.Serializable

// Contrato de /api/sales e /api/config. Vive DENTRO do painel: outro painel não
// tem por que conhecer "Salesperson" — é isso que mantém os módulos independentes.

@Serializable
data class PeriodValues(val daily: Double = 0.0, val weekly: Double = 0.0, val monthly: Double = 0.0)

@Serializable
data class Salesperson(
    val id: String,
    val name: String,
    val photoUrl: String? = null,
    val team: String = "comercial",
    val sales: PeriodValues = PeriodValues(),
    val goal: PeriodValues = PeriodValues(),
    val orders: PeriodValues = PeriodValues(),
)

@Serializable
data class Team(
    val id: String,
    val name: String,
    val current: Double = 0.0,
    val goal: Double = 0.0,
    val progressPct: Double = 0.0,
)

@Serializable
data class Product(
    val id: String,
    val name: String,
    val imageUrl: String? = null,
    val qty: Double = 0.0,
    val revenue: Double = 0.0,
)

@Serializable
data class Revenue(
    val daily: Double = 0.0,
    val weekly: Double = 0.0,
    val monthly: Double = 0.0,
    val trendPct: Double = 0.0,
)

@Serializable
data class RevenueCount(val revenue: Double = 0.0, val count: Double = 0.0)

@Serializable
data class YampiBreakdown(
    val paid: RevenueCount = RevenueCount(),
    val organic: RevenueCount = RevenueCount(),
    val total: RevenueCount = RevenueCount(),
    val ticketMedio: Double = 0.0,
)

@Serializable
data class TrafficPoint(val day: String = "", val value: Double = 0.0)

@Serializable
data class Metrics(
    val totalSales: RevenueCount = RevenueCount(),
    val yampi: YampiBreakdown = YampiBreakdown(),
    val comercial: RevenueCount = RevenueCount(),
    val projection: Double = 0.0,
    val trafficSpend: Double? = null,
    val trafficSpendReal: Double? = null,
    val paidTrendPct: Double = 0.0,
    val trafficSeries: List<TrafficPoint> = emptyList(),
    /** Faturamento por dia do mês — base do mini-gráfico e da variação. */
    val revenueSeries: List<TrafficPoint> = emptyList(),
)

/**
 * Eficiência de tráfego vinda do TRIDIFY — fonte única de ROAS/ROI/CPA/lucro.
 * A TV não recalcula nada disso: numerador e denominador diferentes davam
 * números que discordavam do relatório com o mesmo nome.
 */
/** Faturamento e pedidos de um canal numa janela (espelho do `Soma` do web). */
@Serializable
data class SomaCanal(val valor: Double = 0.0, val pedidos: Int = 0)

/**
 * Um dos três canais da parede comercial (Yampi, Carrinho Ab, WhatsApp), já
 * somado por Hoje/Semana/Mês no servidor (`canaisDaParede` em
 * lib/painel-tridify.ts). A TV não soma nada.
 */
@Serializable
data class CanalParede(
    val nome: String = "",
    val dia: SomaCanal = SomaCanal(),
    val semana: SomaCanal = SomaCanal(),
    val mes: SomaCanal = SomaCanal(),
)

@Serializable
data class TridifyResumo(
    val gasto: Double = 0.0,
    val gastoComImposto: Double = 0.0,
    val faturamentoTrafego: Double = 0.0,
    val pedidosTrafego: Int = 0,
    val faturamentoEmpresa: Double = 0.0,
    // Faturamento da empresa recortado — mesma base do mês, pra TV não somar
    // uma régua no card do dia e outra no card do mês.
    val faturamentoDia: Double = 0.0,
    val faturamentoSemana: Double = 0.0,
    val pedidosEmpresa: Int = 0,
    val projecaoMes: Double = 0.0,
    val organico: Double = 0.0,
    val marketplace: Double = 0.0,
    // Vega está DENTRO do tráfego e marketplace está FORA do total da empresa.
    // Ficam abertos porque são as duas fatias que o total antigo errava.
    val vega: Double = 0.0,
    val vegaPedidos: Int = 0,
    val comercial: Double = 0.0,
    /** Os canais da parede comercial; vazio em servidor mais velho. */
    val canaisVenda: List<CanalParede> = emptyList(),
    /**
     * Os CANAIS do faturamento, na mesma discriminação do cartão "Faturamento
     * total da empresa" do Tridify: Yampi tráfego, Yampi orgânica, Comercial e
     * Vega Checkout, cada um com a contagem de pedidos. Somados dão exatamente
     * `faturamentoEmpresa` — a parede não refaz conta.
     *
     * Zero = servidor mais velho que não manda estes campos; aí o bloco cai na
     * conta antiga (tráfego = total − orgânico − comercial − vega).
     */
    val yampiTrafego: Double = 0.0,
    val yampiTrafegoPedidos: Int = 0,
    val organicoPedidos: Int = 0,
    val comercialPedidos: Int = 0,
    val outras: Double = 0.0,
    /** A loja usada como fonte do tráfego — o "· Carimbos Tridi" do rótulo. */
    val fonteTrafego: String = "",
    val roas: Double? = null,
    val roi: Double? = null,
    val mer: Double? = null,
    val lucro: Double = 0.0,
    val margem: Double? = null,
    val cpa: Double? = null,
    val roasEquilibrio: Double? = null,
    val ticketMedio: Double = 0.0,
    val taxaAprovacao: Double = 0.0,
    /** Meta de faturamento do tráfego, do cockpit de marketing. `0` = sem meta. */
    val metaTrafego: Double = 0.0,
    val metaInvestimento: Double = 0.0,
    /**
     * Investimento e receita atribuída, dia a dia do mês.
     *
     * É o grão que deixa a parede de tráfego responder hoje/semana/mês somando
     * a própria série, em vez de três consultas. Contrapartida de
     * `serieTrafego` em `lib/painel-tridify.ts`.
     */
    val serieTrafego: List<DiaTrafego> = emptyList(),
    /**
     * O tráfego aberto por PLATAFORMA, cada uma com a própria série.
     *
     * Hoje sai uma entrada só (o Meta), porque é a única com gasto no armazém.
     * A lista é o formato certo mesmo com um item: a segunda plataforma vira
     * dado, e a coluna nasce sozinha nos dois renderizadores.
     */
    val canaisTrafego: List<CanalTrafego> = emptyList(),
    val pctAtribuido: Double = 0.0,
)

@Serializable
data class CanalTrafego(
    val id: String = "",
    val nome: String = "",
    val serie: List<DiaTrafego> = emptyList(),
)

@Serializable
data class DiaTrafego(
    val d: String = "",
    val receita: Double = 0.0,
    val pedidos: Int = 0,
    val gasto: Double = 0.0,
)

@Serializable
data class SalesSnapshot(
    val updatedAt: String = "",
    val salespeople: List<Salesperson> = emptyList(),
    val teams: List<Team> = emptyList(),
    val revenue: Revenue = Revenue(),
    val topProducts: List<Product> = emptyList(),
    val metrics: Metrics? = null,
    val tridify: TridifyResumo? = null,
    /**
     * O servidor não conseguiu ler o ERP ao vivo e mandou o snapshot SALVO.
     *
     * Vem `true` do `/api/sales` quando a rota cai no fallback. Sem isto a TV
     * carimbava esse dado como "atualizado agora" — a requisição era mesmo de
     * agora, mas o número era de outra base e sem tráfego, e a parede
     * apresentava como fresco um faturamento R$ 94 mil menor. Rede boa e
     * número errado é pior que rede caída: não há nada na tela que faça
     * desconfiar.
     */
    val reserva: Boolean = false,
)

/**
 * Chão de fábrica (`/api/producao/painel`). Rota SEPARADA do `/api/sales`: o
 * ERP sabe o que foi faturado, a linha de produção sabe o que está sendo feito
 * agora. Só é buscada quando o layout tem um widget de produção.
 */
@Serializable
data class OperadorProducao(
    val id: String = "",
    val nome: String = "",
    val fotoUrl: String? = null,
    val concluidas: Int = 0,
    val emAndamento: Int = 0,
    val pendentes: Int = 0,
    val pecas: Int = 0,
    /** `null` quando nenhuma ordem tinha alvo — "0%" se leria como "não produziu". */
    val produtividade: Int? = null,
    val tmaMin: Int? = null,
    /** Minutos cronometrados DENTRO de ordem. */
    val emAtividadeMin: Int = 0,
    /** Presença pelo ponto. `null` = sem ponto vinculado — e aí não há ocioso. */
    val trabalhadoMin: Int? = null,
    /**
     * Presença − atividade. NÃO é "tempo perdido": reunião, espera de insumo e
     * trabalho feito sem abrir a ordem no tablet caem todos aqui. O rótulo na
     * tela é "fora de atividade" por isso.
     */
    val ociosoMin: Int? = null,
)

@Serializable
data class ResumoProducao(
    val disponivel: Boolean = false,
    /** Dia que os números representam; `ehHoje = false` quando o turno ainda não começou. */
    val dia: String = "",
    val ehHoje: Boolean = true,
    val pecasHoje: Int = 0,
    val emAndamento: Int = 0,
    val pendentes: Int = 0,
    val urgentes: Int = 0,
    val impedidas: Int = 0,
    val concluidasHoje: Int = 0,
    val tmaMin: Int? = null,
    val operadoresAtivos: Int = 0,
    val operadores: List<OperadorProducao> = emptyList(),
)

/**
 * Estoque do galpão (`/api/estoque/painel`). Só nome de item, saldo e mínimo —
 * o que já está no quadro branco da parede. Sem custo e sem fornecedor.
 */
@Serializable
data class AvisoEstoque(
    val nome: String = "",
    val quantidade: Int = 0,
    val minimo: Int = 0,
    val falta: Int = 0,
)

@Serializable
data class ResumoEstoque(
    val disponivel: Boolean = false,
    val abaixo: Int = 0,
    val zerados: Int = 0,
    val conferir: Int = 0,
    val itens: List<AvisoEstoque> = emptyList(),
)

/**
 * Expedição (`/api/logistica/painel`) — só contagens, nunca cliente ou
 * telefone: a rota é pública porque a TV não tem login.
 */
@Serializable
data class CategoriaExpedicao(
    val chave: String = "",
    val rotulo: String = "",
    val valor: Int = 0,
    /** Contagem anterior; `null` quando ainda não há histórico. */
    val anterior: Int? = null,
    val cor: String = "",
)

@Serializable
data class FaltaProducao(val categoria: String = "", val total: Int = 0, val pedidos: Int = 0)

@Serializable
data class StatusExpedicao(
    val atualizadoEm: String = "",
    val entrada: Int = 0,
    val logistica: Int = 0,
    val total: Int = 0,
    val enviadosHoje: Int = 0,
    val categorias: List<CategoriaExpedicao> = emptyList(),
    val faltaProducao: List<FaltaProducao> = emptyList(),
    /*
     * Os números da DOCA e a semana. A rota já devolvia tudo isto — a TV é que
     * lia metade e deduzia o resto, e dedução na parede vira número que não
     * bate com a tela do computador.
     */
    /** Pedido pronto parado esperando etiqueta. */
    val etiquetasPendentes: Int = 0,
    /** Fechado e com estoque: pode sair hoje. */
    val prontosParaEnvio: Int = 0,
    /** Fechado mas SEM item: não sai por falta, não por atraso da doca. */
    val prontosFaltandoEstoque: Int = 0,
    /** Os pedidos mais velhos e travados — a fila que ninguém deveria ter. */
    val criticos: List<PedidoCritico> = emptyList(),
    /** Envios dos últimos sete dias, com média móvel e comparação. */
    val semana: SemanaEnvios? = null,
)

/**
 * Um pedido que passou do ponto: dias parado, o que falta, se está bloqueado.
 * `dias` é o que ordena — a parede existe para mostrar o mais velho.
 */
@Serializable
data class PedidoCritico(
    val etapa: String = "",
    val caixa: String = "",
    val dias: Int = 0,
    val urgente: Boolean = false,
    val bloqueado: Boolean = false,
    val pendencias: List<String> = emptyList(),
    val faltam: Int = 0,
    val itens: Int = 0,
)

/** A semana de envios: uma barra por dia, a média móvel e o total. */
@Serializable
data class SemanaEnvios(
    val dias: List<DiaEnvio> = emptyList(),
    val mediaMovel: List<Double> = emptyList(),
    val total: Int = 0,
    val totalAnterior: Int = 0,
    /** Variação contra a semana anterior. `null` = sem base para comparar. */
    val variacaoPct: Double? = null,
    val periodo: String = "",
)

@Serializable
data class DiaEnvio(
    val dia: String = "",
    val valor: Int = 0,
    val rotulo: String = "",
)

@Serializable
data class Tema(
    val primary: String = "#0A84FF",
    val secondary: String = "#30D158",
    val background: String = "#000000",
    val logoUrl: String? = null,
)

@Serializable
data class PanelConfig(
    val theme: Tema = Tema(),
    val slideIntervalMs: Long = 20000,
    val refreshIntervalMs: Long = 30000,
    val goalSoundUrl: String? = null,
    val monthlyRevenueGoal: Double = 300000.0,
    val trafficTaxPct: Double = 13.83,
    /**
     * Montagem do painel feita no ERP. Nulo = carrossel fixo de sempre; é o que
     * mantém as TVs já instaladas funcionando sem reconfigurar nada.
     */
    val layout: PainelLayout? = null,
    /** Os modelos de tela publicados. A TV roda o que o aparelho escolheu. */
    val perfis: List<PerfilLayout>? = null,
    /**
     * Os AVISOS de parede — o recado escrito no computador que aparece na TV.
     *
     * Vem no mesmo `/api/config` que a TV já lê a cada ciclo: nenhuma
     * requisição a mais por aparelho, que é a conta que já pausou o projeto.
     */
    val avisos: List<AvisoPainel> = emptyList(),
)

/**
 * Um aviso de parede. As regras de QUANDO ele vale (prazo, perfil) são as
 * mesmas do web — ver `lib/painel-avisos.ts`. Duas cópias divergindo fariam a
 * prévia do editor mostrar um recado que a parede não mostra, e quem escreveu
 * duvidaria do sistema inteiro na primeira vez.
 */
@Serializable
data class AvisoPainel(
    val id: String = "",
    val titulo: String = "",
    val texto: String = "",
    val ativo: Boolean = true,
    /** `aviso`, `alerta`, `parada` ou `festa` — manda na cor. */
    val tom: String = "aviso",
    val de: String? = null,
    val ate: String? = null,
    /** Ids dos perfis que mostram o aviso. Vazio = todas as paredes. */
    val perfis: List<String> = emptyList(),
    /** Toma a tela inteira e para o rodízio enquanto valer. */
    val assumeTela: Boolean = false,
)
