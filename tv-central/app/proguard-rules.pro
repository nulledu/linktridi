# Regras do R8 — ligado no release porque sem ele o APK sai com 23 MB de .dex
# e a instalação numa TV box fraca fica "instalando" para sempre (o dex2oat
# compila tudo no aparelho, na hora de instalar).
#
# O que precisa de regra é só o que o R8 não enxerga: reflexão. Compose, Hilt e
# OkHttp trazem as regras deles (consumer rules) e não entram aqui.

# ── kotlinx.serialization ────────────────────────────────────────────────────
# Os serializers são gerados como campos estáticos e alcançados por reflexão —
# o R8 não vê ninguém chamando, remove, e o app quebra em runtime na primeira
# resposta do servidor (que é justamente o que a TV faz o dia inteiro).
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# As classes @Serializable do próprio app e os serializers delas.
-keep,includedescriptorclasses class com.tridi.tv.**$$serializer { *; }
-keepclassmembers class com.tridi.tv.** {
    *** Companion;
}
-keepclasseswithmembers class com.tridi.tv.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# ── Modelos que viram JSON ───────────────────────────────────────────────────
# Nome de campo importa: o R8 renomeia, e aí o JSON do servidor deixa de casar
# com a classe em silêncio — a tela fica vazia sem erro nenhum.
-keepclassmembers @kotlinx.serialization.Serializable class ** {
    <fields>;
}

# ── Device admin / receivers declarados no manifesto ─────────────────────────
# São instanciados pelo SISTEMA pelo nome da classe, nunca por código nosso.
-keep class com.tridi.tv.core.kiosk.AdminReceiver { *; }
-keep class com.tridi.tv.fleet.FleetInstallReceiver { *; }

# Enums são alcançados por valueOf() em desserialização.
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ── Menos risco, mesmo tamanho ───────────────────────────────────────────────
# O R8 faz duas coisas: REMOVE codigo morto (e dai que vem a reducao de 23 MB
# para 3 MB) e RENOMEIA classes/metodos. Quase todo defeito de R8 em producao
# vem da segunda — algo alcancado por reflexao deixa de ser encontrado pelo
# nome. Aqui a reducao e o que interessa; ofuscacao nao protege nada num app
# interno que roda numa parede de galpao.
#
# E sem isto, um crash na TV vira caca ao fantasma: a pilha do erro vem com
# nomes como a.b.c e nao diz nada — justamente o que a CaixaPreta existe para
# evitar.
-dontobfuscate

# Application e Activity sao instanciadas pelo SISTEMA, pelo nome do manifesto.
-keep class com.tridi.tv.TridiTvApp { *; }
-keep class com.tridi.tv.MainActivity { *; }

# Os paineis sao descobertos por injecao (Set<PanelPlugin>), nunca por chamada
# direta — o R8 nao ve ninguem usando e removeria todos.
-keep class * implements com.tridi.tv.core.panelapi.PanelPlugin { *; }

# O servico de acessibilidade e instanciado pelo SISTEMA, pelo nome do
# manifesto — e o proprio codigo compara o nome da classe com o que esta em
# ENABLED_ACCESSIBILITY_SERVICES para saber se ja foi ligado. Renomear quebra
# as duas coisas em silencio.
-keep class com.tridi.tv.fleet.DedoDaFrota { *; }
