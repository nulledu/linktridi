"use client";

// ── Marketing · Geral · Biblioteca do criativo ───────────────────────────────
// As PEÇAS de um criativo (imagem e vídeo curto), agora dentro do Gaius.
//
// O `VideoCriativo` ao lado continua mostrando a prévia oficial da Meta, que é
// o anúncio no ar. Isto aqui é outra coisa: o arquivo-fonte que o time
// produziu, guardado num bucket privado (Backblaze) e alcançável só com sessão
// e permissão de marketing. Antes ele vivia num link do Drive que qualquer um
// com o endereço abria.
//
// O upload vai DIRETO do navegador pro bucket (presign + PUT). Nenhum byte
// passa pela função da Vercel — é o que deixa um vídeo de 30 MB subir sem
// esbarrar no teto de 4,5 MB de corpo, e é o que evita pagar CPU pelo tempo
// do envio.
//
// Nada depende de `:hover`: as ações de cada peça são botões de 44px sempre
// visíveis, senão a biblioteca não existiria no celular.
import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Icon } from "../Icon";
import { confirmar, toast } from "../Toast";
import { Fila } from "../ui/micro";
import { Alerta } from "../ui/Alerta";
import { enviarPeca, pecasDe, ROTA_PECAS as ROTA } from "./pecas";
import { BarraElastica, CheckDesenhado, ImagemQueChega } from "./pecasVisuais";
import { duracaoCurta, NOME_DO_FORMATO, textoDosLimites, tipoDoCriativo, type ArquivoCriativo } from "@/lib/criativos/regras";
import { emMB } from "@/lib/armazenamento/referencia";

interface Enviando {
  id: string;
  nome: string;
  pct: number;
  /** Chegou: a linha fica um instante com o visto desenhado e sai sozinha. */
  ok?: boolean;
  saindo?: boolean;
}

/**
 * `inicial` ausente = a biblioteca busca os arquivos sozinha ao montar. É o
 * caso do modal e do visor da lista, que abrem em cima de um criativo sem o
 * servidor ter passado as peças. A página de detalhe passa `inicial` porque
 * já as carregou no servidor — evita a segunda ida.
 */
