import { assinarLogos } from "@/lib/financeiro/anexos";
import { configDasEmpresas } from "@/lib/financeiro/config";
import { categorias, partePorId, partes } from "@/lib/financeiro/db";
import { incluirParteNaPagina } from "@/lib/financeiro/partes";
import { PAPEIS_CONTATO, type PapelContato, CATEGORIAS_SUGERIDAS } from "@/lib/financeiro/tipos";
import { contextoFinanceiro } from "../../contexto";
import { AvisoSchema, Cabecalho, Cartao, Vazio } from "../../ui";
import { ContatosClient } from "./ContatosClient";

export const dynamic = "force-dynamic";

const primeiro = (valor: string | string[] | undefined) => Array.isArray(valor) ? valor[0] : valor ?? "";

/** Diretório canônico de pessoas e organizações, incluindo suas extensões comerciais. */
export default async function ContatosPage({
  searchParams,
}: {
  searchParams: Promise<{ papel?: string | string[]; editar?: string | string[] }>;
}) {
  const { empresa, poderes, pendente, escopo, geral, empresas } = await contextoFinanceiro("cadastros");
  const query = await searchParams;
  const papelRecebido = primeiro(query.papel);
  const papelInicial: PapelContato | "" = PAPEIS_CONTATO.includes(papelRecebido as PapelContato)
    ? papelRecebido as PapelContato
    : "";
  const editarInicial = primeiro(query.editar);

  if (!empresa && !geral) {
    return (
      <>
        <Cabecalho titulo="Contatos e empresas" />
        {pendente ? <AvisoSchema /> : (
          <Cartao>
            <Vazio
              icone="users"
              titulo="Nenhuma empresa liberada para você"
              detalhe="O Financeiro trabalha por empresa (Tridi e Gedux). Peça a liberação a quem administra o módulo."
            />
          </Cartao>
        )}
      </>
    );
  }

  const [fPartes, fParteEditada, fCategoriasContato, fCategoriasFornecedor, configs] = await Promise.all([
    partes(escopo, { todos: true, limite: 400 }),
    editarInicial ? partePorId(escopo, editarInicial) : Promise.resolve({ dados: null, pendente: false }),
    categorias(escopo, "contato"),
    categorias(escopo, "fornecedor"),
    configDasEmpresas(escopo),
  ]);
  const lista = incluirParteNaPagina(fPartes.dados, fParteEditada.dados);
  const assinados = await assinarLogos(lista.map((parte) => parte.logo_url));
  const logos = Object.fromEntries(
    lista
      .map((parte) => [parte.id, parte.logo_url ? assinados.get(parte.logo_url) : null] as const)
      .filter((par): par is readonly [string, string] => !!par[1]),
  );
  // O que JÁ está em uso vem primeiro; as sugestões preenchem o resto.
  //
  // O cadastro de categorias nasce do uso, então num diretório novo ele é
  // vazio — e lista vazia não ensina nada: a pessoa escreve "eletricista"
  // hoje, "Eletricista" na semana que vem, e o filtro passa a ter duas linhas
  // para a mesma coisa. As sugestões dão de onde escolher no primeiro dia.
  //
  // A comparação ignora caixa e acento: se "Encanador" já existe na empresa,
  // a sugestão não entra de novo, e a versão que fica é a que a pessoa
  // escreveu — o cadastro dela manda no dela.
  const simples = (t: string) =>
    t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
  const emUso = [...fCategoriasContato.dados, ...fCategoriasFornecedor.dados]
    .filter((categoria, indice, todas) => todas.findIndex((item) => item.nome === categoria.nome) === indice)
    .map((categoria) => ({ nome: categoria.nome, cor: categoria.cor }));
  const jaTem = new Set(emUso.map((c) => simples(c.nome)));
  const catalogo = [
    ...emUso,
    ...[...CATEGORIAS_SUGERIDAS.contato, ...CATEGORIAS_SUGERIDAS.fornecedor]
      .filter((nome, i, todas) => todas.findIndex((n) => simples(n) === simples(nome)) === i)
      .filter((nome) => !jaTem.has(simples(nome)))
      .map((nome) => ({ nome, cor: null })),
  ];
  const formasDePagamento = [...new Set(escopo.flatMap((id) => configs[id]?.formas_pagamento ?? []))];

  return (
    <ContatosClient
      key={empresa?.id ?? "geral"}
      empresas={empresas.map((item) => ({ id: item.id, nome: item.nome }))}
      empresaId={empresa?.id ?? ""}
      empresaNome={empresa?.nome ?? "Visão geral"}
      podeEscrever={poderes.cadastros}
      logos={logos}
      catalogoDeCategorias={catalogo}
      formasDePagamento={formasDePagamento}
      lista={lista}
      schemaPendente={pendente || fPartes.pendente || fParteEditada.pendente}
      papelInicial={papelInicial}
      editarInicial={editarInicial}
    />
  );
}
