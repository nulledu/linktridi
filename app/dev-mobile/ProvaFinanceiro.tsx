"use client";

// Banco de provas do Financeiro, com dados falsos.
//
// Monta o CompromissosClient REAL — o mesmo componente que a rota serve — e
// não uma recriação com as peças do kit. A diferença importa: componente solto
// não revela problema de tela. Espaçamento, densidade, o painel lateral de
// pagar e a fileira de ações só mostram defeito com o conteúdo de verdade
// dentro da casca de verdade.
//
// As telas do módulo são Server Components atrás do gate da área restrita e não
// montam sem sessão; os CLIENTES, porém, recebem props simples — é por aí que a
// prova entra.

import { CompromissosClient } from "../(plataforma)/financeiro/compromissos/CompromissosClient";
import { AuditoriaClient } from "../(plataforma)/financeiro/auditoria/AuditoriaClient";
import { RecorrenciasClient } from "../(plataforma)/financeiro/cadastros/recorrencias/RecorrenciasClient";
import { ContasClient } from "../(plataforma)/financeiro/cadastros/contas/ContasClient";
import { ColaboradoresClient } from "../(plataforma)/financeiro/cadastros/colaboradores/ColaboradoresClient";
import { ComprasClient } from "../(plataforma)/financeiro/compras/ComprasClient";
import { NotasClient } from "../(plataforma)/financeiro/notas/NotasClient";
import { PatrimonioClient } from "../(plataforma)/financeiro/patrimonio/PatrimonioClient";
import { FornecedoresClient } from "../(plataforma)/financeiro/cadastros/fornecedores/FornecedoresClient";
import { ContatosClient } from "../(plataforma)/financeiro/cadastros/contatos/ContatosClient";
import { ConfiguracoesClient } from "../(plataforma)/financeiro/configuracoes/ConfiguracoesClient";
import { Cartao, Rosca, Tabela, TituloCartao, moeda } from "../(plataforma)/financeiro/ui";
import type { Colaborador, Compra, Compromisso, Conta, Contato, Empresa, Fornecedor, Movimento, Nota, Patrimonio, Recorrencia } from "@/lib/financeiro/tipos";
import type { PoderesFinanceiro } from "@/lib/financeiro/gate";

const HOJE = "2026-08-14";
const EMPRESA = "e1";

const PODERES: PoderesFinanceiro = {
  ver: true, compromissos: true, compras: true, notas: true, patrimonio: true,
  cadastros: true, pagar: true, contas: true, folha: true, config: true, acessos: true,
};

const CONTAS: Conta[] = [
  { id: "c1", empresa_id: EMPRESA, nome: "Itaú", tipo: "banco", instituicao: "Itaú", saldo_inicial: 60000, saldo: 62800, inclui_no_saldo: true, ativa: true, cor: null, ordem: 1 , responsavel_id: null, limite: null, usado: null, disponivel: null, conta_mae_id: null, bandeira: null, final: null, agencia: null, numero: null },
  { id: "c2", empresa_id: EMPRESA, nome: "Inter", tipo: "banco", instituicao: "Inter", saldo_inicial: 18000, saldo: 18200, inclui_no_saldo: true, ativa: true, cor: null, ordem: 2 , responsavel_id: null, limite: null, usado: null, disponivel: null, conta_mae_id: null, bandeira: null, final: null, agencia: null, numero: null },
  { id: "c3", empresa_id: EMPRESA, nome: "Mercado Pago", tipo: "gateway", instituicao: "Mercado Pago", saldo_inicial: 47000, saldo: 47450, inclui_no_saldo: true, ativa: true, cor: null, ordem: 3 , responsavel_id: null, limite: null, usado: null, disponivel: null, conta_mae_id: null, bandeira: null, final: null, agencia: null, numero: null },
  { id: "c4", empresa_id: EMPRESA, nome: "Cartão Inter", tipo: "cartao", instituicao: "Inter", saldo_inicial: 0, saldo: -4300, inclui_no_saldo: false, ativa: true, cor: null, ordem: 4 , responsavel_id: null, limite: null, usado: null, disponivel: null, conta_mae_id: null, bandeira: null, final: null, agencia: null, numero: null },
];

const FORNECEDORES: Fornecedor[] = [
  { id: "f1", empresa_id: EMPRESA, nome: "Madeireira X", cnpj: "11.111.111/0001-11", categoria: "materia_prima", contato_nome: null, contato_email: null, contato_fone: null, prazo_dias: 30, forma_pagamento: "Boleto", ativo: true, categorias: [], prazo_envio_dias: null, pix_tipo: null, pix_chave: null, banco: null, agencia: null, conta_numero: null, aceita_boleto: false, inscricao_estadual: null, site: null, whatsapp: null, cidade: null, uf: null, endereco: null, observacao: null },
  { id: "f2", empresa_id: EMPRESA, nome: "Embalagens ABC", cnpj: null, categoria: "embalagem", contato_nome: null, contato_email: null, contato_fone: null, prazo_dias: null, forma_pagamento: null, ativo: true, categorias: [], prazo_envio_dias: null, pix_tipo: null, pix_chave: null, banco: null, agencia: null, conta_numero: null, aceita_boleto: false, inscricao_estadual: null, site: null, whatsapp: null, cidade: null, uf: null, endereco: null, observacao: null },
];

