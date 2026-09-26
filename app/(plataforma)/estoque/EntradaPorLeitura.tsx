"use client";

// ── Bipar produto pro estoque, no computador e no celular ───────────────────
//
// A terceira porta de entrada existia só no servidor (a rota do tablet). Aqui
// ela ganha as duas formas de ler que o galpão já usa, sem hardware novo:
//
//   COMPUTADOR → a pistola USB/Bluetooth é um TECLADO. Ela digita o código no
//                campo focado e manda Enter. O campo se auto-foca, então quem
//                chega com a pistola só bipa — não clica em nada.
//   CELULAR    → a câmera, pelo `LeitorCodigo` que a saída já usa. Contínuo:
//                a folha fica aberta e cada leitura entra na fila, porque
//                abrir e fechar a cada peça é o que faz ninguém usar.
//
// ── O QUE ESTE PAINEL NÃO FAZ ───────────────────────────────────────────────
//
// Não decide de onde a peça veio. "Bipar pra entrar" são três coisas no galpão
// (chegou de fornecedor / produzido aqui / achei na prateleira) e elas divergem
// no que valem — quem sabe é quem está com a peça na mão. O motivo é escolhido
// UMA vez pro lote, igual à baixa: bipa muito, responde uma vez, confirma.

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Botao, BotaoIcone } from "../ui/controles";
import { LeitorCodigo } from "../ui/LeitorCodigo";
import { motivosDoAjuste, MAX_POR_AJUSTE, type SentidoDoAjuste } from "@/lib/estoque-ajuste-por-qr";
import { EscolhaDeLugar } from "./EscolhaDeLugar";
import type { LugarComSaldo } from "@/lib/estoque-transferencia";

/** Uma leitura esperando confirmação. */
interface NaFila {
  /** Chave local; o mesmo código pode ser bipado várias vezes de propósito. */
  chave: string;
  codigo: string;
  /** Quantas peças este código representa nesta leva. Bipar de novo soma 1. */
  quantidade: number;
}

type Desfecho = { codigo: string; ok: boolean; frase: string };

