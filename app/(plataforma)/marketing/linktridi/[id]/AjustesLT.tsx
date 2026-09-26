"use client";

// ── Aba "Ajustes" do editor do LinkTridi ─────────────────────────────────────
// O que se configura UMA vez e depois se esquece: se está no ar e em que
// endereço, como o link aparece quando é compartilhado, o rastreamento e o
// código próprio. Cartões (o que muda toda semana) e Aparência (a cara da
// página) moram nas outras abas. Antes tudo dividia uma coluna só — e o pixel,
// que é o que mede se a bio vende, nem existia neste editor.
import { useState } from "react";
import { Icon } from "../../../Icon";
import { Botao, Campo } from "../../../ui/controles";
import { BotaoPublicar } from "../../../ui/BotaoPublicar";
import { GlassSelect } from "../../../GlassPicker";
import { AJUDA_CAPI, AJUDA_PIXEL, type AjudaPixel } from "../../../tridiflow/_shared/ajudaPixel";
import { EVENTOS_PIXEL, conversoesEfetivas, novaRegraConversao, type BotSettings, type RegraConversao } from "@/lib/tridiflow";
import { metaDoLinkTridi, type LinkTridiDoc } from "@/lib/tridiflow-linktridi";
import { EntradaImagem, Grupo, Linha, LinhaChave, LinhaNav, Sanfona } from "./pecas";

export interface PublicacaoLT {
  status: "rascunho" | "publicado";
  /** Link público completo (https://host/f/slug). */
  link: string;
  publicando: boolean;
  onPublicar: () => void | boolean | Promise<void | boolean>;
  onTirarDoAr: () => void;
  onEndereco: () => void;
  onCompartilhar: () => void;
}

type Gatilho = RegraConversao["gatilho"];
type Meta = NonNullable<BotSettings["meta"]>;
type ChavePixel = "metaPixelId" | "ga4Id" | "tiktokId" | "pinterestId" | "capiDatasetId" | "capiToken";

const PIXELS: { k: ChavePixel; nome: string; ph: string; modo: "numeric" | "text" }[] = [
  { k: "metaPixelId", nome: "Meta Pixel", ph: "123456789012345", modo: "numeric" },
  { k: "ga4Id", nome: "Google Analytics (GA4)", ph: "G-XXXXXXXXXX", modo: "text" },
  { k: "tiktokId", nome: "TikTok Pixel", ph: "C0XXXXXXXXXXXXXXXX", modo: "text" },
  { k: "pinterestId", nome: "Pinterest Tag", ph: "26XXXXXXXXXXX", modo: "numeric" },
];

// O nome técnico do evento fica entre parênteses: é ele que aparece no
// Gerenciador de Eventos, e é por ele que a pessoa vai procurar lá.
const NOME_EVENTO: Record<string, string> = {
  PageView: "Visualizou a página", ViewContent: "Viu o conteúdo", InitiateCheckout: "Iniciou a compra",
  AddToCart: "Adicionou ao carrinho", Purchase: "Comprou", Lead: "Virou contato", Contact: "Pediu contato",
};
const OPCOES_EVENTO = EVENTOS_PIXEL.map((ev) => ({ value: ev, label: NOME_EVENTO[ev] ? `${NOME_EVENTO[ev]} (${ev})` : ev }));

const hostDe = (link: string) => { try { return new URL(link).host; } catch { return link; } };

