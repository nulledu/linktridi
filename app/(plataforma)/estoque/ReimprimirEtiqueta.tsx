"use client";

// ── Segunda via da etiqueta ──────────────────────────────────────────────────
//
// Até aqui a etiqueta da caixa aprovada só existia DENTRO do painel de
// conferência, e sumia quando ele fechava. Ou seja: uma chance só. Rede caindo,
// aba fechada ou navegador morto no meio deixavam a caixa lacrada na prateleira
// sem código colado, e nenhuma tela do sistema refazia o papel — o galpão
// ficava com uma caixa que o sistema conta e ninguém consegue bipar.
//
// Este painel é a segunda via: dado um código, ele pede a etiqueta MONTADA PELO
// SERVIDOR (GET /api/estoque/unidades/etiqueta) e desenha a mesma folha. Montar
// a etiqueta aqui, no cliente, seria repetir a regra e deixar as duas versões
// divergirem — é exatamente o que acontece no tablet hoje, onde a reimpressão
// local sai com o SKU no lugar do nome, sem local e sem a quantidade.

import { useCallback, useEffect, useState } from "react";
import type { EtiquetaConferencia } from "@/lib/estoque-conferencia";
import { Acoes, Botao, Esp, PainelLateral } from "../ui/controles";
import { FolhaDeEtiquetas, type DadosEtiqueta } from "./Etiqueta";
import { useLarguraDeFolha } from "./painel-visivel";
import { Aviso } from "./ConferirPainel";

type EtiquetaDoServidor = EtiquetaConferencia & { itemId?: string | null };

/** A `Etiqueta` chama de `impressoEm` o que o servidor chama de `data`. */
function paraFolha(e: EtiquetaDoServidor): DadosEtiqueta {
  return {
    codigo: e.codigo,
    nome: e.nome,
    quantidade: e.quantidade,
    corDimensoes: e.corDimensoes,
    local: e.local,
    localDetalhe: e.localDetalhe,
    responsavel: e.responsavel,
    impressoEm: e.data,
  };
}

export function ReimprimirEtiqueta({ codigos, onFechar }: {
  codigos: string[];
  onFechar: () => void;
}) {
  const [etiquetas, setEtiquetas] = useState<EtiquetaDoServidor[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoRegistro, setAvisoRegistro] = useState(false);
  const largura = useLarguraDeFolha(620);

  const chave = codigos.join(",");
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/estoque/unidades/etiqueta?codigos=${encodeURIComponent(chave)}`, { cache: "no-store" });
        const d = await r.json().catch(() => null);
        if (!vivo) return;
        if (!r.ok || !Array.isArray(d?.etiquetas)) {
          setErro(d?.error === "schema_desatualizado"
            ? "As unidades etiquetadas ainda não têm tabela no banco. Peça pra rodarem supabase/estoque_hierarquia_unidades.sql."
            : d?.error === "forbidden"
              ? "Você não tem permissão pra imprimir etiquetas. Peça a liberação do Estoque em Permissões."
              : "Não deu pra montar a etiqueta agora. Tente de novo; se repetir, avise o suporte.");
          return;
        }
        setEtiquetas(d.etiquetas as EtiquetaDoServidor[]);
      } catch {
        if (vivo) setErro("Não deu pra montar a etiqueta agora. Tente de novo; se repetir, avise o suporte.");
      }
    })();
    return () => { vivo = false; };
  }, [chave]);

  // Registra quem imprimiu e quando, ANTES do diálogo abrir — mesma rota da
  // conferência. Se o registro falhar, a folha AINDA imprime: segurar o papel
  // por causa do livro de impressões só deixaria o galpão com caixa sem código.
  const registrar = useCallback(async () => {
    const comItem = (etiquetas ?? []).filter((e) => e.itemId);
    if (!comItem.length) return;
    try {
      const r = await fetch("/api/estoque/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          etiquetas: comItem.map((e) => ({
            codigo: e.codigo,
            item_id: e.itemId,
            unidade_id: e.unidadeId ?? null,
            local_texto: e.local || null,
          })),
        }),
      });
      if (!r.ok) setAvisoRegistro(true);
    } catch {
      setAvisoRegistro(true);
    }
  }, [etiquetas]);

  const faltando = etiquetas ? codigos.filter((c) => !etiquetas.some((e) => e.codigo === c)) : [];

  return (
    <PainelLateral
      titulo="Segunda via da etiqueta"
      subtitulo={codigos.length === 1 ? codigos[0] : `${codigos.length} caixas`}
      onFechar={onFechar}
      largura={largura}
      rodape={
        <Acoes>
          <Esp />
          <Botao variante="primario" icone="check" onClick={onFechar}>Fechar</Botao>
        </Acoes>
      }
    >
      {erro ? (
        <Aviso tom="erro" icone="circle-x">{erro}</Aviso>
      ) : !etiquetas ? (
        <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Montando a etiqueta…</p>
      ) : (
        <div>
          {faltando.length > 0 && (
            <div className="nao-imprime">
              <Aviso tom="atencao" icone="alert-triangle">
                {faltando.length === codigos.length
                  ? <>Nenhum destes códigos existe no sistema. Confira o que está colado na caixa.</>
                  : <>{faltando.length} código{faltando.length === 1 ? "" : "s"} não existe{faltando.length === 1 ? "" : "m"} no sistema e ficou de fora: {faltando.join(", ")}.</>}
              </Aviso>
            </div>
          )}

          {etiquetas.length === 0 ? null : (
            <>
              <p className="nao-imprime" style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, margin: "0 0 14px" }}>
                É a <strong>mesma etiqueta</strong> da primeira via, montada pelo servidor — nome,
                quantidade da caixa, local e quem produziu. Reimprimir não cria caixa nenhuma nem
                mexe no estoque; só sai papel.
              </p>
              {avisoRegistro && (
                <div className="nao-imprime" style={{ marginBottom: 12 }}>
                  <Aviso tom="atencao" icone="alert-triangle">
                    Não deu pra registrar quem imprimiu (o livro de impressões não respondeu).
                    A folha imprime do mesmo jeito.
                  </Aviso>
                </div>
              )}
              <FolhaDeEtiquetas etiquetas={etiquetas.map(paraFolha)} onImprimir={registrar} />
              {/* Print CSS mora aqui e não no globals.css porque só existe
                  enquanto esta folha está na tela: `window.print()` leva o
                  documento INTEIRO (sidebar, cabeçalho, o véu do painel) e a
                  primeira página sairia com a navegação impressa. O painel é
                  portado pro <body>, então basta esconder os irmãos dele e
                  devolver a folha ao fluxo normal. Mesmo bloco do ConferirPainel. */}
              <style>{`
                @media print {
                  body > *:not(.ui-side) { display: none !important; }
                  .ui-side {
                    position: static !important; width: auto !important; max-width: none !important;
                    height: auto !important; max-height: none !important; overflow: visible !important;
                    border: 0 !important; box-shadow: none !important; background: #fff !important;
                    backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
                    transform: none !important; animation: none !important;
                  }
                  .ui-side-cab, .ui-side-pe, .ui-side-alca { display: none !important; }
                  .ui-side-corpo { overflow: visible !important; padding: 0 !important; }
                }
              `}</style>
            </>
          )}
        </div>
      )}
    </PainelLateral>
  );
}
