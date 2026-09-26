// Contagem da central, mandada pelo navegador.
//
// `keepalive`: o toque no WhatsApp abre outra aba (ou o app) na mesma hora, e
// sem ele o navegador cancela o pedido no meio do caminho — o contato mais
// importante seria justamente o que nunca chega. Falha de rede é engolida:
// contar é acessório e nunca pode virar erro na cara de quem pediu ajuda.
import type { CampoMetricaLeitura } from "@/lib/tridiflow-tutoriais-leitura";

export function enviarMetrica(botId: string | undefined, handle: string, campo: CampoMetricaLeitura): void {
  // Sem central (prévia do editor) não há onde contar — e rascunho não polui
  // a métrica de quem está no ar.
  if (!botId || !handle) return;
  try {
    void fetch("/api/p/tutorial-metrica", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ botId, handle, campo }), keepalive: true,
    }).catch(() => {});
  } catch { /* fetch indisponível: segue sem contar */ }
}
