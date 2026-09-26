"use client";

// ── Menu "⋯" das linhas e cartões de Atividades ─────────────────────────────
// Casca do `<Dropdown>` do sistema (ui/Dropdown.tsx): portal, posição refeita
// na rolagem em captura, folha presa embaixo no celular e o desenho do
// dropdown do HeroUI moram lá. Aqui só a tradução da lista antiga de ações —
// `separar` abre uma seção nova, e seção com `marcado` vira escolha com
// indicador à esquerda.

import { Dropdown, type SecaoDropdown } from "../ui/Dropdown";
import { BotaoIcone } from "../ui/controles";

export interface AcaoDoMenu { rotulo: string; icone?: string; onClick: () => void; marcado?: boolean; separar?: boolean }

export function MenuAcoes({ acoes, titulo }: { acoes: AcaoDoMenu[]; titulo: string }) {
  if (acoes.length === 0) return null;
  const grupos: AcaoDoMenu[][] = [];
  acoes.forEach((a, i) => { if (i === 0 || a.separar) grupos.push([]); grupos[grupos.length - 1].push(a); });
  const secoes: SecaoDropdown[] = grupos.map((g) => {
    const escolha = g.some((a) => a.marcado !== undefined);
    return {
      itens: g.map((a) => ({ id: a.rotulo, rotulo: a.rotulo, icone: a.icone, onSelect: a.onClick })),
      ...(escolha ? { selecao: "unica" as const, selecionados: g.filter((a) => a.marcado).map((a) => a.rotulo) } : null),
    };
  });
  return (
    <Dropdown titulo={titulo} secoes={secoes} alinhar="fim" largura={228}
      gatilho={({ ref, ...p }) => (
        <BotaoIcone ref={ref} icone="dots" titulo={titulo} {...p} style={{ flex: "none" }} />
      )} />
  );
}
