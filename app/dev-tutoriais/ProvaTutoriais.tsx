"use client";

// Banco de provas da PÁGINA PÚBLICA da Central de Tutoriais (central e leitura)
// sem login e sem banco. Os dados de exemplo passam por toda peça que a página
// sabe desenhar — "Comece por aqui", categoria oculta, "Outros", "Não achou?",
// aviso dos três estilos, "Deu errado?", materiais com produto, vídeo com capa,
// link pra outro tutorial, "Este tutorial resolveu?" — porque é este banco que
// o `npm run rolagem` e a conferência a 320px percorrem: peça que ele não monta
// é peça que ninguém confere no celular. A varredura só abre o que está na URL,
// então cada tela tem o seu `?tela=`, e ela o descobre pelas comparações
// `tela === "…"` do render abaixo: trocá-las por um mapa tira a leitura da
// medição sem nenhum aviso.
import { useLayoutEffect, useState } from "react";
import { CentralTutoriais } from "@/app/p/[slug]/CentralTutoriais";
import { TutorialPublico, type ProdutoTutorial } from "@/app/p/[slug]/[tutorial]/TutorialPublico";
import { cartaoDoTutorial, normalizarTutorial, resumoDoProduto, type AtalhoCentral, type Tutorial, type TutorialCategoria, type ReelCentral, type DepoimentoCentral } from "@/lib/tridiflow-tutoriais";

