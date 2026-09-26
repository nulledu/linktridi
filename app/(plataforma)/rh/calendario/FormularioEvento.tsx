"use client";

// O formulário de evento — evento interno, data de setor ou data
// comemorativa própria — no mesmo `PainelLateral centrado soFechaNoX` do
// "Novo compromisso" do Financeiro. Os campos são os do pedido, e só eles:
// nome, tipo, data, horário, setor, colaboradores, descrição, recorrência,
// observações.
//
// Qual rota recebe é decidido pelo TIPO (setor → `/setores`, o resto →
// `/eventos`), porque cada uma tem a chave dela. O formulário só oferece os
// tipos que a pessoa pode gravar.

import { useMemo, useState } from "react";
import { GlassDate, GlassSelect, GlassTime } from "../../GlassPicker";
import { Avatar } from "../../ui/Avatar";
import { Acoes, Botao, Caixa, Campo, Campos, Interruptor, PainelLateral, useAcao } from "../../ui/controles";
import { toast } from "../../Toast";
import { Icon } from "../../Icon";
import type { PoderesRh } from "@/lib/rh/gate";
import { RH_SETORES, type ColaboradorRh } from "@/lib/rh/tipos";
import {
  CATEGORIAS_EVENTO, LABEL_CATEGORIA, LEGENDA,
  type Acontecimento, type CategoriaEvento, type TipoGravado,
} from "@/lib/rh/calendario/tipos";

export interface Rascunho {
  id: string | null;
  tipo: TipoGravado;
  categoria: CategoriaEvento | "";
  nome: string;
  dia: string;
  hora: string;
  hora_fim: string;
  setor: string;
  colaboradores: string[];
  descricao: string;
  anual: boolean;
  observacoes: string;
  ativo: boolean;
}

export function rascunhoNovo(dia: string, tipo: TipoGravado = "evento"): Rascunho {
  return {
    id: null, tipo, categoria: tipo === "evento" ? "reuniao" : "", nome: "", dia, hora: "", hora_fim: "",
    setor: "", colaboradores: [], descricao: "", anual: tipo === "setor", observacoes: "", ativo: true,
  };
}

export function rascunhoDe(a: Acontecimento): Rascunho {
  return {
    id: a.id, tipo: a.tipo as TipoGravado, categoria: a.categoria ?? "", nome: a.titulo, dia: a.dia,
    hora: a.hora ?? "", hora_fim: a.hora_fim ?? "", setor: a.setor ?? "",
    colaboradores: a.envolvidos.map((p) => p.id), descricao: a.descricao ?? "",
    anual: a.recorrencia === "anual", observacoes: a.observacoes ?? "", ativo: !a.inativo,
  };
}

const rotaDe = (tipo: TipoGravado) => (tipo === "setor" ? "/api/rh/calendario/setores" : "/api/rh/calendario/eventos");

