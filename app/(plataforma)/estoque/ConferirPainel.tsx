"use client";

// ── Conferir uma caixa (computador) ──────────────────────────────────────────
// O gêmeo de desktop da tela de conferência do tablet. Mesmo ato, mesma função
// no servidor (registrarConferencia), e agora o mesmo vocabulário do galpão:
// o gerente olha a caixa pronta e diz UMA coisa — CERTO ou ERRADO.
//
//   CERTO  → nasce UMA etiqueta (a caixa lacrada) com a quantidade que a PESSOA
//            registrou ao concluir, o estoque recebe na hora e a atividade
//            fecha.
//   ERRADO → não entra nada e a atividade volta pra pessoa refazer, com os
//            defeitos marcados. O material de entrada saiu do estoque lá no
//            começo, quando ela bipou a caixa, então a perda já está
//            contabilizada — ninguém lança nada aqui.
//
// O QUE SUMIU E POR QUÊ: os dois campos de quantidade (aprovadas/recusadas) e a
// nota de 1 a 5. A quantidade agora é só LEITURA — o gerente não digita número
// nenhum, porque quem contou as peças foi quem as fez, na bancada, na hora de
// concluir. E cinco notas viravam "mediano" pra tudo que não era claramente bom
// nem claramente ruim: "mediano" não diz o que fazer com a caixa.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EtiquetaConferencia } from "@/lib/estoque-conferencia";
import { DEFEITOS } from "@/lib/estoque-qualidade";
import { diferencaDeQuantidade, tempoDaAtividade } from "@/lib/estoque-conferencia-contexto";
import { rotuloUnidade } from "@/lib/estoque-unidade-compra";
import { Icon } from "../Icon";
import { Acoes, Botao, Campo, Esp, PainelLateral } from "../ui/controles";
import { FolhaDeEtiquetas, type DadosEtiqueta } from "./Etiqueta";
import { useLarguraDeFolha, useTrazerPraVista } from "./painel-visivel";
import {
  desfechoDoCerto, mensagemDeErroDeConferencia, mensagemDeErroDePreparo, tituloDaPendencia,
  type DesfechoDaEtiqueta, type DestinoDoCatalogo, type PendenteConferencia, type PreparoDoItem,
} from "./conferencia-tipos";
import { Alerta } from "../ui/Alerta";

type Modo = "certo" | "errado";

/** Como a pilha da prateleira vira papel colado — a decisão é de quem está de
 *  frente pra ela, não do código. */
type ModoDePreparo = "pilha" | "peca";

interface Gravado {
  resultado: string;
  /** Peças que entraram no estoque. Sempre 0 no errado. */
  quantidade: number;
  unidades: string[];
  etiquetas: EtiquetaConferencia[];
  reaberta: boolean;
  /** Por que não saiu papel, quando não saiu. Vem do servidor já em português. */
  preparo: PreparoDoItem | null;
  /** O que a aprovação tirou do estoque pelo toggle "desconta" da ficha. */
  baixaFicha: {
    descontados: { nome: string; quantidade: number; saldo: number; faltou: number }[];
    pulados: { nome: string; motivo: string }[];
  } | null;
}

/** O servidor devolve a etiqueta já montada (nome, local, responsável); a
 *  `Etiqueta` chama de `impressoEm` o que a conferência chama de `data`. */
function paraEtiquetaImpressa(e: EtiquetaConferencia): DadosEtiqueta {
  return {
    codigo: e.codigo,
    nome: e.nome,
    // Quantas peças vão DENTRO da caixa. Sem este campo a etiqueta sai calada
    // (ausente = 1 peça), e quem pega a caixa lacrada na prateleira só descobre
    // o que tem dentro rompendo o lacre. O tablet já imprimia o selo; faltava o
    // gêmeo aqui, na conferência do computador.
    quantidade: e.quantidade,
    corDimensoes: e.corDimensoes,
    local: e.local,
    localDetalhe: e.localDetalhe,
    responsavel: e.responsavel,
    impressoEm: e.data,
  };
}

