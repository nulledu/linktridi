"use client";

// ── Central fiscal · a parte que responde ao toque ───────────────────────────
// As três abas são ESTADO, não rota. As notas já vieram do servidor numa
// rodada só; filtrar a lista carregada não custa requisição nenhuma, enquanto
// três rotas cobrariam uma renderização de servidor por passeio entre abas.
//
// Toda a leitura mora no page.tsx. Aqui só se escreve — e escrita é sempre
// clique da pessoa, nunca relógio.

import { useEffect, useMemo, useRef, useState } from "react";
import { interpretarLinha } from "@/lib/financeiro/linha-rapida";
import { camposDaNota, lerNotaDoXml, quantosCampos } from "@/lib/financeiro/nfe-xml";
import { Icon } from "../../Icon";
import { Alerta } from "../../ui/Alerta";
import { toast } from "../../Toast";
import { travarRolagem } from "../../ui/travaRolagem";
import { Acoes, Botao, PainelLateral } from "../../ui/controles";
import { useAtualizar } from "../../ui/useAtualizar";
import { FiltroPeriodo, Anexos, Atualizando, AvisoSchema, Barras, BotaoExportar, BotaoFin, Cabecalho, Cartao, Filtro, Filtros, LimparFiltros, LinhaKpi, ProximasAcoes, Selo, Tabela, TituloCartao, Vazio, SeletorEmpresa, LinhaRapida, ModalFormulario, Escolha, FaixaDePaineis, BuscaDaLista } from "../ui";
import { ColunasPorEmpresa, FileiraDeAbas, KpiSeta, PainelRolante } from "../blocos";
import { dataBR, fatias, hojeISO, moeda, somarDias } from "@/lib/financeiro/calculos";
import { ehMes, mesRelativo, noMes } from "@/lib/financeiro/periodo";
import { dataCSV, numeroCSV } from "@/lib/financeiro/csv";
import {
  acharCategoria, CATEGORIAS_COMPRA, NOTA_STATUS, SELO_NOTA,
  type CompraStatus, type Nota, type NotaStatus, type Selo as SeloTipo,
} from "@/lib/financeiro/tipos";

export interface CompraResumo {
  id: string; descricao: string; data: string; valor_total: number; status: CompraStatus;
}

interface FornecedorDaNota { id: string; nome: string; contato_id?: string | null }

type Aba = "geral" | "emitida" | "compra";
type TipoNota = "emitida" | "compra";

const ABAS: { id: Aba; label: string; icone: string }[] = [
  { id: "geral", label: "Visão geral", icone: "chart-bar" },
  { id: "emitida", label: "Notas emitidas", icone: "file-text" },
  { id: "compra", label: "Notas de compra", icone: "receipt" },
];

const SELO_TIPO: Record<TipoNota, SeloTipo> = {
  emitida: { label: "Emitida", cor: "var(--azul)" },
  compra: { label: "De compra", cor: "var(--roxo)" },
};

/** Os atalhos que convivem com os meses no seletor de período. */
const ATALHOS_DE_PERIODO = [
  { valor: "30", label: "Últimos 30 dias" },
  { valor: "90", label: "Últimos 90 dias" },
  { valor: "365", label: "Últimos 12 meses" },
];

const STATUS_OPCOES = NOTA_STATUS.map((s) => ({ valor: s, label: SELO_NOTA[s].label }));

/** Status que o banco guardou e o catálogo não conhece continua legível, em vez de derrubar o selo. */
const seloDaNota = (s: NotaStatus): SeloTipo => SELO_NOTA[s] ?? { label: s, cor: "var(--neutro)" };

