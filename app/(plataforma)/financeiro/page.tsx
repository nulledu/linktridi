import { redirect } from "next/navigation";
import { semPermissaoDoFinanceiro } from "@/lib/financeiro/gate";
import { contextoFinanceiro } from "./contexto";
import {
  colaboradores, compras, compromissos, contarComprasSemNota, contarNotasSemCompra, contas,
  folhaTotal, fornecedores, patrimonio, recorrencias,
} from "@/lib/financeiro/db";
import {
  alertas, equivalenteMensal, fatias, hojeISO, moeda,
  resumoVisaoGeral, somarDias, statusEfetivo,
} from "@/lib/financeiro/calculos";
import { agruparPorEmpresa, chaveDoMes, cobraNoMes, noMes } from "@/lib/financeiro/periodo";
import {
  acharCategoria, CATEGORIAS_COMPRA, ICONE_CONTA_TIPO,
  LABEL_CONTA_TIPO, LABEL_PERIODICIDADE,
} from "@/lib/financeiro/tipos";
import { AvisoSchema, Barras, BotaoFin, Cabecalho, Cartao, LinhaKpi, Marca, ProximasAcoes, TituloCartao, Vazio, FaixaDePaineis } from "./ui";
import { KpiSeta, PainelRolante } from "./blocos";
import { assinarLogos } from "@/lib/financeiro/anexos";
import { configDasEmpresas } from "@/lib/financeiro/config";
import { AvisosBotao } from "./AvisosBotao";
import { ProximosCompromissos } from "./ProximosCompromissos";

export const dynamic = "force-dynamic";

/**
 * Visão Geral — dashboard executivo, SÓ LEITURA (§5).
 *
 * Nenhum número aqui é gravado: todos são derivados na hora, das mesmas
 * tabelas que as outras telas mostram em detalhe. É o §3 da especificação
 * levado a sério — para qualquer número exibido, dá para chegar nos registros
 * que o formaram, porque não existe uma segunda fonte.
 *
 * Lê direto do banco no servidor, sem passar por rota de API: cada `fetch`
 * interno seria uma invocação a mais, e foi execução (não tamanho de resposta)
 * que pausou este projeto na Vercel.
 */
