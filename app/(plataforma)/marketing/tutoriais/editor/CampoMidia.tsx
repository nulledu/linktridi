"use client";

// Campo de mídia do tutorial: foto, vídeo ou link, num lugar só.
//
// Antes cada mídia eram dois campos soltos ("Imagem por endereço" e "Ou enviar
// imagem") e nenhum mostrava o que já estava ali: a pessoa enviava a foto, não
// via miniatura nenhuma e enviava de novo. Aqui o campo tem quatro caras —
// escolher, colar link, enviando, cheio — e o que ele guarda fica à vista, com
// a etiqueta de onde veio.
//
// O envio vai DIRETO ao Storage por URL assinada: pela função da Vercel o corpo
// é cortado em 4,5 MB e o vídeo do celular morria no meio. A foto é comprimida
// no navegador antes de subir; o vídeo ganha capa tirada do primeiro quadro.
//
// Erro mora NO campo (role="alert"), nunca só num toast: o toast some em
// segundos, e quem desviou o olho volta sem saber por que a foto não entrou.
// O formulário continua com o que tinha.
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Icon } from "../../../Icon";
import { capaDoVideo, comprimirImagem, enviarParaStorage, envioCancelado } from "../../../ui/midia";
import { useOnda } from "../../../ui/micro";
import { Botao } from "../../../ui/controles";
import { normalizarUrlPublica } from "@/lib/tridiflow-tutoriais";
import {
  ACEITE_MIDIA_TUTORIAL, classificarMidiaTutorial, descreverMidiaTutorial, mimeDoArquivo, reconhecerLinkDeMidia,
  type AceitaMidiaTutorial, type OrigemMidiaTutorial, type TipoMidiaTutorial,
} from "@/lib/tridiflow-tutoriais-upload";
import "./campo-midia.css";

/** Assina o envio (confere permissão, tipo e tamanho) — os bytes não passam por ela. */
const ROTA_ENVIO = "/api/tridiflow/tutoriais/upload-url";

export type AceitaCampoMidia = "imagem" | "video" | "imagem-ou-video";
/** `tipo`: "imagem"/"video" = arquivo enviado agora; "link" = endereço colado
 *  (YouTube, Vimeo, .mp4 ou foto por https); "vazio" = removido.
 *  `midia`: vem só no link colado num campo `imagem-ou-video` — o único caso em
 *  que nem o `tipo` nem o próprio campo dizem se é foto ou vídeo. Sem ela o
 *  formulário teria de reclassificar o endereço, e o `embedDoTutorialVideo`
 *  aceita qualquer https como vídeo: a foto colada viraria player preto. */
export type MudancaMidia = {
  url: string; capaUrl: string; tipo: "imagem" | "video" | "link" | "vazio"; midia?: "imagem" | "video";
};

export interface CampoMidiaProps {
  /** Vai pro input de arquivo: um `<label htmlFor>` de fora também abre o seletor. */
  id?: string;
  rotulo: string;
  aceita: AceitaCampoMidia;
  url: string;
  /** Capa do vídeo enviado (o primeiro quadro). */
  capaUrl?: string;
  alt?: string;
  onMudar: (m: MudancaMidia) => void;
  /** Presente = foto ganha o campo "Descrição da imagem". */
  onAlt?: (alt: string) => void;
  proporcao?: "16/9" | "1/1";
}

