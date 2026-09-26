"use client";

// ── TridiFlow · editor do LinkTridi ──────────────────────────────────────────
// Três abas no lugar de uma coluna só: Cartões (o que muda toda semana),
// Aparência (a cara da página) e Ajustes (o que se configura uma vez: se está
// no ar, o endereço, a prévia do link e o pixel). A prévia ao lado é a MESMA
// peça do player publicado (LinkTridiRuntime) — o que se vê aqui é o que o
// seguidor vê no link.
//
// O LinkTridi publicado lê o RASCUNHO (a config vem do draft, ver
// `lerBotPublicado` em lib/tridiflow-db.ts), então com ele no ar, salvar É
// publicar. A tela diz isso ("No ar · Salvo às 14:32") em vez do "Republicar"
// de antes, que não mudava nada. A exceção é o endereço: fica FORA do
// auto-save, porque trocar o slug no ar derrubava o link da bio no meio da
// digitação — cada tecla ia pro banco.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "../../../Icon";
import { confirmar, toast } from "../../../Toast";
import { Abas } from "../../../ui/Abas";
import { Acoes, Botao, BotaoIcone, Campo, Esp, PainelLateral } from "../../../ui/controles";
import { BotaoPublicar } from "../../../ui/BotaoPublicar";
import { GlassSelect } from "../../../GlassPicker";
import { ResultadosClient } from "../../../tridiflow/[id]/resultados/ResultadosClient";
import { LinkTridiRuntime } from "@/app/f/LinkTridiRuntime";
import type { BotSettings } from "@/lib/tridiflow";
import type { BotCompleto, Dominio } from "@/lib/tridiflow-db";
import {
  LINKTRIDI_PADRAO, digitarEnderecoLT, normalizarEnderecoLT, normalizarLinkTridi, problemaNoEnderecoLT,
  type LinkTridiDoc,
} from "@/lib/tridiflow-linktridi";
import { AjustesLT } from "./AjustesLT";
import { AparenciaLT } from "./AparenciaLT";
import { CartoesLT } from "./CartoesLT";
import { Aviso } from "./pecas";
import "./linktridi-editor.css";

const DOMINIO_PADRAO = "gedux.com.br";
const API = "/api/tridiflow/bots";
const JSON_H = { "Content-Type": "application/json" };

/** Copiar pode falhar (permissão negada, navegador embutido, `clipboard`
 *  ausente) — e falhar não pode derrubar o que vinha depois. */
async function copiarTexto(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}

/** O que o editor lê do projeto. Menos que o `BotCompleto` de propósito: o
 *  banco de provas monta um sem inventar fluxo, tema e página. */
export type BotDoEditorLT = Pick<BotCompleto, "id" | "nome" | "slug" | "dominioId" | "status" | "settings">;
type Salvamento = { fase: "ok"; em: Date | null } | { fase: "salvando" } | { fase: "erro"; msg: string };
type Folha = null | "compartilhar" | "endereco" | "resultados";

