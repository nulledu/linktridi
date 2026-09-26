"use client";

import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { Icon } from "../../../Icon";
import { GlassSelect } from "../../../GlassPicker";
import { Botao, BotaoIcone } from "../../../ui/controles";
import { moverItem, type BlocoTutorial } from "@/lib/tridiflow-tutoriais";
import { CampoArquivo } from "./CampoArquivo";
import { useReordenavel, porIds } from "../../../ui/reordenar";

// O editor de texto (ProseMirror, ~120 KB) só baixa aqui, no editor — e sem
// renderizar no servidor, onde ele não tem o que fazer.
const EditorTexto = dynamic(() => import("../editor/EditorTexto"), {
  ssr: false,
  loading: () => <div className="cte-rte cte-rte-carregando" aria-hidden="true" />,
});

const novoId = () => Math.random().toString(36).slice(2, 10);
const NOVOS = {
  texto: (): BlocoTutorial => ({ id: novoId(), tipo: "texto", titulo: "", conteudo: "" }),
  passo: (): BlocoTutorial => ({ id: novoId(), tipo: "passo", titulo: "Novo passo", conteudo: "", imagemUrl: "", imagemAlt: "", videoUrl: "", videoCapaUrl: "" }),
  imagem: (): BlocoTutorial => ({ id: novoId(), tipo: "imagem", url: "", alt: "", legenda: "" }),
  video: (): BlocoTutorial => ({ id: novoId(), tipo: "video", origem: "link", url: "", capaUrl: "", legenda: "" }),
  produto: (): BlocoTutorial => ({ id: novoId(), tipo: "produto", produtoId: "", titulo: "Produto utilizado", botao: "Ver produto" }),
  link: (): BlocoTutorial => ({ id: novoId(), tipo: "link", titulo: "", descricao: "", url: "", botao: "Saiba mais", tutorial: "" }),
};

const NOMES: Record<BlocoTutorial["tipo"], string> = { texto: "Texto", passo: "Passo", imagem: "Imagem", video: "Vídeo", produto: "Produto", link: "Link", aviso: "Aviso", problemas: "Deu errado?" };
const ICONES: Record<BlocoTutorial["tipo"], string> = { texto: "align-left", passo: "list-check", imagem: "photo", video: "player-play", produto: "package", link: "external-link", aviso: "alert-triangle", problemas: "help-circle" };

