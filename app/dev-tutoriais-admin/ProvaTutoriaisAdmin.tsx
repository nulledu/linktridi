"use client";

// Prova das telas administrativas dos tutoriais sem sessão: o fetch é
// interceptado e devolve dados de exemplo, então a lista, o vazio e o editor
// aparecem exatamente como na plataforma — inclusive os painéis laterais.
//
// A troca do fetch mora num EFEITO, nunca no corpo do componente: esta página
// também é desenhada no servidor, onde não existe `window`, e trocar o fetch
// durante o render derrubava a primeira carga com 500. É `useLayoutEffect` de
// propósito: ele roda antes de qualquer `useEffect` dos filhos, e é num
// `useEffect` que a lista e o editor fazem a primeira busca — com efeito comum,
// essa busca sairia pra rede de verdade antes de o interceptador existir.
import { useEffect, useLayoutEffect, useState } from "react";
import { MolduraPaginaMarketing, CabecalhoMarketing, SeletorPaginas } from "@/app/(plataforma)/marketing/CabecalhoMarketing";
import { LinkTridiLista } from "@/app/(plataforma)/marketing/linktridi/LinkTridiLista";
import { TutoriaisClient } from "@/app/(plataforma)/marketing/tutoriais/TutoriaisClient";
import { CentralTutoriaisEditor } from "@/app/(plataforma)/marketing/tutoriais/[id]/CentralTutoriaisEditor";
import { CampoMidia, type AceitaCampoMidia, type MudancaMidia } from "@/app/(plataforma)/marketing/tutoriais/editor/CampoMidia";
import { classificarMidiaTutorial } from "@/lib/tridiflow-tutoriais-upload";
import type { PaginaDoc } from "@/lib/tridiflow-pagina";

const CENTRAIS = [
  { id: "c1", nome: "Central de Tutoriais", slug: "tutoriais", status: "publicado", templatePagina: "central_tutoriais", updatedAt: new Date().toISOString(), dominioHost: "ajuda.carimbostridi.com.br", dominioId: null, publicadoEm: "2026-09-01T10:00:00.000Z", atualizadoEm: "2026-09-03T10:00:00.000Z", responsavel: { id: "u1", nome: "Caio" } },
  { id: "c2", nome: "Guia do revendedor", slug: "revendedor", status: "rascunho", templatePagina: "central_tutoriais", updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(), dominioHost: null },
];

const CAPA = "https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=1000&q=85";
const DOC = {
  titulo: "Tutoriais", subtitulo: "Aprenda a configurar, usar e cuidar dos seus produtos.",
  categorias: [
    { id: "carimbos", nome: "Carimbos", imagemUrl: CAPA, ordem: 0, ativa: true },
    { id: "maquinas", nome: "Máquinas", imagemUrl: "", ordem: 1, ativa: false },
  ],
  tutoriais: [
    { id: "a", categoriaId: "carimbos", titulo: "Como configurar seu carimbo", handle: "configurar-carimbo", descricao: "Configure pressão e alinhamento.", capaUrl: CAPA, palavrasChave: ["configurar"], duracaoMinutos: 3, quantidadeEtapas: null, tipoMidia: "leitura", selo: "novo", destaque: true, status: "publicado", ordem: 0, blocos: [{ id: "b1", tipo: "texto", titulo: "Antes de começar", conteudo: "Separe o carimbo." }, { id: "b2", tipo: "video", origem: "link", url: "https://youtu.be/aqz-KE-bpKQ", capaUrl: "", legenda: "" }, { id: "b3", tipo: "produto", produtoId: "p1", titulo: "Produto utilizado", botao: "Ver produto" }] },
    { id: "b", categoriaId: "maquinas", titulo: "Como trocar o refil", handle: "trocar-refil", descricao: "", capaUrl: "", palavrasChave: [], duracaoMinutos: null, quantidadeEtapas: 4, tipoMidia: "passos", selo: null, destaque: false, status: "rascunho", ordem: 1, blocos: [] },
    // Seis a mais só pra exercitar o FILTRO da lista (ele só aparece acima de 5).
    ...["Limpar a almofada", "Trocar a tinta", "Montar a chancela", "Guardar o carimbo", "Ajustar a data", "Recarregar o refil"].map((titulo, i) => ({
      id: `x${i}`, categoriaId: i % 2 ? "maquinas" : "carimbos", titulo, handle: `t${i}`, descricao: "", capaUrl: "",
      palavrasChave: [], duracaoMinutos: 2 + i, quantidadeEtapas: null, tipoMidia: "leitura" as const, selo: null,
      destaque: false, status: (i % 3 ? "publicado" : "rascunho") as "publicado" | "rascunho", ordem: 2 + i, blocos: [],
    })),
  ],
};
const BOT = { id: "c1", nome: "Central de Tutoriais", slug: "tutoriais", status: "publicado" as const, dominioHost: "ajuda.carimbostridi.com.br", dominioId: null, publicadoEm: "2026-09-01T10:00:00.000Z", atualizadoEm: "2026-09-03T10:00:00.000Z", pagina: { versao: 1, secoes: [], config: { template: "central_tutoriais", centralTutoriais: DOC } } as unknown as PaginaDoc };
const BOT_VAZIO = { id: "c2", nome: "Central de Tutoriais", slug: "central-de-tutoriais", status: "rascunho" as const, dominioHost: null, dominioId: null, publicadoEm: null, atualizadoEm: "2026-09-03T10:00:00.000Z", pagina: { versao: 1, secoes: [], config: { template: "central_tutoriais", centralTutoriais: { ...DOC, categorias: [], tutoriais: [] } } } as unknown as PaginaDoc };

