"use client";

// ── "Personalizar": quais itens do Estoque aparecem na Visão geral ───────────
// Pedido do dono (11/09/2026): a seção de produtos mostra o que ELE escolher —
// produtos, componentes, matérias-primas… A escolha vale pra equipe inteira
// (uma lista só, em `atividades_config`), e quem muda é quem tem
// Atividades › Configurar. O catálogo vem só quando o painel abre.

import { useEffect, useState } from "react";
import { Botao, PainelLateral } from "../ui/controles";
import { toast } from "../Toast";
import { SeletorDeItens, type ItemDoCatalogo } from "./SeletorDeItens";

export function PersonalizarItens({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: () => void }) {
  const [catalogo, setCatalogo] = useState<ItemDoCatalogo[] | null>(null);
  const [erro, setErro] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch("/api/atividades/visao?catalogo=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { setCatalogo(d.itens ?? []); setSel(new Set((d.selecionados ?? []) as string[])); })
      .catch(() => setErro(true));
  }, []);

  function alternar(id: string) {
    setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function salvar(itens: string[]) {
    setSalvando(true);
    try {
      const r = await fetch("/api/atividades/visao", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        toast.ok(itens.length
          ? `${itens.length} ${itens.length === 1 ? "item escolhido" : "itens escolhidos"} pra Visão geral.`
          : "Voltou ao padrão: produtos e matérias-primas processadas.");
        onSalvo();
        onFechar();
      } else {
        toast.erro(d.error === "sem_tabela" ? "Falta rodar o SQL atividades_itens_da_visao pra guardar a escolha." : "Não foi possível salvar agora.");
      }
    } catch {
      toast.erro("A conexão caiu. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <PainelLateral largura={560} onFechar={onFechar} titulo="Escolher produtos"
      subtitulo="Marque os produtos (e componentes, matérias-primas…) que aparecem na Visão geral."
      rodape={
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap", width: "100%" }}>
          <Botao variante="sutil" onClick={() => salvar([])} disabled={salvando || !catalogo}>Voltar ao padrão</Botao>
          <Botao variante="primario" onClick={() => salvar([...sel])} carregando={salvando} disabled={!catalogo || sel.size === 0}>
            Salvar ({sel.size})
          </Botao>
        </div>
      }>
      {erro && <p style={{ margin: 0, fontSize: 13, color: "var(--perigo)" }}>Não deu pra carregar o catálogo. Feche e abra de novo.</p>}
      {!catalogo && !erro && <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>Carregando o catálogo…</p>}
      {catalogo && <SeletorDeItens catalogo={catalogo} marcados={sel} onAlternar={alternar} />}
    </PainelLateral>
  );
}
