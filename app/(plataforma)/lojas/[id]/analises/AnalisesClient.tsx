"use client";

// ── Análises da loja ─────────────────────────────────────────────────────────
// De onde vem o acesso, de onde vem o dinheiro, e onde os dois NÃO se
// encontram — que é a pergunta que faz o lojista mudar alguma coisa.
//
// ── A decisão que mais confunde quem olha, e por que ela está certa ──────────
// Sessão e pedido são atribuídos por critérios DIFERENTES, de propósito:
//
//   · a SESSÃO leva a origem daquela visita (último clique);
//   · o PEDIDO leva a origem da PRIMEIRA visita da pessoa, com janela de 30
//     dias (primeiro toque).
//
// Por isso é normal — e correto — ver "Instagram: 200 sessões, 0 pedidos" ao
// lado de "Direto: 10 sessões, 5 pedidos": quem descobre a loja por um anúncio
// costuma voltar DIGITANDO o endereço pra fechar a compra. Se o pedido fosse
// creditado ao último clique, todo anúncio pareceria não vender nada e o
// "direto" ficaria com o mérito de todos eles. A tela diz isso em texto, porque
// um número que precisa de explicação e não a traz vira decisão errada.

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../../../Icon";
import { MonoLinha, MonoRosca, MonoVazio, corDaSerie } from "../../../ui/graficos";
import { Bloco, Cabecalho, Numeros, Vazio } from "../../ui";
import { moeda } from "@/lib/lojas";
import { NOME_DA_UF, ROTULO_CANAL, type Canal } from "@/lib/lojas-analytics";
import type {
  LinhaReceita, LinhaTop, PontoDeReceita, PontoDeSerie, ResumoAcessos,
} from "@/lib/lojas-analytics-db";
// O CSS vem COM o componente, e não pela página.
//
// Importado na página de servidor, ele entra no pacote daquela rota — e o banco
// de provas, que monta o mesmo componente por outro caminho, desenhava a tela
// inteira sem uma linha de estilo. Junto do componente, o estilo vai aonde ele
// for usado.
import "./analises.css";

interface Props {
  id: string;
  nome: string;
  dias: number;
  disponivel: boolean;
  resumo: ResumoAcessos;
  resumoAntes: ResumoAcessos;
  serieAcessos: PontoDeSerie[];
  serieReceita: PontoDeReceita[];
  receita: number;
  pedidos: number;
  porUf: LinhaTop[];
  porCanal: LinhaTop[];
  porFonte: LinhaTop[];
  porDispositivo: LinhaTop[];
  porPagina: LinhaTop[];
  receitaPorUf: LinhaReceita[];
  receitaPorCanal: LinhaReceita[];
  receitaPorFonte: LinhaReceita[];
  participacao: { receita: number; total: number } | null;
}

const variacao = (agora: number, antes: number): number | null =>
  antes > 0 ? (agora - antes) / antes : null;

const pct = (parte: number, todo: number): number => (todo > 0 ? (parte / todo) * 100 : 0);

