"use client";

import { Secao } from "../../../ui/Secao";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmar, toast } from "../../../Toast";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral } from "../../../ui/controles";
import { AvisoSchema, BotaoExportar, BotaoFin, Cabecalho, CampoMarca, Categorias, Cartao, FichaBloco, FichaContato, FichaLinha, FichaTopo, Filtro, Filtros, LimparFiltros, LinhaKpi, Marca, SeletorEmpresa, Selo, Tabela, Telefones, TituloCartao, Vazio, enviarMarca, Alternativas, BuscaDaLista } from "../../ui";
import { ColunasPorEmpresa, KpiSeta } from "../../blocos";
import {
  CONTATO_NATUREZAS, LABEL_CONTATO_NATUREZA, PAPEIS_CONTATO,
  type Contato, type ContatoNatureza, type Fornecedor, type PapelContato, type ParteFinanceira,
} from "@/lib/financeiro/tipos";
import { LABEL_PAPEL, PapeisContato } from "./PapeisContato";

interface FornecedorRascunho {
  id: string | null;
  contato_nome: string;
  prazo_dias: string; prazo_envio_dias: string; forma_pagamento: string;
  pix_tipo: string; pix_chave: string; banco: string; agencia: string; conta_numero: string;
  aceita_boleto: boolean; inscricao_estadual: string; cidade: string; uf: string;
}

interface Rascunho {
  empresa_id: string;
  id: string | null;
  nome: string; email: string; endereco: string; observacao: string; ativo: boolean;
  telefones: string[]; categorias: string[]; site: string; cnpj: string;
  natureza: ContatoNatureza; organizacao_id: string; organizacao: string; cargo: string;
  papeis: PapelContato[];
  fornecedor: FornecedorRascunho;
}

const PIX_TIPOS = [
  { id: "cnpj", label: "CNPJ" }, { id: "cpf", label: "CPF" },
  { id: "email", label: "E-mail" }, { id: "telefone", label: "Telefone" },
  { id: "aleatoria", label: "Chave aleatória" },
];

const SEM_CATEGORIA = "__sem_categoria__";
const CORES_CATEGORIA = [
  "var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)",
  "var(--cat-6)", "var(--cat-7)", "var(--cat-8)", "var(--cat-9)",
];
const COR_PAPEL: Record<PapelContato, string> = {
  contato: "var(--azul)", fornecedor: "var(--atencao)", cliente: "var(--ok)",
  parceiro: "var(--roxo)", prestador: "var(--primary-texto)", outro: "var(--neutro)",
};
const SELO_ATIVO = { label: "Ativo", cor: "var(--ok)" };
const SELO_INATIVO = { label: "Inativo", cor: "var(--neutro)" };

const fornecedorVazio = (): FornecedorRascunho => ({
  id: null, contato_nome: "",
  prazo_dias: "", prazo_envio_dias: "", forma_pagamento: "", pix_tipo: "", pix_chave: "",
  banco: "", agencia: "", conta_numero: "", aceita_boleto: false,
  inscricao_estadual: "", cidade: "", uf: "",
});

const fornecedorDo = (f: Fornecedor | null): FornecedorRascunho => f ? ({
  id: f.id, contato_nome: f.contato_nome ?? "",
  prazo_dias: f.prazo_dias == null ? "" : String(f.prazo_dias),
  prazo_envio_dias: f.prazo_envio_dias == null ? "" : String(f.prazo_envio_dias),
  forma_pagamento: f.forma_pagamento ?? "", pix_tipo: f.pix_tipo ?? "", pix_chave: f.pix_chave ?? "",
  banco: f.banco ?? "", agencia: f.agencia ?? "", conta_numero: f.conta_numero ?? "",
  aceita_boleto: f.aceita_boleto ?? false, inscricao_estadual: f.inscricao_estadual ?? "",
  cidade: f.cidade ?? "", uf: f.uf ?? "",
}) : fornecedorVazio();

const novoRascunho = (papel?: PapelContato): Rascunho => ({
  empresa_id: "", id: null, nome: "", email: "", endereco: "", observacao: "", ativo: true,
  telefones: [], categorias: [], site: "", cnpj: "", natureza: "pessoa",
  organizacao_id: "", organizacao: "", cargo: "", papeis: [papel ?? "contato"],
  fornecedor: fornecedorVazio(),
});

/** A lista mais o que ficou digitado, sem repetir (compara sem caixa). */
const comPendente = (lista: string[], pendente: string): string[] => {
  const novo = pendente.trim();
  if (!novo || lista.some((x) => x.trim().toLowerCase() === novo.toLowerCase())) return lista;
  return [...lista, novo];
};

const daParte = (parte: ParteFinanceira): Rascunho => ({
  empresa_id: parte.empresa_id, id: parte.id, nome: parte.nome, email: parte.email ?? "",
  endereco: parte.endereco ?? "", observacao: parte.observacao ?? "", ativo: parte.ativo,
  telefones: parte.telefones ?? [], categorias: parte.categorias ?? [], site: parte.site ?? "",
  cnpj: parte.cnpj ?? "", natureza: parte.natureza ?? "pessoa",
  organizacao_id: parte.organizacao_id ?? "", organizacao: parte.organizacao ?? "",
  cargo: parte.cargo ?? "", papeis: parte.papeis ?? [], fornecedor: fornecedorDo(parte.fornecedor),
});

