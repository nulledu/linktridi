import { redirect } from "next/navigation";
import { semPermissaoDoFinanceiro } from "@/lib/financeiro/gate";
import { contextoFinanceiro } from "../contexto";
import { categorias, colaboradores, contas, listarEmpresas, partes, recorrencias } from "@/lib/financeiro/db";
import { assinarLogos, type TipoDeMarca } from "@/lib/financeiro/anexos";
import { configDasEmpresas, configDaEmpresa } from "@/lib/financeiro/config";
import { quemTemAcesso } from "@/lib/financeiro/quem-tem-acesso";
import type { PapelContato, Recorrencia } from "@/lib/financeiro/tipos";
import { AvisoSchema, Cabecalho } from "../ui";
import { ConfiguracoesClient } from "./ConfiguracoesClient";

export const dynamic = "force-dynamic";

/**
 * A tela que só você (ou quem você libera de propósito) enxerga.
 *
 * `financeiro:config` é sub de área restrita — nunca vem do papel admin, nunca
 * vem do "acesso total", só entra concedida uma a uma por quem tem
 * `financeiro:acessos`. Cadastrar empresa é a raiz de tudo o que o módulo
 * separa: toda compra, conta e compromisso nasce presa a uma, e mexer nisso
 * merece ser tão fechado quanto pagar ou ver a folha.
 *
 * Lista TODAS as empresas — inclusive inativas — porque esta é a ÚNICA tela
 * onde "inativa" precisa aparecer: em todo o resto do módulo ela já some do
 * seletor (`empresasDoUsuario`), e reativar só é possível daqui.
 */
/**
 * O mínimo que uma coisa precisa ter para aparecer na galeria de fotos.
 *
 * Empresa, conta, fornecedor, contato e pessoa da folha são tipos diferentes —
 * o que a galeria usa das cinco é só isto. Um tipo comum aqui evita `as any` na
 * hora de juntá-las numa lista só.
 */
interface ComMarca {
  id: string; nome: string;
  logo_url?: string | null; icone?: string | null; cor?: string | null;
  papeis?: PapelContato[];
}

/** Fonte vazia, para o `Promise.all` não precisar de um `if` por linha. */
const vazio = () => Promise.resolve({ dados: [] as ComMarca[], pendente: false });

