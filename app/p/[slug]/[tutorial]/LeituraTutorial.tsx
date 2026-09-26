"use client";

// Estado da leitura de UM tutorial: o que a pessoa já fez, onde ela está e se
// pediu a tela acesa.
//
// Quem lê está com o carimbo numa mão e o celular na outra. Daí nascem três
// coisas que moram aqui, num lugar só, porque várias peças da página precisam
// delas ao mesmo tempo (o botão de cada passo, o sumário, a barra do topo, o
// modo passo a passo e a mensagem do WhatsApp):
//  • "Feito" por passo, guardado NO APARELHO — quem volta amanhã pra repetir
//    a tinta encontra onde parou, sem conta nem login.
//  • O passo atual, medido pela rolagem.
//  • A tela acesa (Wake Lock): o celular apagava no meio do passo 3, com a
//    mão suja de tinta e sem dedo limpo pra destravar.
//
// Os blocos continuam desenhados no SERVIDOR. Este provedor recebe só a lista
// leve dos passos (id, número, título) — nunca o tutorial inteiro.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { alternarFeito, lerFeitos, passoInicialDoModo, type PassoRef } from "@/lib/tridiflow-tutoriais-leitura";
import { rolarAte } from "../rolagem";

export type DestinoAoFechar = "passo" | "fim";

export interface Leitura {
  passos: PassoRef[];
  total: number;
  /** Ids dos passos feitos, na ordem do guia. */
  feitos: string[];
  /** A pessoa mexeu nos feitos NESTA visita. Só então a região viva fala:
   *  anunciar "2 de 5 passos feitos" ao abrir a página seria ruído. */
  interagiu: boolean;
  ehFeito: (n: number) => boolean;
  /** Marca ou desmarca; devolve `true` quando o passo ficou feito. */
  alternar: (n: number) => boolean;
  recomecar: () => void;
  atual: number | null;
  suportaTela: boolean;
  telaAcesa: boolean;
  ligarTela: () => void;
  desligarTela: () => void;
  /** Passo aberto no modo "um passo por vez", ou `null` com o modo fechado. */
  modo: number | null;
  abrirModo: (origem?: HTMLElement | null) => void;
  irNoModo: (n: number) => void;
  fecharModo: (destino?: DestinoAoFechar) => void;
  /** De onde a camada do modo copia as cores da central (ela mora no <body>). */
  escopo: () => Element | null;
}

const nada = () => {};
const SEM_LEITURA: Leitura = {
  passos: [], total: 0, feitos: [], interagiu: false, ehFeito: () => false, alternar: () => false, recomecar: nada,
  atual: null, suportaTela: false, telaAcesa: false, ligarTela: nada, desligarTela: nada,
  modo: null, abrirModo: nada, irNoModo: nada, fecharModo: nada, escopo: () => null,
};
const Contexto = createContext<Leitura>(SEM_LEITURA);
export const useLeitura = (): Leitura => useContext(Contexto);

/** Soltar a trava nunca pode estourar: ela pode já ter sido solta pelo sistema. */
function soltar(s: WakeLockSentinel | null) {
  if (!s) return;
  try { void Promise.resolve(s.release()).catch(nada); } catch { /* já solta */ }
}

/** Foco num bloco da página sem rolar — quem rola é o `rolarAte`, suave e
 *  respeitando o movimento reduzido. O "resolveu?" e os relacionados não são
 *  focáveis: sem `tabindex` o `focus()` não faz nada, o foco cai no <body> e o
 *  próximo Tab recomeça do topo. O `-1` é emprestado e sai no primeiro `blur`,
 *  pro bloco voltar a ser exatamente o que o componente dele desenhou. */
function focarBloco(el: HTMLElement) {
  if (!el.hasAttribute("tabindex")) {
    el.setAttribute("tabindex", "-1");
    el.addEventListener("blur", () => el.removeAttribute("tabindex"), { once: true });
  }
  el.focus({ preventScroll: true });
}

