"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import { PageHead } from "../ui/mobile";
import { Botao, BotaoIcone, Campo, Caixa } from "../ui/controles";
import { BotaoPublicar } from "../ui/BotaoPublicar";
import { Alerta } from "../ui/Alerta";
import { usePollComRecuo } from "../ui/usePoll";
import { PAINEIS_VALIDOS, GIROS_VALIDOS, type TipoComando } from "@/lib/tv-frota";

/**
 * Console da frota de TV box.
 *
 * A tela tem DOIS rostos, e essa é a decisão de desenho principal:
 *
 * • Frota vazia → vira um guia de instalação, com os três passos numerados. Não
 *   adianta mostrar "Atualizar / Reiniciar / Puxar log" quando não existe
 *   nenhuma TV: botão que não faz nada ensina a pessoa a desconfiar da tela.
 * • Frota montada → é um painel de operação: o resumo em cima (quantas online,
 *   qual versão, quantas atrasadas), os aparelhos em cartão, e as ações em
 *   massa junto do número que elas afetam.
 *
 * Superfície é `.glass`/`.glass-spec` (a receita de vidro da fundação) e todo
 * controle vem de `ui/controles`. A primeira versão desta tela inventava
 * classes que não existem no projeto (`ui-card`, `ui-input`) — por isso
 * aparecia sem cartão nenhum, tudo solto no preto.
 */

interface Dispositivo {
  id: string; nome: string; ativo: boolean;
  versaoCode: number | null; versaoNome: string | null; modelo: string | null; ip: string | null;
  vistoEm: string | null; online: boolean; codigoAtivacao: string | null; criadoEm: string;
}
interface Versao {
  id: string; version_code: number; version_name: string; url: string; sha256: string;
  notas: string | null; obrigatoria: boolean; publicada: boolean; por_nome: string | null; criada_em: string;
}
interface Dados { dispositivos: Dispositivo[]; versoes: Versao[]; comandos: unknown[] }

const COMANDOS: { tipo: TipoComando; label: string; icone: string }[] = [
  { tipo: "atualizar_agora", label: "Atualizar", icone: "upload" },
  { tipo: "reiniciar", label: "Reiniciar", icone: "refresh" },
  { tipo: "abrir_painel", label: "Trocar tela", icone: "device-tv" },
  { tipo: "girar", label: "Girar", icone: "rotate" },
  { tipo: "logs", label: "Puxar log", icone: "file-text" },
];

