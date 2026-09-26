package com.tridi.estoque.impressora

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Quando a etiqueta saiu da impressora: `04/08 18:57`.
 *
 * COM HORA e SEM ANO, e a troca é de propósito.
 *
 * A hora entra porque numa etiqueta de galpão ela é o que DISTINGUE: num dia
 * saem vários lotes do mesmo item, e "12/08/2026" repetido em quarenta tiras
 * não diz qual delas é a da manhã. Com a hora dá pra achar a caixa da tarde,
 * casar com o turno de quem produziu e desempatar duas contagens do mesmo dia.
 *
 * O ano sai porque a linha mora numa coluna de ~21mm que já carrega o nome do
 * responsável, e alguma coisa tinha de ceder. Entre saber o ANO e saber a HORA,
 * a hora ganha: etiqueta de ano passado se reconhece pelo papel amarelado e
 * pelo estoque que já girou; duas do mesmo dia, não. E `04/08 18:57` são 11
 * caracteres contra os 10 de `12/08/2026` — praticamente a mesma largura, que
 * é o que permitiu a troca sem mexer no layout.
 *
 * ESTE É O ÚNICO LUGAR que formata data de etiqueta no app. Havia três cópias
 * do mesmo `SimpleDateFormat` em dois arquivos, e três cópias de um formato é
 * como uma delas fica pra trás quando o formato muda — foi exatamente o que
 * aconteceu com as chaves de defeito entre o Kotlin e o TypeScript, e derrubou
 * a conferência inteira com um 400 que parecia intermitente.
 *
 * O espelho na web é `fmtDataCurta` em app/(plataforma)/estoque/Etiqueta.tsx.
 * Os dois têm de dizer a mesma coisa: a mesma peça pode ser etiquetada pelo
 * computador ou pelo tablet, e duas etiquetas da mesma caixa com formatos
 * diferentes fazem quem confere achar que são de lotes diferentes.
 *
 * `Locale` fixo em pt-BR: o formato numérico do dia e do mês não pode virar
 * `08/04` porque alguém trocou o idioma do aparelho — no papel não há como
 * saber qual dos dois números é o mês.
 */
fun agoraNaEtiqueta(quando: Date = Date()): String =
    SimpleDateFormat("dd/MM HH:mm", Locale("pt", "BR")).format(quando)
