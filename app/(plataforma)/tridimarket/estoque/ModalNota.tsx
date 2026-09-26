"use client";

// Fluxo "Adicionar nota" no Estoque: foto/upload → o worker (PC da empresa) lê →
// a pessoa confere os itens → dá entrada no estoque com custo (lucro = preço −
// custo). A imagem NUNCA vai pro Claude: sobe pra um bucket privado e só o
// worker baixa.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../Icon";
import { Alerta } from "../../ui/Alerta";
import { Botao, BotaoIcone } from "../../ui/controles";
import type { MarketProduct } from "../../../../lib/tridimarket/types";
import { formatMarketCurrency } from "../../../../lib/tridimarket/view";
import { centavosDeReais, centavosDoTexto, reaisDeCentavos, textoDeCentavos } from "../../../../lib/tridimarket/moeda";
import { INDIGO, marketRequest } from "../ui";
import { useIsMobile } from "../../ui/useMediaQuery";
import { atributosDe } from "../../ui/campos";

type Etapa = "upload" | "processando" | "conferir" | "enviando";

interface ItemExtraido { nome: string; quantidade: number; precoUnitario: number; total?: number | null; codigo?: string | null }
interface JobStatus { id: string; status: string; error: string | null; result: { fonte: string; chave?: string | null; itens: ItemExtraido[] } | null }

// Linha editável na conferência.
interface Linha {
  nome: string;
  productId: number | null;   // casado com produto existente; null = criar novo
  quantidade: number;
  custoCent: number;          // custo unitário (centavos)
  vendaCent: number;          // preço de venda p/ produto novo (centavos)
  barcode: string | null;
}

