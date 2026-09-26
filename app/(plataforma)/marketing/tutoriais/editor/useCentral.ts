"use client";

// Estado da central dentro do editor.
//
// Cada mudança é uma OPERAÇÃO (lib/tridiflow-tutoriais-operacoes.ts) aplicada
// na hora sobre o que está na tela — a linha muda de lugar sem esperar a rede —
// e enviada ao servidor UMA de cada vez. O que o servidor devolve vira a base,
// e o que ainda está na fila é reaplicado por cima. Sem a fila, duas ordens em
// sequência chegavam fora de ordem e a lista "voltava" por um instante; sem a
// base do servidor, a tela divergia do banco sem ninguém ver.
//
// Salvar PUBLICA: com a central no ar, a rota já regrava a página pública. O
// indicador ("Salvando…", "Salvo às 14:32", "Não salvou") é o único retorno
// de rotina — aviso na tela a cada clique virava ruído.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CentralCompleta } from "@/lib/tridiflow-tutoriais-db";
import type { CentralTutoriaisDoc } from "@/lib/tridiflow-tutoriais";
import { aplicarOperacao, ErroCentral, type OperacaoCentral } from "@/lib/tridiflow-tutoriais-operacoes";

export type EstadoSalvamento =
  | { fase: "ocioso" }
  | { fase: "salvando" }
  | { fase: "salvo"; em: string }
  | { fase: "erro"; mensagem: string };
export type Resultado = { ok: true } | { ok: false; erro: string; campo?: string };
export interface Identidade { nome?: string; slug?: string; dominioId?: string | null }

type Pedido = {
  /** O que o pedido faz na tela antes da resposta (só as operações têm). */
  aplicar?: (doc: CentralTutoriaisDoc) => CentralTutoriaisDoc;
  corpo: { metodo: "PATCH" | "POST"; json: unknown };
  /** Operação que pode ser refeita pelo "Tentar de novo". */
  op?: OperacaoCentral;
  resolver: (r: Resultado) => void;
};

const rota = (id: string) => `/api/tridiflow/tutoriais/centrais/${id}`;
const SEM_REDE = "Sem conexão — a alteração não foi salva.";

export function useCentral(inicial: CentralCompleta, opts: { fetcher?: typeof fetch } = {}) {
  const fetcherRef = useRef<typeof fetch>(opts.fetcher ?? ((...a: Parameters<typeof fetch>) => fetch(...a)));
  const base = useRef(inicial);
  const fila = useRef<Pedido[]>([]);
  const enviando = useRef(false);
  const vivo = useRef(true);
  const ultimaFalha = useRef<OperacaoCentral | null>(null);
  const [central, setCentral] = useState(inicial);
  const [salvamento, setSalvamento] = useState<EstadoSalvamento>({ fase: "ocioso" });
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  /** A tela é a base do servidor com a fila reaplicada por cima. Operação que
   *  não cabe mais na base nova (o tutorial sumiu em outra aba) sai da tela. */
  const docDaTela = useCallback((): CentralTutoriaisDoc => {
    let doc = base.current.doc;
    for (const p of fila.current) {
      if (!p.aplicar) continue;
      try { doc = p.aplicar(doc); } catch { /* não cabe mais: a resposta dela dirá o porquê */ }
    }
    return doc;
  }, []);

  const redesenhar = useCallback(() => {
    if (!vivo.current) return;
    setCentral({ ...base.current, doc: docDaTela() });
    setPendentes(fila.current.length);
  }, [docDaTela]);

  const drenar = useCallback(async () => {
    if (enviando.current) return;
    enviando.current = true;
    let falhou: string | null = null;
    try {
      while (fila.current.length) {
        const p = fila.current[0];
        if (p.op && vivo.current) setSalvamento({ fase: "salvando" });
        let resultado: Resultado;
        try {
          const r = await fetcherRef.current(rota(base.current.id), {
            method: p.corpo.metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(p.corpo.json),
          });
          const j = (await r.json().catch(() => ({}))) as { central?: CentralCompleta; error?: string; campo?: string };
          if (r.ok && j.central) { base.current = j.central; resultado = { ok: true }; }
          else resultado = { ok: false, erro: j.error || "Não deu pra salvar agora. Tente de novo.", ...(j.campo ? { campo: j.campo } : {}) };
        } catch {
          resultado = { ok: false, erro: SEM_REDE };
        }
        fila.current = fila.current.slice(1);
        if (p.op) {
          if (resultado.ok) ultimaFalha.current = null;
          else { falhou = resultado.erro; ultimaFalha.current = p.op; }
        }
        redesenhar();
        p.resolver(resultado);
      }
    } finally {
      enviando.current = false;
      if (vivo.current) {
        // O erro fica à vista até a próxima gravação dar certo — um "Salvo"
        // por cima dele esconderia que uma alteração se perdeu.
        if (falhou) setSalvamento({ fase: "erro", mensagem: falhou });
        else setSalvamento((s) => (s.fase === "salvando" ? { fase: "salvo", em: new Date().toISOString() } : s));
      }
    }
  }, [redesenhar]);

  const enfileirar = useCallback((p: Omit<Pedido, "resolver">) => new Promise<Resultado>((resolver) => {
    fila.current = [...fila.current, { ...p, resolver }];
    redesenhar();
    void drenar();
  }), [drenar, redesenhar]);

  const executar = useCallback((op: OperacaoCentral): Promise<Resultado> => {
    // Confere contra a TELA: erro de quem edita (título vazio, endereço
    // repetido) volta na hora, sem ir pra rede.
    try { aplicarOperacao(docDaTela(), op); }
    catch (e) { return Promise.resolve({ ok: false, erro: e instanceof ErroCentral ? e.message : "Operação inválida." }); }
    return enfileirar({ aplicar: (doc) => aplicarOperacao(doc, op), corpo: { metodo: "PATCH", json: { op } }, op });
  }, [docDaTela, enfileirar]);

  const tentarDeNovo = useCallback((): Promise<Resultado> => {
    const op = ultimaFalha.current;
    if (!op) return Promise.resolve({ ok: true });
    ultimaFalha.current = null;
    return executar(op);
  }, [executar]);

  // Nome, endereço e no ar/fora do ar passam pela MESMA fila: trocar o
  // endereço com uma gravação a caminho faria as duas disputarem a linha.
  const mudarIdentidade = useCallback((identidade: Identidade) =>
    enfileirar({ corpo: { metodo: "PATCH", json: { identidade } } }), [enfileirar]);
  const colocarNoAr = useCallback(() => enfileirar({ corpo: { metodo: "POST", json: { acao: "publicar" } } }), [enfileirar]);
  const tirarDoAr = useCallback(() => enfileirar({ corpo: { metodo: "POST", json: { acao: "despublicar" } } }), [enfileirar]);

  // Fechar a aba com gravação a caminho perderia a alteração em silêncio.
  useEffect(() => {
    if (!pendentes) return;
    const segurar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [pendentes]);

  return { central, salvamento, pendentes, executar, tentarDeNovo, mudarIdentidade, colocarNoAr, tirarDoAr };
}