const base = (over: Partial<Compromisso>): Compromisso => ({
  id: "x", empresa_id: EMPRESA, descricao: "", categoria: "outros", valor: 0,
  vencimento: HOJE, competencia: "2026-08-01", status: "pendente",
  origem: "manual", origem_id: null, parcela_numero: null, parcela_total: null,
  conta_id: null, fornecedor_id: null, contato_id: null, colaborador_id: null,
  pago_em: null, pago_valor: null, observacao: null, ...over,
});

const LINHAS: Compromisso[] = [
  // Vence hoje.
  base({ id: "1", descricao: "Internet Vivo", categoria: "internet", valor: 350, vencimento: "2026-08-14", conta_id: "c1" }),
  // Já vencido: prova o "atrasado" derivado do relógio, que não existe no banco.
  base({ id: "6", descricao: "Assinatura Adobe Creative Cloud", categoria: "software", valor: 299, vencimento: "2026-08-01", conta_id: "c4", origem: "recorrencia" }),
  base({ id: "2", descricao: "Aluguel fábrica", categoria: "aluguel", valor: 8000, vencimento: "2026-08-15", status: "agendado", conta_id: "c1" }),
  // Parcela de compra: prova o "(2/3)" e a origem.
  base({ id: "3", descricao: "Fornecedor MDF (2/3)", categoria: "materia_prima", valor: 12400, vencimento: "2026-08-18", conta_id: "c3", origem: "compra", origem_id: "cp1", parcela_numero: 2, parcela_total: 3, fornecedor_id: "f1" }),
  base({ id: "4", descricao: "Imposto DAS", categoria: "impostos", valor: 18000, vencimento: "2026-08-20", conta_id: "c2", origem: "imposto" }),
  base({ id: "5", descricao: "Folha de pagamento", categoria: "colaboradores", valor: 29800, vencimento: "2026-08-25", status: "previsto", conta_id: "c1", origem: "folha" }),
  // Pago: prova o selo verde e que ele não vira atrasado nem com data velha.
  base({ id: "7", descricao: "Contabilidade", categoria: "servicos", valor: 2000, vencimento: "2026-07-30", status: "pago", conta_id: "c1", pago_em: "2026-07-30T12:00:00Z", pago_valor: 2000 }),
  // Descrição longa sem espaço: o candidato natural a estourar 320px.
  base({ id: "8", descricao: "Licença EnterpriseResourcePlanningPlatform-2026", categoria: "software", valor: 1499.9, vencimento: "2026-08-28", conta_id: "c4" }),
];

// O rastro de auditoria, com um caso de cada tipo — inclusive a linha de
// colaborador, que é a que tem detalhe podado quando falta `financeiro:folha`.
const AUDITORIA = [
  { id: "a1", entidade: "compromisso", entidade_id: "1", acao: "pagar", dados: { valor: 350, conta_id: "c1" }, user_nome: "Douglas", created_at: "2026-08-14T14:32:00Z" },
  { id: "a2", entidade: "compra", entidade_id: "cp1", acao: "confirmar", dados: { parcelas: 3, valor_total: 9000 }, user_nome: "Douglas", created_at: "2026-08-13T09:10:00Z" },
  { id: "a3", entidade: "compromisso", entidade_id: "9", acao: "reverter", dados: { movimento_original: "m7", reversao: "m9" }, user_nome: "Caio", created_at: "2026-08-12T17:45:00Z" },
  { id: "a4", entidade: "conta", entidade_id: "c2", acao: "ajustar-saldo", dados: { valor: -120, motivo: "Tarifa não lançada" }, user_nome: "Caio", created_at: "2026-08-11T08:02:00Z" },
  { id: "a5", entidade: "colaborador", entidade_id: "p3", acao: "editar", dados: null, user_nome: "Douglas", created_at: "2026-08-10T11:20:00Z" },
  { id: "a6", entidade: "recorrencia", entidade_id: null, acao: "gerar", dados: { criados: 4, regras: 3, ate: "2026-09-30" }, user_nome: "Douglas", created_at: "2026-08-01T06:00:00Z" },
];

/**
 * Prova da PAGINAÇÃO e da ROSCA — as duas peças novas do kit.
 *
 * 26 linhas de propósito: com 10 por página são 3 páginas, que é o mínimo para
 * a janela de números fazer alguma coisa. Com 12 linhas o rodapé "funcionaria"
 * sem nunca exercitar o caso que quebra.
 */
