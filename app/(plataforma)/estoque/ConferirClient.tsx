"use client";

// ── Estoque · Conferir (computador) ──────────────────────────────────────────
// Desde que "concluir atividade NÃO dá entrada no estoque" virou regra, só a
// conferência admite peça produzida no sistema — e a conferência só existia no
// tablet do galpão. Bateria acabando, tela quebrada, gerente em outra unidade:
// a produção parava de virar estoque e NADA no computador mostrava isso
// acontecendo. Esta aba é o caminho que faltava, e é também o lugar onde a
// observação que o gestor digita finalmente é lida por alguém.
//
// Sem poll de propósito: uma fila de conferência não muda sozinha (quem move é
// alguém concluindo atividade), e cada tick seria uma invocação cobrada numa
// aba que costuma ficar aberta a tarde inteira. Quem quer o estado novo clica
// em "Atualizar" — e a fila recarrega sozinha depois de cada conferência.

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFEITOS } from "@/lib/estoque-qualidade";
import { diferencaDeQuantidade } from "@/lib/estoque-conferencia-contexto";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import { Alerta } from "../ui/Alerta";
import { Abas } from "../ui/Abas";
import { Avatar } from "../ui/Avatar";
import { agoLabel } from "../ui/mobile";
import { DataList, type Coluna } from "../ui/DataList";
import { ConferirPainel, Aviso } from "./ConferirPainel";
import { ReimprimirEtiqueta } from "./ReimprimirEtiqueta";
import {
  mensagemDeErroDeConferencia, tituloDaPendencia,
  type LinhaHistorico, type PendenteConferencia, type RespostaHistorico, type RespostaPendentes,
} from "./conferencia-tipos";

type Sub = "fila" | "historico";

const rotuloDoDefeito = new Map(DEFEITOS.map((d) => [d.key, d.label]));

/**
 * Falhar ao CARREGAR a lista não é o mesmo que o servidor RECUSAR uma
 * conferência.
 *
 * A tela mandava as duas coisas pro mesmo tradutor, e o texto padrão dele é
 * sobre gravação: "O sistema recusou esta conferência e nada foi gravado."
 * Quem só abriu a aba e caiu num 500 lia que uma conferência sua tinha sido
 * recusada — uma que nunca existiu — e ia procurar qual caixa tinha dado
 * problema. Aqui a frase fala do que de fato aconteceu, e diz o que fazer
 * (o botão "Atualizar" está logo acima).
 *
 * Os dois códigos que valem nos DOIS caminhos ganham frase própria: sessão
 * caída e banco sem o SQL não se resolvem tentando de novo.
 */
function mensagemDeErroDeCarga(codigo: string | null): string {
  if (codigo === "unauthorized") return "Sua sessão expirou. Recarregue a página e entre de novo.";
  if (codigo === "schema_desatualizado") return "O controle de qualidade ainda não foi ligado no banco. Peça pra rodarem supabase/estoque_conferencias.sql.";
  return "Não deu pra carregar a conferência agora — nada do que está aqui foi perdido. Toque em Atualizar; se repetir, avise o suporte.";
}

function dataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ConferirClient() {
  const [sub, setSub] = useState<Sub>("fila");
  const [fila, setFila] = useState<RespostaPendentes | null>(null);
  const [historico, setHistorico] = useState<RespostaHistorico | null>(null);
  const [carregando, setCarregando] = useState(true);
  // ── Um erro POR ABA ────────────────────────────────────────────────────────
  // Era um só pras duas. O gerente estava no Histórico, já carregado, lendo as
  // observações; a fila recarregava atrás (depois de uma conferência, ou pelo
  // botão) e falhava — e o Histórico que estava na tela sumia, trocado por "não
  // deu pra carregar". Ele perdia o que estava lendo por causa de uma falha em
  // outro lugar.
  const [erroFila, setErroFila] = useState<string | null>(null);
  const [erroHistorico, setErroHistorico] = useState<string | null>(null);
  const erroCarga = sub === "fila" ? erroFila : erroHistorico;
  const [abrindo, setAbrindo] = useState<PendenteConferencia | null>(null);
  // A caixa cujo papel precisa sair de novo. A etiqueta da aprovação existia só
  // dentro do painel de conferência e sumia com ele: aba fechada no meio, e a
  // caixa lacrada ficava na prateleira sem código colado, sem tela nenhuma que
  // refizesse o papel. O histórico já sabe o código de cada caixa — é daqui que
  // a segunda via sai.
  const [reimprimindo, setReimprimindo] = useState<string | null>(null);

  // A fila do dia a dia é a SEMANA (DIAS_DA_FILA). O que ficou pra trás não é
  // listado nem apagado: o servidor CONTA (`anteriores`) e esta bandeira é o
  // toque que abre a lista inteira. Sem ela, o número vinha do servidor a cada
  // carga e morria — 83 caixas de três semanas atrás sem nenhum caminho até
  // elas, e a tela dizendo "elas aparecem conforme estas saírem da fila", que
  // pro acervo é falso: fora da janela, elas nunca voltam sozinhas.
  const [acervo, setAcervo] = useState(false);

  // ── A janela escolhida mora numa REF, não nas dependências ────────────────
  // `carregarFila` tinha `[acervo]`, e o efeito de montagem depende dela: trocar
  // de janela mudava a identidade da função, o efeito refazia a carga, e o toque
  // virava DUAS varreduras de banco. Não aparecia na tela além de um
  // "Atualizando…" piscando duas vezes — mas são duas invocações por toque, num
  // projeto que já foi pausado por execução.
  //
  // Com a ref, `carregarFila` é estável: o efeito roda uma vez, e quem troca a
  // janela é só o toque.
  const acervoRef = useRef(acervo);
  const carregarFila = useCallback(async (todas = acervoRef.current) => {
    try {
      const r = await fetch(`/api/estoque/conferencias/pendentes${todas ? "?acervo=1" : ""}`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !Array.isArray(d.atividades)) { setErroFila(d?.error ?? "failed"); return; }
      setFila(d as RespostaPendentes);
      setErroFila(null);
    } catch { setErroFila("failed"); }
  }, []);

  // Trocar de janela é uma carga só, disparada por um toque — não é poll.
  async function verJanela(todas: boolean) {
    acervoRef.current = todas;
    setAcervo(todas);
    setCarregando(true);
    await carregarFila(todas);
    setCarregando(false);
  }

  // ── "Ver mais": a paginação existia e morria numa frase ───────────────────
  // As duas rotas aceitam `antesDe` desde sempre e devolvem `proximoCursor`. A
  // tela usava esse cursor só pra ESCREVER que havia mais — "Mostrando as 50
  // mais recentes", sem botão. Na fila isso ainda tinha uma saída torta (ir
  // conferindo até as 50 saírem); no Histórico não tinha nenhuma: as
  // conferências antigas eram inalcançáveis, e é justamente lá que mora a
  // observação que alguém escreveu sobre uma caixa reprovada.
  //
  // Anexa, não substitui: quem já rolou até o fim da página não pode ser
  // mandado de volta ao topo pra ver a continuação.
  const [buscandoMais, setBuscandoMais] = useState(false);

  async function verMaisFila(cursor: string) {
    setBuscandoMais(true);
    try {
      const q = new URLSearchParams({ antesDe: cursor });
      if (acervoRef.current) q.set("acervo", "1");
      const r = await fetch(`/api/estoque/conferencias/pendentes?${q}`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !Array.isArray(d.atividades)) { setErroFila(d?.error ?? "failed"); return; }
      setFila((antes) => antes ? {
        ...d,
        atividades: [...antes.atividades, ...d.atividades],
      } as RespostaPendentes : d as RespostaPendentes);
      setErroFila(null);
    } catch { setErroFila("failed"); } finally { setBuscandoMais(false); }
  }

  async function verMaisHistorico(cursor: string) {
    setBuscandoMais(true);
    try {
      const r = await fetch(`/api/estoque/conferencias?antesDe=${encodeURIComponent(cursor)}`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !Array.isArray(d.conferencias)) { setErroHistorico(d?.error ?? "failed"); return; }
      setHistorico((antes) => antes ? {
        ...d,
        conferencias: [...antes.conferencias, ...d.conferencias],
      } as RespostaHistorico : d as RespostaHistorico);
      setErroHistorico(null);
    } catch { setErroHistorico("failed"); } finally { setBuscandoMais(false); }
  }

  const carregarHistorico = useCallback(async () => {
    try {
      const r = await fetch("/api/estoque/conferencias", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d || !Array.isArray(d.conferencias)) { setErroHistorico(d?.error ?? "failed"); return; }
      setHistorico(d as RespostaHistorico);
      setErroHistorico(null);
    } catch { setErroHistorico("failed"); }
  }, []);

  // Primeira carga: só a fila. O histórico chega quando alguém abre a aba dele
  // — buscar os dois de cara dobraria a conta pra quem só queria a fila.
  useEffect(() => {
    let vivo = true;
    (async () => { await carregarFila(); if (vivo) setCarregando(false); })();
    return () => { vivo = false; };
  }, [carregarFila]);

  async function trocarSub(v: Sub) {
    setSub(v);
    if (v === "historico" && !historico) {
      setCarregando(true);
      await carregarHistorico();
      setCarregando(false);
    }
  }

  async function atualizar() {
    setCarregando(true);
    await (sub === "fila" ? carregarFila() : carregarHistorico());
    setCarregando(false);
  }

  // Conferiu: a fila perde uma linha e o histórico ganha uma. Recarrega a fila
  // sempre; o histórico só se já tiver sido carregado (senão vira uma
  // requisição pra uma aba que ninguém abriu).
  async function aposConferir() {
    await carregarFila();
    if (historico) await carregarHistorico();
  }

  // Sem permissão a aba inteira vira a explicação — mostrar filtros e um botão
  // de atualizar que nunca vai funcionar só faz a pessoa tentar de novo.
  if (erroCarga === "forbidden") {
    return <Aviso tom="atencao" icone="lock">{mensagemDeErroDeConferencia(erroCarga)}</Aviso>;
  }

  const qcDesligado = (sub === "fila" ? fila?.qcDesligado : historico?.qcDesligado) ?? false;

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, margin: "0 0 14px" }}>
        Peça produzida só entra no estoque depois que alguém confere, e a resposta
        é uma só: certo ou errado. Aqui está o que está esperando e o que já
        passou — inclusive o que voltou pra bancada e foi refeito.
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Abas valor={sub} onMuda={trocarSub} ariaLabel="Conferência de qualidade"
          itens={[
            { valor: "fila", rotulo: <><Icon name="hourglass-high" size={15} color="currentColor" /> A conferir</> },
            { valor: "historico", rotulo: <><Icon name="history" size={15} color="currentColor" /> Histórico</> },
          ]} />
        <Botao variante="sutil" icone="refresh" onClick={atualizar} carregando={carregando}>Atualizar</Botao>
      </div>

      {qcDesligado ? <QcDesligado /> : erroCarga ? (
        <Aviso tom="atencao" icone="alert-triangle">{mensagemDeErroDeCarga(erroCarga)}</Aviso>
      ) : sub === "fila" ? (
        <Fila dados={fila} carregando={carregando} onConferir={setAbrindo} onJanela={verJanela} onVerMais={verMaisFila} buscandoMais={buscandoMais} />
      ) : (
        <Historico dados={historico} carregando={carregando} onReimprimir={setReimprimindo} onVerMais={verMaisHistorico} buscandoMais={buscandoMais} />
      )}

      {abrindo && (
        <ConferirPainel
          pendente={abrindo}
          consumoIndisponivel={fila?.consumoIndisponivel}
          // Poder de AJUSTE, não de conferir: só quem o tem pode fazer a pilha
          // antiga virar etiqueta ali mesmo. Quem não tem continua conferindo
          // normalmente — só não vê um botão que devolveria 403.
          podePreparar={fila?.podePreparar}
          onFechar={() => setAbrindo(null)}
          onConferido={aposConferir}
        />
      )}

      {reimprimindo && (
        <ReimprimirEtiqueta codigos={[reimprimindo]} onFechar={() => setReimprimindo(null)} />
      )}
    </div>
  );
}

