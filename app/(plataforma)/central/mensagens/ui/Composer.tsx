"use client";

// Campo de escrita: markdown, menções, emoji, anexos múltiplos e arrastar-soltar.
//
// O textarea é NÃO-controlado por padrão (`defaultValue` + ref) e o estado só
// guarda o que a interface precisa saber (se tem conteúdo, se há menção aberta).
// Digitar não deve custar um render da conversa inteira.

import {
  memo, useCallback, useEffect, useRef, useState,
} from "react";
import { Icon } from "../../../Icon";
import { Avatar } from "./Avatar";
import { EMOJIS_CATEGORIAS } from "./emojis";
import { previa, tamanhoLegivel } from "@/lib/chat/regras";
import { apagarRascunho, gravarRascunho, lerRascunho } from "../data/rascunhos";
import type { Anexo, Mensagem, Pessoa } from "@/lib/chat/tipos";

export interface EnvioComposer {
  texto: string;
  anexos: Anexo[];
}

interface Props {
  canalNome: string;
  desabilitado?: string | null;          // motivo, quando não dá para escrever
  respondendo: Mensagem | null;
  editando: Mensagem | null;
  pessoas: Pessoa[];
  emThread?: boolean;
  /** Onde o texto não enviado fica guardado (conversa ou thread). Sem chave, não guarda. */
  rascunhoChave?: string | null;
  aoEnviar: (e: EnvioComposer) => void;
  aoCancelarResposta: () => void;
  aoCancelarEdicao: () => void;
  aoDigitar: () => void;
  aoSubir: (f: File, progresso: (p: number) => void) => Promise<Anexo>;
}

interface Pendente { id: string; file: File; pct: number; anexo: Anexo | null; previa: string | null }

