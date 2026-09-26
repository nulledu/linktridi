"use client";

// ── Imprimir SEMPRE dá em alguma coisa ───────────────────────────────────────
//
// O botão "imprimir" tinha três finais diferentes conforme a máquina: saía na
// Zebra, ou não existia, ou dizia que faltava configurar. Do lado de quem está
// no galpão isso não é configuração — é o botão não funcionar. Ninguém que
// precisa de uma etiqueta agora vai cadastrar uma impressora antes.
//
// Aqui o contrato é um só: TOCOU EM IMPRIMIR, SAI PAPEL.
//
//  · com Zebra escolhida, vai o ZPL pelo cabo (ou pelo Browser Print);
//  · sem Zebra, abre o diálogo do sistema — o mesmo Ctrl+P, com a etiqueta já
//    montada no tamanho certo;
//  · com Zebra que FALHOU, cai no diálogo do mesmo jeito, avisando o que houve.
//
// O último caso é o que mais importa e o que não existia: agente desligado,
// cabo solto, driver segurando a porta. Antes disso a pessoa recebia uma frase
// técnica e nenhuma etiqueta; agora recebe a etiqueta, e a frase explica por
// que saiu na folha e não na tira.
//
// ── POR QUE A FOLHA É UM PORTAL, E NÃO UMA PÁGINA ───────────────────────────
//
// Porque a impressão do navegador imprime o DOCUMENTO, não um elemento. Para
// mandar só a etiqueta é preciso que ela exista na página e que todo o resto
// suma na hora de imprimir — é o que o `@media print` abaixo faz. Abrir outra
// janela seria o caminho óbvio e é pior: bloqueador de pop-up, foco perdido, e
// no tablet uma aba nova que ninguém fecha.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Etiqueta, lerAjustes, type DadosEtiqueta } from "../Etiqueta";
import { useImpressoraLocal, etiquetaParaZpl } from "./useImpressoraLocal";
import { imprimirEtiqueta } from "./enviar-para-impressora";
import { CONFIG_IMPRESSAO_PADRAO, type ConfigImpressao } from "@/lib/estoque-etiqueta-config";

export interface ResultadoRapido {
  ok: boolean;
  /** Onde a etiqueta saiu — a frase da tela muda com isto. */
  onde: "zebra" | "dialogo";
  frase: string;
}

export interface ImpressaoRapida {
  /** Imprime uma etiqueta, custe o que custar. */
  imprimir: (dados: DadosEtiqueta) => Promise<ResultadoRapido>;
  /** `true` enquanto o envio ou o diálogo está em curso. */
  ocupado: boolean;
  /** O nome da Zebra escolhida, quando há uma — para o rótulo do botão. */
  nomeDaZebra: string | null;
  /** A folha invisível. Precisa estar montada na árvore de quem usa o hook. */
  folha: React.ReactNode;
}

