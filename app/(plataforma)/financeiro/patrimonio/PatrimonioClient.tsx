"use client";

// ── Patrimônio · a tela ──────────────────────────────────────────────────────
// Busca, filtros e formulário moram aqui porque dependem de estado; o servidor
// já entregou os dados prontos. Nenhuma leitura sai daqui — só o POST do botão
// "Salvar bem", e depois dele `router.refresh()` refaz a árvore do servidor,
// que é quem sabe a verdade.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../Icon";
import { Botao, BotaoIcone } from "../../ui/controles";
import { Alerta } from "../../ui/Alerta";
import { travarRolagem } from "../../ui/travaRolagem";
import { useAtualizar } from "../../ui/useAtualizar";
import { Anexos, Atualizando, Barras, BotaoExportar, BotaoFin, Cabecalho, Cartao, Filtro, Filtros, LimparFiltros, LinhaKpi, ProximasAcoes, Selo, SoLeitura, Tabela, TituloCartao, Vazio, SeletorEmpresa, BotaoApagar, CampoMarca, enviarMarca, Escolha as EscolhaDoKit, FaixaDePaineis, BuscaDaLista } from "../ui";
import { ColunasPorEmpresa, KpiSeta, PainelRolante } from "../blocos";
import { dataBR, fatias, noPatrimonio, moeda, somarDias } from "@/lib/financeiro/calculos";
import { dataCSV, numeroCSV } from "@/lib/financeiro/csv";
import { useAbrirFechar } from "../../ui/micro";
import {
  acharCategoria, CATEGORIAS_PATRIMONIO, PATRIMONIO_STATUS, SELO_PATRIMONIO,
  type Patrimonio, type PatrimonioStatus,
} from "@/lib/financeiro/tipos";

export interface OpcaoSimples { id: string; nome: string }
export interface FornecedorOpcao extends OpcaoSimples { contato_id?: string | null }

export interface CompraVinculavel {
  id: string; descricao: string; data: string; valor_total: number; fornecedor_id: string | null;
}

interface Props {
  /** As empresas liberadas — repassadas ao formulário. */
  empresas?: { id: string; nome: string }[];
  empresaId: string;
  empresaNome: string;
  logos?: Record<string, string>;
  itens: Patrimonio[];
  fornecedores: FornecedorOpcao[];
  /** fornecedor legado → contato canônico; inclui históricos fora do seletor ativo. */
  contatosPorFornecedor?: Record<string, string>;
  compras: CompraVinculavel[];
  responsaveis: OpcaoSimples[];
  codigoSugerido: string;
  hoje: string;
  podeCadastrar: boolean;
}


