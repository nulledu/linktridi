"use client";

import { useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { Selo } from "../../ui/primitives";
import { CartaoPainel, VazioPainel } from "../../ui/CartaoPainel";
import { Abas } from "../../ui/Abas";
import { Fila, Progresso } from "../../ui/micro";
import { COLUNAS_CONTROLE, colunasControle, type ColunaControle, type ItemControle } from "@/lib/producao-hub";
import { duracao } from "@/lib/maquina-quadro";
import { useProduction, fmt } from "../parts";
import { useQuadro } from "../dados";
import { EstadoLeitura } from "../VisaoProducao";
import { QuadroMaquinas } from "../QuadroMaquinas";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Controle agora: o chão de fábrica neste minuto. Cinco colunas por ESTADO
 * (andamento, aguardando, pausado, atrasado, concluído) — a pergunta é "o que
 * está travado?", não "em que máquina está?". Quem precisa mover trabalho
 * entre máquinas troca pra "Por máquina": é o quadro arrastável de sempre,
 * sobre os mesmos dados, então as duas vistas nunca discordam.
 */
export function ControleAgora() {
  const [vista, setVista] = useState<"estado" | "maquina">("estado");
  const [filtro, setFiltro] = useState<"todas" | ColunaControle>("todas");
  const [busca, setBusca] = useState("");
  const lq = useQuadro();
  const { snap } = useProduction("period=hoje");

  const colunas = useMemo(() => (lq.estado === "ok" ? colunasControle(lq.dado) : null), [lq]);
  const casa = (i: ItemControle) => {
    if (!busca.trim()) return true;
    const q = norm(busca);
    return [i.cartao.titulo, i.cartao.detalhe, i.maquina, i.cartao.responsavel].some((x) => x && norm(x).includes(q));
  };
  const mostrar = COLUNAS_CONTROLE.filter((c) => filtro === "todas" || c.chave === filtro);

  return (
    <div className="pv-pilha">
      <Abas valor={vista} onMuda={setVista} ariaLabel="Vista do controle"
        itens={[
          { valor: "estado", rotulo: <><Icon name="layout-kanban" size={15} color="currentColor" /> Por estado</> },
          { valor: "maquina", rotulo: <><Icon name="layout-columns" size={15} color="currentColor" /> Por máquina</> },
        ]} />

      {vista === "maquina" ? <QuadroMaquinas /> : (
        <>
          <div className="pv-filtros">
            <Abas valor={filtro} onMuda={setFiltro} ariaLabel="Filtrar por estado"
              itens={[
                { valor: "todas" as const, rotulo: "Todas" },
                ...COLUNAS_CONTROLE.map((c) => ({ valor: c.chave, rotulo: c.nome, badge: colunas ? <span className="pv-conta mt-num">{colunas[c.chave].length}</span> : undefined })),
              ]} />
            <label className="pv-busca">
              <Icon name="search" size={16} color="var(--text-dim)" />
              <input className="ui-input" type="search" placeholder="Buscar pedido, produto, máquina…" value={busca}
                onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no controle" />
            </label>
          </div>

          <EstadoLeitura l={lq} vazio={false}>
            {/* Cinco colunas no computador; no celular a fileira rola DENTRO do
                bloco com encaixe, uma coluna por vez — nunca a página. */}
            <div className="pv-kanban" data-uma={mostrar.length === 1 ? "1" : undefined}>
              {colunas && mostrar.map((c) => {
                const itens = colunas[c.chave].filter(casa);
                const cor = c.tom === "neutro" ? "var(--text-dim)" : c.tom === "destaque" ? "var(--primary)" : `var(--${c.tom})`;
                return (
                  <section key={c.chave} className="pv-coluna" aria-label={c.nome}>
                    <header className="pv-coluna-cab">
                      <span className="og-cartao-icone" style={{ background: `color-mix(in srgb, ${cor} 14%, transparent)` }} aria-hidden>
                        <Icon name={c.icone} size={16} color={cor} />
                      </span>
                      <b>{c.nome}</b>
                      <span className="pv-conta mt-num">{itens.length}</span>
                    </header>
                    {itens.length === 0 ? <p className="pv-coluna-vazia">Nada aqui.</p> : (
                      <Fila className="pv-coluna-lista">
                        {itens.slice(0, 40).map((i) => <CartaoControle key={i.cartao.chave} i={i} cor={cor} />)}
                      </Fila>
                    )}
                  </section>
                );
              })}
            </div>
          </EstadoLeitura>
        </>
      )}

      {snap && (
        <div className="og-duo">
          <CartaoPainel icone="alert-triangle" titulo="Problemas frequentes" sub="Do fluxo de pedidos no ERP">
            <ul className="og-lista">
              {snap.problemas.map((p) => {
                const ok = p.startsWith("Nenhum");
                return (
                  <li key={p} className="og-proxima">
                    <Icon name={ok ? "circle-check" : "alert-triangle"} size={18} color={ok ? "var(--ok)" : "var(--atencao)"} style={{ flex: "none" }} />
                    <span style={{ fontSize: 13.5, minWidth: 0 }}>{p}</span>
                  </li>
                );
              })}
            </ul>
          </CartaoPainel>
          <CartaoPainel icone="checklist" titulo="O que fazer agora" sub="Pedidos parados em cada ponto">
            <ul className="og-lista">
              {snap.acoes.map((a) => (
                <li key={a.label} className="og-proxima">
                  <Icon name={a.icon} size={18} color={a.color} style={{ flex: "none" }} />
                  <span className="og-linha-tit" style={{ flex: 1, fontWeight: 500 }}>{a.label}</span>
                  <b className="mt-num" style={{ fontSize: 16 }}>{fmt(a.value)}</b>
                  {a.severidade !== "ok" && <Selo tom={a.severidade === "alta" ? "perigo" : "atencao"}>{a.severidade === "alta" ? "Alta" : "Média"}</Selo>}
                </li>
              ))}
            </ul>
          </CartaoPainel>
        </div>
      )}

      {snap && (
        <CartaoPainel icone="box" titulo="O que falta produzir" sub="Por tipo e os itens com mais peças pendentes">
          {snap.toProduceCategorias.length === 0 ? <VazioPainel texto="Nada pendente." /> : (
            <div className="og-celulas">
              {snap.toProduceCategorias.map((c) => (
                <div key={c.categoria} className="pv-tipo">
                  <span className="og-linha-sub" style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name={c.icon} size={15} color={c.cor} /> {c.categoria}
                  </span>
                  <b className="stat mt-num" style={{ fontSize: 24 }}>{fmt(c.total)}</b>
                  <span className="og-linha-sub" style={{ marginTop: 0 }}>{c.itens} {c.itens === 1 ? "item" : "itens"}</span>
                </div>
              ))}
            </div>
          )}
          {snap.toProduce.length > 0 && (
            <ul className="og-lista">
              {snap.toProduce.slice(0, 8).map((p) => (
                <li key={p.nome} className="og-proxima">
                  {p.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.imageUrl} alt="" className="pv-foto" />
                    : <span className="pv-foto" />}
                  <span className="og-linha-tit" style={{ flex: 1, fontWeight: 500 }}>{p.nome}</span>
                  <b className="mt-num">{fmt(p.total)}</b>
                </li>
              ))}
            </ul>
          )}
        </CartaoPainel>
      )}
    </div>
  );
}

