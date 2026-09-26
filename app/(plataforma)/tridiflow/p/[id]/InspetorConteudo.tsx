"use client";

// Aba CONTEÚDO do inspetor: o que o bloco DIZ (texto, imagem, itens, oferta…).
// Aparência e regras de exibição moram nas outras abas — aqui é só conteúdo.
// Todo controle chama `onPatch` com o menor patch possível; quem faz o merge na
// árvore é o editor (patchBloco), então este arquivo não conhece a página.

import type {
  AcaoPosEnvio, Bloco, CampoForm, CampoTipo, ItemDepoimento, ItemFaq, ItemGaleria,
  ItemBento, ItemLista, ItemLogo, ItemMetrica, ItemPasso, ItemRecurso, ItemSlide, LinhaComparacao, LinkCabecalho, Plano,
  TamanhoBento, TomBento,
} from "@/lib/tridiflow-pagina";
import { novoId } from "@/lib/tridiflow-pagina";
import { ICONES_RECURSO, glifoRecurso } from "@/lib/tridiflow-pagina-glifos";
import { embedDoVideo } from "@/lib/tridiflow-pagina-estilo";
import { Icon } from "../../../Icon";
import {
  ACENTO, Campo, EntradaImagem, LinhaCor, LinhaToggle, Numero, Secao, Segmentado, Selecao, Texto, Vazio,
} from "../_ui";
import { Botao, BotaoIcone } from "../../../ui/controles";

type Patch = (patch: Partial<Bloco>) => void;

// ── Peças locais ─────────────────────────────────────────────────────────────
function Grade({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gap: 12 }}>{children}</div>;
}

function CartaoItem({ titulo, onRemover, children }: {
  titulo: string; onRemover: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 9, padding: 10, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", letterSpacing: ".02em" }}>{titulo}</span>
        <BotaoIcone icone="trash" titulo="Remover" tamanho="sm" onClick={onRemover} />
      </div>
      {children}
    </div>
  );
}

function BotaoAdicionar({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <Botao icone="plus" bloco onClick={onClick}>
      {rotulo}
    </Botao>
  );
}

function Recado({ texto }: { texto: string }) {
  return (
    <span style={{ display: "flex", gap: 7, alignItems: "flex-start", fontSize: 10.5, lineHeight: 1.4, color: "var(--text-dim)" }}>
      <Icon name="info-circle" size={14} color="var(--text-dim)" />
      <span>{texto}</span>
    </span>
  );
}

const paraLinhas = (v: string[] | undefined) => (v ?? []).join("\n");
const deLinhas = (v: string) => v.split("\n");