export function ProvaFinanceiroKitNovo() {
  const linhas = Array.from({ length: 26 }, (_, i) => ({
    id: `l${i}`,
    nome: `Assinatura número ${i + 1}`,
    valor: 100 + i * 37,
  }));

  return (
    <>
      <Cartao style={{ marginBottom: 16 }}>
        <TituloCartao icone="chart-dots">Distribuição de saldos</TituloCartao>
        <Rosca
          total={moeda(128450)}
          rotuloTotal="total"
          fatias={[
            { id: "itau", label: "Itaú", cor: "var(--cat-1)", valor: 56780, proporcao: 1 },
            { id: "inter", label: "Inter", cor: "var(--cat-2)", valor: 28950, proporcao: 0.5 },
            { id: "mp", label: "Mercado Pago", cor: "var(--cat-3)", valor: 22430, proporcao: 0.4 },
            { id: "outros", label: "Outros", cor: "var(--neutro)", valor: 20290, proporcao: 0.35 },
          ]}
        />
      </Cartao>

      <Cartao>
        <TituloCartao icone="list">Lista com paginação</TituloCartao>
        <Tabela
          linhas={linhas}
          chaveDe={(l) => l.id}
          paginar={10}
          rotuloItem="assinaturas"
          colunas={[
            { chave: "nome", label: "Descrição", largura: "minmax(min(100%, 180px), 1.6fr)", titulo: true, celula: (l) => l.nome },
            { chave: "valor", label: "Valor", largura: "minmax(min(100%, 110px), 0.8fr)", fim: true, celula: (l) => moeda(l.valor) },
          ]}
        />
      </Cartao>
    </>
  );
}

/** As duas telas de cadastro que os mockups detalham, com dado falso. */
export function ProvaFinanceiroRecorrencias() {
  const regras: Recorrencia[] = [
    { id: "r1", empresa_id: EMPRESA, descricao: "Adobe", categoria: "software", valor: 299, periodicidade: "mensal", intervalo_meses: 1, dia_vencimento: 12, conta_id: "c1", fornecedor_id: null, inicio: "2026-01-01", fim: null, proxima_competencia: "2026-08-01", status: "ativa", conta_destino_id: null, forma_pagamento: null, responsavel_id: null, contato_id: null },
    { id: "r2", empresa_id: EMPRESA, descricao: "Internet Vivo", categoria: "internet", valor: 250, periodicidade: "mensal", intervalo_meses: 1, dia_vencimento: 15, conta_id: "c2", fornecedor_id: null, inicio: "2026-01-01", fim: null, proxima_competencia: "2026-08-01", status: "ativa", conta_destino_id: null, forma_pagamento: null, responsavel_id: null, contato_id: null },
    { id: "r3", empresa_id: EMPRESA, descricao: "Contabilidade", categoria: "servicos", valor: 2000, periodicidade: "mensal", intervalo_meses: 1, dia_vencimento: 20, conta_id: "c1", fornecedor_id: null, inicio: "2026-01-01", fim: null, proxima_competencia: "2026-08-01", status: "ativa", conta_destino_id: null, forma_pagamento: null, responsavel_id: null, contato_id: null },
    { id: "r4", empresa_id: EMPRESA, descricao: "Aluguel fábrica", categoria: "aluguel", valor: 8000, periodicidade: "mensal", intervalo_meses: 1, dia_vencimento: 25, conta_id: "c2", fornecedor_id: null, inicio: "2026-01-01", fim: null, proxima_competencia: "2026-08-01", status: "ativa", conta_destino_id: null, forma_pagamento: null, responsavel_id: null, contato_id: null },
    { id: "r5", empresa_id: EMPRESA, descricao: "Sistema ERP", categoria: "software", valor: 1200, periodicidade: "trimestral", intervalo_meses: 3, dia_vencimento: 5, conta_id: "c1", fornecedor_id: null, inicio: "2026-03-01", fim: "2026-09-05", proxima_competencia: "2026-09-01", status: "ativa", conta_destino_id: null, forma_pagamento: null, responsavel_id: null, contato_id: null },
    { id: "r6", empresa_id: EMPRESA, descricao: "Servidor cloud", categoria: "outros", valor: 730, periodicidade: "mensal", intervalo_meses: 1, dia_vencimento: 8, conta_id: "c3", fornecedor_id: null, inicio: "2026-01-01", fim: null, proxima_competencia: "2026-09-01", status: "ativa", conta_destino_id: null, forma_pagamento: null, responsavel_id: null, contato_id: null },
    { id: "r7", empresa_id: EMPRESA, descricao: "Antivírus corporativo (licença anual renovável)", categoria: "software", valor: 4800, periodicidade: "anual", intervalo_meses: 12, dia_vencimento: 31, conta_id: "c4", fornecedor_id: null, inicio: "2025-08-31", fim: null, proxima_competencia: "2026-08-01", status: "pausada", conta_destino_id: null, forma_pagamento: null, responsavel_id: null, contato_id: null },
  ];
  const opcoes = CONTAS.map((c) => ({ id: c.id, nome: c.nome }));
  return (
    <RecorrenciasClient
      empresaId={EMPRESA} empresaNome="Tridi" podeEscrever podeLancarPrimeira
      regras={regras} contas={opcoes} fornecedores={[]} schemaPendente={false}
    />
  );
}

