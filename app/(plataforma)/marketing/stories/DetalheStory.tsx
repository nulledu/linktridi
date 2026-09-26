"use client";

// ── O story aberto ───────────────────────────────────────────────────────────
// Mídia grande de um lado; do outro, os números e os dados — todos editáveis
// ali mesmo, sem tela de edição: toca em "Cliques: 120", digita 147, Enter.
// Cada troca vai pela fila de salvamento (a tela já mostra o valor novo; o
// pedido repete sozinho se a rede falhar e avisa se o servidor recusar).
//
// Embaixo, os stories PARECIDOS com este — é aqui que "o que estamos
// repetindo?" vira resposta com print e número do lado.

import { useEffect, useRef, useState } from "react";
import { GlassSelect } from "../../GlassPicker";
import { Icon } from "../../Icon";
import { confirmar, toast } from "../../Toast";
import { Botao, BotaoIcone, PainelLateral } from "../../ui/controles";
import { NumeroInline, TextoInline } from "../../ui/EdicaoInline";
import { NumeroVivo } from "../../ui/micro";
import { McPills } from "../../ui/monocharts/lib";
import type { ProdutoCriativo } from "@/lib/marketing-criativos-const";
import {
  isoDeDataHoraSP, nomeDoMes, partesSP, rotuloDataHora, rotuloDataLonga, semanaDoStory,
} from "@/lib/marketing-stories/calendario";
import { conversao, formatarConversao, formatarInteiro, posicaoNo } from "@/lib/marketing-stories/metricas";
import {
  CTAS_SUGERIDOS, STATUS_STORY, TIPOS_STORY, rotuloDoTipo, tituloDoStory,
  type ParecidoStory, type PatchStory, type Story, type TipoStory,
} from "@/lib/marketing-stories/tipos";
import type { StoriesApi } from "./api";
import { ACEITA, liberarMidia, mensagemDeEnvio, prepararMidia } from "./midiaStory";
import { ParecidosDoStory } from "./Parecidos";
import { CapaStory } from "./pecas";

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function MidiaGrande({ s, titulo }: { s: Story; titulo: string }) {
  if (s.midiaTipo === "video" && s.midiaUrl) {
    return <video key={s.midiaUrl} className="sto-midia-grande" src={s.midiaUrl} poster={s.capaUrl ?? undefined} controls playsInline preload="metadata" />;
  }
  if (s.midiaUrl) return <img key={s.midiaUrl} className="sto-midia-grande" src={s.midiaUrl} alt={`Story: ${titulo}`} />;
  return <span className="sto-midia-grande sto-midia-vazia"><CapaStory s={s} /></span>;
}

/** Data e hora sempre abertas: é um campo só no telefone e dois no computador. */
function DataHora({ iso, onSalvar }: { iso: string; onSalvar: (iso: string) => void }) {
  const p = partesSP(iso);
  const [d, setD] = useState(p.data);
  const [h, setH] = useState(p.hora);
  useEffect(() => { const q = partesSP(iso); setD(q.data); setH(q.hora); }, [iso]);
  const salvar = (nd: string, nh: string) => {
    const novo = isoDeDataHoraSP(nd, nh);
    if (novo && novo !== iso) onSalvar(novo);
  };
  return (
    <span className="sto-det-datahora">
      <input type="date" value={d} aria-label="Data" onChange={(e) => setD(e.target.value)} onBlur={() => salvar(d, h)} />
      <input type="time" value={h} aria-label="Horário" onChange={(e) => setH(e.target.value)} onBlur={() => salvar(d, h)} />
    </span>
  );
}

