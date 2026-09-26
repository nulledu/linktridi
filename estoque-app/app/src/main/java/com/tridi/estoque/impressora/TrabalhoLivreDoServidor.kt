package com.tridi.estoque.impressora

import com.tridi.estoque.net.ConteudoLivreDto

/**
 * O trabalho livre que o SERVIDOR mandou, na forma que o layout entende.
 *
 * É UMA função de propósito, e a unicidade é o ponto: o mesmo JSON entra por
 * dois caminhos — a fila do bootstrap (`EstoqueSyncWorker`) e o broadcast de
 * adb (`ImprimirLivreReceiver`) — e dois parsers do mesmo contrato divergem
 * sem ninguém notar: um campo novo mapeado num lado e esquecido no outro só
 * aparece na tira de papel, semanas depois.
 *
 * @param copias quantas tiras saem. A fila do servidor guarda as vias na
 *               PRÓPRIA linha (`TrabalhoImpressaoEntity.copias`) e passa por
 *               aqui; quem não tem esse contexto usa as do conteúdo.
 */
fun ConteudoLivreDto.paraTrabalho(copias: Int = this.copias): EtiquetaLivreLayout.TrabalhoLivre =
    EtiquetaLivreLayout.TrabalhoLivre(
        linhas = linhas.map {
            EtiquetaLivreLayout.LinhaLivre(
                texto = it.texto,
                tamanho = EtiquetaLivreLayout.Tamanho.de(it.tamanho),
                negrito = it.negrito,
            )
        },
        codigo = codigo,
        qr = qr,
        qrAoLado = qrAoLado,
        mostrarCodigo = mostrarCodigo,
        alturaMm = alturaMm,
        larguraMm = larguraMm,
        copias = copias,
    )