export function NotasClient({
  empresas = [], empresaId, empresaNome, podeLancar, podeComprar, schemaPendente, notas, compras, fornecedores,
  contatosPorFornecedor = {}, hoje = hojeISO(),
}: {
  /** As empresas liberadas — a nota diz em qual nasce quando a tela está em "Visão geral". */
  empresas?: { id: string; nome: string }[];
  empresaId: string;
  empresaNome: string;
  podeLancar: boolean;
  /** Criar compra a partir da nota é ato de COMPRA — quem só lança documento fiscal não abre despesa. */
  podeComprar: boolean;
  schemaPendente: boolean;
  notas: Nota[];
  compras: CompraResumo[];
  fornecedores: FornecedorDaNota[];
  /** fornecedor legado → contato canônico; inclui históricos fora do seletor ativo. */
  contatosPorFornecedor?: Record<string, string>;
  /** 'AAAA-MM-DD' do servidor — o "últimos N dias" conta a partir dele. */
  hoje?: string;
}) {
  const { atualizar, atualizando } = useAtualizar();
  const [aba, setAba] = useState<Aba>("geral");
  const [busca, setBusca] = useState("");
  // Nasce no mês de hoje — padrão do módulo inteiro (set/2026); as setas do
  // filtro andam de mês em mês e "Limpar" volta pra hoje.
  const [periodo, setPeriodo] = useState(() => mesRelativo(hoje, 0));
  const periodoPadrao = mesRelativo(hoje, 0);
  const [status, setStatus] = useState("");
  const [formAberto, setFormAberto] = useState(false);
  // O detalhe é derivado do ID, nunca guardado como objeto: depois de anexar
  // algo a lista do servidor pode voltar diferente, e uma cópia congelada
  // mostraria a nota como ela era antes.
  const [notaAbertaId, setNotaAbertaId] = useState<string | null>(null);
  const [criandoId, setCriandoId] = useState<string | null>(null);
  const [nasceuRascunho, setNasceuRascunho] = useState<string | null>(null);
  const [erroCompra, setErroCompra] = useState<string | null>(null);

  // No celular a fileira de abas rola de lado (`.tab-strip`): sem trazer a aba
  // atual pra vista, a terceira aba fica fora da tela e ninguém descobre que
  // ela existe.

  const nomeFornecedor = useMemo(
    () => new Map(fornecedores.map((f) => [f.id, f.nome])), [fornecedores]);
  const descricaoCompra = useMemo(
    () => new Map(compras.map((c) => [c.id, c.descricao])), [compras]);

  const parceiroDe = (n: Nota) =>
    n.parceiro_nome || (n.fornecedor_id ? nomeFornecedor.get(n.fornecedor_id) ?? "—" : "—");

  const rotuloDaNota = (n: Nota) => {
    const doc = n.numero ? `NF ${n.numero}${n.serie ? `-${n.serie}` : ""}` : "nota sem número";
    const parceiro = parceiroDe(n);
    return parceiro === "—" ? doc : `${doc} · ${parceiro}`;
  };

  /**
   * §8 — a nota que chegou antes da compra.
   *
   * O fornecedor manda a NF-e junto com a entrega e ninguém tinha lançado nada;
   * até aqui essa nota virava um alerta de pendência sem saída pela tela. O
   * servidor cria a compra em RASCUNHO e amarra a nota nela — nenhuma parcela e
   * nenhum compromisso nascem daqui, e é isso que a mensagem de sucesso explica.
   */
  async function criarCompra(n: Nota) {
    if (criandoId) return;
    setCriandoId(n.id);
    setErroCompra(null);
    setNasceuRascunho(null);
    try {
      const r = await fetch(`/api/financeiro/notas/${n.id}/compra`, { method: "POST" });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; erro?: string } | null;
      // `r.ok` sozinho não basta: sessão expirada devolve uma resposta que passa
      // no `ok` sem ter gravado nada. Quem manda é o `ok` do corpo.
      if (!r.ok || !j?.ok) {
        setErroCompra(j?.erro ?? "Não deu para criar a compra a partir desta nota.");
        return;
      }
      setNasceuRascunho(rotuloDaNota(n));
      atualizar();
    } catch {
      setErroCompra("Sem resposta do servidor. Confira a conexão e tente de novo.");
    } finally {
      setCriandoId(null);
    }
  }

  // A busca filtra a TELA inteira, números do topo inclusive: um cabeçalho que
  // continua somando o que a tabela deixou de mostrar diz duas coisas ao mesmo
  // tempo, e quem lê acredita na de cima.
  const porBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return notas;
    return notas.filter((n) =>
      [n.numero, n.serie, n.parceiro_nome, n.chave_acesso, n.fornecedor_id ? nomeFornecedor.get(n.fornecedor_id) : null]
        .some((v) => (v ?? "").toLowerCase().includes(termo)));
  }, [busca, notas, nomeFornecedor]);

  const resumo = useMemo(() => {
    const emitidas = porBusca.filter((n) => n.tipo === "emitida");
    const deCompra = porBusca.filter((n) => n.tipo === "compra");
    const canceladas = porBusca.filter((n) => n.status === "cancelada");
    return {
      emitidas: emitidas.length,
      valorEmitidas: emitidas.reduce((s, n) => s + n.valor, 0),
      deCompra: deCompra.length,
      valorDeCompra: deCompra.reduce((s, n) => s + n.valor, 0),
      canceladas: canceladas.length,
      // Nota cancelada não movimentou nada: somá-la inflaria o total com papel
      // que foi desfeito.
      total: porBusca.filter((n) => n.status !== "cancelada").reduce((s, n) => s + n.valor, 0),
    };
  }, [porBusca]);

  const porTipo = useMemo(
    () => fatias(
      porBusca,
      (n) => n.tipo,
      () => 1,
      (id) => SELO_TIPO[id as TipoNota] ?? { label: id, cor: "var(--neutro)" },
    ),
    [porBusca],
  );

  const porCategoria = useMemo(
    () => fatias(
      porBusca.filter((n) => n.status !== "cancelada"),
      (n) => n.categoria ?? "outros",
      (n) => n.valor,
      (id) => acharCategoria(CATEGORIAS_COMPRA, id),
    ),
    [porBusca],
  );

  const acoes = useMemo(() => {
    const lista: { chave: string; icone: string; cor: string; titulo: string; detalhe: string }[] = [];
    const semVinculo = porBusca.filter((n) => n.tipo === "compra" && !n.compra_id);
    if (semVinculo.length) {
      lista.push({
        chave: "sem_vinculo", icone: "link", cor: "var(--roxo)",
        titulo: `${semVinculo.length} ${semVinculo.length === 1 ? "nota de compra sem vínculo" : "notas de compra sem vínculo"}`,
        // O alerta existia desde sempre e não dizia o que fazer com ele. Agora
        // diz — e só para quem tem a saída na mão.
        detalhe: podeComprar
          ? "Na aba Notas de compra, aponte cada uma para a compra que ela documenta — ou crie a compra a partir da nota."
          : "Aponte cada uma para a compra que ela documenta.",
      });
    }
    const canceladas = porBusca.filter((n) => n.status === "cancelada");
    if (canceladas.length) {
      lista.push({
        chave: "canceladas", icone: "ban", cor: "var(--perigo)",
        titulo: `${canceladas.length} ${canceladas.length === 1 ? "nota cancelada" : "notas canceladas"}`,
        detalhe: "Confira se a substituta já foi lançada.",
      });
    }
    const pendentes = porBusca.filter((n) => n.status === "pendente");
    if (pendentes.length) {
      lista.push({
        chave: "pendentes", icone: "hourglass-high", cor: "var(--atencao)",
        titulo: `${pendentes.length} ${pendentes.length === 1 ? "nota aguardando" : "notas aguardando"} autorização`,
        detalhe: "Enquanto não autoriza, o documento não vale.",
      });
    }
    return lista;
  }, [porBusca, podeComprar]);

  const daAba = useMemo(() => {
    if (aba === "geral") return porBusca;
    const desde = !ehMes(periodo) && periodo ? somarDias(hoje, -Number(periodo)) : null;
    return porBusca.filter((n) => {
      if (n.tipo !== aba) return false;
      if (desde && n.emissao < desde) return false;
      if (!noMes(periodo, n.emissao)) return false;
      if (status && n.status !== status) return false;
      return true;
    });
  }, [aba, porBusca, periodo, status, hoje]);

  // Cancelada fica de fora: o servidor recusa criar compra a partir dela, e um
  // botão que só sabe dar erro é pior do que botão nenhum.
  const semVinculoDaAba = useMemo(
    () => (aba === "compra" ? daAba.filter((n) => !n.compra_id && n.status !== "cancelada") : []),
    [aba, daAba],
  );

  const contagemDaAba = (id: Aba) =>
    id === "geral" ? porBusca.length : porBusca.filter((n) => n.tipo === id).length;

  const colunaNumero = {
    chave: "numero", label: "Nº Nota", largura: "minmax(min(100%, 104px), 1fr)", titulo: true,
    celula: (n: Nota) => (
      <strong style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        {n.numero ? `${n.numero}${n.serie ? `-${n.serie}` : ""}` : "Sem número"}
      </strong>
    ),
  };
  const colunaParceiro = {
    chave: "parceiro", label: "Parceiro", largura: "minmax(min(100%, 116px), 1.2fr)",
    celula: (n: Nota) => parceiroDe(n),
  };
  const colunaData = {
    chave: "emissao", label: "Data", largura: "84px",
    celula: (n: Nota) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{dataBR(n.emissao)}</span>,
  };
  const colunaValor = {
    chave: "valor", label: "Valor", largura: "minmax(min(100%, 90px), 0.8fr)", fim: true,
    celula: (n: Nota) => <strong style={{ fontVariantNumeric: "tabular-nums" }}>{moeda(n.valor)}</strong>,
  };
  const colunaStatus = {
    chave: "status", label: "Status", largura: "98px", fim: true,
    celula: (n: Nota) => <Selo selo={seloDaNota(n.status)} />,
  };

  const botaoNova = podeLancar
    ? <BotaoFin icone="plus" primario onClick={() => setFormAberto(true)}>Nova nota</BotaoFin>
    : undefined;

  const notaAberta = notaAbertaId ? notas.find((n) => n.id === notaAbertaId) ?? null : null;
  const contatoDoFornecedorAberto = notaAberta?.fornecedor_id
    ? contatosPorFornecedor[notaAberta.fornecedor_id]
      ?? fornecedores.find((fornecedor) => fornecedor.id === notaAberta.fornecedor_id)?.contato_id
    : null;
  const fichaDoFornecedorAberto = contatoDoFornecedorAberto
    ? `/financeiro/cadastros/contatos?papel=fornecedor&editar=${encodeURIComponent(contatoDoFornecedorAberto)}`
    : null;

  return (
    <>
      <Cabecalho
        titulo="Notas Fiscais"
        sub="O papel que acompanha a venda e a compra — sem criar obrigação nova."
        busca={busca}
        aoBuscar={setBusca}
        acoes={
          <>
            {botaoNova}
            <BotaoExportar
              assunto="Notas Fiscais" empresa={empresaNome} linhas={daAba}
              colunas={[
                { cabecalho: "Nº Nota", valor: (n) => n.numero ?? "" },
                { cabecalho: "Série", valor: (n) => n.serie ?? "" },
                { cabecalho: "Tipo", valor: (n) => (n.tipo === "emitida" ? "Emitida" : "Compra") },
                { cabecalho: "Parceiro", valor: (n) => n.parceiro_nome ?? "" },
                { cabecalho: "Emissão", valor: (n) => dataCSV(n.emissao) },
                { cabecalho: "Chave de acesso", valor: (n) => n.chave_acesso ?? "" },
                { cabecalho: "Valor", valor: (n) => numeroCSV(n.valor) },
                { cabecalho: "Status", valor: (n) => SELO_NOTA[n.status].label },
              ]}
            />
          </>
        }
        abas={
          <FileiraDeAbas
            abas={ABAS.map((a) => ({ ...a, contagem: contagemDaAba(a.id) }))}
            valor={aba}
            aoTrocar={setAba}
          />
        }
      />

      {schemaPendente && <AvisoSchema />}

      {/* A mensagem fica NA TELA em vez de sumir num toast: o que ela precisa
          dizer não é "deu certo", é que o que nasceu ainda não é conta a pagar —
          e essa frase precisa continuar legível enquanto a pessoa vai conferir. */}
      {nasceuRascunho && (
        <Alerta
          tom="info"
          icone="shopping-cart"
          style={{ marginBottom: 18 }}
          acao={<BotaoFin icone="shopping-cart" href="/financeiro/compras">Abrir Compras e confirmar</BotaoFin>}
        >
          A partir de <strong>{nasceuRascunho}</strong> nasceu uma compra em{" "}
          <strong>rascunho</strong>, com a data e o valor da nota. Rascunho ainda{" "}
          <strong>não é conta a pagar</strong>: nenhuma parcela foi criada e nada entrou na agenda de
          vencimentos. Abra Compras, confira fornecedor, categoria e forma de pagamento — e{" "}
          <strong>confirme</strong> para que os compromissos nasçam.
        </Alerta>
      )}

      {erroCompra && (
        <Alerta tom="perigo" style={{ marginBottom: 18 }}>{erroCompra}</Alerta>
      )}

      <LinhaKpi>
        <KpiSeta
          icone="file-text" rotulo="Notas emitidas" valor={String(resumo.emitidas)}
          detalhe={moeda(resumo.valorEmitidas)}
          aoAbrir={() => setAba("emitida")}
          tituloDaSeta="Ver as notas emitidas"
        />
        <KpiSeta
          icone="receipt" rotulo="Notas de compra" valor={String(resumo.deCompra)}
          detalhe={moeda(resumo.valorDeCompra)}
          aoAbrir={() => setAba("compra")}
          tituloDaSeta="Ver as notas de compra"
        />
        <KpiSeta
          icone="ban" rotulo="Canceladas" valor={String(resumo.canceladas)}
          tom={resumo.canceladas ? "perigo" : "ok"}
          detalhe="Fora de todos os totais"
          aoAbrir={resumo.canceladas ? () => setStatus("cancelada") : undefined}
          tituloDaSeta="Ver as canceladas"
        />
        <KpiSeta
          icone="cash" rotulo="Valor total movimentado" valor={moeda(resumo.total)} tom="ok"
          detalhe="emitidas e de compra somadas"
        />
      </LinhaKpi>

      {aba === "geral" ? (
        <>
          {/* Os painéis em CIMA, na horizontal: a lista fica com a largura toda
              e, em Visão geral, vira uma coluna por empresa. */}
          <FaixaDePaineis>
            <Cartao>
              <TituloCartao icone="tag">Totais por categoria</TituloCartao>
              <Barras fatias={porCategoria} />
            </Cartao>

            <PainelRolante icone="alert-triangle" titulo="Próximas ações">
              <ProximasAcoes acoes={acoes} />
            </PainelRolante>
          </FaixaDePaineis>

            <Cartao>
              <TituloCartao icone="chart-bar">Resumo fiscal</TituloCartao>
              <Barras
                fatias={porTipo}
                formatar={(v) => {
                  const parte = porBusca.length ? Math.round((v / porBusca.length) * 100) : 0;
                  return `${v} ${v === 1 ? "nota" : "notas"} · ${parte}%`;
                }}
              />
            </Cartao>

            <Cartao>
              <TituloCartao icone="file-text" direita={<Atualizando ativo={atualizando} />}>Últimas notas</TituloCartao>
              <Tabela
                linhas={porBusca.slice(0, 8)}
                chaveDe={(n) => n.id}
                aoClicar={(n) => setNotaAbertaId(n.id)}
                vazio={
                  <Vazio
                    icone="file-text"
                    titulo="Nenhuma nota lançada"
                    detalhe="Notas emitidas e notas de compra aparecem aqui assim que a primeira for cadastrada."
                    acao={botaoNova}
                  />
                }
                colunas={[
                  colunaNumero,
                  {
                    chave: "tipo", label: "Tipo", largura: "92px",
                    celula: (n) => <Selo selo={SELO_TIPO[n.tipo] ?? { label: n.tipo, cor: "var(--neutro)" }} />,
                  },
                  colunaParceiro,
                  colunaData,
                  colunaValor,
                  colunaStatus,
                ]}
              />
            </Cartao>

        </>
      ) : (
        <>
          <BuscaDaLista valor={busca} aoBuscar={setBusca} placeholder="Buscar nota, número ou parceiro…" />
          <Filtros>
            <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} hoje={hoje} atalhos={ATALHOS_DE_PERIODO} />
            <Filtro rotulo="Status" valor={status} opcoes={STATUS_OPCOES} aoMudar={setStatus} />
            <LimparFiltros
              ativo={periodo !== periodoPadrao || !!status || !!busca}
              aoLimpar={() => { setPeriodo(periodoPadrao); setStatus(""); setBusca(""); }}
            />
          </Filtros>

          {/* §8 — a nota que chegou antes da compra. O bloco fica FORA da tabela
              de baixo de propósito: a linha da tabela pode virar um <button> que
              abre o detalhe, e botão dentro de botão o navegador desmonta na
              hora de ler o HTML do servidor — a hidratação quebra a tela
              inteira. Aqui a ação é dela mesma, e ainda ganha o espaço para
              dizer o que faz. */}
          {semVinculoDaAba.length > 0 && podeComprar && (
            <Cartao
              style={{
                marginBottom: 16,
                borderColor: "color-mix(in srgb, var(--roxo) 34%, var(--border))",
                background: "color-mix(in srgb, var(--roxo) 6%, var(--surface))",
              }}
            >
              <TituloCartao icone="link">
                {semVinculoDaAba.length === 1
                  ? "1 nota sem compra"
                  : `${semVinculoDaAba.length} notas sem compra`}
              </TituloCartao>
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, marginBottom: 14 }}>
                Papel que chegou antes do lançamento. Criar a compra a partir da nota abre um{" "}
                <strong style={{ color: "var(--text)" }}>rascunho</strong> com a data, o valor e o
                fornecedor dela — e para por aí: rascunho não é conta a pagar, nada vence e nenhuma
                parcela nasce enquanto alguém não conferir e confirmar em Compras.
              </p>
              <ColunasPorEmpresa linhas={semVinculoDaAba} empresas={empresas} empresaId={empresaId} empresaNome={empresaNome} rotulo={{ um: "nota", muitos: "notas" }}>
                {(l) => (
                  <Tabela
                    linhas={l}
                    chaveDe={(n) => n.id}
                    paginar={5}
                    rotuloItem="notas"
                    colunas={[
                      colunaNumero,
                      colunaParceiro,
                      colunaData,
                      colunaValor,
                      {
                        // `largo`: no celular a célula ocupa a linha inteira do card.
                        // O botão diz uma frase, e em meia largura de uma tela de
                        // 320px a frase racha no meio da palavra.
                        chave: "acao", label: "Ação", largura: "minmax(min(100%, 240px), 1.4fr)", largo: true,
                        celula: (n: Nota) => (
                          <button
                            type="button"
                            onClick={() => criarCompra(n)}
                            // Travado também enquanto a lista nova não chega: o
                            // botão voltava ao normal com a nota ainda "sem
                            // vínculo" na tela, e o segundo clique levava um 400.
                            disabled={!!criandoId || atualizando}
                            className="ui-card-alvo"
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 8, minHeight: "var(--tap)",
                              padding: "6px 14px", borderRadius: "var(--r-pill)", cursor: "pointer",
                              textAlign: "start", maxWidth: "100%", minWidth: 0,
                              fontSize: 12.5, fontWeight: 700, lineHeight: 1.35, color: "var(--text)",
                              background: "var(--surface)",
                              border: "1px solid color-mix(in srgb, var(--roxo) 40%, var(--border))",
                            }}
                          >
                            <Icon name="shopping-cart" size={15} color="var(--roxo)" style={{ flex: "none" }} />
                            <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                              {criandoId === n.id ? "Criando o rascunho..." : atualizando ? "Atualizando a lista..." : "Criar compra a partir desta nota"}
                            </span>
                          </button>
                        ),
                      },
                    ]}
                  />
                )}
              </ColunasPorEmpresa>
            </Cartao>
          )}

          <Cartao>
            <TituloCartao icone={aba === "emitida" ? "file-text" : "receipt"}>
              {aba === "emitida" ? "Notas emitidas" : "Notas de compra"}
            </TituloCartao>
            <ColunasPorEmpresa linhas={daAba} empresas={empresas} empresaId={empresaId} empresaNome={empresaNome} rotulo={{ um: "nota", muitos: "notas" }}>
              {(l) => (
                <Tabela
                  linhas={l}
                  chaveDe={(n) => n.id}
                  aoClicar={(n) => setNotaAbertaId(n.id)}
                  vazio={
                    <Vazio
                      icone="file-text"
                      titulo={aba === "emitida" ? "Nenhuma nota emitida" : "Nenhuma nota de compra"}
                      detalhe={
                        periodo !== periodoPadrao || status || busca
                          ? "Nada bate com os filtros escolhidos. Amplie o período ou limpe o status."
                          : aba === "emitida"
                            ? "Nota emitida é o documento da venda — ela entra aqui e não vira despesa."
                            : "Nota de compra é o documento que acompanha uma compra já lançada."
                      }
                      acao={botaoNova}
                    />
                  }
                  colunas={aba === "emitida"
                    ? [
                      colunaNumero,
                      colunaParceiro,
                      {
                        chave: "categoria", label: "Categoria", largura: "minmax(min(100%, 96px), 1fr)", soNoComputador: true,
                        celula: (n) => acharCategoria(CATEGORIAS_COMPRA, n.categoria).label,
                      },
                      colunaData,
                      colunaValor,
                      colunaStatus,
                    ]
                    : [
                      colunaNumero,
                      colunaParceiro,
                      {
                        chave: "compra", label: "Compra", largura: "minmax(min(100%, 110px), 1fr)",
                        celula: (n) => n.compra_id
                          ? (descricaoCompra.get(n.compra_id) ?? "Compra vinculada")
                          : <span style={{ color: "var(--text-dim)" }}>Sem vínculo</span>,
                      },
                      colunaData,
                      colunaValor,
                      colunaStatus,
                    ]}
                />
              )}
            </ColunasPorEmpresa>
          </Cartao>
        </>
      )}


      {/* ── Detalhe da nota ── */}
      {notaAberta && (
        <PainelLateral
          centrado
          titulo={notaAberta.numero
            ? `Nota ${notaAberta.numero}${notaAberta.serie ? `-${notaAberta.serie}` : ""}`
            : "Nota sem número"}
          subtitulo={`${(SELO_TIPO[notaAberta.tipo] ?? { label: notaAberta.tipo }).label} · emitida em ${dataBR(notaAberta.emissao)}`}
          onFechar={() => setNotaAbertaId(null)}
          largura={460}
          rodape={
            <Acoes>
              <Botao onClick={() => setNotaAbertaId(null)}>Fechar</Botao>
            </Acoes>
          }
        >
          <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
                {moeda(notaAberta.valor)}
              </strong>
              <Selo selo={seloDaNota(notaAberta.status)} />
            </div>

            <dl style={{ display: "grid", gap: 2, margin: 0 }}>
              <Detalhe rotulo={notaAberta.tipo === "emitida" ? "Cliente" : "Fornecedor"} valor={parceiroDe(notaAberta)} />
              <Detalhe rotulo="Categoria" valor={acharCategoria(CATEGORIAS_COMPRA, notaAberta.categoria).label} />
              <Detalhe rotulo="Emissão" valor={dataBR(notaAberta.emissao)} />
              {notaAberta.tipo === "compra" && (
                <Detalhe
                  rotulo="Compra"
                  valor={notaAberta.compra_id
                    ? (descricaoCompra.get(notaAberta.compra_id) ?? "Compra vinculada")
                    : "Sem vínculo"}
                />
              )}
              {notaAberta.chave_acesso && <Detalhe rotulo="Chave de acesso" valor={notaAberta.chave_acesso} />}
            </dl>

            {fichaDoFornecedorAberto && (
              <div>
                <BotaoFin icone="external-link" href={fichaDoFornecedorAberto}>
                  Abrir ficha do fornecedor
                </BotaoFin>
              </div>
            )}

            <Anexos
              tipo="nota"
              owner_id={notaAberta.id}
              empresa_id={empresaId}
              podeEditar={podeLancar}
              titulo="XML e PDF da nota"
              dica="O documento fiscal em si: o XML que o emissor mandou e o DANFE em PDF."
            />
          </div>
        </PainelLateral>
      )}

      {formAberto && (
        <FormNota
          empresaId={empresaId}
          empresas={empresas}
          tipoInicial={aba === "emitida" ? "emitida" : "compra"}
          compras={compras}
          aoFechar={() => setFormAberto(false)}
        />
      )}
    </>
  );
}

