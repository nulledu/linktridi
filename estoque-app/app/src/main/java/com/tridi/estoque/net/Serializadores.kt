package com.tridi.estoque.net

import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.JsonDecoder
import kotlinx.serialization.json.jsonPrimitive

/**
 * Quantidade que pode chegar como número (`20`) OU como texto (`"20"`,
 * `"20.00"`) — colunas `numeric` do Postgres às vezes saem como string,
 * dependendo de quem serializa a resposta (o driver evita perder precisão
 * decimal). Já mordeu o app do tablet uma vez, num parsing parecido (ver nota
 * "Atividades tablet gotchas" — coerceInputValues). Em vez de apostar num
 * formato só e estourar no outro, este serializer aceita os dois.
 */
object IntTolerante : KSerializer<Int> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("IntTolerante", PrimitiveKind.INT)

    override fun serialize(encoder: Encoder, value: Int) = encoder.encodeInt(value)

    override fun deserialize(decoder: Decoder): Int {
        val jsonDecoder = decoder as? JsonDecoder ?: return decoder.decodeInt()
        val texto = jsonDecoder.decodeJsonElement().jsonPrimitive.content
        return texto.toDoubleOrNull()?.toInt() ?: 0
    }
}

/**
 * O mesmo, sem cortar a fração.
 *
 * `IntTolerante` truncaria: item a granel tem meio metro de tecido, 2,5 kg de
 * cola. Numa tela que existe pra dizer QUANTO TEM, "2" no lugar de "2,5" é uma
 * resposta errada — e ninguém tem como desconfiar dela olhando o número.
 */
object DoubleTolerante : KSerializer<Double> {
    override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor("DoubleTolerante", PrimitiveKind.DOUBLE)

    override fun serialize(encoder: Encoder, value: Double) = encoder.encodeDouble(value)

    override fun deserialize(decoder: Decoder): Double {
        val jsonDecoder = decoder as? JsonDecoder ?: return decoder.decodeDouble()
        return jsonDecoder.decodeJsonElement().jsonPrimitive.content.toDoubleOrNull() ?: 0.0
    }
}
