"use client";

// ── Máquinas: o volante do painel da parede ─────────────────────────────────
//
// A TV mostra; aqui se MEXE. Duas pessoas usam a mesma tela:
//
//  · O OPERADOR marca — "Em andamento" quando põe a peça na máquina, "Feita"
//    quando tira. Sem aceite, de propósito: máquina não escolhe (decisão do
//    dono — "não teria como aceitar, teria que fazer direto mesmo").
//  · O CONTROLE programa — manda trabalho pra fila de UMA máquina, cancela,
//    para e volta a máquina. Esses botões só existem quando `controla` vem
//    true da rota: a MESMA conta do gate, pra tela nunca desenhar botão que o
//    servidor recusa.
//
// Sem poll: recarrega ao abrir e depois de cada ação — que é quando algo muda
// por causa DESTA tela. A parede tem o ritmo dela (cache de 30s).

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Botao, BotaoIcone, PainelLateral, Caixa } from "../ui/controles";
import { toast, confirmar } from "../Toast";
import { duracaoCurta, horaSP } from "@/lib/painel-maquinas";
import type { MaquinaControle } from "@/lib/maquina-fila";
import { MINUTOS_MAXIMOS, problemaDaNovaProgramacao } from "@/lib/maquina-fila";
import { corDoOEE, OEE_META, ROTULO_FAIXA, type ResultadoOEE } from "@/lib/oee";

type Carga =
  | { estado: "carregando" }
  | { estado: "sem-tabela"; frase: string }
  | { estado: "erro" }
  | { estado: "ok"; maquinas: MaquinaControle[]; controla: boolean; apontaPecas: boolean };

