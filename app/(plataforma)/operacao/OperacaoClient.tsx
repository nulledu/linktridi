"use client";

// ── Operação — o app do galpão, dentro do site ───────────────────────────────
//
// O galpão tinha as ferramentas espalhadas: bipar numa aba do Estoque,
// conferir noutra, receber noutra, e imprimir numa rota separada. Cada uma
// dessas telas nasceu pra ser usada por quem está SENTADO — coluna estreita,
// alvos de mouse, tabela com sete colunas.
//
// Isto aqui é o mesmo conjunto reorganizado pra quem está DE PÉ: uma coisa por
// vez, alvo grande, e o caminho de volta sempre no mesmo lugar. É o desenho da
// tela inicial do tablet (`WelcomeScreen.kt`), e ele existe porque quem trabalha
// no galpão não navega — escolhe a tarefa, faz, e volta.
//
// ── POR QUE NÃO É UM MÓDULO NOVO NA GRADE ───────────────────────────────────
//
// Porque a grade é DEFAULT-DENY: uma chave `operacao:*` inventada aqui nasceria
// sem ninguém tendo, e a tela abriria com todo botão voltando 403 — que é
// exatamente a armadilha descrita em app/api/estoque/impressao/_gate.ts.
//
// Então esta tela não tem permissão própria. Ela mostra os cartões que as
// permissões DE ESTOQUE da pessoa já abrem, e quem não tem nenhum não vê o
// botão que traz pra cá. Permissão nova, nenhuma; tela nova, uma.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import { PageHead } from "../ui/mobile";
import { BiparClient } from "../estoque/BiparClient";
import { EntradaPorLeitura } from "../estoque/EntradaPorLeitura";
import { RecebimentoPanel } from "../estoque/RecebimentoPanel";
import { ImpressorasPanel } from "../estoque/impressao/ImpressorasPanel";
import { TecladoNaTela } from "../ui/TecladoNaTela";
import { ConsultarPanel } from "./ConsultarPanel";
import { TransferirPanel } from "./TransferirPanel";
import "./operacao.css";

export interface PermsDaOperacao {
  itens: boolean;
  bipar: boolean;
  ajustar: boolean;
  compras: boolean;
  configurarImpressao: boolean;
}

type Cartao = {
  key: string;
  titulo: string;
  /** O que a pessoa vai FAZER, em uma linha. Não é descrição da tela. */
  frase: string;
  icon: string;
  pode: (p: PermsDaOperacao) => boolean;
};

// A ordem é a do DIA, não a alfabética nem a do menu: consultar é o gesto mais
// frequente (dez vezes por hora, com a etiqueta na mão), bipar vem logo depois,
// e imprimir é o que se faz uma vez por lote.
const CARTOES: Cartao[] = [
  { key: "consultar", titulo: "Consultar", frase: "Bipe uma etiqueta e veja quanto tem e onde fica.", icon: "search", pode: (p) => p.itens },
  { key: "saida", titulo: "Dar baixa", frase: "Tirar peça do estoque lendo a etiqueta.", icon: "minus", pode: (p) => p.bipar },
  { key: "entrada", titulo: "Entrada por leitura", frase: "Somar peça no estoque lendo o código.", icon: "plus", pode: (p) => p.ajustar },
  // Ajustar E itens: o painel busca pelo /api/estoque/consultar (gate
  // `estoque:itens`) e grava pelo /api/estoque/transferir (gate
  // `estoque:ajustar`) — com um só dos dois o cartão abriria num beco de 403.
  { key: "transferir", titulo: "Transferir", frase: "Mudar peça de lugar — diga de onde, pra onde e quanto.", icon: "arrows-exchange", pode: (p) => p.ajustar && p.itens },
  { key: "receber", titulo: "Receber", frase: "Dar entrada no que chegou do fornecedor.", icon: "package-import", pode: (p) => p.compras },
  { key: "impressoras", titulo: "Impressoras", frase: "Zebra, térmica do tablet ou o diálogo do navegador.", icon: "printer", pode: () => true },
];

/** A tarefa aberta vive em `?tarefa=`. Ver `useTarefaNaUrl`. */
const PARAM = "tarefa";

