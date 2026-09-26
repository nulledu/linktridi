"use client";

// ── Aba "Cartões" do editor do LinkTridi ─────────────────────────────────────
// O que muda toda semana: os cartões e pra onde cada um leva. A linha abre o
// cartão; subir/descer ficam na linha (no computador) e no rodapé do cartão
// aberto (no celular, onde quatro botões de 44px espremiam o título até sumir).
// Remover mora no rodapé, afastado do resto — e deixa o Desfazer no lugar.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../../Icon";
import { Botao, BotaoIcone, Campo } from "../../../ui/controles";
import { novoPostLT, uidLT, type LinkTridiDoc, type LinkTridiPost } from "@/lib/tridiflow-linktridi";
import { EntradaImagem, EntradaVideo, LinhaChave, Segmentado, TAMANHOS } from "./pecas";

const numero = (v: string) => (v === "" ? null : Number(v));

export function CartoesLT({ doc, onChange, cliques }: {
  doc: LinkTridiDoc; onChange: (d: LinkTridiDoc) => void;
  /** Sessões cujo último clique foi aquele cartão (vazio sem a chave de analytics). */
  cliques?: Record<string, number>;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [removido, setRemovido] = useState<{ post: LinkTridiPost; indice: number } | null>(null);
  const refDesfazer = useRef<HTMLButtonElement>(null);

  // O Desfazer fica 8 s — tempo de perceber o engano, curto o bastante pra
  // não virar um item fantasma na lista.
  useEffect(() => {
    if (!removido) return;
    refDesfazer.current?.focus({ preventScroll: true });
    const t = setTimeout(() => setRemovido(null), 8000);
    return () => clearTimeout(t);
  }, [removido]);

  const patch = (id: string, p: Partial<LinkTridiPost>) =>
    onChange({ ...doc, posts: doc.posts.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const adicionar = () => {
    const novo = novoPostLT();
    onChange({ ...doc, posts: [...doc.posts, novo] });
    setAberto(novo.id);
  };
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= doc.posts.length) return;
    const posts = [...doc.posts];
    [posts[i], posts[j]] = [posts[j], posts[i]];
    onChange({ ...doc, posts });
  };
  const duplicar = (p: LinkTridiPost) => {
    const copia = { ...p, id: uidLT() };
    const i = doc.posts.findIndex((x) => x.id === p.id);
    onChange({ ...doc, posts: [...doc.posts.slice(0, i + 1), copia, ...doc.posts.slice(i + 1)] });
    setAberto(copia.id);
  };
  const remover = (p: LinkTridiPost) => {
    const indice = doc.posts.findIndex((x) => x.id === p.id);
    onChange({ ...doc, posts: doc.posts.filter((x) => x.id !== p.id) });
    setRemovido({ post: p, indice });
    if (aberto === p.id) setAberto(null);
  };
  const desfazer = () => {
    if (!removido) return;
    const posts = [...doc.posts];
    posts.splice(Math.min(removido.indice, posts.length), 0, removido.post);
    onChange({ ...doc, posts });
    setRemovido(null);
  };

  const itens: ReactNode[] = doc.posts.map((p, i) => (
    <Cartao key={p.id} p={p} i={i} total={doc.posts.length} aberto={aberto === p.id} cliques={cliques?.[p.id] ?? 0}
      onAbrir={() => setAberto(aberto === p.id ? null : p.id)} onPatch={(x) => patch(p.id, x)}
      onMover={(d) => mover(i, d)} onDuplicar={() => duplicar(p)} onRemover={() => remover(p)} />
  ));
  if (removido) {
    itens.splice(Math.min(removido.indice, itens.length), 0, (
      <div key="desfazer" className="lte-desfazer" role="status">
        <span>“{removido.post.titulo || "Cartão sem título"}” removido</span>
        <Botao ref={refDesfazer} tamanho="sm" icone="arrow-back-up" onClick={desfazer}>Desfazer</Botao>
      </div>
    ));
  }

  return (
    <section className="lte-grupo" aria-label="Cartões">
      <div className="lte-grupo-cab">
        <h3>{doc.posts.length === 1 ? "1 cartão" : `${doc.posts.length} cartões`}</h3>
      </div>
      {doc.posts.length === 0 && !removido ? (
        <div className="lte-vazio">
          <span className="lte-linha-ico" aria-hidden><Icon name="layout-grid" size={18} /></span>
          <strong>Nenhum cartão ainda</strong>
          <span>Cada cartão leva pra um lugar: o checkout de um produto, o WhatsApp, o grupo VIP.</span>
          <Botao variante="primario" icone="plus" onClick={adicionar}>Criar o primeiro cartão</Botao>
        </div>
      ) : (
        <div className="lte-posts">
          {itens}
          <Botao icone="plus" bloco onClick={adicionar}>Novo cartão</Botao>
        </div>
      )}
    </section>
  );
}

function Cartao({ p, i, total, aberto, cliques, onAbrir, onPatch, onMover, onDuplicar, onRemover }: {
  p: LinkTridiPost; i: number; total: number; aberto: boolean; cliques: number;
  onAbrir: () => void; onPatch: (p: Partial<LinkTridiPost>) => void; onMover: (d: -1 | 1) => void;
  onDuplicar: () => void; onRemover: () => void;
}) {
  const formato = p.formato ?? "cartao";
  const produto = formato === "cartao";
  return (
    <div className={`lte-post${aberto ? " lte-post-on" : ""}`}>
      <div className="lte-post-linha">
        <button type="button" className="lte-post-abre" aria-expanded={aberto} onClick={onAbrir}>
          <span className="lte-post-num">{String(i + 1).padStart(2, "0")}</span>
          {p.tipo === "imagem" && p.mediaUrl
            // eslint-disable-next-line @next/next/no-img-element -- miniatura de URL enviada/colada pelo usuário
            ? <img src={p.mediaUrl} alt="" className="lte-post-thumb" />
            : p.tipo === "video" && p.thumbUrl
              // eslint-disable-next-line @next/next/no-img-element -- capa enviada pelo usuário
              ? <img src={p.thumbUrl} alt="" className="lte-post-thumb" />
              : <span className="lte-post-thumb lte-post-thumb-vazia"><Icon name={p.tipo === "video" ? "video" : produto ? "photo" : "link"} size={14} /></span>}
          <span className="lte-post-tit">
            <strong>{p.titulo || p.destinoUrl || "Cartão sem título"}</strong>
            <span className="lte-post-selos">
              {!produto && <span className="lte-post-selo">botão de link</span>}
              {p.destaque && produto && <span className="lte-post-selo" data-tom="destaque">destaque</span>}
              {!p.publicado && <span className="lte-post-selo">oculto</span>}
              {!p.destinoUrl.trim() && <span className="lte-post-selo" data-tom="atencao">sem destino</span>}
              {cliques > 0 && <span className="lte-post-selo" data-tom="ok" title="Sessões cujo último clique foi este cartão">{cliques} {cliques === 1 ? "clique" : "cliques"}</span>}
            </span>
          </span>
          <span className="lte-linha-seta" aria-hidden><Icon name={aberto ? "chevron-up" : "chevron-down"} size={16} /></span>
        </button>
        <span className="lte-post-acoes lte-post-ordem">
          <BotaoIcone icone="arrow-up" titulo="Subir" tamanho="sm" onClick={() => onMover(-1)} disabled={i === 0} />
          <BotaoIcone icone="arrow-down" titulo="Descer" tamanho="sm" onClick={() => onMover(1)} disabled={i === total - 1} />
        </span>
      </div>

      {aberto && (
        <div className="lte-post-corpo">
          <Campo label="Formato" dica="Botão de link é a pílula clássica do Linktree — só título e seta, sem preço.">
            <Segmentado rotulo="Formato" valor={formato} onChange={(v) => onPatch({ formato: v })}
              opcoes={[{ v: "cartao", l: "Cartão de produto" }, { v: "botao", l: "Botão de link" }]} />
          </Campo>
          <Campo label="Destino do clique" dica="Checkout, wa.me ou o link de outro funil seu.">
            {(id) => <input id={id} className="lte-input" inputMode="url" value={p.destinoUrl} placeholder="https://…" onChange={(e) => onPatch({ destinoUrl: e.target.value })} />}
          </Campo>
          <div className="lte-par">
            <Campo label="Título">
              {(id) => <input id={id} className="lte-input" value={p.titulo ?? ""} onChange={(e) => onPatch({ titulo: e.target.value })} />}
            </Campo>
            <Campo label="Tamanho do título">
              <Segmentado rotulo="Tamanho do título" valor={p.tamanhoTitulo ?? "md"} onChange={(v) => onPatch({ tamanhoTitulo: v })} opcoes={TAMANHOS} />
            </Campo>
          </div>
          <Campo label="Mídia">
            <Segmentado rotulo="Mídia" valor={p.tipo} onChange={(v) => onPatch({ tipo: v })} opcoes={[{ v: "imagem", l: "Imagem" }, { v: "video", l: "Vídeo" }]} />
          </Campo>
          {p.tipo === "video" ? (
            <>
              <Campo label="Vídeo do cartão" dica="MP4 até 6 MB (10 s em 720p cabe). A capa sai sozinha do primeiro quadro.">
                <EntradaVideo url={p.mediaUrl} capa={p.thumbUrl} onChange={(m) => onPatch(m)} />
              </Campo>
              <Campo label="Capa do vídeo" dica="Gerada ao enviar o vídeo; troque se quiser outro quadro.">
                {(id) => <EntradaImagem idCampo={id} url={p.thumbUrl ?? ""} rotulo="Enviar capa" onChange={(u) => onPatch({ thumbUrl: u })} />}
              </Campo>
            </>
          ) : (
            <Campo label="Imagem do cartão" dica="A foto sai comprimida. GIF só até 3 MB — pra movimento, use Vídeo: pesa bem menos.">
              {(id) => <EntradaImagem idCampo={id} url={p.mediaUrl} onChange={(u) => onPatch({ mediaUrl: u })} />}
            </Campo>
          )}
          {produto && (
            <>
              <div className="lte-par">
                <Campo label="Etiqueta" dica="“MAIS VENDIDO”, sobre a foto. Vazio esconde.">
                  {(id) => <input id={id} className="lte-input" value={p.badge ?? ""} onChange={(e) => onPatch({ badge: e.target.value })} />}
                </Campo>
                <Campo label="Preço (R$)" dica="Vazio esconde o bloco de preço.">
                  {(id) => <input id={id} className="lte-input" type="number" inputMode="decimal" min={0} step="0.01" value={p.preco ?? ""} onChange={(e) => onPatch({ preco: numero(e.target.value) })} />}
                </Campo>
                <Campo label="Preço “de” (R$)" dica="Riscado, com o desconto ao lado.">
                  {(id) => <input id={id} className="lte-input" type="number" inputMode="decimal" min={0} step="0.01" value={p.precoDe ?? ""} onChange={(e) => onPatch({ precoDe: numero(e.target.value) })} />}
                </Campo>
              </div>
              <div className="lte-par">
                <Campo label="Linha acima do preço" dica="“KIT COMPLETO” — só com preço.">
                  {(id) => <input id={id} className="lte-input" value={p.prefixo ?? ""} onChange={(e) => onPatch({ prefixo: e.target.value })} />}
                </Campo>
                <Campo label="Linha de garantia" dica="“7 dias de garantia”, abaixo do preço.">
                  {(id) => <input id={id} className="lte-input" value={p.sufixo ?? ""} onChange={(e) => onPatch({ sufixo: e.target.value })} />}
                </Campo>
              </div>
              <div className="lte-par">
                <Campo label="Nota (0–5)" dica="Estrelas. Vazio esconde.">
                  {(id) => <input id={id} className="lte-input" type="number" inputMode="decimal" min={0} max={5} step="0.1" value={p.avaliacaoNota ?? ""} onChange={(e) => onPatch({ avaliacaoNota: numero(e.target.value) })} />}
                </Campo>
                <Campo label="Nº de avaliações" dica="“(312)” ao lado das estrelas.">
                  {(id) => <input id={id} className="lte-input" type="number" inputMode="numeric" min={0} step="1" value={p.avaliacaoQtd ?? ""} onChange={(e) => onPatch({ avaliacaoQtd: numero(e.target.value) })} />}
                </Campo>
                <Campo label="Parcelas" dica="“ou 3x de R$ 65,97”. Vazio esconde.">
                  {(id) => <input id={id} className="lte-input" type="number" inputMode="numeric" min={2} max={12} step="1" value={p.parcelas ?? ""} onChange={(e) => onPatch({ parcelas: numero(e.target.value) })} />}
                </Campo>
              </div>
              <Campo label="Texto do botão">
                {(id) => <input id={id} className="lte-input" value={p.cta ?? ""} placeholder="Comprar agora" onChange={(e) => onPatch({ cta: e.target.value })} />}
              </Campo>
            </>
          )}
          <div className="lte-post-chaves">
            {produto && <LinhaChave rotulo="Cartão destaque" dica="Ocupa a largura toda, com a mídia em 16:9." ligado={p.destaque ?? false} onChange={(v) => onPatch({ destaque: v })} />}
            <LinhaChave rotulo="Visível na página" dica={p.publicado ? undefined : "Oculto: continua aqui, mas o seguidor não vê."} ligado={p.publicado} onChange={(v) => onPatch({ publicado: v })} />
          </div>
          <div className="lte-post-rodape">
            <span className="lte-ordem-celular">
              <Botao tamanho="sm" icone="arrow-up" disabled={i === 0} onClick={() => onMover(-1)}>Subir</Botao>
              <Botao tamanho="sm" icone="arrow-down" disabled={i === total - 1} onClick={() => onMover(1)}>Descer</Botao>
            </span>
            <Botao tamanho="sm" icone="copy" onClick={onDuplicar}>Duplicar</Botao>
            <span className="lte-esp" />
            <Botao tamanho="sm" variante="perigo" icone="trash" onClick={onRemover}>Remover</Botao>
          </div>
        </div>
      )}
    </div>
  );
}
