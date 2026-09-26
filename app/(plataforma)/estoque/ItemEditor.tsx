"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { CameraFoto } from "../ui/CameraFoto";
import { LeitorCodigo } from "../ui/LeitorCodigo";
import { GlassSelect } from "../GlassPicker";
import { confirmar, toast } from "../Toast";
import { Botao, BotaoIcone, Caixa } from "../ui/controles";
import { Alerta } from "../ui/Alerta";
import { useIsMobile } from "../ui/useMediaQuery";
import { travarRolagem } from "../ui/travaRolagem";
import { atributosDe } from "../ui/campos";
import { HIERARQUIA_DEFS, hierarquiaLabel, ehBase, filhosPermitidos, isHierarquia, podeCompor } from "@/lib/estoque-hierarquia";
import { donoDoSku, maiorSequencial, normalizarSku, skuInvalido, sugerirSku } from "@/lib/estoque-sku";
import { consumoPorPeca, rendimentoDe } from "@/lib/estoque-rendimento";
import { planoDeEtiquetas } from "@/lib/estoque-plano-de-etiquetas";
import { fraseDoTempo, tempoEstimadoMin } from "@/lib/estoque-receita-de-producao";
import { QUEM_FAZ, AJUDA_AUTOMATICO, faixaDoSetorResponsavel } from "@/lib/atividade-faixa";
import { salvarEmSegundoPlano } from "../ui/salvarEmSegundoPlano";
import { PREFIXO_SKU } from "@/lib/estoque-unidades";
import { UNIDADE_PADRAO, normalizarUnidade, opcoesUnidade } from "@/lib/estoque-unidade-compra";
import {
  etiquetasDeProduto, problemaDaEtiquetaDeProduto, MAX_COPIAS_DE_PRODUTO,
  type ItemParaEtiqueta,
} from "@/lib/estoque-etiqueta-de-produto";
import { FolhaDeEtiquetas } from "./Etiqueta";
import { UnidadesDoItem } from "./UnidadesDoItem";
import { useTrazerPraVista } from "./painel-visivel";
import type { Item, FichaLinha } from "./tipos";

const SETORES_REQ = ["Logística", "Produção", "Máquinas"];

/** O pedaço do catálogo que o editor usa: seletor de componente + SKU já usado. */
type ItemLeve = { id: string; nome: string; hierarquia: string | null; sku?: string | null };

