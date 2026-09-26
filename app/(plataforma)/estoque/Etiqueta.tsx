"use client";

// ── Etiqueta impressa ─────────────────────────────────────────────────────────
// Isto é PAPEL: toda medida do rótulo (largura, altura, preenchimento, até o
// tamanho da fonte) vive em `mm`, nunca `px`. Um `px` imprime no que o
// navegador achar que é um pixel — normalmente ~96dpi, sem relação nenhuma com
// centímetro — e o mesmo rótulo sai de um tamanho físico diferente em cada
// impressora. `mm` funciona porque o diálogo de impressão do navegador
// respeita unidade física quando a escala está em "tamanho real" (100%), que é
// o padrão pra imprimir etiqueta.
//
// Cor é FIXA em preto sobre branco — nunca `var(--text)`/`var(--bg)`. O papel
// não tem tema escuro: se o app estiver no escuro e o rótulo herdasse a
// paleta, o texto sairia branco sobre etiqueta branca, ou seja, em branco.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import { AjusteMm, AtalhosDeTamanho } from "./impressao/AjusteMm";
import { code128Svg } from "@/lib/code128";
import { pecasDaUnidade, partirCodigo } from "@/lib/estoque-unidades";
import { mostraContagem, type TipoEtiqueta } from "@/lib/estoque-etiqueta";
import {
  ALTURA_MAXIMA_MM, ALTURA_MINIMA_BARRAS_MM, ALTURA_MINIMA_MM, CONFIG_IMPRESSAO_PADRAO,
  LARGURA_MAXIMA_MM, LARGURA_MINIMA_MM, LETRA_MINIMA_MM, MARGEM_LATERAL_MM,
  TAMANHOS_COMUNS, faixasDaEtiqueta,
  problemaDaLargura, normalizarConfig, type ConfigImpressao, type CampoEtiqueta,
} from "@/lib/estoque-etiqueta-config";
import { CamposDaEtiqueta } from "./impressao/CamposDaEtiqueta";
import { useImpressoraLocal, etiquetaParaZpl } from "./impressao/useImpressoraLocal";
import { imprimirEtiqueta } from "./impressao/enviar-para-impressora";
import { problemaDoCodigoEmZpl } from "@/lib/etiqueta-zpl";

export interface DadosEtiqueta {
  /** Código da unidade — vira o Code128 e também o texto legível abaixo dele. */
  codigo: string;
  /** Nome do produto — canto esquerdo, linha 1. */
  nome: string;
  /** Quantas PEÇAS esta etiqueta vale. Ausente ou 1 = etiqueta de uma peça só,
   *  e aí nada é impresso a respeito (ver `SeloDeCaixa`). Acima de 1 é a caixa
   *  lacrada, e o número vai impresso — é o que a pessoa na prateleira não tem
   *  como descobrir sem romper o lacre. */
  quantidade?: number;
  /**
   * O TIPO da etiqueta, do item (`estoque_itens.etiqueta_tipo`).
   *
   * `caixa` escreve o número SEMPRE — inclusive "1 un", que é o caso que o
   * `quantidade > 1` sozinho não sabia representar: uma caixa de chancelas com
   * uma chancela dentro continua sendo uma caixa lacrada, e sair pelada faz
   * quem a pega abrir o lacre pra conferir.
   *
   * Ausente = `unica`, que é exatamente o comportamento de antes. Ver
   * `mostraContagem` em lib/estoque-etiqueta.ts.
   */
  tipo?: TipoEtiqueta;
  /** "Branco · 2750×1840" — canto esquerdo, linha 2. Omita se o item não tem cor/dimensão. */
  corDimensoes?: string;
  /** Local — canto direito, linha 1 (ex.: "GAL-A"). */
  local: string;
  /** Detalhe fino do local — canto direito, linha 2 (ex.: "C3 · B2"). */
  localDetalhe?: string;
  /** Data de impressão, ISO — vem do registro gravado em `etiqueta_impressoes`. */
  impressoEm: string;
  /** Quem imprimiu — idem, vem do registro (nunca digitado na tela). */
  responsavel: string;
}

/**
 * Quando a etiqueta saiu: `04/08 18:57`.
 *
 * COM HORA e SEM ANO, e a troca é de propósito.
 *
 * A hora entra porque numa etiqueta de galpão ela é o que distingue: num dia
 * saem vários lotes do mesmo item, e "12/08/2026" repetido em quarenta tiras
 * não diz qual delas é a da manhã. Com a hora dá pra achar a caixa da tarde,
 * casar com o turno de quem produziu e desempatar duas contagens do mesmo dia.
 *
 * O ano sai porque a linha mora numa coluna de ~25mm que já carrega o nome do
 * responsável, e alguma coisa tinha de ceder. Entre saber o ANO e saber a HORA,
 * a hora ganha: etiqueta de ano passado se reconhece pelo papel amarelado e
 * pelo estoque que já girou; duas do mesmo dia, não. `04/08 18:57` são 11
 * caracteres contra os 10 de `12/08/2026` — praticamente a mesma largura.
 *
 * Sem `timeZone` explícito de propósito: quem lê a etiqueta está no mesmo fuso
 * de quem imprimiu, e fixar um fuso aqui faria a hora impressa discordar do
 * relógio da parede se o servidor mudasse de região.
 */
function fmtDataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/**
 * O selo da caixa — só existe quando a etiqueta vale MAIS DE UMA peça.
 *
 * Caixa de 1 não imprime nada. Não é economia de tinta: é que um campo que
 * repete "1 un" em 95% das etiquetas deixa de ser lido, e aí o dia em que ele
 * diz "50" também passa batido. O padrão da etiqueta É uma peça — a exceção é
 * que precisa gritar.
 *
 * Quadro com TRAÇO, nunca fundo preto com letra branca: navegador não imprime
 * cor de fundo por padrão (`print-color-adjust` é opt-in e o diálogo do
 * usuário pode desligar), e um selo invertido que perde o fundo vira letra
 * branca sobre papel branco — o número sumiria justamente na peça em que ele
 * é a única informação que ninguém consegue conferir de fora.
 *
 * QUANDO ele aparece deixou de ser "quantidade > 1" e passou a ser o TIPO do
 * item (ver `mostraContagem`): `caixa` escreve sempre, `unica` só quando há de
 * fato mais de uma peça. A diferença aparece justamente no 1 — uma caixa de
 * chancelas com uma chancela dentro é uma caixa, e antes saía pelada.
 *
 * E ele NÃO trunca. O resto da etiqueta corta com reticências; um número
 * cortado ("CAIXA 100…" para 1000) não é informação incompleta, é informação
 * ERRADA.
 *
 * DEITADO e SEM A PALAVRA "CAIXA" — as duas coisas mudaram em 15mm, e a
 * segunda contra o que eu tinha escrito aqui antes.
 *
 * Na etiqueta de 30mm o selo morava na coluna do nome, onde faltava LARGURA e
 * sobrava altura: empilhar "CAIXA" sobre "1000 un" cabia melhor que uma linha.
 * Em 15mm a conta virou — o selo desceu pra coluna do local. E no EMPILHADO ele
 * subiu de volta, agora pro canto direito da faixa de cima, na mesma linha do
 * local: não existe mais "ao lado das barras", porque elas atravessam a tira.
 *
 * A palavra saiu porque medi: "CAIXA 1000 un" pede ~15mm e VAZAVA pra fora da
 * borda (visto na renderização a 3×, não deduzido). Cortar não era opção — o
 * selo é a única coisa da etiqueta que não pode truncar. Escolher entre a
 * palavra e o número é fácil: fica o número.
 *
 * E a palavra fazia menos falta do que eu supunha. O selo só é DESENHADO
 * quando a quantidade passa de 1 — em 95% das etiquetas não existe quadro
 * nenhum. Então o quadro em si já é o aviso de "isto aqui é lacre com mais de
 * uma peça dentro"; a palavra repetia o que a moldura já dizia.
 */
function SeloDeCaixa({ pecas }: { pecas: number }) {
  return (
    <div style={{
      border: "0.35mm solid #000", borderRadius: "0.7mm", padding: "0.15mm 1mm",
      lineHeight: 1.2, whiteSpace: "nowrap", flex: "0 0 auto",
      fontSize: "3.1mm", fontWeight: 800,
    }}>
      {pecas} un
    </div>
  );
}

/**
 * Uma etiqueta de 72 × 18mm, EMPILHADA.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ MDF 6mm Branco       Branco · 2750×1840        GAL-A       ┌───────┐ │
 * │ ║│║│║ ║║│ ║│║│║ ║║ ║│║│║ ║║│ ║│║│║ ║║ ║│║│║ ║║│ ║│║│║ ║║ ║ │ 50 un │ │
 * │ MDF6MM-BR-18-000042          C3 · B2          04/08 18:57 · João     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * TEXTO EM CIMA, BARRAS NA LARGURA INTEIRA, TEXTO EMBAIXO. Era em três colunas,
 * e a troca não é estética: o dono comparou as tiras impressas e disse que a de
 * teste (a impressão livre, que já empilhava) estava boa e as outras ruins. A
 * diferença medível é o MÓDULO — a largura da barra mais fina.
 *
 * Preso na coluna do meio, com teto de 60% da largura útil, o código do galpão
 * (264 módulos) recebia (576 × 3/5) ÷ 264 = 1 ponto por módulo: 0,125mm, o
 * mínimo absoluto da cabeça térmica. Com a largura inteira ele recebe 560 ÷ 264
 * = 2 pontos, 0,25mm — o mesmo da tira aprovada.
 *
 * O que isso custou: o texto não sobe mais AO LADO das barras, então cada linha
 * dele custa altura da etiqueta INTEIRA. Em 18mm cabem duas faixas de texto e
 * mais nada. O nome perdeu a segunda linha (a vaga passou de ~21mm de coluna
 * para ~26mm de faixa, então ele corta em ~18 caracteres em vez de ~34) e a
 * cor, o local e o detalhe passaram a disputar LARGURA em vez de altura.
 *
 * O HORÁRIO fecha a tira, no canto inferior direito. Ele estava na coluna do
 * nome, disputando caractere a caractere com ele; agora abre o canto de menos
 * tráfego da etiqueta, longe do nome e das barras.
 *
 * E o DETALHE DA PRATELEIRA desceu com ele. Colado no local ("GAL-A · C3 · B2")
 * custava 21mm da faixa de cima e fazia o nome e a cor cortarem; sozinho mede
 * 9,6mm e cabe no pé. A leitura melhora junto: "GAL-A" em cima diz o galpão de
 * relance, "C3 · B2" embaixo é o endereço fino de quem já está na estante.
 *
 * Quem reparte as vagas é `faixasDaEtiqueta`, o espelho de
 * `EtiquetaLayout.montar` — a prévia tem de desenhar o que a impressora produz.
 */
