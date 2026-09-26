"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/app/(plataforma)/Icon";
import { atalhosPadrao, linkWhatsapp, type AtalhoCentral, type DepoimentoCentral, type ReelCentral, type TutorialCartao, type TutorialCategoria } from "@/lib/tridiflow-tutoriais";
import { BarraAtalhos } from "./BarraAtalhos";
import { CatalogoCentral } from "./CatalogoCentral";
import { FeedIdeias } from "./FeedIdeias";
import { StoriesDepoimentos } from "./StoriesDepoimentos";
import { rolarAoTopo } from "./rolagem";
import "./central-tutoriais.css";

// A central é uma BIBLIOTECA VISUAL, na lógica de descoberta do Instagram:
// "qual produto eu tenho?" → círculo da categoria → cartão do tutorial.
// Uma tela só — cartões de categoria em cima, cartões de tutorial embaixo — em vez
// dos dois níveis de gaveta de antes, que escondiam todo guia atrás de um
// toque. A categoria virou FILTRO da grade, não uma porta.
//
// Filtros que não são categoria cadastrada. Prefixo "_" porque id de
// categoria nasce de `Math.random().toString(36)` e nunca começa assim — sem
// isso uma categoria real chamada "todos" sequestraria o filtro.
const TODOS = "_todos";
const CATALOGO = "_catalogo";
const SEM_CATEGORIA = "_outros";

/** Destaque primeiro, depois a ordem do editor — a mesma regra do
 *  `filtrarTutoriais`, escrita pro CARTÃO, que não carrega palavras-chave. */
function ordenarCartoes(itens: TutorialCartao[]): TutorialCartao[] {
  return [...itens].sort((a, b) => Number(b.destaque) - Number(a.destaque) || a.ordem - b.ordem);
}

/** Cartão da GRADE: miniatura em cima, texto embaixo — categoria, nome,
 *  resumo de duas linhas. Tempo/duração saíram em 24/09/26. É o "post" da
 *  biblioteca. */
function CardPost({ t, href, categoria, i }: { t: TutorialCartao; href: string; categoria?: string; i: number }) {
  return <Link className="tut-post" href={href} style={{ "--i": Math.min(i, 6) } as React.CSSProperties}>
    {/* Sem capa, só o ícone — e fora do nome do link: aviso de "imagem não
        adicionada" é recado de quem edita, não de quem visita. */}
    <span className="tut-post-imagem">
      {t.capaUrl ? <img src={t.capaUrl} alt="" loading={i > 3 ? "lazy" : undefined} decoding="async" /> : <span className="tut-sem-imagem" aria-hidden="true"><Icon name="photo" size={24} /></span>}
      {t.selo === "novo" ? <small className="tut-selo" data-novo="1">Novo</small>
        : t.selo === "mais_acessado" ? <small className="tut-selo">Mais acessado</small> : null}
    </span>
    <span className="tut-post-corpo">
      {categoria && <small className="tut-post-cat">{categoria}</small>}
      <strong>{t.titulo}</strong>
      {t.descricao && <span className="tut-post-desc">{t.descricao}</span>}
    </span>
  </Link>;
}