export function ItemEditor({ item, hierarquiaInit, podeVerCusto, podeAjustar = true, itens, onClose, onSaved, onAtualizado, classe = "" }: {
  /** Classe do ciclo de abertura da receita de modal (`useAbrirFechar`).
   *  OPCIONAL de propósito: este componente tem vários chamadores — provas
   *  `/dev-*` e testes montam ele direto. Sem valor, o modal se comporta
   *  como antes (entra pelo `.apple-modal`, sai por desmonte). */
  classe?: string;
  item?: Item;
  hierarquiaInit?: string;
  podeVerCusto?: boolean;
  /** `estoque:ajustar`. Este editor só abre pra quem pode CADASTRAR — mexer no
   *  saldo é a outra permissão, e nem sempre vem junto. Sem ela o campo Qtd
   *  fica travado e o "Gerar etiquetas" some (gerar etiqueta é somar unidade).
   *  Padrão `true` pelas provas de `/dev-*`, que montam a tela sem servidor. */
  podeAjustar?: boolean;
  /** Catálogo que a tela de fora JÁ tem em memória. Sem isto o editor rebaixa
   *  os 192 itens inteiros a cada abertura — 80 downloads do catálogo numa
   *  sessão de configuração, contra uma base que já derrubou o projeto duas
   *  vezes por consumo. */
  itens?: ItemLeve[];
  onClose: () => void;
  /** Terminou: fecha o modal (e a lista de fora recarrega). */
  /**
   * Avisa que gravou — e ONDE. A hierarquia viaja porque a tela de trás mostra
   * UMA por vez: quem abre o modal pela aba "Matéria-Prima", troca pra
   * "Processada" lá dentro e salva, some com o item pra aba do lado sem uma
   * palavra. Dois itens do dono nasceram assim, e ele concluiu que o cadastro
   * não funcionava. A importação já entrega essa informação (ela zera a aba e
   * os filtros ao terminar); o cadastro manual é que estava mudo.
   *
   * Opcional pra não obrigar quem só quer fechar: as provas e o cartão de
   * edição continuam passando `() => …`.
   */
  onSaved: (criado?: { id: string; hierarquia: string; nome: string }) => void;
  /** Mudou algo, mas o modal CONTINUA aberto — a lista de fora recarrega.
   *  É o que evita o vaivém de "salvar fecha, reabrir pra gerar etiqueta". */
  onAtualizado?: () => void;
}) {
  const [nome, setNome] = useState(item?.nome ?? "");
  // ── Item sem hierarquia abre SEM hierarquia ────────────────────────────────
  // Antes o estado nascia em `?? "materia_prima"`: abrir um item não
  // classificado pintava Matéria-Prima como se alguém tivesse escolhido, o SKU
  // sugerido saía "MP-0007" e o primeiro Salvar gravava a mentira. Vazio é a
  // verdade, e a tela pede a escolha em vez de inventá-la.
  const [hierarquia, setHierarquia] = useState(
    isHierarquia(item?.hierarquia) ? String(item?.hierarquia) : item ? "" : hierarquiaInit ?? "",
  );
  const [produzido, setProduzido] = useState(item?.produzido ?? false);
  /**
   * Como o item é etiquetado. `false` = código fixo do produto (todas as peças
   * com o mesmo código); `true` = número de série por peça.
   *
   * PRODUTO NASCE COM CÓDIGO FIXO, e não é acaso do `?? false`: é a decisão do
   * dono ("por padrão todos os produtos vão por código fixo"). Vinte almofadas
   * iguais não precisam ser distinguidas uma da outra — precisam ser
   * reconhecidas no leitor. Série é pra caixa lacrada, onde importa QUAL saiu.
   *
   * Item que JÁ EXISTE mantém o que está gravado, sempre: mudar isso por baixo
   * de um item com etiqueta viva zeraria a contagem dele (a guarda do banco
   * recusa, mas a tela não deve nem propor).
   */
  const [serializado, setSerializado] = useState(item?.serializado ?? false);
  const [categoria, setCategoria] = useState(item?.categoria ?? "");
  const [sku, setSku] = useState(item?.sku ?? "");
  /** A câmera do próprio site, para a foto do item. Ver `CameraFoto`. */
  const [camera, setCamera] = useState(false);
  /** O leitor de código, para o SKU vir do papel em vez do teclado. */
  const [lendoCodigo, setLendoCodigo] = useState(false);
  const [estoqueIdeal, setEstoqueIdeal] = useState(item?.estoque_ideal != null ? String(item.estoque_ideal) : "");
  const [requisitavel, setRequisitavel] = useState(item?.requisitavel ?? false);
  const [setorReq, setSetorReq] = useState(item?.setor_requisicao ?? "Produção");
  const [custo, setCusto] = useState(item?.custo != null ? String(item.custo) : "");
  // Unidade de COMPRA, do vocabulário único (lib/estoque-unidade-compra.ts).
  // Era `<input>` de texto puro: "UNIDADE" da planilha, "un" do Recebimento e
  // "Un." de quem digitou com ponto viravam três unidades diferentes pro banco.
  const [unidade, setUnidade] = useState(normalizarUnidade(item?.unidade) || UNIDADE_PADRAO);
  const [quantidade, setQuantidade] = useState(String(item?.quantidade ?? 0));
  const [qtdMinima, setQtdMinima] = useState(String(item?.qtd_minima ?? 0));
  const [imagemUrl, setImagemUrl] = useState(item?.imagem_url ?? "");
  const [fornecedorId, setFornecedorId] = useState(item?.fornecedor_id ?? "");
  const [localId, setLocalId] = useState(item?.local_id ?? "");
  const [largura, setLargura] = useState(item?.largura_mm != null ? String(item.largura_mm) : "");
  const [altura, setAltura] = useState(item?.altura_mm != null ? String(item.altura_mm) : "");
  const [espessura, setEspessura] = useState(item?.espessura_mm != null ? String(item.espessura_mm) : "");
  const [dimUnidade, setDimUnidade] = useState(item?.dim_unidade ?? "mm");
  const [cor, setCor] = useState(item?.cor ?? "");
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [locais, setLocais] = useState<{ id: string; nome: string; codigo: string }[]>([]);
  // Quem pode CRIAR fornecedor/lugar (as duas rotas devolvem isso e o editor
  // jogava fora). Sem esse dado, ou o botão de cadastrar na hora não existe, ou
  // ele existe pra quem vai levar 403 na cara.
  const [podeCriarFornecedor, setPodeCriarFornecedor] = useState(false);
  const [podeCriarLocal, setPodeCriarLocal] = useState(false);
  const [ficha, setFicha] = useState<FichaLinha[]>([]);
  // A ficha só volta pro servidor depois de LIDA. Salvar antes de o GET chegar
  // mandava a lista vazia do estado inicial — e o PUT substitui a ficha
  // inteira: um Salvar rápido apagava do que o item é feito. Item novo não
  // tem o que ler, então nasce lida.
  const [fichaLida, setFichaLida] = useState(!item?.id);
  // O número que o BANCO tinha quando esta tela abriu (e depois de cada save
  // que esperou a resposta). É a trava `quantidade_antes` do PATCH.
  const qtdSalva = useRef(Number(item?.quantidade ?? 0));
  const [catalogoBaixado, setCatalogoBaixado] = useState<ItemLeve[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerBusca, setPickerBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  // ── O erro de etiquetar mora COLADO no botão de etiquetar ──────────────────
  // Ele não pode dividir o `erro` geral: o `erro` geral é desenhado no pé do
  // modal, junto do Salvar, e o botão "Etiquetar N unidades" fica no primeiro
  // terço. Medido a 320px, a frase de falha dele nascia 1218px abaixo da dobra
  // — a tela não mudava nada. Trazer a pessoa pro pé também não serve: ela
  // perderia o lugar por causa de um botão que está lá em cima.
  const [erroEtiquetar, setErroEtiquetar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  // ── Estado do BANCO, separado do estado da tela ────────────────────────────
  // A caixinha marcada não significa que o banco já ligou a etiqueta: o bloco
  // de gerar depende do que está GRAVADO, senão o botão aparece na hora e a
  // API responde "este item não está marcado como etiquetado" com a caixinha
  // visivelmente marcada logo acima.
  const [serializadoNoBanco, setSerializadoNoBanco] = useState(item?.serializado ?? false);
  const [qtdBanco, setQtdBanco] = useState(Math.max(0, Math.trunc(item?.quantidade ?? 0)));
  const [idCriado, setIdCriado] = useState<string | null>(null);
  // ── De onde veio o SKU que está no campo ───────────────────────────────────
  // Antes isto era um `skuTocado` booleano, e ele misturava duas coisas muito
  // diferentes: "a pessoa digitou o SKU dela" e "a pessoa aceitou a sugestão".
  // Como clicar em "Sugerir MP-0001" também ligava o booleano, trocar a
  // hierarquia depois disso não mexia mais em nada — foi assim que "MDF 6mm
  // pintado" (mp_processada) ficou gravado com prefixo MP- em vez de MPP-.
  //
  //   "auto"    — ninguém encostou: acompanha o primeiro candidato livre.
  //   "aceito"  — clicou num candidato: continua acompanhando, pela MESMA
  //               origem (quem aceitou o padrão do sistema recebe o padrão do
  //               sistema da hierarquia nova, não a família).
  //   "proprio" — digitou o dela, ou já veio gravada do banco: NUNCA é mexida.
  //               Item que já existe entra aqui porque o SKU dele já pode estar
  //               impresso em papel colado na prateleira.
  // "auto" = o campo segue o próximo número da sequência; "proprio" = a pessoa
  // digitou (ou o servidor devolveu) um SKU e a tela para de mexer nele.
  const [skuModo, setSkuModo] = useState<"auto" | "proprio">(item?.sku ? "proprio" : "auto");
  /**
   * Como cada linha da ficha é DITA: "consome" (quanto entra numa peça) ou
   * "rende" (quantas peças saem de um). É preferência de leitura por linha, não
   * dado — as duas gravam a mesma coluna. Por isso vive só na tela.
   */
  const [modoFicha, setModoFicha] = useState<Record<string, "consome" | "rende">>({});
  /** Tamanho da caixa ao ligar a etiqueta num item que já tem estoque contado. */
  const [caixaPreparo, setCaixaPreparo] = useState("1");
  // ── A receita da atividade de reposição ──────────────────────────────────
  // O que a atividade automática ("Produzir X") vai DIZER e quanto tempo vai
  // estimar. Mora no item porque toda reposição repete a mesma instrução.
  const [producaoInstrucao, setProducaoInstrucao] = useState(item?.producao_instrucao ?? "");
  const [producaoTempoMin, setProducaoTempoMin] = useState(item?.producao_tempo_min != null ? String(item.producao_tempo_min) : "");
  const [producaoLoteDe, setProducaoLoteDe] = useState(item?.producao_lote_de != null ? String(item.producao_lote_de) : "");
  // ONDE a atividade cai: manual = tablet (o de sempre); maquina = fila do
  // painel de máquinas. E qual máquina — vazio = a mais livre.
  const [producaoTipo, setProducaoTipo] = useState<"manual" | "maquina">(item?.producao_tipo === "maquina" ? "maquina" : "manual");
  const [producaoMaquinaId, setProducaoMaquinaId] = useState(item?.producao_maquina_id ?? "");
  // QUEM FAZ (faixa da ordem) e SE repõe sozinho. Os dois campos existiam no
  // banco e não tinham tela: a faixa era adivinhada pela categoria — e mandou
  // "Bolinha Puxador" pro montador, sendo trabalho de máquina — e o
  // interruptor por item só dava pra ligar por fora do sistema.
  const [setorResponsavel, setSetorResponsavel] = useState(item?.setor_responsavel ?? "");
  const [reporSozinho, setReporSozinho] = useState(item?.producao_automatica === true);
  const [maquinas, setMaquinas] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => {
    // A lista de máquinas só interessa quando o destino é máquina — e vem da
    // rota PÚBLICA da TV (nome e id, nada além), então quem cadastra estoque
    // não precisa do módulo Produção pra escolher.
    if (producaoTipo !== "maquina" || maquinas.length) return;
    let vivo = true;
    fetch("/api/maquinas/painel").then((r) => r.json()).then((d) => {
      if (!vivo || !Array.isArray(d?.maquinas)) return;
      setMaquinas(d.maquinas.map((m: { id: string; nome: string }) => ({ id: m.id, nome: m.nome })));
    }).catch(() => {});
    return () => { vivo = false; };
  }, [producaoTipo, maquinas.length]);
  const [unidadesEmEstoque, setUnidadesEmEstoque] = useState<number | null>(null);
  const [ligando, setLigando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const celular = useIsMobile();
  // O erro nasce no PÉ do modal, e quem o dispara nem sempre está lá: o botão
  // "Etiquetar N unidades" fica no primeiro terço, e a 320px a frase de falha
  // aparecia 1218px abaixo da dobra — a tela não mudava nada.
  const refErro = useTrazerPraVista<HTMLParagraphElement>(erro);
  // O erro de etiquetar já nasce colado no botão, mas o botão pode estar
  // encostado na borda de baixo do modal — medido, a frase caía 12px fora.
  const refErroEtiquetar = useTrazerPraVista<HTMLParagraphElement>(erroEtiquetar);
  const idAtual = item?.id ?? idCriado;
  const catalogo: ItemLeve[] = itens ?? catalogoBaixado;
  /** Ainda sem hierarquia: item vindo de carga, ou item novo aberto pela aba
   *  dos não classificados. Item novo não pode ser salvo assim (a API exige a
   *  hierarquia); item que já existe pode — a pessoa talvez esteja só
   *  corrigindo a quantidade, e travar o Salvar por causa de outro campo é
   *  como o cadastro fica pela metade. */
  const semHier = !isHierarquia(hierarquia);

  useEffect(() => { setMounted(true); }, []);
  // ── O fundo não pode rolar debaixo do modal ────────────────────────────────
  // Medido no catálogo (3922px de altura a 320px): com o editor ABERTO a página
  // atrás continuava rolando 1400px. O `overscroll-behavior: contain` do
  // `.apple-modal` só impede o encadeamento de DENTRO pra fora — o gesto que
  // começa no véu (os 19px de margem no celular, a área toda no computador) ia
  // direto pro documento. Quem abre um item lá embaixo e mexe na borda fecha o
  // modal noutro lugar da lista.
  //
  // `travarRolagem()` e não `body.style.overflow` na mão: a trava é CONTADA, e
  // este modal abre por cima de painel lateral (que também trava). Salvar e
  // restaurar por conta própria é o que já travou a página inteira aqui uma vez
  // — o React desmonta o pai antes do filho.
  //
  // Efeito PRÓPRIO, com `[]`: junto do Escape ele dependeria de `onClose`, que
  // muda a cada render de quem abriu — soltaria e repediria a trava sem parar.
  useEffect(() => travarRolagem(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Catálogo (seletor de componentes + SKUs já usados): só baixa quando quem
  // abriu o editor não o entregou. Ver a prop `itens`.
  useEffect(() => {
    if (itens) return;
    fetch("/api/estoque-itens").then((r) => r.json()).then((d) => setCatalogoBaixado(d.itens ?? [])).catch(() => {});
  }, [itens]);

  // Ficha técnica do item.
  // Falhou a leitura: a tela DIZ, esconde a edição e oferece tentar de novo.
  // O `.catch` mudo deixava a ficha "vazia" — e salvar apagava a de verdade.
  const [fichaErro, setFichaErro] = useState(false);
  const [fichaTentativa, setFichaTentativa] = useState(0);
  useEffect(() => {
    if (!item?.id) return;
    let vivo = true;
    setFichaErro(false);
    fetch(`/api/ficha-tecnica?item=${item.id}`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((d) => {
        if (!vivo) return;
        setFicha((d.ficha ?? []).map((l: FichaLinha) => ({ componente_id: l.componente_id, quantidade: l.quantidade, desconta: l.desconta === true, nome: l.nome })));
        setFichaLida(true);
      })
      .catch(() => { if (vivo) setFichaErro(true); });
    return () => { vivo = false; };
  }, [item?.id, fichaTentativa]);

  // ── SKU: sugerido, nunca inventado ─────────────────────────────────────────
  // O campo nascia vazio com um "ex: CRB10" e nada explicando que ele vira o
  // prefixo permanente da etiqueta física. O resultado está no banco: SKUs de
  // tecla amassada ("iJIFYU7", "A548DWW8T") colados em prateleira. Aqui a
  // sugestão chega pronta, editável, e só encosta em quem ainda não tem SKU.
  const skusEmUso = useMemo(
    () => catalogo.filter((c) => c.id !== idAtual).map((c) => c.sku ?? null),
    [catalogo, idAtual],
  );
  const skuSugerido = useMemo(() => sugerirSku(hierarquia, skusEmUso), [hierarquia, skusEmUso]);
  // ── O campo NASCE preenchido com o próximo número ─────────────────────────
  // Não é sugestão pra escolher: é a sequência do catálogo continuando. Último
  // PRD-0246 → este item PRD-0247. Antes eram chips ("Padrão do sistema",
  // "Iniciais do nome") que pediam uma decisão sobre uma coisa que não tem
  // decisão nenhuma — e cada convenção nova que alguém escolhia era mais uma
  // família de SKU convivendo no mesmo catálogo.
  //
  // Editável de propósito: item que já tem SKU próprio ("CRB16") continua
  // valendo, e digitar no campo desliga o automático (`skuModo` = "proprio")
  // pra tela não sobrescrever o que a pessoa acabou de escrever.
  useEffect(() => {
    if (skuModo !== "auto") return;
    if (skuSugerido) setSku(skuSugerido);
  }, [skuSugerido, skuModo]);

  /** Maior SKU já usado — o "último" que a frase do campo mostra. */
  const ultimoSku = useMemo(() => {
    const n = maiorSequencial(skusEmUso);
    return n > 0 ? `${PREFIXO_SKU}-${String(n).padStart(4, "0")}` : null;
  }, [skusEmUso]);

  const skuProblema = useMemo(() => {
    const s = normalizarSku(sku);
    if (!s) return null;
    const formato = skuInvalido(s);
    if (formato) return formato;
    const dono = donoDoSku(catalogo, s, idAtual);
    return dono ? `Já é o SKU de "${dono.nome}" — dois itens não podem dividir o mesmo.` : null;
  }, [sku, catalogo, idAtual]);

  // Quem ESCOLHEU número de série num item que já tem estoque contado: é o caso
  // que a guarda do banco recusa (ligar sozinho zeraria a contagem). A tela
  // troca a caixinha pelo caminho que funciona em vez de deixar bater e
  // traduzir o erro depois.
  //
  // `serializado` na condição é o conserto: sem ele, QUALQUER item salvo com
  // quantidade e sem etiqueta caía aqui — e este bloco SUBSTITUI a escolha
  // "Como etiquetar este item". Resultado medido na tela: um item de 600 sacos
  // de envio, que existe justamente pra ser contado aos montes, abria propondo
  // "Etiquetar 600 unidades" (PRD-0198-000001 a -000600) sem oferecer a opção
  // de código fixo. Nem todo item leva etiqueta na peça: quase sempre ela vai
  // na CAIXA que chegou, e o estoque continua sendo o número comprado.
  const precisaEtiquetarAntes = !!idAtual && serializado && !serializadoNoBanco && qtdBanco > 0 && (unidadesEmEstoque ?? 0) === 0;
  const skuParaEtiqueta = skuProblema ? null : (normalizarSku(sku) || skuSugerido);

  // ── Etiqueta impressa é papel, e papel não se atualiza ─────────────────────
  // O código de cada unidade é `<SKU>-<seq6>`. Se já existem unidades, o SKU
  // atual está colado em alguma chapa na prateleira: trocar aqui não reimprime
  // nada — só faz o bipe deixar de achar o item. Avisar ANTES, não proibir: às
  // vezes a troca é justamente pra corrigir o cadastro, e quem decide é quem
  // vai reimprimir.
  const etiquetasVivas = unidadesEmEstoque ?? 0;
  const skuGravado = normalizarSku(item?.sku);
  const skuTrocado = !!skuGravado && normalizarSku(sku) !== skuGravado;

  // `.catch` vazio de propósito: estas rotas chegam num plano seguinte. Antes
  // disso o seletor nasce vazio e o editor abre normalmente — quebrar o cadastro
  // inteiro porque um seletor opcional não tem fonte seria pior que o vazio.
  useEffect(() => {
    fetch("/api/estoque/fornecedores").then((r) => r.json())
      .then((d) => { setFornecedores(d.fornecedores ?? []); setPodeCriarFornecedor(!!d.podeGerir); }).catch(() => {});
    fetch("/api/estoque/locais").then((r) => r.json())
      .then((d) => { setLocais(d.locais ?? []); setPodeCriarLocal(!!d.podeGerir); }).catch(() => {});
  }, []);

  /**
   * Sobe a imagem, venha ela de onde vier.
   *
   * Um caminho só para os dois botões: o arquivo escolhido no computador e o
   * quadro que a câmera acabou de capturar chegam aqui como o mesmo `File`.
   * Duplicar o envio seria duplicar também o tratamento de falha — e é sempre
   * a segunda cópia que fica sem ele.
   */
  async function subirImagem(f: File) {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append("file", f); fd.append("bucket", "photos");
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await r.json(); if (d.url) setImagemUrl(d.url);
    } finally { setBusy(false); }
  }

  async function foto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    await subirImagem(f);
    // Limpa o input: escolher O MESMO arquivo duas vezes seguidas (depois de
    // um envio que falhou) não dispara `change` se o valor continua lá.
    e.target.value = "";
  }
  async function salvar() {
    if (!nome.trim() || skuProblema) return;
    // Item NOVO sem hierarquia a API recusa (400 hierarquia_invalida). Dizer
    // aqui é mais honesto que mandar pro servidor pra receber a mesma frase.
    if (!idAtual && semHier) { setErro("Escolha a hierarquia — é ela que diz do que o item é feito."); return; }
    setBusy(true); setErro(null);
    const body: Record<string, unknown> = {
      id: idAtual, nome, hierarquia, produzido, serializado,
      // `normalizarSku` e não `sku` cru: o banco tem "iJIFYU7" gravado em
      // minúscula porque a caixa só era corrigida na validação, nunca no que
      // ia pro servidor — e o código da etiqueta sai desse texto.
      categoria, sku: normalizarSku(sku) || null,
      estoque_ideal: estoqueIdeal === "" ? null : Number(estoqueIdeal) || 0,
      requisitavel, setor_requisicao: requisitavel ? setorReq : null,
      unidade,
      // Item serializado não manda quantidade: quem manda é o gatilho do banco,
      // contando as etiquetas. Mandar aqui seria sobrescrever a contagem por um
      // valor de tela — e o banco agora recusa isso com erro.
      // Quantidade SÓ quando mudou, e com a trava `quantidade_antes` (a rota só
      // grava se o banco ainda estiver no número que esta tela leu). Mandar
      // sempre fazia duas coisas ruins: rodava a varredura de reposição a cada
      // salvar — era a demora — e gravava por cima de uma baixa bipada
      // enquanto o modal estava aberto. Item novo manda o que foi digitado.
      ...(serializado ? {}
        : !idAtual ? { quantidade: Number(quantidade) || 0 }
        : (Number(quantidade) || 0) !== qtdSalva.current
          ? { quantidade: Number(quantidade) || 0, quantidade_antes: qtdSalva.current }
          : {}),
      qtd_minima: Number(qtdMinima) || 0,
      // A receita só viaja quando EXISTE (agora ou antes): mandar os campos
      // vazios num banco onde supabase/estoque_producao_receita.sql ainda não
      // rodou faria TODO save falhar com 42703 — inclusive o de quem nem
      // tocou nestes campos.
      ...(producaoInstrucao.trim() || producaoTempoMin !== "" || producaoLoteDe !== ""
        || producaoTipo !== "manual" || item?.producao_tipo === "maquina"
        || item?.producao_instrucao != null || item?.producao_tempo_min != null || item?.producao_lote_de != null
        ? {
            producao_instrucao: producaoInstrucao,
            producao_tempo_min: producaoTempoMin === "" ? null : Number(producaoTempoMin),
            producao_lote_de: producaoLoteDe === "" ? null : Number(producaoLoteDe),
            producao_tipo: producaoTipo,
            producao_maquina_id: producaoMaquinaId || null,
          }
        : {}),
      setor_responsavel: setorResponsavel || null,
      producao_automatica: reporSozinho,
      imagem_url: imagemUrl || null,
      fornecedor_id: fornecedorId || null,
      local_id: localId || null,
      largura_mm: largura === "" ? null : Number(largura),
      altura_mm: altura === "" ? null : Number(altura),
      espessura_mm: espessura === "" ? null : Number(espessura),
      dim_unidade: dimUnidade,
      cor: cor || null,
    };
    if (podeVerCusto) body.custo = custo === "" ? 0 : Number(custo) || 0;
    const linhasDaFicha = () => ficha.filter((l) => l.componente_id)
      .map((l) => ({ componente_id: l.componente_id, quantidade: l.quantidade, desconta: l.desconta === true }));

    // ── Item que já existe: salva em SEGUNDO PLANO ──────────────────────────
    // A tela fecha na hora e diz "Salvo"; o pedido segue pela fila de
    // ui/salvarEmSegundoPlano.ts — guardado no navegador, tenta de novo
    // sozinho, avisa se o servidor recusar. Esperam a resposta só os dois
    // casos em que a tela seguinte depende dela: item NOVO (precisa do id) e
    // ligar a etiqueta agora (o modal fica aberto pra gerar as etiquetas).
    if (idAtual && !(serializado && !serializadoNoBanco)) {
      const rotulo = `"${nome.trim()}"`;
      // A lista de fora recarrega quando o servidor CONFIRMA — recarregar na
      // hora mostraria o número velho, e "salvou e não mostra" é pior que
      // esperar meio segundo.
      const recarregar = () => (onAtualizado ?? (() => onSaved({ id: idAtual, hierarquia, nome })))();
      const comFicha = !semHier && produzido && fichaLida;
      salvarEmSegundoPlano(
        { chave: `estoque-item:${idAtual}`, rotulo, url: "/api/estoque-itens", method: "PATCH", body },
        { aoTerminar: (ok) => { if (ok && !comFicha) recarregar(); } },
      );
      if (comFicha) {
        salvarEmSegundoPlano(
          { chave: `estoque-ficha:${idAtual}`, rotulo: `a ficha técnica de ${rotulo}`, url: "/api/ficha-tecnica", method: "PUT",
            body: { item_id: idAtual, linhas: linhasDaFicha() } },
          { aoTerminar: () => recarregar() },
        );
      }
      toast.ok("Salvo.");
      if (!semHier && produzido && fichaErro) toast.info("A ficha técnica não carregou, então não foi regravada — a composição gravada continua como estava.");
      onClose();
      return;
    }

    const r = await fetch("/api/estoque-itens", { method: idAtual ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    // ── A resposta é LIDA ──────────────────────────────────────────────────
    // Antes, `r` só era aberto pra pegar o `id` de um item novo: qualquer
    // falha (403 de permissão, 409 de schema, 409 da guarda do banco, sessão
    // expirada) caía direto no `onSaved()` — o modal fechava, a lista
    // recarregava e a pessoa acreditava que gravou. Em item novo isso apagava
    // o formulário inteiro sem uma palavra. É o mesmo padrão que já custou
    // caro aqui ("sessão expirada virava salvo").
    const resposta = await r.json().catch(() => ({} as Record<string, unknown>));
    if (!r.ok) {
      setErro(String(resposta.detalhe ?? resposta.detail ?? "Não foi possível salvar. Tente de novo."));
      setBusy(false);
      return;
    }
    // Salva a ficha técnica (componentes que este item usa).
    let itemId = idAtual ?? (resposta as { item?: { id?: string } }).item?.id;
    // Só grava a ficha quando o bloco dela está VISÍVEL. Quem troca o item pra
    // uma hierarquia base, ou desliga "produzido", não está editando ficha
    // nenhuma — mandar a antiga assim mesmo faria a API recusar e a tela acusar
    // "X não pode entrar em Matéria-Prima" por uma coisa que a pessoa nem viu.
    // Não mandar também não apaga o que já existe: se ela religar o interruptor,
    // a ficha volta inteira em vez de ter sumido pelas costas.
    // `!semHier` junto: sem hierarquia NENHUM filho é permitido (a matriz de
    // composição não conhece o estado nulo), então mandar a ficha devolveria
    // "X não pode entrar em —" pra uma pessoa que nem viu o bloco — ele está
    // escondido enquanto o item não tem hierarquia.
    if (itemId && !semHier && produzido && fichaLida) {
      const rf = await fetch("/api/ficha-tecnica", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, linhas: linhasDaFicha() }) });
      if (!rf.ok) {
        const d = await rf.json().catch(() => ({}));
        // O item FOI salvo; só a ficha não. Dizer isso é o que evita a pessoa
        // preencher tudo de novo achando que perdeu o cadastro.
        // As duas recusas pedem ações OPOSTAS: "não pode entrar" se resolve
        // trocando o componente; ciclo se resolve tirando a linha (ou a de lá).
        // Uma frase só pras duas mandava a pessoa procurar a regra errada.
        setErro(!d.detalhe?.length
          ? "Item salvo, mas a ficha técnica foi recusada."
          : d.error === "composicao_ciclica"
            ? `Item salvo, mas a ficha não: ${d.detalhe.join(", ")} já é feito deste item — um dentro do outro fecha um ciclo.`
            : `Item salvo, mas a ficha não: ${d.detalhe.join(", ")} não pode entrar em ${hierarquiaLabel(hierarquia)}.`);
        if (itemId && !idAtual) setIdCriado(itemId);
        setBusy(false);
        return;
      }
    }
    if (itemId && !idAtual) setIdCriado(itemId);
    setBusy(false);
    // ── Ligou a etiqueta agora: o modal NÃO fecha ──────────────────────────
    // Fechar aqui é o que fazia cada item custar dois ciclos de modal — salvar
    // pra ligar, reabrir pra gerar. O bloco de etiquetas aparece logo abaixo,
    // já com o botão de gerar.
    if (itemId && serializado && !serializadoNoBanco) {
      setSerializadoNoBanco(true);
      setQtdBanco(0); // item recém-serializado nasce em zero: a conta vem das etiquetas
      onAtualizado?.();
      toast.ok("Salvo. Agora gere as etiquetas deste item.");
      return;
    }
    if (!serializado) {
      setQtdBanco(Math.max(0, Math.trunc(Number(quantidade) || 0)));
      qtdSalva.current = Number(quantidade) || 0;
    }
    // ── Salvar tem que ter VOZ, e dizer onde o item foi parar ─────────────────
    // O caminho comum terminava num `onSaved()` seco: o modal fechava, a lista
    // atrás não mudava (o item nasceu noutra aba) e nada distinguia isso de uma
    // falha. Nomear a hierarquia na frase é o que ensina o modelo mental da
    // tela — "Salvo." sozinho não resolve o caso do filtro ligado.
    if (!idAtual) toast.ok(`"${nome}" cadastrado em ${hierarquiaLabel(hierarquia)}.`);
    onSaved(itemId ? { id: itemId, hierarquia, nome } : undefined);
  }

  // O plano da destrava, com a MESMA conta que o servidor refaz — a tela nunca
  // promete um número de etiquetas que a gravação não vai cumprir.
  const caixaDoPreparo = Math.max(1, Math.trunc(Number(caixaPreparo)) || 1);
  const planoPreparo = planoDeEtiquetas(qtdBanco, caixaDoPreparo);

  // ── Destrava o item que já tem estoque contado ─────────────────────────────
  // O banco recusa ligar a etiqueta num item com quantidade digitada e nenhuma
  // etiqueta (zeraria a contagem sem volta), e recusa gerar etiqueta pra item
  // que não é etiquetado. Quem faz os dois na ordem certa é o servidor —
  // /api/estoque/unidades/preparar.
  async function etiquetarAgora() {
    if (!idAtual || ligando) return;
    setLigando(true); setErroEtiquetar(null);
    try {
      const r = await fetch("/api/estoque/unidades/preparar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens: [{ item_id: idAtual, quantidade: qtdBanco }], pecasPorEtiqueta: caixaDoPreparo }),
      });
      const d = await r.json().catch(() => ({}));
      const res = d.resultados?.[0];
      if (!r.ok || !res?.ok) {
        setErroEtiquetar(res?.erro ?? d.detalhe ?? "Não foi possível etiquetar este item.");
        return;
      }
      setSerializado(true);
      setSerializadoNoBanco(true);
      // "proprio": este SKU acabou de virar o começo do código das etiquetas
      // que o servidor gerou. Deixar o gerador reescrevê-lo numa troca de
      // hierarquia seria descolar o cadastro do papel já impresso.
      if (res.sku) { setSku(res.sku); setSkuModo("proprio"); }
      toast.ok(`${res.geradas} etiqueta${res.geradas === 1 ? "" : "s"} gerada${res.geradas === 1 ? "" : "s"}.`);
      onAtualizado?.();
    } catch {
      setErroEtiquetar("Não foi possível etiquetar este item.");
    } finally {
      setLigando(false);
    }
  }
  async function remover() {
    if (!item || !(await confirmar(`Remover "${item.nome}"?`, { perigo: true }))) return;
    const r = await fetch(`/api/estoque-itens?id=${item.id}`, { method: "DELETE" });
    // Item com etiqueta gerada não sai: a referência é `on delete restrict` de
    // propósito (apagar levaria junto o rastro de baixa de cada unidade). Sem
    // ler a resposta, o modal fechava e o item continuava lá.
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(String(d.detalhe ?? d.detail ?? "Não foi possível remover. Se o item já tem etiquetas, desative-o em vez de apagar."));
      return;
    }
    onSaved();
  }

  const inp: React.CSSProperties = { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 12px", color: "var(--text)", fontSize: 14 };
  // Glifos "−/+" viraram <Icon>: além da regra de iconografia, um botão cujo único
  // filho é um svg já ganha 44x44 da fundação no celular — 28x30 era alvo de mouse.
  const stepBtn: React.CSSProperties = { width: 28, height: 30, borderRadius: "var(--r-xs)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", flex: "none", display: "grid", placeItems: "center", padding: 0 };

  if (!mounted) return null;
  // Portal p/ document.body — escapa ancestral com transform/blur (globals.css),
  // senão o position:fixed do .apple-backdrop fica preso e o modal some da tela.
  return createPortal(
    <div className={`apple-backdrop sheet-host ${classe}`.trim()} onClick={onClose}>
      {/* padding em clamp: 22px do modal de 460px pra cima (desktop intacto) e 14px
          na folha do celular — 44px fixos eram 15% da tela de 320px. */}
      {/* ── `t-modal` SÓ quando existe quem acenda ────────────────────────────
          A receita é um par: `.t-modal` nasce em `opacity: 0; pointer-events:
          none` e quem a acende é `.is-open`, que vem do `useAbrirFechar` do
          chamador. E `.apple-modal.t-modal { animation: none }` desliga o plano
          B de propósito (com `fill: both` a animação venceria a transição de
          saída no cascade).

          Somadas, as três regras têm uma consequência que a prop opcional
          escondia: chamador que não passa `classe` monta um modal invisível E
          intocável — véu embaçando a tela e nada acontecendo. Foi o que
          aconteceu no "Cadastrar item", e o comentário da prop ainda prometia
          que sem valor "o modal se comporta como antes".

          Agora a classe da receita só entra acompanhada. Sem ela, o modal volta
          mesmo ao comportamento antigo: aparece pela animação do `.apple-modal`
          e sai por desmonte. As provas `/dev-*` e os testes, que montam este
          componente direto, dependem disso. */}
      <div className={`apple-modal glass glass-spec sheet ${classe ? `t-modal ${classe}` : ""}`.trim()} onClick={(e) => e.stopPropagation()} style={{ width: "min(720px,100%)", maxHeight: "90dvh", overflowY: "auto", borderRadius: "var(--r-lg)", padding: "clamp(14px, 3.5vw, 22px)" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>{item ? "Editar item" : semHier ? "Novo item" : `Novo: ${hierarquiaLabel(hierarquia)}`}</h2>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ marginLeft: "auto", flex: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
          <div onClick={() => fileRef.current?.click()} style={{ width: 90, height: 90, borderRadius: "var(--r-md)", background: "var(--surface)", display: "grid", placeItems: "center", cursor: "pointer", overflow: "hidden", flex: "none", border: "1px solid var(--border)" }}>
            {imagemUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={imagemUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <Icon name="box" size={28} color="var(--text-dim)" />}
          </div>
          <div style={{ flex: 1 }}>
            <input {...atributosDe("nome")} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do produto" style={inp} />
            {/* "pra que serve" no lugar do antigo "Categoria" seco: é o que
                separa este campo da hierarquia logo abaixo. Sem a distinção,
                quem cadastra escreve "Peça" na categoria e acha que classificou. */}
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Categoria — pra que serve (ex.: Máquinas)" style={{ ...inp, marginTop: 8 }} />
            {/* DOIS caminhos para a foto, e os dois precisam existir.
                "Tirar foto" abre a câmera da própria máquina — é o que o
                computador da bancada não fazia, porque ali o seletor de
                arquivos abre a pasta, não a câmera, e o item acabava entrando
                sem foto. "Enviar arquivo" serve a quem já fotografou antes. */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
              <Botao variante="sutil" tamanho="sm" icone="camera" onClick={() => setCamera(true)} disabled={busy}>
                {busy ? "enviando…" : imagemUrl ? "tirar outra foto" : "tirar foto"}
              </Botao>
              <Botao variante="sutil" tamanho="sm" icone="upload" onClick={() => fileRef.current?.click()} disabled={busy}>
                enviar arquivo
              </Botao>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={foto} style={{ display: "none" }} />
          </div>
        </div>
        {/* `Grupo`, não `Field`: são botões, e <label> dispara o primeiro deles. */}
        <Grupo label="Hierarquia — do que é feito">
          {/* ── Sem hierarquia, dito em voz alta ──────────────────────────────
              Este item não aparece em nenhuma das oito abas do catálogo. Sem
              este aviso, o modal parecia normal e a pessoa fechava sem saber
              que o item continua invisível. */}
          {semHier && (
            <Alerta tom="atencao" style={{ marginBottom: 7 }}>
              {item
                ? <>Este item ainda <strong>não tem hierarquia</strong> e por isso não aparece em nenhuma aba do catálogo. Escolha abaixo do que ele é feito — a categoria acima é outra coisa (pra que serve).</>
                : <>Escolha a hierarquia: é ela que diz <strong>do que o item é feito</strong> e manda na ficha técnica. A categoria acima é o outro eixo — pra que ele serve.</>}
            </Alerta>
          )}
          {/* ── GRADE, não fileira que embrulha ──────────────────────────────
              Era `flex-wrap` com `flex: 1 1 96px`: cada botão terminava com uma
              largura diferente, e os dois rótulos longos ("Insumo Indireto",
              "Matéria-Prima Processada") quebravam em duas linhas ficando mais
              altos que os vizinhos. O bloco mais visível do modal era o mais
              esfarrapado — foi o "tá feio" que o dono viu.

              `1fr` dá colunas iguais e a linha do grid iguala a altura, então o
              rótulo que quebra não desalinha ninguém. `minmax(min(100%, …))`
              porque o modal também é folha de celular a 320px: lá viram duas
              colunas em vez de oito de 25px cortando o nome no meio. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 104px), 1fr))", gap: 6 }}>
            {HIERARQUIA_DEFS.map((h) => (
              // `aria-pressed`: a cor da borda era a ÚNICA marca de qual está
              // escolhida — invisível pro leitor de tela, e nada dizia "nenhuma"
              // num item não classificado.
              <button key={h.key} type="button" aria-pressed={hierarquia === h.key} onClick={() => setHierarquia(h.key)}
                style={{ minHeight: "var(--tap)", padding: "8px 6px", borderRadius: "var(--r-xs)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  display: "inline-flex", alignItems: "center", justifyContent: "center", textAlign: "center", lineHeight: 1.25,
                  border: `1.5px solid ${hierarquia === h.key ? "var(--primary)" : "var(--border)"}`,
                  background: hierarquia === h.key ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
                  color: hierarquia === h.key ? "var(--primary-texto)" : "var(--text)" }}>{h.label}</button>
            ))}
          </div>
        </Grupo>
        <div style={{ height: 10 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Item ainda sem hierarquia não ganha o interruptor: não há regra de
              composição pra obedecer enquanto ninguém disse do que ele é feito.
              As demais TODAS ganham — inclusive as que costumam ser compradas
              prontas. Embalagem produzida na casa existe no catálogo (a caixa
              que leva o saco), e esconder o interruptor dela era decidir pela
              pessoa uma coisa que só ela sabe. */}
          {!semHier && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, minHeight: "var(--tap)", padding: "6px 0", cursor: "pointer" }}>
              <Caixa marcado={produzido} onChange={(marc) => setProduzido(marc)} />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>Produzido internamente</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>
                  Desligado = comprado pronto, sem ficha técnica.
                </span>
              </span>
            </label>
          )}
          {/* ── Beco sem saída, explicado ANTES do erro ────────────────────────
              A guarda do banco recusa ligar a etiqueta num item que tem estoque
              digitado e nenhuma etiqueta (ligar zeraria a contagem e o número
              não voltaria). A caixinha deixava marcar, deixava salvar, e o erro
              vinha do banco — quando vinha. Aqui a caixinha dá lugar ao caminho
              que de fato funciona: gerar as etiquetas e ligar de uma vez. */}
          {precisaEtiquetarAntes ? (
            <div style={{ display: "flex", gap: 10, padding: 12, borderRadius: "var(--r-md)", border: "1px solid var(--atencao)", background: "color-mix(in srgb, var(--atencao) 10%, transparent)" }}>
              <Icon name="tag" size={17} color="var(--atencao)" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>Cada unidade tem etiqueta</div>
                <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "3px 0 9px" }}>
                  Este item já tem <strong style={{ color: "var(--text)" }}>{qtdBanco} {unidade}</strong> em estoque e nenhuma
                  etiqueta. Ligar sozinho zeraria a contagem — por isso as duas coisas
                  acontecem juntas: gera {qtdBanco} etiqueta{qtdBanco === 1 ? "" : "s"} e passa a contar por elas.
                </p>
                {qtdBanco > 2000 ? (
                  // Acima disso o item é a granel na prática (parafuso, cola):
                  // etiqueta por unidade não é o instrumento, e o servidor
                  // recusa. Dizer aqui evita o clique que só devolve erro.
                  <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
                    São {qtdBanco} unidades — acima de 2000 a etiqueta por unidade deixa de fazer
                    sentido (item contado aos milhares costuma ser a granel). A quantidade digitada serve melhor.
                  </p>
                ) : semHier && !skuParaEtiqueta ? (
                  // O código de cada etiqueta COMEÇA pelo SKU, e o SKU
                  // automático é "<prefixo da hierarquia>-<n>". Sem hierarquia
                  // não há prefixo: o servidor devolve `hierarquia_sem_prefixo`
                  // e o clique só produz um erro. Dizer o que falta é o
                  // caminho; o botão aqui seria uma armadilha.
                  <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
                    Escolha a hierarquia primeiro (ou dê um SKU ao item): o código de cada etiqueta
                    começa pelo SKU, e o SKU automático vem do prefixo da hierarquia.
                  </p>
                ) : !podeAjustar ? (
                  // Ligar a etiqueta aqui GERA as unidades — é quantidade, e a
                  // rota /unidades/preparar exige `estoque:ajustar`. Mostrar o
                  // botão pra colher 403 no clique seria a armadilha que este
                  // bloco inteiro existe pra evitar.
                  <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
                    Etiquetar gera as {qtdBanco} unidade{qtdBanco === 1 ? "" : "s"}, e isso é quantidade:
                    peça a permissão <strong>Ajustar quantidade</strong> a quem cuida das permissões.
                  </p>
                ) : (
                  <>
                    {/* ── EM CAIXAS, ou uma a uma ──────────────────────────
                        93 travas guardadas em caixas de 50 são DUAS etiquetas
                        (50 e 43), não 93 papéis. Nasce em 1 — quem etiqueta
                        peça a peça não vê diferença. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 9 }}>
                      <label htmlFor="cx-preparar" style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 700 }}>
                        Peças por etiqueta
                      </label>
                      <input
                        id="cx-preparar" type="number" min={1} value={caixaPreparo}
                        onChange={(e) => setCaixaPreparo(e.target.value)}
                        style={{ ...inp, width: 72, padding: "6px 8px", fontSize: 13, textAlign: "center" }}
                      />
                      <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{planoPreparo.frase}</span>
                    </div>
                    {/* O botão fala das UNIDADES, não dos papéis: é isso que
                        acontece com o estoque, e continua verdade com caixa (as
                        93 travas ficam etiquetadas, em 2 papéis). Quantos papéis
                        saem está na frase ao lado, que é onde a informação nova
                        pertence. */}
                    <Botao variante="primario" icone="tag" onClick={etiquetarAgora} carregando={ligando}>
                      Etiquetar {qtdBanco} unidade{qtdBanco === 1 ? "" : "s"}
                    </Botao>
                  </>
                )}
                {skuParaEtiqueta && caixaDoPreparo === 1 && (
                  <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 7 }}>
                    Os códigos vão de {skuParaEtiqueta}-000001 a {skuParaEtiqueta}-{String(qtdBanco).padStart(6, "0")}.
                  </p>
                )}
                {/* A falha aparece AQUI, embaixo do próprio botão — não no pé do
                    modal. Ver o comentário do `erroEtiquetar` lá em cima. */}
                {erroEtiquetar && (
                  <p ref={refErroEtiquetar} role="alert" style={{ fontSize: 11.5, color: "var(--perigo)", margin: "7px 0 0", lineHeight: 1.45 }}>
                    {erroEtiquetar}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* ── COMO ETIQUETAR: uma escolha, não uma caixinha ──────────────
               Era um interruptor chamado "Cada unidade tem etiqueta", que
               descreve como o item é CONTADO. Só que a pergunta que a pessoa
               tem na mão é sobre o PAPEL: "as vinte almofadas saem com o mesmo
               código ou com vinte códigos?" — e a resposta estava escondida
               numa consequência.

               Pior: as duas formas de etiquetar apareciam na mesma tela, em
               blocos separados, sem nada dizendo que são ALTERNATIVAS. Dava pra
               ler como se o item pudesse ter as duas.

               Agora é uma escolha de dois lados, escrita pelo que sai na
               impressora, com a consequência na contagem logo abaixo — porque
               ela continua sendo real e é o que o banco garante. */
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Como etiquetar este item</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 8 }}>
                {([
                  {
                    on: !serializado, valor: false, icone: "tag" as const,
                    titulo: "Código fixo do produto",
                    linha: "Todas as peças com o MESMO código. O estoque é o número contado.",
                  },
                  {
                    on: serializado, valor: true, icone: "list-numbers" as const,
                    titulo: "Número de série por peça",
                    linha: "Cada peça com um código único. O estoque vira a contagem das etiquetas, e bipar dá a baixa.",
                  },
                ]).map((o) => (
                  <button key={o.titulo} type="button" aria-pressed={o.on}
                    onClick={() => setSerializado(o.valor)}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: "var(--r-sm)", cursor: "pointer",
                      minHeight: "var(--tap)", display: "grid", gap: 3, alignContent: "start",
                      border: `1.5px solid ${o.on ? "var(--primary)" : "var(--border)"}`,
                      background: o.on ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
                      color: o.on ? "var(--primary-texto)" : "var(--text)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
                      <Icon name={o.icone} size={14} color="currentColor" style={{ flex: "none" }} /> {o.titulo}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45 }}>{o.linha}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Desligar com etiqueta viva congela a contagem — o banco também
              recusa. Avisar antes evita o clique que só devolve erro. */}
          {serializadoNoBanco && !serializado && (unidadesEmEstoque ?? 0) > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--atencao)", margin: 0 }}>
              Ainda há {unidadesEmEstoque} etiqueta{unidadesEmEstoque === 1 ? "" : "s"} em estoque. Dê baixa
              nelas (aba Bipar) antes de desligar — enquanto existirem, o sistema recusa.
            </p>
          )}
          {/* Item NOVO marcado como etiquetado nasce com zero: é o banco que
              impõe, e é melhor dizer do que a pessoa digitar 30 e ver 0. */}
          {!idAtual && serializado && Number(quantidade) > 0 && (
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
              O item nasce com <strong>0</strong>: a contagem vem das etiquetas que você gerar logo depois de salvar.
            </p>
          )}
        </div>
        {/* O bloco de etiquetas segue o estado do BANCO, não o da caixinha:
            marcar e clicar em "Gerar" antes de salvar respondia "este item não
            está marcado como etiquetado" com a caixinha marcada na tela. */}
        {serializadoNoBanco && idAtual && (
          <>
            <div style={{ height: 10 }} />
            {/* `qtdBanco` é a quantidade do CADASTRO, que pra item etiquetado
                é a soma das peças das etiquetas (a caixa de 50 conta 50) — ver
                a trigger `estoque_recontar_unidades`. A contagem que a lista de
                unidades faz é de ETIQUETAS. Passar os dois é o que deixa a
                frase dizer "312 peças em 8 etiquetas" em vez de escolher um
                número e chamar de "unidades". */}
            <UnidadesDoItem itemId={idAtual} pecasEmEstoque={qtdBanco} podeGerar={podeAjustar} onSku={(s) => { setSku(s); setSkuModo("proprio"); }} onContagem={setUnidadesEmEstoque} />
          </>
        )}
        {serializado && !serializadoNoBanco && !precisaEtiquetarAntes && (
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 8 }}>
            Salve o item para poder gerar as etiquetas.
          </p>
        )}
        {/* ── Etiqueta de PRODUTO: o mesmo código em todas as peças ──────────
            O terceiro caso, que faltava. Item serializado tem um código por
            peça; item comum não tinha etiqueta nenhuma — e é aí que estava a
            almofada: vinte peças iguais, que não precisam ser distinguidas uma
            da outra, só reconhecidas como "Almofada 22" no leitor.
            Não cria unidade e não mexe no estoque: é papel, não registro.
            Ver lib/estoque-etiqueta-de-produto.ts. */}
        {!serializado && <EtiquetaDeProduto item={{
          nome: nome || "(sem nome)", sku: normalizarSku(sku) || skuSugerido,
          cor, largura_mm: Number(largura) || null, altura_mm: Number(altura) || null,
          espessura_mm: Number(espessura) || null, dim_unidade: dimUnidade, serializado: false,
        }} />}
        <div style={{ height: 10 }} />
        <Field label="Dimensões">
          {/* minmax(min(100%, …)) e não minmax(72px, …): a 320px os quatro
              campos colapsam pra uma coluna em vez de estourar a folha. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 72px), 1fr))", gap: 8 }}>
            <input type="number" step="0.01" min={0} value={largura} onChange={(e) => setLargura(e.target.value)} placeholder="Largura" style={inp} />
            <input type="number" step="0.01" min={0} value={altura} onChange={(e) => setAltura(e.target.value)} placeholder="Altura" style={inp} />
            <input type="number" step="0.01" min={0} value={espessura} onChange={(e) => setEspessura(e.target.value)} placeholder="Espessura" style={inp} />
            <GlassSelect value={dimUnidade} onChange={setDimUnidade}
              options={[{ value: "mm", label: "mm" }, { value: "cm", label: "cm" }, { value: "m", label: "m (ML)" }]} />
          </div>
        </Field>
        <div style={{ height: 10 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 8 }}>
          <Field label="Cor"><input value={cor} onChange={(e) => setCor(e.target.value)} placeholder="Branco, Preto…" style={inp} /></Field>
          {/* `Grupo` e não `Field`: os dois são <label>, e um <label> em volta
              de um seletor de vidro (que é um <button>) dispara o gatilho ao
              clicar no rótulo — pior ainda agora que há um botão de cadastrar
              logo abaixo. */}
          <Grupo label="Fornecedor">
            <EscolherOuCriar
              valor={fornecedorId} onEscolher={setFornecedorId}
              opcoes={fornecedores.map((f) => ({ value: f.id, label: f.nome }))}
              rotuloVazio="— sem fornecedor —"
              rotuloCriar="Cadastrar fornecedor novo…"
              placeholderNome="Razão social ou nome fantasia"
              podeCriar={podeCriarFornecedor}
              semNada="Nenhum fornecedor cadastrado ainda — a aba Fornecedores é onde eles entram."
              criar={async (nome) => {
                const r = await fetch("/api/estoque/fornecedores", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ nome }),
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) return { erro: d.error === "nome_duplicado" ? "Já existe um fornecedor com este nome." : "Não deu pra cadastrar agora." };
                const id = String(d.fornecedor?.id ?? "");
                setFornecedores((v) => [...v, { id, nome }].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
                return { id };
              }}
            />
          </Grupo>
          <Grupo label="Localização">
            <EscolherOuCriar
              valor={localId} onEscolher={setLocalId}
              opcoes={locais.map((l) => ({ value: l.id, label: `${l.codigo} · ${l.nome}` }))}
              rotuloVazio="— sem local —"
              rotuloCriar="Cadastrar lugar novo…"
              placeholderNome="Ex.: Prateleira B2"
              comCodigo
              podeCriar={podeCriarLocal}
              semNada="Nenhum lugar cadastrado ainda — a aba Localização é onde eles entram."
              criar={async (nome, codigo) => {
                const r = await fetch("/api/estoque/locais", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ nome, codigo }),
                });
                const d = await r.json().catch(() => ({}));
                if (!r.ok) return { erro: d.error === "codigo_duplicado" ? "Já existe um lugar com este código." : "Não deu pra cadastrar agora." };
                const id = String(d.local?.id ?? "");
                setLocais((v) => [...v, { id, nome, codigo: codigo ?? "" }]);
                return { id };
              }}
            />
          </Grupo>
        </div>
        {/* Ficha técnica: componentes que ESTE item consome para ser fabricado.
            ── Aparece SEMPRE (menos sem hierarquia) ──────────────────────────
            Antes ela dependia de `!ehBase(hierarquia) && produzido`, e o efeito
            estava no banco: as 21 peças e os 33 componentes do catálogo tinham
            `produzido` desligado, então TODOS abriam sem bloco nenhum de
            composição — e sem uma linha dizendo por quê. A pessoa concluía, com
            razão, que "não dá pra adicionar matéria-prima aqui".
            Esconder uma seção é a pior forma de explicar uma regra: o
            interruptor desligado agora é dito em voz alta, com o botão que o
            liga do lado. */}
        {!semHier && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: "var(--r-md)", background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800 }}>Ficha técnica</span>
            <span style={{ marginLeft: 8, fontSize: 11, color: "var(--text-dim)" }}>itens consumidos para fabricar 1 un</span>
          </div>
          {!produzido ? (
            <div>
              <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "2px 0 9px", lineHeight: 1.45 }}>
                Este item está marcado como <strong style={{ color: "var(--text)" }}>comprado pronto</strong>, então
                não tem ficha. Se ele é montado aqui dentro, ligue o interruptor e diga do que ele é feito.
              </p>
              <Botao variante="secundario" icone="tools" onClick={() => setProduzido(true)}>
                É produzido aqui dentro
              </Botao>
            </div>
          ) : fichaErro ? (
            <Alerta tom="perigo" titulo="Não foi possível carregar a ficha técnica."
              acao={<Botao tamanho="sm" variante="secundario" icone="refresh" onClick={() => setFichaTentativa((n) => n + 1)}>Tentar de novo</Botao>}>
              Ela fica como está no banco: salvar o item não mexe na composição até a ficha ser lida.
            </Alerta>
          ) : (<>
          {ficha.length === 0 && <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "2px 0 8px" }}>Nenhum componente ainda. Toque em “Adicionar componente” e busque. Só entra o que a hierarquia permite.</p>}

          {/* Componentes já escolhidos — linhas limpas com nome · hierarquia + quantidade */}
          {ficha.map((l, i) => {
            // O modo NASCE de acordo com o número: consumo abaixo de 1 quase
            // sempre quer dizer rendimento ("0,125 chapa" é "rende 8"), e é
            // assim que a pessoa lê. Acima de 1 é consumo mesmo (3 parafusos
            // por peça). Ela troca num toque, e a escolha vale só nesta visita.
            const modoDaLinha = (id: string): "consome" | "rende" =>
              modoFicha[id] ?? (l.quantidade > 0 && l.quantidade < 1 ? "rende" : "consome");
            // O toggle de BAIXA é outra pergunta: não é quanto a peça precisa
            // (isso é o consome/rende, e vale sempre pra saber se falta), é se
            // produzir TIRA do estoque. Nasce desligado — decisão do dono.
            const setDesconta = (v: boolean) => setFicha((f) => f.map((x, j) => j === i ? { ...x, desconta: v } : x));
            const c = catalogo.find((x) => x.id === l.componente_id);
            const nome = c?.nome ?? l.nome ?? "—";
            const hier = c ? hierarquiaLabel(c.hierarquia) : null;
            // SEIS casas, não três: com três, "1 chapa rende 16 peças" grava
            // 0,063 e volta 15,87 — a faixa de rendimento alto, que é
            // justamente a que uma chapa tem. A coluna acompanha em
            // supabase/ficha_tecnica_rendimento.sql; sem ele o banco só
            // arredonda, sem quebrar nada.
            const setQ = (q: number) => setFicha((f) => f.map((x, j) => j === i ? { ...x, quantidade: Math.max(0, Math.round(q * 1e6) / 1e6) } : x));
            return (
              // flexWrap + base de 130px no nome: no celular o stepper e o remover
              // caem numa segunda linha em vez de espremer o nome até sumir.
              <div key={l.componente_id || i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6, padding: "8px 10px", borderRadius: "var(--r-sm)", background: "var(--bg)", border: "1px solid var(--border)" }}>
                <div style={{ flex: "1 1 130px", minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nome}</div>
                  {hier && <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{hier}</div>}
                </div>
                {/* ── CONSOME ou RENDE ────────────────────────────────────
                    A ficha guarda consumo por peça, e é o formato certo pra
                    multiplicar. Mas ninguém corta "0,125 de uma chapa": corta
                    a chapa inteira e sai com oito peças. Obrigar a divisão de
                    cabeça é onde o número entra errado — e errado aqui sai
                    como custo e necessidade de compra errados, sem sintoma.
                    Os dois modos gravam a MESMA coluna (ver
                    lib/estoque-rendimento.ts); muda só a pergunta. */}
                <div style={{ display: "flex", alignItems: "center", gap: 2, flex: "none" }}>
                  <button
                    type="button"
                    onClick={() => setModoFicha((m) => ({ ...m, [l.componente_id]: modoDaLinha(l.componente_id) === "rende" ? "consome" : "rende" }))}
                    title={modoDaLinha(l.componente_id) === "rende"
                      ? "Trocar para: quanto cada peça consome"
                      : "Trocar para: quantas peças saem de um"}
                    style={{ ...stepBtn, width: "auto", padding: "0 8px", fontSize: 10.5, fontWeight: 800, letterSpacing: ".02em" }}
                  >
                    {modoDaLinha(l.componente_id) === "rende" ? "RENDE" : "CONSOME"}
                  </button>
                  {modoDaLinha(l.componente_id) === "rende" ? (
                    <input
                      type="number" step="1" min={0}
                      value={rendimentoDe(l.quantidade) || ""}
                      onChange={(e) => setQ(consumoPorPeca(Number(e.target.value)))}
                      title="Quantas peças saem de UM deste componente"
                      style={{ ...inp, width: 56, padding: "6px 6px", fontSize: 13, textAlign: "center" }}
                    />
                  ) : (
                    <>
                      <button type="button" onClick={() => setQ((l.quantidade || 0) - 1)} title="Menos um" style={stepBtn}><Icon name="minus" size={15} color="var(--text)" /></button>
                      <input type="number" step="0.001" min={0} value={l.quantidade} onChange={(e) => setQ(Number(e.target.value))} style={{ ...inp, width: 56, padding: "6px 6px", fontSize: 13, textAlign: "center" }} />
                      <button type="button" onClick={() => setQ((l.quantidade || 0) + 1)} title="Mais um" style={stepBtn}><Icon name="plus" size={15} color="var(--text)" /></button>
                    </>
                  )}
                  {/* A unidade só no desktop: no celular os 22px dela são a
                      diferença entre a linha caber e estourar a folha de 320px. */}
                  {!celular && (
                    <span style={{ fontSize: 11, color: "var(--text-dim)", marginLeft: 2 }}>
                      {modoDaLinha(l.componente_id) === "rende" ? "peças" : "un"}
                    </span>
                  )}
                </div>
                {/* DESCONTA — o toggle de baixa da linha. Ligado, a conferência
                    que aprovar a produção tira do estoque o que as peças
                    gastaram (fração inclusa: "rende 72" em 80 peças tira 2).
                    Desligado, a linha só serve pra cadeia saber se falta. */}
                <label
                  title={l.desconta ? "Ao aprovar a produção, tira este componente do estoque" : "Não tira do estoque — só conta pra saber se falta"}
                  style={{ display: "flex", alignItems: "center", gap: 5, flex: "none", cursor: "pointer", minHeight: celular ? "var(--tap)" : 30, fontSize: 11, fontWeight: 700, color: l.desconta ? "var(--text)" : "var(--text-dim)" }}
                >
                  <Caixa marcado={l.desconta === true} onChange={(marc) => setDesconta(marc)} />
                  desconta
                </label>
                <BotaoIcone icone="trash" titulo="Remover componente" variante="perigo" tamanho="sm" onClick={() => setFicha((f) => f.filter((_, j) => j !== i))} style={{ flex: "none", marginLeft: "auto" }} />
              </div>
            );
          })}

          {ficha.length > 0 && (
            <p style={{ fontSize: 11, color: "var(--text-dim)", margin: "2px 0 8px", lineHeight: 1.45 }}>
              <strong style={{ color: "var(--text)" }}>Desconta</strong> nasce desligado: produzir não tira nada do estoque até você ligar a linha.
              Ligado, a baixa sai quando a conferência aprova a produção. A quantidade vale sempre pra saber se falta material.
            </p>
          )}

          {/* Adicionar via busca (sem aquele select gigante) */}
          {pickerOpen ? (
            <div style={{ marginTop: 6, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--bg)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderBottom: "1px solid var(--border)" }}>
                <Icon name="search" size={15} color="var(--text-dim)" />
                <input {...atributosDe("busca")} value={pickerBusca} onChange={(e) => setPickerBusca(e.target.value)} placeholder="Buscar componente, peça ou produto…" autoFocus style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--text)", fontSize: 13.5, boxShadow: "none" }} />
                <Botao variante="sutil" tamanho="sm" onClick={() => { setPickerOpen(false); setPickerBusca(""); }}>Fechar</Botao>
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {(() => {
                  const permitidas = filhosPermitidos(hierarquia);
                  const bt = pickerBusca.trim().toLowerCase();
                  const lista = catalogo.filter((c) =>
                    c.id !== item?.id &&                                  // nada se compõe de si mesmo
                    // `podeCompor` e não `permitidas.includes(...)`: ela aceita
                    // `unknown` e já trata hierarquia nula (item legado sem migrar).
                    podeCompor(hierarquia, c.hierarquia) &&
                    (!bt || c.nome.toLowerCase().includes(bt)) &&
                    !ficha.some((l) => l.componente_id === c.id));        // já está na ficha
                  if (lista.length === 0) return (
                    // Listar as hierarquias permitidas nome por nome deixou de
                    // caber: com a escada, "Peça" aceita sete delas e a frase
                    // virava um parágrafo. O que a pessoa precisa saber é a
                    // regra (do meu nível pra baixo), não o inventário dela.
                    <p style={{ padding: "14px 12px", fontSize: 12.5, color: "var(--text-dim)" }}>
                      {bt
                        ? `Nenhum item encontrado para “${pickerBusca.trim()}”.`
                        : permitidas.length === 0
                          ? `${hierarquiaLabel(hierarquia)} está no chão da escada — não é composta por nada.`
                          : `Nenhum item cadastrado ainda. Em ${hierarquiaLabel(hierarquia)} entra qualquer item do mesmo nível ou abaixo dele.`}
                    </p>
                  );
                  // Teto de 60 linhas: o filtro já corta muito, mas um catálogo
                  // grande de matéria-prima ainda entupiria o DOM da folha.
                  return lista.slice(0, 60).map((c) => (
                    <button key={c.id} type="button"
                      onClick={() => { setFicha((f) => [...f, { componente_id: c.id, quantidade: 1, nome: c.nome }]); setPickerOpen(false); setPickerBusca(""); }}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: "var(--tap)", padding: "10px 12px", border: "none", borderBottom: "1px solid var(--border)", background: "transparent", color: "var(--text)", cursor: "pointer", textAlign: "left", boxShadow: "none" }}>
                      <Icon name="package-import" size={15} color="var(--primary-texto)" />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{c.nome}</span>
                      <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{hierarquiaLabel(c.hierarquia)}</span>
                    </button>
                  ));
                })()}
              </div>
            </div>
          ) : (
            <Botao variante="primario" icone="package-import" onClick={() => setPickerOpen(true)} style={{ marginTop: 4 }}>
              Adicionar componente
            </Botao>
          )}
          </>)}
        </div>
        )}
        <div style={{ height: 10 }} />
        {/* auto-fit em vez de "1fr 1fr": a 320px o SKU (com o botão de sugerir)
            e o estoque ideal empilham em vez de dividirem 150px cada. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 8 }}>
          <Field label="SKU / Código">
            {/* Campo LIVRE: o SKU do dono ("CRB16", "AC05") é primeira classe,
                não exceção. A caixa só é acertada ao SAIR do campo — corrigir
                a cada tecla faz o cursor pular e impede digitar em minúscula
                por um instante que seja. */}
            {/* O código pode vir do PAPEL. Peça de fornecedor chega com código
                de barras na caixa, e digitar "7898..." à mão é onde nasce o
                SKU trocado que só aparece meses depois, no bipe que não casa.
                Ler é um toque, e o que a câmera devolve é exatamente o que
                está impresso. */}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={sku}
                onChange={(e) => { setSku(e.target.value); setSkuModo("proprio"); }}
                onBlur={() => setSku((v) => normalizarSku(v))}
                placeholder={skuSugerido ?? "ex: CRB10"} style={{ ...inp, flex: 1, minWidth: 0 }} />
              <button
                type="button" onClick={() => setLendoCodigo(true)} title="Ler o código de barras ou QR"
                className="ui-toque"
                style={{ flex: "none", width: "var(--tap)", minHeight: "var(--tap)", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", display: "grid", placeItems: "center" }}
              >
                <Icon name="scan" size={17} color="var(--text)" />
              </button>
            </div>
          </Field>
          <Field label="Estoque ideal"><input type="number" value={estoqueIdeal} onChange={(e) => setEstoqueIdeal(e.target.value)} placeholder="—" style={inp} /></Field>
        </div>
        {/* O campo era um texto livre sem dizer pra que serve. Ele vira o
            começo do código de CADA etiqueta física — trocar depois não
            reimprime nada. A prévia segue o que está NO CAMPO: o SKU digitado
            à mão tem que aparecer aqui do mesmo jeito que o sugerido. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          <p style={{ fontSize: 11.5, color: skuProblema ? "var(--perigo)" : "var(--text-dim)", margin: 0, flex: "1 1 200px", minWidth: 0 }} role={skuProblema ? "alert" : undefined}>
            {skuProblema ?? <>
              {ultimoSku && skuModo === "auto" && <>Último SKU: <strong style={{ color: "var(--text)" }}>{ultimoSku}</strong> — este item fica com <strong style={{ color: "var(--text)" }}>{normalizarSku(sku) || skuSugerido}</strong>.{" "}</>}
              Começo do código de cada etiqueta: <strong style={{ color: "var(--text)" }}>{(normalizarSku(sku) || skuSugerido || "SKU")}-000042</strong>.
            </>}
          </p>
        </div>
        {/* Aviso, não proibição — ver `etiquetasVivas` lá em cima. Mesma
            moldura de atenção que o resto do modal usa. */}
        {etiquetasVivas > 0 && (
          <Alerta tom="atencao" style={{ marginTop: 7 }}>
            {skuTrocado
                ? <>Este item já tem <strong>{etiquetasVivas} etiqueta{etiquetasVivas === 1 ? "" : "s"}</strong> impressa{etiquetasVivas === 1 ? "" : "s"} com <strong>{skuGravado}-000001</strong> em diante. Trocar para <strong>{normalizarSku(sku) || "nada"}</strong> <strong>não reimprime</strong> o papel colado na prateleira: as etiquetas antigas continuam com o código velho e deixam de casar no bipe. Só troque se for reimprimir todas.</>
                : <>Este item já tem <strong>{etiquetasVivas} etiqueta{etiquetasVivas === 1 ? "" : "s"}</strong> impressa{etiquetasVivas === 1 ? "" : "s"} com <strong>{skuGravado || normalizarSku(sku)}-000001</strong> em diante. Trocar o SKU aqui <strong>não reimprime</strong> nada — o papel colado na prateleira continua com o código antigo e deixa de casar no bipe.</>}
          </Alerta>
        )}
        <div style={{ marginTop: 12 }}>
          {/* `--tap` igual aos outros dois interruptores: media 19px de altura,
              que é alvo de mouse, não de dedo. */}
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", cursor: "pointer" }}>
            <Caixa marcado={requisitavel} onChange={(marc) => setRequisitavel(marc)} />
            <span style={{ fontSize: 13.5 }}>Pode ser <strong>pedido pelo app</strong></span>
          </label>
          {requisitavel && (
            <div style={{ marginTop: 10 }}>
              <Field label="Setor que pode pedir">
                <GlassSelect value={setorReq} onChange={setSetorReq} options={SETORES_REQ.map((s) => ({ value: s, label: s }))} />
              </Field>
            </div>
          )}
        </div>
        <div style={{ height: 10 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 110px), 1fr))", gap: 8 }}>
          <Field label="Qtd">
            {/* Campo cinza sem explicação se lê como bug: a razão fica colada nele. */}
            <input type="number" value={quantidade} disabled={serializado || !podeAjustar}
              onChange={(e) => setQuantidade(e.target.value)}
              style={{ ...inp, opacity: serializado || !podeAjustar ? 0.55 : 1 }} />
            {/* Quem cadastra não necessariamente mexe no saldo: são duas
                permissões desde a separação (`estoque:cadastrar` ×
                `estoque:ajustar`). O campo fica visível pra pessoa saber
                quanto tem — o que ela não pode é escrever por cima. */}
            {!serializado && !podeAjustar && <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-dim)" }}>
              Você não tem permissão pra ajustar quantidade — só pra cadastrar.
            </span>}
            {/* "Peças" e não "etiquetas": uma etiqueta pode ser uma caixa
                lacrada valendo 50, e o número deste campo é a SOMA das peças,
                não a contagem das tiras de papel. Dizer "etiquetas" aqui fazia
                8 caixas de 50 parecerem 8. */}
            {serializado && <span style={{ display: "block", marginTop: 4, fontSize: 11, color: "var(--text-dim)" }}>
              Peças em estoque, somadas das etiquetas — a caixa lacrada conta as peças de dentro.
            </span>}
          </Field>
          <Field label="Mínimo (0 = sem regra)"><input type="number" value={qtdMinima} onChange={(e) => setQtdMinima(e.target.value)} style={inp} /></Field>
          {/* Grupo de OPÇÕES, não campo de texto: `Field` é um <label> e um
              <label> em volta de um seletor de vidro dispara o primeiro botão
              dele ao clicar no rótulo. Aqui o rótulo é texto simples. */}
          <Grupo label="Unidade de compra">
            <GlassSelect value={unidade} onChange={(v) => setUnidade(normalizarUnidade(v) || UNIDADE_PADRAO)}
              options={opcoesUnidade(unidade)} />
          </Grupo>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 8 }}>
          Regra de estoque: quando a quantidade cair <strong>≤ mínimo</strong>, o sistema cria automaticamente atividades pra repor até o <strong>estoque ideal</strong>. Deixe o mínimo em <strong>0</strong> se não se aplica.
        </p>
        {/* ── A RECEITA da atividade automática ─────────────────────────────
            Sem ela, a atividade nasce só com "Produzir X": quem recebe não
            sabe o COMO nem o prazo. A instrução vira o bloco "o que fazer"
            de /minhas-atividades e do tablet; o tempo vira a estimativa —
            por LOTE, porque "200 puxadores em 2h" é como a bancada fala. */}
        {produzido && (
          <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
            {/* ── QUEM FAZ ESTA PEÇA ─────────────────────────────────────────
                A pergunta que decide PRA QUEM a ordem pode cair, e por isso a
                primeira da seção. Antes eram dois controles soltos — "Onde a
                atividade cai" aqui e um "Quem faz" de cinco opções no fim da
                seção, que sumia quando a ordem ia pro painel — e ninguém achou
                o segundo: 18 ordens de peça de máquina caíram pro montador em
                10–11/09 porque nenhum item estava marcado. Agora é QUEM
                primeiro e, só pra Máquinas, ONDE (tablet × fila da máquina).
                <div>, não <Field>: <label> em volta de grupo de botões dispara
                o primeiro ao clicar no rótulo. */}
            {(() => {
              const faixaSel: "maquinas" | "producao" | "preparo" | "" =
                producaoTipo === "maquina" ? "maquinas" : (faixaDoSetorResponsavel(setorResponsavel) ?? "");
              const marcarMaquinas = () => { if (faixaDoSetorResponsavel(setorResponsavel) !== "maquinas") setSetorResponsavel("Máquinas"); };
              const escolher = (f: typeof faixaSel) => {
                if (f === "maquinas") { marcarMaquinas(); return; }
                setProducaoTipo("manual");
                if (f === "") { setSetorResponsavel(""); return; }
                // "Montagem Final" já é produção: não reescreve o que já diz a mesma coisa.
                if (faixaDoSetorResponsavel(setorResponsavel) !== f) setSetorResponsavel(QUEM_FAZ.find((o) => o.faixa === f)?.valor ?? "");
              };
              const chip = (on: boolean): React.CSSProperties => ({
                minHeight: "var(--tap)", padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                border: on ? "1px solid var(--primary-acao, var(--primary))" : "1px solid var(--border)",
                background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)",
                color: on ? "var(--on-primary, #fff)" : "var(--text)",
              });
              return (
                <div style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>Quem faz esta peça</span>
                  <div role="group" aria-label="Quem faz esta peça" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {QUEM_FAZ.map((o) => (
                      <button key={o.faixa} type="button" aria-pressed={faixaSel === o.faixa} onClick={() => escolher(o.faixa)} style={chip(faixaSel === o.faixa)}>{o.rotulo}</button>
                    ))}
                    <button type="button" aria-pressed={faixaSel === ""} onClick={() => escolher("")} style={chip(faixaSel === "")}>Automático</button>
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                    {faixaSel ? QUEM_FAZ.find((o) => o.faixa === faixaSel)?.ajuda : AJUDA_AUTOMATICO}
                  </span>
                  {faixaSel === "maquinas" && (
                    <div style={{ display: "grid", gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>Onde a ordem cai</span>
                      <div role="group" aria-label="Onde a ordem cai" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {([["manual", "No tablet"], ["maquina", "Na fila da máquina (TV)"]] as const).map(([v, r]) => (
                          <button key={v} type="button" aria-pressed={producaoTipo === v}
                            onClick={() => { setProducaoTipo(v); marcarMaquinas(); }} style={chip(producaoTipo === v)}>{r}</button>
                        ))}
                      </div>
                      {producaoTipo === "maquina" ? (
                        <>
                          <GlassSelect value={producaoMaquinaId} onChange={setProducaoMaquinaId}
                            options={[{ value: "", label: "A máquina mais livre na hora" },
                              ...maquinas.map((m) => ({ value: m.id, label: m.nome }))]} />
                          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                            A reposição entra na fila da máquina e aparece na TV — ninguém precisa aceitar no tablet.
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                          Cai no tablet só pra quem tem especialidade Máquinas e está marcado “Aparece no tablet”.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
            <Field label="Como se faz (vai escrito na atividade)">
              <textarea
                value={producaoInstrucao}
                onChange={(e) => setProducaoInstrucao(e.target.value.slice(0, 2000))}
                placeholder="Ex.: Cortar o feltro em 1,4m × 0,7m e o EVA na mesma medida. Colar um no outro com cola silicone."
                rows={3}
                style={{ ...inp, resize: "vertical", minHeight: 64, lineHeight: 1.45 }}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 8 }}>
              <Field label="Tempo (minutos)">
                <input type="number" min={0} value={producaoTempoMin}
                  onChange={(e) => setProducaoTempoMin(e.target.value)} placeholder="ex: 120" style={inp} />
              </Field>
              <Field label="…para um lote de">
                <input type="number" min={1} value={producaoLoteDe}
                  onChange={(e) => setProducaoLoteDe(e.target.value)} placeholder="ex: 200" style={inp} />
              </Field>
            </div>
            {/* O INTERRUPTOR por item. Existia no banco e não tinha tela: não é
                porque o item tem mínimo que a falta dele deve virar ordem. */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, minHeight: "var(--tap)", cursor: "pointer", marginTop: 10 }}>
              <Caixa marcado={reporSozinho} onChange={(marc) => setReporSozinho(marc)} />
              <span style={{ fontSize: 13.5 }}>
                <strong>Repor sozinho</strong> — quando cair no mínimo, criar a atividade sem ninguém pedir.
                <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
                  Vale pro mínimo DESTE item. Como peça de outro item que repõe sozinho, ele é produzido sempre que faltar — com o interruptor ligado ou não.
                </span>
              </span>
            </label>
            {(() => {
              const t = tempoEstimadoMin(1, Number(producaoTempoMin) || null, 1);
              const alvoIdeal = Number(estoqueIdeal) || 0;
              const previa = alvoIdeal > 0
                ? tempoEstimadoMin(alvoIdeal, Number(producaoTempoMin) || null, Number(producaoLoteDe) || 1)
                : t;
              const frase = fraseDoTempo(previa);
              return frase ? (
                <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0 }}>
                  Repor {alvoIdeal > 0 ? `${alvoIdeal} (o ideal)` : "1"} leva {frase} — é o que a atividade vai estimar.
                </p>
              ) : null;
            })()}
          </div>
        )}
        {podeVerCusto && (
          <div style={{ marginTop: 10 }}>
            <Field label="Custo unitário (R$) — confidencial, só admin">
              <input type="number" step="0.01" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" style={inp} />
            </Field>
          </div>
        )}
        {erro && <p ref={refErro} role="alert" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--perigo)" }}>{erro}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={salvar} disabled={busy || !nome.trim() || !!skuProblema} style={{ flex: 1, padding: "12px", borderRadius: "var(--r-sm)", fontWeight: 800, background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", border: "none", cursor: "pointer", opacity: busy || skuProblema ? 0.6 : 1 }}>{busy ? "Salvando…" : "Salvar"}</button>
          {item && <button onClick={remover} style={{ padding: "12px 16px", borderRadius: "var(--r-sm)", fontWeight: 700, background: "var(--surface)", color: "var(--perigo)", border: "1px solid var(--border)", cursor: "pointer" }}>Remover</button>}
        </div>
      </div>

      {camera && (
        <CameraFoto
          titulo="Foto do item"
          onFoto={subirImagem}
          onFechar={() => setCamera(false)}
        />
      )}

      {lendoCodigo && (
        <LeitorCodigo
          titulo="Ler o código do produto"
          onLer={(codigo) => {
            /*
             * O que a câmera leu vira o SKU, e a caixa é acertada na hora.
             *
             * `setSkuModo("proprio")` é o que impede o efeito do SKU sugerido
             * de sobrescrever no próximo render: sem ele, o código lido do
             * papel aparecia no campo e era trocado de volta pelo automático
             * um quadro depois — parecendo que a leitura não pegou.
             */
            setSku(normalizarSku(codigo));
            setSkuModo("proprio");
            setLendoCodigo(false);
          }}
          onFechar={() => setLendoCodigo(false)}
        />
      )}
    </div>,
    document.body,
  );
}

