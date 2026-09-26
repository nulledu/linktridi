package com.dashvendas.tv.data

// Lógica pura de detecção de meta (espelha web/lib/goal-detect.ts).
object GoalDetect {
    fun pct(current: Double, goal: Double): Double = if (goal > 0) current / goal * 100 else 0.0

    fun progressMap(s: SalesSnapshot): Map<String, Double> {
        val m = HashMap<String, Double>()
        s.salespeople.forEach { m["sp:${it.id}"] = pct(it.sales.monthly, it.goal.monthly) }
        s.teams.forEach { m["team:${it.id}"] = it.progressPct }
        return m
    }

    // Ids que estavam < 100 antes e agora >= 100.
    fun newlyAchieved(prev: Map<String, Double>, next: Map<String, Double>): List<String> =
        next.filter { (id, v) -> (prev[id] ?: 0.0) < 100.0 && v >= 100.0 }.keys.toList()
}
