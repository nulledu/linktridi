"use client";

// Envio de arquivo com a cara do app.
//
// O `<input type="file">` cru desenha o botão do SISTEMA ("Choose File", em
// inglês, cinza, fora do tema) — era o que aparecia no meio de um formulário
// todo em português. Aqui o input fica escondido e quem aparece é um botão da
// fundação; o `htmlFor` mantém o clique e o teclado funcionando sem JS.
//
// O rótulo do botão TROCA durante o envio ("Enviando…") em vez de sumir: o
// upload de uma foto de celular leva segundos, e sem sinal nenhum a pessoa
// clica de novo e manda o arquivo duas vezes.
import { useState } from "react";
import { Icon } from "../../../Icon";
import { toast } from "../../../Toast";

/** Aceita o tipo? Compara com o `accept` (lista de MIME) sem depender do que o
 *  navegador filtra no seletor — arrastar e colar não passam por ele. */
const combina = (accept: string, tipo: string) =>
  accept.split(",").map((x) => x.trim()).filter(Boolean).some((regra) =>
    regra.endsWith("/*") ? tipo.startsWith(regra.slice(0, -1)) : regra === tipo);

export function CampoArquivo({ id, accept, rotulo = "Escolher arquivo", enviar, aoEnviar }: {
  id: string;
  accept: string;
  rotulo?: string;
  /** Sobe o arquivo e devolve a URL final. */
  enviar: (file: File) => Promise<string>;
  aoEnviar: (url: string) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [nome, setNome] = useState("");
  const [sobre, setSobre] = useState(false);

  // Um caminho só para os três gestos: seletor, arrastar e colar. Antes só o
  // seletor existia — e a foto que a pessoa acabou de recortar estava na área
  // de transferência, a um Ctrl+V de distância.
  const receber = async (file?: File | null) => {
    if (!file || enviando) return;
    if (!combina(accept, file.type)) return toast.erro("Esse tipo de arquivo não serve para este campo.");
    setEnviando(true); setNome(file.name);
    try { aoEnviar(await enviar(file)); }
    catch (x) { setNome(""); toast.erro((x as Error).message); }
    finally { setEnviando(false); }
  };

  return (
    <div className="cte-arquivo" data-sobre={sobre ? "1" : undefined}
      onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => { e.preventDefault(); setSobre(false); void receber(e.dataTransfer.files?.[0]); }}
      onPaste={(e) => { const f = [...e.clipboardData.files][0]; if (f) { e.preventDefault(); void receber(f); } }}>
      <input id={id} type="file" accept={accept} disabled={enviando}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void receber(f); }} />
      <label htmlFor={id} className="ui-btn mt-anel" data-v="secundario" data-t="md" data-enviando={enviando ? "1" : undefined}>
        <Icon name={enviando ? "refresh" : "upload"} size={15.5} />
        {enviando ? "Enviando…" : rotulo}
      </label>
      {nome && !enviando && <small title={nome}>{nome}</small>}
      {!nome && !enviando && <small className="cte-arquivo-dica desk-only">ou arraste aqui / cole (⌘V)</small>}
    </div>
  );
}