export function ProvaFinanceiroContas() {
  const movs: Movimento[] = [
    { id: "m1", empresa_id: EMPRESA, conta_id: "c1", tipo: "entrada", valor: 4890, descricao: "Recebimento de venda #4587", compromisso_id: null, transfer_group_id: null, reverte_id: null, ocorrido_em: "2026-08-07T10:24:00Z", status: "confirmado" },
    { id: "m2", empresa_id: EMPRESA, conta_id: "c3", tipo: "entrada", valor: 2150, descricao: "Recebimento de venda #4586", compromisso_id: null, transfer_group_id: null, reverte_id: null, ocorrido_em: "2026-08-07T08:47:00Z", status: "confirmado" },
    { id: "m3", empresa_id: EMPRESA, conta_id: "c2", tipo: "transferencia", valor: 1980, descricao: "Transferência recebida", compromisso_id: null, transfer_group_id: "g1", reverte_id: null, ocorrido_em: "2026-08-06T11:05:00Z", status: "confirmado" },
    { id: "m4", empresa_id: EMPRESA, conta_id: "c3", tipo: "saida", valor: -145.6, descricao: "Taxa de antecipação", compromisso_id: null, transfer_group_id: null, reverte_id: null, ocorrido_em: "2026-08-06T16:32:00Z", status: "confirmado" },
    { id: "m5", empresa_id: EMPRESA, conta_id: "c4", tipo: "saida", valor: -2450, descricao: "Pagamento de fatura", compromisso_id: null, transfer_group_id: null, reverte_id: null, ocorrido_em: "2026-08-05T20:14:00Z", status: "confirmado" },
  ];
  return (
    <ContasClient
      empresaId={EMPRESA} empresaNome="Tridi" podeEscrever
      lista={CONTAS} movimentos={movs}
      pessoas={[{ id: "p1", nome: "Douglas" }, { id: "p2", nome: "Amanda" }]}
      logos={{}}
      desde30="2026-07-15" schemaPendente={false}
    />
  );
}

/** A folha: gente com valor, gente zerada e um desligado — os três casos que a
 *  prévia precisa separar antes de criar dezenas de milhares em obrigação. */
export function ProvaFinanceiroFolha() {
  const lista: Colaborador[] = [
    { id: "p1", empresa_id: EMPRESA, employee_id: null, nome: "Douglas Ferreira", setor: "Financeiro", cargo: "Analista financeiro", salario_base: 3800, beneficios: 620, dia_pagamento: 5, status: "ativo", admissao: "2024-02-01", gratificacao: 300, valor_hora: 24, conta_id: "c1", banco: "Itaú", agencia: "1234", conta_numero: "56789-0", pix_tipo: "cpf", pix_chave: "123.456.789-00", whatsapp: "(11) 99999-0001", logo_url: null, icone: null },
    { id: "p2", empresa_id: EMPRESA, employee_id: null, nome: "Amanda Rocha", setor: "Financeiro", cargo: "Assistente", salario_base: 2400, beneficios: 380, dia_pagamento: 31, status: "afastado", admissao: "2025-06-10", gratificacao: 0, valor_hora: 15, conta_id: "c1", banco: "Nubank", agencia: null, conta_numero: null, pix_tipo: "email", pix_chave: "amanda@exemplo.com", whatsapp: null, logo_url: null, icone: null },
    { id: "p3", empresa_id: EMPRESA, employee_id: "e3", nome: "Marina Alves", setor: "Comercial", cargo: "Gerente de vendas", salario_base: 6500, beneficios: 900, dia_pagamento: 5, status: "ativo", admissao: "2023-01-15", gratificacao: 800, valor_hora: 41, conta_id: "c2", banco: "Inter", agencia: "0001", conta_numero: "334455-1", pix_tipo: "telefone", pix_chave: "(11) 98888-2222", whatsapp: "(11) 98888-2222", logo_url: null, icone: null },
    { id: "p4", empresa_id: EMPRESA, employee_id: null, nome: "Estagiário sem cadastro", setor: "Produção", cargo: "Estagiário", salario_base: 0, beneficios: 0, dia_pagamento: null, status: "ativo", admissao: "2026-08-01", gratificacao: 0, valor_hora: 0, conta_id: null, banco: null, agencia: null, conta_numero: null, pix_tipo: null, pix_chave: null, whatsapp: null, logo_url: null, icone: null },
    { id: "p5", empresa_id: EMPRESA, employee_id: null, nome: "Ex-colaborador", setor: "Produção", cargo: "Auxiliar", salario_base: 2200, beneficios: 0, dia_pagamento: 5, status: "desligado", admissao: "2022-03-01", gratificacao: 0, valor_hora: 0, conta_id: null, banco: "Bradesco", agencia: null, conta_numero: null, pix_tipo: null, pix_chave: null, whatsapp: null, logo_url: null, icone: null },
  ];
  // Uma pessoa COM comissão de tráfego: é o que faz a coluna extra (e o bloco
  // da ficha) entrarem na medição de largura em 320px.
  const comissoes = {
    e3: { id: "g1", nome: "Gestor de tráfego · Marina", pessoaId: "e3", pctFaturamento: 0.8, pctEficiencia: 30, valor: 4312.75, periodo: "Este mês" },
  };
  // Lançamentos do mês na pessoa p1: é o que faz o bloco "Este mês" entrar na
  // medição de 320px — com crédito E desconto, que é onde o líquido aparece.
  const lancamentos = [
    { id: "l1", empresa_id: EMPRESA, colaborador_id: "p1", competencia: "2026-08-01", tipo: "bonus" as const, descricao: "Meta de agosto batida", quantidade: null, valor: 400 },
    { id: "l2", empresa_id: EMPRESA, colaborador_id: "p1", competencia: "2026-08-01", tipo: "horas_extras" as const, descricao: null, quantidade: 8, valor: 192 },
    { id: "l3", empresa_id: EMPRESA, colaborador_id: "p1", competencia: "2026-08-01", tipo: "mercadinho" as const, descricao: "Compras do mês no mercadinho da empresa, fechamento do dia 28", quantidade: null, valor: 137.4 },
    { id: "l4", empresa_id: EMPRESA, colaborador_id: "p1", competencia: "2026-08-01", tipo: "adiantamento" as const, descricao: null, quantidade: null, valor: 500 },
    // Um bônus que REPETE (origem) e a cópia dele: os dois selos entram na medição.
    { id: "l5", empresa_id: EMPRESA, colaborador_id: "p1", competencia: "2026-08-01", tipo: "bonus" as const, descricao: "Ajuda de custo combinada", quantidade: null, valor: 150, recorrente: true },
    { id: "l6", empresa_id: EMPRESA, colaborador_id: "p1", competencia: "2026-08-01", tipo: "bonus" as const, descricao: "Ajuda de custo combinada", quantidade: null, valor: 150, origem_id: "l0" },
  ];
  return (
    <ColaboradoresClient
      empresaId={EMPRESA}
      lista={lista}
      contas={[{ id: "c1", nome: "Itaú — conta corrente" }, { id: "c2", nome: "Inter" }]}
      lancamentos={lancamentos}
      mesAberto="2026-08-01"
      pessoasDoSistema={[{ id: "e3", nome: "Marina Alves" }, { id: "e9", nome: "Nome bem comprido de alguém do sistema" }]}
      comissoes={comissoes}
      // A mesma pessoa com comissão de VENDAS (planilha) e de MARKETPLACE: a
      // regrinha nasce com três interruptores e três sugestões.
      comissoesVendas={{ e3: 612.5 }}
      comissaoMarketplace={{ pessoaId: "e3", valor: 50.71 }}
      // A linha do mês de Marina existe (é o que faz a regrinha abrir): agosto,
      // que por padrão é MANUAL — os interruptores nascem desligados.
      folhaInicial={[{
        id: "f3", colaborador_id: "p3", competencia: "2026-08-01", salario: 6500, bonus: 0, comissao: 0,
        comissao_vendas: 0, comissao_trafego: 0, comissao_marketplace: 0, comissao_outros: 0,
        gratificacao: 800, beneficios: 900, convenio_farmacia: 0, mercadinho: 0, vale: 0, faltas: [],
        pago: false, pago_em: null, auto_vendas: null, auto_trafego: null, auto_marketplace: null,
      }]}
      podeGerarFolha
      schemaPendente={false}
      lancamentosPendentes={false}
    />
  );
}


