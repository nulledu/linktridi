"use client";

// Abas "Ideias" (reels do feed) e "Depoimentos" (stories) do editor da central.
// Mesma forma das categorias: lista com arrasto/subir/descer e um PainelLateral
// pra criar/editar. O vídeo sobe pelo CampoMidia (envio direto, com capa do
// primeiro quadro) ou entra como link do YouTube/Shorts.
import { useState } from "react";
import { Icon } from "../../../Icon";
import { confirmar, toast } from "../../../Toast";
import { Acoes, Botao, BotaoIcone, Caixa, Campo, Campos, Esp, PainelLateral } from "../../../ui/controles";
import { useReordenavel, porIds } from "../../../ui/reordenar";
import { CampoMidia } from "../editor/CampoMidia";
import { CampoArquivo } from "./CampoArquivo";
import type { DepoimentoCentral, ReelCentral } from "@/lib/tridiflow-tutoriais";

const idNovo = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
const comOrdem = <T extends { ordem: number }>(l: T[]) => l.map((x, i) => ({ ...x, ordem: i }));

function Linha({ id, arrasto, miniatura, titulo, detalhe, onEditar, onExcluir }: {
  id: string; arrasto: ReturnType<typeof useReordenavel>; miniatura: string; titulo: string; detalhe: string;
  onEditar: () => void; onExcluir: () => void;
}) {
  return <div className="cte-linha" ref={arrasto.linha(id)} data-arrastando={arrasto.arrastando === id ? "1" : undefined}>
    <span className="cte-puxador" title="Arraste para reordenar" {...arrasto.puxador(id)}><Icon name="grip-vertical" size={16} /></span>
    <span className="cte-miniatura">{miniatura ? <img src={miniatura} alt="" /> : <Icon name="player-play" size={18} />}</span>
    <span>
      <button type="button" className="cte-linha-titulo" onClick={onEditar}><strong>{titulo}</strong></button>
      <small>{detalhe}</small>
    </span>
    <span className="cte-acoes">
      <BotaoIcone icone="pencil" titulo="Editar" onClick={onEditar} />
      <BotaoIcone icone="trash" titulo="Excluir" onClick={onExcluir} />
    </span>
  </div>;
}

// ── Ideias (reels) ───────────────────────────────────────────────────────────
export function ListaIdeias({ reels, salvando, onSalvar }: {
  reels: ReelCentral[]; salvando: boolean;
  onSalvar: (reels: ReelCentral[], mensagem: string) => Promise<unknown>;
}) {
  const [editando, setEditando] = useState<ReelCentral | null>(null);
  const arrasto = useReordenavel(reels.map((r) => r.id), (ids) => { void onSalvar(comOrdem(porIds(reels, ids)), "Ordem atualizada."); });
  const novo = (): ReelCentral => ({ id: idNovo(), titulo: "", legenda: "", videoUrl: "", capaUrl: "", linkUrl: "", botao: "Comprar", ativo: true, ordem: reels.length });
  const salvar = async (r: ReelCentral) => {
    const existe = reels.some((x) => x.id === r.id);
    await onSalvar(comOrdem(existe ? reels.map((x) => x.id === r.id ? r : x) : [...reels, r]), "Reel salvo — entra no ar na próxima publicação.");
    setEditando(null);
  };
  const excluir = async (r: ReelCentral) => {
    if (!(await confirmar(`Excluir “${r.titulo || "este reel"}”?`, { perigo: true }))) return;
    await onSalvar(comOrdem(reels.filter((x) => x.id !== r.id)), "Reel excluído.");
  };
  return <>
    <div className="cte-lista">
      {arrasto.ordenar(reels).map((r) => <Linha key={r.id} id={r.id} arrasto={arrasto} miniatura={r.capaUrl} titulo={r.titulo || "Sem título"}
        detalhe={[r.ativo ? "No feed" : "Oculto", r.linkUrl ? `Carrinho: ${r.botao}` : "Sem link de carrinho"].join(" · ")}
        onEditar={() => setEditando(r)} onExcluir={() => excluir(r)} />)}
      {!reels.length && <div className="cte-vazio-cartao">
        <span className="cte-vazio-icone"><Icon name="player-play" size={26} color="var(--primary-texto)" /></span>
        <strong>Nenhum reel ainda</strong>
        <p>Os reels viram o feed de Ideias da central: tela cheia, um atrás do outro, cada um com o botão de carrinho pro link que você escolher. Com pelo menos um, o atalho “Ideias” aparece na barra.</p>
        <Botao variante="primario" icone="plus" onClick={() => setEditando(novo())}>Adicionar reel</Botao>
      </div>}
    </div>
    {reels.length > 0 && <Acoes><Esp /><Botao variante="primario" icone="plus" onClick={() => setEditando(novo())}>Novo reel</Botao></Acoes>}
    {editando && <ReelForm valor={editando} salvando={salvando} onFechar={() => setEditando(null)} onSalvar={salvar} />}
  </>;
}

