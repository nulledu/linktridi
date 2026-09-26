"use client";

// ── Unidades etiquetadas de um item ──────────────────────────────────────────
// Só aparece quando o item é serializado E já está salvo (sem `item?.id` não
// há em que pendurar etiqueta nenhuma). Mostra a contagem que a API já soma
// (nunca no cliente — ver CLAUDE.md "o tick comum tem que voltar vazio") e as
// unidades mais recentes, com um jeito de gerar mais.

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { toast } from "../Toast";
import { Acoes, Botao, Campo, PainelLateral } from "../ui/controles";
import { DataList, type Coluna } from "../ui/DataList";
import { useLarguraDeFolha } from "./painel-visivel";
import { MOTIVOS_BAIXA, ehCaixa, partirCodigo, pecasDaUnidade } from "@/lib/estoque-unidades";
import { planoDeEtiquetas, problemaDoPlano } from "@/lib/estoque-plano-de-etiquetas";

interface UnidadeRow {
  id: string;
  codigo: string;
  status: string;
  criado_em: string;
  /** Peças que esta etiqueta vale. Ausente (banco/rota sem a coluna) = 1. */
  quantidade?: number | null;
}

/** O selo da caixa na lista. Etiqueta de uma peça não mostra nada: um rótulo
 *  "1 un" repetido em toda linha vira ruído e some da leitura — e aí o dia em
 *  que uma linha diz 50 passa batido. */
function SeloDeCaixa({ u }: { u: UnidadeRow }) {
  if (!ehCaixa(u)) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 7,
      fontSize: 10.5, fontWeight: 800, letterSpacing: ".01em",
      color: "var(--text)", background: "var(--surface)",
      border: "1px solid var(--border)", borderRadius: 999, padding: "1px 7px",
      verticalAlign: "middle", whiteSpace: "nowrap",
    }}>
      <Icon name="box" size={11} color="var(--text-dim)" />
      {pecasDaUnidade(u)} un
    </span>
  );
}

/** Status com ícone e cor — o mesmo desenho na linha e no cartão. */
function StatusDaUnidade({ status }: { status: string }) {
  const cor = COR_STATUS[status] ?? "var(--text-dim)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: cor, whiteSpace: "nowrap" }}>
      <Icon name={ICONE_STATUS[status] ?? "box"} size={13} color={cor} />
      {LABEL_STATUS[status] ?? status}
    </span>
  );
}

const COLUNAS_UNIDADE: Coluna<UnidadeRow>[] = [
  {
    chave: "codigo", titulo: "Código", papel: "titulo", ordenar: (u) => u.codigo,
    render: (u) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{u.codigo}<SeloDeCaixa u={u} /></span>,
  },
  {
    // No cartão o status fica ao lado do código: é a pergunta "ainda está na
    // prateleira?" respondida sem ler o corpo.
    chave: "status", titulo: "Status", papel: "destaque", ordenar: (u) => LABEL_STATUS[u.status] ?? u.status,
    render: (u) => <StatusDaUnidade status={u.status} />,
  },
  {
    chave: "criado", titulo: "Gerada em", ordenar: (u) => u.criado_em,
    render: (u) => <span style={{ color: "var(--text-dim)" }}>{fmtData(u.criado_em)}</span>,
  },
];

const plural = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

// "Em estoque" primeiro (é o único que sempre aparece, mesmo em zero); os
// motivos de baixa vêm de MOTIVOS_BAIXA — uma fonte só, mesma do bipador.
const LABEL_STATUS: Record<string, string> = {
  em_estoque: "Em estoque",
  ...Object.fromEntries(MOTIVOS_BAIXA.map((m) => [m.key, m.label])),
};
const ICONE_STATUS: Record<string, string> = {
  em_estoque: "box",
  ...Object.fromEntries(MOTIVOS_BAIXA.map((m) => [m.key, m.icon])),
};
const COR_STATUS: Record<string, string> = {
  em_estoque: "var(--ok)",
  perdido: "var(--perigo)",
};
// Forma plural pro resumo ("N consumidas"), diferente do label da baixa
// ("Consumido na produção") que é bom pro rótulo da linha mas ruim na frase.
const LABEL_RESUMO: Record<string, string> = {
  em_estoque: "em estoque",
  consumido: "consumidas",
  expedido: "expedidas",
  perdido: "perdidas",
  devolvido: "devolvidas",
};

