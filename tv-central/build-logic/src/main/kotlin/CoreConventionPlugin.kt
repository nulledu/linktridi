import org.gradle.api.Plugin
import org.gradle.api.Project

/** Módulo de núcleo sem UI: :core:network, :core:storage, :core:session, :core:kiosk. */
class CoreConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        applyAndroidLibrary()
        applyKotlinxCommon()
        applyHilt()
        applyTestes()
    }
}
