import com.android.build.gradle.LibraryExtension
import org.gradle.api.JavaVersion
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalog
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.api.plugins.ExtensionAware
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.getByType
import org.jetbrains.kotlin.gradle.dsl.KotlinAndroidProjectExtension
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

internal val Project.libs: VersionCatalog
    get() = extensions.getByType<VersionCatalogsExtension>().named("libs")

/**
 * Namespace derivado do caminho do módulo: `:panel:administracao` vira
 * `com.tridi.tv.panel.administracao`. Ninguém precisa escrever namespace à mão.
 */
internal val Project.derivedNamespace: String
    get() = "com.tridi.tv" + path.replace(":", ".").replace("-", "")

/** Android library + Kotlin, com os defaults que valem para todo módulo. */
internal fun Project.applyAndroidLibrary() {
    pluginManager.apply("com.android.library")
    pluginManager.apply("org.jetbrains.kotlin.android")

    extensions.configure<LibraryExtension> {
        namespace = derivedNamespace
        compileSdk = 34
        // 23 e nao 28: TV box de galpao costuma vir com Android 7/8, e um
        // minSdk alto faz o instalador recusar o pacote ("nao foi possivel
        // reconhecer") em vez de dizer que a versao do Android e velha.
        // Precisa casar com o minSdk do :app — o merge do manifesto quebra o
        // build se divergirem, que e a trava certa.
        defaultConfig { minSdk = 23 }
        compileOptions {
            sourceCompatibility = JavaVersion.VERSION_17
            targetCompatibility = JavaVersion.VERSION_17
            // Ver o comentário longo no :app. Resumo: sem isto o app compila,
            // instala e só quebra na TV de Android 7 — e o flag tem de estar em
            // TODO módulo, porque quem desugara é o D8 de cada um.
            isCoreLibraryDesugaringEnabled = true
        }
    }
    extensions.configure<KotlinAndroidProjectExtension> {
        compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
    }
    dependencies {
        add("coreLibraryDesugaring", libs.findLibrary("desugar-jdk-libs").get())
    }
}

/** Hilt + KSP. Todo módulo participa do grafo de injeção. */
internal fun Project.applyHilt() {
    pluginManager.apply("com.google.devtools.ksp")
    pluginManager.apply("com.google.dagger.hilt.android")
    dependencies {
        add("implementation", libs.findLibrary("hilt-android").get())
        add("ksp", libs.findLibrary("hilt-compiler").get())
    }
}

/** Compose + as dependências de UI que todo módulo visual usa. */
internal fun Project.applyCompose() {
    pluginManager.apply("org.jetbrains.kotlin.plugin.compose")
    extensions.configure<LibraryExtension> {
        buildFeatures { compose = true }
    }
    dependencies {
        val bom = platform(libs.findLibrary("compose-bom").get())
        add("implementation", bom)
        add("api", bom)
        listOf(
            "compose-ui", "compose-ui-graphics", "compose-foundation",
            "compose-material3", "compose-material3-window", "tv-material",
            "androidx-lifecycle-runtime-compose", "androidx-lifecycle-viewmodel-compose",
            "hilt-navigation-compose",
        ).forEach { add("implementation", libs.findLibrary(it).get()) }
    }
}

internal fun Project.applyKotlinxCommon() {
    pluginManager.apply("org.jetbrains.kotlin.plugin.serialization")
    dependencies {
        add("implementation", libs.findLibrary("androidx-core-ktx").get())
        add("implementation", libs.findLibrary("kotlinx-coroutines-android").get())
        add("implementation", libs.findLibrary("kotlinx-serialization-json").get())
    }
}

/** Teste de unidade na JVM. Todo módulo ganha — teste que não existe não roda. */
internal fun Project.applyTestes() {
    dependencies {
        add("testImplementation", libs.findLibrary("junit").get())
        add("testImplementation", libs.findLibrary("kotlinx-coroutines-test").get())
    }
}
