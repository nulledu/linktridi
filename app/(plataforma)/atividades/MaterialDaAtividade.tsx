"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL DA ATIVIDADE — o começo do ciclo do galpão, dentro do quadro.
//
// "pega a caixa lacrada de folhas de alavanca limpa, BIPA ELA, nesse momento é
// removido do estoque, e a pessoa rompe o lacre e monta."
//
// Bipar é no COMEÇO do trabalho, não no fim, e é o que liga "esta caixa de
// folhas virou aquelas alavancas". Antes o Bipar só existia como aba solta do
// Estoque: a baixa saía sem dono, e ninguém que olhasse a atividade sabia o que
// tinha entrado nela. Duas consequências que não se viam:
//
//  • na conferência, o gerente aprova a peça sem saber com que material ela foi
//    feita;
//  • quando dá errado, a perda não tem de onde sair — o material já saiu do
//    estoque lá no começo, e é isso que faz a conta fechar sozinha, sem
//    ninguém lançar nada.
//
// A tela de bipar é a MESMA do Estoque (`BiparClient`), com a atividade fixa: a
// leitura no galpão é feita em pé, com uma mão, e não pode ter duas versões que
// respondem diferente ao mesmo gesto.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { PainelLateral } from "../ui/controles";
import { Alerta } from "../ui/Alerta";
import { BiparClient } from "../estoque/BiparClient";
import type { Atividade } from "@/lib/atividades-catalog";

export interface ResumoConsumo { etiquetas: number; pecas: number }

interface ConsumoEtiqueta {
  codigo: string; item: string | null; pecas: number;
  motivo: string | null; baixadoPor: string | null; baixadoEm: string | null;
}
interface Consumo extends ResumoConsumo { lista: ConsumoEtiqueta[]; semVinculo: boolean }

const VAZIO: Consumo = { lista: [], etiquetas: 0, pecas: 0, semVinculo: false };

/** "2 caixas · 100 peças" — e no singular sem forçar plural feio. */
export function textoDoConsumo(r: ResumoConsumo): string {
  const et = `${r.etiquetas} ${r.etiquetas === 1 ? "etiqueta" : "etiquetas"}`;
  return r.pecas > r.etiquetas ? `${et} · ${r.pecas} peças` : et;
}

const horaCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "";

/**
 * Painel "material desta atividade": o que já saiu do estoque por conta dela e
 * a bipagem pra tirar mais.
 */
export function MaterialDaAtividade({ atividade, onFechar, onMudou }: {
  atividade: Atividade;
  onFechar: () => void;
  /** Alguma coisa foi bipada — quem abriu atualiza o selo do card. */
  onMudou?: () => void;
}) {
  const [consumo, setConsumo] = useState<Consumo | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/estoque/unidades?atividade=${encodeURIComponent(atividade.id)}`, { cache: "no-store" });
      if (!r.ok) { setConsumo(VAZIO); setErro("Não deu para ler o que já foi consumido."); return; }
      setConsumo((await r.json()) as Consumo);
      setErro("");
    } catch {
      setConsumo(VAZIO);
      setErro("Sem resposta do servidor ao ler o consumo.");
    }
  }, [atividade.id]);

  useEffect(() => { carregar(); }, [carregar]);

  const total = consumo ?? VAZIO;

  return (
    <PainelLateral
      titulo="Material desta atividade"
      // A pessoa junto do nome da tarefa: é o cabeçalho que diz de qual
      // trabalho é este material, então a bipagem lá embaixo não repete.
      subtitulo={`${atividade.tarefa}${atividade.para_nome ? ` · ${atividade.para_nome}` : " · no pool do setor"}`}
      largura={620}
      onFechar={onFechar}
    >
      <style>{CSS}</style>

      {/* O que já saiu, em uma linha. Fica ANTES da bipagem porque é a resposta
          da pergunta que trouxe a pessoa aqui ("já bipei essa caixa?"). */}
      <div className="mat-topo">
        <Icon name="package-import" size={18} color={total.etiquetas ? "var(--primary-texto)" : "var(--text-dim)"} />
        <div style={{ minWidth: 0 }}>
          <strong>{total.etiquetas ? textoDoConsumo(total) : "Nada bipado ainda"}</strong>
          <div className="mat-sub">
            {total.etiquetas
              ? "Já saiu do estoque por conta desta atividade."
              : "Bipe a caixa antes de romper o lacre — ela sai do estoque na hora."}
          </div>
        </div>
      </div>

      {/* Enquanto o SQL da caixa não roda, a baixa acontece mas o vínculo não é
          gravado. Dizer "nada consumido" aqui seria mentira: o certo é avisar
          que não dá pra saber. */}
      {total.semVinculo && (
        <Alerta tom="atencao" role="status" style={{ marginBottom: 12 }}>
          Falta rodar <b>supabase/estoque_pendente_tudo.sql</b>. A baixa funciona, mas o
          vínculo com a atividade ainda não é gravado — esta lista fica vazia.
        </Alerta>
      )}

      {erro && (
        <Alerta tom="perigo" style={{ marginBottom: 12 }}>{erro}</Alerta>
      )}

      <BiparClient
        atividade={{ id: atividade.id, tarefa: atividade.tarefa, para_nome: atividade.para_nome, status: atividade.status }}
        motivoInicial="consumido"
        compacto
        onBaixou={() => { carregar(); onMudou?.(); }}
      />

      {total.lista.length > 0 && (
        <div className="mat-lista">
          <h4>O que já saiu</h4>
          <ul>
            {total.lista.map((u) => (
              <li key={u.codigo}>
                <div style={{ minWidth: 0 }}>
                  <div className="mat-cod">
                    {u.codigo}
                    {u.pecas > 1 && <span className="mat-caixa">Caixa · {u.pecas} un</span>}
                  </div>
                  <div className="mat-sub">
                    {u.item ?? "item removido do catálogo"}
                    {u.baixadoPor ? ` · ${u.baixadoPor}` : ""}
                    {u.baixadoEm ? ` · ${horaCurta(u.baixadoEm)}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PainelLateral>
  );
}

const CSS = `
.mat-topo {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px; border-radius: var(--r-md); margin-bottom: 12px;
  border: 1px solid var(--border); background: var(--surface);
}
.mat-topo strong { font-size: 15px; font-weight: 800; }
.mat-sub { font-size: 12px; color: var(--text-dim); line-height: 1.45; overflow-wrap: anywhere; }

.mat-lista { margin-top: 18px; }
.mat-lista h4 { font-size: 13px; font-weight: 800; margin: 0 0 8px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.4px; }
.mat-lista ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.mat-lista li {
  padding: 9px 12px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--surface);
}
.mat-cod {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px; font-weight: 700; overflow-wrap: anywhere;
}
.mat-caixa {
  display: inline-block; margin-left: 7px; padding: 1px 7px; border-radius: 999px;
  font-family: inherit; font-size: 11px; font-weight: 800;
  color: var(--primary-texto);
  background: color-mix(in srgb, var(--primary) 15%, transparent);
  white-space: nowrap;
}
`;
