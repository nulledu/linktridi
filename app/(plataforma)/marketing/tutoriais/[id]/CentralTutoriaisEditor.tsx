"use client";

// Editor da Central de Tutoriais.
//
// A regra aqui é revelação progressiva: a tela principal é SÓ as listas
// (tutoriais e categorias) — todo formulário abre num PainelLateral do kit,
// nunca despejado no meio da página. Identidade da central (nome, endereço,
// título público) mora no painel de Configurações; o cabeçalho mostra o
// estado e o endereço público e concentra Visualizar/Publicar.
import { comprimirImagem } from "../../../ui/midia";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "../../../Icon";
import { GlassSelect } from "../../../GlassPicker";
import { confirmar, toast } from "../../../Toast";
import { Acoes, Botao, BotaoIcone, Campo, Campos, Esp, PainelLateral, Caixa } from "../../../ui/controles";
import { BotaoPublicar } from "../../../ui/BotaoPublicar";
import type { PaginaDoc } from "@/lib/tridiflow-pagina";
import { atalhosPadrao, categoriasSugeridasQueFaltam, DOMINIO_DOS_TUTORIAIS, handleDoTutorial, numeroWhatsapp, proveitoDe, textoDeBusca, type MetricaTutorial, normalizarCentralTutoriais, reordenarItem, type AtalhoCentral, type CentralTutoriaisDoc, type Tutorial, type TutorialCategoria } from "@/lib/tridiflow-tutoriais";
import { CampoArquivo } from "./CampoArquivo";
import { EditorBlocosTutorial } from "./EditorBlocosTutorial";
import { useReordenavel, porIds } from "../../../ui/reordenar";
import { FeedbackTutoriais } from "./FeedbackTutoriais";
import { ListaDepoimentos, ListaIdeias } from "./EditorIdeiasDepoimentos";
import "../editor.css";

type BotEditor = {
  id: string; nome: string; slug: string; status: "rascunho" | "publicado";
  dominioHost: string | null; dominioId: string | null; pagina: PaginaDoc;
  /** Para saber se o que está NO AR ficou velho (ver `pendente`). */
  publicadoEm: string | null; atualizadoEm: string;
};
type Dominio = { id: string; host: string; verificado: boolean };
export type VitrinePublicada = { slug: string; nome: string };
type CatalogoProduto = { id: string; titulo: string };
const DOMINIO_PADRAO = "gedux.com.br";
const idNovo = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
// Nasce PUBLICADO: "Publicar alterações" só publica a central, e tutorial que
// nascia rascunho continuava fora do ar depois de publicar (24/09/26).
const vazioTutorial = (ordem: number): Tutorial => ({ id: idNovo(), categoriaId: null, titulo: "", handle: "", descricao: "", capaUrl: "", palavrasChave: [], duracaoMinutos: null, quantidadeEtapas: null, tipoMidia: null, selo: null, destaque: false, status: "publicado", ordem, blocos: [], dificuldade: null, materiais: [] });

const FORMATOS: Record<string, string> = { leitura: "Leitura", video: "Vídeo", passos: "Passo a passo" };

function Selo({ publicado }: { publicado: boolean }) {
  return <span className="cte-selo-status" data-ok={publicado ? "1" : undefined}>
    <span className="cte-selo-ponto" />{publicado ? "Publicada" : "Rascunho"}
  </span>;
}

