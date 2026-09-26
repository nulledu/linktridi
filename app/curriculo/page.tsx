import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import { preload } from "react-dom";
import { dadosDaCandidatura } from "@/lib/rh/curriculos/publico";
import { srcDaPose } from "@/lib/rh/curriculos/personagens";
import { CandidaturaClient } from "./CandidaturaClient";
import "./curriculo.css";

export const dynamic = "force-dynamic";

// A frase manuscrita ao lado do personagem ("Bora nessa?", "Falta pouco!").
const caveat = Caveat({ subsets: ["latin"], weight: ["500", "600"], display: "swap", variable: "--font-nota" });

export const metadata: Metadata = {
  title: "Currículo Tridi",
  description: "Queremos conhecer mais do que o seu currículo.",
  robots: { index: false, follow: false },
};

/**
 * PÚBLICO — o formulário de candidatura (RH → Currículos).
 *
 * `?previa=1` roda tudo sem rede (a prévia que o RH abre); `?vaga=<id>`
 * amarra a candidatura a uma vaga aberta e acrescenta as perguntas dela. Fechado na integração, a página
 * mostra o aviso e não aceita envio (a API também recusa).
 */
export default async function CandidaturaPage({ searchParams }: { searchParams: Promise<{ previa?: string; vaga?: string }> }) {
  const sp = await searchParams;
  const previa = sp.previa === "1";
  const { fechado, config, vaga } = await dadosDaCandidatura(sp.vaga ?? null, previa);

  // A imagem da primeira tela entra no <head> com prioridade alta: ela chega
  // junto com o HTML, sem esperar o JavaScript montar a página.
  const primeira = config.abertura.ativa ? config.abertura.personagem : config.etapas.find((e) => e.ativa)?.personagem;
  if (config.personagens && primeira) preload(srcDaPose(primeira), { as: "image", fetchPriority: "high" });

  return (
    <div className={`cd-scope ${caveat.variable}`}>
      <CandidaturaClient previa={previa} fechado={fechado} vaga={vaga} config={config} />
    </div>
  );
}
