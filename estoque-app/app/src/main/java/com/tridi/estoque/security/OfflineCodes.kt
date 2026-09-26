package com.tridi.estoque.security

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

// Verificador do código de acesso para o login SEM INTERNET.
//
// Precisa dar exatamente o mesmo resultado que `verificadorDeCodigo` em
// app/api/estoque/device/_sessao.ts — se as duas pontas divergirem, o tablet
// simplesmente não reconhece ninguém offline. Por isso o cálculo mora aqui, em
// função pura (sem android.util.Base64), e o teste cruza o valor com o que o
// Node produz: OfflineCodesTest.
//
// O NAMESPACE é "estoque-codigo|", não "market-codigo|". O fork trouxe a string
// do mercadinho e ela passou batida por tudo: compila, testa (o teste conferia
// o app contra ele mesmo) e instala — e só aparece bipando de verdade, como
// "Código não reconhecido" com o diretório cheio e o operador correto. Os dois
// domínios usam o mesmo segredo, então namespaces distintos são o que impede
// que vazar o diretório de um diga algo sobre o outro.
private const val NAMESPACE = "estoque-codigo|"

object OfflineCodes {
    fun hash(codigo: String, salt: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(salt.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return base64Url(mac.doFinal("$NAMESPACE$codigo".toByteArray(Charsets.UTF_8)))
    }

    private const val ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"

    // base64url sem padding, idêntico ao "base64url" do Node. Escrito à mão
    // porque java.util.Base64 exige API 26 e o app roda a partir da 24.
    internal fun base64Url(bytes: ByteArray): String {
        val saida = StringBuilder((bytes.size + 2) / 3 * 4)
        var i = 0
        while (i + 2 < bytes.size) {
            val n = ((bytes[i].toInt() and 0xff) shl 16) or
                ((bytes[i + 1].toInt() and 0xff) shl 8) or
                (bytes[i + 2].toInt() and 0xff)
            saida.append(ALFABETO[(n ushr 18) and 63]).append(ALFABETO[(n ushr 12) and 63])
                .append(ALFABETO[(n ushr 6) and 63]).append(ALFABETO[n and 63])
            i += 3
        }
        when (bytes.size - i) {
            1 -> {
                val n = (bytes[i].toInt() and 0xff) shl 16
                saida.append(ALFABETO[(n ushr 18) and 63]).append(ALFABETO[(n ushr 12) and 63])
            }
            2 -> {
                val n = ((bytes[i].toInt() and 0xff) shl 16) or ((bytes[i + 1].toInt() and 0xff) shl 8)
                saida.append(ALFABETO[(n ushr 18) and 63]).append(ALFABETO[(n ushr 12) and 63])
                    .append(ALFABETO[(n ushr 6) and 63])
            }
        }
        return saida.toString()
    }
}
