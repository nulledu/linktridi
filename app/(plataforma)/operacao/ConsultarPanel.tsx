"use client";

// ── "Que peça é esta?" ───────────────────────────────────────────────────────
//
// A tela Consultar do tablet, na web. Um campo só, que aceita as duas coisas:
// quem tem a pistola bipa, quem não tem digita o nome.
//
// ── POR QUE NÃO É A BUSCA DO CATÁLOGO ────────────────────────────────────────
//
// Porque as perguntas são diferentes e a resposta certa de uma é ruído na
// outra. No Catálogo a pergunta é "o que existe?", e a resposta é uma tabela
// com preço, fornecedor, ficha técnica. Aqui a pessoa está de pé na prateleira
// com uma etiqueta na mão, e a pergunta é "quantos, e onde?". Tudo que não for
// isso atrapalha — inclusive a coluna de custo, que nem todo mundo pode ver.
//
// A diferença que mais importa: bipar uma etiqueta de UNIDADE aqui responde
// sobre AQUELA etiqueta ("expedida em 12/08 por João"), não sobre o saldo. É a
// pergunta que ninguém consegue fazer no Catálogo, e é a que traz alguém aqui
// com um adesivo velho na mão.

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import { LeitorCodigo } from "../ui/LeitorCodigo";
import { useImpressaoRapida } from "../estoque/impressao/ImpressaoRapida";

interface ItemConsultado {
  id: string;
  nome: string;
  sku: string | null;
  unidade: string;
  quantidade: number;
  qtdMinima: number;
  serializado: boolean;
  categoria: string | null;
  ativo: boolean;
  cor: string | null;
  imagemUrl?: string | null;
  local: string | null;
  /** A repartição por lugar (ausente enquanto o SQL novo não rodou no banco). */
  lugares?: { id: string; nome: string; caminho: string; quantidade: number }[];
  semLugar?: number;
  unidadeLida?: {
    codigo: string; status: string; quantidade: number;
    baixaMotivo: string | null; baixadoEm: string | null; baixadoPor: string | null;
  } | null;
  etiquetasEmEstoque?: number | null;
}

const ESTADOS: Record<string, { rotulo: string; cor: string }> = {
  em_estoque: { rotulo: "Em estoque", cor: "var(--ok)" },
  consumido: { rotulo: "Consumida na produção", cor: "var(--text-dim)" },
  expedido: { rotulo: "Expedida pro cliente", cor: "var(--text-dim)" },
  perdido: { rotulo: "Perdida / refugo", cor: "var(--perigo)" },
  devolvido: { rotulo: "Devolvida ao fornecedor", cor: "var(--text-dim)" },
};