// ── As quatro telas que faltavam para eu conseguir medir tudo ────────────────
// Os dados exercitam o caso DIFÍCIL, não o fácil: descrição longa sem espaço
// (estoura 320px), valor de seis dígitos, um status de cada cor, lista vazia e
// o estado que cada tela trata de forma especial.

const LONGA = "Licença EnterpriseResourcePlanningPlatform-Renovacao2026";

export function ProvaFinanceiroCompras() {
  const compras: Compra[] = [
    { id: "cp1", empresa_id: EMPRESA, fornecedor_id: "f1", descricao: "MDF 3mm", data: "2026-08-13", categoria: "materia_prima", valor_total: 4500, plano: "prazo", parcelas: 1, prazo_dias: 30, primeiro_vencimento: "2026-09-12", forma_pagamento: "Boleto", conta_id: "c1", status: "recebida", gera_patrimonio: false, observacao: null },
    { id: "cp2", empresa_id: EMPRESA, fornecedor_id: null, descricao: "Empilhadeira elétrica", data: "2026-08-12", categoria: "patrimonio", valor_total: 128900, plano: "parcelado", parcelas: 12, prazo_dias: null, primeiro_vencimento: "2026-09-12", forma_pagamento: "Cartão", conta_id: "c4", status: "confirmada", gera_patrimonio: true, observacao: null },
    { id: "cp3", empresa_id: EMPRESA, fornecedor_id: "f2", descricao: LONGA, data: "2026-08-10", categoria: "outros", valor_total: 1499.9, plano: "a_vista", parcelas: 1, prazo_dias: null, primeiro_vencimento: null, forma_pagamento: "PIX", conta_id: "c2", status: "rascunho", gera_patrimonio: false, observacao: null },
    { id: "cp4", empresa_id: EMPRESA, fornecedor_id: "f2", descricao: "Caixas de envio", data: "2026-08-05", categoria: "embalagem", valor_total: 2300, plano: "parcelado", parcelas: 2, prazo_dias: null, primeiro_vencimento: "2026-09-05", forma_pagamento: "Boleto", conta_id: "c1", status: "cancelada", gera_patrimonio: false, observacao: null },
  ];
  const parcelas: Compromisso[] = [
    base({ id: "pa1", descricao: "MDF 3mm", valor: 4500, vencimento: "2026-09-12", origem: "compra", origem_id: "cp1", parcela_numero: 1, parcela_total: 1 }),
    base({ id: "pa2", descricao: "Empilhadeira elétrica (1/12)", valor: 10741.67, vencimento: "2026-09-12", origem: "compra", origem_id: "cp2", parcela_numero: 1, parcela_total: 12 }),
  ];
  return (
    <ComprasClient
      empresaId={EMPRESA} empresaNome="Tridi" podeCriar
      compras={compras} parcelas={parcelas} fornecedores={FORNECEDORES} contas={CONTAS}
      hoje={HOJE} abrirNovo={false} schemaPendente={false}
    />
  );
}

