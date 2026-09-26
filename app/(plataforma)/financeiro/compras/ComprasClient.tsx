"use client";

// ── Compras (§7) ─────────────────────────────────────────────────────────────
// A parte interativa da tela: filtros, seleção da compra e o formulário.
//
// O formulário mostra a PRÉVIA das parcelas antes de salvar, com as mesmas
// `parcelasDaCompra()` que o servidor vai usar para criar os compromissos. Não
// é enfeite: escolher "3x" e só descobrir as datas depois de gravar é como
// alguém acaba com três contas caindo em dezembro sem ter pedido isso — e
// desfazer já custa cancelar compromisso, não apagar rascunho.

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { interpretarLinha } from "@/lib/financeiro/linha-rapida";
import { Icon } from "../../Icon";
import { BotaoIcone } from "../../ui/controles";
import { Alerta } from "../../ui/Alerta";
import { useAtualizar } from "../../ui/useAtualizar";
import { FiltroPeriodo, Atualizando, AvisoSchema, Barras, BotaoFin, Cabecalho, Cartao, Filtro, Filtros, LimparFiltros, LinhaKpi, Selo, Tabela, TituloCartao, Vazio, BotaoExportar, SeletorEmpresa, LinhaRapida, ModalFormulario, Escolha, FaixaDePaineis } from "../ui";
import { ColunasPorEmpresa, KpiSeta } from "../blocos";
import { lerNotaFiscal } from "@/lib/financeiro/nota-xml";
import {
  centavos, dataBR, dentroDaJanela, diaSeguro, emAberto, fatias, moeda,
  parcelasDaCompra, somarDias, statusEfetivo,
} from "@/lib/financeiro/calculos";
import { ehMes, janelaDoMes, mesRelativo, rotuloDoMes } from "@/lib/financeiro/periodo";
import {
  acharCategoria, CATEGORIAS_COMPRA, COMPRA_STATUS, LABEL_PLANO,
  SELO_COMPRA, SELO_COMPROMISSO,
} from "@/lib/financeiro/tipos";
import type { Compra, Compromisso, Conta, Fornecedor, Plano } from "@/lib/financeiro/tipos";
import { dataCSV, numeroCSV } from "@/lib/financeiro/csv";

// ── Campos ───────────────────────────────────────────────────────────────────

const CAIXA: React.CSSProperties = {
  width: "100%", minWidth: 0, minHeight: "var(--tap)", padding: "0 12px",
  borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text)", fontSize: 14, outline: "none",
};

const ROTULO: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-dim)" };

function Campo({ rotulo, largo, erro, children }: {
  rotulo: string; largo?: boolean;
  /** Erro EMBAIXO do campo, não no fim do formulário — a pessoa vê onde errou. */
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className="ui-campo"
      data-erro={erro ? "1" : undefined}
      style={{ display: "grid", gap: 6, gridColumn: largo ? "1 / -1" : undefined, minWidth: 0 }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: erro ? "var(--perigo)" : "var(--text-dim)" }}>{rotulo}</span>
      {children}
      {erro && <span role="alert" style={{ fontSize: 12, fontWeight: 600, color: "var(--perigo)" }}>{erro}</span>}
    </label>
  );
}

/**
 * Igual ao `Campo`, mas em `<div>`. Grupo de botões NÃO pode morar dentro de um
 * `<label>`: clicar no rótulo aciona o primeiro botão do grupo, e a escolha da
 * pessoa troca sozinha sem ninguém entender por quê.
 */
function Grupo({ rotulo, largo, children }: {
  rotulo: string; largo?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0, gridColumn: largo ? "1 / -1" : undefined }}>
      <span style={ROTULO}>{rotulo}</span>
      {children}
    </div>
  );
}

/**
 * `<option>` com fundo SÓLIDO. `--surface-2` é translúcido no tema escuro, e a
 * lista aberta do `<select>` é desenhada pelo sistema sobre o fundo dele: com
 * branco 9% ali, o texto claro cai sobre branco e a opção some.
 */
function Opcao({ valor, children }: { valor: string; children: React.ReactNode }) {
  return (
    <option value={valor} style={{ background: "var(--pop-bg)", color: "var(--text)" }}>
      {children}
    </option>
  );
}

// ── Números digitados ────────────────────────────────────────────────────────

/**
 * "1.250,90" e "1250.90" viram o mesmo número. A vírgula é o decimal aqui, e
 * quando ela aparece o ponto só pode ser separador de milhar — ler o ponto como
 * decimal nesse caso transformaria mil e duzentos reais em um e vinte e cinco.
 */
function paraNumero(v: string): number {
  const t = v.trim();
  if (!t) return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}

interface LinhaItem {
  chave: string; descricao: string; quantidade: string; unidade: string; valor_unitario: string;
}

/** Os atalhos que convivem com os meses no seletor de período. */
const ATALHOS_DE_PERIODO = [
  { valor: "30d", label: "Últimos 30 dias" },
  { valor: "90d", label: "Últimos 90 dias" },
];

const PLANOS_DA_TELA: { id: Plano; label: string }[] = [
  { id: "a_vista", label: "À vista" },
  { id: "prazo", label: "A prazo" },
  { id: "parcelado", label: "Parcelado" },
];

type FornecedorComContato = Fornecedor & { contato_id?: string | null };

// ── Tela ─────────────────────────────────────────────────────────────────────