// ── "O QC ainda não foi ligado" ──────────────────────────────────────────────
// A tabela `estoque_conferencias` não existe no banco enquanto ninguém rodar o
// SQL. Isso não é erro da pessoa nem defeito da tela: é uma etapa de instalação
// que falta. A tela abre, explica com calma e não pinta nada de vermelho.
function QcDesligado() {
  return (
    <Alerta tom="info" titulo="O controle de qualidade ainda não foi ligado">
      <span style={{ display: "block" }}>
        As conferências ainda não têm onde ser gravadas no banco, então esta aba
        não tem o que mostrar — e nada aqui vai falhar por causa disso. Quem cuida
        do banco precisa rodar <code>supabase/estoque_conferencias.sql</code> no
        Supabase; assim que rodar, a fila e o histórico aparecem sozinhos.
      </span>
      <span style={{ display: "block", marginTop: 8 }}>
        Enquanto isso, o tablet do galpão também não consegue conferir: toda
        tentativa volta recusada.
      </span>
    </Alerta>
  );
}

// ── Fila ─────────────────────────────────────────────────────────────────────
function Fila({ dados, carregando, onConferir, onJanela, onVerMais, buscandoMais }: {
  dados: RespostaPendentes | null;
  onVerMais: (cursor: string) => void;
  buscandoMais: boolean;
  carregando: boolean;
  onConferir: (p: PendenteConferencia) => void;
  /** Trocar entre a janela da semana e o acervo inteiro. */
  onJanela: (todas: boolean) => void;
}) {
  if (!dados) return <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Carregando…</p>;
  const { atividades, travadas, proximoCursor } = dados;
  const anteriores = dados.anteriores ?? 0;
  const dias = dados.dias ?? 7;

  return (
    <div>
      {/* "Pelo menos" não é modéstia: a varredura para assim que a página
          enche, então este número conta só o que ela alcançou. Prometer um
          total que a consulta não apurou seria mentir num aviso. */}
      {travadas > 0 && (
        <Aviso tom="atencao" icone="alert-triangle">
          Pelo menos {travadas} atividade{travadas === 1 ? "" : "s"} com conferência
          gravada e o estoque <strong>não</strong> entrou — o registro travou no meio
          do caminho. Conferir de novo é recusado, e as peças não estão contadas em
          lugar nenhum. Avise o suporte com o nome do produto.
        </Aviso>
      )}

      {atividades.length === 0 ? (
        <div className="glass glass-spec" style={{ display: "flex", alignItems: "center", gap: 11, padding: "16px 18px", borderRadius: "var(--r-md)" }}>
          <Icon name="circle-check" size={20} color="var(--ok)" />
          <div>
            <strong style={{ fontSize: 13.5 }}>
              {anteriores > 0 ? `Nada dos últimos ${dias} dias esperando conferência` : "Nada esperando conferência"}
            </strong>
            {/* "Toda produção já foi conferida" com 83 caixas paradas atrás da
                janela é mentira — e é a frase que faria o gerente fechar a aba
                achando que não há trabalho. */}
            <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "2px 0 0" }}>
              {anteriores > 0
                ? "A semana está limpa, mas ainda há caixas mais antigas esperando — o botão abaixo abre a lista inteira."
                : "Toda produção concluída já foi conferida e entrou no estoque."}
            </p>
          </div>
        </div>
      ) : (
        <DataList itens={atividades} colunas={colunasDaFila(onConferir)} chaveDe={(a) => a.id}
          rotulo="Fila de conferência" minWidth={560} />
      )}

      {proximoCursor && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Botao variante="secundario" icone="chevron-down" disabled={buscandoMais}
            onClick={() => onVerMais(proximoCursor)}>
            {buscandoMais ? "Buscando…" : "Ver mais caixas"}
          </Botao>
          <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
            Mostrando as {atividades.length} mais recentes.
          </span>
        </div>
      )}

      {/* O ACERVO. A fila do dia a dia mostra a semana, senão o primeiro dia
          abriria com 104 cartões de três semanas e ninguém saberia por onde
          começar. O que ficou pra trás não some: fica contado aqui, com o
          caminho até ele. O servidor já mandava este número — faltava a tela
          fazer alguma coisa com ele. */}
      {dados.acervo ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "14px 0 0" }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
            Mostrando <strong>tudo</strong> que está esperando conferência, sem limite de data.
          </span>
          <Botao variante="sutil" tamanho="sm" icone="hourglass-high" onClick={() => onJanela(false)}>
            Voltar pros últimos {dias} dias
          </Botao>
        </div>
      ) : anteriores > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "14px 0 0" }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
            <strong>{anteriores}</strong> caixa{anteriores === 1 ? "" : "s"} concluída
            {anteriores === 1 ? "" : "s"} há mais de {dias} dias {anteriores === 1 ? "está" : "estão"} fora
            desta lista.
          </span>
          <Botao variante="sutil" tamanho="sm" icone="history" onClick={() => onJanela(true)}>
            Ver as mais antigas
          </Botao>
        </div>
      )}

      {carregando && <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>Atualizando…</p>}
    </div>
  );
}