/** Linha "rótulo · valor" do painel de detalhe. */
function Detalhe({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "baseline", gap: 12, minWidth: 0,
        padding: "9px 0", borderBottom: "1px solid var(--border)",
      }}
    >
      <dt style={{ flex: "none", width: 108, fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)" }}>{rotulo}</dt>
      <dd style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 13.5, fontWeight: 600, overflowWrap: "anywhere" }}>
        {valor}
      </dd>
    </div>
  );
}

// ── Formulário ───────────────────────────────────────────────────────────────

const CONTROLE: React.CSSProperties = {
  width: "100%", minWidth: 0, boxSizing: "border-box", minHeight: "var(--tap)",
  padding: "0 12px", borderRadius: "var(--r-sm)", fontSize: 14, fontFamily: "inherit",
  background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)",
};

function Campo({ rotulo, dica, largo, erro, children }: {
  rotulo: string; dica?: string; largo?: boolean;
  /** Erro EMBAIXO do campo, no lugar da dica — a pessoa vê onde errou. */
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
      {erro
        ? <span role="alert" style={{ fontSize: 12, fontWeight: 600, color: "var(--perigo)" }}>{erro}</span>
        : dica && <span style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45 }}>{dica}</span>}
    </label>
  );
}

/**
 * "1.234,56" e "1234.56" chegam os dois, de teclados diferentes. Quem tem
 * vírgula usa ponto como milhar; quem não tem, o ponto É o decimal — tratar
 * todo ponto como milhar transformaria 1234.56 em 123.456.
 */
