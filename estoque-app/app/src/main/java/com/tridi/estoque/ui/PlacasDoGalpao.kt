package com.tridi.estoque.ui

// ── Placas do galpão: imprimir e criar lugares, de pé na frente da estante ───
//
// Nasceu da primeira colagem de placas: o mapa divergia da parede (a estante
// E-02 tem 10 andares e o mapa dizia 8; seções fora de ordem; placas perdidas)
// e quem descobre isso está NO galpão, com o tablet na mão. Mandar essa pessoa
// ao escritório pra reimprimir uma placa é garantir que a parede fica sem.
//
// Três atos, nenhum a mais:
//   · navegar a árvore (rua → seção → prateleira) que o servidor conhece;
//   · IMPRIMIR a placa de qualquer lugar — a deitada de 13mm, ou a SÓ-QR em
//     três tamanhos (o módulo do QR escala com a altura; a placa de rua é a
//     mesma etiqueta com mais tira);
//   · CRIAR um lugar novo em qualquer nível, com o código sugerido a partir
//     dos irmãos — e imprimir a placa dele na sequência.
//
// SEM poll: a lista é buscada quando a seção abre e depois de criar. Quem
// chama é gente, nunca relógio — este projeto já caiu duas vezes por consumo.

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tridi.estoque.impressora.EtiquetaLivreLayout
import com.tridi.estoque.impressora.urlDaConferencia
import com.tridi.estoque.net.CriarLocalRequest
import com.tridi.estoque.net.CriarLocalResponse
import com.tridi.estoque.net.LocaisData
import com.tridi.estoque.net.LocalDto
import kotlinx.coroutines.launch

// ── As decisões puras, testáveis sem Android ─────────────────────────────────

/** A placa padrão de um lugar: deitada, QR à esquerda, código grande ao lado. */
internal fun placaDoLugar(codigo: String): EtiquetaLivreLayout.TrabalhoLivre =
    EtiquetaLivreLayout.TrabalhoLivre(
        linhas = listOf(EtiquetaLivreLayout.LinhaLivre(codigo, EtiquetaLivreLayout.Tamanho.GRANDE, negrito = true)),
        codigo = null,
        qr = urlDaConferencia(codigo),
        qrAoLado = true,
        mostrarCodigo = false,
        alturaMm = 13,
        larguraMm = 72,
        copias = 1,
    )

/** Os três tamanhos da placa SÓ-QR. O módulo escala com a altura — ver EtiquetaLivreLayout. */
internal val TAMANHOS_SO_QR = listOf(
    Triple("P", 15, "prateleira"),
    Triple("M", 25, "seção"),
    Triple("G", 40, "rua"),
)

internal fun soQrDoLugar(codigo: String, alturaMm: Int): EtiquetaLivreLayout.TrabalhoLivre =
    EtiquetaLivreLayout.TrabalhoLivre(
        linhas = emptyList(),
        codigo = null,
        qr = urlDaConferencia(codigo),
        alturaMm = alturaMm,
        larguraMm = 72,
        copias = 1,
    )

/**
 * O código sugerido pro filho novo, seguindo o padrão da parede: o pai mais o
 * próximo número livre entre os irmãos ("C-03" com C-03-1..3 → "C-03-4"); na
 * raiz, a próxima letra livre ("A".."Z"). Sugestão, não imposição — o campo
 * fica editável, porque a parede às vezes tem nome próprio (REC).
 */
internal fun sugestaoDeCodigoFilho(paiCodigo: String?, irmaos: List<String>): String {
    if (paiCodigo == null) {
        val usadas = irmaos.map { it.uppercase() }.toSet()
        return (('A'..'Z').firstOrNull { it.toString() !in usadas })?.toString() ?: "RUA-NOVA"
    }
    val prefixo = "${paiCodigo.uppercase()}-"
    val numeros = irmaos.mapNotNull { irmao ->
        irmao.uppercase().removePrefix(prefixo).takeIf { it != irmao.uppercase() }?.toIntOrNull()
    }
    val proximo = (numeros.maxOrNull() ?: 0) + 1
    // Dois dígitos no nível de SEÇÃO (A-01), um no de prateleira (A-01-1) — o
    // padrão que a parede já usa. A profundidade se lê pelo próprio pai.
    val casas = if (paiCodigo.count { it == '-' } == 0) 2 else 1
    return prefixo + proximo.toString().padStart(casas, '0')
}

// ── A seção ──────────────────────────────────────────────────────────────────

