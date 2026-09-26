import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfileForModule } from "@/lib/require-auth";
import { CONFERENCIA_DE_ATIVIDADE_LIGADA, FILA_DESLIGADA } from "@/lib/conferencia-de-atividade";
import {
  varrerPendentesDeConferencia, itensPorNome, chaveDeNome, contarAcervoAnterior,
  corteDaFila, fotosDeExecutores, ErroVarredura, PAGINA_PADRAO, DIAS_DA_FILA,
} from "@/lib/estoque-fila-conferencia";
import { minutosDaAtividade } from "@/lib/estoque-conferencia-contexto";
import { consumoPorAtividade } from "@/lib/estoque-consumo";
import { sugerirItens, type ItemDoCatalogo } from "@/lib/estoque-sugestao-item";
import { estadoDeEtiqueta } from "@/lib/estoque-etiquetavel";
import { podeAjustarEstoque } from "@/lib/estoque-permissoes";

export const dynamic = "force-dynamic";

// Mesmo gate do resto do Estoque no desktop (/api/estoque/producao-dia). NÃO é
// `colaboradores`: quem confere é o gerente do galpão, cujas chaves são
// `estoque:*` — exigir a área de pessoas dava 403 justamente pro usuário
// principal desta tela. E não inventamos uma sub nova (`estoque:conferir`)
// porque a grade é default-deny: ninguém teria a chave no dia 1 e a aba
// nasceria vazia pra todo mundo.
const CHAVE = "estoque:itens";

/** Quantas pendências a tela recebe por página. */
const PAGINA = PAGINA_PADRAO;

/**
 * Teto do catálogo lido pra SUGERIR o destino.
 *
 * O catálogo de produção tem 192 itens; 500 é folga pra dobrar de tamanho sem
 * ninguém lembrar deste número. É UMA consulta por carga da fila (não uma por
 * atividade) e só quatro colunas curtas — a fila não tem poll, então isto é uma
 * leitura por clique em "Atualizar".
 */
const TETO_CATALOGO = 500;

/** Quantos palpites cada caixa mostra antes de "escolher outro". */
const SUGESTOES_POR_CAIXA = 3;

/**
 * GET /api/estoque/conferencias/pendentes — a fila do gerente NO COMPUTADOR.
 *
 * Irmã de /api/estoque/device/conferencias-pendentes, que autentica por token
 * de APARELHO (o tablet do galpão) e por isso não serve pro navegador. A
 * VARREDURA das duas é a mesma função (lib/estoque-fila-conferencia.ts) desde
 * que a do aparelho ficou pra trás com o desenho antigo e passou a listar tudo
 * como conferível num banco sem `estoque_conferencias`.
 *
 * O que esta rota devolve a MAIS que a do aparelho, porque a tela do computador
 * usa e o leitor não:
 *
 *  · `souEuQuemFez` — quem faz não confere o próprio trabalho, e a tela precisa
 *    saber ANTES da pessoa preencher (no aparelho o operador é resolvido pela
 *    sessão do device, e a rota de conferência recusa na hora).
 *  · `consumo` — quantas peças/caixas de material aquela atividade consumiu. É
 *    o que a tela de bipar PROMETE ("quem conferir depois vê o que entrou") e
 *    que ninguém entregava: o gerente decidia certo/errado olhando só a caixa
 *    pronta, sem saber se as 30 peças saíram de 30 folhas ou de 45.
 */