export function DetalheStory({
  api, s, nomes, produtos, campanhas, podeEditar, contexto, onEditar, onExcluido, onAbrirOutro, onFechar,
}: {
  api: StoriesApi;
  s: Story;
  nomes: Map<string, string>;
  produtos: ProdutoCriativo[];
  campanhas: string[];
  podeEditar: boolean;
  /** Os stories do mesmo mês — é contra eles que "2º em vendas" é contado. */
  contexto: Story[];
  onEditar: (s: Story, patch: PatchStory, rotulo: string) => void;
  onExcluido: (id: string) => void;
  onAbrirOutro: (id: string) => void;
  onFechar: () => void;
}) {
  const [parecidos, setParecidos] = useState<ParecidoStory[]>([]);
  const [envio, setEnvio] = useState<number | null>(null);
  const [apagando, setApagando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const titulo = tituloDoStory(s, (id) => nomes.get(id));
  const semana = semanaDoStory(s.publicadoEm);
  const conv = conversao(s.cliques, s.vendas);
  const mudar = (patch: PatchStory, rotulo: string) => onEditar(s, patch, `${rotulo} · ${titulo}`);

  useEffect(() => {
    let vivo = true;
    api.detalhe(s.id).then((r) => { if (vivo && r) setParecidos(r.parecidos); }).catch(() => {});
    return () => { vivo = false; };
  }, [api, s.id]);

  const posicoes = contexto.some((x) => x.id === s.id)
    ? ([["vendas", "vendas"], ["cliques", "cliques"], ["conversao", "conversão"]] as const)
      .map(([k, nome]) => [posicaoNo(contexto, s.id, k), nome] as const)
      .filter(([p]) => p != null)
      .map(([p, nome]) => `${p}º em ${nome}`)
      .join(" · ")
    : "";

  async function trocarMidia(f: File) {
    const r = await prepararMidia(f);
    if (!r.ok) { toast(r.erro, "erro"); return; }
    setEnvio(0);
    try {
      const u = await api.enviarMidia(r.midia, setEnvio);
      const m = r.midia;
      mudar({
        midiaUrl: u.midiaUrl, capaUrl: u.capaUrl, midiaTipo: m.tipo,
        largura: m.largura, altura: m.altura, duracao: m.duracao, hashVisual: m.hashVisual,
      }, "Mídia");
    } catch (e) {
      toast(mensagemDeEnvio(e), "erro");
    } finally {
      setEnvio(null);
      liberarMidia(r.midia);
    }
  }

  async function apagar() {
    const ok = await confirmar("Excluir este story?", {
      detalhe: "A mídia sai do armazenamento junto. Não dá pra desfazer.", perigo: true,
    });
    if (!ok) return;
    setApagando(true);
    const feito = await api.excluir(s.id);
    setApagando(false);
    if (!feito) { toast("Não deu pra excluir agora. Tente de novo.", "erro"); return; }
    toast.ok("Story excluído.");
    onExcluido(s.id);
  }

  const salvarLink = (t: string | null) => {
    if (t && !/^https?:\/\/\S+$/i.test(t)) { toast("O link precisa começar com http:// ou https://.", "erro"); return; }
    mudar({ linkUrl: t }, "Link");
  };

  return (
    <PainelLateral
      titulo={titulo}
      subtitulo={`${capitalizar(rotuloDataLonga(s.publicadoEm))} · Semana ${semana.n} de ${nomeDoMes(semana.mes).toLowerCase()}`}
      largura={900}
      centrado
      onFechar={onFechar}
      acoes={podeEditar
        ? <BotaoIcone icone="trash" titulo="Excluir story" variante="perigo" carregando={apagando} onClick={() => void apagar()} />
        : undefined}
    >
      <div className="sto-det">
        <div className="sto-det-midia">
          <MidiaGrande s={s} titulo={titulo} />
          {(podeEditar || s.midiaUrl) && (
            <div className="sto-det-midia-acoes">
              {podeEditar && (
                <Botao tamanho="sm" icone="refresh" carregando={envio != null} onClick={() => entrada.current?.click()}>
                  {envio != null ? `Enviando ${Math.round(envio * 100)}%` : s.midiaUrl ? "Trocar mídia" : "Adicionar mídia"}
                </Botao>
              )}
              {s.midiaUrl && (
                <a className="ui-btn" data-v="sutil" data-t="sm" href={`${s.midiaUrl}?download=1`} download>
                  <Icon name="download" size={14} /> Baixar
                </a>
              )}
            </div>
          )}
          <input ref={entrada} type="file" accept={ACEITA} hidden tabIndex={-1} aria-hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void trocarMidia(f); }} />
        </div>

        <div className="sto-det-info">
          <div className="sto-det-nums">
            <div className="sto-det-num" data-forte="1">
              <span className="sto-det-rot">Vendas</span>
              <NumeroInline valor={s.vendas} rotulo="Vendas" desativado={!podeEditar} className="sto-det-val"
                onSalvar={(n) => mudar({ vendas: n }, "Vendas")}>
                <NumeroVivo valor={s.vendas} formatar={formatarInteiro} />
              </NumeroInline>
            </div>
            <div className="sto-det-num">
              <span className="sto-det-rot">Cliques</span>
              <NumeroInline valor={s.cliques} rotulo="Cliques" desativado={!podeEditar} className="sto-det-val"
                onSalvar={(n) => mudar({ cliques: n }, "Cliques")}>
                <NumeroVivo valor={s.cliques} formatar={formatarInteiro} />
              </NumeroInline>
            </div>
            <div className="sto-det-num">
              <span className="sto-det-rot">Conversão</span>
              <span className="sto-det-val">
                {conv == null ? "—" : <NumeroVivo valor={conv} formatar={(n) => formatarConversao(n)} />}
              </span>
            </div>
          </div>
          {posicoes && <p className="sto-det-pos"><Icon name="trophy" size={13} /> {posicoes} do mês</p>}

          <dl className="sto-det-dados">
            <dt>Data</dt>
            <dd>
              {podeEditar
                ? <DataHora iso={s.publicadoEm} onSalvar={(iso) => mudar({ publicadoEm: iso }, "Data")} />
                : rotuloDataHora(s.publicadoEm)}
            </dd>
            <dt>Status</dt>
            <dd>
              {podeEditar ? (
                <McPills itens={STATUS_STORY.map((x) => ({ valor: x.valor, rotulo: x.rotulo }))} valor={s.status}
                  onMuda={(v) => mudar({ status: v }, "Status")} ariaLabel="Status do story" />
              ) : STATUS_STORY.find((x) => x.valor === s.status)?.rotulo}
            </dd>
            <dt>Produto</dt>
            <dd>
              {podeEditar ? (
                <GlassSelect value={s.produtoId ?? ""} title="Produto" style={{ width: "100%" }}
                  onChange={(v) => mudar({ produtoId: v || null }, "Produto")}
                  options={[{ value: "", label: "Sem produto" }, ...produtos.filter((p) => p.id).map((p) => ({ value: p.id as string, label: p.nome }))]} />
              ) : (s.produtoId && nomes.get(s.produtoId)) || "—"}
            </dd>
            <dt>Tipo</dt>
            <dd>
              {podeEditar ? (
                <GlassSelect value={s.tipo ?? ""} title="Tipo" style={{ width: "100%" }}
                  onChange={(v) => mudar({ tipo: (v || null) as TipoStory | null }, "Tipo")}
                  options={[{ value: "", label: "Sem tipo" }, ...TIPOS_STORY.map((t) => ({ value: t.valor, label: t.rotulo }))]} />
              ) : rotuloDoTipo(s.tipo) ?? "—"}
            </dd>
            <dt>Tema</dt>
            <dd>
              <TextoInline valor={s.tema} rotulo="Tema" placeholder="Adicionar tema" max={120} desativado={!podeEditar}
                onSalvar={(t) => mudar({ tema: t }, "Tema")} />
            </dd>
            <dt>Campanha</dt>
            <dd>
              <TextoInline valor={s.campanha} rotulo="Campanha" placeholder="Adicionar campanha" max={80} sugestoes={campanhas}
                desativado={!podeEditar} onSalvar={(t) => mudar({ campanha: t }, "Campanha")} />
            </dd>
            <dt>CTA</dt>
            <dd>
              <TextoInline valor={s.cta} rotulo="CTA" placeholder="Adicionar CTA" max={60} sugestoes={CTAS_SUGERIDOS}
                desativado={!podeEditar} onSalvar={(t) => mudar({ cta: t }, "CTA")} />
            </dd>
            <dt>Link</dt>
            <dd>
              {podeEditar
                ? <TextoInline valor={s.linkUrl} rotulo="Link" placeholder="Adicionar link" max={500} onSalvar={salvarLink} />
                : s.linkUrl
                  ? <a href={s.linkUrl} target="_blank" rel="noreferrer noopener" className="sto-det-link">{s.linkUrl}</a>
                  : "—"}
            </dd>
          </dl>

          <div className="sto-det-obs">
            <span className="sto-det-rot">Observações</span>
            <TextoInline multilinha max={2000} valor={s.observacoes} rotulo="Observações" desativado={!podeEditar}
              placeholder="Ex.: funcionou porque mostrou o preço direto no criativo."
              onSalvar={(t) => mudar({ observacoes: t }, "Observação")} />
          </div>

          <ParecidosDoStory parecidos={parecidos} nomes={nomes} onAbrir={onAbrirOutro} />

          <p className="sto-det-rodape">
            {s.criadorNome ? `Registrado por ${s.criadorNome}` : "Registrado"}
            {s.createdAt ? ` em ${rotuloDataHora(s.createdAt)}` : ""}
          </p>
        </div>
      </div>
    </PainelLateral>
  );
}