export function ConferirPainel({ pendente, consumoIndisponivel, podePreparar, onFechar, onConferido }: {
  pendente: PendenteConferencia;
  /** O banco ainda não guarda o vínculo baixa→atividade — ver `MaterialQueEntrou`. */
  consumoIndisponivel?: boolean;
  /** Quem está olhando tem poder de ajuste de estoque — ver `RespostaPendentes`. */
  podePreparar?: boolean;
  onFechar: () => void;
  /** Chamado depois que a conferência gravou — a fila e o histórico recarregam. */
  onConferido: () => void;
}) {
  // A MESMA conta do servidor (lib/estoque-conferencia.ts): vale o que a pessoa
  // registrou ao concluir e, se ela não informou nada, o alvo da atividade. Sem
  // esse espelho a tela prometeria uma quantidade e a caixa nasceria com outra.
  const pecas = pendente.quantidadeFeita > 0 ? pendente.quantidadeFeita : pendente.quantidadeAlvo;
  const semInformar = pendente.quantidadeFeita <= 0 && pecas > 0;

  const [modo, setModo] = useState<Modo | null>(null);
  const [defeitos, setDefeitos] = useState<string[]>([]);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gravado, setGravado] = useState<Gravado | null>(null);
  const [avisoImpressao, setAvisoImpressao] = useState(false);
  // O botão de confirmar mora no rodapé FIXO e a faixa de erro no fim do corpo
  // rolável. A 320px, com a pessoa lendo o topo, a frase da falha nascia 934px
  // abaixo da última linha visível: o toque não mudava nada na tela.
  const refErro = useTrazerPraVista<HTMLDivElement>(erro);
  const largura = useLarguraDeFolha(620);

  // ── O DESTINO ───────────────────────────────────────────────────────────────
  // Em qual item do catálogo estas peças entram. A atividade quase nunca diz
  // (103 das 104 concluídas em produção não apontam produto nenhum): quem lança
  // o trabalho escreve "Montar alavancas", e quem conhece o catálogo de 192
  // itens é quem confere, com a caixa na frente.
  //
  // Quando a atividade JÁ aponta um item, não há escolha nenhuma a fazer — o
  // destino nasce pronto e o bloco nem aparece.
  const [destino, setDestino] = useState<DestinoDoCatalogo | null>(
    pendente.itemId
      ? {
          id: pendente.itemId,
          nome: pendente.produtoNome ?? "",
          categoria: pendente.categoria,
          serializado: pendente.itemSerializado !== false,
          preparo: pendente.preparo ?? null,
        }
      : null,
  );
  const precisaEscolherDestino = !pendente.itemId;

  /**
   * QUEM ESCOLHEU DE FATO — e por que isso não é o mesmo que `destino`.
   *
   * O `destino` acima nasce pré-preenchido com `pendente.itemId` quando a
   * atividade aponta produto. Só que esse id vem de `itensPorNome`
   * (lib/estoque-fila-conferencia.ts), um `Map` chaveado pelo nome
   * normalizado: DOIS itens do catálogo com o mesmo nome colapsam numa entrada
   * só e o último da consulta vence.
   *
   * Mandar esse id como `destinoId` faz o servidor pular `ErroNomeAmbiguo`, que
   * existe justamente pra NÃO depositar a caixa num item ao acaso — a tela
   * estaria contornando a guarda que ela mesma deveria respeitar, e em
   * silêncio: as peças entram, o número fecha, e ninguém descobre que entraram
   * no item errado.
   *
   * Não é hipotético: o catálogo tem hoje "Círculo hexagonal" duas vezes.
   *
   * Então só viaja o id que uma PESSOA escolheu na tela. Sem escolha, o
   * servidor resolve pelo nome — com a guarda ligada, e recusando com frase
   * quando houver empate.
   */
  const [escolhidoAqui, setEscolhidoAqui] = useState(false);

  // ── PREPARAR O ITEM PRA ETIQUETA ────────────────────────────────────────────
  // Qual modo está rodando agora (`null` = nenhum), a falha da última tentativa
  // e o que acabou de dar certo. O resultado NÃO vira só um toast: o gerente
  // precisa ver, na mesma tela, que a promessa de baixo mudou de "não sai
  // etiqueta" pra "vai nascer uma etiqueta só" — senão ele fecha o painel achando
  // que não adiantou.
  const [preparando, setPreparando] = useState<ModoDePreparo | null>(null);
  const [erroPreparo, setErroPreparo] = useState<string | null>(null);
  const [preparoFeito, setPreparoFeito] = useState<{ modo: ModoDePreparo; geradas: number } | null>(null);

  // Os impedimentos do SERVIDOR, mostrados ANTES de a pessoa gastar trabalho.
  // São dois níveis, e a diferença importa:
  //
  //  · quem fez não confere o próprio trabalho (ErroConferenteEExecutor) barra
  //    os dois lados — nem certo nem errado;
  //  · destino não escolhido (ErroDestinoNaoEscolhido) e quantidade que ninguém
  //    informou (ErroQuantidadeIndefinida) barram só o CERTO. Reprovar não toca
  //    no estoque nem depende do catálogo, então continua liberado — e é
  //    justamente o que tira a caixa errada da fila em vez de deixá-la presa lá
  //    pra sempre.
  const bloqueioTotal = pendente.souEuQuemFez
    ? "Você fez esta peça. Quem confere tem de ser outra pessoa — é o que garante que ninguém aprove o próprio trabalho."
    : null;
  const bloqueioCerto = bloqueioTotal ?? (
    !destino
      ? "Escolha primeiro em qual item do catálogo estas peças entram — é lá que elas vão ser somadas. Marcar como errado não precisa de destino."
      // ── O ALVO NÃO SUBSTITUI O CONTADO ───────────────────────────────────
      // `pecas` cai no alvo quando ninguém informou, e isso é bom PRA MOSTRAR
      // ("Alvo da atividade (ninguém informou o feito)") — mas era só isso que
      // o bloqueio olhava. Com alvo 30 e feito 0 ele não disparava: a tela
      // prometia que 30 entrariam, a pessoa preenchia a ficha inteira, e o
      // servidor recusava no fim com `quantidade_indefinida` — porque ele usa
      // `quantidade_feita` do banco e não o que a tela mostrou.
      //
      // Deixar passar seria pior que a recusa tardia: entrariam 30 peças num
      // dia em que se fizeram 11, e o erro só apareceria na contagem física.
      // Quem conta é quem fez; a conferência confirma, não estima.
      : pendente.quantidadeFeita <= 0
        ? "Ninguém registrou quantas peças foram feitas — o número que aparece aí é o ALVO da atividade, não o contado. Peça a quem fez pra informar a quantidade em Atividades, ou marque como errado pra devolver o trabalho."
        : pecas <= 0
          ? "Ninguém informou quantas peças foram feitas (nem a atividade tem alvo), então não dá pra saber o que entraria no estoque. Marcar como errado devolve o trabalho pra quem fez."
          : null
  );

  // Reprovar sem dizer por quê não serve pra ninguém: quem vai refazer precisa
  // saber o que corrigir, e é o defeito marcado que alimenta "o que mais dá
  // errado" na ficha de quem produz. A observação vale como escape pro motivo
  // que não está na lista fechada.
  const motivoDoErrado = defeitos.length > 0 || obs.trim().length > 0;

  const podeConfirmar = !salvando && (
    modo === "certo" ? !bloqueioCerto : modo === "errado" ? !bloqueioTotal && motivoDoErrado : false
  );

  function escolher(m: Modo) {
    setModo(m);
    setErro(null);
  }

  function alternarDefeito(key: string) {
    setDefeitos((cur) => (cur.includes(key) ? cur.filter((d) => d !== key) : [...cur, key]));
  }

  /**
   * Faz a pilha da prateleira virar papel colado, sem sair desta tela.
   *
   * A rota já existia e já sabia a parte difícil: ela tem a permissão certa
   * (`estoque:ajustar` ou papel do galpão), o teto de 2000 etiquetas e a dança
   * de três passos que contorna a guarda do banco (zera, liga `serializado`,
   * gera) com rollback se o meio falhar. O que faltava era um CAMINHO até ela
   * de dentro da conferência — pela tela, item com estoque contado não tinha
   * como virar etiquetado, e o gerente descobria isso com a caixa na mão.
   *
   * `quantidade` não viaja de propósito: ausente, a rota usa "as que já estão
   * contadas na prateleira". Mandar o número que a tela leu há dois minutos
   * seria congelar um saldo que outra pessoa pode ter acabado de mexer.
   */
  async function preparar(modo: ModoDePreparo) {
    if (!destino || preparando) return;
    setPreparando(modo);
    setErroPreparo(null);
    try {
      const r = await fetch("/api/estoque/unidades/preparar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo, itens: [{ item_id: destino.id }] }),
      });
      const d = await r.json().catch(() => null);
      // A rota responde 200 com um resultado POR ITEM: pedir um só e olhar
      // apenas o `r.ok` engoliria a frase que o banco escreveu pra ESTE item.
      const res = Array.isArray(d?.resultados) ? d.resultados[0] : null;
      if (!r.ok || !d?.ok || !res?.ok) {
        setErroPreparo(res?.erro || mensagemDeErroDePreparo(d?.error));
        return;
      }
      const geradas = Number(res.geradas) || 0;
      setPreparoFeito({ modo, geradas });
      // O item passou a ser etiquetado AGORA. Trocar o destino no lugar é o que
      // deixa conferir na sequência sem recarregar: a promessa de baixo relê
      // daqui e passa a prometer o papel que de fato vai sair.
      setDestino((cur) => (cur ? {
        ...cur,
        serializado: true,
        preparo: {
          estado: "ja_etiquetado",
          motivo: "Item preparado agora: ao aprovar, sai a etiqueta da caixa lacrada.",
          quantidade: cur.preparo?.quantidade ?? 0,
          unidade: cur.preparo?.unidade ?? null,
        },
      } : cur));
    } catch {
      setErroPreparo(mensagemDeErroDePreparo(null));
    } finally {
      setPreparando(null);
    }
  }

  async function confirmar() {
    if (!podeConfirmar || !modo) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/estoque/conferencias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          atividadeId: pendente.id,
          // QUANTIDADE NÃO VAI NO CORPO. O servidor lê a que a pessoa registrou
          // ao concluir — mandar daqui seria o gerente digitando de novo, que é
          // exatamente o que este redesenho tirou.
          resultado: modo,
          // O destino só faz sentido na aprovação. No errado nada entra no
          // estoque, então mandar um item aqui seria gravar um endereço pra uma
          // peça que não foi a lugar nenhum.
          // Só o que uma pessoa escolheu — ver `escolhidoAqui` acima. O
          // pré-preenchido não viaja: ele pularia a guarda de nome ambíguo.
          destinoId: modo === "certo" && escolhidoAqui ? destino?.id ?? null : null,
          // A ordem do envio não pode depender de em que ordem a pessoa clicou.
          defeitos: modo === "errado" ? DEFEITOS.filter((d) => defeitos.includes(d.key)).map((d) => d.key) : [],
          obs: modo === "errado" ? obs.trim() || null : null,
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) {
        setErro(mensagemDeErroDeConferencia(d?.error));
        return;
      }
      setGravado({
        resultado: typeof d.resultado === "string" ? d.resultado : modo,
        quantidade: Number(d.quantidade) || 0,
        unidades: d.unidades ?? [],
        etiquetas: d.etiquetas ?? [],
        reaberta: !!d.reaberta,
        // Por que não saiu papel, dito por quem sabe: o servidor conhece a
        // unidade e o saldo do item, a tela não. Sem isto o resultado só sabia
        // repetir "este produto não é etiquetado" pros quatro casos.
        preparo: (d.preparo as PreparoDoItem | undefined) ?? null,
        baixaFicha: (d.baixaFicha as Gravado["baixaFicha"] | undefined) ?? null,
      });
      onConferido();
    } catch {
      setErro(mensagemDeErroDeConferencia(null));
    } finally {
      setSalvando(false);
    }
  }

  // Registra quem imprimiu e quando, antes do diálogo abrir — mesma rota da
  // bipagem. Se o registro falhar, a folha AINDA imprime: a conferência já foi
  // gravada e as peças já estão no estoque; segurar o papel por causa do livro
  // de impressões só deixaria o gerente com etiqueta faltando na caixa.
  async function registrarImpressao() {
    // O item é o DESTINO (o que o gerente escolheu), não o `itemId` que veio da
    // fila: nas atividades sem produto ele é nulo, e o livro de impressões
    // ficava sem saber de que item era a etiqueta que acabou de sair.
    if (!gravado || !destino) return;
    try {
      const r = await fetch("/api/estoque/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etiquetas: gravado.etiquetas.map((e) => ({
            codigo: e.codigo,
            item_id: destino.id,
            // O id da caixa que nasceu. Gravava `null` aqui, e como este era o
            // único caminho de impressão da plataforma a coluna `unidade_id` do
            // livro de impressões era SEMPRE nula: dava pra saber que um código
            // foi impresso, não pra ir da etiqueta até a caixa e até a
            // conferência que a criou.
            unidade_id: e.unidadeId ?? null,
            local_texto: e.local || null,
          })),

        }),
      });
      if (!r.ok) setAvisoImpressao(true);
    } catch {
      setAvisoImpressao(true);
    }
  }

  // O que a pessoa FEZ. Era `produtoNome ?? "Atividade sem produto"`, e como
  // quase nenhuma atividade tem produto, o painel abria dizendo "Conferir ·
  // Atividade sem produto" pra um trabalho que tem nome: "Montar alavancas".
  const titulo = tituloDaPendencia(pendente);

  // A promessa do CERTO sai daqui, e não mais de `serializado`: o veredicto do
  // servidor sobre o item ESCOLHIDO, cruzado com o poder de quem confere.
  const etiqueta = desfechoDoCerto({
    preparo: destino?.preparo,
    serializado: destino?.serializado ?? false,
    podePreparar: !!podePreparar,
  });

  return (
    <PainelLateral
      titulo={gravado ? (gravado.resultado === "certo" ? "Certo — entrou no estoque" : "Errado — voltou pra refazer") : `Conferir · ${titulo}`}
      subtitulo={gravado ? titulo : `Feito por ${pendente.executorNome}`}
      onFechar={onFechar}
      largura={largura}
      rodape={
        gravado ? (
          <Acoes>
            <Esp />
            <Botao variante="primario" icone="check" onClick={onFechar}>Fechar</Botao>
          </Acoes>
        ) : (
          <Acoes>
            <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
            <Esp />
            <Botao
              variante={modo === "errado" ? "perigo" : "primario"}
              icone={modo === "errado" ? "circle-x" : "circle-check"}
              onClick={confirmar}
              carregando={salvando}
              disabled={!podeConfirmar}
            >
              {modo === "errado" ? "Confirmar errado" : modo === "certo" ? "Confirmar certo" : "Confirmar"}
            </Botao>
          </Acoes>
        )
      }
    >
      {gravado
        ? <PainelResultado gravado={gravado} produto={destino?.nome || titulo} executor={pendente.executorNome} aviso={avisoImpressao} onImprimir={registrarImpressao} preparoDoDestino={destino?.preparo ?? null} />
        : (
          <>
            {bloqueioTotal && <Aviso tom="atencao" icone="alert-triangle">{bloqueioTotal}</Aviso>}

            {/* A ordem é a narrativa da conferência: o que foi PEDIDO, o que
                FICOU pronto (a foto), quanto SAIU, com que material. Só depois
                vem a decisão. */}
            <OQueFoiPedido detalhe={pendente.detalhe} />

            <FotoDoTrabalho url={pendente.fotoUrl} executor={pendente.executorNome} />

            <QuantoFoiFeito pendente={pendente} pecas={pecas} semInformar={semInformar} />

            <MaterialQueEntrou
              consumo={pendente.consumo}
              indisponivel={!!consumoIndisponivel}
              executor={pendente.executorNome}
              pecasFeitas={pecas}
            />

            {precisaEscolherDestino && (
              <EscolherDestino
                sugestoes={pendente.sugestoes ?? []}
                escolhido={destino}
                onEscolher={(d) => { setDestino(d); setEscolhidoAqui(true); setErro(null); }}
              />
            )}

            <Campo label="A caixa está certa?" dica="Só existem estas duas respostas — é o que decide se ela entra no estoque ou volta pra bancada.">
              <div style={{
                display: "grid", gap: 10, marginTop: 2,
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
              }}>
                <Botao
                  variante={modo === "certo" ? "primario" : "secundario"}
                  tamanho="lg" bloco icone="circle-check"
                  aria-pressed={modo === "certo"}
                  disabled={!!bloqueioCerto}
                  onClick={() => escolher("certo")}
                >
                  Certo
                </Botao>
                <Botao
                  variante={modo === "errado" ? "perigo" : "secundario"}
                  tamanho="lg" bloco icone="circle-x"
                  aria-pressed={modo === "errado"}
                  disabled={!!bloqueioTotal}
                  onClick={() => escolher("errado")}
                >
                  Errado
                </Botao>
              </div>
            </Campo>

            {/* O impedimento só do CERTO aparece embaixo do par, e não como faixa
                no topo: o painel continua utilizável pelo lado do errado, e a
                pessoa lê o motivo exatamente onde o botão está apagado. */}
            {!bloqueioTotal && bloqueioCerto && (
              <p style={{ fontSize: 12, color: "var(--atencao)", lineHeight: 1.55, margin: "8px 0 0", fontWeight: 600 }}>
                {bloqueioCerto}
              </p>
            )}

            <div style={{ height: 16 }} />

            {modo === "certo" && destino && (
              <>
                <SeCerto
                  produto={destino.nome || titulo}
                  pecas={pecas}
                  executor={pendente.executorNome}
                  desfecho={etiqueta.desfecho}
                  motivo={etiqueta.motivo}
                />
                {/* Fica DENTRO do painel, e não num modal por cima: modal aberto
                    de dentro de um `PainelLateral` precisa de `--z-modal` pra não
                    nascer atrás da gaveta, e uma escolha de duas alternativas não
                    justifica outra camada com trava de rolagem e armadilha de foco
                    próprias (mesmo motivo do `BlocoGuardar` do Recebimento). No
                    celular as opções empilham sozinhas e o corpo do painel já rola. */}
                {etiqueta.ofereceGesto && (
                  <PrepararParaEtiqueta
                    saldo={destino.preparo?.quantidade ?? 0}
                    unidade={destino.preparo?.unidade ?? null}
                    rodando={preparando}
                    erro={erroPreparo}
                    onPreparar={preparar}
                  />
                )}
                {preparoFeito && (
                  <Aviso tom="ok" icone="tag">
                    Pronto: <strong>{destino.nome || titulo}</strong> passou a ser etiquetado
                    {preparoFeito.geradas > 0 && (
                      <> e {preparoFeito.geradas === 1
                        ? <>saiu <strong>1 etiqueta</strong> pra pilha que já estava na prateleira</>
                        : <>saíram <strong>{preparoFeito.geradas} etiquetas</strong> pra pilha que já estava na prateleira</>}</>
                    )}. Elas ficam na ficha do item, prontas pra imprimir. Confirme o certo
                    aqui embaixo que a caixa desta atividade nasce com papel próprio.
                  </Aviso>
                )}
              </>
            )}

            {modo === "errado" && (
              <SeErrado
                executor={pendente.executorNome}
                defeitos={defeitos}
                onAlternar={alternarDefeito}
                obs={obs}
                onObs={setObs}
                faltaMotivo={!motivoDoErrado}
              />
            )}

            {erro && <div ref={refErro} style={{ marginTop: 16 }}><Aviso tom="erro" icone="circle-x">{erro}</Aviso></div>}
          </>
        )}
    </PainelLateral>
  );
}