// ── Escolher da lista, ou criar o que ainda não existe ───────────────────────
// No primeiro dia estes dois seletores abriam com UMA linha — "— sem
// fornecedor —" e "— sem local —" — e nenhuma saída. Nada dizia que a lista
// está vazia porque ninguém cadastrou (e não porque a busca falhou), e não
// havia como criar dali: a pessoa fecha o item sem lugar, e a aba Localização
// continua vazia pra sempre. Cadastrar item é onde a maior parte do cadastro
// acontece, então é aqui que a dependência precisa se resolver.
//
// O padrão é o do formulário de compra (RecebimentoPanel): a última opção do
// seletor cria na hora. A diferença é que aqui a criação acontece na hora do
// clique, e não junto do Salvar — assim o item recém-criado já aparece
// escolhido, e um erro de nome duplicado não derruba o cadastro inteiro.
const NOVO = "__novo";

/**
 * N etiquetas IGUAIS pra um item que se conta pelo número.
 *
 * Fica fechada até alguém pedir: a maioria dos itens do catálogo nunca vai
 * levar etiqueta, e um bloco aberto com campo de quantidade em toda ficha
 * sugeriria que deveria. Quando abre, mostra a folha ali mesmo — a mesma
 * `FolhaDeEtiquetas` da conferência, com o mesmo ajuste de tamanho e os mesmos
 * campos ocultáveis.
 */
