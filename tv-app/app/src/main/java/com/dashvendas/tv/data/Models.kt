package com.dashvendas.tv.data

import kotlinx.serialization.Serializable

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
    val orders: PeriodValues = PeriodValues()
)

@Serializable
data class Team(
    val id: String,
    val name: String,
    val current: Double = 0.0,
    val goal: Double = 0.0,
    val progressPct: Double = 0.0
)

@Serializable
data class Product(
    val id: String,
    val name: String,
    val imageUrl: String? = null,
    val qty: Double = 0.0,
    val revenue: Double = 0.0
)

@Serializable
data class Revenue(
    val daily: Double = 0.0,
    val weekly: Double = 0.0,
    val monthly: Double = 0.0,
    val trendPct: Double = 0.0
)

@Serializable
data class RevenueCount(val revenue: Double = 0.0, val count: Double = 0.0)

@Serializable
data class YampiBreakdown(
    val paid: RevenueCount = RevenueCount(),
    val organic: RevenueCount = RevenueCount(),
    val total: RevenueCount = RevenueCount(),
    val ticketMedio: Double = 0.0
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
    val trafficSeries: List<TrafficPoint> = emptyList()
)

@Serializable
data class SalesSnapshot(
    val updatedAt: String = "",
    val salespeople: List<Salesperson> = emptyList(),
    val teams: List<Team> = emptyList(),
    val revenue: Revenue = Revenue(),
    val topProducts: List<Product> = emptyList(),
    val metrics: Metrics? = null
)

@Serializable
data class Theme(
    val primary: String = "#0A84FF",
    val secondary: String = "#30D158",
    val background: String = "#000000",
    val logoUrl: String? = null
)

@Serializable
data class PanelConfig(
    val theme: Theme = Theme(),
    val slideIntervalMs: Long = 20000,
    val refreshIntervalMs: Long = 30000,
    val goalSoundUrl: String? = null,
    val monthlyRevenueGoal: Double = 300000.0,
    val trafficTaxPct: Double = 13.83
)