// ── O que tinha sido pedido ──────────────────────────────────────────────────
// "Colar o PS nas 30 bases" — a instrução que a pessoa recebeu. O servidor
// mandava esse campo desde sempre e nenhuma tela o desenhava: o gerente
// conferia o resultado sem ter à mão o que tinha sido combinado, e "certo" só
// significa alguma coisa contra um pedido.
function OQueFoiPedido({ detalhe }: { detalhe: string | null }) {
  const texto = detalhe?.trim();
  if (!texto) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 16 }}>
      <span style={{ flex: "none", marginTop: 1 }}><Icon name="list-check" size={16} color="var(--text-dim)" /></span>
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 650, display: "block" }}>O que foi pedido</span>
        <span style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.5, overflowWrap: "break-word" }}>{texto}</span>
      </span>
    </div>
  );
}

// ── A FOTO DO TRABALHO PRONTO ────────────────────────────────────────────────
//
// A peça mais valiosa da conferência, e a que ficou três meses no banco sem
// ninguém mostrar: 101 das 107 atividades concluídas têm uma foto que a própria
// pessoa tirou ao concluir. Comparar essa foto com a caixa que está na frente
// do gerente É a conferência — se estiverem diferentes, a resposta é errado.
//
// POR QUE ELA MORA AQUI E NÃO NA LISTA. A fila tem ~23 cartões e cada foto é de
// celular (megabytes). Vinte e três de uma vez, na abertura da tela, é
// exatamente o tipo de coisa que derrubou este projeto duas vezes — e no tablet
// do galpão isso é 3G. Aqui é UMA foto por decisão, baixada quando o gerente
// escolhe olhar. A lista dele diz só se existe (`MarcaDeFoto`).
//
// SEM `loading="lazy"`, e isso foi medido. A `<img>` só existe enquanto o
// painel está aberto e é o segundo bloco a partir do topo — nunca está fora da
// dobra, então o `lazy` não adiava byte nenhum. O que ele fazia era não deixar
// o download COMEÇAR enquanto a folha ainda estava subindo (o elemento nasce
// abaixo da tela na animação): a foto entrava depois, e nesse intervalo
// `naturalWidth` é 0 — que é justamente o que o `GlobalLightbox` usa pra
// recusar imagem pequena. O primeiro toque na foto não abria nada, contra uma
// legenda que promete "toque pra ver grande". `decoding="async"` fica: ele não
// atrasa o pedido, só tira a descompressão de 4000×3000 da pintura do painel.
//
// O ZOOM é de graça: o `GlobalLightbox` do Shell abre qualquer imagem de
// conteúdo em tela cheia ao clique. Por isso esta `<img>` NÃO pode virar
// `<button>` nem morar dentro de um — é justamente o que o lightbox ignora.
function FotoDoTrabalho({ url, executor }: { url: string | null | undefined; executor: string }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => { setFalhou(false); }, [url]);

  // A AUSÊNCIA também é informação, e muda o trabalho do gerente: sem foto, a
  // única maneira de conferir é caminhar até a caixa. Dizer isso é melhor do
  // que um espaço em branco que parece tela quebrada.
  if (!url || falhou) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 18 }}>
        <span style={{ flex: "none", marginTop: 1 }}><Icon name="photo-question" size={16} color="var(--atencao)" /></span>
        <span style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, minWidth: 0 }}>
          <strong style={{ color: "var(--text)" }}>
            {falhou ? "A foto deste trabalho não abriu." : "Sem foto deste trabalho."}
          </strong>{" "}
          {falhou
            ? "O endereço existe mas a imagem não veio — confira olhando a caixa."
            : `${executor} concluiu sem registrar a foto, então só dá pra conferir olhando a caixa.`}
        </span>
      </div>
    );
  }

  return (
    <figure style={{ margin: "0 0 18px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Trabalho concluído por ${executor}`}
        decoding="async"
        onError={() => setFalhou(true)}
        style={{
          display: "block", width: "100%", maxHeight: 320, objectFit: "contain",
          borderRadius: "var(--r-md)", background: "var(--surface-2)",
          boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent)",
        }}
      />
      <figcaption style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5, marginTop: 6 }}>
        Foto que <strong style={{ color: "var(--text)", fontWeight: 650 }}>{executor}</strong> tirou ao
        concluir. Toque pra ver grande e compare com a caixa que está na sua frente.
      </figcaption>
    </figure>
  );
}