export function FrotaClient() {
  const [d, setD] = useState<Dados>({ dispositivos: [], versoes: [], comandos: [] });
  const [erro, setErro] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | undefined>();
  const [carregou, setCarregou] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [codigoNovo, setCodigoNovo] = useState<{ nome: string; codigo: string } | null>(null);
  // Os perfis publicados no ERP — para o comando "trocar de tela" oferecer os
  // DESENHOS reais (Comercial, Produção…), não só os painéis crus. É a forma
  // como a parede é montada de verdade; sem a lista, trocar remotamente seria
  // adivinhar o id de cor.
  const [perfis, setPerfis] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c) => setPerfis(Array.isArray(c?.perfis) ? c.perfis.map((p: { id: string; nome: string }) => ({ id: p.id, nome: p.nome })) : []))
      .catch(() => setPerfis([]));
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/tv", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setD((await r.json()) as Dados);
      setErro(null); setAtualizadoEm(new Date().toISOString());
    } catch { setErro("Não consegui carregar a frota."); }
    finally { setCarregou(true); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  usePollComRecuo(() => { carregar(); }, 20_000);

  const versaoAtual = d.versoes.find((v) => v.publicada);
  const tvs = d.dispositivos;
  const online = tvs.filter((t) => t.online).length;
  const pendentes = tvs.filter((t) => t.codigoAtivacao).length;
  const desatualizadas = versaoAtual
    ? tvs.filter((t) => t.versaoCode != null && t.versaoCode < versaoAtual.version_code).length
    : 0;
  const vazia = carregou && tvs.length === 0;

  async function acao(body: Record<string, unknown>) {
    const r = await fetch("/api/tv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    await carregar();
    return { ok: r.ok, j };
  }

  async function registrar(nome: string) {
    const { ok, j } = await acao({ acao: "registrar", nome });
    if (ok && j.dispositivo) {
      const disp = j.dispositivo as { nome: string; codigo_ativacao: string };
      setCodigoNovo({ nome: disp.nome, codigo: disp.codigo_ativacao });
      setCadastrando(false);
    }
  }

  async function mandarComando(tipo: TipoComando, alvo: { id?: string; todos?: boolean }) {
    const args: Record<string, unknown> = {};
    if (tipo === "abrir_painel") {
      // Oferece os DESENHOS publicados (perfis) e, como reserva, os painéis
      // crus. Digitar o número é o suficiente pelo teclado do console.
      const linhas = [
        ...perfis.map((p, i) => `${i + 1}. ${p.nome}  (perfil)`),
        ...PAINEIS_VALIDOS.map((p, i) => `${perfis.length + i + 1}. ${p}  (painel)`),
      ];
      const escolha = window.prompt(`O que mostrar nesta tela?\n\n${linhas.join("\n")}\n\nDigite o número:`, "1");
      const n = Number(escolha);
      if (!Number.isInteger(n) || n < 1 || n > perfis.length + PAINEIS_VALIDOS.length) return;
      if (n <= perfis.length) args.perfil = perfis[n - 1].id;
      else args.painel = PAINEIS_VALIDOS[n - perfis.length - 1];
    }
    if (tipo === "girar") {
      const g = window.prompt(`Girar a tela para quantos graus? (${GIROS_VALIDOS.join(", ")})\n\n0 = deitada · 90 = em pé`, "90");
      const graus = Number(g);
      if (!GIROS_VALIDOS.includes(graus as never)) return;
      args.graus = graus;
    }
    const { ok, j } = await acao({ acao: "comando", tipo, args, ...alvo });
    if (!ok) alert("Falha ao enviar: " + (j.error ?? ""));
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", paddingBottom: 40 }}>
      <PageHead
        title="Frota de TVs"
        sub="Atualização e comando remoto das TV box"
        updatedAt={atualizadoEm}
        right={!vazia ? <Botao variante="primario" icone="plus" onClick={() => setCadastrando(true)}>Nova TV</Botao> : undefined}
      />

      {erro && (
        <Alerta tom="perigo" style={{ marginBottom: 16 }}>{erro}</Alerta>
      )}

      {codigoNovo && <CartaoCodigo dado={codigoNovo} aoFechar={() => setCodigoNovo(null)} />}

      {vazia ? (
        <PrimeiraTv aoCadastrar={registrar} />
      ) : (
        <>
          {/* Resumo: o estado da frota antes de qualquer ação. */}
          {tvs.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12, marginBottom: 16 }}>
              <Resumo icone="device-tv" rotulo="TVs na frota" valor={String(tvs.length)} />
              <Resumo icone="circle-check" rotulo="online agora" valor={String(online)} cor={online > 0 ? "var(--ok)" : undefined}
                nota={online < tvs.length ? `${tvs.length - online} sem falar` : "todas respondendo"} />
              <Resumo icone="upload" rotulo="versão da frota"
                valor={versaoAtual ? `v${versaoAtual.version_name}` : "—"}
                nota={desatualizadas > 0 ? `${desatualizadas} atrasada${desatualizadas > 1 ? "s" : ""}` : versaoAtual ? "todas em dia" : "nada publicado"}
                cor={desatualizadas > 0 ? "var(--atencao)" : undefined} />
              {pendentes > 0 && <Resumo icone="clock" rotulo="aguardando" valor={String(pendentes)} cor="var(--atencao)" nota="aguardando ativação" />}
            </div>
          )}

          <SecaoVersao versaoAtual={versaoAtual} versoes={d.versoes} onPublicado={carregar} />

          {/* Ações em massa: moram JUNTO do número que elas afetam. */}
          {tvs.length > 0 && (
            <section className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-lg)", marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>Frota inteira</h2>
                <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
                  cai nas {tvs.filter((t) => t.ativo).length} TVs ativas
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {COMANDOS.map((c) => (
                  <Botao key={c.tipo} icone={c.icone} tamanho="sm" onClick={() => mandarComando(c.tipo, { todos: true })}>
                    {c.label}
                  </Botao>
                ))}
              </div>
            </section>
          )}

          <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em", margin: "0 0 12px" }}>Aparelhos</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 330px), 1fr))", gap: 12 }}>
            {tvs.map((tv) => (
              <TvCard key={tv.id} tv={tv} versaoAtual={versaoAtual} onComando={mandarComando} onAcao={acao} />
            ))}
          </div>
        </>
      )}

      {cadastrando && <ModalCadastro aoCadastrar={registrar} aoFechar={() => setCadastrando(false)} />}
    </div>
  );
}

