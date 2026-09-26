"use client";

// ── Configuração de impressão do galpão ──────────────────────────────────────
//
// Duas coisas moram aqui, e as duas o dono pediu junto: COMO a tira sai
// (tamanho e vias) e QUAL DOS DOIS TIPOS cada item usa (peça única ou caixa).
//
// A tela tem PRÉ-VISUALIZAÇÃO e um botão de teste porque configuração de
// impressão não se acerta no escuro: o número na tela não diz nada até virar
// papel. O mesmo motivo pelo qual o tablet tem "Testar corte" desde o começo.
//
// TAMANHO É LARGURA E ALTURA, e os dois se DIGITAM. Antes a largura era
// constante e a altura só andava de botão em botão — o dono relatou os dois
// como um defeito só ("não tá dando pra ajustar pelo teclado nem imprimir
// tamanhos personalizados") e ele estava certo: era o mesmo defeito.
//
// O que a tela continua RECUSANDO, com o motivo escrito: tamanho de letra,
// altura de barra, largura acima do que a cabeça térmica alcança e código de
// barras que não cabe na largura escolhida. Esses não são preferências — são
// física, e limite que o usuário escolhe é limite que alguém escolhe errado no
// dia em que está com pressa, com o erro aparecendo no rolo já gasto.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamicImport from "next/dynamic";
import { Icon } from "../../Icon";
import { PageHead } from "../../ui/mobile";
import { ImpressorasPanel } from "./ImpressorasPanel";
import { useImpressoraLocal, etiquetaParaZpl } from "./useImpressoraLocal";
import { imprimirEtiqueta } from "./enviar-para-impressora";
import { Abas } from "../../ui/Abas";
import { useSticky } from "../../useSticky";
import { Acoes, Botao } from "../../ui/controles";
import { Alerta } from "../../ui/Alerta";
import { toast } from "../../Toast";
// ComporEtiqueta arrasta o @zxing/library inteiro (gerador de QR, ~300 KB e sem
// subpath pra importar menos) e mora atrás da aba "compor" — só desce quando a
// pessoa abre a aba.
const ComporEtiqueta = dynamicImport(() => import("./ComporEtiqueta").then((m) => m.ComporEtiqueta), { ssr: false });
import { AjusteMm, AtalhosDeTamanho } from "./AjusteMm";
import { CamposDaEtiqueta } from "./CamposDaEtiqueta";
import { Etiqueta, esquecerAjustesDeImpressao, type DadosEtiqueta } from "../Etiqueta";
import { TIPOS_ETIQUETA, type TipoEtiqueta } from "@/lib/estoque-etiqueta";
import {
  ALTURA_MAXIMA_MM, ALTURA_MINIMA_MM, ALTURA_MINIMA_BARRAS_MM, COPIAS_MAXIMAS,
  LARGURA_MAXIMA_MM, LARGURA_MINIMA_MM, TAMANHOS_COMUNS,
  CONFIG_IMPRESSAO_PADRAO, LETRA_MINIMA_MM, avaliarAltura, avaliarLargura, problemaDaLargura,
  normalizarConfig, emListaE, type CampoEtiqueta,
} from "@/lib/estoque-etiqueta-config";

interface ItemComTipo {
  id: string; nome: string; sku: string | null;
  categoria: string | null; serializado: boolean; tipo: TipoEtiqueta;
}

/**
 * A etiqueta da prévia é a MAIS CHEIA que existe: nome comprido, cor e
 * dimensões, local com detalhe de prateleira, o selo da caixa, o código escrito
 * e o horário. É nela que a altura aperta primeiro — uma prévia com só o nome e
 * as barras sai linda em qualquer altura e não prova nada.
 *
 * E com o desenho EMPILHADO ela é a que aperta na LARGURA também: o selo
 * reserva 10mm da faixa de cima, então é a etiqueta de caixa que decide se o
 * detalhe da prateleira cabe.
 */
const EXEMPLO: DadosEtiqueta = {
  codigo: "MDF6MM-BR-18-000042",
  nome: "Folha de alavanca montada em MDF",
  quantidade: 50,
  tipo: "caixa",
  corDimensoes: "Branco · 2750×1840",
  local: "GAL-A",
  localDetalhe: "C3 · B2",
  impressoEm: new Date().toISOString(),
  responsavel: "Teste de impressão",
};

