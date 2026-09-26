"use client";
import "./kit-heroui.css";

import { Description, InputGroup, Label, Radio, RadioGroup, SearchField } from "@heroui/react";
import type { ReactNode } from "react";
import { Icon } from "../Icon";

// ── Forms / Controls (HeroUI v3) ────────────────────────────────────────────
// Três peças que cada tela desenhava do seu jeito:
//   • GrupoOpcoes  — RadioGroup: escolha única com descrição por opção (quando
//     as opções precisam de uma frase; sem frase, `Chips` basta).
//   • CampoBusca   — SearchField: lupa do Tabler, limpar com alvo de 44px, Esc limpa.
//   • CampoAdorno  — InputGroup: prefixo/sufixo fixos (R$, %, un, @) que não
//     entram no valor digitado.

export type Opcao<T extends string> = {
  valor: T; rotulo: ReactNode; descricao?: ReactNode; desligada?: boolean;
  /** Cor da borda/fundo quando marcada (só com `cartao`). Padrão: a da marca. */
  cor?: string;
};

export function GrupoOpcoes<T extends string>({ valor, aoMudar, opcoes, rotulo, deitado, cartao, desligado }: {
  valor: T;
  aoMudar: (v: T) => void;
  opcoes: Opcao<T>[];
  rotulo?: ReactNode;
  /** Opções lado a lado (só com rótulos curtos; a 320px quebram de linha). */
  deitado?: boolean;
  /** Cada opção vira um cartão com borda; a marcada ganha a cor dela. */
  cartao?: boolean;
  desligado?: boolean;
}) {
  return (
    <RadioGroup
      className="ui-opcoes"
      aria-label={rotulo ? undefined : "Opções"}
      data-deitado={deitado ? "1" : undefined}
      data-cartao={cartao ? "1" : undefined}
      isDisabled={desligado}
      value={valor}
      onChange={(v) => aoMudar(v as T)}
      orientation={deitado ? "horizontal" : "vertical"}
    >
      {rotulo && <Label>{rotulo}</Label>}
      {opcoes.map((o) => (
        <Radio key={o.valor} value={o.valor} isDisabled={o.desligada} className="ui-opcoes__item"
          style={o.cor ? { ["--opcao-cor" as string]: o.cor } : undefined}>
          <Radio.Control>
            <Radio.Indicator />
          </Radio.Control>
          <Radio.Content>
            <Label>{o.rotulo}</Label>
            {o.descricao && <Description>{o.descricao}</Description>}
          </Radio.Content>
        </Radio>
      ))}
    </RadioGroup>
  );
}

export function CampoBusca({ valor, aoMudar, placeholder = "Buscar", rotulo = "Buscar", aoEnviar, largo }: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  /** Nome pro leitor de tela (o campo não mostra rótulo). */
  rotulo?: string;
  aoEnviar?: (v: string) => void;
  largo?: boolean;
}) {
  return (
    <SearchField aria-label={rotulo} className="ui-busca" value={valor} onChange={aoMudar} onSubmit={aoEnviar} fullWidth={largo}>
      <SearchField.Group>
        <span className="ui-busca__lupa" aria-hidden><Icon name="search" size={16} /></span>
        <SearchField.Input placeholder={placeholder} />
        <SearchField.ClearButton className="ui-busca__limpar" aria-label="Limpar busca">
          <Icon name="x" size={14} />
        </SearchField.ClearButton>
      </SearchField.Group>
    </SearchField>
  );
}

export function CampoAdorno({ valor, aoMudar, antes, depois, placeholder, rotulo, tipo = "text", modo }: {
  valor: string;
  aoMudar: (v: string) => void;
  /** Texto/ícone fixo antes (R$, @). */
  antes?: ReactNode;
  /** Texto/ícone fixo depois (%, un, kg). */
  depois?: ReactNode;
  placeholder?: string;
  rotulo: string;
  tipo?: "text" | "email" | "url" | "tel";
  modo?: "decimal" | "numeric" | "text";
}) {
  return (
    <InputGroup className="ui-adorno" fullWidth>
      {antes != null && <InputGroup.Prefix>{antes}</InputGroup.Prefix>}
      <InputGroup.Input
        aria-label={rotulo}
        type={tipo}
        inputMode={modo}
        placeholder={placeholder}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
      />
      {depois != null && <InputGroup.Suffix>{depois}</InputGroup.Suffix>}
    </InputGroup>
  );
}
