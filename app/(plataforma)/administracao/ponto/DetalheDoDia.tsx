"use client";

// ── Painel da pessoa escolhida (coluna da direita) ───────────────────────────
// A gaveta respondia "tudo sobre a Bia" — mas cobria a lista pra isso. Quem
// confere o ponto da equipe não olha UMA pessoa: olha a fila, para numa, volta
// pra fila. Abrir e fechar gaveta sete vezes pra conferir sete pessoas é o
// custo que este painel tira.
//
// Ele responde a pergunta curta ("o dia dela está de pé?") sem tirar ninguém de
// onde estava. A pergunta longa — calendário do mês, justificar, pagar horas —
// continua na gaveta, atrás do botão do rodapé. Dois degraus, não dois lugares.
//
// Uma leitura por pessoa escolhida, e só por clique: `/api/ponto/banco-horas`
// é a consulta cara do módulo e não pode entrar em ciclo nenhum.

import { useEffect, useRef, useState } from "react";
import { Icon } from "../../Icon";
import { Skeleton } from "../../Skeleton";
import { Avatar } from "../../ui/Avatar";
import { Botao, BotaoIcone } from "../../ui/controles";
import type { BancoResumo, DiaBanco, ClasseDia } from "@/lib/banco-horas";
import { fundoDaClasse, problemaDoDia, ROTULO_PROBLEMA } from "@/lib/jornada/tipos";
import type { StatusPessoa, TipoBatida } from "@/lib/ponto";
import "./ponto-numeros.css";

