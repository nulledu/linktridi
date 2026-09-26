"use client";

// As peças pequenas do calendário: a marca de tipo, a pílula/faixa dentro
// da célula, a linha com carimbo de data (a mesma da `Agenda` do Financeiro,
// sem o valor em dinheiro) e o painel de detalhe.

import Link from "next/link";
import { Icon } from "../../Icon";
import { Avatar } from "../../ui/Avatar";
import { Fila } from "../../ui/micro";
import { Botao, PainelLateral } from "../../ui/controles";
import { Etiqueta } from "../../financeiro/blocos";
import { FichaBloco, FichaLinha, Vazio } from "../../financeiro/ui";
import { dataBR } from "@/lib/financeiro/calculos";
import type { PoderesRh } from "@/lib/rh/gate";
import { LABEL_ORIGEM, LABEL_RECORRENCIA, LEGENDA, ehFeriado, type Acontecimento } from "@/lib/rh/calendario/tipos";
import { diaComSemana, mesCarimbo, partes, rotuloDistancia } from "@/lib/rh/calendario/datas";

/** Ícone do tipo num quadradinho tingido — o mesmo desenho das "Próximas ações". */
export function MarcaTipo({ tipo, tamanho = 36 }: { tipo: Acontecimento["tipo"]; tamanho?: number }) {
  const l = LEGENDA[tipo];
  return (
    <span
      aria-hidden
      style={{
        width: tamanho, height: tamanho, flex: "none", display: "grid", placeItems: "center",
        borderRadius: Math.round(tamanho * 0.3), color: l.cor,
        background: `color-mix(in srgb, ${l.cor} 14%, transparent)`,
      }}
    >
      <Icon name={l.icone} size={Math.round(tamanho * 0.5)} />
    </span>
  );
}

/** Dentro da célula: feriado vira faixa, o resto vira pílula com a borda da cor. */
export function ItemDaCelula({ a }: { a: Acontecimento }) {
  const l = LEGENDA[a.tipo];
  const estilo = { "--rhcal-cor": l.cor } as React.CSSProperties;
  if (ehFeriado(a.tipo)) {
    return (
      <span className="rhcal-faixa" style={estilo} title={`${a.titulo} · ${a.sub ?? ""}`}>
        <Icon name={l.icone} size={12} />
        <span>{a.titulo}</span>
      </span>
    );
  }
  return (
    <span className="rhcal-pilula" style={estilo} title={`${a.titulo}${a.sub ? " · " + a.sub : ""}`}>
      {a.tipo === "aniversario" && a.pessoa
        ? <Avatar url={a.pessoa.foto} nome={a.pessoa.nome} size={14} formato="redondo" />
        : <Icon name={l.icone} size={12} color={l.cor} />}
      <span>{a.hora ? `${a.hora} ` : ""}{a.titulo}</span>
    </span>
  );
}

