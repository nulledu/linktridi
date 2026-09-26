"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { Icon } from "../Icon";
import {
  HIERARQUIA_DEFS, LABEL_SEM_HIERARQUIA, SEM_HIERARQUIA,
  abaDoItem, hierarquiaLabel, naoClassificado,
} from "@/lib/estoque-hierarquia";
import { atributosDe } from "../ui/campos";
import { Abas } from "../ui/Abas";
import { Botao } from "../ui/controles";
import { useParamDaUrl } from "../ui/useParamDaUrl";
import { useAbrirFechar } from "../ui/micro";
import { useSticky } from "../useSticky";
import { EtiquetarEmLote } from "./EtiquetarEmLote";
import { ImportarPlanilha } from "./ImportarPlanilha";
import { DoisEixos, TriarEmLote } from "./TriarEmLote";
import { QuemFazEmLote } from "./QuemFazEmLote";
import { salvarEmSegundoPlano } from "../ui/salvarEmSegundoPlano";
import { ErroDeCarga, EstadoVazio } from "./EstadoVazio";
import { ItemEditor } from "./ItemEditor";
import { AjusteDeQuantidade } from "./AjusteDeQuantidade";
import type { Item } from "./tipos";

/** O texto pesquisável do item — a MESMA conta pro filtro da aba e pra busca
 *  nas outras abas. Duas cópias fariam a segunda achar o que a primeira não
 *  acha, e o item pareceria sumir de novo. */
const casaBusca = (i: Item, termo: string) =>
  `${i.nome} ${i.sku ?? ""} ${i.categoria ?? ""} ${i.cor ?? ""}`.toLowerCase().includes(termo);

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Tem ponto de reposição? É a MESMA conta que o servidor faz pra decidir quem
 *  entra na verificação de reabastecimento (`.gt("qtd_minima", 0)`) e na
 *  Produção do dia. Item com mínimo 0 não é "ok": é um item que nenhuma régua
 *  mede — e sem esta conta na tela, o catálogo inteiro parecia em dia. */
const temMinimo = (i: Item) => Number(i.qtd_minima) > 0;

