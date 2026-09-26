"use client";

// ── Banco de provas dos PAINÉIS do Estoque, nos estados que ninguém vê ───────
//
// As provas que já existiam abrem cada tela no estado feliz: catálogo cheio,
// fila com caixas, item bem-comportado. Os defeitos de painel não moram lá —
// moram no passo 2 da importação (que só existe depois de um POST), no
// resultado da conferência (idem), na lista VAZIA, na lista de UMA linha, e no
// nome de 77 caracteres sem espaço que o galpão de verdade tem.
//
// Aqui a rede é dublê pra TUDO que estes painéis chamam, inclusive POST — é o
// único jeito de a tela chegar nesses estados sem credencial. Nada disto vai
// pra produção: a página tem a dupla trava (`DEV_ONLY_PREFIXES` já cobre o
// prefixo `/dev-estoque-item`, e o `notFound()` fica no `page.tsx`).

import { useState } from "react";
import { ConferirPainel } from "../../(plataforma)/estoque/ConferirPainel";
import { EtiquetarEmLote } from "../../(plataforma)/estoque/EtiquetarEmLote";
import { ImportarPlanilha } from "../../(plataforma)/estoque/ImportarPlanilha";
import { ItemEditor } from "../../(plataforma)/estoque/ItemEditor";
import { ReimprimirEtiqueta } from "../../(plataforma)/estoque/ReimprimirEtiqueta";
import { TriarEmLote } from "../../(plataforma)/estoque/TriarEmLote";
import { UnidadesDoItem } from "../../(plataforma)/estoque/UnidadesDoItem";
import type { Item } from "../../(plataforma)/estoque/tipos";
import type { PendenteConferencia } from "../../(plataforma)/estoque/conferencia-tipos";

// ── Os dados hostis ──────────────────────────────────────────────────────────
// Tirados da forma dos nomes reais do galpão (231 itens desde hoje), esticados
// até o pior caso plausível: 77 caracteres, e um sem espaço nenhum — que é o
// que quebra `overflow-wrap` mal posto.
const NOME_LONGO = "SACO ECOMMERCE PLASTICO BRANCO LEITOSO P (23x13,5cm) - PACOTE COM 500 UNIDADES";
const NOME_SEM_ESPACO = "ETIQUETAPLASTICOVERMELHOTRANSPARENTE50MLREFORCADOEXTRA";

function item(id: string, nome: string, extra: Partial<Item> = {}): Item {
  return {
    id, nome, hierarquia: null, produzido: false, serializado: false,
    categoria: null, imagem_url: null, unidade: "un", quantidade: 99999,
    qtd_minima: 0, ativo: true, sku: null, ...extra,
  };
}

const HOSTIS: Item[] = [
  item("h1", NOME_LONGO, { quantidade: 99999, sku: "EMB-00001", categoria: "Embalagens" }),
  item("h2", NOME_SEM_ESPACO, { quantidade: 12345, unidade: "pct" }),
  item("h3", "Rolo", { quantidade: 1 }),
];

const UM_SO: Item[] = [HOSTIS[2]];

// ── A rede dublê ─────────────────────────────────────────────────────────────
// GET e POST. O POST é o ponto: sem ele nem a conferência do passo 2 da
// importação nem o resultado da conferência existem na tela.
const PLANO = {
  novos: [
    { linha: 2, nome: NOME_LONGO, quantidade: 99999, qtd_minima: 500, unidade: "pct", fornecedor: "Distribuidora de Embalagens Sul do Brasil Ltda", escrita: "criar" },
    { linha: 3, nome: NOME_SEM_ESPACO, quantidade: 12345, qtd_minima: 0, unidade: "un", fornecedor: null, escrita: "criar" },
  ],
  atualizados: [
    {
      linha: 4, id: "i1", nome: "ROLO KRAFT 60cm", nomePlanilha: "rolo  kraft 60 cm",
      mudancas: [
        { campo: "quantidade", rotulo: "estoque", de: "0", para: "99999" },
        { campo: "qtd_minima", rotulo: "ponto de reposição", de: "0", para: "500" },
        { campo: "unidade", rotulo: "unidade", de: "un", para: "rl" },
      ],
      estoqueTravado: true, escrita: "atualizar",
    },
  ],
  iguais: [{ linha: 5, nome: "Pallet PBR" }],
  pulados: [{ linha: 6, id: "i2", nome: NOME_SEM_ESPACO, quantidadePlanilha: 40, quantidadeSistema: 12345 }],
  descartes: [{ linha: 7, nome: "ROLO-KRAFT", motivo: "quase_igual", detalhe: "Só a pontuação difere de “ROLO KRAFT” — criar as duas racharia o estoque em dois itens. Escolha a grafia na planilha e importe de novo." }],
  fornecedoresNovos: ["Distribuidora de Embalagens Sul do Brasil Ltda"],
  fornecedoresIgnorados: ["Papelaria Central"],
  totalLinhas: 7,
};

