"use client";

// Campo de texto do tutorial — negrito, itálico, listas e link, sem HTML à vista.
//
// Antes era uma caixa de texto crua: o conteúdo real da central aparecia como
// `<p>Carimbo, <strong>tinta…` e quem não é técnico não tinha como negritar,
// listar ou pôr um link sem escrever tag. Aqui a pessoa vê o texto como ele
// sai na página, e o documento continua guardando o mesmo HTML de sempre.
//
// Barra FIXA em cima do campo, e não um balão que aparece sobre a seleção: no
// celular o balão disputa espaço com as alças de seleção do próprio sistema.
//
// Carregue com `next/dynamic` (`ssr: false`): o ProseMirror pesa ~120 KB e só
// quem edita precisa dele.
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Icon } from "../../../Icon";
import { Botao, BotaoIcone } from "../../../ui/controles";
import { normalizarUrlPublica } from "@/lib/tridiflow-tutoriais";
import { extensoesTexto, htmlDoEditor } from "./extensoesTexto";
import "./editor-texto.css";

export default function EditorTexto({ valor, onMudar, rotulo, placeholder = "", linhas = 3, id }: {
  valor: string;
  onMudar: (html: string) => void;
  /** Nome do campo pro leitor de tela ("Texto do passo 2"). */
  rotulo: string;
  placeholder?: string;
  /** Altura mínima, em linhas — o campo cresce com o texto. */
  linhas?: number;
  /** Vai no elemento editável, pra um `<label htmlFor>` de fora funcionar. */
  id?: string;
}) {
  // O `onUpdate` é registrado UMA vez, quando o editor nasce. Chamar o
  // `onMudar` daquele render gravaria por cima com uma lista de blocos velha —
  // o ref entrega sempre o mais recente.
  const onMudarRef = useRef(onMudar);
  useEffect(() => { onMudarRef.current = onMudar; }, [onMudar]);
  // Último HTML que ESTE campo emitiu: é o que separa "o valor mudou porque a
  // pessoa digitou" (não mexe) de "mudou por fora" (descartar, desfazer).
  const ultimo = useRef(valor);
  const [linkAberto, setLinkAberto] = useState(false);
  const [url, setUrl] = useState("");
  const campoLink = useRef<HTMLInputElement>(null);
  const abrirLinkRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: extensoesTexto({ placeholder, aoPedirLink: () => abrirLinkRef.current() }),
    content: valor,
    // Obrigatório com renderização no servidor; sem isso o Tiptap acusa
    // divergência de hidratação.
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        role: "textbox", "aria-multiline": "true", "aria-label": rotulo, class: "cte-rte-area",
        style: `--linhas:${linhas}`, ...(id ? { id } : {}),
      },
    },
    onUpdate: ({ editor: e }) => {
      const html = htmlDoEditor(e);
      ultimo.current = html;
      onMudarRef.current(html);
    },
  });

  useEffect(() => {
    if (!editor || valor === ultimo.current) return;
    ultimo.current = valor;
    editor.commands.setContent(valor || "", { emitUpdate: false });
  }, [editor, valor]);

  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => e ? {
      negrito: e.isActive("bold"), italico: e.isActive("italic"),
      lista: e.isActive("bulletList"), numerada: e.isActive("orderedList"),
      link: e.isActive("link"), href: (e.getAttributes("link").href as string | undefined) ?? "",
    } : null,
  });

  const abrirLink = () => {
    setUrl(estado?.href ?? editor?.getAttributes("link").href ?? "");
    setLinkAberto(true);
    requestAnimationFrame(() => campoLink.current?.focus());
  };
  abrirLinkRef.current = abrirLink;

  const aplicarLink = () => {
    if (!editor) return;
    const href = normalizarUrlPublica(url);
    if (!href) { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkAberto(false); return; }
    const { empty } = editor.state.selection;
    if (empty && !editor.isActive("link")) {
      // Nada selecionado: o próprio endereço vira o texto do link.
      editor.chain().focus().insertContent({ type: "text", text: url.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkAberto(false);
  };
  const tirarLink = () => { editor?.chain().focus().extendMarkRange("link").unsetLink().run(); setLinkAberto(false); };

  const botao = (icone: string, titulo: string, ativo: boolean | undefined, acao: () => void) => (
    <button type="button" aria-label={titulo} title={titulo} aria-pressed={!!ativo}
      // Sem o preventDefault o clique tira o foco do texto e a seleção some
      // antes de o negrito ser aplicado.
      onMouseDown={(e) => e.preventDefault()} onClick={acao} disabled={!editor}>
      <Icon name={icone} size={16} />
    </button>
  );

  return (
    <div className="cte-rte">
      <div className="cte-rte-barra" role="toolbar" aria-label={`Formatação: ${rotulo}`}>
        {botao("bold", "Negrito (⌘B)", estado?.negrito, () => editor?.chain().focus().toggleBold().run())}
        {botao("italic", "Itálico (⌘I)", estado?.italico, () => editor?.chain().focus().toggleItalic().run())}
        <span className="cte-rte-sep" aria-hidden="true" />
        {botao("list", "Lista", estado?.lista, () => editor?.chain().focus().toggleBulletList().run())}
        {botao("list-numbers", "Lista numerada", estado?.numerada, () => editor?.chain().focus().toggleOrderedList().run())}
        <span className="cte-rte-sep" aria-hidden="true" />
        {botao("link", "Link (⌘K)", estado?.link || linkAberto, abrirLink)}
      </div>
      {linkAberto && (
        <div className="cte-rte-link">
          <input ref={campoLink} value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Endereço do link"
            placeholder="Cole o endereço (loja.com.br/…, wa.me/55…)" inputMode="url" autoCapitalize="off" spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); aplicarLink(); }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setLinkAberto(false); editor?.commands.focus(); }
            }} />
          <Botao variante="primario" tamanho="sm" onClick={aplicarLink}>Aplicar</Botao>
          {estado?.link && <Botao variante="sutil" tamanho="sm" onClick={tirarLink}>Tirar link</Botao>}
          <BotaoIcone icone="x" titulo="Fechar" tamanho="sm" onClick={() => setLinkAberto(false)} />
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