/** O que atrapalha esta linha (ou `null`), e se atrapalha a ponto de fechar a
 *  porta. Vale pros dois formatos — a tabela do computador e o card do celular.
 *
 *  `bloqueia` separa dois casos que antes eram um só: quem fez não confere o
 *  próprio trabalho de jeito nenhum, mas produto fora do catálogo só impede o
 *  CERTO — reprovar não toca no estoque. Trancar a linha inteira por causa do
 *  cadastro deixava a caixa errada presa na fila pra sempre, esperando um nome
 *  que talvez nunca fosse corrigido. */
function impedimento(a: PendenteConferencia): { texto: string; bloqueia: boolean } | null {
  if (a.souEuQuemFez) return { texto: "Você fez esta peça — outra pessoa precisa conferir.", bloqueia: true };
  if (!a.itemId) return { texto: "Produto fora do catálogo com esse nome: dá pra marcar errado, mas não dá pra aprovar.", bloqueia: false };
  return null;
}

/**
 * Quem fez, com o ROSTO.
 *
 * A fila é uma lista de gente que se conhece pelo rosto, não pelo nome
 * completo: com uma caixa na mão, "Davi" e "Davi R." levam o mesmo tempo pra
 * ler e o rosto não. Sem foto cadastrada o `Avatar` desenha as iniciais — nunca
 * um buraco no lugar.
 *
 * Custo: cinco pessoas produzem no galpão, então uma página de 23 cartões
 * aponta pra no máximo cinco URLs e o navegador baixa cada uma UMA vez.
 */