const WHATSAPP = "5511999999999";
// Feed de ideias e stories de depoimentos — mp4 público de amostra.
const VIDEO = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
const reels: ReelCentral[] = [
  { id: "r1", titulo: "Carimbo na sacola kraft", legenda: "Uma batida e a embalagem vira da sua marca.", videoUrl: VIDEO, capaUrl: "", linkUrl: "https://carimbostridi.com.br/", botao: "Comprar carimbo", ativo: true, ordem: 0 },
  { id: "r2", titulo: "Sabonete artesanal", legenda: "Carimbe antes da cura.", videoUrl: VIDEO, capaUrl: "", linkUrl: "https://carimbostridi.com.br/", botao: "Comprar", ativo: true, ordem: 1 },
];
const depoimentos: DepoimentoCentral[] = [
  { id: "d1", nome: "Ana", texto: "Minhas caixas ficaram com cara de loja grande.", midiaUrl: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=720&q=70", tipoMidia: "imagem", avatarUrl: "", ativo: true, ordem: 0 },
  { id: "d2", nome: "Bruno", texto: "Chegou rápido e marca perfeito no sabonete.", midiaUrl: "", tipoMidia: "imagem", avatarUrl: "", ativo: true, ordem: 1 },
  { id: "d3", nome: "Carla Mendes", texto: "", midiaUrl: VIDEO, tipoMidia: "video", avatarUrl: "https://images.unsplash.com/photo-1567789884554-0b844b597180?auto=format&fit=crop&w=200&q=80", ativo: true, ordem: 2 },
];
const FOTOS = {
  carimbo: "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=1000&q=85",
  refil: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?auto=format&fit=crop&w=1000&q=85",
  aplicar: "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=1000&q=85",
  almofada: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=1000&q=85",
  maquina: "https://images.unsplash.com/photo-1567789884554-0b844b597180?auto=format&fit=crop&w=1000&q=85",
};
// Arquivo pequeno e público. Com capa o player nasce com `preload="none"`:
// nada do vídeo desce antes de alguém apertar o play.
const VIDEO_ARQUIVO = "https://www.w3schools.com/html/mov_bbb.mp4";

const categorias: TutorialCategoria[] = [
  { id: "carimbos", nome: "Embalagens", imagemUrl: "https://images.unsplash.com/photo-1586075010923-2dd4570fb338?auto=format&fit=crop&w=200&q=80", ordem: 0, ativa: true },
  { id: "maquinas", nome: "Sabonete", imagemUrl: "https://images.unsplash.com/photo-1567789884554-0b844b597180?auto=format&fit=crop&w=200&q=80", ordem: 1, ativa: true },
  { id: "insumos", nome: "Limpeza e Conservação", imagemUrl: "https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=200&q=80", ordem: 2, ativa: true },
  // Oculta: o cartão some, mas o guia dela continua em "Todos" — e não pode
  // reaparecer em "Outros" com outro nome.
  { id: "acessorios", nome: "Madeira", imagemUrl: "", ordem: 3, ativa: false },
];

// O tutorial completo: tudo o que a leitura sabe mostrar, na ordem em que um
// guia de verdade usaria.
const tutorial = normalizarTutorial({
  id: "a", categoriaId: "carimbos", titulo: "Como configurar seu carimbo", handle: "configurar-carimbo",
  descricao: "Configure pressão e alinhamento.", capaUrl: FOTOS.carimbo, duracaoMinutos: 3, selo: "novo", destaque: true,
  status: "publicado", ordem: 0, dificuldade: "facil",
  materiais: [
    { id: "m1", nome: "Carimbo automático", produtoId: "p1" },
    { id: "m2", nome: "Papel de rascunho", produtoId: "" },
    { id: "m3", nome: "Pano seco", produtoId: "" },
  ],
  blocos: [
    { id: "i", tipo: "texto", titulo: "Antes de começar", conteudo: "<p>Separe o carimbo e faça o ajuste em uma superfície firme.</p>" },
    { id: "av1", tipo: "aviso", estilo: "atencao", conteudo: "<p>Não force a trava lateral: ela quebra com pressão e a peça não tem reposição.</p>" },
    { id: "1", tipo: "passo", titulo: "Prepare o equipamento", conteudo: "<p>Abra a trava lateral e deixe a base livre.</p>", imagemUrl: FOTOS.refil, imagemAlt: "Preparação do equipamento" },
    { id: "av2", tipo: "aviso", estilo: "dica", conteudo: "<p>Faça o primeiro teste em papel de rascunho: dá pra corrigir o alinhamento sem perder etiqueta.</p>" },
    { id: "2", tipo: "passo", titulo: "Ajuste a impressão", conteudo: "<p>Faça um teste em papel e corrija o alinhamento.</p>" },
    { id: "3", tipo: "passo", titulo: "Confira a pressão", conteudo: "<p>Pressione por dois segundos, sem balançar.</p>", videoUrl: VIDEO_ARQUIVO, videoCapaUrl: FOTOS.aplicar },
    { id: "4", tipo: "passo", titulo: "Guarde o carimbo", conteudo: "<p>Feche a trava e guarde longe do sol.</p>" },
    { id: "av3", tipo: "aviso", estilo: "lembrete", conteudo: "<p>Depois de usar, guarde o carimbo com a base para baixo e a trava fechada.</p>" },
    { id: "pr", tipo: "problemas", titulo: "Deu errado?", itens: [
      { id: "pr1", sintoma: "A impressão saiu borrada", solucao: "<p>Tire o excesso de tinta num papel de rascunho e carimbe de novo, <strong>sem arrastar</strong>.</p>" },
      { id: "pr2", sintoma: "Saiu torta ou cortada", solucao: "<p>Alinhe pela marca da base e confira se a superfície está plana.</p>" },
    ] },
    { id: "v", tipo: "video", origem: "link", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", capaUrl: FOTOS.carimbo, legenda: "Demonstração em vídeo" },
    // Shorts por link `watch?v=` (sem /shorts/): a caixa 9:16 tem de vir da sonda.
    { id: "vs", tipo: "video", origem: "link", url: "https://www.youtube.com/watch?v=x38jvgefUtI", capaUrl: "", legenda: "Shorts em pé" },
    { id: "lt", tipo: "link", titulo: "Refil gasto borra a impressão", descricao: "Se o carimbo já tem uso, troque o refil antes de ajustar.", url: "/p/tutoriais/trocar-refil", botao: "Ver como trocar o refil", tutorial: "trocar-refil" },
    { id: "l", tipo: "link", titulo: "Manual completo", descricao: "O PDF com todas as medidas.", url: "exemplo.com/manual.pdf", botao: "Abrir manual", tutorial: "" },
    { id: "p", tipo: "produto", produtoId: "p1", titulo: "Produto utilizado", botao: "Ver produto" },
  ],
});

// Os vizinhos variam de propósito o que o cartão mostra: vídeo (ícone de
// play), vários passos, tempo digitado, sem capa, sem categoria (vai pra
// "Outros") e de categoria oculta (só em "Todos").
const tutoriais: Tutorial[] = [tutorial, ...[
  { id: "b", categoriaId: "maquinas", titulo: "Como trocar o refil", handle: "trocar-refil", descricao: "Troque sem sujeira.", capaUrl: FOTOS.refil, destaque: true, status: "publicado", ordem: 1,
    blocos: [
      { id: "b1", tipo: "video", origem: "link", url: "https://youtu.be/aqz-KE-bpKQ", capaUrl: "", legenda: "" },
      { id: "b2", tipo: "passo", titulo: "Solte o refil gasto", conteudo: "<p>Puxe pela aba, sem torcer.</p>" },
      { id: "b3", tipo: "passo", titulo: "Encaixe o novo", conteudo: "<p>Empurre até ouvir o clique.</p>" },
    ] },
  { id: "c", categoriaId: "insumos", titulo: "Como aplicar corretamente", handle: "aplicar", descricao: "Aplicação em quatro etapas.", capaUrl: FOTOS.aplicar, status: "publicado", ordem: 2,
    blocos: ["Limpe a superfície", "Aplique uma camada fina", "Espere secar", "Confira o resultado"].map((titulo, i) => ({ id: `c${i}`, tipo: "passo", titulo, conteudo: "" })) },
  { id: "d", categoriaId: "carimbos", titulo: "Como limpar a almofada", handle: "limpar-almofada", descricao: "Tinta seca sai com dois minutos de cuidado.", capaUrl: FOTOS.almofada, selo: "mais_acessado", destaque: true, duracaoMinutos: 2, status: "publicado", ordem: 3,
    blocos: [{ id: "d1", tipo: "texto", titulo: "", conteudo: "<p>Passe um pano úmido e deixe secar à sombra.</p>" }] },
  { id: "e", categoriaId: null, titulo: "Garantia e troca", handle: "garantia", descricao: "O que a garantia cobre.", capaUrl: "", status: "publicado", ordem: 4,
    blocos: [{ id: "e1", tipo: "texto", titulo: "", conteudo: "<p>Guarde a nota fiscal: ela vale como certificado.</p>" }] },
  { id: "f", categoriaId: "acessorios", titulo: "Como montar a chancela", handle: "montar-chancela", descricao: "Da base à alavanca.", capaUrl: FOTOS.maquina, status: "publicado", ordem: 5,
    blocos: [{ id: "f1", tipo: "passo", titulo: "Encaixe a base", conteudo: "" }, { id: "f2", tipo: "passo", titulo: "Prenda a alavanca", conteudo: "" }] },
].map(normalizarTutorial)];

// A central recebe só o RESUMO de cada guia, igual ao servidor de verdade: é
// isso que confere que o cartão não depende do conteúdo.
const cartoes = tutoriais.map(cartaoDoTutorial);
const relacionados = tutoriais.slice(1, 4).map((t) => ({ handle: t.handle, titulo: t.titulo, capaUrl: t.capaUrl, duracaoMinutos: t.duracaoMinutos }));

const atalhos: AtalhoCentral[] = [
  { id: "a1", rotulo: "Início", icone: "home", acao: "topo", url: "", destaque: false },
  { id: "a2", rotulo: "Catálogo", icone: "shopping-bag", acao: "link", url: "https://exemplo.com/loja", destaque: false },
  { id: "a3", rotulo: "Loja", icone: "shopping-bag", acao: "link", url: "https://exemplo.com/loja", destaque: true },
  { id: "a4", rotulo: "Contato", icone: "brand-whatsapp", acao: "link", url: "https://wa.me/5511999999999", destaque: false },
  { id: "a5", rotulo: "Site", icone: "world-www", acao: "link", url: "https://exemplo.com", destaque: false },
];
const produto: ProdutoTutorial = { id: "p1", titulo: "Carimbo automático", descricao: resumoDoProduto("<p><strong>CARIMBO AUTOMÁTICO</strong></p><ul><li>6x6cm</li><li>Tinta preta</li></ul><p>O modelo utilizado neste tutorial.</p>"), imagemUrl: FOTOS.carimbo, href: "#produto" };

// Id de mentira da central: sem `botId` o "Este tutorial resolveu?" nem monta
// (é assim que a prévia do editor fica fora da métrica), e a peça ficava de
// fora da conferência. Não é uuid de propósito: se uma contagem escapasse do
// interceptador, a rota da métrica a recusaria antes de chegar ao banco.
const BOT_PROVA = "prova-tutoriais";

/** Voto, motivo e toque no WhatsApp contam em `/api/p/tutorial-metrica`; na
 *  prova a resposta sai da própria aba. O resto do fetch segue normal. */
function interceptador(original: typeof fetch): typeof fetch {
  return async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    if (url.includes("/api/p/tutorial-metrica")) return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    return original(entrada, init);
  };
}

const TELAS = { central: "Central", tutorial: "Tutorial", vazia: "Vazia" } as const;
type Tela = keyof typeof TELAS;
/** Marca do botão ligado. `currentColor` acompanha o tema da prova nos dois lados. */
const LIGADO = { background: "color-mix(in srgb, currentColor 14%, transparent)" };

export function ProvaTutoriais({ telaInicial }: {
  /** O `?tela=` da página. Tela escolhida só por clique não existe pra
   *  varredura, que descobre as telas pela URL. */
  telaInicial?: string;
}) {
  const [tela, setTela] = useState<Tela>(() => (Object.keys(TELAS) as Tela[]).find((t) => t === telaInicial) ?? "central");
  const [escuro, setEscuro] = useState(false);
  // Barra configurada (cinco atalhos, com destaque) × barra padrão — a de quem
  // não configurou nada: Início, Catálogo e o Contato que sai do WhatsApp.
  const [barraPadrao, setBarraPadrao] = useState(false);
  const barra = barraPadrao ? [] : atalhos;
  // A troca do fetch mora num efeito: no servidor não existe `window`. E o voto
  // fica guardado no aparelho (um por navegador): sem limpar aqui, o primeiro
  // toque escondia a pergunta desta prova até alguém apagar o armazenamento na
  // mão. É de layout pra rodar antes do `useEffect` que lê o voto.
  useLayoutEffect(() => {
    const original = window.fetch;
    window.fetch = interceptador(original.bind(window));
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(`tut-voto:${BOT_PROVA}:`) || k.startsWith(`tut-motivo:${BOT_PROVA}:`)) localStorage.removeItem(k);
      }
    } catch { /* armazenamento bloqueado: a pergunta aparece do mesmo jeito */ }
    return () => { window.fetch = original; };
  }, []);
  // Cor da marca pelo mesmo padrão da página no ar: sem cor escolhida, ela usa
  // `--primary-texto` com tinta branca. Com o vermelho de erro no lugar, a prova
  // mostrava uma cor (e um contraste de 3,4:1 no escuro) que a página nunca tem.
  return <div data-theme={escuro ? "dark" : "light"} style={{ background: escuro ? "#111" : "#fff", minHeight: "100dvh", color: escuro ? "#f5f5f5" : "#171717", ["--color-background" as string]: escuro ? "#111" : "#fff", ["--color-text" as string]: escuro ? "#f5f5f5" : "#171717", ["--color-text-muted" as string]: escuro ? "#a7a7a7" : "#666", ["--color-primary" as string]: "var(--primary-texto)", ["--color-primary-contrast" as string]: "#fff", ["--container-padding" as string]: "20px" }}>
    <link rel="stylesheet" href="/vitrine/warehouse/theme.css" />
    {/* O tema do warehouse (carregado aqui só pela tipografia) força
        `overflow-x: hidden !important` no <html> — e isso cria contexto de
        rolagem, que QUEBRA `position: sticky`. Na página pública real o body é
        `clip` e a busca cola normalmente; sem esta linha o banco de provas
        mostraria um defeito que não existe. */}
    <style>{"html,body{overflow-x:clip!important}"}</style>
    {/* A barra fica no fluxo, sem se prender no topo: presa, ela cobria o começo
        do trilho do sumário (que também cola no topo), justo o que a prova
        confere no computador. `tab-strip` segura cada rótulo numa linha só e
        rola de lado no celular; sem ela os rótulos quebravam e a barra passava
        de 130px a 320px. */}
    <div className="tab-strip" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 16px", background: escuro ? "#171717" : "#f4f4f4" }}>
      {(Object.keys(TELAS) as Tela[]).map((x) => <button key={x} type="button" className="button button--secondary" aria-pressed={tela === x} style={tela === x ? LIGADO : undefined} onClick={() => setTela(x)}>{TELAS[x]}</button>)}
      <button type="button" className="button button--secondary" aria-pressed={escuro} style={escuro ? LIGADO : undefined} onClick={() => setEscuro((x) => !x)}>Tema escuro</button>
      <button type="button" className="button button--secondary" aria-pressed={barraPadrao} style={barraPadrao ? LIGADO : undefined} onClick={() => setBarraPadrao((x) => !x)}>Barra padrão</button>
    </div>
    <div className="vt-tema">{tela === "tutorial"
      ? <TutorialPublico tutorial={tutorial} categoriaNome="Carimbos" centralTitulo="Tutoriais" centralUrl="#" produtos={[produto]} atalhos={barra} relacionados={relacionados} botId={BOT_PROVA} whatsapp={WHATSAPP} />
      : <CentralTutoriais titulo="Tutoriais" subtitulo="Aprenda a configurar, usar e cuidar dos seus produtos." slug="tutoriais" categorias={categorias} tutoriais={tela === "vazia" ? [] : cartoes} atalhos={barra} todosImagemUrl={categorias[0].imagemUrl} todosRotulo="Ver tudo" catalogoLoja="carimbos-tridi" catalogoRotulo="Catálogo" whatsapp={WHATSAPP} reels={reels} depoimentos={depoimentos} />}</div>
  </div>;
}
