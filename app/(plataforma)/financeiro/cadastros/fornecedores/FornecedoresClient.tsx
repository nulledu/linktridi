"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../Icon";
import { confirmar, toast } from "../../../Toast";
import { Secao } from "../../../ui/Secao";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral } from "../../../ui/controles";
import { AvisoSchema, Barras, BotaoExportar, BotaoFin, Cabecalho, Cartao, Filtro, Filtros, CampoMarca, Categorias, FichaBloco, FichaContato, FichaLinha, FichaTopo, LimparFiltros, LinhaKpi, Marca, Selo, Tabela, TituloCartao, Vazio, SeletorEmpresa, enviarMarca, Alternativas, FaixaDePaineis, BuscaDaLista } from "../../ui";
import { ColunasPorEmpresa, KpiSeta } from "../../blocos";
import { dataBR, fatias, moeda } from "@/lib/financeiro/calculos";
import type { Fornecedor } from "@/lib/financeiro/tipos";

interface Rascunho {
  id: string | null;
  /** Em "Visão geral" a tela não tem empresa: o cadastro novo pergunta. */
  empresa_id: string;
  nome: string; cnpj: string;
  /** Mais de uma: um fornecedor de MDF que também vende cola não cabe numa só. */
  categorias: string[];
  contato_nome: string; contato_email: string; contato_fone: string;
  whatsapp: string;
  /** Prazo de PAGAMENTO — quando o dinheiro sai. */
  prazo_dias: string;
  /** Prazo de ENVIO — quando o material chega. Números diferentes. */
  prazo_envio_dias: string;
  forma_pagamento: string; ativo: boolean;
  pix_tipo: string; pix_chave: string;
  banco: string; agencia: string; conta_numero: string; aceita_boleto: boolean;
  inscricao_estadual: string; site: string;
  cidade: string; uf: string; endereco: string;
  observacao: string;
}

/** Os cinco tipos que o Banco Central aceita — o resto é digitação errada. */
const PIX_TIPOS = [
  { id: "cnpj", label: "CNPJ" },
  { id: "cpf", label: "CPF" },
  { id: "email", label: "E-mail" },
  { id: "telefone", label: "Telefone" },
  { id: "aleatoria", label: "Chave aleatória" },
];

/** Chave do filtro e da barra para quem foi cadastrado sem categoria nenhuma. */
const SEM_CATEGORIA = "__sem_categoria__";

/** Categoria aqui é texto livre, então a cor não pode vir do catálogo fixo:
 *  ela sai desta paleta, na ordem alfabética das categorias que existem. */
const CORES_CATEGORIA = [
  "var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)",
  "var(--cat-6)", "var(--cat-7)", "var(--cat-8)", "var(--cat-9)",
];

/**
 * `r.ok` sozinho já não mente: rota de API deste módulo nunca redireciona, e o
 * middleware devolve 401 em JSON — o que chega aqui é o erro escrito pela rota
 * ("já existe um fornecedor com este CNPJ nesta empresa").
 */
/** A lista mais o que ficou digitado, sem repetir (compara sem caixa). */
const comPendente = (lista: string[], pendente: string): string[] => {
  const novo = pendente.trim();
  if (!novo || lista.some((x) => x.trim().toLowerCase() === novo.toLowerCase())) return lista;
  return [...lista, novo];
};

