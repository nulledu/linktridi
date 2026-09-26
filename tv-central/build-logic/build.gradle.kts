plugins {
    `kotlin-dsl`
}

dependencies {
    compileOnly(libs.gradle.android)
    compileOnly(libs.gradle.kotlin)
    compileOnly(libs.gradle.compose.compiler)
    compileOnly(libs.gradle.ksp)
    compileOnly(libs.gradle.hilt)
}

gradlePlugin {
    plugins {
        // Módulo de núcleo: Android library + Kotlin + Hilt. Sem Compose.
        register("tridiCore") {
            id = "tridi.core"
            implementationClass = "CoreConventionPlugin"
        }
        // Módulo de núcleo com UI (core:design).
        register("tridiCoreUi") {
            id = "tridi.core.ui"
            implementationClass = "CoreUiConventionPlugin"
        }
        // Módulo de painel: tudo do core.ui + o contrato + rede + storage.
        register("tridiPanel") {
            id = "tridi.panel"
            implementationClass = "PanelConventionPlugin"
        }
    }
}