export function BibliotecaCriativo({ criativoId, codigo, inicial, podeEditar, compacta, aoMudar }: {
  criativoId: string;
  codigo: string;
  inicial?: ArquivoCriativo[];
  podeEditar: boolean;
  /** Miniaturas menores — pra caber num painel lateral ou numa folha. */
  compacta?: boolean;
  /** Avisa quem está em volta (a lista atualiza a capa sem recarregar). */
  aoMudar?: (arquivos: ArquivoCriativo[]) => void;
}) {
  const [arquivos, setArquivosBruto] = useState<ArquivoCriativo[]>(inicial ?? []);
  const [carregando, setCarregando] = useState(inicial === undefined);
  const [fila, setFila] = useState<Enviando[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [sobre, setSobre] = useState(false);
  const idCampo = useId();
  // dragenter/dragleave disparam também ao cruzar os FILHOS da área: sem a
  // contagem, a borda piscaria a cada ícone e texto atravessado.
  const profundidade = useRef(0);
  const relogios = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const r = relogios.current;
    return () => { r.forEach(clearTimeout); r.clear(); };
  }, []);
  const depois = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => { relogios.current.delete(t); fn(); }, ms);
    relogios.current.add(t);
  }, []);

  const setArquivos = useCallback((f: (a: ArquivoCriativo[]) => ArquivoCriativo[]) => {
    setArquivosBruto((a) => { const n = f(a); aoMudar?.(n); return n; });
  }, [aoMudar]);

  useEffect(() => {
    if (inicial !== undefined) return;
    let vivo = true;
    void pecasDe(criativoId).then((lista) => { if (vivo) { setArquivosBruto(lista); setCarregando(false); } });
    return () => { vivo = false; };
  }, [criativoId, inicial]);

  const enviar = useCallback(async (lista: File[]) => {
    if (!podeEditar || !lista.length) return;
    setErro(null);
    for (const file of lista) {
      const marca = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setFila((f) => [...f, { id: marca, nome: file.name, pct: 0 }]);
      try {
        const novo = await enviarPeca(file, criativoId, (pct) =>
          setFila((f) => f.map((x) => (x.id === marca ? { ...x, pct } : x))));
        setArquivos((a) => [novo, ...a]);
        // Kinetics 065 · a linha confirma com o visto desenhado e sai sozinha:
        // sumir no mesmo quadro em que chegou deixava a dúvida "subiu?".
        setFila((f) => f.map((x) => (x.id === marca ? { ...x, pct: 1, ok: true } : x)));
        depois(1300, () => setFila((f) => f.map((x) => (x.id === marca ? { ...x, saindo: true } : x))));
        depois(1300 + 160, () => setFila((f) => f.filter((x) => x.id !== marca)));
      } catch (e) {
        setErro((e as Error)?.message || "Falha ao enviar.");
        setFila((f) => f.filter((x) => x.id !== marca));
      }
    }
  }, [criativoId, podeEditar, setArquivos, depois]);

  const arrasto = {
    onDragEnter: (e: DragEvent) => {
      if (![...(e.dataTransfer?.types ?? [])].includes("Files")) return;
      e.preventDefault();
      profundidade.current++;
      setSobre(true);
    },
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; },
    onDragLeave: () => {
      profundidade.current = Math.max(0, profundidade.current - 1);
      if (!profundidade.current) setSobre(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      profundidade.current = 0;
      setSobre(false);
      void enviar([...(e.dataTransfer?.files ?? [])]);
    },
  };

  // Colar (Ctrl+V) com a página aberta: é como a arte chega de um print ou do
  // Figma, e sem isto a pessoa teria que salvar em disco antes.
  useEffect(() => {
    if (!podeEditar) return;
    const aoColar = (e: ClipboardEvent) => {
      const fs = [...(e.clipboardData?.files ?? [])].filter((f) => tipoDoCriativo(f.type));
      if (fs.length) { e.preventDefault(); void enviar(fs); }
    };
    window.addEventListener("paste", aoColar);
    return () => window.removeEventListener("paste", aoColar);
  }, [enviar, podeEditar]);

  async function definirCapa(a: ArquivoCriativo) {
    const r = await fetch(ROTA, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: a.id }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { toast(r?.error || "Não foi possível definir a capa.", "erro"); return; }
    setArquivos((lista) => lista.map((x) => ({ ...x, principal: x.id === a.id })));
    toast("Capa do criativo atualizada.");
  }

  async function excluir(a: ArquivoCriativo) {
    const ok = await confirmar(`Excluir "${a.nome}"?`, {
      detalhe: "O arquivo sai da biblioteca e do armazenamento. Não dá pra desfazer.",
      perigo: true,
    });
    if (!ok) return;
    const r = await fetch(`${ROTA}?id=${encodeURIComponent(a.id)}`, { method: "DELETE" })
      .then((x) => x.json()).catch(() => null);
    if (!r?.ok) { toast(r?.error || "Não foi possível excluir.", "erro"); return; }
    setArquivos((lista) => {
      const resto = lista.filter((x) => x.id !== a.id);
      // O servidor promove a próxima capa; espelha aqui pra tela não piscar.
      if (a.principal && resto[0]) resto[0] = { ...resto[0], principal: true };
      return resto;
    });
    toast("Arquivo removido.");
  }

  const vazia = !arquivos.length && !fila.length && !carregando;
  const minimo = compacta ? 132 : 168;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {podeEditar && (
        <>
          <input
            id={idCampo}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
            style={{ display: "none" }}
            onChange={(e) => { void enviar([...(e.target.files ?? [])]); e.target.value = ""; }}
          />
          {/* label + input escondido: o teclado continua alcançando o campo,
              o que um <div onClick> sozinho não daria. */}
          <label htmlFor={idCampo} className="mk-drop" data-sobre={sobre ? "1" : undefined} {...arrasto}>
            <span className="mk-drop-ico" aria-hidden><Icon name="upload" size={20} /></span>
            <strong>{sobre ? "Pode soltar" : "Adicionar peça"}</strong>
            <span className="mk-drop-dica">
              Arraste, cole (Ctrl+V) ou toque para escolher
            </span>
            <span className="mk-drop-lim">{textoDosLimites()}</span>
          </label>
        </>
      )}

      {fila.length > 0 && (
        <ul className="mk-envios" aria-live="polite">
          {fila.map((f) => (
            <li key={f.id} className="mk-envio" data-ok={f.ok ? "1" : undefined} data-saindo={f.saindo ? "1" : undefined}>
              {f.ok ? <CheckDesenhado size={18} titulo="Enviado" /> : <Icon name="upload" size={16} />}
              <span className="mk-envio-nome" title={f.nome}>{f.nome}</span>
              <span className="mk-envio-pct">{f.ok ? "Enviado" : `${Math.round(f.pct * 100)}%`}</span>
              {!f.ok && <BarraElastica fracao={f.pct} rotulo={`Enviando ${f.nome}`} />}
            </li>
          ))}
        </ul>
      )}

      {erro && (
        <Alerta tom="perigo" aoFechar={() => setErro(null)}>{erro}</Alerta>
      )}

      {carregando ? (
        <div role="status" aria-label="Carregando peças" style={{
          display: "grid", gap: 10, gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minimo}px), 1fr))`,
        }}>
          {[0, 1, 2].map((i) => <span key={i} className="mk-peca-esq skeleton" />)}
        </div>
      ) : vazia ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
          {podeEditar
            ? "Nenhuma peça ainda. O arquivo fica guardado aqui dentro, não num link externo."
            : "Nenhuma peça enviada para este criativo."}
        </p>
      ) : (
        // Kinetics 054 · as peças chegam escalonadas; a que acabou de subir
        // entra sozinha (as outras mantêm a chave e não re-animam).
        <Fila as="ul" style={{
          listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10,
          // min(100%, …) é o que faz a grade virar uma coluna a 320px.
          gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minimo}px), 1fr))`,
        }}>
          {arquivos.map((a) => (
            <Peca key={a.id} a={a} codigo={codigo} podeEditar={podeEditar}
              aoCapa={() => void definirCapa(a)} aoExcluir={() => void excluir(a)} />
          ))}
        </Fila>
      )}
    </div>
  );
}

