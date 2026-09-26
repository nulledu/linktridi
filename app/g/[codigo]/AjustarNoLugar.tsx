"use client";

// ── A metade que ESCREVE da etiqueta de prateleira ──────────────────────────
//
// Estar de pé na frente da prateleira é o momento em que se descobre que o
// número está errado, que chegou coisa nova e que uma peça foi pro lugar
// errado. Ter que voltar ao computador pra corrigir é o que faz ninguém
// corrigir — e um estoque que ninguém corrige deixa de ser consultado.
//
// TRÊS ações, porque são as três que se descobre com a peça na mão:
//   · AJUSTAR  — o número está errado (estoque:ajustar)
//   · GUARDAR  — isto aqui passa a morar nesta prateleira (estoque:cadastrar)
//   · TIRAR    — isto não é daqui (estoque:cadastrar)
//
// ── POR QUE ISTO NÃO PERGUNTA NADA AO CARREGAR ──────────────────────────────
//
// `/g/<codigo>` é pública e cacheada (`revalidate = 60`) porque foi EXECUÇÃO,
// não egress, que pausou este projeto na Vercel em agosto. Se o botão precisasse
// saber quem você é pra decidir se aparece, a página deixaria de ser cacheável e
// todo scan viraria invocação — o mutirão de conferência voltaria a custar o que
// custou lá.
//
// Então a pergunta "posso?" acontece no TOQUE, uma vez por sessão de uso, e
// devolve as DUAS permissões juntas. Quem só apontou a câmera pra ver o que tem
// na prateleira não paga nada.

import { useCallback, useState } from "react";
import { Icon } from "@/app/(plataforma)/Icon";
import { Contador } from "@/app/(plataforma)/ui/controles";
import { motivosDoAjuste, MAX_POR_AJUSTE, type SentidoDoAjuste } from "@/lib/estoque-ajuste-por-qr";
import { fraseDeProdutos } from "@/lib/estoque-lugar-dos-itens";

interface ItemAqui {
  id: string;
  nome: string;
  quantidade: number;
  unidade: string;
  /** `true` quando o item mora num SUBLUGAR, não neste lugar exato. */
  deSublugar?: boolean;
}

type Quem = { logado: boolean; pode: boolean; podeMover: boolean } | null;