export function MaquinasControle() {
  const [carga, setCarga] = useState<Carga>({ estado: "carregando" });
  const [programando, setProgramando] = useState<MaquinaControle | null>(null);
  const [parando, setParando] = useState<MaquinaControle | null>(null);
  const [agindo, setAgindo] = useState<string | null>(null);
  const [apontando, setApontando] = useState<{ id: string; referencia: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/maquinas/programacoes", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setCarga({ estado: "erro" }); return; }
      if (d.disponivel === false) { setCarga({ estado: "sem-tabela", frase: String(d.detalhe ?? "Rode supabase/maquinas.sql no Supabase.") }); return; }
      setCarga({
        estado: "ok",
        maquinas: d.maquinas ?? [],
        controla: d.controla === true,
        // Sem as colunas do OEE a tela não pede peça nenhuma: pedir um número
        // que o banco não guarda é a pior forma de perder quem opera.
        apontaPecas: d.apontaPecas !== false,
      });
    } catch { setCarga({ estado: "erro" }); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function agir(
    programacaoId: string,
    acao: "iniciar" | "concluir" | "cancelar",
    apontamento?: { pecas: number; refugos: number },
  ) {
    if (agindo) return;
    if (acao === "cancelar" && !(await confirmar("Cancelar esta programação?", { detalhe: "Ela sai da fila. Se o trabalho voltar, crie uma nova.", perigo: true }))) return;
    setAgindo(programacaoId);
    try {
      const r = await fetch("/api/maquinas/programacoes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: programacaoId, acao, ...(apontamento ?? {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(String(d.detalhe ?? "Não deu agora. Tente de novo.")); await carregar(); return; }
      toast.ok(acao === "iniciar" ? "Em andamento." : acao === "concluir" ? "Feita." : "Cancelada.");
      await carregar();
    } catch {
      toast.erro("Sem conexão — nada mudou.");
    } finally { setAgindo(null); }
  }

  if (carga.estado === "carregando") return <p style={{ color: "var(--text-dim)" }}>Carregando as máquinas…</p>;
  if (carga.estado === "sem-tabela") {
    return <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.5, maxWidth: 480 }}>{carga.frase}</p>;
  }
  if (carga.estado === "erro") {
    return (
      <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
        Não deu pra carregar as máquinas.{" "}
        <Botao variante="sutil" tamanho="sm" onClick={() => void carregar()}>
          Tentar de novo
        </Botao>
      </p>
    );
  }

  const { maquinas, controla, apontaPecas } = carga;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {maquinas.length === 0 && (
        <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>Nenhuma máquina ativa — rode supabase/maquinas.sql ou reative uma.</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
        {maquinas.map((m) => (
          <CartaoDaMaquina key={m.id} m={m} agindo={agindo} controla={controla} apontaPecas={apontaPecas}
            onProgramar={() => setProgramando(m)}
            onParada={() => setParando(m)}
            onAgir={agir}
            onConcluirComApontamento={(id, referencia) => setApontando({ id, referencia })} />
        ))}
      </div>

      {programando && (
        <NovaProgramacao maquina={programando}
          onFechar={() => setProgramando(null)}
          onCriou={() => { setProgramando(null); void carregar(); }} />
      )}
      {apontando && (
        <ApontarPecas referencia={apontando.referencia}
          onFechar={() => setApontando(null)}
          onConfirmar={(ap) => { const id = apontando.id; setApontando(null); void agir(id, "concluir", ap); }}
          onPular={() => { const id = apontando.id; setApontando(null); void agir(id, "concluir"); }} />
      )}
      {parando && (
        <ParadaDaMaquina maquina={parando}
          onFechar={() => setParando(null)}
          onMudou={() => { setParando(null); void carregar(); }} />
      )}
    </div>
  );
}

function CartaoDaMaquina({ m, agindo, controla, apontaPecas, onProgramar, onParada, onAgir, onConcluirComApontamento }: {
  m: MaquinaControle; agindo: string | null; controla: boolean; apontaPecas: boolean;
  onProgramar: () => void; onParada: () => void;
  onAgir: (id: string, acao: "iniciar" | "concluir" | "cancelar") => void;
  onConcluirComApontamento: (id: string, referencia: string) => void;
}) {
  const parada = !!m.paradaMotivo;
  const cor = parada ? "var(--perigo)" : m.executando ? "var(--ok)" : "var(--atencao)";
  const rotulo = parada ? "Parada" : m.executando ? "Em andamento" : m.fila.length ? "Aguardando" : "Livre";
  const proxima = m.fila[0] ?? null;

  return (
    <article style={{ padding: 14, borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)", display: "grid", gap: 10, alignContent: "start" }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{ width: 9, height: 9, borderRadius: 99, background: cor, flex: "none" }} />
        <strong style={{ fontSize: 15, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nome}</strong>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: cor, flex: "none" }}>{rotulo}</span>
      </header>

      <OeeDaMaquina oee={m.oee} semApontamento={m.semApontamentoHoje} />

      {parada && <p style={{ margin: 0, fontSize: 12.5, color: "var(--perigo)" }}>{m.paradaMotivo}</p>}

      {/* O que está EM ANDAMENTO — com o botão "Feita" grudado nele. */}
      {m.executando && (
        <div style={{ padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--surface-2)", display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <strong style={{ fontSize: 13.5, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{m.executando.referencia}</strong>
            <span style={{ fontSize: 12, color: "var(--text-dim)", flex: "none" }}>
              {m.executando.iniciadaAt ? `desde ${horaSP(m.executando.iniciadaAt)}` : duracaoCurta(m.executando.minutos)}
            </span>
          </div>
          {m.executando.material && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{m.executando.material}</span>}
          <Botao variante="primario" tamanho="sm" icone="check" bloco
            disabled={!!agindo}
            onClick={() => (apontaPecas
              ? onConcluirComApontamento(m.executando!.id, m.executando!.referencia)
              : onAgir(m.executando!.id, "concluir"))}>
            Feita
          </Botao>
        </div>
      )}

      {/* A fila. A primeira ganha o "Em andamento" — a máquina corta uma coisa
          por vez, e o banco recusa a segunda rodando de qualquer jeito. */}
      {m.fila.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {m.fila.map((p, i) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px 4px 8px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", minHeight: "var(--tap)" }}>
              <span aria-hidden style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", flex: "none", width: 16, textAlign: "center" }}>{i + 1}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflowWrap: "anywhere" }}>
                {p.referencia}
                <span style={{ color: "var(--text-dim)", fontWeight: 500 }}> · {duracaoCurta(p.minutos)}</span>
                {p.material && <span style={{ color: "var(--text-dim)", fontWeight: 500 }}> · {p.material}</span>}
              </span>
              {controla && (
                <BotaoIcone icone="x" titulo={`Cancelar ${p.referencia}`} variante="sutil" tamanho="sm"
                  disabled={agindo === p.id}
                  onClick={() => onAgir(p.id, "cancelar")} />
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {proxima && !m.executando && !parada && (
          <Botao variante="primario" tamanho="sm" icone="player-play"
            disabled={!!agindo}
            onClick={() => onAgir(proxima.id, "iniciar")}>
            Em andamento
          </Botao>
        )}
        {controla && (
          <Botao variante="secundario" tamanho="sm" icone="plus" onClick={onProgramar} disabled={parada}>
            Programar
          </Botao>
        )}
        {controla && (
          <Botao variante="sutil" tamanho="sm" icone={parada ? "player-play" : "ban"} onClick={onParada}>
            {parada ? "Voltar" : "Parar"}
          </Botao>
        )}
        {m.feitasHoje > 0 && (
          <span style={{ marginLeft: "auto", alignSelf: "center", fontSize: 11.5, color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon name="circle-check" size={13} color="var(--ok)" /> {m.feitasHoje} hoje
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * O OEE da máquina no cartão do volante.
 *
 * Mesma conta da parede (`lib/oee.ts`) — a tela de controle não pode discordar
 * da TV. Os três pilares aparecem juntos porque o número sozinho não diz o que
 * consertar: 62% por disponibilidade é fila vazia, 62% por qualidade é refugo.
 */
function OeeDaMaquina({ oee, semApontamento }: { oee: ResultadoOEE; semApontamento: number }) {
  const cor = corDoOEE(oee.faixa);
  return (
    <div style={{ display: "grid", gap: 6, padding: "8px 10px", borderRadius: "var(--r-sm)", background: "var(--surface-2)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", flex: 1 }}>OEE hoje</span>
        <strong style={{ fontSize: 18, fontWeight: 800, color: cor, fontVariantNumeric: "tabular-nums" }}>{Math.round(oee.oee)}%</strong>
        <span style={{ fontSize: 11, fontWeight: 700, color: cor }}>{ROTULO_FAIXA[oee.faixa]}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
        <PilarMini rotulo="Dispon." valor={oee.disponibilidade} meta={OEE_META.disponibilidade} />
        <PilarMini rotulo="Desemp." valor={oee.desempenho} meta={OEE_META.desempenho} />
        <PilarMini rotulo="Qualid." valor={oee.qualidade} meta={OEE_META.qualidade} suposta={!oee.qualidadeApontada} />
      </div>
      {semApontamento > 0 && (
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {semApontamento} programação(ões) fechada(s) hoje sem apontar peça — a qualidade ainda é suposição.
        </span>
      )}
    </div>
  );
}

function PilarMini({ rotulo, valor, meta, suposta }: { rotulo: string; valor: number; meta: number; suposta?: boolean }) {
  const cor = suposta ? "var(--text-dim)" : valor >= meta ? "var(--ok)" : valor >= meta - 15 ? "var(--atencao)" : "var(--perigo)";
  return (
    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{rotulo}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: cor, fontVariantNumeric: "tabular-nums" }}>{Math.round(valor)}%</span>
      <span aria-hidden style={{ height: 5, borderRadius: 999, background: "color-mix(in srgb, var(--text) 10%, transparent)", overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(100, valor))}%`, borderRadius: 999, background: cor }} />
      </span>
    </div>
  );
}

/**
 * O apontamento de peças na hora de fechar — o pilar QUALIDADE do OEE.
 *
 * "Pular" existe de propósito: obrigar o número faria o operador chutar, e
 * chute vira OEE de mentira. Quem pula fica sem apontamento (`null`), que a
 * tela e a parede mostram como "qualidade sem medição" em vez de 100%.
 */
function ApontarPecas({ referencia, onFechar, onConfirmar, onPular }: {
  referencia: string;
  onFechar: () => void;
  onConfirmar: (ap: { pecas: number; refugos: number }) => void;
  onPular: () => void;
}) {
  const [pecas, setPecas] = useState("");
  const [refugos, setRefugos] = useState("0");
  const nPecas = Math.trunc(Number(pecas));
  const nRefugos = Math.trunc(Number(refugos)) || 0;
  const problema = !pecas.trim() ? "Informe quantas peças saíram, ou pule."
    : !Number.isFinite(nPecas) || nPecas <= 0 ? "Peças tem de ser um número maior que zero."
    : nRefugos > nPecas ? "O refugo não pode ser maior que o total produzido."
    : null;

  return (
    <PainelLateral
      titulo={<>Fechar {referencia}</>}
      subtitulo="quantas saíram, e quantas foram refugo"
      onFechar={onFechar}
      largura={380}
      rodape={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
          <Botao variante="sutil" onClick={onPular}>Pular</Botao>
          <Botao variante="primario" icone="check" onClick={() => onConfirmar({ pecas: nPecas, refugos: Math.min(nRefugos, nPecas) })} disabled={!!problema}>
            Feita
          </Botao>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={rotuloCss}>Peças produzidas</span>
          <input type="number" min={1} inputMode="numeric" value={pecas} autoFocus
            onChange={(e) => setPecas(e.target.value)} style={campoCss} />
        </label>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={rotuloCss}>Refugo / retrabalho</span>
          <input type="number" min={0} inputMode="numeric" value={refugos}
            onChange={(e) => setRefugos(e.target.value)} style={campoCss} />
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
            É o que desconta a QUALIDADE do OEE. Sem apontamento a parede diz que a qualidade não foi medida.
          </span>
        </label>
        {problema && pecas.trim() !== "" && (
          <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--perigo)" }}>{problema}</p>
        )}
      </div>
    </PainelLateral>
  );
}

/** A folha de mandar trabalho pra UMA máquina — é o "cair individualmente". */
function NovaProgramacao({ maquina, onFechar, onCriou }: {
  maquina: MaquinaControle; onFechar: () => void; onCriou: () => void;
}) {
  const [referencia, setReferencia] = useState("");
  const [material, setMaterial] = useState("");
  const [minutos, setMinutos] = useState("60");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const problema = problemaDaNovaProgramacao({ maquinaId: maquina.id, referencia, minutos });

  async function criar() {
    if (salvando || problema) return;
    setSalvando(true); setErro(null);
    try {
      const r = await fetch("/api/maquinas/programacoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maquinaId: maquina.id, referencia, material: material || undefined, minutos: Number(minutos) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(String(d.detalhe ?? "Não deu pra programar agora.")); return; }
      toast.ok(`Na fila da ${maquina.nome}.`);
      onCriou();
    } catch {
      setErro("Sem conexão — nada foi criado.");
    } finally { setSalvando(false); }
  }

  return (
    <PainelLateral
      titulo={<>Programar {maquina.nome}</>}
      subtitulo="cai direto na fila desta máquina — sem aceite"
      onFechar={onFechar}
      largura={420}
      rodape={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
          <Botao variante="sutil" onClick={onFechar} disabled={salvando}>Cancelar</Botao>
          <Botao variante="primario" icone="plus" onClick={() => void criar()} carregando={salvando} disabled={!!problema}>
            Pôr na fila
          </Botao>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={rotuloCss}>O que vai ser cortado</span>
          <input value={referencia} onChange={(e) => setReferencia(e.target.value.slice(0, 120))}
            placeholder="Pedido #58291, Programa CH-204…" autoFocus style={campoCss} />
        </label>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={rotuloCss}>Material (opcional)</span>
          <input value={material} onChange={(e) => setMaterial(e.target.value.slice(0, 80))}
            placeholder="Borracha, acrílico 3mm…" style={campoCss} />
        </label>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={rotuloCss}>Minutos estimados</span>
          <input type="number" min={1} max={MINUTOS_MAXIMOS} inputMode="numeric" value={minutos}
            onChange={(e) => setMinutos(e.target.value)} style={campoCss} />
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
            É o que faz a barra de progresso da TV andar.
          </span>
        </label>
        {(erro || (problema && referencia)) && (
          <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--perigo)", lineHeight: 1.5 }}>{erro ?? problema}</p>
        )}
      </div>
    </PainelLateral>
  );
}

/** Parar (motivo) ou voltar a máquina. */
function ParadaDaMaquina({ maquina, onFechar, onMudou }: {
  maquina: MaquinaControle; onFechar: () => void; onMudou: () => void;
}) {
  const voltar = !!maquina.paradaMotivo;
  const [motivo, setMotivo] = useState("");
  const [planejada, setPlanejada] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aplicar() {
    if (salvando) return;
    setSalvando(true); setErro(null);
    try {
      const r = await fetch("/api/maquinas/parada", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(voltar ? { maquinaId: maquina.id, voltar: true } : { maquinaId: maquina.id, motivo, planejada }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(String(d.detalhe ?? "Não deu agora.")); return; }
      toast.ok(voltar ? `${maquina.nome} voltou.` : `${maquina.nome} parada.`);
      onMudou();
    } catch {
      setErro("Sem conexão — nada mudou.");
    } finally { setSalvando(false); }
  }

  return (
    <PainelLateral
      titulo={<>{voltar ? "Voltar" : "Parar"} {maquina.nome}</>}
      subtitulo={voltar ? "a parede volta a mostrar a fila" : "a parede passa a mostrar PARADA, mesmo com fila"}
      onFechar={onFechar}
      largura={400}
      rodape={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
          <Botao variante="sutil" onClick={onFechar} disabled={salvando}>Cancelar</Botao>
          <Botao variante={voltar ? "primario" : "perigo"} icone={voltar ? "player-play" : "ban"}
            onClick={() => void aplicar()} carregando={salvando}>
            {voltar ? "Voltar a rodar" : "Parar máquina"}
          </Botao>
        </div>
      }
    >
      {voltar ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Parada por: <strong style={{ color: "var(--text)" }}>{maquina.paradaMotivo}</strong>.
        </p>
      ) : (
        <label style={{ display: "grid", gap: 5 }}>
          <span style={rotuloCss}>Por quê</span>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 120))}
            placeholder="Manutenção, esperando peça…" autoFocus style={campoCss} />
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
            É o que aparece na parede — avisa o galpão de que não adianta levar peça pra ela.
          </span>
        </label>
      )}
      {!voltar && (
        // Parada COMBINADA sai do tempo planejado do OEE; quebra e espera de
        // peça derrubam a disponibilidade — que é o trabalho do indicador.
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, minHeight: "var(--tap)" }}>
          <Caixa marcado={planejada} onChange={(marc) => setPlanejada(marc)} />
          <span style={{ fontSize: 13, lineHeight: 1.45 }}>
            Parada planejada (preventiva combinada)
            <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>
              Sai do tempo planejado e não derruba a disponibilidade do OEE. Quebra e espera de peça, deixe desmarcado.
            </span>
          </span>
        </label>
      )}
      {erro && <p role="alert" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--perigo)" }}>{erro}</p>}
    </PainelLateral>
  );
}

const rotuloCss: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-dim)" };
const campoCss: React.CSSProperties = {
  minHeight: "var(--tap)", padding: "10px 12px", fontSize: 15, width: "100%",
  borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text)",
};