export function PatrimonioClient({ logos = {},
  empresas = [], empresaId, empresaNome, itens, fornecedores, contatosPorFornecedor = {}, compras, responsaveis, codigoSugerido, hoje, podeCadastrar,
}: Props) {
  // `router.refresh()` que diz quando terminou — a lista avisa "Atualizando…"
  // até o bem novo estar de fato na tabela.
  const { atualizar, atualizando } = useAtualizar();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [local, setLocal] = useState("");
  const [status, setStatus] = useState("");
  // O formulário guarda o RASCUNHO aberto, não um booleano. Antes era
  // `formAberto: boolean`, e por isso o bem só podia nascer: não havia onde
  // pôr o que estava sendo editado. Cadastrar sem poder corrigir depois é meio
  // cadastro — o local muda, o responsável muda, e o valor entra errado.
  const [form, setForm] = useState<Rascunho | null>(null);
  const mForm = useAbrirFechar(!!form, "--modal-close-dur");

  const nomeFornecedor = useMemo(
    () => new Map(fornecedores.map((f) => [f.id, f.nome])), [fornecedores]);

  // O local é texto livre: as opções do filtro são os locais que EXISTEM. Uma
  // lista fixa deixaria de fora exatamente o galpão que alguém acabou de criar.
  const locais = useMemo(() => {
    const vistos = new Set<string>();
    for (const i of itens) if (i.local?.trim()) vistos.add(i.local.trim());
    return [...vistos].sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, 40);
  }, [itens]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (categoria && i.categoria !== categoria) return false;
      if (local && (i.local?.trim() ?? "") !== local) return false;
      if (status && i.status !== status) return false;
      if (!termo) return true;
      return `${i.codigo} ${i.descricao} ${i.local ?? ""}`.toLowerCase().includes(termo);
    });
  }, [itens, busca, categoria, local, status]);

  // Os números são o retrato do patrimônio INTEIRO da empresa, não do que
  // sobrou depois do filtro: "valor total do patrimônio" que muda quando se
  // marca uma categoria é um número que ninguém consegue conferir depois.
  /**
   * BAIXADO e VENDIDO não somam.
   *
   * A empresa não tem mais esses bens: o baixado foi descartado e o vendido tem
   * dono novo. Contá-los inflava "valor do patrimônio" com coisa que não
   * existe — pelo mesmo motivo que "compras do mês" ignora a compra cancelada.
   * Eles continuam na LISTA, porque o histórico é o que permite responder onde
   * foi parar a empilhadeira; só não entram no total.
   */
  const NO_PATRIMONIO = (i: { status: string }) => noPatrimonio(i.status);

  const resumo = useMemo(() => {
    const seus = itens.filter(NO_PATRIMONIO);
    return {
      quantidade: itens.length,
      possui: seus.length,
      valor: seus.reduce((s, i) => s + i.valor, 0),
      emUso: itens.filter((i) => i.status === "em_uso").length,
      manutencao: itens.filter((i) => i.status === "manutencao").length,
      foraDoTotal: itens.length - seus.length,
    };
  }, [itens]);

  const barras = useMemo(
    () => fatias(itens.filter(NO_PATRIMONIO), (i) => i.categoria, (i) => i.valor,
      (id) => acharCategoria(CATEGORIAS_PATRIMONIO, id)),
    [itens],
  );

  const acoes = useMemo(() => {
    const out: { chave: string; icone: string; cor: string; titulo: string; detalhe: string }[] = [];
    const nomes = (lista: Patrimonio[]) => lista.slice(0, 2).map((p) => p.descricao).join(", ");

    const manutencao = itens.filter((i) => i.status === "manutencao");
    if (manutencao.length) {
      out.push({
        chave: "manutencao", icone: "tools", cor: "var(--atencao)",
        titulo: `${manutencao.length} ${manutencao.length === 1 ? "item em manutenção" : "itens em manutenção"}`,
        detalhe: nomes(manutencao),
      });
    }

    // Bem baixado ou vendido não precisa de endereço — cobrar local dele
    // encheria a lista de aviso que ninguém pode resolver.
    const semLocal = itens.filter(
      (i) => !i.local?.trim() && i.status !== "baixado" && i.status !== "vendido");
    if (semLocal.length) {
      out.push({
        chave: "sem_local", icone: "map-pin", cor: "var(--azul)",
        titulo: `${semLocal.length} ${semLocal.length === 1 ? "bem sem local definido" : "bens sem local definido"}`,
        detalhe: nomes(semLocal),
      });
    }

    const limite = somarDias(hoje, 30);
    const garantia = itens.filter(
      (i) => i.garantia_ate && i.garantia_ate >= hoje && i.garantia_ate <= limite);
    if (garantia.length) {
      out.push({
        chave: "garantia", icone: "shield-check", cor: "var(--roxo)",
        titulo: `${garantia.length} ${garantia.length === 1 ? "garantia vence" : "garantias vencem"} em 30 dias`,
        detalhe: nomes(garantia),
      });
    }

    return out;
  }, [itens, hoje]);

  return (
    <>
      <Cabecalho
        titulo="Patrimônio"
        sub="Bens da empresa, onde estão e quanto valem."
        busca={busca}
        aoBuscar={setBusca}
        acoes={
          <>
            {podeCadastrar && (
              <BotaoFin icone="plus" primario onClick={() => setForm(rascunhoNovo(codigoSugerido, empresaId))}>Novo patrimônio</BotaoFin>
            )}
            <BotaoExportar
              assunto="Patrimônio" empresa={empresaNome} linhas={filtrados}
              colunas={[
                { cabecalho: "Código", valor: (p) => p.codigo },
                { cabecalho: "Descrição", valor: (p) => p.descricao },
                { cabecalho: "Categoria", valor: (p) => acharCategoria(CATEGORIAS_PATRIMONIO, p.categoria).label },
                { cabecalho: "Local", valor: (p) => p.local ?? "" },
                { cabecalho: "Responsável", valor: (p) => responsaveis.find((r) => r.id === p.responsavel_id)?.nome ?? "" },
                { cabecalho: "Fornecedor", valor: (p) => nomeFornecedor.get(p.fornecedor_id ?? "") ?? "" },
                { cabecalho: "Valor", valor: (p) => numeroCSV(p.valor) },
                { cabecalho: "Aquisição", valor: (p) => dataCSV(p.aquisicao) },
                { cabecalho: "Garantia até", valor: (p) => dataCSV(p.garantia_ate) },
                { cabecalho: "Status", valor: (p) => SELO_PATRIMONIO[p.status].label },
              ]}
            />
          </>
        }
      />

      <LinhaKpi>
        <KpiSeta
          icone="package"
          rotulo="Itens patrimoniais"
          valor={String(resumo.quantidade)}
          detalhe={resumo.foraDoTotal ? `${resumo.possui} em poder da empresa` : "todos em poder da empresa"}
          aoAbrir={() => setStatus("")}
          tituloDaSeta="Ver todos os bens"
        />
        {/* O detalhe não é enfeite: sem ele o total não bate com a soma da
            lista e a pessoa procura o erro. Melhor dizer de saída que baixado
            e vendido estão de fora. */}
        <KpiSeta
          icone="cash"
          rotulo="Valor do patrimônio"
          valor={moeda(resumo.valor)}
          detalhe={resumo.foraDoTotal
            ? `sem ${resumo.foraDoTotal} ${resumo.foraDoTotal === 1 ? "baixado/vendido" : "baixados/vendidos"}`
            : "soma dos bens em poder da empresa"}
        />
        <KpiSeta
          icone="circle-check"
          rotulo="Itens ativos"
          valor={String(resumo.emUso)}
          tom="ok"
          detalhe="Em uso"
          aoAbrir={() => setStatus("em_uso")}
          tituloDaSeta="Ver os bens em uso"
        />
        <KpiSeta
          icone="tools"
          rotulo="Em manutenção"
          valor={String(resumo.manutencao)}
          tom={resumo.manutencao ? "atencao" : "neutro"}
          detalhe={resumo.manutencao ? "parados para conserto" : "nenhum bem parado"}
          aoAbrir={resumo.manutencao ? () => setStatus("manutencao") : undefined}
          tituloDaSeta="Ver o que está em manutenção"
        />
      </LinhaKpi>

      {/* Os painéis em CIMA, na horizontal: a lista fica com a largura toda
          e, em Visão geral, vira uma coluna por empresa. */}
      <FaixaDePaineis>
        <Cartao>
          <TituloCartao icone="chart-bar">Resumo por categoria</TituloCartao>
          <Barras fatias={barras} />
        </Cartao>

        <PainelRolante icone="alert-triangle" titulo="Próximas ações">
          <ProximasAcoes acoes={acoes} />
        </PainelRolante>
      </FaixaDePaineis>

        <Cartao>
          <TituloCartao icone="package" direita={<Atualizando ativo={atualizando} />}>Lista de patrimônio</TituloCartao>

          <BuscaDaLista valor={busca} aoBuscar={setBusca} placeholder="Buscar bem, código ou local…" />

          <Filtros>
            <Filtro
              rotulo="Categoria" valor={categoria} aoMudar={setCategoria}
              opcoes={CATEGORIAS_PATRIMONIO.map((c) => ({ valor: c.id, label: c.label }))}
            />
            <Filtro
              rotulo="Local" valor={local} aoMudar={setLocal}
              opcoes={locais.map((l) => ({ valor: l, label: l }))}
            />
            <Filtro
              rotulo="Status" valor={status} aoMudar={setStatus}
              opcoes={PATRIMONIO_STATUS.map((s) => ({ valor: s, label: SELO_PATRIMONIO[s].label }))}
            />
            <LimparFiltros
              ativo={!!categoria || !!local || !!status || !!busca}
              aoLimpar={() => { setCategoria(""); setLocal(""); setStatus(""); setBusca(""); }}
            />
          </Filtros>

          <ColunasPorEmpresa linhas={filtrados} empresas={empresas} empresaId={empresaId} empresaNome={empresaNome} rotulo={{ um: "bem", muitos: "bens" }}>
            {(l) => (
              <Tabela
                linhas={l}
                chaveDe={(p) => p.id}
                paginar={10}
                rotuloItem="bens"
                // Clicar na linha abre o bem. Para TODO MUNDO: quem não pode
                // escrever vê a ficha com os campos travados e o motivo escrito,
                // em vez do clique morto que a lista tinha antes.
                aoClicar={(b) => setForm(rascunhoDoBem(b))}
                vazio={
                  <Vazio
                    icone="package"
                    titulo={itens.length ? "Nenhum bem com esses filtros" : "Nenhum bem cadastrado"}
                    detalhe={itens.length
                      ? "Limpe a busca ou troque os filtros para ver o resto."
                      : "Máquinas, computadores, móveis e veículos entram aqui — cada um com código, local e responsável."}
                    acao={!itens.length && podeCadastrar
                      ? <BotaoFin icone="plus" onClick={() => setForm(rascunhoNovo(codigoSugerido, empresaId))}>Cadastrar bem</BotaoFin>
                      : undefined}
                  />
                }
                colunas={[
                  {
                    chave: "codigo", label: "Código", largura: "88px",
                    celula: (p) => (
                      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{p.codigo}</span>
                    ),
                  },
                  {
                    chave: "descricao", label: "Descrição", largura: "minmax(min(100%, 148px), 1.4fr)", titulo: true,
                    celula: (p) => p.descricao,
                  },
                  {
                    chave: "categoria", label: "Categoria", largura: "minmax(min(100%, 96px), 1fr)", soNoComputador: true,
                    celula: (p) => acharCategoria(CATEGORIAS_PATRIMONIO, p.categoria).label,
                  },
                  {
                    chave: "local", label: "Local", largura: "minmax(min(100%, 92px), 1fr)",
                    celula: (p) => p.local?.trim()
                      ? p.local
                      : <span style={{ color: "var(--text-dim)" }}>Sem local</span>,
                  },
                  {
                    chave: "valor", label: "Valor", largura: "minmax(min(100%, 92px), 0.8fr)", fim: true,
                    celula: (p) => <strong style={{ fontVariantNumeric: "tabular-nums" }}>{moeda(p.valor)}</strong>,
                  },
                  {
                    chave: "status", label: "Status", largura: "100px", fim: true,
                    celula: (p) => <Selo selo={SELO_PATRIMONIO[p.status]} />,
                  },
                ]}
              />
            )}
          </ColunasPorEmpresa>
        </Cartao>



      {form && (
        <FormularioBem
          // A `key` troca quando muda o bem aberto: o rascunho é semente de
          // `useState`, e sem remontar o formulário guardaria o item anterior.
          key={form.id ?? "novo"}
          empresaId={empresaId}
          fornecedores={fornecedores}
          contatosPorFornecedor={contatosPorFornecedor}
          compras={compras}
          responsaveis={responsaveis}
          inicial={form}
          empresas={empresas}
          podeEscrever={podeCadastrar}
          nomeFornecedor={nomeFornecedor}
          logo={form.id ? logos[form.id] ?? null : null}
          classe={mForm.classe}
          aoFechar={() => setForm(null)}
          aoSalvar={() => { setForm(null); atualizar(); }}
        />
      )}
    </>
  );
}

