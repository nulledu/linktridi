import { requireModuleKeys } from "@/lib/require-auth";
import { meuNivel } from "@/lib/perfis";
import { listComercial, produtosMaisVendidos, listLeads } from "@/lib/comercial";
import { listProdutosEstoque } from "@/lib/estoque";
import { ComercialClient } from "./ComercialClient";

export const dynamic = "force-dynamic";

export default async function ComercialPage() {
  const { profile: me, keys } = await requireModuleKeys("comercial");
  const perms = {
    pedidos: keys.includes("comercial:pedidos"),
    historico: keys.includes("comercial:historico"),
    carteira: keys.includes("comercial:carteira"),
    leads: keys.includes("comercial:leads"),
  };
  // Lançar pedido é a chave que define a equipe do comercial (ver
  // `podeLancarPedido` em lib/comercial-pedidos.ts). Gestão sempre pode.
  const canLancar = me.role === "admin" || me.role === "gerente_vendas" || keys.includes("comercial:lancar");
  // Integração de marketplace mudou de lugar (era aba da Administração), NÃO de
  // dono: a chave continua sendo a mesma da grade.
  const canCanais = keys.includes("administracao:marketplaces");
  // Acesso por departamento: Marketing E Comercial veem o painel completo.
  // Marketing X1 é EXCLUSIVO do Marketing (+ admin/gerente de vendas).
  const { departamento, erpUserId } = await meuNivel(me);
  const gestao = me.role === "admin" || me.role === "gerente_vendas";
  const isMarketing = departamento === "Marketing";
  const isComercial = departamento === "Comercial";
  // A GRADE manda: quem recebeu Pedidos, Histórico ou Leads vê o painel, mesmo
  // sendo "colaborador" e de outro departamento. Antes só papel e departamento
  // decidiam — o admin ligava as sub-permissões, salvava, e a pessoa continuava
  // vendo só a carteira pessoal: permissão ligada, acesso barrado.
  const canDash = perms.pedidos || perms.historico || perms.leads || gestao || isMarketing || isComercial;
  const canX1 = gestao || isMarketing || keys.includes("marketing");
  // Vendedor (não-dash) fica travado nos próprios dados via erp_user_id — que
  // pega carona na linha de `employees` que o meuNivel já leu, em vez de pagar
  // uma ida inteira ao banco só por esta coluna (era a ida que segurava toda a
  // onda de pedidos/produtos/leads abaixo).
  const meErpId: string | null = erpUserId;
  // Só o essencial p/ render inicial (pedidos do vendedor + autocomplete do form).
  // O gasto de Meta (lento) era usado num prop que o client NÃO consome → removido.
  const [pedidos, produtos, leads] = await Promise.all([
    listComercial(),
    listProdutosEstoque().catch(() => []),
    listLeads(),
  ]);
  const maisVendidos = await produtosMaisVendidos(pedidos).catch(() => [] as string[]);

  return (
    <ComercialClient
      initial={pedidos}
      leads={leads}
      produtos={produtos.map((p) => p.nome)}
      maisVendidos={maisVendidos}
      canDash={canDash}
      canX1={canX1}
      canLancar={canLancar}
      canCanais={canCanais}
      perms={perms}
      meErpId={meErpId}
      meNome={me.name}
    />
  );
}
