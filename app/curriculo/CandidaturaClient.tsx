"use client";

// O formulário de candidatura — etapas curtas, perguntas condicionais.
//
// As telas não são uma lista fixa: saem de `telasDoFormulario(config,
// respostas)` a cada resposta. Quem marca "Estou estudando" ganha a etapa de
// formação com curso/instituição/modalidade; quem trabalha, a de cargo e
// empresa; quem procura emprego, "você já trabalhou?". A mesma função roda no
// servidor pra conferir o envio.
//
// "1 tela = 1 objetivo": uma etapa pequena mostra as perguntas juntas; a
// etapa aberta ("Conte um pouco mais") mostra uma por tela. O personagem
// aparece só na primeira tela das etapas que o RH escolheu — não em todas.
// O currículo sobe DIRETO pro B2 com URL assinada. `previa`: nada sai do navegador.

import { ACCEPT_CURRICULO, ACEITOS_TEXTO, curriculoAceito, extensaoDoArquivo, mimeDoCurriculo } from "@/lib/rh/curriculos/arquivo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../(plataforma)/Icon";
import { InputSuave } from "./InputSuave";
import { Confete, Personagem } from "./Personagem";
import { srcDaPose } from "@/lib/rh/curriculos/personagens";
import {
  CHAVE_ENVIADO, CHAVE_RASCUNHO, JANELA_REENVIO_H, partesDoTitulo, pendenciaDaTela, telasDoFormulario,
  type ConfigFormulario, type Pergunta, type Respostas, type Tela, type Valor,
} from "@/lib/rh/curriculos/formulario";

// ── Memória do navegador ──────────────────────────────────────────────────────
// Dois carimbos, os dois em try/catch (modo anônimo, site sem armazenamento):
//  - rascunho: respostas + tela. Recarregar no meio não perde o digitado.
//  - enviado_em: a hora do último envio. Dentro da janela, a página abre
//    direto em "já recebemos" — o servidor confere a mesma janela pelo
//    e-mail/WhatsApp, então limpar o site não vira segunda candidatura.
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sem storage */ } };

function horasRestantes(enviadoEm: string | null): number {
  const t = Number(enviadoEm);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil((t + JANELA_REENVIO_H * 3_600_000 - Date.now()) / 3_600_000));
}

/** Teclado na tela a cada etapa incomoda mais do que ajuda: só foca sozinho onde há mouse. */
const focaSozinho = () => typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;

type Arquivo = { chave: string; nome: string; tamanho: number; tipo: string };
const TETO_MB = 10;

function Titulo({ texto, vars, como = "h1" }: { texto: string; vars: Record<string, string>; como?: "h1" | "h2" }) {
  const Tag = como;
  return (
    <Tag className="cd-titulo">
      {partesDoTitulo(texto, vars).map((p, i) => (p.destaque ? <b key={i}>{p.texto}</b> : <span key={i}>{p.texto}</span>))}
    </Tag>
  );
}

export interface VagaDoLink { id: string; titulo: string; perguntas: Pergunta[] }

