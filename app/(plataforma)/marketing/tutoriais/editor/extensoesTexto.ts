// Configuração ÚNICA do editor de texto do tutorial — o componente e o teste
// usam esta mesma lista, então o que o teste garante é o que a tela faz.
//
// O esquema É o contrato de saída: parágrafo, quebra, negrito, itálico, listas
// e link. Colar do Word ou de um site passa por ele — título vira parágrafo,
// estilo e imagem somem — antes mesmo da lista de permissão do servidor.
// Nada de StarterKit: ele traria título, código e citação pra desligar um a um.
import { Extension } from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Italic } from "@tiptap/extension-italic";
import { Link } from "@tiptap/extension-link";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";

export function extensoesTexto(opts: { placeholder?: string; aoPedirLink?: () => void } = {}) {
  return [
    Document, Paragraph, Text, Bold, Italic, HardBreak,
    BulletList, OrderedList, ListItem, ListKeymap, UndoRedo,
    Placeholder.configure({ placeholder: opts.placeholder ?? "" }),
    // Link guarda SÓ o destino: sem target/rel no documento. O `rel` quem põe é
    // a página pública, e o documento continua no vocabulário fechado.
    // `HTMLAttributes: null` tira o que o Link INVENTA ao desenhar; o
    // `addAttributes` só com `href` tira o que vem COLADO (um
    // `target="_blank"` de outro site passaria direto pelo esquema).
    Link.extend({
      addAttributes() {
        const pai = (this.parent?.() ?? {}) as Record<string, unknown>;
        return { href: pai.href as never };
      },
    }).configure({
      openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https",
      protocols: ["mailto", "tel"], HTMLAttributes: { target: null, rel: null, class: null },
    }),
    // ⌘K é o atalho de link de todo editor que a pessoa já usou; o Tiptap não
    // traz, então ele vem daqui e abre o MESMO campo do botão da barra.
    Extension.create({
      name: "atalhoDeLink",
      addKeyboardShortcuts() {
        return { "Mod-k": () => { opts.aoPedirLink?.(); return true; } };
      },
    }),
  ];
}

/** O que vai pro documento. Vazio grava "", não o `<p></p>` que o editor
 *  devolve — senão todo bloco em branco pareceria ter conteúdo. */
export const htmlDoEditor = (editor: { isEmpty: boolean; getHTML(): string }): string =>
  editor.isEmpty ? "" : editor.getHTML();
