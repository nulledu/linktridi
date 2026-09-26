"use client";

// ─────────────────────────────────────────────────────────────────────────────
// A PRODUÇÃO DE VERDADE
//
// "No final de tudo ele calcula o tempo médio pra fazer cada produto e coisas
//  do tipo." / "Fulano de tal fez chancela, usou tal material que ciclano fez."
//
// Duas abas porque são duas decisões diferentes, não dois relatórios:
//
//   TEMPOS  responde "essa peça demora mais do que devia?" — e por isso o
//           número da frente é a MEDIANA e os descartes aparecem em voz alta.
//           Um tempo médio que ninguém confia é pior que tempo nenhum, porque
//           PARECE informação e alguém replaneja o dia em cima dele.
//
//   RASTRO  responde "de onde veio isto?" e "onde foi parar aquilo?" — a
//           pergunta que se faz com a caixa reprovada na mão, e a que salva o
//           dia quando o lote de material veio ruim.
//
// A entrada do rastro é um campo de texto e nada mais: a pistola Bluetooth do
// galpão DIGITA o código e aperta Enter, então o mesmo campo serve pra quem
// bipa e pra quem digita. Não há botão de câmera aqui de propósito — quem tem
// a peça na mão está no tablet, e no tablet a leitura já existe.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../../Icon";
import { Botao } from "../../ui/controles";
import { Alerta } from "../../ui/Alerta";
import { useBuscaAtual } from "../../ui/useBuscaAtual";
import { PageHead, VerMais } from "../../ui/mobile";
// TUDO daqui vem do módulo PURO. `lib/atividades-tempo-consulta` e
// `lib/atividades-genealogia` importam `createSupabaseAdminClient` (e com ele
// `next/headers`): um único import de VALOR de lá arrasta o Supabase pro pacote
// do navegador e o build morre — `tsc` e o `npm test` passam, porque a regra é
// do empacotador. Tipo pode vir dos dois (`import type` é apagado); valor, só
// daqui. Ver lib/__tests__/cliente-nao-importa-servidor.test.ts.
import {
  ROTULO_DESCARTE, FOLGA_ADERENCIA, textoDuracao, PERIODOS,
  type TempoDoProduto, type MotivoDescarte, type Tempos,
} from "@/lib/atividades-tempo";
import { fracaoSemBipe, FRACAO_DISPENSA_DEMAIS, type Aberturas } from "@/lib/atividades-aberturas";
import type { Rastro, Direcao, UnidadeNo } from "@/lib/atividades-genealogia";

type Aba = "tempos" | "rastro";