// ── Vídeo ────────────────────────────────────────────────────────────────────
function ConteudoVideo({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const v = bloco.video ?? { fonte: "url" as const };
  const set = (p: Partial<NonNullable<Bloco["video"]>>) => onPatch({ video: { ...v, ...p } });
  const embed = embedDoVideo(v);
  const colouCodigo = v.fonte === "iframe" && !!(v.iframe ?? "").trim();
  const semProgresso = colouCodigo && (embed.tipo === "vazio" || !embed.temProgresso);

  return (
    <Grade>
      <Campo label="Fonte do vídeo">
        <Segmentado valor={v.fonte ?? "url"} onChange={(f) => set({ fonte: f })}
          opcoes={[{ valor: "url", label: "Link" }, { valor: "iframe", label: "Código" }]} />
      </Campo>

      {v.fonte === "iframe" ? (
        <Campo label="Código do player" hint="Cole o <iframe> do YouTube, Vimeo ou Panda.">
          <Texto valor={v.iframe} onChange={(t) => set({ iframe: t })} placeholder="<iframe src=…></iframe>" linhas={4} />
        </Campo>
      ) : (
        <Campo label="Link do vídeo" hint="YouTube, Vimeo, Panda ou um arquivo .mp4.">
          <Texto valor={v.url} onChange={(t) => set({ url: t })} placeholder="https://…" />
        </Campo>
      )}

      {semProgresso && (
        <Recado texto="Não reconhecemos esse player. O vídeo aparece normalmente, mas o progresso pode não ser detectado — liberações por tempo de vídeo caem para o tempo de página." />
      )}

      <Campo label="Imagem de capa">
        <EntradaImagem valor={v.capaUrl} onChange={(u) => set({ capaUrl: u })} />
      </Campo>

      <div>
        <LinhaToggle label="Iniciar sozinho" hint="Alguns navegadores só permitem com o som mudo." ativo={!!v.autoplay} onChange={(a) => set({ autoplay: a })} />
        <LinhaToggle label="Começar mudo" ativo={v.mudo !== false} onChange={(m) => set({ mudo: m })} />
        <LinhaToggle label="Mostrar controles" ativo={v.controles !== false} onChange={(c) => set({ controles: c })} />
      </div>

      <Campo label="Proporção">
        <Selecao valor={v.proporcao ?? "16:9"} onChange={(p) => set({ proporcao: p })}
          opcoes={[
            { valor: "16:9", label: "16:9 — paisagem" },
            { valor: "9:16", label: "9:16 — vertical" },
            { valor: "4:3", label: "4:3 — clássico" },
            { valor: "1:1", label: "1:1 — quadrado" },
          ]}
        />
      </Campo>
    </Grade>
  );
}

// ── Listas (benefícios / FAQ / depoimentos) ──────────────────────────────────
function ConteudoBeneficios({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const itens = bloco.itens ?? [];
  const trocar = (id: string, p: Partial<ItemLista>) => onPatch({ itens: itens.map((i) => (i.id === id ? { ...i, ...p } : i)) });
  return (
    <Grade>
      <Campo label="Formato" hint={bloco.formato === "pilulas" ? "Pílulas mostram só o título; o detalhe vira dica ao passar o mouse." : undefined}>
        <Segmentado valor={bloco.formato === "pilulas" ? "pilulas" : "lista"}
          onChange={(v) => onPatch({ formato: v === "pilulas" ? "pilulas" : undefined })}
          opcoes={[{ valor: "lista", label: "Lista" }, { valor: "pilulas", label: "Pílulas" }]} />
      </Campo>
      {itens.map((i, idx) => (
        <CartaoItem key={i.id} titulo={`Benefício ${idx + 1}`} onRemover={() => onPatch({ itens: itens.filter((x) => x.id !== i.id) })}>
          <Campo label="Título"><Texto valor={i.titulo} onChange={(t) => trocar(i.id, { titulo: t })} placeholder="O que o cliente ganha" /></Campo>
          <Campo label="Detalhe"><Texto valor={i.texto} onChange={(t) => trocar(i.id, { texto: t })} placeholder="Opcional" linhas={2} /></Campo>
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar benefício" onClick={() => onPatch({ itens: [...itens, { id: novoId("i"), titulo: "Novo benefício" }] })} />
    </Grade>
  );
}

function ConteudoFaq({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const faq = bloco.faq ?? [];
  const trocar = (id: string, p: Partial<ItemFaq>) => onPatch({ faq: faq.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  return (
    <Grade>
      {faq.map((f, idx) => (
        <CartaoItem key={f.id} titulo={`Pergunta ${idx + 1}`} onRemover={() => onPatch({ faq: faq.filter((x) => x.id !== f.id) })}>
          <Campo label="Pergunta"><Texto valor={f.pergunta} onChange={(t) => trocar(f.id, { pergunta: t })} placeholder="Como funciona?" /></Campo>
          <Campo label="Resposta"><Texto valor={f.resposta} onChange={(t) => trocar(f.id, { resposta: t })} placeholder="Explique aqui." linhas={3} /></Campo>
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar pergunta" onClick={() => onPatch({ faq: [...faq, { id: novoId("q"), pergunta: "Nova pergunta", resposta: "" }] })} />
    </Grade>
  );
}

function ConteudoDepoimentos({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const lista = bloco.depoimentos ?? [];
  const trocar = (id: string, p: Partial<ItemDepoimento>) => onPatch({ depoimentos: lista.map((d) => (d.id === id ? { ...d, ...p } : d)) });
  return (
    <Grade>
      <Campo label="Formato" hint={bloco.formato === "colunas" ? "Três colunas rolando devagar (uma no celular). Fica bom a partir de 6 depoimentos." : undefined}>
        <Segmentado valor={bloco.formato === "colunas" ? "colunas" : "grade"}
          onChange={(v) => onPatch({ formato: v === "colunas" ? "colunas" : undefined })}
          opcoes={[{ valor: "grade", label: "Grade" }, { valor: "colunas", label: "Colunas rolando" }]} />
      </Campo>
      {lista.map((d, idx) => (
        <CartaoItem key={d.id} titulo={`Depoimento ${idx + 1}`} onRemover={() => onPatch({ depoimentos: lista.filter((x) => x.id !== d.id) })}>
          <Campo label="Nome"><Texto valor={d.nome} onChange={(t) => trocar(d.id, { nome: t })} placeholder="Quem falou" /></Campo>
          <Campo label="Depoimento"><Texto valor={d.texto} onChange={(t) => trocar(d.id, { texto: t })} placeholder="O que a pessoa disse" linhas={3} /></Campo>
          <Campo label="Cargo ou cidade"><Texto valor={d.cargo} onChange={(t) => trocar(d.id, { cargo: t })} placeholder="Opcional" /></Campo>
          <Campo label="Foto"><EntradaImagem valor={d.fotoUrl} onChange={(u) => trocar(d.id, { fotoUrl: u })} /></Campo>
          <Campo label="Nota" hint="De 0 a 5 estrelas."><Numero valor={d.nota} onChange={(n) => trocar(d.id, { nota: n })} min={0} max={5} sufixo="estrelas" /></Campo>
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar depoimento" onClick={() => onPatch({ depoimentos: [...lista, { id: novoId("d"), nome: "Cliente", texto: "", nota: 5 }] })} />
    </Grade>
  );
}

// ── Cabeçalho ────────────────────────────────────────────────────────────────
function ConteudoCabecalho({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const c = bloco.cabecalho ?? { marca: "", links: [] };
  const set = (p: Partial<typeof c>) => onPatch({ cabecalho: { ...c, ...p } });
  const trocar = (id: string, p: Partial<LinkCabecalho>) => set({ links: c.links.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  return (
    <Grade>
      <Campo label="Nome da marca" hint="Aparece quando não há logo, e descreve o logo pra leitor de tela.">
        <Texto valor={c.marca} onChange={(t) => set({ marca: t })} placeholder="Sua marca" />
      </Campo>
      <Campo label="Logo" hint="Opcional. Fundo transparente, até 32px de altura na tela."><EntradaImagem valor={c.logoUrl} onChange={(u) => set({ logoUrl: u })} /></Campo>
      <Campo label="Botão"><Texto valor={c.rotuloBotao} onChange={(t) => set({ rotuloBotao: t })} placeholder="Começar" /></Campo>
      <Campo label="Destino do botão"><Texto valor={c.urlBotao} onChange={(u) => set({ urlBotao: u })} placeholder="https://…" /></Campo>
      <LinhaToggle label="Fixo no topo ao rolar" hint="Acompanha a pessoa pela página inteira. No editor ele fica parado pra não cobrir o painel."
        ativo={!!c.fixo} onChange={(a) => set({ fixo: a || undefined })} />
      <Recado texto="No celular os links viram o botão ☰, que abre a lista inteira." />
      {c.links.map((l, idx) => (
        <CartaoItem key={l.id} titulo={`Link ${idx + 1}`} onRemover={() => set({ links: c.links.filter((x) => x.id !== l.id) })}>
          <Campo label="Texto"><Texto valor={l.texto} onChange={(t) => trocar(l.id, { texto: t })} placeholder="Recursos" /></Campo>
          {!l.filhos?.length && (
            <Campo label="Destino" hint="Link ou âncora (#recursos)."><Texto valor={l.url} onChange={(u) => trocar(l.id, { url: u })} placeholder="#" /></Campo>
          )}
          <Recado texto={l.filhos?.length ? "Com submenu, o item abre a lista abaixo em vez de ir pra um endereço." : "Adicione itens de submenu pra este link virar um menu com seta."} />
          {(l.filhos ?? []).map((f, j) => (
            <CartaoItem key={f.id} titulo={`Submenu ${j + 1}`} onRemover={() => trocar(l.id, { filhos: l.filhos!.filter((x) => x.id !== f.id) })}>
              <Campo label="Texto"><Texto valor={f.texto} onChange={(t) => trocar(l.id, { filhos: l.filhos!.map((x) => (x.id === f.id ? { ...x, texto: t } : x)) })} placeholder="Produto" /></Campo>
              <Campo label="Linha de apoio"><Texto valor={f.descricao} onChange={(t) => trocar(l.id, { filhos: l.filhos!.map((x) => (x.id === f.id ? { ...x, descricao: t || undefined } : x)) })} placeholder="Opcional" /></Campo>
              <Campo label="Destino"><Texto valor={f.url} onChange={(u) => trocar(l.id, { filhos: l.filhos!.map((x) => (x.id === f.id ? { ...x, url: u } : x)) })} placeholder="/p/pagina" /></Campo>
            </CartaoItem>
          ))}
          <BotaoAdicionar rotulo="Adicionar item de submenu" onClick={() => trocar(l.id, { filhos: [...(l.filhos ?? []), { id: novoId("lk"), texto: "Novo item", url: "" }] })} />
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar link" onClick={() => set({ links: [...c.links, { id: novoId("lk"), texto: "Novo link", url: "#" }] })} />
    </Grade>
  );
}

// ── Bento ────────────────────────────────────────────────────────────────────
const TAMANHOS_BENTO: { valor: TamanhoBento; label: string }[] = [
  { valor: "normal", label: "Normal (1×1)" }, { valor: "largo", label: "Largo (2×1)" },
  { valor: "alto", label: "Alto (1×2)" }, { valor: "grande", label: "Grande (2×2)" },
];

function ConteudoBento({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const lista = bloco.bento ?? [];
  const trocar = (id: string, p: Partial<ItemBento>) => onPatch({ bento: lista.map((q) => (q.id === id ? { ...q, ...p } : q)) });
  return (
    <Grade>
      <Recado texto="Quatro colunas no computador. Um grande + dois normais + um largo fecham um retângulo." />
      {lista.map((q, idx) => (
        <CartaoItem key={q.id} titulo={`Quadro ${idx + 1}`} onRemover={() => onPatch({ bento: lista.filter((x) => x.id !== q.id) })}>
          <Campo label="Tamanho"><Selecao valor={q.tamanho} onChange={(v) => trocar(q.id, { tamanho: v })} opcoes={TAMANHOS_BENTO} /></Campo>
          <Campo label="Tom">
            <Segmentado valor={q.tom} onChange={(v) => trocar(q.id, { tom: v as TomBento })}
              opcoes={[{ valor: "claro", label: "Claro" }, { valor: "escuro", label: "Escuro" }, { valor: "cor", label: "Cor" }]} />
          </Campo>
          <Campo label="Etiqueta"><Texto valor={q.etiqueta} onChange={(t) => trocar(q.id, { etiqueta: t || undefined })} placeholder="Opcional" /></Campo>
          <Campo label="Título"><Texto valor={q.titulo} onChange={(t) => trocar(q.id, { titulo: t })} placeholder="O que o quadro diz" /></Campo>
          <Campo label="Texto"><Texto valor={q.texto} onChange={(t) => trocar(q.id, { texto: t || undefined })} placeholder="Opcional" linhas={2} /></Campo>
          <Campo label="Foto de fundo" hint="Cobre o quadro; o texto ganha véu escuro."><EntradaImagem valor={q.imagemUrl} onChange={(u) => trocar(q.id, { imagemUrl: u || undefined })} /></Campo>
          <Campo label="Etiquetas em pílula" hint="Separe por vírgula.">
            <Texto valor={(q.chips ?? []).join(", ")} placeholder="Hardware, Software"
              onChange={(t) => { const l = t.split(",").map((x) => x.trim()).filter(Boolean); trocar(q.id, { chips: l.length ? l : undefined }); }} />
          </Campo>
          <Campo label="Botão"><Texto valor={q.link?.texto} onChange={(t) => trocar(q.id, { link: t ? { texto: t, url: q.link?.url ?? "" } : undefined })} placeholder="Explorar" /></Campo>
          {q.link && <Campo label="Destino do botão"><Texto valor={q.link.url} onChange={(u) => trocar(q.id, { link: { texto: q.link!.texto, url: u } })} placeholder="/p/pagina#secao" /></Campo>}
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar quadro" onClick={() => onPatch({ bento: [...lista, { id: novoId("bt"), tamanho: "normal", tom: "claro", titulo: "Novo quadro" }] })} />
    </Grade>
  );
}

// ── Carrossel ────────────────────────────────────────────────────────────────
function ConteudoCarrossel({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const lista = bloco.slides ?? [];
  const trocar = (id: string, p: Partial<ItemSlide>) => onPatch({ slides: lista.map((q) => (q.id === id ? { ...q, ...p } : q)) });
  return (
    <Grade>
      {lista.map((q, idx) => (
        <CartaoItem key={q.id} titulo={`Cartão ${idx + 1}`} onRemover={() => onPatch({ slides: lista.filter((x) => x.id !== q.id) })}>
          <Campo label="Etiqueta"><Texto valor={q.etiqueta} onChange={(t) => trocar(q.id, { etiqueta: t || undefined })} placeholder="Opcional" /></Campo>
          <Campo label="Título"><Texto valor={q.titulo} onChange={(t) => trocar(q.id, { titulo: t })} placeholder="O que o cartão diz" /></Campo>
          <Campo label="Texto"><Texto valor={q.texto} onChange={(t) => trocar(q.id, { texto: t || undefined })} placeholder="Opcional" linhas={2} /></Campo>
          <Campo label="Imagem" hint="Vai no pé do cartão."><EntradaImagem valor={q.imagemUrl} onChange={(u) => trocar(q.id, { imagemUrl: u || undefined })} /></Campo>
          <Campo label="Link"><Texto valor={q.link?.texto} onChange={(t) => trocar(q.id, { link: t ? { texto: t, url: q.link?.url ?? "" } : undefined })} placeholder="Saiba mais" /></Campo>
          {q.link && <Campo label="Destino do link"><Texto valor={q.link.url} onChange={(u) => trocar(q.id, { link: { texto: q.link!.texto, url: u } })} placeholder="/p/pagina" /></Campo>}
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar cartão" onClick={() => onPatch({ slides: [...lista, { id: novoId("sl"), titulo: "Novo cartão" }] })} />
    </Grade>
  );
}

// ── Rodapé ───────────────────────────────────────────────────────────────────
function EditorLinks({ links, onChange, rotulo }: { links: LinkCabecalho[]; onChange: (l: LinkCabecalho[]) => void; rotulo: string }) {
  const trocar = (id: string, p: Partial<LinkCabecalho>) => onChange(links.map((l) => (l.id === id ? { ...l, ...p } : l)));
  return (
    <>
      {links.map((l, idx) => (
        <CartaoItem key={l.id} titulo={`${rotulo} ${idx + 1}`} onRemover={() => onChange(links.filter((x) => x.id !== l.id))}>
          <Campo label="Texto"><Texto valor={l.texto} onChange={(t) => trocar(l.id, { texto: t })} placeholder="Sobre" /></Campo>
          <Campo label="Destino" hint="Link, /p/pagina, mailto: ou vazio (vira texto)."><Texto valor={l.url} onChange={(u) => trocar(l.id, { url: u })} placeholder="https://…" /></Campo>
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo={`Adicionar ${rotulo.toLowerCase()}`} onClick={() => onChange([...links, { id: novoId("lk"), texto: "Novo link", url: "" }])} />
    </>
  );
}

function ConteudoRodape({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const r = bloco.rodape ?? { marca: "", colunas: [], linksLegais: [] };
  const set = (p: Partial<typeof r>) => onPatch({ rodape: { ...r, ...p } });
  const trocarColuna = (id: string, p: Partial<(typeof r.colunas)[number]>) =>
    set({ colunas: r.colunas.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  return (
    <Grade>
      <Campo label="Nome da marca" hint="Também vai no © da linha de baixo."><Texto valor={r.marca} onChange={(t) => set({ marca: t })} placeholder="Sua marca" /></Campo>
      <Campo label="Logo" hint="Opcional. Sem logo, aparece o nome."><EntradaImagem valor={r.logoUrl} onChange={(u) => set({ logoUrl: u })} /></Campo>
      <Campo label="Frase"><Texto valor={r.texto} onChange={(t) => set({ texto: t })} placeholder="O que a empresa faz, em uma frase." linhas={2} /></Campo>
      {r.colunas.map((c, idx) => (
        <CartaoItem key={c.id} titulo={`Coluna ${idx + 1}`} onRemover={() => set({ colunas: r.colunas.filter((x) => x.id !== c.id) })}>
          <Campo label="Título da coluna"><Texto valor={c.titulo} onChange={(t) => trocarColuna(c.id, { titulo: t })} placeholder="Produtos" /></Campo>
          <EditorLinks links={c.links} rotulo="Link" onChange={(links) => trocarColuna(c.id, { links })} />
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar coluna" onClick={() => set({ colunas: [...r.colunas, { id: novoId("rc"), titulo: "Nova coluna", links: [] }] })} />
      <Recado texto="Linha de baixo: o © com o ano sai sozinho; aqui vão os links legais." />
      <EditorLinks links={r.linksLegais} rotulo="Link legal" onChange={(linksLegais) => set({ linksLegais })} />
    </Grade>
  );
}

// ── Selo de marcas (logos) ───────────────────────────────────────────────────
function ConteudoLogos({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const lista = bloco.logos ?? [];
  const trocar = (id: string, p: Partial<ItemLogo>) => onPatch({ logos: lista.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  return (
    <Grade>
      {lista.map((l, idx) => (
        <CartaoItem key={l.id} titulo={`Marca ${idx + 1}`} onRemover={() => onPatch({ logos: lista.filter((x) => x.id !== l.id) })}>
          <Campo label="Imagem" hint="Fundo transparente (.png / .svg) fica melhor."><EntradaImagem valor={l.url} onChange={(u) => trocar(l.id, { url: u })} /></Campo>
          <Campo label="Nome da marca" hint="Para leitores de tela."><Texto valor={l.alt} onChange={(t) => trocar(l.id, { alt: t })} placeholder="Ex.: Loja XPTO" /></Campo>
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar marca" onClick={() => onPatch({ logos: [...lista, { id: novoId("lg"), url: "", alt: "" }] })} />
    </Grade>
  );
}

// ── Números / métricas ───────────────────────────────────────────────────────
function ConteudoMetricas({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const lista = bloco.metricas ?? [];
  const trocar = (id: string, p: Partial<ItemMetrica>) => onPatch({ metricas: lista.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  return (
    <Grade>
      {lista.map((m, idx) => (
        <CartaoItem key={m.id} titulo={`Número ${idx + 1}`} onRemover={() => onPatch({ metricas: lista.filter((x) => x.id !== m.id) })}>
          <Campo label="Número" hint='Pode ter texto: "+10 mil", "98%", "24h".'><Texto valor={m.numero} onChange={(t) => trocar(m.id, { numero: t })} placeholder="+10 mil" /></Campo>
          <Campo label="Descrição"><Texto valor={m.rotulo} onChange={(t) => trocar(m.id, { rotulo: t })} placeholder="clientes atendidos" /></Campo>
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar número" onClick={() => onPatch({ metricas: [...lista, { id: novoId("m"), numero: "100%", rotulo: "descrição" }] })} />
    </Grade>
  );
}

// ── Galeria de imagens ───────────────────────────────────────────────────────
function ConteudoGaleria({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const lista = bloco.galeria ?? [];
  const trocar = (id: string, p: Partial<ItemGaleria>) => onPatch({ galeria: lista.map((g) => (g.id === id ? { ...g, ...p } : g)) });
  return (
    <Grade>
      {lista.map((g, idx) => (
        <CartaoItem key={g.id} titulo={`Imagem ${idx + 1}`} onRemover={() => onPatch({ galeria: lista.filter((x) => x.id !== g.id) })}>
          <Campo label="Imagem"><EntradaImagem valor={g.url} onChange={(u) => trocar(g.id, { url: u })} /></Campo>
          <Campo label="Legenda"><Texto valor={g.legenda} onChange={(t) => trocar(g.id, { legenda: t })} placeholder="Opcional" /></Campo>
          <Campo label="Texto alternativo"><Texto valor={g.alt} onChange={(t) => trocar(g.id, { alt: t })} placeholder="Descreve a imagem" /></Campo>
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar imagem" onClick={() => onPatch({ galeria: [...lista, { id: novoId("g"), url: "", alt: "" }] })} />
    </Grade>
  );
}

// ── Grade de recursos ────────────────────────────────────────────────────────
function SeletorIcone({ valor, onChange }: { valor?: string; onChange: (id: string) => void }) {
  const atual = glifoRecurso(valor);
  return (
    <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fill, minmax(40px, 1fr))" }}>
      {ICONES_RECURSO.map((ic) => {
        const ativo = atual === ic.id;
        return (
          <button
            key={ic.id} type="button" title={ic.rotulo} aria-label={ic.rotulo}
            onClick={() => onChange(ic.id)}
            style={{
              display: "grid", placeItems: "center", height: 40, borderRadius: 9, cursor: "pointer",
              border: `1px solid ${ativo ? ACENTO : "var(--border)"}`,
              background: ativo ? "var(--surface-2)" : "var(--surface)",
              boxShadow: ativo ? `0 0 0 2px ${ACENTO}22` : "none",
            }}
          >
            <Icon name={ic.id} size={18} color={ativo ? ACENTO : "var(--text-dim)"} />
          </button>
        );
      })}
    </div>
  );
}

function ConteudoRecursos({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const lista = bloco.recursos ?? [];
  const trocar = (id: string, p: Partial<ItemRecurso>) => onPatch({ recursos: lista.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  return (
    <Grade>
      {lista.map((r, idx) => (
        <CartaoItem key={r.id} titulo={`Recurso ${idx + 1}`} onRemover={() => onPatch({ recursos: lista.filter((x) => x.id !== r.id) })}>
          <Campo label="Ícone"><SeletorIcone valor={r.icone} onChange={(i) => trocar(r.id, { icone: i })} /></Campo>
          <Campo label="Título"><Texto valor={r.titulo} onChange={(t) => trocar(r.id, { titulo: t })} placeholder="O recurso" /></Campo>
          <Campo label="Detalhe"><Texto valor={r.texto} onChange={(t) => trocar(r.id, { texto: t })} placeholder="Explique em uma frase" linhas={2} /></Campo>
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar recurso" onClick={() => onPatch({ recursos: [...lista, { id: novoId("r"), icone: ICONES_RECURSO[0].id, titulo: "Novo recurso" }] })} />
    </Grade>
  );
}

// ── Passo a passo ────────────────────────────────────────────────────────────
function ConteudoPassos({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const lista = bloco.passos ?? [];
  const trocar = (id: string, p: Partial<ItemPasso>) => onPatch({ passos: lista.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  return (
    <Grade>
      {lista.map((p, idx) => (
        <CartaoItem key={p.id} titulo={`Passo ${idx + 1}`} onRemover={() => onPatch({ passos: lista.filter((x) => x.id !== p.id) })}>
          <Campo label="Título"><Texto valor={p.titulo} onChange={(t) => trocar(p.id, { titulo: t })} placeholder="O que a pessoa faz" /></Campo>
          <Campo label="Detalhe"><Texto valor={p.texto} onChange={(t) => trocar(p.id, { texto: t })} placeholder="Opcional" linhas={2} /></Campo>
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar passo" onClick={() => onPatch({ passos: [...lista, { id: novoId("p"), titulo: "Novo passo" }] })} />
    </Grade>
  );
}

// ── Tabela comparativa ───────────────────────────────────────────────────────
function ConteudoComparacao({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const c = bloco.comparacao ?? { linhas: [] as LinhaComparacao[] };
  const setC = (p: Partial<NonNullable<Bloco["comparacao"]>>) => onPatch({ comparacao: { ...c, ...p } });
  const linhas = c.linhas ?? [];
  const trocar = (id: string, p: Partial<LinhaComparacao>) => setC({ linhas: linhas.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  return (
    <Grade>
      <Secao titulo="Colunas">
        <Campo label="Sua coluna"><Texto valor={c.colunaNos} onChange={(t) => setC({ colunaNos: t })} placeholder="Com a gente" /></Campo>
        <Campo label="Coluna do concorrente"><Texto valor={c.colunaEles} onChange={(t) => setC({ colunaEles: t })} placeholder="Sem a gente" /></Campo>
      </Secao>
      <Secao titulo="Itens">
        {linhas.map((l, idx) => (
          <CartaoItem key={l.id} titulo={`Item ${idx + 1}`} onRemover={() => setC({ linhas: linhas.filter((x) => x.id !== l.id) })}>
            <Campo label="O que compara"><Texto valor={l.recurso} onChange={(t) => trocar(l.id, { recurso: t })} placeholder="Ex.: Suporte 24h" /></Campo>
            <LinhaToggle label="Sua coluna tem" ativo={l.nos} onChange={(v) => trocar(l.id, { nos: v })} />
            <LinhaToggle label="Concorrente tem" ativo={l.eles} onChange={(v) => trocar(l.id, { eles: v })} />
          </CartaoItem>
        ))}
        <BotaoAdicionar rotulo="Adicionar item" onClick={() => setC({ linhas: [...linhas, { id: novoId("cp"), recurso: "Novo item", nos: true, eles: false }] })} />
      </Secao>
    </Grade>
  );
}

// ── Tabela de planos ─────────────────────────────────────────────────────────
function ConteudoPlanos({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const lista = bloco.planos ?? [];
  const trocar = (id: string, p: Partial<Plano>) => onPatch({ planos: lista.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  return (
    <Grade>
      {lista.map((p, idx) => (
        <CartaoItem key={p.id} titulo={`Plano ${idx + 1}`} onRemover={() => onPatch({ planos: lista.filter((x) => x.id !== p.id) })}>
          <Campo label="Nome"><Texto valor={p.nome} onChange={(t) => trocar(p.id, { nome: t })} placeholder="Profissional" /></Campo>
          <Campo label="Preço"><Texto valor={p.preco} onChange={(t) => trocar(p.id, { preco: t })} placeholder="R$ 197" /></Campo>
          <Campo label="Preço antigo" hint="Aparece riscado."><Texto valor={p.precoAntes} onChange={(t) => trocar(p.id, { precoAntes: t })} placeholder="Opcional" /></Campo>
          <Campo label="Período"><Texto valor={p.periodo} onChange={(t) => trocar(p.id, { periodo: t })} placeholder="/mês" /></Campo>
          <Campo label="O que inclui" hint="Um item por linha.">
            <Texto valor={paraLinhas(p.beneficios)} onChange={(t) => trocar(p.id, { beneficios: deLinhas(t) })} linhas={4} />
          </Campo>
          <Campo label="Rótulo do botão"><Texto valor={p.rotuloBotao} onChange={(t) => trocar(p.id, { rotuloBotao: t })} placeholder="Assinar" /></Campo>
          <Campo label="Endereço do checkout"><Texto valor={p.checkoutUrl} onChange={(t) => trocar(p.id, { checkoutUrl: t })} placeholder="https://…" /></Campo>
          <Campo label="Selo"><Texto valor={p.selo} onChange={(t) => trocar(p.id, { selo: t })} placeholder="Mais popular" /></Campo>
          <LinhaToggle label="Plano em destaque" hint="Ganha borda e cor de destaque." ativo={!!p.destaque} onChange={(d) => trocar(p.id, { destaque: d })} />
        </CartaoItem>
      ))}
      <BotaoAdicionar rotulo="Adicionar plano" onClick={() => onPatch({ planos: [...lista, { id: novoId("pl"), nome: "Novo plano", preco: "R$ 0", periodo: "/mês", beneficios: ["Recurso incluso"], rotuloBotao: "Assinar", checkoutUrl: "" }] })} />
    </Grade>
  );
}

// ── Selo de garantia ─────────────────────────────────────────────────────────
function ConteudoGarantia({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const g = bloco.garantia ?? { titulo: "" };
  const set = (p: Partial<NonNullable<Bloco["garantia"]>>) => onPatch({ garantia: { ...g, ...p } });
  return (
    <Grade>
      <Campo label="Título"><Texto valor={g.titulo} onChange={(t) => set({ titulo: t })} placeholder="Garantia de 7 dias" /></Campo>
      <Campo label="Texto"><Texto valor={g.texto} onChange={(t) => set({ texto: t })} placeholder="Se não gostar, devolvemos 100% do valor." linhas={3} /></Campo>
      <Campo label="Selo" hint="Uma linha curta embaixo."><Texto valor={g.selo} onChange={(t) => set({ selo: t })} placeholder="Compra 100% segura" /></Campo>
    </Grade>
  );
}

// ── Formulário ───────────────────────────────────────────────────────────────
const TIPOS_CAMPO: { valor: CampoTipo; label: string }[] = [
  { valor: "nome", label: "Nome" },
  { valor: "email", label: "E-mail" },
  { valor: "telefone", label: "Telefone / WhatsApp" },
  { valor: "texto", label: "Texto livre" },
  { valor: "selecao", label: "Lista de opções" },
  { valor: "checkbox", label: "Caixa de seleção" },
];

function ConteudoFormulario({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const campos = bloco.campos ?? [];
  const envio = bloco.envio ?? { acao: "mensagem" as AcaoPosEnvio };
  const trocar = (id: string, p: Partial<CampoForm>) => onPatch({ campos: campos.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const setEnvio = (p: Partial<NonNullable<Bloco["envio"]>>) => onPatch({ envio: { ...envio, ...p } });

  return (
    <Grade>
      <Secao titulo="Campos">
        {campos.map((c, idx) => (
          <CartaoItem key={c.id} titulo={`Campo ${idx + 1}`} onRemover={() => onPatch({ campos: campos.filter((x) => x.id !== c.id) })}>
            <Campo label="Tipo"><Selecao valor={c.tipo} onChange={(t) => trocar(c.id, { tipo: t })} opcoes={TIPOS_CAMPO} /></Campo>
            <Campo label="Rótulo"><Texto valor={c.rotulo} onChange={(t) => trocar(c.id, { rotulo: t })} placeholder="Como aparece na página" /></Campo>
            <Campo label="Texto de exemplo"><Texto valor={c.placeholder} onChange={(t) => trocar(c.id, { placeholder: t })} placeholder="Opcional" /></Campo>
            {c.tipo === "selecao" && (
              <Campo label="Opções" hint="Uma por linha.">
                <Texto valor={paraLinhas(c.opcoes)} onChange={(t) => trocar(c.id, { opcoes: deLinhas(t) })} linhas={3} />
              </Campo>
            )}
            <LinhaToggle label="Obrigatório" ativo={!!c.obrigatorio} onChange={(o) => trocar(c.id, { obrigatorio: o })} />
          </CartaoItem>
        ))}
        <BotaoAdicionar rotulo="Adicionar campo" onClick={() => onPatch({ campos: [...campos, { id: novoId("c"), tipo: "texto", rotulo: "Novo campo" }] })} />
      </Secao>

      <Secao titulo="Após enviar">
        <Campo label="O que acontece">
          <Selecao valor={envio.acao} onChange={(a) => setEnvio({ acao: a })}
            opcoes={[
              { valor: "mensagem", label: "Mostrar uma mensagem" },
              { valor: "redirect", label: "Levar para outra página" },
              { valor: "fluxo", label: "Abrir um fluxo do TridiFlow" },
              { valor: "whatsapp", label: "Abrir o WhatsApp" },
            ]}
          />
        </Campo>
        {envio.acao === "mensagem" && (
          <Campo label="Mensagem de agradecimento">
            <Texto valor={envio.mensagem} onChange={(t) => setEnvio({ mensagem: t })} placeholder="Recebemos seus dados!" linhas={3} />
          </Campo>
        )}
        {envio.acao === "redirect" && (
          <Campo label="Endereço de destino"><Texto valor={envio.url} onChange={(t) => setEnvio({ url: t })} placeholder="https://…" /></Campo>
        )}
        {envio.acao === "fluxo" && (
          <Campo label="Identificador do fluxo" hint="O slug do projeto que vai receber a pessoa.">
            <Texto valor={envio.fluxoSlug} onChange={(t) => setEnvio({ fluxoSlug: t })} placeholder="meu-fluxo" />
          </Campo>
        )}
        {envio.acao === "whatsapp" && (
          <Campo label="Telefone" hint="DDI+DDD, ex.: 5511912345678">
            <Texto valor={envio.telefone} onChange={(t) => setEnvio({ telefone: t })} placeholder="5511912345678" />
          </Campo>
        )}
        <Campo label="Rótulo do botão"><Texto valor={envio.rotuloBotao} onChange={(t) => setEnvio({ rotuloBotao: t })} placeholder="Enviar" /></Campo>
      </Secao>
    </Grade>
  );
}

// ── Oferta ───────────────────────────────────────────────────────────────────
function ConteudoOferta({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const o = bloco.oferta ?? { produto: "" };
  const set = (p: Partial<NonNullable<Bloco["oferta"]>>) => onPatch({ oferta: { ...o, ...p } });
  return (
    <Grade>
      <Secao titulo="Produto">
        <Campo label="Nome"><Texto valor={o.produto} onChange={(t) => set({ produto: t })} placeholder="Nome do produto" /></Campo>
        <Campo label="Descrição"><Texto valor={o.descricao} onChange={(t) => set({ descricao: t })} placeholder="Descrição curta" linhas={3} /></Campo>
        <Campo label="Imagem"><EntradaImagem valor={o.imagemUrl} onChange={(u) => set({ imagemUrl: u })} /></Campo>
        <Campo label="O que está incluso" hint="Um item por linha.">
          <Texto valor={paraLinhas(o.beneficios)} onChange={(t) => set({ beneficios: deLinhas(t) })} linhas={4} />
        </Campo>
      </Secao>

      <Secao titulo="Preço">
        <Campo label="Preço antigo" hint="Aparece riscado."><Texto valor={o.precoAntes} onChange={(t) => set({ precoAntes: t })} placeholder="R$ 297" /></Campo>
        <Campo label="Preço"><Texto valor={o.preco} onChange={(t) => set({ preco: t })} placeholder="R$ 197" /></Campo>
        <Campo label="Parcelamento"><Texto valor={o.parcelamento} onChange={(t) => set({ parcelamento: t })} placeholder="ou 12x de R$ 19,90" /></Campo>
      </Secao>

      <Secao titulo="Botão e checkout">
        <Campo label="Rótulo do botão"><Texto valor={o.rotuloBotao} onChange={(t) => set({ rotuloBotao: t })} placeholder="Comprar agora" /></Campo>
        <Campo label="Endereço do checkout"><Texto valor={o.checkoutUrl} onChange={(t) => set({ checkoutUrl: t })} placeholder="https://…" /></Campo>
        <LinhaCor label="Cor do botão" valor={o.corBotao} onChange={(c) => set({ corBotao: c })} padrao="var(--primary-texto)" />
      </Secao>

      <Secao titulo="Reforços" aberta={false}>
        <Campo label="Selo"><Texto valor={o.selo} onChange={(t) => set({ selo: t })} placeholder="Mais vendido" /></Campo>
        <Campo label="Garantia"><Texto valor={o.garantia} onChange={(t) => set({ garantia: t })} placeholder="7 dias de garantia" /></Campo>
        <Campo label="Observação extra"><Texto valor={o.extra} onChange={(t) => set({ extra: t })} placeholder="Pagamento seguro" linhas={2} /></Campo>
        <LinhaToggle label="Card em destaque" hint="Dá mais peso visual ao card na página." ativo={!!o.destaque} onChange={(d) => set({ destaque: d })} />
      </Secao>
    </Grade>
  );
}

// ── Colunas ──────────────────────────────────────────────────────────────────
/** Muda a quantidade de colunas sem perder bloco: o que sobra vai pra última. */
function ajustarColunas(atuais: { id: string; blocos: Bloco[] }[], qtd: number) {
  if (qtd > atuais.length) {
    const novas = [...atuais];
    while (novas.length < qtd) novas.push({ id: novoId("col"), blocos: [] });
    return novas;
  }
  if (qtd < atuais.length && qtd > 0) {
    const mantidas = atuais.slice(0, qtd).map((c) => ({ ...c, blocos: [...c.blocos] }));
    const sobra = atuais.slice(qtd).flatMap((c) => c.blocos);
    const ultima = mantidas[qtd - 1];
    mantidas[qtd - 1] = { ...ultima, blocos: [...ultima.blocos, ...sobra] };
    return mantidas;
  }
  return atuais;
}

function ConteudoColunas({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  const colunas = bloco.colunas ?? [];
  return (
    <Grade>
      <Campo label="Quantidade de colunas">
        <Segmentado valor={String(colunas.length || 2)}
          onChange={(v) => onPatch({ colunas: ajustarColunas(colunas, Number(v)) })}
          opcoes={[{ valor: "2", label: "2 colunas" }, { valor: "3", label: "3 colunas" }]} />
      </Campo>
      <Campo label="No celular" hint="Empilhar é o mais seguro para leitura.">
        <Segmentado valor={String(bloco.colunasMobile ?? 1)}
          onChange={(v) => onPatch({ colunasMobile: Number(v) === 2 ? 2 : 1 })}
          opcoes={[{ valor: "1", label: "Empilhar" }, { valor: "2", label: "Lado a lado" }]} />
      </Campo>
      <Recado texto="O conteúdo de cada coluna é montado direto na página: arraste blocos para dentro dela." />
    </Grade>
  );
}

// ── Inspetor ─────────────────────────────────────────────────────────────────
export function InspetorConteudo({ bloco, onPatch }: { bloco: Bloco; onPatch: Patch }) {
  switch (bloco.tipo) {
    case "titulo":
      return (
        <Grade>
          <Campo label="Título"><Texto valor={bloco.texto} onChange={(t) => onPatch({ texto: t })} placeholder="Seu título aqui" linhas={2} /></Campo>
          <Campo label="Trecho em destaque" hint="Copie uma palavra do título: ela sai em itálico, na cor principal.">
            <Texto valor={bloco.destaque} onChange={(t) => onPatch({ destaque: t || undefined })} placeholder="Ex.: sozinho" />
          </Campo>
          {bloco.destaque && (
            <Campo label="Palavras que se revezam" hint="Uma por linha. Na página no ar, o destaque troca por elas, letra a letra, a cada 2,6 s.">
              <Texto valor={(bloco.trocas ?? []).join("\n")} linhas={3} placeholder={"no totem.\nno WhatsApp."}
                onChange={(t) => { const l = t.split("\n").map((x) => x.trim()).filter(Boolean); onPatch({ trocas: l.length ? l : undefined }); }} />
            </Campo>
          )}
          <Campo label="Nível" hint="H1 é o título principal da página — use só uma vez.">
            <Segmentado valor={String(bloco.nivel ?? 1)} onChange={(v) => onPatch({ nivel: (Number(v) || 1) as 1 | 2 | 3 })}
              opcoes={[{ valor: "1", label: "H1" }, { valor: "2", label: "H2" }, { valor: "3", label: "H3" }]} />
          </Campo>
        </Grade>
      );

    case "texto":
      return (
        <Grade>
          <Campo label="Texto"><Texto valor={bloco.texto} onChange={(t) => onPatch({ texto: t })} placeholder="Escreva aqui." linhas={4} /></Campo>
          <Campo label="Formato" hint={bloco.formato === "selo" ? "Etiqueta curta acima do título. Duas a cinco palavras." : undefined}>
            <Segmentado valor={bloco.formato === "selo" ? "selo" : "paragrafo"}
              onChange={(v) => onPatch({ formato: v === "selo" ? "selo" : undefined })}
              opcoes={[{ valor: "paragrafo", label: "Parágrafo" }, { valor: "selo", label: "Selo" }]} />
          </Campo>
        </Grade>
      );

    case "imagem":
      return (
        <Grade>
          <Campo label="Imagem"><EntradaImagem valor={bloco.url} onChange={(u) => onPatch({ url: u })} /></Campo>
          <Campo label="Texto alternativo" hint="Descreve a imagem para leitores de tela e para quando ela não carrega.">
            <Texto valor={bloco.alt} onChange={(t) => onPatch({ alt: t })} placeholder="Ex.: mulher usando o produto" />
          </Campo>
        </Grade>
      );

    case "video":
      return <ConteudoVideo bloco={bloco} onPatch={onPatch} />;
    case "beneficios":
      return <ConteudoBeneficios bloco={bloco} onPatch={onPatch} />;
    case "faq":
      return <ConteudoFaq bloco={bloco} onPatch={onPatch} />;
    case "depoimentos":
      return <ConteudoDepoimentos bloco={bloco} onPatch={onPatch} />;
    case "cabecalho":
      return <ConteudoCabecalho bloco={bloco} onPatch={onPatch} />;
    case "rodape":
      return <ConteudoRodape bloco={bloco} onPatch={onPatch} />;
    case "bento":
      return <ConteudoBento bloco={bloco} onPatch={onPatch} />;
    case "carrossel":
      return <ConteudoCarrossel bloco={bloco} onPatch={onPatch} />;
    case "logos":
      return <ConteudoLogos bloco={bloco} onPatch={onPatch} />;
    case "metricas":
      return <ConteudoMetricas bloco={bloco} onPatch={onPatch} />;
    case "galeria":
      return <ConteudoGaleria bloco={bloco} onPatch={onPatch} />;
    case "recursos":
      return <ConteudoRecursos bloco={bloco} onPatch={onPatch} />;
    case "passos":
      return <ConteudoPassos bloco={bloco} onPatch={onPatch} />;
    case "comparacao":
      return <ConteudoComparacao bloco={bloco} onPatch={onPatch} />;
    case "planos":
      return <ConteudoPlanos bloco={bloco} onPatch={onPatch} />;
    case "garantia":
      return <ConteudoGarantia bloco={bloco} onPatch={onPatch} />;

    case "botao":
      return (
        <Grade>
          <Campo label="Rótulo"><Texto valor={bloco.texto} onChange={(t) => onPatch({ texto: t })} placeholder="Quero agora" /></Campo>
          <Campo label="Destino"><Texto valor={bloco.url} onChange={(u) => onPatch({ url: u })} placeholder="https://…" /></Campo>
          <Campo label="Formato" hint="Um principal por tela; contorno e link acompanham ele.">
            <Segmentado valor={bloco.formato === "contorno" || bloco.formato === "link" ? bloco.formato : "cheio"}
              onChange={(v) => onPatch({ formato: v === "contorno" || v === "link" ? v : undefined })}
              opcoes={[{ valor: "cheio", label: "Principal" }, { valor: "contorno", label: "Contorno" }, { valor: "link", label: "Link" }]} />
          </Campo>
        </Grade>
      );

    case "whatsapp":
      return (
        <Grade>
          <Campo label="Rótulo"><Texto valor={bloco.texto} onChange={(t) => onPatch({ texto: t })} placeholder="Falar no WhatsApp" /></Campo>
          <Campo label="Telefone" hint="DDI+DDD, ex.: 5511912345678">
            <Texto valor={bloco.telefone} onChange={(t) => onPatch({ telefone: t })} placeholder="5511912345678" />
          </Campo>
          <Campo label="Mensagem pronta" hint="Já vai digitada na conversa.">
            <Texto valor={bloco.mensagem} onChange={(t) => onPatch({ mensagem: t })} placeholder="Olá! Vim pela página." linhas={3} />
          </Campo>
        </Grade>
      );

    case "formulario":
      return <ConteudoFormulario bloco={bloco} onPatch={onPatch} />;
    case "oferta":
      return <ConteudoOferta bloco={bloco} onPatch={onPatch} />;

    case "contador":
      return (
        <Grade>
          <Campo label="Duração"><Numero valor={bloco.contador?.minutos} onChange={(m) => onPatch({ contador: { ...(bloco.contador ?? { minutos: 15 }), minutos: m } })} min={1} max={1440} sufixo="minutos" /></Campo>
          <Campo label="Rótulo"><Texto valor={bloco.contador?.rotulo} onChange={(t) => onPatch({ contador: { ...(bloco.contador ?? { minutos: 15 }), rotulo: t } })} placeholder="Oferta termina em" /></Campo>
          <Campo label="Quando zerar">
            <Selecao valor={bloco.contador?.aoZerar ?? "fica"}
              onChange={(a) => onPatch({ contador: { ...(bloco.contador ?? { minutos: 15 }), aoZerar: a } })}
              opcoes={[
                { valor: "fica", label: "Fica parado em zero" },
                { valor: "some", label: "Some da página" },
                { valor: "reinicia", label: "Reinicia a contagem" },
              ]}
            />
          </Campo>
        </Grade>
      );

    case "aviso":
      return (
        <Grade>
          <Campo label="Aviso"><Texto valor={bloco.texto} onChange={(t) => onPatch({ texto: t })} placeholder="Vagas limitadas!" linhas={3} /></Campo>
        </Grade>
      );

    case "espacador":
      return (
        <Grade>
          <Campo label="Altura"><Numero valor={bloco.altura} onChange={(a) => onPatch({ altura: a })} min={0} max={400} sufixo="px" /></Campo>
        </Grade>
      );

    case "colunas":
      return <ConteudoColunas bloco={bloco} onPatch={onPatch} />;

    default:
      return <Vazio icone="palette" texto="Este bloco não tem conteúdo próprio — ajuste a aparência e o espaçamento logo abaixo." />;
  }
}