function QuemFez({ a, tamanho = 24 }: { a: PendenteConferencia; tamanho?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0, maxWidth: "100%" }}>
      <Avatar url={a.executorFotoUrl} nome={a.executorNome} size={tamanho} formato="redondo" />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {a.executorNome}
      </span>
    </span>
  );
}

/**
 * Tem foto do trabalho, ou não tem.
 *
 * A LISTA não baixa imagem nenhuma — ela só diz se existe. Vinte e três fotos
 * de celular carregadas na abertura da tela são megabytes, e este projeto já
 * caiu duas vezes por consumo. A foto em si é baixada quando a ficha abre: uma
 * por decisão.
 *
 * A ausência é o que ganha cor: sem foto, a única maneira de conferir é
 * caminhar até a caixa, e é isso que o gerente precisa saber ANTES de abrir.
 */
function MarcaDeFoto({ tem }: { tem: boolean }) {
  const cor = tem ? "var(--text-dim)" : "var(--atencao)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 650, color: cor, whiteSpace: "nowrap" }}>
      <Icon name={tem ? "photo" : "photo-question"} size={13} color={cor} />
      {tem ? "com foto" : "sem foto"}
    </span>
  );
}

/**
 * O número, com a FALTA dita por extenso.
 *
 * A célula mostrava "19" e escondia o alvo atrás de uma condição. Quem lê "19"
 * não sabe que faltaram onze — e essa subtração, feita de cabeça trinta vezes
 * por dia, é onde a decisão erra. Ver lib/estoque-conferencia-contexto.ts.
 */
