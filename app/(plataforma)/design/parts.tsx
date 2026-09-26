"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { Selo } from "../ui/primitives";
import { Avatar } from "../ui/Avatar";
import { PainelLateral, Botao } from "../ui/controles";
import { toast } from "../Toast";
import { STATUS_DESIGN, tempoCurto, type Prioridade, type StatusDesign } from "@/lib/design-fluxo";
import type { ProjetoLinha } from "@/lib/design-projetos";
import type { DesignPedidoDetalhe } from "@/lib/design";

export const statusInfo = (s: StatusDesign) => STATUS_DESIGN.find((x) => x.chave === s)!;

export function SeloStatus({ s }: { s: StatusDesign }) {
  const i = statusInfo(s);
  return <Selo tom={i.tom}>{i.nome}</Selo>;
}

export const PRIORIDADE: Record<Prioridade, { rotulo: string; tom: "perigo" | "atencao" | "neutro" }> = {
  alta: { rotulo: "Alta", tom: "perigo" },
  media: { rotulo: "Média", tom: "atencao" },
  baixa: { rotulo: "Baixa", tom: "neutro" },
};

export function SeloPrioridade({ p }: { p: Prioridade }) {
  return <Selo tom={PRIORIDADE[p].tom}>{PRIORIDADE[p].rotulo}</Selo>;
}

/** Horas desde `desde` no momento da leitura (o servidor manda o valor já contado). */
export const naEtapa = (p: ProjetoLinha) => tempoCurto(p.horasNaEtapa);

/** Nome curto do pedido: o `id_proprio` do ERP é "cliente - telefone". */
export const refCurta = (ref: string) => (ref.includes(" - ") ? ref.split(" - ")[0] : ref);