export function ImpressaoClient({ podeConfigurar, podeVerItens }: { podeConfigurar: boolean; podeVerItens: boolean }) {
  const [altura, setAltura] = useState(CONFIG_IMPRESSAO_PADRAO.alturaMm);
  const [largura, setLargura] = useState(CONFIG_IMPRESSAO_PADRAO.larguraMm);
  const [copias, setCopias] = useState(CONFIG_IMPRESSAO_PADRAO.copias);
  const [ocultos, setOcultos] = useState<CampoEtiqueta[]>(CONFIG_IMPRESSAO_PADRAO.ocultos);
  const [gravado, setGravado] = useState(CONFIG_IMPRESSAO_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [pendente, setPendente] = useState<string | null>(null);

  const carregarConfig = useCallback(async () => {
    try {
      const r = await fetch("/api/estoque/impressao");
      if (!r.ok) throw new Error("falhou");
      const j = await r.json();
      // `normalizarConfig` e não um spread do padrão: o spread só cobre a chave
      // AUSENTE, e um servidor de versão anterior pode mandá-la presente e
      // `undefined` — aí `gravado.ocultos` viria nulo e o `join()` que decide se
      // o botão "Salvar" acende morreria na primeira renderização.
      const config = normalizarConfig(j.config);
      setAltura(config.alturaMm);
      setLargura(config.larguraMm);
      setCopias(config.copias);
      setOcultos(config.ocultos);
      setGravado(config);
      setPendente(j.pendente ?? null);
    } catch {
      toast.erro("Não deu pra ler a configuração agora. Os números na tela são os do padrão.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregarConfig(); }, [carregarConfig]);

  const mudou = altura !== gravado.alturaMm || largura !== gravado.larguraMm ||
    copias !== gravado.copias ||
    // `join` e não referência: as duas listas vêm na ordem do catálogo
    // (`normalizarCampos`), então duas iguais comparam iguais e o botão
    // "Salvar" não acende sozinho ao carregar a tela.
    ocultos.join() !== gravado.ocultos.join();
  const avaliacao = useMemo(() => avaliarAltura(altura, ocultos), [altura, ocultos]);
  const daLargura = useMemo(() => avaliarLargura(largura, EXEMPLO.codigo), [largura]);
  // Recusa DE VERDADE: nesta largura o código do galpão não vira barras. Salvar
  // isso deixaria todo lote de recebimento sem imprimir, com o motivo aparecendo
  // só lá no tablet.
  const larguraImpossivel = problemaDaLargura(EXEMPLO.codigo, largura) !== null;

  async function salvar() {
    setSalvando(true);
    try {
      const r = await fetch("/api/estoque/impressao", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ alturaMm: altura, larguraMm: largura, copias, ocultos }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.erro(j.detalhe ?? "Não deu pra salvar. Tente de novo.");
        return;
      }
      setGravado(j.config);
      setPendente(null);
      // A folha de etiquetas guarda os ajustes por carregamento de página;
      // sem isto, quem salva aqui e volta pro catálogo na mesma navegação
      // continua imprimindo o tamanho antigo e conclui que não salvou.
      esquecerAjustesDeImpressao();
      toast.ok("Salvo. Os tablets pegam no próximo sincronismo.");
    } finally {
      setSalvando(false);
    }
  }

  // ── Duas seções, uma porta ─────────────────────────────────────────────────
  //
  // "Como a etiqueta sai" é AJUSTE (a altura da tira, as vias, o tipo por
  // item); "Escrever uma etiqueta" é TRABALHO DO DIA (a placa da prateleira que
  // alguém vai colar daqui a cinco minutos). São coisas diferentes, e por um
  // instante isto pediu duas rotas.
  //
  // Ficaram na mesma porque a pergunta que traz alguém aqui é uma só —
  // "imprimir" — e porque o que a segunda seção precisa explicar (a letra não
  // desce de 2,8mm, a barra não desce de 8mm, a tira tem 80mm) já está escrito
  // na primeira. Duas rotas fariam a explicação existir em uma delas e faltar
  // na outra.
  const [secao, setSecao] = useSticky<"config" | "compor">("estoque.impressao.secao", "config");
  // Compor é ato de admin/gerente, o MESMO gate do resto desta tela: quem só
  // pode olhar não manda papel sair do outro lado do prédio.
  const abas = podeConfigurar
    ? ([["config", "Como a etiqueta sai", "settings"], ["compor", "Escrever uma etiqueta", "pencil"]] as const)
    : ([["config", "Como a etiqueta sai", "settings"]] as const);
  const secaoAtual = abas.some(([k]) => k === secao) ? secao : "config";

  return (
    <div style={{ maxWidth: 1120 }}>
      <PageHead
        title="Impressão de etiquetas"
        sub="Vale pro navegador e pros tablets do galpão."
      />

      {pendente && <AvisoPendente texto={pendente} />}
      {!podeConfigurar && (
        <AvisoSimples
          icone="lock"
          texto="Você pode ver como está, mas quem muda a etiqueta de todo o galpão é admin ou gerente."
        />
      )}

      {abas.length > 1 && (
        <div style={{ margin: "14px 0 0" }}>
          <Abas
            valor={secaoAtual}
            onMuda={setSecao}
            ariaLabel="Seções da impressão"
            itens={abas.map(([k, rot, ic]) => ({
              valor: k,
              rotulo: <><Icon name={ic} size={15} color="currentColor" /> {rot}</>,
            }))}
          />
        </div>
      )}

      {secaoAtual === "compor" ? <ComporEtiqueta /> : (
      <>
      <div className="duo" style={{ marginTop: 18, alignItems: "start" }}>
        {/* As impressoras DESTA máquina vêm primeiro: é a pergunta que alguém
            com uma Zebra recém-tirada da caixa traz pra cá, e ela é da máquina —
            o resto da página é do galpão inteiro. */}
        <Cartao titulo="Impressoras desta máquina">
          <ImpressorasPanel podeConfigurar={podeConfigurar} />
        </Cartao>

        <Cartao titulo="Como a tira sai">
          <AtalhosDeTamanho
            tamanhos={TAMANHOS_COMUNS}
            larguraMm={largura}
            alturaMm={altura}
            desabilitado={!podeConfigurar || carregando}
            onEscolher={(t) => { setLargura(t.larguraMm); setAltura(t.alturaMm); }}
          />

          <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

          <AjusteMm
            id="etiqueta-largura"
            rotulo="Largura da etiqueta"
            valor={largura}
            min={LARGURA_MINIMA_MM}
            max={LARGURA_MAXIMA_MM}
            onMuda={setLargura}
            desabilitado={!podeConfigurar || carregando}
          />
          {/* A largura é a área que a cabeça ALCANÇA, não a bobina — e a frase
              precisa dizer isso, senão alguém digita 80 e perde 8mm de etiqueta
              na borda sem nunca entender por quê. */}
          <p style={{
            margin: "10px 0 0", fontSize: 13, lineHeight: 1.5,
            color: daLargura.aviso ? "var(--atencao)" : "var(--text-dim)",
          }}>
            {daLargura.aviso ?? (
              `É o que a cabeça térmica alcança: 72mm num rolo de 80, 48mm num de 58. ` +
              `Nesta largura o código de barras aceita até ${daLargura.maxCaracteresDoCodigo} caracteres.`
            )}
          </p>

          <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

          <AjusteMm
            id="etiqueta-altura"
            rotulo="Altura da etiqueta"
            valor={altura}
            min={ALTURA_MINIMA_MM}
            max={ALTURA_MAXIMA_MM}
            onMuda={setAltura}
            desabilitado={!podeConfigurar || carregando}
          />
          {/* A frase do que se ganha ou perde nesta altura, montada a partir do
              que o layout de fato deixa de fora — não de um texto por degrau,
              que poderia mentir se alguém mexesse no layout e esquecesse dela. */}
          <p style={{
            margin: "10px 0 0", fontSize: 13, lineHeight: 1.5,
            color: avaliacao.aviso ? "var(--atencao)" : "var(--text-dim)",
          }}>
            {/* A lista sai da AVALIAÇÃO, nunca escrita à mão aqui. A versão
                anterior era um texto fixo e passou a mentir no minuto em que os
                campos viraram escolha: com o código escrito desligado, ela
                mostrava "barras de 14mm" (certo) ao lado de "…e o código
                escrito" (falso). Frase que mente ao lado de número certo é pior
                que frase nenhuma — ela dá confiança. */}
            {avaliacao.aviso ?? (
              `Barras de ${avaliacao.alturaBarrasMm.toFixed(1)}mm — ` +
              `${ocultos.length === 0 ? "cabe tudo" : "a tira leva"}: ${emListaE(avaliacao.cabe)}.`
            )}
          </p>

          <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

          <AjusteMm
            id="etiqueta-copias"
            rotulo="Vias de cada etiqueta"
            valor={copias}
            min={1}
            max={COPIAS_MAXIMAS}
            unidade={copias === 1 ? "via" : "vias"}
            unidadeNaFaixa="vias"
            onMuda={setCopias}
            desabilitado={!podeConfigurar || carregando}
          />
          <p style={{ margin: "10px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--text-dim)" }}>
            {copias === 1
              ? "Uma tira por etiqueta, o normal."
              : `${copias} tiras iguais por etiqueta — uma na caixa, outra na ficha da prateleira. ` +
                "Continua sendo UMA etiqueta e UMA peça: a via a mais é papel, não estoque."}
          </p>

          <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

          {/* ── O que vai IMPRESSO ────────────────────────────────────────────
              Vem depois do tamanho de propósito: quem chega aqui já escolheu a
              tira e leu, ao lado da altura, o que não coube nela. Desligar um
              campo é a resposta pra esse aviso — e é a única alavanca da tela
              que DEVOLVE espaço em vez de gastar. */}
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>
            O que vai impresso na etiqueta
          </div>
          <CamposDaEtiqueta
            idBase="config-campos"
            ocultos={ocultos}
            onMuda={setOcultos}
            desabilitado={!podeConfigurar || carregando}
          />

          {podeConfigurar && (
            <>
              <Acoes style={{ marginTop: 18 }}>
                <Botao
                  variante="primario"
                  icone="check"
                  onClick={salvar}
                  carregando={salvando}
                  disabled={!mudou || larguraImpossivel}
                >
                  {mudou ? "Salvar" : "Salvo"}
                </Botao>
                {mudou && (
                  <Botao variante="sutil" onClick={() => {
                    setAltura(gravado.alturaMm); setLargura(gravado.larguraMm);
                    setCopias(gravado.copias); setOcultos(gravado.ocultos);
                  }}>
                    Desfazer
                  </Botao>
                )}
              </Acoes>
              {/* Salvar uma largura em que o código não vira barras deixaria
                  TODO recebimento sem etiqueta, e o motivo apareceria só lá no
                  tablet. O botão apaga com a frase do lado — botão apagado sem
                  explicação lê como app quebrado. */}
              {larguraImpossivel && (
                <AvisoSimples icone="alert-triangle" texto="Não dá pra salvar esta largura: o código de barras do galpão não cabe nela." />
              )}
            </>
          )}
        </Cartao>

        <Previa altura={altura} largura={largura} ocultos={ocultos} />
      </div>

      <OQueNaoMuda />

      {podeVerItens && <TiposPorItem podeConfigurar={podeConfigurar} />}
      </>
      )}
    </div>
  );
}

// ── A prévia e o teste ───────────────────────────────────────────────────────

/**
 * A etiqueta desenhada nas medidas de verdade, em `mm`.
 *
 * "Tamanho real" é honesto no PAPEL: o `mm` do CSS é físico quando a escala do
 * diálogo de impressão está em 100%. Na TELA ele depende do monitor, então a
 * frase embaixo diz isso em vez de deixar alguém medir o vidro com a régua e
 * concluir que o sistema está errado.
 *
 * O bloco rola de lado no celular: a etiqueta tem 80mm e não pode encolher pra
 * caber — encolher seria mostrar uma etiqueta que não existe.
 */
function Previa({ altura, largura, ocultos }: { altura: number; largura: number; ocultos: CampoEtiqueta[] }) {
  const [imprimindo, setImprimindo] = useState(false);
  // Com Zebra escolhida nesta máquina, o teste sai NELA — é o que a pessoa
  // quer conferir. Mandar pro diálogo do navegador enquanto a Zebra está ali
  // do lado testaria a impressora errada.
  const impressora = useImpressoraLocal();
  const [recado, setRecado] = useState<string | null>(null);

  function imprimirTeste() {
    setImprimindo(true);
    setRecado(null);
    if (impressora.atual) {
      const zebra = impressora.atual;
      void imprimirEtiqueta(zebra, etiquetaParaZpl({ ...EXEMPLO, impressoEm: new Date().toISOString() }),
        { ...CONFIG_IMPRESSAO_PADRAO, ocultos }).then((r) => {
          setImprimindo(false);
          setRecado(r.ok ? `Teste enviado à ${zebra.nome}.` : r.frase);
        });
      return;
    }
    // O `setTimeout` deixa o React pintar o estado antes de o diálogo do
    // navegador travar a thread — sem ele o botão só "acorda" depois que a
    // pessoa fecha o diálogo, e parece que o clique não pegou.
    setTimeout(() => {
      try { window.print(); } finally { setImprimindo(false); }
    }, 30);
  }

  return (
    <Cartao titulo="Como vai ficar">
      {/* Largura em `min-content` e não fixa: a etiqueta tem o tamanho que a
          configuração pede, e o bloco rola de lado DENTRO dele mesmo quando ela
          não cabe na tela. Encolher a etiqueta pra caber mostraria uma etiqueta
          que não existe — que é exatamente o defeito que a pessoa veio conferir. */}
      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <div className="imp-prova" style={{ width: "min-content" }}>
          <PreviaOuRecusa dados={EXEMPLO} altura={altura} largura={largura} ocultos={ocultos} />
        </div>
      </div>
      <p style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 1.5, color: "var(--text-dim)" }}>
        Uma etiqueta cheia: nome, cor e dimensões, local com prateleira, o selo da caixa, o
        código escrito e o horário. É nela que a altura aperta primeiro.
        <br />
        {largura}×{altura}mm no papel, exato, desde que a escala do diálogo esteja em 100%. Na tela
        o tamanho depende do monitor.
      </p>
      <Acoes style={{ marginTop: 16 }}>
        <Botao variante="secundario" icone="printer" onClick={imprimirTeste} carregando={imprimindo}>
          {impressora.atual ? `Imprimir teste na ${impressora.atual.nome}` : "Imprimir teste"}
        </Botao>
      </Acoes>
      {recado && <p role="status" style={{ margin: "10px 0 0", fontSize: 13, color: "var(--text-dim)" }}>{recado}</p>}

      {/* Só a etiqueta vai pro papel. `visibility` e não `display` de propósito:
          esconder por `display` reflui o layout inteiro e a etiqueta perderia a
          largura que a coluna do grid lhe dá — sairia estreita, que é justamente
          o defeito que a pessoa veio conferir aqui. E numa etiqueta empilhada
          "estreita" também quer dizer barra fina: a largura é quem dá módulo. */}
      <style>{`
        @media print {
          @page { size: auto; margin: 8mm; }
          body * { visibility: hidden !important; }
          .imp-prova, .imp-prova * { visibility: visible !important; }
          .imp-prova { position: absolute !important; left: 0; top: 0; }
        }
      `}</style>
    </Cartao>
  );
}

/**
 * A etiqueta desenhada — ou a frase de por que ela não existe nesta largura.
 *
 * `Etiqueta` lança quando o código não cabe (é o mesmo comportamento do
 * `EtiquetaLayout` do tablet: recusa em vez de desenhar barra cortada). Sem
 * este invólucro, a prévia sumiria — e uma prévia em branco lê como "ainda vai
 * carregar", que é a única coisa pior que uma prévia errada.
 */
function PreviaOuRecusa({ dados, altura, largura, ocultos }: {
  dados: DadosEtiqueta; altura: number; largura: number; ocultos: CampoEtiqueta[];
}) {
  const recusa = problemaDaLargura(dados.codigo, largura);
  if (!recusa) return <Etiqueta dados={dados} altura={altura} largura={largura} ocultos={ocultos} />;
  return (
    <div style={{
      width: `${largura}mm`, minHeight: `${altura}mm`, boxSizing: "border-box",
      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
      border: "0.3mm dashed var(--perigo)", borderRadius: "var(--r-sm)",
    }}>
      <Icon name="alert-triangle" size={18} color="var(--perigo)" />
      <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-dim)", minWidth: 0 }}>{recusa}</span>
    </div>
  );
}

// ── O que NÃO é configurável, e por quê ──────────────────────────────────────

const RECUSAS: { titulo: string; porque: string }[] = [
  {
    titulo: `Letra menor que ${LETRA_MINIMA_MM.toString().replace(".", ",")}mm`,
    porque: "Veio de tira impressa e conferida na mão: abaixo disso, papel térmico barato sai borrão. " +
      "Quando falta espaço, a etiqueta prefere CORTAR texto a encolher a letra — nome cortado que se lê " +
      "vale mais que nome inteiro que ninguém decifra, e a identidade da peça está no código de barras.",
  },
  {
    titulo: `Barra menor que ${ALTURA_MINIMA_BARRAS_MM}mm`,
    porque: "Abaixo disso o leitor precisa estar quase perpendicular pra pegar uma varredura inteira. " +
      "A pessoa passa a bipar três vezes por peça e conclui que o leitor está ruim. A faixa de altura " +
      "que esta tela oferece é justamente a que garante esse piso.",
  },
  {
    titulo: `Largura acima de ${LARGURA_MAXIMA_MM}mm`,
    porque: `A largura virou ajuste, mas ${LARGURA_MAXIMA_MM}mm é onde a cabeça térmica termina — num rolo de ` +
      "80mm ela alcança 72, num de 58 alcança 48. Pedir mais não imprime mais: o excedente simplesmente " +
      "não sai, em silêncio, e quem descobre é o papel depois do rolo gasto.",
  },
  {
    titulo: "Código de barras espremido",
    porque: "O código se dimensiona, não se estica: o traço mais fino é um ponto da impressora e ponto " +
      "nenhum vale meio. Se o código não cabe na largura, a tela recusa em vez de imprimir barra cortada — " +
      "barra cortada não é código incompleto, é código que escaneia OUTRA coisa.",
  },
  {
    titulo: "O nome, as barras e o selo da caixa",
    porque: "Os campos que dá pra desligar estão na lista acima, e estes três não estão. O nome e o " +
      "código de barras SÃO a etiqueta — sem eles não há por que gastar papel. O selo é o único número " +
      "que ninguém confere sem romper o lacre; escondê-lo faria quem pega a caixa abrir pra contar, " +
      "que é o que o lacre existe pra evitar. O local e a cor também não estão: eles já somem sozinhos " +
      "quando a peça não os tem, e um interruptor seria só uma segunda maneira de a mesma coisa " +
      "estar desligada.",
  },
  {
    titulo: "Folga da guilhotina e qual impressora usar",
    porque: "Ficam no tablet, na tela Impressora. As duas dependem da lâmina e do rádio DAQUELE aparelho, " +
      "e o escritório não está olhando pra ele — travar daqui seria decidir por um hardware que ninguém vê.",
  },
];

function OQueNaoMuda() {
  return (
    <div className="glass" style={{ marginTop: 18, padding: 20, borderRadius: "var(--r-md)" }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="lock" size={16} color="var(--text-dim)" />
        O que não dá pra mudar aqui
      </h2>
      <div style={{ display: "grid", gap: 14, marginTop: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
        {RECUSAS.map((r) => (
          <div key={r.titulo}>
            <div style={{ fontSize: 13.5, fontWeight: 650 }}>{r.titulo}</div>
            <p style={{ margin: "5px 0 0", fontSize: 12.5, lineHeight: 1.55, color: "var(--text-dim)" }}>{r.porque}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tipo de etiqueta por item ────────────────────────────────────────────────

function TiposPorItem({ podeConfigurar }: { podeConfigurar: boolean }) {
  const [itens, setItens] = useState<ItemComTipo[]>([]);
  const [busca, setBusca] = useState("");
  const [soCaixas, setSoCaixas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [pendente, setPendente] = useState<string | null>(null);
  const pedido = useRef(0);

  useEffect(() => {
    const meu = ++pedido.current;
    setCarregando(true);
    // Espera a pessoa parar de digitar. Não é poll: só dispara com tecla, e
    // uma requisição por pausa é uma por busca de verdade.
    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams();
        if (busca.trim()) p.set("busca", busca.trim());
        if (soCaixas) p.set("caixas", "1");
        const r = await fetch(`/api/estoque/impressao/tipos?${p}`);
        const j = await r.json().catch(() => ({}));
        if (meu !== pedido.current) return;   // resposta velha de uma busca abandonada
        setItens(j.itens ?? []);
        setPendente(j.pendente ?? null);
      } finally {
        if (meu === pedido.current) setCarregando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, soCaixas]);

  async function marcar(item: ItemComTipo, tipo: TipoEtiqueta) {
    if (item.tipo === tipo) return;
    setSalvandoId(item.id);
    const antes = itens;
    setItens((l) => l.map((i) => (i.id === item.id ? { ...i, tipo } : i)));
    try {
      const r = await fetch("/api/estoque/impressao/tipos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId: item.id, tipo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setItens(antes);   // a tela não pode dizer "caixa" se o banco disse não
        toast.erro(j.detalhe ?? "Não deu pra salvar o tipo. Tente de novo.");
        return;
      }
      esquecerAjustesDeImpressao();
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <div className="glass" style={{ marginTop: 18, padding: 20, borderRadius: "var(--r-md)" }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Tipo de etiqueta de cada item</h2>
      <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.55, color: "var(--text-dim)" }}>
        Uma chapa é uma peça; uma caixa de chancelas é um lacre com N dentro. Todo item nasce
        <strong> peça única</strong>, que é como a etiqueta já se comportava — só marque o que de fato
        vem em caixa. A diferença aparece quando a caixa tem <strong>uma</strong> peça: peça única não
        escreve nada, caixa escreve “1 un”.
      </p>

      {pendente && <AvisoPendente texto={pendente} />}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "16px 0 4px", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 min(100%, 260px)", minWidth: 0 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}>
            <Icon name="search" size={15} color="var(--text-dim)" />
          </span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou SKU…"
            aria-label="Buscar item"
            style={{
              width: "100%", minHeight: "var(--tap)", background: "var(--surface)",
              border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
              padding: "9px 12px 9px 34px", color: "var(--text)", fontSize: 14,
            }}
          />
        </div>
        <Botao
          variante={soCaixas ? "primario" : "sutil"}
          icone="box"
          onClick={() => setSoCaixas((v) => !v)}
        >
          Só as caixas
        </Botao>
      </div>

      {carregando ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "16px 0 0" }}>Carregando…</p>
      ) : itens.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "16px 0 0" }}>
          {soCaixas
            ? "Nenhum item marcado como caixa ainda."
            : "Nenhum item encontrado. Tente outro nome ou SKU."}
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
          {itens.map((item) => (
            <LinhaDoItem
              key={item.id}
              item={item}
              podeConfigurar={podeConfigurar}
              salvando={salvandoId === item.id}
              onMarcar={(t) => marcar(item, t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LinhaDoItem({ item, podeConfigurar, salvando, onMarcar }: {
  item: ItemComTipo; podeConfigurar: boolean; salvando: boolean; onMarcar: (t: TipoEtiqueta) => void;
}) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center",
      padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
    }}>
      <div style={{ flex: "1 1 min(100%, 200px)", minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.nome}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
          {item.sku ?? "sem SKU"}
          {/* Item a granel (cola, tinta) nunca vira tira de papel — o tipo dele
              é uma pergunta sem efeito, e dizer isso é melhor do que escondê-lo
              da lista e deixar a pessoa procurando. */}
          {!item.serializado && " · não é etiquetado"}
        </div>
      </div>
      {/* <div> e não <label> em volta do par de botões: um <label> em volta de
          um grupo de botões dispara o PRIMEIRO deles ao clicar no rótulo, e a
          seleção muda sozinha.

          `1 1 min(100%, 220px)`: no computador o par fica ao lado do nome; a
          320px ele desce pra própria linha e os dois botões dividem a largura.
          A alternativa (deixar a fileira rolar de lado) escondia metade da
          segunda opção atrás do esmaecido — opção que precisa ser arrastada
          pra ser lida não é opção. */}
      <div style={{ display: "flex", gap: 6, flex: "1 1 min(100%, 220px)", minWidth: 0 }}>
        {TIPOS_ETIQUETA.map((t) => {
          const ativo = item.tipo === t.key;
          return (
            <button
              key={t.key}
              type="button"
              className="ui-btn"
              data-v={ativo ? "primario" : "sutil"}
              data-t="sm"
              title={t.efeito}
              aria-pressed={ativo}
              disabled={!podeConfigurar || salvando}
              onClick={() => onMarcar(t.key)}
              style={{ minHeight: "var(--tap)", flex: "1 1 0", minWidth: 0 }}
            >
              <Icon name={t.icone} size={14} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Peças pequenas ───────────────────────────────────────────────────────────

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="glass" style={{ padding: 20, borderRadius: "var(--r-md)", minWidth: 0 }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>{titulo}</h2>
      {children}
    </div>
  );
}

function AvisoPendente({ texto }: { texto: string }) {
  return <AvisoSimples icone="alert-triangle" texto={`Ainda não dá pra salvar. ${texto}`} />;
}

// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
function AvisoSimples({ icone, texto }: { icone: string; texto: string }) {
  return <Alerta tom="atencao" icone={icone} style={{ marginTop: 14 }}>{texto}</Alerta>;
}
