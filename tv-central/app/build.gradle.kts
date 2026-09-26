plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.tridi.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tridi.tv"
        // 23 e não 28: TV box de galpão costuma vir com Android 7/8, e com
        // minSdk 28 o instalador recusa o pacote sem explicar direito. O app
        // não usa nada de API 28 que não tenha guarda de versão.
        minSdk = 23
        targetSdk = 34
        versionCode = 68
        versionName = "1.68"

        // Segredo do auto-registro. Impede que qualquer um cadastre uma TV na
        // frota sem ter o APK — nao e autenticacao forte (quem tem o arquivo
        // extrai), e nao finge ser: o que limita o risco e o alcance do token,
        // que so le painel publico e recebe comando.
        buildConfigField("String", "TV_REGISTRO_SEGREDO", "\"tridi-frota-2026\"")
    }
    /**
     * Assinatura do build interno.
     *
     * Um APK de release sem `signingConfig` sai **sem assinatura** e nenhuma TV
     * instala — o `assembleRelease` "funciona" e o arquivo é inútil na hora do
     * sideload, que é o pior momento para descobrir.
     *
     * Aqui ele é assinado com a keystore de debug do próprio Mac. Isso basta
     * para instalar por pen drive numa TV da empresa, mas NÃO serve para a Play
     * Store nem para distribuição externa. Quando existir uma keystore de
     * verdade, é só apontar `storeFile` para ela.
     *
     * Consequência prática de trocar de keystore depois: o Android trata como
     * outro app e exige desinstalar o anterior (a escolha do painel se perde).
     */
    val keystoreDebug = File(System.getProperty("user.home"), ".android/debug.keystore")
    signingConfigs {
        create("interno") {
            storeFile = keystoreDebug
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
            // v1 (JAR signing) LIGADO junto com v2. O AGP moderno desliga o v1
            // por padrão, e foi isso que deixou o APK "não foi possível
            // reconhecer o pacote" numa TV box: o instalador de ROM antiga/
            // customizada ainda procura a assinatura no META-INF, e sem ela
            // recusa o pacote antes mesmo de olhar o manifesto.
            // Custa alguns KB e não atrapalha aparelho novo, que usa o v2.
            enableV1Signing = true
            enableV2Signing = true
        }
    }

    buildTypes {
        release {
            // R8 LIGADO. Sem ele o APK sai com 23 MB de .dex, e a instalacao
            // numa TV box fraca fica "instalando" pra sempre: o dex2oat compila
            // tudo no aparelho na hora de instalar, e 23 MB de bytecode numa
            // CPU dessas nao termina em tempo humano. Encolhendo o codigo, o
            // dex cai para uma fracao disso e a instalacao volta a ser rapida.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Sem a keystore no Mac, deixa sem assinar em vez de quebrar o build
            // de quem só quer compilar.
            if (keystoreDebug.exists()) signingConfig = signingConfigs.getByName("interno")
        }
    }
    /**
     * Desugaring da biblioteca padrão — o que faz o app FUNCIONAR na TV velha,
     * e não só instalar nela.
     *
     * `minSdk = 23` deixa o pacote entrar num Android 7, mas não inventa as
     * classes que aquele Android não tem. `java.time` só chegou na API 26, e o
     * okio (dentro do OkHttp) usa `java.time.Instant`. O D8, ao ver uma API
     * acima do minSdk, gera um "outline" e adia o problema para o tempo de
     * execução — foi por isso que o build passou, o APK instalou, e a TV
     * quebrou com NoClassDefFoundError: Ljava/time/Instant.
     *
     * O estrago não era só o crash visível: como quem usa `java.time` é a
     * camada de rede, TODA busca de dados morria antes de sair. A TV mostrava
     * "sem dados" e ninguém suspeitaria de uma classe de data ausente.
     *
     * Ligado aqui, o D8 empacota a implementação dessas classes dentro do APK.
     * Custa alguns KB e vale para todo módulo (o flag está na convenção).
     */
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { compose = true; buildConfig = true }
}

dependencies {
    coreLibraryDesugaring(libs.desugar.jdk.libs)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.tv.material)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    ksp(libs.hilt.compiler)

    // O :app lê os PERFIS do /api/config para montar a tela de escolha, e para
    // isso precisa desserializar — o plugin já estava aplicado, faltava a
    // biblioteca (nos módulos ela vem pela convenção `tridi.core`).
    implementation(libs.kotlinx.serialization.json)

    // Núcleo.
    implementation(project(":core:panel-api"))
    implementation(project(":core:design"))
    implementation(project(":core:network"))
    implementation(project(":core:storage"))
    implementation(project(":core:session"))
    implementation(project(":core:kiosk"))
    implementation(project(":core:sinal"))

    // Painéis. Um painel novo entra aqui e em settings.gradle.kts — mais nada.
    implementation(project(":panel:administracao"))
    implementation(project(":panel:logistica"))
    implementation(project(":panel:maquinas"))
    implementation(project(":panel:producao"))
}

/**
 * Trava de arquitetura. Documentação já não segurou este projeto duas vezes
 * (ver CLAUDE.md); o que segura é uma verificação que quebra o build.
 *
 * Regras: painel não depende de painel, e núcleo não depende de painel.
 */
val verificarArquitetura by tasks.registering {
    group = "verification"
    description = "Painel não depende de painel; núcleo não depende de painel."
    doLast {
        val erros = mutableListOf<String>()
        rootProject.subprojects.forEach { p ->
            val ehPainel = p.path.startsWith(":panel:")
            val ehNucleo = p.path.startsWith(":core:")
            if (!ehPainel && !ehNucleo) return@forEach
            p.configurations
                .filter { it.name in setOf("api", "implementation") }
                .flatMap { it.dependencies }
                .filterIsInstance<ProjectDependency>()
                .map { it.path }
                .filter { it.startsWith(":panel:") }
                .forEach { alvo ->
                    if (ehNucleo) erros += "${p.path} (núcleo) depende de $alvo"
                    else if (alvo != p.path) erros += "${p.path} depende de outro painel: $alvo"
                }
        }
        if (erros.isNotEmpty()) {
            throw GradleException(
                "Arquitetura violada:\n" + erros.joinToString("\n") { "  - $it" } +
                    "\n\nO acoplamento entre painéis é o que faz o núcleo virar refém. " +
                    "Se dois painéis precisam do mesmo código, ele vira um módulo em :core:."
            )
        }
    }
}

tasks.named("check") { dependsOn(verificarArquitetura) }

// Também no assemble: a trava que só roda em `check` não protege ninguém — o
// comando do dia a dia é `assembleDebug`, e um acoplamento entre painéis entra
// no repositório antes de alguém lembrar de rodar a verificação.
tasks.matching { it.name.startsWith("assemble") }.configureEach {
    dependsOn(verificarArquitetura)
}
