"use client";

// ── Aquecimento · ficha do aparelho ──────────────────────────────────────────
// A foto do celular, o modelo, onde ele fica e o que já aconteceu com ele.
//
// É ficha do APARELHO, não do chip. Trocar o chip do celular não pode levar a
// foto junto — por isso a ficha mora numa tabela própria, casada pelo NOME que
// os ativos já usam pra agrupar (ver `supabase/marketing_aquecimento_aparelho.sql`).
//
// Renomear mexe nos dois lados numa chamada só, no servidor: a ficha e o campo
// `aparelho` de todo chip que apontava pro nome antigo. Renomear só aqui
// desgrudaria os chips da ficha e o bloco perderia a foto sem explicação.

import { useRef, useState } from "react";
import { Icon } from "../../Icon";
import { PainelLateral, Botao, Acoes, Campo, Campos } from "../../ui/controles";
import { FotoAparelho } from "./pecas";
import type { Aparelho } from "@/lib/marketing-aquecimento-const";

/** Teto do que o navegador manda. O upload aceita mais, mas foto de celular
 *  moderno passa de 5 MB e o bloco a exibe num quadro de 74px — subir o
 *  original é pagar egress por pixel que ninguém vê. */
const TETO_MB = 8;

export function EditarAparelho({ nome, ficha, quantos, onFechar, onSalvo }: {
  nome: string;
  ficha: Aparelho | null;
  /** Quantos chips moram neste aparelho — é o que o rename vai arrastar junto. */
  quantos: number;
  onFechar: () => void;
  onSalvo: (aparelhos: Aparelho[]) => void;
}) {
  const [novoNome, setNovoNome] = useState(nome);
  const [modelo, setModelo] = useState(ficha?.modelo ?? "");
  const [lugar, setLugar] = useState(ficha?.lugar ?? "");
  const [obs, setObs] = useState(ficha?.obs ?? "");
  const [fotoUrl, setFotoUrl] = useState(ficha?.fotoUrl ?? "");
  const [subindo, setSubindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);

  async function escolher(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErro("Escolha uma imagem."); return; }
    if (f.size > TETO_MB * 1024 * 1024) { setErro(`A imagem passa de ${TETO_MB} MB.`); return; }
    setSubindo(true); setErro("");
    const fd = new FormData();
    fd.append("file", f);
    fd.append("bucket", "photos");
    const r = await fetch("/api/upload", { method: "POST", body: fd })
      .then((x) => x.json()).catch(() => null);
    if (r?.url) setFotoUrl(r.url as string);
    else setErro("Não deu para subir a foto. Tente de novo.");
    setSubindo(false);
    // Zera o input: escolher O MESMO arquivo depois de uma falha não dispara
    // `change` de novo se o valor continuar lá, e a tela fica muda.
    if (arquivo.current) arquivo.current.value = "";
  }

  async function salvar() {
    const alvo = novoNome.trim();
    if (!alvo || salvando) return;
    setSalvando(true); setErro("");
    const r = await fetch("/api/marketing/aquecimento/aparelho", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome, modelo, lugar, obs, fotoUrl,
        ...(alvo !== nome ? { renomear: alvo } : null),
      }),
    }).then((x) => x.json()).catch(() => null);

    if (r?.ok) { onSalvo(r.aparelhos as Aparelho[]); return; }
    setErro(
      r?.error === "sem_permissao" ? "Você não tem permissão para editar aparelhos."
        : r?.error === "sql_pendente"
          ? "A ficha do aparelho ainda não existe no banco — rode supabase/marketing_aquecimento_aparelho.sql."
          : "Não deu para salvar. Tente de novo.");
    setSalvando(false);
  }

  return (
    <PainelLateral titulo="Aparelho" subtitulo={nome} largura={460} soFechaNoX onFechar={onFechar}
      rodape={
        <Acoes>
          <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar} disabled={!novoNome.trim() || salvando || subindo}>
            {salvando ? "Salvando…" : "Salvar"}
          </Botao>
        </Acoes>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <FotoAparelho foto={fotoUrl || null} cor="var(--text-dim)" rotulo={nome}
            largura={92} altura={120} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
              A foto é como se acha ESTE celular na mesa. Sem ela o bloco desenha
              um aparelho com a tela na cor do pior chip que mora nele.
            </p>
            {/* O input de arquivo fica escondido e o botão o aciona: o controle
                nativo tem altura própria (menor que os 44px de alvo) e um texto
                em inglês que muda de navegador pra navegador. */}
            <input ref={arquivo} type="file" accept="image/*" hidden
              onChange={(e) => void escolher(e.target.files?.[0] ?? null)} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Botao variante="secundario" tamanho="sm" icone="camera" carregando={subindo}
                onClick={() => arquivo.current?.click()}>
                {fotoUrl ? "Trocar foto" : "Escolher foto"}
              </Botao>
              {fotoUrl && (
                <Botao variante="sutil" tamanho="sm" icone="trash" onClick={() => setFotoUrl("")}>
                  Remover
                </Botao>
              )}
            </div>
          </div>
        </div>

        <Campos min={190}>
          <Campo label="Nome do aparelho" largo
            dica={quantos
              ? `É a etiqueta que agrupa os chips. Renomear leva ${quantos} ${quantos === 1 ? "chip" : "chips"} junto.`
              : "É a etiqueta que agrupa os chips."}>
            <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} maxLength={80}
              placeholder="Moto G54 · mesa 3" style={{ width: "100%", minHeight: "var(--tap)" }} />
          </Campo>

          <Campo label="Modelo">
            <input value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={80}
              placeholder="Redmi 12" style={{ width: "100%", minHeight: "var(--tap)" }} />
          </Campo>

          <Campo label="Onde fica">
            <input value={lugar} onChange={(e) => setLugar(e.target.value)} maxLength={80}
              placeholder="mesa 3, gaveta do armário…" style={{ width: "100%", minHeight: "var(--tap)" }} />
          </Campo>

          <Campo label="Observações" largo
            dica="O que já aconteceu com o aparelho: tela trocada, chip queimado, ficou fora do ar.">
            <textarea value={obs} onChange={(e) => setObs(e.target.value)} maxLength={600} rows={3}
              style={{ width: "100%", resize: "vertical" }} />
          </Campo>
        </Campos>

        {erro && (
          <p style={{ margin: 0, fontSize: 13, color: "var(--perigo)", display: "flex", gap: 7, alignItems: "flex-start" }}>
            <Icon name="alert-triangle" size={15} color="var(--perigo)" />
            {erro}
          </p>
        )}
      </div>
    </PainelLateral>
  );
}