function Pecas({ a }: { a: PendenteConferencia }) {
  const d = diferencaDeQuantidade(a.quantidadeFeita, a.quantidadeAlvo);
  return (
    <>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{d.texto}</span>
      {d.diferenca && (
        <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 2, color: d.atencao ? "var(--atencao)" : "var(--text-dim)" }}>
          {d.diferenca}
        </div>
      )}
      {/* O material que a atividade consumiu, na mesma célula do que saiu
          pronto — é a comparação que o gerente faz de cabeça. */}
      {a.consumo && a.consumo.pecas > 0 && (
        <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>de {a.consumo.pecas} bipadas</div>
      )}
    </>
  );
}

/**
 * As colunas da fila, uma definição só: o `DataList` desenha a tabela no
 * computador e o cartão no celular com o mesmo `render`. Antes eram duas
 * versões (linha e cartão) e cada ajuste precisava ser lembrado duas vezes.
 */
function colunasDaFila(onConferir: (p: PendenteConferencia) => void): Coluna<PendenteConferencia>[] {
  return [
    {
      // "Produto" era o rótulo de uma coluna que, em 103 das 104 atividades
      // reais, não tem produto nenhum. O que está ali é o TRABALHO.
      chave: "trabalho", titulo: "O que foi feito", papel: "titulo",
      ordenar: (a) => tituloDaPendencia(a),
      render: (a) => {
        const trava = impedimento(a);
        // O que a pessoa FEZ. Era `produtoNome ?? "—"`, e como 103 das 104
        // atividades concluídas do galpão não apontam produto nenhum, a fila
        // inteira era uma coluna de travessões: o gerente não conseguia nem
        // achar a caixa que estava segurando.
        const titulo = tituloDaPendencia(a);
        return (
          <div style={{ fontWeight: 650 }}>
            {titulo}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 3 }}>
              <MarcaDeFoto tem={!!a.fotoUrl} />
              {/* O produto só aparece quando existe E não é o próprio título —
                  repetir a mesma palavra duas vezes gasta a linha à toa. */}
              {a.produtoNome && a.produtoNome !== titulo && (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-dim)" }}>{a.produtoNome}</span>
              )}
            </div>
            {trava && <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--atencao)", marginTop: 3, lineHeight: 1.45 }}>{trava.texto}</div>}
          </div>
        );
      },
    },
    {
      // Hora ao lado do título no cartão: é o "há quanto tempo está parada".
      chave: "terminou", titulo: "Terminou", papel: "destaque",
      ordenar: (a) => (a.concluidaEm ? Date.parse(a.concluidaEm) : null),
      render: (a) => (
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
          {a.concluidaEm ? agoLabel(a.concluidaEm) : "—"}
        </span>
      ),
    },
    {
      // O rosto cabe no cartão de 320px: 20px de foto mais o nome com reticências.
      chave: "quem", titulo: "Quem fez", ordenar: (a) => a.executorNome ?? null,
      render: (a) => <span style={{ color: "var(--text-dim)", display: "inline-flex", maxWidth: 180 }}><QuemFez a={a} tamanho={20} /></span>,
    },
    {
      // A falta vem por extenso embaixo do número (ver `Pecas`) — no cartão o
      // valor quebra linha em vez de cortar "faltaram 11", que é o que decide.
      chave: "pecas", titulo: "Peças", ordenar: (a) => a.quantidadeFeita,
      render: (a) => <Pecas a={a} />,
    },
    {
      chave: "acao", titulo: "", papel: "acoes", alinhar: "right",
      render: (a) => (
        <Botao variante="primario" tamanho="sm" icone="checks" onClick={() => onConferir(a)} disabled={impedimento(a)?.bloqueia}>
          Conferir
        </Botao>
      ),
    },
  ];
}

