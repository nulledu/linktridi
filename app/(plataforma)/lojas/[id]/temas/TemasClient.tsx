"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../../../Icon";
import { Botao } from "../../../ui/controles";
import { Cabecalho } from "../../ui";
import "./temas.css";

interface Props {
  id: string;
  /** Id do MODELO do tema publicado. */
  atual: string;
  temRascunho: boolean;
  persistido: boolean;
  modelos: { id: string; nome: string; descricao: string }[];
}

export function TemasClient({ id, atual, temRascunho, persistido, modelos }: Props) {
  const router = useRouter();
  const [aplicando, setAplicando] = useState("");
  const [recado, setRecado] = useState("");

  const emUso = modelos.find((m) => m.id === atual) ?? modelos[0];
  const outros = modelos.filter((m) => m.id !== emUso.id);

  async function aplicar(modelo: string) {
    // Trocar de tema apaga o que a pessoa ajustou no editor — cor, texto,
    // ordem das seções. Perguntar é o mínimo; e a aplicação entra como
    // RASCUNHO, então nem assim a loja no ar muda sem alguém publicar.
    if (!confirm("Aplicar este tema substitui os ajustes atuais por um rascunho novo. Continuar?")) return;
    setAplicando(modelo);
    setRecado("");
    try {
      const r = await fetch(`/api/lojas/${id}/modelo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelo }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) { setRecado(corpo?.detalhe || corpo?.error || "Não deu pra aplicar."); return; }
      router.push(`/lojas/${id}/aparencia`);
    } catch {
      setRecado("Sem conexão. Nada foi aplicado.");
    } finally {
      setAplicando("");
    }
  }

  return (
    <div className="lj-tela">
      <Cabecalho
        titulo="Temas"
        sub="Qual está no ar, e o que dá pra trocar."
        acao={
          <Link href={`/lojas/${id}/aparencia`} className="ui-btn" data-v="primario" data-t="md">
            <Icon name="palette" size={15} color="var(--on-primary, #fff)" /> Personalizar
          </Link>
        }
      />

      {!persistido && (
        <p className="ap-aviso">
          <Icon name="alert-triangle" size={16} />
          O tema ainda não grava: rode o <code>supabase/lojas-tema.sql</code> no Supabase.
        </p>
      )}
      {recado && <p className="ap-recado" role="status">{recado}</p>}

      <section className="lj-card tm-atual">
        {/* A miniatura é a loja de VERDADE encolhida, no computador e no
            celular. Imagem de exemplo mentiria no dia seguinte ao primeiro
            ajuste. */}
        <div className="tm-telas" aria-hidden="true">
          <div className="tm-desk"><iframe src={`/previa/loja/${id}`} title="" tabIndex={-1} scrolling="no" /></div>
          <div className="tm-cel"><iframe src={`/previa/loja/${id}`} title="" tabIndex={-1} scrolling="no" /></div>
        </div>

        <div className="tm-atual-txt">
          <h2>{emUso.nome}</h2>
          <div className="tm-selos">
            <span className="tm-selo tm-selo-on">Tema atual</span>
            {temRascunho && <span className="tm-selo">Alterações não publicadas</span>}
          </div>
          <p>{emUso.descricao}</p>
          <div className="tm-acoes">
            <Link href={`/lojas/${id}/aparencia`} className="ui-btn" data-v="primario" data-t="sm">Personalizar</Link>
            <a href={`/previa/loja/${id}`} target="_blank" rel="noreferrer noopener" className="ui-btn" data-v="secundario" data-t="sm">
              <Icon name="eye" size={15} color="var(--text-dim)" /> Ver
            </a>
          </div>
        </div>
      </section>

      <h2 className="tm-sub">Biblioteca de temas</h2>
      <div className="tm-lista">
        {outros.map((m) => (
          <article className="lj-card tm-item" key={m.id}>
            <span className="tm-item-ico"><Icon name="template" size={18} /></span>
            <div className="tm-item-txt">
              <strong>{m.nome}</strong>
              <p>{m.descricao}</p>
            </div>
            <Botao variante="secundario" tamanho="sm" onClick={() => aplicar(m.id)} carregando={aplicando === m.id}>
              Aplicar
            </Botao>
          </article>
        ))}
        {outros.length === 0 && <p className="tm-sem">Não há outro tema disponível ainda.</p>}
      </div>
    </div>
  );
}
