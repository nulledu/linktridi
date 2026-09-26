package com.tridi.tv.panel.maquinas.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tridi.tv.core.network.pollComRecuo
import com.tridi.tv.panel.maquinas.data.MaquinasRepository
import com.tridi.tv.panel.maquinas.data.PainelMaquinas
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MaquinasUiState(
    val carregando: Boolean = true,
    val painel: PainelMaquinas? = null,
    /** O que está na tela veio do cache, não do servidor. */
    val semRede: Boolean = false,
    /** Quando estes números foram verdade. */
    val dadoDe: Long? = null,
)

@HiltViewModel
class MaquinasViewModel @Inject constructor(
    private val repo: MaquinasRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(MaquinasUiState())
    val state: StateFlow<MaquinasUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            // Uma laser troca de trabalho em minutos, não em horas: base de 15s,
            // e o recuo cuida da madrugada — junto com o Ritmo, que já segura em
            // 10min fora do expediente.
            pollComRecuo(
                baseMs = 15_000,
                aindaVazio = { _state.value.painel == null },
            ) {
                val leitura = repo.carregar()
                if (leitura == null) {
                    _state.update { it.copy(carregando = false) }
                    return@pollComRecuo false
                }
                val mudou = leitura.dado.atualizadoEm != _state.value.painel?.atualizadoEm
                _state.update {
                    it.copy(
                        carregando = false,
                        painel = leitura.dado,
                        semRede = !leitura.daRede,
                        dadoDe = leitura.em,
                    )
                }
                mudou
            }
        }
    }
}
