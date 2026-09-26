"use client";

// "Conteúdo semelhante já foi utilizado" — o aviso que substitui rolar o Miro
// pra trás. É AVISO: aparece enquanto a pessoa preenche, mostra os stories
// parecidos com o que eles venderam, e o Salvar continua ali do lado.

import { Icon } from "../../Icon";
import { Alerta } from "../../ui/Alerta";
import { rotuloDataHora } from "@/lib/marketing-stories/calendario";
import { formatarInteiro } from "@/lib/marketing-stories/metricas";
import { tituloDoStory, type ParecidoStory } from "@/lib/marketing-stories/tipos";
import type { Semelhantes } from "./api";
import { MiniStory } from "./pecas";

function Lista({ parecidos, nomes, onAbrir }: {
  parecidos: ParecidoStory[]; nomes: Map<string, string>; onAbrir?: (id: string) => void;
}) {
  return (
    <div className="sto-aviso-lista">
      {parecidos.map((p) => (
        <MiniStory
          key={p.story.id}
          s={p.story}
          titulo={rotuloDataHora(p.story.publicadoEm)}
          valor={`${formatarInteiro(p.story.vendas)} ${p.story.vendas === 1 ? "venda" : "vendas"}`}
          detalhe={p.mesmaArte ? "Mesma arte" : tituloDoStory(p.story, (id) => nomes.get(id))}
          onAbrir={onAbrir ? () => onAbrir(p.story.id) : undefined}
        />
      ))}
    </div>
  );
}

// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
/** O aviso do cadastro. Sem parecido, mas com o mesmo produto e tipo já usados,
 *  vira uma linha discreta ("12 stories assim, o último em 10 SET") — ajuda a
 *  espaçar sem gritar. */
export function AvisoParecidos({ r, nomes }: { r: Semelhantes | null; nomes: Map<string, string> }) {
  if (!r) return null;
  const { parecidos, mesmoFormato } = r;
  if (!parecidos.length && !mesmoFormato.total) return null;
  if (!parecidos.length) {
    return (
      <Alerta tom="neutro" icone="history" role="status">
        {mesmoFormato.total} {mesmoFormato.total === 1 ? "story" : "stories"} com este produto e tipo
        {mesmoFormato.ultimo ? ` · o último em ${rotuloDataHora(mesmoFormato.ultimo)}` : ""}
      </Alerta>
    );
  }
  const arte = parecidos.some((p) => p.mesmaArte);
  return (
    <Alerta tom="atencao" role="status" titulo={arte ? "Esta arte já foi publicada" : "Conteúdo semelhante já foi utilizado"}>
      <Lista parecidos={parecidos.slice(0, 3)} nomes={nomes} />
      <p className="sto-aviso-pe" style={{ marginTop: 8 }}>É só um aviso — dá pra salvar assim mesmo.</p>
    </Alerta>
  );
}

/** No detalhe: os parecidos com este story, antes OU depois dele. */
export function ParecidosDoStory({ parecidos, nomes, onAbrir }: {
  parecidos: ParecidoStory[]; nomes: Map<string, string>; onAbrir: (id: string) => void;
}) {
  if (!parecidos.length) return null;
  return (
    <section className="sto-det-parecidos">
      <h4 className="sto-det-rot"><Icon name="copy" size={13} /> Parecidos com este</h4>
      <Lista parecidos={parecidos} nomes={nomes} onAbrir={onAbrir} />
    </section>
  );
}