@Composable
fun PlacasDoGalpao(
    liberado: Boolean,
    ocupado: Boolean,
    onImprimir: (EtiquetaLivreLayout.TrabalhoLivre) -> Unit,
    carregarLocais: suspend () -> LocaisData?,
    criarLocal: suspend (CriarLocalRequest) -> CriarLocalResponse,
) {
    var locais by remember { mutableStateOf<List<LocalDto>?>(null) }
    var erro by remember { mutableStateOf<String?>(null) }
    var paiAtual by remember { mutableStateOf<LocalDto?>(null) }
    var criando by remember { mutableStateOf(false) }
    val escopo = rememberCoroutineScope()

    suspend fun buscar() {
        erro = null
        locais = try {
            carregarLocais()?.locais ?: run { erro = "Tablet sem ativação."; emptyList() }
        } catch (e: Exception) {
            erro = "Sem conexão com o servidor — os lugares moram lá. Tente de novo com rede."
            emptyList()
        }
    }
    LaunchedEffect(Unit) { buscar() }

    Bloco(titulo = "Placas do galpão") {
        Text(
            "Imprima a placa de qualquer lugar — ou crie um lugar novo quando a parede " +
                "tiver uma prateleira que o mapa não tem.",
            color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp, lineHeight = 22.sp,
            modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp),
        )

        val lista = locais
        when {
            erro != null -> LinhaDeErro(erro!!) { escopo.launch { buscar() } }
            lista == null -> Text(
                "Buscando os lugares…",
                color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                modifier = Modifier.padding(vertical = 8.dp),
            )
            else -> {
                val aqui = lista.filter { it.paiId == paiAtual?.id && it.ativo }
                    .sortedWith(compareBy({ it.ordem }, { it.nome }))

                // O caminho e a volta — quem navega fundo precisa saber onde está.
                if (paiAtual != null) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    ) {
                        Button(
                            onClick = { paiAtual = lista.firstOrNull { it.id == paiAtual?.paiId } },
                            modifier = Modifier.height(56.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = GalpaoSuperficieAlta, contentColor = GalpaoTexto,
                            ),
                        ) { Text("‹ Voltar", fontFamily = FonteTitulo, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
                        Text(
                            paiAtual?.let { "${it.codigo} · ${it.nome}" } ?: "",
                            color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 18.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(start = 12.dp),
                        )
                    }
                }

                if (aqui.isEmpty()) {
                    Text(
                        if (paiAtual == null) "Nenhum lugar cadastrado ainda — crie a primeira rua abaixo."
                        else "Nada dentro de ${paiAtual?.codigo} ainda — crie a primeira prateleira abaixo.",
                        color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 16.sp,
                        modifier = Modifier.padding(vertical = 6.dp),
                    )
                }

                aqui.forEach { local ->
                    LinhaDoLugar(
                        local = local,
                        temFilhos = lista.any { it.paiId == local.id },
                        liberado = liberado && !ocupado,
                        onEntrar = { paiAtual = local },
                        onPlaca = { onImprimir(placaDoLugar(local.codigo)) },
                        onSoQr = { alturaMm -> onImprimir(soQrDoLugar(local.codigo, alturaMm)) },
                    )
                }

                if (criando) {
                    CriarLugar(
                        pai = paiAtual,
                        sugestao = sugestaoDeCodigoFilho(paiAtual?.codigo, aqui.map { it.codigo }),
                        aoCancelar = { criando = false },
                        aoCriar = { codigo, nome, aoFalhar ->
                            escopo.launch {
                                val r = try {
                                    criarLocal(CriarLocalRequest(codigo = codigo, nome = nome, paiId = paiAtual?.id))
                                } catch (e: Exception) {
                                    CriarLocalResponse(ok = false, detalhe = e.message ?: "Sem conexão — tente com rede.")
                                }
                                if (r.ok && r.local != null) {
                                    criando = false
                                    buscar()
                                    // A placa na mão é o motivo de criar aqui: sai já.
                                    if (liberado) onImprimir(placaDoLugar(r.local.codigo))
                                } else {
                                    aoFalhar(r.detalhe ?: "Não deu pra criar. Tente de novo.")
                                }
                            }
                        },
                    )
                } else {
                    Button(
                        onClick = { criando = true },
                        modifier = Modifier.testTag("placas_criar").fillMaxWidth().height(64.dp).padding(top = 6.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = GalpaoSuperficieAlta, contentColor = GalpaoTexto,
                        ),
                    ) {
                        Text(
                            if (paiAtual == null) "+ Rua nova" else "+ Lugar novo em ${paiAtual?.codigo}",
                            fontFamily = FonteTitulo, fontSize = 18.sp, fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun LinhaDoLugar(
    local: LocalDto,
    temFilhos: Boolean,
    liberado: Boolean,
    onEntrar: () -> Unit,
    onPlaca: () -> Unit,
    onSoQr: (Int) -> Unit,
) {
    var escolhendoTamanho by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxWidth().padding(vertical = 4.dp)
            .background(GalpaoSuperficieAlta, RoundedCornerShape(16.dp)).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    local.codigo, color = GalpaoTexto, fontFamily = FonteTitulo,
                    fontSize = 22.sp, fontWeight = FontWeight.Bold,
                )
                Text(
                    local.nome, color = GalpaoTextoFraco, fontFamily = FonteTexto, fontSize = 15.sp,
                )
            }
            if (temFilhos) {
                Button(
                    onClick = onEntrar,
                    modifier = Modifier.height(56.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = GalpaoSuperficieAlta, contentColor = GalpaoTexto,
                    ),
                ) { Text("Abrir ›", fontFamily = FonteTitulo, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
            }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        ) {
            Button(
                onClick = onPlaca,
                enabled = liberado,
                modifier = Modifier.weight(1f).height(56.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = GalpaoAcento, contentColor = GalpaoSobreAcento,
                    disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                ),
            ) { Text("Placa", fontFamily = FonteTitulo, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
            Button(
                onClick = { escolhendoTamanho = !escolhendoTamanho },
                enabled = liberado,
                modifier = Modifier.weight(1f).height(56.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = GalpaoSuperficieAlta, contentColor = GalpaoTexto,
                    disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                ),
            ) { Text("Só QR", fontFamily = FonteTitulo, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
        }
        if (escolhendoTamanho) {
            // O tamanho É a altura da tira: o módulo do QR escala junto, então
            // P cola na prateleira e G se lê da entrada da rua.
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            ) {
                TAMANHOS_SO_QR.forEach { (rotulo, alturaMm, uso) ->
                    Button(
                        onClick = { escolhendoTamanho = false; onSoQr(alturaMm) },
                        enabled = liberado,
                        modifier = Modifier.weight(1f).height(56.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = GalpaoSuperficieAlta, contentColor = GalpaoTexto,
                        ),
                    ) {
                        Text(
                            "$rotulo · ${alturaMm}mm ($uso)",
                            fontFamily = FonteTexto, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun CriarLugar(
    pai: LocalDto?,
    sugestao: String,
    aoCancelar: () -> Unit,
    aoCriar: (codigo: String, nome: String, aoFalhar: (String) -> Unit) -> Unit,
) {
    var codigo by remember { mutableStateOf(sugestao) }
    var nome by remember { mutableStateOf("") }
    var falha by remember { mutableStateOf<String?>(null) }
    var mandando by remember { mutableStateOf(false) }

    Column(
        Modifier.fillMaxWidth().padding(top = 8.dp)
            .background(GalpaoSuperficieAlta, RoundedCornerShape(16.dp)).padding(12.dp),
    ) {
        Text(
            if (pai == null) "Rua nova" else "Lugar novo dentro de ${pai.codigo} · ${pai.nome}",
            color = GalpaoTexto, fontFamily = FonteTitulo, fontSize = 18.sp, fontWeight = FontWeight.Bold,
        )
        // CampoDoGalpao e nunca campo do sistema: em lock task o teclado do
        // Android não sobe, e um campo que não digita é um beco sem saída.
        CampoDoGalpao(
            valor = codigo,
            onValor = { codigo = it; falha = null },
            dica = "código (vai impresso na placa)",
            testTag = "placas_codigo",
            maiusculas = true,
            limite = 16,
        )
        CampoDoGalpao(
            valor = nome,
            onValor = { nome = it; falha = null },
            dica = "nome (aparece na conferência)",
            testTag = "placas_nome",
            limite = 60,
        )
        falha?.let {
            Text(
                it, color = GalpaoAtencao, fontFamily = FonteTexto, fontSize = 15.sp,
                lineHeight = 20.sp, modifier = Modifier.padding(top = 8.dp),
            )
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        ) {
            Button(
                onClick = aoCancelar,
                modifier = Modifier.weight(1f).height(60.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = GalpaoSuperficieAlta, contentColor = GalpaoTexto,
                ),
            ) { Text("Cancelar", fontFamily = FonteTitulo, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
            Button(
                onClick = {
                    mandando = true
                    aoCriar(codigo.trim(), nome.trim()) { frase -> falha = frase; mandando = false }
                },
                enabled = !mandando && codigo.isNotBlank() && nome.isNotBlank(),
                modifier = Modifier.testTag("placas_confirmar").weight(1f).height(60.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = GalpaoAcento, contentColor = GalpaoSobreAcento,
                    disabledContainerColor = GalpaoSuperficieAlta, disabledContentColor = GalpaoTextoFraco,
                ),
            ) {
                Text(
                    if (mandando) "Criando…" else "Criar e imprimir",
                    fontFamily = FonteTitulo, fontSize = 17.sp, fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun LinhaDeErro(frase: String, aoTentar: () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Text(
            frase, color = GalpaoAtencao, fontFamily = FonteTexto, fontSize = 16.sp, lineHeight = 22.sp,
        )
        Button(
            onClick = aoTentar,
            modifier = Modifier.height(56.dp).padding(top = 8.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = GalpaoSuperficieAlta, contentColor = GalpaoTexto,
            ),
        ) { Text("Tentar de novo", fontFamily = FonteTitulo, fontSize = 17.sp, fontWeight = FontWeight.Bold) }
    }
}

