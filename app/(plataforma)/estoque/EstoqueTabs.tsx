"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useSticky } from "../useSticky";
import { Icon } from "../Icon";
import { PageHead } from "../ui/mobile";
import { Abas } from "../ui/Abas";
import { useParamDaUrl } from "../ui/useParamDaUrl";
import { CatalogoClient } from "./CatalogoClient";
import { FornecedoresPanel } from "./FornecedoresPanel";
import { RecebimentoPanel } from "./RecebimentoPanel";
import { LocaisPanel } from "./LocaisPanel";
import { BiparClient } from "./BiparClient";
import { EntradaPorLeitura } from "./EntradaPorLeitura";
import { ProducaoDiaClient } from "./ProducaoDiaClient";

export interface EstoquePerms { itens: boolean; precos: boolean; compras: boolean; fornecedores: boolean; locais: boolean; bipar: boolean }
type Aba = "catalogo" | "producao-dia" | "recebimento" | "fornecedores" | "locais" | "bipar";

// Estoque: "Catálogo" (o estoque real), "Recebimento" (entrada de materiais) e
// "Fornecedores" (base de custos). Cada aba só aparece pra quem tem a sub-permissão.
export function EstoqueTabs({ perms }: { perms: EstoquePerms }) {
  // A aba fica salva, então quem volta em "Fornecedores" precisa vê-la: o
  // `Abas` rola a faixa até a aba atual sozinho.
  const [aba, setAba] = useSticky<Aba>("estoque.aba", "catalogo");
  // Chegou de `/estoque?busca=…` (busca universal do Início): o produto mora no
  // Catálogo. Sem isto, quem tinha deixado a aba salva em "Fornecedores" clica
  // num produto e cai numa tela de custos, sem entender por quê.
  useParamDaUrl("busca", () => setAba("catalogo"));

  // Só as abas que a pessoa pode ver (sub-permissões). Preços é coluna, não aba.
  const disponiveis = ([
    ["catalogo", "Catálogo", "box", perms.itens],
    // A API (/api/estoque/producao-dia) já gate na mesma chave estoque:itens —
    // quem vê a aba SEMPRE pode ligar o interruptor, não existe um meio-termo
    // "vê mas não gerencia" aqui como existe no Catálogo.
    ["producao-dia", "Produção do dia", "checklist", perms.itens],
    // A aba "Conferir" saiu em 11/09/2026 com a conferência de atividade
    // (lib/conferencia-de-atividade.ts): peça produzida entra no estoque pela
    // mão de quem cuida dele, no Catálogo.
    ["recebimento", "Recebimento", "package-import", perms.compras],
    ["fornecedores", "Fornecedores", "truck-loading", perms.fornecedores],
    ["locais", "Localização", "map-pin", perms.locais],
    ["bipar", "Bipar", "barcode", perms.bipar],
  ] as const).filter(([, , , ok]) => ok);

  if (disponiveis.length === 0) {
    return (
      <div style={{ maxWidth: 1120 }}>
        <PageHead title="Estoque" />
        <div className="glass" style={{ padding: 28, borderRadius: "var(--r-md)", color: "var(--text-dim)", fontSize: 14 }}>
          Você não tem nenhuma ação liberada no Estoque. Peça pro admin liberar em Permissões.
        </div>
      </div>
    );
  }

  // A aba salva pode não estar mais disponível → cai na primeira permitida.
  const atual: Aba = disponiveis.some(([k]) => k === aba) ? aba : disponiveis[0][0];

  return (
    <div style={{ maxWidth: 1120 }}>
      <PageHead title="Estoque" right={<AbrirOperacao />} />
      {/* `overflowX: auto` no INVÓLUCRO, e não só o `.tab-strip`: a faixa da
          fundação só rola sozinha até 900px, e as SETE abas do Estoque medem
          926px. Entre 901px e ~1273px (a janela de notebook mais comum) a
          faixa vazava 250px pra fora da coluna de 676px — "Localização" e
          "Bipar" nasciam FORA do recorte da coluna: invisíveis e sem clique,
          duas abas inteiras inalcançáveis. E como `Abas` traz a aba ativa pra
          vista com `scrollIntoView`, sem invólucro rolável quem rolava era a
          PÁGINA: 213px de rolagem lateral a 1024px. Medido a 1024: página 213
          → 0; faixa 926/676 → 926/676 rolando dentro do invólucro.
          O invólucro não ganha `transform` nem `mask-image` — os dois prendem
          popover (ver CLAUDE.md). */}
      <div style={{ margin: "14px 0 18px", overflowX: "auto" }}>
        <Abas valor={atual} onMuda={setAba} ariaLabel="Seções do Estoque"
          itens={disponiveis.map(([k, lbl, ic]) => ({
            valor: k,
            rotulo: <><Icon name={ic} size={15} color="currentColor" /> {lbl}</>,
          }))} />
      </div>
      {/* Preços (custo) são gateados pela sub-permissão estoque:precos DENTRO das
          APIs de estoque/custos (podeVerCusto) — não precisam de prop aqui. */}
      {atual === "catalogo" ? <CatalogoClient />
        : atual === "producao-dia" ? <ProducaoDiaClient />
        : atual === "recebimento" ? <RecebimentoPanel />
        : atual === "locais" ? <LocaisPanel />
        : atual === "bipar" ? <AbaBipar />

        : <FornecedoresPanel />}
    </div>
  );
}

