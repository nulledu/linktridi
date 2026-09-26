"use client";

// ── Enviar aviso (gaveta do sininho) ─────────────────────────────────────────
// Isto era uma ABA inteira da Administração — uma tela vazia com quatro campos
// no meio. Mas mandar aviso não é um lugar aonde se vai: é uma ação, e ela
// pertence ao mesmo objeto que RECEBE aviso. O sininho já é esse objeto.
//
// Quem pode enviar vê "Enviar aviso" no rodapé do próprio painel de
// notificações; quem não pode nem sabe que existe.

import { useEffect, useState } from "react";
import { GlassSelect } from "./GlassPicker";
import { toast } from "./Toast";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral } from "./ui/controles";

interface Pessoa { id: string; name: string }

export function EnviarAviso({ onFechar }: { onFechar: () => void }) {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [link, setLink] = useState("");
  const [para, setPara] = useState("todos");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/central/pessoas").then((r) => r.json()).then((d) => setPessoas(d.pessoas ?? [])).catch(() => {});
  }, []);

  const alvo = para === "todos" ? "todo mundo" : pessoas.find((p) => p.id === para)?.name ?? "a pessoa";

  async function enviar() {
    if (!titulo.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/notificacoes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, corpo: corpo || null, link: link || null, para, tipo: "admin" }),
      });
      const d = await r.json();
      if (d.ok) { toast.ok(`Aviso enviado para ${d.enviadas} pessoa(s).`); onFechar(); }
      else toast.erro("Falha ao enviar.");
    } catch { toast.erro("Falha ao enviar."); }
    finally { setBusy(false); }
  }

  return (
    <PainelLateral
      titulo="Enviar aviso"
      subtitulo="chega como notificação no sino de quem receber"
      largura={460}
      onFechar={onFechar}
      rodape={
        <Acoes>
          <Botao variante="sutil" onClick={onFechar}>Cancelar</Botao>
          <Esp />
          {/* O rótulo diz PARA QUEM vai: é a parte da ação que não dá pra
              desfazer, e ela some do olho quando fica só no campo lá em cima. */}
          <Botao variante="primario" icone="send" onClick={enviar} disabled={!titulo.trim()} carregando={busy}>
            Enviar para {alvo}
          </Botao>
        </Acoes>
      }
    >
      <Campos min={200}>
        <Campo label="Título" largo dica="É a linha que aparece em negrito no sino.">
          {(id) => <input id={id} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Reunião geral às 17h" maxLength={120} />}
        </Campo>
        <Campo label="Mensagem" largo dica="Opcional — uma linha de contexto.">
          {(id) => <textarea id={id} rows={3} value={corpo} onChange={(e) => setCorpo(e.target.value)} placeholder="Na sala de reunião, com todo o time." maxLength={400} />}
        </Campo>
        <Campo label="Para quem">
          {(id) => (
            <GlassSelect id={id} value={para} onChange={setPara} searchable
              options={[{ value: "todos", label: "Todo mundo" }, ...pessoas.map((p) => ({ value: p.id, label: p.name }))]} />
          )}
        </Campo>
        <Campo label="Link (opcional)" dica="Tocar no aviso leva pra cá.">
          {(id) => <input id={id} value={link} onChange={(e) => setLink(e.target.value)} placeholder="/central/tarefas" />}
        </Campo>
      </Campos>
    </PainelLateral>
  );
}
