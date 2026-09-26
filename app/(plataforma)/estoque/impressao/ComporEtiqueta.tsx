"use client";

// ── Compor uma etiqueta e mandar imprimir ────────────────────────────────────
//
// Texto livre e código de barras personalizado, com PRÉVIA em tamanho real
// antes de gastar papel. O caso que desenhou a tela é a ETIQUETA DE PRATELEIRA:
// o galpão está sendo organizado agora, e alguém vai querer colar "A3" na
// estante — por isso dá pra puxar o local direto de `estoque_locais` em vez de
// digitar duas vezes o que o sistema já sabe.
//
// ── OS DOIS CAMINHOS, e por que os dois existem ─────────────────────────────
//
// A impressora térmica está pareada por Bluetooth NO TABLET do galpão. O
// navegador não alcança ela. Então:
//
//   · FOLHA A4 — sai na hora, na impressora do escritório, e não depende de
//     tablet nenhum. É o caminho de quem quer papel agora.
//   · MANDAR PRO TABLET — entra numa fila que o tablet drena no ciclo de
//     sincronização dele. Sai na térmica, no rolo certo, do lado da prateleira
//     que vai receber a etiqueta.
//
// O segundo NÃO É INSTANTÂNEO, e a tela diz isso ANTES do clique — não depois,
// num toast. Sem essa frase a pessoa aperta, não vê papel, aperta mais duas
// vezes, e quinze minutos depois saem três etiquetas.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../Icon";
import { Acoes, Botao, BotaoIcone, Caixa } from "../../ui/controles";
import { toast } from "../../Toast";
import { EtiquetaLivre } from "../EtiquetaLivre";
import { AjusteMm, AtalhosDeTamanho } from "./AjusteMm";
import {
  TAMANHOS, TAMANHOS_MM, ROTULO_TAMANHO, MAX_LINHAS, MAX_COPIAS, TRABALHO_PADRAO,
  ROTULO_STATUS, FRASE_DO_ATRASO, CICLO_DO_TABLET_MIN, QR_MAX_CARACTERES,
  capacidadeDaLinha, medirTrabalho, validarTrabalho, maxCaracteresDoCodigo, larguraUtilDe,
  bytesUtf8, crescimentoDoQrMm,
  type LinhaLivre, type TamanhoLinha, type TrabalhoLivre, type StatusTrabalho,
} from "@/lib/estoque-impressao-livre";
import {
  ALTURA_MAXIMA_MM, ALTURA_MINIMA_MM, LARGURA_MAXIMA_MM, LARGURA_MINIMA_MM, TAMANHOS_COMUNS,
} from "@/lib/estoque-etiqueta-config";
import { Alerta } from "../../ui/Alerta";

interface Tablet { id: string; nome: string; vistoEm: string | null }
interface TrabalhoNaFila {
  id: string; titulo: string; dispositivoId: string; copias: number;
  status: StatusTrabalho; detalhe: string | null; porNome: string | null;
  criadoEm: string; resolvidoEm: string | null;
}
interface Local { id: string; nome: string; codigo: string; ativo: boolean }

