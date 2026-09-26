"use client";

// ── As telas de um perfil: ligar, desligar e ordenar ─────────────────────────
//
// Isto substituiu o editor de arrastar blocos, e a razão é honesta: as telas
// da parede passaram a ser DESENHADAS (a doca em pé, o tráfego, o ranking), e
// um editor que oferece mover e redimensionar pedaços de uma tela desenhada
// promete o que a parede não cumpre — o bloco arrastado aqui não mudava de
// lugar lá. Prometer menos e cumprir é melhor do que o contrário.
//
// O que sobrou é o que se usa de fato no dia: qual tela entra no rodízio,
// quanto tempo cada uma fica, e em que ordem.

import type { Slide } from "@/lib/painel-layout";
import { BotaoIcone, Caixa } from "../ui/controles";
import { Icon } from "../Icon";
import "./telas.css";

/** O que cada tela É, escrito para quem nunca abriu o código. */
const DESCRICAO: Record<string, string> = {
  "classico-ranking": "Pódio dos vendedores, tabela e a meta da equipe",
  "classico-batalha": "Marketing × Comercial e a meta do mês",
  "classico-financeiro": "Faturamento, pedidos, ticket, projeção e de onde vem",
  "classico-trafego": "Investimento, vendas, ROAS, meta e o canal de anúncio",
  "classico-trafego-tela": "Investimento, vendas, ROAS, meta e o canal de anúncio",
  "classico-produtos": "Os mais vendidos, com foto e quantidade",
  "comercial-simples": "Pódio do mês, quatro números e a meta da equipe",
  "classico-logistica": "A doca: semana, o que está parado e os pedidos velhos",
};

/**
 * O assunto da tela, deduzido dos blocos que ela tem.
 *
 * Uma tela montada de peças soltas não tem um "tipo" gravado — o que existe é
 * a lista de blocos. Em vez de mostrar "5 blocos", que não diz nada a quem
 * está escolhendo o que vai na parede, a linha descreve o que a pessoa vai
 * ver.
 */
function descrever(slide: Slide): string {
  const tipos = slide.widgets.map((w) => w.tipo);
  const cheia = tipos.find((t) => t.startsWith("classico-"));
  if (cheia && DESCRICAO[cheia]) return DESCRICAO[cheia];
  if (tipos.includes("podio")) return DESCRICAO["classico-ranking"];
  if (tipos.includes("batalha")) return DESCRICAO["classico-batalha"];
  if (tipos.includes("produtos")) return DESCRICAO["classico-produtos"];
  if (tipos.includes("expedicao") || tipos.includes("falta")) return DESCRICAO["classico-logistica"];
  if (tipos.some((t) => t === "curva" || t === "barras" || t === "canais")) {
    return DESCRICAO["classico-trafego"];
  }
  if (tipos.includes("composicao") || tipos.includes("anel")) return DESCRICAO["classico-financeiro"];
  if (tipos.includes("pessoas") || tipos.includes("producao")) return "Quem está produzindo e a fila do turno";
  // Tela montada à mão: não invente um nome — diga o tamanho, que é honesto.
  return `${slide.widgets.length} ${slide.widgets.length === 1 ? "bloco" : "blocos"}`;
}

export function ListaDeTelas({
  slides,
  intervaloPadraoMs,
  onChange,
}: {
  slides: Slide[];
  /** Tempo geral, usado pela tela que não pediu um próprio. */
  intervaloPadraoMs: number;
  onChange: (slides: Slide[]) => void;
}) {
  function trocar(i: number, muda: (s: Slide) => Slide) {
    onChange(slides.map((s, k) => (k === i ? muda(s) : s)));
  }

  function mover(i: number, passo: number) {
    const destino = i + passo;
    if (destino < 0 || destino >= slides.length) return;
    const copia = [...slides];
    [copia[i], copia[destino]] = [copia[destino], copia[i]];
    onChange(copia);
  }

  const noAr = slides.filter((s) => s.ativo).length;

  return (
    <div className="lt-lista">
      <div className="lt-resumo">
        {noAr === 0 ? (
          // Uma parede sem tela nenhuma é um problema que só aparece na TV:
          // aqui a frase avisa antes de alguém ir até lá descobrir.
          <strong>Nenhuma tela no ar — a TV vai ficar sem nada para mostrar.</strong>
        ) : (
          <>
            {noAr} {noAr === 1 ? "tela no ar" : "telas no ar"}, girando na ordem abaixo.
          </>
        )}
      </div>

      {slides.map((s, i) => {
        const segundos = Math.round((s.duracaoMs ?? intervaloPadraoMs) / 1000);
        return (
          <div key={s.id} className="lt-linha" data-off={s.ativo ? "0" : "1"}>
            <span className="lt-selo">
              <Icon
                name={s.ativo ? "device-tv" : "eye-off"}
                size={19}
                color={s.ativo ? "var(--primary-texto, var(--primary))" : "var(--text-dim)"}
              />
            </span>

            <div className="lt-texto">
              <div className="lt-nome">{s.nome}</div>
              <div className="lt-desc">{descrever(s)}</div>
            </div>

            <label className="lt-switch">
              <Caixa marcado={s.ativo} onChange={(marc) => trocar(i, (x) => ({ ...x, ativo: marc }))} />
              No ar
            </label>

            <label className="lt-tempo">
              <input
                type="number"
                min={3}
                max={120}
                value={segundos}
                onChange={(e) => {
                  const seg = Number(e.target.value);
                  trocar(i, (x) => ({
                    ...x,
                    // Fora da faixa a TV ignoraria e usaria o padrão: guardar
                    // um número que não vale seria mentira gravada.
                    duracaoMs: Number.isFinite(seg) && seg >= 3 && seg <= 120 ? seg * 1000 : null,
                  }));
                }}
              />
              s
            </label>

            <div className="lt-ordem">
              <BotaoIcone icone="chevron-up" titulo="Subir na ordem" onClick={() => mover(i, -1)} disabled={i === 0} />
              <BotaoIcone icone="chevron-down" titulo="Descer na ordem" onClick={() => mover(i, 1)} disabled={i === slides.length - 1} />
            </div>
          </div>
        );
      })}

      {slides.length === 0 && (
        <div className="lt-vazio">Este perfil ainda não tem telas.</div>
      )}
    </div>
  );
}
