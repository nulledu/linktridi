"use client";

// Orquestrador do módulo. Só coordena: quem está aberto, o que o painel mostra,
// qual menu está no ar. Dados vêm dos stores, aparência vem do CSS, regras vêm
// de lib/chat — aqui não há nem consulta nem estilo.

import { Tecla } from "@/app/(plataforma)/ui/exibicao";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./chat.css";

import { Icon } from "../../../Icon";
import { Avatar } from "./Avatar";
import { toast } from "../../../Toast";
// `useIsEstreito` (900px) e NÃO `useIsMobile` (700px): tem que ser o mesmo
// ponto de quebra do chat.css, senão entre 700 e 900px as três colunas
// empilham uma em cima da outra.
import { useIsEstreito } from "../../../ui/useMediaQuery";

import { Sidebar } from "./Sidebar";
import { CabecalhoCanal } from "./CabecalhoCanal";
import { ListaMensagens } from "./ListaMensagens";
import { Composer, type EnvioComposer } from "./Composer";
import { PainelContexto, type AbaPainel } from "./PainelContexto";
import { Spotlight } from "./Spotlight";
import { MenuContexto, ReagirRapido, type ItemMenu } from "./MenuContexto";
import { Visualizador } from "./Visualizador";
import { ModalSalvos } from "./ModalSalvos";
import { EMOJIS_REACAO } from "./emojis";
import {
  ModalConfirmar, ModalEdicoes, ModalEditarCanal, ModalEncaminhar, ModalMembros, ModalNovoCanal, ModalPessoas,
  type ModoNovo,
} from "./Modais";
import { LinhaMensagem, type AcoesMensagem } from "./LinhaMensagem";

import { api } from "../data/api";
import { canais as storeCanais } from "../data/storeCanais";
import { useAtalho, useCanais, useEu, useMensagens, usePessoas, usePresenca } from "../data/hooks";
import { usePrefLocal } from "./usePrefLocal";
import { registrarPaletaLocal } from "../../../ui/paletaLocal";
import { eGeral, podeApagar, podeEditar, podeNoCanal, podeSairOuExcluir, previa, sugerirContatos } from "@/lib/chat/regras";
import type { Anexo, Canal, Mensagem, Pessoa } from "@/lib/chat/tipos";

type Vista = "lateral" | "conversa" | "painel";
type Sobreposicao =
  | { t: "novo"; modo?: ModoNovo } | { t: "pessoas" } | { t: "editar-canal" } | { t: "membros" } | { t: "salvos" }
  | { t: "encaminhar"; mensagens: Mensagem[] }
  | { t: "edicoes"; mensagem: Mensagem }
  | { t: "confirmar"; titulo: string; texto: string; ok: string; perigo?: boolean; acao: () => void };

