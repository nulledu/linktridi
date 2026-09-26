"use client";

import { useCopiar } from "./ui/controles";
import { TrocaIcone, TrocaTexto } from "./ui/micro";

// Botão pra copiar o ID do pedido (reutilizável em todas as telas de pedidos).
// IDs longos (ex: id_proprio "Nome - telefone") viram um rótulo "ID" compacto —
// o valor copiado continua sendo o id completo.
//
// Kinetics 016 (Copy Button): o ícone cruza pra um check, o rótulo troca NO
// MESMO LUGAR (as duas faces dividem a célula, então a linha da tabela não
// pula quando "#1234" vira "copiado") e a tinta passa pro verde e volta.
// Visual em `.ui-copy-id` no globals.css.
export function CopyId({ id, prefix = "#", size = 13 }: { id: string | number; prefix?: string; size?: number }) {
  const { copiado, copiar } = useCopiar(1200);
  const txt = String(id);
  const longo = txt.length > 12;
  function aoClicar(e: React.MouseEvent) {
    e.stopPropagation();
    void copiar(txt);
  }
  return (
    <button
      type="button"
      onClick={aoClicar}
      title={`Copiar ID: ${txt}`}
      aria-label={copiado ? "ID copiado" : `Copiar ID ${txt}`}
      className="ui-copy-id"
      data-ok={copiado ? "1" : undefined}
      style={{ fontSize: size }}
    >
      <TrocaTexto ligado={copiado} a={longo ? "ID" : `${prefix}${txt}`} b="copiado" />
      <TrocaIcone ligado={copiado} a="copy" b="check" size={size - 2} />
    </button>
  );
}
