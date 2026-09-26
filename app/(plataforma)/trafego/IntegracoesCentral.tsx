"use client";

// Tráfego Pago — Central de Integrações. Cards por plataforma com status real
// (Meta = contas conectadas; demais = "pronto" quando houver credenciais, senão
// "requer credenciais"). Modal de conexão premium. WhatsApp/Webhooks/Pixel
// levam pras telas já existentes. OAuth de Google/TikTok/Kwai/Taboola ativa
// quando as credenciais forem configuradas.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { Alerta } from "../ui/Alerta";
import { Marca } from "../Marca";
import { temLogo } from "@/lib/marcas";
import { toast } from "../Toast";
import { MetaAdsPanel } from "../administracao/MetaAdsPanel";
import { ContasAnuncioView } from "./ContasAnuncioView";
import { Cartao, Selo } from "./TfKit";
import { Botao, BotaoIcone } from "../ui/controles";

// Mensagem do erro de OAuth do Facebook — ACIONÁVEL, não genérica.
// O callback já captura o motivo real da Meta, mas a tela mostrava sempre
// "Não foi possível conectar o Meta": a pessoa via a falha e não tinha ideia
// do que fazer (foi o caso de um perfil que conectou e a conta nunca apareceu —
// a Meta tinha negado ads_read porque o usuário não tem papel no app).
function mensagemDoErro(codigo: string, msg?: string | null): string {
  const detalhe = (msg || "").trim();
  const texto = `${codigo} ${detalhe}`.toLowerCase();

  // Falta de permissão de anúncios: o caso mais comum e o que mais confunde.
  if (/ads_read|sem permissão|permission|\(#200\)|#10\b/.test(texto)) {
    return "A Meta não liberou a permissão de anúncios para este perfil. "
      + "Peça a um admin para adicionar a pessoa em Funções do app "
      + "(developers.facebook.com → seu app → Funções), ela precisa ACEITAR o convite, "
      + "e então reconectar sem desmarcar nenhuma permissão.";
  }
  if (codigo === "meta_sem_secret") return "Falta a env META_ADS_SECRET no servidor (Vercel) — é o App Secret do app de OAuth.";
  if (codigo === "meta_negado") return "A autorização foi cancelada no Facebook. Refaça e aceite as permissões pedidas.";
  if (codigo === "meta_state") return "A sessão do login expirou. Tente conectar de novo.";
  // Qualquer outro caso: mostra o que a Meta respondeu, em vez de engolir.
  return detalhe
    ? `A Meta recusou a conexão: ${detalhe}`
    : "Não foi possível conectar o Meta. Tente de novo — se repetir, me mande o que aparecer aqui.";
}

type Status = "conectado" | "disponivel" | "pronto" | "requer_credenciais";
interface StatusMap { [k: string]: { status: Status; contas?: number; oauth?: boolean } }

interface Prov {
  id: string; nome: string; desc: string; cor: string; icon: string;
  marca?: string;                 // slug da logo (lib/marcas) — cai no `icon` se faltar
  categoria: "Anúncios" | "Analytics" | "Mensageria" | "Dados";
  creds?: string[];               // env necessárias (quando OAuth próprio)
  vaiPara?: string;               // tab interna (fluxos já prontos)
}
const PROVS: Prov[] = [
  // Sem `vaiPara`: o Meta abre o modal e as contas ficam na seção logo abaixo,
  // nesta mesma tela (a aba "Contas de anúncio" deixou de existir).
  { id: "meta", nome: "Meta Ads", desc: "Facebook e Instagram — contas, campanhas e criativos.", cor: "#1877F2", icon: "speakerphone", marca: "meta", categoria: "Anúncios" },
  { id: "google", nome: "Google Ads", desc: "Search, Shopping e Performance Max.", cor: "#EA4335", icon: "speakerphone", marca: "google-ads", categoria: "Anúncios", creds: ["GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET", "GOOGLE_ADS_DEVELOPER_TOKEN"] },
  { id: "tiktok", nome: "TikTok Ads", desc: "Campanhas e criativos do TikTok for Business.", cor: "#111", icon: "speakerphone", marca: "tiktok", categoria: "Anúncios", creds: ["TIKTOK_APP_ID", "TIKTOK_APP_SECRET"] },
  // Kwai ainda não tem logo vendorizada — fica no ícone tingido de reserva.
  { id: "kwai", nome: "Kwai Ads", desc: "Campanhas do Kwai for Business.", cor: "#FF6A00", icon: "speakerphone", categoria: "Anúncios", creds: ["KWAI_CLIENT_ID", "KWAI_CLIENT_SECRET"] },
  { id: "taboola", nome: "Taboola", desc: "Native ads e recomendação de conteúdo.", cor: "#0B69FF", icon: "speakerphone", marca: "taboola", categoria: "Anúncios", creds: ["TABOOLA_CLIENT_ID", "TABOOLA_CLIENT_SECRET"] },
  { id: "ga4", nome: "Google Analytics 4", desc: "Sessões, eventos e conversões do site.", cor: "#E8710A", icon: "chart-line", marca: "google-analytics", categoria: "Analytics", creds: ["GA4_PROPERTY_ID", "GA4_CLIENT_EMAIL", "GA4_PRIVATE_KEY"] },
  { id: "pixel", nome: "Pixel próprio", desc: "Rastreamento first-party do TridiFlow.", cor: "var(--primary-texto)", icon: "world", categoria: "Dados", vaiPara: "rastreamento" },
  { id: "webhooks", nome: "Webhooks", desc: "Receba eventos de venda de qualquer origem.", cor: "var(--ok)", icon: "plug", categoria: "Dados", vaiPara: "rastreamento" },
  { id: "whatsapp", nome: "WhatsApp", desc: "Conversas e cliques do TridiFlow.", cor: "#25D366", icon: "message-chatbot", marca: "whatsapp", categoria: "Mensageria", vaiPara: "x1" },
];

// Chip da logo: superfície neutra sutil quando é logo de verdade (a cor oficial
// da marca aparece melhor num fundo neutro que num tingido da própria cor);
// tingido da marca quando cai no ícone Tabler de reserva, como era antes.
function chipMarca(p: Prov): React.CSSProperties {
  return temLogo(p.marca)
    ? { background: "var(--surface-2)", border: "1px solid var(--tf-line)" }
    : { background: `color-mix(in srgb, ${p.cor} 16%, transparent)` };
}

const ROTULO: Record<Status, { txt: string; cor: string }> = {
  conectado: { txt: "Conectado", cor: "var(--ok)" },
  disponivel: { txt: "Disponível", cor: "var(--azul)" },
  pronto: { txt: "Pronto p/ conectar", cor: "var(--atencao)" },
  requer_credenciais: { txt: "Requer credenciais", cor: "var(--neutro)" },
};

export function IntegracoesCentral({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [st, setSt] = useState<StatusMap | null>(null);
  const [modal, setModal] = useState<Prov | null>(null);
  const tratou = useRef(false);

  useEffect(() => {
    fetch("/api/trafego/integracoes", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => setSt(j.integracoes || {})).catch(() => setSt({}));
  }, []);

  // Resultado do login com Facebook (?conectado=meta / ?erro=…) → toast + limpa a URL.
  useEffect(() => {
    if (tratou.current) return; tratou.current = true;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("conectado") === "meta") toast.ok("Meta Ads conectado!");
    else if (sp.get("erro")) toast.erro(mensagemDoErro(sp.get("erro") || "", sp.get("msg")));
    if (sp.get("conectado") || sp.get("erro")) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const statusDe = (p: Prov): Status => (st?.[p.id]?.status as Status) || "requer_credenciais";
  const cats = ["Anúncios", "Analytics", "Mensageria", "Dados"] as const;

  return (
    <div className="tf-scope" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Integrações</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 2 }}>Conecte suas fontes de dados. O Meta já está integrado; as demais ativam ao configurar as credenciais.</p>
      </div>

      {cats.map((cat) => {
        const provs = PROVS.filter((p) => p.categoria === cat);
        return (
          <div key={cat}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>{cat}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
              {provs.map((p) => {
                const s = statusDe(p); const rot = ROTULO[s]; const contas = st?.[p.id]?.contas;
                // O Meta é a integração-mãe do módulo: cartão em DESTAQUE do kit
                // (borda no roxo + lavado de 8%), com o selo dizendo o porquê.
                const principal = p.id === "meta";
                return (
                  <Cartao key={p.id} destaque={principal} style={{ padding: 15, gap: 11 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                      <span style={{ width: 40, height: 40, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", overflow: "hidden", ...chipMarca(p) }}><Marca slug={p.marca} fallbackIcon={p.icon} cor={p.cor} size={temLogo(p.marca) ? 25 : 21} title={p.nome} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <Cartao.Titulo>{p.nome}</Cartao.Titulo>
                          {principal && <Selo>{s === "conectado" ? "Principal" : "Comece aqui"}</Selo>}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4, marginTop: 1 }}>{p.desc}</div>
                      </div>
                    </div>
                    <Cartao.Rodape>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: rot.cor }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: rot.cor }} />{rot.txt}{s === "conectado" && contas ? ` · ${contas} conta(s)` : ""}
                      </span>
                      <Botao variante={s === "conectado" ? "secundario" : "primario"} icone={s === "conectado" ? undefined : "plug"}
                        onClick={() => { if (p.id === "meta") { setModal(p); return; } (p.vaiPara && (s === "conectado" || s === "disponivel")) ? onNavigate(p.vaiPara) : setModal(p); }}
                        style={{ marginLeft: "auto" }}>
                        {s === "conectado" ? "Gerenciar" : "Conectar"}
                      </Botao>
                    </Cartao.Rodape>
                  </Cartao>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Contas de anúncio — era uma aba própria na sidebar. Virou seção daqui:
          conectar a plataforma e escolher as contas são a MESMA tarefa, e ter
          as duas em telas separadas obrigava a ir e voltar pra concluir. */}
      <div id="contas-de-anuncio" style={{ scrollMarginTop: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Contas de anúncio</div>
        <MetaAdsPanel />
      </div>

      {/* Carteira (carimbo × chancela) e teto do mês. Vieram do Analytics, onde
          eram um `select` por linha e um campo de teto embaixo de uma TABELA DE
          LEITURA — configuração escondida numa tela de análise, com portão
          `analytics` salvando config do Tráfego. Aqui ficam ao lado das contas
          que classificam. */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18 }}>
        <ContasAnuncioView />
      </div>

      {modal && <ConectarModal prov={modal} status={statusDe(modal)} oauth={!!st?.[modal.id]?.oauth} onNavigate={onNavigate} onClose={() => setModal(null)} />}
    </div>
  );
}

// Leva o foco pra seção de contas — substitui o antigo onNavigate("contas"),
// que agora não tem pra onde ir (a aba deixou de existir).
function irParaContas() {
  document.getElementById("contas-de-anuncio")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function ConectarModal({ prov, status, oauth, onNavigate, onClose }: { prov: Prov; status: Status; oauth: boolean; onNavigate: (t: string) => void; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  if (!mounted) return null;
  const precisaCreds = status === "requer_credenciais";
  return createPortal(
    <div onClick={onClose} className="tf-scope sheet-host" style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(8,10,18,.5)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 20, animation: "tfFade .18s ease both" }}>
      <div onClick={(e) => e.stopPropagation()} className="tf-panel sheet" style={{ width: "min(440px, 100%)", padding: 24, animation: "riseIn .22s ease both" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span style={{ width: 44, height: 44, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", overflow: "hidden", ...chipMarca(prov) }}><Marca slug={prov.marca} fallbackIcon={prov.icon} cor={prov.cor} size={temLogo(prov.marca) ? 27 : 23} title={prov.nome} /></span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{status === "conectado" ? `${prov.nome} — ${prov.nome === "Meta Ads" ? "gerenciar" : "conectado"}` : `Conectar ${prov.nome}`}</div></div>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} />
        </div>

        {prov.id === "meta" ? (
          oauth ? (
            <>
              <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 16 }}>
                {status === "conectado"
                  ? "Já há contas conectadas. Entre com outro login do Facebook pra adicionar mais contas, ou veja as que já estão conectadas."
                  : "Entre com o Facebook e autorize o acesso às suas contas de anúncio — o token é guardado automaticamente."}
              </p>
              <a href="/api/trafego/oauth/meta/start" style={{ width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "13px 16px", borderRadius: 12, border: "none", background: "#1877F2", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", textDecoration: "none", marginBottom: 10 }}><Icon name="brand-facebook" size={18} color="#fff" /> {status === "conectado" ? "Conectar outra conta" : "Entrar com o Facebook"}</a>
              <Botao variante="secundario" bloco icone={status === "conectado" ? "list" : "variable"} onClick={() => { onClose(); irParaContas(); }}>{status === "conectado" ? "Ver contas conectadas" : "Colar token manualmente"}</Botao>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 16 }}>Cole o token de acesso na tela de Contas de anúncio. <br /><span style={{ fontSize: 11.5 }}>(Para login com um clique, configure a env <code>META_ADS_SECRET</code> no servidor — o App Secret do app de OAuth 1040039604276311. O App ID já é fixo no código.)</span></p>
              <Botao variante="primario" tamanho="lg" bloco icone="external-link" onClick={() => { onClose(); irParaContas(); }}>Ir para Contas de anúncio</Botao>
            </>
          )
        ) : prov.vaiPara ? (
          <>
            <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 16 }}>Essa integração é gerenciada na própria tela. Vamos te levar até lá.</p>
            <Botao variante="primario" tamanho="lg" bloco icone="external-link" onClick={() => { onNavigate(prov.vaiPara!); onClose(); }}>Abrir configuração</Botao>
          </>
        ) : precisaCreds ? (
          <>
            <Alerta tom="atencao" style={{ marginBottom: 14 }}>
              A conexão fica disponível assim que as <strong>credenciais</strong> desta plataforma forem configuradas no servidor.
            </Alerta>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 7 }}>Variáveis necessárias</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(prov.creds || []).map((c) => (
                <div key={c} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 11px", borderRadius: 9, background: "var(--surface-2)", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, color: "var(--text)" }}><Icon name="variable" size={13} color="var(--text-dim)" /> {c}</div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 12, display: "flex", gap: 6 }}><Icon name="bulb" size={14} color="var(--text-dim)" /> A UI e o fluxo OAuth já estão prontos — só faltam as chaves do app de desenvolvedor da plataforma.</p>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 16 }}>Credenciais detectadas. Inicie a conexão OAuth com a plataforma.</p>
            <Botao variante="primario" tamanho="lg" bloco icone="external-link">Conectar com {prov.nome}</Botao>
          </>
        )}
        <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 16, display: "flex", gap: 6, alignItems: "flex-start" }}><Icon name="shield" size={14} color="var(--text-dim)" /> Seus tokens são guardados com segurança e usados só para ler os dados das suas contas.</p>
      </div>
    </div>,
    document.body,
  );
}
