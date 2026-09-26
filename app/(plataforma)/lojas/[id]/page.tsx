import { notFound } from "next/navigation";
import { requireModule } from "@/lib/require-auth";
import { fonteLoja, fontePedidos, fonteProdutos } from "@/lib/lojas-fonte";
import { hojeISO } from "@/lib/financeiro/calculos";
import type { Pedido, Produto } from "@/lib/lojas";
import { AvisoDemo } from "../AvisoDemo";
import { InicioClient, type ResumoInicio } from "./InicioClient";
import "./inicio.css";

// Início da loja: o resumo que responde "como está indo" em três segundos.
//
// A tela é de SERVIDOR e as contas moram aqui, não no navegador. Não é
// preferência: mandar o histórico de pedidos inteiro pro cliente pra ele somar
// é pagar egress por uma conta que o servidor faz de graça — e a conta do
// Supabase é cobrada no trecho Supabase → app.
//
// Nada aqui atualiza sozinho, então não há poll nenhum pra recuar (ver a regra
// de orçamento de execução no CLAUDE.md).
export default async function LojaInicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // O perfil já foi resolvido no layout e está em cache por cookie — aqui é
  // acerto de cache, não uma ida nova ao banco (ver a trava de idas do
  // financeiro).
  const [profile, { dados: loja }] = await Promise.all([requireModule("lojas"), fonteLoja(id)]);
  if (!loja) notFound();

  // As listas em PARALELO: em fila, a tela esperaria uma ida ao banco depois da
  // outra pra desenhar quatro números.
  const [{ dados: produtos, demo }, { dados: pedidos }] = await Promise.all([
    fonteProdutos(id),
    fontePedidos(id),
  ]);

  return (
    <>
      {demo && <AvisoDemo />}
      <InicioClient base="/lojas" id={id} pessoa={profile.name} resumo={montarResumo(pedidos, produtos, loja.dominio)} />
    </>
  );
}

// ── As contas ────────────────────────────────────────────────────────────────

const DIA = 86_400_000;

/** "Bom dia" até 12h, "Boa tarde" até 18h, "Boa noite" depois. */
function saudacaoDe(hora: number): string {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

const soma = (lista: Pedido[]) => lista.reduce((s, p) => s + p.total, 0);

/**
 * Monta tudo que o painel desenha, a partir das duas listas.
 *
 * Exportada pra ser testada sem montar tela: as contas de faturamento são o
 * tipo de coisa que ninguém confere olhando, e um período deslocado por um dia
 * faz o painel mentir sem parecer quebrado.
 */
export function montarResumo(pedidos: Pedido[], produtos: Produto[], dominio: string | null): ResumoInicio {
  // O dia é o de São Paulo. Com `new Date()` cru, às 21h o servidor já está em
  // UTC do dia seguinte e o painel mostra "hoje" com as vendas de amanhã.
  const hoje = new Date(`${hojeISO()}T12:00:00Z`).getTime();
  const inicioAtual = hoje - 6 * DIA;
  const inicioAntes = hoje - 13 * DIA;

  const dia = (p: Pedido) => new Date(`${p.feitoEm.slice(0, 10)}T12:00:00Z`).getTime();
  const pagos = pedidos.filter((p) => p.pagamento === "pago");
  const atuais = pagos.filter((p) => dia(p) >= inicioAtual && dia(p) <= hoje);
  const anteriores = pagos.filter((p) => dia(p) >= inicioAntes && dia(p) < inicioAtual);

  const serieDe = (lista: Pedido[], comeco: number) =>
    Array.from({ length: 7 }, (_, k) => {
      const d = comeco + k * DIA;
      const iso = new Date(d).toISOString().slice(0, 10);
      return {
        rotulo: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
        valor: soma(lista.filter((p) => dia(p) === d)),
      };
    });

  // Categoria em vez de "canal": todo pedido daqui entra pela vitrine, então um
  // gráfico de canais teria uma fatia só. Categoria é a mesma pergunta ("de
  // onde vem o dinheiro") respondida com dado que existe.
  const porProduto = new Map<string, { unidades: number; receita: number }>();
  for (const p of atuais) {
    for (const i of p.itens) {
      const atual = porProduto.get(i.produtoId) ?? { unidades: 0, receita: 0 };
      atual.unidades += i.quantidade;
      atual.receita += i.precoUnitario * i.quantidade;
      porProduto.set(i.produtoId, atual);
    }
  }

  const porCategoria = new Map<string, number>();
  for (const [produtoId, v] of porProduto) {
    const cat = produtos.find((p) => p.id === produtoId)?.categorias[0] ?? "Sem categoria";
    porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + v.receita);
  }

  const maisVendidos = [...porProduto]
    .map(([produtoId, v]) => ({ produto: produtos.find((p) => p.id === produtoId), ...v }))
    .filter((x): x is { produto: Produto; unidades: number; receita: number } => !!x.produto)
    .sort((a, b) => b.unidades - a.unidades)
    .slice(0, 5);

  const semFoto = produtos.filter((p) => p.status === "ativo" && p.imagens.length === 0).length;
  const semDescricao = produtos.filter((p) => p.status === "ativo" && !p.descricao.trim()).length;

  return {
    saudacao: saudacaoDe(new Date().getHours()),
    periodo: `Últimos 7 dias`,
    vendas: { hoje: soma(atuais), antes: soma(anteriores) },
    pedidos: { hoje: atuais.length, antes: anteriores.length },
    ticket: {
      hoje: atuais.length ? soma(atuais) / atuais.length : 0,
      antes: anteriores.length ? soma(anteriores) / anteriores.length : 0,
    },
    aEnviar: pedidos.filter((p) => p.envio === "nao_enviado" || p.envio === "preparando").length,
    serie: serieDe(atuais, inicioAtual),
    serieAntes: serieDe(anteriores, inicioAntes),
    porCategoria: [...porCategoria]
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5),
    maisVendidos,
    recentes: [...pedidos].sort((a, b) => b.feitoEm.localeCompare(a.feitoEm)).slice(0, 5),
    // Tarefa é o que ESTÁ faltando, deduzido do catálogo — não uma lista fixa
    // que já nasce marcada e ninguém lê.
    tarefas: [
      { texto: "Cadastrar o primeiro produto", feito: produtos.length > 0, href: "produtos/novo" },
      { texto: semFoto ? `Adicionar foto em ${semFoto} produto(s)` : "Todo produto ativo tem foto", feito: semFoto === 0 },
      { texto: semDescricao ? `Escrever a descrição de ${semDescricao} produto(s)` : "Todo produto ativo tem descrição", feito: semDescricao === 0 },
      { texto: dominio ? `Domínio ${dominio} conectado` : "Conectar um domínio próprio", feito: !!dominio },
    ],
  };
}
