// Importa o bio link antigo (app avulso "Linktree MKT Organico", publicado em
// linktridi.vercel.app com Supabase próprio) para dentro do TridiFlow, como um
// projeto do tipo LinkTridi — `settings.modo === "linktridi"` + doc em
// `settings.linktridi`, o par que `tipoDe()` lê (lib/tridiflow-db.ts).
//
// Conteúdo (perfil, cartões, links, imagens e cores) foi lido da página
// publicada em 2026-09-08 e está congelado aqui embaixo: o app antigo pode
// sair do ar sem que a importação dependa dele. As imagens continuam
// apontando pro Cloudinary/Storage originais — troque no editor se quiser
// hospedar de novo.
//
// Re-rodável: acha o projeto pelo slug e ATUALIZA o doc em vez de duplicar.
//
//   node scripts/tridiflow-importar-linktridi.mjs
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const SLUG = "carimbos-tridi";
const NOME = "LinkTridi · Carimbos Tridi";

const raiz = path.join(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(
  fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const post = (p) => ({
  tipo: "imagem", tamanhoTitulo: "md", cta: "Comprar agora", publicado: true,
  preco: null, precoDe: null, avaliacaoNota: null, avaliacaoQtd: null, parcelas: null, ...p,
});

// ── o conteúdo do bio link antigo ────────────────────────────────────────────
const DOC = {
  versao: 1,
  perfil: {
    nome: "Carimbos Personalizados Tridi 🐙",
    bio: "🫵Já pensou em ter suas embalagens personalizadas com a logo do seu negócio?\n\nCom os nossos produtos você mesmo personaliza!",
    avatarUrl: "https://nmmudlablvcflbodonvb.supabase.co/storage/v1/object/public/media/avatars/10b2e866-2635-445b-8070-d3acb475af31.png",
    halo: true, verificado: false, formatoLogo: "redondo", mostrarMarca: true, zapFlutuante: false,
    tituloSecao: "CONFIRA NOSSOS PRODUTOS:", tamanhoTituloSecao: "lg",
    mostrarSocial: true,
    social: {
      instagram: "https://www.instagram.com/carimbos.tridi/",
      tiktok: "https://www.tiktok.com/@carimbos.tridi",
    },
  },
  // card_bg do app antigo era #eed6ff; o resto é a paleta padrão do LinkTridi.
  cores: { fundo: "#FFFFFF", cartao: "#EED6FF", destaque: "#7C3AED", cta: "#7C3AED", preco: "#17803D", badge: "#FF6000", formas: true },
  posts: [
    post({
      id: "lt-sinete",
      mediaUrl: "https://res.cloudinary.com/dvxk3fpy5/image/upload/v1784825319/controle_qwbet2.png",
      destinoUrl: "https://seguro.carimbostridi.com.br/r/RZRC723DWI?utm_source=Story&utm_campaign=sinete",
      titulo: "SINETE PERSONALIZADO", badge: "MAIS PROCURADO ✨",
      prefixo: "POR APENAS", sufixo: "", cta: "É SÓ CLICAR AQUI!", destaque: true,
    }),
    post({
      id: "lt-carimbo",
      mediaUrl: "https://res.cloudinary.com/dvxk3fpy5/image/upload/v1784826018/Videobase_2-ezgif.com-video-to-gif-converter_ievaum.gif",
      thumbUrl: "https://res.cloudinary.com/dvxk3fpy5/image/upload/v1784826018/Videobase_2-ezgif.com-video-to-gif-converter_ievaum.gif",
      destinoUrl: "https://seguro.carimbostridi.com.br/r/7X4T9QUNY0",
      titulo: "CARIMBO PERSONALIZADO", prefixo: "POR APENAS",
      sufixo: "PARA TODAS AS EMBALAGENS", cta: "EU QUERO!",
    }),
    post({
      id: "lt-chancela",
      mediaUrl: "https://res.cloudinary.com/dgtu5qh0g/image/upload/v1786387319/FEED-ezgif.com-video-to-gif-converter_2_1_xsrjqe.gif",
      destinoUrl: "https://chat.carimbostridi.com/typebio-chancela",
      titulo: "CHANCELA PERSONALIZADA", prefixo: "POR APENAS",
      sufixo: "+ ELEGÂNCIA NO SEU NEGÓCIO", cta: "EU QUERO!",
    }),
    post({
      id: "lt-kit-chancela-carimbo",
      mediaUrl: "https://res.cloudinary.com/dgtu5qh0g/image/upload/v1786385780/Videobase_1-ezgif.com-video-to-gif-converter_1_ei2b7p.gif",
      thumbUrl: "https://res.cloudinary.com/dgtu5qh0g/image/upload/v1786385780/Videobase_1-ezgif.com-video-to-gif-converter_1_ei2b7p.gif",
      destinoUrl: "https://chat.carimbostridi.com/typebio-chancela-carimbo",
      titulo: "KIT CHANCELA + CARIMBO", badge: "MAIS VENDIDO 🔥",
      prefixo: "POR APENAS", sufixo: "+ FRETE GRÁTIS", cta: "EU QUERO!",
    }),
    post({
      id: "lt-kit-pmg",
      mediaUrl: "https://res.cloudinary.com/dvxk3fpy5/image/upload/v1779988117/Shopify_lorvma.png",
      destinoUrl: "https://chat.carimbostridi.com/type3cinsta",
      titulo: "KIT CARIMBOS P, M e G", prefixo: "POR APENAS",
      sufixo: "+ CARIMBO DE REDES SOCIAIS", cta: "EU QUERO!",
    }),
  ],
};

// ── grava ────────────────────────────────────────────────────────────────────
const { data: existente, error: erroBusca } = await db.from("tridiflow_bots")
  .select("id,nome,settings").eq("slug", SLUG).maybeSingle();
if (erroBusca) { console.error(erroBusca.message); process.exit(1); }

if (existente) {
  const settings = { ...(existente.settings ?? {}), modo: "linktridi", linktridi: DOC };
  const { error } = await db.from("tridiflow_bots")
    .update({ settings, updated_at: new Date().toISOString() }).eq("id", existente.id);
  if (error) { console.error(error.message); process.exit(1); }
  console.log(`atualizado: ${existente.nome} → /marketing/linktridi/${existente.id}`);
} else {
  const { data, error } = await db.from("tridiflow_bots").insert({
    nome: NOME, slug: SLUG,
    fluxo: { groups: [], edges: [], variables: [] },
    theme: {
      preset: "clean", nomeBot: "Atendimento",
      corHeader: "#6D1192", corTextoHeader: "#FFFFFF",
      corFundo: "#F2F2F7", corBolhaBot: "#FFFFFF", corTextoBot: "#1C1C22",
      corBolhaUser: "#6D1192", corTextoUser: "#FFFFFF", corBotao: "#6D1192", corTextoBotao: "#FFFFFF",
    },
    settings: { typingMsPorChar: 28, typingMsMax: 2200, delayEntreBolhas: 350, modo: "linktridi", linktridi: DOC },
    tipo: "flow",
    pagina: { versao: 1, secoes: [], config: {} },
  }).select("id").single();
  if (error) { console.error(error.message); process.exit(1); }
  console.log(`criado: /marketing/linktridi/${data.id}  ·  público (após publicar): /f/${SLUG}`);
}