const PARA_LIB: Record<AceitaCampoMidia, AceitaMidiaTutorial> = { imagem: "imagem", video: "video", "imagem-ou-video": "qualquer" };
const TEXTO_ENVIAR: Record<AceitaCampoMidia, string> = { imagem: "Enviar foto", video: "Enviar vídeo", "imagem-ou-video": "Enviar foto ou vídeo" };
const ICONE_VAZIO: Record<AceitaCampoMidia, string> = { imagem: "photo", video: "video", "imagem-ou-video": "photo" };
const ROTULO_LINK: Record<AceitaCampoMidia, string> = { imagem: "Endereço da imagem", video: "Link do vídeo", "imagem-ou-video": "Link da foto ou do vídeo" };
const EXEMPLO_LINK: Record<AceitaCampoMidia, string> = {
  imagem: "https://…/foto.jpg", video: "youtube.com/watch?v=…", "imagem-ou-video": "YouTube, Vimeo, .mp4 ou foto",
};
const ICONE_ORIGEM: Record<OrigemMidiaTutorial, string> = {
  foto: "photo", "video-enviado": "video", youtube: "player-play", vimeo: "player-play", link: "link",
};
// Anúncio só nos marcos, nunca a cada %: um leitor de tela falando "41%, 42%"
// atropela tudo o mais. Texto diferente da etiqueta ("Vídeo enviado") de propósito.
const AVISO_ENVIANDO: Record<TipoMidiaTutorial, string> = { imagem: "enviando a foto…", gif: "enviando o GIF…", video: "enviando o vídeo…" };
const AVISO_ENVIADO: Record<TipoMidiaTutorial, string> = { imagem: "foto enviada.", gif: "GIF enviado.", video: "vídeo enviado." };

type Envio = { etapa: "preparando" | "arquivo" | "capa"; pct: number };
type Foco = "arquivo" | "cancelar" | "trocar";

/** "youtu.be/dQw4w9WgXcQ", "cdn.loja.com.br/…/passo-3.mp4" — o link colado sem
 *  o esquema. Só o domínio não dizia QUAL vídeo está gravado, e o endereço
 *  inteiro no `title` não existe no toque. Longo, corta o MEIO: o que identifica
 *  (o id, o nome do arquivo) mora no fim, e a reticência da linha o comeria. */
function enderecoCurto(url: string): string {
  try {
    const u = new URL(normalizarUrlPublica(url));
    const host = u.hostname.replace(/^www\./, "");
    const resto = `${u.pathname === "/" ? "" : u.pathname}${u.search}`;
    const partes = resto.split("/").filter(Boolean);
    if (host.length + resto.length <= 40 || partes.length < 2) return host + resto;
    return `${host}/…/${partes[partes.length - 1]}`;
  } catch { return ""; }
}

/** Só reage a arrasto de ARQUIVO: texto ou link arrastado de outra aba não
 *  deve acender a área de soltar. */