function paraNumero(v: string): number {
  const limpo = v.replace(/\s/g, "");
  const n = limpo.includes(",")
    ? Number(limpo.replace(/\./g, "").replace(",", "."))
    : Number(limpo);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function FormNota({ empresaId, empresas = [], tipoInicial, compras, aoFechar }: {
  empresaId: string;
  /** Em "Visão geral" a tela não tem empresa: a nota pergunta em qual nasce. */
  empresas?: { id: string; nome: string }[];
  tipoInicial: TipoNota;
  compras: CompraResumo[];
  aoFechar: () => void;
}) {
  const { atualizar } = useAtualizar();
  const [tipo, setTipo] = useState<TipoNota>(tipoInicial);
  const [empresaEscolhida, setEmpresaEscolhida] = useState(empresaId);
  // A LINHA RÁPIDA: "Madeireira X 4.500 15/09" preenche parceiro, valor e
  // emissão a cada tecla. Ver `interpretarLinha`.
  const [linha, setLinha] = useState("");
  const [entendido, setEntendido] = useState<string[]>([]);
  const [erros, setErros] = useState<{ identificacao?: string; empresa?: string }>({});
  const escreverLinha = (texto: string) => {
    setLinha(texto);
    const r = interpretarLinha(texto);
    setEntendido(r.entendido);
    if (!texto.trim()) return;
    setParceiro(r.descricao);
    if (r.valor != null) setValor(r.valor.toFixed(2));
    if (r.data) setEmissao(r.data);
    setErros({});
  };
  const [numero, setNumero] = useState("");
  const [serie, setSerie] = useState("");
  const [parceiro, setParceiro] = useState("");
  const [chave, setChave] = useState("");
  const [emissao, setEmissao] = useState(hojeISO());
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState("outros");
  const [status, setStatus] = useState<NotaStatus>("autorizada");
  const [compraId, setCompraId] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  /**
   * O XML escolhido, guardado para subir DEPOIS que a nota existir.
   *
   * A tela pedia dez campos à mão — incluindo 44 dígitos de chave — e só
   * deixava anexar o arquivo depois de a nota existir: transcrever o documento
   * e então anexar o documento de onde a transcrição saiu. Agora o arquivo
   * chega primeiro, preenche tudo o que sabe, e sobe junto no salvar.
   */
  const [xml, setXml] = useState<File | null>(null);
  const [lidoDoXml, setLidoDoXml] = useState<number | null>(null);
  const arquivoXml = useRef<HTMLInputElement>(null);

  async function lerXml(f: File) {
    setErro("");
    try {
      const dados = lerNotaDoXml(await f.text());
      const quantos = quantosCampos(dados);
      if (!quantos) {
        setErro("Não reconheci uma NF-e neste arquivo. Confira se é o XML da nota, e não o DANFE em PDF.");
        return;
      }
      const c = camposDaNota(dados);
      setTipo(c.tipo);
      if (c.numero) setNumero(c.numero);
      if (c.serie) setSerie(c.serie);
      if (c.chave_acesso) setChave(c.chave_acesso);
      if (c.emissao) setEmissao(c.emissao);
      if (c.valor) setValor(c.valor);
      if (c.parceiro_nome) setParceiro(c.parceiro_nome);
      setStatus("autorizada");
      setErros({});
      setXml(f);
      setLidoDoXml(quantos);
    } catch {
      setErro("Não deu para ler o arquivo. Ele precisa ser o XML da nota.");
    }
  }

  useEffect(() => travarRolagem(), []);


  const vinculaveis = compras.filter((c) => c.status !== "cancelada");

  async function salvar() {
    if (salvando) return;
    const numeroLimpo = numero.trim();
    const parceiroLimpo = parceiro.trim();
    // O servidor recusa os dois vazios, e com razão: a busca da tela é por
    // número e por parceiro, então uma nota sem os dois entra e não é achada
    // por ninguém. Barrar aqui evita a viagem só pra ouvir não.
    const novos: typeof erros = {};
    if (!numeroLimpo && !parceiroLimpo) novos.identificacao = "Informe o número da nota ou o nome do parceiro.";
    if (!(empresaEscolhida || empresaId)) novos.empresa = "Escolha em qual empresa a nota nasce.";
    if (Object.keys(novos).length) { setErros(novos); return; }
    setErros({});

    setSalvando(true);
    setErro("");
    try {
      const r = await fetch("/api/financeiro/notas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaEscolhida || empresaId,
          tipo,
          numero: numeroLimpo || null,
          serie: serie.trim() || null,
          parceiro_nome: parceiroLimpo || null,
          chave_acesso: chave.trim() || null,
          emissao,
          valor: paraNumero(valor),
          categoria,
          status,
          // Vínculo é coisa de nota de compra. Uma emitida com `compra_id`
          // penduraria a venda numa despesa e sujaria o relatório dos dois lados.
          compra_id: tipo === "compra" ? (compraId || null) : null,
        }),
      });
      const resposta = (await r.json().catch(() => ({}))) as { erro?: string; id?: string };
      // 409 é a chave de acesso repetida — a mensagem do servidor diz o que
      // houve, e é ela que a pessoa precisa ler para conferir a nota certa.
      if (!r.ok) {
        setErro(resposta.erro || "Não deu para salvar a nota.");
        return;
      }
      // O XML vira anexo da nota recém-criada. Falhar aqui NÃO desfaz o
      // cadastro nem mostra erro de salvamento: a nota está salva, e dizer o
      // contrário faria a pessoa cadastrar tudo de novo. O aviso é só sobre o
      // arquivo, que ela pode reanexar pela ficha.
      const criada = resposta as { id?: string };
      if (xml && criada.id) {
        const envio = new FormData();
        envio.append("file", xml);
        envio.append("tipo", "nota");
        envio.append("owner_id", criada.id);
        envio.append("empresa_id", empresaEscolhida || empresaId);
        const rA = await fetch("/api/financeiro/anexos", { method: "POST", body: envio }).catch(() => null);
        if (!rA?.ok) toast.erro("Nota salva, mas o XML não subiu. Anexe pela ficha da nota.");
      }
      aoFechar();
      atualizar();
    } catch {
      setErro("Sem resposta do servidor. Confira a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ModalFormulario
      icone="file-text"
      titulo="Nova nota fiscal"
      subtitulo="Só fecha no X — o que você digitou não se perde num clique fora."
      aoFechar={aoFechar}
      rodape={
        <>
          <BotaoFin onClick={aoFechar}>Cancelar</BotaoFin>
          <BotaoFin icone="check" primario onClick={salvar}>
            {salvando ? "Salvando..." : "Salvar nota"}
          </BotaoFin>
        </>
      }
    >

          <div
            style={{
              display: "grid", gap: 13, minWidth: 0,
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
            }}
          >
            <Campo rotulo="Tipo">
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoNota)} style={CONTROLE}>
                <option value="compra">Nota de compra (documento de uma compra)</option>
                <option value="emitida">Nota emitida (venda)</option>
              </select>
            </Campo>

            <div style={{ gridColumn: "1 / -1" }}>
              <LinhaRapida
                valor={linha}
                aoMudar={escreverLinha}
                entendido={entendido}
                placeholder="Madeireira X 4.500 15/09"
              />
            </div>

            {/* O XML PRIMEIRO: é o caminho principal, não um extra.
                Quem tem a nota tem o arquivo, e o arquivo sabe os dez campos —
                inclusive os 44 dígitos da chave, que ninguém digita sem errar.
                Digitar à mão continua existindo logo abaixo, para a nota que
                chegou só no papel. */}
            <div style={{ gridColumn: "1 / -1" }}>
              <input
                ref={arquivoXml}
                type="file"
                accept=".xml,text/xml,application/xml"
                style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void lerXml(f); e.target.value = ""; }}
              />
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  padding: "13px 15px", borderRadius: "var(--r-md)", minWidth: 0,
                  border: `1px solid ${xml ? "color-mix(in srgb, var(--ok) 40%, var(--border))" : "var(--border)"}`,
                  background: xml ? "color-mix(in srgb, var(--ok) 8%, var(--surface))" : "var(--surface)",
                }}
              >
                <Icon name={xml ? "circle-check" : "file-text"} size={19} color={xml ? "var(--ok)" : "var(--text-dim)"} />
                <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700 }}>
                    {xml ? xml.name : "Tem o XML da nota?"}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, overflowWrap: "anywhere" }}>
                    {xml
                      ? `${lidoDoXml} campo${lidoDoXml === 1 ? "" : "s"} preenchido${lidoDoXml === 1 ? "" : "s"} pelo arquivo. Ele sobe junto com a nota.`
                      : "Escolha o arquivo e ele preenche número, série, chave, emitente, emissão e valor."}
                  </p>
                </div>
                <BotaoFin icone="upload" onClick={() => arquivoXml.current?.click()}>
                  {xml ? "Trocar XML" : "Importar XML"}
                </BotaoFin>
                {xml && (
                  <BotaoFin icone="trash" onClick={() => { setXml(null); setLidoDoXml(null); }}>Tirar</BotaoFin>
                )}
              </div>
            </div>

            <Campo rotulo="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as NotaStatus)} style={CONTROLE}>
                {NOTA_STATUS.map((s) => <option key={s} value={s}>{SELO_NOTA[s].label}</option>)}
              </select>
            </Campo>

            {!empresaId && empresas.length > 0 && (
              <Campo rotulo="Empresa" erro={erros.empresa}>
                <SeletorEmpresa empresas={empresas} valor={empresaEscolhida} aoMudar={setEmpresaEscolhida} />
              </Campo>
            )}
            <Campo rotulo="Número" erro={erros.identificacao}>
              <input
                value={numero}
                onChange={(e) => { setNumero(e.target.value); if (erros.identificacao) setErros({ ...erros, identificacao: undefined }); }}
                inputMode="numeric"
                placeholder="000123"
                style={CONTROLE}
              />
            </Campo>

            <Campo rotulo="Série">
              <input value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="1" style={CONTROLE} />
            </Campo>

            <Campo
              rotulo={tipo === "emitida" ? "Cliente" : "Fornecedor"}
              largo
              dica="Número ou parceiro: pelo menos um dos dois, senão a nota não é encontrada depois."
            >
              <input
                value={parceiro}
                onChange={(e) => { setParceiro(e.target.value); if (erros.identificacao) setErros({ ...erros, identificacao: undefined }); }}
                placeholder="Nome de quem está do outro lado da nota"
                style={CONTROLE}
              />
            </Campo>

            <Campo rotulo="Chave de acesso" largo dica="44 dígitos. Única por empresa — a mesma chave não entra duas vezes.">
              <input
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                inputMode="numeric"
                placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
                style={CONTROLE}
              />
            </Campo>

            <Campo rotulo="Emissão">
              <input type="date" value={emissao} onChange={(e) => setEmissao(e.target.value)} style={CONTROLE} />
            </Campo>

            <Campo rotulo="Valor" dica={moeda(paraNumero(valor))}>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                style={CONTROLE}
              />
            </Campo>

            <Campo rotulo="Categoria">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={CONTROLE}>
                {CATEGORIAS_COMPRA.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Campo>

            {tipo === "compra" && (
              <Campo
                rotulo="Compra vinculada"
                largo
                dica="Só amarra o documento na compra que já existe. Nenhum compromisso nasce daqui."
              >
                <Escolha
  valor={compraId}
  vazio="Sem vínculo — só o documento"
  placeholder="Buscar compra…"
  aoEscolher={setCompraId}
  opcoes={vinculaveis.map((c) => ({
    id: c.id,
    nome: c.descricao,
    detalhe: `${dataBR(c.data)} · ${moeda(c.valor_total)}`,
  }))}
/>
              </Campo>
            )}
          </div>

          {erro && (
            <Alerta tom="perigo" style={{ marginTop: 14 }}>{erro}</Alerta>
          )}

    </ModalFormulario>
  );
}
