import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.project

/**
 * Um painel. O módulo ganha Compose, Hilt, rede e storage prontos e já enxerga o
 * contrato — o `build.gradle.kts` de um painel novo tem só `plugins { id("tridi.panel") }`
 * mais o que for exclusivo dele.
 *
 * Trava de arquitetura: um painel não pode depender de outro painel. Ver
 * a checagem em :app (task `verificarArquitetura`).
 */
class PanelConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        applyAndroidLibrary()
        applyKotlinxCommon()
        applyCompose()
        applyHilt()
        applyTestes()

        dependencies {
            add("api", project(":core:panel-api"))
            add("implementation", project(":core:design"))
            add("implementation", project(":core:network"))
            add("implementation", project(":core:storage"))
        }
    }
}