function ReelForm({ valor, salvando, onFechar, onSalvar }: {
  valor: ReelCentral; salvando: boolean; onFechar: () => void; onSalvar: (r: ReelCentral) => void;
}) {
  const [v, setV] = useState(valor);
  const salvar = () => {
    if (!v.videoUrl) return toast.erro("Envie o vídeo ou cole o link do reel.");
    onSalvar({ ...v, titulo: v.titulo.trim(), legenda: v.legenda.trim(), linkUrl: v.linkUrl.trim(), botao: v.botao.trim() || "Comprar" });
  };
  return <PainelLateral titulo={valor.videoUrl ? "Editar reel" : "Novo reel"} subtitulo="Vídeo em pé (9:16). Toca sozinho e passa pro próximo quando acaba." soFechaNoX largura={480} onFechar={onFechar}
    rodape={<Acoes><Botao onClick={onFechar}>Cancelar</Botao><Esp /><Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar reel</Botao></Acoes>}>
    <CampoMidia rotulo="Vídeo" aceita="video" url={v.videoUrl} capaUrl={v.capaUrl}
      onMudar={(m) => setV({ ...v, videoUrl: m.url, capaUrl: m.capaUrl || (m.tipo === "vazio" ? "" : v.capaUrl) })} />
    <Campos min={999}>
      <Campo label="Título">{(id) => <input id={id} value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} placeholder="Ex.: Carimbo na sacola kraft" />}</Campo>
      <Campo label="Legenda" dica="Até três linhas aparecem sobre o vídeo.">{(id) => <textarea id={id} rows={3} value={v.legenda} onChange={(e) => setV({ ...v, legenda: e.target.value })} />}</Campo>
      <Campo label="Link do carrinho" dica="Pra onde o botão leva: o produto na loja, o WhatsApp…">{(id) => <input id={id} type="url" inputMode="url" value={v.linkUrl} onChange={(e) => setV({ ...v, linkUrl: e.target.value })} placeholder="https://carimbostridi.com.br/products/…" />}</Campo>
      <Campo label="Texto do botão">{(id) => <input id={id} value={v.botao} maxLength={40} onChange={(e) => setV({ ...v, botao: e.target.value })} placeholder="Comprar" />}</Campo>
    </Campos>
    <label className="cte-check"><Caixa marcado={v.ativo} onChange={(m) => setV({ ...v, ativo: m })} /><span>Aparece no feed</span></label>
  </PainelLateral>;
}