export function CentralTutoriais({ titulo, subtitulo, sobrelinha = "", mostrarTitulo = true, slug, categorias, tutoriais, atalhos = [], todosImagemUrl = "", todosRotulo = "", catalogoLoja = "", catalogoRotulo = "", whatsapp = "", base, mostrarVazias = false, reels = [], depoimentos = [] }: {
  titulo: string; subtitulo: string;
  /** Linha pequena acima do título. Vazia = não aparece. */
  sobrelinha?: string;
  /** Título grande — dá pra desligar e deixar a central só com os cartões. */
  mostrarTitulo?: boolean;
  slug: string; categorias: TutorialCategoria[];
  /** Só o RESUMO de cada guia (`cartaoDoTutorial`, montado no servidor). */
  tutoriais: TutorialCartao[];
  /** Barra do rodapé (contato, catálogo…). Vazia = a barra padrão. */
  atalhos?: AtalhoCentral[];
  /** Foto e nome do círculo "Todos". Vazios = mosaico das capas. */
  todosImagemUrl?: string; todosRotulo?: string;
  /** Vitrine ligada à central. Vazia = a central não tem catálogo. */
  catalogoLoja?: string; catalogoRotulo?: string;
  /** WhatsApp da central, só dígitos. Vazio = sem "fale com a gente". */
  whatsapp?: string;
  /** Raiz dos links dos tutoriais. A PRÉVIA do editor passa a dela. */
  base?: string;
  /** Legado (a prévia ainda passa): categoria vazia NÃO aparece em lugar
   *  nenhum — pedido do dono, 22/09. Só entra quando tem ao menos 1 tutorial. */
  mostrarVazias?: boolean;
  /** Feed de ideias (reels). Com algum, a barra troca o Compartilhar por "Ideias". */
  reels?: ReelCentral[];
  /** Stories de depoimentos, acima das categorias e dos tutoriais. */
  depoimentos?: DepoimentoCentral[];
}) {
  const raiz = base ?? `/p/${slug}`;
  const temCatalogo = catalogoLoja.trim().length > 0;
  // O atalho padrão do catálogo aponta pro filtro interno (?c=_catalogo), não
  // pra vitrine: sair da central pra ver produto é perder o caminho de volta.
  const reelsAtivos = useMemo(() => reels.filter((r) => r.ativo), [reels]);
  const storiesAtivos = useMemo(() => depoimentos.filter((d) => d.ativo), [depoimentos]);
  const barra = atalhosPadrao(temCatalogo ? `?c=${CATALOGO}` : undefined, linkWhatsapp(whatsapp) || undefined, atalhos, reelsAtivos.length > 0);
  // Feed de ideias aberto. `?v=ideias` abre direto — é o link que o atalho
  // "Ideias" leva de dentro de um tutorial.
  const [feed, setFeed] = useState(false);
  useEffect(() => {
    if (reelsAtivos.length && new URLSearchParams(window.location.search).get("v") === "ideias") setFeed(true);
  }, [reelsAtivos.length]);
  const fecharFeed = useCallback(() => {
    setFeed(false);
    const u = new URL(window.location.href);
    if (u.searchParams.has("v")) { u.searchParams.delete("v"); window.history.replaceState(window.history.state, "", u); }
  }, []);
  const idGrade = useId();
  // Duas telas: `null` = a de CATEGORIAS; um id = a de TUTORIAIS daquela
  // categoria (TODOS = todos). Misturar as duas numa só (cartões filtrando a
  // grade logo abaixo) virou uma parede de cartões — a pessoa não sabia onde
  // a categoria acabava e o tutorial começava.
  const [gaveta, setGaveta] = useState<string | null>(null);
  const tituloTela = useRef<HTMLHeadingElement>(null);

  const ordenados = useMemo(() => ordenarCartoes(tutoriais), [tutoriais]);
  const ativas = useMemo(() => categorias.filter((c) => c.ativa), [categorias]);
  const nomeDaCategoria = useMemo(() => new Map(ativas.map((c) => [c.id, c.nome])), [ativas]);
  // "Outros" é o guia SEM categoria, ou de uma que foi apagada. Categoria
  // OCULTA é outra coisa: quem a escondeu tirou o círculo do ar, não os guias
  // — eles seguem em "Todos", sem virar "Outros".
  const semCategoria = useMemo(() => ordenados.filter((t) => !t.categoriaId || !categorias.some((c) => c.id === t.categoriaId)), [ordenados, categorias]);
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of ordenados) if (t.categoriaId) m.set(t.categoriaId, (m.get(t.categoriaId) ?? 0) + 1);
    return m;
  }, [ordenados]);
  const circulos = useMemo(() => ativas.filter((c) => (contagem.get(c.id) ?? 0) > 0), [ativas, contagem]);
  const valido = (c: string | null): c is string => !!c && (c === TODOS || (c === SEM_CATEGORIA && semCategoria.length > 0) || (c === CATALOGO && temCatalogo) || circulos.some((x) => x.id === c));

  // Deep link: `?c=` abre a tela da categoria. Lido no efeito, nunca no
  // primeiro render — o servidor não conhece a query e a hidratação divergiria.
  useEffect(() => {
    const aplicar = () => {
      const c = new URLSearchParams(window.location.search).get("c");
      setGaveta(valido(c) ? c : null);
    };
    aplicar();
    window.addEventListener("popstate", aplicar);
    return () => window.removeEventListener("popstate", aplicar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorias, temCatalogo, semCategoria.length, circulos]);

  // Abrir uma categoria EMPILHA no histórico: o "voltar" do celular volta pras
  // categorias em vez de largar a página. Quem chegou por link `?c=` (primeira
  // entrada) volta reescrevendo a URL — `back()` levaria pra fora do site.
  const abrir = (id: string) => {
    setGaveta(id);
    const u = new URL(window.location.href);
    u.searchParams.set("c", id);
    window.history.pushState({ tutCat: true }, "", u);
    rolarAoTopo();
    requestAnimationFrame(() => tituloTela.current?.focus({ preventScroll: true }));
  };
  const voltar = () => {
    if ((window.history.state as { tutCat?: boolean } | null)?.tutCat) { window.history.back(); return; }
    const u = new URL(window.location.href);
    u.searchParams.delete("c");
    window.history.replaceState(null, "", u);
    setGaveta(null);
    rolarAoTopo();
  };

  // Sem nenhuma categoria com conteúdo (nem catálogo), a tela de categorias
  // seria só o "Todos": vai direto pra lista.
  const semNiveis = circulos.length === 0 && !temCatalogo;
  const filtro = semNiveis ? TODOS : gaveta ?? TODOS;
  const noCatalogo = filtro === CATALOGO;
  const visiveis = filtro === TODOS || filtro === CATALOGO ? ordenados
    : filtro === SEM_CATEGORIA ? semCategoria
    : ordenados.filter((t) => t.categoriaId === filtro);
  // Sem fileira de destaques: o tutorial marcado como destaque vem primeiro
  // na própria grade (`ordenarCartoes`) — dois blocos repetiam o mesmo cartão.
  const naGrade = visiveis;
  const novos = ordenados.filter((t) => t.selo === "novo").length;
  const semConteudo = tutoriais.length === 0;
  const capasTodos = ordenados.filter((t) => t.capaUrl).slice(0, 4).map((t) => t.capaUrl);
  const nomeFiltro = filtro === TODOS ? (todosRotulo || "Todos os tutoriais")
    : filtro === SEM_CATEGORIA ? "Outros" : filtro === CATALOGO ? (catalogoRotulo || "Catálogo")
    : nomeDaCategoria.get(filtro) ?? "Tutoriais";
  const tituloGrade = filtro === TODOS ? "Todos os tutoriais" : nomeFiltro;
  const catDe = (t: TutorialCartao) => nomeDaCategoria.get(t.categoriaId ?? "");
  // No filtro de uma categoria o nome dela em cada cartão só repete o título.
  const catNoCartao = (t: TutorialCartao) => (filtro === TODOS ? catDe(t) : undefined);

  const irParaTopo = () => { if (gaveta) voltar(); else rolarAoTopo(); };
  const naTelaDeCategorias = !semNiveis && gaveta === null;

  return <div className="tut-central" data-barra={barra.length > 1 ? "1" : undefined}>
    {(sobrelinha || mostrarTitulo || subtitulo) && (
      <header className="tut-cabecalho container">
        {sobrelinha && <p className="tut-sobrelinha">{sobrelinha}</p>}
        {mostrarTitulo && <h1 className="heading h1">{titulo}</h1>}
        {subtitulo && <p>{subtitulo}</p>}
      </header>
    )}

    <div className="container">
      <StoriesDepoimentos depoimentos={storiesAtivos} />

      {/* ── Tela 1: CATEGORIAS ("qual produto eu tenho?") ──
          Só os cartões. Categoria sem tutorial não aparece. */}
      {naTelaDeCategorias && !semConteudo && (
        <nav className="tut-cats" aria-label="Categorias">
          <CardCategoria rotulo={todosRotulo || "Todos"} imagem={todosImagemUrl} mosaico={todosImagemUrl ? [] : capasTodos} icone="layout-grid"
            quantidade={tutoriais.length} marca={novos > 0 ? `${novos} ${novos === 1 ? "novo" : "novos"}` : undefined} onClick={() => abrir(TODOS)} />
          {circulos.map((c) => <CardCategoria key={c.id} rotulo={c.nome} imagem={c.imagemUrl}
            quantidade={contagem.get(c.id) ?? 0} onClick={() => abrir(c.id)} />)}
          {semCategoria.length > 0 && <CardCategoria rotulo="Outros" imagem={semCategoria.find((t) => t.capaUrl)?.capaUrl ?? ""} icone="dots" quantidade={semCategoria.length} onClick={() => abrir(SEM_CATEGORIA)} />}
          {temCatalogo && <CardCategoria rotulo={catalogoRotulo || "Catálogo"} imagem="" icone="shopping-bag" legenda="Produtos da loja" onClick={() => abrir(CATALOGO)} />}
        </nav>
      )}

      {/* ── Tela 2: os TUTORIAIS da categoria escolhida ── */}
      {!naTelaDeCategorias && !semNiveis && (
        <div className="tut-nivel-topo">
          <button type="button" className="tut-voltar-cat" onClick={voltar}>
            <Icon name="arrow-left" size={17} />Categorias
          </button>
        </div>
      )}

      {semConteudo && <div className="tut-vazio">
        <span className="tut-vazio-icone"><Icon name="hourglass-high" size={26} /></span>
        <h2>Os tutoriais estão a caminho</h2>
        <p>Estamos preparando os primeiros guias. Volte em breve.</p>
      </div>}

      {/* Anuncia a contagem quando a lista muda ao trocar o filtro. */}
      <p className="sr-only" aria-live="polite">{semConteudo || noCatalogo || naTelaDeCategorias ? "" : `${visiveis.length} ${visiveis.length === 1 ? "tutorial" : "tutoriais"}`}</p>

      {naTelaDeCategorias ? null
      : noCatalogo ? <section aria-label={nomeFiltro}><h2 ref={tituloTela} tabIndex={-1} className="tut-secao-titulo tut-titulo-tela">{nomeFiltro}</h2><CatalogoCentral lojaSlug={catalogoLoja} /></section>
      : !semConteudo && (naGrade.length ? (
        <section aria-labelledby={idGrade}>
          <h2 id={idGrade} ref={tituloTela} tabIndex={-1} className="tut-secao-titulo tut-titulo-tela">{tituloGrade}<span>{visiveis.length}</span></h2>
          {/* A `key` remonta a grade quando o conteúdo troca: sem isso a lista
              muda no mesmo lugar, sem sinal de que respondeu ao toque. */}
          <div className="tut-grade" key={filtro}>
            {naGrade.map((t, i) => <CardPost key={t.id} t={t} i={i} href={`${raiz}/${t.handle}`} categoria={catNoCartao(t)} />)}
          </div>
        </section>
      ) : visiveis.length ? null : <div className="tut-vazio">
        <span className="tut-vazio-icone"><Icon name="hourglass-high" size={26} /></span>
        <h2>Esta categoria ainda está vazia</h2>
        <p>Os guias desta categoria estão a caminho.</p>
        <button type="button" className="tut-botao" onClick={voltar}>Ver as categorias</button>
      </div>)}

      {reelsAtivos.length > 0 && <ConviteIdeias reels={reelsAtivos} onAbrir={() => setFeed(true)} />}
    </div>

    <BarraAtalhos atalhos={barra} onTopo={irParaTopo} onIdeias={() => setFeed(true)} />
    {feed && reelsAtivos.length > 0 && <FeedIdeias reels={reelsAtivos} onFechar={fecharFeed} />}
  </div>;
}