// ── Formulário ───────────────────────────────────────────────────────────────

interface Rascunho {
  /** `null` = cadastro novo. Preenchido = está editando um bem existente. */
  id: string | null;
  /** A empresa DO BEM, e não a da tela: em "Visão geral" a tela não tem uma. */
  empresa_id: string;
  codigo: string; descricao: string; categoria: string; local: string;
  responsavel_id: string; fornecedor_id: string; compra_id: string;
  valor: string; aquisicao: string; garantia_ate: string; status: PatrimonioStatus;
}

const rascunhoNovo = (codigo: string, empresaId: string): Rascunho => ({
  id: null, empresa_id: empresaId,
  codigo, descricao: "", categoria: CATEGORIAS_PATRIMONIO[0].id, local: "",
  responsavel_id: "", fornecedor_id: "", compra_id: "",
  valor: "", aquisicao: "", garantia_ate: "", status: "em_uso",
});

/**
 * O bem que já existe, virado formulário.
 *
 * Tudo entra como TEXTO porque é o que um `<input>` guarda — `valor` numérico
 * viraria "0" num campo que deveria estar vazio, e `null` vira string vazia em
 * vez de aparecer escrito "null" na tela.
 */
const rascunhoDoBem = (b: Patrimonio): Rascunho => ({
  id: b.id, empresa_id: b.empresa_id,
  codigo: b.codigo ?? "",
  descricao: b.descricao,
  categoria: b.categoria || CATEGORIAS_PATRIMONIO[0].id,
  local: b.local ?? "",
  responsavel_id: b.responsavel_id ?? "",
  fornecedor_id: b.fornecedor_id ?? "",
  compra_id: b.compra_id ?? "",
  valor: b.valor ? String(b.valor) : "",
  aquisicao: b.aquisicao ?? "",
  garantia_ate: b.garantia_ate ?? "",
  status: b.status,
});