export const Composer = memo(function Composer(p: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const refArquivo = useRef<HTMLInputElement>(null);
  const refEmojis = useRef<HTMLDivElement>(null);
  const refBotaoEmoji = useRef<HTMLButtonElement>(null);
  const [temTexto, setTemTexto] = useState(false);
  const [fila, setFila] = useState<Pendente[]>([]);
  const [emojis, setEmojis] = useState(false);
  const [catEmoji, setCatEmoji] = useState(0);
  const [mencao, setMencao] = useState<{ termo: string; inicio: number } | null>(null);
  const [mencaoSel, setMencaoSel] = useState(0);

  // ── Teclado de emoji: sair de qualquer jeito ──────────────────────────────
  // Um painel que só fecha no mesmo botão que ele cobre é uma armadilha. Aqui
  // fecha com Esc, clicando fora ou no "×"; escolher emoji NÃO fecha, porque
  // quase sempre se põe mais de um.
  useEffect(() => {
    if (!emojis) return;
    const foraOuEsc = (e: Event) => {
      if (e.type === "keydown") {
        if ((e as KeyboardEvent).key !== "Escape") return;
        ref.current?.focus();                       // devolve o cursor ao texto
      } else if (refEmojis.current?.contains(e.target as Node) || refBotaoEmoji.current?.contains(e.target as Node)) {
        return;                                     // clique dentro do painel (ou no próprio botão) não fecha
      }
      setEmojis(false);
    };
    // `capture` para chegar antes do clique virar ação em outro lugar.
    document.addEventListener("pointerdown", foraOuEsc, true);
    document.addEventListener("keydown", foraOuEsc);
    return () => {
      document.removeEventListener("pointerdown", foraOuEsc, true);
      document.removeEventListener("keydown", foraOuEsc);
    };
  }, [emojis]);

  // ── Altura automática ─────────────────────────────────────────────────────
  const ajustar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, window.innerHeight * 0.4) + "px";
  }, []);

  useEffect(() => { if (p.respondendo) ref.current?.focus(); }, [p.respondendo]);

  // ── Rascunho ──────────────────────────────────────────────────────────────
  // O Composer é a mesma instância para todos os canais; trocar de canal troca
  // a chave. Na troca: o texto atual é guardado sob a chave ANTIGA (limpeza do
  // efeito) e o campo recebe o rascunho da NOVA. Digitar grava com um pequeno
  // atraso; enviar apaga.
  //
  // Editar uma mensagem usa o MESMO campo. `emEdicao` diz qual dos dois ele
  // está segurando: ao entrar na edição o rascunho vai pro armário, durante
  // ela nada escreve no rascunho, e ao sair (salvar, cancelar ou trocar de
  // canal) ele volta. É ref, e não `p.editando`, porque a limpeza do efeito
  // da chave precisa do estado de QUANDO se saiu do canal: o `p.editando` do
  // closure é o de quando se entrou, e o do render novo já vem zerado pelo
  // `abrirCanal`.
  const ultimoTexto = useRef("");
  const timerRascunho = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emEdicao = useRef(false);
  const chave = p.rascunhoChave ?? null;
  useEffect(() => {
    const el = ref.current;
    if (!el || !chave) return;
    const guardado = lerRascunho(chave);
    if (!p.editando) {
      el.value = guardado;
      ultimoTexto.current = guardado;
      setTemTexto(!!guardado.trim());
      ajustar();
      if (guardado) el.setSelectionRange(guardado.length, guardado.length);
    }
    return () => {
      if (timerRascunho.current) { clearTimeout(timerRascunho.current); timerRascunho.current = null; }
      // O campo ainda existe na troca de canal (o Composer não remonta); só
      // ao sair da tela ele já se foi — aí vale o último texto anotado. Em
      // edição o campo é da mensagem: vale o rascunho guardado ao entrar.
      const atual = ref.current && !emEdicao.current ? ref.current.value : ultimoTexto.current;
      gravarRascunho(chave, atual);
      ultimoTexto.current = "";
    };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const anotarRascunho = useCallback(() => {
    const el = ref.current;
    // Em edição o campo é da mensagem, não do rascunho: nada a anotar.
    if (!el || !chave || emEdicao.current) return;
    ultimoTexto.current = el.value;
    if (timerRascunho.current) clearTimeout(timerRascunho.current);
    timerRascunho.current = setTimeout(() => { if (chave) gravarRascunho(chave, ultimoTexto.current); }, 400);
  }, [chave]);

  // Entrar em modo edição guarda o rascunho e carrega o texto da mensagem, com
  // o cursor no fim; sair dele devolve o rascunho ao campo.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (p.editando) {
      if (!emEdicao.current) {
        if (timerRascunho.current) { clearTimeout(timerRascunho.current); timerRascunho.current = null; }
        ultimoTexto.current = el.value;
        if (chave) gravarRascunho(chave, el.value);
        emEdicao.current = true;
      }
      el.value = p.editando.texto ?? "";
      setTemTexto(!!el.value.trim());
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
      ajustar();
    } else if (emEdicao.current) {
      emEdicao.current = false;
      const guardado = chave ? lerRascunho(chave) : "";
      el.value = guardado;
      ultimoTexto.current = guardado;
      setTemTexto(!!guardado.trim());
      ajustar();
    }
  }, [p.editando, ajustar]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Menções ───────────────────────────────────────────────────────────────
  const candidatos = mencao
    ? p.pessoas.filter((x) => x.name.toLowerCase().includes(mencao.termo.toLowerCase())).slice(0, 6)
    : [];

  const detectarMencao = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const ate = el.value.slice(0, el.selectionStart ?? 0);
    // "@" no começo ou depois de espaço, seguido de até 20 caracteres sem quebra.
    const m = /(?:^|\s)@([\p{L} ]{0,20})$/u.exec(ate);
    if (!m) return setMencao(null);
    setMencao({ termo: m[1], inicio: ate.length - m[1].length - 1 });
    setMencaoSel(0);
  }, []);

  const aplicarMencao = useCallback((pessoa: Pessoa) => {
    const el = ref.current;
    if (!el || !mencao) return;
    const antes = el.value.slice(0, mencao.inicio);
    const depois = el.value.slice(el.selectionStart ?? 0);
    el.value = `${antes}@${pessoa.name} ${depois}`;
    const pos = antes.length + pessoa.name.length + 2;
    el.setSelectionRange(pos, pos);
    setMencao(null);
    setTemTexto(true);
    el.focus();
    ajustar();
  }, [mencao, ajustar]);

  // ── Anexos ────────────────────────────────────────────────────────────────
  const receber = useCallback(async (arquivos: File[]) => {
    const novos = arquivos.slice(0, 10).map((file) => ({
      id: `${file.name}:${file.size}:${Math.random().toString(36).slice(2)}`,
      file, pct: 0, anexo: null as Anexo | null,
      previa: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setFila((f) => [...f, ...novos]);
    // Sobem em paralelo: esperar em fila multiplicaria a espera por arquivo.
    await Promise.all(novos.map(async (n) => {
      try {
        const anexo = await p.aoSubir(n.file, (pct) =>
          setFila((f) => f.map((x) => (x.id === n.id ? { ...x, pct } : x))));
        setFila((f) => f.map((x) => (x.id === n.id ? { ...x, anexo, pct: 1 } : x)));
      } catch {
        setFila((f) => f.filter((x) => x.id !== n.id));
      }
    }));
  }, [p]);

  const removerDaFila = useCallback((id: string) => {
    setFila((f) => {
      const alvo = f.find((x) => x.id === id);
      if (alvo?.previa) URL.revokeObjectURL(alvo.previa);
      return f.filter((x) => x.id !== id);
    });
  }, []);

  useEffect(() => () => { for (const f of fila) if (f.previa) URL.revokeObjectURL(f.previa); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Marcação de texto (negrito, itálico, código).
   *
   * Três comportamentos, nesta ordem:
   *  1. Com texto selecionado  → marca a seleção e a mantém selecionada, para
   *     dar para encadear (negrito + itálico) sem reselecionar.
   *  2. Sem seleção, com texto → marca a mensagem inteira. É o que se quer ao
   *     escrever e só depois lembrar de destacar.
   *  3. Campo vazio            → põe as marcas e deixa o cursor no meio delas.
   *
   * E ALTERNA: clicar de novo no que já está marcado tira a marcação, em vez
   * de empilhar `****texto****`.
   */
  const marcar = useCallback((abre: string, fecha = abre, blocoSeMultilinha = false) => {
    const el = ref.current;
    if (!el) return;
    let ini = el.selectionStart ?? 0;
    let fim = el.selectionEnd ?? ini;
    if (ini === fim && el.value.trim()) { ini = 0; fim = el.value.length; }

    const alvo = el.value.slice(ini, fim);
    // Código com quebra de linha vira bloco cercado, não crase simples — senão
    // o markdown não fecha e o texto sai cru.
    if (blocoSeMultilinha && alvo.includes("\n")) { abre = "```\n"; fecha = "\n```"; }

    const antes = el.value.slice(0, ini);
    const depois = el.value.slice(fim);
    const marcadoDentro = alvo.startsWith(abre) && alvo.endsWith(fecha) && alvo.length >= abre.length + fecha.length;
    const marcadoFora = antes.endsWith(abre) && depois.startsWith(fecha);

    let valor: string, selIni: number, selFim: number;
    if (marcadoDentro) {
      const limpo = alvo.slice(abre.length, alvo.length - fecha.length);
      valor = antes + limpo + depois;
      selIni = ini; selFim = ini + limpo.length;
    } else if (marcadoFora) {
      valor = antes.slice(0, -abre.length) + alvo + depois.slice(fecha.length);
      selIni = ini - abre.length; selFim = selIni + alvo.length;
    } else {
      valor = antes + abre + alvo + fecha + depois;
      selIni = ini + abre.length; selFim = selIni + alvo.length;
    }

    el.value = valor;
    el.focus();
    el.setSelectionRange(selIni, selFim);
    setTemTexto(!!el.value.trim());
    ajustar();
  }, [ajustar]);

  // ── Envio ─────────────────────────────────────────────────────────────────
  const enviar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const texto = el.value.trim();
    const anexos = fila.map((f) => f.anexo).filter((a): a is Anexo => !!a);
    if (!texto && !anexos.length) return;
    if (fila.some((f) => !f.anexo)) return;        // ainda subindo
    p.aoEnviar({ texto, anexos });
    el.value = "";
    if (timerRascunho.current) { clearTimeout(timerRascunho.current); timerRascunho.current = null; }
    // Salvar uma EDIÇÃO não mexe no rascunho: ele volta ao campo quando o Chat
    // encerra a edição.
    if (!emEdicao.current) {
      ultimoTexto.current = "";
      if (chave) apagarRascunho(chave);
    }
    setTemTexto(false);
    setFila([]);
    setMencao(null);
    setEmojis(false);
    ajustar();
  }, [fila, p, ajustar, chave]);

  const aoTeclar = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Atalhos de marcação. ⌘E para código e não ⌘K, que é a busca do sistema.
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); return marcar("**"); }
      if (k === "i") { e.preventDefault(); return marcar("*"); }
      if (k === "e") { e.preventDefault(); return marcar("`", "`", true); }
    }
    if (mencao && candidatos.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); return setMencaoSel((i) => (i + 1) % candidatos.length); }
      if (e.key === "ArrowUp") { e.preventDefault(); return setMencaoSel((i) => (i - 1 + candidatos.length) % candidatos.length); }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); return aplicarMencao(candidatos[mencaoSel]); }
      if (e.key === "Escape") { e.preventDefault(); return setMencao(null); }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); return enviar(); }
    if (e.key === "Escape") {
      if (p.editando) return p.aoCancelarEdicao();
      if (p.respondendo) return p.aoCancelarResposta();
    }
    // Seta para cima com o campo vazio edita a última mensagem — atalho do Slack.
    if (e.key === "ArrowUp" && !ref.current?.value && !p.editando) {
      const el = document.querySelector<HTMLElement>(".ch-lista .ch-msg:last-of-type");
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [mencao, candidatos, mencaoSel, aplicarMencao, enviar, marcar, p]);

  const inserir = useCallback((txt: string) => {
    const el = ref.current;
    if (!el) return;
    const i = el.selectionStart ?? el.value.length;
    el.value = el.value.slice(0, i) + txt + el.value.slice(el.selectionEnd ?? i);
    el.setSelectionRange(i + txt.length, i + txt.length);
    setTemTexto(!!el.value.trim());
    el.focus();
    ajustar();
  }, [ajustar]);


  if (p.desabilitado) {
    return (
      <div className="ch-composer">
        <div className="ch-composer__caixa" style={{ padding: "14px 16px", textAlign: "center", color: "var(--text-dim)", fontSize: 13.5 }}>
          <Icon name="lock" size={15} color="var(--text-dim)" style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {p.desabilitado}
        </div>
      </div>
    );
  }

  const subindo = fila.some((f) => !f.anexo);
  const podeEnviar = (temTexto || fila.some((f) => f.anexo)) && !subindo;

  return (
    <div
      className="ch-composer"
      onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = "copy"; }}
      onDrop={(e) => {
        e.preventDefault();
        const arquivos = Array.from(e.dataTransfer?.files ?? []);
        if (arquivos.length) void receber(arquivos);
      }}
    >
      {mencao && candidatos.length > 0 && (
        <div className="ch-mencoes" role="listbox">
          {candidatos.map((x, i) => (
            <button key={x.id} type="button" className="ch-spot__item" data-ativo={i === mencaoSel ? "1" : undefined}
              role="option" aria-selected={i === mencaoSel}
              onMouseEnter={() => setMencaoSel(i)}
              onClick={() => aplicarMencao(x)}>
              <Avatar nome={x.name} src={x.avatar} size={26} />
              <div><div>{x.name}</div>{x.setor && <small>{x.setor}</small>}</div>
            </button>
          ))}
        </div>
      )}

      {p.editando && (
        <div className="ch-resp-alvo">
          <Icon name="edit" size={14} color="var(--primary-texto)" />
          <span>Editando mensagem</span>
          <button type="button" className="ch-icone" onClick={p.aoCancelarEdicao} aria-label="Cancelar edição">
            <Icon name="x" size={15} />
          </button>
        </div>
      )}
      {p.respondendo && !p.editando && (
        <div className="ch-resp-alvo">
          <Icon name="corner-up-left" size={14} color="var(--primary-texto)" />
          <span>
            <b style={{ fontWeight: 600 }}>{p.respondendo.autor_nome || "—"}</b>: {previa(p.respondendo)}
          </span>
          <button type="button" className="ch-icone" onClick={p.aoCancelarResposta} aria-label="Cancelar resposta">
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      <div className="ch-composer__caixa">
        {fila.length > 0 && (
          <div className="ch-fila">
            {fila.map((f) => (
              <div key={f.id} className="ch-fila__item">
                {f.previa
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={f.previa} alt="" />
                  : <Icon name="file" size={20} color="var(--primary-texto)" />}
                <span style={{ minWidth: 0 }}>
                  <span className="ch-fila__nome" style={{ display: "block" }}>{f.file.name}</span>
                  <span className="ch-anexo__meta">{f.anexo ? tamanhoLegivel(f.file.size) : `${Math.round(f.pct * 100)}%`}</span>
                </span>
                <button type="button" className="ch-icone" style={{ width: 26, height: 26 }}
                  onClick={() => removerDaFila(f.id)} aria-label={`Remover ${f.file.name}`}>
                  <Icon name="x" size={13} />
                </button>
                {!f.anexo && <span className="ch-fila__barra" style={{ width: `${f.pct * 100}%` }} />}
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={ref}
          rows={1}
          placeholder={p.emThread ? "Responder na thread…" : `Mensagem em ${p.canalNome}`}
          aria-label="Escrever mensagem"
          onInput={() => { setTemTexto(!!ref.current?.value.trim()); ajustar(); detectarMencao(); anotarRascunho(); p.aoDigitar(); }}
          onKeyDown={aoTeclar}
          onClick={detectarMencao}
          onPaste={(e) => {
            const arquivos = Array.from(e.clipboardData?.files ?? []);
            if (arquivos.length) { e.preventDefault(); void receber(arquivos); }
          }}
        />

        <div className="ch-composer__barra">
          <input ref={refArquivo} type="file" multiple hidden
            onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) void receber(f); e.target.value = ""; }} />
          <button type="button" className="ch-icone" title="Anexar arquivo" onClick={() => refArquivo.current?.click()}>
            <Icon name="paperclip" size={18} />
          </button>
          <button type="button" className="ch-icone" title="Emoji" aria-pressed={emojis}
            ref={refBotaoEmoji} onClick={() => setEmojis((v) => !v)}>
            <Icon name="mood-smile" size={18} />
          </button>
          <button type="button" className="ch-icone" title="Negrito (⌘B)" onClick={() => marcar("**")}>
            <Icon name="bold" size={17} />
          </button>
          <button type="button" className="ch-icone" title="Itálico (⌘I)" onClick={() => marcar("*")}>
            <Icon name="italic" size={17} />
          </button>
          <button type="button" className="ch-icone" title="Código (⌘E)" onClick={() => marcar("`", "`", true)}>
            <Icon name="code" size={17} />
          </button>

          <button type="button" className="ch-composer__enviar" onClick={enviar} disabled={!podeEnviar}
            aria-label={p.editando ? "Salvar edição" : "Enviar mensagem"}>
            <Icon name={p.editando ? "check" : "send"} size={17} color="#fff" />
          </button>
        </div>

        {emojis && (
          <div className="ch-emojis" ref={refEmojis} role="dialog" aria-label="Escolher emoji">
            <div className="ch-emojis__abas" role="tablist">
              {EMOJIS_CATEGORIAS.map((c, i) => (
                <button key={c.nome} type="button" role="tab" title={c.nome}
                  aria-selected={catEmoji === i} onClick={() => setCatEmoji(i)}>{c.icone}</button>
              ))}
              {/* Saída explícita. Sem ela, no celular o único jeito de fechar
                  era acertar de novo o botão que o painel cobre. */}
              <button type="button" className="ch-emojis__fechar" aria-label="Fechar emojis"
                onClick={() => setEmojis(false)}>
                <Icon name="x" size={16} color="var(--text-dim)" />
              </button>
            </div>
            <div className="ch-emojis__grade">
              {EMOJIS_CATEGORIAS[catEmoji].emojis.map((e, i) => (
                <button key={e + i} type="button" onClick={() => inserir(e)}>{e}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ch-composer__dica">
        <b style={{ fontWeight: 600 }}>Enter</b> envia · <b style={{ fontWeight: 600 }}>Shift+Enter</b> quebra linha
        {" · "}<b style={{ fontWeight: 600 }}>⌘B</b> negrito{" · "}<b style={{ fontWeight: 600 }}>⌘I</b> itálico
        {" · "}<b style={{ fontWeight: 600 }}>⌘E</b> código · @menção
      </div>
    </div>
  );
});