// ── O número que o gerente NÃO digita ────────────────────────────────────────
// A informação mais importante da tela, e por isso ela é grande: é esta
// quantidade que vai virar a caixa. Fica em leitura de propósito — quem contou
// as peças foi quem as fez.
//
// O que mudou: a FALTA passou a ser dita. Antes o bloco escrevia "19 peças" e
// escondia "alvo era 30" numa linha de apoio; agora "faltaram 11" aparece com
// peso próprio, porque é o dado que muda a resposta. E o TEMPO entrou embaixo,
// como apoio — é o que explica um número baixo sem acusar ninguém.
function QuantoFoiFeito({ pendente, pecas, semInformar }: {
  pendente: PendenteConferencia; pecas: number; semInformar: boolean;
}) {
  const d = diferencaDeQuantidade(pendente.quantidadeFeita, pendente.quantidadeAlvo);
  const t = tempoDaAtividade(pendente.tempoRealMin, pendente.tempoEstimadoMin);
  return (
    <div className="glass glass-spec" style={{ padding: "14px 16px", borderRadius: "var(--r-md)", marginBottom: 18 }}>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 650 }}>
        {semInformar ? "Alvo da atividade (ninguém informou o feito)" : `${pendente.executorNome} registrou ao concluir`}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", margin: "2px 0 6px" }}>
        <strong style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
          {pecas}
        </strong>
        <span style={{ fontSize: 14, color: "var(--text-dim)", fontWeight: 650 }}>
          peça{pecas === 1 ? "" : "s"}
        </span>
        {!semInformar && pendente.quantidadeAlvo > 0 && pendente.quantidadeAlvo !== pecas && (
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>de {pendente.quantidadeAlvo} pedidas</span>
        )}
        {/* A diferença NÃO é rodapé: é o que faz o gerente perguntar antes de
            aprovar. Fica na mesma linha do número, com peso. */}
        {!semInformar && d.diferenca && (
          <span style={{
            fontSize: 12, fontWeight: 750, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap",
            background: `color-mix(in srgb, ${d.atencao ? "var(--atencao)" : "var(--neutro)"} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${d.atencao ? "var(--atencao)" : "var(--neutro)"} 32%, transparent)`,
            color: d.atencao ? "var(--atencao)" : "var(--text-dim)",
          }}>
            {d.diferenca}
          </span>
        )}
      </div>
      {/* Neutro de propósito: "a caixa nasce com este número" seria mentira no
          item que não é etiquetado, e este bloco aparece antes de a pessoa
          escolher — quem fala de caixa é o aviso do CERTO, que já sabe o caso. */}
      <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55, margin: 0 }}>
        Você não digita quantidade: se estiver certo, é este número que entra no estoque.
      </p>
      {/* O TEMPO é apoio, não destaque: sem cor, sem alerta, na última linha.
          Serve pra entender um número baixo — quem levou o dobro do previsto
          provavelmente lutou com o material, não enrolou. */}
      {/* A frase vem MONTADA da régua (`fraseDeApoio`), não daqui: era montada
          nas duas telas à mão, e o tablet acabou escrevendo "Levou estimado
          40 min" numa caixa sem hora de início. Uma frase, um lugar. */}
      {t.fraseDeApoio && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: "var(--text-dim)" }}>
          <Icon name="clock" size={14} color="var(--text-dim)" />
          <span>{t.fraseDeApoio}</span>
        </div>
      )}
    </div>
  );
}