// ── Envio de mídia de mentira ────────────────────────────────────────────────
/** Endereço "assinado" falso: o PUT pra ele nunca sai da aba. */
const ASSINADA_FALSA = "https://prova-tutoriais.invalid/assinada/";
/** Vídeo "enviado": o caminho imita o do Storage (`/tridiflow/tutoriais/`), que
 *  é o que faz o campo dizer "Vídeo enviado" em vez de "Link". */
const STORAGE_FALSO = "https://prova-tutoriais.invalid/storage/v1/object/public/photos/tridiflow/tutoriais/2026/09";
/** Foto "enviada": os bytes não sobem, então a miniatura é uma foto de exemplo
 *  — com extensão no caminho, senão o campo de foto-ou-vídeo a leria como link. */
const fotoDeExemplo = (n: number) => `https://picsum.photos/seed/tutorial-${n}/1280/720.webp`;

/** O que o interceptador lê a cada chamada. Fica fora do React porque o fetch
 *  trocado vive fora dele; quem escreve aqui são os efeitos. */
const prova = { vazio: false, recusarEnvio: false, envios: 0 };

const responder = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

/** Mesma conferência da rota de verdade (`classificarMidiaTutorial` com
 *  "qualquer"): recusa de formato e de tamanho aparece aqui igual ao ar. */
function assinarEnvio(init?: RequestInit): Response {
  if (prova.recusarEnvio) return responder({ error: "Sua conta não tem acesso aos Tutoriais." }, 403);
  let pedido: { mime?: unknown; tamanho?: unknown } = {};
  try { pedido = JSON.parse(String(init?.body ?? "{}")); } catch { /* corpo quebrado: a classificação recusa */ }
  const c = classificarMidiaTutorial(String(pedido.mime ?? ""), Number(pedido.tamanho ?? 0), "qualquer");
  if (!c.ok) return responder({ error: c.erro }, 400);
  prova.envios += 1;
  const n = prova.envios;
  const publicUrl = c.tipo === "video" ? `${STORAGE_FALSO}/video-${n}.${c.ext}` : fotoDeExemplo(n);
  return responder({ signedUrl: `${ASSINADA_FALSA}${n}`, publicUrl, tipo: c.tipo });
}

/** Rota antiga (FormData), que o CampoArquivo do editor ainda usa na capa, na
 *  categoria, no cartão Todos e nos blocos. Devolve um endereço no formato do
 *  de verdade sem subir byte nenhum. */
function enviarLegado(init?: RequestInit): Response {
  const arquivo = init?.body instanceof FormData ? init.body.get("file") : null;
  if (!(arquivo instanceof File)) return responder({ error: "Escolha um arquivo." }, 400);
  prova.envios += 1;
  const n = prova.envios;
  const ext = arquivo.type === "video/webm" ? "webm" : "mp4";
  return responder({ url: arquivo.type.startsWith("video/") ? `${STORAGE_FALSO}/video-${n}.${ext}` : fotoDeExemplo(n) });
}

