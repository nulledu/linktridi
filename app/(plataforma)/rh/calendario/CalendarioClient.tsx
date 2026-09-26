"use client";

// RH → Calendário, no desenho do Financeiro.
//
// Cinco blocos, e cada um responde uma pergunta:
//   cabeçalho  — onde estou e o que posso fazer (novo evento, feriados)
//   hoje       — que dia é e o que acontece hoje
//   filtros    — que tipos quero ver (os chips SÃO a legenda)
//   navegação  — mês/ano/agenda, ‹ mês ›, Hoje
//   conteúdo   — a visão escolhida + "Próximos eventos" ao lado
//
// O ano inteiro chega pronto do servidor (`Acontecimento[]`). Trocar de mês é
// estado local; trocar de ano é navegação (`?ano=`), porque é o servidor que
// funde feriados e expande recorrência — e uma ida por ano é barata. Nenhum
// poll: o que muda aqui muda por gesto da pessoa, e depois de gravar é
// `router.refresh()`.

import "./calendario.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PoderesRh } from "@/lib/rh/gate";
import type { ColaboradorRh } from "@/lib/rh/tipos";
import {
  LEGENDA, TIPOS_ACONTECIMENTO, TIPOS_DE_PESSOA, contarPorTipo, ehTipoDePessoa,
  type Acontecimento, type SyncFeriados, type TipoAcontecimento,
} from "@/lib/rh/calendario/tipos";
import type { FeriadoNoPonto } from "@/lib/jornada/feriados-regra";
import { doDia, filtrar, proximos } from "@/lib/rh/calendario/montar";
import { anosNavegaveis, diaComSemana, diaPorExtenso, mesCarimbo, mesPorExtenso, partes } from "@/lib/rh/calendario/datas";
import { useSticky } from "../../useSticky";
import { useParamDaUrl } from "../../ui/useParamDaUrl";
import { useIsMobile } from "../../ui/useMediaQuery";
import { Icon } from "../../Icon";
import { Botao, BotaoIcone, Chips, PainelLateral } from "../../ui/controles";
import { GlassSelect } from "../../GlassPicker";
import { NumeroVivo } from "../../ui/micro";
import { toast, confirmar } from "../../Toast";
import { AvisoSchema, Cabecalho, Cartao, Filtro, Filtros, LimparFiltros, NotaRodape, Vazio } from "../../financeiro/ui";
import { TrocaDeVisao } from "../../financeiro/blocos";
import { VisaoMes } from "./VisaoMes";
import { VisaoAno } from "./VisaoAno";
import { VisaoAgenda } from "./VisaoAgenda";
import { DetalheDoAcontecimento, ListaDeAcontecimentos } from "./pecas";
import { FormularioEvento, rascunhoDe, rascunhoNovo, type Rascunho } from "./FormularioEvento";
import { GerenciarFeriados } from "./GerenciarFeriados";

type Visao = "mes" | "ano" | "agenda";
const TODOS_OS_TIPOS = [...TIPOS_ACONTECIMENTO];
// O padrão da legenda NÃO é "tudo": as três camadas de pessoa (férias, folga
// compensatória, feriado trabalhado) nascem desligadas. Numa empresa de 50
// pessoas elas encheriam toda célula de setembro com "Fulano de férias", e o
// calendário existe pra responder "o que tem nesse dia" de longe. Elas acendem
// sozinhas quando o filtro escolhe uma pessoa ou um setor — ver `focoEmPessoa`.
const TIPOS_PADRAO = TODOS_OS_TIPOS.filter((t) => !ehTipoDePessoa(t));

