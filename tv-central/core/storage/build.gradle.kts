plugins { id("tridi.core") }

dependencies {
    api(project(":core:panel-api"))
    // `api` e não `implementation`: os Flow expostos pelo DeviceStore são
    // derivados de Preferences, e o Kotlin precisa do tipo no classpath de quem
    // consome (core:session quebrava exatamente aqui).
    api(libs.androidx.datastore.preferences)
}