// Estoque NOVO (catálogo manual) dividido nas 8 hierarquias de material. CRUD completo.
export function CatalogoClient() {
  const [itens, setItens] = useState<Item[]>([]);
  // Duas permissões desde a separação: `estoque:cadastrar` (o QUE existe) e
  // `estoque:ajustar` (QUANTO tem). Não existe mais um "podeGerir" único —
  // cada botão desta tela pertence a uma das duas.
  const [podeCadastrar, setPodeCadastrar] = useState(false);
  const [podeAjustar, setPodeAjustar] = useState(false);
  const [podeVerCusto, setPodeVerCusto] = useState(false);
  const [busca, setBusca] = useState("");
  // `/estoque?busca=…` chega da busca universal do Início da Central.
  useParamDaUrl("busca", setBusca);
  const [cat, setCat] = useState("");
  // Lembrada, igual à aba de fora: matéria-prima tem 7 dos 192 itens e peça
  // tem 70 — abrir sempre na aba mais vazia fazia quem estava configurando
  // peças ontem recomeçar do zero hoje.
  //
  // O inicial é "" (ninguém escolheu ainda) e NÃO "materia_prima": um default
  // fixo faz a primeira tela do módulo ser uma das oito hierarquias sorteada
  // por acaso — com 7 dos 192 itens, quem abre o Estoque pela primeira vez vê
  // quase nada e conclui que o catálogo está vazio. Sem escolha salva, a aba
  // aberta é a que tem mais itens (`hierPadrao`), que é onde o trabalho está.
  const [hierSalva, setHier] = useSticky<string>("estoque.hierarquia", "");
  /** "" = todos · "sim" = já etiquetado · "nao" = ainda sem etiqueta. */
  const [etiq, setEtiq] = useState<"" | "sim" | "nao">("");
  /** Só os que não têm ponto de reposição — a outra metade de "quanto falta
   *  configurar", e a única forma de agir sobre ela sem abrir item por item. */
  const [soSemMin, setSoSemMin] = useState(false);
  const [lote, setLote] = useState(false);
  const [triagem, setTriagem] = useState(false);
  // "Quem faz" em lote: Máquinas/Produção/Preparo pra vários itens de uma vez.
  const [quemFaz, setQuemFaz] = useState(false);
  const [importar, setImportar] = useState(false);
  const [novo, setNovo] = useState(false);
  // Booleano: o editor lê `itens`/`hier` de props, que continuam de pé durante
  // os 150ms da saída — por isso aqui não precisa guardar o último valor.
  const mNovo = useAbrirFechar(novo, "--modal-close-dur");
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);
  const [reaBusy, setReaBusy] = useState(false);
  const [reaMsg, setReaMsg] = useState<string | null>(null);

  async function reabastecer() {
    setReaBusy(true); setReaMsg(null);
    try {
      const r = await fetch("/api/estoque/reabastecer", { method: "POST" });
      // `.catch` no corpo: uma resposta que não seja JSON (HTML de erro, 502 do
      // proxy) rejeitaria aqui e o `finally` limparia o "Verificando…" sem
      // dizer nada — o botão voltaria ao normal como se tivesse dado certo.
      const d = await r.json().catch(() => ({} as { criadas?: number; abaixo?: number; itens?: { resultado: string }[] }));
      if (r.ok) {
        // ── "Tudo ok" só vale sobre quem é medido ──────────────────────────
        // A verificação só olha item com `qtd_minima > 0`. Com o mínimo
        // preenchido em 13 dos 192, "nenhum item abaixo do mínimo" afirmava
        // cobertura sobre 7% do catálogo — e quem chega lê que está tudo
        // certo e nunca descobre que precisa preencher o mínimo. O número dos
        // que ficaram de fora vai junto, sempre.
        const resto = semMinimoTotal > 0
          ? ` ${semMinimoTotal} ${semMinimoTotal === 1 ? "item ainda não tem mínimo e não é medido por nada" : "itens ainda não têm mínimo e não são medidos por nada"}.`
          : "";
        // Automação desligada: "nada abaixo do mínimo" mentiria quando na
        // verdade tem item faltando e ninguém criou nada de propósito.
        const desligada = (d.itens ?? []).some((i: { resultado: string }) => i.resultado === "automacao_desligada");
        setReaMsg(d.criadas && d.criadas > 0
          ? `${d.criadas} atividade(s) de reposição criada(s) (${d.abaixo} item(ns) abaixo do mínimo).${resto}`
          : desligada
            ? `Automação desligada — ${d.abaixo ?? 0} item(ns) abaixo do mínimo, mas nenhuma atividade foi criada. Ligue em Produção do dia, ou crie a atividade na mão.`
            : `Nada abaixo do mínimo entre os ${comMinimoTotal} ${comMinimoTotal === 1 ? "item que tem regra" : "itens que têm regra"}.${resto}`);
        load();
      }
      else setReaMsg("Falha ao verificar reabastecimento.");
    } finally { setReaBusy(false); setTimeout(() => setReaMsg(null), 8000); }
  }

  // ── Falhar não é o mesmo que estar vazio ───────────────────────────────────
  // Sem `r.ok` e sem `catch`, um 401 de sessão expirada (o middleware devolve
  // JSON) ou um 500 viravam "catálogo vazio" — e como `podeGerir` também vinha
  // falso, sumiam os botões de Importar, Novo item e Repor estoque. A tela
  // ficava indistinguível de um catálogo legitimamente zerado, que é
  // exatamente o estado do primeiro dia. Pior: uma resposta que não fosse JSON
  // rejeitava o `await r.json()` e o `setLoading(false)` nunca rodava — a tela
  // presa em "Carregando…" pra sempre. As abas Localização e Fornecedores já
  // faziam isso certo; o Catálogo, que é a porta do módulo, tinha ficado fora.
  async function load() {
    try {
      const r = await fetch("/api/estoque-itens", { cache: "no-store" });
      if (!r.ok) { setErroCarga(true); return; }
      const d = await r.json();
      setItens(d.itens ?? []); setPodeCadastrar(!!d.podeCadastrar); setPodeAjustar(!!d.podeAjustar); setPodeVerCusto(!!d.podeVerCusto);
      setErroCarga(false);
    } catch {
      setErroCarga(true);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // ── Os não classificados ───────────────────────────────────────────────────
  // `hierarquia` nula (ou fora da lista) não casa com nenhuma das oito abas: o
  // item existe no banco e NÃO existe na tela. Aqui a ausência vira uma aba com
  // nome e contagem — é ela que faz os 81 itens da planilha do galpão serem
  // vistos em vez de enterrados.
  // Sem escolha salva, a aba aberta é a que tem mais itens — não uma sorteada
  // no código. Repare que isso NÃO grava nada: enquanto a pessoa não tocar numa
  // aba, não existe escolha dela pra lembrar, e inventar uma no localStorage
  // seria fingir que existiu.
  const hierPadrao = useMemo(() => {
    const conta = new Map<string, number>();
    for (const i of itens) if (i.hierarquia) conta.set(i.hierarquia, (conta.get(i.hierarquia) ?? 0) + 1);
    let melhor = ""; let n = 0;
    for (const h of HIERARQUIA_DEFS) {
      const q = conta.get(h.key) ?? 0;
      if (q > n) { melhor = h.key; n = q; }
    }
    return melhor || HIERARQUIA_DEFS[0].key;
  }, [itens]);
  const hier = hierSalva || hierPadrao;

  const semHier = hier === SEM_HIERARQUIA;
  const naoClass = useMemo(() => itens.filter((i) => naoClassificado(i.hierarquia)), [itens]);
  const daHier = useMemo(
    () => (semHier ? naoClass : itens.filter((i) => i.hierarquia === hier)),
    [itens, naoClass, hier, semHier],
  );
  /**
   * Os chips de categoria seguem O QUE ESTÁ NA TELA.
   *
   * Eles saíam de `daHier` — a aba aberta. Depois que buscar passou a varrer o
   * catálogo inteiro isso virou incoerência: o resultado trazia itens de sete
   * hierarquias e o filtro só oferecia as categorias de uma. A pessoa via
   * "Madeira" na lista e não tinha como filtrar por ela.
   *
   * Derivam do resultado ANTES do filtro de categoria (senão escolher uma
   * apagaria todas as outras opções e não haveria como trocar).
   */
  const categorias = useMemo(() => {
    const bt = busca.trim().toLowerCase();
    const base = bt ? itens.filter((i) => casaBusca(i, bt)) : daHier;
    return [...new Set(base.map((i) => i.categoria).filter(Boolean) as string[])].sort();
  }, [itens, daHier, busca]);
  // Sugestão de categoria na triagem vem do catálogo INTEIRO, não da aba: quem
  // está classificando um insumo solto deve poder reusar "Tintas" mesmo que
  // nenhum item sem hierarquia use essa categoria ainda.
  const categoriasDoCatalogo = useMemo(
    () => [...new Set(itens.map((i) => i.categoria).filter(Boolean) as string[])],
    [itens],
  );
  /**
   * BUSCAR É UM MODO, NÃO UM FILTRO DA ABA.
   *
   * A busca procurava dentro de `daHier` — a hierarquia aberta. Quem digitava
   * "cola" estando em Peça recebia "nada nesta hierarquia" com a cola
   * cadastrada em Insumo, e a saída era uma linha discreta dizendo "3 em outras
   * abas". Ou seja: pra achar, era preciso primeiro adivinhar a categoria — o
   * contrário do que uma busca serve.
   *
   * Com termo digitado, a aba sai do caminho e o catálogo INTEIRO é procurado.
   * Sem termo, a aba volta a mandar: navegar por hierarquia continua sendo o
   * jeito de percorrer o catálogo, e é o que a tela faz por padrão.
   *
   * Os outros filtros (categoria, etiqueta, sem mínimo) continuam valendo nos
   * dois modos — eles refinam o que já está na tela, seja lá de onde veio.
   */
  const buscando = busca.trim().length > 0;

  // Categoria marcada que sumiu do resultado devolve lista vazia SEM explicar:
  // a pessoa buscou "cola", o chip "Madeira" da aba anterior continuava ligado,
  // e ela conclui que a cola não existe. Some sozinho quando deixa de existir —
  // o filtro que não tem o que filtrar não é filtro, é armadilha.
  useEffect(() => {
    if (cat && !categorias.includes(cat)) setCat("");
  }, [cat, categorias]);
  const filtrados = useMemo(() => {
    const bt = busca.trim().toLowerCase();
    const base = bt ? itens : daHier;
    return base.filter((i) =>
      (!cat || i.categoria === cat) &&
      (!etiq || (etiq === "sim" ? !!i.serializado : !i.serializado)) &&
      (!soSemMin || !temMinimo(i)) &&
      (!bt || casaBusca(i, bt)));
  }, [itens, daHier, cat, etiq, soSemMin, busca]);

  // ── A busca não pode perder item pra aba ───────────────────────────────────
  // A tela mostra UMA hierarquia por vez, então procurar "cola" estando em
  // Peça devolve "Nada nesta hierarquia" mesmo com a cola cadastrada — e no
  // não classificado isso é fatal: ele não está em aba nenhuma. Esta linha diz
  // onde o resto está, e leva lá num toque.
  const foraDaAba = useMemo(() => {
    const bt = busca.trim().toLowerCase();
    if (!bt) return [] as { chave: string; rotulo: string; n: number }[];
    const conta = new Map<string, number>();
    for (const i of itens) {
      if (!casaBusca(i, bt)) continue;
      const k = abaDoItem(i.hierarquia);
      if (k === hier) continue;
      conta.set(k, (conta.get(k) ?? 0) + 1);
    }
    return [...conta.entries()].map(([chave, n]) => ({
      chave, n, rotulo: chave === SEM_HIERARQUIA ? LABEL_SEM_HIERARQUIA : hierarquiaLabel(chave),
    }));
  }, [itens, busca, hier]);

  // Quantos desta hierarquia já são contados por etiqueta. `serializado` sempre
  // chegou da API e não era desenhado em lugar nenhum: dava pra abrir 192 itens
  // um a um e ainda não saber que zero estavam prontos, nem de onde retomar.
  const comEtiqueta = useMemo(() => daHier.filter((i) => i.serializado).length, [daHier]);
  const semEtiqueta = daHier.length - comEtiqueta;
  // A segunda régua da aba: quantos desta hierarquia têm ponto de reposição.
  // Item sem mínimo não entra na verificação de reabastecimento nem na Produção
  // do dia — ele não está "em dia", está fora de toda medição.
  const semMinimo = useMemo(() => daHier.filter((i) => !temMinimo(i)).length, [daHier]);
  const semMinimoTotal = useMemo(() => itens.filter((i) => i.ativo !== false && !temMinimo(i)).length, [itens]);
  const comMinimoTotal = useMemo(() => itens.filter((i) => i.ativo !== false && temMinimo(i)).length, [itens]);
  // O lote age no que está NA TELA (hierarquia + busca + categoria), tirando
  // quem já é etiquetado — é o que a pessoa acabou de escolher ver.
  const paraEtiquetar = useMemo(() => filtrados.filter((i) => !i.serializado), [filtrados]);
  const rotuloAba = semHier ? LABEL_SEM_HIERARQUIA : hierarquiaLabel(hier);
  // Quantos itens cada hierarquia tem — pro vazio de uma aba conseguir dizer
  // onde o resto está. A tela mostra UMA por vez, e "Nada nesta hierarquia" em
  // cima de um catálogo com 192 itens é uma frase que não ajuda ninguém.
  const porHierarquia = useMemo(() => {
    const conta = new Map<string, number>();
    for (const i of itens) conta.set(abaDoItem(i.hierarquia), (conta.get(abaDoItem(i.hierarquia)) ?? 0) + 1);
    return [...conta.entries()]
      .filter(([k, n]) => n > 0 && k !== hier)
      .map(([chave, n]) => ({ chave, n, rotulo: chave === SEM_HIERARQUIA ? LABEL_SEM_HIERARQUIA : hierarquiaLabel(chave) }))
      .sort((a, b) => b.n - a.n);
  }, [itens, hier]);

  // ── O primeiro dia ─────────────────────────────────────────────────────────
  // Catálogo zerado é o estado de quem acabou de chegar, e ele se parecia com
  // uma tela quebrada: oito abas vazias e um "Nada nesta hierarquia." O mapa do
  // que fazer precisa saber o que JÁ foi feito nas outras abas, e essas duas
  // contagens não existem no estado desta tela.
  //
  // Uma vez, e só no vazio: com catálogo cheio nenhuma destas requisições sai,
  // e não há ciclo nenhum aqui — é uma leitura de abertura, não um poll.
  const catalogoVazio = !loading && !erroCarga && itens.length === 0;
  const [base, setBase] = useState<{ locais: number; fornecedores: number } | null>(null);
  useEffect(() => {
    if (!catalogoVazio || base) return;
    let vivo = true;
    const ler = (url: string) => fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({})) as Promise<{ locais?: unknown[]; fornecedores?: unknown[] }>;
    Promise.all([ler("/api/estoque/locais"), ler("/api/estoque/fornecedores")]).then(([l, f]) => {
      if (vivo) setBase({ locais: (l.locais ?? []).length, fornecedores: (f.fornecedores ?? []).length });
    });
    return () => { vivo = false; };
  }, [catalogoVazio, base]);

  // ── Carregando é um estado, não um catálogo de zeros ───────────────────────
  // Enquanto a lista não chegava, a tela já desenhava a moldura INTEIRA com o
  // dado que ainda não existe: as oito hierarquias com badge "0", "Custo médio
  // matéria-prima: R$ 0,00" e a fileira de filtros — e só lá embaixo um
  // "Carregando…" de 13px. Ou seja, durante toda a espera o Estoque afirma que
  // não há nada em lugar nenhum. Numa aba aberta na rede do galpão isso fica
  // segundos na tela e é lido como "sumiu tudo". As outras seis abas já
  // diziam só "Carregando…"; o Catálogo, que é a porta do módulo, não.
  if (loading) return <p style={{ color: "var(--text-dim)" }}>Carregando o catálogo…</p>;

  if (erroCarga) {
    return <ErroDeCarga oQue="o catálogo" naoTem="o catálogo está vazio" onTentar={() => { setLoading(true); setErroCarga(false); load(); }} />;
  }

  if (catalogoVazio) {
    return (
      <>
        <EstadoVazio
          icone="box"
          titulo="O catálogo ainda está vazio"
          acoes={podeCadastrar ? <>
            <Botao variante="primario" icone="upload" onClick={() => setImportar(true)}>Importar planilha</Botao>
            <Botao icone="plus" onClick={() => setNovo(true)}>Cadastrar um item</Botao>
          </> : undefined}
          depoisTitulo="A ordem que evita refazer tudo depois:"
          depois={[
            {
              feito: (base?.locais ?? 0) > 0,
              texto: <><strong>Os lugares</strong>, na aba Localização — a prateleira onde a coisa mora. Sem eles o item nasce sem endereço, e ninguém acha nada no galpão pelo sistema.</>,
            },
            {
              feito: (base?.fornecedores ?? 0) > 0,
              texto: <><strong>Os fornecedores</strong>, na aba Fornecedores — de onde o item vem. Dá pra colar a lista inteira de uma vez.</>,
            },
            {
              texto: <><strong>Os itens</strong>, aqui. Cada um precisa de uma <strong>hierarquia</strong> (do que ele é feito): é ela que diz em qual aba ele aparece e qual é o prefixo do SKU.</>,
            },
            {
              texto: <><strong>Mínimo e etiqueta</strong>, na ficha de cada item. O mínimo é quando repor — em zero, o item não é medido por nada. A etiqueta é o que faz cada unidade ser contada, bipada e impressa.</>,
            },
          ]}
        >
          <p style={{ margin: 0 }}>
            O catálogo é a lista do que existe no galpão — da matéria-prima ao produto pronto.
            Tudo o mais no Estoque passa por aqui: só um item do catálogo pode ser recebido,
            contado, etiquetado ou bipado.
          </p>
          {podeCadastrar ? (
            <p style={{ margin: "8px 0 0" }}>
              Se a lista já existe numa planilha, <strong>importar</strong> traz todos de uma vez —
              é assim que 192 itens entram numa tarde. Cadastrar um só à mão também serve, e é a
              forma mais rápida de ver o ciclo inteiro funcionando até a etiqueta sair impressa.
            </p>
          ) : (
            <p style={{ margin: "8px 0 0" }}>
              Você pode ver o catálogo, mas não cadastrar. Quem cuida do estoque libera isso em
              Permissões (a sub-permissão <code>Cadastrar e apagar item</code>).
            </p>
          )}
        </EstadoVazio>

        {/* Primeiro dia: o catálogo está vazio, então o item recém-criado é o
            ÚNICO que existe — e mesmo aqui a aba precisa acompanhar, senão a
            tela sai do estado vazio direto pra uma hierarquia vazia. */}
        {mNovo.montado && <ItemEditor classe={mNovo.classe} podeVerCusto={podeVerCusto} itens={itens} onClose={() => setNovo(false)}
          onSaved={(criado) => { setNovo(false); if (criado) setHier(criado.hierarquia); load(); }} onAtualizado={load} />}
        {importar && (
          <ImportarPlanilha
            onFechar={() => setImportar(false)}
            onPronto={(r) => { load(); if (r.criados > 0) { setHier(SEM_HIERARQUIA); setCat(""); setEtiq(""); } }}
          />
        )}
      </>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
        Oito hierarquias de material, da matéria-prima ao produto. Cada uma só aceita
        na ficha técnica o que a regra permite.
        {podeVerCusto && <> · <strong style={{ color: "var(--text)" }}>Custo médio {semHier ? "dos não classificados" : rotuloAba.toLowerCase()}: {fmtBRL(filtrados.length ? filtrados.reduce((s, i) => s + (i.custo || 0), 0) / filtrados.length : 0)}</strong> <span style={{ opacity: .7 }}>(custos visíveis só p/ admin)</span></>}
      </p>
      {/* As 8 hierarquias são o ÚNICO eixo de classificação agora — o SEGUNDO
          nível do Estoque, e por isso a mesma peça de aba um degrau abaixo
          (`ui-abas--sub`). Antes disto havia DOIS controles empilhados dizendo
          quase a mesma coisa (repartição `tipo` + chip de `classe`); a
          hierarquia substitui os dois. `.tab-strip` faz as 8 rolarem de lado
          a 320px em vez de empilhar em três linhas. */}
      {/* A nona aba não é uma nona hierarquia: é o balde de quem ainda não tem
          nenhuma. Ela só aparece quando há alguém lá dentro — ou quando é a aba
          aberta, pra que classificar o último item não puxe o tapete de quem
          está olhando. */}
      {/* `overflowX: auto` no INVÓLUCRO, não na faixa: a `.tab-strip` só rola
          sozinha até 900px, e as abas de hierarquia já passavam da coluna no
          computador (medido: 1.31k de aba numa coluna de 1.12k) — a página
          inteira ganhava rolagem lateral, e a nona aba pioraria isso. O
          invólucro rola no lugar dela; a faixa continua intacta (nada de
          `mask-image`/`transform` novo, que é o que prende popover). */}
      {/* `quebra`: no computador as nove hierarquias aparecem TODAS, em duas
          linhas, em vez de quatro à vista e cinco escondidas atrás de uma
          rolagem lateral. No celular a faixa continua rolando — nove chips em
          cinco linhas empurrariam a lista pra fora da primeira dobra, e
          arrastar com o polegar é gesto barato. A classe no invólucro solta o
          recorte dele, senão a segunda linha nasce cortada. */}
      <div className="ui-abas--quebra-host" style={{ marginBottom: 14, overflowX: "auto" }}>
        <Abas className="ui-abas--sub" valor={hier} ariaLabel="Hierarquia de materiais" quebra
          onMuda={(k) => { setHier(k); setCat(""); }}
          itens={[
            ...HIERARQUIA_DEFS.map((h) => ({
              valor: h.key as string,
              rotulo: <><Icon name={h.icon} size={14} color="currentColor" /> {h.label}</>,
              badge: <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.8, background: "color-mix(in srgb, currentColor 16%, transparent)", padding: "1px 7px", borderRadius: 999 }}>
                {itens.filter((i) => i.hierarquia === h.key).length}
              </span>,
            })),
            ...(naoClass.length > 0 || semHier ? [{
              valor: SEM_HIERARQUIA,
              rotulo: <><Icon name="help-circle" size={14} color="currentColor" /> {LABEL_SEM_HIERARQUIA}</>,
              badge: <span style={{ fontSize: 11, fontWeight: 700, color: "var(--bg)", background: "var(--atencao)", padding: "1px 7px", borderRadius: 999 }}>
                {naoClass.length}
              </span>,
            }] : []),
          ]} />
      </div>

      {/* ── O aviso: "tem gente esperando classificação" ────────────────────
          Sem isto, "sem hierarquia" quer dizer INVISÍVEL: o item não está em
          nenhuma das oito abas e ninguém descobre que ele existe. O aviso
          aparece em QUALQUER aba (é o estado do catálogo, não da aba) e leva
          aos itens num toque. */}
      {!semHier && naoClass.length > 0 && (
        <div className="glass" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "11px 13px", borderRadius: "var(--r-md)", marginBottom: 12, border: "1px solid var(--atencao)" }}>
          <Icon name="alert-triangle" size={17} color="var(--atencao)" />
          <span style={{ fontSize: 12.5, flex: "1 1 200px", minWidth: 0 }}>
            <strong>{naoClass.length} {naoClass.length === 1 ? "item ainda sem hierarquia" : "itens ainda sem hierarquia"}</strong>
            {" "}— não aparecem em nenhuma das oito abas até serem classificados.
          </span>
          <Botao tamanho="sm" variante="primario" icone="help-circle" onClick={() => { setHier(SEM_HIERARQUIA); setCat(""); setEtiq(""); }}>
            Ver e classificar
          </Botao>
        </div>
      )}

      {/* ── Aba dos não classificados: o que fazer, e os dois eixos ─────────
          Aqui NÃO entra o bloco de etiquetagem: gerar etiqueta exige o prefixo
          de SKU da hierarquia, então etiquetar antes de classificar falha em
          todos os itens. Primeiro sai do buraco, depois etiqueta. */}
      {semHier && (
        <div className="glass" style={{ padding: "11px 13px", borderRadius: "var(--r-md)", marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, flex: "1 1 200px", minWidth: 0 }}>
              {naoClass.length === 0
                ? <>Nada esperando classificação. Todo item do catálogo já tem hierarquia.</>
                : <><strong>{naoClass.length} {naoClass.length === 1 ? "item espera" : "itens esperam"} classificação.</strong> Escolha a hierarquia de vários de uma vez — um a um é o que faz ninguém classificar.</>}
            </span>
            {podeCadastrar && filtrados.length > 0 && (
              <Botao tamanho="sm" variante="primario" icone="checks" onClick={() => setTriagem(true)}>
                Classificar {filtrados.length} de uma vez
              </Botao>
            )}
          </div>
          {/* Compacto aqui: a versão completa mora no painel de triagem, que é
              onde a escolha acontece. */}
          <DoisEixos compacto />
        </div>
      )}

      {/* ── Onde a etiquetagem está ────────────────────────────────────────
          A tarefa é configurar o catálogo inteiro, e ela leva dias. Sem um
          número e um filtro, não dá pra saber quanto falta nem retomar de onde
          parou — era preciso abrir item por item pra descobrir. */}
      {!semHier && daHier.length > 0 && (
        <div className="glass" style={{ padding: "11px 13px", borderRadius: "var(--r-md)", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* `flex: 1 1 200px` e não `marginLeft: auto` no botão: quando a
                linha quebra a 320px, o botão desce ALINHADO À ESQUERDA, junto
                do texto que ele completa, em vez de flutuar sozinho na direita. */}
            {/* "itens" e não o rótulo da hierarquia: "3 de 15 peça contados"
                obrigaria a concordar gênero e número com oito rótulos
                diferentes, e a hierarquia já está escolhida na aba acima. */}
            {/* Uma hierarquia com UM item só é o caso do primeiro dia, e a
                frase saía "1 de 1 itens já contados por etiqueta". O número
                que manda na concordância é o TOTAL da hierarquia, não o
                contado: "0 de 1 item já contado", "1 de 3 itens já contados". */}
            <span style={{ fontSize: 12.5, flex: "1 1 200px", minWidth: 0 }}>
              <strong>{comEtiqueta} de {daHier.length}</strong>{" "}
              {daHier.length === 1 ? "item já contado" : "itens já contados"} por etiqueta
              {/* A segunda régua vem colada na primeira, e não numa tela
                  separada: as duas respondem a mesma pergunta ("quanto falta
                  configurar"), e o mínimo era a metade invisível. */}
              {semMinimo > 0 && <>
                {" · "}
                <strong>{semMinimo} sem mínimo</strong>
                <span style={{ color: "var(--text-dim)" }}> (fora de toda medição)</span>
              </>}
            </span>
            {podeAjustar && paraEtiquetar.length > 0 && (
              <Botao tamanho="sm" variante="primario" icone="tag" onClick={() => setLote(true)}>
                Etiquetar {paraEtiquetar.length} de uma vez
              </Botao>
            )}
          </div>
          {/* Barra fina: a proporção é lida antes do número. */}
          <div aria-hidden style={{ height: 5, borderRadius: 999, background: "var(--surface)", overflow: "hidden", marginTop: 8 }}>
            <div style={{ width: `${daHier.length ? Math.round((comEtiqueta / daHier.length) * 100) : 0}%`, height: "100%", background: "var(--ok)", borderRadius: 999, transition: "width .3s" }} />
          </div>
          <div className="tab-strip" style={{ display: "flex", gap: 6, marginTop: 9, padding: 0 }}>
            <Chip on={etiq === "" && !soSemMin} onClick={() => { setEtiq(""); setSoSemMin(false); }}>Todos</Chip>
            <Chip on={etiq === "sim"} onClick={() => setEtiq("sim")}>Com etiqueta {comEtiqueta}</Chip>
            <Chip on={etiq === "nao"} onClick={() => setEtiq("nao")}>Sem etiqueta {semEtiqueta}</Chip>
            {/* Só quando há o que mostrar: um filtro que devolve zero é ruído
                na fileira que já rola de lado a 320px. */}
            {semMinimo > 0 && (
              <Chip on={soSemMin} onClick={() => setSoSemMin((v) => !v)}>Sem mínimo {semMinimo}</Chip>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 200 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={15} color="var(--text-dim)" /></span>
          <input {...atributosDe("busca")} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar (nome ou SKU)…"
            style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "9px 12px 9px 34px", color: "var(--text)", fontSize: 14 }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Chip on={cat === ""} onClick={() => setCat("")}>Todas</Chip>
          {categorias.map((c) => <Chip key={c} on={cat === c} onClick={() => setCat(c)}>{c}</Chip>)}
        </div>
        {podeAjustar && <Botao icone="refresh" onClick={reabastecer} carregando={reaBusy} style={{ marginLeft: "auto" }}>{reaBusy ? "Verificando…" : "Repor estoque"}</Botao>}
        {/* O galpão controla estoque numa planilha há meses e vai continuar
            recebendo planilha de fornecedor: a importação é porta permanente,
            do lado do cadastro manual, e não um script de carga. */}
        {podeCadastrar && <Botao variante="secundario" icone="upload" onClick={() => setImportar(true)}>Importar</Botao>}
        {/* Decide pra quem a ordem de reposição pode cair no tablet. Vale pros
            itens que o filtro deixou na tela — busque "almofada" e marque todos. */}
        {podeCadastrar && filtrados.length > 0 && (
          <Botao variante="secundario" icone="tools" onClick={() => setQuemFaz(true)}>Quem faz</Botao>
        )}
        {/* Na aba dos não classificados o botão diz "Novo item": criar já
            escolhendo a hierarquia é o normal, e "+ Não classificados" seria
            oferecer criar um item enterrado de propósito. */}
        {/* ── O botão diz o que FAZ, não onde está ──────────────────────────
            Ele se chamava pelo nome da aba: na Matéria-Prima ficava escrito
            "＋ Matéria-Prima", idêntico à aba logo acima, que também tem ícone.
            Quem procura "adicionar produto" varre a tela e não reconhece um
            botão com nome de categoria — foi assim que o dono concluiu que não
            dava pra cadastrar item nenhum, com o botão à vista na tela.
            A hierarquia não se perde: o modal abre em "Novo: Matéria-Prima". */}
        {podeCadastrar && <Botao variante="primario" icone="plus" onClick={() => setNovo(true)}>Cadastrar item</Botao>}
      </div>
      {/* Achou em outra aba: o catálogo mostra UMA hierarquia por vez, e quem
          procura pelo nome não sabe (nem deveria precisar saber) em qual delas
          o item está. Sem esta linha, item não classificado some da busca —
          ele não está em aba nenhuma. */}
      {/* Buscar passou a varrer o catálogo inteiro, então "em outras abas" virou
          mentira: elas JÁ estão na lista. A linha continua útil como mapa do
          resultado — diz de onde vieram e leva pra hierarquia num toque —, mas
          com o verbo certo. */}
      {buscando && foraDaAba.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Achados também em:
          </span>
          {foraDaAba.map((g) => (
            <Chip key={g.chave} on={false} onClick={() => { setHier(g.chave); setCat(""); setEtiq(""); }}>
              {g.rotulo} {g.n}
            </Chip>
          ))}
        </div>
      )}
      {reaMsg && <div className="glass" style={{ padding: "10px 14px", borderRadius: "var(--r-sm)", fontSize: 13, marginBottom: 12 }}>{reaMsg}</div>}

      {/* Sem ramo de "carregando" aqui: a espera sai bem antes, no topo do
          componente — chegar até esta linha já significa lista na mão. */}
      {filtrados.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ color: "var(--text-dim)" }}>
                {/* A busca VEM PRIMEIRO e diz o alcance dela. As frases abaixo
                    falam "desta hierarquia", que era verdade quando procurar
                    filtrava a aba; agora a busca varre o catálogo inteiro, e
                    mandar alguém procurar nas outras abas seria mandar procurar
                    onde já foi procurado. */}
                {buscando ? <>Nada no catálogo com <strong style={{ color: "var(--text)" }}>“{busca.trim()}”</strong> — a busca olhou todas as hierarquias.{cat ? " Talvez o filtro de categoria esteja estreitando demais." : ""}</>
                  : semHier ? "Nenhum item esperando classificação."
                  : soSemMin ? "Todos os itens desta hierarquia já têm ponto de reposição."
                  : etiq === "sim" ? "Nenhum item desta hierarquia é contado por etiqueta ainda."
                  : etiq === "nao" ? "Todos os itens desta hierarquia já são contados por etiqueta."
                  : cat ? "Nada encontrado com estes filtros."
                  : <>Nenhum item em <strong style={{ color: "var(--text)" }}>{rotuloAba}</strong> ainda.{podeCadastrar ? " Cadastre o primeiro pelo botão acima, ou traga a lista pronta por Importar." : ""}</>}
              </p>
              {/* Aba vazia num catálogo cheio: dizer só "não tem nada" faz
                  parecer que o catálogo inteiro sumiu. O resto está a um toque
                  daqui, e o número diz onde. */}
              {!busca.trim() && porHierarquia.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    O catálogo tem {porHierarquia.reduce((s, g) => s + g.n, 0)} em outras hierarquias:
                  </span>
                  {porHierarquia.map((g) => (
                    <Chip key={g.chave} on={false} onClick={() => { setHier(g.chave); setCat(""); setEtiq(""); setSoSemMin(false); }}>
                      {g.rotulo} {g.n}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          )
        : <CatalogoGrupos itens={filtrados} todos={itens} podeCadastrar={podeCadastrar} podeAjustar={podeAjustar} podeVerCusto={podeVerCusto} onChanged={load} />}

      {/* `itens` vai junto: o editor precisa do catálogo (seletor de componente
          e SKUs já usados) e ele está AQUI, recém-baixado. Sem a prop, cada
          abertura de modal rebaixava os 192 itens inteiros de novo. */}
      {/* `hierarquiaInit` só quando a aba É uma hierarquia: mandar
          "sem_hierarquia" faria o editor nascer com um valor que a API recusa. */}
      {/* ── Depois de cadastrar, a vista vai ATÉ o item ───────────────────────
          O botão se chama pelo nome da aba e manda `hierarquiaInit={hier}`, mas
          o modal deixa trocar a hierarquia livremente. Quem abre pela aba
          "Matéria-Prima", escolhe "Processada" e salva perdia o item de vista:
          a lista atrás mostra UMA hierarquia por vez e continuava na antiga.
          Sem toast, sem lista mudando, isso é indistinguível de "não salvou" —
          e foi assim que dois itens do dono nasceram sem ele ver.

          Os filtros caem junto pelo mesmo motivo: um chip de categoria ou uma
          busca vinda de `/estoque?busca=…` esconde o item recém-criado dentro
          da aba CERTA, e o efeito na tela é idêntico. É o que a importação
          logo abaixo já faz — o cadastro manual é que estava de fora. */}
      {/* `mNovo` (e não `novo` cru): sem a classe do ciclo de abertura o modal
          nasce em `.t-modal { opacity: 0; pointer-events: none }` e NUNCA
          acende — véu embaçando a tela e nada acontecendo, que foi exatamente
          o relato. As outras duas chamadas do editor já usavam o hook; esta
          tinha ficado pra trás. */}
      {mNovo.montado && <ItemEditor classe={mNovo.classe} hierarquiaInit={semHier ? undefined : hier} podeVerCusto={podeVerCusto} itens={itens} onClose={() => setNovo(false)}
        onSaved={(criado) => {
          setNovo(false);
          if (criado) { setHier(criado.hierarquia); setCat(""); setEtiq(""); setSoSemMin(false); setBusca(""); }
          load();
        }} onAtualizado={load} />}
      {lote && <EtiquetarEmLote itens={paraEtiquetar} rotuloHierarquia={rotuloAba} onFechar={() => setLote(false)} onPronto={load} />}
      {triagem && <TriarEmLote itens={filtrados} categoriasEmUso={categoriasDoCatalogo} onFechar={() => setTriagem(false)} onPronto={load} />}
      {quemFaz && <QuemFazEmLote itens={filtrados} onFechar={() => setQuemFaz(false)} onPronto={load} />}
      {/* Item importado nasce sem hierarquia. Recarregar e ficar na aba de
          antes esconderia os 81 recém-criados — a tela mostra UMA hierarquia
          por vez, e eles não estão em nenhuma. Levar pro balde dos não
          classificados é o que fecha o ciclo: importar → ver → classificar. */}
      {importar && (
        <ImportarPlanilha
          onFechar={() => setImportar(false)}
          onPronto={(r) => { load(); if (r.criados > 0) { setHier(SEM_HIERARQUIA); setCat(""); setEtiq(""); } }}
        />
      )}
    </div>
  );
}

// Paleta Apple-like — cor estável por nome de categoria.
// Categoria de produto não tem valor moral: a rampa só precisa DISTINGUIR.
// Usa --cat-* (e não os tokens de estado) pra que "Descartáveis" nunca herde
// o vermelho que em todo o resto do sistema significa erro.
const CAT_CORES = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)", "var(--cat-7)", "var(--cat-8)", "var(--cat-9)"];
function corCategoria(nome: string) {
  let h = 0; for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return CAT_CORES[h % CAT_CORES.length];
}

// Vista agrupada: nível único = categoria. A hierarquia já é a aba acima —
// um segundo nível de agrupamento (a antiga classe) repetiria a mesma
// informação que a pessoa já escolheu na fileira de cima.
function CatalogoGrupos({ itens, todos, podeCadastrar, podeAjustar, podeVerCusto, onChanged }: { itens: Item[]; todos: Item[]; podeCadastrar: boolean; podeAjustar: boolean; podeVerCusto: boolean; onChanged: () => void }) {
  const cats = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of itens) { const c = i.categoria || "Sem categoria"; const a = m.get(c); if (a) a.push(i); else m.set(c, [i]); }
    const arr = [...m.entries()].map(([categoria, list]) => ({
      categoria,
      itens: list,
      total: list.reduce((s, i) => s + (i.custo || 0), 0),
    }));
    arr.sort((a, b) => (a.categoria === "Sem categoria" ? 1 : b.categoria === "Sem categoria" ? -1 : a.categoria.localeCompare(b.categoria)));
    return arr;
  }, [itens]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 30 }}>
      {cats.map((g) => {
        const cor = corCategoria(g.categoria);
        return (
          <section key={g.categoria}>
            {/* Cabeçalho da categoria */}
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14, paddingBottom: 11, borderBottom: "1px solid var(--border)" }}>
              <span style={{ width: 5, height: 22, borderRadius: 3, background: cor, flex: "none", boxShadow: `0 0 16px ${cor}66` }} />
              <h3 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>{g.categoria}</h3>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)`, padding: "2px 9px", borderRadius: 999 }}>{g.itens.length}</span>
              {podeVerCusto && g.total > 0 && <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--text-dim)" }}>custo total <strong style={{ color: "var(--text)" }}>{fmtBRL(g.total)}</strong></span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
              {g.itens.map((i) => <Card key={i.id} item={i} todos={todos} podeCadastrar={podeCadastrar} podeAjustar={podeAjustar} podeVerCusto={podeVerCusto} onChanged={onChanged} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ fontSize: 12.5, padding: "6px 12px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer",
      background: on ? "color-mix(in srgb, var(--primary) 16%, transparent)" : "var(--surface)", color: on ? "var(--primary-texto)" : "var(--text)" }}>{children}</button>
  );
}

/** O botão − / + do cartão: 28px na tela, 44px de alvo no dedo (`.ui-toque`). */
const passoBtn = (desligado: boolean): React.CSSProperties => ({
  position: "relative", width: 28, height: 28, flex: "none", padding: 0,
  display: "grid", placeItems: "center", borderRadius: "var(--r-xs)",
  border: "1px solid var(--border)", background: "var(--surface)",
  cursor: desligado ? "default" : "pointer", opacity: desligado ? 0.4 : 1,
});

function Card({ item, todos, podeCadastrar, podeAjustar, podeVerCusto, onChanged }: { item: Item; todos: Item[]; podeCadastrar: boolean; podeAjustar: boolean; podeVerCusto: boolean; onChanged: () => void }) {
  const [edit, setEdit] = useState(false);
  const mEdit = useAbrirFechar(edit, "--modal-close-dur");
  const [ajuste, setAjuste] = useState(false);
  // O painel de quantidade sai animado: o booleano mora aqui, então é aqui que
  // a saída é segurada — os `onClose`/`onSalvo` seguem só desligando o estado.
  const aj = useAbrirFechar(ajuste, "--modal-close-dur");

  // ── − / + direto no cartão ────────────────────────────────────────────────
  // O número muda NA HORA (otimista); os toques em sequência viram UM pedido
  // (700 ms depois do último) pela fila de ui/salvarEmSegundoPlano.ts — que
  // guarda no navegador se a rede cair e avisa se o servidor recusar.
  // O pedido leva a trava `quantidade_antes` = o último número CONFIRMADO: se
  // alguém mexeu no estoque nesse meio-tempo, a rota recusa em vez de gravar
  // por cima. E nunca sai um segundo pedido com o primeiro no ar — com a
  // trava, ele bateria no número que o primeiro acabou de gravar e acusaria
  // um conflito que não existe; ele sai quando o primeiro volta.
  const [alvo, setAlvo] = useState<number | null>(null);
  const alvoRef = useRef<number | null>(null);
  const confirmado = useRef(item.quantidade);
  const noAr = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // A lista recarregou: com nada no ar, o banco é a verdade de novo.
    if (noAr.current) return;
    confirmado.current = item.quantidade;
    if (alvoRef.current === null || alvoRef.current === item.quantidade) { alvoRef.current = null; setAlvo(null); }
  }, [item.quantidade]);
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current); }, []);
  function mandarQtd() {
    const valor = alvoRef.current;
    if (noAr.current || valor === null || valor === confirmado.current) return;
    noAr.current = true;
    salvarEmSegundoPlano({
      chave: `estoque-qtd:${item.id}`, rotulo: `a quantidade de "${item.nome}"`,
      url: "/api/estoque-itens", method: "PATCH",
      body: { id: item.id, quantidade: valor, quantidade_antes: confirmado.current },
    }, {
      aoTerminar: (ok) => {
        noAr.current = false;
        if (ok) confirmado.current = valor;
        else { alvoRef.current = null; setAlvo(null); }   // recusado: o toast diz por quê, a lista traz o número real
        if (ok && alvoRef.current !== null && alvoRef.current !== valor) mandarQtd();
        else onChanged();
      },
    });
  }
  function passo(d: number) {
    const novo = Math.max(0, (alvoRef.current ?? item.quantidade) + d);
    alvoRef.current = novo; setAlvo(novo);
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(mandarQtd, 700);
  }
  const qtdMostrada = alvo ?? item.quantidade;
  // O − / + só existe pra quem ajusta, e só em item contado por número: item
  // etiquetado é contado pelas etiquetas (o banco recusa escrever a quantidade).
  const comPasso = podeAjustar && !item.serializado;

  const baixo = item.qtd_minima > 0 && qtdMostrada <= item.qtd_minima;
  // ── Um cartão, duas portas ────────────────────────────────────────────────
  // Quem cadastra abre a ficha inteira. Quem SÓ ajusta quantidade abre o painel
  // de quantidade: a ficha completa desabilitada, com nome, SKU, hierarquia e
  // o botão de apagar apagados, seria uma tela que promete o que a permissão
  // nega — e um convite a tentar clicar em tudo pra descobrir o que funciona.
  const abrir = podeCadastrar ? () => setEdit(true) : podeAjustar ? () => setAjuste(true) : undefined;
  return (
    <>
      <div className="glass glass-spec" style={{ borderRadius: "var(--r-md)", overflow: "hidden", cursor: abrir ? "pointer" : "default", display: "flex", flexDirection: "column" }} onClick={abrir}>
        {/* Imagem como banner SEPARADO — nunca sobrepõe o texto. */}
        <div style={{ position: "relative", aspectRatio: "1 / 1", width: "100%", background: "var(--surface)", display: "grid", placeItems: "center", flex: "none", borderBottom: "1px solid var(--border)" }}>
          {item.imagem_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={item.imagem_url} alt={item.nome} loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            : <Icon name="box" size={30} color="var(--text-dim)" />}
          {baixo && <span style={{ position: "absolute", top: 8, right: 8, fontSize: 9.5, fontWeight: 800, color: "#fff", background: "var(--atencao)", padding: "2px 7px", borderRadius: 999 }}>baixo</span>}
          {/* Selo, não tooltip: no celular não existe hover, e é justamente
              esta informação que diz se o item já foi configurado. */}
          {/* `color: var(--bg)` e não `#fff`: `--ok` é verde ESCURO no tema
              claro (bom com branco) e verde CLARO no escuro (branco sobre ele
              fica ilegível). O fundo do tema é, nos dois casos, o oposto da
              cor do selo. */}
          {item.serializado && (
            <span title="Contado pelas etiquetas" style={{ position: "absolute", top: 8, left: 8, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9.5, fontWeight: 800, color: "var(--bg)", background: "var(--ok)", padding: "2px 7px", borderRadius: 999 }}>
              <Icon name="tag" size={11} color="var(--bg)" /> etiqueta
            </span>
          )}
        </div>
        {/* Conteúdo em bloco sólido abaixo — texto sempre legível. */}
        <div style={{ padding: "11px 13px 13px", display: "flex", flexDirection: "column", gap: 3, flex: 1, background: "var(--bg)" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.nome}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.categoria || "—"}{item.sku ? ` · ${item.sku}` : ""}</div>
          {/* ── Custo e quantidade na mesma linha SÓ quando os dois cabem ─────
              Sem `flexWrap`, um custo de seis dígitos ("R$ 199.999,90", 110px
              a 18px de fonte) e uma quantidade de cinco ("99999 peças", 66px)
              somavam 208px numa caixa de 149px — e como o cartão tem
              `overflow: hidden`, os 59px que sobravam eram CORTADOS: a tela
              mostrava "9999" no lugar de 99999. Não era feio, era um número
              ERRADO. Acontece com dado real (R$ 1.234,56 + 312 un já passa de
              149px), não só no caso extremo.
              Com a quebra, a quantidade desce pra própria linha e continua
              encostada à direita (`marginLeft: auto` — `space-between` com um
              item só na segunda linha alinharia à esquerda). Medido a 1280px:
              rodapé 208/149 → 149/149; conteúdo do cartão 221/175 → 175/175. */}
          {comPasso ? (
            // No lugar do custo (pedido do dono, set/2026). O invólucro engole o
            // clique: sem isso, cada toque no − abria a ficha do item.
            // `.ui-toque` aumenta o ALVO pra 44px no dedo sem aumentar o botão
            // — dois botões de 44px não cabem no rodapé de 149px do cartão.
            <div onClick={(e) => e.stopPropagation()}
              style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: "auto", paddingTop: 8 }}>
              <button type="button" className="ui-toque" aria-label={`Tirar 1 de ${item.nome}`}
                disabled={qtdMostrada <= 0} onClick={() => passo(-1)} style={passoBtn(qtdMostrada <= 0)}>
                <Icon name="minus" size={14} color="var(--text)" />
              </button>
              <span style={{ minWidth: 30, textAlign: "center", lineHeight: 1 }}>
                <span className="stat" style={{ fontSize: 16, color: baixo ? "var(--atencao)" : "var(--text)" }}>{qtdMostrada}</span>
                <span style={{ display: "block", fontSize: 9.5, color: "var(--text-dim)", marginTop: 2 }}>{item.unidade}</span>
              </span>
              <button type="button" className="ui-toque" aria-label={`Somar 1 em ${item.nome}`}
                onClick={() => passo(1)} style={passoBtn(false)}>
                <Icon name="plus" size={14} color="var(--text)" />
              </button>
            </div>
          ) : (
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "2px 8px", marginTop: "auto", paddingTop: 8 }}>
            {podeVerCusto && item.custo != null
              ? <div style={{ minWidth: 0 }}><div className="stat" style={{ fontSize: 18, color: "var(--primary-texto, var(--primary))", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{fmtBRL(item.custo)}</div><div style={{ fontSize: 9.5, fontWeight: 600, color: "var(--text-dim)", marginTop: 2 }}>CUSTO</div></div>
              : <span />}
            {/* Item etiquetado: o número é a SOMA das peças das etiquetas (a
                caixa lacrada de 50 conta 50), imposta pela trigger do banco —
                não é o que alguém digitou. Ao lado do selo "etiqueta" logo
                acima, "312 un" convidava a ler "312 etiquetas"; "312 peças"
                não tem como ser lido errado. Item a granel mantém a unidade do
                cadastro, que é onde ela ainda descreve o número. */}
            <div style={{ textAlign: "right", flex: "none", marginLeft: "auto" }}>
              <span className="stat" style={{ fontSize: 16, color: baixo ? "var(--atencao)" : "var(--text)" }}>{item.quantidade}</span>
              <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}> {item.serializado ? (item.quantidade === 1 ? "peça" : "peças") : item.unidade}</span>
            </div>
          </div>
          )}
        </div>
      </div>
      {mEdit.montado && <ItemEditor classe={mEdit.classe} item={item} podeVerCusto={podeVerCusto} podeAjustar={podeAjustar} itens={todos} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); onChanged(); }} onAtualizado={onChanged} />}
      {aj.montado && <AjusteDeQuantidade item={item} classe={aj.classe} onClose={() => setAjuste(false)} onSalvo={() => { setAjuste(false); onChanged(); }} />}
    </>
  );
}