/** Mesma forma da rota de verdade: o editor lê `estado` e `recado`, e qualquer
 *  outra resposta viraria um aviso de erro sem texto. */
function testarLink(init?: RequestInit): Response {
  let id = "";
  try { id = String(JSON.parse(String(init?.body ?? "{}")).id ?? ""); } catch { /* sem id: responde como rascunho */ }
  const bot = [BOT, BOT_VAZIO].find((b) => b.id === id);
  if (!bot || bot.status !== "publicado") {
    return responder({ estado: "rascunho", url: null, recado: "A central ainda não foi publicada — o link só entra no ar depois de publicar." });
  }
  return responder({ estado: "ok", url: `https://${bot.dominioHost}/p/${bot.slug}`, recado: "O link está no ar e mostrando esta central." });
}

function interceptador(original: typeof fetch): typeof fetch {
  return async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada instanceof Request ? entrada.url : entrada);
    if (url.includes("/api/tridiflow/tutoriais/produtos")) return responder({ produtos: [{ id: "p1", titulo: "Carimbo automático" }] });
    if (url.includes("/api/tridiflow/tutoriais/upload-url")) return assinarEnvio(init);
    // Depois do `upload-url`: um caminho contém o outro.
    if (url.includes("/api/tridiflow/tutoriais/upload")) return enviarLegado(init);
    if (url.includes("/api/tridiflow/tutoriais/testar-link")) return testarLink(init);
    if (url.includes("/api/tridiflow/bots")) {
      if (!init?.method || init.method === "GET") return responder({ bots: prova.vazio ? [] : [...CENTRAIS, ...LINKTRIDIS] });
      return responder({ ok: true, bot: { id: "c1" } });
    }
    // API que a prova não conhece NÃO segue pra rede: a rota honra o cookie de
    // quem está logado no localhost, e a capa escolhida aqui subia de verdade
    // pro Storage do projeto. Recusar alto diz qual rota falta interceptar.
    if (url.includes("/api/")) return responder({ error: `Rota fora da prova: ${url}` }, 501);
    return original(entrada, init);
  };
}

/** PUT falso: os bytes não saem da aba, mas o progresso chega pelos mesmos
 *  eventos do Storage — é ele que desenha "Enviando… 42%" e dá tempo de
 *  apertar Cancelar. Qualquer outro endereço segue pro XHR de verdade.
 *  Criado dentro de função porque no servidor não existe `XMLHttpRequest`, e
 *  uma classe no topo do módulo quebraria o import. */
function xhrDaProva(Real: typeof XMLHttpRequest): typeof XMLHttpRequest {
  return class XhrDaProva extends Real {
    falso = false;
    relogio: ReturnType<typeof setTimeout> | undefined = undefined;

    override open(metodo: string, url: string | URL, assincrono = true, usuario?: string | null, senha?: string | null): void {
      this.falso = String(url).startsWith(ASSINADA_FALSA);
      super.open(metodo, url, assincrono, usuario, senha);
    }

    override send(corpo?: Document | XMLHttpRequestBodyInit | null): void {
      if (!this.falso) { super.send(corpo); return; }
      const total = corpo instanceof Blob ? Math.max(1, corpo.size) : 1;
      // ~2 MB/s, entre 1,5 e 6 s: um 4G razoável, sem deixar a prova arrastada.
      const duracao = Math.min(6000, Math.max(1500, (total / (2 * 1024 * 1024)) * 1000));
      const etapas = Math.max(1, Math.round(duracao / 150));
      let feitas = 0;
      const avancar = () => {
        feitas += 1;
        this.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: Math.round((total * feitas) / etapas), total }));
        if (feitas < etapas) { this.relogio = setTimeout(avancar, 150); return; }
        Object.defineProperty(this, "status", { configurable: true, get: () => 200 });
        this.dispatchEvent(new ProgressEvent("load"));
        this.dispatchEvent(new ProgressEvent("loadend"));
      };
      this.relogio = setTimeout(avancar, 150);
    }

    override abort(): void {
      if (!this.falso) { super.abort(); return; }
      clearTimeout(this.relogio);
      this.dispatchEvent(new ProgressEvent("abort"));
      this.dispatchEvent(new ProgressEvent("loadend"));
    }
  };
}