export function LinkTridiEditorClient({ initial, dominios, podeEditar = true }: { initial: BotDoEditorLT; dominios: Dominio[]; podeEditar?: boolean }) {
  const [settings, setSettings] = useState<BotSettings>(() => ({ ...initial.settings, linktridi: normalizarLinkTridi(initial.settings.linktridi) }));
  const [nome, setNome] = useState(initial.nome);
  const [slug, setSlug] = useState(initial.slug);
  const [dominioId, setDominioId] = useState<string | null>(initial.dominioId);
  const [status, setStatus] = useState(initial.status);
  const [publicando, setPublicando] = useState(false);
  const [folha, setFolha] = useState<Folha>(null);
  const noAr = status === "publicado";
  const host = dominios.find((d) => d.id === dominioId)?.host || DOMINIO_PADRAO;
  const link = `https://${host}/f/${slug}`;

  // Cliques por cartão (ultima_etapa das sessões = id do cartão clicado por
  // último). Sem a chave de analytics a pessoa só não vê o número.
  const [cliques, setCliques] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch(`/api/tridiflow/analytics?botId=${initial.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.porEtapa) return;
        setCliques(Object.fromEntries((d.porEtapa as { etapa: string; abandonos: number }[]).map((e) => [e.etapa, e.abandonos])));
      })
      .catch(() => {});
  }, [initial.id]);

  const doc = settings.linktridi ?? LINKTRIDI_PADRAO();
  const setDoc = useCallback((d: LinkTridiDoc) => setSettings((s) => ({ ...s, linktridi: d })), []);
  const { salvamento, salvarAgora } = useAutoSave(initial.id, podeEditar, nome, settings);

  async function publicar() {
    setPublicando(true);
    try {
      const r = await fetch(API, { method: "POST", headers: JSON_H, body: JSON.stringify({ acao: "publicar", id: initial.id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.erro(d.code === "caminho_em_uso" ? "Esse endereço já é de outro projeto — troque em Ajustes › Endereço." : d.error || "Não deu pra publicar.");
        return false;
      }
      setStatus("publicado");
      toast.ok((await copiarTexto(link)) ? "No ar! O link foi copiado." : "No ar!");
      return true;
    } catch { toast.erro("Sem conexão — não publicou."); return false; }
    finally { setPublicando(false); }
  }

  async function tirarDoAr() {
    const ok = await confirmar("Tirar o LinkTridi do ar?", {
      detalhe: "Quem abrir o link — inclusive pela bio do Instagram — vai ver “Este link não está disponível” até você publicar de novo.",
      perigo: true,
    });
    if (!ok) return;
    setPublicando(true);
    try {
      const r = await fetch(API, { method: "POST", headers: JSON_H, body: JSON.stringify({ acao: "despublicar", id: initial.id }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(d.error || "Não deu pra tirar do ar."); return; }
      setStatus("rascunho");
      toast.ok("Fora do ar.");
    } catch { toast.erro("Sem conexão — continua no ar."); }
    finally { setPublicando(false); }
  }

  // ⌘S / Ctrl+S: salva agora, sem esperar a pausa do auto-save.
  useEffect(() => {
    if (!podeEditar) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); salvarAgora(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [podeEditar, salvarAgora]);

  const ajustes = (
    <AjustesLT doc={doc} nome={nome} settings={settings} onSettings={setSettings}
      publicacao={{
        status, link, publicando,
        onPublicar: publicar, onTirarDoAr: tirarDoAr,
        onEndereco: () => setFolha("endereco"), onCompartilhar: () => setFolha("compartilhar"),
      }} />
  );

  return (
    <div className="lte-tela">
      <div className="lte-topo">
        <Link href="/marketing?aba=paginas&ver=linktridi" className="lte-voltar"><Icon name="chevron-left" size={18} />Todos os LinkTridi</Link>
        <input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do projeto (só aparece aqui na plataforma)"
          className="lte-nome" readOnly={!podeEditar} maxLength={80} />
        {podeEditar
          ? <Estado noAr={noAr} s={salvamento} onTentar={salvarAgora} />
          : <span className="lte-selo-leitura" title="Você não tem a permissão de editar o LinkTridi."><Icon name="lock" size={12} />só leitura</span>}
        <div className="lte-acoes">
          <Botao icone="chart-line" aria-label="Resultados" onClick={() => setFolha("resultados")}><span className="lte-rot-longo">Resultados</span></Botao>
          {noAr || !podeEditar
            ? <Botao variante={noAr ? "primario" : "secundario"} icone="share" onClick={() => setFolha("compartilhar")}>Compartilhar</Botao>
            : (
              <>
                <Botao icone="share" aria-label="Compartilhar" onClick={() => setFolha("compartilhar")}><span className="lte-rot-longo">Compartilhar</span></Botao>
                <BotaoPublicar onPublicar={publicar} />
              </>
            )}
        </div>
      </div>

      <LinkTridiEditor doc={doc} onChange={setDoc} cliques={cliques} somenteLeitura={!podeEditar} ajustes={ajustes} />

      {folha === "compartilhar" && (
        <FolhaCompartilhar link={link} noAr={noAr} podeEditar={podeEditar}
          onPublicar={publicar} onEndereco={() => setFolha("endereco")} onFechar={() => setFolha(null)} />
      )}
      {folha === "endereco" && (
        <FolhaEndereco id={initial.id} slugAtual={slug} dominioAtual={dominioId} dominios={dominios} noAr={noAr}
          onFechar={() => setFolha(null)}
          onSalvo={(novoSlug, novoDominio) => {
            setSlug(novoSlug); setDominioId(novoDominio); setFolha(null);
            const novo = `https://${dominios.find((d) => d.id === novoDominio)?.host || DOMINIO_PADRAO}/f/${novoSlug}`;
            if (!noAr) { toast.ok("Endereço salvo."); return; }
            void copiarTexto(novo).then((ok) => toast.ok(ok
              ? "Endereço trocado. O link novo foi copiado — cole na bio."
              : "Endereço trocado. Atualize o link na bio."));
          }} />
      )}
      {folha === "resultados" && <FolhaResultados botId={initial.id} nome={nome} onFechar={() => setFolha(null)} />}
    </div>
  );
}

