"use client";

import { Icon } from "../../../Icon";
import { PAPEIS_CONTATO, type PapelContato } from "@/lib/financeiro/tipos";
import { Dropdown } from "../../../ui/Dropdown";

export const LABEL_PAPEL: Record<PapelContato, string> = {
  contato: "Contato",
  fornecedor: "Fornecedor",
  cliente: "Cliente",
  parceiro: "Parceiro",
  prestador: "Prestador",
  outro: "Outro",
};

/**
 * Multisseletor de papéis: o `<Dropdown>` do sistema com seção de seleção
 * múltipla (fica aberto enquanto a pessoa marca vários). O botão continua
 * sendo o alvo de 44 px; portal, folha no celular e teclado moram no Dropdown.
 */
export function PapeisContato({ valor, aoMudar }: {
  valor: PapelContato[];
  aoMudar: (papeis: PapelContato[]) => void;
}) {
  const resumo = valor.length ? valor.map((papel) => LABEL_PAPEL[papel]).join(", ") : "Nenhum papel";

  return (
    <Dropdown titulo="Papéis" largura={280}
      secoes={[{
        selecao: "multipla",
        selecionados: valor,
        onSelecao: (ids) => aoMudar(ids as PapelContato[]),
        itens: PAPEIS_CONTATO.map((papel) => ({ id: papel, rotulo: LABEL_PAPEL[papel] })),
      }]}
      gatilho={({ ref, ...p }) => (
        <button ref={ref} type="button" aria-label="Papéis" {...p}
          style={{
            width: "100%", minHeight: "var(--tap)", padding: "8px 12px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
            background: "var(--surface)", color: "var(--text)", cursor: "pointer",
            font: "inherit", textAlign: "start", minWidth: 0,
          }}
        >
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{resumo}</span>
          <Icon name={p["aria-expanded"] ? "chevron-up" : "chevron-down"} size={16} color="var(--text-dim)" />
        </button>
      )} />
  );
}