export function Miniatura({ url, tamanho = 44 }: { url: string | null; tamanho?: number }) {
  const [falhou, setFalhou] = useState(false);
  if (!url || falhou) {
    return <span className="dv-mini" style={{ width: tamanho, height: tamanho }} aria-hidden><Icon name="photo" size={Math.round(tamanho * 0.42)} color="var(--text-dim)" /></span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" loading="lazy" className="dv-mini" style={{ width: tamanho, height: tamanho }} onError={() => setFalhou(true)} />;
}

export function ContaArquivos({ p }: { p: ProjetoLinha }) {
  const n = p.arquivos.arteCliente + p.arquivos.vetorizadas + (p.arquivos.logo ? 1 : 0);
  return <span className="dv-meta-i"><Icon name="folder" size={13} color="var(--text-dim)" />{n} {n === 1 ? "arquivo" : "arquivos"}</span>;
}

/** O cartão de projeto — Kanban de Projetos e Controle agora. */
export function CartaoProjeto({ p, onAbrir, etapa = true }: { p: ProjetoLinha; onAbrir: (p: ProjetoLinha) => void; etapa?: boolean }) {
  return (
    <button type="button" className="pv-card dv-card ui-card-alvo" onClick={() => onAbrir(p)} data-prioridade={p.prioridade}>
      <div className="dv-card-topo">
        <Miniatura url={p.thumb} tamanho={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b className="og-linha-tit">{refCurta(p.ref)}</b>
          <span className="og-linha-sub" style={{ marginTop: 0 }}>{p.produto}{p.itens > 1 ? ` +${p.itens - 1}` : ""}</span>
        </div>
      </div>
      <div className="pv-card-meta">
        <span className="dv-meta-i"><Icon name="user" size={13} color="var(--text-dim)" />{p.responsavel ?? "Sem responsável"}</span>
        <span className="dv-meta-i"><Icon name="clock" size={13} color="var(--text-dim)" />{naEtapa(p)} na etapa</span>
        <ContaArquivos p={p} />
      </div>
      <div className="pv-card-pe">
        {etapa && <SeloStatus s={p.status} />}
        {p.prioridade !== "baixa" && <SeloPrioridade p={p.prioridade} />}
        {p.urgente && <Selo tom="perigo">Urgente</Selo>}
        {p.emAtraso && !p.urgente && <Selo tom="perigo">Em atraso</Selo>}
        {p.parado && <span className="pv-motivo" style={{ color: "var(--atencao)" }}>Parado há {naEtapa(p)}</span>}
      </div>
    </button>
  );
}

/**
 * Abrir projeto: as artes do pedido (cliente, vetorizada, reprovadas) lidas do
 * ERP pela mesma rota que o painel de reprovações já usava.
 */
export function DetalheProjeto({ p, onFechar }: { p: ProjetoLinha; onFechar: () => void }) {
  const [det, setDet] = useState<DesignPedidoDetalhe | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/design/pedido?id=${p.id}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => { if (vivo) { if (d?.itens) setDet(d); else setErro(true); } })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [p.id]);

  const copiar = () => { void navigator.clipboard?.writeText(p.ref).then(() => toast.ok("ID do pedido copiado.")); };

  return (
    <PainelLateral centrado icone="palette" titulo={refCurta(p.ref)} subtitulo={p.produto} onFechar={onFechar}
      acoes={<Botao tamanho="sm" icone="copy" onClick={copiar}>Copiar ID</Botao>}>
      <div className="pv-pilha">
        <div className="dv-fatos">
          <Fato rotulo="Status"><SeloStatus s={p.status} /></Fato>
          <Fato rotulo="Prioridade"><SeloPrioridade p={p.prioridade} /></Fato>
          <Fato rotulo="Na etapa há">{naEtapa(p)}</Fato>
          <Fato rotulo="Responsável">
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {p.responsavel && <Avatar url={p.foto} nome={p.responsavel} size={22} formato="redondo" />}
              {p.responsavel ?? "Ninguém pegou"}
            </span>
          </Fato>
          <Fato rotulo="Produtos">{p.tipos.join(", ") || "—"}</Fato>
          <Fato rotulo="Atualizado">{p.atualizadoEm ? new Date(p.atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—"}</Fato>
        </div>
        {p.arquivos.drive && (
          <a className="dv-link" href={p.arquivos.drive} target="_blank" rel="noreferrer"><Icon name="external-link" size={15} /> Pasta do pedido no Drive</a>
        )}
        {erro && <p className="og-limpo">Não deu pra abrir as artes agora.</p>}
        {!det && !erro && <p className="og-limpo">Carregando as artes…</p>}
        {det?.itens.map((it, i) => (
          <section key={i} className="dv-item">
            <div className="pv-etapa-cab">
              <b className="og-linha-tit">{it.nome}</b>
              <Selo tom={it.aprovado ? "ok" : "neutro"}>{it.aprovado ? "Aprovado" : it.tipo}</Selo>
            </div>
            {it.arteTexto && <p className="og-linha-sub" style={{ whiteSpace: "normal" }}>Texto: {it.arteTexto}</p>}
            <div className="dv-artes">
              {it.arteCliente.map((u) => <Arte key={u} url={u} rotulo="Do cliente" />)}
              {it.vetorizada && <Arte url={it.vetorizada} rotulo="Arte final" tom="ok" />}
              {it.reprovadas.map((u) => <Arte key={u} url={u} rotulo="Reprovada" tom="perigo" />)}
            </div>
            {it.motivo && <p className="dv-motivo"><Icon name="adjustments" size={14} color="var(--perigo)" /> {it.motivo}</p>}
          </section>
        ))}
        {det && det.itens.length === 0 && <p className="og-limpo">Nenhum item personalizável neste pedido.</p>}
      </div>
    </PainelLateral>
  );
}

function Fato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="dv-fato">
      <span className="og-linha-sub" style={{ marginTop: 0 }}>{rotulo}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>{children}</span>
    </div>
  );
}

function Arte({ url, rotulo, tom }: { url: string; rotulo: string; tom?: "ok" | "perigo" }) {
  const pdf = /\.pdf(\?|$)/i.test(url);
  return (
    <a className="dv-arte" href={url} target="_blank" rel="noreferrer" data-tom={tom}>
      {pdf ? <span className="dv-arte-pdf"><Icon name="file-text" size={26} color="var(--text-dim)" />PDF</span>
        // eslint-disable-next-line @next/next/no-img-element
        : <img src={url} alt={rotulo} loading="lazy" />}
      <span className="dv-arte-rot">{rotulo}</span>
    </a>
  );
}
