"use client";

// Abas APARÊNCIA / ESPAÇAMENTO / VISIBILIDADE do painel direito do editor de
// páginas. O mesmo componente serve bloco e seção: a seção passa
// `mostrarVisibilidade={false}` porque liberação temporizada é coisa de bloco.
//
// A regra que importa aqui: liberação por vídeo (base "video", % assistido e
// "ao terminar") só é oferecível se a página TEM um bloco de vídeo. Sem vídeo,
// as opções aparecem travadas e explicadas — e se o usuário já tinha escolhido
// uma delas antes de apagar o vídeo, avisamos que o runtime cai pro tempo de
// página (mesmo contrato de lib/tridiflow-pagina.ts).

import { ANIMACOES, type Alinhamento, type Estilo, type Largura, type ModoVisibilidade, type Visibilidade } from "@/lib/tridiflow-pagina";
import { GRADIENTES } from "@/lib/tridiflow-pagina-tema";
import type { Variante } from "@/lib/tridiflow-ab";
import { ACENTO, Campo, EntradaImagem, LinhaCor, LinhaToggle, Numero, Secao, Selecao, Segmentado, inp } from "../_ui";
import { Icon } from "../../../Icon";
import { GlassSelect } from "../../../GlassPicker";
import { Deslizante } from "../../../ui/Deslizante";
import { EditorGradiente } from "./InspetorTema";

const SEM_VIDEO = "Adicione um bloco de vídeo na página para usar esta opção.";

type BaseTempo = "pagina" | "video";

const MODOS: { valor: ModoVisibilidade; label: string; precisaVideo: boolean }[] = [
  { valor: "sempre", label: "Sempre visível", precisaVideo: false },
  { valor: "apos_tempo", label: "Mostrar após um tempo", precisaVideo: false },
  { valor: "apos_percentual", label: "Mostrar após % assistido", precisaVideo: true },
  { valor: "ao_terminar", label: "Mostrar quando o vídeo terminar", precisaVideo: true },
];

const LARGURAS: { valor: Largura; label: string }[] = [
  { valor: "estreita", label: "Estreita" },
  { valor: "normal", label: "Normal" },
  { valor: "larga", label: "Larga" },
  { valor: "cheia", label: "Cheia (borda a borda)" },
];

/** 0 (ou vazio) quer dizer "não definido" — some do estilo em vez de virar 0px. */
const opcional = (v: number): number | undefined => (v > 0 ? v : undefined);

function tempoLegivel(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const resto = s % 60;
  return resto ? `${min} min ${resto} s` : `${min} min`;
}

/** A liberação escolhida depende de existir vídeo na página? */
function dependeDeVideo(v: Visibilidade): boolean {
  if (v.modo === "apos_percentual" || v.modo === "ao_terminar") return true;
  return v.modo === "apos_tempo" && v.base === "video";
}

function fraseResumo(v: Visibilidade): string {
  switch (v.modo) {
    case "apos_tempo": {
      const t = tempoLegivel(v.segundos ?? 0);
      return v.base === "video"
        ? `O bloco aparece ${t} depois que o vídeo começa.`
        : `O bloco aparece ${t} depois que a página abre.`;
    }
    case "apos_percentual":
      return `O bloco aparece quando ${Math.round(v.percentual ?? 0)}% do vídeo for assistido.`;
    case "ao_terminar":
      return "O bloco aparece quando o vídeo terminar.";
    default:
      return "O bloco fica visível desde que a página abre.";
  }
}

function Nota({ texto, alerta }: { texto: string; alerta?: boolean }) {
  const cor = alerta ? "var(--tf-warn, #b45309)" : "var(--text-dim)";
  return (
    <span style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 10.5, color: cor, lineHeight: 1.4 }}>
      <Icon name={alerta ? "alert-triangle" : "info-circle"} size={13} color={cor} style={{ flex: "none", marginTop: 1 }} />
      <span>{texto}</span>
    </span>
  );
}

