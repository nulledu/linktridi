import { redirect } from "next/navigation";
import { semPermissaoDoFinanceiro } from "@/lib/financeiro/gate";
import { contextoFinanceiro } from "../contexto";
import { colaboradores, contas, partes, recorrencias } from "@/lib/financeiro/db";
import { AvisoSchema, Cabecalho, Cartao, LinhaKpi, TituloCartao, Vazio, FaixaDePaineis } from "../ui";
import { KpiSeta } from "../blocos";
import { BlocosDaDireita } from "./BlocosDaDireita";
import { CardArea } from "./CardArea";

export const dynamic = "force-dynamic";

/**
 * A porta dos Cadastros.
 *
 * Existe porque "Cadastros" na barra lateral só ABRIA o submenu: quem clicava
 * no item pai não ia a lugar nenhum, e a leitura disso é que o link está
 * quebrado. Agora ele leva a uma tela que diz o que há dentro de cada área e
 * quantos itens tem — que é a pergunta de quem clicou ali.
 */
export default async function FinanceiroCadastrosPage() {
  const { empresa, poderes, pendente, escopo, geral } = await contextoFinanceiro("ver");
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
        <Cabecalho titulo="Cadastros" sub="Tudo que alimenta compras, compromissos e recorrências." />
        {pendente ? <AvisoSchema /> : (
          <Cartao><Vazio icone="folder" titulo="Nenhuma empresa liberada para você" /></Cartao>
        )}
      </>
    );
  }

  const [fRec, fContas, fPartes, fColab] = await Promise.all([
    recorrencias(escopo, { limite: 300 }),
    contas(escopo, { todas: true }),
    partes(escopo, { todos: true, limite: 500 }),
    // A contagem de pessoas aparece para quem tem `ver`; a LISTA, com nome e
    // salário, é `financeiro:folha`. Por isso só o número atravessa quando a
    // permissão falta — e ele vem de uma consulta que nunca carrega salário.
    poderes.folha ? colaboradores(escopo, { limite: 500 }) : Promise.resolve({ dados: [], pendente: false }),
  ]);

  const schemaPendente = pendente || fRec.pendente || fContas.pendente || fPartes.pendente;
  const porPapel = (papel: "contato" | "fornecedor") => fPartes.dados.filter((parte) => parte.papeis.includes(papel)).length;
  const totalContatos = fPartes.dados.length;
  const totalFornecedores = porPapel("fornecedor");

  const AREAS = [
    {
      href: "/financeiro/cadastros/recorrencias", icone: "refresh", cor: "var(--roxo)",
      titulo: "Recorrências", quantidade: fRec.dados.length,
      descricao: "Cadastre despesas recorrentes para gerar compromissos automaticamente.",
    },
    {
      href: "/financeiro/cadastros/contas", icone: "building-warehouse", cor: "var(--ok)",
      titulo: "Bancos e Gateways", quantidade: fContas.dados.length,
      descricao: "Gerencie contas bancárias, cartões e meios de recebimento.",
    },
    {
      href: "/financeiro/cadastros/contatos", icone: "users", cor: "var(--azul)",
      titulo: "Contatos e empresas", quantidade: totalContatos,
      descricao: `${porPapel("contato")} contatos · ${totalFornecedores} fornecedores — uma identidade, vários papéis.`,
    },
    ...(poderes.folha
      ? [{
          href: "/financeiro/cadastros/colaboradores", icone: "users", cor: "var(--atencao)",
          titulo: "Colaboradores", quantidade: fColab.dados.length,
          descricao: "Organize pessoas, setores e dados usados no financeiro.",
        }]
      : []),
  ];

  const maior = Math.max(...AREAS.map((a) => a.quantidade), 1);

  // "Últimos cadastros" junta as quatro áreas numa linha do tempo só. Sem
  // `created_at` na consulta enxuta, a ordem é a que o banco devolve por nome —
  // então a tabela não promete recência: ela mostra o que existe.
  const ultimos = [
    ...fRec.dados.slice(0, 4).map((r) => ({ id: `r-${r.id}`, nome: r.descricao, tipo: "Recorrência", cor: "var(--roxo)", quando: r.inicio })),
    ...fContas.dados.slice(0, 3).map((c) => ({ id: `c-${c.id}`, nome: c.nome, tipo: "Conta", cor: "var(--ok)", quando: null as string | null })),
    ...fPartes.dados.slice(0, 4).map((parte) => ({
      id: `p-${parte.id}`, nome: parte.nome,
      tipo: parte.papeis.includes("fornecedor") ? "Fornecedor" : "Contato",
      cor: parte.papeis.includes("fornecedor") ? "var(--azul)" : "var(--rosa)", quando: null as string | null,
    })),
  ].slice(0, 8);

  return (
    <>
      <Cabecalho titulo="Cadastros" sub="Tudo que alimenta compras, compromissos e recorrências." />

      {schemaPendente && <AvisoSchema />}

      <LinhaKpi>
        <KpiSeta
          icone="refresh" rotulo="Recorrências" valor={String(fRec.dados.length)} detalhe="cadastradas"
          href="/financeiro/cadastros/recorrencias" tituloDaSeta="Abrir recorrências"
        />
        <KpiSeta
          icone="building-warehouse" rotulo="Bancos e Gateways" valor={String(fContas.dados.length)} tom="ok" detalhe="cadastrados"
          href="/financeiro/cadastros/contas" tituloDaSeta="Abrir bancos e gateways"
        />
        <KpiSeta
          icone="users" rotulo="Contatos e empresas" valor={String(totalContatos)}
          detalhe={`${porPapel("contato")} contatos · ${totalFornecedores} fornecedores`}
          href="/financeiro/cadastros/contatos" tituloDaSeta="Abrir contatos"
        />
        {poderes.folha && (
          <KpiSeta
            icone="users" rotulo="Colaboradores" valor={String(fColab.dados.length)} tom="atencao" detalhe="cadastrados"
            href="/financeiro/cadastros/colaboradores" tituloDaSeta="Abrir colaboradores"
          />
        )}
      </LinhaKpi>

      {/* Os painéis em CIMA, na horizontal: a lista fica com a largura toda
          e, em Visão geral, vira uma coluna por empresa. */}
      <FaixaDePaineis>
        {/* Só DADOS atravessam: função não passa da fronteira
            servidor→cliente. Ver o cabeçalho de BlocosDaDireita.tsx. */}
        <BlocosDaDireita
          fatias={AREAS.map((a) => ({
            id: a.href, label: a.titulo, cor: a.cor,
            valor: a.quantidade, proporcao: a.quantidade / maior,
          }))}
          ultimos={ultimos}
        />
      </FaixaDePaineis>

        <Cartao>
          <TituloCartao icone="folder">Áreas de cadastro</TituloCartao>
          <div
            style={{
              display: "grid", gap: 14,
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
            }}
          >
            {AREAS.map((a) => <CardArea key={a.href} {...a} />)}
          </div>
        </Cartao>


    </>
  );
}
