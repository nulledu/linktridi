"use client";

// Banco de provas do dropdown do sistema: cada variação da gramática do HeroUI
// (ícone + atalho, descrição, seções, perigo, desativado, seleção única e
// múltipla, "⋯" encostado à direita) e o GlassSelect ao lado — as duas folhas
// têm que parecer a mesma peça.

import { useState } from "react";
import { Dropdown } from "../(plataforma)/ui/Dropdown";
import { GlassSelect } from "../(plataforma)/GlassPicker";
import { toast } from "../(plataforma)/Toast";

export function ProvaDropdown() {
  const [estilos, setEstilos] = useState<string[]>(["negrito"]);
  const [alinha, setAlinha] = useState<string[]>(["esquerda"]);
  const [fruta, setFruta] = useState("maca");
  const disse = (o: string) => () => toast(o);
  return (
    <section style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>Dropdown</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2, maxWidth: "62ch" }}>
          Folha opaca sem contorno, item de 36px com hover neutro, escolhido marcado à esquerda. No celular vira
          folha presa embaixo com item de 44px. O select ao lado usa a mesma folha.
        </p>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Dropdown titulo="Ações" rotulo="Ações" itens={[
          { id: "novo", rotulo: "Novo arquivo", icone: "plus", atalho: ["⌘", "N"], onSelect: disse("Novo arquivo") },
          { id: "abrir", rotulo: "Abrir arquivo", icone: "folder", atalho: ["⌘", "O"], onSelect: disse("Abrir arquivo") },
          { id: "copiar", rotulo: "Copiar link", icone: "link", onSelect: disse("Copiar link") },
          { id: "apagar", rotulo: "Apagar arquivo", icone: "trash", atalho: ["⌘", "⇧", "D"], perigo: true, onSelect: disse("Apagar") },
        ]} />

        <Dropdown titulo="Mais opções" secoes={[
          { titulo: "Ações", itens: [
            { id: "novo", rotulo: "Novo arquivo", descricao: "Criar um arquivo novo", icone: "plus", onSelect: disse("Novo") },
            { id: "editar", rotulo: "Editar arquivo", descricao: "Fazer alterações", icone: "pencil", onSelect: disse("Editar") },
          ] },
          { titulo: "Zona de perigo", itens: [
            { id: "apagar", rotulo: "Apagar arquivo", descricao: "Mover pra lixeira", icone: "trash", perigo: true, onSelect: disse("Apagar") },
            { id: "arquivar", rotulo: "Arquivar", descricao: "Sem permissão", icone: "archive", desativado: true },
          ] },
        ]} />

        <Dropdown titulo="Estilo do texto" rotulo="Estilos" largura={256} secoes={[
          { titulo: "Estilo", selecao: "multipla", selecionados: estilos, onSelecao: setEstilos, itens: [
            { id: "negrito", rotulo: "Negrito", atalho: ["⌘", "B"] },
            { id: "italico", rotulo: "Itálico", atalho: ["⌘", "I"] },
            { id: "sublinhado", rotulo: "Sublinhado", atalho: ["⌘", "U"] },
          ] },
          { titulo: "Alinhamento", selecao: "unica", indicador: "ponto", selecionados: alinha, onSelecao: setAlinha, itens: [
            { id: "esquerda", rotulo: "Esquerda" },
            { id: "centro", rotulo: "Centro" },
            { id: "direita", rotulo: "Direita" },
          ] },
        ]} />

        <div style={{ width: 180 }}>
          <GlassSelect value={fruta} onChange={setFruta} aria-label="Fruta" options={[
            { value: "maca", label: "Maçã" }, { value: "banana", label: "Banana" },
            { value: "cereja", label: "Cereja" }, { value: "pera", label: "Pera", disabled: true },
          ]} />
        </div>

        <span style={{ marginLeft: "auto" }}>
          <Dropdown titulo="Opções da linha" alinhar="fim" itens={[
            { id: "renomear", rotulo: "Renomear", icone: "pencil", onSelect: disse("Renomear") },
            { id: "duplicar", rotulo: "Duplicar", icone: "copy", onSelect: disse("Duplicar") },
            { id: "apagar", rotulo: "Apagar", icone: "trash", perigo: true, onSelect: disse("Apagar") },
          ]} />
        </span>
      </div>
    </section>
  );
}
