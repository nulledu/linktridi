"use client";

// ── 3D · criar/editar uma programação de impressão ───────────────────────────
// Um painel só pros dois casos: `edicao` nulo cria, preenchido edita. O
// arquivo vem da BIBLIOTECA (select com busca) — a programação nunca inventa
// arquivo. Na edição dá pra abrir a peça no palco 3D sem sair do painel, e
// gerar uma atividade no sistema de Atividades existente (nada de segundo
// sistema de tarefas).

import { useEffect, useMemo, useState } from "react";
import { GlassDate, GlassSelect } from "../GlassPicker";
import { toast, confirmar } from "../Toast";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral, useAcao } from "../ui/controles";
import {
  PRIORIDADES, ROTULO_PRIORIDADE, visualizavel,
  type Arquivo3D, type Maquina3D, type Programacao3D,
} from "@/lib/impressao3d-const";
import { Visualizador3D } from "./Visualizador3D";
import type { Pessoa } from "./pecas3d";

export function NovaProgramacao({
  edicao, arquivoInicial, maquinas, pessoas, onFechar, onSalvou, onApagou, soProva,
}: {
  /** null = criar. */
  edicao: Programacao3D | null;
  /** Pré-seleção ao vir da biblioteca ("Programar impressão" na ficha). */
  arquivoInicial?: Arquivo3D | null;
  maquinas: Maquina3D[];
  pessoas: Pessoa[];
  onFechar: () => void;
  onSalvou: (p: Programacao3D) => void;
  onApagou?: (id: string) => void;
  /** Banco de provas: não toca a rede. */
  soProva?: boolean;
}) {
  const [arquivos, setArquivos] = useState<Arquivo3D[]>(arquivoInicial ? [arquivoInicial] : []);
  const [arquivoId, setArquivoId] = useState(edicao?.arquivoId ?? arquivoInicial?.id ?? "");
  const [maquinaId, setMaquinaId] = useState(edicao?.maquinaId ?? "");
  const [quantidade, setQuantidade] = useState(String(edicao?.quantidade ?? 1));
  const [data, setData] = useState(edicao?.data ?? "");
  const [hora, setHora] = useState(edicao?.hora ?? "");
  const [prioridade, setPrioridade] = useState(edicao?.prioridade ?? "normal");
  const [responsavelId, setResponsavelId] = useState(edicao?.responsavelId ?? "");
  const [observacoes, setObservacoes] = useState(edicao?.observacoes ?? "");
  const [verPeca, setVerPeca] = useState(false);

  // A lista da biblioteca só é buscada quando o painel abre — quem nunca
  // programa não paga a consulta.
  useEffect(() => {
    if (soProva) return;
    let vivo = true;
    fetch("/api/3d/arquivos").then((x) => x.json()).then((r) => {
      if (vivo && r?.ok) setArquivos(r.arquivos as Arquivo3D[]);
    }).catch(() => undefined);
    return () => { vivo = false; };
  }, [soProva]);

  const formatoDaPeca = useMemo(() => {
    if (edicao) return edicao.arquivoFormato;
    return arquivos.find((a) => a.id === arquivoId)?.formato ?? "outro";
  }, [edicao, arquivos, arquivoId]);
  const nomeDaPeca = edicao?.arquivoNome || arquivos.find((a) => a.id === arquivoId)?.nome || "";

  const salvar = useAcao(async () => {
    if (!arquivoId) { toast.erro("Escolha o arquivo da biblioteca."); return false; }
    const corpo = {
      arquivoId,
      maquinaId: maquinaId || null,
      quantidade: Math.max(1, Number(quantidade) || 1),
      data: data || null,
      hora: hora || null,
      prioridade,
      responsavelId: responsavelId || null,
      observacoes,
    };
    const r = await fetch(edicao ? `/api/3d/programacoes/${edicao.id}` : "/api/3d/programacoes", {
      method: edicao ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) {
      toast.erro(r?.error === "tabela_ausente" ? "O SQL da produção 3D ainda não rodou." : "Não deu pra salvar a programação.");
      return false;
    }
    toast(edicao ? "Programação salva." : "Impressão programada.");
    onSalvou(r.programacao as Programacao3D);
    onFechar();
    return true;
  });

  const apagar = useAcao(async () => {
    if (!edicao) return false;
    const sim = await confirmar("Apagar esta programação?", {
      detalhe: "O arquivo continua na biblioteca — só a programação some.",
      tom: "perigo", acao: "Apagar",
    });
    if (!sim) return false;
    const r = await fetch(`/api/3d/programacoes/${edicao.id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { toast.erro("Não deu pra apagar."); return false; }
    toast("Programação apagada.");
    onApagou?.(edicao.id);
    onFechar();
    return true;
  });

  // Integração com o sistema de Atividades EXISTENTE: uma atividade no pool de
  // produção (ou pra pessoa responsável), com a peça no título. Quem não tem
  // a chave de atribuir recebe a explicação, não um erro mudo.
  const gerarAtividade = useAcao(async () => {
    const alvo = pessoas.find((p) => p.id === responsavelId);
    const r = await fetch("/api/atividades", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tarefa: `Imprimir ${Math.max(1, Number(quantidade) || 1)}× ${nomeDaPeca || "peça 3D"}`,
        detalhe: [
          maquinas.find((m) => m.id === maquinaId)?.nome && `Máquina: ${maquinas.find((m) => m.id === maquinaId)!.nome}`,
          data && `Dia ${data.split("-").reverse().join("/")}${hora ? ` às ${hora}` : ""}`,
          observacoes,
        ].filter(Boolean).join(" · "),
        ...(alvo ? { para_id: alvo.id } : { setor: "producao", pool: true }),
        faixa: "maquinas",
        quantidade_alvo: Math.max(1, Number(quantidade) || 1),
      }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.atividade) {
      toast.erro(r?.error === "forbidden" || r?.error === "fora_da_hierarquia"
        ? "Você não tem a chave de atribuir atividades — peça a alguém de Atividades."
        : "Não deu pra gerar a atividade.");
      return false;
    }
    toast("Atividade criada em Minhas atividades / pool de produção.");
    return true;
  });

  return (
    <PainelLateral
      titulo={edicao ? "Programação de impressão" : "Programar impressão"}
      subtitulo={edicao ? nomeDaPeca : "A peça sai da biblioteca; máquina e dia podem ficar pra depois."}
      centrado
      largura={640}
      onFechar={onFechar}
      soFechaNoX
      rodape={
        <Acoes>
          {edicao && <Botao variante="perigo" icone="trash" estado={apagar.estado} onClick={() => apagar.rodar()}>Apagar</Botao>}
          <Esp />
          {edicao && (
            <Botao variante="secundario" icone="checklist" estado={gerarAtividade.estado} onClick={() => gerarAtividade.rodar()}>
              Gerar atividade
            </Botao>
          )}
          <Botao variante="primario" estado={salvar.estado} onClick={() => salvar.rodar()}>
            {edicao ? "Salvar" : "Programar"}
          </Botao>
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <Campos min={220}>
          <Campo label="Arquivo" largo dica={edicao ? undefined : "Da biblioteca 3D — envie por lá se ainda não existe."}>
            {(id) => (
              <GlassSelect
                id={id}
                value={arquivoId}
                onChange={setArquivoId}
                disabled={!!edicao}
                searchable
                placeholder="Escolher arquivo…"
                options={
                  edicao
                    ? [{ value: edicao.arquivoId, label: edicao.arquivoNome }]
                    : arquivos.map((a) => ({ value: a.id, label: a.nome }))
                }
              />
            )}
          </Campo>
          <Campo label="Máquina">
            {(id) => (
              <GlassSelect id={id} value={maquinaId} onChange={setMaquinaId} placeholder="Ainda sem máquina"
                options={[{ value: "", label: "Ainda sem máquina" }, ...maquinas.map((m) => ({ value: m.id, label: m.identificacao ? `${m.nome} · ${m.identificacao}` : m.nome }))]} />
            )}
          </Campo>
          <Campo label="Quantidade">
            {(id) => <input id={id} type="number" min={1} inputMode="numeric" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />}
          </Campo>
          <Campo label="Data">
            {(id) => <GlassDate id={id} value={data} onChange={(v) => setData((v || "").slice(0, 10))} />}
          </Campo>
          <Campo label="Horário planejado">
            {(id) => <input id={id} type="time" value={hora} onChange={(e) => setHora(e.target.value)} />}
          </Campo>
          <Campo label="Prioridade">
            {(id) => (
              <GlassSelect id={id} value={prioridade} onChange={(v) => setPrioridade(v as typeof prioridade)}
                options={PRIORIDADES.map((p) => ({ value: p, label: ROTULO_PRIORIDADE[p] }))} />
            )}
          </Campo>
          <Campo label="Responsável">
            {(id) => (
              <GlassSelect id={id} value={responsavelId} onChange={setResponsavelId} searchable placeholder="Sem responsável"
                options={[{ value: "", label: "Sem responsável" }, ...pessoas.map((p) => ({ value: p.id, label: p.nome }))]} />
            )}
          </Campo>
          <Campo label="Observações" largo>
            {(id) => <textarea id={id} rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={2000} />}
          </Campo>
        </Campos>

        {edicao && visualizavel(formatoDaPeca) && (
          <div style={{ display: "grid", gap: 10 }}>
            <Botao variante="sutil" icone="box" onClick={() => setVerPeca((v) => !v)}>
              {verPeca ? "Fechar a peça" : "Ver a peça em 3D"}
            </Botao>
            {verPeca && (
              <Visualizador3D
                arquivoId={edicao.arquivoId}
                formato={formatoDaPeca}
                urlDownload={arquivos.find((a) => a.id === edicao.arquivoId)?.url
                  ? `${arquivos.find((a) => a.id === edicao.arquivoId)!.url}?download=1&nome=${encodeURIComponent(edicao.arquivoNome)}`
                  : "#"}
              />
            )}
          </div>
        )}
      </div>
    </PainelLateral>
  );
}
