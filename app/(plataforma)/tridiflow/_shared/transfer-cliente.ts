"use client";

// Exportar/importar projeto — a parte que fala com o navegador (download,
// leitura de arquivo, chamadas à API). A validação e o formato moram em
// lib/tridiflow-transfer.ts, que é puro e testado.

import { toast } from "../../Toast";
import type { BotCompleto, TipoProjeto } from "@/lib/tridiflow-db";
import { arquivoDoBot, lerArquivoTemplate, nomeDoArquivo, patchDaImportacao } from "@/lib/tridiflow-transfer";

/** Baixa o projeto como arquivo .tridiflow.json. */
export async function exportarProjeto(id: string): Promise<void> {
  try {
    const r = await fetch(`/api/tridiflow/bots?id=${encodeURIComponent(id)}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.bot) { toast.erro("Não foi possível carregar o projeto para exportar."); return; }
    const bot = d.bot as BotCompleto;
    const blob = new Blob([JSON.stringify(arquivoDoBot(bot), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeDoArquivo(bot.nome);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.ok("Projeto exportado. Guarde o arquivo ou mande pra quem vai importar.");
  } catch {
    toast.erro("Falha ao exportar. Tente de novo.");
  }
}

/**
 * Lê o arquivo escolhido, cria o projeto e grava o conteúdo.
 * Devolve o destino do editor certo — quem chama redireciona.
 * O caminho de escrita é o MESMO do editor (POST cria, PATCH salva):
 * nenhuma rota nova pra validar.
 */
export async function importarArquivo(file: File): Promise<{ id: string; tipo: TipoProjeto } | null> {
  let bruto: unknown;
  try { bruto = JSON.parse(await file.text()); }
  catch { toast.erro("O arquivo não é um JSON válido."); return null; }

  const leitura = lerArquivoTemplate(bruto);
  if (!leitura.ok) { toast.erro(leitura.erro); return null; }
  const t = leitura.arquivo;

  const criar = await fetch("/api/tridiflow/bots", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nome: t.nome, tipo: t.tipo }),
  });
  const d = await criar.json().catch(() => ({}));
  if (!criar.ok || !d.bot?.id) { toast.erro(d.error || "Não foi possível criar o projeto."); return null; }
  const id: string = d.bot.id;

  const patch = patchDaImportacao(t);
  if (Object.keys(patch).length) {
    const salvar = await fetch("/api/tridiflow/bots", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!salvar.ok) {
      // O projeto existe mas ficou sem o conteúdo — dizer isso é melhor que
      // fingir sucesso e a pessoa abrir um editor vazio sem entender.
      toast.erro("O projeto foi criado, mas o conteúdo não gravou. Abra e tente colar de novo.");
      return { id, tipo: t.tipo };
    }
  }
  toast.ok(`"${t.nome}" importado.`);
  return { id, tipo: t.tipo };
}
