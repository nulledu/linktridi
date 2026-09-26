plugins { id("tridi.panel") }

// O sinal em tempo real: o painel recarrega a config quando o servidor cutuca.
dependencies { implementation(project(":core:sinal")) }