export function CandidaturaClient({ previa, fechado, vaga, config }: {
  previa: boolean; fechado: boolean; vaga: VagaDoLink | null; config: ConfigFormulario;
}) {
  const daVaga = useMemo(() => vaga?.perguntas ?? [], [vaga]);
  const [r, setR] = useState<Respostas>({});
  // `pos` 0 é a abertura (quando ativa); 1..n são as telas.
  const [pos, setPos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [arquivos, setArquivos] = useState<Record<string, Arquivo>>({});
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [jaEnviouHa, setJaEnviouHa] = useState(0);
  const [hidratado, setHidratado] = useState(false);
  const inicio = useRef<string | null>(null);
  const topo = useRef<HTMLDivElement>(null);

  const { telas, totalEtapas } = useMemo(() => telasDoFormulario(config, r, daVaga), [config, r, daVaga]);
  const temAbertura = config.abertura.ativa;
  const deslocamento = temAbertura ? 1 : 0;
  const ultimaPos = telas.length - 1 + deslocamento;
  const tela: Tela | null = pos >= deslocamento ? telas[Math.min(pos - deslocamento, telas.length - 1)] ?? null : null;
  const ehUltima = pos === ultimaPos;
  // "N de 12" como nas referências: a abertura é a 1.
  const totalMostrado = totalEtapas + deslocamento;

  // Restaura o rascunho e confere o carimbo de envio — DEPOIS de hidratar,
  // senão o servidor pinta a abertura e o cliente pinta a etapa 4.
  useEffect(() => {
    if (!previa) {
      const h = horasRestantes(ler(CHAVE_ENVIADO));
      if (h > 0) { setJaEnviouHa(h); setHidratado(true); return; }
      gravar(CHAVE_ENVIADO, null);
      try {
        const salvo = JSON.parse(ler(CHAVE_RASCUNHO) ?? "null") as { r?: Respostas; pos?: number } | null;
        if (salvo?.r && typeof salvo.r === "object") setR(salvo.r);
        // Volta pra tela salva, nunca além da penúltima: o arquivo não
        // sobrevive ao recarregar, então a tela do currículo se refaz.
        if (typeof salvo?.pos === "number") setPos(Math.max(0, salvo.pos));
      } catch { /* rascunho corrompido: começa do zero */ }
    }
    setHidratado(true);
  }, [previa]);

  // Rascunho a cada mudança (depois da restauração, senão o vazio inicial
  // sobrescreveria o que estava salvo). Upload não entra: a chave expira.
  useEffect(() => {
    if (!hidratado || previa || concluido) return;
    gravar(CHAVE_RASCUNHO, JSON.stringify({ r, pos }));
  }, [r, pos, hidratado, previa, concluido]);

  // Resposta que muda o caminho pode encurtar o formulário: a posição nunca
  // passa da última tela.
  useEffect(() => { if (pos > ultimaPos) setPos(ultimaPos); }, [pos, ultimaPos]);

  // Os personagens das próximas telas já baixam agora (34 KB cada): trocar
  // de tela nunca espera imagem.
  useEffect(() => {
    const poses = new Set([config.abertura.personagem, config.final.personagem, ...config.etapas.map((e) => e.personagem)]);
    for (const p of poses) if (p) { const i = new Image(); i.decoding = "async"; i.src = srcDaPose(p); }
  }, [config]);

  const set = (id: string, v: Valor) => { setR((a) => ({ ...a, [id]: v })); setErro(null); };

  // O carimbo de início: pedido uma vez, na abertura. Sem ele o presign do
  // currículo diz não. Na prévia não há rede.
  useEffect(() => {
    if (previa || fechado) return;
    fetch("/api/candidatura/iniciar", { method: "POST" })
      .then((x) => x.json()).then((j) => { if (j?.inicio) inicio.current = j.inicio; })
      .catch(() => { /* tenta de novo no upload */ });
  }, [previa, fechado]);

  const garantirInicio = useCallback(async () => {
    if (inicio.current) return inicio.current;
    const x = await fetch("/api/candidatura/iniciar", { method: "POST" });
    const j = await x.json().catch(() => ({}));
    if (!x.ok || !j.inicio) throw new Error(j.erro === "formulario_fechado" ? "O formulário está fechado no momento." : "Não foi possível iniciar. Recarregue a página.");
    inicio.current = j.inicio;
    return j.inicio as string;
  }, []);

  // As respostas com os uploads trocados pela chave — é o que a validação lê.
  const comArquivos = useMemo(() => {
    const out: Respostas = { ...r };
    for (const [id, a] of Object.entries(arquivos)) out[id] = a.chave;
    return out;
  }, [r, arquivos]);

  // ── Navegação ──────────────────────────────────────────────────────────────
  const avancar = () => {
    if (tela) {
      const p = pendenciaDaTela(tela, comArquivos);
      if (p) { setErro(p); return; }
    }
    setErro(null);
    setPos((a) => Math.min(a + 1, ultimaPos));
  };
  const voltar = () => { setErro(null); setPos((a) => Math.max(a - 1, 0)); };

  const enviar = async () => {
    if (!tela) return;
    const p = pendenciaDaTela(tela, comArquivos);
    if (p) { setErro(p); return; }
    if (previa) { setConcluido(true); return; }
    setEnviando(true); setErro(null);
    try {
      const tk = await garantirInicio();
      const x = await fetch("/api/candidatura", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inicio: tk, respostas: r, vaga_id: vaga?.id ?? null,
          arquivos: Object.fromEntries(Object.entries(arquivos).map(([id, a]) => [id, { chave: a.chave, nome: a.nome }])),
        }),
      });
      const j = await x.json().catch(() => ({}));
      if (!x.ok) {
        // O servidor já tem esta pessoa nas últimas 24 h: carimba aqui também,
        // pra próxima abertura cair direto na tela de "já recebemos".
        if (j.repetida) gravar(CHAVE_ENVIADO, String(Date.now()));
        throw new Error(j.erro || "Não foi possível enviar. Tente de novo.");
      }
      gravar(CHAVE_ENVIADO, String(Date.now()));
      gravar(CHAVE_RASCUNHO, null);
      setConcluido(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally { setEnviando(false); }
  };

  // ── Teclado (computador) ───────────────────────────────────────────────────
  // Enter avança (dentro de texto longo, Ctrl/⌘+Enter — Enter sozinho quebra
  // linha); 1–9 escolhem a opção da tela, na ordem em que aparecem. Com o
  // foco num campo de texto, os números são texto, não atalho.
  const refAvancar = useRef<() => void>(() => {});
  refAvancar.current = () => {
    if (enviando || subindo || concluido) return;
    if (tela && ehUltima) void enviar(); else avancar();
  };
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.isComposing || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      const emTexto = !!alvo && (alvo.tagName === "TEXTAREA" || (alvo.tagName === "INPUT" && (alvo as HTMLInputElement).type !== "file"));
      if (e.key === "Enter") {
        if (alvo?.tagName === "TEXTAREA" && !(e.metaKey || e.ctrlKey)) return;
        if (alvo?.tagName === "INPUT") return; // o próprio campo já avança no Enter
        if (alvo?.tagName === "BUTTON" || alvo?.tagName === "A") return; // Enter no botão é o clique dele
        e.preventDefault(); refAvancar.current();
        return;
      }
      if (emTexto || e.metaKey || e.ctrlKey || !/^[1-9]$/.test(e.key)) return;
      const opcoes = [...document.querySelectorAll<HTMLButtonElement>(".cd-cartao .cd-opcao")];
      const o = opcoes[Number(e.key) - 1];
      if (o) { e.preventDefault(); o.click(); o.focus({ preventScroll: true }); }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // Fechar a aba no meio da candidatura pede confirmação (o rascunho fica
  // salvo, mas o currículo anexado não sobrevive). Na prévia e depois de
  // enviar, sai livre.
  useEffect(() => {
    if (previa || concluido || pos === 0) return;
    const segurar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [previa, concluido, pos]);

  // ── Upload direto no B2 ────────────────────────────────────────────────────
  const [subindo, setSubindo] = useState<string | null>(null);
  const escolherArquivo = async (id: string, f: File | null | undefined) => {
    if (!f) return;
    setErro(null);
    const ext = extensaoDoArquivo(f.name);
    if (!curriculoAceito(ext)) { setErro(`Aceitamos ${ACEITOS_TEXTO}.`); return; }
    if (f.size > TETO_MB * 1024 * 1024) { setErro(`O arquivo tem ${(f.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB e o limite é ${TETO_MB} MB. Exporte em PDF menor.`); return; }
    if (previa) { setArquivos((a) => ({ ...a, [id]: { chave: "previa/0000/00/previa.pdf", nome: f.name, tamanho: f.size, tipo: f.type } })); return; }
    setSubindo(id);
    try {
      const tk = await garantirInicio();
      const x = await fetch("/api/candidatura/curriculo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inicio: tk, nome: f.name, tamanho: f.size }),
      });
      const j = await x.json().catch(() => ({}));
      if (!x.ok) throw new Error(j.erro === "too_large" ? `Limite de ${j.limiteTexto}.` : j.erro === "tipo_nao_aceito" ? `Aceitamos ${j.aceitos}.` : "Não foi possível preparar o envio. Tente de novo.");
      const put = await fetch(j.put, { method: "PUT", body: f, headers: { "Content-Type": mimeDoCurriculo(ext) } });
      if (!put.ok) throw new Error("O envio do arquivo falhou. Tente de novo.");
      setArquivos((a) => ({ ...a, [id]: { chave: j.chave, nome: f.name, tamanho: f.size, tipo: f.type } }));
    } catch (e) {
      setErro((e as Error).message);
    } finally { setSubindo(null); }
  };

  const vars = useMemo(() => ({ nome: String(r.nome ?? "").trim().split(/\s+/)[0] || "candidato" }), [r.nome]);
  const comPersonagem = config.personagens;

  // Antes de restaurar o rascunho a tela fica só com a marca: um quadro em
  // branco de 50 ms é melhor do que a abertura piscar e virar a etapa 4.
  if (!hidratado) return <div className="cd-tela"><Marca logo={config.logo_url} /></div>;

  if (jaEnviouHa > 0 && !concluido) {
    return (
      <div className="cd-tela">
        <Marca logo={config.logo_url} />
        <div className="cd-cartao">
          <div className="cd-fechado">
            <div className="cd-check"><Icon name="check" size={44} stroke={3} /></div>
            <h1 className="cd-titulo">Já recebemos a sua <b>candidatura.</b></h1>
            <p className="cd-sub">
              Uma candidatura por pessoa a cada {JANELA_REENVIO_H} horas. Você pode enviar outra em cerca de {jaEnviouHa === 1 ? "1 hora" : `${jaEnviouHa} horas`}.
              Se houver compatibilidade com alguma oportunidade, nosso time entra em contato.
            </p>
          </div>
          {comPersonagem && <Personagem pose="ele-joinha" lado="esq" nota="Até breve!" />}
        </div>
      </div>
    );
  }

  if (fechado) {
    return (
      <div className="cd-tela">
        <Marca logo={config.logo_url} />
        <div className="cd-cartao">
          <div className="cd-fechado">
            <Icon name="clock" size={40} color="var(--cd-roxo)" />
            <h1 className="cd-titulo" style={{ marginTop: 12 }}>As candidaturas estão <b>fechadas</b> por enquanto.</h1>
            <p className="cd-sub">Volte em breve. Quando abrirmos de novo, este link funciona.</p>
          </div>
          {comPersonagem && <Personagem pose="ela-pensando" lado="dir" />}
        </div>
      </div>
    );
  }

  // ── Tela final ─────────────────────────────────────────────────────────────
  if (concluido) {
    return (
      <div className="cd-tela">
        <Marca logo={config.logo_url} />
        {previa && <span className="cd-previa">Prévia — nada foi enviado</span>}
        <div className="cd-cartao">
          <Cabecalho rotulo="Currículo Tridi" numero={totalMostrado} total={totalMostrado} cheio />
          <div className="cd-miolo">
            <div className="cd-fim-topo">
              <Confete className="cd-confete" />
              <div className="cd-check cd-check-pula"><Icon name="check" size={40} stroke={3} /></div>
            </div>
            <div className="cd-fim-titulo"><Titulo texto={config.final.titulo} vars={vars} /></div>
            {config.final.sub && <p className="cd-sub cd-fim-sub">{config.final.sub}</p>}
            {config.final.proximo && (
              <div className="cd-proximo">
                <span className="cd-ico"><Icon name="send" size={20} /></span>
                <div><strong>Próximo passo</strong><small>{config.final.proximo}</small></div>
              </div>
            )}
          </div>
          {comPersonagem && config.final.personagem && <Personagem pose={config.final.personagem} posicao="centro" prioridade />}
          {/* Fim da linha: só a conclusão, sem botão (o antigo "Finalizado"
              levava pra um site sem status). Na prévia do RH fica o "Recomeçar". */}
          {previa && <div className="cd-rodape" data-so-um="1">
            {previa ? (
              <button type="button" className="cd-btn cd-btn-primario" onClick={() => { setPos(0); setR({}); setArquivos({}); setConcluido(false); }}>
                Recomeçar a prévia <Icon name="refresh" size={20} />
              </button>
            ) : null}
          </div>}
        </div>
      </div>
    );
  }

  // ── Abertura ───────────────────────────────────────────────────────────────
  if (!tela) {
    return (
      <div className="cd-tela" ref={topo}>
        <Marca logo={config.logo_url} />
        {previa && <span className="cd-previa">Prévia — nada é enviado</span>}
        <div className="cd-cartao cd-abertura" key="abertura">
          <Cabecalho rotulo="Currículo Tridi" numero={1} total={totalMostrado} />
          <div className="cd-miolo">
          {vaga && <p className="cd-vaga"><Icon name="briefcase" size={16} /> Vaga: <b>{vaga.titulo}</b></p>}
          <Titulo texto={config.abertura.titulo} vars={vars} />
          {config.abertura.sub && <p className="cd-sub">{config.abertura.sub}</p>}
          <div className="cd-duo">
            <div><span className="cd-ico"><Icon name="clock" size={20} /></span><div><strong>4–6 min</strong><small>Tempo estimado</small></div></div>
            <div><span className="cd-ico"><Icon name="list" size={20} /></span><div><strong>1 pergunta</strong><small>por vez</small></div></div>
          </div>
          {config.abertura.destaques.length > 0 && (
            <ul className="cd-lista">
              {config.abertura.destaques.map((d) => (
                <li key={d.titulo}><span className="cd-ico"><Icon name={d.icone} size={20} /></span><div><strong>{d.titulo}</strong>{d.sub && <small>{d.sub}</small>}</div></li>
              ))}
            </ul>
          )}
          </div>
          {comPersonagem && config.abertura.personagem && <Personagem pose={config.abertura.personagem} posicao="esq" nota={config.abertura.nota} prioridade />}
          <div className="cd-rodape" data-so-um="1">
            <button type="button" className="cd-btn cd-btn-primario" onClick={avancar}>
              Começar <Icon name="arrow-right" size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Uma tela de perguntas ──────────────────────────────────────────────────
  // Etapa "junto": o título é o da etapa e cada pergunta vira rótulo.
  // "Uma por tela": a primeira pergunta é o título; as condicionadas a ela,
  // rótulos embaixo.
  const solo = !!tela.etapa.uma_por_tela;
  const [principal, ...resto] = tela.perguntas;
  const perguntasComRotulo = solo ? resto : tela.perguntas;
  const mostraPersonagem = comPersonagem && tela.primeira && !!tela.etapa.personagem;
  const k = pos - deslocamento;

  return (
    <div className="cd-tela" ref={topo}>
      <Marca logo={config.logo_url} />
      {previa && <span className="cd-previa">Prévia — nada é enviado</span>}
      <div className="cd-cartao" key={`${tela.etapa.id}-${k}`} data-muitas={(principal.opcoes?.length ?? 0) > 5 ? "1" : undefined}
        data-titulo-longo={(solo ? principal.titulo : tela.etapa.titulo).replace(/\*/g, "").length > 70 ? "1" : undefined}>
        <Cabecalho rotulo={tela.etapa.rotulo} numero={tela.numero + 1 + deslocamento} total={totalMostrado} />
        <div className="cd-miolo">
        {solo ? (
          <>
            <Titulo texto={principal.titulo} vars={vars} />
            {principal.ajuda && <p className="cd-sub">{principal.ajuda}</p>}
            <Campo p={principal} valor={r[principal.id]} set={set} solo sozinho={tela.perguntas.length === 1} aoEnter={avancar} arquivo={arquivos[principal.id]} subindo={subindo === principal.id} aoArquivo={escolherArquivo} aoTirarArquivo={(id) => setArquivos((a) => { const n = { ...a }; delete n[id]; return n; })} />
          </>
        ) : (
          <>
            <Titulo texto={tela.etapa.titulo} vars={vars} />
            {tela.etapa.sub && <p className="cd-sub">{tela.etapa.sub}</p>}
          </>
        )}
        {perguntasComRotulo.length > 0 && (
          <div className="cd-campos">
            {perguntasComRotulo.map((p) => (
              <Campo key={p.id} p={p} valor={r[p.id]} set={set} sozinho={tela.perguntas.length === 1}
                rotulo={p.titulo.replace(/\*/g, "").trim() !== tela.etapa.titulo.replace(/\*/g, "").trim()} aoEnter={avancar} arquivo={arquivos[p.id]} subindo={subindo === p.id} aoArquivo={escolherArquivo} aoTirarArquivo={(id) => setArquivos((a) => { const n = { ...a }; delete n[id]; return n; })} />
            ))}
          </div>
        )}

        {erro && <p className="cd-erro" role="alert"><Icon name="alert-triangle" size={16} /> {erro}</p>}
        </div>

        {mostraPersonagem ? (
          <Personagem pose={tela.etapa.personagem!} posicao={tela.etapa.posicao} lado={tela.etapa.nota_lado} nota={tela.etapa.nota} prioridade />
        ) : <div className="cd-respiro" />}

        <div className="cd-rodape">
          <button type="button" className="cd-btn cd-btn-voltar" onClick={voltar} disabled={enviando}>
            <Icon name="arrow-left" size={20} /> Voltar
          </button>
          {ehUltima ? (
            <button type="button" className="cd-btn cd-btn-primario" onClick={() => void enviar()} disabled={enviando || !!subindo}>
              {enviando ? "Enviando…" : <>Enviar<span className="cd-so-largo"> candidatura</span></>} <Icon name="send" size={20} />
            </button>
          ) : (
            <button type="button" className="cd-btn cd-btn-primario" onClick={avancar}>
              Continuar <Icon name="arrow-right" size={20} />
            </button>
          )}
        </div>
      </div>

      {enviando && (
        <div className="cd-enviando" role="status" aria-live="polite">
          <div className="cd-enviando-caixa">
            {comPersonagem && <Personagem pose="ele-ideia" altura={150} animado />}
            <strong>Enviando sua candidatura…</strong>
            <small>Só um instante.</small>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Um campo, por tipo ───────────────────────────────────────────────────────

function Campo({ p, valor, set, solo, rotulo, sozinho, aoEnter, arquivo, subindo, aoArquivo, aoTirarArquivo }: {
  p: Pergunta;
  valor: Valor | undefined;
  set: (id: string, v: Valor) => void;
  /** É a pergunta-título da tela ("uma por tela"): sem rótulo próprio. */
  solo?: boolean;
  /** Mostra o título da pergunta como rótulo. */
  rotulo?: boolean;
  /** A única pergunta da tela — lista grande em vez de grade compacta. */
  sozinho?: boolean;
  aoEnter: () => void;
  arquivo?: Arquivo;
  subindo: boolean;
  aoArquivo: (id: string, f: File | null | undefined) => void;
  aoTirarArquivo: (id: string) => void;
}) {
  const s = Array.isArray(valor) ? "" : String(valor ?? "");
  const idCampo = `cd-${p.id}`;
  const titulo = p.titulo.replace(/\*/g, "");
  const opcional = !p.obrigatoria ? <em className="cd-opcional">opcional</em> : null;

  // Texto de uma linha (texto, e-mail, WhatsApp, número, data)
  if (p.tipo === "texto" || p.tipo === "email" || p.tipo === "telefone" || p.tipo === "numero" || p.tipo === "data") {
    const tipoInput = p.tipo === "email" ? "email" : p.tipo === "telefone" ? "tel" : p.tipo === "data" ? "date" : "text";
    const inputMode = p.tipo === "email" ? "email" : p.tipo === "telefone" ? "tel" : p.tipo === "numero" ? "numeric" : undefined;
    const aoMudar = (v: string) => set(p.id, p.tipo === "telefone" ? mascaraTelefone(v) : p.tipo === "numero" ? v.replace(/[^\d]/g, "").slice(0, 6) : v);
    const comum = {
      id: idCampo, value: s, placeholder: p.placeholder, maxLength: p.teto,
      "aria-label": solo ? titulo : undefined, autoComplete: p.autocomplete,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => aoMudar(e.target.value),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") { e.preventDefault(); aoEnter(); } },
    };
    return (
      <div className="cd-campo">
        <Icon name={p.icone ?? (p.tipo === "data" ? "calendar" : "edit")} size={22} color="var(--cd-roxo)" />
        <div>
          {!solo && <label htmlFor={idCampo}>{titulo}{opcional}</label>}
          {p.tipo === "data"
            ? <input {...comum} type="date" />
            : <InputSuave {...comum} type={tipoInput} inputMode={inputMode} enterKeyHint="next" autoFocus={solo && focaSozinho()} />}
        </div>
      </div>
    );
  }

  if (p.tipo === "longo") {
    return (
      <div className="cd-bloco">
        {rotulo && <p className="cd-rotulo"><label htmlFor={idCampo}>{titulo}{opcional}</label></p>}
        <label className="cd-longo">
          <textarea id={idCampo} autoFocus={solo && focaSozinho()} value={s} maxLength={p.teto} placeholder={p.placeholder}
            aria-label={solo ? titulo : undefined} onChange={(e) => set(p.id, e.target.value)} />
          <small>{s.length}/{p.teto}</small>
        </label>
      </div>
    );
  }

  if (p.tipo === "unica" || p.tipo === "multipla" || p.tipo === "simnao") {
    const multi = p.tipo === "multipla";
    const lista = Array.isArray(valor) ? valor : s ? [s] : [];
    const escolher = (v: string) => {
      if (!multi) { set(p.id, v); return; }
      set(p.id, lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
    };
    // Lista grande quando é a pergunta da tela; grade compacta quando divide
    // a tela com outras — "Sim/Não" é sempre a dupla lado a lado.
    const forma = p.tipo === "simnao" ? "cd-simnao" : sozinho && solo ? "cd-lista" : "cd-grade";
    return (
      <div className="cd-bloco">
        {rotulo && <p className="cd-rotulo" id={`${idCampo}-r`}>{titulo}{opcional}{multi && <em className="cd-opcional">pode marcar mais de uma</em>}</p>}
        <div className={forma} role={multi ? "group" : "radiogroup"} aria-labelledby={rotulo ? `${idCampo}-r` : undefined} aria-label={rotulo ? undefined : titulo}>
          {(p.opcoes ?? []).map((o) => {
            const on = lista.includes(o.valor);
            return (
              <button key={o.valor} type="button" role={multi ? "checkbox" : "radio"} aria-checked={on} aria-label={o.label} className="cd-opcao" data-on={on ? "1" : undefined} onClick={() => escolher(o.valor)}>
                {(o.icone || multi) && (
                  <span className="cd-ico">
                    <Icon name={multi && on ? "check" : o.icone ?? "circle"} size={18} stroke={multi && on ? 2.6 : undefined} />
                  </span>
                )}
                <span>{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Upload
  return (
    <div className="cd-bloco">
      {rotulo && p.id !== "curriculo" && <p className="cd-rotulo">{titulo}{opcional}</p>}
      {arquivo ? (
        <div className="cd-arquivo">
          <span className="cd-ico"><Icon name="file-text" size={20} /></span>
          <div style={{ minWidth: 0 }}><strong>{arquivo.nome}</strong><small>{(arquivo.tamanho / 1024 / 1024).toFixed(2).replace(".", ",")} MB · pronto para enviar</small></div>
          <button type="button" className="cd-chip" onClick={() => aoTirarArquivo(p.id)} aria-label="Trocar arquivo"><Icon name="refresh" size={16} />Trocar</button>
        </div>
      ) : (
        <Soltar subindo={subindo} aoArquivo={(f) => aoArquivo(p.id, f)} titulo={p.id === "curriculo" ? "Selecionar currículo" : "Selecionar arquivo"} />
      )}
    </div>
  );
}

function Soltar({ subindo, aoArquivo, titulo }: { subindo: boolean; aoArquivo: (f: File | null | undefined) => void; titulo: string }) {
  const [sobre, setSobre] = useState(false);
  return (
    <label
      className="cd-drop" data-sobre={sobre ? "1" : undefined}
      onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
      onDrop={(e) => { e.preventDefault(); setSobre(false); aoArquivo(e.dataTransfer.files?.[0]); }}
    >
      <span className="cd-ico"><Icon name={subindo ? "loader" : "file-upload"} size={30} className={subindo ? "spin" : undefined} /></span>
      <strong>{subindo ? "Enviando…" : titulo}</strong>
      <small>Toque aqui para escolher · {ACEITOS_TEXTO}</small>
      <input type="file" accept={ACCEPT_CURRICULO} disabled={subindo} onChange={(e) => aoArquivo(e.target.files?.[0])} />
    </label>
  );
}

/** (DD) 9XXXX-XXXX enquanto digita — só dígitos entram, o resto é desenho. */
function mascaraTelefone(v: string): string {
  const d = v.replace(/\D+/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function Marca({ logo }: { logo: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (logo) return <div className="cd-marca"><img src={logo} alt="Tridi" /></div>;
  return <div className="cd-marca" aria-label="Tridi">T<span>ridi</span></div>;
}

function Cabecalho({ rotulo, numero, total, cheio }: { rotulo: string; numero: number; total: number; cheio?: boolean }) {
  return (
    <>
      <div className="cd-topo">
        <Icon name="user" size={18} color="var(--cd-roxo)" />
        <strong>{rotulo}</strong>
        {numero > 0 && <em><b>{numero}</b> de {total}</em>}
      </div>
      <div className="cd-barra" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={numero} aria-label="Progresso da candidatura">
        {Array.from({ length: total }, (_, k) => <i key={k} data-on={cheio || k < numero ? "1" : undefined} />)}
      </div>
    </>
  );
}