// ── Histórico ────────────────────────────────────────────────────────────────
// Uma linha do banco é UMA TENTATIVA, não uma atividade — e a mesma atividade
// volta aqui cada vez que é reprovada e refeita. Agrupar por atividade é o que
// transforma três linhas soltas na frase que importa: "esta caixa só saiu certa
// na terceira". Espalhadas pela ordem cronológica, essas três linhas pareciam
// três caixas diferentes.
interface Grupo {
  atividadeId: string;
  itemNome: string | null;
  /** Da tentativa MAIS ANTIGA pra mais nova — a ordem em que aconteceu. */
  linhas: LinhaHistorico[];
  /** Quantas tentativas existem no banco (pode ser mais do que veio na página). */
  total: number | null;
}

function agrupar(conferencias: LinhaHistorico[]): Grupo[] {
  const por = new Map<string, Grupo>();
  const ordem: string[] = [];
  // Chega da mais nova pra mais antiga; `unshift` devolve a ordem dos fatos, e
  // a ordem de PRIMEIRA APARIÇÃO mantém os grupos com a caixa mais recente em
  // cima, que é como a aba já se comportava.
  for (const c of conferencias) {
    let g = por.get(c.atividadeId);
    if (!g) {
      g = { atividadeId: c.atividadeId, itemNome: c.itemNome, linhas: [], total: c.tentativas };
      por.set(c.atividadeId, g);
      ordem.push(c.atividadeId);
    }
    g.linhas.unshift(c);
    if (!g.itemNome) g.itemNome = c.itemNome;
    if (c.tentativas != null) g.total = c.tentativas;
  }
  return ordem.map((id) => por.get(id)!);
}

function Historico({ dados, carregando, onReimprimir, onVerMais, buscandoMais }: {
  dados: RespostaHistorico | null;
  onVerMais: (cursor: string) => void;
  buscandoMais: boolean;
  carregando: boolean;
  onReimprimir: (codigo: string) => void;
}) {
  if (!dados) return <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Carregando…</p>;
  const { conferencias, proximoCursor } = dados;

  if (conferencias.length === 0) {
    return (
      <div className="glass glass-spec" style={{ padding: "16px 18px", borderRadius: "var(--r-md)", color: "var(--text-dim)", fontSize: 12.5 }}>
        Nenhuma conferência registrada ainda.
      </div>
    );
  }

  const grupos = agrupar(conferencias);

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {grupos.map((g) => <CartaoHistorico key={g.atividadeId} g={g} onReimprimir={onReimprimir} />)}
      </div>
      {proximoCursor && (
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Botao variante="secundario" icone="chevron-down" disabled={buscandoMais}
            onClick={() => onVerMais(proximoCursor)}>
            {buscandoMais ? "Buscando…" : "Ver conferências mais antigas"}
          </Botao>
          <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5 }}>
            Mostrando as {conferencias.length} mais recentes.
          </span>
        </div>
      )}
      {carregando && <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>Atualizando…</p>}
    </div>
  );
}

/** Uma atividade e todas as vezes que ela foi conferida, na ordem em que
 *  aconteceram. */
