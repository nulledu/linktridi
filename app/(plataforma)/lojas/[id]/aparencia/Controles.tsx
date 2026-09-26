"use client";

// ── Os controles do painel de ajustes ────────────────────────────────────────
// Um componente por TIPO de ajuste, e um despachante que escolhe pelo schema.
// O painel não conhece seção nenhuma: recebe uma lista de `Ajuste` e desenha.
// É o que faz seção nova aparecer no editor sem ninguém tocar aqui.

import { CampoCor } from "@/app/(plataforma)/ui/cores";
import { Campo, Caixa } from "../../../ui/controles";
import { Deslizante } from "../../../ui/Deslizante";
import { Icon } from "../../../Icon";
import type { Ajuste } from "@/lib/vitrine/tipos";

interface Props {
  ajuste: Ajuste;
  valor: unknown;
  onChange: (v: unknown) => void;
}

export function Controle({ ajuste: a, valor, onChange }: Props) {
  switch (a.tipo) {
    case "titulo":
      return <p className="ap-grupo">{a.label}</p>;

    case "texto":
      return (
        <Campo label={a.label} dica={a.info}>
          <input className="ui-input" value={String(valor ?? "")} placeholder={a.placeholder}
            onChange={(e) => onChange(e.target.value)} />
        </Campo>
      );

    case "area":
    case "rico":
      return (
        <Campo label={a.label} dica={a.info}>
          {/* O campo "rico" é textarea com HTML simples: o lojista escreve
              `<strong>` e `<a>`, e o que sai disso passa pelo higienizador
              antes de virar página pública. Um editor visual completo aqui
              seria outra feature — e a que existe já entrega negrito e link. */}
          <textarea className="ui-input" rows={a.tipo === "rico" ? 5 : 3} value={String(valor ?? "")}
            placeholder={a.tipo === "rico" ? "<p>Texto…</p>" : a.placeholder}
            onChange={(e) => onChange(e.target.value)} />
        </Campo>
      );

    case "cor":
      return (
        <Campo label={a.label} dica={a.info}>
          <span className="ap-cor">
            <CampoCor rotulo={a.label} valor={corValida(valor)} aoMudar={onChange} />
            <input className="ui-input" value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)}
              aria-label={`${a.label} em hexadecimal`} />
          </span>
        </Campo>
      );

    case "numero":
      return (
        <Campo label={`${a.label}${a.unidade ? ` (${a.unidade})` : ""}`} dica={a.info}>
          <span className="ap-faixa">
            <Deslizante min={a.min ?? 0} max={a.max ?? 100} step={a.passo ?? 1}
              value={Number(valor ?? a.padrao ?? 0)} onChange={(v) => onChange(v)}
              aria-label={a.label} />
            <input className="ui-input ap-faixa-num" type="number" min={a.min} max={a.max} step={a.passo}
              value={Number(valor ?? a.padrao ?? 0)} onChange={(e) => onChange(Number(e.target.value))}
              aria-label={`${a.label} em número`} />
          </span>
        </Campo>
      );

    case "opcao":
      return (
        <Campo label={a.label} dica={a.info}>
          <select className="ui-input" value={String(valor ?? a.padrao ?? "")} onChange={(e) => onChange(e.target.value)}>
            {a.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
          </select>
        </Campo>
      );

    case "chave":
      return (
        // `<label>` envolvendo UM controle é seguro; o que não pode é `<label>`
        // em volta de um GRUPO de botões — ali o clique no rótulo dispara o
        // primeiro e troca a seleção sozinho.
        <label className="ap-chave">
          <Caixa marcado={valor === true} onChange={(marc) => onChange(marc)} />
          <span>{a.label}</span>
        </label>
      );

    case "imagem":
      return (
        <Campo label={a.label} dica={a.info ?? "Cole o endereço da imagem, ou envie pelo catálogo de produtos."}>
          <span className="ap-imagem">
            {valor ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={String(valor)} alt="" />
            ) : (
              <span className="ap-imagem-vazia"><Icon name="photo" size={18} /></span>
            )}
            <input className="ui-input" value={String(valor ?? "")} placeholder="https://…"
              onChange={(e) => onChange(e.target.value)} aria-label={a.label} />
          </span>
        </Campo>
      );

    case "link":
      return (
        <Campo label={a.label} dica={a.info ?? "Endereço completo, ou um caminho começando com /"}>
          <input className="ui-input" value={String(valor ?? "")} placeholder="/c/carimbos"
            onChange={(e) => onChange(e.target.value)} />
        </Campo>
      );

    case "colecao":
      return <ColecaoOuProduto ajuste={a} valor={valor} onChange={onChange} lista="colecoes" />;

    case "produto":
      return <ColecaoOuProduto ajuste={a} valor={valor} onChange={onChange} lista="produtos" />;
  }
}

/**
 * Coleção e produto viram uma lista de escolha quando o catálogo é conhecido.
 *
 * A lista vem de um valor de módulo que o editor preenche antes de desenhar, e
 * não de uma prop: é o único par de controles que precisa de dado de fora, e
 * enfiar o catálogo inteiro na assinatura de TODO controle por causa de dois
 * seria pagar o preço em todo lugar.
 */
function ColecaoOuProduto({ ajuste: a, valor, onChange, lista }: Props & { lista: "colecoes" | "produtos" }) {
  const opcoes = useCatalogo(lista);
  return (
    <Campo label={a.label} dica={a.info}>
      <select className="ui-input" value={String(valor ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">— escolha —</option>
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
        {/* O valor guardado pode apontar pra coleção que não existe mais (a
            categoria foi renomeada). Ele aparece assim mesmo, marcado, senão o
            `select` se autocorrige pro primeiro item e muda a loja sozinho. */}
        {Boolean(valor) && !opcoes.some((o) => o.valor === valor) && (
          <option value={String(valor)}>{`${String(valor)} (não encontrada)`}</option>
        )}
      </select>
    </Campo>
  );
}

// Preenchido pelo editor antes de desenhar o painel. Módulo e não contexto do
// React porque é lista fixa por tela, lida em render — um contexto aqui seria
// cerimônia para um valor que nunca muda enquanto o painel está aberto.
let CATALOGO: { colecoes: { valor: string; label: string }[]; produtos: { valor: string; label: string }[] } = {
  colecoes: [], produtos: [],
};
export const definirCatalogo = (c: typeof CATALOGO) => { CATALOGO = c; };
const useCatalogo = (qual: "colecoes" | "produtos") => CATALOGO[qual];

/** `<input type="color">` só aceita `#rrggbb`; qualquer outra coisa vira preto. */
function corValida(v: unknown): string {
  const s = String(v ?? "");
  return /^#[0-9a-f]{6}$/i.test(s) ? s : /^#[0-9a-f]{3}$/i.test(s)
    ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`
    : "#000000";
}