/** `cheia` = rota /mensagens, ocupando a tela toda em vez de caber na coluna da Central. */
export function Chat({ meuId, meuNome, cheia = false }: { meuId: string; meuNome: string; cheia?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const emCelular = useIsEstreito();

  const { canais, categorias, salvos, conexao } = useCanais();
  const pessoas = usePessoas();
  const eu = useEu();
  // Com quem ainda não falei, meu setor primeiro. Some sozinho conforme as
  // conversas vão sendo abertas.
  const sugestoes = useMemo(() => sugerirContatos(pessoas, canais, eu?.setor ?? null, 5), [pessoas, canais, eu]);
  const geral = useMemo(() => canais.find(eGeral) ?? null, [canais]);

  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("lateral");
  const [painel, setPainel] = useState<AbaPainel | null>(null);
  const [thread, setThread] = useState<Mensagem | null>(null);
  const [respondendo, setRespondendo] = useState<Mensagem | null>(null);
  const [editando, setEditando] = useState<Mensagem | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set());
  const [acoesAbertas, setAcoesAbertas] = useState<string | null>(null);
  const [destacada, setDestacada] = useState<string | null>(null);
  const [anexoAberto, setAnexoAberto] = useState<Anexo | null>(null);
  const [busca, setBusca] = useState<null | { noCanal: boolean }>(null);
  const [sobre, setSobre] = useState<Sobreposicao | null>(null);
  const [menu, setMenu] = useState<null | { x: number; y: number; itens: ItemMenu[] }>(null);
  const [reagirEm, setReagirEm] = useState<null | { id: string; x: number; y: number }>(null);
  // Onde a leitura parou. Calculado UMA vez por abertura de canal: depois que o
  // contador zera não dá mais para saber, e ele zera assim que a tela abre.
  const [marcaNova, setMarcaNova] = useState<string | null>(null);

  // ── Aproveitamento da tela ────────────────────────────────────────────────
  // A largura da lista é da PESSOA, não do designer: quem tem 40 canais de nome
  // comprido quer 340px, quem quer ler quer 210px. Fica no localStorage.
  const [larguraLateral, setLarguraLateral] = usePrefLocal<number>("gaius:chat:lateral", 300);
  const [redimensionando, setRedimensionando] = useState(false);
  // Num monitor largo, deixar a terceira coluna fechada é jogar espaço fora.
  // Ela abre sozinha na primeira vez; fechar é uma decisão que fica guardada.
  const [painelPadrao, setPainelPadrao] = usePrefLocal<boolean>("gaius:chat:painel-auto", true);

  const canal = useMemo(() => canais.find((c) => c.id === ativoId) ?? null, [canais, ativoId]);
  const { estado, store } = useMensagens(ativoId, meuId);
  const presencaEu = useMemo(() => ({ id: meuId, nome: meuNome }), [meuId, meuNome]);
  const { digitando, online, avisarQueEstouDigitando } = usePresenca(ativoId, presencaEu);

  // ── Canal ativo ↔ URL ─────────────────────────────────────────────────────
  // Assim dá para mandar o link de uma conversa e a notificação abrir no lugar certo.
  useEffect(() => {
    const daUrl = params.get("c");
    if (daUrl && daUrl !== ativoId) { setAtivoId(daUrl); setVista("conversa"); }
    else if (!daUrl && !ativoId && !emCelular && canais.length) { setAtivoId(canais[0].id); }
  }, [params, canais, ativoId, emCelular]);

  useEffect(() => {
    storeCanais.focar(ativoId);
    return () => storeCanais.focar(null);
  }, [ativoId]);

  // Painel aberto por padrão onde há espaço de sobra (≥1280px). Abaixo disso a
  // conversa é quem precisa da largura, então ele continua fechado.
  useEffect(() => {
    if (!ativoId || painel || !painelPadrao || emCelular) return;
    if (window.innerWidth < 1280) return;
    setPainel("info");
  }, [ativoId, painel, painelPadrao, emCelular]);

  // A marca é a N-ésima mensagem a partir do fim, com N = não lidas no momento
  // da abertura. Sai de graça: nenhuma consulta nova, só o contador que a
  // sidebar já tinha.
  const canalDaMarca = useRef<string | null>(null);
  useEffect(() => {
    if (!ativoId || !estado.mensagens.length) return;
    if (canalDaMarca.current === ativoId) return;
    canalDaMarca.current = ativoId;
    const n = canais.find((c) => c.id === ativoId)?.nao_lidas ?? 0;
    const alvo = n > 0 ? estado.mensagens[Math.max(0, estado.mensagens.length - n)] : null;
    setMarcaNova(alvo && alvo.autor_id !== meuId ? alvo.id : null);
  }, [ativoId, estado.mensagens, canais, meuId]);

  // Leva a pessoa direto para onde parou, em vez de despejá-la no fim de 200
  // mensagens que ela não viu.
  useEffect(() => {
    if (!marcaNova) return;
    const t = setTimeout(() => {
      document.querySelector<HTMLElement>("[data-marca-nova]")
        ?.scrollIntoView({ block: "center", behavior: "auto" });
    }, 60);
    return () => clearTimeout(t);
  }, [marcaNova]);

  // Marcar lido é ESCRITA: só quando de fato há algo novo e a pessoa está vendo.
  const ultimaVista = useRef<string | null>(null);
  useEffect(() => {
    if (!ativoId || !estado.mensagens.length) return;
    const ultima = estado.mensagens[estado.mensagens.length - 1];
    if (ultima.id === ultimaVista.current || ultima.id.startsWith("tmp:")) return;
    ultimaVista.current = ultima.id;
    storeCanais.zerar(ativoId);
    void api.marcarLido(ativoId, ultima.id).catch(() => {});
  }, [ativoId, estado.mensagens]);

  // Arrastar a divisa. `setPointerCapture` mantém o gesto mesmo se o ponteiro
  // sair da faixa de 7px — sem isso o arraste "escapa" ao primeiro movimento
  // rápido e a largura trava no meio.
  const iniciarArraste = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const alvo = e.currentTarget as HTMLElement;
    const inicioX = e.clientX;
    const inicioW = larguraLateral;
    alvo.setPointerCapture(e.pointerId);
    setRedimensionando(true);
    // Um quadro por vez e SEM persistir: o pointermove dispara muito mais
    // rápido que 60fps e cada chamada re-renderizava o chat inteiro e gravava
    // localStorage síncrono. O valor final grava uma vez, no soltar.
    let quadro = 0;
    let ultimoX = inicioX;
    const mover = (ev: PointerEvent) => {
      ultimoX = ev.clientX;
      if (quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        const bruto = inicioW + (ultimoX - inicioX);
        setLarguraLateral(() => Math.max(200, Math.min(420, Math.round(bruto))), false);
      });
    };
    const soltar = () => {
      if (quadro) cancelAnimationFrame(quadro);
      setLarguraLateral((v) => v); // persiste o valor onde parou
      setRedimensionando(false);
      alvo.removeEventListener("pointermove", mover);
      alvo.removeEventListener("pointerup", soltar);
      alvo.removeEventListener("pointercancel", soltar);
    };
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerup", soltar);
    alvo.addEventListener("pointercancel", soltar);
  }, [larguraLateral, setLarguraLateral]);

  const abrirCanal = useCallback((id: string, msgId?: string) => {
    setAtivoId(id);
    setVista("conversa");
    setThread(null);
    setRespondendo(null);
    setEditando(null);
    setSelecionadas(new Set());
    setMarcaNova(null);
    canalDaMarca.current = null;
    ultimaVista.current = null;
    router.replace(`/mensagens?c=${id}`, { scroll: false });
    if (msgId) setTimeout(() => irPara(msgId), 320);
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  const irPara = useCallback((msgId: string) => {
    const el = document.querySelector<HTMLElement>(`.ch-msg[data-id="${CSS.escape(msgId)}"]`);
    if (!el) return toast.info("Essa mensagem está mais acima — role para carregá-la.");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setDestacada(msgId);
    setTimeout(() => setDestacada((d) => (d === msgId ? null : d)), 1600);
  }, []);

  // ── Ações da mensagem ─────────────────────────────────────────────────────
  const itensDaMensagem = useCallback((m: Mensagem): ItemMenu[] => {
    if (!canal || !store) return [];
    const meu = m.autor_id === meuId;
    const itens: ItemMenu[] = [
      { chave: "resp", label: "Responder", icone: "corner-up-left", aoEscolher: () => setRespondendo(m) },
      { chave: "thread", label: "Responder na thread", icone: "message", aoEscolher: () => abrirThread(m) },
      { chave: "copiar", label: "Copiar texto", icone: "copy", atalho: "⌘C", aoEscolher: () => copiar(m) },
      { chave: "link", label: "Copiar link", icone: "link", aoEscolher: () => copiarLink(m) },
      {
        chave: "salvar", label: "Salvar para depois", icone: "bookmark", separadorAntes: true,
        aoEscolher: () => { void api.salvar(m.id, true).then(() => toast.ok("Salvo.")).catch(() => {}); void storeCanais.carregar(); },
      },
      { chave: "encaminhar", label: "Encaminhar", icone: "arrow-forward-up", aoEscolher: () => setSobre({ t: "encaminhar", mensagens: [m] }) },
      { chave: "selecionar", label: "Selecionar", icone: "checklist", aoEscolher: () => alternarSelecao(m.id) },
    ];
    if (podeNoCanal(canal, "fixar")) {
      itens.push({
        chave: "fixar", label: m.fixada ? "Desafixar" : "Fixar no canal", icone: "pin", separadorAntes: true,
        aoEscolher: () => void store.fixar(m.id, !m.fixada),
      });
    }
    if (m.editada_em) {
      itens.push({ chave: "hist", label: "Ver edições", icone: "history", aoEscolher: () => setSobre({ t: "edicoes", mensagem: m }) });
    }
    if (podeEditar(m, meuId)) {
      itens.push({ chave: "editar", label: "Editar", icone: "edit", separadorAntes: !m.editada_em, aoEscolher: () => setEditando(m) });
    }
    if (podeApagar(m, meuId, canal)) {
      itens.push({
        chave: "apagar", label: meu ? "Apagar" : "Apagar (moderação)", icone: "trash", perigo: true,
        aoEscolher: () => setSobre({
          t: "confirmar", titulo: "Apagar mensagem?", ok: "Apagar", perigo: true,
          texto: "A mensagem some para todo mundo. As respostas na thread continuam onde estão.",
          acao: () => void store.excluir(m.id),
        }),
      });
    }
    return itens;
  }, [canal, store, meuId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Botão direito: mesma lista, na posição do ponteiro. O "⋯" ancorado usa
  // `itensDaMensagem` direto (MenuMais, na bolha).
  const menuDaMensagem = useCallback((m: Mensagem, x: number, y: number) => {
    const itens = itensDaMensagem(m);
    if (itens.length) setMenu({ x, y, itens });
  }, [itensDaMensagem]);

  const abrirThread = useCallback((m: Mensagem) => {
    // A thread é sempre a raiz: responder a uma resposta continua na mesma.
    const raiz = m.thread_id ? estado.mensagens.find((x) => x.id === m.thread_id) ?? m : m;
    setThread(raiz);
    setPainel("thread");
    if (emCelular) setVista("painel");
  }, [estado.mensagens, emCelular]);

  const copiar = useCallback(async (m: Mensagem) => {
    try { await navigator.clipboard.writeText(m.texto ?? previa(m)); toast.ok("Copiado."); }
    catch { toast.erro("Não deu para copiar."); }
  }, []);

  const copiarLink = useCallback(async (m: Mensagem) => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/mensagens?c=${m.conversa_id}&m=${m.id}`);
      toast.ok("Link copiado.");
    } catch { toast.erro("Não deu para copiar."); }
  }, []);

  // ── Ações em lote ─────────────────────────────────────────────────────────
  const selecionadasLista = useMemo(
    () => estado.mensagens.filter((m) => selecionadas.has(m.id)),
    [estado.mensagens, selecionadas],
  );

  const podeApagarTodas = useMemo(
    () => !!canal && selecionadasLista.length > 0 && selecionadasLista.every((m) => podeApagar(m, meuId, canal)),
    [selecionadasLista, canal, meuId],
  );

  const apagarEmLote = useCallback(async () => {
    if (!store) return;
    const alvos = selecionadasLista.map((m) => m.id);
    setSelecionadas(new Set());
    // Em série e não em paralelo: dez DELETE simultâneos é rajada à toa num
    // banco compartilhado, e a diferença de tempo aqui é imperceptível.
    for (const id of alvos) await store.excluir(id);
    toast.ok(`${alvos.length} ${alvos.length > 1 ? "apagadas" : "apagada"}.`);
  }, [store, selecionadasLista]);

  const salvarEmLote = useCallback(async () => {
    const alvos = selecionadasLista.map((m) => m.id);
    setSelecionadas(new Set());
    for (const id of alvos) await api.salvar(id, true).catch(() => {});
    void storeCanais.carregar();
    toast.ok(`${alvos.length} ${alvos.length > 1 ? "salvas" : "salva"} para depois.`);
  }, [selecionadasLista]);

  /** Pula para o próximo canal com mensagem nova, começando depois do atual. */
  const proximaNaoLida = useCallback(() => {
    const pendentes = canais.filter((c) => c.nao_lidas > 0 && !c.arquivado);
    if (!pendentes.length) return;
    const i = pendentes.findIndex((c) => c.id === ativoId);
    // Menções primeiro: se alguém te chamou, é ali que você quer cair.
    const comMencao = pendentes.find((c) => c.mencoes > 0 && c.id !== ativoId);
    const alvo = comMencao ?? pendentes[(i + 1) % pendentes.length];
    if (alvo) abrirCanal(alvo.id);
  }, [canais, ativoId, abrirCanal]);

  const alternarSelecao = useCallback((id: string) => {
    setSelecionadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  // Objeto estável: se ele mudasse a cada render, o `memo` das bolhas não valeria nada.
  const acoes = useMemo<AcoesMensagem>(() => ({
    responder: setRespondendo,
    abrirThread,
    reagir: (id, emoji) => void store?.reagir(id, emoji),
    abrirReacoes: (id, alvo) => setReagirEm({ id, x: alvo.left + alvo.width / 2, y: alvo.bottom }),
    menu: menuDaMensagem,
    itensMenu: itensDaMensagem,
    abrirAnexo: setAnexoAberto,
    irPara,
    alternarAcoes: (id) => setAcoesAbertas((a) => (a === id ? null : id)),
    editar: setEditando,
    selecionar: alternarSelecao,
  }), [abrirThread, store, menuDaMensagem, itensDaMensagem, irPara, alternarSelecao]);

  // ── Envio ─────────────────────────────────────────────────────────────────
  const enviar = useCallback(async (e: EnvioComposer, emThread?: Mensagem | null) => {
    if (!store) return;
    if (editando) {
      await store.editar(editando.id, e.texto);
      setEditando(null);
      return;
    }
    await store.enviar({
      texto: e.texto, anexos: e.anexos, meuNome,
      responde_a: emThread ? null : respondendo?.id ?? null,
      thread_id: emThread?.id ?? null,
    });
    setRespondendo(null);
  }, [store, editando, respondendo, meuNome]);

  const subir = useCallback((f: File, progresso: (p: number) => void) => api.subir(f, progresso), []);

  // ── Canal: favoritar, silenciar, arquivar, sair ───────────────────────────
  const favoritar = useCallback((c: Canal) => {
    storeCanais.aplicar(c.id, { favorita: !c.favorita });
    void api.atualizarCanal({ id: c.id, favorita: !c.favorita }).catch(() => storeCanais.aplicar(c.id, { favorita: c.favorita }));
  }, []);

  const itensDoCanal = useCallback((c: Canal): ItemMenu[] => {
    const silenciado = !!c.mudo_ate && new Date(c.mudo_ate) > new Date();
    const itens: ItemMenu[] = [
      { chave: "abrir", label: "Abrir", icone: "message", aoEscolher: () => abrirCanal(c.id) },
      { chave: "fav", label: c.favorita ? "Remover dos favoritos" : "Favoritar", icone: "star", aoEscolher: () => favoritar(c) },
      // A 320px estes dois botões saem do cabeçalho — precisam continuar
      // alcançáveis aqui, senão membros e painel somem do celular.
      { chave: "membros", label: "Membros", icone: "users",
        aoEscolher: () => { setAtivoId(c.id); setPainel("membros"); if (emCelular) setVista("painel"); } },
      { chave: "painel", label: "Painel do canal", icone: "layout-columns",
        aoEscolher: () => { setAtivoId(c.id); setPainel("info"); if (emCelular) setVista("painel"); } },
      {
        chave: "mudo", label: silenciado ? "Reativar notificações" : "Silenciar por 8 horas", icone: "bell-off",
        separadorAntes: true,
        aoEscolher: () => {
          const ate = silenciado ? null : new Date(Date.now() + 8 * 3600_000).toISOString();
          storeCanais.aplicar(c.id, { mudo_ate: ate });
          void api.atualizarCanal({ id: c.id, mudo_ate: ate }).catch(() => {});
        },
      },
      {
        chave: "so-mencoes", label: c.notificar === "mencoes" ? "Notificar tudo" : "Notificar só menções", icone: "at",
        aoEscolher: () => {
          const modo = c.notificar === "mencoes" ? "todas" as const : "mencoes" as const;
          storeCanais.aplicar(c.id, { notificar: modo });
          void api.atualizarCanal({ id: c.id, notificar: modo }).catch(() => {});
        },
      },
    ];
    if (podeNoCanal({ ...c, arquivado: false }, "editar_canal")) {
      itens.push({ chave: "editar", label: "Editar canal", icone: "settings", separadorAntes: true,
        aoEscolher: () => { setAtivoId(c.id); setSobre({ t: "editar-canal" }); } });
    }
    if (podeSairOuExcluir(c) && podeNoCanal({ ...c, arquivado: false }, "arquivar")) {
      itens.push({
        chave: "arquivar", label: c.arquivado ? "Desarquivar" : "Arquivar", icone: "archive",
        aoEscolher: () => {
          storeCanais.aplicar(c.id, { arquivado: !c.arquivado });
          void api.atualizarCanal({ id: c.id, arquivado: !c.arquivado }).catch(() => {});
        },
      });
    }
    if (podeSairOuExcluir(c)) itens.push({
      chave: "sair", label: podeNoCanal({ ...c, arquivado: false }, "excluir_canal") ? "Excluir canal" : "Sair do canal",
      icone: "logout", perigo: true, separadorAntes: true,
      aoEscolher: () => setSobre({
        t: "confirmar",
        titulo: podeNoCanal({ ...c, arquivado: false }, "excluir_canal") ? "Excluir canal?" : "Sair do canal?",
        texto: podeNoCanal({ ...c, arquivado: false }, "excluir_canal")
          ? "O canal e todo o histórico somem para todo mundo. Não dá para desfazer."
          : "Você deixa de ver as mensagens deste canal. Dá para voltar se ele for aberto.",
        ok: "Confirmar", perigo: true,
        acao: () => {
          storeCanais.remover(c.id);
          if (ativoId === c.id) { setAtivoId(null); setVista("lateral"); }
          void api.excluirCanal(c.id).catch(() => void storeCanais.carregar());
        },
      }),
    });
    return itens;
  }, [abrirCanal, favoritar, ativoId, emCelular]);

  /** Botão direito / "⋯" da lista de canais: menu na posição dada. */
  const menuDoCanal = useCallback((c: Canal, x: number, y: number) => {
    setMenu({ x, y, itens: itensDoCanal(c) });
  }, [itensDoCanal]);

  // ── Atalhos ───────────────────────────────────────────────────────────────
  // Enquanto o chat está montado, ELE responde ao ⌘K — a busca daqui acha
  // mensagem e arquivo, coisa que a paleta global do app não sabe fazer. Sem
  // este registro as duas escutavam o mesmo atalho e abriam empilhadas.
  useEffect(() => registrarPaletaLocal(), []);
  useAtalho("mod+k", () => setBusca({ noCanal: false }));
  useAtalho("mod+f", () => canal && setBusca({ noCanal: true }), !!canal);
  useAtalho("esc", () => {
    if (menu) return setMenu(null);
    if (busca) return setBusca(null);
    if (anexoAberto) return setAnexoAberto(null);
    if (selecionadas.size) return setSelecionadas(new Set());
    if (thread) return setThread(null);
    if (painel) return setPainel(null);
  });

  const falarCom = useCallback(async (p: Pessoa) => {
    try {
      const r = await api.criarCanal({ tipo: "direta", membros: [p.id] });
      await storeCanais.carregar();
      abrirCanal(r.canal_id);
    } catch { toast.erro("Não deu para abrir a conversa."); }
  }, [abrirCanal]);

  // ── Thread ────────────────────────────────────────────────────────────────
  const renderThread = useCallback(() => (
    <PainelThread
      raiz={thread!} canal={canal!} meuId={meuId} meuNome={meuNome}
      autores={estado.autores} acoes={acoes} toque={emCelular} pessoas={pessoas}
      aoEnviar={(e) => enviar(e, thread)} aoSubir={subir}
    />
  ), [thread, canal, meuId, meuNome, estado.autores, acoes, emCelular, pessoas, enviar, subir]);

  // ── Render ────────────────────────────────────────────────────────────────
  const motivoBloqueio = !canal ? "Selecione uma conversa"
    : canal.arquivado ? "Canal arquivado — só leitura."
    : !podeNoCanal(canal, "escrever") ? "Canal somente leitura."
    : null;

  return (
    <div
      className={"ch" + (cheia ? " ch--cheia" : "")}
      data-painel={painel && !emCelular ? "1" : undefined}
      data-vista={emCelular ? vista : undefined}
      data-redimensionando={redimensionando ? "1" : undefined}
      style={{ ["--ch-sidebar" as string]: `${larguraLateral}px` }}
    >
      <Sidebar
        canais={canais} categorias={categorias} ativo={ativoId} salvos={salvos} conexao={conexao} online={online}
        aoAbrir={abrirCanal} aoFavoritar={favoritar} aoNovo={() => setSobre({ t: "novo" })}
        sugestoes={sugestoes} aoFalarCom={falarCom} aoVerPessoas={() => setSobre({ t: "pessoas" })}
        aoBuscar={() => setBusca({ noCanal: false })}
        aoAbrirSalvos={() => setSobre({ t: "salvos" })}
        aoProximaNaoLida={proximaNaoLida}
        aoMenu={menuDoCanal}
        aoRedimensionar={iniciarArraste}
        redimensionando={redimensionando}
      />

      <main className="ch-conversa">
        {!canal ? (
          <div className="ch-vazio" style={{ flex: 1 }}>
            <span className="ch-vazio__icone"><Icon name="message" size={26} color="var(--text-dim)" /></span>
            <h3>Escolha uma conversa</h3>
            <p>Ou aperte <Tecla sempre mods={["command"]}>K</Tecla> para achar uma pessoa, um canal ou uma mensagem antiga.</p>
            <div className="ch-inicio">
              {geral && (
                <button type="button" className="ch-inicio__cartao" onClick={() => abrirCanal(geral.id)}>
                  <span className="ch-inicio__icone"><Icon name="speakerphone" size={18} color="var(--primary-texto)" /></span>
                  <span className="ch-inicio__texto">
                    <b>{geral.nome}</b>
                    <small>Todo mundo da empresa{geral.nao_lidas ? ` · ${geral.nao_lidas} novas` : ""}</small>
                  </span>
                </button>
              )}
              <button type="button" className="ch-inicio__cartao" onClick={() => setSobre({ t: "novo", modo: "grupo" })}>
                <span className="ch-inicio__icone"><Icon name="users-plus" size={18} color="var(--primary-texto)" /></span>
                <span className="ch-inicio__texto">
                  <b>Criar um grupo</b>
                  <small>Várias pessoas, sem precisar de canal</small>
                </span>
              </button>
              {sugestoes.slice(0, 4).map((s) => (
                <button key={s.id} type="button" className="ch-inicio__cartao" onClick={() => void falarCom(s)}>
                  <Avatar nome={s.name} src={s.avatar} size={34} />
                  <span className="ch-inicio__texto">
                    <b>{s.name}</b>
                    <small>{s.setor || "Começar conversa"}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <CabecalhoCanal
              canal={canal} painelAberto={!!painel} emCelular={emCelular}
              online={canal.parceiro_id ? online.has(canal.parceiro_id) : false}
              aoVoltar={() => { setVista("lateral"); setAtivoId(null); router.replace("/mensagens", { scroll: false }); }}
              aoAlternarPainel={() => {
                setPainelPadrao(() => !painel);        // fechou → não reabre sozinho
                setPainel((p) => (p ? null : "info"));
                if (emCelular) setVista(painel ? "conversa" : "painel");
              }}
              aoBuscarNoCanal={() => setBusca({ noCanal: true })}
              aoAbrirInfo={() => { setPainel("info"); if (emCelular) setVista("painel"); }}
              aoAbrirMembros={() => { setPainel("membros"); if (emCelular) setVista("painel"); }}
              itensMenu={() => itensDoCanal(canal)}
            />

            {conexao === "off" && (
              <div className="ch-aviso">
                <Icon name="wifi-off" size={14} /> Sem tempo real — atualizando a cada poucos segundos.
              </div>
            )}

            {selecionadas.size > 0 && (
              <div className="ch-selecao">
                {selecionadas.size} selecionada{selecionadas.size > 1 ? "s" : ""}
                <div className="ch-selecao__acoes">
                  <button type="button" className="ch-icone" title="Encaminhar"
                    onClick={() => setSobre({ t: "encaminhar", mensagens: estado.mensagens.filter((m) => selecionadas.has(m.id)) })}>
                    <Icon name="arrow-forward-up" size={17} />
                  </button>
                  <button type="button" className="ch-icone" title="Copiar"
                    onClick={() => void navigator.clipboard.writeText(
                      estado.mensagens.filter((m) => selecionadas.has(m.id))
                        .map((m) => `${m.autor_nome}: ${previa(m)}`).join("\n"))
                      .then(() => toast.ok("Copiado."))}>
                    <Icon name="copy" size={17} />
                  </button>
                  <button type="button" className="ch-icone" title="Salvar para depois"
                    onClick={() => void salvarEmLote()}>
                    <Icon name="bookmark" size={17} />
                  </button>
                  {/* Só aparece quando TODAS as selecionadas são apagáveis —
                      um botão que apaga metade e falha na outra é pior que
                      botão nenhum. */}
                  {podeApagarTodas && (
                    <button type="button" className="ch-icone" title="Apagar"
                      onClick={() => setSobre({
                        t: "confirmar", perigo: true, ok: "Apagar",
                        titulo: `Apagar ${selecionadas.size} ${selecionadas.size > 1 ? "mensagens" : "mensagem"}?`,
                        texto: "Elas somem para todo mundo. As respostas em thread continuam onde estão.",
                        acao: () => void apagarEmLote(),
                      })}>
                      <Icon name="trash" size={17} color="var(--perigo)" />
                    </button>
                  )}
                  <button type="button" className="ch-icone" title="Limpar seleção" onClick={() => setSelecionadas(new Set())}>
                    <Icon name="x" size={17} />
                  </button>
                </div>
              </div>
            )}

            {/* `key` por canal: sem ela a lista era a mesma instância em todas as
                conversas e o "primeira pintura → vai pro fim" só valia para a
                primeira conversa da sessão. */}
            <ListaMensagens
              key={canal.id}
              mensagens={estado.mensagens} reacoes={estado.reacoes} autores={estado.autores}
              meuId={meuId} meuNome={meuNome}
              carregando={estado.carregando} carregandoAntigas={estado.carregandoAntigas} temMais={estado.temMais}
              erro={estado.erro} marcaNova={marcaNova} aoTentarDeNovo={() => void store?.recarregar()}
              toque={emCelular} selecionadas={selecionadas} modoSelecao={selecionadas.size > 0}
              acoesAbertas={acoesAbertas} destacada={destacada} acoes={acoes}
              aoPedirAntigas={() => void store?.carregarAntigas()}
            />

            {digitando.length > 0 && (
              <div className="ch-digitando" aria-live="polite">
                <i /><i /><i />
                {digitando.length === 1
                  ? `${digitando[0].nome.split(" ")[0]} está digitando`
                  : `${digitando.length} pessoas estão digitando`}
              </div>
            )}

            <Composer
              canalNome={canal.nome} desabilitado={motivoBloqueio} rascunhoChave={canal.id}
              respondendo={respondendo} editando={editando} pessoas={pessoas}
              aoEnviar={(e) => void enviar(e)}
              aoCancelarResposta={() => setRespondendo(null)}
              aoCancelarEdicao={() => setEditando(null)}
              aoDigitar={avisarQueEstouDigitando}
              aoSubir={subir}
            />
          </>
        )}
      </main>

      {canal && painel && (
        <PainelContexto
          canal={canal} aba={painel} meuId={meuId} meuNome={meuNome} thread={thread} emCelular={emCelular}
          aoTrocarAba={(a) => { setPainel(a); if (a !== "thread") setThread(null); }}
          aoFechar={() => { setPainelPadrao(() => false); setPainel(null); setThread(null); if (emCelular) setVista("conversa"); }}
          aoAbrirAnexo={setAnexoAberto}
          aoIrPara={(id) => { if (emCelular) setVista("conversa"); irPara(id); }}
          aoEditarCanal={() => setSobre({ t: "editar-canal" })}
          aoAdicionarMembros={() => setSobre({ t: "membros" })}
          renderThread={renderThread}
        />
      )}

      {/* ── Camadas ─────────────────────────────────────────────────────── */}
      {busca && (
        <Spotlight
          canal={busca.noCanal ? canal : null} canaisConhecidos={canais}
          aoFechar={() => setBusca(null)} aoAbrirCanal={abrirCanal} aoFalarCom={falarCom}
        />
      )}
      {menu && <MenuContexto x={menu.x} y={menu.y} itens={menu.itens} aoFechar={() => setMenu(null)} />}
      {reagirEm && (
        <ReagirRapido x={reagirEm.x} y={reagirEm.y} emojis={EMOJIS_REACAO}
          aoEscolher={(e) => store?.reagir(reagirEm.id, e)} aoFechar={() => setReagirEm(null)} />
      )}
      {anexoAberto && <Visualizador anexo={anexoAberto} aoFechar={() => setAnexoAberto(null)} />}

      {sobre?.t === "novo" && (
        <ModalNovoCanal pessoas={pessoas} categorias={categorias} meuId={meuId} modoInicial={sobre.modo}
          aoFechar={() => setSobre(null)}
          aoCriado={(id) => { setSobre(null); void storeCanais.carregar().then(() => abrirCanal(id)); }} />
      )}
      {sobre?.t === "pessoas" && (
        <ModalPessoas pessoas={pessoas} canais={canais}
          aoFechar={() => setSobre(null)}
          aoFalarCom={(p) => { setSobre(null); void falarCom(p); }} />
      )}
      {sobre?.t === "editar-canal" && canal && (
        <ModalEditarCanal canal={canal} categorias={categorias}
          aoFechar={() => setSobre(null)}
          aoSalvo={() => { setSobre(null); void storeCanais.carregar(); toast.ok("Canal atualizado."); }} />
      )}
      {sobre?.t === "membros" && canal && (
        <ModalMembros canal={canal} pessoas={pessoas}
          aoFechar={() => setSobre(null)}
          aoSalvo={() => { setSobre(null); void storeCanais.carregar(); toast.ok("Pessoas adicionadas."); }} />
      )}
      {sobre?.t === "encaminhar" && (
        <ModalEncaminhar mensagens={sobre.mensagens} canais={canais}
          aoFechar={() => setSobre(null)}
          aoEnviado={(n) => { setSobre(null); setSelecionadas(new Set()); toast.ok(`Encaminhado (${n}).`); }} />
      )}
      {sobre?.t === "salvos" && (
        <ModalSalvos meuNome={meuNome} aoFechar={() => setSobre(null)}
          aoIrPara={(canalId, msgId) => abrirCanal(canalId, msgId)} />
      )}
      {sobre?.t === "edicoes" && <ModalEdicoes mensagem={sobre.mensagem} aoFechar={() => setSobre(null)} />}
      {sobre?.t === "confirmar" && (
        <ModalConfirmar titulo={sobre.titulo} texto={sobre.texto} rotuloOk={sobre.ok} perigo={sobre.perigo}
          aoFechar={() => setSobre(null)} aoConfirmar={sobre.acao} />
      )}
    </div>
  );
}

// ── Thread ──────────────────────────────────────────────────────────────────
// Vive no painel direito, como no Slack: responder na thread não empurra a
// conversa principal para fora do lugar.

function PainelThread({
  raiz, canal, meuId, meuNome, autores, acoes, toque, pessoas, aoEnviar, aoSubir,
}: {
  raiz: Mensagem; canal: Canal; meuId: string; meuNome: string;
  autores: Record<string, { nome: string; avatar: string | null }>;
  acoes: AcoesMensagem; toque: boolean; pessoas: Pessoa[];
  aoEnviar: (e: EnvioComposer) => void;
  aoSubir: (f: File, p: (n: number) => void) => Promise<Anexo>;
}) {
  const [respostas, setRespostas] = useState<Mensagem[] | null>(null);

  const carregar = useCallback(() => {
    api.mensagens({ canal: canal.id, thread: raiz.id })
      .then((p) => setRespostas(p.mensagens))
      .catch(() => setRespostas([]));
  }, [canal.id, raiz.id]);

  useEffect(carregar, [carregar]);

  const SEM_REACAO = useMemo(() => [], []);
  const VAZIO = useMemo(() => new Set<string>(), []);

  return (
    <>
      <div className="ch-lista" style={{ paddingTop: 4 }}>
        <LinhaMensagem
          m={raiz} agrupada={false} meuId={meuId} meuNome={meuNome}
          avatar={autores[raiz.autor_id]?.avatar ?? null} reacoes={SEM_REACAO}
          respondida={null} cita={false} selecionada={false} destacada={false}
          acoesAbertas={false} modoSelecao={false} toque={toque} acoes={acoes}
        />
        <div className="ch-dia">
          <span>{respostas === null ? "carregando…" : `${respostas.length} ${respostas.length === 1 ? "resposta" : "respostas"}`}</span>
        </div>
        {respostas?.map((m, i) => (
          <LinhaMensagem
            key={m.id} m={m}
            agrupada={i > 0 && respostas[i - 1].autor_id === m.autor_id}
            meuId={meuId} meuNome={meuNome}
            avatar={autores[m.autor_id]?.avatar ?? null} reacoes={SEM_REACAO}
            respondida={null} cita={false} selecionada={VAZIO.has(m.id)} destacada={false}
            acoesAbertas={false} modoSelecao={false} toque={toque} acoes={acoes}
          />
        ))}
      </div>

      <Composer
        canalNome={canal.nome} emThread respondendo={null} editando={null} pessoas={pessoas}
        rascunhoChave={`thread:${raiz.id}`}
        aoEnviar={(e) => { aoEnviar(e); setTimeout(carregar, 500); }}
        aoCancelarResposta={() => {}} aoCancelarEdicao={() => {}} aoDigitar={() => {}}
        aoSubir={aoSubir}
      />
    </>
  );
}