function EtiquetaDeProduto({ item }: { item: ItemParaEtiqueta }) {
  const [aberto, setAberto] = useState(false);
  const [copias, setCopias] = useState("10");
  const n = Number(copias);
  const problema = problemaDaEtiquetaDeProduto(item, n);
  const folha = useMemo(
    () => (problema ? [] : etiquetasDeProduto(item, n)),
    // `item` é literal novo a cada render do pai; as partes que importam são
    // estas — sem isso a folha se refaz a cada tecla digitada em qualquer campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [problema, n, item.nome, item.sku, item.cor, item.largura_mm, item.altura_mm, item.espessura_mm, item.dim_unidade],
  );

  if (!aberto) {
    return (
      <div style={{ marginTop: 8 }}>
        <Botao tamanho="sm" variante="sutil" icone="tag" onClick={() => setAberto(true)}>
          Imprimir etiquetas deste produto
        </Botao>
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "5px 0 0", lineHeight: 1.5 }}>
          O <strong>mesmo código</strong> em todas — pra peças iguais, que só precisam ser
          reconhecidas no leitor. Não cria etiqueta contada: o estoque continua sendo o número.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 12, borderRadius: "var(--r-md)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <Field label="Quantas etiquetas iguais">
          <input type="number" min={1} max={MAX_COPIAS_DE_PRODUTO} value={copias}
            onChange={(e) => setCopias(e.target.value)}
            style={{ width: 120, minHeight: "var(--tap)", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "9px 12px", color: "var(--text)", fontSize: 14 }} />
        </Field>
        <Botao tamanho="sm" variante="sutil" onClick={() => setAberto(false)}>Fechar</Botao>
      </div>
      {problema
        ? <p role="alert" style={{ fontSize: 12, color: "var(--perigo)", margin: "8px 0 0", lineHeight: 1.5 }}>{problema}</p>
        : (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "0 0 8px", lineHeight: 1.5 }}>
              {folha.length} etiqueta{folha.length === 1 ? "" : "s"} com o código{" "}
              <strong style={{ color: "var(--text)" }}>{folha[0]?.codigo}</strong>.
            </p>
            <FolhaDeEtiquetas etiquetas={folha} />
          </div>
        )}

    </div>
  );
}