const ETIQUETAS_GRAVADAS = [
  {
    codigo: "EMB-00001-000001", unidadeId: "u1", nome: NOME_LONGO, quantidade: 99999,
    corDimensoes: "Branco leitoso · 230×135", local: "GAL-A", localDetalhe: "C3 · B2",
    responsavel: "Marina Alves", data: new Date().toISOString(),
  },
];

if (typeof window !== "undefined") {
  const original = window.fetch.bind(window);
  const ok = (body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

  window.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    const corpo = (() => { try { return JSON.parse(String(init?.body ?? "{}")); } catch { return {}; } })();

    if (url.startsWith("/api/estoque/importar")) {
      return corpo.confirmar
        ? ok({ criados: 2, atualizados: 1, fornecedoresCriados: 1, pulados: 1, falhas: [{ linha: 7, nome: NOME_SEM_ESPACO, detalhe: "O banco recusou: já existe um item com este nome (a comparação ignora acento e espaço a mais)." }] })
        : ok({ plano: PLANO, leitura: { comCabecalho: true, colunas: { nome: 0, quantidade: 1, qtd_minima: 2, unidade: 3, fornecedor: 4 }, separador: "\t", linhas: 7 } });
    }
    if (url.startsWith("/api/estoque-itens/classificar")) return ok({ atualizados: (corpo.ids ?? []).length });
    if (url.startsWith("/api/estoque/conferencias/destinos")) {
      return ok({ itens: [{ id: "d1", nome: NOME_LONGO, categoria: "Embalagens", serializado: true }] });
    }
    if (url.startsWith("/api/estoque/conferencias")) {
      return ok({ ok: true, resultado: "certo", quantidade: 99999, unidades: ["EMB-00001-000001"], etiquetas: ETIQUETAS_GRAVADAS, reaberta: false });
    }
    if (url.startsWith("/api/estoque/unidades/etiqueta")) return ok({ etiquetas: ETIQUETAS_GRAVADAS });
    if (url.startsWith("/api/estoque/unidades/preparar")) {
      return ok({ resultados: (corpo.itens ?? []).map((i: { item_id: string; quantidade: number }) => ({ item_id: i.item_id, nome: NOME_LONGO, ok: false, geradas: 0, sku: null, erro: "O sequencial das etiquetas colidiu. Confira se outro item usa o mesmo SKU — nesse caso, tentar de novo não resolve." })) });
    }
    // Lista VAZIA de propósito: é o estado que nenhuma prova mostrava.
    if (url.startsWith("/api/estoque/unidades")) return ok({ unidades: [], contagem: { em_estoque: 0 } });
    if (url.startsWith("/api/estoque/etiquetas")) return ok({ ok: true });
    if (url.startsWith("/api/estoque/fornecedores")) return ok({ fornecedores: [], podeGerir: true });
    if (url.startsWith("/api/estoque/locais")) return ok({ locais: [], podeGerir: true });
    if (url.startsWith("/api/estoque-itens")) return ok({ itens: HOSTIS });
    if (url.startsWith("/api/ficha-tecnica")) return ok({ ficha: [] });
    return original(entrada as RequestInfo, init);
  }) as typeof window.fetch;
}