export function CalendarioClient({ ano, hoje, acontecimentos, colaboradores, setores, sync, poderes, schemaPendente, feriadosPendentes = [], feriadosNoPonto = [] }: {
  ano: number;
  hoje: string;
  acontecimentos: Acontecimento[];
  colaboradores: ColaboradorRh[];
  setores: string[];
  sync: SyncFeriados | null;
  poderes: PoderesRh;
  schemaPendente: boolean;
  feriadosPendentes?: FeriadoNoPonto[];
  feriadosNoPonto?: FeriadoNoPonto[];
}) {
  const router = useRouter();
  const celular = useIsMobile();
  const anoDeHoje = partes(hoje).ano;

  // ── Estado de navegação ────────────────────────────────────────────────────
  const [visao, setVisao] = useSticky<Visao>("rh.cal.visao", "mes");
  const [mes, setMes] = useState<number>(ano === anoDeHoje ? partes(hoje).mes : 1);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  // ── Filtros (os chips são a legenda) ───────────────────────────────────────
  // `useSticky` guarda string: a seleção viaja como "a,b,c".
  // A chave mudou de "rh.cal.tipos" pra "rh.cal.tipos2" porque o PADRÃO mudou:
  // quem já tinha a lista antiga gravada no navegador continuaria com as três
  // camadas novas ligadas, que é exatamente o que este padrão evita.
  const [tiposStr, setTiposStr] = useSticky<string>("rh.cal.tipos2", TIPOS_PADRAO.join(","));
  const tipos = useMemo(
    () => tiposStr === "" ? [] : (tiposStr.split(",").filter((t): t is TipoAcontecimento => (TODOS_OS_TIPOS as string[]).includes(t))),
    [tiposStr],
  );
  const setTipos = (v: TipoAcontecimento[]) => setTiposStr(v.join(","));
  const [setor, setSetor] = useState("");
  const [pessoa, setPessoa] = useState("");
  useParamDaUrl("setor", setSetor);
  useParamDaUrl("pessoa", setPessoa);
  const filtroAtivo = tipos.length !== TIPOS_PADRAO.length || !!setor || !!pessoa;
  const limpar = () => { setTipos(TIPOS_PADRAO); setSetor(""); setPessoa(""); };

  // ── As camadas de pessoa acendem quando o foco vira uma pessoa ─────────────
  // Só na TRANSIÇÃO de "sem foco" para "com foco", e o contrário. No meio do
  // caminho a pessoa manda: quem desmarcar "Férias" com um setor escolhido
  // continua sem férias na tela até mudar de filtro.
  const focoEmPessoa = !!setor || !!pessoa;
  const focoAntes = useRef(focoEmPessoa);
  useEffect(() => {
    if (focoAntes.current === focoEmPessoa) return;
    focoAntes.current = focoEmPessoa;
    const semPessoa = tipos.filter((t) => !ehTipoDePessoa(t));
    setTiposStr((focoEmPessoa ? [...semPessoa, ...TIPOS_DE_PESSOA] : semPessoa).join(","));
    // `tipos` de propósito fora das dependências: ele muda a cada clique nos
    // chips, e reagir a isso desfaria a escolha da pessoa no clique seguinte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoEmPessoa]);

  const filtrados = useMemo(() => filtrar(acontecimentos, { tipos, setor, pessoa }), [acontecimentos, tipos, setor, pessoa]);
  const porDia = useMemo(() => {
    const m = new Map<string, Acontecimento[]>();
    for (const a of filtrados) m.set(a.dia, [...(m.get(a.dia) ?? []), a]);
    return m;
  }, [filtrados]);
  const contagem = useMemo(() => contarPorTipo(acontecimentos), [acontecimentos]);
  const deHoje = useMemo(() => doDia(filtrados, hoje), [filtrados, hoje]);
  const proximosItens = useMemo(() => proximos(filtrados.filter((a) => a.dia > hoje), hoje, 8), [filtrados, hoje]);

  // ── Painéis ───────────────────────────────────────────────────────────────
  const [aberto, setAberto] = useState<Acontecimento | null>(null);
  const [form, setForm] = useState<Rascunho | null>(null);
  const [feriadosAberto, setFeriadosAberto] = useState(false);
  const podeCriar = poderes.calendarioEditar || poderes.calendarioSetores;

  useParamDaUrl("novo", () => {
    if (podeCriar) setForm(rascunhoNovo(hoje, poderes.calendarioEditar ? "evento" : "setor"));
    const url = new URL(window.location.href);
    url.searchParams.delete("novo");
    window.history.replaceState(window.history.state, "", url);
  });

  const recarregar = useCallback(() => { setForm(null); setFeriadosAberto(false); setAberto(null); router.refresh(); }, [router]);

  // ── Navegação de mês/ano ───────────────────────────────────────────────────
  const irParaAno = useCallback((a: number, m?: number) => {
    if (a === ano) { if (m) setMes(m); return; }
    setMes(m ?? (a === anoDeHoje ? partes(hoje).mes : 1));
    router.push(`/rh/calendario?ano=${a}`);
  }, [ano, anoDeHoje, hoje, router]);
  const andarMes = (passo: 1 | -1) => {
    const t = mes + passo;
    if (t < 1) irParaAno(ano - 1, 12);
    else if (t > 12) irParaAno(ano + 1, 1);
    else setMes(t);
  };
  const irParaHoje = () => { setEscolhido(hoje); irParaAno(anoDeHoje, partes(hoje).mes); };

  // No computador escolher o dia abre o painel do dia; no celular a lista
  // aparece sob a grade (o `VisaoMes` desenha). Um clique no mesmo dia fecha.
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const escolherDia = (dia: string) => {
    setEscolhido((atual) => (atual === dia ? null : dia));
    if (!celular) setDiaAberto(dia);
  };
  useEffect(() => { if (celular) setDiaAberto(null); }, [celular]);

  // ── Ações sobre um acontecimento ───────────────────────────────────────────
  const apagar = async (a: Acontecimento) => {
    if (!a.id) return;
    const ok = await confirmar(`Apagar "${a.titulo}"?`, { detalhe: a.recorrencia === "anual" ? "Some de todos os anos." : undefined, perigo: true });
    if (!ok) return;
    const rota = a.tipo === "setor" ? "/api/rh/calendario/setores" : "/api/rh/calendario/eventos";
    const r = await fetch(`${rota}?id=${encodeURIComponent(a.id)}`, { method: "DELETE" });
    const j = (await r.json().catch(() => ({}))) as { erro?: string };
    if (!r.ok) { toast(j.erro ?? "Não foi possível apagar.", "erro"); return; }
    toast("Apagado.");
    recarregar();
  };
  const alternarSetor = async (a: Acontecimento, ativo: boolean) => {
    if (!a.id) return;
    const r = await fetch("/api/rh/calendario/setores", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, ativo }),
    });
    const j = (await r.json().catch(() => ({}))) as { erro?: string };
    if (!r.ok) { toast(j.erro ?? "Não foi possível alterar.", "erro"); return; }
    toast(ativo ? "Data ativada." : "Data desativada.");
    recarregar();
  };

  const opcoesAno = anosNavegaveis(anoDeHoje).map((a) => ({ value: String(a), label: String(a) }));
  if (!opcoesAno.some((o) => o.value === String(ano))) opcoesAno.push({ value: String(ano), label: String(ano) });

  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  // A faixa mostra POUCO de propósito: quatro pílulas cabem numa tela de
  // notebook ao lado do "Próximos" e do "Ver agenda". Com seis (mais os de
  // hoje) a fileira passava da direita da tela e o resto só existia pra quem
  // descobrisse que ela rola. Quem quer a lista inteira clica em "Ver agenda".
  const proximosCurto = proximosItens.slice(0, Math.max(0, 4 - deHoje.length));

  return (
    <div style={{ minWidth: 0 }}>
      <Cabecalho tarja="RH" titulo="Calendário" sub="Aniversários, feriados, datas dos setores e eventos internos." />

      {schemaPendente && <AvisoSchema modulo="RH · Calendário" arquivo="supabase/rh_calendario.sql" />}

      {/* ── Feriado esperando decisão ────────────────────────────────────────
          Um feriado pendente NÃO conta como folga no Ponto: enquanto ninguém
          decide, quem não trabalhou naquele dia aparece devendo a jornada. É
          por isso que a faixa fica aqui em cima e não escondida num painel. */}
      {poderes.calendarioFeriados && feriadosPendentes.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <NotaRodape icone="help-circle" destaque>
            {feriadosPendentes.length === 1
              ? `1 feriado de ${ano} espera a sua decisão`
              : `${feriadosPendentes.length} feriados de ${ano} esperam a sua decisão`}
            {" — enquanto isso eles não valem como folga no Ponto. "}
            <button type="button" onClick={() => setFeriadosAberto(true)}
              style={{ background: "none", border: 0, padding: 0, font: "inherit", fontWeight: 700, color: "var(--primary-texto)", cursor: "pointer", textDecoration: "underline", minHeight: "var(--tap)" }}>
              Decidir agora
            </button>
          </NotaRodape>
        </div>
      )}

      {sync && !sync.ok && (
        <div style={{ marginBottom: 14 }}>
          <NotaRodape icone="alert-triangle" destaque>
            Não foi possível atualizar os feriados pela fonte externa. Os últimos dados disponíveis continuam sendo exibidos.
          </NotaRodape>
        </div>
      )}

      {/* ── Hoje + próximos: UMA faixa fina. O calendário é a tela; isto é
          o rodapé de relance que fica em cima dele. ── */}
      <div className="rhcal-faixa-topo">
        <button type="button" onClick={irParaHoje} title="Ir para hoje" className="rhcal-hoje-btn">
          <span aria-hidden className="rhcal-hoje-carimbo">
            <strong>{partes(hoje).d}</strong>
            <small>{diaPorExtenso(hoje).split(" de ")[1].slice(0, 3)}</small>
          </span>
          <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-.01em", whiteSpace: "nowrap" }}>{diaComSemana(hoje)}</strong>
            <span style={{ fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap" }}>
              {deHoje.length === 0 ? "Nada marcado hoje" : (
                <><NumeroVivo valor={deHoje.length} /> {deHoje.length === 1 ? "acontecimento hoje" : "acontecimentos hoje"}</>
              )}
            </span>
          </span>
        </button>

        <div className="rhcal-proximos">
          <span className="rhcal-proximos-rot">Próximos</span>
          <ul className="tab-strip rhcal-proximos-lista">
            {[...deHoje, ...proximosCurto].map((a) => {
              const l = LEGENDA[a.tipo];
              return (
                <li key={a.chave} style={{ flex: "none" }}>
                  <button type="button" onClick={() => setAberto(a)} className="rhcal-proximo" style={{ "--rhcal-cor": l.cor } as React.CSSProperties} title={`${a.titulo} · ${a.sub ?? ""}`}>
                    <span className="rhcal-proximo-dia">{a.dia === hoje ? "hoje" : `${partes(a.dia).d} ${mesCarimbo(a.dia).toLowerCase()}`}</span>
                    <Icon name={l.icone} size={13} color={l.cor} />
                    <span className="rhcal-proximo-titulo">{a.titulo}</span>
                  </button>
                </li>
              );
            })}
            {deHoje.length + proximosCurto.length === 0 && (
              <li style={{ fontSize: 12.5, color: "var(--text-dim)", alignSelf: "center" }}>Nada marcado daqui pra frente</li>
            )}
          </ul>
          {/* "Ver agenda" fica FORA da fileira que rola: dentro dela, era a
              primeira coisa a sair pela direita — justo a saída pra quem quer
              ver o que não coube. */}
          <Botao tamanho="sm" variante="sutil" iconeFim="arrow-right" onClick={() => setVisao("agenda")} style={{ flex: "none" }}>Ver agenda</Botao>
        </div>
      </div>

      {/* ── A barra do calendário: navegação à esquerda, ações à direita ── */}
      <div className="rhcal-barra">
        <div className="rhcal-barra-nav">
          <TrocaDeVisao<Visao>
            valor={visao}
            aoTrocar={setVisao}
            opcoes={[
              { id: "mes", icone: "layout-grid", titulo: "Visão mensal" },
              { id: "ano", icone: "calendar", titulo: "Visão anual" },
              { id: "agenda", icone: "layout-list", titulo: "Agenda" },
            ]}
          />
          {visao === "mes" ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 2, flex: "none" }}>
              <BotaoIcone icone="chevron-left" titulo="Mês anterior" onClick={() => andarMes(-1)} />
              <strong className="rhcal-barra-titulo">{mesPorExtenso(ano, mes)}</strong>
              <BotaoIcone icone="chevron-right" titulo="Mês seguinte" onClick={() => andarMes(1)} />
            </div>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 2, flex: "none" }}>
              <BotaoIcone icone="chevron-left" titulo="Ano anterior" onClick={() => irParaAno(ano - 1)} />
              <GlassSelect value={String(ano)} onChange={(v) => irParaAno(Number(v))} options={opcoesAno} style={{ minWidth: 92 }} title="Ano" />
              <BotaoIcone icone="chevron-right" titulo="Ano seguinte" onClick={() => irParaAno(ano + 1)} />
            </div>
          )}
          <Botao tamanho="sm" onClick={irParaHoje}>Hoje</Botao>
        </div>
        <div className="rhcal-barra-acoes">
          <Botao tamanho="sm" icone="filter" iconeFim={filtrosAbertos ? "chevron-up" : "chevron-down"} onClick={() => setFiltrosAbertos((v) => !v)} aria-expanded={filtrosAbertos}>
            Filtros{filtroAtivo ? " •" : ""}
          </Botao>
          {poderes.calendarioFeriados && (
            <Botao tamanho="sm" icone="flag" onClick={() => setFeriadosAberto(true)}>Feriados</Botao>
          )}
          {podeCriar && (
            <Botao tamanho="sm" variante="primario" icone="plus" onClick={() => setForm(rascunhoNovo(escolhido ?? hoje, poderes.calendarioEditar ? "evento" : "setor"))}>
              Novo evento
            </Botao>
          )}
        </div>
      </div>

      {/* ── Filtros = legenda. Os chips ficam sempre à vista (são a legenda);
          setor e colaborador abrem sob demanda. ── */}
      <div className="rhcal-legenda">
        <Chips
          rotulo="Mostrar tipos de acontecimento"
          valor={tipos}
          onMuda={setTipos}
          opcoes={TIPOS_ACONTECIMENTO.map((t) => ({
            valor: t,
            conta: contagem[t] ?? 0,
            rotulo: (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: LEGENDA[t].cor, flex: "none" }} />
                {LEGENDA[t].label}
              </span>
            ),
          }))}
        />
      </div>
      {filtrosAbertos && (
        <Cartao padding={14} estatico style={{ marginBottom: 14, animation: "pageIn var(--duration-quick, 150ms) var(--ease-out, ease-out) both" }}>
          <Filtros>
            <Filtro rotulo="Setor" valor={setor} aoMudar={setSetor} opcoes={setores.map((s) => ({ valor: s, label: s }))} />
            <Filtro rotulo="Colaborador" valor={pessoa} aoMudar={setPessoa}
              opcoes={colaboradores.filter((c) => c.situacao !== "desligado").map((c) => ({ valor: c.id, label: c.nome }))} />
            <LimparFiltros ativo={filtroAtivo} aoLimpar={limpar} />
          </Filtros>
        </Cartao>
      )}

      {/* ── O calendário, na largura toda ── */}
      <div style={{ minWidth: 0 }}>
        {visao === "mes" && (
          <VisaoMes ano={ano} mes={mes} hoje={hoje} porDia={porDia} escolhido={escolhido} aoEscolher={escolherDia} aoAbrir={setAberto} />
        )}
        {visao === "ano" && (
          <VisaoAno ano={ano} hoje={hoje} porDia={porDia} aoAbrirMes={(m) => { setMes(m); setVisao("mes"); }} />
        )}
        {visao === "agenda" && (
          <VisaoAgenda ano={ano} hoje={hoje} lista={filtrados} aoAbrir={setAberto} />
        )}
        {visao === "mes" && filtrados.length === 0 && (
          <div style={{ marginTop: 14 }}>
            <Cartao estatico>
              <Vazio icone="calendar-off" titulo="Nenhum evento neste período" detalhe={filtroAtivo ? "Nada bate com os filtros escolhidos." : "Nada marcado neste ano ainda."} acao={filtroAtivo ? <Botao icone="x" onClick={limpar}>Limpar filtros</Botao> : undefined} />
            </Cartao>
          </div>
        )}
      </div>

      {/* ── Painéis ── */}
      {diaAberto && !celular && (
        <PainelDoDia
          dia={diaAberto} hoje={hoje} lista={porDia.get(diaAberto) ?? []}
          onFechar={() => setDiaAberto(null)}
          aoAbrir={(a) => { setDiaAberto(null); setAberto(a); }}
          aoCriar={podeCriar ? () => { setDiaAberto(null); setForm(rascunhoNovo(diaAberto, poderes.calendarioEditar ? "evento" : "setor")); } : undefined}
        />
      )}

      {aberto && (
        <DetalheDoAcontecimento
          a={aberto}
          poderes={poderes}
          onFechar={() => setAberto(null)}
          aoEditar={(a) => { setAberto(null); setForm(rascunhoDe(a)); }}
          aoApagar={apagar}
          aoAlternar={alternarSetor}
        />
      )}

      {form && (
        <FormularioEvento
          inicial={form}
          poderes={poderes}
          colaboradores={colaboradores}
          setores={setores}
          onFechar={() => setForm(null)}
          aoSalvar={recarregar}
        />
      )}

      {feriadosAberto && (
        <GerenciarFeriados ano={ano} feriados={acontecimentos} sync={sync} onFechar={() => setFeriadosAberto(false)} aoMudar={recarregar}
          noPonto={feriadosNoPonto} podeDecidir={poderes.calendarioFeriados} />
      )}
    </div>
  );
}

/** O painel do dia (computador): a lista do que acontece naquele dia. */
function PainelDoDia({ dia, hoje, lista, onFechar, aoAbrir, aoCriar }: {
  dia: string; hoje: string; lista: Acontecimento[]; onFechar: () => void;
  aoAbrir: (a: Acontecimento) => void; aoCriar?: () => void;
}) {
  return (
    <PainelLateral
      titulo={diaComSemana(dia)}
      subtitulo={lista.length ? `${lista.length} ${lista.length === 1 ? "acontecimento" : "acontecimentos"}` : "Nada marcado"}
      onFechar={onFechar}
      largura={420}
      rodape={aoCriar ? <Botao variante="primario" icone="plus" bloco onClick={aoCriar}>Novo evento neste dia</Botao> : undefined}
    >
      <ListaDeAcontecimentos lista={lista} hoje={hoje} aoAbrir={aoAbrir} semData
        vazio={<Vazio compacto icone="calendar-off" titulo="Nenhum evento neste dia" />} />
    </PainelLateral>
  );
}