export function HistoricoProducaoClient({ inicial }: { inicial: Tempos | null }) {
  const [aba, setAba] = useState<Aba>("tempos");

  return (
    <div style={{ maxWidth: 1180 }}>
      <PageHead
        title="A produção de verdade"
        sub="Quanto tempo cada coisa leva, e de onde veio cada peça."
        right={
          <Link href="/atividades" className="hp-voltar">
            <Icon name="chevron-left" size={15} color="var(--text-dim)" />
            Atividades
          </Link>
        }
      />

      <div className="tab-strip hp-abas" role="tablist" aria-label="Seções">
        {([["tempos", "Tempos", "hourglass-high"], ["rastro", "Rastro da peça", "arrows-split"]] as const).map(([k, rot, ic]) => (
          <button key={k} role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
            className="hp-aba" data-on={aba === k ? "1" : undefined}>
            <Icon name={ic} size={15} color={aba === k ? "var(--primary-texto)" : "var(--text-dim)"} />
            {rot}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        {aba === "tempos" ? <PainelTempos inicial={inicial} /> : <PainelRastro />}
      </div>

      <style>{CSS}</style>
    </div>
  );
}

// ── TEMPOS ───────────────────────────────────────────────────────────────────

function PainelTempos({ inicial }: { inicial: Tempos | null }) {
  const [dados, setDados] = useState<Tempos | null>(inicial);
  const [dias, setDias] = useState<number>(inicial?.dias ?? 30);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  // Sem poll, de propósito: relatório não é quadro. Só busca quando a pessoa
  // troca o período ou pede "Atualizar" — cada ciclo automático aqui seria uma
  // invocação inteira por nada.
  // Troca rápida de período: a resposta do período velho (90 dias é a mais
  // lenta) chegava por último e escrevia por cima do novo.
  const buscaAtual = useBuscaAtual();
  const buscar = useCallback(async (d: number) => {
    const souAtual = buscaAtual();
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/atividades/tempos?dias=${d}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const t = await r.json() as Tempos;
      if (!souAtual()) return;
      setDados(t);
    } catch {
      if (souAtual()) setErro("Não deu para ler os tempos agora.");
    } finally {
      if (souAtual()) setCarregando(false);
    }
  }, [buscaAtual]);

  function trocarPeriodo(d: number) {
    if (d === dias) return;
    setDias(d);
    void buscar(d);
  }

  const r = dados?.resumo;

  return (
    <>
      <div className="hp-barra">
        <div className="tab-strip hp-periodos" role="group" aria-label="Período">
          {PERIODOS.map((d) => (
            <button key={d} onClick={() => trocarPeriodo(d)} className="hp-aba" data-on={dias === d ? "1" : undefined}>
              {d} dias
            </button>
          ))}
        </div>
        <Botao variante="sutil" icone="refresh" carregando={carregando} onClick={() => void buscar(dias)}>
          Atualizar
        </Botao>
      </div>

      {erro && (
        <Alerta tom="perigo" style={{ marginTop: 12 }}>{erro}</Alerta>
      )}

      {!dados ? (
        <div className="hp-vazio">
          <Icon name="hourglass-high" size={22} color="var(--text-dim)" />
          <div>
            <strong>Sem leitura dos tempos.</strong>
            <p>Tente “Atualizar”. Se persistir, o banco não respondeu.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="kpi-row hp-kpis">
            <Kpi icone="checklist" rotulo="Ordens medidas" valor={String(r!.ordensMedidas)}
              nota={r!.ordensDescartadas ? `${r!.ordensDescartadas} fora da conta` : "nenhuma descartada"} />
            <Kpi icone="clock" rotulo="Horas de bancada" valor={String(r!.horas).replace(".", ",")} nota="somadas das ordens medidas" />
            <Kpi icone="package" rotulo="Peças" valor={String(r!.pecas)} nota="nas ordens medidas" />
            <Kpi icone="trending-up" rotulo="Demoram mais que o previsto" valor={String(r!.acimaDoPrevisto)}
              nota={`acima de +${Math.round((FOLGA_ADERENCIA - 1) * 100)}%`}
              tom={r!.acimaDoPrevisto ? "atencao" : undefined} />
          </div>

          {dados.escopo === "minhas" && (
            <Alerta tom="info" icone="user" style={{ marginTop: 12 }}>Estes são os <b>seus</b> tempos. A produção da equipe aparece para quem cuida dela.</Alerta>
          )}

          {dados.truncado && (
            <Alerta tom="atencao" style={{ marginTop: 12 }}>
              O período tem mais ordens do que cabe numa leitura. Estes números são das
              <b> mais recentes</b> da janela, não da janela inteira — use um período menor.
            </Alerta>
          )}

          <ComoAbriram aberturas={dados.aberturas ?? null} />

          <PrevistoEhPadrao grupos={dados.grupos} />

          <Descartes grupos={dados.grupos} resumo={r!} />

          {dados.grupos.length === 0 ? (
            <div className="hp-vazio">
              <Icon name="hourglass-high" size={22} color="var(--text-dim)" />
              <div>
                <strong>Nenhuma ordem concluída neste período.</strong>
                <p>Aumente o período, ou confira se a produção está sendo concluída no tablet.</p>
              </div>
            </div>
          ) : (
            <TabelaTempos grupos={dados.grupos} />
          )}
        </>
      )}
    </>
  );
}

function Kpi({ icone, rotulo, valor, nota, tom }: {
  icone: string; rotulo: string; valor: string; nota: string; tom?: "atencao";
}) {
  return (
    <div className="hp-kpi" data-tom={tom}>
      <div className="hp-kpi-top">
        <Icon name={icone} size={15} color={tom === "atencao" ? "var(--atencao)" : "var(--text-dim)"} />
        <span>{rotulo}</span>
      </div>
      <strong>{valor}</strong>
      <span className="hp-kpi-nota">{nota}</span>
    </div>
  );
}

/**
 * COMO AS ORDENS ABRIRAM — com bipe do material, ou pela saída de emergência.
 *
 * O livro `atividade_bipes` já era escrito e NINGUÉM no sistema o lia: pra
 * saber quantas ordens abriram sem bipar era preciso abrir o Supabase e
 * escrever SQL. Isso derruba a única coisa que a tabela existe pra garantir —
 * "saída de emergência sem rastro vira o caminho normal em duas semanas". Um
 * rastro que ninguém consegue olhar é a mesma coisa que rastro nenhum.
 *
 * O número que decide é a FRAÇÃO, não a contagem: 30 dispensas em 500 ordens é
 * o galpão funcionando, 30 em 40 é a exigência medindo a si mesma. E quando
 * passa do limite, a frase aponta pra CONFIGURAÇÃO (mesa sem leitor, material
 * sem etiqueta, interruptor ligado pra tarefa que não usa material) — nunca pra
 * a pessoa que apertou o botão que o sistema ofereceu.
 */
function ComoAbriram({ aberturas }: { aberturas: Aberturas | null }) {
  if (!aberturas) return null;

  if (aberturas.semLivro) {
    return (
      <Alerta tom="atencao" style={{ marginTop: 12 }}>
        Não dá para saber como as ordens abriram: o livro do bipe ainda não existe no banco.
        Falta rodar <b>supabase/atividades_bipe_material.sql</b> (ou o §11 do consolidado).
      </Alerta>
    );
  }

  const total = aberturas.comBipe + aberturas.semBipe;

  // Exigência desligada e nada registrado é o estado NORMAL de hoje — dizer
  // "0 dispensas" ali soaria como elogio a uma regra que não está valendo.
  if (!total) {
    if (aberturas.exigido) {
      return (
        <Alerta tom="atencao" style={{ marginTop: 12 }}>
          O bipe do material está <b>exigido</b>, mas nenhuma ordem registrou abertura neste
          período. Ou nenhuma ordem foi aberta pelo tablet, ou a fila do tablet não subiu.
        </Alerta>
      );
    }
    return null;
  }

  const fracao = fracaoSemBipe(aberturas) ?? 0;
  const pct = Math.round(fracao * 100);
  const demais = fracao >= FRACAO_DISPENSA_DEMAIS;

  return (
    <Alerta tom={demais ? "atencao" : "info"} icone="barcode" style={{ marginTop: 12 }}>
      <span>
        <b>{aberturas.comBipe} de {total} ordens abriram bipando o material</b>
        {aberturas.semBipe > 0 && <> — {aberturas.semBipe} ({pct}%) começaram sem bipar.</>}
        {aberturas.semBipe === 0 && <>.</>}
        {demais && (
          <> É gente demais na saída de emergência: o que precisa mudar é a configuração
            (mesa sem leitor, material sem etiqueta, ou a exigência ligada para tarefa que
            não usa material), não quem apertou o botão.</>
        )}
        {!aberturas.exigido && (
          <> A exigência do bipe está <b>desligada</b> agora — estes números são de quando
            ela esteve ligada.</>
        )}
        {aberturas.truncado && <> Há mais aberturas do que cabe numa leitura: use um período menor.</>}
      </span>
      {aberturas.porMotivo.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <VerMais label="Por que não bipou">
            <ul className="hp-descartes">
              {aberturas.porMotivo.map((m) => (
                <li key={m.motivo}><b>{m.ordens}</b> <span>{m.rotulo}</span></li>
              ))}
            </ul>
          </VerMais>
        </div>
      )}
    </Alerta>
  );
}

/**
 * "Previsto" quase sempre é o MESMO NÚMERO pra tudo.
 *
 * Quem gera produção em lote não escolhe tempo por tarefa: `/api/atividades`,
 * `/api/atividades/producao` e o push do tablet gravam `TEMPO_PADRAO_MIN` (40
 * min) em toda ordem. Então "+140% do previsto" não quer dizer que a bancada
 * está lenta — quer dizer que aquela tarefa não leva 40 minutos, o que ninguém
 * nunca afirmou.
 *
 * Sem este aviso a coluna vira uma acusação com cara de medição. Ele some
 * sozinho no dia em que alguém cadastrar tempos de verdade: a checagem é se as
 * estimativas são todas iguais, não uma constante escrita aqui.
 */
function PrevistoEhPadrao({ grupos }: { grupos: TempoDoProduto[] }) {
  const comEstimativa = grupos.filter((g) => g.estimadoMin !== null && g.amostras > 0);
  const distintas = new Set(comEstimativa.map((g) => g.estimadoMin));
  if (comEstimativa.length < 3 || distintas.size > 1) return null;
  const [unica] = [...distintas];
  return (
    <Alerta tom="info" style={{ marginTop: 12 }}>
      Todo “previsto” aqui é o mesmo padrão de <b>{textoDuracao(unica!)}</b> — ninguém cadastrou
      tempo por tarefa ainda. Leia a última coluna como “longe do padrão”, não como
      “a pessoa demorou”: a comparação só vira medição quando cada tarefa tiver o tempo dela.
    </Alerta>
  );
}

/**
 * O que ficou de fora e por quê. Fica ANTES da tabela porque muda como se lê a
 * tabela inteira: com 40% das ordens descartadas por "ninguém apertou iniciar",
 * a mediana ainda é a melhor estimativa possível — mas ela descreve as ordens
 * de quem usa o tablet direito, não a produção toda. E, ao contrário do número,
 * isto é ACIONÁVEL: dá pra cobrar o "iniciar" amanhã.
 */
function Descartes({ grupos, resumo }: { grupos: TempoDoProduto[]; resumo: Tempos["resumo"] }) {
  if (!resumo.ordensDescartadas) return null;

  const soma = {} as Record<MotivoDescarte, number>;
  for (const g of grupos) {
    for (const [m, n] of Object.entries(g.descartes) as [MotivoDescarte, number][]) {
      soma[m] = (soma[m] ?? 0) + n;
    }
  }
  const linhas = (Object.entries(soma) as [MotivoDescarte, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const pct = Math.round(resumo.fracaoDescartada * 100);
  const pesado = resumo.fracaoDescartada >= 0.3;

  return (
    <Alerta tom={pesado ? "atencao" : "info"} icone="filter" style={{ marginTop: 12 }}>
      <span>
        <b>{resumo.ordensDescartadas} ordens ({pct}%) ficaram de fora da conta.</b>{" "}
        {pesado
          ? "É muita coisa: os números abaixo descrevem as ordens bem registradas, não a produção inteira."
          : "Os números abaixo usam só o que dá para medir."}
      </span>
      <div style={{ marginTop: 8 }}>
        <VerMais label="Ver por quê">
          <ul className="hp-descartes">
            {linhas.map(([m, n]) => (
              <li key={m}><b>{n}</b> <span>{ROTULO_DESCARTE[m]}</span></li>
            ))}
          </ul>
        </VerMais>
      </div>
    </Alerta>
  );
}

function TabelaTempos({ grupos }: { grupos: TempoDoProduto[] }) {
  return (
    <div className="hp-tabela">
      <div className="tab-linha tab-linha-head hp-linha">
        <span>Produto / tarefa</span>
        <span>Por peça</span>
        <span>Por ordem</span>
        <span>Previsto</span>
        <span>Contra o previsto</span>
        <span>Ordens</span>
      </div>
      {grupos.map((g) => <LinhaTempo key={g.chave} g={g} />)}
    </div>
  );
}

function LinhaTempo({ g }: { g: TempoDoProduto }) {
  const sinal = classificarAderencia(g);
  return (
    <div className="tab-linha hp-linha" data-vazio={g.amostras === 0 ? "1" : undefined}>
      <div className="tl-titulo hp-nome">
        <span>{g.rotulo}</span>
        <span className="hp-cat">
          {g.ehProduto ? "produto" : "tarefa"}{g.categoria ? ` · ${g.categoria}` : ""}
        </span>
      </div>

      <div data-l="Por peça">
        {g.amostras ? (
          <>
            <b>{textoDuracao(g.medianaMinPorPeca)}</b>
            {g.mediaMinPorPeca > g.medianaMinPorPeca * 1.2 && (
              <span className="hp-nota" title="A média é bem maior que a mediana: há ordens muito lentas na ponta.">
                média {textoDuracao(g.mediaMinPorPeca)}
              </span>
            )}
          </>
        ) : <span className="hp-nota">—</span>}
      </div>

      <div data-l="Por ordem">
        {g.amostras ? <b>{textoDuracao(g.medianaOrdemMin)}</b> : <span className="hp-nota">—</span>}
      </div>

      <div data-l="Previsto">
        {g.estimadoMin ? textoDuracao(g.estimadoMin) : <span className="hp-nota">ninguém estimou</span>}
      </div>

      <div data-l="Contra o previsto" className="tl-largo">
        <span className="hp-pill" data-tom={sinal.tom}>{sinal.texto}</span>
      </div>

      <div data-l="Ordens">
        <b>{g.amostras}</b>
        {g.descartadas > 0 && <span className="hp-nota">{g.descartadas} fora</span>}
        {g.amostras > 0 && g.poucosDados && <span className="hp-nota">poucos dados</span>}
      </div>
    </div>
  );
}

/**
 * O sinal só é dado quando ele significa alguma coisa. Duas ordens medidas não
 * autorizam dizer "demora 40% mais": autorizam dizer "ainda não dá pra saber".
 */
function classificarAderencia(g: TempoDoProduto): { texto: string; tom: string } {
  if (!g.amostras) return { texto: "sem medição", tom: "vazio" };
  if (g.aderencia === null) return { texto: "sem estimativa", tom: "vazio" };
  if (g.poucosDados) return { texto: "poucos dados", tom: "vazio" };
  const dif = Math.round((g.aderencia - 1) * 100);
  if (g.aderencia > FOLGA_ADERENCIA) return { texto: `+${dif}% do previsto`, tom: "atencao" };
  if (g.aderencia < 2 - FOLGA_ADERENCIA) return { texto: `${dif}% do previsto`, tom: "ok" };
  return { texto: "no ponto", tom: "ok" };
}

// ── RASTRO ───────────────────────────────────────────────────────────────────

const TEXTO_DIRECAO: Record<Direcao, {
  botao: string; elo: string; entrada: string; vazio: string;
  /** Quando a corrente vem vazia PORQUE o §6 não rodou — e não porque acabou. */
  vazioSemVinculo?: string;
}> = {
  tras: {
    botao: "De onde veio",
    elo: "veio de",
    entrada: "material que entrou",
    // Andar pra trás depende de `estoque_conferencias`, que já está no banco:
    // vazio aqui é vazio de verdade, com ou sem o §6.
    vazio: "Esta caixa não tem produção registrada antes dela — ou é material comprado, ou entrou no estoque sem passar por conferência.",
  },
  frente: {
    botao: "Onde foi parar",
    elo: "virou",
    entrada: "o que saiu",
    vazio: "Esta caixa ainda não foi consumida por atividade nenhuma — está parada no estoque.",
    // Andar pra FRENTE é só `baixa_atividade_id`. Sem a coluna a resposta é
    // SEMPRE uma lista vazia — e a frase acima ("está parada no estoque") é uma
    // afirmação que ninguém pode fazer nesse estado. A tarja do §6 aparece logo
    // acima, mas as duas juntas se contradiziam: a tarja dizia "falta um elo" e
    // a frase dizia onde a caixa está. Aqui a corrente não terminou — ela nem
    // começou.
    vazioSemVinculo: "Não dá para saber onde esta caixa foi parar: a coluna que liga a baixa à atividade ainda não existe no banco (§6). Isto NÃO quer dizer que ela está parada no estoque — quer dizer que a pergunta não tem como ser respondida ainda.",
  },
};

function PainelRastro() {
  const [codigo, setCodigo] = useState("");
  const [direcao, setDirecao] = useState<Direcao>("tras");
  const [rastro, setRastro] = useState<Rastro | null>(null);
  const [buscado, setBuscado] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => { campo.current?.focus(); }, []);

  const buscar = useCallback(async (cod: string, dir: Direcao) => {
    const alvo = cod.trim();
    if (!alvo) return;
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/atividades/genealogia?codigo=${encodeURIComponent(alvo)}&direcao=${dir}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setRastro(await r.json() as Rastro);
      setBuscado(alvo);
    } catch {
      setErro("Não deu para ler a história desta etiqueta agora.");
      setRastro(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  function trocarDirecao(d: Direcao) {
    if (d === direcao) return;
    setDirecao(d);
    if (buscado) void buscar(buscado, d);
  }

  /** Puxar o fio a partir de outra caixa — é como se anda na corrente. */
  function seguir(u: UnidadeNo) {
    setCodigo(u.codigo);
    void buscar(u.codigo, direcao);
    campo.current?.focus();
  }

  const t = TEXTO_DIRECAO[direcao];

  return (
    <>
      <form className="hp-busca" onSubmit={(e) => { e.preventDefault(); void buscar(codigo, direcao); }}>
        <div className="hp-campo">
          <span className="hp-campo-ic"><Icon name="barcode" size={17} color="var(--text-dim)" /></span>
          <input
            ref={campo}
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            placeholder="Bipe ou digite o código da etiqueta"
            aria-label="Código da etiqueta"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
        </div>
        <Botao type="submit" variante="primario" icone="search" carregando={carregando}>Ver história</Botao>
      </form>

      <div className="tab-strip hp-periodos" role="group" aria-label="Direção do rastro" style={{ marginTop: 10 }}>
        {(["tras", "frente"] as const).map((d) => (
          <button key={d} onClick={() => trocarDirecao(d)} className="hp-aba" data-on={direcao === d ? "1" : undefined}>
            <Icon name={d === "tras" ? "arrow-back-up" : "arrow-forward-up"} size={15}
              color={direcao === d ? "var(--primary-texto)" : "var(--text-dim)"} />
            {TEXTO_DIRECAO[d].botao}
          </button>
        ))}
      </div>

      {erro && (
        <Alerta tom="perigo" style={{ marginTop: 12 }}>{erro}</Alerta>
      )}

      {!rastro && !erro && (
        <div className="hp-vazio">
          <Icon name="arrows-split" size={22} color="var(--text-dim)" />
          <div>
            <strong>A história de uma caixa começa pelo código dela.</strong>
            <p>
              <b>De onde veio</b> responde com a peça na mão: quem a fez, com que material, e quem fez
              o material. <b>Onde foi parar</b> é o contrário — descobriu-se que um lote veio ruim,
              e a pergunta é o que já saiu do galpão feito com ele.
            </p>
          </div>
        </div>
      )}

      {rastro && !rastro.raiz && (
        <div className="hp-vazio">
          <Icon name="circle-x" size={22} color="var(--text-dim)" />
          <div>
            <strong>Nenhuma etiqueta com o código “{buscado}”.</strong>
            <p>Confira o código impresso na caixa — ele é o mesmo que o tablet lê ao bipar.</p>
          </div>
        </div>
      )}

      {rastro?.raiz && (
        <div className="hp-rastro">
          {rastro.semVinculo && (
            <Alerta tom="atencao" style={{ marginTop: 12 }}>
              Falta rodar <b>supabase/estoque_pendente_tudo.sql</b> (§6). Sem a coluna que liga a baixa
              à atividade, a corrente perde o elo do <b>material consumido</b> — dá para ver quem fez
              cada etapa, não com o quê.
            </Alerta>
          )}

          <CaixaCard u={rastro.raiz} destaque />

          {rastro.niveis.length === 0 ? (
            <div className="hp-fim">
              {(rastro.semVinculo && TEXTO_DIRECAO[rastro.direcao].vazioSemVinculo) || TEXTO_DIRECAO[rastro.direcao].vazio}
            </div>
          ) : rastro.niveis.map((n) => (
            <div key={n.profundidade}>
              <div className="hp-elo">
                <Icon name={direcao === "tras" ? "arrow-back-up" : "arrow-forward-up"} size={14} color="var(--text-dim)" />
                {t.elo}
              </div>
              {n.elos.map((e) => (
                <div key={e.atividade.id} className="hp-ativ">
                  <div className="hp-ativ-top">
                    <Icon name="checklist" size={16} color="var(--primary-texto)" />
                    <div style={{ minWidth: 0 }}>
                      <strong>{e.atividade.tarefa}</strong>
                      <div className="hp-nota">
                        {e.atividade.quem ?? "sem responsável"}
                        {e.atividade.quando ? ` · ${dataHora(e.atividade.quando)}` : ""}
                        {e.atividade.categoria ? ` · ${e.atividade.categoria}` : ""}
                      </div>
                    </div>
                    {e.reprovada && (
                      <span className="hp-pill" data-tom="perigo">já foi reprovada</span>
                    )}
                  </div>

                  {e.unidades.length === 0 ? (
                    <div className="hp-nota" style={{ paddingLeft: 25 }}>
                      {rastro.semVinculo ? "material não registrado (falta o SQL)" : "nenhuma caixa registrada aqui"}
                    </div>
                  ) : (
                    <ul className="hp-caixas">
                      {e.unidades.map((u) => (
                        <li key={u.id}>
                          <CaixaCard u={u} rotulo={t.entrada} onSeguir={() => seguir(u)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ))}

          <div className="hp-rodape">
            {rastro.truncado && <span>A corrente pode continuar além disto — abra uma das caixas acima para seguir.</span>}
            <span>{rastro.consultas} consulta{rastro.consultas === 1 ? "" : "s"} ao banco.</span>
          </div>
        </div>
      )}
    </>
  );
}

function CaixaCard({ u, destaque, rotulo, onSeguir }: {
  u: UnidadeNo; destaque?: boolean; rotulo?: string; onSeguir?: () => void;
}) {
  return (
    <div className="hp-caixa" data-destaque={destaque ? "1" : undefined}>
      <div style={{ minWidth: 0, flex: 1 }}>
        {rotulo && <div className="hp-rot">{rotulo}</div>}
        <div className="hp-cod">
          {u.codigo}
          {u.pecas > 1 && <span className="hp-qtd">{u.pecas} un</span>}
        </div>
        <div className="hp-nota">
          {u.item ?? "item removido do catálogo"}
          {u.criadoPor ? ` · feita por ${u.criadoPor}` : ""}
          {u.criadoEm ? ` · ${dataHora(u.criadoEm)}` : ""}
        </div>
        {u.baixadoPor && (
          <div className="hp-nota">bipada por {u.baixadoPor}{u.baixadoEm ? ` · ${dataHora(u.baixadoEm)}` : ""}</div>
        )}
      </div>
      {onSeguir && (
        <Botao variante="sutil" tamanho="sm" icone="arrows-split" onClick={onSeguir}>
          Puxar o fio
        </Botao>
      )}
    </div>
  );
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

// ── Estilo ───────────────────────────────────────────────────────────────────
// Tudo em token semântico: as cores de status têm valor próprio nos dois temas
// (ver a nota de paleta no globals.css). Nada de hex solto aqui.
const CSS = `
.hp-voltar {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 13px; font-weight: 700; color: var(--text-dim); text-decoration: none;
  padding: 8px 12px 8px 8px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--surface);
}
/* O piso de 44px da fundação cobre BUTTON e uma lista fechada de links (rail,
   abas, barra de baixo) — um link novo fora dessa lista nasce com a altura do
   texto. Medido no navegador: 34px. Vai por pointer:coarse e não por largura
   porque o tablet do galpão tem 1024px E dedo. */
@media (pointer: coarse) { .hp-voltar { min-height: var(--tap); } }

.hp-abas, .hp-periodos { background: var(--seg-track); border: 1px solid var(--border); }
.hp-aba {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 14px; border-radius: 12px; border: none; cursor: pointer;
  background: transparent; color: var(--text-dim);
  font-size: 13.5px; font-weight: 700; white-space: nowrap;
}
.hp-aba[data-on="1"] { background: var(--seg-pill); color: var(--text); }

.hp-barra {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin-bottom: 14px;
}
.hp-barra > :last-child { margin-left: auto; }

.hp-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 10px; }
.hp-kpi {
  padding: 13px 14px; border-radius: 16px;
  border: 1px solid var(--border); background: var(--surface);
  display: flex; flex-direction: column; gap: 3px; min-width: 0;
}
.hp-kpi[data-tom="atencao"] { border-color: color-mix(in srgb, var(--atencao) 45%, transparent); }
.hp-kpi-top { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text-dim); }
.hp-kpi-top span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hp-kpi strong { font-size: 25px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; }
.hp-kpi-nota { font-size: 11.5px; color: var(--text-dim); line-height: 1.35; }

.hp-descartes { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 5px; }
.hp-descartes li { font-size: 12.5px; color: var(--text-dim); }
.hp-descartes b { color: var(--text); margin-right: 5px; }

.hp-vazio {
  display: flex; align-items: flex-start; gap: 12px;
  margin-top: 14px; padding: 20px; border-radius: 16px;
  border: 1px dashed var(--border); background: var(--surface);
}
.hp-vazio strong { font-size: 14.5px; font-weight: 800; }
.hp-vazio p { margin-top: 5px; font-size: 12.5px; color: var(--text-dim); line-height: 1.55; }

/* ── Tabela de tempos ─────────────────────────────────────────────────────── */
.hp-tabela { margin-top: 16px; display: flex; flex-direction: column; gap: 2px; }
.hp-linha {
  display: grid;
  grid-template-columns: minmax(0, 2.2fr) 108px 104px 104px 150px 92px;
  gap: 12px; align-items: center;
  padding: 12px 14px; border-radius: 14px; font-size: 13px;
}
/* Seis colunas não cabem numa janela estreita de computador (as cinco fixas
   somam 558px + folgas). Entre 701px e o mínimo confortável a fileira rola
   DENTRO do bloco — nunca a página. Abaixo de 700px isto sai de cena e a
   fundação transforma a linha em card. */
@media (min-width: 701px) {
  .hp-tabela { overflow-x: auto; }
  .hp-linha { min-width: 740px; }
}
.hp-linha:not(.tab-linha-head) { border: 1px solid var(--border); background: var(--surface); }
.tab-linha-head.hp-linha {
  padding: 0 14px 6px; font-size: 11px; font-weight: 700;
  color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.4px;
}
.hp-linha[data-vazio="1"] { opacity: 0.72; }
.hp-nome { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hp-nome > span:first-child { font-weight: 700; font-size: 13.5px; overflow-wrap: anywhere; }
.hp-cat { font-size: 11.5px; color: var(--text-dim); }
.hp-nota { display: block; font-size: 11.5px; color: var(--text-dim); line-height: 1.4; overflow-wrap: anywhere; }

.hp-pill {
  display: inline-block; padding: 3px 10px; border-radius: 999px;
  font-size: 11.5px; font-weight: 800; white-space: nowrap;
  border: 1px solid var(--border); color: var(--text-dim); background: var(--surface-2);
}
.hp-pill[data-tom="ok"]      { color: var(--ok);      border-color: color-mix(in srgb, var(--ok) 45%, transparent);      background: color-mix(in srgb, var(--ok) 12%, transparent); }
.hp-pill[data-tom="atencao"] { color: var(--atencao); border-color: color-mix(in srgb, var(--atencao) 50%, transparent); background: color-mix(in srgb, var(--atencao) 12%, transparent); }
.hp-pill[data-tom="perigo"]  { color: var(--perigo);  border-color: color-mix(in srgb, var(--perigo) 50%, transparent);  background: color-mix(in srgb, var(--perigo) 12%, transparent); }

/* ── Rastro ───────────────────────────────────────────────────────────────── */
.hp-busca { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap; }
.hp-campo { position: relative; flex: 1 1 240px; min-width: 0; }
.hp-campo-ic { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); display: grid; place-items: center; pointer-events: none; }
.hp-campo input {
  width: 100%; box-sizing: border-box; padding: 11px 13px 11px 38px;
  border-radius: 12px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text);
  font-size: 14px; font-weight: 600;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.hp-rastro { margin-top: 16px; display: flex; flex-direction: column; gap: 10px; }

.hp-elo {
  display: flex; align-items: center; gap: 6px;
  margin: 4px 0 8px 4px;
  font-size: 11.5px; font-weight: 700; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.5px;
}

.hp-ativ {
  padding: 13px 14px; border-radius: 16px;
  border: 1px solid var(--border); background: var(--surface);
}
.hp-ativ + .hp-ativ { margin-top: 8px; }
.hp-ativ-top { display: flex; align-items: flex-start; gap: 9px; flex-wrap: wrap; }
.hp-ativ-top strong { font-size: 14px; font-weight: 800; overflow-wrap: anywhere; }
.hp-ativ-top > .hp-pill { margin-left: auto; }

.hp-caixas { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; }

.hp-caixa {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 12px; border-radius: 13px;
  border: 1px solid var(--border); background: var(--surface-2);
}
.hp-caixa[data-destaque="1"] {
  background: color-mix(in srgb, var(--primary) 10%, var(--surface));
  border-color: color-mix(in srgb, var(--primary) 40%, transparent);
  padding: 14px 15px; border-radius: 16px;
}
.hp-caixa > :last-child { flex: none; }
.hp-rot { font-size: 10.5px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
.hp-cod {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13.5px; font-weight: 700; overflow-wrap: anywhere;
}
.hp-qtd {
  display: inline-block; margin-left: 7px; padding: 1px 7px; border-radius: 999px;
  font-size: 11px; font-weight: 800; color: var(--primary-texto); white-space: nowrap;
  background: color-mix(in srgb, var(--primary) 15%, transparent);
}

.hp-fim {
  padding: 14px; border-radius: 14px; font-size: 12.5px; line-height: 1.55;
  color: var(--text-dim); border: 1px dashed var(--border); background: var(--surface);
}
.hp-rodape {
  display: flex; gap: 10px; flex-wrap: wrap; margin-top: 4px;
  font-size: 11.5px; color: var(--text-dim); line-height: 1.5;
}

@media (max-width: 700px) {
  /* A tabela vira card pela fundação (.tab-linha + data-l). O que sobra aqui é
     só o que a fundação não tem como saber: o nome ocupa a linha inteira e a
     grade some. */
  .hp-linha { grid-template-columns: 1fr 1fr !important; }
  .hp-barra > :last-child { margin-left: 0; }
  .hp-barra { gap: 8px; }
  /* Árvore com recuo por nível é ilegível a 320px: cada elo comeria 16px e o
     quarto nível caberia em nada. Os níveis viram uma PILHA, e quem diz a
     direção é a etiqueta entre eles. */
  .hp-caixa { align-items: flex-start; }
  .hp-caixa > :last-child { width: 100%; }
  .hp-busca > button { width: 100%; }
}
`;
