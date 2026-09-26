"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHead } from "../../ui/mobile";
import { Botao } from "../../ui/controles";
import { Icon } from "../../Icon";

interface Props {
  lojas: { id: string; nome: string }[];
  modelos: { id: string; nome: string; descricao: string }[];
}

export function ModelosClient({ lojas, modelos }: Props) {
  const router = useRouter();
  const [loja, setLoja] = useState(lojas[0]?.id ?? "");
  const [aplicando, setAplicando] = useState("");
  const [recado, setRecado] = useState("");

  async function aplicar(modelo: string) {
    if (!loja) return;
    setAplicando(modelo);
    setRecado("");
    try {
      const r = await fetch(`/api/lojas/${loja}/modelo`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ modelo }),
      });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) { setRecado(corpo?.detalhe || corpo?.error || "Não deu pra aplicar."); return; }
      // Aplicou como rascunho: leva direto pro editor, que é onde a pessoa
      // confere e publica. Aplicar e ficar parado na lista faria parecer que
      // nada aconteceu.
      router.push(`/lojas/${loja}/aparencia`);
    } catch {
      setRecado("Sem conexão. Nada foi aplicado.");
    } finally {
      setAplicando("");
    }
  }

  return (
    <>
      <PageHead title="Modelos" />
      <p className="ml-intro">
        Um modelo é a loja inteira já montada: cores, tipografia e as seções da página na ordem.
        Aplicar entra como <strong>rascunho</strong> — a loja no ar só muda quando você publicar no editor.
      </p>

      {lojas.length === 0 ? (
        <p className="ml-vazio">Crie uma loja primeiro.</p>
      ) : (
        <label className="ml-escolha">
          <span>Aplicar em</span>
          <select className="ui-input" value={loja} onChange={(e) => setLoja(e.target.value)}>
            {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </label>
      )}

      {recado && <p className="ml-recado" role="status">{recado}</p>}

      <div className="ml-grade">
        {modelos.map((m) => (
          <article className="ml-card" key={m.id}>
            <span className="ml-card-ico"><Icon name="template" size={20} /></span>
            <h2>{m.nome}</h2>
            <p>{m.descricao}</p>
            <Botao variante="secundario" onClick={() => aplicar(m.id)} carregando={aplicando === m.id} disabled={!loja}>
              Aplicar
            </Botao>
          </article>
        ))}
      </div>
    </>
  );
}