function CartaoHistorico({ g, onReimprimir }: { g: Grupo; onReimprimir: (codigo: string) => void }) {
  const total = g.total ?? g.linhas.length;
  const forasDaJanela = g.total != null ? g.total - g.linhas.length : 0;

  return (
    <div className="glass glass-spec" style={{ padding: 14, borderRadius: 16, border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <strong style={{ fontSize: 14, minWidth: 0 }}>{g.itemNome ?? "Produto removido do catálogo"}</strong>
        {total > 1 && (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--atencao)" }}>
            {total} conferências — foi refeita
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
        {g.linhas.map((c, i) => <Tentativa key={c.id} c={c} separada={i > 0} onReimprimir={onReimprimir} />)}
      </div>

      {forasDaJanela > 0 && (
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5, margin: "10px 0 0" }}>
          Mais {forasDaJanela} tentativa{forasDaJanela === 1 ? "" : "s"} desta atividade
          {forasDaJanela === 1 ? " está" : " estão"} fora desta janela de datas.
        </p>
      )}
    </div>
  );
}

function Tentativa({ c, separada, onReimprimir }: {
  c: LinhaHistorico;
  separada: boolean;
  onReimprimir: (codigo: string) => void;
}) {
  const certo = c.resultado === "certo";
  // Resultado que não é nenhum dos dois (linha de um formato antigo) fica
  // NEUTRO: pintar de verde ou vermelho seria inventar o que ninguém disse.
  const conhecido = certo || c.resultado === "errado";
  const cor = !conhecido ? "var(--neutro)" : certo ? "var(--ok)" : "var(--perigo)";
  const rotulo = !conhecido ? c.resultado : certo ? "Certo" : "Errado";

  return (
    <div style={separada ? { borderTop: "1px solid var(--border)", paddingTop: 11 } : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 11, fontWeight: 750, padding: "3px 9px", borderRadius: 999,
          background: `color-mix(in srgb, ${cor} 14%, transparent)`,
          border: `1px solid color-mix(in srgb, ${cor} 32%, transparent)`,
          color: cor,
        }}>
          <Icon name={!conhecido ? "info-circle" : certo ? "circle-check" : "circle-x"} size={13} color={cor} />
          {rotulo}
        </span>
        {c.tentativa != null && c.tentativas != null && c.tentativas > 1 && (
          <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 650 }}>
            {c.tentativa}ª de {c.tentativas}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
          {dataHora(c.conferidoEm)}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 130px), 1fr))", gap: "8px 12px" }}>
        <Par label="Quem fez" valor={c.executorNome ?? "—"} />
        <Par label="Quem conferiu" valor={c.conferidoPorNome ?? "—"} />
        {certo && <Par label="Entrou no estoque" valor={`${c.quantidade} peça${c.quantidade === 1 ? "" : "s"}`} cor="var(--ok)" />}
        {certo && c.unidadeCodigo && <Par label="Caixa" valor={c.unidadeCodigo} />}
      </div>

      {/* Segunda via. A etiqueta da aprovação só existia dentro do painel de
          conferência e sumia com ele — aba fechada no meio e a caixa lacrada
          ficava na prateleira sem código colado. O bloco fica sempre visível
          (nada de `:hover`, que não existe no celular). */}
      {certo && c.unidadeCodigo && (
        <div style={{ marginTop: 10 }}>
          <Botao variante="sutil" tamanho="sm" icone="printer" onClick={() => onReimprimir(c.unidadeCodigo!)}>
            Imprimir etiqueta de novo
          </Botao>
        </div>
      )}

      {c.defeitos.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 11 }}>
          {c.defeitos.map((d) => (
            <span key={d} style={{
              fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
              background: "color-mix(in srgb, var(--atencao) 14%, transparent)",
              border: "1px solid color-mix(in srgb, var(--atencao) 32%, transparent)",
              color: "var(--atencao)",
            }}>
              {rotuloDoDefeito.get(d) ?? d}
            </span>
          ))}
        </div>
      )}

      {c.obs && (
        <p style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.55, margin: "11px 0 0", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
          {c.obs}
        </p>
      )}
    </div>
  );
}

function Par({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{label}</div>
      <div style={{ fontSize: 13.5, fontWeight: 650, color: cor, fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{valor}</div>
    </div>
  );
}