/** Um número do resumo. O número manda, o rótulo é legenda. */
function Resumo({ icone, rotulo, valor, nota, cor }: {
  icone: string; rotulo: string; valor: string; nota?: string; cor?: string;
}) {
  return (
    <div className="glass" style={{ padding: "14px 16px", borderRadius: "var(--r-md)", display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
      <span style={{ width: 40, height: 40, borderRadius: 13, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${cor ?? "var(--text)"} 12%, transparent)` }}>
        <Icon name={icone} size={20} color={cor ?? "var(--text-dim)"} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em", color: cor ?? "var(--text)", fontVariantNumeric: "tabular-nums" }}>{valor}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {nota ?? rotulo}
        </div>
      </div>
    </div>
  );
}

/**
 * Frota vazia — a tela vira um guia. Três passos numerados, com o que a pessoa
 * precisa fazer FORA daqui (provisionar a caixa) dito de forma explícita,
 * porque é exatamente onde ela vai travar.
 */
function PrimeiraTv({ aoCadastrar }: { aoCadastrar: (nome: string) => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = () => { if (!nome.trim()) return; setEnviando(true); void aoCadastrar(nome.trim()).finally(() => setEnviando(false)); };
  const passos = [
    { n: 1, t: "Instale o app na TV box", d: "TridiPaineis v1.3 ou mais novo, pelo pen drive." },
    { n: 2, t: "Provisione como device owner", d: "É o que permite atualizar sozinha, sem root. Numa TV recém-resetada, por USB: adb shell dpm set-device-owner com.tridi.tv/com.tridi.tv.core.kiosk.AdminReceiver" },
    { n: 3, t: "Cadastre a TV aqui e ative", d: "Você recebe um código de 8 caracteres pra digitar no app da caixa, em Configurar." },
  ];
  return (
    <section className="glass glass-spec" style={{ padding: "26px 24px", borderRadius: "var(--r-lg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ width: 46, height: 46, borderRadius: 15, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 16%, transparent)" }}>
          <Icon name="device-tv" size={24} color="var(--primary-texto)" />
        </span>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Sua frota está vazia</h2>
          <p style={{ fontSize: 14, color: "var(--text-dim)", marginTop: 2 }}>
            Três passos e a parede passa a se atualizar sozinha, de qualquer WiFi.
          </p>
        </div>
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: "20px 0 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {passos.map((p) => (
          <li key={p.n} style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
            <span style={{ width: 26, height: 26, flex: "none", borderRadius: 999, display: "grid", placeItems: "center", background: "var(--surface-2)", fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{p.n}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{p.t}</div>
              <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, wordBreak: "break-word" }}>{p.d}</div>
            </div>
          </li>
        ))}
      </ol>

      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Campo label="Nome da primeira TV">
            {(id) => (
              <input id={id} value={nome} onChange={(e) => setNome(e.target.value)}
                placeholder="TV Produção 1" onKeyDown={(e) => e.key === "Enter" && enviar()} />
            )}
          </Campo>
        </div>
        <Botao variante="primario" icone="plus" carregando={enviando} disabled={!nome.trim()} onClick={enviar}>
          Gerar código
        </Botao>
      </div>
    </section>
  );
}

/** O código de ativação — o que a pessoa precisa levar até a TV. */
function CartaoCodigo({ dado, aoFechar }: { dado: { nome: string; codigo: string }; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <section className="glass glass-spec" style={{ padding: "20px 22px", borderRadius: "var(--r-lg)", marginBottom: 16, border: "1px solid color-mix(in srgb, var(--ok) 40%, transparent)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span style={{ width: 40, height: 40, borderRadius: 13, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--ok) 15%, transparent)" }}>
          <Icon name="circle-check" size={21} color="var(--ok)" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{dado.nome} cadastrada</div>
          <div style={{ fontSize: 13.5, color: "var(--text-dim)", marginTop: 2 }}>
            No app da TV: segure OK → Configurar → “Código da frota”.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: ".16em", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{dado.codigo}</span>
            <Botao tamanho="sm" icone={copiado ? "circle-check" : "copy"}
              onClick={() => { navigator.clipboard?.writeText(dado.codigo); setCopiado(true); }}>
              {copiado ? "Copiado" : "Copiar"}
            </Botao>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 10 }}>Uso único — some da lista assim que a TV ativar.</div>
        </div>
        <BotaoIcone icone="circle-x" titulo="Fechar" tamanho="sm" onClick={aoFechar} />
      </div>
    </section>
  );
}

function ModalCadastro({ aoCadastrar, aoFechar }: { aoCadastrar: (n: string) => Promise<void>; aoFechar: () => void }) {
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = () => { if (!nome.trim()) return; setEnviando(true); void aoCadastrar(nome.trim()).finally(() => setEnviando(false)); };
  return (
    <>
      <div className="ui-scrim" onClick={aoFechar} />
      <div className="apple-modal glass glass-spec" role="dialog" aria-modal="true"
        style={{ position: "fixed", zIndex: "var(--z-modal, 1300)", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: "min(420px, 92vw)", padding: 22, borderRadius: "var(--r-lg)" }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 4 }}>Nova TV</h2>
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", marginBottom: 16 }}>
          Você recebe um código pra digitar no app da caixa.
        </p>
        <Campo label="Nome da TV">
          {(id) => (
            <input id={id} autoFocus value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="TV Produção 1" onKeyDown={(e) => e.key === "Enter" && enviar()} />
          )}
        </Campo>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
          <Botao variante="sutil" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" icone="plus" carregando={enviando} disabled={!nome.trim()} onClick={enviar}>Gerar código</Botao>
        </div>
      </div>
    </>
  );
}

function TvCard({ tv, versaoAtual, onComando, onAcao }: {
  tv: Dispositivo; versaoAtual: Versao | undefined;
  onComando: (t: TipoComando, alvo: { id?: string }) => void;
  onAcao: (b: Record<string, unknown>) => Promise<{ ok: boolean; j: Record<string, unknown> }>;
}) {
  const [mais, setMais] = useState(false);
  const desatualizada = versaoAtual && tv.versaoCode != null && tv.versaoCode < versaoAtual.version_code;
  const aguardando = !!tv.codigoAtivacao;
  const cor = !tv.ativo ? "var(--text-dim)" : aguardando ? "var(--atencao)" : tv.online ? "var(--ok)" : "var(--atencao)";
  const status = !tv.ativo ? "Desativada" : aguardando ? "Aguardando ativação" : tv.online ? "Online" : "Offline";

  return (
    <div className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-lg)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
          <Icon name="device-tv" size={20} color={cor} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 16.5, fontWeight: 800, letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tv.nome}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: cor, marginTop: 2 }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: cor, flex: "none" }} />
            {status}
            {tv.vistoEm && !aguardando && <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>· {agoLabel(tv.vistoEm)}</span>}
          </div>
        </div>
      </div>

      {aguardando ? (
        <div style={{ padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--surface)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: ".14em", fontVariantNumeric: "tabular-nums" }}>{tv.codigoAtivacao}</span>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>digite na TV</span>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--text-dim)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span>Versão <b style={{ color: "var(--text)" }}>{tv.versaoNome ?? "—"}</b></span>
          {desatualizada && (
            <span style={{ fontSize: 11.5, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: "color-mix(in srgb, var(--atencao) 18%, transparent)", color: "var(--atencao)" }}>
              atrasada
            </span>
          )}
          {tv.modelo && <span>· {tv.modelo}</span>}
        </div>
      )}

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: "auto" }}>
        <Botao tamanho="sm" icone="upload" disabled={aguardando} onClick={() => onComando("atualizar_agora", { id: tv.id })}>Atualizar</Botao>
        <Botao tamanho="sm" icone="refresh" disabled={aguardando} onClick={() => onComando("reiniciar", { id: tv.id })}>Reiniciar</Botao>
        <BotaoIcone icone="dots-vertical" titulo="Mais ações" tamanho="sm" onClick={() => setMais((v) => !v)} />
      </div>

      {mais && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 11 }}>
          <Botao tamanho="sm" variante="sutil" icone="device-tv" disabled={aguardando} onClick={() => onComando("abrir_painel", { id: tv.id })}>Trocar tela</Botao>
          <Botao tamanho="sm" variante="sutil" icone="rotate" disabled={aguardando} onClick={() => onComando("girar", { id: tv.id })}>Girar</Botao>
          <Botao tamanho="sm" variante="sutil" icone="file-text" disabled={aguardando} onClick={() => onComando("logs", { id: tv.id })}>Log</Botao>
          <Botao tamanho="sm" variante="sutil" onClick={async () => {
            const nome = window.prompt("Novo nome:", tv.nome);
            if (nome?.trim()) await onAcao({ acao: "renomear", id: tv.id, nome: nome.trim() });
          }}>Renomear</Botao>
          <Botao tamanho="sm" variante="perigo" icone="trash" onClick={async () => {
            if (confirm(`Remover ${tv.nome} da frota?`)) await onAcao({ acao: "remover", id: tv.id });
          }}>Remover</Botao>
        </div>
      )}
    </div>
  );
}

function SecaoVersao({ versaoAtual, versoes, onPublicado }: {
  versaoAtual: Versao | undefined; versoes: Versao[]; onPublicado: () => void;
}) {
  const [abre, setAbre] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [versionCode, setVersionCode] = useState("");
  const [versionName, setVersionName] = useState("");
  const [obrigatoria, setObrigatoria] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function publicar() {
    if (!file || !versionCode || !versionName) { setMsg("Escolha o APK e informe versionCode e versionName."); return false; }
    setMsg("Enviando APK…");
    try {
      const [urlResp, sha] = await Promise.all([
        fetch("/api/tv/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => r.json()),
        sha256Arquivo(file),
      ]);
      if (!urlResp.signedUrl) throw new Error(urlResp.dica || urlResp.detail || "sem URL de upload");
      const up = await fetch(urlResp.signedUrl, { method: "PUT", headers: { "Content-Type": "application/vnd.android.package-archive", "x-upsert": "true" }, body: file });
      if (!up.ok) throw new Error("upload falhou (" + up.status + ")");
      setMsg("Publicando…");
      const r = await fetch("/api/tv", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "publicar_versao", versionCode: Number(versionCode), versionName, url: urlResp.publicUrl, sha256: sha, obrigatoria }) });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || "falha ao publicar"));
      setMsg("Publicado — a frota atualiza no próximo ciclo.");
      setFile(null); setVersionCode(""); setVersionName(""); setObrigatoria(false); setAbre(false);
      onPublicado();
      return true;
    } catch (e) { setMsg("Erro: " + (e as Error).message); return false; }
  }

  return (
    <section className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-lg)", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ width: 38, height: 38, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 14%, transparent)" }}>
          <Icon name="upload" size={19} color="var(--primary-texto)" />
        </span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>Versão da frota</h2>
          <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
            {versaoAtual
              ? <>v{versaoAtual.version_name} · code {versaoAtual.version_code}{versaoAtual.obrigatoria ? " · obrigatória" : ""}</>
              : "Nada publicado — as TVs ficam na versão instalada à mão."}
          </div>
        </div>
        <Botao tamanho="sm" variante={abre ? "sutil" : "secundario"} onClick={() => setAbre((v) => !v)}>
          {abre ? "Fechar" : "Publicar nova"}
        </Botao>
      </div>

      {abre && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <Campo label="Arquivo do APK" dica="Assinado com a mesma keystore interna, senão a TV recusa o update.">
            {(id) => <input id={id} type="file" accept=".apk,application/vnd.android.package-archive" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
          </Campo>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
            <Campo label="versionCode" dica="Tem de ser MAIOR que o instalado.">
              {(id) => <input id={id} inputMode="numeric" placeholder="3" value={versionCode} onChange={(e) => setVersionCode(e.target.value.replace(/\D/g, ""))} />}
            </Campo>
            <Campo label="versionName">
              {(id) => <input id={id} placeholder="1.3" value={versionName} onChange={(e) => setVersionName(e.target.value)} />}
            </Campo>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, minHeight: "var(--tap, 44px)" }}>
            <Caixa marcado={obrigatoria} onChange={(marc) => setObrigatoria(marc)} />
            Obrigatória — instala assim que baixa
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <BotaoPublicar icone="upload" onPublicar={publicar}>Publicar versão</BotaoPublicar>
            {msg && <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{msg}</span>}
          </div>
        </div>
      )}

      {versoes.length > 1 && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--text-dim)" }}>
          Antes: {versoes.slice(1, 5).map((v) => `v${v.version_name}`).join(" · ")}
        </div>
      )}
    </section>
  );
}

async function sha256Arquivo(file: File): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function agoLabel(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}
