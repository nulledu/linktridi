import Link from "next/link";
import { Icon } from "@/app/(plataforma)/Icon";
import { ESTILOS_AVISO, hrefDoLink, htmlDoConteudo, type AtalhoCentral, type BlocoTutorial, type Tutorial } from "@/lib/tridiflow-tutoriais";
import {
  MINIMO_SUMARIO, barraDoTutorial, chaveFeitos, conteudoDosPassos, precisaDoTutorial, referenciasDosPassos, type ResumoPrecisa,
} from "@/lib/tridiflow-tutoriais-leitura";
import { BarraAtalhos } from "../BarraAtalhos";
import { VideoTutorial } from "./VideoTutorial";
import { ProgressoLeitura } from "./ProgressoLeitura";
import { SumarioTutorial } from "./SumarioTutorial";
import { AcoesTutorial } from "./AcoesTutorial";
import { IssoAjudou } from "./IssoAjudou";
import { LeituraTutorial } from "./LeituraTutorial";
import { Andamento, BotaoFeito, BotaoPassoAPasso, BotaoTelaAcesa, PassoSecao } from "./ControlesLeitura";
import { ModoPassoAPasso } from "./ModoPassoAPasso";
import { FaleComAGente } from "./FaleComAGente";
// O `.tut-botao` mora no CSS da central — a página pública não carrega o tema
// da vitrine, então os botões precisam de estilo próprio da família tut-*.
import "../central-tutoriais.css";
import "./tutorial.css";

const externo = (href: string) => /^https?:\/\//i.test(href);
/** Id de bloco vira pedaço de `id` no DOM: só o que é seguro num atributo. */
const idDom = (v: string) => v.replace(/[^\w-]/g, "");

export type ProdutoTutorial = { id: string; titulo: string; descricao: string; imagemUrl: string; href: string };

interface ContextoBloco {
  passo: number; total: number; produtos: ProdutoTutorial[]; centralUrl: string;
  titulo: string; handle: string; botId?: string; whatsapp: string; handlesPublicados?: string[];
}

function Bloco({ bloco: b, ctx }: { bloco: BlocoTutorial; ctx: ContextoBloco }) {
  switch (b.tipo) {
    case "texto": return <section className="tut-bloco tut-texto">{b.titulo && <h2>{b.titulo}</h2>}<div className="rte" dangerouslySetInnerHTML={{ __html: htmlDoConteudo(b.conteudo) }} /></section>;
    case "passo": {
      const n = ctx.passo;
      const titulo = b.titulo || `Passo ${n}`;
      // A seção (âncora, feito) é cliente; tudo dentro dela continua saindo
      // pronto do servidor.
      return <PassoSecao n={n}>
        <span className="tut-passo-num" aria-hidden="true"><span className="tut-passo-n">{n}</span><Icon name="check" size={20} className="tut-passo-check" /></span>
        <div className="tut-passo-corpo">
          <small><span>{`Passo ${n} de ${ctx.total}`}</span><AcoesTutorial titulo={titulo} hash={`passo-${n}`} rotulo="Copiar link" compacto /></small>
          <h2 id={`passo-${n}-titulo`}>{titulo}</h2>
          {b.conteudo && <div className="rte" dangerouslySetInnerHTML={{ __html: htmlDoConteudo(b.conteudo) }} />}
          {b.imagemUrl && <figure><img src={b.imagemUrl} alt={b.imagemAlt} loading="lazy" /></figure>}
          {b.videoUrl && <VideoTutorial url={b.videoUrl} capa={b.videoCapaUrl} />}
          <div className="tut-passo-rodape"><BotaoFeito n={n} /></div>
        </div>
      </PassoSecao>;
    }
    case "imagem": return b.url ? <figure className="tut-bloco tut-figura"><img src={b.url} alt={b.alt} loading="lazy" />{b.legenda && <figcaption>{b.legenda}</figcaption>}</figure> : null;
    case "video": return <section className="tut-bloco"><VideoTutorial url={b.url} legenda={b.legenda} capa={b.capaUrl} /></section>;
    case "produto": {
      const p = ctx.produtos.find((x) => x.id === b.produtoId);
      if (!p) return null;
      // Foto com `alt` vazio: o nome do produto já é o título do cartão, logo
      // ao lado — com ele no `alt`, o leitor de tela lê o produto duas vezes.
      return <aside className="tut-bloco tut-produto">{p.imagemUrl ? <img src={p.imagemUrl} alt="" /> : <span className="tut-produto-sem"><Icon name="package" size={24} /></span>}<div>{b.titulo && <small>{b.titulo}</small>}<h2>{p.titulo}</h2>{p.descricao && <p>{p.descricao}</p>}<Link className="tut-botao" href={p.href}>{b.botao || "Ver produto"}</Link></div></aside>;
    }
    case "link": {
      // Link pra outro tutorial resolve contra a central de QUEM VÊ: na prévia
      // continua na prévia, e trocar o endereço da central não quebra nada.
      // Externo abre em aba nova — a pessoa não perde o guia no meio.
      // Guia de destino fora do ar (rascunho, excluído, endereço trocado) só
      // levaria a "Tutorial não encontrado": o bloco some, como o produto que
      // não voltou da loja. Sem a lista (banco de provas), o link fica.
      if (b.tutorial && ctx.handlesPublicados && !ctx.handlesPublicados.includes(b.tutorial)) return null;
      const href = hrefDoLink(b, ctx.centralUrl);
      if (!href) return null;
      const fora = externo(href);
      return <aside className="tut-bloco tut-link"><Icon name={b.tutorial ? "book" : "external-link"} size={22} /><div>{b.titulo && <h2>{b.titulo}</h2>}{b.descricao && <p>{b.descricao}</p>}<a className="tut-botao" data-sec="1" href={href} {...(fora ? { target: "_blank", rel: "noreferrer noopener" } : null)}>{b.botao || "Saiba mais"}<Icon name={fora ? "external-link" : "arrow-right"} size={15} /></a></div></aside>;
    }
    case "aviso": {
      const html = htmlDoConteudo(b.conteudo);
      if (!html) return null;
      // Sentido fixo por estilo: "Atenção" é risco (cera quente, lâmina),
      // "Dica" é ajuda a mais, "Lembrete" é o depois. `role="note"` com o
      // rótulo faz o leitor de tela anunciar o tipo antes do texto.
      const e = ESTILOS_AVISO[b.estilo] ?? ESTILOS_AVISO.dica;
      return <aside className="tut-bloco tut-aviso" data-estilo={b.estilo} role="note" aria-label={e.rotulo}>
        <span className="tut-aviso-icone" aria-hidden="true"><Icon name={e.icone} size={20} /></span>
        <div><strong className="tut-aviso-rotulo">{e.rotulo}</strong><div className="rte" dangerouslySetInnerHTML={{ __html: html }} /></div>
      </aside>;
    }
    case "problemas": {
      const itens = b.itens.filter((p) => p.sintoma || p.solucao);
      if (!itens.length) return null;
      const id = `problemas-${idDom(b.id)}`;
      // O sintoma em destaque: é o que a pessoa reconhece ("saiu borrado"),
      // e é o que chegaria no WhatsApp se esta seção não existisse.
      return <section className="tut-bloco tut-problemas" aria-labelledby={id}>
        <h2 id={id}><Icon name="lifebuoy" size={22} />{b.titulo || "Deu errado?"}</h2>
        <ul>
          {itens.map((p) => <li key={p.id} className="tut-problema">
            {p.sintoma && <p className="tut-problema-sintoma"><Icon name="alert-triangle" size={18} /><strong>{p.sintoma}</strong></p>}
            {p.solucao && <div className="rte" dangerouslySetInnerHTML={{ __html: htmlDoConteudo(p.solucao) }} />}
          </li>)}
        </ul>
        {ctx.whatsapp && <FaleComAGente whatsapp={ctx.whatsapp} titulo={ctx.titulo} handle={ctx.handle} botId={ctx.botId} motivo="problemas">
          Não resolveu? Fale com a gente
        </FaleComAGente>}
      </section>;
    }
  }
}