export function FormularioEvento({ inicial, poderes, colaboradores, setores, onFechar, aoSalvar }: {
  inicial: Rascunho;
  poderes: PoderesRh;
  colaboradores: ColaboradorRh[];
  setores: string[];
  onFechar: () => void;
  /** Depois de gravar com sucesso — o pai recarrega a página do servidor. */
  aoSalvar: () => void;
}) {
  const [f, setF] = useState<Rascunho>(inicial);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const [buscaPessoa, setBuscaPessoa] = useState("");
  const mudar = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setF((r) => ({ ...r, [k]: v }));

  const tiposPossiveis = useMemo(() => {
    const t: { value: TipoGravado; label: string }[] = [];
    if (poderes.calendarioEditar) t.push({ value: "evento", label: LEGENDA.evento.label }, { value: "comemorativa", label: LEGENDA.comemorativa.label });
    if (poderes.calendarioSetores) t.push({ value: "setor", label: LEGENDA.setor.label });
    return t;
  }, [poderes]);

  // Setores: os já cadastrados na equipe + a lista oferecida, sem repetir.
  const opcoesSetor = useMemo(() => {
    const s = new Set<string>([...setores, ...RH_SETORES]);
    if (f.setor) s.add(f.setor);
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR")).map((v) => ({ value: v, label: v }));
  }, [setores, f.setor]);

  const pessoasFiltradas = useMemo(() => {
    const q = buscaPessoa.trim().toLocaleLowerCase("pt-BR");
    const ativos = colaboradores.filter((c) => c.situacao !== "desligado");
    return q ? ativos.filter((c) => c.nome.toLocaleLowerCase("pt-BR").includes(q)) : ativos;
  }, [colaboradores, buscaPessoa]);

  const salvar = useAcao(async () => {
    setTentativa((n) => n + 1);
    if (!f.nome.trim()) { setErro("Dê um nome ao evento."); return false; }
    if (!f.dia) { setErro("Informe a data."); return false; }
    if (f.tipo === "setor" && !f.setor) { setErro("Data de setor precisa de um setor."); return false; }
    setErro("");
    const corpo = {
      id: f.id ?? undefined, tipo: f.tipo, categoria: f.tipo === "evento" ? f.categoria : null,
      nome: f.nome.trim(), dia: f.dia, hora: f.hora || null, hora_fim: f.hora_fim || null,
      setor: f.setor || null, colaboradores: f.colaboradores, descricao: f.descricao || null,
      recorrencia: f.anual ? "anual" : "nenhuma", observacoes: f.observacoes || null, ativo: f.ativo,
    };
    const r = await fetch(rotaDe(f.tipo), {
      method: f.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
    });
    const j = (await r.json().catch(() => ({}))) as { erro?: string };
    if (!r.ok) { setErro(j.erro ?? "Não foi possível salvar."); return false; }
    toast(f.id ? "Evento atualizado." : "Evento criado.");
    aoSalvar();
    return true;
  }, { aoErrar: () => setErro("Sem conexão. Tente de novo.") });

  const rotuloTipo = LEGENDA[f.tipo].label;

  return (
    <PainelLateral
      centrado
      soFechaNoX
      largura={560}
      titulo={f.id ? `Editar ${rotuloTipo.toLocaleLowerCase("pt-BR")}` : "Novo evento"}
      subtitulo={f.id ? undefined : "Entra no calendário do RH e nos próximos eventos de quem tem acesso."}
      onFechar={onFechar}
      rodape={
        <Acoes>
          <Botao onClick={onFechar}>Fechar</Botao>
          <Botao variante="primario" icone="check" estado={salvar.estado} onClick={() => salvar.rodar()}>
            {f.id ? "Salvar" : "Criar evento"}
          </Botao>
        </Acoes>
      }
    >
      {erro && (
        <p role="alert" style={{ margin: "0 0 12px", padding: "10px 12px", borderRadius: "var(--r-sm)", fontSize: 13, fontWeight: 600, color: "var(--perigo)", background: "color-mix(in srgb, var(--perigo) 10%, transparent)" }}>
          {erro}
        </p>
      )}

      <Campos>
        <Campo label="Nome" largo erro={erro && !f.nome.trim() ? erro : undefined} sinal={tentativa}>
          {(id) => <input id={id} value={f.nome} autoFocus onChange={(e) => mudar("nome", e.target.value)} placeholder="Ex.: Treinamento de segurança" />}
        </Campo>

        <Campo label="Tipo">
          {(id) => (
            <GlassSelect
              id={id}
              value={f.tipo}
              onChange={(v) => {
                const tipo = v as TipoGravado;
                setF((r) => ({ ...r, tipo, anual: tipo === "setor" ? true : r.anual, categoria: tipo === "evento" ? (r.categoria || "reuniao") : "" }));
              }}
              options={tiposPossiveis}
            />
          )}
        </Campo>

        {f.tipo === "evento" && (
          <Campo label="Categoria">
            {(id) => (
              <GlassSelect id={id} value={f.categoria} onChange={(v) => mudar("categoria", v as CategoriaEvento)}
                options={CATEGORIAS_EVENTO.map((c) => ({ value: c, label: LABEL_CATEGORIA[c] }))} />
            )}
          </Campo>
        )}

        <Campo label="Data" erro={erro && !f.dia ? erro : undefined} sinal={tentativa}>
          {(id) => <GlassDate id={id} value={f.dia} onChange={(v) => mudar("dia", v)} placeholder="Escolher data" clearable={false} />}
        </Campo>

        <Campo label="Horário" dica="Opcional">
          {(id) => (
            <div style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 0 }}>
              <GlassTime id={id} value={f.hora} onChange={(v) => mudar("hora", v)} style={{ minWidth: 0, flex: 1 }} />
              <span style={{ color: "var(--text-dim)", fontSize: 12, flex: "none" }}>até</span>
              <GlassTime aria-label="Término" value={f.hora_fim} onChange={(v) => mudar("hora_fim", v)} style={{ minWidth: 0, flex: 1 }} />
            </div>
          )}
        </Campo>

        <Campo label="Setor" dica={f.tipo === "setor" ? "A data pertence a este setor" : "Opcional"} erro={erro && f.tipo === "setor" && !f.setor ? erro : undefined} sinal={tentativa}>
          {(id) => (
            <GlassSelect id={id} value={f.setor} onChange={(v) => mudar("setor", v)} placeholder="Nenhum setor" searchable
              options={[{ value: "", label: "Nenhum setor" }, ...opcoesSetor]} />
          )}
        </Campo>

        <Campo label="Repete todo ano" largo>
          {() => (
            <Interruptor
              ligado={f.anual}
              onChange={(v) => mudar("anual", v)}
              rotulo={f.anual ? "Todo ano, na mesma data" : "Uma única vez"}
              dica={f.tipo === "setor" ? "Dia do setor é anual por natureza; desligue só para uma data avulsa." : undefined}
            />
          )}
        </Campo>

        {f.tipo !== "comemorativa" && (
          <Campo label="Colaboradores envolvidos" largo dica={f.colaboradores.length ? `${f.colaboradores.length} ${f.colaboradores.length === 1 ? "pessoa" : "pessoas"}` : "Opcional — quem participa aparece no detalhe e entra no filtro por colaborador."}>
            {(id) => (
              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: "var(--tap)", padding: "0 12px", borderRadius: "var(--r-pill)", border: "1px solid var(--border)", background: "var(--surface-2)" }}>
                  <Icon name="search" size={15} color="var(--text-dim)" />
                  <input id={id} value={buscaPessoa} onChange={(e) => setBuscaPessoa(e.target.value)} placeholder="Buscar pessoa…"
                    style={{ border: "none", background: "transparent", flex: 1, minWidth: 0, font: "inherit", color: "inherit", outline: "none" }} />
                </label>
                <div style={{ maxHeight: 220, overflowY: "auto", display: "grid", gap: 2, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", padding: 6 }}>
                  {pessoasFiltradas.length === 0 && <span style={{ fontSize: 12.5, color: "var(--text-dim)", padding: 8 }}>Ninguém com esse nome.</span>}
                  {pessoasFiltradas.map((c) => (
                    <Caixa
                      key={c.id}
                      marcado={f.colaboradores.includes(c.id)}
                      onChange={(v) => mudar("colaboradores", v ? [...f.colaboradores, c.id] : f.colaboradores.filter((x) => x !== c.id))}
                      rotulo={
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                          <Avatar url={c.foto} nome={c.nome} size={22} formato="redondo" />
                          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
                          {c.setor && <small style={{ color: "var(--text-dim)" }}>· {c.setor}</small>}
                        </span>
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </Campo>
        )}

        <Campo label="Descrição" largo>
          {(id) => <textarea id={id} rows={3} value={f.descricao} onChange={(e) => mudar("descricao", e.target.value)} placeholder="O que é, para quem, o que levar…" />}
        </Campo>

        <Campo label="Observações" largo dica="Opcional">
          {(id) => <textarea id={id} rows={2} value={f.observacoes} onChange={(e) => mudar("observacoes", e.target.value)} />}
        </Campo>
      </Campos>
    </PainelLateral>
  );
}