const CONTROLE: React.CSSProperties = {
  width: "100%", minWidth: 0, minHeight: "var(--tap)", padding: "0 12px",
  borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text)", fontSize: 14, outline: "none",
};

/** O `<select>` nativo escondido dentro do rótulo — mesmo padrão do `Filtro` do
 *  kit: a lista de opções fica com as cores do sistema, e não com um token
 *  translúcido que no tema escuro vira texto branco sobre fundo branco. */
const SELECT_INVISIVEL: React.CSSProperties = {
  position: "absolute", opacity: 0, width: 1, height: 1, margin: -1,
  padding: 0, border: 0, overflow: "hidden", clipPath: "inset(50%)",
};

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>{rotulo}</span>
      {children}
    </label>
  );
}

/**
 * Adaptador fino sobre o `Escolha` do kit.
 *
 * Este arquivo tinha um dropdown PRÓPRIO com o mesmo nome e outra API
 * (`rotulo`/`opcoes: {valor,label}`/`aoMudar`), montado sobre um `<select>`
 * nativo escondido. Dois componentes homônimos e divergentes no mesmo módulo é
 * o tipo de coisa que só aparece quando alguém corrige um e não o outro — e
 * aqui o corrigido teria busca, foto e teclado, e este não.
 *
 * O adaptador existe para a troca não virar cinco reescritas de chamada: a
 * assinatura local continua, o que desenha é o do kit.
 */
