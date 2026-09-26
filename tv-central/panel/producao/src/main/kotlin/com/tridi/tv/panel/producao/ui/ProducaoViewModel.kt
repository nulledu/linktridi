package com.tridi.tv.panel.producao.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tridi.tv.core.network.pollComRecuo
import com.tridi.tv.panel.producao.data.ProducaoRepository
import com.tridi.tv.panel.producao.data.TurnoProducao
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProducaoUiState(
    val carregando: Boolean = true,
    val turno: TurnoProducao? = null,
    val semRede: Boolean = false,
    val dadoDe: Long? = null,
)

@HiltViewModel
class ProducaoViewModel @Inject constructor(
    private val repo: ProducaoRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(ProducaoUiState())
    val state: StateFlow<ProducaoUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            // Chão de fábrica muda a cada peça entregue — ritmo base de 20s, e o
            // recuo cuida do resto: cada ciclo sem novidade dobra o intervalo, e
            // uma peça nova devolve o ritmo rápido na hora. Fora do expediente o
            // servidor já segura em 10 min (`ritmoAtual`).
            pollComRecuo(
                baseMs = 20_000,
                aindaVazio = { _state.value.turno == null },
            ) {
                val leitura = repo.carregar()
                if (leitura == null) {
                    _state.update { it.copy(carregando = false) }
                    return@pollComRecuo false
                }
                val antes = _state.value.turno
                // "Mudou" é peça entregue ou fila alterada — não o carimbo de
                // hora, que muda a cada ciclo e seguraria o ritmo rápido para
                // sempre, justamente o que o recuo existe para evitar.
                val mudou = antes == null ||
                    antes.pecasHoje != leitura.dado.pecasHoje ||
                    antes.concluidasHoje != leitura.dado.concluidasHoje ||
                    antes.emAndamento != leitura.dado.emAndamento ||
                    antes.pendentes != leitura.dado.pendentes
                _state.update {
                    it.copy(
                        carregando = false,
                        turno = leitura.dado,
                        semRede = !leitura.daRede,
                        dadoDe = leitura.em,
                    )
                }
                mudou
            }
        }
    }
}
