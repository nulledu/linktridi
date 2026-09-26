package com.tridi.tv.core.panelapi

import dagger.Module
import dagger.multibindings.Multibinds
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/**
 * Declara o conjunto de painéis como multibinding. É isto que permite o app
 * compilar e rodar com ZERO painéis instalados — o registry nasce vazio e a tela
 * diz "nenhum painel registrado" em vez de o Dagger recusar o grafo.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class PanelApiModule {
    @Multibinds
    abstract fun panels(): Set<PanelPlugin>
}
