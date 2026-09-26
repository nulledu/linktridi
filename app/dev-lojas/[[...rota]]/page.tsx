import { notFound } from "next/navigation";
// A vitrine tem CSS próprio, importado pelo layout de `/l`. Aqui ele entra na
// mão porque o harness mora fora daquela árvore — sem esta linha a prova sairia
// sem estilo nenhum e não provaria nada.
import "../../l/vitrine.css";
import { ProdutoPublico, Vitrine } from "../../l/Vitrine";
import { LojasShell } from "../../(plataforma)/lojas/LojasShell";
import { MinhasLojasClient } from "../../(plataforma)/lojas/MinhasLojasClient";
import { ConfiguracoesClient } from "../../(plataforma)/lojas/[id]/configuracoes/ConfiguracoesClient";
import { PedidosClient } from "../../(plataforma)/lojas/[id]/pedidos/PedidosClient";
import { ProdutoEditor } from "../../(plataforma)/lojas/[id]/produtos/ProdutoEditor";
import { ProdutosClient } from "../../(plataforma)/lojas/[id]/produtos/ProdutosClient";
import { EditorClient } from "../../(plataforma)/lojas/[id]/aparencia/EditorClient";
import { InicioClient } from "../../(plataforma)/lojas/[id]/InicioClient";
import { TemasClient } from "../../(plataforma)/lojas/[id]/temas/TemasClient";
import { AnalisesClient } from "../../(plataforma)/lojas/[id]/analises/AnalisesClient";
import { ClientesClient } from "../../(plataforma)/lojas/[id]/clientes/ClientesClient";
import { DadosClient } from "../../(plataforma)/lojas/[id]/dados/DadosClient";
import { PaginasClient } from "../../(plataforma)/lojas/[id]/paginas/PaginasClient";
import { NavegacaoClient } from "../../(plataforma)/lojas/[id]/navegacao/NavegacaoClient";
import { DominiosClient } from "../../(plataforma)/lojas/dominios/DominiosClient";
import { agruparClientes, resumoDeClientes } from "@/lib/lojas-clientes";
import { MODELOS } from "@/lib/vitrine/modelos";
import { montarResumo } from "../../(plataforma)/lojas/[id]/page";
import { Loja } from "../../l/tema/Loja";
import { caminhoProduto } from "@/lib/lojas";
import { colecoesDaLoja } from "@/lib/vitrine/colecoes";
import { TEMA_PADRAO } from "@/lib/vitrine/modelos";
import type { Template } from "@/lib/vitrine/tipos";
import { lojaPorId, LOJAS_DEMO, pedidosDaLoja, PRODUTOS_DEMO, produtosDaLoja } from "@/lib/lojas-demo";

// Banco de provas do criador de lojas — as telas de verdade, sem login.
//
// As telas da plataforma ficam atrás de sessão, e credencial não se digita.
// Sem uma porta como esta não há como medir o celular (rolagem lateral a
// 320px, alvo de toque, folha presa embaixo) no componente que vai pro ar —
// só numa cópia, que é justamente o que sempre diverge.
//
// Ela monta o `LojasShell` REAL: o mesmo componente, o mesmo CSS, a mesma
// navegação. O único ajuste é o prefixo do caminho (`baseDe`, no shell).
//
// AS DUAS TRAVAS, e as duas são necessárias:
//   1. `DEV_ONLY_PREFIXES` no middleware.ts torna a rota PÚBLICA fora de
//      produção — sozinha, ela não esconde nada: em produção a página
//      continua existindo, só passando a exigir sessão.
//   2. O `notFound()` abaixo é quem faz a página SUMIR. Sem ele, qualquer
//      pessoa logada abriria isto em produção — e como as rotas `/dev-*`
//      moram FORA de `(plataforma)`, elas não têm gate de sessão próprio.
export const dynamic = "force-dynamic";

const LOJA = "carimbos-tridi";

