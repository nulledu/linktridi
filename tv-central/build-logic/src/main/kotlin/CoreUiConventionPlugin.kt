import org.gradle.api.Plugin
import org.gradle.api.Project

/** Módulo de núcleo com UI: :core:design. */
class CoreUiConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        applyAndroidLibrary()
        applyKotlinxCommon()
        applyCompose()
        applyHilt()
        applyTestes()
    }
}
