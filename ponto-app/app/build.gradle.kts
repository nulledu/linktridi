plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "com.tridi.ponto"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.tridi.ponto"
        minSdk = 24   // tablets de chão de fábrica rodam Android 7
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        // URL base do backend (produção). Pode ser trocada na tela de pareamento.
        buildConfigField("String", "DEFAULT_API_BASE", "\"https://tridigaius.vercel.app\"")
    }

    buildTypes {
        release {
            // O tablet SEMPRE roda release: o build debug derrubava 27% dos
            // quadros (Compose com instrumentação de depuração + JIT compilando
            // durante o uso no T606). Sem minify de propósito — R8 + reflexão do
            // ML Kit/ORT/serialization é risco que não paga o ganho aqui.
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Assinatura de debug: instalação interna por adb, sem loja.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    // O modelo .tflite não pode ser comprimido no APK (o interpreter mapeia direto).
    androidResources {
        noCompress += "tflite"
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("io.coil-kt:coil-compose:2.7.0")
    // Animação Lottie (confirmação estilo Face ID) — res/raw/face_id.json.
    implementation("com.airbnb.android:lottie-compose:6.4.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Câmera frontal (preview + captura)
    val camerax = "1.3.4"
    implementation("androidx.camera:camera-core:$camerax")
    implementation("androidx.camera:camera-camera2:$camerax")
    implementation("androidx.camera:camera-lifecycle:$camerax")
    implementation("androidx.camera:camera-view:$camerax")

    // Detecção de rosto (modelo embutido no APK — funciona offline, sem Play Services)
    implementation("com.google.mlkit:face-detection:16.1.7")

    // Reconhecimento: MobileFaceNet (assets/mobile_face_net.tflite) → embedding 192-d.
    // 2.8.0 de propósito: versões novas usam strtod_l (símbolo do Android 8+) e
    // crasham no Android 7 (tablets de chão de fábrica).
    implementation("org.tensorflow:tensorflow-lite:2.8.0")
    // Reconhecimento ArcFace (w600k_mbf, 512-d) roda em ONNX Runtime. O TFLite
    // fica como fallback (MobileFaceNet 192-d) pra aparelho onde o ORT não subir.
    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.19.2")
}