export default async function FinanceiroConfiguracoesPage() {
  // A lista de empresas NÃO depende de quem é a pessoa — então sai na frente,
  // junto com a resolução do contexto (que custa duas idas em sequência), em
  // vez de esperar por ela. Consumida logo abaixo.
  const empresasP = listarEmpresas({ todas: true });

  const { empresa, poderes, pendente, escopo, geral } = await contextoFinanceiro("config");
  if (!poderes.config) redirect(semPermissaoDoFinanceiro("config"));

  const { dados: empresas, pendente: semEmpresas } = await empresasP;

  // ── A GALERIA: tudo que tem foto, numa tela só ─────────────────────────────
  //
  // Estava espalhado — logo de empresa aqui, de conta na tela de contas, de
  // fornecedor no cadastro dele. Quem quer arrumar as imagens de uma vez tinha
  // que passar por cinco telas e lembrar de todas. Esta tela é a lista de tudo.
  //
  // Só lê quem PODE: as fotos de fornecedor/contato pedem `cadastros` e as de
  // pessoa pedem `folha`. Trazer a lista e esconder no React não adiantaria —
  // os nomes já teriam viajado até o navegador.
  //
  // As preferências e a lista de acesso entram na MESMA onda: dependem só das
  // empresas, que já chegaram, e antes esperavam a galeria inteira terminar
  // para só então pedir — uma ida de 250–700 ms paga à toa.
  const [fContas, fPartes, fPessoas, fRegras, fCatForn, fCatCont, configs, configPendente, acessos] = await Promise.all([
    escopo.length ? contas(escopo, { todas: true }) : vazio(),
    poderes.cadastros && escopo.length ? partes(escopo, { todos: true, limite: 400 }) : vazio(),
    poderes.folha && escopo.length ? colaboradores(escopo, { limite: 400 }) : vazio(),
    poderes.cadastros && escopo.length
      ? recorrencias(escopo, { limite: 300 })
      : Promise.resolve({ dados: [] as Recorrencia[], pendente: false }),
    poderes.cadastros && escopo.length ? categorias(escopo, "fornecedor") : Promise.resolve({ dados: [], pendente: false }),
    poderes.cadastros && escopo.length ? categorias(escopo, "contato") : Promise.resolve({ dados: [], pendente: false }),
    // Preferências de TODAS as empresas (a tela escolhe qual ajustar) e, para
    // quem governa o módulo, a lista de quem entra.
    configDasEmpresas(empresas.map((e) => e.id)),
    empresas[0] ? configDaEmpresa(empresas[0].id).then((c) => c.pendente) : Promise.resolve(false),
    poderes.acessos ? quemTemAcesso() : Promise.resolve(null),
  ]);

  const grupo = (tipo: TipoDeMarca, titulo: string, icone: string, itens: ComMarca[]) =>
    ({ tipo, titulo, icone, itens });

  const galeria = [
    grupo("empresa", "Empresas", "building-warehouse", empresas),
    grupo("conta", "Bancos e cartões", "wallet", fContas.dados),
    grupo("contato", "Contatos e empresas", "users", fPartes.dados),
    grupo("colaborador", "Pessoas da folha", "users", fPessoas.dados),
    grupo("recorrencia", "Recorrências", "refresh", fRegras.dados.map((r) => ({
      id: r.id, nome: r.descricao, logo_url: r.logo_url, icone: r.icone, cor: null,
    }))),
  ].filter((g) => g.itens.length > 0);

  // Um link assinado por imagem seria uma conexão por linha. Todos de uma vez —
  // e UMA vez: o logo da empresa também está na galeria, então assinar a lista
  // de empresas antes era uma ida inteira repetindo trabalho.
  const caminhos = [...galeria.flatMap((g) => g.itens.map((i) => i.logo_url ?? null)),
    ...empresas.map((e) => e.logo_url)];
  const assinados = await assinarLogos(caminhos);
  const logosDaGaleria = Object.fromEntries(
    galeria
      .flatMap((g) => g.itens)
      .map((i) => [i.id, i.logo_url ? assinados.get(i.logo_url) : null] as const)
      .filter((par): par is readonly [string, string] => !!par[1]),
  );
  const logosPorId = Object.fromEntries(
    empresas
      .map((e) => [e.id, e.logo_url ? assinados.get(e.logo_url) : null] as const)
      .filter((par): par is readonly [string, string] => !!par[1]),
  );

  const schemaPendente = pendente || semEmpresas;

  if (schemaPendente && !empresas.length) {
    return (
      <>
        <Cabecalho titulo="Configurações" />
        <AvisoSchema />
      </>
    );
  }

  return (
    <ConfiguracoesClient
      // Trocar de empresa REMONTA a tela: `router.refresh()` preserva o estado
      // do cliente, e sem isto o filtro de conta ficava com o id da outra empresa
      // (lista vazia com "Todas" nos seletores) e o cadastro nascia na empresa
      // errada. Trava em financeiro-telas.test.ts.
      key={empresa?.id ?? "geral"}
      empresas={empresas}
      logos={logosPorId}
      galeria={galeria.map((g) => ({
        tipo: g.tipo,
        titulo: g.titulo,
        icone: g.icone,
        itens: g.itens.map((i) => ({
          id: i.id,
          nome: i.nome,
          logo: logosDaGaleria[i.id] ?? null,
          icone: i.icone ?? null,
          cor: i.cor ?? null,
          papeis: i.papeis ?? [],
        })),
      }))}
      geral={geral}
      categorias={[...fCatForn.dados, ...fCatCont.dados].map((c) => ({ id: c.id, empresa_id: c.empresa_id, escopo: c.escopo, nome: c.nome }))}
      empresaId={empresa?.id ?? null}
      podeCategorias={poderes.cadastros}
      configs={configs}
      configPendente={configPendente}
      acessos={acessos}
      schemaPendente={schemaPendente}
    />
  );
}
