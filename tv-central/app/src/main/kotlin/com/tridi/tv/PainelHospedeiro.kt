package com.tridi.tv

import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.HasDefaultViewModelProviderFactory
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewmodel.compose.LocalViewModelStoreOwner
import com.tridi.tv.core.panelapi.PanelId

/**
 * Dá a cada painel um ciclo de vida próprio.
 *
 * Sem isto, o `hiltViewModel()` de dentro de um painel cai no store da Activity:
 * o ViewModel sobrevive à troca de painel e o `pollComRecuo` dele CONTINUA
 * batendo no servidor para sempre — uma tela que ninguém está vendo gerando
 * invocação, que é exatamente a conta que pausou o projeto na Vercel.
 *
 * Foi medido: com o painel de Administração na tela, o servidor seguia recebendo
 * `/api/logistica/painel` do painel anterior, alternando com `/api/sales`.
 *
 * Aqui cada `PanelId` ganha um `ViewModelStore` próprio, esvaziado ao sair — o
 * `onCleared` do ViewModel cancela o `viewModelScope`, e o poll morre junto.
 * Vale para todo painel presente e futuro; nenhum deles precisa saber disso.
 *
 * O owner **precisa** repassar a fábrica da Activity: sem
 * `HasDefaultViewModelProviderFactory`, o `hiltViewModel()` perde a fábrica do
 * Hilt, tenta o construtor vazio e o app morre com
 * `NoSuchMethodException: AdminViewModel.<init> []`.
 */
@Composable
fun PainelHospedeiro(id: PanelId, conteudo: @Composable () -> Unit) {
    val activity = LocalContext.current as ComponentActivity

    val owner = remember(id) {
        object : ViewModelStoreOwner, HasDefaultViewModelProviderFactory {
            override val viewModelStore = ViewModelStore()

            override val defaultViewModelProviderFactory: ViewModelProvider.Factory
                get() = activity.defaultViewModelProviderFactory

            override val defaultViewModelCreationExtras: CreationExtras
                get() = activity.defaultViewModelCreationExtras
        }
    }

    DisposableEffect(id) {
        onDispose { owner.viewModelStore.clear() }
    }

    CompositionLocalProvider(LocalViewModelStoreOwner provides owner) {
        conteudo()
    }
}