/**
 * A tarefa aberta mora na URL, e isso compra três coisas de uma vez:
 *
 *  · o computador do galpão abre DIRETO em `/operacao?tarefa=consultar` como
 *    página inicial, sem ninguém clicar em nada de manhã;
 *  · o botão VOLTAR do navegador (e o gesto de arrastar no celular) fecha a
 *    tarefa em vez de sair da tela — que é o que todo mundo tenta primeiro;
 *  · recarregar a página não perde o lugar.
 *
 * `pushState` ao abrir e `popstate` pra acompanhar: abrir empilha, voltar
 * desempilha. "Todas as tarefas" chama `history.back()` quando foi esta tela
 * que empilhou, senão troca no lugar — assim a pilha nunca ganha uma entrada
 * vazia que obrigue a apertar voltar duas vezes.
 */
function useTarefaNaUrl(valida: (k: string) => boolean) {
  const [tarefa, setTarefa] = useState<string | null>(null);
  const [empilhou, setEmpilhou] = useState(false);
  // `valida` numa ref, pra `ler` ser ESTÁVEL. Com ela nas dependências, o efeito
  // abaixo rodava a cada render — e fechar a tarefa virava uma corrida: o
  // `setTarefa(null)` re-renderizava, o efeito relia a URL (que o `back()` ainda
  // não tinha trocado, a travessia é assíncrona) e REABRIA a tarefa antes do
  // `popstate` chegar. Na tela: toca em "Todas as tarefas" e nada acontece.
  const validaRef = useRef(valida);
  validaRef.current = valida;

  const ler = useCallback(() => {
    try {
      const v = new URLSearchParams(window.location.search).get(PARAM);
      setTarefa(v && validaRef.current(v) ? v : null);
    } catch { setTarefa(null); }
  }, []);

  useEffect(() => {
    ler();
    window.addEventListener("popstate", ler);
    return () => window.removeEventListener("popstate", ler);
  }, [ler]);

  const abrir = useCallback((k: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set(PARAM, k);
    window.history.pushState({ operacao: true }, "", url);
    setEmpilhou(true);
    setTarefa(k);
  }, []);

  const fechar = useCallback(() => {
    // A tela fecha JÁ, sem esperar o `popstate`: a travessia do histórico é
    // assíncrona, e um quadro com a tarefa ainda aberta depois do toque lê
    // como botão que não respondeu — a pessoa toca de novo e volta duas.
    setTarefa(null);
    if (empilhou && window.history.state?.operacao) { window.history.back(); return; }
    const url = new URL(window.location.href);
    url.searchParams.delete(PARAM);
    window.history.replaceState(null, "", url);
  }, [empilhou]);

  return { aberto: tarefa, abrir, fechar };
}

/**
 * O teclado na tela: ligado por padrão onde não há teclado de verdade.
 *
 * `pointer: coarse` é a pergunta certa — "esta tela é operada por dedo?" —, e
 * não a largura: o monitor da bancada tem 1920px e nenhum teclado, enquanto um
 * notebook estreito tem teclado e não precisa de nada disto.
 *
 * A escolha da pessoa vence a detecção e fica gravada NESTE aparelho: o
 * computador do galpão é compartilhado, e quem liga o teclado uma vez não quer
 * ligar de novo amanhã. Sem `localStorage` (janela anônima, armazenamento
 * bloqueado) a detecção continua valendo — a tela não pode depender disso.
 */
const CHAVE_TECLADO = "operacao:teclado";

function usaTecladoNaTela(): [boolean, (v: boolean) => void] {
  const [ligado, setLigado] = useState(false);

  useEffect(() => {
    let salvo: string | null = null;
    try { salvo = window.localStorage.getItem(CHAVE_TECLADO); } catch { /* sem armazenamento */ }
    if (salvo === "1" || salvo === "0") { setLigado(salvo === "1"); return; }
    try { setLigado(window.matchMedia("(pointer: coarse)").matches); } catch { setLigado(false); }
  }, []);

  const trocar = useCallback((v: boolean) => {
    setLigado(v);
    try { window.localStorage.setItem(CHAVE_TECLADO, v ? "1" : "0"); } catch { /* sem armazenamento */ }
  }, []);

  return [ligado, trocar];
}