const ERROS_GERAR: Record<string, string> = {
  item_nao_serializado: 'Este item não está marcado como "cada unidade tem etiqueta".',
  lote_grande: "Máximo de 500 por vez.",
  // Antes dizia só "duas gerações ao mesmo tempo — tente de novo", e tentar de
  // novo NUNCA resolvia o caso real: dois itens com o mesmo SKU recalculam o
  // mesmo código a cada tentativa. A causa provável entra na frase.
  corrida_de_sequencial: "O sequencial das etiquetas colidiu. Confira se outro item usa o mesmo SKU — nesse caso, tentar de novo não resolve.",
  item_nao_encontrado: "Item não encontrado.",
  dados_invalidos: "Quantidade inválida.",
};

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function UnidadesDoItem({ itemId, pecasEmEstoque, onSku, onContagem, podeGerar = true }: {
  itemId: string;
  /** `estoque:ajustar` — quem só olha vê a lista, mas não gera etiqueta nova.
   *  Padrão `true` porque as provas de `/dev-*` montam esta tela sem servidor
   *  e nasceriam em modo leitura sem nada explicando. */
  podeGerar?: boolean;
  /** Peças em estoque segundo o CADASTRO do item (`estoque_itens.quantidade`,
   *  que a trigger mantém como a SOMA das etiquetas — a caixa de 50 conta 50).
   *  Vem de quem abriu o editor porque a contagem por status desta tela conta
   *  ETIQUETAS, não peças, e os dois números só coincidem quando não há caixa
   *  nenhuma. Sem ele a tela mostra o número de etiquetas, como antes. */
  pecasEmEstoque?: number | null;
  /** O SKU que o servidor atribuiu quando o item ainda não tinha um. Sem isto
   *  o editor aberto por cima continua com o campo vazio em memória, e o
   *  Salvar seguinte manda `sku: null` — as etiquetas recém-impressas ficam
   *  sem dono no cadastro e a próxima geração inventa outro SKU. */
  onSku?: (sku: string) => void;
  /** Quantas etiquetas estão em estoque agora — quem chama usa pra avisar
   *  antes de desligar a contagem por etiqueta (o banco recusa). */
  onContagem?: (emEstoque: number) => void;
}) {
  const [unidades, setUnidades] = useState<UnidadeRow[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState<string | null>(null);
  const [painelAberto, setPainelAberto] = useState(false);
  const [quantidade, setQuantidade] = useState("10");
  /** Peças por etiqueta. "1" = uma etiqueta por peça, o comportamento de sempre. */
  const [pecasPorEtiqueta, setPecasPorEtiqueta] = useState("1");
  const [busy, setBusy] = useState(false);
  const [erroGerar, setErroGerar] = useState<string | null>(null);
  // 380px é a largura NO COMPUTADOR. No celular a folha é a tela inteira — e o
  // inline do painel não deixava: a 430px ela nascia com 380px e 50px de tira
  // preta na direita; a 390px, 10px.
  const largura = useLarguraDeFolha(380);

  // Callbacks por ref: entram como função nova a cada render do editor, e nas
  // dependências do `useCallback` fariam o `carregar` renascer em loop.
  const onSkuRef = useRef(onSku);
  const onContagemRef = useRef(onContagem);
  useEffect(() => { onSkuRef.current = onSku; onContagemRef.current = onContagem; });

  const carregar = useCallback(() => {
    setCarregando(true);
    fetch(`/api/estoque/unidades?item=${itemId}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) { setErroCarregar(d.detalhe || "Não foi possível carregar as unidades."); return; }
        setErroCarregar(null);
        setUnidades(d.unidades ?? []);
        setContagem(d.contagem ?? {});
        onContagemRef.current?.(Number(d.contagem?.em_estoque ?? 0) || 0);
        const primeiro = (d.unidades ?? [])[0] as UnidadeRow | undefined;
        const sku = primeiro ? partirCodigo(primeiro.codigo)?.sku : null;
        if (sku) onSkuRef.current?.(sku);
      })
      .catch(() => setErroCarregar("Não foi possível carregar as unidades."))
      .finally(() => setCarregando(false));
  }, [itemId]);

  useEffect(carregar, [carregar]);

  async function gerar() {
    const n = Math.trunc(Number(quantidade)) || 0;
    if (n <= 0 || busy) return;
    setBusy(true);
    setErroGerar(null);
    try {
      const r = await fetch("/api/estoque/unidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `quantidade` continua sendo PEÇAS. `pecasPorEtiqueta` é o que faz a
        // caixa: 400 peças em caixas de 50 viram 8 papéis, não 400.
        body: JSON.stringify({ item_id: itemId, quantidade: n, pecasPorEtiqueta: porCaixa }),
      });
      const d = await r.json();
      if (d.ok) {
        // O servidor pode ter ATRIBUÍDO um SKU agora (item que não tinha): o
        // código da primeira unidade carrega qual foi.
        const codigo = (d.unidades ?? [])[0]?.codigo as string | undefined;
        const sku = codigo ? partirCodigo(codigo)?.sku : null;
        if (sku) onSkuRef.current?.(sku);
        // A frase vem do PLANO, não do número digitado: com caixa os dois
        // deixaram de ser o mesmo, e é o papel que sai da impressora.
        toast.ok(d.plano?.frase ?? `${n} etiqueta${n === 1 ? "" : "s"} gerada${n === 1 ? "" : "s"}.`);
        setPainelAberto(false);
        setQuantidade("10");
        setPecasPorEtiqueta("1");
        carregar();
      } else {
        setErroGerar(ERROS_GERAR[d.error] ?? d.detalhe ?? "Falha ao gerar etiquetas.");
      }
    } catch {
      setErroGerar("Falha ao gerar etiquetas.");
    } finally {
      setBusy(false);
    }
  }

  // ── Peças ≠ etiquetas ──────────────────────────────────────────────────────
  // A contagem por status conta ETIQUETAS (a caixa lacrada de 50 folhas é UMA).
  // Quem confere a prateleira precisa do número de PEÇAS. Os dois só divergem
  // quando existe caixa no meio, e é só aí que a frase vira dois números — dizer
  // "8 peças em 8 etiquetas" o tempo todo seria ruído.
  //
  // A comparação é `>` de propósito: `pecasEmEstoque` vem do cadastro carregado
  // quando o editor abriu, então logo depois de gerar etiquetas ele está ATRÁS
  // da contagem desta tela. Menor ou igual = número velho, e aí a tela cai na
  // frase de sempre em vez de anunciar uma diferença que não existe.
  const etiquetasEmEstoque = contagem.em_estoque ?? 0;
  const pecas = Math.max(0, Math.trunc(Number(pecasEmEstoque) || 0));
  const emEstoque = pecas > etiquetasEmEstoque
    ? `${plural(pecas, "peça", "peças")} em ${plural(etiquetasEmEstoque, "etiqueta", "etiquetas")}`
    : `${etiquetasEmEstoque} ${LABEL_RESUMO.em_estoque}`;

  // ── Nunca gerou etiqueta ≠ gerou e deu baixa em todas ──────────────────────
  // O `resumo` começava SEMPRE por "N em estoque", então a frase de vazio logo
  // abaixo ("Nenhuma etiqueta gerada ainda.") era código morto: um item recém
  // marcado como etiquetado abria dizendo um seco "0 em estoque", que se lê
  // como saldo zerado — e não como "isto aqui ainda não existe, gere". Item que
  // teve todas consumidas continua mostrando "0 em estoque · 4 consumidas",
  // que é a verdade dele.
  const nuncaGerou = Object.values(contagem).every((n) => (Number(n) || 0) === 0);

  const resumo = nuncaGerou
    ? ""
    : [
      emEstoque,
      // `replace(/s$/)`: os quatro rótulos de baixa são femininos plurais
      // ("consumidas", "expedidas", "perdidas", "devolvidas"), então tirar o "s"
      // dá o singular dos quatro. Antes saía "1 consumidas".
      ...MOTIVOS_BAIXA.map((m) => m.key).filter((k) => (contagem[k] ?? 0) > 0)
        .map((k) => `${contagem[k]} ${contagem[k] === 1 ? LABEL_RESUMO[k].replace(/s$/, "") : LABEL_RESUMO[k]}`),
    ].join(" · ");

  // Teto de tela: a API já devolve no máximo 500, mas a lista visível fica em
  // 20 — é "mais recentes", não um extrato inteiro.
  const recentes = unidades.slice(0, 20);
  const n = Math.trunc(Number(quantidade)) || 0;
  // O plano é a MESMA conta que o servidor refaz (lib/estoque-plano-de-etiquetas):
  // a tela nunca promete um número que a gravação não vai cumprir.
  const porCaixa = Math.max(1, Math.trunc(Number(pecasPorEtiqueta)) || 1);
  const plano = planoDeEtiquetas(n, porCaixa);
  const problemaPlano = problemaDoPlano(plano);

  return (
    <div style={{ marginTop: 14, padding: 12, borderRadius: "var(--r-md)", background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: recentes.length || carregando || erroCarregar ? 10 : 0 }}>
        {/* `1 1 180px` e não `flex: 1`: com base zero e shrink, a 320px este
            bloco encolhia até ~95px pra caber ao lado do botão — o título
            quebrava em "Unidades / etiquetadas" e o resumo virava quatro
            linhas de duas palavras. Com base de 180px a linha QUEBRA e o
            botão desce inteiro, alinhado à esquerda; no computador nada
            muda, porque lá os dois cabem lado a lado. */}
        <div style={{ minWidth: 0, flex: "1 1 180px" }}>
          <span style={{ fontSize: 12.5, fontWeight: 800 }}>Unidades etiquetadas</span>
          <div style={{ fontSize: 11.5, color: erroCarregar ? "var(--perigo)" : "var(--text-dim)", marginTop: 2 }}>
            {erroCarregar ? erroCarregar : carregando ? "Carregando…" : resumo || "Nenhuma etiqueta gerada ainda."}
          </div>
        </div>
        {/* Gerar etiqueta é ADICIONAR quantidade (cada etiqueta é uma unidade
            a mais, pela trigger que reconta). Sem `estoque:ajustar` a lista
            continua visível — ver o que existe na prateleira é leitura — mas o
            botão sai: deixá-lo só pra colher 403 no fim é pior que não tê-lo. */}
        {podeGerar && (
          <Botao variante="primario" tamanho="sm" icone="tag" onClick={() => setPainelAberto(true)}>
            Gerar etiquetas
          </Botao>
        )}
      </div>

      {!carregando && !erroCarregar && recentes.length > 0 && (
        // Uma definição de colunas só: tabela no computador, cartão no celular.
        // O selo da caixa mora ao lado do código nos dois — o cartão do
        // `DataList` não corta o título, então o selo não some mais nele.
        <DataList itens={recentes} colunas={COLUNAS_UNIDADE} chaveDe={(u) => u.id}
          rotulo="Unidades etiquetadas" minWidth={360} densa />
      )}

      {painelAberto && (
        <PainelLateral
          titulo="Gerar etiquetas"
          // Explícito porque agora existe o outro caso: a caixa lacrada, UMA
          // etiqueta valendo várias peças, nasce da conferência da produção —
          // com a quantidade que a pessoa registrou ao concluir. Aqui é uma
          // peça por etiqueta, e quem clica precisa saber qual das duas é.
          subtitulo={porCaixa > 1 ? "uma etiqueta por CAIXA" : "uma etiqueta por peça"}
          largura={largura}
          onFechar={() => { if (!busy) setPainelAberto(false); }}
          rodape={
            <Acoes>
              <Botao variante="sutil" onClick={() => setPainelAberto(false)} disabled={busy}>Cancelar</Botao>
              <Botao variante="primario" icone="tag" onClick={gerar}
                disabled={busy || !!problemaPlano} carregando={busy}>
                {plano.totalEtiquetas > 0 ? `Gerar ${plano.totalEtiquetas}` : "Gerar"}
              </Botao>
            </Acoes>
          }
        >
          <Campo label="Quantas peças entraram" erro={erroGerar ?? undefined}
            dica={erroGerar ? undefined : "O número que vira saldo na prateleira."}>
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                autoFocus
              />
            )}
          </Campo>

          {/* ── A CAIXA ────────────────────────────────────────────────────
              O galpão guarda coisa LACRADA: uma caixa de 50 folhas é UMA
              etiqueta valendo 50, e ninguém etiqueta as 50 uma a uma. Nasce
              em 1 — quem não usa caixa não vê diferença nenhuma. */}
          <Campo label="Peças por etiqueta"
            dica={porCaixa > 1
              ? "Cada papel vale esta quantidade. Bipar a etiqueta tira a caixa inteira."
              : "Deixe 1 se cada peça leva a própria etiqueta."}>
            {(id) => (
              <input
                id={id}
                type="number"
                min={1}
                value={pecasPorEtiqueta}
                onChange={(e) => setPecasPorEtiqueta(e.target.value)}
              />
            )}
          </Campo>

          {/* A prévia ANTES de gastar rolo: com caixa, o número de PAPÉIS e o
              de PEÇAS deixaram de ser o mesmo, e o botão só mostra um deles. */}
          <p style={{
            margin: "4px 0 0", padding: "10px 12px", borderRadius: "var(--r-sm)",
            border: `1px solid ${problemaPlano ? "var(--perigo)" : "var(--border)"}`,
            background: "var(--surface)", fontSize: 13, lineHeight: 1.45,
            color: problemaPlano ? "var(--perigo)" : "var(--text)",
          }}>
            {problemaPlano ?? plano.frase}
          </p>
        </PainelLateral>
      )}
    </div>
  );
}
