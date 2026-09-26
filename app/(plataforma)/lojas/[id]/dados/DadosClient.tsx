"use client";

// ── Dados da loja ────────────────────────────────────────────────────────────
// Quem a loja é: nome, logo, ícone da aba e como ela aparece quando alguém
// acha ou compartilha.
//
// ── Por que isto não mora no editor de aparência ─────────────────────────────
// A logo já existia — dentro da seção "Cabeçalho" do editor de tema. Dois
// problemas nisso. O primeiro é achar: ninguém procura a logo da empresa dentro
// de "cores e seções". O segundo é pior — tema é ROUPA, identidade é quem a
// loja É. Aplicar um modelo pronto substitui o tema inteiro por um rascunho
// novo, e teria levado a logo junto.
//
// Então a identidade mora na LOJA, e o tema a usa. O campo de logo do cabeçalho
// continua existindo pra quem quiser uma diferente naquele tema; vazio, ele cai
// nesta.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../Icon";
import { Bloco, Cabecalho } from "../../ui";
import { Botao, Campo } from "../../../ui/controles";
import { toast } from "../../../Toast";
import { urlDaLoja, type Loja } from "@/lib/lojas";
import "./dados.css";

/** O que o Google corta. Não é limite do banco — é limite do mundo. */
const LIMITE_TITULO = 60;
const LIMITE_DESCRICAO = 160;

export function DadosClient({ loja }: { loja: Loja }) {
  const router = useRouter();
  const [nome, setNome] = useState(loja.nome);
  const [logoUrl, setLogoUrl] = useState(loja.logoUrl ?? "");
  const [faviconUrl, setFaviconUrl] = useState(loja.faviconUrl ?? "");
  const [seoTitulo, setSeoTitulo] = useState(loja.seoTitulo ?? "");
  const [seoDescricao, setSeoDescricao] = useState(loja.seoDescricao ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const tituloVisto = seoTitulo.trim() || nome.trim() || "Sua loja";
  const descricaoVista = seoDescricao.trim() || `Catálogo de ${nome.trim() || "sua loja"}.`;
  const endereco = urlDaLoja(loja).replace(/^https?:\/\//, "");

  async function salvar() {
    setErro("");
    if (nome.trim().length < 2) { setErro("O nome da loja não pode ficar vazio."); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/lojas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lojaId: loja.id, nome, logoUrl, faviconUrl, seoTitulo, seoDescricao }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.detalhe ?? j.error ?? "Não deu para salvar."); return; }
      // Meio caminho é dito como meio caminho — "salvo" escondendo metade é
      // pior que a verdade.
      if (j.parcial) toast.erro(j.detalhe);
      else toast.ok("Dados salvos. A vitrine já está com eles.");
      // Quem desenha o nome da loja é o SERVIDOR: a barra lateral, o cabeçalho,
      // o card em Minhas lojas.
      router.refresh();
    } finally { setSalvando(false); }
  }

  return (
    <div className="lj-tela dd">
      <Cabecalho
        titulo="Dados da loja"
        sub="Quem ela é: nome, logo, ícone da aba e como aparece quando alguém acha ou compartilha."
        acao={<Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar</Botao>}
      />

      <div className="dd-duo">
        <div className="dd-form">
          <Bloco titulo="Identidade">
            <Campo label="Nome da loja" erro={erro} dica="Aparece no cabeçalho da vitrine e no painel.">
              {(id) => <input id={id} value={nome} onChange={(e) => { setNome(e.target.value); setErro(""); }} maxLength={80} />}
            </Campo>

            <Campo
              label="Logo"
              dica="Endereço da imagem. PNG com fundo transparente funciona melhor sobre o cabeçalho colorido."
            >
              {(id) => (
                <div className="dd-imagem">
                  <span className="dd-previa-img">
                    {logoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={logoUrl} alt="" />
                      : <Icon name="photo" size={16} color="var(--text-dim)" />}
                  </span>
                  <input id={id} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://…/logo.png" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                </div>
              )}
            </Campo>

            <Campo
              label="Ícone da aba (favicon)"
              dica="Quadrado, de preferência 512×512 — o navegador reduz. É o que aparece na aba e no atalho da tela inicial do celular."
            >
              {(id) => (
                <div className="dd-imagem">
                  <span className="dd-previa-img dd-previa-img--fav">
                    {faviconUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={faviconUrl} alt="" />
                      : <Icon name="world" size={14} color="var(--text-dim)" />}
                  </span>
                  <input id={id} value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)}
                    placeholder="https://…/icone.png" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                </div>
              )}
            </Campo>
          </Bloco>

          <Bloco titulo="Como a loja aparece na busca">
            <Campo
              label="Título"
              dica={`${seoTitulo.length}/${LIMITE_TITULO} — vazio usa o nome da loja.`}
              erro={seoTitulo.length > LIMITE_TITULO ? "Passa do que o Google mostra; vai ser cortado." : undefined}
            >
              {(id) => (
                <input id={id} value={seoTitulo} onChange={(e) => setSeoTitulo(e.target.value)}
                  placeholder={nome} maxLength={70} />
              )}
            </Campo>

            <Campo
              label="Descrição"
              dica={`${seoDescricao.length}/${LIMITE_DESCRICAO} — é a linha embaixo do título no resultado da busca.`}
              erro={seoDescricao.length > LIMITE_DESCRICAO ? "Passa do que o Google mostra; vai ser cortada." : undefined}
            >
              {(id) => (
                <textarea id={id} value={seoDescricao} onChange={(e) => setSeoDescricao(e.target.value)}
                  rows={3} maxLength={180} placeholder={`Catálogo de ${nome}.`} />
              )}
            </Campo>
          </Bloco>
        </div>

        {/* A prévia é o ponto da tela: título e descrição são campos que a
            pessoa preenche sem nunca ver o resultado — ele só aparece no Google
            semanas depois. Aqui ela vê enquanto digita. */}
        <div className="dd-previas">
          <Bloco titulo="Prévia">
            <p className="dd-rot">Na aba do navegador</p>
            <div className="dd-aba">
              <span className="dd-aba-ico">
                {faviconUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={faviconUrl} alt="" />
                  : <Icon name="world" size={11} color="var(--text-dim)" />}
              </span>
              <span className="dd-aba-txt">{tituloVisto}</span>
              <Icon name="x" size={11} color="var(--text-dim)" />
            </div>

            <p className="dd-rot">No resultado da busca</p>
            <div className="dd-busca">
              <span className="dd-busca-url">{endereco}</span>
              <span className="dd-busca-tit">{tituloVisto.slice(0, LIMITE_TITULO)}</span>
              <span className="dd-busca-desc">{descricaoVista.slice(0, LIMITE_DESCRICAO)}</span>
            </div>

            <p className="dd-rot">No cabeçalho da vitrine</p>
            <div className="dd-cab">
              {logoUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={logoUrl} alt="" />
                : <strong>{nome || "Sua loja"}</strong>}
            </div>
            <p className="dd-nota">
              Sem logo, a vitrine escreve o nome da loja — que é o que ela faz hoje.
            </p>
          </Bloco>
        </div>
      </div>
    </div>
  );
}