/** Cada variante como o editor vai usá-la: controlada, com o valor do lado de
 *  fora. `titulo` diz a variante; `rotulo` é o nome que o campo teria no editor. */
const CAMPOS: {
  id: string; titulo: string; rotulo: string; aceita: AceitaCampoMidia;
  url?: string; capaUrl?: string; alt?: string; comAlt?: boolean; proporcao?: "16/9" | "1/1";
}[] = [
  { id: "foto-vazia", titulo: "Foto · vazio", rotulo: "Capa do tutorial", aceita: "imagem", comAlt: true },
  { id: "foto-cheia", titulo: "Foto · cheio", rotulo: "Capa do tutorial", aceita: "imagem", url: CAPA, alt: "Carimbo sobre a mesa, visto de cima", comAlt: true },
  { id: "video-vazio", titulo: "Vídeo · vazio", rotulo: "Vídeo do passo", aceita: "video" },
  { id: "video-cheio", titulo: "Vídeo · cheio (YouTube)", rotulo: "Vídeo do passo", aceita: "video", url: "https://youtu.be/aqz-KE-bpKQ" },
  { id: "qualquer-vazio", titulo: "Foto ou vídeo · vazio", rotulo: "Mídia do bloco", aceita: "imagem-ou-video" },
  { id: "qualquer-cheio", titulo: "Foto ou vídeo · cheio (vídeo enviado)", rotulo: "Mídia do bloco", aceita: "imagem-ou-video", url: `${STORAGE_FALSO}/passo.mp4`, capaUrl: CAPA },
  { id: "categoria", titulo: "Foto quadrada · cheio", rotulo: "Foto da categoria", aceita: "imagem", url: CAPA, proporcao: "1/1" },
];

function CampoDaProva({ titulo, rotulo, aceita, url = "", capaUrl = "", alt = "", comAlt, proporcao }: Omit<(typeof CAMPOS)[number], "id">) {
  const [valor, setValor] = useState({ url, capaUrl, alt });
  const [ultima, setUltima] = useState<MudancaMidia | null>(null);
  return (
    <section style={{ display: "grid", gap: 8, minWidth: 0, padding: 12, border: "1px solid var(--border)", borderRadius: "var(--r-md)" }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{titulo}</h2>
      <CampoMidia rotulo={rotulo} aceita={aceita} url={valor.url} capaUrl={valor.capaUrl} alt={valor.alt} proporcao={proporcao}
        onMudar={(m) => { setUltima(m); setValor((v) => ({ ...v, url: m.url, capaUrl: m.capaUrl })); }}
        onAlt={comAlt ? (a) => setValor((v) => ({ ...v, alt: a })) : undefined} />
      {/* O que o formulário receberia — é aqui que se vê o vídeo gravar primeiro
          e a capa chegar numa segunda chamada. */}
      <small style={{ color: "var(--text-dim)", overflowWrap: "anywhere" }}>
        {ultima ? `Gravado (${ultima.tipo}): ${ultima.url || "vazio"}${ultima.capaUrl ? ` · capa ${ultima.capaUrl}` : ""}` : "Nada gravado ainda."}
      </small>
    </section>
  );
}

function ProvaMidia() {
  const [recusar, setRecusar] = useState(false);
  useEffect(() => { prova.recusarEnvio = recusar; }, [recusar]);
  // O PUT vai por XHR (o fetch não dá progresso de envio). A troca vale só
  // enquanto esta aba está montada.
  useEffect(() => {
    const Real = window.XMLHttpRequest;
    window.XMLHttpRequest = xhrDaProva(Real);
    return () => { window.XMLHttpRequest = Real; };
  }, []);
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 1100 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <p style={{ margin: 0, flex: "1 1 260px", color: "var(--text-dim)", fontSize: 13 }}>
          Envio simulado: a assinatura e o PUT não saem da aba. A foto passa pela compressão de verdade; a miniatura depois do envio é uma foto de exemplo.
        </p>
        <button className="ui-btn" data-v={recusar ? "primario" : "sutil"} aria-pressed={recusar} onClick={() => setRecusar((x) => !x)}>
          Simular recusa do servidor
        </button>
      </div>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))" }}>
        {CAMPOS.map(({ id, ...campo }) => <CampoDaProva key={id} {...campo} />)}
      </div>
    </div>
  );
}