/**
 * A aba Bipar passou a ter DOIS sentidos.
 *
 * Ela nasceu só de saída (bipa a etiqueta, o material sai). O dono pediu a
 * entrada pelas mesmas duas vias que já existiam ali — pistola no computador,
 * câmera no celular. Sub-aba e não tela nova porque é o MESMO gesto e o mesmo
 * leitor; o que muda é o sinal.
 *
 * A saída continua sendo a primeira: é o que o galpão faz o dia inteiro, e
 * trocar a ordem por causa da novidade custaria um toque a mais em toda
 * bipagem de consumo.
 */
function AbaBipar() {
  const [modo, setModo] = useState<"saida" | "entrada">("saida");
  const [podeAjustar, setPodeAjustar] = useState<boolean | null>(null);

  // Só quando alguém abre a entrada: quem veio dar baixa não paga a pergunta.
  useEffect(() => {
    if (modo !== "entrada" || podeAjustar !== null) return;
    let vivo = true;
    fetch("/api/estoque/ajuste-qr", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { pode: false }))
      .then((d) => { if (vivo) setPodeAjustar(!!d.pode); })
      .catch(() => { if (vivo) setPodeAjustar(false); });
    return () => { vivo = false; };
  }, [modo, podeAjustar]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 420 }}>
        {([["saida", "Dar baixa", "minus"], ["entrada", "Entrada por leitura", "plus"]] as const).map(([m, rot, ic]) => (
          <button key={m} type="button" aria-pressed={modo === m} onClick={() => setModo(m)}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
              minHeight: "var(--tap)", padding: "9px 12px", borderRadius: "var(--r-sm)", cursor: "pointer",
              fontSize: 13.5, fontWeight: 700,
              border: `1.5px solid ${modo === m ? "var(--primary)" : "var(--border)"}`,
              background: modo === m ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)",
              color: modo === m ? "var(--primary-texto)" : "var(--text)" }}>
            <Icon name={ic} size={15} color="currentColor" /> {rot}
          </button>
        ))}
      </div>
      {modo === "saida"
        ? <BiparClient />
        : podeAjustar === null
          ? <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Verificando sua permissão…</p>
          : <EntradaPorLeitura podeAjustar={podeAjustar} />}
    </div>
  );
}


/**
 * A porta pro modo de galpão.
 *
 * Fica no cabeçalho e não numa aba de propósito: `/operacao` NÃO é mais uma
 * seção do Estoque — é a mesma operação em outro formato, pra quem está de pé
 * com um leitor na mão. Uma aba a mais nesta faixa (que já tem sete e já rola
 * de lado) diria o contrário, e ainda empurraria "Bipar" pra fora do recorte.
 *
 * Sem gate próprio: quem enxerga esta tela já passou pelo `requireModuleKeys`
 * do Estoque, e a `/operacao` refaz o mesmo gate e mostra só os cartões que as
 * permissões da pessoa abrem.
 */
function AbrirOperacao() {
  return (
    <Link
      href="/operacao"
      className="ui-card-alvo"
      style={{
        display: "inline-flex", alignItems: "center", gap: 7, minHeight: "var(--tap)",
        padding: "0 14px", borderRadius: "var(--r-sm)", textDecoration: "none",
        border: "1.5px solid var(--primary)", fontSize: 13.5, fontWeight: 700,
        background: "color-mix(in srgb, var(--primary) 12%, transparent)",
        color: "var(--primary-texto)",
      }}
    >
      <Icon name="barcode" size={16} color="currentColor" />
      Abrir a Operação
    </Link>
  );
}