export function EditorBlocosTutorial({ blocos, produtos, onMudar, onUpload }: {
  blocos: BlocoTutorial[];
  produtos: { id: string; titulo: string }[];
  onMudar: (blocos: BlocoTutorial[]) => void;
  onUpload: (file: File) => Promise<string>;
}) {
  // `null` = ninguém mexeu ainda: nesse caso vale o padrão (bloco único nasce
  // aberto). Depois do primeiro clique quem manda é o mapa.
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const aberto = (id: string, padrao: boolean) => abertos[id] ?? padrao;
  const alternar = (id: string, padrao: boolean) => setAbertos((m) => ({ ...m, [id]: !aberto(id, padrao) }));
  const trocar = (id: string, campos: Record<string, unknown>) => onMudar(blocos.map((b) => b.id === id ? ({ ...b, ...campos } as BlocoTutorial) : b));
  const arrasto = useReordenavel(blocos.map((b) => b.id), (ids) => onMudar(porIds(blocos, ids)));
  return (
    <div className="cte-blocos">
      {arrasto.ordenar(blocos).map((b, indice) => (
        <div className="cte-bloco t-acc" key={b.id} ref={arrasto.linha(b.id)} data-open={aberto(b.id, blocos.length === 1) ? "true" : "false"} data-arrastando={arrasto.arrastando === b.id ? "1" : undefined}>
          <div className="cte-bloco-cab">
            <span className="cte-puxador" title="Arraste para reordenar" {...arrasto.puxador(b.id)}><Icon name="grip-vertical" size={15} /></span>
            {/* O cabeçalho é UM botão só: `<details>` abria de corte seco (não
                há altura pra animar) e ainda proibia botão dentro do summary —
                por isso as ações moram ao lado, não dentro. */}
            <button type="button" className="cte-bloco-abre t-acc-head" aria-expanded={aberto(b.id, blocos.length === 1)} onClick={() => alternar(b.id, blocos.length === 1)}>
              <Icon name={ICONES[b.tipo]} size={17} />
              <span><small>{NOMES[b.tipo]}</small><strong>{"titulo" in b && b.titulo || NOMES[b.tipo]}</strong></span>
              <span className="t-acc-chevron"><Icon name="chevron-down" size={15} /></span>
            </button>
            <span className="cte-ordem">
              <Dica texto="Mover para cima"><BotaoIcone icone="arrow-up" titulo="Mover para cima" title={undefined} className="t-tt-trigger" disabled={indice === 0} onClick={() => onMudar(moverItem(blocos, b.id, -1))} /></Dica>
              <Dica texto="Mover para baixo"><BotaoIcone icone="arrow-down" titulo="Mover para baixo" title={undefined} className="t-tt-trigger" disabled={indice === blocos.length - 1} onClick={() => onMudar(moverItem(blocos, b.id, 1))} /></Dica>
              <Dica texto="Remover bloco"><BotaoIcone icone="trash" titulo="Remover bloco" title={undefined} className="t-tt-trigger" onClick={() => onMudar(blocos.filter((x) => x.id !== b.id))} /></Dica>
            </span>
          </div>
          <div className="t-acc-panel"><div className="t-acc-panel-inner"><div className="cte-bloco-form">
            {b.tipo === "texto" && <><label>Título opcional<input value={b.titulo} onChange={(e) => trocar(b.id, { titulo: e.target.value })} /></label><Rotulo texto="Texto">{(id) => <EditorTexto id={id} rotulo="Texto" linhas={5} valor={b.conteudo} onMudar={(html) => trocar(b.id, { conteudo: html })} placeholder="Escreva aqui. Selecione um trecho pra negritar ou virar link." />}</Rotulo></>}
            {b.tipo === "passo" && <><label>Título<input value={b.titulo} onChange={(e) => trocar(b.id, { titulo: e.target.value })} /></label><Rotulo texto="Texto">{(id) => <EditorTexto id={id} rotulo={`Texto do passo ${b.titulo || ""}`.trim()} linhas={4} valor={b.conteudo} onMudar={(html) => trocar(b.id, { conteudo: html })} placeholder="O que fazer neste passo." />}</Rotulo><label>Imagem por endereço<input value={b.imagemUrl} placeholder="https://…" onChange={(e) => trocar(b.id, { imagemUrl: e.target.value })} /></label><Rotulo texto="Ou enviar imagem">{(id) => <CampoArquivo id={id} accept="image/jpeg,image/png,image/webp,image/gif" rotulo="Escolher imagem" enviar={onUpload} aoEnviar={(url) => trocar(b.id, { imagemUrl: url })} />}</Rotulo><label>Descrição da imagem<input value={b.imagemAlt} onChange={(e) => trocar(b.id, { imagemAlt: e.target.value })} /></label><label>Vídeo por endereço<input value={b.videoUrl} placeholder="YouTube, Vimeo ou MP4" onChange={(e) => trocar(b.id, { videoUrl: e.target.value })} /></label><Rotulo texto="Ou enviar vídeo">{(id) => <CampoArquivo id={id} accept="video/mp4,video/webm" rotulo="Escolher vídeo" enviar={onUpload} aoEnviar={(url) => trocar(b.id, { videoUrl: url })} />}</Rotulo></>}
            {b.tipo === "imagem" && <><label>Imagem por endereço<input value={b.url} placeholder="https://…" onChange={(e) => trocar(b.id, { url: e.target.value })} /></label><Rotulo texto="Ou enviar imagem">{(id) => <CampoArquivo id={id} accept="image/jpeg,image/png,image/webp,image/gif" rotulo="Escolher imagem" enviar={onUpload} aoEnviar={(url) => trocar(b.id, { url })} />}</Rotulo><label>Descrição da imagem<input value={b.alt} onChange={(e) => trocar(b.id, { alt: e.target.value })} /></label><label>Legenda<input value={b.legenda} onChange={(e) => trocar(b.id, { legenda: e.target.value })} /></label></>}
            {b.tipo === "video" && <><Rotulo texto="Origem">{(id) => <GlassSelect id={id} value={b.origem} onChange={(v) => trocar(b.id, { origem: v })} options={[{ value: "link", label: "Link" }, { value: "upload", label: "Upload" }]} />}</Rotulo><label>Vídeo por endereço<input value={b.url} placeholder="YouTube, Vimeo ou arquivo enviado" onChange={(e) => trocar(b.id, { url: e.target.value })} /></label>{b.origem === "upload" && <Rotulo texto="Enviar vídeo">{(id) => <CampoArquivo id={id} accept="video/mp4,video/webm" rotulo="Escolher vídeo" enviar={onUpload} aoEnviar={(url) => trocar(b.id, { url })} />}</Rotulo>}<label>Legenda<input value={b.legenda} onChange={(e) => trocar(b.id, { legenda: e.target.value })} /></label></>}
            {b.tipo === "produto" && <><Rotulo texto="Produto">{(id) => <GlassSelect id={id} value={b.produtoId} onChange={(v) => trocar(b.id, { produtoId: v })} placeholder="Selecione…" options={produtos.map((p) => ({ value: p.id, label: p.titulo }))} />}</Rotulo><label>Título auxiliar<input value={b.titulo} onChange={(e) => trocar(b.id, { titulo: e.target.value })} /></label><label>Texto do botão<input value={b.botao} onChange={(e) => trocar(b.id, { botao: e.target.value })} /></label></>}
            {b.tipo === "link" && <><label>Título<input value={b.titulo} onChange={(e) => trocar(b.id, { titulo: e.target.value })} /></label><label>Descrição<textarea rows={3} value={b.descricao} onChange={(e) => trocar(b.id, { descricao: e.target.value })} /></label><label>URL<input value={b.url} onChange={(e) => trocar(b.id, { url: e.target.value })} /></label><label>Texto do botão<input value={b.botao} onChange={(e) => trocar(b.id, { botao: e.target.value })} /></label></>}
          </div></div></div>
        </div>
      ))}
      <div className="cte-adicionar" aria-label="Adicionar conteúdo">
        {(Object.keys(NOVOS) as (keyof typeof NOVOS)[]).map((tipo) => <Botao key={tipo} icone={ICONES[tipo]} tamanho="sm" onClick={() => onMudar([...blocos, NOVOS[tipo]()])}>{NOMES[tipo]}</Botao>)}
      </div>
    </div>
  );
}

/** Rótulo com `htmlFor` de verdade — o `GlassSelect` é um `<button>`, e sem o
 *  id o clique no rótulo não focaria nada e o leitor de tela leria só "botão". */
function Rotulo({ texto, children }: { texto: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return <div className="cte-campo"><label htmlFor={id}>{texto}</label>{children(id)}</div>;
}

/** Dica da receita `t-tt`: 80ms de atraso pra entrar (filtro de intenção) e
 *  saída instantânea. No dedo ela some — o `aria-label` continua respondendo. */
function Dica({ texto, children }: { texto: string; children: React.ReactNode }) {
  return <span className="t-tt-wrap">{children}<span className="t-tt" role="tooltip">{texto}</span></span>;
}
