"use client";

import type { ReactNode } from "react";
import {
  Button, ButtonGroup, Separator, ToggleButton, ToggleButtonGroup, Toolbar,
} from "@heroui/react";
import { Icon } from "../Icon";
import "./barra.css";

// ── BarraFerramentas: fileira de controles de editor ────────────────────────
// É o Toolbar do HeroUI v3 (React Aria): UMA parada de Tab pra barra inteira
// e setas ← → andando entre os botões, que é o que um editor espera. Por cima:
//
//   • ícone do Tabler, nunca o do HeroUI (regra do CLAUDE.md);
//   • 44px de alvo no celular (`--tap`), 32px no computador — ui/barra.css;
//   • `GrupoAlternar` é escolha única que não pode ficar vazia (Computador/
//     Celular, versão A/B): clicar no já escolhido não desliga nada;
//   • a barra não quebra linha: se não couber, ela rola de lado DENTRO dela.
//
// Não é pra ação principal da tela (Publicar, Salvar): essa continua sendo
// `<Botao>`, fora da barra — ferramenta ≠ chamada pra ação.

export function BarraFerramentas({ rotulo, children, colada }: {
  rotulo: string; children: ReactNode; colada?: boolean;
}) {
  return (
    <Toolbar aria-label={rotulo} isAttached={colada} className="ui-barra">
      {children}
    </Toolbar>
  );
}

export function GrupoBarra({ children }: { children: ReactNode }) {
  return <ButtonGroup variant="tertiary" size="sm">{children}</ButtonGroup>;
}

export function SeparadorBarra() {
  return <Separator orientation="vertical" className="ui-barra-sep" />;
}

export function BotaoBarra({ icone, titulo, onClick, desabilitado, separado }: {
  icone: string; titulo: string; onClick: () => void; desabilitado?: boolean;
  /** Dentro de um GrupoBarra, todo botão depois do primeiro leva o divisor. */
  separado?: boolean;
}) {
  return (
    <Button isIconOnly aria-label={titulo} onPress={onClick} isDisabled={desabilitado}>
      {separado && <ButtonGroup.Separator />}
      <Icon name={icone} size={16} />
    </Button>
  );
}

export function GrupoAlternar<T extends string>({ rotulo, valor, onChange, opcoes }: {
  rotulo: string; valor: T; onChange: (v: T) => void;
  opcoes: { id: T; titulo: string; icone?: string; texto?: string }[];
}) {
  return (
    <ToggleButtonGroup
      aria-label={rotulo} size="sm" selectionMode="single" disallowEmptySelection
      selectedKeys={[valor]}
      onSelectionChange={(k) => { const v = [...k][0]; if (v != null) onChange(String(v) as T); }}
    >
      {opcoes.map((o, i) => (
        <ToggleButton key={o.id} id={o.id} isIconOnly={!o.texto} aria-label={o.titulo}>
          {i > 0 && <ToggleButtonGroup.Separator />}
          {o.icone && <Icon name={o.icone} size={16} />}
          {o.texto}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