function CartaoControle({ i, cor }: { i: ItemControle; cor: string }) {
  const c = i.cartao;
  const tempo = c.status === "concluida" ? duracao(c.minutos) : c.status === "andamento" ? `${duracao(c.rodandoHaMin)} de ${duracao(c.minutos)}` : duracao(c.minutos);
  const pct = c.status === "concluida" ? 100 : c.progressoPct;
  return (
    <article className="pv-card">
      <div className="pv-card-cab">
        <b className="og-linha-tit">{c.titulo}</b>
        {c.urgente && <Selo tom="perigo">Urgente</Selo>}
      </div>
      {c.detalhe && <span className="og-linha-sub" style={{ marginTop: 0 }}>{c.detalhe}</span>}
      <Progresso valor={pct} max={100} rotulo={`Progresso de ${c.titulo}`} altura={5} cor={cor} />
      <div className="pv-card-meta">
        <span><Icon name="settings" size={13} color="var(--text-dim)" />{i.maquina ?? "Sem máquina"}</span>
        <span><Icon name="clock" size={13} color="var(--text-dim)" />{c.minutos || c.rodandoHaMin ? tempo : "—"}</span>
        {c.responsavel && <span><Icon name="user" size={13} color="var(--text-dim)" />{c.responsavel}</span>}
      </div>
      <div className="pv-card-pe">
        <Selo tom="destaque">{i.etapa}</Selo>
        {i.motivo && <span className="pv-motivo" style={{ color: cor }}>{i.motivo}</span>}
      </div>
    </article>
  );
}