// ── Auto-save ────────────────────────────────────────────────────────────────
// Um pedido por vez: mudança que chega com um pedido no ar espera ele voltar e
// sai em seguida com o estado MAIS NOVO. Antes, dois PATCH podiam cruzar e o
// mais velho chegar por último — o banco ficava com a versão anterior sem
// ninguém ver. O que foi salvo por último é a referência: voltar um campo ao
// valor salvo não gera pedido, e o modo estrito do React (efeito rodando duas
// vezes) também não.
function useAutoSave(id: string, pode: boolean, nome: string, settings: BotSettings) {
  const [salvamento, setSalvamento] = useState<Salvamento>({ fase: "ok", em: null });
  const atual = useRef({ nome, settings });
  atual.current = { nome, settings };
  const salvoPorUltimo = useRef(JSON.stringify({ nome, settings }));
  const voando = useRef(false);
  const deNovo = useRef(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enviar = useRef<() => Promise<void>>(async () => {});
  enviar.current = async () => {
    if (!pode) return;
    if (relogio.current) { clearTimeout(relogio.current); relogio.current = null; }
    if (voando.current) { deNovo.current = true; return; }
    const corpo = JSON.stringify(atual.current);
    if (corpo === salvoPorUltimo.current) return;
    voando.current = true;
    setSalvamento({ fase: "salvando" });
    let msg: string | null = null;
    try {
      // Só nome e settings. Endereço (slug/domínio) tem folha própria.
      const r = await fetch(API, { method: "PATCH", headers: JSON_H, body: JSON.stringify({ id, ...atual.current }) });
      if (r.ok) salvoPorUltimo.current = corpo;
      else {
        const j = await r.json().catch(() => ({}));
        msg = j.error || (r.status === 403 ? "Sem permissão pra salvar." : "O servidor recusou a alteração.");
      }
    } catch { msg = "Sem conexão."; }
    voando.current = false;
    if (deNovo.current) { deNovo.current = false; void enviar.current(); return; }
    setSalvamento(msg ? { fase: "erro", msg } : { fase: "ok", em: new Date() });
  };

  useEffect(() => {
    if (!pode) return;
    if (JSON.stringify({ nome, settings }) === salvoPorUltimo.current) return;
    relogio.current = setTimeout(() => void enviar.current(), 800);
    return () => { if (relogio.current) clearTimeout(relogio.current); };
  }, [nome, settings, pode]);

  // Fechar a aba com alteração a caminho perderia a alteração em silêncio.
  useEffect(() => {
    if (!pode) return;
    const segurar = (e: BeforeUnloadEvent) => {
      if (voando.current || JSON.stringify(atual.current) !== salvoPorUltimo.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [pode]);

  const salvarAgora = useCallback(() => { void enviar.current(); }, []);
  return { salvamento, salvarAgora };
}

function Estado({ noAr, s, onTentar }: { noAr: boolean; s: Salvamento; onTentar: () => void }) {
  const hora = s.fase === "ok" && s.em ? s.em.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <div className="lte-estado" aria-live="polite">
      <span className="lte-estado-selo" title={noAr ? "Com o LinkTridi no ar, o que você salva aparece no link em até 30 segundos." : "Ninguém vê esta página até você publicar."}>
        <span className="lte-ponto" data-no-ar={noAr ? "1" : undefined} />{noAr ? "No ar" : "Rascunho"}
      </span>
      {s.fase === "salvando" && <span className="lte-salvo">Salvando…</span>}
      {hora && <span className="lte-salvo">Salvo às {hora}</span>}
      {s.fase === "erro" && (
        <span className="lte-salvo" data-erro="1" title={s.msg}>
          <Icon name="alert-triangle" size={13} />Não salvou
          <Botao tamanho="sm" variante="sutil" onClick={onTentar}>Tentar de novo</Botao>
        </span>
      )}
    </div>
  );
}

// ── Corpo: abas + prévia ─────────────────────────────────────────────────────
// Exportado pro banco de provas e pro teste montarem o componente REAL — um
// mock à parte sempre acaba divergindo do que roda em produção.
type Aba = "cartoes" | "aparencia" | "ajustes" | "previa";

export function LinkTridiEditor({ doc, onChange, cliques, somenteLeitura, ajustes }: {
  doc: LinkTridiDoc; onChange: (d: LinkTridiDoc) => void; cliques?: Record<string, number>;
  /** Sem a chave `tridiflow:linktridi`: o conteúdo das abas fica `inert` (nada
   *  foca, nada clica) e a prévia continua viva pra pessoa conferir a página. */
  somenteLeitura?: boolean;
  /** Conteúdo da aba Ajustes — só o editor de verdade tem (precisa do projeto). */
  ajustes?: ReactNode;
}) {
  const [aba, setAba] = useState<Exclude<Aba, "previa">>("cartoes");
  const [verPrevia, setVerPrevia] = useState(false);
  const corpo = useRef<HTMLDivElement>(null);

  // Na tela larga a prévia já está ao lado: a aba "Prévia" some, e quem estava
  // nela volta pro formulário em vez de ficar numa aba que não existe.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1101px)");
    const f = () => { if (mq.matches) setVerPrevia(false); };
    f();
    mq.addEventListener?.("change", f);
    return () => mq.removeEventListener?.("change", f);
  }, []);

  const itens: { valor: Aba; rotulo: ReactNode; badge?: ReactNode; className?: string }[] = [
    { valor: "cartoes", rotulo: "Cartões", badge: <span className="lte-aba-n">{doc.posts.length}</span> },
    { valor: "aparencia", rotulo: "Aparência" },
    ...(ajustes ? [{ valor: "ajustes" as const, rotulo: "Ajustes" }] : []),
    { valor: "previa", rotulo: "Prévia", className: "lte-so-estreito" },
  ];
  const trocar = (v: Aba) => {
    if (v === "previa") setVerPrevia(true);
    else { setAba(v); setVerPrevia(false); }
    corpo.current?.scrollTo?.({ top: 0 });
  };

  return (
    <div className="lte-grid" data-vista={verPrevia ? "previa" : "editar"}>
      <div className="lte-form">
        <Abas className="lte-form-abas" ariaLabel="Partes do editor" itens={itens} valor={verPrevia ? "previa" : aba} onMuda={trocar} />
        <div className="lte-form-corpo" ref={corpo}>
          {somenteLeitura && (
            <p className="lte-aviso-leitura">
              <Icon name="lock" size={14} />
              Você pode ver o LinkTridi, mas não editar. Peça a permissão “Criar e editar LinkTridi” em Atendimento.
            </p>
          )}
          <div className="lte-form-conteudo" inert={somenteLeitura || undefined}>
            {aba === "cartoes" && <CartoesLT doc={doc} onChange={onChange} cliques={cliques} />}
            {aba === "aparencia" && <AparenciaLT doc={doc} onChange={onChange} />}
            {aba === "ajustes" && ajustes}
          </div>
        </div>
      </div>

      {/* A mesma peça do player publicado. */}
      <div className="lte-previa-col">
        <span className="lte-previa-rot">Prévia</span>
        <div className="lte-fone">
          <LinkTridiRuntime doc={doc} altura="100%" />
        </div>
      </div>
    </div>
  );
}

// ── Folhas ───────────────────────────────────────────────────────────────────
function FolhaCompartilhar({ link, noAr, podeEditar, onPublicar, onEndereco, onFechar }: {
  link: string; noAr: boolean; podeEditar: boolean;
  onPublicar: () => void | boolean | Promise<void | boolean>; onEndereco: () => void; onFechar: () => void;
}) {
  const qr = (tam: number) => `https://api.qrserver.com/v1/create-qr-code/?size=${tam}x${tam}&margin=8&data=${encodeURIComponent(link)}`;
  const copiar = async () => {
    if (await copiarTexto(link)) toast.ok("Link copiado.");
    else toast.erro("Não deu pra copiar — segure no link e copie à mão.");
  };
  return (
    <PainelLateral titulo="Compartilhar" subtitulo="O link que vai na bio do Instagram." largura={460} onFechar={onFechar}>
      <div className="lte-folha-corpo">
        {!noAr && (
          <Aviso tom="atencao">
            <p>Este LinkTridi ainda está <strong>fora do ar</strong> — o link só abre depois de publicar.</p>
            {podeEditar && <p><BotaoPublicar tamanho="sm" onPublicar={onPublicar}>Publicar agora</BotaoPublicar></p>}
          </Aviso>
        )}
        {/* O link por extenso, quebrando linha — num campo de uma linha só o
            fim do endereço (a parte que muda) ficava cortado no celular. */}
        <div className="lte-link">
          <p className="lte-link-url"><span>{link.replace(/^https:\/\//, "").replace(/\/f\/.*$/, "")}</span>/f/<strong>{link.replace(/^.*\/f\//, "")}</strong></p>
          <Botao variante="primario" icone="copy" onClick={copiar}>Copiar link</Botao>
        </div>
        <div className="lte-compartilhar">
          <a className="ui-btn mt-anel" data-v="secundario" data-t="md" href={link} target="_blank" rel="noreferrer"><Icon name="external-link" size={15.5} />Abrir</a>
          <a className="ui-btn mt-anel" data-v="secundario" data-t="md" href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer"><Icon name="brand-whatsapp" size={15.5} />WhatsApp</a>
        </div>
        <div className="lte-qr">
          {/* eslint-disable-next-line @next/next/no-img-element -- QR gerado por serviço externo a partir do link */}
          <img src={qr(264)} alt={`QR code do link ${link}`} width={132} height={132} />
          <div>
            <strong>QR code</strong>
            <span>Pra embalagem, cartão de visita ou o balcão.</span>
            <a href={qr(1024)} target="_blank" rel="noreferrer"><Icon name="external-link" size={13} />Abrir em tamanho grande</a>
          </div>
        </div>
        {podeEditar && <Botao variante="sutil" icone="link" onClick={onEndereco}>Trocar o endereço</Botao>}
      </div>
    </PainelLateral>
  );
}

/** Endereço: confere se está livre enquanto se digita e só grava no "Salvar".
 *  Com o LinkTridi no ar, avisa ANTES que o link de hoje vai parar de abrir. */
function FolhaEndereco({ id, slugAtual, dominioAtual, dominios, noAr, onFechar, onSalvo }: {
  id: string; slugAtual: string; dominioAtual: string | null; dominios: Dominio[]; noAr: boolean;
  onFechar: () => void; onSalvo: (slug: string, dominioId: string | null) => void;
}) {
  const [slug, setSlug] = useState(slugAtual);
  const [dom, setDom] = useState<string | null>(dominioAtual);
  const [checagem, setChecagem] = useState<{ chave: string; livre: boolean } | null>(null);
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const hostDe = (d: string | null) => dominios.find((x) => x.id === d)?.host || DOMINIO_PADRAO;

  const final = normalizarEnderecoLT(slug);
  const mudou = final !== slugAtual || dom !== dominioAtual;
  const problema = problemaNoEnderecoLT(slug);
  const chave = `${dom ?? ""}|${final}`;

  useEffect(() => {
    if (!mudou || problema) return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(API, { method: "POST", headers: JSON_H, body: JSON.stringify({ acao: "checarCaminho", slug: final, dominioId: dom, id }) });
        const j = await r.json().catch(() => ({}));
        if (vivo && r.ok) setChecagem({ chave, livre: !!j.livre });
      } catch { /* sem rede: o Salvar confere de novo no servidor */ }
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [chave, mudou, problema, final, dom, id]);

  const livre = checagem?.chave === chave ? checagem.livre : null;
  const erro = erroServidor || problema || (mudou && livre === false ? "Esse endereço já é de outro projeto." : null);
  const pronto = mudou && !problema && livre === true && !erroServidor;

  async function salvar() {
    if (!pronto) return;
    setSalvando(true);
    try {
      const r = await fetch(API, { method: "PATCH", headers: JSON_H, body: JSON.stringify({ id, slug: final, dominioId: dom }) });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 || j.code === "caminho_em_uso") { setErroServidor("Esse endereço já é de outro projeto."); return; }
      if (!r.ok) { setErroServidor(j.error || "Não deu pra salvar o endereço."); return; }
      onSalvo(final, dom);
    } catch { setErroServidor("Sem conexão — o endereço não mudou."); }
    finally { setSalvando(false); }
  }

  return (
    <PainelLateral titulo="Endereço" subtitulo="O link que vai na bio do Instagram." soFechaNoX largura={480} onFechar={onFechar}
      rodape={<Acoes><Botao onClick={onFechar}>Cancelar</Botao><Esp /><Botao variante="primario" icone="check" carregando={salvando} disabled={!pronto} onClick={salvar}>Salvar endereço</Botao></Acoes>}>
      <div className="lte-folha-corpo">
        <Campo label="Domínio" dica={dominios.length
          ? "Domínio próprio precisa apontar (DNS) pra esta aplicação — cadastrar não faz isso sozinho."
          : "Só o domínio padrão por enquanto. Domínio próprio se cadastra em TridiFlow › Configurações › Domínios."}>
          {(idc) => <GlassSelect id={idc} value={dom ?? ""} onChange={(v) => { setDom(v || null); setErroServidor(null); }}
            options={[{ value: "", label: DOMINIO_PADRAO }, ...dominios.map((d) => ({ value: d.id, label: d.verificado ? d.host : `${d.host} (não verificado)` }))]} />}
        </Campo>
        <Campo label="Endereço" erro={erro ?? undefined} dica="Letras, números e hífen.">
          {(idc) => (
            <div className="lte-endereco">
              <span className="lte-endereco-pre" aria-hidden>/f/</span>
              <input id={idc} className="lte-input" value={slug} autoCapitalize="none" autoComplete="off" spellCheck={false}
                onChange={(e) => { setSlug(digitarEnderecoLT(e.target.value)); setErroServidor(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") void salvar(); }} />
            </div>
          )}
        </Campo>
        <div className="lte-endereco-estado" data-livre={pronto ? "1" : undefined} aria-live="polite">
          {!mudou ? "Este é o endereço de agora."
            : problema || erroServidor || livre === false ? null
            : livre === null ? "Conferindo se está livre…"
            : <><Icon name="circle-check" size={14} />Livre</>}
        </div>
        <p className="lte-endereco-final">O link fica <strong>{hostDe(dom)}/f/{final || "…"}</strong></p>
        {noAr && mudou && (
          <Aviso tom="atencao">
            <p><strong>O link de agora para de abrir assim que você salvar.</strong></p>
            <p>{hostDe(dominioAtual)}/f/{slugAtual} vai mostrar “Este link não está disponível”. Troque na bio do Instagram e onde mais ele estiver.</p>
          </Aviso>
        )}
      </div>
    </PainelLateral>
  );
}

/** Resultados: modal no computador, folha presa embaixo no celular. */
function FolhaResultados({ botId, nome, onFechar }: { botId: string; nome: string; onFechar: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onFechar]);
  return (
    <div onClick={onFechar} className="lte-veu">
      <div onClick={(e) => e.stopPropagation()} className="lte-folha" role="dialog" aria-modal="true" aria-label={`Resultados de ${nome}`}>
        <div className="lte-folha-topo">
          <strong>Resultados · {nome}</strong>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onFechar} />
        </div>
        <div className="lte-folha-rola">
          <ResultadosClient botId={botId} embutido />
        </div>
      </div>
    </div>
  );
}