export function ProvaFinanceiroNotas() {
  const notas: Nota[] = [
    { id: "n1", empresa_id: EMPRESA, tipo: "emitida", numero: "1256", serie: "1", parceiro_nome: "Cliente XPTO", fornecedor_id: null, compra_id: null, chave_acesso: "35260812345678000190550010000012561000012569", emissao: "2026-08-12", valor: 6750, categoria: "servicos", status: "autorizada" },
    // Nota de COMPRA sem vínculo: é ela que faz nascer o botão "criar compra".
    { id: "n2", empresa_id: EMPRESA, tipo: "compra", numero: "1255", serie: "1", parceiro_nome: "Madeireira X", fornecedor_id: "f1", compra_id: null, chave_acesso: null, emissao: "2026-08-11", valor: 4850, categoria: "materia_prima", status: "autorizada" },
    { id: "n3", empresa_id: EMPRESA, tipo: "compra", numero: "1253", serie: "1", parceiro_nome: "Embalagens ABC", fornecedor_id: "f2", compra_id: "cp4", chave_acesso: null, emissao: "2026-08-09", valor: 2300, categoria: "embalagem", status: "autorizada" },
    { id: "n4", empresa_id: EMPRESA, tipo: "emitida", numero: "1252", serie: "1", parceiro_nome: "Cliente Atlas", fornecedor_id: null, compra_id: null, chave_acesso: null, emissao: "2026-08-08", valor: 9450, categoria: null, status: "cancelada" },
    { id: "n5", empresa_id: EMPRESA, tipo: "compra", numero: null, serie: null, parceiro_nome: LONGA, fornecedor_id: null, compra_id: null, chave_acesso: null, emissao: "2026-08-07", valor: 128900, categoria: null, status: "pendente" },
  ];
  return (
    <NotasClient
      empresaId={EMPRESA} empresaNome="Tridi" podeLancar podeComprar schemaPendente={false}
      notas={notas}
      compras={[{ id: "cp4", descricao: "Caixas de envio", data: "2026-08-05", valor_total: 2300, status: "cancelada" }]}
      fornecedores={FORNECEDORES.map((f) => ({ id: f.id, nome: f.nome }))}
    />
  );
}

export function ProvaFinanceiroPatrimonio() {
  const itens: Patrimonio[] = [
    { id: "b1", empresa_id: EMPRESA, codigo: "PAT-001", descricao: "Impressora multifuncional HP", categoria: "equipamentos", local: "Administrativo", responsavel_id: "p1", fornecedor_id: "f1", compra_id: null, nota_id: null, valor: 2450, aquisicao: "2025-03-10", garantia_ate: "2026-09-01", status: "em_uso" },
    { id: "b2", empresa_id: EMPRESA, codigo: "PAT-002", descricao: LONGA, categoria: "computadores", local: null, responsavel_id: null, fornecedor_id: null, compra_id: null, nota_id: null, valor: 128900, aquisicao: "2026-08-12", garantia_ate: null, status: "estoque" },
    { id: "b3", empresa_id: EMPRESA, codigo: "PAT-003", descricao: "Ar condicionado split", categoria: "equipamentos", local: "Marketing", responsavel_id: null, fornecedor_id: null, compra_id: null, nota_id: null, valor: 2980, aquisicao: "2024-11-02", garantia_ate: "2025-11-02", status: "manutencao" },
    { id: "b4", empresa_id: EMPRESA, codigo: "PAT-004", descricao: "Notebook antigo", categoria: "computadores", local: "Diretoria", responsavel_id: "p2", fornecedor_id: null, compra_id: null, nota_id: null, valor: 3200, aquisicao: "2021-05-01", garantia_ate: null, status: "baixado" },
    { id: "b5", empresa_id: EMPRESA, codigo: "PAT-005", descricao: "Empilhadeira elétrica", categoria: "maquinas", local: "Produção", responsavel_id: "p1", fornecedor_id: null, compra_id: "cp2", nota_id: null, valor: 18900, aquisicao: "2026-08-12", garantia_ate: "2028-08-12", status: "vendido" },
  ];
  return (
    <PatrimonioClient
      empresaId={EMPRESA} empresaNome="Tridi" itens={itens}
      fornecedores={FORNECEDORES.map((f) => ({ id: f.id, nome: f.nome }))}
      compras={[{ id: "cp2", descricao: "Empilhadeira elétrica", data: "2026-08-12", valor_total: 128900, fornecedor_id: null }]}
      responsaveis={[{ id: "p1", nome: "Douglas Ferreira" }, { id: "p2", nome: "Amanda Rocha" }]}
      codigoSugerido="PAT-006" hoje={HOJE} podeCadastrar
    />
  );
}

