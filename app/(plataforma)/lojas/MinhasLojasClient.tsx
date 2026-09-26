"use client";

// Porta do criador: as lojas que existem, e o botão de criar mais uma. É o
// equivalente ao "Meus projetos" do TridiFlow — a diferença entre gerenciar
// UMA loja e criar lojas mora justamente nesta tela.

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { baseDoModulo } from "./base";
import { Cabecalho, CopiarLink, Numeros } from "./ui";
import { Fila, NumeroVivo } from "../ui/micro";
import { Botao, Campo, PainelLateral, Acoes, Esp } from "../ui/controles";
import { toast } from "../Toast";
import { ROTULO_LOJA, moeda, slugDe, urlDaLoja, type Loja } from "@/lib/lojas";

export interface FaturamentoDaLoja { lojaId: string; receita: number; pedidos: number; sessoes: number }

export function MinhasLojasClient({ lojas: todas, demo, faturamento = [] }: {
  lojas: Loja[];
  demo: boolean;
  /** Últimos 30 dias, por loja. Vazio enquanto o SQL de analytics não rodou. */
  faturamento?: FaturamentoDaLoja[];
}) {
  const router = useRouter();
  const base = baseDoModulo(usePathname());
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  // O cabeçalho manda `?novo=1` quando não há loja no contexto — assim o botão
  // "Criar loja" funciona de qualquer tela do criador, sem estado global.
  const [criando, setCriando] = useState(params.get("novo") === "1");
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);

  const porLoja = useMemo(() => new Map(faturamento.map((f) => [f.lojaId, f])), [faturamento]);
  const totalReceita = faturamento.reduce((s, f) => s + f.receita, 0);
  const totalSessoes = faturamento.reduce((s, f) => s + f.sessoes, 0);

  const lojas = useMemo(() => {
    const termo = q.trim().toLowerCase();
    if (!termo) return todas;
    return todas.filter((l) => l.nome.toLowerCase().includes(termo) || l.slug.includes(termo));
  }, [todas, q]);

  async function criar() {
    if (!nome.trim()) { toast.erro("Dê um nome à loja."); return; }
    setSalvando(true);
    try {
      const r = await fetch("/api/lojas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nome.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        // 409 = o SQL ainda não rodou. Dizer isso é mais útil que "erro".
        toast.erro(r.status === 409 ? (j.detalhe ?? "Rode o supabase/lojas.sql.") : (j.error ?? "Não deu para criar."));
        return;
      }
      setCriando(false);
      setNome("");
      toast.ok(`"${j.loja?.nome ?? nome.trim()}" criada.`);
      // `refresh` e não `push`: a lista vem do servidor, então é ele quem
      // precisa recontar — trocar de rota traria a mesma lista de antes.
      router.refresh();
    } finally { setSalvando(false); }
  }

  return (
    <div className="lj-tela">
      <Cabecalho
        titulo="Minhas lojas"
        sub="Loja é organização: elas podem vender os mesmos produtos, cada uma no seu endereço."
        acao={<Botao variante="primario" icone="plus" onClick={() => setCriando(true)}>Criar loja</Botao>}
      />

      {/* A comparação vem ANTES da grade: quem tem mais de uma loja abre esta
          tela pra saber qual está vendendo, não pra reler os nomes. */}
      {totalReceita > 0 && (
        <Numeros
          itens={[
            // NumeroVivo: conta de 0 até o valor quando entra na tela.
            { rotulo: "Faturamento", valor: <NumeroVivo valor={totalReceita} formatar={moeda} />, nota: "últimos 30 dias" },
            { rotulo: "Sessões", valor: <NumeroVivo valor={totalSessoes} />, nota: "últimos 30 dias" },
            { rotulo: "Lojas com venda", valor: `${faturamento.filter((f) => f.receita > 0).length} de ${todas.length}` },
          ]}
        />
      )}

      {q && (
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
          {lojas.length} resultado{lojas.length === 1 ? "" : "s"} para <strong>{q}</strong>
          {" · "}
          <Link href={base} style={{ color: "var(--primary-texto)" }}>limpar</Link>
        </p>
      )}

      {/* `minmax(min(100%, 280px), 1fr)` e não `minmax(280px, 1fr)`: com o
          mínimo fixo o card não encolhe e a página ganha rolagem lateral a
          320px. Idêntico no computador, colapsa sozinho no celular. */}
      <Fila className="lj-lojas">
        {lojas.map((l) => {
          const rot = ROTULO_LOJA[l.status];
          return (
            <div key={l.id} className="lj-cel">
            <Link href={`${base}/${l.id}`} className="ui-card-alvo lj-card lj-loja" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
              <div className="lj-loja-cab">
                <span style={{ width: 36, height: 36, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${l.cor} 18%, transparent)` }}>
                  <Icon name="shopping-bag" size={18} color={l.cor} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <strong style={{ display: "block", fontSize: 15, fontWeight: 750, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nome}</strong>
                  <span style={{ fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                    {urlDaLoja(l).replace(/^https:\/\//, "")}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: `color-mix(in srgb, ${rot.cor} 16%, transparent)`, color: rot.cor }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: rot.cor }} aria-hidden="true" />
                  {rot.txt}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {l.dominio ? "Domínio próprio" : "Endereço padrão"}
                </span>
              </div>

              {/* Faturamento e acesso dos últimos 30 dias. Custam ZERO consulta
                  a mais: vêm da mesma agregação que soma todas as lojas de uma
                  vez. Some quando o SQL de analytics ainda não rodou — número
                  em branco é melhor que zero, que parece "não vendeu". */}
              {porLoja.has(l.id) && (
                <div className="ml-numeros">
                  <span><small>Faturou</small><strong>{moeda(porLoja.get(l.id)!.receita)}</strong></span>
                  <span><small>Pedidos</small><strong>{porLoja.get(l.id)!.pedidos}</strong></span>
                  <span><small>Sessões</small><strong>{porLoja.get(l.id)!.sessoes}</strong></span>
                  {totalReceita > 0 && (
                    <span className="ml-fatia" aria-label="Participação no faturamento">
                      <span style={{ width: `${(porLoja.get(l.id)!.receita / totalReceita) * 100}%` }} />
                    </span>
                  )}
                </div>
              )}
            </Link>
            {/* Fora do link: botão dentro de <a> é HTML inválido. */}
            <CopiarLink url={urlDaLoja(l)} rotulo={`Copiar o link de ${l.nome}`} />
            </div>
          );
        })}

        {/* Criar entra como mais um card da grade — no celular ele fica logo
            abaixo das lojas, sem competir com o botão do cabeçalho. */}
        <div key="criar" className="lj-cel">
          <button type="button" onClick={() => setCriando(true)} className="lj-solta" style={{ minHeight: 132 }}>
            <Icon name="circle-plus" size={22} color="var(--text-dim)" />
            <span><strong>Criar loja</strong></span>
            <span style={{ fontSize: 11 }}>Comece do zero ou por um modelo pronto.</span>
          </button>
        </div>
      </Fila>

      {lojas.length === 0 && q && (
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 16 }}>Nenhuma loja com esse nome.</p>
      )}
      {lojas.length === 0 && !q && !demo && (
        <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 16 }}>
          Nenhuma loja ainda. Crie a primeira acima.
        </p>
      )}

      {criando && (
        <PainelLateral
          titulo="Criar loja"
          subtitulo="O endereço pode mudar depois."
          onFechar={() => { setCriando(false); router.replace(base); }}
          rodape={
            <Acoes>
              <Botao onClick={() => { setCriando(false); router.replace(base); }}>Cancelar</Botao>
              <Esp />
              <Botao variante="primario" icone="check" carregando={salvando} onClick={criar}>Criar</Botao>
            </Acoes>
          }
        >
          <Campo label="Nome da loja" dica="Aparece no topo da vitrine e nos e-mails.">
            {(id) => (
              <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus
                placeholder="Carimbos Tridi" autoCapitalize="words" autoCorrect="off" enterKeyHint="done"
                onKeyDown={(e) => { if (e.key === "Enter") criar(); }} />
            )}
          </Campo>
          <Campo label="Endereço" dica="Depois você aponta um domínio próprio nas configurações.">
            {(id) => (
              <input id={id} readOnly value={`tridigaius.vercel.app/l/${slugDe(nome) || "sua-loja"}`}
                style={{ color: "var(--text-dim)" }} />
            )}
          </Campo>
        </PainelLateral>
      )}
    </div>
  );
}
