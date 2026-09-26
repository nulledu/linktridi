import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { CONFERENCIA_DE_ATIVIDADE_LIGADA, FILA_DESLIGADA } from "@/lib/conferencia-de-atividade";
import { authorizeDevice, deviceAuthFailure } from "../_device";
import { freioDevice, origemDe, resposta429 } from "../_freio";
import {
  varrerPendentesDeConferencia, itensPorNome, chaveDeNome, contarAcervoAnterior,
  corteDaFila, fotosDeExecutores, ErroVarredura, DIAS_DA_FILA,
} from "@/lib/estoque-fila-conferencia";
import { minutosDaAtividade } from "@/lib/estoque-conferencia-contexto";
import { sugerirItens, type ItemDoCatalogo } from "@/lib/estoque-sugestao-item";

export const dynamic = "force-dynamic";

const LIMITE = 100;

/** Ver o gêmeo do navegador (app/api/estoque/conferencias/pendentes). */
const TETO_CATALOGO = 500;
const SUGESTOES_POR_CAIXA = 3;

// GET /api/estoque/device/conferencias-pendentes — as "caixas paradas
// esperando o gestor" que o leitor do galpão lista pra conferência: atividades
// de produção já concluídas pelo executor, mas ainda sem APROVAÇÃO em
// estoque_conferencias.
//
// A varredura é a MESMA da fila do computador (lib/estoque-fila-conferencia.ts).
// Antes eram duas cópias, e esta ficou pra trás com dois defeitos que só o
// galpão sentia — este aqui é o aparelho principal de conferência:
//
//  · o erro do SELECT de `estoque_conferencias` era descartado, então num banco
//    onde o SQL pendente não rodou (é o estado de hoje) o tablet listava 100%
//    das atividades concluídas como conferíveis e recusava cada toque. Agora a
//    resposta traz `qcDesligado: true` com a fila VAZIA — a mesma verdade que a
//    tela do computador já contava.
//  · o filtro do "já conferida" era feito em JavaScript DEPOIS do teto de 100,
//    então 100 linhas presas escondiam uma caixa real sem erro nenhum. A
//    varredura agora continua em janelas até juntar a página.
//
// O filtro além de status='concluida' é `estoque_lancado = false`, o carimbo de
// "ninguém conferiu ainda" — concluir NÃO dá entrada no estoque, e existe teste
// varrendo o repositório pra manter isso assim
// (lib/__tests__/estoque-entra-so-por-conferencia.test.ts).
//
// O terceiro filtro, `produto_nome` presente, MORREU: ele descartava 103 das
// 104 atividades concluídas do galpão, e a tela do tablet dizia "nada esperando
// conferência" com três semanas de produção parada no chão. Ver
// lib/estoque-fila-conferencia.ts. O que a atividade tem é a TAREFA em texto, e
// é ela que vai no `produtoNome` do DTO quando não há produto — o tablet
// mostra "Montar alavancas" em vez de "Atividade sem nome".
export async function GET(req: NextRequest) {
  if (!freioDevice.consumir(origemDe(req.headers)).permitido) return resposta429();
  const auth = await authorizeDevice(req);
  if (!auth.ok) return deviceAuthFailure();
  // Conferência de atividade desligada (lib/conferencia-de-atividade.ts): a
  // fila volta vazia, no formato que o app já entende.
  if (!CONFERENCIA_DE_ATIVIDADE_LIGADA) return NextResponse.json(FILA_DESLIGADA);

  const db = createSupabaseAdminClient();
  // A MESMA janela do computador: o tablet mostra a semana. O que ficou pra
  // trás vira um número na tela ("83 mais antigas"), porque uma lista de três
  // semanas num tablet de galpão é rolagem, não trabalho — e quem decide o que
  // fazer com o acervo faz isso sentado, no ERP.
  const corte = corteDaFila();
  let varredura;
  try {
    varredura = await varrerPendentesDeConferencia(db, { pagina: LIMITE, desde: corte });
  } catch (e) {
    if (e instanceof ErroVarredura) return NextResponse.json({ error: "failed", detail: e.detalhe }, { status: 500 });
    return NextResponse.json({ error: "failed", detail: String(e).slice(0, 120) }, { status: 500 });
  }

  // Fila vazia + o motivo. O aparelho antigo ignora o campo novo (o parser tem
  // `ignoreUnknownKeys`) e simplesmente mostra "nada esperando", que já é
  // infinitamente melhor do que listar tudo e recusar toque por toque.
  if (varredura.qcDesligado) {
    return NextResponse.json({ atividades: [], qcDesligado: true, travadas: 0 });
  }

  // itemId é só informativo pro leitor (mostrar antes de abrir a conferência)
  // — a rota de conferência resolve o item de novo, por nome, na hora de
  // gravar. Uma consulta só pro lote inteiro (nunca embed por atividade).
  const itens = await itensPorNome(db, varredura.pendentes.map((a) => a.produto_nome ?? ""), LIMITE);

  // O catálogo inteiro UMA vez, pra sugerir o destino de cada caixa — o tablet
  // recebe três nomes por caixa, nunca a lista de 192.
  //
  // `ativo = true` é o MESMO filtro de /api/estoque/device/catalogo, e tem de
  // ser: aquela rota é a cópia local em que a busca do tablet procura quando
  // nenhuma sugestão serve. Sem esta linha, um item desativado podia ser
  // sugerido aqui, o gestor tocava em "Trocar" pra reconsiderar, procurava o
  // mesmo nome — e não achava, porque a cópia local nunca o recebeu. As duas
  // pontas da mesma escolha respondendo coisas diferentes é o que faz a pessoa
  // concluir que o app perdeu o item. Item fora de linha também não deve
  // receber produção nova.
  let catalogo: ItemDoCatalogo[] = [];
  if (varredura.pendentes.length) {
    const { data } = await db
      .from("estoque_itens")
      .select("id,nome,categoria,serializado")
      .eq("ativo", true)
      .order("nome")
      .limit(TETO_CATALOGO);
    catalogo = (data ?? []) as ItemDoCatalogo[];
  }

  // O rosto de quem fez. No tablet vale ainda mais que no computador: o gestor
  // está de pé no galpão procurando de QUEM é a caixa, e cinco pessoas
  // produzindo significam cinco URLs pra uma lista inteira — o cache de disco
  // do Coil baixa cada uma uma vez e nunca mais (ver EstoqueApplication).
  const rostos = await fotosDeExecutores(db, varredura.pendentes.map((a) => a.para_id), LIMITE);

  const resposta = varredura.pendentes.map((a) => {
    const item = itens.get(chaveDeNome(a.produto_nome)) ?? null;
    return {
      id: a.id,
      // O tablet lê `produtoNome` como TÍTULO do cartão. Sem produto, o título
      // é a tarefa — é o que a pessoa procura quando chega na caixa.
      produtoNome: a.produto_nome ?? a.tarefa,
      tarefa: a.tarefa,
      itemId: item?.id ?? null,
      itemSerializado: item ? item.serializado : null,
      // Onde isto provavelmente entra, já ordenado. Vazio quando o item já é
      // conhecido (aí não há o que escolher) ou quando nada bate.
      sugestoes: item
        ? []
        : sugerirItens(
            { tarefa: a.tarefa, categoria: a.categoria, produtoNome: a.produto_nome },
            catalogo,
            SUGESTOES_POR_CAIXA,
          ).map((s) => ({ id: s.id, nome: s.nome, serializado: s.serializado })),
      categoria: a.categoria,
      // A INSTRUÇÃO que a pessoa recebeu ("Colar o PS nas 30 bases"). É contra
      // ela que se decide certo ou errado, e o tablet não a recebia: o gestor
      // conferia o resultado sem saber o que tinha sido pedido.
      detalhe: a.detalhe,
      quantidadeAlvo: a.quantidade_alvo,
      quantidadeFeita: a.quantidade_feita,
      executorId: a.para_id,
      executorNome: a.para_nome,
      executorFotoUrl: rostos.get(a.para_id) ?? null,
      concluidaEm: a.concluida_at,
      // A FOTO DO TRABALHO PRONTO. A LISTA não a baixa — o galpão está em 3G e
      // uma lista de 23 fotos de celular é a tela que nunca termina de abrir.
      // Quem baixa é a ficha, uma por decisão (ver ConferirScreen).
      fotoUrl: a.foto_url,
      /**
       * Minutos partidos no SERVIDOR: minSdk 24 não tem `java.time`.
       *
       * `0` e não `null` de propósito. O DTO do app declara `Int` e o
       * `IntTolerante` só entra em cena depois do decodificador — mandar `null`
       * num campo não-anulável é o tipo de coisa que derruba o PARSE INTEIRO da
       * lista, e aí o gestor fica com a tela vazia sem nenhuma pista do motivo.
       * Zero já significa "não dá pra saber" em `duracaoEmPortugues`.
       */
      tempoRealMin: minutosDaAtividade(a.iniciada_at, a.concluida_at) ?? 0,
      tempoEstimadoMin: a.tempo_estimado_min ?? 0,
    };
  });

  return NextResponse.json({
    atividades: resposta,
    qcDesligado: false,
    // Conferência gravada e o estoque não entrou — o mesmo alerta da tela do
    // computador, pro caso de alguém montar isso no aparelho depois.
    travadas: varredura.travadas,
    /** Concluídas antes da janela: o tablet conta, o ERP resolve. */
    anteriores: await contarAcervoAnterior(db, corte),
    dias: DIAS_DA_FILA,
  });
}