function Escolha({ rotulo, valor, opcoes, aoMudar, vazio = "Não definido" }: {
  rotulo: string; valor: string; vazio?: string;
  opcoes: { valor: string; label: string }[];
  aoMudar: (v: string) => void;
}) {
  return (
    <Campo rotulo={rotulo}>
      <EscolhaDoKit
        valor={valor}
        vazio={vazio}
        aoEscolher={aoMudar}
        placeholder={`Buscar em ${rotulo.toLocaleLowerCase("pt-BR")}…`}
        opcoes={opcoes.map((o) => ({ id: o.valor, nome: o.label }))}
      />
    </Campo>
  );
}

/**
 * A folha do cadastro.
 *
 * Vai pro `<body>` por portal: a coluna de conteúdo tem `overflow`, o cartão tem
 * `backdrop-filter` e um `transform` novo em qualquer ancestral faria a folha
 * nascer recortada dentro dele. Sem ancestral não há o que herdar (CLAUDE.md).
 * `.apple-backdrop` + `.apple-modal` são a fundação: no celular o véu prende a
 * folha embaixo e ela rola por dentro, com `dvh` — nada disso é escrito aqui.
 */
function FormularioBem({
  empresaId, fornecedores, contatosPorFornecedor, compras, responsaveis, inicial, podeEscrever, nomeFornecedor,
  empresas = [], logo = null, aoFechar, aoSalvar, classe = "",
}: {
  /** Classe do ciclo da receita de modal. Opcional: o formulário também é
   *  montado sem ela em prova, e sem valor ele se comporta como antes. */
  classe?: string;
  empresaId: string;
  fornecedores: FornecedorOpcao[];
  contatosPorFornecedor: Record<string, string>;
  compras: CompraVinculavel[];
  responsaveis: OpcaoSimples[];
  /** Vazio para cadastro novo, preenchido para edição — quem decide é a lista. */
  inicial: Rascunho;
  /** Sem isto a ficha abre em leitura: campos travados e sem botão de salvar. */
  podeEscrever: boolean;
  /** Em "Visão geral" a tela não tem empresa: o bem novo pergunta em qual nasce. */
  empresas?: { id: string; nome: string }[];
  /** Link assinado da foto deste bem, quando já existe. */
  logo?: string | null;
  nomeFornecedor: Map<string, string>;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [r, setR] = useState<Rascunho>(inicial);
  // A foto escolhida ANTES de o bem existir: ela sobe assim que o POST devolve
  // o id (ver `enviarMarca`). Sem isto o cadastro novo diria "a foto entra
  // depois de salvar", e ninguém reabre a ficha só para isso.
  const [fotoPendente, setFotoPendente] = useState<File | null>(null);
  const editando = !!inicial.id;
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => travarRolagem(), []);


  const mudar = useCallback(<K extends keyof Rascunho>(campo: K, valor: Rascunho[K]) => {
    setR((atual) => ({ ...atual, [campo]: valor }));
  }, []);

  /**
   * Escolher a compra preenche valor, fornecedor e aquisição — mas SÓ o que
   * ainda está em branco. Sobrescrever o que a pessoa digitou faria o campo
   * "mudar sozinho", e depois disso ninguém confia mais no formulário.
   */
  const vincularCompra = (id: string) => {
    const compra = compras.find((c) => c.id === id);
    setR((atual) => ({
      ...atual,
      compra_id: id,
      valor: atual.valor || (compra ? String(compra.valor_total) : ""),
      fornecedor_id: atual.fornecedor_id || compra?.fornecedor_id || "",
      aquisicao: atual.aquisicao || compra?.data || "",
    }));
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (salvando) return;

    const descricao = r.descricao.trim();
    if (!descricao) { setErro("Descreva o bem."); return; }
    if (!editando && !(r.empresa_id || empresaId)) { setErro("Escolha em qual empresa o bem nasce."); return; }

    setSalvando(true);
    setErro(null);

    // Editar é PATCH no id; cadastrar é POST na coleção. O corpo é quase o
    // mesmo — a diferença é que a edição NÃO manda `empresa_id`: a rota lê a
    // empresa da própria linha de propósito, porque aceitar a do cliente
    // deixaria alguém editar o bem de outra empresa mandando outro id (§17).
    const resposta = await fetch(
      editando ? `/api/financeiro/patrimonio/${r.id}` : "/api/financeiro/patrimonio",
      {
        method: editando ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(editando ? {} : { empresa_id: r.empresa_id || empresaId }),
          codigo: r.codigo.trim() || undefined,
          descricao,
          categoria: r.categoria,
          local: r.local.trim() || null,
          responsavel_id: r.responsavel_id || null,
          fornecedor_id: r.fornecedor_id || null,
          compra_id: r.compra_id || null,
          valor: Number(r.valor) || 0,
          aquisicao: r.aquisicao || null,
          garantia_ate: r.garantia_ate || null,
          status: r.status,
        }),
      },
    ).catch(() => null);

    // O corpo manda tanto quanto o código: um `ok` do HTTP com `{ erro }` dentro
    // é o caso do código repetido (409) e do SQL ainda não rodado (503), e ler
    // só o `r.ok` faria a folha fechar dizendo que salvou.
    const corpo = (await resposta?.json().catch(() => null)) as { ok?: boolean; erro?: string } | null;
    if (!resposta?.ok || !corpo?.ok) {
      setErro(corpo?.erro ?? (editando ? "Não deu para salvar as alterações." : "Não deu para salvar o bem."));
      setSalvando(false);
      return;
    }

    // A foto escolhida antes de salvar sobe agora, que o bem tem id. Falhar
    // aqui NÃO diz que o cadastro falhou: ele está salvo, e a pessoa
    // recadastraria tudo por causa de uma imagem.
    const idSalvo = (corpo as { id?: string }).id ?? inicial.id;
    if (fotoPendente && idSalvo) {
      const recado = await enviarMarca("patrimonio", idSalvo, fotoPendente);
      if (recado) setErro(`Bem salvo, mas a foto não subiu: ${recado}`);
    }

    setSalvando(false);
    aoSalvar();
  };

  const opcoesCompra = compras.map((c) => ({
    valor: c.id,
    label: `${dataBR(c.data, { curta: true })} · ${c.descricao} · ${moeda(c.valor_total)}`
      + (c.fornecedor_id && nomeFornecedor.get(c.fornecedor_id) ? ` · ${nomeFornecedor.get(c.fornecedor_id)}` : ""),
  }));
  const contatoDoFornecedor = r.fornecedor_id
    ? contatosPorFornecedor[r.fornecedor_id]
      ?? fornecedores.find((fornecedor) => fornecedor.id === r.fornecedor_id)?.contato_id
    : null;
  const fichaDoFornecedor = contatoDoFornecedor
    ? `/financeiro/cadastros/contatos?papel=fornecedor&editar=${encodeURIComponent(contatoDoFornecedor)}`
    : null;

  return createPortal(
    // Sem fechar no clique fora e sem Esc: só o X e o "Cancelar". Um gesto
    // involuntário não pode custar o bem inteiro digitado — mesma regra do
    // `ModalFormulario` e do `soFechaNoX` do painel lateral.
    <div className={`fin-scope apple-backdrop ${classe}`.trim()}>
      <form
        className={`apple-modal t-modal ${classe}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pat-form-titulo"
        onSubmit={salvar}
        style={{ width: 620, maxWidth: "100%", borderRadius: "var(--r-md)", padding: 18, minWidth: 0 }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Icon name="package" size={19} color="var(--primary-texto)" />
          <h2
            id="pat-form-titulo"
            style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, letterSpacing: "-.01em" }}
          >
            {editando ? `Editar ${inicial.codigo || "bem"}` : "Novo patrimônio"}
          </h2>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={aoFechar} style={{ flex: "none" }} />
        </header>

        {/* A FOTO DO BEM.
            Patrimônio era o único cadastro do módulo sem cara própria — e é
            onde ela mais serve: "Monitor Gamer Concórdia 23,8\" H238F" descreve
            o MODELO e não distingue os três que estão no escritório. Quem
            confere patrimônio anda com a lista na mão procurando o objeto, e
            reconhecer é mais rápido que ler um código. */}
        <CampoMarca
          tipo="patrimonio"
          id={inicial.id}
          nome={r.descricao || r.codigo || "Bem"}
          logo={logo ?? null}
          icone="package"
          cor={null}
          aoTrocar={aoSalvar}
          aoEscolherPendente={setFotoPendente}
        />


        <SoLeitura ativo={!podeEscrever} motivo="Você abre a ficha do bem, mas não edita: falta a permissão de patrimônio.">
        <div
          style={{
            display: "grid", gap: 13,
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
          }}
        >
          {!editando && !empresaId && empresas.length > 0 && (
            <Campo rotulo="Empresa">
              <SeletorEmpresa empresas={empresas} valor={r.empresa_id} aoMudar={(v) => mudar("empresa_id", v)} />
            </Campo>
          )}
          <Campo rotulo="Código">
            <input
              value={r.codigo}
              onChange={(e) => mudar("codigo", e.target.value)}
              placeholder={inicial.codigo || "PAT-001"}
              style={{ ...CONTROLE, fontVariantNumeric: "tabular-nums" }}
            />
          </Campo>

          <Campo rotulo="Descrição">
            <input
              value={r.descricao}
              onChange={(e) => mudar("descricao", e.target.value)}
              placeholder="Notebook Dell i7, prensa térmica…"
              style={CONTROLE}
            />
          </Campo>

          <Escolha
            rotulo="Categoria"
            valor={r.categoria}
            vazio="Outros"
            opcoes={CATEGORIAS_PATRIMONIO.map((c) => ({ valor: c.id, label: c.label }))}
            aoMudar={(v) => mudar("categoria", v || "outros")}
          />

          <Campo rotulo="Local">
            <input
              value={r.local}
              onChange={(e) => mudar("local", e.target.value)}
              placeholder="Galpão, escritório, sala de produção…"
              style={CONTROLE}
            />
          </Campo>

          <Escolha
            rotulo="Responsável"
            valor={r.responsavel_id}
            vazio="Sem responsável"
            opcoes={responsaveis.map((p) => ({ valor: p.id, label: p.nome }))}
            aoMudar={(v) => mudar("responsavel_id", v)}
          />

          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            <Escolha
              rotulo="Fornecedor"
              valor={r.fornecedor_id}
              vazio="Sem fornecedor"
              opcoes={fornecedores.map((f) => ({ valor: f.id, label: f.nome }))}
              aoMudar={(v) => mudar("fornecedor_id", v)}
            />
            {fichaDoFornecedor && (
              <BotaoFin icone="external-link" href={fichaDoFornecedor}>
                Abrir ficha do fornecedor
              </BotaoFin>
            )}
          </div>

          <Escolha
            rotulo="Compra vinculada"
            valor={r.compra_id}
            vazio="Sem compra vinculada"
            opcoes={opcoesCompra}
            aoMudar={vincularCompra}
          />

          <Campo rotulo="Valor">
            <input
              value={r.valor}
              onChange={(e) => mudar("valor", e.target.value)}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="0,00"
              style={{ ...CONTROLE, fontVariantNumeric: "tabular-nums" }}
            />
          </Campo>

          <Campo rotulo="Aquisição">
            <input
              value={r.aquisicao}
              onChange={(e) => mudar("aquisicao", e.target.value)}
              type="date"
              style={CONTROLE}
            />
          </Campo>

          <Campo rotulo="Garantia até">
            <input
              value={r.garantia_ate}
              onChange={(e) => mudar("garantia_ate", e.target.value)}
              type="date"
              style={CONTROLE}
            />
          </Campo>

          <Escolha
            rotulo="Status"
            valor={r.status}
            vazio="Em uso"
            opcoes={PATRIMONIO_STATUS.map((s) => ({ valor: s, label: SELO_PATRIMONIO[s].label }))}
            aoMudar={(v) => mudar("status", (v || "em_uso") as PatrimonioStatus)}
          />
        </div>
        </SoLeitura>

        {/* A NOTA do bem — opcional, e só depois de salvar.
            Opcional porque metade do patrimônio de uma empresa pequena não tem
            nota nenhuma (veio de doação, de troca, ou a nota se perdeu), e
            exigir o arquivo faria a pessoa deixar o bem fora do cadastro — que
            é o oposto do que o patrimônio serve.
            Depois de salvar porque o anexo é gravado com o `owner_id` do bem, e
            um bem que ainda não nasceu não tem id para carimbar. */}
        {editando ? (
          <Anexos
            tipo="patrimonio"
            owner_id={r.id as string}
            empresa_id={r.empresa_id}
            podeEditar={podeEscrever}
            titulo="Nota e documentos"
            dica="Nota fiscal, manual, garantia, foto do número de série — o que provar de onde o bem veio."
          />
        ) : (
          <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
            A nota entra depois de salvar — reabra o bem para anexar o arquivo.
          </p>
        )}

        {erro && (
          <Alerta tom="perigo" style={{ marginTop: 14 }}>{erro}</Alerta>
        )}

        <p style={{ margin: "14px 0 0", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
          O bem entra só como registro: o custo já foi contado na compra vinculada.
        </p>

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 16, flexWrap: "wrap" }}>
          <BotaoFin onClick={aoFechar}>{podeEscrever ? "Cancelar" : "Fechar"}</BotaoFin>
          {editando && podeEscrever && (
            <BotaoApagar tipo="patrimonio" id={inicial.id as string} nome={r.descricao || r.codigo} aoApagar={aoSalvar} />
          )}
          {podeEscrever && (
          <Botao type="submit" variante="primario" icone="check" carregando={salvando}>
            {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Salvar bem"}
          </Botao>
          )}
        </footer>
      </form>
    </div>,
    document.body,
  );
}