export function AjustarNoLugar({ itens, local, localId }: {
  itens: ItemAqui[];
  /** O código impresso na placa — o que a pessoa lê. */
  local: string;
  /** O uuid do lugar — é ele que a gravação usa. */
  localId: string;
}) {
  const [quem, setQuem] = useState<Quem>(null);
  const [checando, setChecando] = useState(false);
  const [aberto, setAberto] = useState<ItemAqui | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** Saldos que MUDARAM nesta visita — a folha veio do cache e não sabe deles. */
  const [novos, setNovos] = useState<Record<string, number>>({});
  /** Itens que saíram daqui nesta visita, e os que entraram. */
  const [saiu, setSaiu] = useState<Set<string>>(new Set());
  const [entrou, setEntrou] = useState<ItemAqui[]>([]);
  const [recado, setRecado] = useState<string | null>(null);

  async function perguntarSePosso() {
    if (checando) return;
    setChecando(true);
    try {
      const r = await fetch("/api/estoque/ajuste-qr", { cache: "no-store" });
      setQuem(r.ok ? await r.json() : { logado: false, pode: false, podeMover: false });
    } catch {
      setQuem({ logado: false, pode: false, podeMover: false });
    } finally { setChecando(false); }
  }

  const tirarDaqui = useCallback(async (item: ItemAqui) => {
    setRecado(null);
    try {
      const r = await fetch("/api/estoque/locais/itens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // `deOnde`: só apaga o endereço se ele ainda for este. A placa é lida
        // por várias pessoas no mesmo dia — ver a trava de corrida na rota.
        body: JSON.stringify({ localId: null, itemIds: [item.id], deOnde: localId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setRecado(String(d.detalhe ?? "Não deu pra tirar daqui agora.")); return; }
      if (d.aviso) { setRecado(String(d.aviso)); return; }
      setSaiu((s) => new Set(s).add(item.id));
      setEntrou((e) => e.filter((x) => x.id !== item.id));
      setRecado(`${item.nome} saiu de ${local}.`);
    } catch {
      setRecado("Sem conexão. Nada foi movido — tente de novo quando a rede voltar.");
    }
  }, [local, localId]);

  // ── Estado 1: o convite ───────────────────────────────────────────────────
  // Nem "você pode" nem "você não pode" — ainda não sabe, e descobrir custa uma
  // requisição que só quem vai mexer deve pagar. Aparece MESMO com o lugar
  // vazio: antes o componente sumia quando não havia item, e bipar uma
  // prateleira nova não oferecia nada — nem o caminho de guardar a primeira
  // peça nela, que é justamente o que se faz numa prateleira vazia.
  if (!quem) {
    return (
      <button onClick={perguntarSePosso} disabled={checando}
        style={{ ...botao, width: "100%", justifyContent: "center", marginTop: 12 }}>
        <Icon name="pencil" size={15} color="currentColor" />
        {checando ? "Verificando…" : itens.length ? "Mexer no estoque daqui" : "Guardar algo aqui"}
      </button>
    );
  }

  if (!quem.logado) {
    // ── O caso mais comum do mundo real, e o que faz "não consigo pelo QR" ────
    // A câmera do celular abre o link no navegador PADRÃO, que quase nunca é
    // aquele onde a pessoa está logada no ERP. Ela cai aqui.
    //
    // O `?next=` devolve pra ESTA placa depois do login. Sem ele a pessoa
    // entrava, caía no início do sistema, e tinha de sair procurando a
    // prateleira de novo — ou re-bipar o QR, que é o que ninguém faz: desiste.
    const voltarPraCa = typeof window !== "undefined"
      ? `/login?next=${encodeURIComponent(window.location.pathname)}`
      : "/login";
    return (
      <p style={{ ...aviso, marginTop: 12 }}>
        Entre no sistema neste celular pra mexer no estoque daqui — o navegador que a
        câmera abriu pode não ser aquele onde você já está logado.{" "}
        <a href={voltarPraCa} style={{ color: "var(--primary)", fontWeight: 700 }}>
          Entrar e voltar pra {local}
        </a>
      </p>
    );
  }
  if (!quem.pode && !quem.podeMover) {
    return (
      <p style={{ ...aviso, marginTop: 12 }}>
        Você não tem permissão pra mexer no estoque. Peça a quem administra as
        sub-permissões <strong>“Ajustar quantidade”</strong> (para corrigir o número) ou{" "}
        <strong>“Cadastrar e apagar item”</strong> (para dizer o que mora aqui).
      </p>
    );
  }

  const naTela = [...itens.filter((i) => !saiu.has(i.id)), ...entrou];

  return (
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
      {recado && (
        <p role="status" style={{ ...aviso, borderColor: "var(--primary)" }}>{recado}</p>
      )}

      <p style={{ ...aviso, background: "none", border: "none", padding: 0 }}>
        {quem.pode && quem.podeMover
          ? "Toque num item pra corrigir o número, ou use o × pra dizer que ele não é daqui."
          : quem.pode
            ? "Toque num item pra somar ou tirar. O que você mudar vale na hora."
            : "Você pode dizer o que mora aqui, mas não mexer no número."}
      </p>

      {naTela.length === 0 && (
        <p style={{ ...aviso }}>Nada guardado aqui ainda.</p>
      )}

      {naTela.map((i) => {
        const saldo = novos[i.id] ?? i.quantidade;
        return (
          <div key={i.id} style={linha}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{i.nome}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                {saldo} {i.unidade}
                {novos[i.id] !== undefined && <span style={{ color: "var(--ok, var(--primary))" }}> · atualizado</span>}
                {i.deSublugar && <span> · num sublugar</span>}
              </div>
            </div>
            {quem.pode && (
              <button onClick={() => setAberto({ ...i, quantidade: saldo })} style={botao}>
                <Icon name="pencil" size={14} color="currentColor" /> Ajustar
              </button>
            )}
            {/* Tirar daqui só vale pro que mora NESTE lugar: um item que está num
                sublugar seria "tirado" do sublugar sem a pessoa ter aberto ele —
                mudança de endereço num lugar que ela não está olhando. */}
            {quem.podeMover && !i.deSublugar && (
              <button onClick={() => void tirarDaqui(i)} title={`Tirar ${i.nome} de ${local}`}
                aria-label={`Tirar ${i.nome} de ${local}`}
                style={{ ...botao, padding: "9px 11px" }}>
                <Icon name="x" size={15} color="var(--perigo)" />
              </button>
            )}
          </div>
        );
      })}

      {quem.podeMover && (
        <button onClick={() => setGuardando(true)}
          style={{ ...botao, width: "100%", justifyContent: "center", marginTop: 4 }}>
          <Icon name="plus" size={15} color="currentColor" /> Guardar produto aqui
        </button>
      )}

      {aberto && (
        <Folha item={aberto} local={local} onFechar={() => setAberto(null)}
          onPronto={(saldo) => { setNovos((n) => ({ ...n, [aberto.id]: saldo })); setAberto(null); }} />
      )}
      {guardando && (
        <FolhaDeGuardar
          local={local} localId={localId}
          jaAqui={new Set(naTela.map((i) => i.id))}
          onFechar={() => setGuardando(false)}
          onGuardou={(novos) => {
            setEntrou((e) => [...e, ...novos]);
            setSaiu((s) => { const n = new Set(s); novos.forEach((x) => n.delete(x.id)); return n; });
            setRecado(`${fraseDeProdutos(novos.length)} agora ${novos.length === 1 ? "mora" : "moram"} em ${local}.`);
            setGuardando(false);
          }}
        />
      )}
    </div>
  );
}

/** Casca comum das duas folhas: presa embaixo, alcance do polegar, SÓLIDA. */
function Folha_({ children, onFechar }: { children: React.ReactNode; onFechar: () => void }) {
  return (
    <div className="sheet-host" onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      {/* `var(--surface)` aqui é SÓLIDO por causa do `.g-scope` no <main> da
          página (globals.css). Antes esta folha lia o token cru do `:root` —
          branco a 5% — e saía 95% transparente sobre o véu. */}
      <div className="sheet" onClick={(e) => e.stopPropagation()}
        style={{ width: "min(520px, 100%)", maxHeight: "86dvh", overflowY: "auto", background: "var(--surface)", borderRadius: "18px 18px 0 0", padding: "16px 16px calc(16px + var(--safe-b, 0px))", display: "grid", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

/** A folha do ajuste: sentido, quantidade, motivo. */
function Folha({ item, local, onFechar, onPronto }: {
  item: ItemAqui; local: string; onFechar: () => void; onPronto: (saldo: number) => void;
}) {
  const [sentido, setSentido] = useState<SentidoDoAjuste>("entrada");
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const motivos = motivosDoAjuste(sentido);

  async function enviar() {
    if (enviando) return;
    setEnviando(true); setErro(null);
    try {
      const r = await fetch("/api/estoque/ajuste-qr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, sentido, quantidade: Number(quantidade), motivo, obs: obs || undefined, local }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(String(d.detalhe ?? "Não deu pra ajustar agora.")); return; }
      onPronto(Number(d.saldo));
    } catch {
      setErro("Sem conexão agora. O ajuste NÃO foi gravado — tente de novo.");
    } finally { setEnviando(false); }
  }

  return (
    <Folha_ onFechar={onFechar}>
      <div style={{ fontWeight: 800, fontSize: 16, overflowWrap: "anywhere" }}>{item.nome}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
        Hoje: {item.quantidade} {item.unidade} · {local}
      </div>

      {/* Sentido — dois alvos grandes, porque é a decisão que muda tudo. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(["entrada", "saida"] as const).map((s) => (
          <button key={s} onClick={() => { setSentido(s); setMotivo(""); }} aria-pressed={sentido === s}
            style={{ ...botao, minHeight: "var(--tap)", justifyContent: "center",
              border: `1.5px solid ${sentido === s ? "var(--primary)" : "var(--border)"}`,
              background: sentido === s ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface-2)" }}>
            <Icon name={s === "entrada" ? "plus" : "minus"} size={15} color="currentColor" />
            {s === "entrada" ? "Entrou" : "Saiu"}
          </button>
        ))}
      </div>

      {/* Sem <label> em volta: o rótulo casaria com o PRIMEIRO controle de
          dentro (o "−") e tocar no texto tiraria uma peça. O campo leva o
          `id`, o rótulo leva o `htmlFor`. */}
      <div style={{ display: "grid", gap: 5 }}>
        <label htmlFor="aj-quantas" style={{ fontSize: 12, fontWeight: 700 }}>Quantas peças</label>
        <Contador id="aj-quantas" rotulo="Quantas peças" min={1} max={MAX_POR_AJUSTE}
          valor={Math.max(1, Math.trunc(Number(quantidade) || 0))}
          onValor={(n) => setQuantidade(String(n))} />
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          {sentido === "entrada" ? "De onde veio" : "Pra onde foi"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 6 }}>
          {motivos.map((m) => (
            <button key={m.key} onClick={() => setMotivo(m.key)} aria-pressed={motivo === m.key}
              style={{ ...botao, minHeight: "var(--tap)", justifyContent: "center", textAlign: "center",
                border: `1.5px solid ${motivo === m.key ? "var(--primary)" : "var(--border)"}`,
                background: motivo === m.key ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "var(--surface-2)" }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" style={campo} />

      {erro && <p role="alert" style={{ fontSize: 12.5, color: "var(--perigo)", margin: 0, lineHeight: 1.5 }}>{erro}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button onClick={onFechar} style={{ ...botao, minHeight: "var(--tap)", justifyContent: "center" }}>Cancelar</button>
        <button onClick={enviar} disabled={enviando || !motivo}
          style={{ ...botao, minHeight: "var(--tap)", justifyContent: "center", fontWeight: 800,
            background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", border: "none",
            opacity: enviando || !motivo ? 0.6 : 1 }}>
          {enviando ? "Gravando…" : sentido === "entrada" ? "Somar" : "Tirar"}
        </button>
      </div>
    </Folha_>
  );
}

/**
 * A folha de GUARDAR: busca no catálogo e diz que aquilo passa a morar aqui.
 *
 * A busca vai à rede a cada consulta (não há catálogo no cliente — a página é
 * cacheada e carregar 245 itens em todo scan seria pagar o dado que ninguém lê).
 * Ela só dispara com 2+ caracteres e no ENTER/botão, nunca a cada tecla: um
 * `onChange` que busca vira uma invocação por letra digitada.
 */
function FolhaDeGuardar({ local, localId, jaAqui, onFechar, onGuardou }: {
  local: string; localId: string; jaAqui: Set<string>;
  onFechar: () => void; onGuardou: (itens: ItemAqui[]) => void;
}) {
  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<ItemAqui[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [marcados, setMarcados] = useState<Map<string, ItemAqui>>(new Map());
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    const alvo = termo.trim();
    if (alvo.length < 2) { setErro("Escreva ao menos duas letras."); return; }
    setBuscando(true); setErro(null);
    try {
      const r = await fetch(`/api/estoque/consultar?busca=${encodeURIComponent(alvo)}`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(String(d.detalhe ?? "Não deu pra buscar agora.")); return; }
      setAchados((d.itens ?? []).map((i: Record<string, unknown>) => ({
        id: String(i.id), nome: String(i.nome),
        quantidade: Number(i.quantidade ?? 0), unidade: String(i.unidade ?? "un"),
      })));
    } catch {
      setErro("Sem conexão agora.");
    } finally { setBuscando(false); }
  }

  async function guardar() {
    if (enviando || marcados.size === 0) return;
    setEnviando(true); setErro(null);
    try {
      const r = await fetch("/api/estoque/locais/itens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localId, itemIds: [...marcados.keys()] }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(String(d.detalhe ?? "Não deu pra guardar agora.")); return; }
      onGuardou([...marcados.values()]);
    } catch {
      setErro("Sem conexão agora. Nada foi guardado.");
    } finally { setEnviando(false); }
  }

  return (
    <Folha_ onFechar={onFechar}>
      <div style={{ fontWeight: 800, fontSize: 16 }}>Guardar produto em {local}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
        <input value={termo} onChange={(e) => setTermo(e.target.value.slice(0, 60))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void buscar(); } }}
          placeholder="Nome ou código" aria-label="Buscar produto" style={campo} />
        <button onClick={() => void buscar()} disabled={buscando}
          style={{ ...botao, minHeight: "var(--tap)", justifyContent: "center" }}>
          {buscando ? "…" : "Buscar"}
        </button>
      </div>

      {achados !== null && achados.length === 0 && (
        <p style={{ ...aviso }}>Nenhum produto com esse nome ou código.</p>
      )}

      {achados !== null && achados.length > 0 && (
        <div style={{ display: "grid", gap: 6 }}>
          {achados.map((i) => {
            const aqui = jaAqui.has(i.id);
            const marcado = marcados.has(i.id);
            return (
              <button key={i.id} disabled={aqui} aria-pressed={marcado}
                onClick={() => setMarcados((m) => {
                  const n = new Map(m);
                  if (n.has(i.id)) n.delete(i.id); else n.set(i.id, i);
                  return n;
                })}
                style={{ ...linha, width: "100%", textAlign: "left", cursor: aqui ? "default" : "pointer",
                  opacity: aqui ? 0.55 : 1,
                  borderColor: marcado ? "var(--primary)" : "var(--border)",
                  background: marcado ? "color-mix(in srgb, var(--primary) 12%, var(--surface-2))" : "var(--surface-2)" }}>
                <Icon name={aqui ? "circle-check" : marcado ? "circle-check" : "circle"} size={18}
                  color={marcado ? "var(--primary)" : "var(--text-dim)"} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{i.nome}</span>
                  <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)" }}>
                    {i.quantidade} {i.unidade}{aqui ? " · já está aqui" : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {erro && <p role="alert" style={{ fontSize: 12.5, color: "var(--perigo)", margin: 0, lineHeight: 1.5 }}>{erro}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button onClick={onFechar} style={{ ...botao, minHeight: "var(--tap)", justifyContent: "center" }}>Cancelar</button>
        <button onClick={() => void guardar()} disabled={enviando || marcados.size === 0}
          style={{ ...botao, minHeight: "var(--tap)", justifyContent: "center", fontWeight: 800,
            background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", border: "none",
            opacity: enviando || marcados.size === 0 ? 0.6 : 1 }}>
          {enviando ? "Gravando…" : marcados.size === 0 ? "Escolha" : `Guardar ${fraseDeProdutos(marcados.size)}`}
        </button>
      </div>
    </Folha_>
  );
}

const botao: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px",
  borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--text)", fontSize: 14, fontWeight: 700, cursor: "pointer",
  minHeight: "var(--tap)",
};

const campo: React.CSSProperties = {
  minHeight: "var(--tap)", background: "var(--surface-2)", border: "1px solid var(--border)",
  borderRadius: 12, padding: "10px 12px", color: "var(--text)", fontSize: 16, width: "100%",
};

const linha: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)",
  minHeight: "var(--tap)",
};

const aviso: React.CSSProperties = {
  fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, margin: 0,
  padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)",
  background: "var(--surface-2)",
};
