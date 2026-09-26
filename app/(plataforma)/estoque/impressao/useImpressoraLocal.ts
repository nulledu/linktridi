"use client";

// ── A impressora desta máquina, vista de qualquer folha ──────────────────────
//
// O cadastro mora no `localStorage` (ver impressoras-guardadas.ts). Este hook é
// a leitura dele pra quem IMPRIME: a folha de etiquetas, o cartão da consulta,
// a conferência. Todos precisam da mesma resposta — "existe uma Zebra aqui? qual?"
// — e cada um lendo o `localStorage` por conta própria divergiria no dia em que
// a chave mudasse.
//
// A escolha da tela é LEMBRADA POR MÁQUINA ("a de todo dia"), não por sessão:
// quem abre a folha três vezes por hora não pode escolher a impressora três
// vezes por hora.

import { useCallback, useEffect, useState } from "react";
import { escolherImpressora, type ImpressoraLocal } from "@/lib/impressora-local";
import type { EtiquetaParaZpl } from "@/lib/etiqueta-zpl";
import { lerImpressoras } from "./impressoras-guardadas";
import type { DadosEtiqueta } from "../Etiqueta";

const CHAVE_ESCOLHIDA = "estoque.impressora.escolhida";

export interface ImpressoraEmUso {
  /** A impressora que vai receber — `null` = diálogo do navegador. */
  atual: ImpressoraLocal | null;
  /** Só as que falam ZPL: é a lista que a folha oferece pra trocar. */
  zebras: ImpressoraLocal[];
  escolher: (id: string | null) => void;
  /** `true` depois de ler o localStorage — antes disso a folha não sabe. */
  pronto: boolean;
}

export function useImpressoraLocal(): ImpressoraEmUso {
  const [lista, setLista] = useState<ImpressoraLocal[]>([]);
  const [escolhidaId, setEscolhidaId] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setLista(lerImpressoras());
    try { setEscolhidaId(window.localStorage.getItem(CHAVE_ESCOLHIDA)); } catch { /* sem storage */ }
    setPronto(true);
    // Outra aba cadastrou uma impressora: esta aba fica sabendo sem recarregar.
    // É o caso real de quem configura numa aba e imprime na outra.
    const aoMudar = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith("estoque.impressora")) setLista(lerImpressoras());
    };
    window.addEventListener("storage", aoMudar);
    return () => window.removeEventListener("storage", aoMudar);
  }, []);

  const zebras = lista.filter((p) => p.saida === "zebra_usb" || p.saida === "zebra_agente");

  // "diálogo" é uma escolha explícita e lembrada: quem tem Zebra mas quer a
  // folha A4 pra um caso específico não precisa desmarcar nada no cadastro.
  const atual = escolhidaId === "navegador" ? null : escolherImpressora(zebras, escolhidaId);

  const escolher = useCallback((id: string | null) => {
    const valor = id ?? "navegador";
    setEscolhidaId(valor);
    try { window.localStorage.setItem(CHAVE_ESCOLHIDA, valor); } catch { /* sem storage */ }
  }, []);

  return { atual, zebras, escolher, pronto };
}

/**
 * A etiqueta da folha, no formato do gerador ZPL.
 *
 * É a MESMA informação — quem muda é só o nome dos campos. Fica aqui, num lugar
 * só, porque duas traduções (uma na folha, outra na consulta) são duas chances
 * de uma etiqueta sair sem o local.
 */
export function etiquetaParaZpl(d: DadosEtiqueta, qrUrl?: string | null): EtiquetaParaZpl {
  return {
    codigo: d.codigo,
    nome: d.nome,
    corDimensoes: d.corDimensoes ?? null,
    local: d.local || null,
    localDetalhe: d.localDetalhe ?? null,
    quantidade: d.quantidade ?? 1,
    ehCaixa: d.tipo === "caixa" || (d.quantidade ?? 1) > 1,
    rodape: d.impressoEm ? `${dataCurta(d.impressoEm)} · ${d.responsavel}` : null,
    qrUrl: qrUrl ?? null,
  };
}

function dataCurta(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(dt.getDate())}/${p2(dt.getMonth() + 1)} ${p2(dt.getHours())}:${p2(dt.getMinutes())}`;
}
