plugins { id("tridi.core") }

dependencies {
    api(project(":core:panel-api"))
    implementation(project(":core:storage"))
}
