package com.tridi.ponto.data

import kotlinx.serialization.Serializable

// ── DTOs da API ───────────────────────────────────────────────────────────────
@Serializable
data class ProvisionResp(val token: String? = null, val error: String? = null)

@Serializable
data class PessoaDto(
    val id: String, val nome: String, val fotoUrl: String? = null,
    val fotos: List<String> = emptyList(), val pinHash: String? = null,
    val amostras: List<List<Float>> = emptyList(),   // moldes aprendidos (embeddings prontos)
)

@Serializable
data class SyncResp(val pessoas: List<PessoaDto> = emptyList(), val syncedAt: String? = null, val aviso: String? = null, val error: String? = null)

@Serializable
data class BaterRegistro(val id: String, val tipo: String, val batidoEm: String)

@Serializable
data class BaterPessoa(val id: String, val nome: String, val fotoUrl: String? = null)

@Serializable
data class BatidaHoje(val tipo: String, val batidoEm: String)

@Serializable
data class PortalItem(val label: String, val valor: Int, val urgente: Boolean = false)

@Serializable
data class Portal(val setor: String, val itens: List<PortalItem> = emptyList())

@Serializable
data class BaterResp(
    val ok: Boolean = false,
    val duplicada: Boolean = false,
    val registro: BaterRegistro? = null,
    val pessoa: BaterPessoa? = null,
    val hoje: List<BatidaHoje> = emptyList(),
    val portal: Portal? = null,
    val error: String? = null,
)

// ── Cache local (pessoa + embeddings prontos) ────────────────────────────────
@Serializable
data class PessoaLocal(
    val id: String,
    val nome: String,
    val fotoUrl: String? = null,
    val fotoLocal: String? = null,                     // caminho da foto salva no tablet (mostra offline)
    val embeddings: List<List<Float>> = emptyList(),   // FINAL: cadastro (fotos) + amostras do servidor
    val cadastroEmbeddings: List<List<Float>> = emptyList(), // só das fotos — parte cara, reaproveitável
    val fotosSig: String = "",                         // assinatura das URLs das fotos (detecta "não mudou")
    val pinHash: String? = null,                       // sha256 — valida PIN offline
)

@Serializable
data class CacheLocal(val pessoas: List<PessoaLocal> = emptyList(), val syncedAt: String? = null)

// ── Aprendizado local: como ESTA câmera vê cada pessoa ───────────────────────
// A cada batida confirmada, o embedding da selfie vira um "molde" da pessoa
// nesta câmera/iluminação. Sobrevive a re-sync (guardado à parte).
@Serializable
data class Templates(val porPessoa: Map<String, List<List<Float>>> = emptyMap())

// ── Fila offline: batidas aguardando internet ────────────────────────────────
@Serializable
data class FilaItem(
    val clientId: String,          // idempotência no servidor (não duplica no reenvio)
    val pessoaId: String,
    val pessoaNome: String,
    val tipo: String,              // decidido localmente (alternância offline-safe)
    val confianca: Float? = null,
    val selfieB64: String? = null,
    val criadoEm: String,          // ISO local (só exibição — sem segundos nem fuso)
    // Instante REAL da batida (epoch ms). É o que sobe pro servidor: sem ele a
    // fila offline era carimbada com o now() do banco na hora do ENVIO, e um dia
    // sem rede virava todo mundo entrando junto no minuto do flush.
    // 0 = item enfileirado por uma versão antiga → servidor carimba na chegada.
    val batidoEmMs: Long = 0L,
    // Coordenada no instante da batida (última conhecida). null = sem sinal/permissão.
    val lat: Double? = null,
    val lon: Double? = null,
    // O servidor RECUSOU em definitivo (ex.: pessoa inativa). Fica guardada e
    // visível até o administrador descartar pelo menu — nunca some sozinha.
    val recusada: Boolean = false,
)

@Serializable
data class Fila(val itens: List<FilaItem> = emptyList())

// ── Rastro do que JÁ FOI ENVIADO (conferência fim-a-fim) ─────────────────────
// Enviar não é o fim: o tablet guarda o rastro leve (sem selfie) e, de tempos em
// tempos, pergunta ao servidor quais desses client_ids viraram registro DE
// VERDADE. O que faltar volta pra fila — reenvio idempotente pelo client_id.
@Serializable
data class EnviadaItem(
    val clientId: String,
    val pessoaId: String,
    val pessoaNome: String,
    val batidoEmMs: Long,
    val enviadaEmMs: Long,
    val confirmada: Boolean = false,   // o servidor já respondeu "recebi esta"
)

@Serializable
data class Enviadas(val itens: List<EnviadaItem> = emptyList())

@kotlinx.serialization.Serializable
data class ConferirResp(val recebidos: List<String> = emptyList(), val conferivel: Boolean = true, val error: String? = null)

// Última batida local por pessoa (p/ alternar entrada/saída sem internet).
@Serializable
data class UltimoTipo(val porPessoa: Map<String, String> = emptyMap())   // pessoaId → "entrada|saida@yyyy-MM-dd"

