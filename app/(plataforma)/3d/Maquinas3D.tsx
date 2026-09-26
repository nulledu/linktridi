"use client";

// ── 3D · Máquinas ────────────────────────────────────────────────────────────
// O parque: um card por impressora com o estado efetivo (derivado — ver
// statusDaMaquina), a peça atual e as próximas da fila. A ficha abre num
// painel: cadastro, estado manual (ativa/manutenção/offline), foto e a FILA
// com reordenação por setas (funciona igual no dedo e no mouse).

import { useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { GlassSelect } from "../GlassPicker";
import { toast, confirmar } from "../Toast";
import { Momento } from "../ui/Momento";
import { comprimirImagem } from "../ui/midia";
import { Acoes, Botao, BotaoIcone, Campo, Campos, Esp, PainelLateral, useAcao } from "../ui/controles";
import {
  COR_STATUS_MAQUINA, ESTADOS_MAQUINA, ROTULO_STATUS_MAQUINA, statusDaMaquina,
  type EstadoMaquina, type Maquina3D, type Programacao3D,
} from "@/lib/impressao3d-const";
import { CardProgramacao, type Pessoa } from "./pecas3d";

const ROTULO_ESTADO: Record<EstadoMaquina, string> = {
  ativa: "Ativa (estado automático)",
  manutencao: "Em manutenção",
  offline: "Offline",
};

export function Maquinas3D({ maquinas, programacoes, onMudou, onAbrir, onFila, soProva }: {
  maquinas: Maquina3D[];
  programacoes: Programacao3D[];
  onMudou: (lista: Maquina3D[]) => void;
  onAbrir: (p: Programacao3D) => void;
  /** Programação com a ordem nova (reordenação da fila). */
  onFila: (p: Programacao3D) => void;
  soProva?: boolean;
}) {
  const [ficha, setFicha] = useState<Maquina3D | "nova" | null>(null);

  const porMaquina = useMemo(() => {
    const m = new Map<string, Programacao3D[]>();
    for (const p of programacoes) {
      if (!p.maquinaId || p.status === "concluido" || p.status === "cancelado") continue;
      const l = m.get(p.maquinaId) ?? [];
      l.push(p);
      m.set(p.maquinaId, l);
    }
    for (const [, l] of m) {
      // Quem está na máquina vem primeiro; o resto na ordem da fila.
      l.sort((a, b) => {
        const rodando = (s: string) => (s === "imprimindo" ? 0 : s === "pausado" ? 1 : 2);
        return rodando(a.status) - rodando(b.status) || a.ordem - b.ordem;
      });
    }
    return m;
  }, [programacoes]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Botao variante="primario" icone="circle-plus" onClick={() => setFicha("nova")}>Nova máquina</Botao>
      </div>

      {maquinas.length === 0 ? (
        <Momento icone="printer" titulo="Nenhuma impressora cadastrada"
          texto="Cadastre as máquinas pra programar impressões e acompanhar a ocupação de cada uma."
          acao={<Botao variante="primario" icone="circle-plus" onClick={() => setFicha("nova")}>Nova máquina</Botao>} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
          {maquinas.map((m) => {
            const fila = porMaquina.get(m.id) ?? [];
            const st = statusDaMaquina(m, fila);
            const atual = fila.find((p) => p.status === "imprimindo" || p.status === "pausado");
            const proximas = fila.filter((p) => p !== atual).slice(0, 2);
            return (
              <button key={m.id} type="button" onClick={() => setFicha(m)}
                className="mc-card mt-eleva" style={{ textAlign: "left", padding: 16, display: "grid", gap: 10, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {m.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.fotoUrl} alt="" style={{ width: 42, height: 42, borderRadius: 12, objectFit: "cover", flex: "none" }} />
                  ) : (
                    <span style={{ width: 42, height: 42, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--graf-1) 14%, transparent)" }}>
                      <Icon name="printer" size={20} color={COR_STATUS_MAQUINA[st]} />
                    </span>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.nome}{m.identificacao ? ` · ${m.identificacao}` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: COR_STATUS_MAQUINA[st], fontWeight: 600 }}>
                      {ROTULO_STATUS_MAQUINA[st]}
                      {atual && <span style={{ color: "var(--text-dim)", fontWeight: 400 }}> — {atual.arquivoNome}</span>}
                    </div>
                  </div>
                </div>
                {(m.modelo || m.local) && (
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {[m.modelo, m.local].filter(Boolean).join(" · ")}
                  </div>
                )}
                {proximas.length > 0 && (
                  <div style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.4 }}>Próximas</span>
                    {proximas.map((p) => (
                      <span key={p.id} style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.hora ? `${p.hora} · ` : ""}{p.arquivoNome} · {p.quantidade}×
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {ficha && (
        <FichaMaquina
          maquina={ficha === "nova" ? null : ficha}
          fila={ficha === "nova" ? [] : porMaquina.get(ficha.id) ?? []}
          soProva={soProva}
          onFechar={() => setFicha(null)}
          onAbrir={onAbrir}
          onFila={onFila}
          onSalvou={(m) => {
            onMudou(maquinas.some((x) => x.id === m.id) ? maquinas.map((x) => (x.id === m.id ? m : x)) : [...maquinas, m].sort((a, b) => a.nome.localeCompare(b.nome)));
          }}
          onApagou={(id) => onMudou(maquinas.filter((x) => x.id !== id))}
        />
      )}
    </div>
  );
}

function FichaMaquina({ maquina, fila, onFechar, onSalvou, onApagou, onAbrir, onFila, soProva }: {
  maquina: Maquina3D | null;
  fila: Programacao3D[];
  onFechar: () => void;
  onSalvou: (m: Maquina3D) => void;
  onApagou: (id: string) => void;
  onAbrir: (p: Programacao3D) => void;
  onFila: (p: Programacao3D) => void;
  soProva?: boolean;
}) {
  const [nome, setNome] = useState(maquina?.nome ?? "");
  const [identificacao, setIdentificacao] = useState(maquina?.identificacao ?? "");
  const [modelo, setModelo] = useState(maquina?.modelo ?? "");
  const [local, setLocal] = useState(maquina?.local ?? "");
  const [estado, setEstado] = useState<EstadoMaquina>(maquina?.estado ?? "ativa");
  const [observacoes, setObservacoes] = useState(maquina?.observacoes ?? "");
  const [fotoUrl, setFotoUrl] = useState(maquina?.fotoUrl ?? "");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const escolherFoto = useRef<HTMLInputElement | null>(null);
  // A fila reordenável (só quem espera; a atual não sai do topo por seta).
  const espera = fila.filter((p) => p.status !== "imprimindo" && p.status !== "pausado");
  const atual = fila.find((p) => p.status === "imprimindo" || p.status === "pausado");

  const salvar = useAcao(async () => {
    if (!nome.trim()) { toast.erro("Dê um nome à máquina."); return false; }
    const corpo = { nome, identificacao, modelo, local, estado, observacoes, fotoUrl: fotoUrl || null };
    const r = await fetch(maquina ? `/api/3d/maquinas/${maquina.id}` : "/api/3d/maquinas", {
      method: maquina ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      toast.erro(r?.error === "tabela_ausente" ? "O SQL da produção 3D ainda não rodou." : "Não deu pra salvar a máquina.");
      return false;
    }
    toast(maquina ? "Máquina salva." : "Máquina cadastrada.");
    onSalvou(r.maquina as Maquina3D);
    onFechar();
    return true;
  });

  const apagar = useAcao(async () => {
    if (!maquina) return false;
    const sim = await confirmar(`Apagar "${maquina.nome}"?`, {
      detalhe: "Máquina com programações (até no histórico) não pode ser apagada — marque como offline.",
      tom: "perigo", acao: "Apagar",
    });
    if (!sim) return false;
    const r = await fetch(`/api/3d/maquinas/${maquina.id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      toast.erro(r?.error === "em_uso" ? "Ela tem programações — marque como offline em vez de apagar." : "Não deu pra apagar.");
      return false;
    }
    toast("Máquina apagada.");
    onApagou(maquina.id);
    onFechar();
    return true;
  });

  async function trocarFoto(f: File) {
    setEnviandoFoto(true);
    try {
      const menor = await comprimirImagem(f, 1200, 0.82);
      const fd = new FormData();
      fd.append("file", menor);
      fd.append("bucket", "photos");
      const r = await fetch("/api/upload", { method: "POST", body: fd }).then((x) => x.json()).catch(() => null);
      if (!r?.url) throw new Error(r?.error || "upload");
      setFotoUrl(r.url as string);
    } catch {
      toast.erro("Não deu pra subir a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function mover(i: number, delta: -1 | 1) {
    if (!maquina) return;
    const j = i + delta;
    if (j < 0 || j >= espera.length) return;
    const nova = [...espera];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    if (!soProva) {
      const r = await fetch("/api/3d/programacoes/fila", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ maquinaId: maquina.id, ids: nova.map((p) => p.id) }),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.ok) { toast.erro("Não deu pra reordenar a fila."); return; }
    }
    nova.forEach((p, k) => onFila({ ...p, ordem: k + 1 }));
  }

  return (
    <PainelLateral
      titulo={maquina ? maquina.nome : "Nova máquina"}
      subtitulo={maquina ? [maquina.modelo, maquina.local].filter(Boolean).join(" · ") || undefined : "Cadastro simples — o status do dia a dia é automático."}
      largura={560}
      onFechar={onFechar}
      soFechaNoX
      rodape={
        <Acoes>
          {maquina && <Botao variante="perigo" icone="trash" estado={apagar.estado} onClick={() => apagar.rodar()}>Apagar</Botao>}
          <Esp />
          <Botao variante="primario" estado={salvar.estado} onClick={() => salvar.rodar()}>
            {maquina ? "Salvar" : "Cadastrar"}
          </Botao>
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 18 }}>
        <Campos min={200}>
          <Campo label="Nome">
            {(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Impressora 01" maxLength={120} />}
          </Campo>
          <Campo label="Identificação" dica="Etiqueta curta, ex.: IMP-01.">
            {(id) => <input id={id} value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} maxLength={40} />}
          </Campo>
          <Campo label="Modelo">
            {(id) => <input id={id} value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ender-3 V3, A1 Mini…" maxLength={120} />}
          </Campo>
          <Campo label="Local / setor">
            {(id) => <input id={id} value={local} onChange={(e) => setLocal(e.target.value)} maxLength={120} />}
          </Campo>
          <Campo label="Estado" dica='Imprimindo/programada/disponível são automáticos — aqui é só o que a máquina "decide".'>
            {(id) => (
              <GlassSelect id={id} value={estado} onChange={(v) => setEstado(v as EstadoMaquina)}
                options={ESTADOS_MAQUINA.map((e) => ({ value: e, label: ROTULO_ESTADO[e] }))} />
            )}
          </Campo>
          <Campo label="Foto">
            {() => (
              <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {fotoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fotoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }} />
                )}
                <Botao variante="secundario" tamanho="sm" icone="camera" carregando={enviandoFoto}
                  onClick={() => escolherFoto.current?.click()}>
                  {fotoUrl ? "Trocar" : "Enviar foto"}
                </Botao>
                {fotoUrl && <BotaoIcone icone="x" titulo="Tirar a foto" tamanho="sm" onClick={() => setFotoUrl("")} />}
                <input ref={escolherFoto} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void trocarFoto(f); e.target.value = ""; }} />
              </span>
            )}
          </Campo>
          <Campo label="Observações" largo>
            {(id) => <textarea id={id} rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={2000} />}
          </Campo>
        </Campos>

        {maquina && (atual || espera.length > 0) && (
          <section style={{ display: "grid", gap: 8 }}>
            <h3 style={{ fontSize: 13.5, margin: 0 }}>Fila de impressão</h3>
            {atual && (
              <CardProgramacao p={atual} compacto onAbrir={onAbrir}
                rodape={<span style={{ fontSize: 11, color: "var(--text-dim)" }}>Na máquina agora</span>} />
            )}
            {espera.map((p, i) => (
              <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                <CardProgramacao p={p} compacto onAbrir={onAbrir}
                  rodape={<span style={{ fontSize: 11, color: "var(--text-dim)" }}>{i + 1}ª da fila</span>} />
                <span style={{ display: "grid", gap: 4 }}>
                  <BotaoIcone icone="chevron-up" titulo="Subir na fila" tamanho="sm" disabled={i === 0}
                    onClick={() => void mover(i, -1)} />
                  <BotaoIcone icone="chevron-down" titulo="Descer na fila" tamanho="sm" disabled={i === espera.length - 1}
                    onClick={() => void mover(i, 1)} />
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </PainelLateral>
  );
}

// As pessoas não são usadas aqui hoje, mas o tipo é o mesmo do módulo.
export type { Pessoa };