// ── O material que a atividade consumiu ──────────────────────────────────────
// A tela de bipar promete, com estas palavras, que "a baixa fica amarrada a ela
// — quem conferir depois vê o que entrou". Este bloco é a entrega dessa
// promessa: sem ele o gerente decidia certo/errado olhando só a caixa pronta,
// sem saber se as 30 peças saíram de 30 folhas ou de 45.
//
// Os três estados são diferentes de propósito, porque exigem coisas diferentes
// de quem confere:
//
//   · consumiu   → o número, e a sobra quando a conta não fecha;
//   · não bipou  → dito em voz alta. A ausência TAMBÉM é informação: caixa que
//                  nasce sem material bipado é material que saiu do estoque
//                  sem registro, e é agora que se pergunta por quê;
//   · sem vínculo→ o banco ainda não guarda a ligação (o SQL pendente). Aí a
//                  tela cala em vez de acusar a pessoa de não ter bipado.
function MaterialQueEntrou({ consumo, indisponivel, executor, pecasFeitas }: {
  consumo: { etiquetas: number; pecas: number } | null;
  indisponivel: boolean;
  executor: string;
  pecasFeitas: number;
}) {
  if (indisponivel) return null;

  if (!consumo || consumo.pecas <= 0) {
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "-6px 0 18px" }}>
        <span style={{ flex: "none", marginTop: 1 }}><Icon name="alert-triangle" size={15} color="var(--atencao)" /></span>
        <span style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, minWidth: 0 }}>
          <strong style={{ color: "var(--text)" }}>Nenhum material bipado nesta atividade.</strong>{" "}
          O material que virou estas peças saiu do estoque sem registro — vale perguntar a {executor} antes de aprovar.
        </span>
      </div>
    );
  }

  // "Sobra" só é dita quando existe: uma peça feita a partir de várias folhas é
  // rotina, e transformar isso em alerta em toda caixa treinaria o gerente a
  // ignorar o bloco inteiro.
  const sobra = consumo.pecas - pecasFeitas;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, margin: "-6px 0 18px" }}>
      <span style={{ flex: "none", marginTop: 1 }}><Icon name="package-import" size={15} color="var(--text-dim)" /></span>
      <span style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, minWidth: 0 }}>
        {executor} bipou{" "}
        <strong style={{ color: "var(--text)" }}>
          {consumo.pecas} peça{consumo.pecas === 1 ? "" : "s"} de material
        </strong>{" "}
        em {consumo.etiquetas} etiqueta{consumo.etiquetas === 1 ? "" : "s"} pra fazer esta caixa
        {sobra > 0 && <> — {sobra} a mais do que saiu pronto</>}.
      </span>
    </div>
  );
}