function normaliza(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export function ModalNota({ profileId, companyId, produtos, onClose, onDone }: {
  profileId: string; companyId: number; produtos: MarketProduct[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [jobId, setJobId] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [fonte, setFonte] = useState<string>("");
  const [erro, setErro] = useState<string | null>(null);
  const [demorando, setDemorando] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Casa um item lido com um produto existente (código exato, senão nome exato).
  const casar = (it: ItemExtraido): number | null => {
    if (it.codigo) { const p = produtos.find((x) => x.barcode && x.barcode === it.codigo); if (p) return p.id; }
    const n = normaliza(it.nome);
    const p = produtos.find((x) => normaliza(x.name) === n);
    return p ? p.id : null;
  };

  // Vai direto pra conferência, com uma linha em branco e sem job por trás.
  // `confirmarNota` aceita `jobId` ausente justamente pra isso.
  function digitarItens() {
    setErro(null);
    setJobId(null);
    setFonte("manual");
    setLinhas([{ nome: "", productId: null, quantidade: 1, custoCent: 0, vendaCent: 0, barcode: null }]);
    setEtapa("conferir");
  }

  async function enviarArquivo(file: File) {
    setErro(null);
    const fd = new FormData();
    fd.append("image", file);
    fd.append("profileId", profileId);
    fd.append("companyId", String(companyId));
    try {
      // marketRequest força Content-Type json; aqui é multipart, então fetch direto.
      const res = await fetch("/api/tridimarket/notas", { method: "POST", body: fd });
      const payload = await res.json().catch(() => null);
      if (res.status === 403) throw new Error("Ops, parece que você não tem permissão para acessar isso.");
      if (!res.ok || !payload?.ok) {
        // `detalhe`/`codigo` na frente quando existem: o par
        // "market_schema_missing — run_supabase_tridimarket_migration" não diz
        // qual tabela, função ou schema faltou, e sem isso não há como agir.
        const partes = [
          payload?.detalhe || null,
          payload?.codigo ? `(${payload.codigo})` : null,
          payload?.detalhe ? null : payload?.error || null,
          payload?.detalhe ? null : payload?.action || null,
        ].filter(Boolean);
        throw new Error(partes.length ? partes.join(" ") : "Falha ao enviar a nota.");
      }
      setJobId(payload.data.jobId);
      setEtapa("processando");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao enviar a nota."); }
  }

  // Poll do status enquanto processa.
  useEffect(() => {
    if (etapa !== "processando" || !jobId) return;
    let vivo = true;
    const inicio = Date.now();
    const tick = async () => {
      try {
        const job = await marketRequest<JobStatus>(`notas?jobId=${jobId}`);
        if (!vivo) return;
        if (job.status === "done") {
          const itens = job.result?.itens ?? [];
          setFonte(job.result?.fonte ?? "ocr");
          setLinhas(itens.map((it) => {
            const pid = casar(it);
            return {
              nome: it.nome,
              productId: pid,
              quantidade: it.quantidade || 1,
              custoCent: centavosDeReais(it.precoUnitario || 0),
              vendaCent: centavosDeReais(it.precoUnitario || 0),
              barcode: it.codigo ?? null,
            };
          }));
          setEtapa("conferir");
          return;
        }
        if (job.status === "error") { setErro(job.error || "O processador não conseguiu ler a nota."); setEtapa("upload"); return; }
        setDemorando(Date.now() - inicio > 20_000); // 20s sem sair de queued → worker offline?
        // Desiste depois de 5 minutos. Com o worker do PC da empresa desligado o
        // job fica "queued" para sempre, e este poll de 2,5s seguia batendo
        // enquanto o modal estivesse aberto — 24 requisições por minuto, sem fim,
        // por uma nota que não vai ser lida. Agora para e diz o que fazer.
        if (Date.now() - inicio > 5 * 60_000) {
          setErro("A nota continua na fila há 5 minutos. Confira se o worker está rodando no PC da empresa e envie de novo.");
          setEtapa("upload");
          return;
        }
      } catch (e) { if (vivo) { setErro(e instanceof Error ? e.message : "Falha ao consultar."); setEtapa("upload"); } }
    };
    const id = setInterval(tick, 2500);
    void tick();
    return () => { vivo = false; clearInterval(id); };
  }, [etapa, jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalCusto = useMemo(() => linhas.reduce((s, l) => s + reaisDeCentavos(l.custoCent) * l.quantidade, 0), [linhas]);

  async function confirmar() {
    setEtapa("enviando"); setErro(null);
    const itens = linhas.map((l) => ({
      productId: l.productId ?? undefined,
      novoNome: l.productId ? undefined : l.nome,
      barcode: l.barcode,
      quantidade: l.quantidade,
      custo: reaisDeCentavos(l.custoCent),
      precoVenda: l.productId ? undefined : reaisDeCentavos(l.vendaCent),
    }));
    try {
      const r = await marketRequest<{ entrouEstoque: number; criados: number }>("notas/confirmar", {
                // `?? undefined` porque o zod `.optional()` recusa null — e na entrada
        // digitada à mão não há job. Mandar `jobId: null` reprovava com
        // "invalid_confirm".
        method: "POST", body: JSON.stringify({ jobId: jobId ?? undefined, profileId, companyId, itens }),
      });
      onDone(`${r.entrouEstoque} item(ns) no estoque${r.criados ? `, ${r.criados} produto(s) novo(s)` : ""}.`);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível confirmar."); setEtapa("conferir"); }
  }

  const set = (i: number, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => j === i ? { ...l, ...patch } : l));

  return (
    <Overlay onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <strong style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>Adicionar nota</strong>
        <BotaoIcone icone="x" titulo="Fechar" onClick={onClose} />
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 16px" }}>
        A foto é lida pelo processador da empresa. A imagem não sai para lugar nenhum além dele.
      </p>

      {erro && <Alerta tom="perigo" style={{ marginBottom: 12 }}>{erro}</Alerta>}

      {etapa === "upload" && (
        <div style={{ display: "grid", gap: 10 }}>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: "none" }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarArquivo(f); }} />
          <Botao variante="primario" tamanho="lg" bloco icone="camera" onClick={() => fileRef.current?.click()}>Tirar foto ou escolher arquivo</Botao>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)", textAlign: "center" }}>Foto do cupom, JPG/PNG ou PDF (até 12 MB).</span>

          {/* A porta que não depende de ninguém. Ler a foto exige o worker
              rodando num PC da empresa; quando ele está desligado a nota fica
              na fila e a entrada de estoque simplesmente não acontece. Digitar
              é mais trabalhoso e SEMPRE funciona — então não pode ser uma
              alternativa escondida. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>ou</span>
            <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <Botao icone="list-check" onClick={digitarItens}>Digitar os itens à mão</Botao>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)", textAlign: "center" }}>
            Não precisa do PC ligado nem do processador — entra na mesma tela de conferência.
          </span>
        </div>
      )}

      {etapa === "processando" && (
        <div style={{ display: "grid", placeItems: "center", gap: 12, padding: "26px 0" }}>
          <div className="tm-skel" style={{ width: 46, height: 46, borderRadius: "50%" }} />
          <strong style={{ fontSize: 14, color: "var(--text)" }}>Lendo a nota…</strong>
          <span style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", maxWidth: 340 }}>
            {demorando
              ? "Está demorando. Confira se o worker está rodando no PC da empresa (a nota fica na fila até ele ler)."
              : "O processador da empresa está lendo os itens."}
          </span>
        </div>
      )}

      {(etapa === "conferir" || etapa === "enviando") && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, color: "var(--text-dim)" }}>
            <Icon name={fonte === "qr_fiscal" ? "rosette-discount-check" : "receipt"} size={15} color={INDIGO} />
            {fonte === "qr_fiscal" ? "Lido do cupom fiscal (QR)" : "Lido por OCR"} · confira antes de dar entrada.
          </div>
          {linhas.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-dim)", padding: "16px 0" }}>Nenhum item reconhecido. Tente uma foto mais nítida.</div>
          ) : (
            <div style={{ display: "grid", gap: 8, maxHeight: "48dvh", overflowY: "auto", paddingRight: 4 }}>
              {linhas.map((l, i) => (
                <LinhaConferencia key={i} l={l} produtos={produtos} onChange={(patch) => set(i, patch)} onRemover={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} />
              ))}
            </div>
          )}
          {/* Acrescentar linha. Sem isto, digitar à mão só serviria pra UM item —
              e o cupom que motivou tudo isso tinha seis. Vale também pra nota
              lida pelo worker, quando ele perde uma linha. */}
          <Botao variante="sutil" icone="plus"
            onClick={() => setLinhas((ls) => [...ls, { nome: "", productId: null, quantidade: 1, custoCent: 0, vendaCent: 0, barcode: null }])}
            style={{ marginTop: 10 }}>Acrescentar item</Botao>
          {/* Custo + botões: no celular "Dar entrada no estoque" sozinho já passa
              da largura útil, então a linha quebra em vez de estourar. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Custo total: <strong style={{ color: "var(--text)" }}>{formatMarketCurrency(totalCusto)}</strong></span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: "1 1 auto", justifyContent: "flex-end" }}>
              <Botao onClick={onClose}>Cancelar</Botao>
              <Botao variante="primario" onClick={() => void confirmar()} carregando={etapa === "enviando"} disabled={linhas.length === 0}>
                {etapa === "enviando" ? "Dando entrada…" : "Dar entrada no estoque"}
              </Botao>
            </div>
          </div>
        </>
      )}
    </Overlay>
  );
}

function LinhaConferencia({ l, produtos, onChange, onRemover }: {
  l: Linha; produtos: MarketProduct[]; onChange: (p: Partial<Linha>) => void; onRemover: () => void;
}) {
  // No celular o iOS força 16px nos campos: "R$ 1.234,56" não cabe nos 96px de
  // largura fixa e o valor fica cortado. Os campos passam a dividir a linha.
  const celular = useIsMobile();
  const rotulo: React.CSSProperties = celular ? { ...rot, flex: "1 1 110px", minWidth: 0 } : rot;
  const dinheiro = (largura: number): React.CSSProperties => ({ ...campo, width: celular ? "100%" : largura, textAlign: "right" });
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 10, display: "grid", gap: 8, background: "var(--surface)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input {...atributosDe("nome")} value={l.nome} onChange={(e) => onChange({ nome: e.target.value })} placeholder="Nome do produto"
          style={{ ...campo, flex: 1, minWidth: 0, fontWeight: 600 }} />
        <BotaoIcone icone="trash" titulo="Remover item" variante="perigo" tamanho="sm" onClick={onRemover} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <ComboProduto produtos={produtos} productId={l.productId} nome={l.nome} onPick={(id) => onChange({ productId: id })} />
        <label style={rotulo}>Qtd
          <input value={String(l.quantidade)} inputMode="decimal"
            onChange={(e) => onChange({ quantidade: Math.max(0, Number(e.target.value.replace(",", ".").replace(/[^\d.]/g, "")) || 0) })}
            style={{ ...campo, width: celular ? "100%" : 62, textAlign: "center" }} />
        </label>
        <label style={rotulo}>Custo un.
          <input {...atributosDe("dinheiro")} value={textoDeCentavos(l.custoCent)} inputMode="numeric" placeholder="R$ 0,00"
            onChange={(e) => onChange({ custoCent: centavosDoTexto(e.target.value) })}
            style={dinheiro(96)} />
        </label>
        {l.productId == null && (
          <label style={rotulo}>Venda
            <input {...atributosDe("dinheiro")} value={textoDeCentavos(l.vendaCent)} inputMode="numeric" placeholder="R$ 0,00"
              onChange={(e) => onChange({ vendaCent: centavosDoTexto(e.target.value) })}
              style={dinheiro(96)} />
          </label>
        )}
      </div>
    </div>
  );
}

// Combo pesquisável: "Criar novo" (padrão) ou casar com um produto existente.
function ComboProduto({ produtos, productId, nome, onPick }: {
  produtos: MarketProduct[]; productId: number | null; nome: string; onPick: (id: number | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  // O painel tinha 260px fixos dentro de um modal que no celular tem ~236px de
  // conteúdo — vazava pra fora e criava rolagem lateral. No celular o combo passa
  // a ocupar a linha inteira e o painel acompanha a largura dele.
  const celular = useIsMobile();
  const atual = productId ? produtos.find((p) => p.id === productId) : null;
  const lista = useMemo(() => {
    const n = normaliza(q || nome);
    return produtos.filter((p) => normaliza(p.name).includes(n)).slice(0, 8);
  }, [produtos, q, nome]);
  return (
    <div style={{ position: "relative", ...(celular ? { flex: "1 1 100%", minWidth: 0 } : null) }}>
      <button onClick={() => setAberto((v) => !v)} style={{ ...campo, width: celular ? "100%" : undefined, minWidth: celular ? 0 : 190, textAlign: "left", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <Icon name={atual ? "package" : "plus"} size={14} color={atual ? INDIGO : "var(--tf-pos)"} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: atual ? "var(--text)" : "var(--tf-pos)" }}>
          {atual ? atual.name : "Criar produto novo"}
        </span>
        <Icon name="chevron-down" size={14} color="var(--text-dim)" />
      </button>
      {aberto && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: celular ? 0 : "auto", zIndex: 20, width: celular ? "auto" : 260, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", boxShadow: "0 12px 30px rgba(0,0,0,.18)", padding: 6 }}>
          <input {...atributosDe("busca")} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto…" style={{ ...campo, width: "100%", marginBottom: 6 }} />
          <button onClick={() => { onPick(null); setAberto(false); }} style={{ ...opcao, color: "var(--tf-pos)" }}>
            <Icon name="plus" size={14} color="var(--tf-pos)" /> Criar produto novo
          </button>
          {lista.map((p) => (
            <button key={p.id} onClick={() => { onPick(p.id); setAberto(false); }} style={opcao}>
              <Icon name="package" size={14} color="var(--text-dim)" />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{formatMarketCurrency(p.price)}</span>
            </button>
          ))}
          {lista.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "6px 8px" }}>Nada encontrado.</div>}
        </div>
      )}
    </div>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} className="sheet-host" style={{ position: "fixed", inset: 0, background: "rgba(10,8,20,.55)", display: "grid", placeItems: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ width: "min(680px, 100%)", maxHeight: "90dvh", overflowY: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 20 }}>
        {children}
      </div>
    </div>
  );
}

const campo: React.CSSProperties = { height: 34, padding: "0 10px", borderRadius: "var(--r-xs)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 13 };
// 12px é o piso de um rótulo de formulário — a 10.5px "Custo un." fica ilegível
// no celular e o campo abaixo dele perde a referência.
const rot: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "var(--text-dim)", fontWeight: 600 };
const opcao: React.CSSProperties = { width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 8px", borderRadius: "var(--r-xs)", border: "none", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--text)", textAlign: "left" };
