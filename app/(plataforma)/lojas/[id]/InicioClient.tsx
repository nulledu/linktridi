"use client";

// ── Início da loja ───────────────────────────────────────────────────────────
// "Como está indo" respondido antes de a pessoa perguntar.
//
// ── O que mudou, e por quê ───────────────────────────────────────────────────
// A versão anterior tinha SETE blocos do mesmo peso visual — quatro cartões de
// número com faísca, um cartão de curva, um cartão de rosca, dois cartões de
// lista e três cartões numa faixa lateral. Todos com a mesma borda, o mesmo
// raio e o mesmo fundo. Uma tela em que tudo tem o mesmo peso não tem
// hierarquia: a pessoa não lê, ela varre — e varrer catorze caixas iguais é o
// que fazia a tela parecer confusa mesmo com todo o dado certo.
//
// Agora são TRÊS coisas, na ordem em que a pergunta é feita:
//
//   1. os números  — quanto entrou (uma fileira, sem moldura por número)
//   2. a curva     — como foi ao longo do período, com o anterior por trás
//   3. o que fazer — o que entrou, o que vende, o que falta
//
// A rosca de categoria virou lista dentro do bloco da curva: quatro categorias
// não precisam de um anel de 170px e de um cartão próprio pra serem lidas, e
// duas perguntas sobre venda em dois cartões seguidos fazem a segunda parecer
// mais importante do que é.

import Link from "next/link";
import { Icon } from "../../Icon";
import { Bloco, Cabecalho, Numeros, Vazio } from "../ui";
import { MonoLinha, corDaSerie } from "../../ui/graficos";
import { ROTULO_PAGAMENTO, moeda, type Pedido, type Produto } from "@/lib/lojas";
import "./inicio.css";

export interface ResumoInicio {
  saudacao: string;
  periodo: string;
  vendas: { hoje: number; antes: number };
  pedidos: { hoje: number; antes: number };
  ticket: { hoje: number; antes: number };
  aEnviar: number;
  serie: { rotulo: string; valor: number }[];
  serieAntes: { rotulo: string; valor: number }[];
  porCategoria: { nome: string; valor: number }[];
  maisVendidos: { produto: Produto; unidades: number; receita: number }[];
  recentes: Pedido[];
  tarefas: { texto: string; feito: boolean; href?: string }[];
}

const variacao = (agora: number, antes: number): number | null =>
  antes > 0 ? (agora - antes) / antes : null;

/** `2026-08-23` → `23/08`. */
const diaCurto = (iso: string) => (iso.includes("-") ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);