function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function ConsultarPanel() {
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<ItemConsultado[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [camera, setCamera] = useState(false);
  const campoRef = useRef<HTMLInputElement | null>(null);

  // A pistola escreve no campo FOCADO. Sem este foco de entrada, quem chega com
  // o leitor na mão bipa no vazio e conclui que o leitor não funciona.
  useEffect(() => { campoRef.current?.focus(); }, []);

  const consultar = useCallback(async (texto: string, ehCodigo: boolean) => {
    const alvo = texto.trim();
    if (!alvo) { setItens([]); setAviso(null); return; }
    setBuscando(true);
    setAviso(null);
    try {
      const p = new URLSearchParams(ehCodigo ? { codigo: alvo } : { busca: alvo });
      const r = await fetch(`/api/estoque/consultar?${p}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) {
        setItens([]);
        setAviso(d?.error === "forbidden"
          ? "Você não tem a permissão “Ver catálogo / itens”. Peça pro admin em Permissões."
          : (d?.detalhe ?? "Não deu para consultar agora."));
        return;
      }
      setItens(d.itens ?? []);
      setAviso(d.aviso ?? null);
    } catch {
      setItens([]);
      setAviso("Sem conexão. A consulta precisa de rede — o que já está na tela continua valendo.");
    } finally {
      setBuscando(false);
      // O texto fica SELECIONADO, não apagado: a pessoa ainda vê o que bipou,
      // e a próxima leitura da pistola SUBSTITUI em vez de colar na ponta —
      // sem isto o segundo bipe virava "PRD-0001PRD-0002" e a consulta
      // devolvia "não achei" pra um código que existe.
      requestAnimationFrame(() => { campoRef.current?.focus(); campoRef.current?.select(); });
    }
  }, []);

  // Bipar é um código EXATO; digitar é busca. A tela distingue pelo gesto, e
  // não pelo formato do texto: "PRD" digitado à mão é busca, e um código lido
  // pela câmera é código mesmo que pareça um nome.
  const bipou = useCallback((codigo: string) => {
    setTermo(codigo);
    void consultar(codigo, true);
  }, [consultar]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <form
        onSubmit={(e) => { e.preventDefault(); void consultar(termo, false); }}
        style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 200px), 1fr) auto", gap: 8 }}
      >
        <input
          ref={campoRef}
          value={termo}
          onChange={(e) => setTermo(e.target.value.slice(0, 60))}
          onKeyDown={(e) => {
            // Enter da pistola = código exato. Enter de quem digitou também
            // tenta o código primeiro: se o texto FOR um SKU, a resposta exata
            // é melhor que uma lista de um item só.
            if (e.key === "Enter") { e.preventDefault(); void consultar(termo, true); }
          }}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="Bipe a etiqueta ou digite o nome"
          aria-label="Código ou nome do item"
          style={{
            minHeight: "var(--tap)", padding: "10px 14px", fontSize: 16,
            borderRadius: "var(--r-sm)", border: "1.5px solid var(--border)",
            background: "var(--surface)", color: "var(--text)", width: "100%",
          }}
        />
        <Botao type="button" variante="secundario" icone="camera" onClick={() => setCamera(true)} title="Ler com a câmera">
          <span className="desk-only">Câmera</span>
        </Botao>
      </form>

      {/*
        "Procurando…" CINTILA em vez de ficar parado.

        Numa consulta que às vezes leva um segundo e às vezes três, um texto
        estático não distingue "ainda buscando" de "travou" — e no galpão a
        reação a uma tela parada é bipar de novo, o que reinicia a busca. A
        faixa correndo pelo texto é a única coisa na tela dizendo que algo
        continua acontecendo. Sem spinner: ele ocuparia o lugar onde a resposta
        vai aparecer.

        `data-text` repete a frase de propósito — é ela que a camada de brilho
        recorta. Se o texto mudar, mude nos dois.
      */}
      {buscando && (
        <p style={{ fontSize: 13, margin: 0 }}>
          <span className="t-shimmer" data-text="Procurando…">Procurando…</span>
        </p>
      )}

      {aviso && (
        <p role="status" style={{
          margin: 0, padding: "10px 12px", borderRadius: "var(--r-sm)", fontSize: 13.5,
          border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)",
        }}>{aviso}</p>
      )}

      {itens.map((it) => <CartaoDoItem key={it.id + (it.unidadeLida?.codigo ?? "")} item={it} />)}

      {!buscando && !aviso && itens.length === 0 && termo.trim() === "" && (
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", margin: 0 }}>
          Bipe uma etiqueta para ver o saldo e onde a peça mora. Sem leitor, digite o nome ou o SKU.
        </p>
      )}

      {camera && (
        <LeitorCodigo titulo="Consultar" onLer={bipou} onFechar={() => setCamera(false)} />
      )}
    </div>
  );
}

function CartaoDoItem({ item }: { item: ItemConsultado }) {
  const abaixoDoMinimo = item.qtdMinima > 0 && item.quantidade <= item.qtdMinima;
  const u = item.unidadeLida;
  const estado = u ? (ESTADOS[u.status] ?? { rotulo: u.status, cor: "var(--text-dim)" }) : null;
  const impressao = useImpressaoRapida();
  const [recado, setRecado] = useState<{ ok: boolean; frase: string } | null>(null);

  // O código que vai pro papel: o da etiqueta bipada (a peça) ou, sem ela, o
  // SKU (a etiqueta de produto — todas as almofadas com o mesmo código).
  const codigoDaEtiqueta = u?.codigo ?? item.sku;

  async function reimprimir() {
    if (!codigoDaEtiqueta || impressao.ocupado) return;
    setRecado(null);
    const r = await impressao.imprimir({
      codigo: codigoDaEtiqueta, nome: item.nome,
      corDimensoes: item.cor ?? undefined, local: item.local ?? "",
      quantidade: u?.quantidade ?? 1, impressoEm: "", responsavel: "",
    });
    setRecado({ ok: r.ok, frase: r.frase });
  }

  return (
    <article className="glass" style={{ padding: 16, borderRadius: "var(--r-md)", display: "grid", gap: 12 }}>
      {/*
        A FOTO primeiro, quando existe.

        Quem bipa uma etiqueta na prateleira está confirmando que a peça na mão
        é a peça da tela — e nome de catálogo não confirma nada: "Suporte L
        40mm" e "Suporte L 45mm" leem igual. Um olhar na foto resolve o que
        três linhas de texto não resolvem.

        Item sem foto não ganha moldura vazia: a linha do nome sobe e ocupa a
        largura toda, como era antes.
      */}
      <header style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {item.imagemUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imagemUrl} alt=""
            style={{ width: 72, height: 72, flex: "none", objectFit: "cover", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)" }}
          />
        )}
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{item.nome}</h3>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)" }}>
            {[item.sku, item.categoria, item.cor].filter(Boolean).join(" · ") || "sem SKU"}
            {!item.ativo && " · INATIVO"}
          </p>
        </div>
      </header>

      {/* O saldo grande: é o que a pessoa veio ver, e ela está a um braço de
          distância da tela, não a 40cm. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 34, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: abaixoDoMinimo ? "var(--perigo)" : "var(--text)" }}>
          {item.quantidade}
        </strong>
        <span style={{ fontSize: 15, color: "var(--text-dim)" }}>{item.unidade}</span>
        {abaixoDoMinimo && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 700, color: "var(--perigo)" }}>
            <Icon name="alert-triangle" size={14} color="currentColor" />
            no mínimo ({item.qtdMinima})
          </span>
        )}
      </div>

      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
        {item.lugares?.length
          ? <DadoLugares lugares={item.lugares} semLugar={item.semLugar ?? 0} />
          : <Dado rotulo="Onde fica" valor={item.local ?? "sem lugar definido"} />}
        {item.serializado && (
          <Dado rotulo="Etiquetas em estoque" valor={item.etiquetasEmEstoque == null ? "—" : String(item.etiquetasEmEstoque)} />
        )}
        <Dado rotulo="Como é contado" valor={item.serializado ? "por etiqueta, uma a uma" : "pelo saldo do item"} />
      </dl>

      {/* A etiqueta bipada. Esta é a resposta que só existe aqui: o saldo diz
          quantos temos, isto diz onde ESTA foi parar. */}
      {u && (
        <div style={{
          display: "grid", gap: 4, padding: "10px 12px", borderRadius: "var(--r-sm)",
          border: `1.5px solid ${estado!.cor}`, background: "var(--surface)",
        }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)", fontWeight: 700, letterSpacing: ".02em" }}>
            A ETIQUETA QUE VOCÊ BIPOU
          </p>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: estado!.cor }}>
            {u.codigo} · {estado!.rotulo}
          </p>
          {u.quantidade > 1 && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>Caixa lacrada · {u.quantidade} peças</p>
          )}
          {u.status !== "em_estoque" && (u.baixadoEm || u.baixadoPor) && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>
              {[quando(u.baixadoEm), u.baixadoPor && `por ${u.baixadoPor}`, u.baixaMotivo].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      )}

      {/*
        Reimprimir. É o gesto de quem achou a etiqueta rasgada na prateleira:
        bipa o que sobrou, confere que é a peça certa, e sai uma nova.

        O botão existe SEMPRE que há um código. Antes ele só aparecia com uma
        Zebra cadastrada nesta máquina, "para não abrir um diálogo de impressão
        no meio de uma consulta" — mas o efeito real era pior: no computador da
        bancada, que não tem Zebra cadastrada, a função simplesmente não
        existia, e quem precisava da etiqueta concluía que o site não imprime.
        Um diálogo que a pessoa PEDIU não é interrupção; é a resposta.
      */}
      {codigoDaEtiqueta && (
        <div style={{ display: "grid", gap: 8 }}>
          <Botao type="button" variante="secundario" icone="printer" carregando={impressao.ocupado} onClick={() => void reimprimir()}>
            {impressao.nomeDaZebra ? `Imprimir etiqueta na ${impressao.nomeDaZebra}` : "Imprimir etiqueta"}
          </Botao>
          {recado && (
            <p role="status" style={{ margin: 0, fontSize: 13, color: recado.ok ? "var(--ok)" : "var(--perigo)" }}>{recado.frase}</p>
          )}
        </div>
      )}
      {impressao.folha}
    </article>
  );
}

/** "Onde fica" quando o item mora em mais de um lugar: cada lugar com o saldo
 *  dele, e o balde "sem lugar definido" quando sobra peça fora da conta. */
function DadoLugares({ lugares, semLugar }: {
  lugares: { id: string; nome: string; caminho: string; quantidade: number }[];
  semLugar: number;
}) {
  return (
    <div>
      <dt style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 700, letterSpacing: ".02em" }}>ONDE FICA</dt>
      <dd style={{ margin: "2px 0 0", display: "grid", gap: 2 }}>
        {lugares.map((l) => (
          <span key={l.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
            <span style={{ minWidth: 0, overflowWrap: "anywhere", fontWeight: 600 }}>{l.caminho}</span>
            <strong style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{l.quantidade}</strong>
          </span>
        ))}
        {semLugar > 0 && (
          <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, color: "var(--text-dim)" }}>
            <span>sem lugar definido</span>
            <strong style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{semLugar}</strong>
          </span>
        )}
      </dd>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 700, letterSpacing: ".02em" }}>{rotulo.toUpperCase()}</dt>
      <dd style={{ margin: "2px 0 0", fontSize: 14, fontWeight: 600 }}>{valor}</dd>
    </div>
  );
}
