package com.tridi.tv.core.sinal

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** O que o servidor pode cutucar. Só o nome do que mudou — nunca o dado. */
sealed class Evento {
    /** Alguém salvou Painéis no ERP: layout, perfis, metas, cor. */
    data object Config : Evento()
    /** Uma versão nova do app foi publicada no console da frota. */
    data class Versao(val versionCode: Int) : Evento()
    /** Um comando foi enfileirado. Lista vazia = para TODOS os aparelhos. */
    data class Comando(val dispositivos: List<String>) : Evento()
}

/**
 * Protocolo Phoenix v1 do Supabase Realtime: cada frame é um array
 * `[join_ref, ref, topic, event, payload]`. É pequeno o bastante para não
 * valer uma biblioteca — e este arquivo é o contrato inteiro.
 */
object FramePhoenix {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** Entra no tópico. `self=false`: a TV não quer ouvir o próprio eco. */
    fun join(topico: String, ref: Int): String =
        """["$ref","$ref","$topico","phx_join",{"config":{"broadcast":{"self":false},"presence":{"key":""}}}]"""

    /** O Realtime derruba quem fica mudo; isto a cada 30 s mantém a linha. */
    fun heartbeat(ref: Int): String = """[null,"$ref","phoenix","heartbeat",{}]"""

    /**
     * Decodifica um frame recebido. Devolve `null` para tudo que não é um
     * broadcast conhecido no tópico pedido: resposta de join, heartbeat,
     * outro tópico, lixo. Nunca lança — a TV não pode cair por causa de um
     * frame estranho.
     */
    fun decodificar(texto: String, topico: String): Evento? = try {
        val arr = json.parseToJsonElement(texto).jsonArray
        if (arr.size < 5 ||
            arr[2].jsonPrimitive.contentOrNull != topico ||
            arr[3].jsonPrimitive.contentOrNull != "broadcast"
        ) {
            null
        } else {
            val p = arr[4].jsonObject
            val payload = p["payload"]?.jsonObject
            when (p["event"]?.jsonPrimitive?.contentOrNull) {
                "config" -> Evento.Config
                "versao" -> Evento.Versao(payload?.get("versionCode")?.jsonPrimitive?.intOrNull ?: 0)
                "comando" -> Evento.Comando(
                    payload?.get("dispositivos")?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull }.orEmpty(),
                )
                else -> null
            }
        }
    } catch (e: Exception) {
        null
    }
}