export default async function FinanceiroVisaoGeralPage() {
  // Quem SÓ administra acesso (`financeiro:acessos`, sem `ver`) é mandado para
  // Pessoas, que é onde o Financeiro passou a ser concedido — não existe mais
  // tela de administração AQUI DENTRO. Sem este desvio, essa pessoa bateria na
  // tela de "sem permissão" tentando abrir a Visão Geral, e a leitura seria
  // "não tenho nada", quando na verdade ela só precisa ir para outro lugar.
  const { poderes: meus, escopo, geral, empresas } = await contextoFinanceiro();
  if (!meus.ver && meus.acessos) redirect("/colaboradores");

  const { empresa, poderes, pendente } = await contextoFinanceiro("ver");
  // Rede de segurança do gate, e ela REDIRECIONA em vez de 404.
  //
  // `contextoFinanceiro("ver")` já barra quem não tem a chave, então esta linha
  // não deveria ser alcançada. Ela já foi um 404, e um 404 numa
  // barreira de PERMISSÃO é o pior desfecho possível: a pessoa lê "não existe",
  // conclui que o sistema está quebrado, e não tem como saber que o que falta é
  // uma chave. A tela de sem-permissão diz o que aconteceu e qual chave pedir.
  if (!poderes.ver) redirect(semPermissaoDoFinanceiro("ver"));

  if (!empresa && !geral) {
    return (
      <>
        <Cabecalho titulo="Visão Geral" />
        {pendente ? <AvisoSchema /> : (
          <Cartao>
            <Vazio
              icone="building-warehouse"
              titulo="Nenhuma empresa liberada para você"
              detalhe="O Financeiro trabalha por empresa (Tridi e Gedux). Peça a liberação a quem administra o módulo."
            />
          </Cartao>
        )}
      </>
    );
  }

  const hoje = hojeISO();
  const emUmMes = somarDias(hoje, 45);

  // Uma rodada só de consultas, em paralelo. A folha vem pelo TOTAL quando a
  // pessoa não tem `financeiro:folha`: o número do cartão aparece, o salário de
  // cada um não viaja até o navegador.
  const [
    fContas, fCompromissos, fRecorrencias, fCompras, fFornecedores,
    fFolhaTotal, fColaboradores, fPatrimonio, notasSoltas, comprasSemNota, configs,
  ] = await Promise.all([
    contas(escopo),
    // Só o que está EM ABERTO, de qualquer data: a Visão Geral soma o que se
    // deve, e a conta atrasada há cinco meses continua sendo dívida — a janela
    // de 120 dias que existia aqui a tirava do "Atrasados" e do alerta.
    compromissos(escopo, { situacao: "abertos", ate: emUmMes, limite: 300 }),
    recorrencias(escopo, { limite: 100 }),
    compras(escopo, { de: somarDias(hoje, -60), limite: 200 }),
    fornecedores(escopo, { limite: 200 }),
    folhaTotal(escopo),
    poderes.folha ? colaboradores(escopo, { limite: 200 }) : Promise.resolve({ dados: [], pendente: false }),
    patrimonio(escopo, { limite: 200 }),
    contarNotasSemCompra(escopo),
    contarComprasSemNota(escopo),
    // A configuração entra na MESMA rodada: ela não depende de nenhuma das
    // outras, e esperar por ela sozinha custava uma ida inteira.
    configDasEmpresas(escopo),
  ]);

  const schemaPendente = pendente || fContas.pendente || fCompromissos.pendente;

  // A janela de "vence em breve" vem da configuração. Em Visão geral, com
  // empresas de janelas diferentes, vale a MENOR: alertar cedo demais custa um
  // olhar; alertar tarde custa juros.
  const alertaDias = escopo.length ? Math.min(...escopo.map((id) => configs[id].alerta_dias)) : 7;

  const resumo = resumoVisaoGeral({
    alertaDias,
    contas: fContas.dados,
    compromissos: fCompromissos.dados,
    recorrencias: fRecorrencias.dados,
    compras: fCompras.dados,
    colaboradores: fColaboradores.dados,
    hoje,
  });
  // Quem não pode ver a folha nominal ainda vê o total do mês — o cartão é do
  // §5 e some junto com a sub, não com a lista.
  const folhaMes = poderes.folha ? resumo.folha_mes : fFolhaTotal.dados.total;

  const nomeFornecedor = new Map(fFornecedores.dados.map((f) => [f.id, f.nome]));
  const nomeConta = new Map(fContas.dados.map((c) => [c.id, c.nome]));

  // Todo bloco desta tela é do MÊS VIGENTE (set/2026): quem abre a Visão Geral
  // quer o mês em que está. O atrasado de meses anteriores continua nos KPIs
  // e em "Próximas ações" — a lista é do mês, a dívida não some.
  const mesVigente = chaveDoMes(hoje);
  const proximos = fCompromissos.dados
    .map((c) => ({ ...c, efetivo: statusEfetivo(c, hoje) }))
    .filter((c) => c.efetivo !== "pago" && c.efetivo !== "cancelado")
    .filter((c) => noMes(mesVigente, c.vencimento))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .slice(0, 6);

  // As que COBRAM neste mês (cadência da regra), não as seis primeiras do cadastro.
  const recorrentesAtivas = fRecorrencias.dados
    .filter((r) => r.status === "ativa")
    .filter((r) => cobraNoMes(r, mesVigente))
    .slice(0, 6);
  // Em "Visão geral" as contas saem por empresa: o mesmo banco em duas
  // empresas são duas contas, e a tela diz de quem é cada uma.
  const contasPorEmpresa = geral
    ? agruparPorEmpresa(fContas.dados, empresas)
    : [{ empresa: { id: empresa?.id ?? "", nome: empresa?.nome ?? "" }, itens: fContas.dados }];

  const barrasCompras = fatias(
    fCompras.dados.filter((c) => c.status !== "cancelada"),
    (c) => c.categoria,
    (c) => c.valor_total,
    (id) => acharCategoria(CATEGORIAS_COMPRA, id),
  );

  // Uma chamada só para todos os logos: um link assinado por linha faria a
  // Visão Geral abrir dez conexões só para desenhar ícone.
  const logos = await assinarLogos(fContas.dados.map((c) => c.logo_url));

  const acoes = alertas({
    compromissos: fCompromissos.dados,
    notasSemCompra: notasSoltas,
    patrimonioGarantia: fPatrimonio.dados,
    recorrencias: fRecorrencias.dados,
    comprasSemNota,
    hoje,
  });

  return (
    <>
      <Cabecalho
        titulo="Visão Geral"
        sub="O retrato do caixa, do que se deve e do que já foi pago."
        acoes={
          <>
            {poderes.compromissos && (
              <BotaoFin icone="plus" primario href="/financeiro/compromissos?novo=1">Novo compromisso</BotaoFin>
            )}
            {poderes.compras && <BotaoFin icone="plus" href="/financeiro/compras?novo=1">Nova compra</BotaoFin>}
          </>
        }
      />

      {schemaPendente && <AvisoSchema />}

      {/* Cada número LEVA à tela dele. Aqui a seta é LINK e não função: esta
          página é de servidor, e função não atravessa a fronteira. */}
      <LinhaKpi>
        <KpiSeta
          icone="wallet"
          rotulo="Saldo disponível"
          valor={moeda(resumo.saldo_disponivel)}
          tom={resumo.saldo_disponivel < 0 ? "perigo" : "ok"}
          detalhe="em todas as contas"
          href="/financeiro/cadastros/contas"
          tituloDaSeta="Ver bancos e gateways"
        />
        <KpiSeta
          icone="calendar-event"
          rotulo={`A pagar em ${alertaDias} dias`}
          valor={moeda(resumo.a_pagar_7)}
          tom={resumo.a_pagar_7 > 0 ? "perigo" : "ok"}
          detalhe="o que vence primeiro"
          href="/financeiro/compromissos?status=atrasado"
          tituloDaSeta="Ver o que vence"
        />
        <KpiSeta
          icone="calendar-plus"
          rotulo="A pagar em 30 dias"
          valor={moeda(resumo.a_pagar_30)}
          tom="atencao"
          detalhe="o mês inteiro à frente"
          href="/financeiro/compromissos"
          tituloDaSeta="Ver os compromissos"
        />
        <KpiSeta
          icone="refresh"
          rotulo="Recorrências do mês"
          valor={moeda(resumo.recorrencias_mes)}
          detalhe="assinaturas e contratos"
          href="/financeiro/cadastros/recorrencias"
          tituloDaSeta="Ver as recorrências"
        />
        <KpiSeta
          icone="shopping-cart"
          rotulo="Compras do mês"
          valor={moeda(resumo.compras_mes)}
          detalhe="o que a empresa comprou"
          href="/financeiro/compras"
          tituloDaSeta="Ver as compras"
        />
        <KpiSeta
          icone="users"
          rotulo="Folha do mês"
          valor={moeda(folhaMes)}
          detalhe={poderes.folha ? "salários e benefícios" : `${fFolhaTotal.dados.pessoas} pessoas`}
          href={poderes.folha ? "/financeiro/cadastros/colaboradores" : undefined}
          tituloDaSeta="Ver a folha"
        />
      </LinhaKpi>

      {/* Os painéis em CIMA, na horizontal: a lista fica com a largura toda
          e, em Visão geral, vira uma coluna por empresa. */}
      <FaixaDePaineis>
        <PainelRolante icone="alert-triangle" titulo="Próximas ações">
          <ProximasAcoes acoes={acoes} />
            {/* Sem alerta não há o que mandar: um "Avisar a equipe" ligado
                sobre a tela de "nada pedindo atenção" convida a encher o sino
                de gente com aviso nenhum dentro. */}
            {acoes.length > 0 && <AvisosBotao />}
        </PainelRolante>

        <Cartao>
          <TituloCartao
            icone="refresh"
            direita={poderes.cadastros
              ? <BotaoFin href="/financeiro/cadastros/recorrencias" titulo="Ver todas as recorrências">Ver todas</BotaoFin>
              : undefined}
          >
            Recorrências deste mês
          </TituloCartao>
          {recorrentesAtivas.length === 0 ? (
            <Vazio compacto icone="refresh" titulo="Nada cobra neste mês" detalhe="Assinaturas e contratos fixos entram aqui no mês em que cobram e viram compromisso sozinhos." />
          ) : (
            <div style={{ display: "grid", gap: 4 }}>
              {recorrentesAtivas.map((r) => (
                <div
                  key={r.id}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", minWidth: 0 }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <strong style={{ display: "block", fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>
                      {r.descricao}
                    </strong>
                    <small style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                      {LABEL_PERIODICIDADE[r.periodicidade]} · dia {r.dia_vencimento}
                      {r.fornecedor_id && nomeFornecedor.get(r.fornecedor_id) ? ` · ${nomeFornecedor.get(r.fornecedor_id)}` : ""}
                    </small>
                  </span>
                  <span style={{ textAlign: "end", flex: "none" }}>
                    <strong style={{ display: "block", fontSize: 13.5, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                      {moeda(r.valor)}
                    </strong>
                    {r.periodicidade !== "mensal" && (
                      <small style={{ fontSize: 11, color: "var(--text-dim)" }}>
                        {moeda(equivalenteMensal(r))}/mês
                      </small>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Cartao>

        <Cartao>
          <TituloCartao
            icone="chart-bar"
            direita={poderes.compras ? <BotaoFin href="/financeiro/compras" titulo="Ver todas as compras">Ver todas</BotaoFin> : undefined}
          >
            Resumo de compras
          </TituloCartao>
          <Barras fatias={barrasCompras} />
        </Cartao>
      </FaixaDePaineis>

        <Cartao>
          <TituloCartao
            icone="calendar-event"
            direita={<BotaoFin href="/financeiro/compromissos" titulo="Ver todos os compromissos">Ver todos</BotaoFin>}
          >
            Compromissos deste mês
          </TituloCartao>
          {/* Os DADOS vêm daqui; quem define as colunas é o lado cliente.
              Função não atravessa a fronteira servidor→cliente — ver o
              cabeçalho de ProximosCompromissos.tsx. */}
          <ProximosCompromissos linhas={proximos} />
        </Cartao>

        <Cartao>
          <TituloCartao
            icone="building-warehouse"
            direita={poderes.cadastros
              ? <BotaoFin href="/financeiro/cadastros/contas" titulo="Ver todas as contas">Ver todas</BotaoFin>
              : undefined}
          >
            Contas
          </TituloCartao>
          {fContas.dados.length === 0 ? (
            <Vazio
              icone="wallet"
              titulo="Nenhuma conta cadastrada"
              detalhe="Cadastre bancos, gateways e cartões para o saldo aparecer aqui."
              acao={poderes.contas ? <BotaoFin icone="plus" href="/financeiro/cadastros/contas">Cadastrar conta</BotaoFin> : undefined}
            />
          ) : (
            contasPorEmpresa.map((bloco) => (
            <div key={bloco.empresa.id || "unica"} style={{ display: "grid", gap: 8, minWidth: 0 }}>
            {geral && (
              <strong style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 6 }}>{bloco.empresa.nome}</strong>
            )}
            <div
              style={{
                display: "grid", gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
              }}
            >
              {bloco.itens.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 11, padding: "12px 14px",
                    borderRadius: "var(--r-sm)", background: "var(--surface-2)", minWidth: 0,
                  }}
                >
                  {/* O ícone do banco. Sem logo subido ainda, cai no ícone do
                      tipo (banco/gateway/cartão) e, na falta dele, na inicial
                      — nenhuma conta aparece sem marca. */}
                  <Marca
                    marca={{
                      nome: c.nome,
                      logo: logos.get(c.logo_url ?? "") ?? null,
                      icone: c.icone ?? ICONE_CONTA_TIPO[c.tipo],
                      cor: c.cor,
                    }}
                    tamanho={38}
                  />
                  <span style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-dim)" }}>
                    {LABEL_CONTA_TIPO[c.tipo] ?? c.tipo}
                  </span>
                  <strong
                    style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  >
                    {c.nome}
                  </strong>
                  <strong
                    style={{
                      fontSize: 17, fontWeight: 800, fontVariantNumeric: "tabular-nums",
                      color: c.saldo < 0 ? "var(--perigo)" : "var(--text)",
                    }}
                  >
                    {moeda(c.saldo)}
                  </strong>
                  </span>
                </div>
              ))}
            </div>
            </div>
            ))
          )}
        </Cartao>

    </>
  );
}
