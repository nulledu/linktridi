"use client";

// Modal do sistema — a anatomia do Modal do HeroUI v3 (ícone, título, corpo,
// rodapé, X no canto; tamanhos xs/sm/md/lg/cover/full; posição; véu opaco,
// desfocado ou transparente) sobre o motor da casa, o `PainelLateral centrado`.
//
// O `Modal` do HeroUI/React Aria NÃO é usado, pelo mesmo motivo do Dropdown:
// ele põe z-index 100000 na mão (cobre o GlassSelect/PeriodPicker portados que
// abrem de dentro dele) e não conhece a pilha de camadas, a trava de rolagem
// contada, o `soFechaNoX` de formulário nem a folha arrastável do celular.
// Aqui o desenho é do HeroUI e o comportamento continua sendo o do app.
//
//   <Modal aberto={a} onFechar={f} icone="rocket" tom="destaque" tamanho="sm"
//          titulo="Bem-vindo" rodape={<Acoes>…</Acoes>}>…</Modal>

import type { ComponentProps } from "react";
import { PainelLateral } from "./controles";

export type { TamanhoModal, TomModal } from "./controles";

export function Modal(props: Omit<ComponentProps<typeof PainelLateral>, "centrado">) {
  // `?? "md"` e não `tamanho="md"` antes do spread: quem repassa
  // `tamanho={undefined}` apagaria o padrão.
  return <PainelLateral {...props} tamanho={props.tamanho ?? "md"} centrado />;
}