function Peca({ a, codigo, podeEditar, aoCapa, aoExcluir }: {
  a: ArquivoCriativo;
  codigo: string;
  podeEditar: boolean;
  aoCapa: () => void;
  aoExcluir: () => void;
}) {
  const dur = duracaoCurta(a.duracao);
  const baixar = `${a.url}?download=1&nome=${encodeURIComponent(`${codigo} - ${a.nome}`)}`;
  return (
    <li className="mk-peca">
      <div className="mk-peca-midia">
        {a.tipo === "video" ? (
          // `#t=0.1` faz o navegador pintar um quadro em vez de um retângulo
          // preto; `preload="metadata"` não baixa o vídeo inteiro só pra isso.
          <video
            src={`${a.url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            controls
          />
        ) : (
          // Kinetics 074 · esqueleto → peça, sem o corte seco.
          <ImagemQueChega src={a.url} alt={a.nome} />
        )}
        {a.principal && (
          // `key` no nome da peça: trocar a capa remonta o selo e ele "pula" na nova.
          <span key={a.id} className="mk-peca-capa">
            <Icon name="star" size={12} /> Capa
          </span>
        )}
        {dur && <span className="mk-peca-dur">{dur}</span>}
      </div>

      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        <span title={a.nome} style={{
          fontSize: 12.5, fontWeight: 600, lineHeight: 1.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{a.nome}</span>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
          {NOME_DO_FORMATO[a.formato]}
          {a.largura && a.altura ? ` · ${a.largura}×${a.altura}` : ""}
          {` · ${emMB(a.tamanho)}`}
        </span>
      </div>

      <div style={{ display: "flex", borderTop: "1px solid var(--border)" }}>
        <AcaoPeca href={baixar} icone="download" rotulo="Baixar" />
        {podeEditar && !a.principal && (
          <AcaoPeca onClick={aoCapa} icone="star" rotulo="Definir como capa" />
        )}
        {podeEditar && (
          <AcaoPeca onClick={aoExcluir} icone="trash" rotulo="Excluir" cor="var(--perigo)" />
        )}
      </div>
    </li>
  );
}

/** Alvo de 44px sempre visível — a alternativa (aparecer no hover) some no celular. */
function AcaoPeca({ href, onClick, icone, rotulo, cor }: {
  href?: string;
  onClick?: () => void;
  icone: string;
  rotulo: string;
  cor?: string;
}) {
  const perigo = cor === "var(--perigo)" ? "1" : undefined;
  const estilo: React.CSSProperties | undefined = cor ? { color: cor } : undefined;
  return href
    ? <a href={href} title={rotulo} aria-label={rotulo} className="mk-acao" style={estilo}>
        <Icon name={icone} size={16} />
      </a>
    : <button type="button" onClick={onClick} title={rotulo} aria-label={rotulo} className="mk-acao" data-perigo={perigo} style={estilo}>
        <Icon name={icone} size={16} />
      </button>;
}