export async function GET(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  // Conferência de atividade desligada (lib/conferencia-de-atividade.ts).
  if (!CONFERENCIA_DE_ATIVIDADE_LIGADA) return NextResponse.json({ ...FILA_DESLIGADA, proximoCursor: null });

  const antesDe = req.nextUrl.searchParams.get("antesDe");
  // `acervo=1` abre o que ficou pra trás da janela — o que a tela só pede
  // quando a pessoa clica. A fila do dia a dia é a semana (ver DIAS_DA_FILA):
  // sem isso, o primeiro dia depois deste conserto abriria com 104 cartões de
  // três semanas, e uma fila que não se sabe por onde começar não é fila.
  const acervo = req.nextUrl.searchParams.get("acervo") === "1";
  const corte = corteDaFila();
  const db = createSupabaseAdminClient();

  let varredura;
  try {
    varredura = await varrerPendentesDeConferencia(db, {
      cursor: antesDe, pagina: PAGINA, desde: acervo ? null : corte,
    });
  } catch (e) {
    if (e instanceof ErroVarredura) return NextResponse.json({ error: "failed", detail: e.detalhe }, { status: 500 });
    return NextResponse.json({ error: "failed", detail: String(e).slice(0, 120) }, { status: 500 });
  }
  const { pendentes, travadas, proximoCursor, qcDesligado } = varredura;
  if (qcDesligado) {
    return NextResponse.json({ atividades: [], travadas: 0, proximoCursor: null, qcDesligado: true });
  }

  // `serializado` vem junto porque muda o que a tela PROMETE antes de o gerente
  // confirmar: item etiquetado ganha uma etiqueta pra colar na caixa; item que
  // não é etiquetado só tem a quantidade somada, e não sai papel nenhum.
  const itens = await itensPorNome(db, pendentes.map((a) => a.produto_nome ?? ""), PAGINA);

  // O catálogo inteiro, UMA vez, pra sugerir o destino de cada caixa. A conta
  // é pura e roda aqui (lib/estoque-sugestao-item.ts): o cliente recebe três
  // nomes por caixa em vez dos 192 do catálogo.
  let catalogo: ItemDoCatalogo[] = [];
  if (pendentes.length) {
    const { data } = await db
      .from("estoque_itens")
      .select("id,nome,categoria,serializado,quantidade,unidade")
      .order("nome")
      .limit(TETO_CATALOGO);
    catalogo = (data ?? []) as ItemDoCatalogo[];
  }

  // Quanto ficou pra trás da janela. Só quando a tela está mostrando a semana:
  // no modo acervo, "o que ficou pra trás" é justamente o que está na tela.
  const anteriores = acervo ? 0 : await contarAcervoAnterior(db, corte);

  // O rosto de quem fez, numa consulta só pro lote. São no máximo cinco
  // pessoas produzindo no galpão, então 23 cartões usam 5 URLs — o navegador
  // baixa cada uma uma vez. Ver `fotosDeExecutores`.
  const rostos = await fotosDeExecutores(db, pendentes.map((a) => a.para_id), PAGINA);

  // O material que cada atividade consumiu, numa chamada em lote pra página
  // inteira — nunca uma por linha. `semVinculo` é a diferença entre "não
  // consumiu nada" e "o banco ainda não guarda esse vínculo", e a tela precisa
  // dela pra não afirmar que a caixa nasceu do nada.
  let consumoPorId: Record<string, { etiquetas: number; pecas: number }> = {};
  let consumoIndisponivel = true;
  try {
    const lote = await consumoPorAtividade(pendentes.map((a) => a.id));
    consumoPorId = lote.porAtividade;
    consumoIndisponivel = lote.semVinculo;
  } catch {
    // O consumo é contexto, não a fila. Se a consulta cair, a conferência
    // continua possível — a tela só deixa de mostrar o bloco.
    consumoIndisponivel = true;
  }

  const atividades = pendentes.map((a) => {
    const item = itens.get(chaveDeNome(a.produto_nome)) ?? null;
    const consumo = consumoPorId[a.id] ?? null;
    return {
      id: a.id,
      produtoNome: a.produto_nome,
      // O que a pessoa FEZ. Quase toda atividade só tem isto — é o título da
      // caixa na fila, e sem ele a tela mostrava 103 linhas escritas "—".
      tarefa: a.tarefa,
      detalhe: a.detalhe,
      itemId: item?.id ?? null,
      itemSerializado: item ? item.serializado : null,
      // POR QUE vai (ou não) sair papel, decidido no servidor com a mesma régua
      // que a gravação usa (`estadoDeEtiqueta`). Sem isto a tela só sabia
      // "serializado sim/não" e caía no lado conservador: não prometia etiqueta
      // e não oferecia o gesto de preparo — ou seja, quem tinha permissão de
      // ligar a etiqueta nunca via o botão que faz isso.
      preparo: item
        ? { ...estadoDeEtiqueta({ serializado: item.serializado, quantidade: item.quantidade, unidade: item.unidade }),
            quantidade: item.quantidade, unidade: item.unidade }
        : null,
      // Onde isto provavelmente entra. Vazio quando nada bate: a fileira só
      // aparece com o que tem justificativa (ver FORCA_MINIMA).
      sugestoes: item
        ? []
        : sugerirItens(
            { tarefa: a.tarefa, categoria: a.categoria, produtoNome: a.produto_nome },
            catalogo,
            SUGESTOES_POR_CAIXA,
          // Cada sugestão carrega o SEU preparo: quem confere troca de destino
          // dentro do mesmo painel ("Alavanca" por "Cola"), e a promessa muda
          // com o destino, não com a atividade.
          ).map((s) => ({
            ...s,
            preparo: {
              ...estadoDeEtiqueta({ serializado: s.serializado, quantidade: s.quantidade, unidade: s.unidade }),
              quantidade: s.quantidade,
              unidade: s.unidade,
            },
          })),
      categoria: a.categoria,
      quantidadeAlvo: a.quantidade_alvo,
      quantidadeFeita: a.quantidade_feita,
      executorId: a.para_id,
      executorNome: a.para_nome,
      // O rosto de quem fez. `null` quando a pessoa não tem foto cadastrada —
      // e aí a tela mostra as iniciais, nunca um espaço vazio.
      executorFotoUrl: rostos.get(a.para_id) ?? null,
      concluidaEm: a.concluida_at,
      // A FOTO DO TRABALHO PRONTO. A tela NÃO a carrega na lista: 23 fotos de
      // celular de uma vez são megabytes por abertura, e o que a lista mostra é
      // só se existe foto (ver `temFoto` em ConferirClient). A imagem em si só
      // é baixada quando a ficha abre — uma foto por decisão, não 23 por tela.
      fotoUrl: a.foto_url,
      /**
       * O TEMPO, já em minutos. A conta é do servidor (`minutosDaAtividade`,
       * com teto de 12 h) e não da tela: o tablet roda com minSdk 24, onde
       * `java.time` não existe, e duas réguas de data são duas réguas pra
       * divergir.
       */
      tempoRealMin: minutosDaAtividade(a.iniciada_at, a.concluida_at),
      tempoEstimadoMin: a.tempo_estimado_min,
      // A regra "quem confere não pode ser quem fez" (ErroConferenteEExecutor)
      // vem do servidor; a tela precisa dela ANTES da pessoa preencher.
      souEuQuemFez: a.para_id === me.id,
      // `null` = nenhum material bipado nesta atividade. A ausência também é
      // informação pra quem confere, então a tela DIZ isso em vez de omitir.
      consumo,
    };
  });

  return NextResponse.json({
    atividades,
    travadas,
    proximoCursor,
    qcDesligado: false,
    /** `true` = o banco ainda não guarda o vínculo baixa→atividade. */
    consumoIndisponivel,
    /** A tela está mostrando a semana (`false`) ou o acervo inteiro (`true`). */
    acervo,
    /** Quantos dias a janela cobre — a tela escreve o número, não o repete. */
    dias: DIAS_DA_FILA,
    /** Quantas ficaram ANTES da janela. Zero no modo acervo. */
    anteriores,
    /**
     * Se QUEM está olhando pode ligar a etiqueta de um item. Vem uma vez por
     * carga porque é sobre a pessoa, não sobre a caixa. `estoque:itens` (a
     * chave desta rota) é só VER — ligar a etiqueta gera unidade, e unidade é
     * quantidade; por isso a régua aqui é a mesma da rota de preparo.
     */
    podePreparar: await podeAjustarEstoque(me),
  });
}