export function useImpressaoRapida(): ImpressaoRapida {
  const impressora = useImpressoraLocal();
  const [naFolha, setNaFolha] = useState<DadosEtiqueta | null>(null);
  const [ocupado, setOcupado] = useState(false);
  /*
   * Os ajustes do galpão — os MESMOS que a folha de etiquetas usa.
   *
   * Aqui estava um defeito silencioso: o ZPL saía com `CONFIG_IMPRESSAO_PADRAO`,
   * a configuração de fábrica do desenho, enquanto a folha usava a do galpão.
   * Na prática, a etiqueta reimpressa de uma consulta podia sair com campos que
   * o galpão desligou (ou o número de vias errado) e ninguém desconfiaria: as
   * duas saem da mesma impressora, na mesma tira, e a diferença só aparece com
   * as duas coladas lado a lado na prateleira.
   */
  const [config, setConfig] = useState(CONFIG_IMPRESSAO_PADRAO);
  useEffect(() => {
    let vivo = true;
    void lerAjustes().then((a) => { if (vivo) setConfig(a.config); });
    return () => { vivo = false; };
  }, []);
  // A promessa do `window.print()` fica aqui: o diálogo só pode ser chamado
  // DEPOIS de o React pintar a etiqueta, e quem chamou `imprimir` precisa
  // esperar por isso para saber que terminou.
  const aguardando = useRef<((r: ResultadoRapido) => void) | null>(null);
  const motivo = useRef<string | null>(null);

  /*
   * O diálogo abre no efeito, não no clique.
   *
   * `window.print()` trava a thread até a pessoa fechar a janela; chamado no
   * mesmo passo em que a etiqueta entra no estado, ele abriria ANTES de o React
   * pintar — e a folha sairia em branco. Esperar a pintura é a única forma de
   * garantir que o que está na prévia é o que vai no papel.
   */
  useEffect(() => {
    if (!naFolha) return;
    const id = window.setTimeout(() => {
      try {
        window.print();
      } finally {
        const frase = motivo.current
          // Sem Zebra, a frase diz onde ligar uma. Quem imprime pelo diálogo
          // todo dia costuma ter a impressora ali do lado e não saber que o
          // site fala com ela.
          ?? "Saiu pelo diálogo do navegador (escala em 100%). Se há uma Zebra nesta máquina, " +
             "ligue em Operação › Impressoras e a etiqueta passa a sair direto nela.";
        aguardando.current?.({ ok: true, onde: "dialogo", frase });
        aguardando.current = null;
        motivo.current = null;
        setNaFolha(null);
        setOcupado(false);
      }
    }, 60);
    return () => window.clearTimeout(id);
  }, [naFolha]);

  const imprimir = useCallback(async (dados: DadosEtiqueta): Promise<ResultadoRapido> => {
    if (ocupado) return { ok: false, onde: "dialogo", frase: "Já tem uma impressão em curso." };
    setOcupado(true);

    if (impressora.atual) {
      const r = await imprimirEtiqueta(
        impressora.atual,
        etiquetaParaZpl(dados),
        config,
        config.copias,
      );
      if (r.ok) {
        setOcupado(false);
        return { ok: true, onde: "zebra", frase: `Etiqueta ${dados.codigo} na ${impressora.atual.nome}.` };
      }
      // A Zebra falhou e a etiqueta continua sendo necessária. O diálogo é o
      // plano B, e a frase carrega o motivo — senão a pessoa não entende por
      // que saiu na folha e vai reclamar da tira que não saiu.
      motivo.current = `${r.frase} A etiqueta foi para o diálogo de impressão.`;
    }

    return new Promise<ResultadoRapido>((resolve) => {
      aguardando.current = resolve;
      setNaFolha(dados);
    });
  }, [impressora.atual, ocupado, config]);

  return {
    imprimir,
    ocupado,
    nomeDaZebra: impressora.atual?.nome ?? null,
    folha: <FolhaInvisivel dados={naFolha} t={config} />,
  };
}

/**
 * A etiqueta que só existe no papel.
 *
 * Fora da impressão ela fica fora da tela (e não `display: none`): elemento
 * escondido por `display` não tem layout, e uma etiqueta sem layout sai do
 * tamanho errado — o defeito que já custou uma folha inteira de tiras estreitas
 * na conferência do galpão.
 */
function FolhaInvisivel({ dados, t }: { dados: DadosEtiqueta | null; t: ConfigImpressao }) {
  // `montado` porque o portal precisa de `document.body`, que não existe no
  // servidor. O tamanho vem de cima: uma segunda leitura dos ajustes aqui
  // abriria a porta para a folha e o ZPL discordarem.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado || !dados) return null;

  return createPortal(
    <div className="imp-rapida" aria-hidden="true">
      <Etiqueta dados={dados} altura={t.alturaMm} largura={t.larguraMm} ocultos={t.ocultos} />
      <style>{`
        .imp-rapida { position: fixed; left: -10000px; top: 0; }
        @page { size: auto; margin: 6mm; }
        @media print {
          /* Some com a página inteira e traz a etiqueta de volta para a
             origem: fora da impressão ela mora a dez mil pixels da esquerda,
             onde tem layout (e portanto tamanho) sem aparecer para ninguém. */
          body > *:not(.imp-rapida) { display: none !important; }
          .imp-rapida { position: static !important; left: auto !important; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