export default async function DevLojasPage({ params }: { params: Promise<{ rota?: string[] }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { rota = [] } = await params;

  // Espelha o roteamento real de `/lojas`: sem segmento é o criador; com loja,
  // é a tela daquela loja.
  const [, secao, alvo] = rota;

  // A VITRINE não entra no shell: ela é a página que o cliente abre, sem
  // sidebar, sem cabeçalho do ERP e sem sessão. Sai antes de tudo.
  if (rota[0] === "vitrine") {
    const loja = lojaPorId(LOJA)!;
    const produtos = produtosDaLoja(LOJA).filter((p) => p.status === "ativo");
    const alvo = rota[1] ? produtos.find((p) => caminhoProduto(p) === rota[1]) : null;
    return alvo
      ? <ProdutoPublico loja={loja} produto={alvo} />
      : <Vitrine loja={loja} produtos={produtos} />;
  }

  // A vitrine COM TEMA: `/dev-lojas/tema` e `/dev-lojas/tema/<template>`.
  // Mede o porte do Warehouse a 320px sem depender de loja gravada no banco —
  // que é justamente o que nenhum harness pode exigir.
  if (rota[0] === "tema") {
    const loja = lojaPorId(LOJA)!;
    const produtos = produtosDaLoja(LOJA).filter((p) => p.status === "ativo");
    const template = (rota[1] as Template) || "inicio";
    // `/dev-lojas/tema/inicio/carimbos` monta o MODELO importado em vez do
    // padrão. É o único jeito de medir seções que só existem nele — a fileira
    // de vídeos, por exemplo, que não está no tema padrão.
    const modelo = rota[2] === "carimbos" ? MODELOS.find((m) => m.id === "carimbos")?.tema : null;
    const colecoes = colecoesDaLoja(produtos);
    return (
      <Loja
        ctx={{
          loja, tema: modelo ?? TEMA_PADRAO(), template, produtos, colecoes,
          base: `/dev-lojas/tema`,
          produto: template === "produto" ? produtos[0] : undefined,
          colecao: template === "colecao" ? (colecoes[0] ?? null) : undefined,
          termo: template === "busca" ? "carimbo" : undefined,
        }}
      />
    );
  }

  let tela: React.ReactNode;
  if (rota.length === 2 && rota[1] === "vazio") {
    // A loja RECÉM-CRIADA: sem pedido, sem venda, sem acesso. É a tela que a
    // pessoa vê no primeiro dia — e era ela que estava desenhando eixo de
    // rótulos repetidos e anel cinza gigante.
    const l = lojaPorId(LOJA)!;
    return (
      <LojasShell name="Caio Silva" role="admin" photoUrl={null} lojas={[{ id: LOJA, nome: l.nome, slug: l.slug, status: l.status, dominio: l.dominio }]}>
        <InicioClient base="/dev-lojas" id={LOJA} pessoa="Caio Silva" resumo={montarResumo([], [], null)} />
      </LojasShell>
    );
  }

  if (rota.length === 1) {
    // Início da loja: o painel de verdade, com as contas de verdade sobre os
    // dados de exemplo.
    const l = lojaPorId(LOJA)!;
    // Os pedidos de exemplo têm data fixa e já saíram da janela de 14 dias — o
    // painel apareceria zerado e não provaria nada. Aqui eles são
    // REDATADOS pra janela atual: é o harness, e o que ele precisa provar é o
    // desenho da tela com número dentro, não a data do dado de exemplo.
    const base = Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`);
    const pedidos = pedidosDaLoja(LOJA).map((p, i) => ({
      ...p,
      feitoEm: new Date(base - ((i * 2) % 13) * 86_400_000).toISOString(),
    }));
    tela = (
      <InicioClient
        base="/dev-lojas"
        id={LOJA}
        pessoa="Caio Silva"
        resumo={montarResumo(pedidos, produtosDaLoja(LOJA), l.dominio)}
      />
    );
  } else if (!rota.length) {
    // `demo` fixo aqui: o harness roda sem sessão e por isso nunca vai ao
    // banco — ele existe pra medir a TELA, não a origem dos dados.
    tela = <MinhasLojasClient lojas={LOJAS_DEMO} demo />;
  } else if (secao === "produtos" && alvo === "novo") {
    tela = <ProdutoEditor lojaId={LOJA} />;
  } else if (secao === "produtos" && alvo) {
    tela = <ProdutoEditor lojaId={LOJA} produto={PRODUTOS_DEMO.find((p) => p.id === alvo) ?? PRODUTOS_DEMO[0]} />;
  } else if (secao === "pedidos") {
    tela = <PedidosClient pedidos={pedidosDaLoja(LOJA)} />;
  } else if (secao === "paginas") {
    const agora = new Date().toISOString();
    tela = (
      <PaginasClient
        lojaId={LOJA}
        slug="carimbos-tridi"
        disponivel
        paginas={[
          { id: "1", lojaId: LOJA, titulo: "Sobre nós", handle: "sobre-nos", conteudo: "<p>Somos…</p>", blocos: [], status: "publicada", atualizadoEm: agora },
          { id: "2", lojaId: LOJA, titulo: "Trocas e devoluções", handle: "trocas-e-devolucoes", conteudo: "<p>7 dias.</p>", blocos: [], status: "publicada", atualizadoEm: agora },
          { id: "3", lojaId: LOJA, titulo: "Perguntas frequentes", handle: "perguntas-frequentes", conteudo: "", blocos: [], status: "rascunho", atualizadoEm: agora },
        ]}
        comBlocos
        catalogo={{
          destinos: [
            { grupo: "Loja", itens: [{ titulo: "Página inicial", destino: "/" }, { titulo: "Todos os produtos", destino: "/c" }] },
            { grupo: "Produtos", itens: PRODUTOS_DEMO.map((p) => ({ titulo: p.titulo, destino: `/${p.id}` })) },
          ],
          colecoes: [{ handle: "carimbos", titulo: "Carimbos" }],
          produtos: PRODUTOS_DEMO.map((p) => ({ id: p.id, titulo: p.titulo })),
        }}
      />
    );
  } else if (secao === "dominios") {
    // Os quatro estados de uma vez: é a tela em que "o que falta" muda tudo, e
    // olhar um estado por vez esconde justamente a comparação.
    tela = (
      <DominiosClient
        podeEscrever
        lojaAtual={{ id: LOJA, nome: "Carimbos Tridi", publicada: true }}
        lojas={[
          { id: LOJA, nome: "Carimbos Tridi", publicada: true },
          { id: "loja-2", nome: "Tridi Brindes", publicada: false },
        ]}
        dominios={[
          { id: "d1", host: "loja.carimbostridi.com.br", verificado: true, lojaId: LOJA },
          { id: "d2", host: "gedux.com.br", verificado: false, lojaId: LOJA },
          { id: "d3", host: "brindes.tridi.com.br", verificado: false, lojaId: "loja-2" },
          { id: "d4", host: "promo.tridi.com.br", verificado: false, lojaId: null },
        ]}
      />
    );
  } else if (secao === "navegacao") {
    tela = (
      <NavegacaoClient
        lojaId={LOJA}
        slug="carimbos-tridi"
        disponivel
        menus={[
          { id: "m1", lojaId: LOJA, chave: "principal", titulo: "Menu principal", itens: [
            { titulo: "Início", destino: "/" },
            { titulo: "Carimbos", destino: "/c/carimbos" },
            { titulo: "Sobre nós", destino: "/p/sobre-nos" },
          ] },
          { id: "m2", lojaId: LOJA, chave: "rodape", titulo: "Menu do rodapé", itens: [] },
        ]}
        destinos={[
          { grupo: "Loja", itens: [{ titulo: "Página inicial", destino: "/" }, { titulo: "Todas as coleções", destino: "/c" }] },
          { grupo: "Coleções", itens: [{ titulo: "Carimbos", destino: "/c/carimbos" }, { titulo: "Chancelas", destino: "/c/chancelas" }] },
          { grupo: "Páginas", itens: [{ titulo: "Sobre nós", destino: "/p/sobre-nos" }] },
        ]}
      />
    );
  } else if (secao === "dados") {
    tela = <DadosClient loja={lojaPorId(LOJA)!} />;
  } else if (secao === "clientes") {
    // Os pedidos de exemplo não têm contato, então o agrupamento cai no nome —
    // que é justamente o caminho de último caso que o teste cobre.
    const hoje = new Date().toISOString().slice(0, 10);
    const cs = agruparClientes(pedidosDaLoja(LOJA));
    tela = <ClientesClient clientes={cs} resumo={resumoDeClientes(cs, hoje)} hoje={hoje} truncado={false} />;
  } else if (secao === "analises") {
    // Números de exemplo, e nada aqui vai ao banco: o harness mede a TELA. O
    // desenho precisa aguentar estado desencontrado (canal com muita sessão e
    // nenhuma venda), que é justamente o caso que a tela existe pra mostrar.
    const dia = (k: number) => new Date(Date.now() - (13 - k) * 86_400_000).toISOString().slice(0, 10);
    tela = (
      <AnalisesClient
        id={LOJA}
        nome={lojaPorId(LOJA)!.nome}
        dias={30}
        disponivel
        resumo={{ visualizacoes: 4820, sessoes: 2140, visitantes: 1780, novos: 1290, recorrentes: 850, sessoesDeUmaPagina: 1180 }}
        resumoAntes={{ visualizacoes: 4010, sessoes: 1810, visitantes: 1520, novos: 1120, recorrentes: 690, sessoesDeUmaPagina: 1020 }}
        serieAcessos={Array.from({ length: 14 }, (_, k) => ({ dia: dia(k), sessoes: 90 + ((k * 37) % 120), visualizacoes: 210 + ((k * 53) % 260) }))}
        serieReceita={Array.from({ length: 14 }, (_, k) => ({ dia: dia(k), pedidos: 1 + (k % 4), receita: 180 + ((k * 97) % 900) }))}
        receita={8420.5}
        pedidos={38}
        porUf={[
          { chave: "SP", sessoes: 940, visualizacoes: 2100 },
          { chave: "MG", sessoes: 310, visualizacoes: 690 },
          { chave: "RJ", sessoes: 288, visualizacoes: 640 },
          { chave: "PR", sessoes: 190, visualizacoes: 410 },
          { chave: "RS", sessoes: 150, visualizacoes: 320 },
          { chave: "BA", sessoes: 132, visualizacoes: 280 },
          { chave: "—", sessoes: 130, visualizacoes: 380 },
        ]}
        porCanal={[
          { chave: "social", sessoes: 1120, visualizacoes: 2300 },
          { chave: "busca", sessoes: 520, visualizacoes: 1240 },
          { chave: "direto", sessoes: 340, visualizacoes: 900 },
          { chave: "campanha", sessoes: 110, visualizacoes: 280 },
          { chave: "indicacao", sessoes: 50, visualizacoes: 100 },
        ]}
        porFonte={[
          { chave: "instagram", sessoes: 980, visualizacoes: 2010 },
          { chave: "google", sessoes: 520, visualizacoes: 1240 },
          { chave: "tiktok", sessoes: 140, visualizacoes: 290 },
        ]}
        porDispositivo={[
          { chave: "celular", sessoes: 1710, visualizacoes: 3800 },
          { chave: "computador", sessoes: 360, visualizacoes: 890 },
          { chave: "tablet", sessoes: 70, visualizacoes: 130 },
        ]}
        porPagina={[
          { chave: "/l/carimbos-tridi", sessoes: 1980, visualizacoes: 2010 },
          { chave: "/l/carimbos-tridi/carimbo-16cm", sessoes: 620, visualizacoes: 880 },
          { chave: "/l/carimbos-tridi/c/chancelas", sessoes: 410, visualizacoes: 520 },
        ]}
        receitaPorUf={[
          { chave: "SP", pedidos: 19, receita: 4820 },
          { chave: "MG", pedidos: 7, receita: 1490 },
          { chave: "RJ", pedidos: 6, receita: 1210 },
        ]}
        receitaPorCanal={[
          { chave: "direto", pedidos: 18, receita: 4120 },
          { chave: "social", pedidos: 12, receita: 2900 },
          { chave: "busca", pedidos: 8, receita: 1400 },
        ]}
        receitaPorFonte={[
          { chave: "instagram", pedidos: 12, receita: 2900 },
          { chave: "google", pedidos: 8, receita: 1400 },
        ]}
        participacao={{ receita: 8420.5, total: 12980 }}
      />
    );
  } else if (secao === "temas") {
    tela = (
      <TemasClient
        id={LOJA}
        atual="carimbos"
        temRascunho={false}
        persistido
        modelos={MODELOS.map((m) => ({ id: m.id, nome: m.nome, descricao: m.descricao }))}
      />
    );
  } else if (secao === "aparencia") {
    // O editor com a prévia real. Sem sessão o `<iframe>` da prévia responde
    // com o login — e é assim que tem que ser: o harness abre a TELA, não a
    // rota protegida que ela embute.
    tela = (
      <EditorClient
        loja={lojaPorId(LOJA)!}
        produtos={produtosDaLoja(LOJA)}
        publicado={TEMA_PADRAO()}
        rascunho={null}
        persistido
        previaUrl="/previa/dev"
      />
    );
  } else if (secao === "configuracoes" && alvo === "rascunho") {
    // A loja como ela nasce: rascunho, com um domínio ligado que ainda não
    // responde. É exatamente o estado em que "troquei o domínio e nada
    // aconteceu" acontecia — e o que a tela precisa explicar.
    tela = (
      <ConfiguracoesClient
        loja={{ ...lojaPorId(LOJA)!, status: "rascunho", dominio: null, dominioPendente: "gedux.com.br" }}
      />
    );
  } else if (secao === "configuracoes") {
    // Sem sessão a API de domínios responde 401, e a tela mostra o aviso de
    // acesso — é o comportamento certo, e por isso o harness não o mascara.
    tela = <ConfiguracoesClient loja={lojaPorId(LOJA)!} />;
  } else {
    tela = <ProdutosClient lojaId={LOJA} produtos={produtosDaLoja(LOJA)} />;
  }

  return (
    <LojasShell name="Caio Silva" role="admin" photoUrl={null}>
      {tela}
    </LojasShell>
  );
}
