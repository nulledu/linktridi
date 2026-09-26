"use client";

// Webhooks — guia completo + TESTADOR ao vivo. O usuário cola a URL (ou puxa de
// um bot), clica "Enviar teste" e vê na hora se o destino respondeu (status +
// latência). Também explica passo a passo como configurar e como receber.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import { Botao, Campo, Interruptor } from "../../ui/controles";
import { EsqueletoOuConteudo, SkeletonList } from "../../Skeleton";
import { BotaoFases, PilulaStatus, Sanfona, Visto, useFases } from "../_shared/ConfigMicro";
import { CopiarCodigo } from "./CopiarCodigo";
import { Alerta } from "../../ui/Alerta";

/** O testador só aceita endereço http(s) com domínio — o resto é recusado aqui,
 *  com o motivo, em vez de virar um "Falhou" genérico vindo do servidor. */
function validarUrl(u: string): string | undefined {
  if (!u) return "Cole a URL do webhook primeiro.";
  if (!/^https?:\/\//i.test(u)) return "A URL precisa começar com https:// (ou http://).";
  try {
    const x = new URL(u);
    if (!x.hostname.includes(".") && x.hostname !== "localhost") return "Essa URL não tem um domínio válido.";
  } catch { return "Essa URL não é válida — confira se colou inteira."; }
  return undefined;
}

export interface BotWebhook { id: string; nome: string; leadWebhook: string | null }
// Espelha Entrega de lib/tridiflow-db (server). Declarado aqui, como o
// BotWebhook acima: componente de cliente não importa módulo que abre o
// Supabase admin — nem o tipo, pra não depender do apagamento do import.
interface Entrega {
  id: number; botNome: string; escopo: "global" | "bot" | "nenhum"; destino: string;
  ok: boolean; status: number | null; erro: string | null; resposta: string | null;
  ms: number | null; tentativas: number; criadoEm: string;
}
type Resultado = { ok: boolean; status?: number; ms?: number; erro?: string; corpo?: string; enviado?: unknown; nota?: string } | null;

const PAYLOAD = `POST https://sua-url.com/webhook
Content-Type: application/json
X-TridiFlow-Event: lead

{
  "evento": "lead",
  "bot": "Meu funil",
  "bot_id": "e3f1…",
  "sessao_id": "9a2c…",
  "quando": "2026-07-13T14:22:05.000Z",
  "nome": "João da Silva",
  "email": "joao@email.com",
  "telefone": "(11) 91234-5678",
  "utm_source": "instagram",
  "utm_medium": "cpc",
  "utm_campaign": "promo-julho"
}`;

const APPS_SCRIPT = `function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const sh = SpreadsheetApp.getActiveSheet();
  sh.appendRow([new Date(), d.nome, d.email, d.telefone, d.utm_source, d.utm_campaign]);
  return ContentService.createTextOutput("ok");
}
// Publicar → Implantar como app da Web → Quem acessa: "Qualquer pessoa".
// Use a URL /exec que ele gerar (cole no bot e teste aqui).`;

const NODE = `// Node/Express — receba o lead e faça o que quiser com ele
app.post("/webhook", (req, res) => {
  const lead = req.body;              // { nome, email, telefone, utm_source, ... }
  console.log("Novo lead:", lead);
  // salve no banco, dispare e-mail, mande pro CRM…
  res.sendStatus(200);               // responda 2xx pro TridiFlow saber que deu certo
});`;

const CAMPOS: [string, string][] = [
  ["evento", `"lead" no envio real · "teste" quando você usa o botão de teste`],
  ["bot / bot_id", "nome e id do funil que gerou o lead"],
  ["sessao_id", "id único da conversa — use pra não duplicar o lead"],
  ["quando", "início da conversa (ISO 8601, UTC)"],
  ["nome, email, telefone…", "as variáveis do seu funil — mudam conforme o que o bot pergunta"],
  ["utm_source, utm_campaign…", "origem do anúncio capturada na chegada"],
];

const PASSOS: { t: string; d: React.ReactNode; icon: string }[] = [
  { icon: "world", t: "Escolha o destino", d: <>Onde os leads vão cair: <strong>n8n</strong>, <strong>Make</strong>, <strong>Zapier</strong>, <strong>Google Sheets</strong> ou o seu <strong>CRM</strong>. Todos geram uma URL de webhook (um gatilho “Webhook”/“Catch Hook”).</> },
  { icon: "link", t: "Cole a URL no bot", d: <>Abra o bot → <strong>Personalizar → Pixels → Destino dos leads</strong> e cole a URL. É por bot: cada funil manda pra onde você quiser.</> },
  { icon: "player-play", t: "Teste aqui embaixo", d: <>Cole a mesma URL no testador e clique <strong>Enviar teste</strong>. Se aparecer <strong>“Entregue”</strong>, está funcionando.</> },
  { icon: "rocket", t: "Publique o bot", d: <>O envio real só acontece com o bot <strong>publicado</strong>. A cada funil concluído, o lead é enviado automaticamente.</> },
];

export function WebhooksClient({ bots, global }: { bots: BotWebhook[]; global?: string | null }) {
  const comHook = bots.filter((b) => b.leadWebhook);
  const [url, setUrl] = useState("");
  const [erroUrl, setErroUrl] = useState<string | undefined>();
  const [sinal, setSinal] = useState(0);
  const { fase, rodar, ocupado: testando } = useFases();
  const [res, setRes] = useState<Resultado>(null);

  function testar(alvo?: string) {
    if (testando) return;
    const u = (alvo ?? url).trim();
    if (alvo) setUrl(alvo);
    const problema = validarUrl(u);
    // `sinal` sobe a cada tentativa: o mesmo erro repetido treme de novo.
    if (problema) { setErroUrl(problema); setSinal((s) => s + 1); return; }
    setErroUrl(undefined);
    setRes(null);
    void rodar(async () => {
      try {
        const r = await fetch("/api/tridiflow/webhook-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: u }) });
        const j = (await r.json()) as Resultado;
        setRes(j);
        if (j?.ok) return true;
        // Console do navegador também: quem está com o DevTools aberto vê o
        // motivo sem depender do painel — era a queixa "não dá pra ver o erro".
        console.error("[tridiflow] teste de webhook falhou", { url: u, ...j });
        toast.erro(j?.erro || `Destino respondeu HTTP ${j?.status ?? "?"}.`);
        return false;
      } catch (e) {
        console.error("[tridiflow] teste de webhook não executou", e);
        setRes({ ok: false, erro: "Não foi possível executar o teste." });
        return false;
      }
    });
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Webhooks</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>Ao concluir um funil, o TridiFlow envia o lead (respostas + UTMs) por POST pra sua URL. Aqui você configura e <strong>testa na hora</strong>.</p>
      </div>

      {/* Destino global — vale pra TODO lead, independente do que o bot tem */}
      {global && (
        <Cartao>
          <Titulo icon="world">Destino de todos os leads</Titulo>
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "2px 0 10px", lineHeight: 1.55 }}>
            Enquanto a distribuição está centralizada, <strong>todo lead</strong> (fluxo e página) é enviado pra esta URL — além do webhook do próprio bot, se houver.
            Aqui o corpo é o da distribuição, não o payload plano de baixo: <code>customer_name</code>, <code>customer_phone</code>, <code>origem</code> e <code>produto</code> (o nome do funil), com <code>Authorization: Bearer</code>.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 13px", borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <code style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: "var(--text-dim)", wordBreak: "break-all" }}>{global}</code>
            <Botao icone="send" onClick={() => testar(global)} disabled={testando}>
              Testar
            </Botao>
          </div>
        </Cartao>
      )}

      {/* Diário de entrega — a resposta pra "foi enviado ou não?" */}
      <Entregas />

      {/* Passo a passo */}
      <Cartao>
        <Sanfona abertaInicial titulo={<Titulo icon="list-check">Como fazer funcionar — 4 passos</Titulo>}>
        <div style={{ display: "grid", gap: 10 }}>
          {PASSOS.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: "none", width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary-texto, var(--primary))", fontSize: 13, fontWeight: 800 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 700, color: "var(--text)" }}><Icon name={p.icon} size={15} color="var(--primary-texto)" />{p.t}</div>
                <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, marginTop: 2 }}>{p.d}</div>
              </div>
            </div>
          ))}
        </div>
        </Sanfona>
      </Cartao>

      {/* Testador */}
      <Cartao>
        <Titulo icon="player-play">Testar um webhook</Titulo>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "2px 0 12px" }}>Enviamos um POST de exemplo pra URL e mostramos a resposta. Não precisa publicar nada pra testar.</p>
        <Campo label="URL do webhook" erro={erroUrl} sinal={sinal}>
          {(id) => (
            <div className="tfm-grupo">
              <input id={id} className="tfm-entrada" data-mono="1" value={url} placeholder="https://sua-url.com/webhook" spellCheck={false}
                inputMode="url" autoCapitalize="none" autoCorrect="off" aria-invalid={erroUrl ? true : undefined}
                onChange={(e) => { setUrl(e.target.value); if (erroUrl) setErroUrl(undefined); }}
                onKeyDown={(e) => { if (e.key === "Enter") testar(); }} />
              <BotaoFases fase={fase} onClick={() => testar()} icone="send" enviando="Enviando" feito="Entregue" erro="Falhou o teste">Enviar teste</BotaoFases>
            </div>
          )}
        </Campo>

        {comHook.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Puxar de um bot:</span>
            {comHook.map((b) => (
              <button key={b.id} onClick={() => testar(b.leadWebhook!)} title={b.leadWebhook!} className="ui-toque"
                style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", cursor: "pointer", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.nome}</button>
            ))}
          </div>
        )}

        {res && (
          <div className={res.ok ? "tfm-surge" : "tfm-surge tfm-treme"} role="status" style={{ marginTop: 12, display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderRadius: 12,
            background: res.ok ? "color-mix(in srgb, var(--ok) 12%, var(--surface-2))" : "color-mix(in srgb, var(--perigo) 12%, var(--surface-2))",
            border: `1px solid ${res.ok ? "color-mix(in srgb,var(--ok) 40%,var(--border))" : "color-mix(in srgb,var(--perigo) 40%,var(--border))"}` }}>
            {/* Sucesso: o visto se DESENHA (é o momento que a pessoa esperava). */}
            {res.ok
              ? <span style={{ flex: "none", width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--ok)" }}><Visto size={14} color="#fff" /></span>
              : <Icon name="alert-triangle" size={18} color="var(--perigo)" />}
            <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.5, minWidth: 0 }}>
              {res.ok
                ? <><strong style={{ color: "var(--ok)" }}>Entregue.</strong> O destino respondeu <strong>HTTP {res.status}</strong>{res.ms != null && <> em <strong>{res.ms} ms</strong></>}. {res.nota ?? "Seu webhook está funcionando."}</>
                : <><strong style={{ color: "var(--perigo)" }}>{res.status != null && res.status < 400 ? "Não aceito." : "Falhou."}</strong> {res.erro || <>O destino respondeu <strong>HTTP {res.status}</strong> (esperado 2xx).</>}</>}
              {res.corpo && <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 5, fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-word" }}>resposta: {res.corpo}</div>}
              {/* O que FOI enviado, ao lado do que voltou: sem isso, "campo X é
                  obrigatório" não diz se o campo saiu com nome errado ou vazio. */}
              {res.enviado != null && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 11.5, color: "var(--text-dim)", cursor: "pointer" }}>ver o que enviamos</summary>
                  <pre style={{ fontSize: 11, color: "var(--text-dim)", margin: "5px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "ui-monospace, Menlo, monospace" }}>{JSON.stringify(res.enviado, null, 2)}</pre>
                </details>
              )}
            </div>
          </div>
        )}
      </Cartao>

      {/* Estado por bot */}
      <Cartao>
        <Titulo icon="message-chatbot">Webhooks por bot</Titulo>
        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "2px 0 12px" }}>{comHook.length} de {bots.length} bot(s) com webhook configurado.</p>
        {bots.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>Nenhum bot ainda.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bots.map((b) => (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
                <Icon name="message-chatbot" size={16} color="var(--text-dim)" />
                <span style={{ flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{b.nome}</span>
                {b.leadWebhook ? (
                  <>
                    <code style={{ fontSize: 11.5, color: "var(--text-dim)", maxWidth: "min(240px, 100%)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.leadWebhook}</code>
                    <Botao icone="send" onClick={() => testar(b.leadWebhook!)} disabled={testando}>
                      Testar
                    </Botao>
                  </>
                ) : (
                  <>
                    <PilulaStatus estado="neutro" icone="circle">sem webhook</PilulaStatus>
                    <Link href={`/tridiflow/${b.id}`} style={{ display: "inline-flex", alignItems: "center", minHeight: "var(--tap)", padding: "0 6px", fontSize: 12, fontWeight: 700, color: "var(--primary-texto, var(--primary))", textDecoration: "none" }}>Configurar</Link>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Cartao>

      {/* Payload */}
      <Cartao>
        <Sanfona titulo={<Titulo icon="code">O que o TridiFlow envia</Titulo>}>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 12px" }}>Um POST com JSON. Os campos <code>nome/email/telefone…</code> são as variáveis do seu funil (variam conforme o bot). Responda <strong>2xx</strong> pra confirmar o recebimento.</p>
        <CopiarCodigo codigo={PAYLOAD} />
        <div style={{ marginTop: 14, display: "grid", gap: 7 }}>
          {CAMPOS.map(([campo, desc]) => (
            <div key={campo} style={{ display: "flex", gap: 10, fontSize: 12.5, lineHeight: 1.5, flexWrap: "wrap" }}>
              <code style={{ flex: "none", minWidth: 150, color: "var(--primary-texto, var(--primary))", fontWeight: 700 }}>{campo}</code>
              <span style={{ color: "var(--text-dim)" }}>{desc}</span>
            </div>
          ))}
        </div>
        </Sanfona>
      </Cartao>

      {/* Como receber */}
      <Cartao>
        <Sanfona titulo={<Titulo icon="download">Como receber no destino</Titulo>}>
        <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.6 }}>
          <strong>n8n / Make / Zapier:</strong> crie um gatilho <em>Webhook</em> (no Zapier, “Catch Hook”), copie a URL que ele gera, cole no seu bot e teste aqui. Depois é só mapear os campos (nome, email, telefone, utm…) para o próximo passo.
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "16px 0 8px" }}>Google Sheets (Apps Script)</div>
        <CopiarCodigo codigo={APPS_SCRIPT} />
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "16px 0 8px" }}>Servidor próprio (Node/Express)</div>
        <CopiarCodigo codigo={NODE} />
        </Sanfona>
      </Cartao>
    </div>
  );
}

// ── Diário de entrega ────────────────────────────────────────────────────────
// Uma linha por tentativa de envio: quem recebeu, o que respondeu e por quê
// falhou. É o que responde "o webhook foi enviado?" sem abrir log de servidor.
function Entregas() {
  const [itens, setItens] = useState<Entrega[] | null>(null);
  const [temTabela, setTemTabela] = useState(true);
  const [soFalhas, setSoFalhas] = useState(false);
  const [carregando, setCarregando] = useState(false);
  // Ids que CHEGARAM no último "Atualizar". A primeira carga entra escalonada
  // inteira (fila); depois, só a linha nova ganha a entrada do diário — as que
  // já estavam na tela ficam paradas.
  const [novos, setNovos] = useState<Set<number>>(() => new Set());
  const vistos = useRef<Set<number> | null>(null);

  const carregar = useCallback(async (falhas: boolean) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/tridiflow/entregas?limite=60${falhas ? "&falhas=1" : ""}`);
      const j = (await r.json()) as { tabela?: boolean; entregas?: Entrega[]; error?: string };
      const lista = j.entregas ?? [];
      const antes = vistos.current;
      setNovos(antes ? new Set(lista.filter((e) => !antes.has(e.id)).map((e) => e.id)) : new Set());
      vistos.current = new Set(lista.map((e) => e.id));
      setTemTabela(j.tabela !== false);
      setItens(lista);
    } catch {
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(soFalhas); }, [carregar, soFalhas]);

  const falhas = (itens ?? []).filter((e) => !e.ok).length;

  return (
    <Cartao>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}><Titulo icon="history">Últimos envios</Titulo></div>
        <Interruptor ligado={soFalhas} onChange={setSoFalhas} rotulo="Só falhas" cor="var(--perigo)" tamanho="sm" />
        <Botao icone="refresh" onClick={() => carregar(soFalhas)} carregando={carregando}>
          Atualizar
        </Botao>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "4px 0 12px", lineHeight: 1.55 }}>
        Cada linha é uma tentativa real de envio, com a resposta do destino. O envio nunca aparece pro visitante — é aqui que dá pra ver se o lead saiu, e o que voltou quando não saiu.
      </p>

      <EsqueletoOuConteudo pronto={!temTabela || itens !== null} esqueleto={<SkeletonList rows={3} />}>
      {!temTabela ? (
        <Aviso perigo>Diário ainda não existe no banco. Rode <code>supabase/tridiflow-entregas.sql</code> no Supabase e recarregue — a partir daí todo envio fica registrado.</Aviso>
      ) : itens === null ? null : itens.length === 0 ? (
        <Aviso>{soFalhas ? "Nenhuma falha registrada." : "Nenhum envio registrado ainda. Um lead precisa CONCLUIR o funil (ou o formulário da página ser enviado) pra aparecer aqui."}</Aviso>
      ) : (
        <>
          {!soFalhas && (
            <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "0 0 10px" }}>
              {itens.length} envio(s) · {falhas === 0 ? "nenhuma falha" : <strong style={{ color: "var(--perigo)" }}>{falhas} com falha</strong>}
            </p>
          )}
          <div className="tfm-fila" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(() => {
              let n = 0;
              return itens.map((e, i) => {
                const nova = novos.has(e.id);
                return <LinhaEntrega key={e.id} e={e} nova={nova} i={nova ? n++ : i} />;
              });
            })()}
          </div>
        </>
      )}
      </EsqueletoOuConteudo>
    </Cartao>
  );
}

function LinhaEntrega({ e, nova, i }: { e: Entrega; nova?: boolean; i: number }) {
  // Chegou (2xx) mas o destino não aceitou — duplicado, sem responsável… não é
  // "Falhou" (isso é problema de entrega) nem "Entregue" (o lead não entrou).
  const naoAceito = !e.ok && e.status != null && e.status < 400;
  const rotulo = e.ok ? "Entregue" : e.escopo === "nenhum" ? "Não enviado" : naoAceito ? "Não aceito" : "Falhou";
  const icone = e.ok ? "circle-check" : e.escopo === "nenhum" ? "alert-triangle" : "alert-triangle";
  const quando = new Date(e.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className={nova ? "tfm-nova" : undefined} style={{ ["--i" as string]: Math.min(i, 12), padding: "10px 13px", borderRadius: 11, background: "var(--surface-2)", border: `1px solid ${e.ok ? "var(--border)" : "color-mix(in srgb, var(--perigo) 35%, var(--border))"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <PilulaStatus estado={e.ok ? "ok" : naoAceito || e.escopo === "nenhum" ? "pendente" : "erro"} icone={icone} tam="md">{rotulo}</PilulaStatus>
        {e.status != null && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>HTTP {e.status}</span>}
        {e.ms != null && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{e.ms} ms</span>}
        {e.tentativas > 1 && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{e.tentativas} tentativas</span>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{quando}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 6, fontSize: 12, color: "var(--text-dim)" }}>
        <span style={{ fontWeight: 700, color: "var(--text)" }}>{e.botNome}</span>
        <span style={{ padding: "1px 7px", borderRadius: 999, border: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
          {e.escopo === "global" ? "destino global" : e.escopo === "bot" ? "webhook do bot" : "sem destino"}
        </span>
        {e.destino !== "-" && <code style={{ fontSize: 11, wordBreak: "break-all", minWidth: 0 }}>{e.destino}</code>}
      </div>
      {(e.erro || e.resposta) && (
        <div style={{ marginTop: 6, fontSize: 11.5, color: e.ok ? "var(--text-dim)" : "var(--perigo)", fontFamily: "ui-monospace, Menlo, monospace", wordBreak: "break-word", lineHeight: 1.45 }}>
          {e.erro ?? e.resposta}
        </div>
      )}
    </div>
  );
}

// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
function Aviso({ children, perigo }: { children: React.ReactNode; perigo?: boolean }) {
  return <Alerta tom={perigo ? "perigo" : "neutro"}>{children}</Alerta>;
}

function Cartao({ children }: { children: React.ReactNode }) {
  return <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, marginBottom: 16 }}>{children}</div>;
}
function Titulo({ icon, children }: { icon: string; children: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 800, color: "var(--text)" }}><Icon name={icon} size={17} color="var(--primary-texto)" />{children}</div>;
}