export function ComporEtiqueta() {
  const [t, setT] = useState<TrabalhoLivre>(TRABALHO_PADRAO);
  const [tablets, setTablets] = useState<Tablet[]>([]);
  const [destino, setDestino] = useState<string>("");
  const [fila, setFila] = useState<TrabalhoNaFila[]>([]);
  const [pendente, setPendente] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [mandando, setMandando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/estoque/impressao/trabalhos", { cache: "no-store" });
      if (!r.ok) throw new Error("falhou");
      const j = await r.json();
      setTablets(j.tablets ?? []);
      setFila(j.trabalhos ?? []);
      setPendente(j.pendente ?? null);
      // Um tablet só: já vem escolhido. Um seletor com uma opção é uma pergunta
      // sem alternativa, e alguém vai esbarrar nela no meio do trabalho.
      setDestino((atual) => atual || (j.tablets?.length === 1 ? j.tablets[0].id : ""));
    } catch {
      setPendente(null);
      toast.erro("Não deu pra ler a fila de impressão agora. A folha A4 continua funcionando.");
    } finally {
      setCarregando(false);
    }
  }, []);

  // Sem poll. A fila é curta e o que muda nela é o que a própria pessoa acabou
  // de fazer — um `setInterval` aqui seria uma invocação por tick por aba
  // aberta, e este projeto já caiu duas vezes por consumo.
  useEffect(() => { void carregar(); }, [carregar]);

  const medida = useMemo(() => medirTrabalho(t), [t]);
  const veredito = useMemo(() => validarTrabalho(t), [t]);
  const podeImprimir = veredito.problemas.length === 0;

  function mudar(parcial: Partial<TrabalhoLivre>) {
    setT((v) => ({ ...v, ...parcial }));
  }

  function mudarLinha(i: number, parcial: Partial<LinhaLivre>) {
    setT((v) => ({ ...v, linhas: v.linhas.map((l, j) => (j === i ? { ...l, ...parcial } : l)) }));
  }

  function adicionarLinha() {
    setT((v) => (v.linhas.length >= MAX_LINHAS ? v : {
      ...v,
      // A linha nova nasce MÉDIA e sem negrito: a primeira é o que se lê de
      // longe, as seguintes são o detalhe. Nascerem todas grandes faria a
      // segunda estourar a altura e a pessoa culpar a ferramenta.
      linhas: [...v.linhas, { texto: "", tamanho: "media" as TamanhoLinha }],
    }));
  }

  function removerLinha(i: number) {
    setT((v) => ({ ...v, linhas: v.linhas.filter((_, j) => j !== i) }));
  }

  // ── Folha A4: sai na hora, sem passar por tablet nenhum ──────────────────
  const [paraFolha, setParaFolha] = useState<TrabalhoLivre | null>(null);
  useEffect(() => {
    if (!paraFolha) return;
    // O timer deixa o React pintar a folha antes de o diálogo travar a thread.
    // Sem ele o navegador abre o diálogo com a página anterior na prévia.
    const id = setTimeout(() => {
      try { window.print(); } finally { setParaFolha(null); }
    }, 60);
    return () => clearTimeout(id);
  }, [paraFolha]);

  async function mandarProTablet() {
    if (!destino) {
      toast.erro("Escolha em qual tablet a etiqueta deve sair.");
      return;
    }
    setMandando(true);
    try {
      const r = await fetch("/api/estoque/impressao/trabalhos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dispositivoId: destino, trabalho: t }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.erro(j.detalhe ?? "Não deu pra mandar agora. Tente de novo.");
        return;
      }
      toast.ok(`Na fila do tablet. Ele imprime no próximo sincronismo — até ~${CICLO_DO_TABLET_MIN} minutos.`);
      await carregar();
    } finally {
      setMandando(false);
    }
  }

  async function cancelar(id: string) {
    const r = await fetch(`/api/estoque/impressao/trabalhos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.erro(j.detalhe ?? "Não deu pra cancelar.");
    } else {
      toast.ok("Cancelado — este não vai sair.");
    }
    await carregar();
  }

  const tabletEscolhido = tablets.find((x) => x.id === destino) ?? null;

  return (
    <div style={{ marginTop: 18 }}>
      <div className="duo" style={{ alignItems: "start" }}>
        {/* ── O que vai escrito ──────────────────────────────────────────── */}
        <div className="glass" style={{ padding: 20, borderRadius: "var(--r-md)", minWidth: 0 }}>
          <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>O que vai escrito</h2>
          <p style={{ margin: "0 0 16px", fontSize: 12.5, lineHeight: 1.5, color: "var(--text-dim)" }}>
            Até {MAX_LINHAS} linhas. A primeira é o que se lê de longe.
          </p>

          <PuxarDeUmLocal onEscolher={(l) => setT((v) => ({
            ...v,
            titulo: `Prateleira ${l.codigo}`,
            linhas: [
              // O CÓDIGO em cima e grande: é ele que a pessoa procura de pé, a
              // um braço da estante. O nome vem embaixo, pequeno, porque quem
              // já está na frente da prateleira não precisa dele pra saber onde
              // está — precisa pra confirmar.
              { texto: l.codigo, tamanho: "grande", negrito: true },
              { texto: l.nome, tamanho: "pequena" },
            ],
            codigo: l.codigo,
            // O QR leva o CELULAR pra página de conferência deste lugar — o
            // código de barras acima é o do leitor de mão, com só o código. A
            // URL sai do próprio navegador (`origin`), então aponta pro mesmo
            // ambiente em que a etiqueta foi composta. Em MAIÚSCULAS de
            // propósito: o modo alfanumérico do QR não tem minúscula, e usar
            // ele derruba o símbolo de 29 pra 25 módulos (1,5mm de tira). O
            // host é indiferente a caixa e o /G o middleware reescreve.
            qr: `${window.location.origin}/g/${l.codigo}`.toUpperCase(),
          }))} />

          <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
            {t.linhas.map((l, i) => (
              <LinhaDoCompositor
                key={i}
                linha={l}
                indice={i}
                larguraUtilMm={larguraUtilDe(t.larguraMm)}
                podeRemover={t.linhas.length > 1}
                onMuda={(p) => mudarLinha(i, p)}
                onRemove={() => removerLinha(i)}
              />
            ))}
          </div>

          <Acoes style={{ marginTop: 12 }}>
            <Botao
              variante="sutil"
              icone="plus"
              onClick={adicionarLinha}
              disabled={t.linhas.length >= MAX_LINHAS}
            >
              {t.linhas.length >= MAX_LINHAS ? `Máximo de ${MAX_LINHAS} linhas` : "Mais uma linha"}
            </Botao>
          </Acoes>

          <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

          <CampoDoCodigo
            codigo={t.codigo ?? ""}
            mostrar={t.mostrarCodigo}
            larguraUtilMm={larguraUtilDe(t.larguraMm)}
            onCodigo={(codigo) => mudar({ codigo: codigo || null })}
            onMostrar={(mostrarCodigo) => mudar({ mostrarCodigo })}
          />

          <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

          <CampoDoQr
            qr={t.qr ?? ""}
            onQr={(qr) => mudar({ qr: qr || null, ...(qr ? {} : { qrAoLado: false }) })}
            aoLado={t.qrAoLado}
            onAoLado={(qrAoLado) => mudar({ qrAoLado })}
            temCodigo={!!t.codigo?.trim()}
          />
        </div>

        {/* ── Como vai ficar ─────────────────────────────────────────────── */}
        <div className="glass" style={{ padding: 20, borderRadius: "var(--r-md)", minWidth: 0 }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Como vai ficar</h2>

          {/* A etiqueta tem 72mm imprimíveis e NÃO encolhe pra caber no
              celular — encolher seria mostrar uma etiqueta que não existe. O
              bloco rola de lado dentro dele mesmo, nunca a página. */}
          <div style={{ overflowX: "auto", paddingBottom: 6 }}>
            <div style={{ width: "min-content" }}>
              <EtiquetaLivre trabalho={t} />
            </div>
          </div>

          <p style={{ margin: "12px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--text-dim)" }}>
            No papel o tamanho é exato, desde que a escala do diálogo esteja em 100%.
            Na tela ele depende do monitor.
          </p>

          <div style={{ height: 1, background: "var(--border)", margin: "18px 0" }} />

          <AtalhosDeTamanho
            tamanhos={TAMANHOS_COMUNS}
            larguraMm={t.larguraMm}
            alturaMm={t.alturaMm}
            onEscolher={(tam) => mudar({ larguraMm: tam.larguraMm, alturaMm: tam.alturaMm })}
          />

          <div style={{ marginTop: 16 }}>
            <AjusteMm
              id="livre-largura"
              rotulo="Largura da etiqueta"
              valor={t.larguraMm}
              min={LARGURA_MINIMA_MM}
              max={LARGURA_MAXIMA_MM}
              onMuda={(larguraMm) => mudar({ larguraMm })}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <AjusteMm
              id="livre-altura"
              rotulo="Altura da etiqueta"
              valor={t.alturaMm}
              min={ALTURA_MINIMA_MM}
              max={ALTURA_MAXIMA_MM}
              onMuda={(alturaMm) => mudar({ alturaMm })}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <AjusteMm
              id="livre-copias"
              rotulo="Vias"
              valor={t.copias}
              min={1}
              max={MAX_COPIAS}
              unidade={t.copias === 1 ? "via" : "vias"}
              unidadeNaFaixa="vias"
              onMuda={(copias) => mudar({ copias })}
            />
          </div>

          {/* O problema vem com o BOTÃO que o resolve. Uma frase dizendo "pede
              32mm" e um ajuste de um em um do outro lado da tela é um convite a
              apertar dezessete vezes. */}
          {!medida.cabe && (
            <Aviso tom="erro" icone="alert-triangle">
              <span style={{ minWidth: 0 }}>
                Não cabe em {t.alturaMm}mm — o desenho pede {medida.alturaMinimaMm}mm.{" "}
                <Botao variante="sutil" tamanho="sm" onClick={() => mudar({ alturaMm: Math.min(ALTURA_MAXIMA_MM, medida.alturaMinimaMm) })}>
                  Ajustar para {medida.alturaMinimaMm}mm
                </Botao>
              </span>
            </Aviso>
          )}

          {veredito.problemas
            .filter((p) => !p.startsWith("Nesta altura"))
            .map((p) => <Aviso key={p} tom="erro" icone="alert-triangle">{p}</Aviso>)}

          {veredito.avisos.map((a) => <Aviso key={a} tom="atencao" icone="info-circle">{a}</Aviso>)}

          {podeImprimir && medida.alturaBarrasMm > 0 && (
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "var(--text-dim)" }}>
              Barras de {medida.alturaBarrasMm.toFixed(1)}mm — leitor comum pega de longe.
            </p>
          )}
        </div>
      </div>

      {/* ── Onde o papel sai ──────────────────────────────────────────────── */}
      <div className="glass" style={{ padding: 20, borderRadius: "var(--r-md)", marginTop: 18 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>Onde o papel sai</h2>

        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 650, display: "flex", alignItems: "center", gap: 7 }}>
              <Icon name="printer" size={16} color="var(--text-dim)" />
              Aqui, numa folha A4
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.55, color: "var(--text-dim)" }}>
              Sai na hora, na impressora do escritório, e não depende de tablet nenhum.
              Boa pra conferir o desenho antes de gastar rolo térmico.
            </p>
            <Acoes style={{ marginTop: 12 }}>
              <Botao variante="secundario" icone="printer" onClick={() => setParaFolha(t)} disabled={!podeImprimir}>
                Imprimir folha A4
              </Botao>
            </Acoes>
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 650, display: "flex", alignItems: "center", gap: 7 }}>
              <Icon name="device-mobile" size={16} color="var(--text-dim)" />
              No galpão, na térmica do tablet
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.55, color: "var(--text-dim)" }}>
              {FRASE_DO_ATRASO}
            </p>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 6 }}>Em qual tablet</div>
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                disabled={carregando || tablets.length === 0}
                style={{
                  width: "100%", minHeight: "var(--tap)", background: "var(--surface)",
                  border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
                  padding: "9px 12px", color: "var(--text)", fontSize: 14,
                }}
              >
                <option value="">
                  {tablets.length === 0 ? "Nenhum tablet ativado" : "Escolha o tablet…"}
                </option>
                {tablets.map((x) => (
                  <option key={x.id} value={x.id}>{x.nome} — {desdeQuando(x.vistoEm)}</option>
                ))}
              </select>
            </div>

            {/* O sinal de vida ANTES do clique. Mandar papel pra um aparelho
                desligado há três dias produz uma espera silenciosa, e a pessoa
                aperta o botão mais duas vezes. */}
            {tabletEscolhido && sumidoHaMuito(tabletEscolhido.vistoEm) && (
              <Aviso tom="atencao" icone="wifi-off">
                Este tablet não dá sinal {desdeQuando(tabletEscolhido.vistoEm)}. A etiqueta vai ficar
                esperando na fila até ele voltar — ou expirar sem sair.
              </Aviso>
            )}

            <Acoes style={{ marginTop: 12 }}>
              <Botao
                variante="primario"
                icone="send"
                onClick={mandarProTablet}
                carregando={mandando}
                disabled={!podeImprimir || !destino}
              >
                Mandar pro tablet
              </Botao>
            </Acoes>
          </div>
        </div>

        {pendente && (
          <Aviso tom="atencao" icone="alert-triangle">{pendente}</Aviso>
        )}
      </div>

      <Fila trabalhos={fila} tablets={tablets} onCancelar={cancelar} />

      {/* A folha, montada só no instante de imprimir. Fica por cima da tela
          enquanto o diálogo está aberto — e isso é correto: é o que vai sair. */}
      {paraFolha && (
        <div className="imp-folha-livre">
          {Array.from({ length: paraFolha.copias }, (_, i) => (
            <EtiquetaLivre key={i} trabalho={paraFolha} />
          ))}
        </div>
      )}

      <style>{`
        .imp-folha-livre {
          position: fixed; inset: 0; z-index: 9999;
          background: #fff; overflow: auto;
          padding: 8mm; display: flex; flex-direction: column; gap: 4mm;
        }
        @media print {
          @page { size: A4; margin: 8mm; }
          /* Só a folha vai pro papel. \`visibility\` e não \`display\`: esconder
             por display reflui o layout e a etiqueta perderia a largura em mm
             que ela precisa ter — sairia estreita, que é justamente o defeito
             que a pessoa veio conferir. */
          body * { visibility: hidden !important; }
          .imp-folha-livre, .imp-folha-livre * { visibility: visible !important; }
          .imp-folha-livre { position: absolute !important; inset: auto; left: 0; top: 0; padding: 0; }
        }
      `}</style>
    </div>
  );
}

// ── Uma linha do compositor ──────────────────────────────────────────────────

function LinhaDoCompositor({ linha, indice, larguraUtilMm, podeRemover, onMuda, onRemove }: {
  linha: LinhaLivre; indice: number; larguraUtilMm: number; podeRemover: boolean;
  onMuda: (p: Partial<LinhaLivre>) => void; onRemove: () => void;
}) {
  // A capacidade sai da largura DESTA etiqueta, não da tira padrão: numa
  // etiqueta de 40mm cabe metade dos caracteres, e dizer "cabem 14" enquanto a
  // prévia corta em 7 seria a tela discordando de si mesma.
  const cabe = capacidadeDaLinha(linha.tamanho, larguraUtilMm);
  const passou = linha.texto.trim().length > cabe;

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
      padding: "10px 12px", background: "var(--surface-2)", minWidth: 0,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
        <input
          value={linha.texto}
          onChange={(e) => onMuda({ texto: e.target.value })}
          placeholder={indice === 0 ? "PRATELEIRA A3" : "detalhe"}
          aria-label={`Linha ${indice + 1}`}
          style={{
            flex: 1, minWidth: 0, minHeight: "var(--tap)", background: "var(--surface)",
            border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
            padding: "9px 12px", color: "var(--text)", fontSize: 14,
          }}
        />
        {/* Alvo destrutivo NÃO fica colado no campo que a pessoa está usando:
            o `gap` de 8px mais a largura do botão dão a folga do polegar. */}
        <BotaoIcone
          icone="trash"
          titulo={`Tirar a linha ${indice + 1}`}
          onClick={onRemove}
          disabled={!podeRemover}
        />
      </div>

      {/* <div> e não <label> em volta do grupo: um <label> em volta de botões
          dispara o PRIMEIRO deles ao clicar no rótulo, e a seleção muda sozinha. */}
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", minWidth: 0 }}>
        {TAMANHOS.map((tam) => {
          const ativo = linha.tamanho === tam;
          return (
            <button
              key={tam}
              type="button"
              className="ui-btn"
              data-v={ativo ? "primario" : "sutil"}
              data-t="sm"
              aria-pressed={ativo}
              title={`${TAMANHOS_MM[tam].toString().replace(".", ",")}mm de letra`}
              onClick={() => onMuda({ tamanho: tam })}
              style={{ minHeight: "var(--tap)", flex: "1 1 min(100%, 92px)", minWidth: 0 }}
            >
              {ROTULO_TAMANHO[tam]}
            </button>
          );
        })}
        <button
          type="button"
          className="ui-btn"
          data-v={linha.negrito ? "primario" : "sutil"}
          data-t="sm"
          aria-pressed={!!linha.negrito}
          title="Negrito — é o peso, não o tamanho, que faz ler de relance"
          onClick={() => onMuda({ negrito: !linha.negrito })}
          style={{ minHeight: "var(--tap)", flex: "0 0 auto" }}
        >
          <Icon name="bold" size={15} />
        </button>
      </div>

      <div style={{ marginTop: 6, fontSize: 11.5, color: passou ? "var(--atencao)" : "var(--text-dim)" }}>
        {passou
          ? `Deve cortar — nesta letra cabem cerca de ${cabe} caracteres.`
          : `${linha.texto.trim().length}/${cabe} caracteres nesta letra`}
      </div>
    </div>
  );
}

// ── O código de barras ───────────────────────────────────────────────────────

function CampoDoCodigo({ codigo, mostrar, larguraUtilMm, onCodigo, onMostrar }: {
  codigo: string; mostrar: boolean; larguraUtilMm: number;
  onCodigo: (v: string) => void; onMostrar: (v: boolean) => void;
}) {
  const teto = maxCaracteresDoCodigo(larguraUtilMm);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 650, display: "flex", alignItems: "center", gap: 7 }}>
        <Icon name="barcode" size={16} color="var(--text-dim)" />
        Código de barras
      </div>
      <p style={{ margin: "6px 0 10px", fontSize: 12.5, lineHeight: 1.5, color: "var(--text-dim)" }}>
        Opcional. Vai em Code128 — letras sem acento, números e pontuação comum, até {teto} caracteres.
      </p>
      <input
        value={codigo}
        onChange={(e) => onCodigo(e.target.value)}
        placeholder="GAL-A-C3"
        aria-label="Conteúdo do código de barras"
        style={{
          width: "100%", minHeight: "var(--tap)", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
          padding: "9px 12px", color: "var(--text)", fontSize: 14,
          fontFamily: "'Courier New', monospace", letterSpacing: "0.02em",
        }}
      />
      <label style={{
        display: "flex", alignItems: "center", gap: 9, marginTop: 10,
        fontSize: 12.5, color: "var(--text-dim)", minHeight: "var(--tap)", cursor: "pointer",
      }}>
        <Caixa marcado={mostrar} onChange={(marc) => onMostrar(marc)} desativado={!codigo.trim()} />
        <span style={{ minWidth: 0 }}>
          Escrever o código embaixo das barras — é a rede pra quando a barra borra e
          alguém precisa digitar.
        </span>
      </label>
    </div>
  );
}

// ── O QR pro celular ─────────────────────────────────────────────────────────

/**
 * O código de barras acima é pro LEITOR de mão; este QR é pra CÂMERA do
 * celular — ele carrega a URL da página de conferência do lugar, então quem
 * está de pé no corredor aponta o celular e cai direto na conferência, sem
 * digitar nada. "Puxar de um lugar do galpão" preenche os dois de uma vez.
 */
function CampoDoQr({ qr, onQr, aoLado, onAoLado, temCodigo }: {
  qr: string; onQr: (v: string) => void;
  aoLado: boolean; onAoLado: (v: boolean) => void;
  /** Com código de barras a deitada não existe — o interruptor explica em vez de sumir. */
  temCodigo: boolean;
}) {
  // O exemplo do placeholder também é a base da estimativa de crescimento
  // enquanto o campo está vazio — uma URL de conferência típica (versão 3).
  const exemplo = "https://tridigaius.com.br/g/GAL-A-C3";
  const bytes = bytesUtf8(qr.trim());
  const passou = bytes > QR_MAX_CARACTERES;
  // A conta vem da lib (vão + matriz + zona quieta), nunca número mágico aqui.
  const cresce = crescimentoDoQrMm(qr.trim() || exemplo).toFixed(1).replace(".", ",");

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 650, display: "flex", alignItems: "center", gap: 7 }}>
        <Icon name="qrcode" size={16} color="var(--text-dim)" />
        QR pro celular
      </div>
      <p style={{ margin: "6px 0 10px", fontSize: 12.5, lineHeight: 1.5, color: "var(--text-dim)" }}>
        Opcional. Cole o link da página de conferência do lugar — quem aponta a câmera
        cai direto nela, sem digitar. O QR cresce a etiqueta em ~{cresce}mm.
      </p>
      <input
        value={qr}
        onChange={(e) => onQr(e.target.value)}
        placeholder={exemplo}
        aria-label="Link que vira QR code"
        inputMode="url"
        style={{
          width: "100%", minHeight: "var(--tap)", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
          padding: "9px 12px", color: "var(--text)", fontSize: 14,
          fontFamily: "'Courier New', monospace", letterSpacing: "0.02em",
        }}
      />
      {/* O teto é em BYTES e não caracteres — acento custa 2, e um contador de
          letras diria "cabe" pra um link que não cabe. */}
      <div style={{ marginTop: 6, fontSize: 11.5, color: passou ? "var(--atencao)" : "var(--text-dim)" }}>
        {passou
          ? `Passou do teto — o QR aguenta ${QR_MAX_CARACTERES} bytes e este link tem ${bytes}. Encurte o link.`
          : `${bytes}/${QR_MAX_CARACTERES} bytes`}
      </div>
      {/* A DEITADA: QR à esquerda, texto ao lado — a tira mais baixa possível
          (a altura vira a do próprio QR, ~15mm). Nasceu de placa devolvida:
          a empilhada saía com 27mm e prateleira quer tira baixa. */}
      <label style={{
        display: "flex", alignItems: "center", gap: 9, marginTop: 10,
        fontSize: 12.5, color: "var(--text-dim)", minHeight: "var(--tap)",
        cursor: qr.trim() && !temCodigo ? "pointer" : "default",
        opacity: qr.trim() && !temCodigo ? 1 : 0.6,
      }}>
        <Caixa marcado={aoLado} onChange={(marc) => onAoLado(marc)} desativado={!qr.trim() || temCodigo} />
        <span style={{ minWidth: 0 }}>
          Deitada: QR à esquerda e o texto ao lado — a tira mais baixa que existe.
          {temCodigo && " Não convive com código de barras: tire as barras primeiro."}
        </span>
      </label>
    </div>
  );
}

// ── Puxar de um local do galpão ──────────────────────────────────────────────

/**
 * Digitar "A3" duas vezes (uma no texto, outra no código de barras) é o começo
 * de uma etiqueta em que os dois não batem — e uma etiqueta cujo texto diz A3 e
 * cujo código diz A2 é pior que nenhuma etiqueta, porque ela passa a confiança
 * de estar certa.
 *
 * Sem `estoque_locais` (SQL não rodado) este bloco simplesmente não aparece: o
 * compositor continua inteiro, só que digitado à mão.
 */
function PuxarDeUmLocal({ onEscolher }: { onEscolher: (l: Local) => void }) {
  const [locais, setLocais] = useState<Local[]>([]);
  const buscou = useRef(false);

  useEffect(() => {
    if (buscou.current) return;
    buscou.current = true;
    (async () => {
      try {
        const r = await fetch("/api/estoque/locais", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        setLocais(((j.locais ?? []) as Local[]).filter((l) => l.ativo && l.codigo));
      } catch { /* sem locais, o compositor continua inteiro */ }
    })();
  }, []);

  if (locais.length === 0) return null;

  return (
    <div>
      <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="map-pin" size={14} color="currentColor" />
        Puxar de um lugar do galpão
      </div>
      <select
        value=""
        onChange={(e) => {
          const l = locais.find((x) => x.id === e.target.value);
          if (l) onEscolher(l);
        }}
        aria-label="Preencher com um local do galpão"
        style={{
          width: "100%", minHeight: "var(--tap)", background: "var(--surface)",
          border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
          padding: "9px 12px", color: "var(--text)", fontSize: 14,
        }}
      >
        <option value="">Escolha um lugar para preencher…</option>
        {locais.map((l) => <option key={l.id} value={l.id}>{l.codigo} — {l.nome}</option>)}
      </select>
    </div>
  );
}

// ── A fila ───────────────────────────────────────────────────────────────────

const CORES: Record<StatusTrabalho, { icone: string; cor: string }> = {
  fila: { icone: "hourglass-high", cor: "var(--text-dim)" },
  impresso: { icone: "circle-check", cor: "var(--ok)" },
  falhou: { icone: "circle-x", cor: "var(--perigo)" },
  cancelado: { icone: "x", cor: "var(--text-dim)" },
  expirado: { icone: "clock", cor: "var(--atencao)" },
};

function Fila({ trabalhos, tablets, onCancelar }: {
  trabalhos: TrabalhoNaFila[]; tablets: Tablet[]; onCancelar: (id: string) => void;
}) {
  if (trabalhos.length === 0) return null;
  const nomeDo = (id: string) => tablets.find((t) => t.id === id)?.nome ?? "tablet";

  return (
    <div className="glass" style={{ padding: 20, borderRadius: "var(--r-md)", marginTop: 18 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}>O que foi mandado</h2>
      <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--text-dim)" }}>
        Inclusive o que já saiu — a pergunta que traz alguém aqui é “saiu?”.
      </p>

      <div style={{ display: "grid", gap: 8 }}>
        {trabalhos.map((t) => {
          const { icone, cor } = CORES[t.status];
          return (
            <div key={t.id} style={{
              display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap",
              border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
              padding: "10px 12px", minWidth: 0,
            }}>
              <Icon name={icone} size={16} color={cor} />
              <div style={{ flex: "1 1 min(100%, 220px)", minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.titulo || "Etiqueta"}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
                  {ROTULO_STATUS[t.status]} · {nomeDo(t.dispositivoId)}
                  {t.copias > 1 && ` · ${t.copias} vias`}
                  {t.porNome && ` · ${t.porNome}`}
                  {t.detalhe && ` — ${t.detalhe}`}
                </div>
              </div>
              {t.status === "fila" && (
                <Botao variante="sutil" tamanho="sm" icone="x" onClick={() => onCancelar(t.id)}>
                  Cancelar
                </Botao>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Peças pequenas ───────────────────────────────────────────────────────────

// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
function Aviso({ tom, icone, children }: { tom: "erro" | "atencao"; icone: string; children: React.ReactNode }) {
  return <Alerta tom={tom === "erro" ? "perigo" : "atencao"} icone={icone} style={{ marginTop: 12 }}>{children}</Alerta>;
}

/** "há 3 dias" / "agora há pouco" / "nunca deu sinal". */
function desdeQuando(iso: string | null): string {
  if (!iso) return "nunca deu sinal";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "nunca deu sinal";
  const min = Math.floor(ms / 60_000);
  if (min < 3) return "online agora";
  if (min < 60) return `visto há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `visto há ${h}h`;
  const d = Math.floor(h / 24);
  return `visto há ${d} dia${d === 1 ? "" : "s"}`;
}

/**
 * Meia hora. O worker do tablet bate a cada ~15 minutos, então um aparelho que
 * passou de dois ciclos sem falar não está só entre batidas — está desligado,
 * sem rede, ou com o app fora do ar.
 */
function sumidoHaMuito(iso: string | null): boolean {
  if (!iso) return true;
  const ms = Date.now() - new Date(iso).getTime();
  return !Number.isFinite(ms) || ms > 2 * CICLO_DO_TABLET_MIN * 60_000;
}