/** Uma linha de lista: carimbo de data à esquerda, título e sub no meio, seta. */
export function LinhaAcontecimento({ a, hoje, aoAbrir, semData }: {
  a: Acontecimento; hoje: string; aoAbrir: (a: Acontecimento) => void; semData?: boolean;
}) {
  const l = LEGENDA[a.tipo];
  const eHoje = a.dia === hoje;
  const cor = eHoje ? "var(--primary-texto)" : l.cor;
  return (
    <li style={{ minWidth: 0, listStyle: "none" }}>
      <button
        type="button"
        onClick={() => aoAbrir(a)}
        className="mt-linha"
        style={{
          display: "flex", alignItems: "center", gap: 11, minWidth: 0, width: "100%",
          minHeight: "var(--tap)", padding: "4px 2px", textAlign: "start", cursor: "pointer",
          background: "none", border: "none", font: "inherit", color: "inherit", opacity: a.inativo ? 0.55 : 1,
        }}
      >
        <span className="so-leitor">{`${diaComSemana(a.dia)}. `}</span>
        {semData ? (
          <MarcaTipo tipo={a.tipo} />
        ) : (
          <span
            aria-hidden
            style={{
              width: 40, flex: "none", display: "grid", placeItems: "center", padding: "5px 0",
              borderRadius: 11, background: `color-mix(in srgb, ${cor} 11%, transparent)`, color: cor,
            }}
          >
            <strong style={{ fontSize: 15, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{partes(a.dia).d}</strong>
            <small style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", lineHeight: 1.15 }}>{mesCarimbo(a.dia)}</small>
          </span>
        )}
        <span style={{ flex: 1, minWidth: 0, display: "grid", gap: 2 }}>
          <strong style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
            {!semData && <Icon name={l.icone} size={14} color={l.cor} />}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{a.titulo}</span>
          </strong>
          <small style={{ fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {[a.hora, a.sub, semData ? null : rotuloDistancia(hoje, a.dia)].filter(Boolean).join(" · ")}
          </small>
        </span>
        <Icon name="chevron-right" size={16} color="var(--text-dim)" />
      </button>
    </li>
  );
}

export function ListaDeAcontecimentos({ lista, hoje, aoAbrir, vazio, semData }: {
  lista: Acontecimento[]; hoje: string; aoAbrir: (a: Acontecimento) => void; vazio?: React.ReactNode; semData?: boolean;
}) {
  if (!lista.length) return <>{vazio ?? <Vazio compacto icone="calendar-off" titulo="Nenhum evento neste período" />}</>;
  return (
    <Fila as="ol" style={{ display: "grid", gap: 4, margin: 0, padding: 0 }}>
      {lista.map((a) => <LinhaAcontecimento key={a.chave} a={a} hoje={hoje} aoAbrir={aoAbrir} semData={semData} />)}
    </Fila>
  );
}

// ── Detalhe ──────────────────────────────────────────────────────────────────

export function DetalheDoAcontecimento({ a, poderes, onFechar, aoEditar, aoApagar, aoAlternar }: {
  a: Acontecimento;
  poderes: PoderesRh;
  onFechar: () => void;
  aoEditar?: (a: Acontecimento) => void;
  aoApagar?: (a: Acontecimento) => void;
  /** Data de setor: liga/desliga. */
  aoAlternar?: (a: Acontecimento, ativo: boolean) => void;
}) {
  const l = LEGENDA[a.tipo];
  const podeMexer =
    a.origem === "manual" && (
      (a.tipo === "setor" && poderes.calendarioSetores) ||
      ((a.tipo === "evento" || a.tipo === "comemorativa") && poderes.calendarioEditar)
    );

  return (
    <PainelLateral
      titulo={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0, maxWidth: "100%" }}>
          {a.pessoa ? <Avatar url={a.pessoa.foto} nome={a.pessoa.nome} size={34} formato="redondo" /> : <MarcaTipo tipo={a.tipo} tamanho={34} />}
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{a.titulo}</span>
        </span>
      }
      subtitulo={<Etiqueta texto={l.label} cor={l.cor} />}
      onFechar={onFechar}
      largura={440}
      rodape={podeMexer && (aoEditar || aoApagar) ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", width: "100%" }}>
          {aoEditar && <Botao icone="pencil" onClick={() => aoEditar(a)}>Editar</Botao>}
          {a.tipo === "setor" && aoAlternar && (
            <Botao icone={a.inativo ? "circle-check" : "circle-x"} onClick={() => aoAlternar(a, a.inativo)}>
              {a.inativo ? "Ativar" : "Desativar"}
            </Botao>
          )}
          <span style={{ flex: 1 }} />
          {aoApagar && <Botao variante="perigo" icone="trash" onClick={() => aoApagar(a)}>Apagar</Botao>}
        </div>
      ) : undefined}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <FichaBloco titulo="Quando">
          <FichaLinha rotulo="Data">{diaComSemana(a.dia)}</FichaLinha>
          {a.hora && <FichaLinha rotulo="Horário">{a.hora}{a.hora_fim ? ` – ${a.hora_fim}` : ""}</FichaLinha>}
          {a.recorrencia && <FichaLinha rotulo="Repete">{LABEL_RECORRENCIA[a.recorrencia]}</FichaLinha>}
          {a.inativo && <FichaLinha rotulo="Situação">Desativada — não aparece no calendário</FichaLinha>}
        </FichaBloco>

        {a.pessoa && (
          <FichaBloco titulo="Colaborador">
            <FichaLinha rotulo="Nome">{a.pessoa.nome}</FichaLinha>
            <FichaLinha rotulo="Setor">{a.pessoa.setor}</FichaLinha>
            <FichaLinha rotulo="Cargo">{a.pessoa.cargo}</FichaLinha>
            {poderes.ver && (
              <Link
                href={`/rh/colaboradores?pessoa=${encodeURIComponent(a.pessoa.id)}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 13, fontWeight: 700, color: "var(--primary-texto)", minHeight: "var(--tap)" }}
              >
                Abrir a ficha <Icon name="arrow-right" size={15} />
              </Link>
            )}
          </FichaBloco>
        )}

        {(a.setor || a.descricao || a.observacoes || a.envolvidos.length > 0) && (
          <FichaBloco titulo="Detalhes">
            {a.setor && !a.pessoa && <FichaLinha rotulo="Setor">{a.setor}</FichaLinha>}
            {a.descricao && <FichaLinha rotulo="Descrição"><span style={{ whiteSpace: "pre-wrap" }}>{a.descricao}</span></FichaLinha>}
            {a.observacoes && <FichaLinha rotulo="Observações"><span style={{ whiteSpace: "pre-wrap" }}>{a.observacoes}</span></FichaLinha>}
            {a.envolvidos.length > 0 && (
              <FichaLinha rotulo="Envolvidos">
                <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {a.envolvidos.map((p) => (
                    <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, padding: "3px 8px 3px 3px", borderRadius: "var(--r-pill)", background: "var(--surface-2)" }}>
                      <Avatar url={p.foto} nome={p.nome} size={20} formato="redondo" />{p.nome}
                    </span>
                  ))}
                </span>
              </FichaLinha>
            )}
          </FichaBloco>
        )}

        <FichaBloco titulo="Origem">
          <FichaLinha rotulo="Fonte">{LABEL_ORIGEM[a.origem]}</FichaLinha>
          {a.origem === "ficha" && a.pessoa && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, marginTop: 6 }}>
              A data vem do nascimento na ficha do colaborador. Para corrigir, edite a ficha.
            </p>
          )}
          {a.origem === "base" && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, marginTop: 6 }}>
              Data calculada pelo sistema. Feriado que não bater com a lei local pode ser corrigido no gerenciador de feriados.
            </p>
          )}
          {a.origem === "ponto" && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, marginTop: 6 }}>
              Cadastrado na tela de Ponto ({dataBR(a.dia)}). Editar lá reflete aqui.
            </p>
          )}
        </FichaBloco>
      </div>
    </PainelLateral>
  );
}