// ── Onde estas peças entram ──────────────────────────────────────────────────
//
// O bloco que faz a fila valer alguma coisa. A atividade diz "Montar
// alavancas"; o estoque tem 192 itens. Sem este passo, aprovar era impossível
// pra 103 das 104 caixas produzidas — a fila simplesmente descartava todas.
//
// Duas camadas, nessa ordem, e a ordem é o desenho:
//
//  1. TRÊS PALPITES, calculados no servidor a partir da tarefa e da categoria.
//     No caso comum a resposta certa é o primeiro botão, e conferir vira dois
//     toques.
//  2. A BUSCA, pra quando nenhum serve. Ela existe sempre — palpite sem saída
//     é armadilha —, mas não é o caminho principal: ninguém deveria digitar
//     "alavanca" trinta vezes por semana.
//
// Nada é escolhido sozinho. Um palpite aplicado sem confirmação põe peça no
// item errado do estoque, e ninguém descobre — o número fecha, só está no lugar
// errado.
function EscolherDestino({ sugestoes, escolhido, onEscolher }: {
  sugestoes: DestinoDoCatalogo[];
  escolhido: DestinoDoCatalogo | null;
  onEscolher: (d: DestinoDoCatalogo | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<DestinoDoCatalogo[]>([]);
  const [procurando, setProcurando] = useState(false);
  // Sem palpite nenhum, a busca já nasce aberta: esconder o único caminho atrás
  // de um "procurar" seria deixar a caixa sem saída.
  const [buscando, setBuscando] = useState(sugestoes.length === 0);
  // Cada digitada invalida a resposta da anterior. Sem isto, "ala" chegando
  // depois de "alavanca" repinta a lista com o resultado velho.
  const pedido = useRef(0);

  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) { setAchados([]); setProcurando(false); return; }
    const meu = ++pedido.current;
    setProcurando(true);
    // Espera a pessoa parar de digitar. Não é poll: sai uma vez por pausa, e
    // só enquanto o painel está aberto.
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/estoque/conferencias/destinos?q=${encodeURIComponent(termo)}`, { cache: "no-store" });
        const d = await r.json().catch(() => null);
        if (meu !== pedido.current) return;
        setAchados(r.ok && Array.isArray(d?.itens) ? (d.itens as DestinoDoCatalogo[]) : []);
      } catch {
        if (meu === pedido.current) setAchados([]);
      } finally {
        if (meu === pedido.current) setProcurando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  if (escolhido) {
    return (
      <div className="glass glass-spec" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Icon name="package" size={17} color="var(--ok)" />
          <div style={{ minWidth: 0, flex: "1 1 160px" }}>
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 650 }}>Entra em</div>
            <strong style={{ fontSize: 15, display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
              {escolhido.nome}
            </strong>
          </div>
          {/* Trocar tem de ser tão fácil quanto escolher: o primeiro palpite
              está certo na maioria das vezes, não em todas. */}
          <Botao variante="sutil" tamanho="sm" icone="refresh" onClick={() => onEscolher(null)}>Trocar</Botao>
        </div>
      </div>
    );
  }

  return (
    <Campo
      label="Onde estas peças entram?"
      dica="É o item do catálogo que vai receber a quantidade. Quem lançou a atividade escreveu só a tarefa — quem sabe o destino é você, olhando a caixa."
    >
      {sugestoes.length > 0 && (
        <div style={{
          display: "grid", gap: 8, marginTop: 2,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
        }}>
          {sugestoes.map((s) => (
            <BotaoDeDestino key={s.id} destino={s} onEscolher={onEscolher} />
          ))}
        </div>
      )}

      {!buscando ? (
        <div style={{ marginTop: sugestoes.length ? 10 : 2 }}>
          <Botao variante="sutil" tamanho="sm" icone="search" onClick={() => setBuscando(true)}>
            Não é nenhum destes — procurar no catálogo
          </Botao>
        </div>
      ) : (
        <div style={{ marginTop: sugestoes.length ? 12 : 2 }}>
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar no catálogo (ex.: alavanca)"
            aria-label="Procurar no catálogo"
            maxLength={80}
            style={{ width: "100%", minHeight: "var(--tap)" }}
          />
          {busca.trim().length >= 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {procurando && achados.length === 0 && (
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Procurando…</span>
              )}
              {!procurando && achados.length === 0 && (
                <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
                  Nenhum item do catálogo com esse nome. Se a peça ainda não existe lá, ela
                  precisa ser cadastrada no Catálogo antes de receber estoque — marcar como
                  errado continua valendo.
                </span>
              )}
              {achados.map((a) => <BotaoDeDestino key={a.id} destino={a} onEscolher={onEscolher} />)}
            </div>
          )}
        </div>
      )}
    </Campo>
  );
}

/** Um item oferecido como destino — alvo inteiro, nunca só o texto. */
function BotaoDeDestino({ destino, onEscolher }: {
  destino: DestinoDoCatalogo;
  onEscolher: (d: DestinoDoCatalogo) => void;
}) {
  return (
    <button
      type="button"
      className="ui-card-alvo"
      onClick={() => onEscolher(destino)}
      style={{
        display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
        minHeight: "var(--tap)", padding: "9px 12px", borderRadius: "var(--r-sm)",
        border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
        cursor: "pointer",
      }}
    >
      <Icon name="package" size={16} color="var(--text-dim)" />
      <span style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 13.5, display: "block", overflow: "hidden", textOverflow: "ellipsis" }}>
          {destino.nome}
        </strong>
        {destino.categoria && (
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{destino.categoria}</span>
        )}
      </span>
    </button>
  );
}

// ── Escolheu CERTO ───────────────────────────────────────────────────────────
//
// TRÊS frases, não duas. A tela sabia dizer "sai etiqueta" e "não sai", e o
// "não sai" cobria dois mundos que pedem coisas opostas de quem está lendo:
//
//   · o item ainda NÃO É etiquetado, mas pode passar a ser — e isso tem
//     conserto, aqui, agora, por quem tem poder de ajuste;
//   · o item é medido em quilo/litro/metro (ou está com contagem quebrada) e
//     NUNCA vai ser etiquetado — meio quilo não cabe numa caixa lacrada, e
//     insistir só faria alguém procurar um botão que não deve existir.
//
// Juntar os dois num "este produto não é etiquetado" foi o que deixou 219 itens
// do galpão sem etiqueta nenhuma sem ninguém entender por quê: o gerente lia a
// frase, dava de ombros e aprovava — para sempre.
//
// O PORQUÊ vem do servidor (`motivo`), porque ele é quem conhece a unidade e o
// saldo do item; a tela só sabe qual desfecho desenhar.
function SeCerto({ produto, pecas, executor, desfecho, motivo }: {
  produto: string; pecas: number; executor: string;
  desfecho: DesfechoDaEtiqueta; motivo: string | null;
}) {
  const quantas = <strong>{pecas} peça{pecas === 1 ? "" : "s"}</strong>;

  if (desfecho === "sai_etiqueta") {
    return (
      <Aviso tom="ok" icone="package">
        Vai nascer <strong>uma etiqueta só</strong> — a caixa lacrada, valendo {quantas} de{" "}
        {produto}. O estoque recebe na hora, a etiqueta aparece aqui pra imprimir e a
        atividade de {executor} fecha. Não existe desfazer.
      </Aviso>
    );
  }

  if (desfecho === "falta_preparar") {
    return (
      <Aviso tom="atencao" icone="tag">
        {quantas} de {produto} entram na contagem do estoque, mas{" "}
        <strong>não sai etiqueta</strong> — a atividade de {executor} fecha do mesmo
        jeito.{motivo ? ` ${motivo}` : " Este item ainda não é etiquetado."}
      </Aviso>
    );
  }

  return (
    <Aviso tom="atencao" icone="droplet-half-2">
      {quantas} de {produto} são somadas direto na quantidade do catálogo e{" "}
      <strong>não sai papel pra imprimir</strong>. A atividade de {executor} fecha. Não
      existe desfazer.{motivo ? ` ${motivo}` : " Este item não se conta em caixas fechadas."}
    </Aviso>
  );
}

// ── Preparar este item pra etiqueta ──────────────────────────────────────────
//
// O gesto que faltava, e a razão de ele existir AQUI: a hora em que alguém
// descobre que o item não é etiquetado é esta, com a caixa na mão. Mandar a
// pessoa até o Catálogo, achar o item entre 192 e voltar é o caminho que nunca
// foi percorrido — por isso 219 itens seguiram sem etiqueta.
//
// A ESCOLHA é de quem está de frente pra prateleira, e o código não tem como
// adivinhá-la: 191 peças soltas podem ser uma caixa lacrada de 191 (um papel,
// uma bipada, sai inteira) ou 191 peças avulsas que saem uma a uma (191 papéis).
// Escolher sozinho aqui é o que criaria o fantasma da armadilha (B) — uma caixa
// de 191 que ninguém consegue abrir, com baixa tudo-ou-nada e sem etiqueta
// colada em nada.
function PrepararParaEtiqueta({ saldo, unidade, rodando, erro, onPreparar }: {
  saldo: number;
  unidade: string | null;
  rodando: ModoDePreparo | null;
  erro: string | null;
  onPreparar: (modo: ModoDePreparo) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const medida = rotuloUnidade(unidade || "un", saldo);

  if (!aberto) {
    return (
      <div style={{ margin: "-4px 0 16px" }}>
        <Botao variante="secundario" icone="tag" onClick={() => setAberto(true)}>
          Preparar este item pra etiqueta
        </Botao>
      </div>
    );
  }

  return (
    <div className="glass glass-spec" style={{ padding: "13px 14px", borderRadius: "var(--r-md)", margin: "-4px 0 16px" }}>
      <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.55, marginBottom: 3 }}>
        <strong>Como a pilha que já está na prateleira vira etiqueta?</strong>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55, margin: "0 0 11px" }}>
        São {saldo} {medida} na contagem de hoje. Só você, olhando a prateleira, sabe se
        aquilo é uma caixa fechada ou peça solta — e a diferença importa: caixa lacrada
        sai inteira quando alguém bipa, nunca uma fatia dela.
      </p>

      <div style={{
        display: "grid", gap: 8,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
      }}>
        <OpcaoDePreparo
          icone="box"
          titulo="A pilha inteira é uma caixa só"
          detalhe={`1 etiqueta valendo ${saldo} ${medida}`}
          carregando={rodando === "pilha"}
          desabilitado={!!rodando}
          onClick={() => onPreparar("pilha")}
        />
        <OpcaoDePreparo
          icone="tag"
          titulo="Etiqueta por peça"
          detalhe={`${saldo} etiqueta${saldo === 1 ? "" : "s"} de 1 peça`}
          carregando={rodando === "peca"}
          desabilitado={!!rodando}
          onClick={() => onPreparar("peca")}
        />
      </div>

      {erro && (
        <p style={{ fontSize: 12, color: "var(--perigo)", lineHeight: 1.55, margin: "10px 0 0", fontWeight: 600 }}>
          {erro}
        </p>
      )}

      <div style={{ marginTop: 10 }}>
        <Botao variante="sutil" tamanho="sm" onClick={() => setAberto(false)} disabled={!!rodando}>
          Agora não
        </Botao>
      </div>
    </div>
  );
}

/** Uma das duas formas de preparar — alvo inteiro, com o número real dentro. */
function OpcaoDePreparo({ icone, titulo, detalhe, carregando, desabilitado, onClick }: {
  icone: string; titulo: string; detalhe: string;
  carregando: boolean; desabilitado: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="ui-card-alvo"
      onClick={onClick}
      disabled={desabilitado}
      aria-busy={carregando || undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
        minHeight: "var(--tap)", padding: "10px 12px", borderRadius: "var(--r-sm)",
        border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
        cursor: desabilitado ? "default" : "pointer", opacity: desabilitado && !carregando ? 0.55 : 1,
      }}
    >
      <Icon
        name={carregando ? "loader" : icone}
        size={17}
        color="var(--text-dim)"
        className={carregando ? "spin" : undefined}
      />
      <span style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 13, display: "block", lineHeight: 1.35 }}>{titulo}</strong>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{detalhe}</span>
      </span>
    </button>
  );
}

// ── Escolheu ERRADO ──────────────────────────────────────────────────────────
function SeErrado({ executor, defeitos, onAlternar, obs, onObs, faltaMotivo }: {
  executor: string;
  defeitos: string[];
  onAlternar: (key: string) => void;
  obs: string;
  onObs: (v: string) => void;
  faltaMotivo: boolean;
}) {
  return (
    <>
      <Aviso tom="atencao" icone="arrow-back-up">
        Nada entra no estoque e a atividade volta pra <strong>{executor}</strong> refazer. O
        material que ela bipou no começo já saiu do estoque naquele momento, então a
        perda se contabiliza sozinha — não lance nada.
      </Aviso>

      <Campo label="O que houve de errado" dica="A lista é fechada de propósito: defeito digitado à mão nunca vira estatística.">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
          {DEFEITOS.map((d) => (
            <button key={d.key} type="button" className="hr-chip" aria-pressed={defeitos.includes(d.key)}
              onClick={() => onAlternar(d.key)}>
              {d.label}
            </button>
          ))}
        </div>
      </Campo>

      <div style={{ height: 14 }} />

      <Campo label="Observação" dica="Texto livre — é o que quem for refazer vai ler no histórico.">
        {(id) => (
          <textarea id={id} rows={3} value={obs} maxLength={2000}
            onChange={(e) => onObs(e.target.value)}
            placeholder="Ex.: chegou com a borda lascada, falei com quem produziu." />
        )}
      </Campo>

      {faltaMotivo && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55, margin: "10px 0 0" }}>
          Marque ao menos um defeito — ou escreva o motivo na observação, se ele não
          estiver na lista. Quem vai refazer precisa saber o que corrigir.
        </p>
      )}
    </>
  );
}

// ── Depois de gravar ─────────────────────────────────────────────────────────
function PainelResultado({ gravado, produto, executor, aviso, onImprimir, preparoDoDestino }: {
  gravado: Gravado;
  produto: string;
  executor: string;
  aviso: boolean;
  onImprimir: () => Promise<void>;
  /** O que a tela já sabia antes de gravar — vale se a resposta não trouxe o
   *  `preparo` (servidor antigo). Melhor a frase certa de um segundo atrás que
   *  a genérica de sempre. */
  preparoDoDestino: PreparoDoItem | null;
}) {
  // Reprovado: nada de etiqueta, nada de estoque. A tela fala do que MUDOU (a
  // atividade voltou) em vez de sumir em silêncio depois do clique.
  if (gravado.resultado !== "certo") {
    return (
      <div>
        <Aviso tom="atencao" icone="arrow-back-up">
          Marcado como <strong>errado</strong>. Nada entrou no estoque
          {gravado.reaberta ? <> e a atividade voltou pra <strong>{executor}</strong> refazer</> : null}.
        </Aviso>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>
          O material de entrada já tinha saído do estoque quando {executor} bipou a caixa
          no começo do trabalho, então a perda já está contabilizada — não há nada a
          lançar. Quando ela concluir de novo, a caixa reaparece nesta fila.
        </p>
      </div>
    );
  }

  const etiquetas = gravado.etiquetas.map(paraEtiquetaImpressa);
  // Aprovou e não saiu papel: o gerente precisa saber POR QUÊ e o que fazer,
  // não só que não saiu. A frase é a mesma do servidor — ele conhece a unidade
  // e o saldo do item; a tela, não.
  const porQueSemPapel = (gravado.preparo ?? preparoDoDestino)?.motivo
    ?? "Este produto não é etiquetado — as peças foram somadas direto na quantidade do catálogo, então não há etiqueta pra imprimir.";
  return (
    <div>
      <div className="nao-imprime">
        <Aviso tom="ok" icone="circle-check">
          <strong>{gravado.quantidade} peça{gravado.quantidade === 1 ? "" : "s"}</strong> de{" "}
          <strong>{produto}</strong> entraram no estoque
          {etiquetas.length > 0 ? " em uma caixa lacrada" : ""}.
        </Aviso>
        {/* O outro lado da aprovação: o que SAIU. Só aparece quando alguma
            linha da ficha está com "desconta" ligado — o padrão é nada sair,
            e dizer "nada saiu" em toda aprovação seria ruído. */}
        {gravado.baixaFicha && gravado.baixaFicha.descontados.length > 0 && (
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.6, margin: "0 0 10px" }}>
            Saiu do estoque pela ficha:{" "}
            {gravado.baixaFicha.descontados.map((b, i) => (
              <span key={b.nome}>
                {i > 0 ? ", " : ""}<strong style={{ color: "var(--text)" }}>{b.quantidade} {b.nome}</strong> (sobram {b.saldo})
              </span>
            ))}.
          </p>
        )}
        {gravado.baixaFicha && (gravado.baixaFicha.descontados.some((b) => b.faltou > 0) || gravado.baixaFicha.pulados.length > 0) && (
          <div style={{ marginBottom: 12 }}>
            <Aviso tom="atencao" icone="alert-triangle">
              {gravado.baixaFicha.descontados.filter((b) => b.faltou > 0).map((b) => (
                <span key={`f-${b.nome}`} style={{ display: "block" }}>
                  <strong>{b.nome}</strong>: a produção gastou {b.quantidade}, mas o estoque dizia ter {b.quantidade - b.faltou}. Vale contar a prateleira.
                </span>
              ))}
              {gravado.baixaFicha.pulados.map((p) => (
                <span key={`p-${p.nome}`} style={{ display: "block" }}>
                  <strong>{p.nome}</strong> não saiu: {p.motivo}.
                </span>
              ))}
            </Aviso>
          </div>
        )}
      </div>

      {etiquetas.length === 0 ? (
        <p className="nao-imprime" style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
          {porQueSemPapel}
        </p>
      ) : (
        <>
          <p className="nao-imprime" style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, margin: "0 0 14px" }}>
            É <strong>uma etiqueta só</strong> pra caixa inteira, e ela só aparece aqui,
            agora. Imprima antes de fechar — a caixa continua no estoque de qualquer jeito,
            mas gerar o papel de novo vai dar trabalho.
          </p>
          {aviso && (
            <div className="nao-imprime" style={{ marginBottom: 12 }}>
              <Aviso tom="atencao" icone="alert-triangle">
                Não deu pra registrar quem imprimiu (o livro de impressões não respondeu).
                A folha imprime do mesmo jeito.
              </Aviso>
            </div>
          )}
          <FolhaDeEtiquetas etiquetas={etiquetas} onImprimir={onImprimir} />
          {/* Print CSS mora aqui e não no globals.css porque só existe enquanto
              esta folha está na tela: `window.print()` leva o documento INTEIRO
              (sidebar, cabeçalho, o véu do painel) e a primeira página sairia
              com a navegação impressa. O painel é portado pro <body>, então
              basta esconder os irmãos dele e devolver a folha ao fluxo normal. */}
          <style>{`
            @media print {
              body > *:not(.ui-side) { display: none !important; }
              .ui-side {
                position: static !important; width: auto !important; max-width: none !important;
                height: auto !important; max-height: none !important; overflow: visible !important;
                border: 0 !important; box-shadow: none !important; background: #fff !important;
                backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
                transform: none !important; animation: none !important;
              }
              .ui-side-cab, .ui-side-pe, .ui-side-alca { display: none !important; }
              .ui-side-corpo { overflow: visible !important; padding: 0 !important; }
            }
          `}</style>
        </>
      )}
    </div>
  );
}

// ── Faixa de aviso ───────────────────────────────────────────────────────────
// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
export function Aviso({ tom, icone, children }: { tom: "ok" | "atencao" | "erro"; icone: string; children: ReactNode }) {
  return <Alerta tom={tom === "erro" ? "perigo" : tom} icone={icone} style={{ marginBottom: 16 }}>{children}</Alerta>;
}
