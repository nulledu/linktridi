plugins { id("tridi.core.ui") }

dependencies {
    api(project(":core:panel-api"))
    api(libs.coil.compose)
    api(libs.lottie.compose)
}