const temArquivo = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function CampoMidia({ id, rotulo, aceita, url, capaUrl = "", alt, onMudar, onAlt, proporcao = "16/9" }: CampoMidiaProps) {
  const base = useId();
  const idArquivo = id ?? `${base}-arquivo`;
  const idRotulo = `${base}-rotulo`;
  const idLink = `${base}-link`;
  const idErro = `${base}-erro`;
  const idAlt = `${base}-alt`;
  const idAltDica = `${base}-alt-dica`;

  const [envio, setEnvio] = useState<Envio | null>(null);
  const [erro, setErroTexto] = useState("");
  // Cada recusa ganha um número, que vira o `key` do alerta: a MESMA mensagem
  // de novo (outro arquivo no formato errado) não mudaria nada no DOM, e o
  // leitor de tela ficaria mudo depois da tentativa. Remontado, é lido de novo.
  const [vezDoErro, setVezDoErro] = useState(0);
  // Só o erro tinha região viva: quem usa leitor de tela escolhia o arquivo e
  // não ouvia nem "enviando" nem "enviado" — o progressbar só fala com foco.
  const [aviso, setAviso] = useState("");
  const [modoLink, setModoLink] = useState(false);
  const [link, setLink] = useState("");
  const [trocando, setTrocando] = useState(false);
  const [sobre, setSobre] = useState(false);
  const [quebrou, setQuebrou] = useState("");

  const controle = useRef<AbortController | null>(null);
  const grupo = useRef<HTMLDivElement>(null);
  const campoLink = useRef<HTMLInputElement>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);
  const botaoCancelar = useRef<HTMLButtonElement>(null);
  const botaoTrocar = useRef<HTMLButtonElement>(null);
  const focarDepois = useRef<Foco | null>(null);
  // O `<label>` vestido de botão não é o `Botao` do kit: sem o hook, o
  // `mt-anel` fica inerte e o toque em "Enviar foto" — que leva uns 300ms pra
  // abrir o seletor do sistema — não dá sinal nenhum, e a pessoa toca de novo.
  const onda = useOnda();
  // O envio leva segundos (vídeo, minutos): quando ele termina, o `onMudar`
  // daquela renderização pode carregar o formulário de antes — o título que a
  // pessoa digitou no meio do envio voltaria pro que era. Chama sempre o atual.
  const mudar = useRef(onMudar);
  const atual = useRef({ url, alt, onAlt });
  useEffect(() => { mudar.current = onMudar; atual.current = { url, alt, onAlt }; });

  function setErro(texto: string) { setErroTexto(texto); if (texto) setVezDoErro((n) => n + 1); }

  // Fechar o painel no meio do envio não deixa um PUT órfão gastando o 4G.
  useEffect(() => () => controle.current?.abort(), []);
  useEffect(() => { if (modoLink) campoLink.current?.focus(); }, [modoLink]);
  // Cada cara nova tira da tela o controle que tinha o foco — o input quando o
  // envio começa, o Cancelar quando ele acaba, o Trocar ao remover, o campo de
  // link ao usá-lo. Sem isto o foco cai no <body>: quem navega por teclado
  // volta pro topo da página e o Tab escapa da trava do editor em tela cheia.
  // O destino espera o render em que aparece (a capa do vídeo segura o Trocar).
  useEffect(() => {
    const destino = focarDepois.current;
    const alvo = destino === "arquivo" ? campoArquivo.current
      : destino === "cancelar" ? botaoCancelar.current
      : destino === "trocar" ? botaoTrocar.current : null;
    if (!alvo) return;
    focarDepois.current = null;
    // Só devolve o foco que ESTE campo tirou. O vídeo leva minutos: se a pessoa
    // já foi digitar o título, puxar o foco no fim do envio mandaria o que ela
    // digita pro botão.
    const ativo = document.activeElement;
    if (!ativo || ativo === document.body || !ativo.isConnected || grupo.current?.contains(ativo)) alvo.focus();
  });

  const aceitaLib = PARA_LIB[aceita];
  const midia = descreverMidiaTutorial(url, capaUrl, aceitaLib);
  const escolhendo = !envio && (!midia || trocando);

  async function receber(bruto?: File | null) {
    if (!bruto || controle.current) return;   // um envio por vez
    setErro(""); setAviso("");
    const mime = mimeDoArquivo(bruto);
    // Recusa ANTES de subir. A foto crua vale até 25 MB aqui: ela ainda vai
    // encolher, e o teto de 8 MB é conferido depois da compressão.
    const antes = classificarMidiaTutorial(mime, bruto.size, aceitaLib, { crua: true });
    if (!antes.ok) { setErro(antes.erro); return; }
    const ctl = new AbortController();
    controle.current = ctl;
    const vivo = () => !ctl.signal.aborted;
    setModoLink(false);
    setAviso(`${rotulo}: ${AVISO_ENVIANDO[antes.tipo]}`);
    // O input com o foco sai da tela junto com a escolha: o foco vai pro
    // Cancelar, o único controle do campo enquanto sobe.
    focarDepois.current = "cancelar";
    // Arquivo sem `type` (HEIC/WebM no Windows) sobe com o tipo deduzido do
    // nome — é ele que o Storage grava e devolve pro navegador de quem assiste.
    let arquivo = bruto.type === mime ? bruto : new File([bruto], bruto.name, { type: mime });
    try {
      if (antes.tipo === "imagem") {
        setEnvio({ etapa: "preparando", pct: 0 });
        arquivo = await comprimirImagem(arquivo);
        if (!vivo()) return;
      }
      const c = classificarMidiaTutorial(arquivo.type, arquivo.size, aceitaLib);
      if (!c.ok) { setErro(c.erro); setAviso(""); focarDepois.current = "arquivo"; return; }
      setEnvio({ etapa: "arquivo", pct: 0 });
      // A capa sai do arquivo LOCAL: dá pra tirá-la enquanto o vídeo sobe.
      const capa = c.tipo === "video" ? capaDoVideo(arquivo) : null;
      const publico = await enviarParaStorage(arquivo, {
        rota: ROTA_ENVIO,
        sinal: ctl.signal,
        onProgresso: (p) => { if (vivo()) setEnvio({ etapa: "arquivo", pct: Math.round(p * 100) }); },
      });
      if (!vivo()) return;
      const tipo = c.tipo === "video" ? "video" : "imagem";
      // O vídeo já vale: se a capa demorar ou falhar, o formulário tem o vídeo.
      // `capaUrl: ""` apaga a capa do vídeo ANTERIOR, que não é deste.
      gravarNova({ url: publico, capaUrl: "", tipo });
      setAviso(`${rotulo}: ${AVISO_ENVIADO[c.tipo]}`);
      focarDepois.current = "trocar";
      setTrocando(false);
      if (capa) {
        setEnvio({ etapa: "capa", pct: 0 });
        const quadro = await capa;
        if (quadro && vivo()) {
          try {
            const capaUrl = await enviarParaStorage(quadro, { rota: ROTA_ENVIO, sinal: ctl.signal });
            if (vivo()) mudar.current({ url: publico, capaUrl, tipo: "video" });
          } catch { /* sem capa: o vídeo continua valendo e o player mostra o quadro ao tocar */ }
        }
      }
    } catch (e) {
      if (vivo() && !envioCancelado(e)) {
        setErro((e as Error).message || "O envio falhou. Tente de novo.");
        setAviso(""); focarDepois.current = "arquivo";
      }
    } finally {
      // Só quem ainda é o envio da vez limpa a tela: um envio cancelado que
      // termina atrasado não pode apagar o progresso do envio seguinte.
      if (controle.current === ctl) { controle.current = null; setEnvio(null); }
    }
  }

  // A descrição é DAQUELA foto: mídia nova que herda o texto sai descrita como
  // outra imagem pro leitor de tela, e a pendência "imagem sem descrição" dá o
  // caso por resolvido. Limpa ANTES de gravar a mídia — se o formulário de fora
  // montar as duas mudanças a partir do mesmo estado, vence a última, e ela
  // tem de ser a mídia.
  function gravarNova(m: MudancaMidia) {
    const { url: antiga, alt: descricao, onAlt: descrever } = atual.current;
    if (descricao && descrever && m.url !== antiga) descrever("");
    mudar.current(m);
  }

  function cancelar() {
    controle.current?.abort();
    controle.current = null;
    setEnvio(null);
    setAviso(`${rotulo}: ${envio?.etapa === "capa" ? "capa cancelada, o vídeo continua gravado." : "envio cancelado."}`);
    // Cancelado na capa, o vídeo já está gravado e o campo volta cheio.
    focarDepois.current = midia && !trocando ? "trocar" : "arquivo";
  }

  function abrirLink() { setErro(""); setModoLink(true); }
  function fecharLink() { setModoLink(false); setLink(""); setErro(""); focarDepois.current = "arquivo"; }

  function usarLink() {
    const r = reconhecerLinkDeMidia(link, aceitaLib);
    if (!r.ok) { setErro(r.erro); campoLink.current?.focus(); return; }
    setErro(""); setModoLink(false); setTrocando(false); setLink("");
    gravarNova({ url: r.url, capaUrl: "", tipo: "link", ...(aceita === "imagem-ou-video" ? { midia: r.tipo } : {}) });
    setAviso(`${rotulo}: link adicionado.`);
    focarDepois.current = "trocar";
  }

  // Limpar o aviso é o que deixa o próximo "link adicionado." ser lido: texto
  // igual ao que já está na região viva não é anunciado de novo.
  function trocar() { setErro(""); setAviso(""); setTrocando(true); focarDepois.current = "arquivo"; }
  function manter() { setErro(""); setTrocando(false); setModoLink(false); setLink(""); focarDepois.current = "trocar"; }
  function remover() {
    setErro(""); setTrocando(false);
    focarDepois.current = "arquivo";
    gravarNova({ url: "", capaUrl: "", tipo: "vazio" });
    setAviso(`${rotulo}: mídia removida.`);
  }

  const textoEnvio = envio?.etapa === "preparando" ? "Preparando a foto…"
    : envio?.etapa === "capa" ? "Gerando capa…"
    : `Enviando… ${envio?.pct ?? 0}%`;
  const mostraMiniatura = !!midia?.miniatura && quebrou !== midia.miniatura;
  const endereco = midia && !midia.enviada && midia.origem !== "foto" ? enderecoCurto(url) : "";

  return (
    <div ref={grupo} className="cte-midia" role="group" aria-labelledby={idRotulo} aria-busy={envio ? true : undefined}
      data-sobre={sobre ? "1" : undefined} data-quadrado={proporcao === "1/1" ? "1" : undefined}
      onDragOver={(e) => {
        if (!temArquivo(e)) return;
        // Cancela SEMPRE que há arquivo em cima: sem isto, soltar durante um
        // envio faz o navegador abrir o arquivo na aba e o formulário se perde.
        e.preventDefault();
        if (!envio && !sobre) setSobre(true);
      }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSobre(false); }}
      onDrop={(e) => {
        if (!temArquivo(e)) return;
        e.preventDefault();
        setSobre(false);
        void receber(e.dataTransfer.files?.[0]);
      }}
      // A foto que a pessoa acabou de recortar está na área de transferência,
      // a um ⌘V de distância — o seletor sozinho a obrigava a salvar antes.
      onPaste={(e) => {
        const f = Array.from(e.clipboardData?.files ?? [])[0];
        if (f) { e.preventDefault(); void receber(f); }
      }}>
      <span id={idRotulo} className="cte-midia-rotulo">{rotulo}</span>

      {envio && (
        <div className="cte-midia-envio">
          <div className="cte-midia-envio-topo">
            <span className="cte-midia-envio-texto">{textoEnvio}</span>
            <Botao ref={botaoCancelar} variante="sutil" tamanho="sm" icone="x" onClick={cancelar}>
              Cancelar
            </Botao>
          </div>
          <div className="cte-midia-barra" role="progressbar" aria-label={`Envio: ${rotulo}`}
            aria-valuemin={0} aria-valuemax={100} aria-valuetext={textoEnvio}
            aria-valuenow={envio.etapa === "arquivo" ? envio.pct : undefined}
            data-indeterminado={envio.etapa === "arquivo" ? undefined : "1"}>
            <span style={{ width: envio.etapa === "arquivo" ? `${envio.pct}%` : undefined }} />
          </div>
        </div>
      )}

      {midia && !envio && (
        <div className="cte-midia-cheio">
          <div className="cte-midia-mini">
            {mostraMiniatura
              // eslint-disable-next-line @next/next/no-img-element -- mídia da pessoa, de qualquer host
              ? <img src={midia.miniatura} alt="" decoding="async" onError={() => setQuebrou(midia.miniatura)} />
              : <Icon name={ICONE_ORIGEM[midia.origem]} size={24} />}
            {!midia.imagem && mostraMiniatura && (
              <span className="cte-midia-play" aria-hidden="true"><Icon name="player-play" size={13} /></span>
            )}
          </div>
          <div className="cte-midia-info">
            <span className="cte-midia-etiqueta"><Icon name={ICONE_ORIGEM[midia.origem]} size={13} />{midia.rotulo}</span>
            {endereco && <small className="cte-midia-host" title={url}>{endereco}</small>}
            {!trocando && (
              <div className="cte-midia-acoes">
                <Botao ref={botaoTrocar} tamanho="sm" icone="refresh" onClick={trocar}>
                  Trocar
                </Botao>
                <Botao variante="sutil" tamanho="sm" icone="trash" onClick={remover}>
                  Remover
                </Botao>
              </div>
            )}
          </div>
        </div>
      )}

      {escolhendo && !modoLink && (
        <div className="cte-midia-vazio">
          {!midia && <span className="cte-midia-icone" aria-hidden="true"><Icon name={ICONE_VAZIO[aceita]} size={20} /></span>}
          <div className="cte-midia-botoes">
            {/* O input cru desenharia o "Choose File" do sistema, em inglês e
                fora do tema: ele fica fora da vista (mas no Tab) e quem aparece
                é o botão da fundação, ligado pelo `htmlFor`. */}
            <input ref={campoArquivo} id={idArquivo} className="cte-midia-arquivo" type="file"
              accept={ACEITE_MIDIA_TUTORIAL[aceitaLib]}
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void receber(f); }} />
            <label htmlFor={idArquivo} className="ui-btn mt-anel" data-v="secundario" data-t="md" onPointerDown={onda}>
              <Icon name="upload" size={15.5} />{TEXTO_ENVIAR[aceita]}
            </label>
            <Botao variante="sutil" icone="link" onClick={abrirLink}>
              Colar link
            </Botao>
            {trocando && (
              <Botao variante="sutil" onClick={manter}>Manter a atual</Botao>
            )}
          </div>
          <small className="cte-midia-dica desk-only">ou arraste aqui / cole (⌘V)</small>
        </div>
      )}

      {escolhendo && modoLink && (
        <div className="cte-midia-link">
          <label htmlFor={idLink} className="cte-midia-sub">{ROTULO_LINK[aceita]}</label>
          <div className="cte-midia-link-linha">
            <input ref={campoLink} id={idLink} type="url" inputMode="url" autoComplete="off" spellCheck={false}
              value={link} placeholder={EXEMPLO_LINK[aceita]}
              aria-invalid={erro ? true : undefined} aria-describedby={erro ? idErro : undefined}
              onChange={(e) => { setLink(e.target.value); if (erro) setErro(""); }}
              onKeyDown={(e) => {
                // Enter dentro de um <form> enviaria o formulário inteiro.
                if (e.key === "Enter") { e.preventDefault(); usarLink(); }
                // Esc fecha só o campo de link, não o painel em volta.
                else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fecharLink(); }
              }} />
            <Botao variante="primario" onClick={usarLink}>Usar link</Botao>
            <Botao variante="sutil" onClick={fecharLink}>Cancelar</Botao>
          </div>
        </div>
      )}

      {erro && (
        <p key={vezDoErro} id={idErro} role="alert" className="cte-midia-erro"><Icon name="alert-triangle" size={15} />{erro}</p>
      )}

      {midia?.imagem && onAlt && !envio && (
        <div className="cte-midia-alt">
          <label htmlFor={idAlt}>Descrição da imagem</label>
          <input id={idAlt} value={alt ?? ""} maxLength={200} aria-describedby={idAltDica}
            placeholder="Ex.: carimbo encostado no tecido, visto de cima"
            onChange={(e) => onAlt(e.target.value)} />
          <small id={idAltDica}>Pra quem usa leitor de tela — diga o que a foto mostra.</small>
        </div>
      )}

      {/* Sempre montada — região viva que nasce junto com o texto não é lida —
          e fora da vista: quem enxerga já tem a barra e a etiqueta. */}
      <span role="status" className="so-leitor">{aviso}</span>
    </div>
  );
}