export function AjustesLT({ doc, nome, settings, onSettings, publicacao }: {
  doc: LinkTridiDoc;
  /** Nome interno do projeto — último recurso do título do link. */
  nome: string;
  settings: BotSettings;
  onSettings: (s: BotSettings) => void;
  publicacao: PublicacaoLT;
}) {
  const noAr = publicacao.status === "publicado";
  const meta: Meta = settings.meta ?? {};
  // Guarda o que foi digitado, sem aparar: aparar a cada tecla comia o espaço
  // do fim e ninguém conseguia escrever duas palavras. Quem apara é a leitura.
  const setMeta = (k: keyof Meta, v: string) => onSettings({ ...settings, meta: { ...meta, [k]: v || undefined } });
  const px = settings.pixels ?? {};
  const setPx = (k: ChavePixel, v: string) => onSettings({ ...settings, pixels: { ...px, [k]: v.trim() || undefined } });
  const algumPixel = !!(px.metaPixelId || px.ga4Id || px.tiktokId || px.pinterestId);
  const m = metaDoLinkTridi(meta, doc, nome);
  const bio = doc.perfil.bio.replace(/\s+/g, " ").trim();

  // As duas regras que um LinkTridi tem: abriu a página e tocou num cartão.
  // Editar uma grava a lista inteira (a partir do padrão), preservando regra
  // que alguém tenha criado por fora.
  const regras = conversoesEfetivas(settings);
  const regraDe = (g: Gatilho) => regras.find((r) => r.gatilho === g);
  const mudarRegra = (g: Gatilho, p: Partial<RegraConversao>) => {
    const atual = regraDe(g);
    const conversoes = atual
      ? regras.map((r) => (r.id === atual.id ? { ...r, ...p } : r))
      : [...regras, { ...novaRegraConversao(g), ...p }];
    onSettings({ ...settings, conversoes });
  };

  return (
    <>
      <Grupo titulo="Publicação" nota={noAr
        ? "Com o LinkTridi no ar, o que você salva aparece no link em até 30 segundos — não existe “publicar de novo”."
        : "Fora do ar, quem abre o link vê “Este link não está disponível”. Publique quando a página estiver pronta."}>
        <div className="lte-linha">
          <span className="lte-linha-ico" aria-hidden><span className="lte-ponto" data-no-ar={noAr ? "1" : undefined} /></span>
          <span className="lte-linha-txt">
            <span className="lte-linha-rot">{noAr ? "No ar" : "Fora do ar"}</span>
            <span className="lte-linha-dica">{noAr ? "Quem tem o link vê a página." : "Só aqui, na prévia."}</span>
          </span>
          {noAr
            ? <Botao tamanho="sm" variante="sutil" icone="eye-off" carregando={publicacao.publicando} onClick={publicacao.onTirarDoAr}>Tirar do ar</Botao>
            : <BotaoPublicar tamanho="sm" onPublicar={publicacao.onPublicar} />}
        </div>
        <LinhaNav icone="link" rotulo="Endereço" valor={publicacao.link.replace(/^https?:\/\//, "")} onClick={publicacao.onEndereco} />
        <LinhaNav icone="share" rotulo="Compartilhar" dica="Copiar o link, QR code e WhatsApp" onClick={publicacao.onCompartilhar} />
      </Grupo>

      <Grupo titulo="Prévia do link" nota="Vazio usa o nome, a bio e o logo do perfil. O WhatsApp e o Instagram guardam a prévia por alguns dias — uma troca pode demorar a aparecer lá.">
        <div className="lte-og">
          <div className="lte-og-cartao" aria-label="Como o link aparece quando é compartilhado">
            {m.imagem
              // eslint-disable-next-line @next/next/no-img-element -- imagem enviada/colada pelo usuário
              ? <img className="lte-og-img" src={m.imagem} alt="" />
              : <span className="lte-og-img lte-og-img-vazia"><Icon name="photo" size={22} /></span>}
            <div className="lte-og-txt">
              <strong>{m.titulo}</strong>
              {m.descricao && <span>{m.descricao}</span>}
              <small>{hostDe(publicacao.link)}</small>
            </div>
          </div>
        </div>
        <Linha>
          <Campo label="Título">
            {(id) => <input id={id} className="lte-input" value={meta.titulo ?? ""} maxLength={70} placeholder={doc.perfil.nome || nome} onChange={(e) => setMeta("titulo", e.target.value)} />}
          </Campo>
        </Linha>
        <Linha>
          <Campo label="Descrição">
            {(id) => <textarea id={id} className="lte-input" rows={2} maxLength={200} value={meta.descricao ?? ""} placeholder={bio || "Uma frase que convença a tocar no link"} onChange={(e) => setMeta("descricao", e.target.value)} />}
          </Campo>
        </Linha>
        <Linha>
          <Campo label="Imagem" dica="Sem imagem própria, usa o logo. 1200 × 630 é o formato que o WhatsApp mostra maior.">
            {(id) => <EntradaImagem idCampo={id} url={meta.imagem} onChange={(u) => setMeta("imagem", u)} />}
          </Campo>
        </Linha>
        <Linha>
          <Campo label="Ícone da aba do navegador" dica="Sem ícone próprio, usa o logo.">
            {(id) => <EntradaImagem idCampo={id} url={meta.favicon} redonda rotulo="Enviar ícone" onChange={(u) => setMeta("favicon", u)} />}
          </Campo>
        </Linha>
      </Grupo>

      <Grupo titulo="Rastreamento" nota="Cole só o ID — o código de cada pixel entra sozinho na página publicada.">
        {PIXELS.map((p) => {
          const v = px[p.k] ?? "";
          return (
            <Linha key={p.k}>
              <Campo label={p.nome}>
                {(id) => (
                  <div className="lte-pixel">
                    <input id={id} className="lte-input" value={v} placeholder={p.ph} inputMode={p.modo} autoComplete="off" spellCheck={false} onChange={(e) => setPx(p.k, e.target.value)} />
                    {v && <span className="lte-selo-ok"><Icon name="circle-check" size={13} />Ativo</span>}
                  </div>
                )}
              </Campo>
              <ComoPegar ajuda={AJUDA_PIXEL[p.k]} />
            </Linha>
          );
        })}
        <Sanfona icone="shield-check" titulo="API de Conversões da Meta"
          resumo={px.capiToken ? "Ligada — o evento também sai pelo servidor" : "Opcional: envia pelo servidor e resiste a bloqueador"}>
          <Campo label="Dataset ID (o mesmo número do Pixel)">
            {(id) => <input id={id} className="lte-input" inputMode="numeric" autoComplete="off" value={px.capiDatasetId ?? ""} onChange={(e) => setPx("capiDatasetId", e.target.value)} />}
          </Campo>
          <Campo label="Token de acesso" dica="Fica só no servidor — a página pública nunca recebe o token.">
            {(id) => <input id={id} className="lte-input" type="password" autoComplete="off" value={px.capiToken ?? ""} placeholder="EAAB…" onChange={(e) => setPx("capiToken", e.target.value)} />}
          </Campo>
          <ComoPegar ajuda={AJUDA_CAPI} />
        </Sanfona>
      </Grupo>

      <Grupo titulo="Eventos" nota={algumPixel ? "Vão pra todos os pixels preenchidos acima." : "Preencha um pixel acima pra estes eventos saírem."}>
        <LinhaEvento rotulo="Abriu a página" dica="Uma vez por visita." regra={regraDe("abertura")} onMudar={(p) => mudarRegra("abertura", p)} />
        <LinhaEvento rotulo="Tocou num cartão" dica="O clique que leva pro checkout — é a conversão que vale." regra={regraDe("oferta")} onMudar={(p) => mudarRegra("oferta", p)} />
      </Grupo>

      <Grupo titulo="Avançado">
        <Sanfona icone="code" titulo="Código no <head>" resumo={settings.customHead ? "Em uso" : "Google Tag Manager e scripts próprios"}>
          <Campo label="Código" dica="Entra no <head> da página publicada e roda pra todo visitante. Cole só o que você confia.">
            {(id) => <textarea id={id} className="lte-input lte-codigo" rows={5} spellCheck={false} value={settings.customHead ?? ""} placeholder="<!-- Google Tag Manager, <script>… -->" onChange={(e) => onSettings({ ...settings, customHead: e.target.value || undefined })} />}
          </Campo>
        </Sanfona>
        <Sanfona icone="palette" titulo="CSS próprio" resumo={settings.customCss ? "Em uso" : "Ajuste fino do visual, por código"}>
          <Campo label="CSS" dica="Vale na página publicada — a prévia daqui não aplica, pra um seletor solto não bagunçar o editor.">
            {(id) => <textarea id={id} className="lte-input lte-codigo" rows={6} spellCheck={false} value={settings.customCss ?? ""} onChange={(e) => onSettings({ ...settings, customCss: e.target.value || undefined })} />}
          </Campo>
        </Sanfona>
      </Grupo>
    </>
  );
}

/** Uma regra de evento: a chave diz se sai, a lista diz qual evento. */
function LinhaEvento({ rotulo, dica, regra, onMudar }: {
  rotulo: string; dica: string; regra?: RegraConversao; onMudar: (p: Partial<RegraConversao>) => void;
}) {
  const ligado = !!regra?.ativo;
  return (
    <>
      <LinhaChave rotulo={rotulo} dica={dica} ligado={ligado} onChange={(v) => onMudar({ ativo: v })} />
      {ligado && (
        <Linha>
          <Campo label="Evento enviado">
            {(id) => <GlassSelect id={id} value={regra?.evento ?? "ViewContent"} onChange={(v) => onMudar({ evento: v })} options={OPCOES_EVENTO} />}
          </Campo>
        </Linha>
      )}
    </>
  );
}

function ComoPegar({ ajuda }: { ajuda?: AjudaPixel }) {
  const [aberto, setAberto] = useState(false);
  if (!ajuda) return null;
  return (
    <>
      <button type="button" className="lte-ajuda-btn" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        <Icon name="info-circle" size={14} />Onde acho o {ajuda.titulo}?
      </button>
      {aberto && (
        <div className="lte-ajuda">
          <ol>{ajuda.passos.map((p) => <li key={p}>{p}</li>)}</ol>
          <a href={ajuda.link} target="_blank" rel="noreferrer"><Icon name="external-link" size={13} />Abrir a plataforma</a>
        </div>
      )}
    </>
  );
}