const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const mesSP = () => hojeSP().slice(0, 7);
const dataBR = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const fmtHoras = (min: number) => { const a = Math.max(0, Math.round(min)); return `${Math.floor(a / 60)}h${String(a % 60).padStart(2, "0")}`; };
const fmtSaldo = (min: number) => { const s = min < 0 ? "−" : "+"; const a = Math.abs(min); return `${s}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`; };
const minDoRelogio = (v: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec((v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};

// ── Como cada dia se chama na lista ──────────────────────────────────────────
// A mesma classe que o calendário do banco já usa, traduzida pra um rótulo e
// uma cor. Fica aqui (e não numa `const` do render) porque a lista e a régua do
// topo têm que dizer a mesma coisa sobre o mesmo dia.
const CLASSE: Partial<Record<ClasseDia, { rotulo: string; cor: string }>> = {
  trabalhado: { rotulo: "Completo", cor: "var(--ok)" },
  andamento: { rotulo: "Em andamento", cor: "var(--info)" },
  parcial: { rotulo: "Parcial", cor: "var(--atencao)" },
  aberto: { rotulo: "Em aberto", cor: "var(--atencao)" },
  falta: { rotulo: "Falta", cor: "var(--perigo)" },
  justificada: { rotulo: "Justificada", cor: "var(--info)" },
  folga: { rotulo: "Folga", cor: "var(--text-dim)" },
  feriado: { rotulo: "Feriado", cor: "var(--text-dim)" },
  // Os três que o motor de jornada trouxe. Faltando aqui, o dia aparecia SEM
  // etiqueta nenhuma — e antes deles existirem aparecia como "Falta", que é
  // pior: o gestor cobrava presença de quem estava de férias.
  ferias: { rotulo: "Férias", cor: "var(--azul)" },
  atestado: { rotulo: "Atestado", cor: "var(--atencao)" },
  compensada: { rotulo: "Compensado", cor: "var(--roxo)" },
};

/** "ref. 15/09" — o outro dia do par, que é o que explica a folga. */
const refDoPar = (d: DiaBanco) =>
  d.compensacao ? `ref. ${d.compensacao.outroDia.slice(8, 10)}/${d.compensacao.outroDia.slice(5, 7)}` : null;

// Como cada tipo de batida se apresenta. Os SEIS que `TipoBatida` declara —
// `intervalo_inicio` e `intervalo_fim` faltavam aqui, e por isso a pausa curta
// não aparecia na régua: a pessoa batia duas vezes e a tela não mostrava
// nenhuma das duas.
const MOMENTO: Record<TipoBatida, { rotulo: string; icone: string; cor: string }> = {
  entrada:          { rotulo: "Entrada", icone: "chevron-up",      cor: "var(--ok)" },
  almoco:           { rotulo: "Almoço",  icone: "hourglass-high",  cor: "var(--atencao)" },
  retorno:          { rotulo: "Retorno", icone: "chevron-up",      cor: "var(--info)" },
  saida:            { rotulo: "Saída",   icone: "chevron-down",    cor: "var(--perigo)" },
  intervalo_inicio: { rotulo: "Pausa",   icone: "player-pause",    cor: "var(--atencao)" },
  intervalo_fim:    { rotulo: "Volta",   icone: "player-play",     cor: "var(--info)" },
};

// A jornada COMUM, na ordem em que acontece. Enquanto o dia couber nela, a
// régua mostra os quatro lugares mesmo vazios: ela só diz "falta bater a
// saída" porque o lugar da saída existe e está em branco — uma lista que
// mostra apenas o que já bateu esconde justamente o que falta.
const MOMENTOS = ["entrada", "almoco", "retorno", "saida"] as const;
const CANONICOS = new Set<TipoBatida>(MOMENTOS);

/** A janela do dia: "08:03 – 17:02" quando a pessoa já bateu a SAÍDA, e só
 *  "08:03" enquanto o dia está aberto. Fechar a janela com a última batida
 *  qualquer é o que fazia o painel dizer "08:03 – 13:00" pra quem tinha acabado
 *  de voltar do almoço — lido como "foi embora às 13h". */
function janelaDoDia(d: DiaBanco | null): { de: string; ate: string | null } | null {
  const de = d?.batidas[0]?.hora;
  if (!de) return null;
  const saida = d!.batidas.filter((b) => b.tipo === "saida").pop();
  // Dia reconstruído (faltou uma batida do meio): a última batida É a saída,
  // mesmo que o rótulo dela, que sai da ordem, diga "retorno".
  const reconstruido = d!.reconciliacao?.nivel === "inconsistente";
  return { de, ate: saida?.hora ?? (reconstruido ? d!.batidas[d!.batidas.length - 1].hora : null) };
}

/** Atraso de um dia: primeira batida depois da entrada prevista + a tolerância
 *  de 5 min do banco de horas. Dia sem batida não é atraso — é falta, e falta
 *  já tem contador próprio. */
function atrasouNoDia(d: DiaBanco, entradaPrevista: string | null): boolean {
  const prev = minDoRelogio(entradaPrevista);
  const primeira = d.batidas.find((b) => b.tipo === "entrada") ?? d.batidas[0];
  const bateu = minDoRelogio(primeira?.hora);
  return prev != null && bateu != null && bateu - prev > 5;
}

export function DetalheDoDia({ pessoaId, nome, fotoUrl, situacao, entradaPrevista, saidaPrevista, status, podeGerir, rotuloDaBatida, onBater, onEditar, onAbrirTudo, onAbrirDia, geracao = 0, mostrarBanco = true, numerosEmLinha = false }: {
  pessoaId: string;
  nome: string;
  fotoUrl: string | null;
  /** Pílula de situação do momento, vinda da lista (que faz poll). */
  situacao?: React.ReactNode;
  entradaPrevista: string | null;
  saidaPrevista: string | null;
  status: StatusPessoa | null;
  podeGerir: boolean;
  rotuloDaBatida: (p: StatusPessoa) => string;
  onBater?: (p: StatusPessoa) => Promise<void> | void;
  onEditar?: () => void;
  /** Abre a gaveta com o banco de horas inteiro (calendário, justificar, pagar). */
  onAbrirTudo: () => void;
  /** Abre a gaveta JÁ no dia tocado no calendário. Sem isso, cai no `onAbrirTudo`. */
  onAbrirDia?: (dia: string) => void;
  /** Muda quando algo de fora mexeu nas batidas — força reler o mês. */
  geracao?: number;
  /**
   * Mostrar o SALDO do banco de horas ao lado de "Registro de ponto".
   *
   * `true` aqui no painel da equipe, onde quem abre já tem a área do ponto
   * inteira. A ficha do RH passa `false` para quem tem `rh:ponto` e não tem
   * `rh:banco_horas`: são duas chaves separadas de propósito — ver as batidas
   * de alguém é uma coisa, ver o saldo que vira dinheiro na folha é outra.
   */
  mostrarBanco?: boolean;
  /**
   * Os quatro números numa linha só A PARTIR DE 1000px de janela.
   *
   * O padrão (`false`) é a decisão da coluna estreita explicada abaixo, e ela
   * continua valendo aqui no painel da equipe. A ficha do RH monta esta mesma
   * peça num pop-up de 1180px, onde 2×2 deixa metade da fileira vazia — lá ela
   * pede `true`, e abaixo de 1000px ela volta sozinha a 2×2 (`ponto-numeros.css`).
   * Forçar quatro sempre cortava "08:03 – 16:40" ao meio num celular.
   */
  numerosEmLinha?: boolean;
}) {
  const [banco, setBanco] = useState<BancoResumo | null>(null);
  const [erro, setErro] = useState(false);
  const [batendo, setBatendo] = useState(false);

  // Por CLIQUE, não por ciclo. Trocar de pessoa é uma leitura; ficar com o
  // painel aberto não é leitura nenhuma.
  //
  // RELER NÃO APAGA O QUE JÁ ESTÁ NA TELA. O `setBanco(null)` de antes valia
  // também pro `geracao` (qualquer batida/ajuste feito por fora): os seis
  // "últimos registros" viravam uma linha de "carregando", o painel murchava
  // uns 150px e — como ele e a lista dividem a MESMA linha da grade — a lista
  // ao lado encolhia junto e voltava um instante depois. Era esse o pulo. Só
  // trocar de PESSOA zera, porque aí o mês desenhado é de outra gente.
  const pessoaDesenhada = useRef(pessoaId);
  useEffect(() => {
    let vivo = true;
    if (pessoaDesenhada.current !== pessoaId) { setBanco(null); pessoaDesenhada.current = pessoaId; }
    setErro(false);
    fetch(`/api/ponto/banco-horas?pessoaId=${encodeURIComponent(pessoaId)}&mes=${mesSP()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!vivo) return; if (j?.banco) setBanco(j.banco); else setErro(true); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [pessoaId, geracao]);

  const hoje = hojeSP();
  const dias = banco?.dias ?? [];
  const diaHoje = dias.find((d) => d.dia === hoje) ?? null;
  // Do mais recente pro mais antigo, sem os dias que ainda não aconteceram: a
  // lista é "o que já foi", e um "futuro" no topo empurraria ontem pra fora.
  // Hoje fica de fora: o dia ainda rolando não é "problema", é expediente.
  const problemas = dias
    .filter((d) => d.dia < hoje)
    .map((d) => ({ d, p: problemaDoDia(d) }))
    .filter((x): x is { d: DiaBanco; p: NonNullable<ReturnType<typeof problemaDoDia>> } => x.p !== null)
    .reverse();
  const abrirDia = (dia: string) => (onAbrirDia ? onAbrirDia(dia) : onAbrirTudo());
  const atrasos = dias.filter((d) => d.dia <= hoje && atrasouNoDia(d, banco?.entradaPrevista ?? entradaPrevista)).length;
  /**
   * A régua do dia — quatro lugares fixos, ou a sequência real.
   *
   * Um mapa por TIPO só funciona enquanto o dia tem no máximo uma batida de
   * cada. Quem sai para o banco e volta bate almoço/retorno DUAS vezes, e o
   * mapa guardava só a última: as batidas do meio sumiam da tela sem aviso
   * nenhum, e o dia parecia ter quatro marcações quando tinha seis.
   *
   * Então: até quatro batidas, todas dos tipos comuns, a régua é a jornada
   * canônica (com os vazios, que é o ponto dela). Passou disso — ou apareceu
   * uma pausa — ela vira a lista do que REALMENTE foi batido, em ordem. O
   * grid tem quatro colunas e as batidas extras caem na linha de baixo
   * sozinhas.
   */
  const batidasHoje = diaHoje?.batidas ?? [];
  const porTipo = new Map(batidasHoje.map((b) => [b.tipo, b.hora]));
  const cabeNaJornada = batidasHoje.length <= MOMENTOS.length
    && batidasHoje.every((b) => CANONICOS.has(b.tipo as TipoBatida));
  const regua = cabeNaJornada
    ? MOMENTOS.map((t) => ({ chave: t, hora: porTipo.get(t) ?? null, ...MOMENTO[t] }))
    : batidasHoje.map((b, i) => ({
        chave: `${i}-${b.tipo}`,
        hora: b.hora,
        ...(MOMENTO[b.tipo as TipoBatida] ?? { rotulo: b.tipo, icone: "clock", cor: "var(--text-dim)" }),
      }));
  const janelaHoje = janelaDoDia(diaHoje);
  const podeBater = podeGerir && !!onBater && !!status && status.situacao !== "saiu";
  const turno = entradaPrevista && saidaPrevista ? `${entradaPrevista}–${saidaPrevista}` : null;

  async function bater() {
    if (!status || !onBater || batendo) return;
    setBatendo(true);
    try { await onBater(status); } finally { setBatendo(false); }
  }

  return (
    <aside className="glass glass-spec" style={{
      borderRadius: "var(--r-md)", border: "1px solid var(--border)",
      padding: 16, display: "flex", flexDirection: "column", gap: 14, minWidth: 0,
      position: "sticky", top: 12, alignSelf: "start",
    }}>
      {/* 1. Quem. Foto grande porque é o painel DELA: a lista ao lado tem sete
             avatares de 34px e nenhum deles diz "é este que você abriu". */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
        <Avatar url={fotoUrl} nome={nome} size={52} formato="redondo" />
        <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            <strong style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</strong>
            {situacao}
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-dim)" }}>
            <Icon name="clock" size={13} color="var(--text-dim)" />
            {turno ?? "sem turno no cadastro"}
          </span>
        </div>
        {podeGerir && onEditar && (
          <BotaoIcone icone="pencil" titulo="Editar cadastro" variante="secundario" onClick={onEditar} style={{ flex: "none" }} />
        )}
      </div>

      {/* 2. Os quatro números que respondem sem rolar. Fundo próprio porque eles
             são o resumo, não mais um parágrafo do painel. */}
      <div className={numerosEmLinha ? "ponto-num-4" : undefined} style={{
        // Duas colunas FIXAS, e não `auto-fit`: entre 324 e 432px de painel o
        // auto-fit dá três trilhas e o quarto número cai sozinho numa linha de
        // um terço da largura. Dois por linha vale em toda largura que este
        // painel pode ter.
        // Sem `gridTemplateColumns` inline quando a classe manda: inline ganha
        // de classe, e a media query de `.ponto-num-4` nunca valeria.
        display: "grid", gap: 1,
        ...(numerosEmLinha ? null : { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }),
        background: "var(--border)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", overflow: "hidden",
      }}>
        <Mini icone="clock" rotulo="Ponto hoje"
          valor={janelaHoje ? (janelaHoje.ate ? `${janelaHoje.de} – ${janelaHoje.ate}` : janelaHoje.de) : "—"}
          sub={!janelaHoje ? "sem batida" : `${fmtHoras(diaHoje!.trabalhadoMin)}${janelaHoje.ate ? "" : " até agora"}`} />
        <Mini icone="hourglass-high" rotulo="Horas no mês"
          valor={banco ? fmtHoras(banco.trabalhadoMin) : "…"}
          sub={banco ? `de ${fmtHoras(banco.metaMin)}` : ""} />
        <Mini icone="photo-question" rotulo="Faltas"
          valor={banco ? String(banco.faltas) : "…"} sub="este mês"
          cor={banco && banco.faltas > 0 ? "var(--perigo)" : undefined} />
        <Mini icone="alert-triangle" rotulo="Atrasos"
          valor={banco ? String(atrasos) : "…"} sub="este mês"
          cor={atrasos > 0 ? "var(--atencao)" : undefined} />
      </div>

      {/* 3. O dia de hoje como régua. */}
      <section style={{ display: "grid", gap: 8 }}>
        <Titulo icone="checklist" texto="Registro de ponto"
          extra={banco && mostrarBanco ? <span className="stat" style={{ fontSize: 12, fontWeight: 800, color: banco.saldoMin > 5 ? "var(--ok)" : banco.saldoMin < -5 ? "var(--perigo)" : "var(--text-dim)" }}>{fmtSaldo(banco.saldoMin)} no banco</span> : null} />
        <div style={{
          // Quatro colunas; a quinta batida em diante cai na linha de baixo.
          // `rowGap` maior que o `columnGap` para as duas fileiras não colarem.
          display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", columnGap: 6, rowGap: 14,
          border: "1px solid var(--border)", borderRadius: "var(--r-sm)", background: "var(--surface)", padding: "12px 8px",
        }}>
          {regua.map((m) => {
            const h = m.hora;
            return (
              <div key={m.chave} style={{ display: "grid", justifyItems: "center", gap: 5, minWidth: 0 }}>
                <span style={{
                  display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: "50%",
                  background: h ? `color-mix(in srgb, ${m.cor} 16%, transparent)` : "var(--surface-2)",
                  border: `1px solid ${h ? `color-mix(in srgb, ${m.cor} 34%, transparent)` : "var(--border)"}`,
                }}>
                  <Icon name={m.icone} size={15} color={h ? m.cor : "var(--text-dim)"} />
                </span>
                <span className="stat" style={{ fontSize: 13, fontWeight: 800, color: h ? "var(--text)" : "var(--text-dim)" }}>{h ?? "—"}</span>
                <span style={{ fontSize: 10.5, color: "var(--text-dim)", textAlign: "center" }}>{m.rotulo}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. O mês inteiro, com o que está estranho marcado. A lista de "últimos
             seis dias" escondia a falta do dia 3 assim que passava uma semana —
             quem confere o ponto quer achar o buraco, não ler a rotina. */}
      <section style={{ display: "grid", gap: 8 }}>
        <Titulo icone="calendar-event" texto="Este mês"
          extra={problemas.length > 0 ? <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--perigo)" }}>{problemas.length} {problemas.length === 1 ? "dia pra arrumar" : "dias pra arrumar"}</span> : banco ? <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--ok)" }}>tudo certo</span> : null} />
        {banco === null && !erro && <EsqueletoDeDias />}
        {erro && <Vazio texto="Não consegui ler o banco desta pessoa." />}
        {banco !== null && <MesDaPessoa dias={dias} hoje={hoje} onDia={abrirDia} />}
      </section>

      {problemas.length > 0 && (
        <section style={{ display: "grid", gap: 6 }}>
          <Titulo icone="alert-triangle" texto="Dias pra arrumar" />
          <div style={{ display: "grid", gap: 4 }}>
            {problemas.map(({ d, p }) => {
              const j = janelaDoDia(d);
              return (
                <button key={d.dia} type="button" className="ponto-linha" onClick={() => abrirDia(d.dia)} title={d.reconciliacao?.explicacao}
                  style={{ display: "flex", alignItems: "center", gap: 8, minHeight: "var(--tap)", padding: "6px 10px", textAlign: "left", cursor: "pointer", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", minWidth: 0 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, flex: "none", background: p === "pendente" ? "var(--info)" : p === "falta" || p === "revisar" ? "var(--perigo)" : "var(--atencao)" }} />
                  <span style={{ flex: "1 1 auto", minWidth: 0, display: "grid", gap: 1 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span className="stat">{dataBR(d.dia)}</span> · {DIAS[d.dow]}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ROTULO_PROBLEMA[p]}{d.metaMin > 0 && d.saldoMin < 0 ? ` · faltou ${fmtHoras(-d.saldoMin)}` : ""}
                    </span>
                    {d.reconciliacao && d.reconciliacao.nivel !== "consistente" && (
                      <span style={{ fontSize: 10.5, color: "var(--text-dim)", whiteSpace: "normal" }}>{d.reconciliacao.explicacao}</span>
                    )}
                  </span>
                  <span className="stat" style={{ flex: "none", fontSize: 12, fontWeight: 700, color: j ? "var(--text)" : "var(--text-dim)", whiteSpace: "nowrap" }}>
                    {j ? (j.ate ? `${j.de} – ${j.ate}` : j.de) : "sem batida"}
                  </span>
                  <Icon name="chevron-right" size={14} color="var(--text-dim)" />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Os dois degraus seguintes: bater agora (o que se faz olhando a lista)
             e abrir o banco inteiro (o que se faz quando a conta não fecha). */}
      <div style={{ display: "grid", gap: 8, marginTop: "auto" }}>
        {podeBater && (
          <Botao variante="primario" icone="clock" bloco carregando={batendo} onClick={bater}>{rotuloDaBatida(status!)}</Botao>
        )}
        <button type="button" onClick={onAbrirTudo} className="ponto-linha"
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: "var(--tap)", textAlign: "left", cursor: "pointer", padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)" }}>
          <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, flex: "none", background: "color-mix(in srgb, var(--primary) 14%, transparent)" }}>
            <Icon name="calendar-event" size={16} color="var(--primary)" />
          </span>
          <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Gerenciar ponto e horas</span>
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>calendário do mês, justificar dia e pagar horas</span>
          </span>
          <Icon name="chevron-right" size={16} color="var(--text-dim)" />
        </button>
      </div>
    </aside>
  );
}

/** O mês em grade de semana: cada dia na cor da classe, e o que pede atenção com
 *  anel vermelho. Tocar num dia abre a gaveta nele — é onde se corrige. */
function MesDaPessoa({ dias, hoje, onDia }: { dias: DiaBanco[]; hoje: string; onDia: (dia: string) => void }) {
  if (dias.length === 0) return <Vazio texto="Nenhum dia neste mês." />;
  const vazios = dias[0].dow;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 3 }}>
      {["D", "S", "T", "Q", "Q", "S", "S"].map((l, i) => (
        <span key={i} style={{ fontSize: 10, fontWeight: 800, color: "var(--text-dim)", textAlign: "center", paddingBottom: 2 }}>{l}</span>
      ))}
      {Array.from({ length: vazios }).map((_, i) => <span key={`v${i}`} />)}
      {dias.map((d) => {
        const p = d.dia < hoje ? problemaDoDia(d) : null;
        const eHoje = d.dia === hoje;
        const futuro = d.classe === "futuro" || d.classe === "pre";
        const rot = CLASSE[d.classe]?.rotulo ?? "";
        return (
          <button key={d.dia} type="button" disabled={futuro} onClick={() => onDia(d.dia)}
            title={`${dataBR(d.dia)} · ${p ? ROTULO_PROBLEMA[p] : rot}`}
            aria-label={`${dataBR(d.dia)}, ${p ? ROTULO_PROBLEMA[p] : rot}`}
            style={{
              position: "relative", minHeight: "var(--tap)", minWidth: 0, padding: 0,
              borderRadius: 8, cursor: futuro ? "default" : "pointer",
              background: fundoDaClasse(d.classe),
              border: p ? "2px solid var(--perigo)" : eHoje ? "2px solid var(--primary)" : "1px solid var(--border)",
              color: futuro ? "var(--text-dim)" : "var(--text)", fontFamily: "inherit",
              fontSize: 12, fontWeight: p || eHoje ? 800 : 600, opacity: futuro ? 0.5 : 1,
            }}>
            <span className="stat">{Number(d.dia.slice(8, 10))}</span>
            {p && <span aria-hidden="true" style={{ position: "absolute", top: 3, right: 3, width: 6, height: 6, borderRadius: 999, background: "var(--perigo)" }} />}
          </button>
        );
      })}
    </div>
  );
}

function Mini({ icone, rotulo, valor, sub, cor }: { icone: string; rotulo: string; valor: string; sub: string; cor?: string }) {
  return (
    <div style={{ background: "var(--surface)", padding: "10px 11px", display: "grid", gap: 2, minWidth: 0 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--text-dim)", fontWeight: 600 }}>
        <Icon name={icone} size={12} color="var(--text-dim)" /> {rotulo}
      </span>
      <span className="stat" style={{ fontSize: 14.5, fontWeight: 800, color: cor ?? "var(--text)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{valor}</span>
      {sub && <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{sub}</span>}
    </div>
  );
}

function Titulo({ icone, texto, extra }: { icone: string; texto: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
      <Icon name={icone} size={14} color="var(--text-dim)" />
      <strong style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text)", flex: "1 1 auto", minWidth: 0 }}>{texto}</strong>
      {extra}
    </div>
  );
}

/** Os últimos registros enquanto o mês não chega — com a FORMA das linhas de
 *  verdade, e não uma frase solta. Seis linhas de ~31px contra uma de 33 era a
 *  diferença que fazia o painel (e a lista irmã) nascer curto e crescer depois
 *  do primeiro paint. O esqueleto reserva a altura; quando o dado chega, ele só
 *  troca de conteúdo. */
function EsqueletoDeDias({ linhas = 6 }: { linhas?: number }) {
  return (
    <>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 2px", minWidth: 0 }}>
          <span style={{ flex: "1 1 auto", minWidth: 0 }}><Skeleton w={`${72 - i * 6}%`} h={14} r={6} /></span>
          <Skeleton w={58} h={17} r={999} style={{ flex: "none" }} />
          <Skeleton w={70} h={14} r={6} style={{ flex: "none" }} />
        </div>
      ))}
    </>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div style={{ fontSize: 12.5, color: "var(--text-dim)", padding: "10px 2px" }}>{texto}</div>;
}

/** Nada escolhido ainda. Existe pra coluna não nascer como um buraco de 380px —
 *  e pra dizer o que fazer, que é a única coisa que falta. */
export function DetalheVazio() {
  return (
    <aside className="glass glass-spec" style={{
      borderRadius: "var(--r-md)", border: "1px dashed var(--border)", padding: "34px 20px",
      display: "grid", placeItems: "center", gap: 8, textAlign: "center", position: "sticky", top: 12, alignSelf: "start",
    }}>
      <Icon name="user-check" size={26} color="var(--text-dim)" />
      <strong style={{ fontSize: 13.5, color: "var(--text)" }}>Escolha alguém na lista</strong>
      <span style={{ fontSize: 12, color: "var(--text-dim)", maxWidth: 240 }}>
        O dia da pessoa, o saldo do banco e os últimos registros aparecem aqui.
      </span>
    </aside>
  );
}