const PENDENTE: PendenteConferencia = {
  id: "p1", produtoNome: null, tarefa: NOME_LONGO,
  detalhe: NOME_SEM_ESPACO,
  itemId: null, itemSerializado: null, categoria: "Embalagens",
  quantidadeAlvo: 99999, quantidadeFeita: 99999,
  executorId: "u9", executorNome: "Maria Aparecida dos Santos Nascimento",
  executorFotoUrl: null,
  concluidaEm: new Date().toISOString(), souEuQuemFez: false,
  fotoUrl: null, tempoRealMin: 12345, tempoEstimadoMin: 60,
  consumo: null, sugestoes: [],
};

type Qual =
  | "triar" | "triar-vazio" | "triar-um"
  | "lote" | "lote-um"
  | "importar" | "conferir" | "reimprimir" | "editor" | "unidades-vazio";

const BOTOES: { qual: Qual; rotulo: string }[] = [
  { qual: "triar", rotulo: "Classificar em lote (nomes hostis)" },
  { qual: "triar-um", rotulo: "Classificar em lote (uma linha)" },
  { qual: "triar-vazio", rotulo: "Classificar em lote (lista vazia)" },
  { qual: "lote", rotulo: "Etiquetar em lote (nomes hostis)" },
  { qual: "lote-um", rotulo: "Etiquetar em lote (uma linha)" },
  { qual: "importar", rotulo: "Importar planilha (passo 2 e 3)" },
  { qual: "conferir", rotulo: "Conferir (busca de destino + resultado)" },
  { qual: "reimprimir", rotulo: "Segunda via da etiqueta" },
  { qual: "editor", rotulo: "Editor de item (sem hierarquia, 99999)" },
  { qual: "unidades-vazio", rotulo: "Unidades etiquetadas (nenhuma)" },
];

export function ProvaPaineis() {
  const [qual, setQual] = useState<Qual | null>(null);
  const fechar = () => setQual(null);

  return (
    <div style={{ padding: 16, minHeight: "100dvh" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Prova — painéis do Estoque nos estados feios</h1>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 14, lineHeight: 1.55, maxWidth: 620 }}>
        Lista vazia, uma linha só, nome de 77 caracteres, nome sem espaço nenhum, número de 5
        dígitos, erro de rede e os passos que só existem depois de um POST. Meça{" "}
        <code>scrollWidth − clientWidth</code> a 320/430/900/1280 e os alvos por{" "}
        <code>offsetHeight</code> — e confira que o rodapé com o botão continua alcançável.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        {BOTOES.map((b) => (
          <button key={b.qual} onClick={() => setQual(b.qual)}
            style={{ minHeight: "var(--tap)", padding: "0 14px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontWeight: 700, cursor: "pointer" }}>
            {b.rotulo}
          </button>
        ))}
      </div>

      {qual === "triar" && <TriarEmLote itens={HOSTIS} categoriasEmUso={["Embalagens", "Máquinas"]} onFechar={fechar} onPronto={() => {}} />}
      {qual === "triar-um" && <TriarEmLote itens={UM_SO} categoriasEmUso={[]} onFechar={fechar} onPronto={() => {}} />}
      {qual === "triar-vazio" && <TriarEmLote itens={[]} categoriasEmUso={[]} onFechar={fechar} onPronto={() => {}} />}
      {qual === "lote" && <EtiquetarEmLote itens={HOSTIS} rotuloHierarquia="Embalagem" onFechar={fechar} onPronto={() => {}} />}
      {qual === "lote-um" && <EtiquetarEmLote itens={UM_SO} rotuloHierarquia="Embalagem" onFechar={fechar} onPronto={() => {}} />}
      {qual === "importar" && <ImportarPlanilha onFechar={fechar} onPronto={() => {}} />}
      {qual === "conferir" && <ConferirPainel pendente={PENDENTE} onFechar={fechar} onConferido={() => {}} />}
      {qual === "reimprimir" && <ReimprimirEtiqueta codigos={["EMB-00001-000001", "NAO-EXISTE-000009"]} onFechar={fechar} />}
      {qual === "editor" && <ItemEditor item={HOSTIS[0]} podeVerCusto onClose={fechar} onSaved={fechar} />}
      {qual === "unidades-vazio" && (
        <div style={{ maxWidth: 460 }}>
          <UnidadesDoItem itemId="h1" pecasEmEstoque={0} />
        </div>
      )}
    </div>
  );
}