/** Select do modo — o `Selecao` do _ui não sabe travar opção, e aqui precisa. */
function SelecaoModo({ valor, onChange, semVideo }: {
  valor: ModoVisibilidade; onChange: (v: ModoVisibilidade) => void; semVideo: boolean;
}) {
  return (
    <GlassSelect value={valor} onChange={(v) => onChange(v as ModoVisibilidade)} style={inp}
      options={MODOS.map((m) => {
        const travado = m.precisaVideo && semVideo;
        return {
          value: m.valor,
          label: travado ? `${m.label} (precisa de vídeo)` : m.label,
          disabled: travado,
        };
      })} />
  );
}

/** Segmentado da base do tempo, com a opção "vídeo" travável. */
function SegmentadoBase({ valor, onChange, semVideo }: {
  valor: BaseTempo; onChange: (v: BaseTempo) => void; semVideo: boolean;
}) {
  const opcoes: { valor: BaseTempo; label: string; travado: boolean }[] = [
    { valor: "pagina", label: "Da abertura da página", travado: false },
    { valor: "video", label: "Do início do vídeo", travado: semVideo },
  ];
  return (
    <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 3, borderRadius: 9, border: "1px solid var(--border)" }}>
      {opcoes.map((o) => {
        const ativo = valor === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            disabled={o.travado}
            title={o.travado ? SEM_VIDEO : o.label}
            onClick={() => onChange(o.valor)}
            style={{
              flex: 1, padding: "7px 6px", borderRadius: 7, border: "none",
              cursor: o.travado ? "not-allowed" : "pointer",
              fontFamily: "inherit", fontSize: 11, fontWeight: 700, lineHeight: 1.3,
              background: ativo ? ACENTO : "transparent",
              color: ativo ? "#fff" : "var(--text-dim)",
              opacity: o.travado ? 0.45 : 1,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function InspetorEstilo({ estilo, visivel, onEstilo, onVisivel, paginaTemVideo, mostrarVisibilidade = true, recolhido = false, teste, onTeste, testeAtivo = false }: {
  estilo: Estilo;
  visivel?: Visibilidade;
  onEstilo: (patch: Partial<Estilo>) => void;
  onVisivel: (v: Visibilidade) => void;
  paginaTemVideo: boolean;
  mostrarVisibilidade?: boolean;
  /** Teste A/B: em qual versão este bloco aparece. Undefined = nas duas. */
  teste?: Variante;
  onTeste?: (v: Variante | undefined) => void;
  /** A seção só existe com o teste ligado — senão é um controle que não faz
   *  nada, e controle que não faz nada é o que enche editor de dúvida. */
  testeAtivo?: boolean;
  /** Empilhado abaixo do conteúdo: nasce fechado pra não empurrar o conteúdo
   *  (que é o que a pessoa vem editar) pra baixo da dobra. */
  recolhido?: boolean;
}) {
  const v: Visibilidade = visivel ?? { modo: "sempre" };
  const semVideo = !paginaTemVideo;
  const base: BaseTempo = v.base === "video" ? "video" : "pagina";
  const vaiCair = semVideo && dependeDeVideo(v);

  const trocarModo = (modo: ModoVisibilidade) => {
    if (modo === "apos_tempo") {
      onVisivel({ modo, segundos: v.segundos ?? 5, base: semVideo ? "pagina" : base });
      return;
    }
    if (modo === "apos_percentual") {
      if (semVideo) return;
      onVisivel({ modo, percentual: v.percentual ?? 50 });
      return;
    }
    if (modo === "ao_terminar" && semVideo) return;
    onVisivel({ modo });
  };

  return (
    <div style={{ display: "grid" }}>
      <Secao titulo="APARÊNCIA" aberta={!recolhido}>
        <Campo label="Alinhamento">
          <Segmentado<Alinhamento>
            valor={estilo.align ?? "center"}
            onChange={(align) => onEstilo({ align })}
            opcoes={[
              { valor: "left", label: "Esq.", titulo: "Alinhar à esquerda" },
              { valor: "center", label: "Centro", titulo: "Centralizar" },
              { valor: "right", label: "Dir.", titulo: "Alinhar à direita" },
            ]}
          />
        </Campo>

        <LinhaCor label="Cor do texto" valor={estilo.cor} onChange={(cor) => onEstilo({ cor: cor || undefined })} padrao="#111114" />
        <LinhaCor label="Cor de fundo" valor={estilo.fundo} onChange={(fundo) => onEstilo({ fundo: fundo || undefined })} padrao="#ffffff" />

        {/* Fundo próprio: gradiente da biblioteca ou imagem. Vale pra seção
            (faixa colorida) e pro bloco (card de oferta em destaque). */}
        <Campo label="Fundo especial" hint="Gradiente ou imagem por cima da cor.">
          <Segmentado
            valor={estilo.fundoImagem !== undefined ? "imagem" : estilo.fundoGradiente || estilo.fundoGradienteCustom ? "gradiente" : "nenhum"}
            onChange={(t) => onEstilo(
              t === "nenhum" ? { fundoGradiente: undefined, fundoGradienteCustom: undefined, fundoImagem: undefined }
                : t === "gradiente" ? { fundoImagem: undefined, fundoGradiente: estilo.fundoGradiente ?? GRADIENTES[0].id }
                // "" (e não undefined) é o que revela o campo de imagem — antes
                // escolher "Imagem" não mostrava nada e o segmentado voltava
                // sozinho pra "Nenhum".
                : { fundoGradiente: undefined, fundoGradienteCustom: undefined, fundoImagem: estilo.fundoImagem ?? "" }
            )}
            opcoes={[{ valor: "nenhum", label: "Nenhum" }, { valor: "gradiente", label: "Gradiente" }, { valor: "imagem", label: "Imagem" }]}
          />
        </Campo>

        {(estilo.fundoGradiente || estilo.fundoGradienteCustom) && !estilo.fundoImagem && (
          <div style={{ margin: "2px 0 10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
              {GRADIENTES.map((g) => (
                <button key={g.id} title={g.rotulo} onClick={() => onEstilo({ fundoGradiente: g.id, fundoGradienteCustom: undefined })}
                  style={{
                    height: 30, borderRadius: 7, cursor: "pointer", background: g.css,
                    border: `2px solid ${!estilo.fundoGradienteCustom && estilo.fundoGradiente === g.id ? ACENTO : "transparent"}`,
                  }} />
              ))}
            </div>
            {/* Mesmo editor de gradiente próprio do tema — quando existir, ele
                ganha do preset (cssDoGradiente já decide assim). */}
            <EditorGradiente valor={estilo.fundoGradienteCustom} onChange={(g) => onEstilo({ fundoGradienteCustom: g })} />
          </div>
        )}

        {estilo.fundoImagem !== undefined && !estilo.fundoGradiente && (
          <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
            <EntradaImagem valor={estilo.fundoImagem} onChange={(v) => onEstilo({ fundoImagem: v })} />
            <Campo label="Como preencher">
              <Selecao valor={estilo.fundoAjuste ?? "cobrir"}
                onChange={(v) => onEstilo({ fundoAjuste: v === "cobrir" ? undefined : (v as Estilo["fundoAjuste"]) })}
                opcoes={[{ valor: "cobrir", label: "Cobrir o bloco" }, { valor: "conter", label: "Caber inteira" }, { valor: "repetir", label: "Repetir (textura)" }]} />
            </Campo>
            <LinhaToggle label="Parado ao rolar" ativo={!!estilo.fundoFixo} onChange={(v) => onEstilo({ fundoFixo: v || undefined })} />
          </div>
        )}

        {(estilo.fundoGradiente || estilo.fundoGradienteCustom || estilo.fundoImagem) && (
          <>
            <Campo label={`Escurecer por cima — ${estilo.veu ?? 0}%`} hint="Deixa o texto legível sobre foto.">
              <Deslizante min={0} max={90} step={5} value={estilo.veu ?? 0}
                onChange={(v) => onEstilo({ veu: v || undefined })}
                aria-label="Escurecer por cima" />
            </Campo>
            {!!estilo.veu && (
              <LinhaCor label="Cor do escurecimento" valor={estilo.veuCor}
                onChange={(c) => onEstilo({ veuCor: c || undefined })} padrao="#000000" />
            )}
          </>
        )}

        <Campo label="Sombra">
          <Selecao
            valor={estilo.sombra ?? "nenhuma"}
            onChange={(sombra) => onEstilo({ sombra: sombra === "nenhuma" ? undefined : sombra })}
            opcoes={[
              { valor: "nenhuma", label: "Sem sombra" }, { valor: "leve", label: "Leve" },
              { valor: "media", label: "Média" }, { valor: "forte", label: "Forte" },
            ]}
          />
        </Campo>

        {/* Animação de entrada — o bloco aparece quando entra na tela. */}
        <Campo label="Animação" hint="Acontece quando o visitante rola até aqui.">
          <Selecao
            valor={estilo.animacao ?? "nenhuma"}
            onChange={(animacao) => onEstilo({ animacao: animacao === "nenhuma" ? undefined : animacao })}
            opcoes={ANIMACOES.map((a) => ({ valor: a.id, label: a.rotulo }))}
          />
        </Campo>
        {estilo.animacao && estilo.animacao !== "nenhuma" && (
          <Campo label="Atraso da animação" hint="Escalona a entrada de vários blocos seguidos.">
            <Numero valor={estilo.animacaoAtraso} onChange={(n) => onEstilo({ animacaoAtraso: opcional(n) })} min={0} max={2000} sufixo="ms" />
          </Campo>
        )}

        <Campo label="Tamanho da fonte" hint="0 usa o tamanho padrão do bloco.">
          <Numero valor={estilo.tamanho} onChange={(n) => onEstilo({ tamanho: opcional(n) })} min={0} max={140} sufixo="px" />
        </Campo>

        <Campo label="Largura">
          <Selecao<Largura>
            valor={estilo.largura ?? "normal"}
            onChange={(largura) => onEstilo({ largura })}
            opcoes={LARGURAS}
          />
        </Campo>

        <LinhaCor label="Cor da borda" valor={estilo.borda} onChange={(borda) => onEstilo({ borda: borda || undefined })} padrao="#e5e5ea" />

        <Campo label="Espessura da borda" hint={estilo.borda ? undefined : "Escolha uma cor de borda para ela aparecer."}>
          <Numero valor={estilo.bordaLargura} onChange={(n) => onEstilo({ bordaLargura: opcional(n) })} min={0} max={20} sufixo="px" />
        </Campo>

        <Campo label="Arredondamento">
          <Numero valor={estilo.raio} onChange={(n) => onEstilo({ raio: opcional(n) })} min={0} max={80} sufixo="px" />
        </Campo>
      </Secao>

      <Secao titulo="ESPAÇAMENTO" aberta={false}>
        <Campo label="Acima">
          <Numero valor={estilo.padTop} onChange={(padTop) => onEstilo({ padTop })} min={0} max={400} sufixo="px" />
        </Campo>
        <Campo label="Abaixo">
          <Numero valor={estilo.padBottom} onChange={(padBottom) => onEstilo({ padBottom })} min={0} max={400} sufixo="px" />
        </Campo>
        <Campo label="Laterais">
          <Numero valor={estilo.padX} onChange={(padX) => onEstilo({ padX })} min={0} max={200} sufixo="px" />
        </Campo>
      </Secao>

      {/* RESPONSIVIDADE: tudo que muda entre computador e celular junto, em vez
          de espalhado em Aparência e Visibilidade. Fechada por padrão — só quem
          vai mexer no celular abre. */}
      <Secao titulo="RESPONSIVIDADE" aberta={false}>
        <Campo label="Tamanho no celular" hint="Vazio = mesmo do computador.">
          <Numero valor={estilo.tamanhoMobile} onChange={(n) => onEstilo({ tamanhoMobile: opcional(n) })} min={0} max={140} sufixo="px" />
        </Campo>
        <LinhaToggle
          label="Ocultar no computador"
          hint="Some só em telas grandes."
          ativo={!!estilo.ocultarDesktop}
          onChange={(ocultarDesktop) => onEstilo({ ocultarDesktop: ocultarDesktop || undefined })}
        />
        <LinhaToggle
          label="Ocultar no celular"
          hint="Some só em telas pequenas."
          ativo={!!estilo.ocultarMobile}
          onChange={(ocultarMobile) => onEstilo({ ocultarMobile: ocultarMobile || undefined })}
        />
      </Secao>

      {testeAtivo && onTeste && (
        <Secao titulo="TESTE A/B" aberta={!!teste}>
          <Campo label="Este bloco aparece em"
            hint="“Nas duas” é o normal. Marque A ou B só no que você está testando — por exemplo, duas versões da mesma headline.">
            <Segmentado
              valor={teste ?? "ambas"}
              onChange={(v) => onTeste(v === "ambas" ? undefined : (v as Variante))}
              opcoes={[
                { valor: "ambas", label: "Nas duas" },
                { valor: "a", label: "Só A" },
                { valor: "b", label: "Só B" },
              ]}
            />
          </Campo>
        </Secao>
      )}

      {mostrarVisibilidade && (
        <Secao titulo="VISIBILIDADE" aberta={!recolhido}>
          <Campo label="Quando o bloco aparece">
            <SelecaoModo valor={v.modo} onChange={trocarModo} semVideo={semVideo} />
          </Campo>

          {semVideo && <Nota texto={SEM_VIDEO} />}
          {vaiCair && (
            <Nota
              alerta
              texto="A página não tem mais vídeo: esta liberação vai cair para o tempo de abertura da página."
            />
          )}

          {v.modo === "apos_tempo" && (
            <>
              <Campo label="Tempo de espera">
                <Numero
                  valor={v.segundos ?? 5}
                  onChange={(segundos) => onVisivel({ ...v, modo: "apos_tempo", segundos })}
                  min={0}
                  max={7200}
                  sufixo="segundos"
                />
              </Campo>
              <Campo label="Contar a partir de">
                <SegmentadoBase
                  valor={semVideo ? "pagina" : base}
                  onChange={(b) => onVisivel({ ...v, modo: "apos_tempo", base: b })}
                  semVideo={semVideo}
                />
              </Campo>
            </>
          )}

          {v.modo === "apos_percentual" && (
            <Campo label="Percentual assistido" hint="Quanto do vídeo a pessoa precisa ver.">
              <Numero
                valor={v.percentual ?? 50}
                onChange={(percentual) => onVisivel({ ...v, modo: "apos_percentual", percentual })}
                min={0}
                max={100}
                sufixo="%"
              />
            </Campo>
          )}

          <div
            style={{
              display: "flex", alignItems: "flex-start", gap: 7, marginTop: 2,
              padding: "9px 10px", borderRadius: 9,
              background: "var(--surface-2)", border: "1px solid var(--border)",
            }}
          >
            <Icon name="eye" size={14} color="var(--text-dim)" style={{ flex: "none", marginTop: 1 }} />
            <span style={{ fontSize: 11.5, color: "var(--text)", lineHeight: 1.4 }}>
              {vaiCair
                ? `O bloco aparece ${tempoLegivel(v.segundos ?? 5)} depois que a página abre.`
                : fraseResumo(v)}
            </span>
          </div>
        </Secao>
      )}
    </div>
  );
}
