import com.android.build.gradle.LibraryExtension

plugins { id("tridi.core") }

// O plugin de convenção aplica o com.android.library programaticamente, então o
// accessor `android { }` não existe neste script — configuramos pela extensão.
extensions.configure<LibraryExtension> {
    buildFeatures { buildConfig = true }
    defaultConfig {
        // Base padrão. Em runtime o DeviceStore sobrescreve (tela de setup);
        // em desenvolvimento, `-PtvApiBase=http://10.0.2.2:8099` aponta o APK
        // para um servidor local sem editar código.
        // Produção é `tridigaius`. O `tv-app` antigo aponta até hoje para
        // `dashvendas-ashen`, que já não existe (devolve 404 em tudo) — o app
        // só funciona lá porque alguém salvou a URL certa nas prefs do aparelho.
        // Este default é o que uma TV nova usa antes de qualquer configuração.
        val base = providers.gradleProperty("tvApiBase")
            .getOrElse("https://tridigaius.vercel.app")
        buildConfigField("String", "DEFAULT_API_BASE", "\"$base\"")
    }
}

dependencies {
    implementation(project(":core:storage"))
    implementation(project(":core:session"))
    api(libs.okhttp)
}