export function InicioClient({ base, id, pessoa, resumo }: {
  base: string;
  id: string;
  /** Quem está olhando — a saudação é pra PESSOA, não pra loja. */
  pessoa: string;
  resumo: ResumoInicio;
}) {
  const { vendas, pedidos, ticket } = resumo;
  const totalCategorias = resumo.porCategoria.reduce((s, c) => s + c.valor, 0);
  const pendentes = resumo.tarefas.filter((t) => !t.feito);

  return (
    <div className="lj-tela in">
      <Cabecalho
        titulo={<>{resumo.saudacao}, {pessoa.split(" ")[0]}.</>}
        sub="Aqui está o que está acontecendo na sua loja hoje."
        aside={
          <span className="lj-chip">
            <Icon name="calendar" size={14} color="var(--text-dim)" />
            {resumo.periodo}
          </span>
        }
      />

      <Numeros
        itens={[
          { rotulo: "Vendas", valor: moeda(vendas.hoje), variacao: variacao(vendas.hoje, vendas.antes) },
          { rotulo: "Pedidos", valor: pedidos.hoje, variacao: variacao(pedidos.hoje, pedidos.antes) },
          { rotulo: "Ticket médio", valor: moeda(ticket.hoje), variacao: variacao(ticket.hoje, ticket.antes) },
          // Cair é bom aqui: pedido parado esperando envio é fila, não venda.
          { rotulo: "A enviar", valor: resumo.aEnviar, inverter: true, nota: resumo.aEnviar ? "esperando você" : "nada parado" },
        ]}
      />

      <Bloco
        titulo="Vendas no período"
        acao={<Link href={`${base}/${id}/analises`} className="lj-link">Ver análises</Link>}
      >
        {vendas.hoje === 0 && vendas.antes === 0 ? (
          <Vazio
            icone="chart-line"
            titulo="Nenhuma venda ainda"
            texto="A curva começa no primeiro pedido pago. Enquanto isso, o que ajuda é ter produto publicado e o endereço divulgado."
          />
        ) : (
          <>
            <MonoLinha
              area
              altura={180}
              formatar={moeda}
              rotuloDe={diaCurto}
              series={[
                { nome: "Este período", pontos: resumo.serie },
                { nome: "Período anterior", pontos: resumo.serieAntes, apoio: true },
              ]}
            />

            {/* A categoria mora AQUI, e não num cartão próprio: é a mesma
                pergunta ("de onde vem o dinheiro") num recorte diferente.
                Separar em dois cartões dava a ela o mesmo peso da curva. */}
            {resumo.porCategoria.length > 0 && (
              <div className="in-cat">
                <p className="in-cat-rot">Por categoria</p>
                <ul>
                  {resumo.porCategoria.map((c, i) => (
                    <li key={c.nome}>
                      <span className="in-cat-nome">
                        <i style={{ background: corDaSerie(i) }} aria-hidden="true" />
                        {c.nome}
                      </span>
                      <span className="in-cat-barra">
                        <span style={{ width: `${totalCategorias ? (c.valor / totalCategorias) * 100 : 0}%`, background: corDaSerie(i) }} />
                      </span>
                      <span className="in-cat-val">{moeda(c.valor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Bloco>

      <div className="in-duo">
        <Bloco
          titulo="Pedidos recentes"
          acao={<Link href={`${base}/${id}/pedidos`} className="lj-link">Ver todos</Link>}
        >
          {resumo.recentes.length === 0 ? (
            <Vazio icone="shopping-cart" titulo="Nenhum pedido ainda" />
          ) : (
            <ul className="lj-lista">
              {resumo.recentes.map((p) => (
                <li key={p.id}>
                  <span className="lj-lista-num">#{p.numero}</span>
                  <span className="lj-lista-nome">{p.cliente}</span>
                  <span className="lj-lista-pill" style={{
                    background: `color-mix(in srgb, ${ROTULO_PAGAMENTO[p.pagamento].cor} 16%, transparent)`,
                    color: ROTULO_PAGAMENTO[p.pagamento].cor,
                  }}>{ROTULO_PAGAMENTO[p.pagamento].txt}</span>
                  <strong className="lj-lista-val">{moeda(p.total)}</strong>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco
          titulo="Mais vendidos"
          acao={<Link href={`${base}/${id}/produtos`} className="lj-link">Ver produtos</Link>}
        >
          {resumo.maisVendidos.length === 0 ? (
            <Vazio icone="package" titulo="Ainda não há venda para ranquear" />
          ) : (
            <ul className="lj-lista">
              {resumo.maisVendidos.map(({ produto, unidades, receita }) => (
                <li key={produto.id}>
                  <span className="lj-lista-foto">
                    {produto.imagens[0]
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={produto.imagens[0].url} alt="" />
                      : <Icon name="package" size={14} color="var(--text-dim)" />}
                  </span>
                  <span className="lj-lista-nome">{produto.titulo}</span>
                  <span className="lj-lista-apoio">{unidades} un.</span>
                  <strong className="lj-lista-val">{moeda(receita)}</strong>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>

      {/* As pendências só aparecem quando EXISTEM. Um bloco "Próximas tarefas"
          com tudo riscado é ruído permanente ocupando a mesma altura de um
          bloco com informação. */}
      {pendentes.length > 0 && (
        <Bloco titulo="Para a loja ficar redonda">
          <ul className="lj-tarefas">
            {pendentes.map((t) => (
              <li key={t.texto}>
                <span className="lj-check" aria-hidden="true" />
                {t.href ? <Link href={`${base}/${id}/${t.href}`}>{t.texto}</Link> : <span>{t.texto}</span>}
              </li>
            ))}
          </ul>
        </Bloco>
      )}
    </div>
  );
}