/** "Você vai precisar": só os materiais (tempo/dificuldade/passos saíram —
 *  eram ruído antes do conteúdo). Material ligado a produto é link — quem não tem a tinta certa
 *  compra dali, sem procurar no catálogo. */
function VoceVaiPrecisar({ resumo, produtos }: { resumo: ResumoPrecisa; produtos: ProdutoTutorial[] }) {
  return <section className="tut-precisa" aria-labelledby="tut-precisa-titulo">
    <h2 id="tut-precisa-titulo">Você vai precisar</h2>
    <ul className="tut-precisa-lista">
      {resumo.materiais.map((m) => {
        // Produto inativo (ou de loja fora do ar) não volta da busca: o item
        // continua na lista como texto, sem link pra página que não abre.
        const p = m.produtoId ? produtos.find((x) => x.id === m.produtoId) : undefined;
        return <li key={m.id}>{p
          ? <Link href={p.href}><Icon name="shopping-bag" size={17} /><span>{m.nome}</span><span className="sr-only"> (ver produto)</span><Icon name="chevron-right" size={16} /></Link>
          : <span className="tut-precisa-item">{m.nome}</span>}</li>;
      })}
    </ul>
  </section>;
}

export function TutorialPublico({ tutorial, categoriaNome, categoriaId, relacionadosDaCategoria = false, centralTitulo, centralUrl, produtos, atalhos = [], relacionados = [], botId, whatsapp = "", handlesPublicados, temIdeias = false }: {
  tutorial: Tutorial; categoriaNome?: string;
  /** Id da categoria: vira o link `?c=` pro filtro dela na central. */
  categoriaId?: string | null;
  /** Os relacionados são da MESMA categoria (e não os vizinhos da lista). */
  relacionadosDaCategoria?: boolean;
  centralTitulo: string; centralUrl: string;
  /** Produtos dos blocos de produto E dos materiais, já resolvidos no servidor. */
  produtos: ProdutoTutorial[]; atalhos?: AtalhoCentral[];
  /** Outros tutoriais da MESMA categoria. Terminar de ler e não ter para onde
   *  ir é o beco que manda a pessoa abrir um chamado. */
  relacionados?: { handle: string; titulo: string; capaUrl: string; duracaoMinutos: number | null }[];
  /** Id da central. Sem ele o "isso ajudou?" não tem onde contar — a prévia
   *  do editor passa vazio de propósito: rascunho não polui a métrica. */
  botId?: string;
  /** WhatsApp da central (dígitos com DDI). Vazio = sem "fale com a gente". */
  whatsapp?: string;
  /** Endereços dos tutoriais PUBLICADOS da central (todos, inclusive este).
   *  A página pública só abre publicado, então link pra guia fora da lista
   *  sai da página. A prévia passa a mesma lista: quem edita vê o que o
   *  leitor vai ver, e não um link que só funciona dentro da prévia. */
  handlesPublicados?: string[];
  /** A central tem reels: a barra ganha "Ideias", que abre o feed na central. */
  temIdeias?: boolean;
}) {
  const refs = referenciasDosPassos(tutorial.blocos);
  const total = refs.length;
  // O modo passo a passo recebe o conteúdo dos passos já higienizado — e só
  // quando ele existe (2+ passos): com um passo, não há o que alternar.
  const conteudoModo = total >= 2 ? conteudoDosPassos(tutorial.blocos) : [];
  // A barra do rodapé segue dentro do tutorial: sair da central não pode tirar
  // da pessoa o contato e o catálogo.
  const barra = barraDoTutorial(atalhos, whatsapp, { centralUrl, temIdeias });
  const precisa = precisaDoTutorial(tutorial);
  const base: Omit<ContextoBloco, "passo"> = { total, produtos, centralUrl, titulo: tutorial.titulo, handle: tutorial.handle, botId, whatsapp, handlesPublicados };
  let passo = 0;
  return <LeituraTutorial chave={chaveFeitos(botId, tutorial.handle)} passos={refs}>
    <article className="tut-leitura container" data-barra={barra.length > 1 ? "1" : undefined} data-trilho={total >= MINIMO_SUMARIO ? "1" : undefined}>
      <Link className="tut-voltar" href={centralUrl}><Icon name="arrow-left" size={17} />{centralTitulo}</Link>
      {/* A capa é o maior pixel da tela e o que segura o LCP: entra com
          prioridade e com proporção declarada, pra nada saltar quando ela chega. */}
      {tutorial.capaUrl && <img className="tut-leitura-capa" src={tutorial.capaUrl} alt="" width={1280} height={720} fetchPriority="high" decoding="async" />}
      {/* Duas colunas a partir de 1024px (conteúdo + trilho do sumário); no
          celular é uma coluna só, sem sumário. */}
      <div className="tut-corpo">
        <header className="tut-cabeca">
          {/* A categoria é link pro filtro dela na central: é por ali que se
              acha "o resto do que eu tenho". */}
          {categoriaNome && categoriaId
            ? <p><Link className="tut-cabeca-cat" href={`${centralUrl}?c=${encodeURIComponent(categoriaId)}`}>{categoriaNome}</Link></p>
            : <p>{categoriaNome || "Tutorial"}</p>}
          <h1 className="heading h1">{tutorial.titulo}</h1>
          {tutorial.descricao && <div className="tut-cabeca-descricao">{tutorial.descricao}</div>}
          <div className="tut-leitura-acoes">
            <BotaoPassoAPasso />
            <AcoesTutorial titulo={tutorial.titulo} rotulo="Compartilhar" />
            <BotaoTelaAcesa />
          </div>
          <Andamento />
        </header>
        {precisa.mostrar && <VoceVaiPrecisar resumo={precisa} produtos={produtos} />}
        <SumarioTutorial />
        <div className="tut-conteudo">{tutorial.blocos.map((b) => { if (b.tipo === "passo") passo += 1; return <Bloco key={b.id} bloco={b} ctx={{ ...base, passo }} />; })}</div>

        {botId && <IssoAjudou botId={botId} handle={tutorial.handle} titulo={tutorial.titulo} whatsapp={whatsapp} />}

        {relacionados.length > 0 && <nav className="tut-relacionados" aria-label="Outros tutoriais">
          <h2>{categoriaNome && relacionadosDaCategoria ? `Mais de ${categoriaNome}` : "Continue por aqui"}</h2>
          <div>
            {relacionados.map((r) => <Link className="tut-relacionado" href={`${centralUrl}/${r.handle}`} key={r.handle}>
              <span className="tut-relacionado-capa">{r.capaUrl ? <img src={r.capaUrl} alt="" loading="lazy" decoding="async" /> : <Icon name="photo" size={18} />}</span>
              <span>
                <strong>{r.titulo}</strong>
                {r.duracaoMinutos ? <small><Icon name="clock" size={13} />{r.duracaoMinutos} min</small> : null}
              </span>
              <Icon name="chevron-right" size={17} />
            </Link>)}
          </div>
        </nav>}
      </div>

      <ProgressoLeitura />
      <ModoPassoAPasso passos={conteudoModo} />
      <BarraAtalhos atalhos={barra} inicioHref={centralUrl} />
    </article>
  </LeituraTutorial>;
}