export function OperacaoClient({ perms }: { perms: PermsDaOperacao }) {
  const disponiveis = CARTOES.filter((c) => c.pode(perms));
  const valida = useCallback((k: string) => disponiveis.some((c) => c.key === k), [disponiveis]);
  const { aberto, abrir, fechar } = useTarefaNaUrl(valida);
  const atual = disponiveis.find((c) => c.key === aberto) ?? null;

  const [teclado, ligarTeclado] = usaTecladoNaTela();
  // Fechado é diferente de desligado: a seta para baixo tira o teclado da
  // frente para ler a resposta inteira, e o próximo toque num campo o traz de
  // volta. Desligar é decisão de quem tem teclado de verdade na bancada.
  const [recolhido, setRecolhido] = useState(false);
  const mostrarTeclado = teclado && !recolhido;

  return (
    <div className="op" data-teclado={mostrarTeclado ? "1" : "0"} style={{ maxWidth: 1120 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <PageHead title={atual ? atual.titulo : "Operação"} />
        <div className="op-barra">
          {/* O interruptor fica no CABEÇALHO, não em configurações: quem chega
              na bancada e não vê teclado precisa achar isto em um olhar, não
              em dois menus. */}
          <button
            type="button"
            className="op-tec-botao"
            aria-pressed={teclado}
            onClick={() => { ligarTeclado(!teclado); setRecolhido(false); }}
          >
            <Icon name="keyboard" size={18} color="currentColor" />
            {teclado ? "Teclado na tela" : "Sem teclado?"}
          </button>
          <Link
            href="/estoque"
            className="ui-card-alvo"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, minHeight: "var(--tap)",
              padding: "0 12px", borderRadius: "var(--r-sm)", fontSize: 13.5, fontWeight: 700,
              color: "var(--text-dim)", textDecoration: "none",
            }}
          >
            <Icon name="building-warehouse" size={15} color="currentColor" />
            <span className="desk-only">Estoque completo</span>
          </Link>
        </div>
      </div>

      {atual ? (
        <div style={{ display: "grid", gap: 14, marginTop: 6 }}>
          {/* O caminho de volta fica SEMPRE no mesmo lugar e SEMPRE visível.
              Numa tela de galpão, procurar como voltar é onde a pessoa desiste
              e chama alguém. */}
          <Botao type="button" variante="sutil" icone="chevron-left" onClick={fechar} className="op-voltar">
            Todas as tarefas
          </Botao>
          <Painel chave={atual.key} perms={perms} />
        </div>
      ) : (
        <>
          <p style={{ margin: "0 0 16px", fontSize: 13.5, color: "var(--text-dim)", maxWidth: 620, lineHeight: 1.5 }}>
            O que o tablet do galpão faz, aqui no computador e no celular. Com um leitor conectado,
            é só bipar — o campo já nasce esperando.
          </p>
          {/* Sem `role="list"`/`listitem`: o role explícito SUBSTITUI o de
              botão, e o leitor de tela passaria a anunciar "item de lista" —
              some a informação de que aquilo é clicável, que é a única coisa
              que a pessoa precisa saber aqui. */}
          <div className="op-grade">
            {disponiveis.map((c) => (
              <button
                key={c.key} type="button" onClick={() => abrir(c.key)}
                className="glass ui-card-alvo op-cartao"
              >
                <Icon name={c.icon} size={26} color="var(--primary-texto)" />
                <span className="op-cartao-titulo">{c.titulo}</span>
                <span className="op-cartao-frase">{c.frase}</span>
              </button>
            ))}
          </div>

          {disponiveis.length <= 1 && (
            <p style={{ marginTop: 16, fontSize: 13, color: "var(--text-dim)" }}>
              Só as impressoras estão liberadas pra você. As outras tarefas dependem das permissões do
              Estoque — peça pro admin em Permissões.
            </p>
          )}
        </>
      )}

      {mostrarTeclado && <TecladoNaTela onFechar={() => setRecolhido(true)} />}
    </div>
  );
}

function Painel({ chave, perms }: { chave: string; perms: PermsDaOperacao }) {
  switch (chave) {
    case "consultar": return <ConsultarPanel />;
    case "transferir": return <TransferirPanel />;
    case "saida": return <BiparClient />;
    case "entrada": return <EntradaPorLeitura podeAjustar={perms.ajustar} />;
    case "receber": return <RecebimentoPanel />;
    case "impressoras": return <ImpressorasPanel podeConfigurar={perms.configurarImpressao} />;
    default: return null;
  }
}