async function chamar(url: string, metodo: "POST" | "PATCH" | "DELETE", corpo?: unknown): Promise<Record<string, unknown>> {
  const resposta = await fetch(url, {
    method: metodo,
    headers: corpo === undefined ? undefined : { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resposta.ok) throw new Error(String(dados.erro ?? "Não deu para salvar."));
  return dados;
}

const recado = (erro: unknown) => erro instanceof Error ? erro.message : "Não deu para salvar.";
const chaveCategoria = (parte: ParteFinanceira) =>
  (parte.categorias?.[0] ?? parte.categoria ?? "").trim() || SEM_CATEGORIA;
const rotuloCategoria = (categoria: string) => categoria === SEM_CATEGORIA ? "Sem categoria" : categoria;

function cnpjBonito(valor: string | null): string {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length !== 14) return valor ?? "";
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

function ResumoPapeis({ papeis, acessivel = false }: { papeis: PapelContato[]; acessivel?: boolean }) {
  return (
    <span
      aria-label={acessivel ? "Papéis" : undefined}
      style={{ display: "flex", flexWrap: "wrap", gap: 5, minWidth: 0 }}
    >
      {papeis.length
        ? papeis.map((papel) => <Selo key={papel} selo={{ label: LABEL_PAPEL[papel], cor: COR_PAPEL[papel] }} />)
        : <span style={{ color: "var(--text-dim)" }}>Sem papel</span>}
    </span>
  );
}

export function ContatosClient({
  empresas = [], empresaId, empresaNome, podeEscrever, lista: listaRecebida, logos,
  catalogoDeCategorias = [], formasDePagamento = [], schemaPendente,
  papelInicial = "", editarInicial = "",
}: {
  empresas?: { id: string; nome: string }[];
  empresaId: string;
  empresaNome: string;
  podeEscrever: boolean;
  lista: (ParteFinanceira | Contato)[];
  logos: Record<string, string>;
  catalogoDeCategorias?: { nome: string; cor?: string | null }[];
  formasDePagamento?: string[];
  schemaPendente: boolean;
  papelInicial?: PapelContato | "";
  editarInicial?: string;
}) {
  const router = useRouter();
  const lista = useMemo<ParteFinanceira[]>(() => listaRecebida.map((parte) =>
    "papeis" in parte
      ? parte
      : { ...parte, papeis: ["contato"], cnpj: null, fornecedor: null },
  ), [listaRecebida]);
  const inicialParaEditar = lista.find((parte) => parte.id === editarInicial) ?? null;
  const [busca, setBusca] = useState("");
  const [natureza, setNatureza] = useState("");
  const [papel, setPapel] = useState<string>(papelInicial);
  const [categoria, setCategoria] = useState("");
  const [situacao, setSituacao] = useState("");
  /**
   * A ficha guarda o ID, nunca uma cópia do cadastro.
   *
   * Guardava o objeto (`setFicha(parte)`), capturado no instante do clique. Só
   * que `router.refresh()` — que roda depois de todo salvamento — refaz a
   * árvore do SERVIDOR e preserva o estado do cliente: a lista chegava nova e
   * a ficha continuava mostrando o objeto velho, para sempre. O telefone
   * entrava no banco (medido em produção) e a tela jurava que não.
   *
   * "Diz que salvou e não mostra depois" é exatamente esse desencontro, e ele
   * não aparece em teste de escrita nenhum: os dados estão certos dos dois
   * lados, só que um deles é de dez segundos atrás.
   */
  const [fichaId, setFichaId] = useState<string | null>(podeEscrever ? null : inicialParaEditar?.id ?? null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(
    podeEscrever && inicialParaEditar ? daParte(inicialParaEditar) : null,
  );
  const [fotoPendente, setFotoPendente] = useState<File | null>(null);
  /**
   * O rascunho MAIS RECENTE, para o salvamento nunca ler um retrato velho.
   *
   * O campo de telefone (e o de categorias) guarda o que se digita num estado
   * local e só o entrega ao rascunho quando o foco sai. Clicando em "Salvar", o
   * navegador dispara `blur` ANTES do `click` — e o valor chega. Só que o
   * manipulador do clique é o da renderização ANTERIOR: ele fecha sobre o
   * `rascunho` de antes do blur, e o número recém-digitado fica de fora do
   * corpo. Medido no navegador: o telefone virava etiqueta na tela e mesmo
   * assim não era enviado.
   *
   * Foi este atraso de um quadro que produziu "digito e não fica nada lá" —
   * e nenhum teste de servidor, rota ou banco poderia pegá-lo, porque o dado
   * nunca saía da tela.
   */
  // O que está DIGITADO nos campos de lista e ainda não virou etiqueta.
  // Lido no instante de montar o corpo, sem depender de nenhum quadro.
  const telefonePendente = useRef("");
  const categoriaPendente = useRef("");

  const rascunhoRef = useRef<Rascunho | null>(rascunho);
  rascunhoRef.current = rascunho;
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const fornecedorRef = useRef<HTMLDivElement>(null);
  const consultaAnterior = useRef({ papelInicial, editarInicial, podeEscrever });

  useEffect(() => {
    const anterior = consultaAnterior.current;
    if (
      anterior.papelInicial === papelInicial
      && anterior.editarInicial === editarInicial
      && anterior.podeEscrever === podeEscrever
    ) return;

    consultaAnterior.current = { papelInicial, editarInicial, podeEscrever };
    const alvo = lista.find((parte) => parte.id === editarInicial) ?? null;
    setPapel(papelInicial);
    setFichaId(podeEscrever ? null : alvo?.id ?? null);
    setRascunho(podeEscrever && alvo ? daParte(alvo) : null);
    setFotoPendente(null);
    setErro("");
  }, [editarInicial, lista, papelInicial, podeEscrever]);

  useEffect(() => {
    if (!editarInicial || rascunho?.id !== editarInicial || !rascunho.papeis.includes("fornecedor")) return;
    const quadro = requestAnimationFrame(() => fornecedorRef.current?.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(quadro);
    // O deep-link escolhe a ficha uma vez; digitar não pode reposicionar a folha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarInicial, rascunho?.id]);

  /**
   * Quem pode ser a organização de alguém: QUALQUER ficha, não só a que já
   * está marcada como empresa.
   *
   * Filtrar por `natureza === "empresa"` parecia óbvio e criava um beco sem
   * saída: `natureza` nasce "pessoa" por padrão e ninguém nunca troca, então o
   * seletor abria escrito "Sem organização cadastrada" num diretório com nove
   * fornecedores — Madeiranit, Packit, Molas ICO — que são todos empresas. Para
   * sair do beco a pessoa teria que adivinhar que precisa abrir cada ficha e
   * mudar um campo que não explica para que serve.
   *
   * Agora a natureza é CONSEQUÊNCIA do uso: escolher alguém como organização é
   * o que o torna uma empresa (o servidor marca), e as já marcadas sobem para o
   * topo da lista. O diretório se organiza sozinho, sem ninguém classificar
   * nada antes de saber por quê.
   */
  const empresasContato = useMemo(
    () => [...lista]
      .sort((a, b) => Number(b.natureza === "empresa") - Number(a.natureza === "empresa")
        || a.nome.localeCompare(b.nome, "pt-BR"))
      .map((parte) => ({ id: parte.id, nome: parte.nome })),
    [lista],
  );
  const nomeDaEmpresa = useMemo(
    () => new Map(empresasContato.map((empresa) => [empresa.id, empresa.nome])), [empresasContato],
  );
  const ativos = useMemo(() => lista.filter((parte) => parte.ativo), [lista]);
  const categoriasVistas = useMemo(() => {
    const nomes = [...new Set(lista.flatMap((parte) => parte.categorias ?? []).map((item) => item.trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    return lista.some((parte) => !parte.categorias?.length) ? [...nomes, SEM_CATEGORIA] : nomes;
  }, [lista]);
  const corDaCategoria = useMemo(
    () => new Map(categoriasVistas.map((item, indice) => [item, item === SEM_CATEGORIA ? "var(--neutro)" : CORES_CATEGORIA[indice % CORES_CATEGORIA.length]])),
    [categoriasVistas],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return lista.filter((parte) =>
      (!natureza || parte.natureza === natureza)
      && (!papel || parte.papeis.includes(papel as PapelContato))
      && (!categoria || (categoria === SEM_CATEGORIA ? !parte.categorias?.length : parte.categorias?.includes(categoria)))
      && (!situacao || (situacao === "ativo") === parte.ativo)
      && (!termo || [parte.nome, parte.email, parte.telefone, parte.cnpj, ...parte.categorias, ...parte.papeis.map((item) => LABEL_PAPEL[item])]
        .some((valor) => String(valor ?? "").toLocaleLowerCase("pt-BR").includes(termo))),
    );
  }, [busca, categoria, lista, natureza, papel, situacao]);

  // Derivada da lista a cada render: é o que faz o painel refletir o que
  // acabou de ser salvo. Se o cadastro sumiu da lista (inativado, filtrado),
  // a ficha fecha sozinha em vez de mostrar dado que já não existe.
  const ficha = fichaId ? lista.find((parte) => parte.id === fichaId) ?? null : null;

  const temFiltro = !!(busca.trim() || natureza || papel || categoria || situacao);
  const limparFiltros = () => { setBusca(""); setNatureza(""); setPapel(""); setCategoria(""); setSituacao(""); };

  function abrirNovo() {
    setErro("");
    setFichaId(null);
    setRascunho(novoRascunho(PAPEIS_CONTATO.includes(papel as PapelContato) ? papel as PapelContato : undefined));
  }

  function abrirEdicao(parte: ParteFinanceira) {
    setErro("");
    setFichaId(null);
    setRascunho(daParte(parte));
  }

  async function salvar() {
    // Do REF, não do fechamento: o que o campo acabou de entregar no `blur`
    // ainda não chegou nesta renderização.
    const rascunho = rascunhoRef.current;
    if (!rascunho) return;
    setSalvando(true);
    setErro("");
    const fornecedorAtivo = rascunho.papeis.includes("fornecedor");
    const comercial = rascunho.fornecedor;
    const corpo = {
      nome: rascunho.nome,
      natureza: rascunho.natureza,
      papeis: rascunho.papeis,
      cnpj: rascunho.cnpj || null,
      // O que a pessoa DIGITOU entra, mesmo sem ter clicado em "Acrescentar".
      // Exigir esse passo extra fazia o número ser jogado fora em silêncio,
      // com a tela dizendo "Cadastro salvo" — cinco tentativas seguidas na
      // mesma ficha, medidas no log de auditoria.
      telefones: comPendente(rascunho.telefones, telefonePendente.current),
      categorias: comPendente(rascunho.categorias, categoriaPendente.current),
      organizacao_id: rascunho.natureza === "pessoa" ? rascunho.organizacao_id || null : null,
      organizacao: rascunho.natureza === "pessoa" ? rascunho.organizacao || null : null,
      cargo: rascunho.natureza === "pessoa" ? rascunho.cargo || null : null,
      site: rascunho.site || null,
      email: rascunho.email || null,
      endereco: rascunho.endereco || null,
      observacao: rascunho.observacao || null,
      ativo: rascunho.ativo,
      ...(fornecedorAtivo ? {
        fornecedor: {
          ...(comercial.id ? { id: comercial.id } : {}),
          contato_nome: comercial.contato_nome || null,
          prazo_dias: comercial.prazo_dias === "" ? null : Number(comercial.prazo_dias),
          prazo_envio_dias: comercial.prazo_envio_dias === "" ? null : Number(comercial.prazo_envio_dias),
          forma_pagamento: comercial.forma_pagamento || null,
          pix_tipo: comercial.pix_tipo || null,
          pix_chave: comercial.pix_chave || null,
          banco: comercial.banco || null,
          agencia: comercial.agencia || null,
          conta_numero: comercial.conta_numero || null,
          aceita_boleto: comercial.aceita_boleto,
          inscricao_estadual: comercial.inscricao_estadual || null,
          cidade: comercial.cidade || null,
          uf: comercial.uf || null,
        },
      } : {}),
    };

    try {
      if (rascunho.id) {
        await chamar(`/api/financeiro/contatos/${rascunho.id}`, "PATCH", corpo);
      } else {
        const alvo = rascunho.empresa_id || empresaId;
        if (!alvo) { setErro("Escolha em qual empresa o cadastro nasce."); return; }
        const criado = await chamar("/api/financeiro/contatos", "POST", { empresa_id: alvo, ...corpo });
        if (fotoPendente && typeof criado.id === "string") {
          const erroFoto = await enviarMarca("contato", criado.id, fotoPendente);
          if (erroFoto) toast.erro(`Cadastro salvo, mas a imagem não subiu: ${erroFoto}`);
        }
      }
      setFotoPendente(null);
      const salvo = rascunho.id;
      setRascunho(null);
      // FILTRO LIGADO ESCONDE O QUE ACABOU DE SER SALVO.
      //
      // Quem estava filtrando por "Empresa" edita um cadastro, marca como
      // pessoa e salva: a linha some da lista, e o que se lê é "não salvou".
      // O mesmo com o filtro de papel, de categoria e com a busca. O dado está
      // no banco e a tela não o mostra — e ninguém suspeita do filtro, porque
      // ele estava ligado desde antes.
      //
      // Em vez de deixar a pessoa descobrir sozinha, os filtros SAEM: ela
      // pediu para ver este cadastro, não para manter a peneira.
      if (temFiltro) {
        limparFiltros();
        toast.ok("Cadastro salvo. Tirei os filtros para ele aparecer.");
      } else {
        toast.ok("Cadastro salvo.");
      }
      if (salvo) setFichaId(salvo);
      router.refresh();
    } catch (causa) {
      setErro(recado(causa));
    } finally {
      setSalvando(false);
    }
  }

  async function inativar(id: string) {
    if (!(await confirmar("Tirar este cadastro da lista?", {
      detalhe: "O histórico financeiro e o vínculo de fornecedor continuam preservados.", perigo: true,
    }))) return;
    setSalvando(true);
    setErro("");
    try {
      await chamar(`/api/financeiro/contatos/${id}`, "DELETE");
      setRascunho(null);
      toast.ok("Cadastro inativado.");
      router.refresh();
    } catch (causa) {
      setErro(recado(causa));
    } finally {
      setSalvando(false);
    }
  }

  const atualizarFornecedor = (mudanca: Partial<FornecedorRascunho>) => {
    if (rascunho) setRascunho({ ...rascunho, fornecedor: { ...rascunho.fornecedor, ...mudanca } });
  };

  return (
    <>
      <Cabecalho
        titulo="Contatos e empresas"
        sub="Pessoas e organizações com quem a empresa se relaciona."
        busca={busca}
        aoBuscar={setBusca}
        acoes={
          <>
            {podeEscrever && <BotaoFin icone="plus" primario onClick={abrirNovo}>Novo contato ou empresa</BotaoFin>}
            <BotaoExportar
              assunto="Contatos e empresas" empresa={empresaNome} linhas={visiveis}
              colunas={[
                { cabecalho: "Nome", valor: (parte) => parte.nome },
                { cabecalho: "Natureza", valor: (parte) => LABEL_CONTATO_NATUREZA[parte.natureza] },
                { cabecalho: "Papéis", valor: (parte) => parte.papeis.map((item) => LABEL_PAPEL[item]).join(", ") },
                { cabecalho: "Categorias", valor: (parte) => parte.categorias.join(", ") },
                { cabecalho: "Telefone", valor: (parte) => parte.telefone ?? "" },
                { cabecalho: "Status", valor: (parte) => parte.ativo ? "Ativo" : "Inativo" },
              ]}
            />
          </>
        }
      />

      {schemaPendente && <AvisoSchema />}

      <LinhaKpi>
        <KpiSeta
          icone="users"
          rotulo="Cadastros ativos"
          valor={String(ativos.length)}
          detalhe={`${lista.length - ativos.length} ${lista.length - ativos.length === 1 ? "inativo" : "inativos"}`}
          aoAbrir={() => setSituacao("ativo")}
          tituloDaSeta="Ver só os ativos"
        />
        <KpiSeta
          icone="building-warehouse"
          rotulo="Empresas"
          valor={String(ativos.filter((parte) => parte.natureza === "empresa").length)}
          detalhe="organizações externas"
          aoAbrir={() => { setNatureza("empresa"); setSituacao("ativo"); }}
          tituloDaSeta="Ver só as organizações"
        />
        <KpiSeta
          icone="truck"
          rotulo="Fornecedores"
          valor={String(ativos.filter((parte) => parte.papeis.includes("fornecedor")).length)}
          tom="atencao"
          detalhe="com seção comercial"
          aoAbrir={() => { setPapel("fornecedor"); setSituacao("ativo"); }}
          tituloDaSeta="Ver só os fornecedores"
        />
      </LinhaKpi>

      <Cartao>
        <TituloCartao icone="users">Diretório</TituloCartao>
        <BuscaDaLista valor={busca} aoBuscar={setBusca} placeholder="Buscar contato ou empresa…" />
        <Filtros>
          <Filtro rotulo="Natureza" valor={natureza} aoMudar={setNatureza} opcoes={CONTATO_NATUREZAS.map((item) => ({ valor: item, label: LABEL_CONTATO_NATUREZA[item] }))} />
          <Filtro rotulo="Papel" valor={papel} aoMudar={setPapel} opcoes={PAPEIS_CONTATO.map((item) => ({ valor: item, label: LABEL_PAPEL[item] }))} />
          <Filtro rotulo="Categoria" valor={categoria} aoMudar={setCategoria} opcoes={categoriasVistas.map((item) => ({ valor: item, label: rotuloCategoria(item) }))} />
          <Filtro rotulo="Status" valor={situacao} aoMudar={setSituacao} opcoes={[{ valor: "ativo", label: "Ativos" }, { valor: "inativo", label: "Inativos" }]} />
          <LimparFiltros ativo={temFiltro} aoLimpar={limparFiltros} />
        </Filtros>

        <ColunasPorEmpresa linhas={visiveis} empresas={empresas} empresaId={empresaId} empresaNome={empresaNome} rotulo={{ um: "contato", muitos: "contatos" }}>
          {(l) => (
            <Tabela
              linhas={l}
              chaveDe={(parte) => parte.id}
              paginar={10}
              rotuloItem="cadastros"
              aoClicar={(parte) => setFichaId(parte.id)}
              vazio={
                <Vazio
                  icone="users" titulo={lista.length ? "Nada com esses filtros" : "Nenhum contato ou empresa"}
                  detalhe="Pessoas e organizações ficam em uma única lista e podem acumular papéis."
                  acao={podeEscrever && !lista.length ? <BotaoFin icone="plus" onClick={abrirNovo}>Novo contato ou empresa</BotaoFin> : undefined}
                />
              }
              colunas={[
                {
                  chave: "nome", label: "Nome", largura: "minmax(min(100%, 136px), 1.6fr)", titulo: true,
                  celula: (parte) => (
                    <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                      <Marca marca={{ nome: parte.nome, logo: logos[parte.id] ?? null, icone: parte.icone, cor: corDaCategoria.get(chaveCategoria(parte)) }} tamanho={28} raio={8} />
                      {parte.nome}
                    </span>
                  ),
                },
                { chave: "papeis", label: "Papéis", largura: "minmax(min(100%, 132px), 1.3fr)", largo: true, celula: (parte) => <ResumoPapeis papeis={parte.papeis} /> },
                { chave: "telefone", label: "Telefone", largura: "minmax(min(100%, 104px), 1fr)", soNoComputador: true, celula: (parte) => parte.telefone || "—" },
                { chave: "status", label: "Status", largura: "84px", fim: true, celula: (parte) => <Selo selo={parte.ativo ? SELO_ATIVO : SELO_INATIVO} /> },
              ]}
            />
          )}
        </ColunasPorEmpresa>
      </Cartao>

      {ficha && (
        <PainelLateral
          centrado
          titulo="Contato ou empresa"
          onFechar={() => setFichaId(null)}
          largura={500}
          rodape={
            <Acoes>
              <Botao onClick={() => setFichaId(null)}>Fechar</Botao>
              <Esp />
              {podeEscrever && <Botao variante="primario" icone="pencil" onClick={() => abrirEdicao(ficha)}>Editar</Botao>}
            </Acoes>
          }
        >
          <FichaTopo
            marca={{ nome: ficha.nome, logo: logos[ficha.id] ?? null, icone: ficha.icone ?? (ficha.natureza === "empresa" ? "building-warehouse" : "user"), cor: corDaCategoria.get(chaveCategoria(ficha)) }}
            titulo={ficha.nome}
            detalhe={LABEL_CONTATO_NATUREZA[ficha.natureza]}
            selo={<Selo selo={ficha.ativo ? SELO_ATIVO : SELO_INATIVO} />}
          />
          <FichaBloco titulo="Papéis"><ResumoPapeis papeis={ficha.papeis} acessivel /></FichaBloco>
          <FichaBloco titulo="Dados gerais">
            <FichaLinha rotulo="Natureza">{LABEL_CONTATO_NATUREZA[ficha.natureza]}</FichaLinha>
            {ficha.natureza === "empresa" && <FichaLinha rotulo="CNPJ">{cnpjBonito(ficha.cnpj)}</FichaLinha>}
            {ficha.natureza === "pessoa" && <FichaLinha rotulo="Organização">{(ficha.organizacao_id ? nomeDaEmpresa.get(ficha.organizacao_id) : null) ?? ficha.organizacao}</FichaLinha>}
            {ficha.natureza === "pessoa" && <FichaLinha rotulo="Cargo / função">{ficha.cargo}</FichaLinha>}
            <FichaLinha rotulo="Categorias">{ficha.categorias.join(" · ")}</FichaLinha>
            <FichaLinha rotulo="WhatsApp">{ficha.telefones.map((telefone) => <FichaContato key={telefone} tipo="whatsapp" valor={telefone} />)}</FichaLinha>
            <FichaLinha rotulo="E-mail">{ficha.email ? <FichaContato tipo="email" valor={ficha.email} /> : null}</FichaLinha>
            <FichaLinha rotulo="Site">{ficha.site ? <FichaContato tipo="site" valor={ficha.site} /> : null}</FichaLinha>
            <FichaLinha rotulo="Endereço">{ficha.endereco}</FichaLinha>
          </FichaBloco>
          {ficha.papeis.includes("fornecedor") && ficha.fornecedor && (
            <FichaBloco titulo="Fornecedor">
              <FichaLinha rotulo="Prazo de pagamento">{ficha.fornecedor.prazo_dias == null ? null : `${ficha.fornecedor.prazo_dias} dias`}</FichaLinha>
              <FichaLinha rotulo="Prazo de entrega">{ficha.fornecedor.prazo_envio_dias == null ? null : `${ficha.fornecedor.prazo_envio_dias} dias`}</FichaLinha>
              <FichaLinha rotulo="Forma de pagamento">{ficha.fornecedor.forma_pagamento}</FichaLinha>
              <FichaLinha rotulo="Contato comercial">{ficha.fornecedor.contato_nome}</FichaLinha>
              <FichaLinha rotulo="Chave PIX">{ficha.fornecedor.pix_chave ? <FichaContato tipo="copiar" valor={ficha.fornecedor.pix_chave} /> : null}</FichaLinha>
              <FichaLinha rotulo="Banco">{[ficha.fornecedor.banco, ficha.fornecedor.agencia && `ag. ${ficha.fornecedor.agencia}`, ficha.fornecedor.conta_numero].filter(Boolean).join(" · ")}</FichaLinha>
              <FichaLinha rotulo="Boleto">{ficha.fornecedor.aceita_boleto ? "Emite boleto" : "Não emite boleto"}</FichaLinha>
            </FichaBloco>
          )}
          <FichaBloco titulo="Anotações"><FichaLinha rotulo="Observações" vazio="Nada anotado.">{ficha.observacao}</FichaLinha></FichaBloco>
          {!podeEscrever && <p style={{ marginTop: 16, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>Você abre a ficha, mas não edita: falta a permissão de cadastros do Financeiro.</p>}
        </PainelLateral>
      )}

      {rascunho && (
        <PainelLateral
          centrado
          titulo={rascunho.id ? "Editar contato ou empresa" : "Novo contato ou empresa"}
          soFechaNoX
          onFechar={() => setRascunho(null)}
          largura={560}
          rodape={
            <Acoes>
              <Botao onClick={() => setRascunho(null)}>Cancelar</Botao>
              {rascunho.id && rascunho.ativo && <Botao variante="perigo" icone="user-off" onClick={() => inativar(rascunho.id as string)} disabled={salvando}>Tirar do cadastro</Botao>}
              <Esp />
              <Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar</Botao>
            </Acoes>
          }
        >
          {erro && <p style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>}
          <CampoMarca
            tipo="contato" id={rascunho.id} nome={rascunho.nome}
            logo={rascunho.id ? logos[rascunho.id] ?? null : null}
            icone={rascunho.natureza === "empresa" ? "building-warehouse" : "user"}
            cor={corDaCategoria.get((rascunho.categorias[0] ?? "").trim() || SEM_CATEGORIA)}
            aoTrocar={() => router.refresh()} aoEscolherPendente={setFotoPendente}
          />

          <Campos>
            {!rascunho.id && !empresaId && empresas.length > 0 && (
              <Campo label="Empresa financeira" largo dica="Em Visão geral, escolha onde o cadastro nasce.">
                {(id) => <SeletorEmpresa id={id} empresas={empresas} valor={rascunho.empresa_id} aoMudar={(valor) => setRascunho({ ...rascunho, empresa_id: valor })} />}
              </Campo>
            )}
            <Campo label="Nome" largo>
              {(id) => <input id={id} value={rascunho.nome} onChange={(evento) => setRascunho({ ...rascunho, nome: evento.target.value })} placeholder={rascunho.natureza === "empresa" ? "Distribuidora Atlas" : "Ana Souza"} />}
            </Campo>
            <Campo label="Pessoa ou empresa?" dica="Muda o que a ficha pergunta — empresa pede CNPJ, pessoa pede cargo.">
              {(id) => <Alternativas
  id={id}
  valor={rascunho.natureza}
  aoEscolher={(v) => setRascunho({ ...rascunho, natureza: v as ContatoNatureza })}
  opcoes={CONTATO_NATUREZAS.map((item) => ({
    id: item, label: LABEL_CONTATO_NATUREZA[item],
    icone: item === "empresa" ? "building-warehouse" : "user",
  }))}
/>}
            </Campo>
            <Campo label="Papéis" largo dica="Um cadastro pode cumprir mais de um papel.">
              <PapeisContato valor={rascunho.papeis} aoMudar={(papeis) => setRascunho({ ...rascunho, papeis })} />
            </Campo>
            {rascunho.natureza === "empresa" && (
              <Campo label="CNPJ" dica="Pode digitar com ponto e barra: só os dígitos são guardados.">
                {(id) => <input id={id} inputMode="numeric" value={rascunho.cnpj} onChange={(evento) => setRascunho({ ...rascunho, cnpj: evento.target.value })} placeholder="00.000.000/0000-00" />}
              </Campo>
            )}
            {/* UM campo de organização, não dois.
                Havia "Organização" (uma lista) e "Organização em texto" (uma
                caixa) lado a lado, e a diferença entre elas é detalhe de como o
                banco guarda: uma vira vínculo, a outra vira texto. Perguntar
                isso obriga quem cadastra a entender o modelo de dados antes de
                escrever o nome de uma empresa.
                Agora é um campo só: digite. Se o nome bate com uma ficha do
                diretório, vira vínculo (e a lista sugere enquanto digita); se
                não bate, fica como texto. O resultado é o mesmo dos dois campos
                antigos, sem a pergunta. */}
            {rascunho.natureza === "pessoa" && (
              <Campo label="Organização" largo dica="Digite o nome. Se já houver ficha, ela é sugerida e o vínculo é criado.">
                {(id) => (
                  <input
                    id={id}
                    list="fin-organizacoes"
                    value={rascunho.organizacao_id
                      ? (nomeDaEmpresa.get(rascunho.organizacao_id) ?? rascunho.organizacao)
                      : rascunho.organizacao}
                    placeholder="Elétrica Rápida"
                    onChange={(evento) => {
                      const escrito = evento.target.value;
                      // Casa pelo nome, sem diferenciar maiúscula nem acento
                      // sobrando nas pontas: quem digita "packit" quer a Packit.
                      const igual = empresasContato.find(
                        (item) => item.id !== rascunho.id
                          && item.nome.trim().toLocaleLowerCase("pt-BR") === escrito.trim().toLocaleLowerCase("pt-BR"),
                      );
                      setRascunho({
                        ...rascunho,
                        organizacao_id: igual?.id ?? "",
                        // O texto é guardado sempre: se a ficha for apagada
                        // depois, o nome não some junto com o vínculo.
                        organizacao: escrito,
                      });
                    }}
                  />
                )}
              </Campo>
            )}
            {rascunho.natureza === "pessoa" && (
              <Campo label="Cargo / função">{(id) => <input id={id} value={rascunho.cargo} onChange={(evento) => setRascunho({ ...rascunho, cargo: evento.target.value })} />}</Campo>
            )}
            <Campo label="Categorias" largo>
              {(id) => <Categorias id={id} escolhidas={rascunho.categorias} catalogo={catalogoDeCategorias} pendente={categoriaPendente} aoMudar={(categorias) => setRascunho({ ...rascunho, categorias })} />}
            </Campo>
            <Campo label="WhatsApp" largo>
              {(id) => <Telefones id={id} escolhidas={rascunho.telefones} pendente={telefonePendente} aoMudar={(telefones) => setRascunho({ ...rascunho, telefones })} />}
            </Campo>
            <Campo label="E-mail">{(id) => <input id={id} type="email" value={rascunho.email} onChange={(evento) => setRascunho({ ...rascunho, email: evento.target.value })} />}</Campo>
          </Campos>

          {/* Nome, papel, organização e telefone é o que se sabe na hora de
              cadastrar alguém. Site, endereço e observação quase nunca — e
              abertos no meio da folha eles empurram os botões para longe do
              polegar no celular. */}
          <Secao
            icone="file-text"
            titulo="Mais detalhes"
            resumo="Site, endereço, observações"
            inicialAberta={!!(rascunho.site || rascunho.endereco || rascunho.observacao)}
          >
            <Campos>
              <Campo label="Site" largo>{(id) => <input id={id} type="url" value={rascunho.site} onChange={(evento) => setRascunho({ ...rascunho, site: evento.target.value })} />}</Campo>
              <Campo label="Endereço" largo>{(id) => <input id={id} value={rascunho.endereco} onChange={(evento) => setRascunho({ ...rascunho, endereco: evento.target.value })} />}</Campo>
              <Campo label="Observações" largo>{(id) => <textarea id={id} rows={3} value={rascunho.observacao} onChange={(evento) => setRascunho({ ...rascunho, observacao: evento.target.value })} />}</Campo>
              {rascunho.id && <Campo label="Status">{(id) => <Alternativas
  id={id}
  valor={rascunho.ativo ? "1" : "0"}
  aoEscolher={(v) => setRascunho({ ...rascunho, ativo: v === "1" })}
  opcoes={[{ id: "1", label: "Ativo" }, { id: "0", label: "Inativo" }]}
/>}</Campo>}
            </Campos>
          </Secao>

          {rascunho.papeis.includes("fornecedor") && (
            <div ref={fornecedorRef} style={{ marginTop: 22, scrollMarginTop: 16 }}>
              <TituloCartao icone="truck">Fornecedor</TituloCartao>
              <p style={{ margin: "-6px 0 14px", color: "var(--text-dim)", fontSize: 12.5, lineHeight: 1.5 }}>Condições comerciais usadas em compras e compromissos.</p>
              <Campos>
                <Campo label="Prazo de pagamento (dias)" dica="Quando o dinheiro sai.">{(id) => <input id={id} type="number" min="0" max="365" inputMode="numeric" value={rascunho.fornecedor.prazo_dias} onChange={(evento) => atualizarFornecedor({ prazo_dias: evento.target.value })} />}</Campo>
                <Campo label="Prazo de entrega (dias)" dica="Quando a mercadoria chega.">{(id) => <input id={id} type="number" min="0" max="365" inputMode="numeric" value={rascunho.fornecedor.prazo_envio_dias} onChange={(evento) => atualizarFornecedor({ prazo_envio_dias: evento.target.value })} />}</Campo>
                <Campo label="Forma de pagamento">{(id) => <input id={id} list="fin-formas-pagamento" value={rascunho.fornecedor.forma_pagamento} onChange={(evento) => atualizarFornecedor({ forma_pagamento: evento.target.value })} />}</Campo>
                <Campo label="Contato comercial">{(id) => <input id={id} value={rascunho.fornecedor.contato_nome} onChange={(evento) => atualizarFornecedor({ contato_nome: evento.target.value })} />}</Campo>
              </Campos>

              {/* Treze campos abertos de uma vez é o que faz a ficha parecer
                  um formulário de imposto. Os quatro de cima decidem compra e
                  compromisso, e são os únicos que quase todo fornecedor tem;
                  dados bancários e endereço fiscal só interessam na hora de
                  pagar. Ficam um toque abaixo — abertos sozinhos quando já há
                  algo preenchido, para editar não virar caça ao campo. */}
              <Secao
                icone="credit-card"
                titulo="Pagamento e dados fiscais"
                resumo="PIX, banco, boleto e endereço"
                inicialAberta={!!(rascunho.fornecedor.pix_chave || rascunho.fornecedor.banco
                  || rascunho.fornecedor.inscricao_estadual || rascunho.fornecedor.cidade)}
              >
              <Campos>
                <Campo label="Inscrição estadual">{(id) => <input id={id} value={rascunho.fornecedor.inscricao_estadual} onChange={(evento) => atualizarFornecedor({ inscricao_estadual: evento.target.value })} />}</Campo>
                <Campo label="Tipo da chave PIX">{(id) => <select id={id} value={rascunho.fornecedor.pix_tipo} onChange={(evento) => atualizarFornecedor({ pix_tipo: evento.target.value })}><option value="">Sem PIX</option>{PIX_TIPOS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>}</Campo>
                <Campo label="Chave PIX" largo>{(id) => <input id={id} value={rascunho.fornecedor.pix_chave} onChange={(evento) => atualizarFornecedor({ pix_chave: evento.target.value })} />}</Campo>
                <Campo label="Banco">{(id) => <input id={id} value={rascunho.fornecedor.banco} onChange={(evento) => atualizarFornecedor({ banco: evento.target.value })} />}</Campo>
                <Campo label="Agência">{(id) => <input id={id} inputMode="numeric" value={rascunho.fornecedor.agencia} onChange={(evento) => atualizarFornecedor({ agencia: evento.target.value })} />}</Campo>
                <Campo label="Conta">{(id) => <input id={id} inputMode="numeric" value={rascunho.fornecedor.conta_numero} onChange={(evento) => atualizarFornecedor({ conta_numero: evento.target.value })} />}</Campo>
                <Campo label="Boleto">{(id) => <Alternativas
  id={id}
  valor={rascunho.fornecedor.aceita_boleto ? "1" : "0"}
  aoEscolher={(v) => atualizarFornecedor({ aceita_boleto: v === "1" })}
  opcoes={[{ id: "1", label: "Emite boleto" }, { id: "0", label: "Não emite" }]}
/>}</Campo>
                <Campo label="Cidade">{(id) => <input id={id} value={rascunho.fornecedor.cidade} onChange={(evento) => atualizarFornecedor({ cidade: evento.target.value })} />}</Campo>
                <Campo label="UF">{(id) => <input id={id} maxLength={2} value={rascunho.fornecedor.uf} onChange={(evento) => atualizarFornecedor({ uf: evento.target.value.toUpperCase() })} />}</Campo>
              </Campos>
              </Secao>
            </div>
          )}

          <datalist id="fin-organizacoes">{empresasContato.filter((item) => item.id !== rascunho.id).map((item) => <option key={item.id} value={item.nome} />)}</datalist>
          <datalist id="fin-formas-pagamento">{formasDePagamento.map((forma) => <option key={forma} value={forma} />)}</datalist>
        </PainelLateral>
      )}
    </>
  );
}