// ── Depoimentos (stories) ────────────────────────────────────────────────────
export function ListaDepoimentos({ depoimentos, salvando, onSalvar, upload }: {
  depoimentos: DepoimentoCentral[]; salvando: boolean;
  onSalvar: (d: DepoimentoCentral[], mensagem: string) => Promise<unknown>;
  upload: (f: File) => Promise<string>;
}) {
  const [editando, setEditando] = useState<DepoimentoCentral | null>(null);
  const arrasto = useReordenavel(depoimentos.map((d) => d.id), (ids) => { void onSalvar(comOrdem(porIds(depoimentos, ids)), "Ordem atualizada."); });
  const novo = (): DepoimentoCentral => ({ id: idNovo(), nome: "", texto: "", midiaUrl: "", tipoMidia: "imagem", avatarUrl: "", ativo: true, ordem: depoimentos.length });
  const salvar = async (d: DepoimentoCentral) => {
    const existe = depoimentos.some((x) => x.id === d.id);
    await onSalvar(comOrdem(existe ? depoimentos.map((x) => x.id === d.id ? d : x) : [...depoimentos, d]), "Depoimento salvo — entra no ar na próxima publicação.");
    setEditando(null);
  };
  const excluir = async (d: DepoimentoCentral) => {
    if (!(await confirmar(`Excluir o depoimento de “${d.nome}”?`, { perigo: true }))) return;
    await onSalvar(comOrdem(depoimentos.filter((x) => x.id !== d.id)), "Depoimento excluído.");
  };
  return <>
    <div className="cte-lista">
      {arrasto.ordenar(depoimentos).map((d) => <Linha key={d.id} id={d.id} arrasto={arrasto}
        miniatura={d.avatarUrl || (d.tipoMidia === "imagem" ? d.midiaUrl : "")} titulo={d.nome}
        detalhe={[d.ativo ? "Nos stories" : "Oculto", d.midiaUrl ? (d.tipoMidia === "video" ? "Vídeo" : "Foto") : "Só texto"].join(" · ")}
        onEditar={() => setEditando(d)} onExcluir={() => excluir(d)} />)}
      {!depoimentos.length && <div className="cte-vazio-cartao">
        <span className="cte-vazio-icone"><Icon name="quote" size={26} color="var(--primary-texto)" /></span>
        <strong>Nenhum depoimento ainda</strong>
        <p>Depoimentos aparecem como stories — bolinhas no topo da central, acima das categorias e dos tutoriais. Foto ou vídeo em pé do cliente com a frase dele.</p>
        <Botao variante="primario" icone="plus" onClick={() => setEditando(novo())}>Adicionar depoimento</Botao>
      </div>}
    </div>
    {depoimentos.length > 0 && <Acoes><Esp /><Botao variante="primario" icone="plus" onClick={() => setEditando(novo())}>Novo depoimento</Botao></Acoes>}
    {editando && <DepoimentoForm valor={editando} salvando={salvando} upload={upload} onFechar={() => setEditando(null)} onSalvar={salvar} />}
  </>;
}

function DepoimentoForm({ valor, salvando, upload, onFechar, onSalvar }: {
  valor: DepoimentoCentral; salvando: boolean; upload: (f: File) => Promise<string>;
  onFechar: () => void; onSalvar: (d: DepoimentoCentral) => void;
}) {
  const [v, setV] = useState(valor);
  const salvar = () => {
    if (!v.nome.trim()) return toast.erro("Coloque o nome de quem deu o depoimento.");
    if (!v.midiaUrl && !v.texto.trim()) return toast.erro("Envie a foto/vídeo ou escreva o depoimento.");
    onSalvar({ ...v, nome: v.nome.trim(), texto: v.texto.trim() });
  };
  return <PainelLateral titulo={valor.nome ? "Editar depoimento" : "Novo depoimento"} subtitulo="Vira uma bolinha de story no topo da central." soFechaNoX largura={480} onFechar={onFechar}
    rodape={<Acoes><Botao onClick={onFechar}>Cancelar</Botao><Esp /><Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar depoimento</Botao></Acoes>}>
    <Campos min={999}>
      <Campo label="Nome">{(id) => <input id={id} value={v.nome} autoFocus maxLength={60} onChange={(e) => setV({ ...v, nome: e.target.value })} placeholder="Ex.: Ana — Doces da Ana" />}</Campo>
    </Campos>
    <CampoMidia rotulo="Foto ou vídeo do story" aceita="imagem-ou-video" url={v.midiaUrl} capaUrl={v.tipoMidia === "video" ? v.avatarUrl : ""}
      onMudar={(m) => {
        const tipo = m.tipo === "video" || m.midia === "video" ? "video" : "imagem";
        setV({ ...v, midiaUrl: m.url, tipoMidia: tipo, avatarUrl: v.avatarUrl || (tipo === "video" ? m.capaUrl : "") });
      }} />
    <Campos min={999}>
      <Campo label="Depoimento" dica="Aparece sobre a foto/vídeo. Sem mídia, vira um story só de texto.">{(id) => <textarea id={id} rows={3} maxLength={400} value={v.texto} onChange={(e) => setV({ ...v, texto: e.target.value })} />}</Campo>
      <Campo label="Foto da bolinha" dica="Opcional — sem ela, a bolinha usa a própria foto do story.">
        {(id) => <CampoArquivo id={id} accept="image/jpeg,image/png,image/webp" rotulo="Escolher foto" enviar={upload} aoEnviar={(url) => setV((x) => ({ ...x, avatarUrl: url }))} />}
      </Campo>
    </Campos>
    {v.avatarUrl && <img className="cte-previa-cat" src={v.avatarUrl} alt="Prévia da bolinha" />}
    <label className="cte-check"><Caixa marcado={v.ativo} onChange={(m) => setV({ ...v, ativo: m })} /><span>Aparece nos stories</span></label>
  </PainelLateral>;
}