export function CentralTutoriaisEditor({ bot, dominios = [], metricas = [], catalogoUrl, lojas = [] }: {
  bot: BotEditor; dominios?: Dominio[];
  /** Leituras e votos por tutorial (vazio enquanto o SQL não rodou). */
  metricas?: MetricaTutorial[];
  /** Vitrine publicada (quando há uma só) — vira o atalho "Catálogo" pronto. */
  catalogoUrl?: string;
  /** Vitrines publicadas: são elas que podem virar o catálogo da central. */
  lojas?: VitrinePublicada[];
}) {
  const porHandle = new Map(metricas.map((m) => [m.handle, m]));
  const [nome, setNome] = useState(bot.nome);
  const [slug, setSlug] = useState(bot.slug);
  // Domínio não é estado de tela: ele é travado (ver DOMINIO_DOS_TUTORIAIS) e
  // este editor nunca manda a coluna no PATCH — nem por engano.
  const dominioId = bot.dominioId;
  const [status, setStatus] = useState(bot.status);
  const [doc, setDoc] = useState<CentralTutoriaisDoc>(() => normalizarCentralTutoriais(bot.pagina.config.centralTutoriais));
  const [produtos, setProdutos] = useState<CatalogoProduto[]>([]);
  const [aba, setAba] = useState<"tutoriais" | "categorias" | "ideias" | "depoimentos" | "feedback">("tutoriais");
  // Filtro da LISTA DO EDITOR (não é a busca do visitante): com 40 tutoriais,
  // achar "o do refil" era rolar a página inteira.
  const [filtro, setFiltro] = useState("");
  const [categoriaEditando, setCategoriaEditando] = useState<Partial<TutorialCategoria> | null>(null);
  const [tutorialEditando, setTutorialEditando] = useState<Tutorial | null>(null);
  const [configAberta, setConfigAberta] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [testando, setTestando] = useState(false);
  // Salvar NÃO publica: o público lê o snapshot da última publicação. Sem este
  // aviso, quem editava um tutorial via "salvo", abria o link e achava que o
  // app tinha perdido a alteração — e não havia nem como republicar, porque o
  // botão principal virava "Despublicar" assim que a central subia.
  //
  // A comparação tolera 2s porque publicar grava `published_at` e `updated_at`
  // no mesmo instante, e milissegundos de diferença não são alteração.
  const [pendente, setPendente] = useState(() => bot.status === "publicado"
    && (!bot.publicadoEm || new Date(bot.atualizadoEm).getTime() - new Date(bot.publicadoEm).getTime() > 2000));

  useEffect(() => { fetch("/api/tridiflow/tutoriais/produtos").then((r) => r.json()).then((j) => setProdutos(j.produtos ?? [])).catch(() => {}); }, []);

  const host = dominios.find((d) => d.id === dominioId)?.host || bot.dominioHost || DOMINIO_PADRAO;
  const linkPublico = `https://${host}/p/${slug}`;
  const paginaCom = (central: CentralTutoriaisDoc): PaginaDoc => ({ ...bot.pagina, config: { ...bot.pagina.config, template: "central_tutoriais", centralTutoriais: central } });

  const persistir = async (central = doc, mensagem = "Alterações salvas.", identidade?: { nome: string; slug: string }) => {
    setSalvando(true);
    try {
      const r = await fetch("/api/tridiflow/bots", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bot.id, nome: identidade?.nome ?? nome, slug: identidade?.slug ?? slug, pagina: paginaCom(central) }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Não deu para salvar.");
      setDoc(central); if (status === "publicado") setPendente(true); toast.ok(mensagem); return true;
    } catch (e) { toast.erro((e as Error).message); return false; } finally { setSalvando(false); }
  };
  /** `acao` explícita: publicar (ou republicar) e despublicar deixaram de ser o
   *  mesmo botão alternando — republicar era impossível. */
  const publicar = async (acao: "publicar" | "despublicar" = status === "publicado" ? "despublicar" : "publicar") => {
    setPublicando(true);
    try {
      if (!(await persistir(doc, "Central salva."))) return false;
      const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bot.id, acao }) });
      const j = await r.json().catch(() => ({})); if (!r.ok) { toast.erro(j.error || "Não deu para publicar."); return false; }
      if (acao === "publicar") { setStatus("publicado"); setPendente(false); toast.ok("Alterações no ar."); }
      else { setStatus("rascunho"); toast.ok("Central despublicada."); }
      return true;
    } finally { setPublicando(false); }
  };
  // Foto de celular chegava crua: 8 PNGs de ~2 MB faziam a central baixar 16 MB
  // pra mostrar círculos de 120px. WebP de até 1600px antes de subir.
  const upload = async (bruto: File) => { const file = await comprimirImagem(bruto); const fd = new FormData(); fd.append("file", file); const r = await fetch("/api/tridiflow/tutoriais/upload", { method: "POST", body: fd }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Não deu para enviar o arquivo."); return j.url as string; };
  // Pergunta ao PRÓPRIO endereço se ele responde com esta central. É o que
  // separa "a página não publicou" de "o domínio aponta para outro servidor" —
  // os dois dão a mesma cara de "link quebrado" pra quem clica.
  const testarLink = async () => {
    setTestando(true);
    try {
      const r = await fetch("/api/tridiflow/tutoriais/testar-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bot.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return toast.erro(j.error || "Não deu para testar o link.");
      if (j.estado === "ok") toast.ok(j.recado); else toast.erro(j.recado);
    } catch { toast.erro("Não deu para testar o link."); } finally { setTestando(false); }
  };
  const copiarLink = async () => { try { await navigator.clipboard.writeText(linkPublico); toast.ok("Link copiado."); } catch { toast.erro("Não deu para copiar."); } };

  const salvarConfig = async (v: ValorConfig) => {
    const central = { ...doc, titulo: v.titulo, subtitulo: v.subtitulo, sobrelinha: v.sobrelinha, mostrarTitulo: v.mostrarTitulo, catalogoLoja: v.catalogoLoja, catalogoRotulo: v.catalogoRotulo, atalhos: atalhosDaLoja(v.lojaUrl), whatsapp: numeroWhatsapp(v.whatsapp), todosImagemUrl: v.todosImagemUrl, todosRotulo: v.todosRotulo };
    if (!(await persistir(central, "Configurações salvas.", { nome: v.nome, slug: v.slug }))) return;
    setNome(v.nome); setSlug(v.slug); setConfigAberta(false);
  };
  const salvarCategoria = async (c: TutorialCategoria) => {
    const central = { ...doc, categorias: [...doc.categorias.filter((x) => x.id !== c.id), c].sort((a, b) => a.ordem - b.ordem) };
    setCategoriaEditando(null); await persistir(central, "Categoria salva.");
  };
  // As categorias por finalidade (Embalagens, Sabonete, Cerâmica…) entram de
  // uma vez; as que já existem com o mesmo nome ficam como estão.
  const faltamSugeridas = categoriasSugeridasQueFaltam(doc.categorias, idNovo);
  const usarSugeridas = async () => {
    const novas = categoriasSugeridasQueFaltam(doc.categorias, idNovo);
    if (novas.length) await persistir({ ...doc, categorias: [...doc.categorias, ...novas] }, `${novas.length} ${novas.length === 1 ? "categoria criada" : "categorias criadas"}.`);
  };
  const excluirCategoria = async (c: TutorialCategoria) => {
    if (doc.tutoriais.some((t) => t.categoriaId === c.id)) return toast.erro("Mova os tutoriais desta categoria antes de excluir.");
    if (!(await confirmar(`Excluir “${c.nome}”?`, { perigo: true }))) return;
    await persistir({ ...doc, categorias: doc.categorias.filter((x) => x.id !== c.id) }, "Categoria excluída.");
  };
  const salvarTutorial = async (t: Tutorial) => {
    const central = { ...doc, tutoriais: [...doc.tutoriais.filter((x) => x.id !== t.id), t].sort((a, b) => a.ordem - b.ordem) };
    setTutorialEditando(null); await persistir(central, t.status === "publicado" ? "Tutorial salvo — entra no ar na próxima publicação da central." : "Rascunho salvo.");
  };
  /** Publicar um tutorial era uma caixinha escondida no rodapé do formulário
   *  — e, marcada, ainda esperava a próxima publicação da central. Aqui o
   *  tutorial vai pro ar num toque: grava o rascunho e republica a central
   *  (o /p/<slug>/<handle> serve o SNAPSHOT publicado, não o rascunho). */
  const publicarTutoriais = async (ids: string[], ligar: boolean) => {
    const alvo = new Set(ids);
    const central = { ...doc, tutoriais: doc.tutoriais.map((t) => alvo.has(t.id) ? { ...t, status: (ligar ? "publicado" : "rascunho") as Tutorial["status"] } : t) };
    setPublicando(true);
    try {
      if (!(await persistir(central, "Salvo."))) return;
      const r = await fetch("/api/tridiflow/bots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: bot.id, acao: "publicar" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(j.error || "Salvei, mas não deu para publicar a central. Toque em Publicar no topo."); return; }
      setStatus("publicado"); setPendente(false);
      toast.ok(ligar ? (ids.length > 1 ? `${ids.length} tutoriais no ar.` : "Tutorial no ar.") : "Tutorial tirado do ar.");
    } finally { setPublicando(false); }
  };
  const duplicarTutorial = async (t: Tutorial) => {
    const copia: Tutorial = { ...t, id: idNovo(), titulo: `${t.titulo} (cópia)`, handle: handleDoTutorial(`${t.titulo} copia`, doc.tutoriais.map((x) => x.handle)), status: "rascunho", ordem: doc.tutoriais.length };
    await persistir({ ...doc, tutoriais: [...doc.tutoriais, copia] }, "Tutorial duplicado como rascunho.");
  };
  const handles = useMemo(() => doc.tutoriais.map((t) => t.handle), [doc.tutoriais]);

  const arrastoTut = useReordenavel(doc.tutoriais.map((t) => t.id), (ids) => { void persistir({ ...doc, tutoriais: porIds(doc.tutoriais, ids) }, "Ordem atualizada."); });
  const arrastoCat = useReordenavel(doc.categorias.map((c) => c.id), (ids) => { void persistir({ ...doc, categorias: porIds(doc.categorias, ids) }, "Ordem atualizada."); });
  const nomeCategoria = (id: string | null) => doc.categorias.find((c) => c.id === id)?.nome;
  const q = textoDeBusca(filtro.trim());
  // Filtra sem reordenar: a ordem desta lista É a ordem da central, e a pessoa
  // precisa reconhecê-la. Com filtro ativo o arrasto e o subir/descer saem de
  // cena — mover o 3º de uma lista filtrada não quer dizer nada na lista real.
  const tutoriaisVisiveis = useMemo(() => !q ? doc.tutoriais
    : doc.tutoriais.filter((t) => textoDeBusca([t.titulo, t.descricao, t.palavrasChave.join(" ")].join(" ")).includes(q)),
    [doc.tutoriais, q]);
  const filtrando = q.length > 0;

  return <section className="cte-admin tf-tut-editor">
    <header className="cte-topo">
      <Link href="/marketing?aba=paginas&ver=tutoriais" className="ui-btn mt-anel" data-v="sutil" data-t="md" data-ico="1" aria-label="Voltar para as centrais" title="Voltar"><Icon name="arrow-left" size={17} /></Link>
      <div className="cte-topo-id">
        <h1>{nome}</h1>
        <div className="cte-topo-meta">
          <Selo publicado={status === "publicado"} />
          {pendente && <span className="cte-selo-status cte-selo-pendente" title="O que está no ar é a última publicação — as alterações salvas entram quando você publicar.">
            <Icon name="alert-triangle" size={12} />Alterações não publicadas
          </span>}
          <a className="cte-topo-link" href={status === "publicado" ? linkPublico : undefined} target="_blank" rel="noreferrer" data-morto={status === "publicado" ? undefined : "1"} title={status === "publicado" ? "Abrir a página publicada" : "Publique para o link entrar no ar"}>
            <Icon name="world-www" size={13} />{linkPublico.replace("https://", "")}
          </a>
          <BotaoIcone icone="copy" titulo="Copiar link" tamanho="sm" onClick={copiarLink} />
          <Botao tamanho="sm" variante="sutil" icone="world-www" carregando={testando} onClick={testarLink}>Testar link</Botao>
        </div>
      </div>
      <div className="cte-editor-actions">
        <Botao icone="settings" onClick={() => setConfigAberta(true)}>Configurações</Botao>
        <a className="ui-btn mt-anel" data-v="secundario" data-t="md" href={`/previa/tutoriais/${bot.id}`} target="_blank" rel="noreferrer"><Icon name="eye" size={15.5} />Visualizar</a>
        {status === "publicado" && <Botao icone="eye-off" carregando={publicando} onClick={() => publicar("despublicar")}>Despublicar</Botao>}
        {/* Publicado e em dia: nada a fazer, e um botão roxo pedindo clique sem
            efeito visível é pior que a ausência dele. */}
        {(status !== "publicado" || pendente) && (
          <BotaoPublicar icone="world-www" onPublicar={() => publicar("publicar")}>
            {status === "publicado" ? "Publicar alterações" : "Publicar"}
          </BotaoPublicar>
        )}
      </div>
    </header>

    <div className="cte-barra">
      <div className="tab-strip cte-abas">
        <button className="ui-btn" data-t="md" data-v={aba === "tutoriais" ? "primario" : "sutil"} onClick={() => setAba("tutoriais")}>Tutoriais <span>{doc.tutoriais.length}</span></button>
        <button className="ui-btn" data-t="md" data-v={aba === "categorias" ? "primario" : "sutil"} onClick={() => setAba("categorias")}>Categorias <span>{doc.categorias.length}</span></button>
        <button className="ui-btn" data-t="md" data-v={aba === "ideias" ? "primario" : "sutil"} onClick={() => setAba("ideias")}>Ideias <span>{doc.reels.length}</span></button>
        <button className="ui-btn" data-t="md" data-v={aba === "depoimentos" ? "primario" : "sutil"} onClick={() => setAba("depoimentos")}>Depoimentos <span>{doc.depoimentos.length}</span></button>
        <button className="ui-btn" data-t="md" data-v={aba === "feedback" ? "primario" : "sutil"} onClick={() => setAba("feedback")}>Feedback <span>{metricas.reduce((a, m) => a + m.uteis + m.inuteis, 0)}</span></button>
      </div>
      {/* Com a lista vazia o botão some daqui: o cartão de vazio já carrega o
          MESMO convite — dois botões roxos pro mesmo fim é um a mais. */}
      {aba === "tutoriais" && doc.tutoriais.length > 5 && (
        <label className="cte-filtro">
          <Icon name="search" size={15} />
          <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar tutoriais…" type="search" aria-label="Filtrar tutoriais" />
          {filtrando && <BotaoIcone icone="circle-x" titulo="Limpar filtro" tamanho="sm" onClick={() => setFiltro("")} />}
        </label>
      )}
      {aba === "categorias" && doc.categorias.length > 0 && faltamSugeridas.length > 0 && (
        <Botao icone="sparkles" onClick={usarSugeridas} title={faltamSugeridas.map((c) => c.nome).join(", ")}>Adicionar sugeridas</Botao>
      )}
      {aba === "tutoriais" && doc.tutoriais.some((t) => t.status !== "publicado") && (
        <Botao icone="world-www" carregando={publicando}
          onClick={() => publicarTutoriais(doc.tutoriais.filter((t) => t.status !== "publicado").map((t) => t.id), true)}>
          Publicar todos ({doc.tutoriais.filter((t) => t.status !== "publicado").length})
        </Botao>
      )}
      {(aba === "tutoriais" || aba === "categorias") && (aba === "tutoriais" ? doc.tutoriais : doc.categorias).length > 0 && (
        <Botao variante="primario" icone="plus" onClick={() => aba === "tutoriais" ? setTutorialEditando(vazioTutorial(doc.tutoriais.length)) : setCategoriaEditando({ nome: "", imagemUrl: "", ativa: true, ordem: doc.categorias.length })}>
          {aba === "tutoriais" ? "Novo tutorial" : "Nova categoria"}
        </Botao>
      )}
    </div>

    {aba === "feedback" ? (
      <FeedbackTutoriais tutoriais={doc.tutoriais} metricas={metricas} />
    ) : aba === "ideias" ? (
      <ListaIdeias reels={doc.reels} salvando={salvando} onSalvar={(reels, m) => persistir({ ...doc, reels }, m)} />
    ) : aba === "depoimentos" ? (
      <ListaDepoimentos depoimentos={doc.depoimentos} salvando={salvando} upload={upload} onSalvar={(depoimentos, m) => persistir({ ...doc, depoimentos }, m)} />
    ) : aba === "categorias" ? (
      <div className="cte-lista">
        {arrastoCat.ordenar(doc.categorias).map((c, i) => (
          <div className="cte-linha" key={c.id} ref={arrastoCat.linha(c.id)} data-arrastando={arrastoCat.arrastando === c.id ? "1" : undefined}>
            <span className="cte-puxador" title="Arraste para reordenar" {...arrastoCat.puxador(c.id)}><Icon name="grip-vertical" size={16} /></span>
            <span className="cte-miniatura">{c.imagemUrl ? <img src={c.imagemUrl} alt="" /> : <Icon name="photo" size={18} />}</span>
            <span><strong>{c.nome}</strong><small>{c.ativa ? "Visível na central" : "Oculta — não aparece na página"}</small></span>
            <AcoesOrdem primeiro={i === 0} ultimo={i === doc.categorias.length - 1}
              onCima={() => persistir({ ...doc, categorias: reordenarItem(doc.categorias, c.id, -1) })}
              onBaixo={() => persistir({ ...doc, categorias: reordenarItem(doc.categorias, c.id, 1) })}
              onEditar={() => setCategoriaEditando(c)} onExcluir={() => excluirCategoria(c)} />
          </div>
        ))}
        {!doc.categorias.length && (
          <div className="cte-vazio-cartao">
            <span className="cte-vazio-icone"><Icon name="folder" size={26} color="var(--primary-texto)" /></span>
            <strong>Nenhuma categoria ainda</strong>
            <p>Categorias viram os círculos com foto no topo da central. Separe pelo que a pessoa TEM — Embalagens, Sabonete, Cerâmica, Madeira, Limpeza — e não por "Carimbos": quem visita toca no círculo e vê só os tutoriais daquele material.</p>
            <Botao variante="primario" icone="sparkles" onClick={usarSugeridas}>Usar as sugeridas</Botao>
            <Botao icone="plus" onClick={() => setCategoriaEditando({ nome: "", imagemUrl: "", ativa: true, ordem: 0 })}>Criar do zero</Botao>
          </div>
        )}
      </div>
    ) : (
      <div className="cte-lista">
        {arrastoTut.ordenar(tutoriaisVisiveis).map((t) => (
          <div className="cte-linha cte-linha-tutorial" key={t.id} ref={filtrando ? undefined : arrastoTut.linha(t.id)} data-arrastando={arrastoTut.arrastando === t.id ? "1" : undefined}>
            {filtrando ? <span className="cte-puxador" data-inerte="1" /> : <span className="cte-puxador" title="Arraste para reordenar" {...arrastoTut.puxador(t.id)}><Icon name="grip-vertical" size={16} /></span>}
            <span className="cte-capa-mini">{t.capaUrl ? <img src={t.capaUrl} alt="" /> : <Icon name="photo" size={18} />}</span>
            <span>
              {/* O título abre a edição: até agora o único caminho era mirar
                  num lápis de 15px, e a linha inteira parecia inerte. */}
              <button type="button" className="cte-linha-titulo" onClick={() => setTutorialEditando(t)}>
                <strong>{t.titulo || "Sem título"}{t.destaque && <Icon name="star" size={13} color="var(--atencao)" />}</strong>
              </button>
              <small className="cte-etiquetas">
                <span className="cte-chip" data-ok={t.status === "publicado" ? "1" : undefined}>{t.status === "publicado" ? "Publicado" : "Rascunho"}</span>
                {nomeCategoria(t.categoriaId) && <span className="cte-chip">{nomeCategoria(t.categoriaId)}</span>}
                {t.tipoMidia && <span className="cte-chip">{FORMATOS[t.tipoMidia]}</span>}
                {t.duracaoMinutos ? <span className="cte-chip">{t.duracaoMinutos} min</span> : t.quantidadeEtapas ? <span className="cte-chip">{t.quantidadeEtapas} etapas</span> : null}
                {t.selo && <span className="cte-chip">{t.selo === "novo" ? "Novo" : "Mais acessado"}</span>}
                {/* Número só aparece quando existe: "0 leituras" num tutorial
                    recém-criado é ruído, não informação. */}
                <Metricas dados={porHandle.get(t.handle)} />
              </small>
            </span>
            <span className="cte-acoes">
              <a href={`/previa/tutoriais/${bot.id}/${t.handle}`} target="_blank" rel="noreferrer" aria-label={`Abrir prévia de ${t.titulo || "tutorial"}`} title="Abrir prévia"><Icon name="eye" size={15} /></a>
              <BotaoIcone icone={t.status === "publicado" ? "eye-off" : "world-www"} disabled={publicando}
                titulo={t.status === "publicado" ? "Tirar do ar" : "Publicar"}
                onClick={() => publicarTutoriais([t.id], t.status !== "publicado")} />
              <BotaoIcone icone="copy-plus" titulo="Duplicar" onClick={() => duplicarTutorial(t)} />
              {!filtrando && <>
                <BotaoIcone icone="arrow-up" titulo="Mover para cima" disabled={doc.tutoriais[0]?.id === t.id} onClick={() => persistir({ ...doc, tutoriais: reordenarItem(doc.tutoriais, t.id, -1) })} />
                <BotaoIcone icone="arrow-down" titulo="Mover para baixo" disabled={doc.tutoriais[doc.tutoriais.length - 1]?.id === t.id} onClick={() => persistir({ ...doc, tutoriais: reordenarItem(doc.tutoriais, t.id, 1) })} />
              </>}
              <BotaoIcone icone="pencil" titulo="Editar" onClick={() => setTutorialEditando(t)} />
              <BotaoIcone icone="trash" titulo="Excluir" onClick={async () => { if (await confirmar(`Excluir “${t.titulo || "este tutorial"}”?`, { perigo: true })) await persistir({ ...doc, tutoriais: doc.tutoriais.filter((x) => x.id !== t.id) }, "Tutorial excluído."); }} />
            </span>
          </div>
        ))}
        {filtrando && !tutoriaisVisiveis.length && (
          <div className="cte-vazio-cartao">
            <span className="cte-vazio-icone"><Icon name="search" size={24} color="var(--primary-texto)" /></span>
            <strong>Nenhum tutorial com “{filtro}”</strong>
            <p>O filtro procura no título, na descrição e nas palavras-chave.</p>
            <Botao icone="circle-x" onClick={() => setFiltro("")}>Limpar filtro</Botao>
          </div>
        )}
        {!doc.tutoriais.length && (
          <div className="cte-vazio-cartao">
            <span className="cte-vazio-icone"><Icon name="sparkles" size={26} color="var(--primary-texto)" /></span>
            <strong>Monte o seu primeiro tutorial</strong>
            <p>Comece pela dúvida que mais se repete — um tutorial leva poucos minutos.</p>
            <div className="cte-passos">
              {([["pencil", "Título e capa", "O card que aparece na central."],
                 ["list-check", "Blocos de conteúdo", "Texto, passo a passo, vídeo, produto, link."],
                 ["world-www", "Publique", "O guia entra no ar no seu link /p/…"]] as const).map(([icone, titulo, texto], i) => (
                <div className="cte-passo" key={titulo}>
                  <span className="cte-passo-n">{i + 1}</span>
                  <Icon name={icone} size={16} color="var(--primary-texto)" />
                  <strong>{titulo}</strong>
                  <small>{texto}</small>
                </div>
              ))}
            </div>
            <div className="cte-vazio-acoes">
              <Botao variante="primario" icone="plus" onClick={() => setTutorialEditando(vazioTutorial(0))}>Criar tutorial</Botao>
              {!doc.categorias.length && <Botao icone="folder" onClick={() => setCategoriaEditando({ nome: "", imagemUrl: "", ativa: true, ordem: 0 })}>Criar categoria</Botao>}
            </div>
          </div>
        )}
      </div>
    )}

    {configAberta && <ConfigForm nome={nome} slug={slug} host={host} titulo={doc.titulo} subtitulo={doc.subtitulo} sobrelinha={doc.sobrelinha} mostrarTitulo={doc.mostrarTitulo} catalogoLoja={doc.catalogoLoja} catalogoRotulo={doc.catalogoRotulo} lojas={lojas} atalhos={doc.atalhos} whatsapp={doc.whatsapp} todosImagemUrl={doc.todosImagemUrl} todosRotulo={doc.todosRotulo} upload={upload} catalogoUrl={catalogoUrl} salvando={salvando} onFechar={() => setConfigAberta(false)} onSalvar={salvarConfig} />}
    {categoriaEditando && <CategoriaForm valor={categoriaEditando} salvando={salvando} onFechar={() => setCategoriaEditando(null)} onSalvar={salvarCategoria} upload={upload} />}
    {tutorialEditando && <TutorialForm valor={tutorialEditando} raizPublica={linkPublico} categorias={doc.categorias} produtos={produtos} salvando={salvando} handles={handles.filter((h) => h !== tutorialEditando.handle)} onFechar={() => setTutorialEditando(null)} onSalvar={salvarTutorial} onUpload={upload} />}
  </section>;
}

function AcoesOrdem({ primeiro, ultimo, onCima, onBaixo, onEditar, onExcluir }: { primeiro: boolean; ultimo: boolean; onCima: () => void; onBaixo: () => void; onEditar: () => void; onExcluir: () => void }) {
  return <span className="cte-acoes">
    <BotaoIcone icone="arrow-up" titulo="Mover para cima" disabled={primeiro} onClick={onCima} />
    <BotaoIcone icone="arrow-down" titulo="Mover para baixo" disabled={ultimo} onClick={onBaixo} />
    <BotaoIcone icone="pencil" titulo="Editar" onClick={onEditar} />
    <BotaoIcone icone="trash" titulo="Excluir" onClick={onExcluir} />
  </span>;
}

// ── Configurações da central ─────────────────────────────────────────────────
type ValorConfig = { nome: string; slug: string; titulo: string; subtitulo: string; sobrelinha: string; mostrarTitulo: boolean; catalogoLoja: string; catalogoRotulo: string; lojaUrl: string; whatsapp: string; todosImagemUrl: string; todosRotulo: string };

function ConfigForm({ nome, slug, host, titulo, subtitulo, sobrelinha, mostrarTitulo, catalogoLoja, catalogoRotulo, lojas, atalhos, whatsapp, todosImagemUrl, todosRotulo, upload, catalogoUrl, salvando, onFechar, onSalvar }: {
  nome: string; slug: string; host: string; titulo: string; subtitulo: string; sobrelinha: string; mostrarTitulo: boolean;
  catalogoLoja: string; catalogoRotulo: string; lojas: VitrinePublicada[];
  atalhos: AtalhoCentral[]; whatsapp: string; todosImagemUrl: string; todosRotulo: string;
  upload: (f: File) => Promise<string>; catalogoUrl?: string; salvando: boolean;
  onFechar: () => void; onSalvar: (v: ValorConfig) => void;
}) {
  const [v, setV] = useState<ValorConfig>({ nome, slug, titulo, subtitulo, sobrelinha, mostrarTitulo, catalogoLoja, catalogoRotulo, lojaUrl: lojaDosAtalhos(atalhos), whatsapp, todosImagemUrl, todosRotulo });
  const foraDaTrava = host !== DOMINIO_DOS_TUTORIAIS;
  return (
    <PainelLateral titulo="Configurações da central" subtitulo="Nome interno, endereço e o cabeçalho que o público vê." soFechaNoX largura={480} onFechar={onFechar}
      rodape={<Acoes><Botao onClick={onFechar}>Cancelar</Botao><Esp /><Botao variante="primario" icone="check" carregando={salvando} disabled={!v.nome.trim() || !v.slug.trim()} onClick={() => onSalvar({ ...v, nome: v.nome.trim(), slug: v.slug.trim() })}>Salvar</Botao></Acoes>}>
      <Campos min={999}>
        <Campo label="Nome interno" dica="Só aparece aqui na plataforma.">
          {(id) => <input id={id} value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} />}
        </Campo>
        {/* O domínio não é mais escolha de tela: o link do site de tutoriais
            circula em QR impresso, etiqueta e ficha de produto, e trocar o
            endereço apaga tudo isso de uma vez (host com dono só serve o que
            foi marcado pra ele). A trava de verdade é no banco
            (supabase/tutoriais_dominio_travado.sql); aqui só não se oferece o
            que não pode. O "Testar link" do cabeçalho continua sendo quem
            responde se o DNS aponta pra esta aplicação. */}
        <Campo label="Domínio" dica={foraDaTrava
          ? `Fixo em ${DOMINIO_DOS_TUTORIAIS} — esta central está publicada em outro endereço. Rode supabase/tutoriais_dominio_travado.sql para corrigir.`
          : "Fixo: o QR impresso e os links já divulgados apontam pra cá. Mudar o endereço faz todos eles pararem de abrir."}>
          {(id) => <div id={id} style={{ display: "flex", alignItems: "center", gap: 7, minHeight: "var(--tap)", minWidth: 0, fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
            <Icon name="lock" size={15} color={foraDaTrava ? "var(--atencao)" : "var(--text-dim)"} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{host}</span>
          </div>}
        </Campo>
        <Campo label="Endereço público" dica={`O link fica https://${host}/p/${v.slug || "<endereço>"}.`}>
          {(id) => <input id={id} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />}
        </Campo>
        <Campo label="Sobrelinha" dica="A linha pequena acima do título. Vazia = não aparece.">
          {(id) => <input id={id} value={v.sobrelinha} maxLength={60} placeholder="Ex.: Aprenda no seu ritmo" onChange={(e) => setV({ ...v, sobrelinha: e.target.value })} />}
        </Campo>
        <Campo label="Título exibido" dica="O título grande no topo da página pública.">
          {(id) => <input id={id} value={v.titulo} disabled={!v.mostrarTitulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} />}
        </Campo>
        <Campo label="Subtítulo" dica="Vazio = não aparece.">
          {(id) => <input id={id} value={v.subtitulo} onChange={(e) => setV({ ...v, subtitulo: e.target.value })} />}
        </Campo>
        <Campo label="Nome do cartão “Todos”" dica="Vazio = “Todos”.">
          {(id) => <input id={id} value={v.todosRotulo} maxLength={40} placeholder="Todos" onChange={(e) => setV({ ...v, todosRotulo: e.target.value })} />}
        </Campo>
        {/* Sem foto própria o círculo é um mosaico das três primeiras capas —
            que fica ruim quando elas se parecem ou quando ainda não há capa. */}
        <Campo label="Foto do cartão “Todos”" dica="Quadrada fica melhor — ela preenche o cartão.">
          {(id) => <CampoArquivo id={id} accept="image/jpeg,image/png,image/webp,image/gif" rotulo="Escolher foto" enviar={upload} aoEnviar={(url) => setV({ ...v, todosImagemUrl: url })} />}
        </Campo>
      </Campos>
      {v.todosImagemUrl && <div className="cte-todos-previa">
        <img src={v.todosImagemUrl} alt="Prévia do cartão Todos" />
        <Botao tamanho="sm" icone="trash" onClick={() => setV({ ...v, todosImagemUrl: "" })}>Remover foto</Botao>
      </div>}
      {/* O catálogo é uma gaveta da central: os produtos da vitrine aparecem
          DENTRO dela, com botão de compra que leva ao checkout da loja. */}
      <Campos>
        <Campo label="Catálogo de produtos" dica={lojas.length ? "Os produtos da vitrine escolhida viram uma gaveta na central, com botão de compra." : "Nenhuma vitrine publicada — publique uma loja para ligar o catálogo."}>
          {(id) => <GlassSelect id={id} value={v.catalogoLoja} onChange={(x) => setV({ ...v, catalogoLoja: x })}
            options={[{ value: "", label: "Sem catálogo" }, ...lojas.map((l) => ({ value: l.slug, label: l.nome }))]} />}
        </Campo>
        <Campo label="Nome do catálogo" dica="Vazio = “Catálogo”.">
          {(id) => <input id={id} value={v.catalogoRotulo} maxLength={40} placeholder="Catálogo" disabled={!v.catalogoLoja} onChange={(e) => setV({ ...v, catalogoRotulo: e.target.value })} />}
        </Campo>
      </Campos>

      {/* Desligar o título é escolha de quem edita: tem central que quer só os
          cartões. Com sobrelinha, título e subtítulo vazios, o cabeçalho
          inteiro sai da página. */}
      <label className="cte-check"><Caixa marcado={v.mostrarTitulo} onChange={(marc) => setV({ ...v, mostrarTitulo: marc })} /><span>Mostrar o título grande na página</span></label>
      <BarraRodapeForm lojaUrl={v.lojaUrl} whatsapp={v.whatsapp} temCatalogo={!!v.catalogoLoja} catalogoUrl={catalogoUrl} onMudar={(m) => setV({ ...v, ...m })} />
    </PainelLateral>
  );
}

// ── Categoria ────────────────────────────────────────────────────────────────
function CategoriaForm({ valor, salvando, onFechar, onSalvar, upload }: {
  valor: Partial<TutorialCategoria>; salvando: boolean; onFechar: () => void;
  onSalvar: (c: TutorialCategoria) => void; upload: (f: File) => Promise<string>;
}) {
  const [v, setV] = useState<Partial<TutorialCategoria>>(valor);
  const salvar = () => {
    if (!v.nome?.trim()) return toast.erro("Dê um nome à categoria.");
    onSalvar({ id: v.id || idNovo(), nome: v.nome.trim(), imagemUrl: v.imagemUrl || "", ativa: v.ativa !== false, ordem: v.ordem ?? 0 });
  };
  return (
    <PainelLateral titulo={v.id ? "Editar categoria" : "Nova categoria"} subtitulo="A foto vira o círculo no topo da central." soFechaNoX largura={440} onFechar={onFechar}
      rodape={<Acoes><Botao onClick={onFechar}>Cancelar</Botao><Esp /><Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar categoria</Botao></Acoes>}>
      <Campos min={999}>
        <Campo label="Nome">
          {(id) => <input id={id} value={v.nome ?? ""} autoFocus onChange={(e) => setV({ ...v, nome: e.target.value })} placeholder="Ex.: Carimbos" />}
        </Campo>
        <Campo label="Foto" dica="Quadrada fica melhor — ela preenche o cartão.">
          {(id) => <CampoArquivo id={id} accept="image/jpeg,image/png,image/webp,image/gif" rotulo="Escolher foto" enviar={upload} aoEnviar={(url) => setV({ ...v, imagemUrl: url })} />}
        </Campo>
      </Campos>
      {v.imagemUrl && <img className="cte-previa-cat" src={v.imagemUrl} alt="Prévia da categoria" />}
      <label className="cte-check"><Caixa marcado={v.ativa !== false} onChange={(marc) => setV({ ...v, ativa: marc })} /><span>Visível na central</span></label>
    </PainelLateral>
  );
}

// ── Tutorial ─────────────────────────────────────────────────────────────────
// O essencial (título, categoria, capa, conteúdo) fica à mostra; endereço,
// duração, selo e afins moram em "Mais opções" — revelação progressiva.
function TutorialForm({ valor, raizPublica, categorias, produtos, handles, salvando, onFechar, onSalvar, onUpload }: {
  valor: Tutorial;
  /** Link da central; o do tutorial é ela + "/" + handle. */
  raizPublica: string;
  categorias: TutorialCategoria[]; produtos: CatalogoProduto[]; handles: string[]; salvando: boolean;
  onFechar: () => void; onSalvar: (v: Tutorial) => void; onUpload: (f: File) => Promise<string>;
}) {
  const [v, setV] = useState(valor);
  const [handleSolto, setHandleSolto] = useState(!!valor.titulo);
  const [maisAberto, setMaisAberto] = useState(false);
  const novo = !valor.titulo;
  const mudarTitulo = (titulo: string) => setV({ ...v, titulo, handle: handleSolto ? v.handle : handleDoTutorial(titulo, handles) });
  const linkTutorial = `${raizPublica}/${v.handle || "<endereço>"}`;
  const copiar = async () => {
    try { await navigator.clipboard.writeText(linkTutorial); toast.ok("Link do tutorial copiado."); }
    catch { toast.erro("Não deu para copiar."); }
  };
  const salvar = () => {
    if (!v.titulo.trim()) return toast.erro("Dê um título ao tutorial.");
    if (!v.handle.trim()) return toast.erro("Defina o endereço do tutorial.");
    onSalvar(v);
  };
  return (
    <PainelLateral titulo={novo ? "Novo tutorial" : "Editar tutorial"} subtitulo={novo ? "Título, capa e blocos de conteúdo — o resto é opcional." : v.titulo} soFechaNoX centrado largura={720} onFechar={onFechar}
      /* Rodapé PRÓPRIO em vez do `<Acoes>` da fundação: ela inverte a coluna no
         celular (confirmar sobe, cancelar desce) e, com um terceiro item no
         meio, a inversão jogava o "Visível na central" ENTRE os dois botões —
         a opção parecia pertencer ao Cancelar. Aqui a ordem do celular é
         escrita à mão: opção, ação principal, escape. */
      rodape={<div className="cte-rodape">
        <Botao className="cte-rodape-cancelar" onClick={onFechar}>Cancelar</Botao>
        <span className="cte-rodape-esp" />
        <label className="cte-check cte-check-rodape"><Caixa marcado={v.status === "publicado"} onChange={(marc) => setV({ ...v, status: marc ? "publicado" : "rascunho" })} /><span>Visível na central</span></label>
        <Botao className="cte-rodape-salvar" variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar tutorial</Botao>
      </div>}>
      <Campos>
        <Campo label="Título" largo>
          {(id) => <input id={id} value={v.titulo} autoFocus onChange={(e) => mudarTitulo(e.target.value)} placeholder="Ex.: Como configurar seu carimbo" />}
        </Campo>
        <Campo label="Categoria">
          {(id) => <GlassSelect id={id} value={v.categoriaId ?? ""} onChange={(x) => setV({ ...v, categoriaId: x || null })} options={[{ value: "", label: "Sem categoria" }, ...categorias.map((c) => ({ value: c.id, label: c.nome }))]} />}
        </Campo>
        <Campo label="Capa" dica="Aparece grande no card da central.">
          {(id) => <CampoArquivo id={id} accept="image/jpeg,image/png,image/webp,image/gif" rotulo="Escolher capa" enviar={onUpload} aoEnviar={(url) => setV({ ...v, capaUrl: url })} />}
        </Campo>
      </Campos>
      {v.capaUrl && <img className="cte-previa-capa" src={v.capaUrl} alt="Prévia da capa" />}
      <Campo label="Descrição" dica="Uma frase curta embaixo do título." largo>
        {(id) => <textarea id={id} rows={2} value={v.descricao} onChange={(e) => setV({ ...v, descricao: e.target.value })} />}
      </Campo>

      <div>
        <span className="cte-rotulo">Conteúdo</span>
        <EditorBlocosTutorial blocos={v.blocos} produtos={produtos} onMudar={(blocos) => setV({ ...v, blocos })} onUpload={onUpload} />
      </div>

      {/* Era `<details>`: abria de corte seco, porque não há altura para
          animar. A sanfona da fundação cresce por `grid-template-rows` e a
          seta vira — mesma receita do resto do app. */}
      <div className="cte-mais t-acc" data-open={maisAberto ? "true" : "false"}>
        <button type="button" className="cte-mais-abre t-acc-head" aria-expanded={maisAberto} onClick={() => setMaisAberto((x) => !x)}>
          <Icon name="adjustments-horizontal" size={15} />Mais opções <small>endereço, duração, selo, destaque</small>
          <span className="t-acc-chevron"><Icon name="chevron-down" size={15} /></span>
        </button>
        <div className="t-acc-panel"><div className="t-acc-panel-inner"><div className="cte-mais-corpo">
          <Campos>
            {/* O endereço final por extenso, com botão de copiar: mandar o
                tutorial pra alguém no WhatsApp era remontar o link na mão. */}
            <Campo label="Endereço" dica={`Link do tutorial: ${linkTutorial.replace("https://", "")}`}>
              {(id) => <span className="cte-endereco">
                <input id={id} value={v.handle} onChange={(e) => { setHandleSolto(true); setV({ ...v, handle: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }); }} />
                <BotaoIcone icone="copy" titulo="Copiar link do tutorial" tamanho="sm" onClick={copiar} />
              </span>}
            </Campo>
            <Campo label="Formato" dica="Automático escolhe pelo conteúdo.">
              {(id) => <GlassSelect id={id} value={v.tipoMidia ?? ""} onChange={(x) => setV({ ...v, tipoMidia: (x || null) as Tutorial["tipoMidia"] })} options={[{ value: "", label: "Automático" }, { value: "leitura", label: "Leitura" }, { value: "video", label: "Vídeo" }, { value: "passos", label: "Passo a passo" }]} />}
            </Campo>
            <Campo label="Duração em minutos">
              {(id) => <input id={id} type="number" min="1" value={v.duracaoMinutos ?? ""} onChange={(e) => setV({ ...v, duracaoMinutos: e.target.value ? Number(e.target.value) : null })} />}
            </Campo>
            <Campo label="Quantidade de etapas">
              {(id) => <input id={id} type="number" min="1" value={v.quantidadeEtapas ?? ""} onChange={(e) => setV({ ...v, quantidadeEtapas: e.target.value ? Number(e.target.value) : null })} />}
            </Campo>
            <Campo label="Palavras-chave" dica="Ajudam a busca da central. Separe por vírgula." largo>
              {(id) => <input id={id} value={v.palavrasChave.join(", ")} onChange={(e) => setV({ ...v, palavrasChave: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />}
            </Campo>
            <Campo label="Selo">
              {(id) => <GlassSelect id={id} value={v.selo ?? ""} onChange={(x) => setV({ ...v, selo: (x || null) as Tutorial["selo"] })} options={[{ value: "", label: "Sem selo" }, { value: "novo", label: "Novo" }, { value: "mais_acessado", label: "Mais acessado" }]} />}
            </Campo>
          </Campos>
          <label className="cte-check"><Caixa marcado={v.destaque} onChange={(marc) => setV({ ...v, destaque: marc })} /><span>Mostrar como destaque (aparece primeiro)</span></label>
        </div></div></div>
      </div>
    </PainelLateral>
  );
}


// ── Barra do rodapé ──────────────────────────────────────────────────────────
// A barra da página pública é FIXA: Tutoriais · Loja · Contato. Aqui só se
// diz PRA ONDE Loja e Contato levam. Sem loja e sem WhatsApp sobra só
// "Tutoriais" — e barra de um botão não aparece (era por isso que a central
// ficava sem barra nenhuma).
/** O link da loja guardado como o único atalho configurado (`atalhosPadrao`
 *  empresta a URL dele). */
function atalhosDaLoja(url: string): AtalhoCentral[] {
  const u = url.trim();
  return u ? [{ id: "_loja", rotulo: "Loja", icone: "shopping-bag", acao: "link", url: u, destaque: true }] : [];
}
/** A URL da loja que a central já tem, venha do atalho novo ou de um antigo. */
function lojaDosAtalhos(atalhos: AtalhoCentral[]): string {
  return atalhosPadrao(undefined, undefined, atalhos).find((a) => a.id === "_catalogo")?.url ?? "";
}

function BarraRodapeForm({ lojaUrl, whatsapp, temCatalogo, catalogoUrl, onMudar }: {
  lojaUrl: string; whatsapp: string; temCatalogo: boolean;
  /** Endereço da vitrine publicada, quando existe uma só — vira o "usar". */
  catalogoUrl?: string;
  onMudar: (m: { lojaUrl?: string; whatsapp?: string }) => void;
}) {
  const loja = lojaUrl.trim() || (temCatalogo ? "?c=_catalogo" : "");
  const zap = numeroWhatsapp(whatsapp);
  const itens = [
    { rotulo: "Tutoriais", icone: "home", ok: true, destaque: false },
    { rotulo: "Loja", icone: "shopping-bag", ok: !!loja, destaque: true },
    { rotulo: "Contato", icone: "brand-whatsapp", ok: !!zap, destaque: false },
  ];
  const aparece = itens.filter((i) => i.ok).length > 1;
  return <section className="cte-atalhos">
    <div className="cte-atalhos-topo">
      <div>
        <strong>Barra do rodapé</strong>
        <small>Sempre Tutoriais · Loja · Contato. Diga pra onde a Loja e o Contato levam — sem nenhum dos dois, a barra não aparece.</small>
      </div>
    </div>
    {/* Prévia da barra: botão sem destino aparece apagado, riscado. */}
    <div className="cte-barra-previa" data-some={aparece ? undefined : "1"} aria-hidden="true">
      {itens.map((i) => <span key={i.rotulo} data-destaque={i.destaque ? "1" : undefined} data-falta={i.ok ? undefined : "1"}>
        <Icon name={i.icone} size={18} />{i.rotulo}
      </span>)}
    </div>
    {!aparece && <p className="cte-atalhos-vazio">Hoje a barra não aparece na página: preencha a Loja ou o WhatsApp.</p>}
    <Campos>
      <Campo label="Link da loja" dica={temCatalogo ? "Vazio = abre o catálogo da própria central." : "O site ou a loja onde a pessoa compra."}>
        {(id) => <input id={id} type="url" inputMode="url" value={lojaUrl} placeholder="https://www.carimbostridii.com.br" onChange={(e) => onMudar({ lojaUrl: e.target.value })} />}
      </Campo>
      <Campo label="WhatsApp" dica="Com DDD. Vira o botão Contato e o “Não achou o que procurava?”.">
        {(id) => <input id={id} type="tel" inputMode="tel" value={whatsapp} placeholder="(11) 99999-9999" onChange={(e) => onMudar({ whatsapp: e.target.value })} />}
      </Campo>
    </Campos>
    {!lojaUrl && catalogoUrl && !temCatalogo && (
      <Botao tamanho="sm" icone="shopping-bag" onClick={() => onMudar({ lojaUrl: catalogoUrl })}>Usar a vitrine publicada</Botao>
    )}
  </section>;
}

/** Abaixo disto o percentual é sorteio, não diagnóstico: um único "Ainda não"
 *  pintava o guia de vermelho com "0%", e quem editava não tinha como saber
 *  que era um voto só. Até a base chegar, o chip mostra o número sem cor. */
const VOTOS_PARA_VEREDITO = 5;

/** Leituras e proveito de um tutorial. O proveito é `null` até alguém votar —
 *  0 de 0 não é 0%, e mostrar 0% queimaria um guia que ninguém avaliou. */
function Metricas({ dados }: { dados?: MetricaTutorial }) {
  const proveito = proveitoDe(dados);
  if (!dados?.vistas && proveito === null) return null;
  const votos = (dados?.uteis ?? 0) + (dados?.inuteis ?? 0);
  const veredito = votos >= VOTOS_PARA_VEREDITO;
  return <>
    {dados?.vistas ? <span className="cte-chip" title={`${dados.vistas} leituras`}><Icon name="eye" size={12} />{dados.vistas}</span> : null}
    {proveito !== null && (
      // A base fica À VISTA: no `title` ela só existia pra quem passa o mouse,
      // e no celular "0%" de um voto e "0%" de quarenta eram o mesmo chip.
      <span className="cte-chip" data-ok={veredito && proveito >= 70 ? "1" : undefined} data-alerta={veredito && proveito < 50 ? "1" : undefined}>
        <Icon name={proveito >= 50 ? "mood-smile" : "mood-sad"} size={12} />{proveito}% resolveu · {votos} {votos === 1 ? "voto" : "votos"}
      </span>
    )}
  </>;
}
