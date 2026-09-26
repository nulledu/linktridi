"use client";

// ── Navegação ────────────────────────────────────────────────────────────────
// Os menus da vitrine: o do cabeçalho e o do rodapé. Antes eles eram blocos
// dentro do editor de Aparência — o que funcionava, mas escondia a navegação
// dentro de "cores e seções", que é onde ninguém procura por ela.
//
// O destino de cada item é escolhido de uma LISTA (coleções e páginas da
// própria loja), não digitado. Digitar caminho na mão é descobrir o erro de
// digitação depois, na loja no ar.

import { useEffect, useState } from "react";
import { Icon } from "../../../Icon";
import { Bloco, Cabecalho } from "../../ui";
import { Fila } from "../../../ui/micro";
import { Botao, BotaoIcone } from "../../../ui/controles";
import { toast } from "../../../Toast";
import type { ItemDeMenu, Menu } from "@/lib/lojas-conteudo";
import "./navegacao.css";

interface Destino { titulo: string; destino: string }

export function NavegacaoClient({ lojaId, slug, menus, disponivel, destinos }: {
  lojaId: string;
  slug: string;
  menus: Menu[];
  disponivel: boolean;
  destinos: { grupo: string; itens: Destino[] }[];
}) {
  const [lista, setLista] = useState(menus);
  const [ativo, setAtivo] = useState(menus[0]?.id ?? "");
  const [itens, setItens] = useState<ItemDeMenu[]>(menus[0]?.itens ?? []);
  const [sujo, setSujo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const menu = lista.find((m) => m.id === ativo) ?? null;

  // Trocar de menu com alteração pendente perderia o trabalho em silêncio.
  useEffect(() => { setItens(menu?.itens ?? []); setSujo(false); }, [ativo, menu]);

  const mexer = (fn: (a: ItemDeMenu[]) => ItemDeMenu[]) => { setItens((a) => fn(a)); setSujo(true); };

  const mover = (de: number, para: number) =>
    mexer((a) => {
      if (para < 0 || para >= a.length) return a;
      const copia = [...a];
      const [x] = copia.splice(de, 1);
      copia.splice(para, 0, x);
      return copia;
    });

  async function salvar() {
    if (!menu) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/lojas/${lojaId}/menus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ menu: menu.id, titulo: menu.titulo, itens }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(j?.detalhe ?? j?.error ?? "Não deu para salvar."); return; }
      setLista((antes) => antes.map((m) => (m.id === menu.id ? { ...m, itens } : m)));
      setSujo(false);
      toast.ok("Menu salvo. A vitrine já está com ele.");
    } finally { setSalvando(false); }
  }

  async function criar() {
    const titulo = prompt("Nome do menu");
    if (!titulo?.trim()) return;
    const r = await fetch(`/api/lojas/${lojaId}/menus`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { toast.erro(j?.detalhe ?? j?.error ?? "Não deu para criar."); return; }
    setLista((antes) => [...antes, j.menu]);
    setAtivo(j.menu.id);
  }

  return (
    <div className="lj-tela">
      <Cabecalho
        titulo="Navegação"
        sub="Os menus do cabeçalho e do rodapé da vitrine."
        acao={<Botao variante="secundario" icone="plus" onClick={criar}>Adicionar menu</Botao>}
      />

      {!disponivel && (
        <p className="ap-aviso">
          <Icon name="alert-triangle" size={16} />
          O cadastro de menus ainda não existe no banco: rode o{" "}
          <code>supabase/lojas-paginas-menus.sql</code> no Supabase. Até lá a vitrine mostra as
          categorias da loja como menu, que é o comportamento de hoje.
        </p>
      )}

      <div className="nv">
        <aside className="nv-menus">
          <p className="nv-rot">Menus</p>
          {lista.map((m) => (
            <button key={m.id} type="button" className="nv-menu" data-on={m.id === ativo ? "1" : undefined}
              onClick={() => setAtivo(m.id)}>
              <span>{m.titulo}</span>
              <small>{m.itens.length}</small>
            </button>
          ))}
          {lista.length === 0 && <p className="nv-vazio">Nenhum menu ainda.</p>}
        </aside>

        <Bloco className="nv-editor">
          {!menu ? (
            <p className="nv-vazio">Escolha um menu à esquerda.</p>
          ) : (
            <>
              <header className="nv-cab">
                <h2 className="lj-card-titulo">{menu.titulo}</h2>
                {sujo && <span className="nv-sujo">Não salvo</span>}
                <span className="ui-esp" />
                <Botao variante="primario" icone="check" carregando={salvando} disabled={!sujo} onClick={salvar}>
                  Salvar
                </Botao>
              </header>

              <Fila className="nv-itens">
                {itens.map((it, i) => (
                  <div className="nv-item" key={`${it.destino}-${i}`}>
                    <span className="nv-arrasta" aria-hidden="true"><Icon name="grip-vertical" size={15} color="var(--text-dim)" /></span>

                    <input
                      className="nv-titulo"
                      value={it.titulo}
                      onChange={(e) => mexer((a) => a.map((x, k) => (k === i ? { ...x, titulo: e.target.value } : x)))}
                      aria-label={`Texto do item ${i + 1}`}
                    />

                    <select
                      className="nv-destino"
                      value={it.destino}
                      onChange={(e) => mexer((a) => a.map((x, k) => (k === i ? { ...x, destino: e.target.value } : x)))}
                      aria-label={`Destino do item ${i + 1}`}
                    >
                      {/* O destino guardado pode não estar mais na lista (a
                          coleção foi renomeada). Ele aparece assim mesmo,
                          senão o `select` se autocorrige pro primeiro item e
                          muda o menu sozinho. */}
                      {!destinos.some((g) => g.itens.some((d) => d.destino === it.destino)) && it.destino && (
                        <option value={it.destino}>{it.destino} (fora da lista)</option>
                      )}
                      {destinos.map((g) => (
                        <optgroup key={g.grupo} label={g.grupo}>
                          {g.itens.map((d) => <option key={d.destino} value={d.destino}>{d.titulo}</option>)}
                        </optgroup>
                      ))}
                    </select>

                    <span className="nv-acoes">
                      <BotaoIcone icone="chevron-up" titulo="Subir" variante="sutil" disabled={i === 0} onClick={() => mover(i, i - 1)} />
                      <BotaoIcone icone="chevron-down" titulo="Descer" variante="sutil" disabled={i === itens.length - 1} onClick={() => mover(i, i + 1)} />
                      <BotaoIcone icone="trash" titulo="Remover" variante="sutil" onClick={() => mexer((a) => a.filter((_, k) => k !== i))} />
                    </span>
                  </div>
                ))}
              </Fila>

              {itens.length === 0 && (
                <p className="nv-vazio">
                  Menu vazio. Enquanto ele estiver assim, a vitrine mostra as categorias da loja.
                </p>
              )}

              <Botao
                variante="sutil"
                icone="plus"
                onClick={() => mexer((a) => [...a, { titulo: destinos[0]?.itens[0]?.titulo ?? "Novo item", destino: destinos[0]?.itens[0]?.destino ?? "/" }])}
              >
                Adicionar item
              </Botao>
            </>
          )}
        </Bloco>
      </div>
    </div>
  );
}