export function EntradaPorLeitura({ podeAjustar }: { podeAjustar: boolean }) {
  const [sentido, setSentido] = useState<SentidoDoAjuste>("entrada");
  const [fila, setFila] = useState<NaFila[]>([]);
  const [motivo, setMotivo] = useState("");
  const [camera, setCamera] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [desfechos, setDesfechos] = useState<Desfecho[]>([]);
  /** O 409 `precisa_lugar` de UM código vira esta pergunta. Uma por vez: quem
   *  responde e confirma de novo recebe a próxima, se houver. */
  const [pendenteDeLugar, setPendenteDeLugar] = useState<{
    codigo: string; frase: string; lugares: LugarComSaldo[];
  } | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  const motivos = motivosDoAjuste(sentido);

  // A pistola escreve no campo FOCADO. Focar sozinho é o que faz ela funcionar
  // sem ninguém clicar antes — quem chega com o leitor na mão só aponta e bipa.
  useEffect(() => { if (podeAjustar && !camera) campo.current?.focus(); }, [podeAjustar, camera, fila.length]);

  if (!podeAjustar) {
    return (
      <p style={aviso}>
        Você não tem permissão pra mexer na quantidade do estoque. Peça a quem
        administra a sub-permissão <strong>“Ajustar quantidade”</strong> do Estoque.
      </p>
    );
  }

  /** Bipou. Código repetido SOMA em vez de virar linha nova. */
  function adicionar(bruto: string) {
    const codigo = bruto.trim();
    if (!codigo) return;
    setFila((f) => {
      const i = f.findIndex((x) => x.codigo === codigo);
      if (i < 0) return [...f, { chave: `${codigo}-${f.length}`, codigo, quantidade: 1 }];
      // Vinte almofadas com o MESMO código são vinte bipes do mesmo texto: se
      // cada um virasse linha, a lista teria vinte linhas iguais e ninguém
      // conferiria. Somar é o que a etiqueta de produto pede.
      const copia = [...f];
      copia[i] = { ...copia[i], quantidade: Math.min(MAX_POR_AJUSTE, copia[i].quantidade + 1) };
      return copia;
    });
  }

  /** Uma requisição por CÓDIGO, não por peça: o servidor resolve o item e soma
   *  a quantidade de uma vez. `localId` é a resposta à pergunta "de qual
   *  lugar?" — só vai quando o servidor pediu. */
  async function enviarUm(codigo: string, quantidade: number, localId?: string):
    Promise<Desfecho & { precisaLugar?: LugarComSaldo[] }> {
    try {
      const r = await fetch("/api/estoque/ajuste-qr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, sentido, quantidade, motivo, ...(localId ? { localId } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return { codigo, ok: true, frase: String(d.frase ?? "Registrado.") };
      if (d?.error === "precisa_lugar") {
        return {
          codigo, ok: false, frase: String(d.detalhe ?? "Diga de qual lugar."),
          precisaLugar: (d.lugares ?? []) as LugarComSaldo[],
        };
      }
      return { codigo, ok: false, frase: String(d.detalhe ?? "Não deu pra registrar.") };
    } catch {
      return { codigo, ok: false, frase: "Sem conexão — este código NÃO foi registrado." };
    }
  }

  async function confirmar() {
    if (!fila.length || !motivo || enviando) return;
    setEnviando(true);
    const saiu: Desfecho[] = [];
    let pendente: { codigo: string; frase: string; lugares: LugarComSaldo[] } | null = null;
    for (const linha of fila) {
      const d = await enviarUm(linha.codigo, linha.quantidade);
      // Item em mais de um lugar: vira a pergunta, não um desfecho de erro. A
      // linha continua na fila esperando a resposta.
      if (d.precisaLugar && !pendente) {
        pendente = { codigo: d.codigo, frase: d.frase, lugares: d.precisaLugar };
        continue;
      }
      saiu.push({ codigo: d.codigo, ok: d.ok, frase: d.frase });
    }
    // Quem passou sai da fila; quem falhou FICA, com o motivo ao lado. Limpar
    // tudo esconderia o que precisa de conserto, e a pessoa bipa de novo o que
    // já entrou.
    const falhou = new Set(saiu.filter((s) => !s.ok).map((s) => s.codigo));
    setFila((f) => f.filter((x) => falhou.has(x.codigo) || x.codigo === pendente?.codigo));
    setDesfechos(saiu);
    setPendenteDeLugar(pendente);
    setEnviando(false);
  }

  /** A resposta da pergunta: refaz SÓ aquele código, agora com o lugar. */
  async function responderLugar(localId: string) {
    if (!pendenteDeLugar || enviando) return;
    const alvo = fila.find((x) => x.codigo === pendenteDeLugar.codigo);
    setPendenteDeLugar(null);
    if (!alvo) return;
    setEnviando(true);
    const d = await enviarUm(alvo.codigo, alvo.quantidade, localId);
    if (d.ok) setFila((f) => f.filter((x) => x.codigo !== alvo.codigo));
    setDesfechos((v) => [...v.filter((x) => x.codigo !== d.codigo), { codigo: d.codigo, ok: d.ok, frase: d.frase }]);
    setEnviando(false);
  }

  const total = fila.reduce((s, l) => s + l.quantidade, 0);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Sentido: dois alvos grandes. É a decisão que muda tudo, e errar aqui
          soma onde devia tirar. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(["entrada", "saida"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={sentido === s}
            onClick={() => { setSentido(s); setMotivo(""); }}
            style={{ ...opcao, minHeight: "var(--tap)", justifyContent: "center",
              border: `1.5px solid ${sentido === s ? "var(--primary)" : "var(--border)"}`,
              background: sentido === s ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)" }}>
            <Icon name={s === "entrada" ? "plus" : "minus"} size={15} color="currentColor" />
            {s === "entrada" ? "Entrando no estoque" : "Saindo do estoque"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "grid", gap: 5, flex: "1 1 240px", minWidth: 200 }}>
          <span style={{ fontSize: 12, fontWeight: 700 }}>Código do produto</span>
          <input ref={campo} placeholder="Bipe com o leitor, ou digite e dê Enter"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              adicionar(e.currentTarget.value);
              e.currentTarget.value = "";
            }}
            style={{ minHeight: "var(--tap)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 12px", color: "var(--text)", fontSize: 15 }} />
        </label>
        {/* A câmera é a via do celular. No computador ela também funciona (webcam),
            e não atrapalha quem tem pistola: o campo continua focado ao fechar. */}
        <Botao variante="secundario" icone="camera" onClick={() => setCamera(true)}>Ler com a câmera</Botao>
      </div>

      {pendenteDeLugar && (
        <div style={{ ...aviso, display: "grid", gap: 8 }}>
          <p style={{ margin: 0 }}>
            <strong style={{ fontFamily: "var(--mono, monospace)" }}>{pendenteDeLugar.codigo}</strong>
          </p>
          <EscolhaDeLugar frase={pendenteDeLugar.frase} lugares={pendenteDeLugar.lugares}
            onEscolher={(localId) => { void responderLugar(localId); }} />
        </div>
      )}

      {fila.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {fila.map((l) => (
            <div key={l.chave} style={linha}>
              <span style={{ fontWeight: 700, fontFamily: "var(--mono, monospace)", overflowWrap: "anywhere" }}>{l.codigo}</span>
              <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-dim)" }}>{l.quantidade} peça{l.quantidade === 1 ? "" : "s"}</span>
              <BotaoIcone icone="x" titulo="Tirar da fila" tamanho="sm" onClick={() => setFila((f) => f.filter((x) => x.chave !== l.chave))} />
            </div>
          ))}
        </div>
      )}

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          {sentido === "entrada" ? "De onde veio" : "Pra onde foi"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: 6 }}>
          {motivos.map((m) => (
            <button key={m.key} type="button" aria-pressed={motivo === m.key} onClick={() => setMotivo(m.key)}
              style={{ ...opcao, minHeight: "var(--tap)", justifyContent: "center", textAlign: "center",
                border: `1.5px solid ${motivo === m.key ? "var(--primary)" : "var(--border)"}`,
                background: motivo === m.key ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface)" }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <Botao variante="primario" tamanho="lg" icone="checks" carregando={enviando}
        disabled={!fila.length || !motivo || enviando} onClick={confirmar}>
        {!fila.length ? "Bipe alguma coisa primeiro"
          : !motivo ? (sentido === "entrada" ? "Diga de onde veio" : "Diga pra onde foi")
          : `${sentido === "entrada" ? "Somar" : "Tirar"} ${total} peça${total === 1 ? "" : "s"}`}
      </Botao>

      {desfechos.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {desfechos.map((d) => (
            <p key={d.codigo} style={{ ...aviso, margin: 0, borderColor: d.ok ? "var(--border)" : "var(--perigo)" }}>
              <strong>{d.codigo}</strong> · {d.frase}
            </p>
          ))}
        </div>
      )}

      {camera && (
        <LeitorCodigo
          continuo
          titulo={`${sentido === "entrada" ? "Entrada" : "Saída"} — ${total} na fila`}
          onLer={adicionar}
          onFechar={() => setCamera(false)}
        />
      )}
    </div>
  );
}

const opcao: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 12px",
  borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: 13.5, fontWeight: 700, cursor: "pointer",
};

const linha: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
};

const aviso: React.CSSProperties = {
  fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55,
  padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
  background: "var(--bg)",
};