export function ProvaFinanceiroFornecedores() {
  const lista: Fornecedor[] = [
    { id: "f1", empresa_id: EMPRESA, nome: "Madeireira X", cnpj: "11.111.111/0001-11", categoria: "materia_prima", contato_nome: "João", contato_email: "joao@madeireira.com.br", contato_fone: "(11) 99999-0000", prazo_dias: 30, forma_pagamento: "Boleto", ativo: true, categorias: [], prazo_envio_dias: null, pix_tipo: null, pix_chave: null, banco: null, agencia: null, conta_numero: null, aceita_boleto: false, inscricao_estadual: null, site: null, whatsapp: null, cidade: null, uf: null, endereco: null, observacao: null },
    { id: "f2", empresa_id: EMPRESA, nome: "Embalagens ABC", cnpj: null, categoria: "embalagem", contato_nome: null, contato_email: null, contato_fone: null, prazo_dias: 15, forma_pagamento: "PIX", ativo: true, categorias: [], prazo_envio_dias: null, pix_tipo: null, pix_chave: null, banco: null, agencia: null, conta_numero: null, aceita_boleto: false, inscricao_estadual: null, site: null, whatsapp: null, cidade: null, uf: null, endereco: null, observacao: null },
    { id: "f3", empresa_id: EMPRESA, nome: LONGA, cnpj: "22.222.222/0001-22", categoria: "servicos", contato_nome: null, contato_email: null, contato_fone: null, prazo_dias: null, forma_pagamento: null, ativo: true, categorias: [], prazo_envio_dias: null, pix_tipo: null, pix_chave: null, banco: null, agencia: null, conta_numero: null, aceita_boleto: false, inscricao_estadual: null, site: null, whatsapp: null, cidade: null, uf: null, endereco: null, observacao: null },
    { id: "f4", empresa_id: EMPRESA, nome: "Fornecedor desativado", cnpj: null, categoria: "outros", contato_nome: null, contato_email: null, contato_fone: null, prazo_dias: 45, forma_pagamento: "Cartão", ativo: false, categorias: [], prazo_envio_dias: null, pix_tipo: null, pix_chave: null, banco: null, agencia: null, conta_numero: null, aceita_boleto: false, inscricao_estadual: null, site: null, whatsapp: null, cidade: null, uf: null, endereco: null, observacao: null },
  ];
  // `f1` com logo apontando pra um caminho que não existe: é o estado que
  // precisa de olho — imagem quebrada não pode virar ícone partido do
  // navegador, tem que cair no ícone de reserva por baixo.
  return (
    <FornecedoresClient
      empresaId={EMPRESA} empresaNome="Tridi" podeEscrever lista={lista}
      logos={{ f1: "/logo-que-nao-existe.png" }}
      schemaPendente={false}
    />
  );
}

/** Gente que se chama, não gente de quem se compra — sem CNPJ, sem prazo. */
export function ProvaFinanceiroContatos() {
  const lista: Contato[] = [
    { id: "k1", empresa_id: EMPRESA, nome: "Seu Zé", categoria: "Encanador", categorias: ["Encanador", "Hidráulica"], telefone: "(11) 98888-1111", telefones: ["(11) 98888-1111", "(11) 3222-0000"], email: null, endereco: null, tipo: "prestador", cargo: "Encanador", organizacao: null, site: null, observacao: null, ativo: true, natureza: "pessoa" as const, organizacao_id: null },
    { id: "k2", empresa_id: EMPRESA, nome: "Elétrica Rápida", categoria: "Eletricista", categorias: ["Eletricista"], telefone: "(11) 97777-2222", telefones: ["(11) 97777-2222"], email: "contato@eletricarapida.com.br", endereco: "Rua das Flores, 123", tipo: "prestador", cargo: "Responsável técnico", organizacao: "Elétrica Rápida ME", site: "eletricarapida.com.br", observacao: "Atende fim de semana", ativo: true, natureza: "pessoa" as const, organizacao_id: null },
    { id: "k3", empresa_id: EMPRESA, nome: LONGA, categoria: "Chaveiro", categorias: ["Chaveiro"], telefone: null, telefones: [], email: null, endereco: null, tipo: "outro", cargo: null, organizacao: null, site: null, observacao: null, ativo: true, natureza: "pessoa" as const, organizacao_id: null },
    { id: "k4", empresa_id: EMPRESA, nome: "Contato desativado", categoria: null, categorias: [], telefone: null, telefones: [], email: null, endereco: null, tipo: null, cargo: null, organizacao: null, site: null, observacao: null, ativo: false, natureza: "pessoa" as const, organizacao_id: null },
  ];
  return (
    <ContatosClient
      empresaId={EMPRESA} empresaNome="Tridi" podeEscrever lista={lista}
      logos={{}}
      schemaPendente={false}
    />
  );
}

/** Uma SEM logo (Tridi, no ícone) e uma COM (Gedux — o link é falso de
 *  propósito, então a imagem quebra; é o estado que precisa de olho: quebrar
 *  não pode derrubar o quadradinho, tem que sobrar o ícone por baixo). */
