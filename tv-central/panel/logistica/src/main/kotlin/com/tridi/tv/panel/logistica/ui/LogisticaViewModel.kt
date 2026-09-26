package com.tridi.tv.panel.logistica.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tridi.tv.core.network.pollComRecuo
import com.tridi.tv.panel.logistica.data.LogisticaRepository
import com.tridi.tv.panel.logistica.data.StatusExpedicao
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LogisticaUiState(
    val carregando: Boolean = true,
    val status: StatusExpedicao? = null,
    /** O que está na tela veio do cache, não do servidor. */
    val semRede: Boolean = false,
    /** Quando estes números foram verdade. */
    val dadoDe: Long? = null,
)

@HiltViewModel
class LogisticaViewModel @Inject constructor(
    private val repo: LogisticaRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(LogisticaUiState())
    val state: StateFlow<LogisticaUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            // Expedição muda mais rápido que faturamento: base de 15s, e o recuo
            // cuida da madrugada — junto com o Ritmo, que já segura em 10min
            // fora do expediente.
            pollComRecuo(
                baseMs = 15_000,
                aindaVazio = { _state.value.status == null },
            ) {
                val leitura = repo.carregar()
                if (leitura == null) {
                    _state.update { it.copy(carregando = false) }
                    return@pollComRecuo false
                }
                val mudou = leitura.dado.atualizadoEm != _state.value.status?.atualizadoEm
                _state.update {
                    it.copy(
                        carregando = false,
                        status = leitura.dado,
                        semRede = !leitura.daRede,
                        dadoDe = leitura.em,
                    )
                }
                mudou
            }
        }
    }
}