/** Cartão de categoria — a foto do produto que a pessoa TEM é o que ela
 *  reconhece antes de ler o nome. Botão, não link: abre a tela dos tutoriais
 *  dela na mesma página (a URL ganha `?c=`, e o "voltar" do celular funciona). */
function CardCategoria({ rotulo, imagem, mosaico = [], icone = "photo", quantidade, legenda, marca, onClick }: {
  rotulo: string; imagem: string; mosaico?: string[]; icone?: string;
  /** Quantos tutoriais. O catálogo não conta — usa `legenda`. */
  quantidade?: number; legenda?: string;
  /** Selo sobre a foto ("2 novos"). */
  marca?: string;
  onClick: () => void;
}) {
  const vazia = quantidade === 0;
  return <button type="button" className="tut-cat" data-vazia={vazia ? "1" : undefined} onClick={onClick}>
    <span className="tut-cat-foto">
      {imagem ? <img src={imagem} alt="" loading="lazy" decoding="async" />
        : mosaico.length >= 2 ? <span className="tut-cat-mosaico">{mosaico.slice(0, 4).map((u, n) => <img key={n} src={u} alt="" loading="lazy" decoding="async" />)}</span>
        : <Icon name={icone} size={30} />}
      {marca && <small className="tut-cat-marca">{marca}</small>}
    </span>
    <span className="tut-cat-texto">
      <strong>{rotulo}</strong>
      <small>{legenda ?? (vazia ? "Em breve" : `${quantidade} ${quantidade === 1 ? "tutorial" : "tutoriais"}`)}</small>
    </span>
  </button>;
}

/** Fim da lista: em vez de "fale com a gente", o convite pro feed de ideias —
 *  quem terminou de aprender a usar quer ver onde mais usar (pedido 26/09/26). */
function ConviteIdeias({ reels, onAbrir }: { reels: ReelCentral[]; onAbrir: () => void }) {
  const id = useId();
  const capas = reels.filter((r) => r.capaUrl).slice(0, 3);
  return (
    <aside className="tut-contato tut-convite-ideias" aria-labelledby={id}>
      <span className="tut-contato-icone">{capas.length ? <span className="tut-convite-capas">{capas.map((r) => <img key={r.id} src={r.capaUrl} alt="" loading="lazy" decoding="async" />)}</span> : <Icon name="bulb" size={22} />}</span>
      <div className="tut-contato-texto">
        <h2 id={id}>Ideias pra usar o seu carimbo</h2>
        <p>Veja nos nossos vídeos onde mais o carimbo fica bonito.</p>
      </div>
      <button type="button" className="tut-botao" onClick={onAbrir}>
        <Icon name="player-play" size={18} />Ver ideias
      </button>
    </aside>
  );
}
