pluginManagement {
    includeBuild("build-logic")
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "TridiTVCentral"

include(":app")

// Núcleo — nunca conhece painel nenhum.
include(":core:panel-api")
include(":core:design")
include(":core:network")
include(":core:storage")
include(":core:session")
include(":core:kiosk")
include(":core:sinal")

// Painéis — cada um é um plugin. Para adicionar um novo, uma linha aqui
// e uma linha de implementation(project(...)) no :app. Nada no núcleo.
include(":panel:administracao")
include(":panel:logistica")
include(":panel:maquinas")
include(":panel:producao")