export function ProvaFinanceiroConfiguracoes() {
  const empresas: Empresa[] = [
    { id: "e1", slug: "tridi", nome: "Tridi", razao_social: "Tridi Comércio Ltda", cnpj: "12345678000190", cor: "var(--cat-1)", icone: "building-warehouse", ordem: 1, ativa: true, logo_url: null },
    { id: "e2", slug: "gedux", nome: "Gedux", razao_social: null, cnpj: null, cor: "var(--cat-3)", icone: "world", ordem: 2, ativa: true, logo_url: "logos/empresa/e2/fake.png" },
    { id: "e3", slug: "antiga", nome: "Empresa antiga (fora de circulação)", razao_social: null, cnpj: null, cor: "var(--neutro)", icone: null, ordem: 3, ativa: false, logo_url: null },
  ];
  return (
    <ConfiguracoesClient
      empresas={empresas}
      logos={{ e2: "/nao-existe-de-verdade.png" }}
      // A galeria com os cinco grupos e o caso difícil: nome comprido sem
      // espaço, que é o que estoura a coluna de 320px.
      galeria={[
        { tipo: "empresa", titulo: "Empresas", icone: "building-warehouse", itens: empresas.map((e) => ({ id: e.id, nome: e.nome, logo: null, icone: e.icone ?? null, cor: e.cor ?? null })) },
        { tipo: "conta", titulo: "Bancos e cartões", icone: "wallet", itens: [
          { id: "c1", nome: "Itaú — conta corrente", logo: null, icone: "building-bank", cor: null },
          { id: "c2", nome: "MercadoPagoCarteiraDigitalSemEspaco", logo: null, icone: null, cor: "var(--cat-2)" },
        ] },
        { tipo: "fornecedor", titulo: "Fornecedores", icone: "truck", itens: [
          { id: "f1", nome: "Madeireira X", logo: null, icone: "truck", cor: null },
        ] },
        { tipo: "colaborador", titulo: "Pessoas da folha", icone: "users", itens: [
          { id: "p1", nome: "Douglas Ferreira", logo: null, icone: null, cor: null },
        ] },
      ]}
      geral={false}
      // O catálogo de categorias, com um nome comprido: é o chip que precisa
      // quebrar linha em vez de estourar os 320px.
      categorias={[
        { id: "k1", empresa_id: EMPRESA, escopo: "fornecedor", nome: "Matéria Prima" },
        { id: "k2", empresa_id: EMPRESA, escopo: "fornecedor", nome: "Peças" },
        { id: "k3", empresa_id: EMPRESA, escopo: "fornecedor", nome: "Embalagens especiais importadas sob encomenda" },
        { id: "k4", empresa_id: EMPRESA, escopo: "contato", nome: "Encanador" },
      ]}
      empresaId={EMPRESA}
      podeCategorias
      configs={{ [EMPRESA]: { patrimonio_prefixo: "PAT", alerta_dias: 7, formas_pagamento: ["PIX", "Boleto", "Cartão"], folha_dia_padrao: 5 } }}
      acessos={[
        { id: "u1", nome: "Caio Silva", username: "caio", subs: ["Ver o financeiro", "Contas a pagar", "Folha"], superusuario: true, empresas: [] },
        { id: "u2", nome: "Douglas Ferreira", username: "douglas", subs: ["Ver o financeiro", "Compras"], superusuario: false, empresas: ["TridiXP"] },
      ]}
      schemaPendente={false}
    />
  );
}

export function ProvaFinanceiroAuditoria() {
  return (
    <AuditoriaClient
      empresaNome="Tridi"
      linhas={AUDITORIA}
      podeVerFolha={false}
      schemaPendente={false}
    />
  );
}

export function ProvaFinanceiro() {
  return (
    <CompromissosClient
      empresaId={EMPRESA}
      empresaNome="Tridi"
      hoje={HOJE}
      de="2026-08-01"
      ate="2026-08-31"
      linhas={LINHAS}
      contas={CONTAS}
      fornecedores={FORNECEDORES}
      poderes={PODERES}
      schemaPendente={false}
    />
  );
}


/**
 * A tela em "VISÃO GERAL": sem empresa escolhida, o formulário pergunta.
 *
 * É a prova do defeito que fez o módulo parecer quebrado: a primeira versão
 * ESCONDIA o botão de criar nesse modo. Agora o botão está lá e o seletor de
 * empresa aparece no topo do formulário.
 */
export function ProvaFinanceiroGeral() {
  const lista: Fornecedor[] = [
    { id: "f1", empresa_id: EMPRESA, nome: "Madeireira X", cnpj: "11111111000111", categoria: "materia_prima", contato_nome: "João", contato_email: null, contato_fone: null, prazo_dias: 30, forma_pagamento: "Boleto", ativo: true, categorias: ["materia_prima"], prazo_envio_dias: 7, pix_tipo: null, pix_chave: null, banco: null, agencia: null, conta_numero: null, aceita_boleto: true, inscricao_estadual: null, site: null, whatsapp: null, cidade: "Bauru", uf: "SP", endereco: null, observacao: null },
  ];
  return (
    <FornecedoresClient
      empresaId=""
      empresaNome="Visão geral"
      empresas={[{ id: EMPRESA, nome: "TridiXP" }, { id: "emp-gedux", nome: "Gedux" }]}
      podeEscrever
      lista={lista}
      logos={{}}
      schemaPendente={false}
    />
  );
}