export function ComprasClient({
  empresas = [], empresaId, empresaNome, podeCriar, compras, parcelas, fornecedores, contas, hoje,
  contatosPorFornecedor = {}, abrirNovo, schemaPendente,
}: {
  /** As empresas liberadas — a compra diz em qual nasce quando a tela está em "Visão geral". */
  empresas?: { id: string; nome: string }[];
  empresaId: string;
  empresaNome: string;
  podeCriar: boolean;
  compras: Compra[];
  parcelas: Compromisso[];
  fornecedores: FornecedorComContato[];
  /** fornecedor legado → contato canônico; inclui históricos fora do seletor ativo. */
  contatosPorFornecedor?: Record<string, string>;
  contas: Conta[];
  hoje: string;
  abrirNovo: boolean;
  schemaPendente: boolean;
}) {
  const router = useRouter();
  // `router.refresh()` que diz quando terminou — a lista avisa "Atualizando…"
  // até a compra nova estar de fato na tabela.
  const { atualizar, atualizando } = useAtualizar();

  const [ano, mes] = hoje.split("-").map(Number);
  const inicioMes = diaSeguro(ano, mes, 1);
  const fimMes = diaSeguro(ano, mes, 31);   // `diaSeguro` já corta no último dia real

  // ── Filtros ────────────────────────────────────────────────────────────────
  // Nasce no mês de hoje — padrão do módulo inteiro (set/2026); as setas do
  // filtro andam de mês em mês e "Limpar" volta pra hoje.
  const [periodo, setPeriodo] = useState(() => mesRelativo(hoje, 0));
  const periodoPadrao = mesRelativo(hoje, 0);
  const rotuloDoPeriodo = ehMes(periodo) ? rotuloDoMes(periodo, hoje) : "o período";
  const [fornecedorFiltro, setFornecedorFiltro] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");

  const nomeFornecedor = useMemo(
    () => new Map(fornecedores.map((f) => [f.id, f.nome])), [fornecedores]);

  const visiveis = useMemo(() => {
    const mes = janelaDoMes(periodo);
    const janela: [string, string] | null =
      mes ? [mes.de, mes.ate]
      : periodo === "30d" ? [somarDias(hoje, -30), hoje]
      : periodo === "90d" ? [somarDias(hoje, -90), hoje]
      : periodo === "ano" ? [`${ano}-01-01`, `${ano}-12-31`]
      : null;
    return compras.filter((c) => {
      if (janela && !dentroDaJanela(c.data, janela[0], janela[1])) return false;
      if (fornecedorFiltro && c.fornecedor_id !== fornecedorFiltro) return false;
      if (categoriaFiltro && c.categoria !== categoriaFiltro) return false;
      if (statusFiltro && c.status !== statusFiltro) return false;
      return true;
    });
  }, [compras, periodo, fornecedorFiltro, categoriaFiltro, statusFiltro, hoje, ano, inicioMes, fimMes]);

  const temFiltro = !!(periodo !== periodoPadrao || fornecedorFiltro || categoriaFiltro || statusFiltro);
  const limparFiltros = () => {
    setPeriodo(periodoPadrao); setFornecedorFiltro(""); setCategoriaFiltro(""); setStatusFiltro("");
  };

  // ── Números do mês ─────────────────────────────────────────────────────────
  // Os KPIs falam do MÊS e não obedecem ao filtro: número de cabeçalho que muda
  // quando alguém mexe num chip não serve para comparar nada.
  const doMes = useMemo(
    () => compras.filter((c) => c.status !== "cancelada" && dentroDaJanela(c.data, inicioMes, fimMes)),
    [compras, inicioMes, fimMes]);

  const totalMes = centavos(doMes.reduce((s, c) => s + c.valor_total, 0));

  const emAbertoDaCompra = useMemo(
    () => parcelas.filter((p) => emAberto(statusEfetivo(p, hoje))), [parcelas, hoje]);
  const aPagar = centavos(emAbertoDaCompra.reduce((s, p) => s + p.valor, 0));

  const maiorCategoria = useMemo(
    () => fatias(doMes, (c) => c.categoria, (c) => c.valor_total,
      (id) => acharCategoria(CATEGORIAS_COMPRA, id))[0] ?? null,
    [doMes]);

  // As barras acompanham o que está FILTRADO, não o mês: ao lado de uma tabela
  // de setembro, um gráfico de agosto contaria outra história com ar de mesma.
  const barras = useMemo(
    () => fatias(
      visiveis.filter((c) => c.status !== "cancelada"),
      (c) => c.categoria, (c) => c.valor_total,
      (id) => acharCategoria(CATEGORIAS_COMPRA, id)),
    [visiveis]);

  // ── Compra em foco ─────────────────────────────────────────────────────────
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const emFoco = useMemo(
    () => compras.find((c) => c.id === selecionadaId)
      ?? compras.find((c) => c.status === "confirmada" || c.status === "recebida")
      ?? compras[0] ?? null,
    [compras, selecionadaId]);
  const contatoDoFornecedorEmFoco = emFoco?.fornecedor_id
    ? contatosPorFornecedor[emFoco.fornecedor_id]
      ?? fornecedores.find((fornecedor) => fornecedor.id === emFoco.fornecedor_id)?.contato_id
    : null;
  const fichaDoFornecedorEmFoco = contatoDoFornecedorEmFoco
    ? `/financeiro/cadastros/contatos?papel=fornecedor&editar=${encodeURIComponent(contatoDoFornecedorEmFoco)}`
    : null;

  const parcelasEmFoco = useMemo(
    () => (emFoco ? parcelas.filter((p) => p.origem_id === emFoco.id) : [])
      .slice()
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    [parcelas, emFoco]);

  // ── Formulário ─────────────────────────────────────────────────────────────
  const [aberto, setAberto] = useState(abrirNovo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Em "Visão geral" a tela não tem empresa: a compra pergunta em qual nasce.
  const [empresaEscolhida, setEmpresaEscolhida] = useState(empresaId);
  // A LINHA RÁPIDA: "MDF 3mm 4.500 Madeireira X em 3x" preenche descrição,
  // fornecedor, o primeiro item e o plano — a cada tecla. Ver `interpretarLinha`.
  const [linha, setLinha] = useState("");
  const [entendido, setEntendido] = useState<string[]>([]);
  const [erros, setErros] = useState<{ descricao?: string; empresa?: string; itens?: string }>({});
  const [descricao, setDescricao] = useState("");
  const [fornecedorNovo, setFornecedorNovo] = useState("");
  const [dataCompra, setDataCompra] = useState(hoje);
  const [categoria, setCategoria] = useState(CATEGORIAS_COMPRA[0].id);
  const [plano, setPlano] = useState<Plano>("a_vista");
  const [nParcelas, setNParcelas] = useState("3");
  const [prazoDias, setPrazoDias] = useState("30");
  const [primeiroVenc, setPrimeiroVenc] = useState("");
  const [contaId, setContaId] = useState("");
  const [observacao, setObservacao] = useState("");

  // Contador em vez de `Math.random()`: a chave precisa sair igual no servidor e
  // no navegador, senão `?novo=1` renderiza duas árvores diferentes.
  const seq = useRef(0);
  const linhaNova = (): LinhaItem => ({
    chave: `i${seq.current++}`, descricao: "", quantidade: "1", unidade: "un", valor_unitario: "",
  });
  const [itens, setItens] = useState<LinhaItem[]>(() => [linhaNova()]);

  const mexerItem = (chave: string, campo: keyof LinhaItem, valor: string) =>
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)));

  const subtotal = (i: LinhaItem) => centavos(paraNumero(i.quantidade) * paraNumero(i.valor_unitario));
  const total = centavos(itens.reduce((s, i) => s + subtotal(i), 0));

  const escreverLinha = (texto: string) => {
    setLinha(texto);
    const r = interpretarLinha(texto, { hoje, fornecedores });
    setEntendido(r.entendido);
    if (!texto.trim()) return;
    setDescricao(r.descricao);
    if (r.fornecedor) setFornecedorNovo(r.fornecedor.id);
    if (r.data) setDataCompra(r.data);
    if (r.parcelas) { setPlano("parcelado"); setNParcelas(String(r.parcelas)); }
    // O valor vai para o PRIMEIRO item, como uma linha de quantidade 1: é o
    // caso de "comprei X por Y". Quem tem vários itens detalha embaixo.
    if (r.valor != null) {
      setItens((lista) => {
        const [primeiro, ...resto] = lista.length ? lista : [linhaNova()];
        return [{ ...primeiro, descricao: primeiro.descricao || r.descricao, quantidade: primeiro.quantidade || "1", valor_unitario: r.valor!.toFixed(2) }, ...resto];
      });
    }
    setErros({});
  };

  /**
   * Importa o XML da NF-e e preenche a compra: emitente vira fornecedor (se
   * já existir um com nome parecido), itens viram linhas, duplicatas viram o
   * plano de parcelas. Tudo continua EDITÁVEL — a nota sugere, não manda.
   */
  const arquivoNota = useRef<HTMLInputElement>(null);
  function lerArquivoDaNota(arquivo: File) {
    void arquivo.text().then((cru) => {
      const nota = lerNotaFiscal(new DOMParser().parseFromString(cru, "text/xml"));
      if (!nota) { setAviso("Esse arquivo não parece um XML de NF-e."); return; }
      setDescricao(`NF ${nota.numero} — ${nota.emitente}`.trim());
      if (nota.dataEmissao) setDataCompra(nota.dataEmissao);
      if (nota.itens.length) {
        setItens(nota.itens.map((i) => ({
          chave: `i${seq.current++}`, descricao: i.descricao,
          quantidade: String(i.quantidade), unidade: i.unidade,
          valor_unitario: i.valorUnitario.toFixed(2),
        })));
      }
      // Fornecedor: só quando o nome BATE com um cadastro — nota não cria
      // fornecedor sozinha. Sem par, o emitente fica na observação.
      const chave = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const par = fornecedores.find((f) => chave(f.nome) === chave(nota.emitente)
        || chave(nota.emitente).includes(chave(f.nome)) || chave(f.nome).includes(chave(nota.emitente)));
      if (par) setFornecedorNovo(par.id);
      else if (nota.emitente) setObservacao((o) => o || `Emitente da nota: ${nota.emitente}${nota.cnpjEmitente ? ` (CNPJ ${nota.cnpjEmitente})` : ""}`);
      if (nota.vencimentos.length > 1) {
        setPlano("parcelado");
        setNParcelas(String(nota.vencimentos.length));
        setPrimeiroVenc(nota.vencimentos[0]);
      } else if (nota.vencimentos.length === 1) {
        setPlano("prazo");
        setPrimeiroVenc(nota.vencimentos[0]);
      }
      setErros({});
      setEntendido([
        `NF ${nota.numero}`, nota.emitente,
        `${nota.itens.length} item${nota.itens.length === 1 ? "" : "s"}`,
        ...(nota.valorTotal ? [`total R$ ${nota.valorTotal.toFixed(2).replace(".", ",")}`] : []),
        ...(nota.vencimentos.length > 1 ? [`${nota.vencimentos.length} parcelas`] : []),
        ...(par ? [`fornecedor: ${par.nome}`] : []),
      ]);
      setAviso(null);
    });
  }

  const previa = useMemo(
    () => (total > 0
      ? parcelasDaCompra({
        valor_total: total,
        plano,
        parcelas: Math.max(1, Math.floor(paraNumero(nParcelas)) || 1),
        prazo_dias: Math.max(0, Math.floor(paraNumero(prazoDias))),
        data: dataCompra,
        primeiro_vencimento: primeiroVenc || null,
      })
      : []),
    [total, plano, nParcelas, prazoDias, dataCompra, primeiroVenc]);

  /**
   * O que falta, item por item — e só o que falta de verdade.
   *
   * O rodapé dizia sempre a mesma frase ("Falta a descrição da compra e ao
   * menos um item com valor"), com a descrição preenchida na tela. Mensagem
   * que acusa um campo certo faz a pessoa duvidar do que está vendo e procurar
   * defeito onde não há — enquanto o que realmente faltava (o valor do item)
   * passava batido.
   */
  const faltando = useMemo(() => {
    const f: string[] = [];
    if (!descricao.trim()) f.push("a descrição da compra");
    if (total <= 0) f.push("o valor de pelo menos um item");
    if (!(empresaEscolhida || empresaId)) f.push("a empresa");
    return f;
  }, [descricao, total, empresaEscolhida, empresaId]);

  const podeSalvar = !salvando && faltando.length === 0;

  const limpar = () => {
    setDescricao(""); setFornecedorNovo(""); setDataCompra(hoje);
    setCategoria(CATEGORIAS_COMPRA[0].id); setPlano("a_vista"); setNParcelas("3");
    setPrazoDias("30"); setPrimeiroVenc(""); setContaId(""); setObservacao("");
    setItens([linhaNova()]);
  };

  const fechar = () => {
    setAberto(false);
    setErro(null);
    // O `?novo=1` já cumpriu o papel dele. Deixá-lo na barra faria a folha
    // reabrir sozinha na próxima vez que alguém voltasse para esta tela.
    if (abrirNovo) router.replace("/financeiro/compras", { scroll: false });
  };

  /**
   * `lancar` = já criar as parcelas na agenda. Sem ele a compra fica como
   * rascunho: o fato comercial registrado, sem dívida nascendo para ninguém.
   */
  async function salvar(lancar: boolean) {
    if (salvando) return;
    // NADA de `if (!podeSalvar) return` mudo. O botão parecia clicável, o
    // clique caía neste return e a tela não dizia uma palavra — que é o
    // "aperto o botão e não acontece nada". Agora o clique sempre responde:
    // ou salva, ou acende o campo que falta.
    const novos: typeof erros = {};
    if (!descricao.trim()) novos.descricao = "Descreva a compra — é como ela aparece na agenda.";
    if (!(empresaEscolhida || empresaId)) novos.empresa = "Escolha em qual empresa a compra nasce.";
    if (total <= 0) novos.itens = "Ponha o valor unitário de pelo menos um item — o total está zerado.";
    if (Object.keys(novos).length) {
      setErros(novos);
      setErro(`Falta ${faltando.join(", ").replace(/, ([^,]*)$/, " e $1")}.`);
      return;
    }
    setErros({});
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/financeiro/compras", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaEscolhida || empresaId,
          descricao: descricao.trim(),
          fornecedor_id: fornecedorNovo || undefined,
          data: dataCompra,
          categoria,
          // O total vai junto de propósito: é o número que a prévia mostrou, e
          // é dele que saíram as parcelas que a pessoa acabou de conferir.
          valor_total: total,
          plano,
          parcelas: plano === "parcelado" ? Math.max(1, Math.floor(paraNumero(nParcelas)) || 1) : 1,
          prazo_dias: plano === "prazo" ? Math.max(0, Math.floor(paraNumero(prazoDias))) : undefined,
          primeiro_vencimento: primeiroVenc || undefined,
          conta_id: contaId || undefined,
          observacao: observacao.trim() || undefined,
          itens: itens
            .filter((i) => i.descricao.trim())
            .map((i) => ({
              descricao: i.descricao.trim(),
              quantidade: paraNumero(i.quantidade) || 1,
              unidade: i.unidade.trim(),
              valor_unitario: paraNumero(i.valor_unitario),
              categoria,
            })),
          confirmar: lancar,
        }),
      });
      const j = (await r.json().catch(() => null)) as
        { ok?: boolean; erro?: string; aviso?: string } | null;
      // `r.ok` sozinho não basta: uma sessão expirada devolveria uma resposta
      // que passa no `ok` e não gravou nada. Quem manda é o `ok` do corpo.
      if (!r.ok || !j?.ok) {
        setErro(j?.erro ?? "Não foi possível salvar a compra.");
        return;
      }
      setAviso(j.aviso ?? null);
      limpar();
      fechar();
      atualizar();
    } catch {
      setErro("Sem resposta do servidor. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  // ── Desenho ────────────────────────────────────────────────────────────────

  return (
    <>
      <Cabecalho
        titulo="Compras"
        sub="Acompanhe e gerencie todas as suas compras em um só lugar."
        acoes={
          <>
            {podeCriar && (
              <BotaoFin
                icone={aberto ? "x" : "plus"}
                primario={!aberto}
                onClick={() => (aberto ? fechar() : setAberto(true))}
              >
                {aberto ? "Fechar" : "Nova compra"}
              </BotaoFin>
            )}
            <BotaoExportar
              assunto="Compras" empresa={empresaNome} linhas={visiveis}
              colunas={[
                { cabecalho: "Data", valor: (c) => dataCSV(c.data) },
                { cabecalho: "Fornecedor", valor: (c) => fornecedores.find((f) => f.id === c.fornecedor_id)?.nome ?? "" },
                { cabecalho: "Descrição", valor: (c) => c.descricao },
                { cabecalho: "Categoria", valor: (c) => acharCategoria(CATEGORIAS_COMPRA, c.categoria).label },
                { cabecalho: "Valor total", valor: (c) => numeroCSV(c.valor_total) },
                { cabecalho: "Pagamento", valor: (c) => LABEL_PLANO[c.plano] ?? c.plano },
                { cabecalho: "Parcelas", valor: (c) => c.parcelas },
                { cabecalho: "Conta", valor: (c) => contas.find((x) => x.id === c.conta_id)?.nome ?? "" },
                { cabecalho: "Status", valor: (c) => SELO_COMPRA[c.status].label },
              ]}
            />
          </>
        }
      />

      {schemaPendente && <AvisoSchema />}

      {aviso && (
        <Alerta tom="atencao" style={{ marginBottom: 18 }}>
          A compra foi gravada, mas os compromissos não nasceram: {aviso} Abra a compra e
          confirme de novo — repetir a confirmação não duplica parcela.
        </Alerta>
      )}

      <LinhaKpi>
        <KpiSeta
          icone="shopping-cart"
          rotulo={`Compras · ${rotuloDoPeriodo}`}
          valor={moeda(totalMes)}
          detalhe={`${visiveis.length} ${visiveis.length === 1 ? "compra" : "compras"} no período`}
          aoAbrir={() => setStatusFiltro("")}
          tituloDaSeta="Ver todas as compras do período"
        />
        <KpiSeta
          icone="cash"
          rotulo="Pendentes de pagamento"
          valor={moeda(aPagar)}
          tom={emAbertoDaCompra.length ? "atencao" : "ok"}
          detalhe={`${emAbertoDaCompra.length} ${emAbertoDaCompra.length === 1 ? "parcela em aberto" : "parcelas em aberto"}`}
          aoAbrir={() => setStatusFiltro("confirmada")}
          tituloDaSeta="Ver as compras confirmadas"
        />
        <KpiSeta
          icone="chart-bar"
          rotulo="Maior categoria do período"
          valor={maiorCategoria ? moeda(maiorCategoria.valor) : moeda(0)}
          detalhe={maiorCategoria ? maiorCategoria.label : "Nenhuma compra neste período"}
          aoAbrir={maiorCategoria ? () => setCategoriaFiltro(maiorCategoria.id) : undefined}
          tituloDaSeta="Filtrar por esta categoria"
        />
      </LinhaKpi>

      {/* POP-UP, não cartão no meio da página — e só fecha no X. Pedido do
          dono: o formulário inline se perdia no scroll, e um clique fora não
          pode custar os itens digitados. */}
      {aberto && (
        <ModalFormulario
          icone="shopping-cart"
          titulo="Nova compra"
          subtitulo="Os itens viram parcelas na agenda na hora de salvar."
          aoFechar={fechar}
          largura={760}
          rodape={
            <>
              {!podeSalvar && !salvando && (
                <span style={{ fontSize: 12.5, color: "var(--text-dim)", flex: "1 1 200px", minWidth: 0 }}>
                  Falta {faltando.join(", ").replace(/, ([^,]*)$/, " e $1")}.
                </span>
              )}
              <BotaoFin onClick={fechar}>Cancelar</BotaoFin>
              {/* Registrar a compra e cobrar por ela são duas decisões, e antes
                  eram um botão só ("Salvar e gerar compromissos"): quem só
                  queria anotar o que comprou levava junto parcelas na agenda
                  que não pediu. Agora a compra entra como fato comercial, e
                  lançar as parcelas é a ação DE FORA — que também existe
                  depois, no botão Confirmar da própria compra. */}
              <BotaoFin icone="calendar-plus" onClick={() => void salvar(true)}>
                {salvando ? "Salvando…" : "Salvar e lançar na agenda"}
              </BotaoFin>
              <BotaoFin icone="check" primario onClick={() => void salvar(false)}>
                {salvando ? "Salvando…" : "Salvar compra"}
              </BotaoFin>
            </>
          }
        >

          <div
            style={{
              display: "grid", gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
            }}
          >
            <div style={{ gridColumn: "1 / -1", display: "grid", gap: 8 }}>
              <LinhaRapida
                valor={linha}
                aoMudar={escreverLinha}
                entendido={entendido}
                placeholder="MDF 3mm 4.500 Madeireira X em 3x"
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <BotaoFin icone="receipt" onClick={() => arquivoNota.current?.click()}>
                  Importar XML da nota fiscal
                </BotaoFin>
                <span className="desk-only" style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  preenche fornecedor, itens, data e parcelas — tudo editável
                </span>
                <input
                  ref={arquivoNota} type="file" accept=".xml,text/xml" hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivoDaNota(f); e.target.value = ""; }}
                />
              </div>
            </div>

            {!empresaId && empresas.length > 0 && (
              <Campo rotulo="Empresa" largo erro={erros.empresa}>
                <SeletorEmpresa empresas={empresas} valor={empresaEscolhida} aoMudar={setEmpresaEscolhida} />
              </Campo>
            )}
            <Campo rotulo="Descrição" largo erro={erros.descricao}>
              <input
                value={descricao}
                onChange={(e) => { setDescricao(e.target.value); if (erros.descricao) setErros({ ...erros, descricao: undefined }); }}
                placeholder="Ex.: Filamento PLA para produção de outubro"
                style={CAIXA}
              />
            </Campo>

            <Campo rotulo="Fornecedor">
              <Escolha
  valor={fornecedorNovo}
  vazio="Sem fornecedor"
  placeholder="Buscar fornecedor…"
  aoEscolher={setFornecedorNovo}
  opcoes={fornecedores.map((f) => ({ id: f.id, nome: f.nome, marca: { nome: f.nome, icone: "truck" } }))}
/>
            </Campo>

            <Campo rotulo="Data da compra">
              <input type="date" value={dataCompra} onChange={(e) => setDataCompra(e.target.value)} style={CAIXA} />
            </Campo>

            <Campo rotulo="Categoria">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={CAIXA}>
                {CATEGORIAS_COMPRA.map((c) => <Opcao key={c.id} valor={c.id}>{c.label}</Opcao>)}
              </select>
            </Campo>
          </div>

          {/* ── Itens ──────────────────────────────────────────────────────── */}
          <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13.5, fontWeight: 800, flex: 1, minWidth: 0 }}>Itens da compra</strong>
              <BotaoFin icone="plus" onClick={() => setItens((a) => [...a, linhaNova()])}>
                Adicionar item
              </BotaoFin>
            </div>

            {/* O erro do valor mora JUNTO dos itens, não só no rodapé: o que
                falta é o campo "Valor unitário" logo abaixo, e um recado a
                400px de distância não leva ninguém até ele. */}
            {erros.itens && (
              <p role="alert" style={{ margin: "0 0 10px", fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }}>
                {erros.itens}
              </p>
            )}

            {itens.map((i, n) => (
              <div
                key={i.chave}
                style={{
                  display: "grid", gap: 10, padding: 12, minWidth: 0,
                  borderRadius: "var(--r-sm)", background: "var(--surface-2)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ ...ROTULO, flex: 1, minWidth: 0 }}>
                    Item {n + 1} · {moeda(subtotal(i))}
                  </span>
                  {itens.length > 1 && (
                    <BotaoIcone
                      icone="trash"
                      titulo="Remover item"
                      aria-label={`Remover item ${n + 1}`}
                      variante="perigo"
                      onClick={() => setItens((a) => a.filter((x) => x.chave !== i.chave))}
                      style={{ flex: "none" }}
                    />
                  )}
                </div>

                {/* `auto-fit` com `min(100%, 140px)`: a 320px sobram duas colunas
                    de campo, e nunca uma linha mais larga que a tela. */}
                <div
                  style={{
                    display: "grid", gap: 10,
                    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
                  }}
                >
                  <Campo rotulo="Descrição">
                    <input
                      value={i.descricao}
                      onChange={(e) => mexerItem(i.chave, "descricao", e.target.value)}
                      placeholder="O que foi comprado"
                      style={CAIXA}
                    />
                  </Campo>
                  <Campo rotulo="Quantidade">
                    <input
                      inputMode="decimal"
                      value={i.quantidade}
                      onChange={(e) => mexerItem(i.chave, "quantidade", e.target.value)}
                      style={CAIXA}
                    />
                  </Campo>
                  <Campo rotulo="Unidade">
                    <input
                      value={i.unidade}
                      onChange={(e) => mexerItem(i.chave, "unidade", e.target.value)}
                      placeholder="un, kg, m"
                      style={CAIXA}
                    />
                  </Campo>
                  <Campo rotulo="Valor unitário">
                    <input
                      inputMode="decimal"
                      value={i.valor_unitario}
                      onChange={(e) => { mexerItem(i.chave, "valor_unitario", e.target.value); if (erros.itens) setErros({ ...erros, itens: undefined }); }}
                      placeholder="0,00"
                      style={CAIXA}
                    />
                  </Campo>
                </div>
              </div>
            ))}

            <div
              style={{
                display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap",
                padding: "4px 2px",
              }}
            >
              <span style={{ ...ROTULO, flex: 1, minWidth: 0 }}>Total da compra</span>
              <strong style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                {moeda(total)}
              </strong>
            </div>
          </div>

          {/* ── Plano de pagamento ─────────────────────────────────────────── */}
          <div
            style={{
              display: "grid", gap: 14, marginTop: 4,
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
            }}
          >
            <Grupo rotulo="Plano de pagamento" largo>
              <div
                role="group"
                aria-label="Plano de pagamento"
                style={{
                  display: "flex", gap: 6, padding: 4, minWidth: 0,
                  borderRadius: "var(--r-pill)", background: "var(--surface-2)",
                }}
              >
                {PLANOS_DA_TELA.map((p) => {
                  const ativo = plano === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlano(p.id)}
                      aria-pressed={ativo}
                      style={{
                        flex: 1, minWidth: 0, minHeight: "var(--tap)", padding: "0 10px",
                        borderRadius: "var(--r-pill)", cursor: "pointer", border: "none",
                        fontSize: 13, fontWeight: 700,
                        color: ativo ? "var(--primary-texto)" : "var(--text-dim)",
                        background: ativo
                          ? "color-mix(in srgb, var(--primary) 16%, var(--surface))"
                          : "transparent",
                      }}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </Grupo>

            {plano === "parcelado" && (
              <Campo rotulo="Parcelas">
                <input
                  inputMode="numeric"
                  value={nParcelas}
                  onChange={(e) => setNParcelas(e.target.value)}
                  style={CAIXA}
                />
              </Campo>
            )}

            {plano === "prazo" && (
              <Campo rotulo="Prazo do fornecedor (dias)">
                <input
                  inputMode="numeric"
                  value={prazoDias}
                  onChange={(e) => setPrazoDias(e.target.value)}
                  style={CAIXA}
                />
              </Campo>
            )}

            <Campo rotulo="Primeiro vencimento">
              <input
                type="date"
                value={primeiroVenc}
                onChange={(e) => setPrimeiroVenc(e.target.value)}
                style={CAIXA}
              />
            </Campo>

            <Campo rotulo="Conta">
              <Escolha
  valor={contaId}
  vazio="Definir depois"
  placeholder="Buscar banco ou cartão…"
  aoEscolher={setContaId}
  opcoes={contas.map((c) => ({ id: c.id, nome: c.nome, marca: { nome: c.nome, icone: "wallet" } }))}
/>
            </Campo>

            <Campo rotulo="Observação" largo>
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Opcional"
                style={CAIXA}
              />
            </Campo>
          </div>

          {/* ── Prévia das parcelas ────────────────────────────────────────── */}
          <div
            style={{
              display: "grid", gap: 10, marginTop: 18, padding: 14,
              borderRadius: "var(--r-sm)", background: "var(--surface-2)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Icon name="arrows-split" size={17} color="var(--primary-texto)" />
              <strong style={{ fontSize: 13.5, fontWeight: 800 }}>
                O que vai nascer na agenda
              </strong>
            </div>
            {previa.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
                Preencha os itens: as datas e os valores das parcelas aparecem aqui antes de salvar.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {previa.map((p) => (
                  <div
                    key={p.numero}
                    style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", flex: "none" }}>
                      {p.numero}/{previa.length}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>
                      {dataBR(p.vencimento)}
                    </span>
                    <strong style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                      {moeda(p.valor)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          {erro && (
            <p style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: "var(--perigo)" }}>{erro}</p>
          )}

        </ModalFormulario>
      )}

      {/* Os painéis em CIMA, na horizontal: a lista fica com a largura toda
          e, em Visão geral, vira uma coluna por empresa. */}
      <FaixaDePaineis>
        <Cartao>
          <TituloCartao icone="chart-bar">Categorias de compra</TituloCartao>
          <Barras fatias={barras} />
          <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
            Segue o filtro ao lado. A barra é proporcional à maior categoria, não ao total —
            com o total como base, oito categorias viram oito barrinhas iguais.
          </p>
        </Cartao>
      </FaixaDePaineis>

        <Cartao>
          <TituloCartao icone="receipt" direita={<Atualizando ativo={atualizando} />}>Histórico de compras</TituloCartao>

          <Filtros>
            <FiltroPeriodo
              valor={periodo} aoMudar={setPeriodo} hoje={hoje}
              atalhos={[...ATALHOS_DE_PERIODO, { valor: "ano", label: `Ano de ${ano}` }]}
            />
            <Filtro
              rotulo="Fornecedor" valor={fornecedorFiltro} aoMudar={setFornecedorFiltro}
              opcoes={fornecedores.map((f) => ({ valor: f.id, label: f.nome }))}
            />
            <Filtro
              rotulo="Categoria" valor={categoriaFiltro} aoMudar={setCategoriaFiltro}
              opcoes={CATEGORIAS_COMPRA.map((c) => ({ valor: c.id, label: c.label }))}
            />
            <Filtro
              rotulo="Status" valor={statusFiltro} aoMudar={setStatusFiltro}
              opcoes={COMPRA_STATUS.map((s) => ({ valor: s, label: SELO_COMPRA[s].label }))}
            />
            <LimparFiltros
              ativo={temFiltro}
              aoLimpar={limparFiltros}
            />
          </Filtros>

          {/* Sete colunas não cabem no painel esquerdo de um monitor comum. A
              rolagem fica DENTRO do bloco — nunca na página —, e abaixo de 700px
              a própria `Tabela` já troca as colunas por cards. */}
          <div style={{ overflowX: "auto", minWidth: 0 }}>
            <ColunasPorEmpresa linhas={visiveis} empresas={empresas} empresaId={empresaId} empresaNome={empresaNome} rotulo={{ um: "compra", muitos: "compras" }}>
              {(l) => (
                <Tabela
                  linhas={l}
                  chaveDe={(c) => c.id}
                  paginar={10}
                  rotuloItem="compras"
                  aoClicar={(c) => setSelecionadaId(c.id)}
                  vazio={(
                    <Vazio
                      icone="shopping-cart"
                      titulo={temFiltro ? "Nenhuma compra neste filtro" : "Nenhuma compra registrada"}
                      detalhe={temFiltro
                        ? "Troque o período ou limpe os filtros para ver o histórico inteiro."
                        : `As compras de ${empresaNome} aparecem aqui assim que a primeira for lançada.`}
                      acao={temFiltro
                        ? <BotaoFin icone="x" onClick={limparFiltros}>Limpar filtros</BotaoFin>
                        : (podeCriar ? <BotaoFin icone="plus" onClick={() => setAberto(true)}>Nova compra</BotaoFin> : undefined)}
                    />
                  )}
                  colunas={[
                    {
                      chave: "data", label: "Data", largura: "84px",
                      celula: (c) => (
                        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{dataBR(c.data)}</span>
                      ),
                    },
                    {
                      chave: "fornecedor", label: "Fornecedor", largura: "minmax(min(100%, 92px), 1fr)",
                      celula: (c) => (c.fornecedor_id ? nomeFornecedor.get(c.fornecedor_id) ?? "—" : "—"),
                    },
                    {
                      chave: "descricao", label: "Descrição", largura: "minmax(min(100%, 92px), 1.4fr)", titulo: true,
                      celula: (c) => c.descricao,
                    },
                    {
                      chave: "categoria", label: "Categoria", largura: "minmax(min(100%, 80px), 1fr)", soNoComputador: true,
                      celula: (c) => acharCategoria(CATEGORIAS_COMPRA, c.categoria).label,
                    },
                    {
                      chave: "valor", label: "Valor", largura: "minmax(min(100%, 100px), 0.8fr)", fim: true,
                      celula: (c) => (
                        <strong style={{ fontVariantNumeric: "tabular-nums" }}>{moeda(c.valor_total)}</strong>
                      ),
                    },
                    {
                      chave: "pagamento", label: "Pagamento", largura: "minmax(min(100%, 80px), 0.9fr)",
                      celula: (c) => `${LABEL_PLANO[c.plano]}${c.parcelas > 1 ? ` ${c.parcelas}x` : ""}`,
                    },
                    {
                      chave: "status", label: "Status", largura: "96px", fim: true,
                      celula: (c) => <Selo selo={SELO_COMPRA[c.status]} />,
                    },
                  ]}
                />
              )}
            </ColunasPorEmpresa>
          </div>
        </Cartao>

      {/* ── §21: a compra CRIA compromissos ─────────────────────────────────── */}
      <Cartao style={{ marginTop: 18 }}>
        <TituloCartao icone="arrows-split">Integração com compromissos</TituloCartao>

        {!emFoco ? (
          <Vazio
            icone="arrows-split"
            titulo="Nenhuma compra para mostrar"
            detalhe="Ao confirmar uma compra, cada parcela dela nasce como um compromisso — e o caminho aparece aqui."
          />
        ) : (
          <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
            <div
              style={{
                display: "grid", gap: 12, padding: 14, minWidth: 0,
                borderRadius: "var(--r-sm)", background: "var(--surface-2)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
                <Icon name="shopping-cart" size={17} color="var(--primary-texto)" />
                <strong style={{ fontSize: 14.5, fontWeight: 800, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                  {emFoco.descricao}
                </strong>
                <Selo selo={SELO_COMPRA[emFoco.status]} />
              </div>
              <div
                style={{
                  display: "grid", gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
                }}
              >
                {[
                  { rotulo: "Fornecedor", valor: emFoco.fornecedor_id ? nomeFornecedor.get(emFoco.fornecedor_id) ?? "—" : "—" },
                  { rotulo: "Data", valor: dataBR(emFoco.data) },
                  { rotulo: "Valor total", valor: moeda(emFoco.valor_total) },
                  {
                    rotulo: "Pagamento",
                    valor: `${LABEL_PLANO[emFoco.plano]}${emFoco.parcelas > 1 ? ` ${emFoco.parcelas}x` : ""}`,
                  },
                ].map((f) => (
                  <div key={f.rotulo} style={{ display: "grid", gap: 3, minWidth: 0 }}>
                    <span style={ROTULO}>{f.rotulo}</span>
                    <strong style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{f.valor}</strong>
                  </div>
                ))}
              </div>
              {fichaDoFornecedorEmFoco && (
                <div>
                  <BotaoFin icone="external-link" href={fichaDoFornecedorEmFoco}>
                    Abrir ficha do fornecedor
                  </BotaoFin>
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <Icon name="arrow-down" size={16} color="var(--text-dim)" />
              <span style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
                {parcelasEmFoco.length
                  ? `Esta compra gerou ${parcelasEmFoco.length} ${parcelasEmFoco.length === 1 ? "compromisso" : "compromissos"}. O pagamento acontece lá, nunca aqui.`
                  : "Compra ainda sem compromisso: rascunho não vira dívida na agenda de ninguém."}
              </span>
            </div>

            <Tabela
              linhas={parcelasEmFoco}
              chaveDe={(p) => p.id}
              vazio={(
                <Vazio
                  icone="calendar-off"
                  titulo="Nenhuma parcela gerada"
                  detalhe="Confirmar a compra é o que cria os compromissos."
                />
              )}
              colunas={[
                {
                  chave: "parcela", label: "Parcela", largura: "minmax(min(100%, 90px), 0.6fr)",
                  celula: (p) => (
                    <span style={{ fontWeight: 700 }}>
                      {p.parcela_numero && p.parcela_total ? `${p.parcela_numero}/${p.parcela_total}` : "Única"}
                    </span>
                  ),
                },
                {
                  chave: "descricao", label: "Compromisso", largura: "minmax(min(100%, 160px), 1.6fr)", titulo: true,
                  celula: (p) => p.descricao,
                },
                {
                  chave: "vencimento", label: "Vencimento", largura: "minmax(min(100%, 110px), 0.8fr)",
                  celula: (p) => (
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{dataBR(p.vencimento)}</span>
                  ),
                },
                {
                  chave: "valor", label: "Valor", largura: "minmax(min(100%, 100px), 0.8fr)", fim: true,
                  celula: (p) => (
                    <strong style={{ fontVariantNumeric: "tabular-nums" }}>{moeda(p.valor)}</strong>
                  ),
                },
                {
                  chave: "status", label: "Status", largura: "118px", fim: true,
                  celula: (p) => <Selo selo={SELO_COMPROMISSO[statusEfetivo(p, hoje)]} />,
                },
              ]}
            />

            <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
              Toque numa linha do histórico para ver as parcelas daquela compra. A seta só aponta
              para um lado: a compra cria compromissos, e nenhum compromisso cria compra.
            </p>
          </div>
        )}
      </Cartao>

    </>
  );
}