function EscolherOuCriar({ valor, onEscolher, opcoes, rotuloVazio, rotuloCriar, placeholderNome, comCodigo, podeCriar, semNada, criar }: {
  valor: string;
  onEscolher: (id: string) => void;
  opcoes: { value: string; label: string }[];
  rotuloVazio: string;
  rotuloCriar: string;
  placeholderNome: string;
  /** Lugar tem código (vai impresso na etiqueta); fornecedor não. */
  comCodigo?: boolean;
  podeCriar: boolean;
  /** O que dizer quando a lista está vazia e a pessoa não pode cadastrar. */
  semNada: string;
  criar: (nome: string, codigo?: string) => Promise<{ id?: string; erro?: string }>;
}) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inp: React.CSSProperties = { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 12px", color: "var(--text)", fontSize: 14 };

  // ── Vazio com FORMA DE CAMPO ───────────────────────────────────────────────
  // Continua sendo verdade que um seletor com uma opção morta parece controle
  // quebrado — por isso não há seletor aqui. Mas devolver um parágrafo solto
  // quebrava a linha: "Cor" e "Fornecedor" dividem a mesma faixa, e ficava um
  // campo de um lado e um muro de texto miúdo do outro, desalinhados. A tela
  // parecia mal montada justamente onde a pessoa ainda não configurou nada.
  //
  // A caixa abaixo tem a borda, o raio e o respiro do campo que ela substitui,
  // então a faixa mantém o ritmo. O tracejado e o tom apagado dizem que não há
  // o que escolher AINDA — sem fingir um controle que não funciona.
  if (!opcoes.length && !podeCriar) {
    return (
      <div style={{
        width: "100%", minHeight: "var(--tap)", display: "flex", alignItems: "center",
        border: "1px dashed var(--border)", borderRadius: "var(--r-sm)", padding: "9px 12px",
        background: "color-mix(in srgb, var(--surface) 55%, transparent)",
        fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45,
      }}>{semNada}</div>
    );
  }

  async function confirmar() {
    const n = nome.trim();
    if (!n || busy) return;
    if (comCodigo && !codigo.trim()) { setErro("Dê um código ao lugar — é ele que vai na etiqueta."); return; }
    setBusy(true); setErro(null);
    try {
      const r = await criar(n, comCodigo ? codigo.trim().toUpperCase() : undefined);
      if (r.erro || !r.id) { setErro(r.erro ?? "Não deu pra cadastrar agora."); return; }
      onEscolher(r.id);
      setCriando(false); setNome(""); setCodigo("");
    } catch {
      setErro("Não deu pra cadastrar agora.");
    } finally { setBusy(false); }
  }

  return (
    <>
      <GlassSelect
        value={criando ? NOVO : valor}
        onChange={(v) => { if (v === NOVO) { setCriando(true); setErro(null); } else { setCriando(false); onEscolher(v); } }}
        placeholder={rotuloVazio}
        options={[
          { value: "", label: rotuloVazio },
          ...opcoes,
          ...(podeCriar ? [{ value: NOVO, label: rotuloCriar }] : []),
        ]}
      />
      {criando && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={placeholderNome} style={inp} autoFocus />
          {comCodigo && (
            <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código (ex.: B2)" style={inp} />
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Botao tamanho="sm" variante="primario" icone="check" onClick={confirmar} disabled={!nome.trim()} carregando={busy}>
              Cadastrar e usar
            </Botao>
            <Botao tamanho="sm" variante="sutil" onClick={() => { setCriando(false); setErro(null); }}>Cancelar</Botao>
          </div>
          {erro && <p role="alert" style={{ fontSize: 11.5, color: "var(--perigo)", margin: 0 }}>{erro}</p>}
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block" }}><span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>{label}</span><div style={{ marginTop: 4 }}>{children}</div></label>;
}

// Igual ao `Field` por fora, mas <div> em vez de <label> — para grupo de BOTÕES.
// Um <label> ativa o primeiro descendente rotulável ao ser clicado: com botões,
// tocar no texto "Hierarquia" disparava o primeiro deles e jogava o item de
// volta pra Matéria-Prima calado, escondendo a ficha técnica no mesmo gesto. Com
// campo de texto isso é bom (foca o campo); com botão é uma armadilha.
function Grupo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>{label}</span><div style={{ marginTop: 4 }}>{children}</div></div>;
}