/** `2026-08-23` → `23/08`. */
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function AnalisesClient(p: Props) {
  const router = useRouter();
  const busca = useSearchParams();

  const trocarPeriodo = (d: number) => {
    const q = new URLSearchParams(busca.toString());
    q.set("d", String(d));
    router.push(`?${q.toString()}`);
  };

  // A conversão é pedido ÷ sessão, e não pedido ÷ visitante: uma pessoa que
  // volta três vezes e compra uma teve uma compra em três oportunidades.
  const conversao = p.resumo.sessoes > 0 ? (p.pedidos / p.resumo.sessoes) * 100 : 0;
  const ticket = p.pedidos > 0 ? p.receita / p.pedidos : 0;

  // Junta acesso e receita numa curva só. Os dias vêm das DUAS séries porque
  // pode haver dia com venda e sem acesso registrado (pedido pelo WhatsApp) e
  // dia com acesso e sem venda.
  const dias = [...new Set([...p.serieAcessos.map((x) => x.dia), ...p.serieReceita.map((x) => x.dia)])].sort();
  const sessoesPorDia = new Map(p.serieAcessos.map((x) => [x.dia, x.sessoes]));
  const receitaPorDia = new Map(p.serieReceita.map((x) => [x.dia, x.receita]));

  const receitaDe = (mapa: LinhaReceita[], chave: string) =>
    mapa.find((r) => r.chave === chave)?.receita ?? 0;
  const pedidosDe = (mapa: LinhaReceita[], chave: string) =>
    mapa.find((r) => r.chave === chave)?.pedidos ?? 0;

  const totalSessoesUf = p.porUf.reduce((s, u) => s + u.sessoes, 0);

  return (
    <div className="lj-tela an">
      <Cabecalho
        titulo="Análises"
        sub={`${p.nome} · de onde vem o acesso e de onde vem o dinheiro`}
        aside={
          <div className="an-periodo" role="group" aria-label="Período">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                className="an-periodo-item"
                data-on={d === p.dias ? "1" : undefined}
                aria-pressed={d === p.dias}
                onClick={() => trocarPeriodo(d)}
              >
                {d} dias
              </button>
            ))}
          </div>
        }
      />

      {!p.disponivel && (
        <p className="ap-aviso">
          <Icon name="alert-triangle" size={16} />
          O registro de acesso ainda não existe no banco: rode o{" "}
          <code>supabase/lojas-analytics.sql</code> no Supabase. Até lá esta tela mostra zero — e zero
          aqui quer dizer &quot;não instalado&quot;, não &quot;ninguém entrou&quot;.
        </p>
      )}

      {/* ── Os números ── */}
      {/* QUATRO números, não seis. Seis viravam cinco numa linha e um órfão na
          outra, e o faturamento truncava no meio — "R$ 8.42…". O que caiu não
          sumiu: virou a linha de apoio do número a que pertence. */}
      <Numeros
        itens={[
          { rotulo: "Faturamento", valor: moeda(p.receita), nota: `ticket médio de ${moeda(ticket)}` },
          {
            rotulo: "Sessões",
            valor: p.resumo.sessoes.toLocaleString("pt-BR"),
            variacao: variacao(p.resumo.sessoes, p.resumoAntes.sessoes),
            nota: `${p.resumo.visualizacoes.toLocaleString("pt-BR")} visualizações`,
          },
          { rotulo: "Pedidos", valor: p.pedidos },
          { rotulo: "Conversão", valor: `${conversao.toFixed(2).replace(".", ",")}%`, nota: "pedido por sessão" },
        ]}
      />

      {/* ── Acesso × dinheiro ── */}
      <Bloco titulo="Acessos e faturamento">
        <MonoLinha
          altura={200}
          rotuloDe={diaCurto}
          series={[
            { nome: "Sessões", pontos: dias.map((d) => ({ rotulo: d, valor: sessoesPorDia.get(d) ?? 0 })) },
            { nome: "Faturamento (R$)", pontos: dias.map((d) => ({ rotulo: d, valor: receitaPorDia.get(d) ?? 0 })) },
          ]}
        />
      </Bloco>

      <div className="an-duo">
        {/* ── Estados ── */}
        <Bloco titulo="De onde acessam">
          {p.porUf.length === 0 ? (
            <MonoVazio
              altura={168}
              icone="world"
              titulo="Nenhum estado identificado"
              texto="A geolocalização só existe no ar. Em desenvolvimento o estado fica em branco em vez de ser chutado."
            />
          ) : (
            <ul className="an-barras">
              {p.porUf.map((u) => (
                <li key={u.chave}>
                  <span className="an-barra-nome" title={NOME_DA_UF[u.chave] ?? u.chave}>
                    <strong>{u.chave}</strong>
                    <small>{NOME_DA_UF[u.chave] ?? "Não identificado"}</small>
                  </span>
                  <span className="an-barra-trilho">
                    <span className="an-barra-cheia" style={{ width: `${pct(u.sessoes, totalSessoesUf)}%` }} />
                  </span>
                  <span className="an-barra-num">{u.sessoes}</span>
                  <span className="an-barra-din">{receitaDe(p.receitaPorUf, u.chave) > 0 ? moeda(receitaDe(p.receitaPorUf, u.chave)) : "—"}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        {/* ── Canais ── */}
        <Bloco titulo="Por onde chegam">
          {p.porCanal.length === 0 ? (
            <MonoVazio
              altura={168}
              icone="chart-pie"
              titulo="Nenhum acesso no período"
              texto="A origem de cada visita aparece aqui — busca, redes sociais, campanha ou direto."
            />
          ) : (
          <div className="an-rosca">
            <MonoRosca
              fatias={p.porCanal.map((c) => ({ nome: ROTULO_CANAL[c.chave as Canal] ?? c.chave, valor: c.sessoes }))}
              centro={<><strong>{p.resumo.sessoes}</strong><small>sessões</small></>}
            />
            <ul className="an-fatias">
              {p.porCanal.map((c, i) => (
                <li key={c.chave}>
                  <i style={{ background: corDaSerie(i) }} aria-hidden="true" />
                  <span className="an-fatia-nome" title={ROTULO_CANAL[c.chave as Canal] ?? c.chave}>{ROTULO_CANAL[c.chave as Canal] ?? c.chave}</span>
                  <span className="an-fatia-val">{c.sessoes}</span>
                  <span className="an-fatia-pct">{Math.round(pct(c.sessoes, p.resumo.sessoes))}%</span>
                </li>
              ))}
            </ul>
          </div>
          )}
        </Bloco>
      </div>

      {/* ── Origem × venda ── */}
      <Bloco titulo="Quem traz visita e quem traz venda">
        <p className="an-nota">
          A <strong>sessão</strong> conta a origem daquela visita. O <strong>pedido</strong> conta a
          origem da <strong>primeira</strong> visita da pessoa, dentro de 30 dias — porque quem
          descobre a loja num anúncio costuma voltar digitando o endereço pra comprar. Ver as duas
          colunas desencontradas é o normal, e é justamente o que mostra qual canal realmente traz
          dinheiro.
        </p>
        <div className="an-tabela" role="table">
          <div className="an-linha an-cab" role="row">
            <span role="columnheader">Origem</span>
            <span role="columnheader">Sessões</span>
            <span role="columnheader">Pedidos</span>
            <span role="columnheader">Faturamento</span>
            <span role="columnheader">R$ / sessão</span>
          </div>
          {[...p.porCanal].map((c) => {
            const rec = receitaDe(p.receitaPorCanal, c.chave);
            return (
              <div className="an-linha" role="row" key={`canal-${c.chave}`}>
                <span role="cell"><strong>{ROTULO_CANAL[c.chave as Canal] ?? c.chave}</strong></span>
                <span role="cell">{c.sessoes}</span>
                <span role="cell">{pedidosDe(p.receitaPorCanal, c.chave)}</span>
                <span role="cell">{rec > 0 ? moeda(rec) : "—"}</span>
                <span role="cell">{c.sessoes > 0 ? moeda(rec / c.sessoes) : "—"}</span>
              </div>
            );
          })}
          {p.porFonte.map((f) => {
            const rec = receitaDe(p.receitaPorFonte, f.chave);
            return (
              <div className="an-linha an-sub" role="row" key={`fonte-${f.chave}`}>
                <span role="cell">{f.chave}</span>
                <span role="cell">{f.sessoes}</span>
                <span role="cell">{pedidosDe(p.receitaPorFonte, f.chave)}</span>
                <span role="cell">{rec > 0 ? moeda(rec) : "—"}</span>
                <span role="cell">{f.sessoes > 0 ? moeda(rec / f.sessoes) : "—"}</span>
              </div>
            );
          })}
          {p.porCanal.length === 0 && <Vazio icone="route" titulo="Nada registrado ainda" />}
        </div>
      </Bloco>

      <div className="an-duo">
        {/* ── Páginas ── */}
        <Bloco titulo="Páginas mais vistas" className="lj-lista">
          {p.porPagina.length === 0 ? (
            <Vazio icone="eye" titulo="Nenhuma visualização no período" />
          ) : (
            <ul>
              {p.porPagina.map((pg) => (
                <li key={pg.chave}>
                  <span className="lj-lista-nome" title={pg.chave}>{pg.chave}</span>
                  <span className="lj-lista-apoio">{pg.sessoes} sessões</span>
                  <strong className="lj-lista-val">{pg.visualizacoes}</strong>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        {/* ── Quem é o público ── */}
        <Bloco titulo="Quem visita">

          <p className="an-rot">Dispositivo</p>
          <ul className="an-barras an-barras-curtas">
            {p.porDispositivo.map((d) => (
              <li key={d.chave}>
                <span className="an-barra-nome"><strong>{d.chave}</strong></span>
                <span className="an-barra-trilho">
                  <span className="an-barra-cheia" style={{ width: `${pct(d.sessoes, p.resumo.sessoes)}%` }} />
                </span>
                <span className="an-barra-num">{Math.round(pct(d.sessoes, p.resumo.sessoes))}%</span>
              </li>
            ))}
            {p.porDispositivo.length === 0 && <li className="an-sem">Sem dado no período.</li>}
          </ul>

          <p className="an-rot">Primeira vez × já conhecia</p>
          <div className="an-par">
            <div><strong>{p.resumo.novos}</strong><small>novos</small></div>
            <div><strong>{p.resumo.recorrentes}</strong><small>recorrentes</small></div>
          </div>

          <p className="an-rot">Saíram na primeira página</p>
          <div className="an-par">
            <div>
              <strong>{Math.round(pct(p.resumo.sessoesDeUmaPagina, p.resumo.sessoes))}%</strong>
              <small>das sessões</small>
            </div>
            <div>
              <strong>{p.resumo.sessoes > 0 ? (p.resumo.visualizacoes / p.resumo.sessoes).toFixed(1).replace(".", ",") : "0"}</strong>
              <small>páginas por sessão</small>
            </div>
          </div>
        </Bloco>
      </div>

      {p.participacao && p.participacao.total > 0 && (
        <Bloco titulo="Peso desta loja" className="an-parte">
          <p>
            <strong>{moeda(p.participacao.receita)}</strong> de{" "}
            <strong>{moeda(p.participacao.total)}</strong> faturados por todas as lojas no período —{" "}
            <strong>{Math.round(pct(p.participacao.receita, p.participacao.total))}%</strong> do total.
          </p>
          <Link href="/lojas" className="ui-btn" data-v="secundario" data-t="sm">Comparar as lojas</Link>
        </Bloco>
      )}
    </div>
  );
}