// O LinkTridi da aba Páginas: a lista filtra o tipo, então dois bastam.
const LINKTRIDIS = [
  { id: "lt1", nome: "Bio do Instagram", slug: "bio", status: "publicado", tipo: "linktridi", updatedAt: "2026-09-20T12:00:00Z", dominioHost: "www.carimbostridii.com.br" },
  { id: "lt2", nome: "Bio do TikTok", slug: "tiktok", status: "rascunho", tipo: "linktridi", updatedAt: "2026-09-18T12:00:00Z", dominioHost: null },
];
const PERM_MKT = { podeDesempenho: true, podeContingencia: true, podeLinkTridiLista: true, podeTutoriais: true };

type Tela = "lista" | "vazia" | "editor" | "editor-vazio" | "midia" | "mkt-linktridi" | "mkt-editor";
const TELAS: Record<Tela, string> = { lista: "Lista", vazia: "Lista vazia", editor: "Editor", "editor-vazio": "Editor vazio", midia: "Mídia", "mkt-linktridi": "Marketing · LinkTridi", "mkt-editor": "Marketing · Editor" };
/** O `?tela=` chega cru da URL; `in` aceitaria herdados como `toString`. */
const ehTela = (x: unknown): x is Tela => typeof x === "string" && Object.keys(TELAS).includes(x);

/** `telaInicial` é o `?tela=` da página. Sem ele o `npm run rolagem`, que só
 *  descobre as telas que a URL alcança, media a lista e nunca o editor nem a
 *  mídia — elas só existiam por `useState`. */
export function ProvaTutoriaisAdmin({ telaInicial }: { telaInicial?: string }) {
  const [tela, setTela] = useState<Tela>(ehTela(telaInicial) ? telaInicial : "lista");
  useLayoutEffect(() => {
    const original = window.fetch;
    window.fetch = interceptador(original.bind(window));
    // Sair da prova por navegação do app não pode deixar o fetch trocado.
    return () => { window.fetch = original; };
  }, []);
  // Também de layout: a lista remonta (`key={tela}`) e busca no `useEffect`
  // dela — o sinal de "vazia" tem de estar certo antes dessa busca.
  useLayoutEffect(() => { prova.vazio = tela === "vazia"; }, [tela]);
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)" }}>
      {/* Fundo SÓLIDO em quem cola: `--surface-2` é branco a 9% no escuro, e a
          lista rolava visível por baixo dos botões — sobreposição falsa na tela
          que se está conferindo. A `.tab-strip` vai por dentro porque abaixo de
          700px ela ganha `mask-image`, que apagaria também o fundo da barra; a
          margem que a fundação dá à faixa no celular sobraria dentro dela. */}
      <div style={{ position: "sticky", zIndex: 20, top: 0, padding: "6px 12px", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <div className="tab-strip" style={{ display: "flex", gap: 8, marginBottom: 0 }}>
          {(Object.keys(TELAS) as Tela[]).map((x) => (
            <button key={x} className="ui-btn" data-v={tela === x ? "primario" : "sutil"} onClick={() => setTela(x)}>
              {TELAS[x]}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: 16 }}>
        {tela === "editor" ? <CentralTutoriaisEditor bot={BOT} metricas={[{ handle: "configurar-carimbo", vistas: 248, uteis: 41, inuteis: 6 }, { handle: "t0", vistas: 37, uteis: 2, inuteis: 5 }]} />
          : tela === "editor-vazio" ? <CentralTutoriaisEditor key="v" bot={BOT_VAZIO} catalogoUrl="/l/carimbos-tridi" />
          : tela === "midia" ? <ProvaMidia />
          // A aba Páginas do Marketing e o editor DENTRO dela (topo + abas).
          : tela === "mkt-linktridi" ? <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <CabecalhoMarketing permissoes={PERM_MKT} aba="paginas" onAba={() => {}} />
              <SeletorPaginas permissoes={PERM_MKT} valor="linktridi" onMuda={() => {}} />
              <LinkTridiLista podeEditar />
            </div>
          : tela === "mkt-editor" ? <MolduraPaginaMarketing permissoes={PERM_MKT} ver="tutoriais">
              <CentralTutoriaisEditor bot={BOT} metricas={[]} />
            </MolduraPaginaMarketing>
          : <TutoriaisClient key={tela} />}
      </div>
    </div>
  );
}