export function LeituraTutorial({ chave, passos, children }: { chave: string; passos: PassoRef[]; children: ReactNode }) {
  const total = passos.length;
  const idsJson = JSON.stringify(passos.map((p) => p.id));
  const ids = useMemo(() => JSON.parse(idsJson) as string[], [idsJson]);

  // ── Feitos ────────────────────────────────────────────────────────────────
  const [feitos, setFeitos] = useState<string[]>([]);
  const feitosRef = useRef<string[]>([]);
  const [interagiu, setInteragiu] = useState(false);

  // Lê no efeito, nunca no primeiro render: o servidor não tem localStorage,
  // e ler durante a renderização faria a hidratação divergir.
  useEffect(() => {
    let salvo: string | null = null;
    try { salvo = localStorage.getItem(chave); } catch { /* janela anônima com armazenamento bloqueado */ }
    const lista = lerFeitos(salvo, ids);
    feitosRef.current = lista;
    setFeitos(lista);
  }, [chave, ids]);

  const gravar = useCallback((lista: string[]) => {
    feitosRef.current = lista;
    setFeitos(lista);
    setInteragiu(true);
    try {
      if (lista.length) localStorage.setItem(chave, JSON.stringify(lista));
      else localStorage.removeItem(chave);
    } catch { /* sem armazenamento, o "feito" vale até fechar a aba */ }
  }, [chave]);

  const alternar = useCallback((n: number) => {
    const id = ids[n - 1];
    if (!id) return false;
    const lista = alternarFeito(feitosRef.current, id, ids);
    gravar(lista);
    return lista.includes(id);
  }, [ids, gravar]);

  const recomecar = useCallback(() => gravar([]), [gravar]);

  // ── Passo atual ───────────────────────────────────────────────────────────
  const [atual, setAtual] = useState<number | null>(null);
  const atualRef = useRef<number | null>(null);
  const marcarAtual = useCallback((n: number) => { atualRef.current = n; setAtual(n); }, []);

  // A faixa observada é a parte de CIMA da tela (até 45%): o passo que a
  // pessoa está lendo é o que chegou ali, não o que aparece de canto no
  // rodapé. Sem passo nenhum na faixa (num texto entre dois passos), fica o
  // último — "estou no passo 3" continua verdade enquanto ela lê a dica.
  useEffect(() => {
    if (!total || typeof IntersectionObserver === "undefined") return;
    const visiveis = new Set<number>();
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        const n = Number((e.target as HTMLElement).dataset.passo);
        if (!n) continue;
        if (e.isIntersecting) visiveis.add(n); else visiveis.delete(n);
      }
      if (visiveis.size) marcarAtual(Math.max(...visiveis));
    }, { rootMargin: "0px 0px -55% 0px" });
    for (let n = 1; n <= total; n += 1) {
      const el = document.getElementById(`passo-${n}`);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [total, marcarAtual]);

  // ── Tela acesa ────────────────────────────────────────────────────────────
  const [suportaTela, setSuportaTela] = useState(false);
  const [telaAcesa, setTelaAcesa] = useState(false);
  const querAcesa = useRef(false);
  const trava = useRef<WakeLockSentinel | null>(null);
  const pedindo = useRef(false);

  const pedirTrava = useCallback(async () => {
    // Um pedido por vez: a volta da aba durante um pedido pendente criaria
    // duas travas, e a segunda nunca seria solta.
    if (pedindo.current || trava.current) return;
    pedindo.current = true;
    try {
      const s = await navigator.wakeLock.request("screen");
      if (!querAcesa.current) { soltar(s); return; }
      trava.current = s;
      // O sistema solta sozinho quando a aba vai pro fundo; a marca some pra
      // que a volta peça de novo.
      s.addEventListener?.("release", () => { if (trava.current === s) trava.current = null; });
    } catch {
      // Recusado (economia de bateria, aba em segundo plano): o botão volta a
      // desligado em vez de fingir que a tela vai ficar acesa.
      querAcesa.current = false;
      setTelaAcesa(false);
    } finally {
      pedindo.current = false;
    }
  }, []);

  // Nunca liga sozinho: o navegador só concede a trava em resposta a um gesto,
  // e manter a tela de alguém acesa sem pedir gasta a bateria dela.
  const ligarTela = useCallback(() => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    querAcesa.current = true;
    setTelaAcesa(true);
    void pedirTrava();
  }, [pedirTrava]);

  const desligarTela = useCallback(() => {
    querAcesa.current = false;
    setTelaAcesa(false);
    const s = trava.current;
    trava.current = null;
    soltar(s);
  }, []);

  useEffect(() => {
    setSuportaTela("wakeLock" in navigator);
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && querAcesa.current) void pedirTrava();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      querAcesa.current = false;
      const s = trava.current;
      trava.current = null;
      soltar(s);
    };
  }, [pedirTrava]);

  // ── Modo "um passo por vez" ───────────────────────────────────────────────
  const [modo, setModo] = useState<number | null>(null);
  const origem = useRef<HTMLElement | null>(null);
  const escopoModo = useRef<Element | null>(null);
  const telaAntesDoModo = useRef(false);
  const destino = useRef<DestinoAoFechar>("passo");
  const ultimo = useRef(1);

  const abrirModo = useCallback((de?: HTMLElement | null) => {
    if (!total) return;
    origem.current = de ?? null;
    escopoModo.current = de?.closest(".tut-leitura") ?? document.querySelector(".tut-leitura");
    // Pede a tela acesa DENTRO do toque que abriu o modo (é o gesto que o
    // navegador exige) e lembra se ela já estava ligada, pra só desligar na
    // saída o que o modo ligou.
    telaAntesDoModo.current = querAcesa.current;
    if (!querAcesa.current) ligarTela();
    const n = passoInicialDoModo(ids, feitosRef.current, atualRef.current);
    ultimo.current = n;
    destino.current = "passo";
    marcarAtual(n);
    setModo(n);
  }, [total, ids, ligarTela, marcarAtual]);

  const irNoModo = useCallback((n: number) => {
    if (n < 1 || n > total) return;
    ultimo.current = n;
    marcarAtual(n);
    setModo(n);
  }, [total, marcarAtual]);

  const fecharModo = useCallback((para: DestinoAoFechar = "passo") => {
    destino.current = para;
    if (!telaAntesDoModo.current) desligarTela();
    setModo(null);
  }, [desligarTela]);

  // Depois que a camada saiu (e já soltou a rolagem e o foco preso), pra onde
  // o foco vai. Concluir (destino "fim") leva ao fim do guia: a pessoa
  // terminou, e o "Isso ajudou?" é o passo natural. Qualquer outra saída (Esc,
  // X, tocar fora) DEVOLVE o foco ao botão que abriu, como manda o padrão de
  // modal — quem abriu do cabeçalho volta pra lá com a página no mesmo lugar (o
  // fundo ficou travado onde estava, então `nearest` não dá salto). Sem o botão
  // no DOM, cai no passo onde parou pra não largar o foco no <body>.
  const modoAntes = useRef<number | null>(null);
  useEffect(() => {
    const antes = modoAntes.current;
    modoAntes.current = modo;
    if (antes === null || modo !== null) return;
    const botao = origem.current?.isConnected ? origem.current : null;
    const fim = destino.current === "fim"
      ? document.querySelector<HTMLElement>(".tut-ajudou, .tut-relacionados")
      : null;
    if (fim) {
      focarBloco(fim);
      rolarAte(fim, "start");
    } else if (botao) {
      botao.focus({ preventScroll: true });
      rolarAte(botao, "nearest");
    } else {
      const alvo = document.getElementById(`passo-${ultimo.current}`);
      if (alvo) { focarBloco(alvo); rolarAte(alvo, "start"); }
    }
  }, [modo]);

  const valor = useMemo<Leitura>(() => ({
    passos, total, feitos, interagiu,
    ehFeito: (n: number) => { const id = ids[n - 1]; return !!id && feitos.includes(id); },
    alternar, recomecar, atual, suportaTela, telaAcesa, ligarTela, desligarTela,
    modo, abrirModo, irNoModo, fecharModo, escopo: () => escopoModo.current,
  }), [passos, total, feitos, interagiu, ids, alternar, recomecar, atual, suportaTela, telaAcesa, ligarTela, desligarTela, modo, abrirModo, irNoModo, fecharModo]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
