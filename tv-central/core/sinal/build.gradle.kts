plugins { id("tridi.core") }

// O sinal em tempo real da parede: um WebSocket no Supabase Realtime, com o
// protocolo Phoenix escrito à mão sobre o OkHttp que o app já carrega. Sem a
// biblioteca do Supabase para Kotlin de propósito: ela traz Ktor inteiro, e
// esta TV box de 2016 já custou um desugaring por menos.
dependencies {
    implementation(project(":core:storage"))
    api(libs.okhttp)
}