export function Etiqueta({
  dados,
  largura = CONFIG_IMPRESSAO_PADRAO.larguraMm,
  altura = CONFIG_IMPRESSAO_PADRAO.alturaMm,
  ocultos = [],
}: { dados: DadosEtiqueta; largura?: number; altura?: number; ocultos?: CampoEtiqueta[] }) {
  // O que o escritório mandou NÃO imprimir. A régua já conhece a lista, então
  // as vagas voltam repartidas SEM o que foi desligado — que é exatamente o que
  // o layout do tablet faz em aritmética.
  const ehCaixa = mostraContagem(dados);
  // ── A régua decide as vagas, e a prévia OBEDECE ────────────────────────────
  //
  // Vaga reservada que a peça não vai usar é buraco — o caminho de todo dia do
  // tablet imprime o SKU e não tem cor · dimensões. O layout do tablet resolve
  // isso repartindo DE NOVO com o que a peça de fato tem; aqui a mesma coisa se
  // faz contando o campo ausente como desligado, e então cada vaga volta com a
  // largura final em milímetro.
  //
  // As larguras entram como `flex: 0 0 Xmm`, nunca como peso de flex. Pesos
  // repetidos na mão foi exatamente o defeito que isto conserta: o componente
  // dizia 5 : 4 enquanto a régua já dizia 1 : 1, e "Branco · 2750×1840" saía
  // com reticências na tela e inteiro no papel. Prévia que mente é pior que
  // prévia nenhuma — ela dá confiança.
  const ausentes: CampoEtiqueta[] = [
    ...(dados.corDimensoes ? [] : (["cor_dimensoes"] as CampoEtiqueta[])),
    ...(dados.localDetalhe ? [] : (["local_detalhe"] as CampoEtiqueta[])),
  ];
  const efetivos = [...new Set([...ocultos, ...ausentes])];
  const mostra = (c: CampoEtiqueta) => !efetivos.includes(c);
  const f = faixasDaEtiqueta(dados.codigo, largura, {
    temLocal: !!dados.local,
    ehCaixa,
    ocultos: efetivos,
  });
  const temCor = f.corDimensoesMm > 0;
  const temLocal = !!dados.local && f.localMm > 0;

  // code128Svg recusa caractere fora de ASCII 32-126 — nunca deveria acontecer
  // (o código vem de codigoDaUnidade, só SKU + sequencial numérico), mas um
  // caractere ruim não pode arrancar a folha de impressão inteira: essa
  // etiqueta cai pro aviso e as outras continuam imprimindo normalmente.
  let svgMarkup: string | null = null;
  try {
    // `preserveAspectRatio="none"`: um código de barras Code128 é lido pela
    // proporção ENTRE as barras no eixo X — esticar o eixo Y sozinho não
    // atrapalha a leitura, e evita a barra de letterbox do "meet" padrão.
    svgMarkup = code128Svg(dados.codigo).replace("<svg ", '<svg preserveAspectRatio="none" width="100%" height="100%" ');
  } catch {
    svgMarkup = null;
  }

  // Uma linha de texto que corta com reticências. `minWidth: 0` é obrigatório
  // em item de flex que corta: sem ele o mínimo é o min-content (o nome inteiro
  // sem quebra), e medido a 1280px "Compensado Naval 15mm Virola Selecionado"
  // esticava a vaga de 26mm pra 65mm, zerava a do local e o nome deixava de
  // cortar. Some no papel (a folha A4 dá ~794px), então o defeito só aparecia
  // na tela larga — e prévia que mente é pior que prévia nenhuma.
  const linha = (larguraMm: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
    flex: `0 0 ${larguraMm}mm`, minWidth: 0,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    fontSize: `${LETRA_MINIMA_MM}mm`, lineHeight: 1.25,
    ...extra,
  });

  return (
    <div
      style={{
        width: `${largura}mm`, height: `${altura}mm`, boxSizing: "border-box",
        display: "flex", flexDirection: "column",
        padding: `0.5mm ${MARGEM_LATERAL_MM}mm`,
        // MOLDURA POR `outline`, NUNCA POR `border`.
        //
        // A borda é uma cortesia da prévia: a cabeça térmica não imprime moldura
        // nenhuma. Mas `border` consome LARGURA — 0,25mm de cada lado —, e a
        // régua que reparte as vagas (`faixasDaEtiqueta`) conta com os 70mm
        // inteiros que o tablet tem. Meio milímetro a menos é o bastante pra
        // "Branco · 2750×1840" sair com reticências na tela e inteiro no papel,
        // que é exatamente a prévia mentindo. `outline` desenha por fora do
        // fluxo e `outline-offset` negativo a traz pra dentro da tira.
        outline: "0.25mm solid #000", outlineOffset: "-0.25mm",
        background: "#fff", color: "#000", fontFamily: "Arial, Helvetica, sans-serif",
        overflow: "hidden", breakInside: "avoid",
      }}
    >
      {/* ── Faixa do topo: o que é, como é, onde está, quantas tem ─────────
          Alinhada pelo FIM (`alignItems: flex-end`) porque o quadro do selo é
          mais alto que uma linha de texto: encostando os dois no pé, o número e
          o local leem como uma coisa só. */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: `${f.vaoMm}mm` }}>
        <div style={linha(f.nomeMm, { fontWeight: 700 })}>{dados.nome}</div>
        {temCor && <div style={linha(f.corDimensoesMm, { color: "#333" })}>{dados.corDimensoes}</div>}
        {temLocal && (
          /* Reserva FIXA, não proporção: "GAL-A" tem cinco caracteres por
             construção, então repartir por peso deixava vaga vazia à direita. */
          <div style={linha(f.localMm, { textAlign: "right", fontWeight: 700 })}>
            {dados.local}
          </div>
        )}
        {ehCaixa && (
          <div style={{ flex: `0 0 ${f.seloMm}mm`, display: "flex", justifyContent: "flex-end" }}>
            <SeloDeCaixa pecas={pecasDaUnidade(dados)} />
          </div>
        )}
      </div>

      {/* ── As barras, na largura útil INTEIRA ──────────────────────────────
          `flex: 1` e não altura fixa: toda sobra da tira vira barra, que é o
          melhor uso possível de altura numa etiqueta — barra mais alta é leitor
          que pega de mais longe e mais torto. `minHeight` no piso de 8mm, que é
          o que um leitor comum precisa. */}
      <div style={{ flex: 1, minHeight: `${ALTURA_MINIMA_BARRAS_MM}mm`, marginTop: "1mm", display: "flex", justifyContent: "center" }}>
        {svgMarkup
          ? <div style={{ width: `${f.barrasMm}mm`, height: "100%" }} dangerouslySetInnerHTML={{ __html: svgMarkup }} />
          : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "1mm", border: "0.2mm dashed #000", fontSize: "2mm", textAlign: "center" }}>
              <Icon name="alert-triangle" size={10} color="#000" /> código inválido
            </div>
          )}
      </div>

      {/* ── Faixa do pé: qual código, de quando, de quem ────────────────────
          O código escrito só é usado quando a barra borrou e alguém vai digitar
          no ERP — então mora colado no que ele substitui. Monoespaçado porque a
          2,8mm o que separa um "0" de um "O" é a caixa fixa da fonte.

          A data vem ANTES do responsável: quando a linha não cabe, quem é
          cortado é o nome de quem imprimiu. Estoque velho se descobre pela data
          e por mais nada; a quem perguntar, alguém acha de outro jeito. */}
      {(mostra("codigo_legivel") || f.mostraDetalheDoLocal || mostra("data_responsavel")) && (
        <div style={{ display: "flex", alignItems: "baseline", gap: `${f.vaoMm}mm` }}>
          {mostra("codigo_legivel") && (
            <div style={linha(f.codigoLegivelMm, { fontFamily: "'Courier New', monospace", letterSpacing: "0.01em" })}>
              {dados.codigo}
            </div>
          )}
          {/* "C3 · B2" no meio — o endereço fino, para quem já está na estante.
              Sem reticências: a régua só abre esta vaga quando ela tem os 9,6mm
              que o texto mede, porque um "C3 · B…" impresso manda procurar numa
              baia que não existe. */}
          {f.mostraDetalheDoLocal && dados.localDetalhe && (
            <div style={linha(f.detalheDoLocalMm, { color: "#333", textAlign: "center" })}>
              {dados.localDetalhe}
            </div>
          )}
          {mostra("data_responsavel") && (
            <div style={linha(f.rodapeMm, { color: "#333", textAlign: "right" })}>
              {fmtDataCurta(dados.impressoEm)} · {dados.responsavel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Os ajustes do escritório, buscados UMA vez ───────────────────────────────
//
// A altura da tira, quantas cópias saem de cada etiqueta e QUAIS SKUs são caixa
// são decisão do escritório (tela /estoque/impressao, tabela `estoque_config` e
// coluna `estoque_itens.etiqueta_tipo`). A folha precisa dos três pra imprimir
// o mesmo papel que o tablet imprime.
//
// NÃO É POLL: uma requisição por carregamento de página, compartilhada por
// todas as folhas montadas (a promessa fica no módulo). Configuração de
// impressão não muda no meio de um lote, e mesmo que mudasse, quem está com a
// folha aberta quer imprimir o que está vendo.
//
// Falhou? Cai no padrão do desenho e a folha imprime como sempre imprimiu.
// Configuração indisponível não pode virar etiqueta que não sai.
export interface AjustesDeImpressao {
  config: ConfigImpressao;
  /** SKUs marcados como CAIXA. Só os que fogem do padrão viajam. */
  caixas: Set<string>;
}

const AJUSTES_PADRAO: AjustesDeImpressao = { config: CONFIG_IMPRESSAO_PADRAO, caixas: new Set() };

let ajustesEmVoo: Promise<AjustesDeImpressao> | null = null;

async function buscarAjustes(): Promise<AjustesDeImpressao> {
  try {
    const r = await fetch("/api/estoque/impressao");
    const j = r.ok ? await r.json() : null;
    if (!j?.config) return AJUSTES_PADRAO;
    // NORMALIZA, não converte com `as`. O cast era uma promessa que a rede não
    // faz: um servidor de uma versão anterior (ou uma resposta em cache no meio
    // de um deploy) devolve o objeto SEM os campos novos, e `config.ocultos`
    // chegaria `undefined` — a folha inteira morria em tela branca no primeiro
    // `.includes`. Aqui todo campo que faltar cai no padrão do desenho, que é a
    // etiqueta que o galpão já imprime.
    return { config: normalizarConfig(j.config), caixas: new Set<string>(j.caixas ?? []) };
  } catch {
    return AJUSTES_PADRAO;
  }
}

/**
 * Exportada porque a impressão de UMA etiqueta (`ImpressaoRapida`) precisa do
 * MESMO tamanho que a folha usa. Duas leituras diferentes do ajuste do galpão
 * dariam duas etiquetas de tamanhos distintos para a mesma peça — e a diferença
 * só apareceria com as duas na mão, coladas na prateleira.
 */
export function lerAjustes(): Promise<AjustesDeImpressao> {
  if (ajustesEmVoo) return ajustesEmVoo;
  const busca = buscarAjustes();
  ajustesEmVoo = busca;
  // A FALHA não fica guardada: uma queda de rede no primeiro carregamento
  // prenderia a página inteira no padrão até alguém recarregar a aba. Só a
  // resposta de verdade vira cache; o padrão é sempre uma tentativa a menos.
  void busca.then((a) => { if (a === AJUSTES_PADRAO && ajustesEmVoo === busca) ajustesEmVoo = null; });
  return busca;
}

/** Só pro teste: esquece o que já foi buscado. */
export function esquecerAjustesDeImpressao() { ajustesEmVoo = null; }

/**
 * O tipo desta etiqueta, deduzido do SKU que mora dentro do próprio código.
 *
 * O código de uma unidade é `<SKU>-<sequencial>`, então a tira de papel carrega
 * a identidade do item sem precisar de mais nada — é a mesma dedução que o
 * tablet faz offline. Quem já sabe o tipo (porque veio da API que montou a
 * etiqueta) manda em `dados.tipo` e este caminho nem roda.
 */
function tipoDaEtiqueta(dados: DadosEtiqueta, caixas: Set<string>): TipoEtiqueta | undefined {
  if (dados.tipo) return dados.tipo;
  const sku = partirCodigo(dados.codigo)?.sku;
  return sku && caixas.has(sku) ? "caixa" : undefined;
}

/** Folha A4 com N etiquetas, prontas pra imprimir. Os controles de tela
 *  (contagem + botão) levam `.nao-imprime` — a regra de impressão embaixo os
 *  esconde no papel. `onImprimir`, se passado, roda ANTES do diálogo de
 *  impressão abrir: é o gancho pra registrar a impressão (POST
 *  /api/estoque/etiquetas) antes da tinta sair — se ele rejeitar, a folha não
 *  chega a abrir o diálogo. */
export function FolhaDeEtiquetas({ etiquetas, onImprimir }: { etiquetas: DadosEtiqueta[]; onImprimir?: () => void | Promise<void> }) {
  const [processando, setProcessando] = useState(false);
  const [ajustes, setAjustes] = useState<AjustesDeImpressao>(AJUSTES_PADRAO);
  // `null` = usa o tamanho do galpão. Ver `TamanhoDestaImpressao`.
  const [avulso, setAvulso] = useState<TamanhoDaEtiqueta | null>(null);
  const [abriuTamanho, setAbriuTamanho] = useState(false);
  // A Zebra desta máquina, se houver. Com ela cadastrada a folha deixa de
  // passar pelo diálogo do navegador: a etiqueta vai em ZPL e quem desenha o
  // código de barras é a impressora. Ver lib/etiqueta-zpl.ts.
  const impressora = useImpressoraLocal();
  const [recadoDaZebra, setRecadoDaZebra] = useState<{ ok: boolean; frase: string } | null>(null);
  /**
   * Quantas etiquetas já saíram na Zebra antes de ela falhar.
   *
   * Elas somem da folha durante o diálogo de resgate: o papel completa o que
   * faltou, não repete o que já está colado.
   */
  const [puladas, setPuladas] = useState(0);

  useEffect(() => {
    let vivo = true;
    lerAjustes().then((a) => { if (vivo) setAjustes(a); });
    return () => { vivo = false; };
  }, []);

  const padrao: TamanhoDaEtiqueta = {
    larguraMm: ajustes.config.larguraMm,
    alturaMm: ajustes.config.alturaMm,
    ocultos: ajustes.config.ocultos,
  };
  const tamanho = avulso ?? padrao;
  const mudouOTamanho = avulso !== null && (
    avulso.larguraMm !== padrao.larguraMm ||
    avulso.alturaMm !== padrao.alturaMm ||
    // `join` e não comparação de referência: as duas listas vêm sempre na ordem
    // do catálogo (`normalizarCampos`), então duas listas iguais comparam iguais
    // — é o que impede o rótulo "só nesta folha" de acender sozinho.
    avulso.ocultos.join() !== padrao.ocultos.join()
  );

  // ── A recusa vale na FOLHA, não só na tela de configuração ────────────────
  //
  // Estreitar a tira faz o código de barras precisar de mais largura do que
  // existe, e a régua é a mesma que a rota e o tablet usam. O que muda aqui é
  // QUANTOS códigos: a folha tem N, e basta UM não caber pra folha inteira ser
  // papel jogado fora — quem imprime 40 tiras não confere as 40 antes de colar.
  //
  // Só o PRIMEIRO problema vira frase. Quarenta linhas dizendo a mesma coisa
  // com códigos diferentes não informam mais que uma; o que a pessoa precisa
  // saber é que nesta largura não dá, e quanto falta.
  //
  // Com Zebra escolhida, a largura que vale é a DO ROLO DELA — o tamanho da
  // folha A4 não tem efeito nenhum sobre o que sai no cabo. E o ZPL tem uma
  // recusa a mais, a dos dois caracteres que viram comando (`^` e `~`).
  const larguraEfetiva = impressora.atual?.larguraMm ?? tamanho.larguraMm;
  const recusa = useMemo(() => {
    for (const e of etiquetas) {
      const p = (impressora.atual ? problemaDoCodigoEmZpl(e.codigo) : null)
        ?? problemaDaLargura(e.codigo, larguraEfetiva);
      if (p) return p;
    }
    return null;
  }, [etiquetas, larguraEfetiva, impressora.atual]);

  async function imprimir() {
    if (processando || etiquetas.length === 0 || recusa) return;
    setProcessando(true);
    setRecadoDaZebra(null);
    try {
      await onImprimir?.();
      if (!impressora.atual) { window.print(); return; }
      await imprimirNaZebra();
    } catch {
      // Quem passou `onImprimir` decide como avisar (toast, etc.) — aqui só
      // garante que a folha não abre o diálogo sem o registro ter gravado.
    } finally {
      setProcessando(false);
    }
  }

  /**
   * Uma etiqueta por vez, em ORDEM, parando na primeira que falha.
   *
   * Parar é a decisão: mandar as quarenta e descobrir que a décima não saiu
   * deixa a pessoa contando tiras pra achar qual. Parando, as que saíram são
   * exatamente as primeiras N, e a frase diz onde parou — a pessoa reimprime
   * dali, não do começo.
   */
  async function imprimirNaZebra() {
    const zebra = impressora.atual!;
    let saiu = 0;
    for (const d of etiquetas) {
      const comTipo = { ...d, tipo: tipoDaEtiqueta(d, ajustes.caixas) };
      const r = await imprimirEtiqueta(zebra, etiquetaParaZpl(comTipo), ajustes.config, copias);
      if (!r.ok) {
        /*
         * A Zebra falhou — e a folha CONTINUA sendo necessária.
         *
         * Antes isto terminava aqui, numa frase técnica e nenhuma etiqueta: o
         * agente desligado, o cabo solto ou o driver segurando a porta viravam
         * um beco, e quem estava com quarenta peças para etiquetar não tinha
         * saída dentro do site. Agora o diálogo do navegador é o plano B — o
         * mesmo Ctrl+P, com as etiquetas já montadas —, e a frase diz por que
         * elas saíram na folha em vez da tira.
         *
         * Só o que ainda não saiu vai para o papel: as primeiras já estão
         * impressas, e reimprimi-las gastaria etiqueta e faria alguém colar
         * duas vezes a mesma peça.
         */
        setRecadoDaZebra({
          ok: false,
          frase: (saiu > 0 ? `Saíram ${saiu} de ${etiquetas.length} na ${zebra.nome}. Parou em ${d.codigo}: ` : "") +
            r.frase + " As que faltam foram para o diálogo de impressão.",
        });
        setPuladas(saiu);
        // O `setTimeout` deixa o React pintar a folha sem as que já saíram
        // antes de o diálogo travar a thread.
        setTimeout(() => { window.print(); setPuladas(0); }, 60);
        return;
      }
      saiu++;
    }
    setRecadoDaZebra({
      ok: true,
      frase: `${saiu} etiqueta${saiu === 1 ? "" : "s"}${copias > 1 ? ` (${copias} vias de cada)` : ""} na ${zebra.nome}.`,
    });
  }

  // Etiquetas ≠ peças quando há caixa no meio. O número que importa pra quem
  // vai conferir a prateleira é o de PEÇAS; o de etiquetas é quanto papel sai
  // da impressora. Só aparecem os dois quando eles de fato diferem.
  const pecas = etiquetas.reduce((s, e) => s + pecasDaUnidade(e), 0);

  // Cada etiqueta com o tipo aplicado, repetida quantas cópias o escritório
  // pediu. A cópia é papel a mais, NÃO peça a mais: os números acima continuam
  // contando etiquetas e peças, não tiras — quem imprime duas vias da mesma
  // caixa não tem duas caixas.
  const copias = Math.max(1, ajustes.config.copias);
  const paraImprimir = etiquetas.slice(puladas).flatMap((d) => {
    const comTipo = { ...d, tipo: tipoDaEtiqueta(d, ajustes.caixas) };
    return Array.from({ length: copias }, () => comTipo);
  });

  return (
    <div>
      <div className="nao-imprime" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
          {etiquetas.length} etiqueta{etiquetas.length === 1 ? "" : "s"}
          {pecas !== etiquetas.length && <> · {pecas} peça{pecas === 1 ? "" : "s"}</>}
          {copias > 1 && <> · {copias} vias de cada</>}
        </span>
        <Botao variante="primario" icone="printer" onClick={imprimir} carregando={processando} disabled={etiquetas.length === 0 || !!recusa}>
          {impressora.atual ? `Imprimir na ${impressora.atual.nome}` : "Imprimir"}
        </Botao>

        {/* Por onde sai. Só aparece quando há Zebra nesta máquina: sem ela a
            pergunta não existe, e um seletor com uma opção só é ruído. A
            escolha fica lembrada por máquina (ver useImpressoraLocal). */}
        {impressora.zebras.length > 0 && (
          <select
            aria-label="Por onde a etiqueta sai"
            value={impressora.atual?.id ?? "navegador"}
            onChange={(e) => { impressora.escolher(e.target.value === "navegador" ? null : e.target.value); setRecadoDaZebra(null); }}
            style={{ minHeight: "var(--tap)", padding: "0 10px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}
          >
            {impressora.zebras.map((z) => (
              <option key={z.id} value={z.id}>{z.nome} · {z.larguraMm}×{z.alturaMm}mm</option>
            ))}
            <option value="navegador">Diálogo do navegador (folha A4)</option>
          </select>
        )}

        {/* O TAMANHO DESTA FOLHA, ao lado do botão que gasta o papel.
            Fechado por padrão: quem só quer imprimir aperta Imprimir e pronto. */}
        <Botao
          variante="sutil"
          tamanho="sm"
          icone="arrows-diagonal"
          aria-expanded={abriuTamanho}
          onClick={() => setAbriuTamanho((v) => !v)}
        >
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {tamanho.larguraMm}×{tamanho.alturaMm}mm
          </span>
          {mudouOTamanho && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--atencao)" }}>
              só nesta folha
            </span>
          )}
        </Botao>

        {/* Quem está de frente pra folha é exatamente quem descobre que a tira
            está saindo do tamanho errado. O caminho pra arrumar mora aqui, e
            não escondido numa aba de configurações que ninguém abre. Some no
            papel junto com o resto dos controles (`.nao-imprime`). */}
        <Link href="/estoque/impressao" style={{ fontSize: 12.5, color: "var(--text-dim)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, minHeight: "var(--tap)" }}>
          <Icon name="settings" size={14} color="currentColor" />
          Configurar impressão
        </Link>
      </div>

      {recadoDaZebra && (
        <p role="status" className="nao-imprime" style={{
          margin: "0 0 16px", padding: "10px 12px", borderRadius: "var(--r-sm)", fontSize: 13.5,
          border: `1.5px solid ${recadoDaZebra.ok ? "var(--ok)" : "var(--perigo)"}`,
          background: "var(--surface)", color: "var(--text)",
        }}>{recadoDaZebra.frase}</p>
      )}

      {impressora.atual && (
        <p className="nao-imprime" style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--text-dim)" }}>
          Na {impressora.atual.nome} a tira sai em {impressora.atual.larguraMm}×{impressora.atual.alturaMm}mm —
          o tamanho do rolo que está nela. O tamanho da folha abaixo vale só pro diálogo do navegador.
        </p>
      )}

      {abriuTamanho && (
        <TamanhoDestaImpressao
          tamanho={tamanho}
          padrao={padrao}
          mudou={mudouOTamanho}
          onMuda={setAvulso}
          recusa={recusa}
        />
      )}

      {/* A recusa aparece MESMO com o painel fechado: ela vale sobre o botão de
          imprimir, e um botão desligado sem frase lê como app quebrado. */}
      {!abriuTamanho && recusa && (
        <div className="nao-imprime" style={{ marginBottom: 16 }}>
          <FraseDeRecusa texto={recusa} />
        </div>
      )}

      {/* A folha A4 sai na LARGURA configurada, a mesma que o tablet imprime.
          Antes eram 80mm fixos aqui e 72mm na térmica — duas etiquetas
          diferentes pro mesmo item, e a diferença só aparecia com as duas na
          mão. `minmax(min(100%, …))`: no celular (a tela de PRÉ-visualização,
          não o papel) uma coluna só; no papel A4 cabem várias lado a lado. */}
      <div style={{
        display: "grid", gap: "4mm",
        gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${tamanho.larguraMm}mm), 1fr))`,
      }}>
        {paraImprimir.map((d, i) => (
          <Etiqueta
            key={`${d.codigo}-${i}`}
            dados={d}
            altura={tamanho.alturaMm}
            largura={tamanho.larguraMm}
            ocultos={tamanho.ocultos}
          />
        ))}
      </div>

      <style>{`
        @page { size: A4; margin: 8mm; }
        @media print { .nao-imprime { display: none } }
      `}</style>
    </div>
  );
}

// ── O tamanho DESTA folha ────────────────────────────────────────────────────
//
// O tamanho da etiqueta virou ajuste (altura e largura, digitáveis, em
// /estoque/impressao). Ele é do GALPÃO: vale pra web e desce pros dois tablets
// no bootstrap, e é assim que tem de ser — a mesma peça não pode ganhar tiras
// diferentes conforme quem imprimiu.
//
// Só que isso deixou UM caminho pra imprimir num tamanho diferente: mudar o
// padrão do galpão, imprimir, e lembrar de voltar. Quem não volta não descobre
// na hora — descobre semanas depois, quando o rolo acaba cedo porque os dois
// tablets passaram um mês imprimindo tiras de 30mm pra peça que precisava de
// 15. É uma armadilha que a própria feature nova criou, e ela aparece
// justamente no caso mais legítimo que existe: conferir no PAPEL como um
// tamanho fica antes de adotá-lo. Hoje, pra ver 48mm impresso de verdade, é
// preciso empurrar 48mm pro galpão inteiro.
//
// Então o tamanho vira uma escolha DESTA folha:
//
//  · começa no padrão do galpão — quem só quer imprimir não vê diferença
//    nenhuma, e o botão continua a um clique;
//  · a diferença é DITA na tela ("só nesta folha"), porque um número que
//    diverge do padrão sem avisar é o mesmo problema por outro lado;
//  · e ela MORRE com a folha. Não grava, não vai pro tablet, não tem migração
//    nem coluna nova — ou seja, não é mais uma configuração pra alguém deixar
//    errada. É o oposto: é o que faz ninguém precisar mexer na que existe.
//
// A FAIXA é a mesma de lá (25 a 72mm, 10 a 80mm) de propósito, e não porque a
// folha A4 precise dela — uma impressora de escritório imprimiria 100mm sem
// reclamar. É pra que o que sai daqui seja reproduzível na térmica: uma
// etiqueta de 90mm colada na peça é uma etiqueta que o tablet nunca vai
// conseguir reimprimir igual.

export interface TamanhoDaEtiqueta {
  larguraMm: number;
  alturaMm: number;
  /**
   * Os campos que esta folha não imprime.
   *
   * Entrou junto com a largura e a altura pelo MESMO motivo, e não por simetria:
   * sem isto, ver no papel como fica a etiqueta sem a data exigiria desligar a
   * data pro galpão inteiro, imprimir, e lembrar de religar. É a armadilha que a
   * própria feature cria, e ela aparece justamente no uso mais legítimo —
   * conferir antes de adotar.
   */
  ocultos: CampoEtiqueta[];
}

function TamanhoDestaImpressao({ tamanho, padrao, mudou, onMuda, recusa }: {
  tamanho: TamanhoDaEtiqueta;
  padrao: TamanhoDaEtiqueta;
  mudou: boolean;
  onMuda: (t: TamanhoDaEtiqueta | null) => void;
  recusa: string | null;
}) {
  return (
    <div
      className="nao-imprime"
      style={{
        marginBottom: 16, padding: 14, borderRadius: "var(--r-md)",
        border: "1px solid var(--border)", background: "var(--surface)",
      }}
    >
      {/* `minmax(min(100%, 190px), 1fr)`: dois campos lado a lado no desktop,
          empilhados sozinhos no celular — a regra mecânica do CLAUDE.md. */}
      <div style={{
        display: "grid", gap: 14,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
      }}>
        <AjusteMm
          id="folha-largura"
          rotulo="Largura da etiqueta"
          valor={tamanho.larguraMm}
          min={LARGURA_MINIMA_MM}
          max={LARGURA_MAXIMA_MM}
          onMuda={(v) => onMuda({ ...tamanho, larguraMm: v })}
        />
        <AjusteMm
          id="folha-altura"
          rotulo="Altura da etiqueta"
          valor={tamanho.alturaMm}
          min={ALTURA_MINIMA_MM}
          max={ALTURA_MAXIMA_MM}
          onMuda={(v) => onMuda({ ...tamanho, alturaMm: v })}
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <AtalhosDeTamanho
          tamanhos={TAMANHOS_COMUNS}
          larguraMm={tamanho.larguraMm}
          alturaMm={tamanho.alturaMm}
          onEscolher={(t) => onMuda({ ...tamanho, larguraMm: t.larguraMm, alturaMm: t.alturaMm })}
        />
      </div>

      {/* Os campos entram aqui pelo MESMO motivo que o tamanho: sem isto, ver no
          papel como fica a etiqueta sem a data exigiria desligar a data pro
          galpão inteiro, imprimir, e lembrar de religar. Compacto — a explicação
          longa de cada um mora na tela de configuração, e repeti-la aqui faria
          o painel da folha ficar mais alto que a própria folha. */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>
          O que vai impresso
        </div>
        <CamposDaEtiqueta
          idBase="folha-campos"
          compacto
          ocultos={tamanho.ocultos}
          onMuda={(ocultos) => onMuda({ ...tamanho, ocultos })}
        />
      </div>

      {recusa && <div style={{ marginTop: 14 }}><FraseDeRecusa texto={recusa} /></div>}

      {/* O caminho de VOLTA existe sempre que há pra onde voltar. Sem ele, quem
          mexeu tem de lembrar dos dois números do galpão pra desfazer — e é aí
          que alguém "conserta" indo mudar o padrão de verdade. */}
      <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {mudou ? (
          <>
            <span>
              Só nesta folha. O padrão do galpão continua {padrao.larguraMm}×{padrao.alturaMm}mm
              {padrao.ocultos.length === 0 ? ", com todos os campos" : `, sem ${padrao.ocultos.length} campo${padrao.ocultos.length === 1 ? "" : "s"}`}
              , e é ele que os tablets imprimem.
            </span>
            <Botao variante="sutil" tamanho="sm" onClick={() => onMuda(null)}>
              Voltar ao padrão do galpão
            </Botao>
          </>
        ) : (
          <span>
            Este é o padrão do galpão, o mesmo que os tablets imprimem. Mudar aqui vale só
            para esta folha — para mudar pra todo mundo é em Configurar impressão.
          </span>
        )}
      </div>
    </div>
  );
}

/** A frase de por que a folha não imprime, com o mesmo peso do aviso da tela de
 *  configuração. Alvo de leitura, não de toque — sem `--tap`. */
function FraseDeRecusa({ texto }: { texto: string }) {
  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "flex-start",
      fontSize: 12.5, lineHeight: 1.5, color: "var(--atencao)",
    }}>
      <span style={{ flex: "0 0 auto", marginTop: 1 }}>
        <Icon name="alert-triangle" size={15} color="currentColor" />
      </span>
      <span>{texto}</span>
    </div>
  );
}
