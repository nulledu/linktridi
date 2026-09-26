"use client";

// Aba "Feedback" da central de tutoriais: o "Este tutorial resolveu?" somado.
// Três degraus — a manchete (quanto a central resolve), o porquê do "ainda
// não" e o detalhe por guia, pior primeiro: é o guia que precisa de conserto
// que tem que saltar aos olhos, não o campeão.
import { Icon } from "@/app/(plataforma)/Icon";
import { proveitoDe, type MetricaTutorial, type Tutorial } from "@/lib/tridiflow-tutoriais";
import { MOTIVOS_NAO } from "@/lib/tridiflow-tutoriais-leitura";

const CHAVE_MOTIVO = { motivo_produto: "produto", motivo_passo: "passo", motivo_resultado: "resultado", motivo_outro: "outro" } as const;

export function FeedbackTutoriais({ tutoriais, metricas }: { tutoriais: Tutorial[]; metricas: MetricaTutorial[] }) {
  const porHandle = new Map(metricas.map((m) => [m.handle, m]));
  const soma = metricas.reduce((a, m) => ({
    vistas: a.vistas + (m.vistas || 0), uteis: a.uteis + (m.uteis || 0), inuteis: a.inuteis + (m.inuteis || 0), contatos: a.contatos + (m.contatos || 0),
  }), { vistas: 0, uteis: 0, inuteis: 0, contatos: 0 });
  const votos = soma.uteis + soma.inuteis;
  const proveito = proveitoDe(soma);
  const motivos = MOTIVOS_NAO.map((m) => ({ ...m, n: metricas.reduce((a, x) => a + (x.motivos?.[CHAVE_MOTIVO[m.campo]] ?? 0), 0) }));
  const totalMotivos = motivos.reduce((a, m) => a + m.n, 0);

  const linhas = tutoriais
    .map((t) => ({ t, m: porHandle.get(t.handle) }))
    .filter(({ m }) => m && (m.uteis + m.inuteis) > 0)
    .sort((a, b) => (proveitoDe(a.m) ?? 0) - (proveitoDe(b.m) ?? 0) || (b.m!.inuteis - a.m!.inuteis));

  if (!votos) return (
    <div className="cte-lista">
      <div className="cte-vazio-cartao">
        <span className="cte-vazio-icone"><Icon name="mood-smile" size={26} color="var(--primary-texto)" /></span>
        <strong>Nenhum voto ainda</strong>
        <p>Quando alguém responder “Este tutorial resolveu?” no fim de um guia publicado, os números aparecem aqui.</p>
      </div>
    </div>
  );

  return (
    <div className="cte-lista cte-feedback">
      <div className="kpi-row cte-fb-kpis">
        <Numero rotulo="Resolveu" valor={`${proveito}%`} nota={`${votos} ${votos === 1 ? "voto" : "votos"}`} />
        <Numero rotulo="Sim, resolveu" valor={soma.uteis} icone="mood-smile" />
        <Numero rotulo="Ainda não" valor={soma.inuteis} icone="mood-sad" />
        <Numero rotulo="Leituras" valor={soma.vistas} nota={soma.vistas ? `${Math.round((votos / soma.vistas) * 100)}% votaram` : undefined} />
        <Numero rotulo="Chamaram no WhatsApp" valor={soma.contatos} />
      </div>

      {totalMotivos > 0 && (
        <section className="cte-fb-bloco">
          <h3>Por que não resolveu</h3>
          {motivos.map((m) => (
            <div className="cte-fb-barra" key={m.campo}>
              <span><Icon name={m.icone} size={14} />{m.rotulo}</span>
              <span className="cte-fb-trilho"><i style={{ width: `${(m.n / totalMotivos) * 100}%` }} /></span>
              <b>{m.n}</b>
            </div>
          ))}
        </section>
      )}

      <section className="cte-fb-bloco">
        <h3>Por tutorial <small>pior primeiro</small></h3>
        {linhas.map(({ t, m }) => {
          const p = proveitoDe(m) ?? 0;
          const n = m!.uteis + m!.inuteis;
          return (
            <div className="cte-fb-barra" key={t.id}>
              <span title={t.titulo}>{t.titulo || "Sem título"}</span>
              <span className="cte-fb-trilho" data-alerta={n >= 5 && p < 50 ? "1" : undefined}><i style={{ width: `${p}%` }} /></span>
              <b>{p}% <small>· {m!.uteis}/{n}</small></b>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Numero({ rotulo, valor, nota, icone }: { rotulo: string; valor: number | string; nota?: string; icone?: string }) {
  return (
    <div className="cte-fb-num">
      <small>{icone && <Icon name={icone} size={13} />}{rotulo}</small>
      <strong>{valor}</strong>
      {nota && <small>{nota}</small>}
    </div>
  );
}