async function chamar(url: string, metodo: "POST" | "PATCH" | "DELETE", corpo?: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(url, {
    method: metodo,
    headers: corpo === undefined ? undefined : { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(dados.erro ?? "Não deu para salvar."));
  return dados;
}

const recado = (e: unknown) => (e instanceof Error ? e.message : "Não deu para salvar.");

/**
 * O CNPJ é GRAVADO só com dígitos (a rota limpa), porque o índice único é sobre
 * o texto: "12.345.678/0001-99" e "12345678000199" entrariam como dois
 * fornecedores e dividiriam as compras da mesma empresa. Pontuar é trabalho
 * daqui, na hora de mostrar.
 *
 * Devolve "" quando não há nada, e não "—": o travessão é decisão da TELA. No
 * CSV ele viraria um caractere solto numa célula que deveria estar vazia.
 */
function cnpjBonito(v: string | null): string {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length !== 14) return v ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const temCnpj = (f: Fornecedor) => !!(f.cnpj ?? "").replace(/\D/g, "");

/**
 * A categoria que MANDA na cor e no filtro: a primeira da lista.
 *
 * Com mais de uma, alguma tem de ser a principal — pintar a linha com a média
 * das cores não diria nada, e repetir a linha uma vez por categoria faria a
 * contagem de fornecedores mentir. A primeira é a que a pessoa escolheu antes.
 */
const chaveCategoria = (f: Fornecedor) =>
  (f.categorias?.[0] ?? f.categoria ?? "").trim() || SEM_CATEGORIA;

const rotuloCategoria = (id: string) => (id === SEM_CATEGORIA ? "Sem categoria" : id);

const VAZIO_EXTRA = {
  whatsapp: "", prazo_envio_dias: "", pix_tipo: "", pix_chave: "",
  banco: "", agencia: "", conta_numero: "", aceita_boleto: false,
  inscricao_estadual: "", site: "", cidade: "", uf: "", endereco: "", observacao: "",
};

const novoRascunho = (): Rascunho => ({
  id: null, empresa_id: "", nome: "", cnpj: "", categorias: [],
  contato_nome: "", contato_email: "", contato_fone: "",
  prazo_dias: "", forma_pagamento: "", ativo: true,
  ...VAZIO_EXTRA,
});

const doFornecedor = (f: Fornecedor): Rascunho => ({
  id: f.id, empresa_id: f.empresa_id, nome: f.nome, cnpj: f.cnpj ?? "",
  categorias: f.categorias ?? [],
  contato_nome: f.contato_nome ?? "", contato_email: f.contato_email ?? "", contato_fone: f.contato_fone ?? "",
  whatsapp: f.whatsapp ?? "",
  prazo_dias: f.prazo_dias == null ? "" : String(f.prazo_dias),
  prazo_envio_dias: f.prazo_envio_dias == null ? "" : String(f.prazo_envio_dias),
  forma_pagamento: f.forma_pagamento ?? "", ativo: f.ativo,
  pix_tipo: f.pix_tipo ?? "", pix_chave: f.pix_chave ?? "",
  banco: f.banco ?? "", agencia: f.agencia ?? "", conta_numero: f.conta_numero ?? "",
  aceita_boleto: f.aceita_boleto ?? false,
  inscricao_estadual: f.inscricao_estadual ?? "", site: f.site ?? "",
  cidade: f.cidade ?? "", uf: f.uf ?? "", endereco: f.endereco ?? "",
  observacao: f.observacao ?? "",
});

const SELO_ATIVO = { label: "Ativo", cor: "var(--ok)" };
const SELO_INATIVO = { label: "Inativo", cor: "var(--neutro)" };

export function FornecedoresClient({
  empresaId, empresaNome, podeEscrever, lista, logos, catalogoDeCategorias = [], compras = [], empresas = [],
  formasDePagamento = [], schemaPendente,
}: {
  /** As empresas liberadas — o cadastro diz em qual nasce quando a tela está em "Visão geral". */
  empresas?: { id: string; nome: string }[];
  /** As formas de pagamento da configuração (PIX, Boleto…), como sugestão. */
  formasDePagamento?: string[];
  empresaId: string;
  empresaNome: string;
  podeEscrever: boolean;
  lista: Fornecedor[];
  /** id do fornecedor → link do logo, já assinado pelo servidor. */
  logos: Record<string, string>;
  /** As categorias CADASTRADAS (`fin_categorias`). Vazio antes do SQL novo — o
   *  campo continua aceitando nome digitado, só não sugere. */
  catalogoDeCategorias?: { nome: string; cor?: string | null }[];
  /** As compras não canceladas — para "última compra" e "total comprado", que
   *  o §12 manda CALCULAR. Só os três campos atravessam. */
  compras?: { fornecedor_id: string | null; data: string; valor_total: number }[];
  schemaPendente: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [situacao, setSituacao] = useState("");
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  // A foto escolhida ANTES de o fornecedor existir. Sobe logo depois do POST.
  const [fotoPendente, setFotoPendente] = useState<File | null>(null);
  // A FICHA — o que o clique na linha abre. Separada do rascunho de propósito:
  // ler é de quem abre a tela, escrever é de quem tem a chave. Enquanto o
  // clique era `podeEscrever ? … : undefined`, quem só lia clicava na lista
  // inteira e nada acontecia — sem mensagem e sem pista.
  /**
   * A ficha guarda o ID, nunca uma cópia do cadastro. Mesma correção de
   * Contatos, mesmo defeito: guardar o objeto capturado no clique fazia o
   * painel continuar mostrando o dado velho depois de salvar, porque
   * `router.refresh()` refaz a árvore do servidor e PRESERVA o estado do
   * cliente. A escrita chegava no banco e a tela jurava que não.
   */
  /** O que está digitado em Categorias e ainda não virou etiqueta. */
  const categoriaPendente = useRef("");

  const [fichaId, setFichaId] = useState<string | null>(null);

  // §12: "última compra" e "total comprado" são CALCULADOS, nunca gravados.
  // Uma coluna gravada ficaria errada na primeira compra cancelada — e a tela
  // mostraria um total que nenhuma lista de compras consegue reproduzir.
  const historico = useMemo(() => {
    const m = new Map<string, { ultima: string; total: number; n: number }>();
    for (const c of compras) {
      if (!c.fornecedor_id) continue;
      const h = m.get(c.fornecedor_id) ?? { ultima: "", total: 0, n: 0 };
      h.total += c.valor_total;
      h.n += 1;
      if (c.data > h.ultima) h.ultima = c.data;
      m.set(c.fornecedor_id, h);
    }
    return m;
  }, [compras]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const ativos = useMemo(() => lista.filter((f) => f.ativo), [lista]);

  // Derivada da lista a cada render — é o que faz o painel refletir o que
  // acabou de ser salvo. Cadastro que saiu da lista fecha a ficha sozinho.
  const ficha = fichaId ? lista.find((f) => f.id === fichaId) ?? null : null;
  const inativos = lista.length - ativos.length;

  const comCnpj = ativos.filter(temCnpj).length;
  const semCnpj = ativos.length - comCnpj;

  // Média só entre quem TEM prazo combinado. Contar os outros como zero puxaria
  // o número para baixo e faria "à vista" parecer negociação de prazo curto —
  // são coisas diferentes, e a segunda linha do cartão diz sobre quantos é.
  const prazos = ativos.map((f) => f.prazo_dias).filter((p): p is number => p != null);
  const prazoMedio = prazos.length
    ? Math.round(prazos.reduce((s, p) => s + p, 0) / prazos.length)
    : null;

  // As opções saem do que EXISTE no cadastro, não de uma lista fixa: um filtro
  // que oferece "Serviço" e devolve zero linhas faz a pessoa achar que a tela
  // quebrou.
  const categoriasVistas = useMemo(() => {
    const nomeadas = [...new Set(
      lista.map((f) => (f.categoria ?? "").trim()).filter(Boolean),
    )].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return lista.some((f) => chaveCategoria(f) === SEM_CATEGORIA)
      ? [...nomeadas, SEM_CATEGORIA]
      : nomeadas;
  }, [lista]);

  const corDaCategoria = useMemo(() => {
    const mapa = new Map<string, string>();
    let i = 0;
    for (const c of categoriasVistas) {
      // "Sem categoria" não é uma categoria: dar a ela um tom da paleta a
      // colocaria no mesmo pé de "Embalagem" na leitura da barra.
      mapa.set(c, c === SEM_CATEGORIA ? "var(--neutro)" : CORES_CATEGORIA[i++ % CORES_CATEGORIA.length]);
    }
    return mapa;
  }, [categoriasVistas]);

  const opcoesCategoria = useMemo(
    () => categoriasVistas.map((c) => ({ valor: c, label: rotuloCategoria(c) })),
    [categoriasVistas],
  );

  const opcoesSituacao = useMemo(() => {
    const out: { valor: string; label: string }[] = [];
    if (ativos.length) out.push({ valor: "ativo", label: "Ativos" });
    if (inativos) out.push({ valor: "inativo", label: "Inativos" });
    return out;
  }, [ativos.length, inativos]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const digitos = q.replace(/\D/g, "");
    return lista.filter((f) =>
      (!situacao || (situacao === "ativo") === f.ativo) &&
      (!categoria || chaveCategoria(f) === categoria) &&
      (!q
        || f.nome.toLowerCase().includes(q)
        || (f.categoria ?? "").toLowerCase().includes(q)
        || (!!digitos && (f.cnpj ?? "").includes(digitos))));
  }, [lista, busca, categoria, situacao]);

  const temFiltro = !!(busca.trim() || categoria || situacao);
  const limparFiltros = () => { setBusca(""); setCategoria(""); setSituacao(""); };

  // O painel conta os ATIVOS, não a lista filtrada: ele tem que fechar com o
  // KPI "Fornecedores ativos" logo acima. Um resumo que muda de total quando
  // alguém mexe num chip vira uma segunda verdade sobre o mesmo cadastro.
  const porCategoria = useMemo(
    () => fatias(
      ativos,
      chaveCategoria,
      () => 1,
      (id) => ({ label: rotuloCategoria(id), cor: corDaCategoria.get(id) ?? "var(--neutro)" }),
      CORES_CATEGORIA.length,
    ),
    [ativos, corDaCategoria],
  );

  async function salvar() {
    if (!rascunho) return;
    setSalvando(true);
    setErro("");
    try {
      const corpo = {
        nome: rascunho.nome,
        cnpj: rascunho.cnpj || null,
        // `categorias` é o campo novo; a rota deriva a `categoria` antiga da
        // primeira, então ela NÃO é mandada daqui — mandar as duas deixaria a
        // tela decidir qual vence, e é o servidor que sabe.
        // O que a pessoa DIGITOU entra, mesmo sem clicar em "Acrescentar":
        // exigir o passo extra jogava o valor fora em silêncio.
        categorias: comPendente(rascunho.categorias, categoriaPendente.current),
        whatsapp: rascunho.whatsapp || null,
        prazo_envio_dias: rascunho.prazo_envio_dias === "" ? null : Number(rascunho.prazo_envio_dias),
        pix_tipo: rascunho.pix_tipo || null,
        pix_chave: rascunho.pix_chave || null,
        banco: rascunho.banco || null,
        agencia: rascunho.agencia || null,
        conta_numero: rascunho.conta_numero || null,
        aceita_boleto: rascunho.aceita_boleto,
        inscricao_estadual: rascunho.inscricao_estadual || null,
        site: rascunho.site || null,
        cidade: rascunho.cidade || null,
        uf: rascunho.uf || null,
        endereco: rascunho.endereco || null,
        observacao: rascunho.observacao || null,
        contato_nome: rascunho.contato_nome || null,
        contato_email: rascunho.contato_email || null,
        contato_fone: rascunho.contato_fone || null,
        prazo_dias: rascunho.prazo_dias === "" ? null : Number(rascunho.prazo_dias),
        forma_pagamento: rascunho.forma_pagamento || null,
        ativo: rascunho.ativo,
      };
      if (rascunho.id) await chamar(`/api/financeiro/fornecedores/${rascunho.id}`, "PATCH", corpo);
      else {
        const alvo = rascunho.empresa_id || empresaId;
        if (!alvo) { setErro("Escolha em qual empresa o fornecedor nasce."); setSalvando(false); return; }
        const criado = await chamar("/api/financeiro/fornecedores", "POST", { empresa_id: alvo, ...corpo });
        // A foto escolhida antes de salvar sobe agora, com o id. Falha aqui não
        // desfaz o cadastro: o fornecedor já existe.
        if (fotoPendente && typeof criado.id === "string") {
          const erroFoto = await enviarMarca("fornecedor", criado.id, fotoPendente);
          if (erroFoto) toast.erro(`Fornecedor salvo, mas a foto não subiu: ${erroFoto}`);
        }
      }
      setFotoPendente(null);
      setRascunho(null);
      toast.ok("Fornecedor salvo.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSalvando(false);
    }
  }

  async function tirarDoCadastro(id: string) {
    if (!(await confirmar("Tirar este fornecedor do cadastro?", {
      detalhe: "Quem já aparece em compras, notas ou patrimônio é apenas inativado — o histórico continua com nome.",
      perigo: true,
    }))) return;
    setSalvando(true);
    setErro("");
    try {
      const r = await chamar(`/api/financeiro/fornecedores/${id}`, "DELETE");
      setRascunho(null);
      toast.ok(r.emUso ? "Fornecedor inativado — ele ainda explica lançamentos antigos." : "Cadastro removido.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <Cabecalho
        titulo="Fornecedores"
        sub="De quem a empresa compra, com prazo e forma de pagamento."
        busca={busca}
        aoBuscar={setBusca}
        acoes={
          <>
            {podeEscrever && (
              <BotaoFin icone="plus" primario onClick={() => { setErro(""); setRascunho(novoRascunho()); }}>
                Novo fornecedor
              </BotaoFin>
            )}
            {/* Exportar não pede permissão de escrita: quem enxerga a tela pode
                levar o que está nela. As linhas são as JÁ FILTRADAS. */}
            <BotaoExportar
              assunto="Fornecedores"
              empresa={empresaNome}
              linhas={visiveis}
              colunas={[
                { cabecalho: "Nome", valor: (f) => f.nome },
                { cabecalho: "CNPJ", valor: (f) => cnpjBonito(f.cnpj) },
                { cabecalho: "Categoria", valor: (f) => f.categoria ?? "" },
                { cabecalho: "Prazo (dias)", valor: (f) => f.prazo_dias ?? "" },
                { cabecalho: "Forma de pagamento", valor: (f) => f.forma_pagamento ?? "" },
                { cabecalho: "Contato", valor: (f) => f.contato_nome ?? "" },
                { cabecalho: "E-mail", valor: (f) => f.contato_email ?? "" },
                { cabecalho: "Telefone", valor: (f) => f.contato_fone ?? "" },
                { cabecalho: "Status", valor: (f) => (f.ativo ? "Ativo" : "Inativo") },
              ]}
            />
          </>
        }
      />

      {schemaPendente && <AvisoSchema />}

      <LinhaKpi>
        <KpiSeta
          icone="truck"
          rotulo="Fornecedores ativos"
          valor={String(ativos.length)}
          detalhe={inativos ? `${inativos} fora do cadastro` : "todos no cadastro"}
          aoAbrir={() => setSituacao("ativo")}
          tituloDaSeta="Ver só os ativos"
        />
        <KpiSeta
          icone="receipt"
          rotulo="Com CNPJ"
          valor={String(comCnpj)}
          tom={semCnpj ? "atencao" : "ok"}
          detalhe={semCnpj ? `${semCnpj} sem CNPJ para casar nota` : "todos casam com a nota"}
        />
        <KpiSeta
          icone="clock"
          rotulo="Prazo médio de pagamento"
          valor={prazoMedio == null ? "—" : `${prazoMedio} dias`}
          detalhe={prazos.length
            ? `${prazos.length} com prazo combinado`
            : "nenhum prazo combinado ainda"}
        />
      </LinhaKpi>


      {/* Os painéis em CIMA, na horizontal: a lista fica com a largura toda
          e, em Visão geral, vira uma coluna por empresa. */}
      <FaixaDePaineis>
        <Cartao>
          <TituloCartao icone="chart-bar">Por categoria</TituloCartao>
          <Barras fatias={porCategoria} formatar={(v) => String(v)} />
          <p style={{ marginTop: 14, fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
            Quantos fornecedores ativos existem em cada categoria — a barra conta cabeças, não
            dinheiro. Inativo fica de fora: ele ainda explica compra antiga, mas não é com quem se
            compra hoje.
          </p>
        </Cartao>
      </FaixaDePaineis>

        <Cartao>
          <TituloCartao icone="truck">Lista de fornecedores</TituloCartao>

          <BuscaDaLista valor={busca} aoBuscar={setBusca} placeholder="Buscar fornecedor…" />

          <Filtros>
            <Filtro rotulo="Categoria" valor={categoria} aoMudar={setCategoria} opcoes={opcoesCategoria} />
            <Filtro rotulo="Status" valor={situacao} aoMudar={setSituacao} opcoes={opcoesSituacao} />
            <LimparFiltros ativo={temFiltro} aoLimpar={limparFiltros} />
          </Filtros>

          <ColunasPorEmpresa linhas={visiveis} empresas={empresas} empresaId={empresaId} empresaNome={empresaNome} rotulo={{ um: "fornecedor", muitos: "fornecedores" }}>
            {(l) => (
              <Tabela
                linhas={l}
                chaveDe={(f) => f.id}
                paginar={10}
                rotuloItem="fornecedores"
                aoClicar={(f) => setFichaId(f.id)}
                vazio={
                  <Vazio
                    icone="truck"
                    titulo={lista.length ? "Nada com esses filtros" : "Nenhum fornecedor cadastrado"}
                    detalhe="Cadastrar uma vez evita redigitar CNPJ e prazo em toda compra — e errar em uma delas."
                    acao={podeEscrever && !lista.length
                      ? <BotaoFin icone="plus" onClick={() => setRascunho(novoRascunho())}>Novo fornecedor</BotaoFin>
                      : undefined}
                  />
                }
                colunas={[
                  {
                    chave: "nome", label: "Nome", largura: "minmax(min(100%, 132px), 1.6fr)", titulo: true,
                    celula: (f) => (
                      <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                        <Marca
                          marca={{
                            nome: f.nome,
                            logo: logos[f.id] ?? null,
                            icone: f.icone ?? "truck",
                            cor: corDaCategoria.get(chaveCategoria(f)),
                          }}
                          tamanho={26}
                          raio={8}
                        />
                        {f.nome}
                      </span>
                    ),
                  },
                  {
                    chave: "cnpj", label: "CNPJ", largura: "minmax(min(100%, 116px), 1.1fr)",
                    celula: (f) => (
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{cnpjBonito(f.cnpj) || "—"}</span>
                    ),
                  },
                  {
                    chave: "categoria", label: "Categoria", largura: "minmax(min(100%, 92px), 1fr)", soNoComputador: true,
                    celula: (f) => f.categoria || "—",
                  },
                  {
                    chave: "prazo", label: "Prazo", largura: "72px", fim: true,
                    celula: (f) => (f.prazo_dias == null ? "—" : `${f.prazo_dias} dias`),
                  },
                  {
                    chave: "ultima", label: "Última compra", largura: "minmax(min(100%, 100px), 1fr)", soNoComputador: true,
                    celula: (f) => {
                      const h = historico.get(f.id);
                      if (!h) return <span style={{ color: "var(--text-dim)" }}>nunca</span>;
                      return (
                        <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
                          <span>{dataBR(h.ultima, { curta: true })}</span>
                          <small style={{ fontSize: 11, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                            {moeda(h.total)} em {h.n}
                          </small>
                        </span>
                      );
                    },
                  },
                  {
                    chave: "status", label: "Status", largura: "90px", fim: true,
                    celula: (f) => <Selo selo={f.ativo ? SELO_ATIVO : SELO_INATIVO} />,
                  },
                ]}
              />
            )}
          </ColunasPorEmpresa>
        </Cartao>

      {ficha && (
        <PainelLateral
          centrado
          titulo="Fornecedor"
          onFechar={() => setFichaId(null)}
          largura={480}
          rodape={
            <Acoes>
              <Botao onClick={() => setFichaId(null)}>Fechar</Botao>
              <Esp />
              {podeEscrever && (
                <Botao
                  variante="primario"
                  icone="pencil"
                  onClick={() => { setErro(""); setRascunho(doFornecedor(ficha)); setFichaId(null); }}
                >
                  Editar
                </Botao>
              )}
            </Acoes>
          }
        >
          <FichaTopo
            marca={{
              nome: ficha.nome,
              logo: logos[ficha.id] ?? null,
              icone: ficha.icone ?? "truck",
              cor: corDaCategoria.get(chaveCategoria(ficha)),
            }}
            titulo={ficha.nome}
            detalhe={(ficha.categorias?.length ? ficha.categorias : [rotuloCategoria(chaveCategoria(ficha))]).join(" · ")}
            selo={<Selo selo={ficha.ativo ? { label: "Ativo", cor: "var(--ok)" } : { label: "Inativo", cor: "var(--neutro)" }} />}
          />

          <FichaBloco titulo="Empresa">
            <FichaLinha rotulo="CNPJ">
              {ficha.cnpj ? <FichaContato tipo="copiar" valor={ficha.cnpj} /> : null}
            </FichaLinha>
            <FichaLinha rotulo="Inscr. estadual">{ficha.inscricao_estadual}</FichaLinha>
            <FichaLinha rotulo="Categorias">
              {ficha.categorias?.length ? ficha.categorias.join(" · ") : rotuloCategoria(chaveCategoria(ficha))}
            </FichaLinha>
            <FichaLinha rotulo="Site">
              {ficha.site ? <FichaContato tipo="site" valor={ficha.site} /> : null}
            </FichaLinha>
          </FichaBloco>

          <FichaBloco titulo="Quem atende">
            <FichaLinha rotulo="Nome">{ficha.contato_nome}</FichaLinha>
            <FichaLinha rotulo="WhatsApp">
              {ficha.whatsapp || ficha.contato_fone
                ? <FichaContato tipo="whatsapp" valor={(ficha.whatsapp || ficha.contato_fone) as string} />
                : null}
            </FichaLinha>
            <FichaLinha rotulo="E-mail">
              {ficha.contato_email ? <FichaContato tipo="email" valor={ficha.contato_email} /> : null}
            </FichaLinha>
          </FichaBloco>

          <FichaBloco titulo="Histórico">
            <FichaLinha rotulo="Última compra" vazio="Nunca comprou.">
              {historico.get(ficha.id) ? dataBR(historico.get(ficha.id)!.ultima) : null}
            </FichaLinha>
            <FichaLinha rotulo="Total comprado" vazio="—">
              {historico.get(ficha.id)
                ? `${moeda(historico.get(ficha.id)!.total)} em ${historico.get(ficha.id)!.n} ${historico.get(ficha.id)!.n === 1 ? "compra" : "compras"}`
                : null}
            </FichaLinha>
          </FichaBloco>

          <FichaBloco titulo="Como se compra">
            <FichaLinha rotulo="Forma de pagamento">{ficha.forma_pagamento}</FichaLinha>
            <FichaLinha rotulo="Paga em">
              {ficha.prazo_dias ? `${ficha.prazo_dias} dias` : null}
            </FichaLinha>
            <FichaLinha rotulo="Entrega em">
              {ficha.prazo_envio_dias ? `${ficha.prazo_envio_dias} dias` : null}
            </FichaLinha>
            <FichaLinha rotulo="Boleto">{ficha.aceita_boleto ? "Emite boleto" : null}</FichaLinha>
          </FichaBloco>

          <FichaBloco titulo="Para onde vai o dinheiro">
            <FichaLinha rotulo="Chave PIX">
              {ficha.pix_chave ? <FichaContato tipo="copiar" valor={ficha.pix_chave} /> : null}
            </FichaLinha>
            <FichaLinha rotulo="Banco">
              {ficha.banco
                ? [ficha.banco, ficha.agencia && `ag. ${ficha.agencia}`, ficha.conta_numero && `c/c ${ficha.conta_numero}`]
                    .filter(Boolean).join(" · ")
                : null}
            </FichaLinha>
          </FichaBloco>

          <FichaBloco titulo="De onde vem">
            <FichaLinha rotulo="Cidade">
              {[ficha.cidade, ficha.uf].filter(Boolean).join(" — ") || null}
            </FichaLinha>
            <FichaLinha rotulo="Endereço">{ficha.endereco}</FichaLinha>
          </FichaBloco>

          <FichaBloco titulo="Anotações">
            <FichaLinha rotulo="Observações" vazio="Nada anotado.">{ficha.observacao}</FichaLinha>
          </FichaBloco>

          {!podeEscrever && (
            <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
              Você abre a ficha, mas não edita: falta a permissão de cadastros do Financeiro.
            </p>
          )}
        </PainelLateral>
      )}

      {rascunho && (
        <PainelLateral
          centrado
          titulo={rascunho.id ? "Editar fornecedor" : "Novo fornecedor"}
          soFechaNoX
          onFechar={() => setRascunho(null)}
          largura={520}
          rodape={
            <Acoes>
              <Botao onClick={() => setRascunho(null)}>Cancelar</Botao>
              {rascunho.id && rascunho.ativo && (
                <Botao variante="perigo" icone="user-off" onClick={() => tirarDoCadastro(rascunho.id as string)} disabled={salvando}>
                  Tirar do cadastro
                </Botao>
              )}
              <Esp />
              <Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar</Botao>
            </Acoes>
          }
        >
          {erro && (
            <p style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
          )}

          <CampoMarca
            tipo="fornecedor"
            id={rascunho.id}
            nome={rascunho.nome}
            logo={rascunho.id ? logos[rascunho.id] ?? null : null}
            icone="truck"
            cor={corDaCategoria.get((rascunho.categorias[0] ?? "").trim() || SEM_CATEGORIA)}
            aoTrocar={() => router.refresh()}
            aoEscolherPendente={setFotoPendente}
          />

          <Campos>
            {!rascunho.id && !empresaId && empresas.length > 0 && (
              <Campo label="Empresa" largo dica="Em “Visão geral” o fornecedor precisa dizer em qual empresa nasce.">
                {(id) => (
                  <SeletorEmpresa id={id} empresas={empresas} valor={rascunho.empresa_id}
                    aoMudar={(v) => setRascunho({ ...rascunho, empresa_id: v })} />
                )}
              </Campo>
            )}
            <Campo label="Nome" largo>
              {(id) => (
                <input
                  id={id}
                  value={rascunho.nome}
                  onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                  placeholder="Distribuidora Alfa"
                />
              )}
            </Campo>

            <Campo label="CNPJ" dica="Pode digitar com ponto e barra: só os dígitos são guardados.">
              {(id) => (
                <input
                  id={id}
                  inputMode="numeric"
                  value={rascunho.cnpj}
                  onChange={(e) => setRascunho({ ...rascunho, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              )}
            </Campo>

            <Campo
              label="Categorias"
              largo
              dica="Mais de uma, se for o caso. A primeira é a que pinta a linha e manda no filtro."
            >
              {(id) => (
                <Categorias
                  pendente={categoriaPendente}
                  id={id}
                  escolhidas={rascunho.categorias}
                  catalogo={catalogoDeCategorias}
                  aoMudar={(categorias) => setRascunho({ ...rascunho, categorias })}
                />
              )}
            </Campo>

            <Campo label="Prazo de pagamento (dias)" dica="Quando o dinheiro sai — não confundir com o prazo de entrega.">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min="0"
                  max="365"
                  inputMode="numeric"
                  value={rascunho.prazo_dias}
                  onChange={(e) => setRascunho({ ...rascunho, prazo_dias: e.target.value })}
                  placeholder="30"
                />
              )}
            </Campo>

            <Campo label="Prazo de entrega (dias)" dica="Quanto a mercadoria costuma demorar a chegar depois do pedido.">
              {(id) => (
                <input
                  id={id}
                  type="number"
                  min="0"
                  max="365"
                  inputMode="numeric"
                  value={rascunho.prazo_envio_dias}
                  onChange={(e) => setRascunho({ ...rascunho, prazo_envio_dias: e.target.value })}
                  placeholder="7"
                />
              )}
            </Campo>

            <Campo label="Forma de pagamento">
              {(id) => (
                <input
                  id={id}
                  list="fin-formas-pagamento"
                  value={rascunho.forma_pagamento}
                  onChange={(e) => setRascunho({ ...rascunho, forma_pagamento: e.target.value })}
                  placeholder="Boleto, Pix, cartão…"
                />
              )}
            </Campo>

            <Campo label="Contato">
              {(id) => (
                <input
                  id={id}
                  value={rascunho.contato_nome}
                  onChange={(e) => setRascunho({ ...rascunho, contato_nome: e.target.value })}
                  placeholder="Quem atende a gente"
                />
              )}
            </Campo>

            <Campo label="E-mail">
              {(id) => (
                <input
                  id={id}
                  type="email"
                  value={rascunho.contato_email}
                  onChange={(e) => setRascunho({ ...rascunho, contato_email: e.target.value })}
                  placeholder="contato@fornecedor.com.br"
                />
              )}
            </Campo>

            <Campo label="Telefone">
              {(id) => (
                <input
                  id={id}
                  type="tel"
                  inputMode="tel"
                  value={rascunho.contato_fone}
                  onChange={(e) => setRascunho({ ...rascunho, contato_fone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              )}
            </Campo>

            <Campo label="WhatsApp" dica="Vira um toque para abrir a conversa na ficha.">
              {(id) => (
                <input
                  id={id}
                  type="tel"
                  inputMode="tel"
                  value={rascunho.whatsapp}
                  onChange={(e) => setRascunho({ ...rascunho, whatsapp: e.target.value })}
                  placeholder="(00) 90000-0000"
                />
              )}
            </Campo>

            <Campo label="Inscrição estadual">
              {(id) => (
                <input
                  id={id}
                  inputMode="numeric"
                  value={rascunho.inscricao_estadual}
                  onChange={(e) => setRascunho({ ...rascunho, inscricao_estadual: e.target.value })}
                  placeholder="ISENTO"
                />
              )}
            </Campo>

            <Campo label="Site">
              {(id) => (
                <input
                  id={id}
                  type="url"
                  value={rascunho.site}
                  onChange={(e) => setRascunho({ ...rascunho, site: e.target.value })}
                  placeholder="distribuidoraalfa.com.br"
                />
              )}
            </Campo>

            {rascunho.id && (
              <Campo label="Situação" dica="Reativar traz o fornecedor de volta para as listas de compra.">
                {(id) => (
                  <select id={id} value={rascunho.ativo ? "1" : "0"} onChange={(e) => setRascunho({ ...rascunho, ativo: e.target.value === "1" })}>
                    <option value="1">Ativo</option>
                    <option value="0">Inativo</option>
                  </select>
                )}
              </Campo>
            )}
          </Campos>

          {/* PARA ONDE VAI O DINHEIRO. Bloco à parte porque é o que se copia na
              hora de pagar — misturado com contato e prazo, some no meio. */}
          {/* Dobrado no cadastro novo, aberto na edição quando tem algo: o
              caminho comum primeiro, o avançado um toque depois. */}
          <div style={{ marginTop: 14 }}>
            <Secao icone="credit-card" titulo="Como se paga" resumo="PIX, banco, boleto" inicialAberta={!!rascunho.id && !!(rascunho.pix_chave || rascunho.banco || rascunho.aceita_boleto)}>
              <div style={{ padding: "4px 14px 14px" }}>
            <Campos>
              <Campo label="Tipo da chave PIX">
                {(id) => (
                  <select
                    id={id}
                    value={rascunho.pix_tipo}
                    onChange={(e) => setRascunho({ ...rascunho, pix_tipo: e.target.value })}
                  >
                    <option value="">Sem PIX</option>
                    {PIX_TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                )}
              </Campo>

              <Campo label="Chave PIX" largo>
                {(id) => (
                  <input
                    id={id}
                    value={rascunho.pix_chave}
                    onChange={(e) => setRascunho({ ...rascunho, pix_chave: e.target.value })}
                    placeholder="CNPJ, e-mail, telefone ou chave aleatória"
                  />
                )}
              </Campo>

              <Campo label="Banco">
                {(id) => (
                  <input
                    id={id}
                    value={rascunho.banco}
                    onChange={(e) => setRascunho({ ...rascunho, banco: e.target.value })}
                    placeholder="Itaú"
                  />
                )}
              </Campo>

              <Campo label="Agência">
                {(id) => (
                  <input
                    id={id}
                    inputMode="numeric"
                    value={rascunho.agencia}
                    onChange={(e) => setRascunho({ ...rascunho, agencia: e.target.value })}
                    placeholder="1234"
                  />
                )}
              </Campo>

              <Campo label="Conta">
                {(id) => (
                  <input
                    id={id}
                    inputMode="numeric"
                    value={rascunho.conta_numero}
                    onChange={(e) => setRascunho({ ...rascunho, conta_numero: e.target.value })}
                    placeholder="56789-0"
                  />
                )}
              </Campo>

              {/* Um <div>, não um <label>: rótulo em volta de controle dispara o
                  primeiro clicável e trocaria a marcação sozinho. */}
              <Campo label="Boleto">
                {(id) => (
                  <Alternativas
  id={id}
  valor={rascunho.aceita_boleto ? "1" : "0"}
  aoEscolher={(v) => setRascunho({ ...rascunho, aceita_boleto: v === "1" })}
  opcoes={[{ id: "1", label: "Emite boleto" }, { id: "0", label: "Não emite" }]}
/>
                )}
              </Campo>
            </Campos>
              </div>
            </Secao>
          </div>

          {/* Dobrado no cadastro novo, aberto na edição quando tem algo: o
              caminho comum primeiro, o avançado um toque depois. */}
          <div style={{ marginTop: 14 }}>
            <Secao icone="map-pin" titulo="De onde vem" resumo="Cidade e endereço" inicialAberta={!!rascunho.id && !!(rascunho.cidade || rascunho.endereco)}>
              <div style={{ padding: "4px 14px 14px" }}>
            <Campos>
              <Campo label="Cidade">
                {(id) => (
                  <input
                    id={id}
                    value={rascunho.cidade}
                    onChange={(e) => setRascunho({ ...rascunho, cidade: e.target.value })}
                    placeholder="Bauru"
                  />
                )}
              </Campo>

              <Campo label="UF" dica="Duas letras.">
                {(id) => (
                  <input
                    id={id}
                    maxLength={2}
                    value={rascunho.uf}
                    onChange={(e) => setRascunho({ ...rascunho, uf: e.target.value.toUpperCase() })}
                    placeholder="SP"
                    style={{ textTransform: "uppercase" }}
                  />
                )}
              </Campo>

              <Campo label="Endereço" largo>
                {(id) => (
                  <input
                    id={id}
                    value={rascunho.endereco}
                    onChange={(e) => setRascunho({ ...rascunho, endereco: e.target.value })}
                    placeholder="Rua, número, bairro"
                  />
                )}
              </Campo>
            </Campos>
              </div>
            </Secao>
          </div>

          {/* Dobrado no cadastro novo, aberto na edição quando tem algo: o
              caminho comum primeiro, o avançado um toque depois. */}
          <div style={{ marginTop: 14 }}>
            <Secao icone="file-text" titulo="Anotações" resumo="Observações" inicialAberta={!!rascunho.id && !!rascunho.observacao}>
              <div style={{ padding: "4px 14px 14px" }}>
            <Campos>
              <Campo label="Observações" largo>
                {(id) => (
                  <textarea
                    id={id}
                    rows={3}
                    value={rascunho.observacao}
                    onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })}
                    placeholder="Só entrega às terças, pede pagamento adiantado na primeira compra…"
                  />
                )}
              </Campo>
            </Campos>
              </div>
            </Secao>
          </div>

          {/* As formas de pagamento da configuração: sugestão, não prisão —
              texto livre continua valendo, só deixa de inventar "Pix"/"PIX"/"pix". */}
          <datalist id="fin-formas-pagamento">
            {formasDePagamento.map((f) => <option key={f} value={f} />)}
          </datalist>

          <datalist id="fin-categorias-fornecedor">
            {categoriasVistas
              .filter((c) => c !== SEM_CATEGORIA)
              .map((c) => <option key={c} value={c} />)}
          </datalist>
        </PainelLateral>
      )}
    </>
  );
}
