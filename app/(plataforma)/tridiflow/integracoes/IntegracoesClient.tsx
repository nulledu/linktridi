"use client";

// Integrações — hub com modal de "Como conectar" (passo a passo + código/URL
// copiável). As conexões reais são por bot (editor → Pixels/Config) ou webhook.
import { useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { Marca } from "../../Marca";
import { temLogo } from "@/lib/marcas";
import { Fila } from "../../ui/micro";
import { Botao, BotaoIcone } from "../../ui/controles";
import { BotaoCopiar, PilulaStatus } from "../_shared/ConfigMicro";

interface Integ {
  id: string; nome: string; cor: string; icone: string; desc: string;
  marca?: string;                 // slug da logo (lib/marcas) — cai no `icone` se faltar
  passos: string[];
  codigo?: { titulo: string; texto: string };
  cta?: { label: string; href: string };
}

// Chip da logo: neutro quando é logo colorida de verdade, tingido da cor da
// marca quando cai no ícone Tabler de reserva (o Webhook, que não tem logo).
function chipInteg(it: Integ): React.CSSProperties {
  return temLogo(it.marca)
    ? { background: "var(--surface-2)", border: "1px solid var(--border)" }
    : { background: `color-mix(in srgb, ${it.cor} 12%, transparent)` };
}

const SHEETS_CODE = `function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSheet();
  var d = JSON.parse(e.postData.contents);
  sheet.appendRow([new Date(), d.nome, d.telefone, d.email, d.utm_source]);
  return ContentService.createTextOutput("ok");
}`;

const INTEGRACOES: Integ[] = [
  {
    id: "webhook", nome: "Webhook / HTTP", cor: "var(--primary-texto)", icone: "plug",
    desc: "Envie cada lead (respostas + UTMs) por POST para qualquer URL — n8n, Make, seu CRM.",
    passos: [
      "Abra o bot no editor, clique em “Personalizar” e vá na aba “Pixels”.",
      "Na seção “Destino dos leads”, cole a URL do seu endpoint.",
      "Ao concluir o funil, o TridiFlow envia um POST (JSON) com todas as respostas + UTMs.",
    ],
    codigo: { titulo: "Exemplo do corpo (JSON) enviado", texto: `{
  "bot": "Funil Produto X",
  "nome": "Maria",
  "telefone": "11999999999",
  "email": "maria@email.com",
  "utm_source": "instagram",
  "utm_campaign": "lancamento"
}` },
    cta: { label: "Abrir meus bots", href: "/tridiflow/meus-bots" },
  },
  {
    id: "sheets", nome: "Google Sheets", cor: "var(--ok)", icone: "table", marca: "google-sheets",
    desc: "Grave os leads numa planilha automaticamente via Apps Script.",
    passos: [
      "Crie uma planilha no Google Sheets.",
      "Menu Extensões → Apps Script e cole o código ao lado.",
      "Implantar → Nova implantação → “App da Web” → acesso “Qualquer pessoa”.",
      "Copie a URL do App da Web e cole em Personalizar → Pixels → Destino dos leads do bot.",
    ],
    codigo: { titulo: "Cole no Apps Script", texto: SHEETS_CODE },
    cta: { label: "Abrir meus bots", href: "/tridiflow/meus-bots" },
  },
  {
    id: "meta", nome: "Meta Pixel + CAPI", cor: "#1877f2", icone: "brand-meta", marca: "meta",
    desc: "Rastreie aberturas, leads e compras no Facebook/Instagram (client + server-side).",
    passos: [
      "No Gerenciador de Eventos da Meta, copie o ID do Pixel.",
      "Gere um token de acesso da Conversions API (mesmo dataset).",
      "No editor do bot → Personalizar → aba Pixels, cole o Pixel ID, o Dataset ID e o token.",
      "Pronto: abertura, Lead e Purchase disparam automático (com dedup client+server).",
    ],
    cta: { label: "Abrir meus bots", href: "/tridiflow/meus-bots" },
  },
  {
    id: "ga4", nome: "Google Analytics 4", cor: "#e8710a", icone: "chart-dots", marca: "google-analytics",
    desc: "Meça sessões e conversões do funil no GA4.",
    passos: [
      "No GA4, copie o ID de mensuração (começa com G-).",
      "No editor do bot → Personalizar → aba Pixels, cole o ID no campo Google GA4.",
      "As sessões e conversões passam a aparecer no seu GA4.",
    ],
    cta: { label: "Abrir meus bots", href: "/tridiflow/meus-bots" },
  },
  {
    id: "tiktok", nome: "TikTok Pixel", cor: "#111827", icone: "brand-tiktok", marca: "tiktok",
    desc: "Otimize campanhas do TikTok com eventos do funil.",
    passos: [
      "No TikTok Ads Manager → Eventos, copie o ID do Pixel.",
      "No editor do bot → Personalizar → aba Pixels, cole no campo TikTok Pixel.",
      "Os eventos do funil passam a otimizar suas campanhas.",
    ],
    cta: { label: "Abrir meus bots", href: "/tridiflow/meus-bots" },
  },
  {
    id: "whatsapp", nome: "WhatsApp", cor: "#25d366", icone: "brand-whatsapp", marca: "whatsapp",
    desc: "Leve o lead pro WhatsApp com mensagem pré-preenchida ({{nome}} etc.).",
    passos: [
      "No editor, adicione o bloco “Enviar pro WhatsApp” no ponto do fluxo desejado.",
      "Coloque o número (com DDI) e a mensagem — use variáveis como {{nome}}.",
      "O visitante abre o WhatsApp já com a mensagem escrita.",
    ],
    cta: { label: "Abrir meus bots", href: "/tridiflow/meus-bots" },
  },
  {
    id: "facebook-leads", nome: "Facebook Lead Ads", cor: "#1877f2", icone: "brand-meta", marca: "facebook",
    desc: "Receba leads dos formulários do Facebook direto no Comercial.",
    passos: [
      "No Gerenciador de Eventos, configure o webhook de Lead Ads.",
      "Aponte-o para a URL de webhook do TridiFlow (com o token).",
      "Os leads passam a cair automaticamente na aba Contatos / Comercial.",
    ],
  },
  {
    id: "zapier", nome: "Zapier / Make", cor: "#ff4a00", icone: "plug", marca: "zapier",
    desc: "Conecte a 5.000+ apps disparando pelo webhook de destino.",
    passos: [
      "No Zapier/Make, crie um Zap com gatilho “Webhook / Catch Hook”.",
      "Copie a URL do webhook gerada.",
      "Cole essa URL em Personalizar → Pixels → Destino dos leads do bot.",
    ],
    cta: { label: "Abrir meus bots", href: "/tridiflow/meus-bots" },
  },
];

export function IntegracoesClient() {
  const [aberta, setAberta] = useState<Integ | null>(null);
  return (
    <div style={{ maxWidth: 1160 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Integrações</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>Conecte seu bot com as ferramentas que você já usa.</p>
      </div>

      <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", gap: 16 }}>
        {INTEGRACOES.map((it) => (
          <div key={it.id} style={{ minWidth: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", overflow: "hidden", ...chipInteg(it) }}><Marca slug={it.marca} fallbackIcon={it.icone} cor={it.cor} size={temLogo(it.marca) ? 27 : 22} title={it.nome} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15.5, fontWeight: 800, color: "var(--text)" }}>{it.nome}</span>
                  <PilulaStatus estado="ok" icone="circle-check">Disponível</PilulaStatus>
                </div>
                <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45, margin: "4px 0 0" }}>{it.desc}</p>
              </div>
            </div>
            <Botao icone="info" onClick={() => setAberta(it)} style={{ marginTop: "auto" }}>
              Como conectar
            </Botao>
          </div>
        ))}
      </Fila>

      {aberta && <ModalComo it={aberta} onClose={() => setAberta(null)} />}
    </div>
  );
}

function ModalComo({ it, onClose }: { it: Integ; onClose: () => void }) {
  // Esc fecha — quem abriu pelo teclado não precisa caçar o X.
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div onClick={onClose} className="sheet-host" style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(16,24,40,.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6dvh 16px", overflowY: "auto" }}>
      {/* Era `#fff` cravado: no tema escuro a folha nascia branca com texto claro. */}
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Como conectar ${it.nome}`} className="sheet" style={{ width: "min(560px, 100%)", background: "var(--surface)", color: "var(--text)", borderRadius: 18, border: "1px solid var(--border)", boxShadow: "0 24px 70px rgba(16,24,40,.35)", overflow: "hidden", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", overflow: "hidden", ...chipInteg(it) }}><Marca slug={it.marca} fallbackIcon={it.icone} cor={it.cor} size={temLogo(it.marca) ? 26 : 22} title={it.nome} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{it.nome}</div>
            <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Como conectar</div>
          </div>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onClose} style={{ margin: -8, flex: "none" }} />
        </div>

        <div style={{ padding: 20 }}>
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.5, margin: "0 0 16px" }}>{it.desc}</p>
          <div className="tfm-fila" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {it.passos.map((p, i) => (
              <div key={i} style={{ ["--i" as string]: i, display: "flex", gap: 11 }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 14%, transparent)", color: "var(--primary-texto, var(--primary))", fontSize: 12, fontWeight: 800 }}>{i + 1}</span>
                <span style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.5, paddingTop: 1 }}>{p}</span>
              </div>
            ))}
          </div>

          {it.codigo && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", minWidth: 0 }}>{it.codigo.titulo}</span>
                <BotaoCopiar texto={it.codigo.texto} />
              </div>
              <pre style={{ margin: 0, background: "#0f172a", color: "#e2e8f0", borderRadius: 12, padding: 14, fontSize: 12, lineHeight: 1.5, overflowX: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{it.codigo.texto}</pre>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <Botao onClick={onClose}>Fechar</Botao>
          {it.cta && <a href={it.cta.href} style={{ padding: "10px 18px", borderRadius: 11, background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", fontSize: 13.5, fontWeight: 800, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 7 }}><Icon name="external-link" size={15} color="var(--on-primary, #fff)" /> {it.cta.label}</a>}
        </div>
      </div>
    </div>
  );
}
