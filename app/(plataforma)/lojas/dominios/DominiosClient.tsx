"use client";

// ── Domínios ─────────────────────────────────────────────────────────────────
// Onde as lojas atendem na internet.
//
// Antes esta tela era um "em breve", e o que funcionava de verdade estava
// escondido no passo 1 de Configurações — uma fileira de seis botões numa linha
// só. Quem clicava em "Domínios" na barra lateral via um aviso de recurso
// futuro sobre um recurso que já existia.
//
// A decisão que dá forma a tudo aqui: as PENDÊNCIAS ficam abertas, sempre.
// Ligar um domínio tem quatro etapas em três sistemas, e a terceira (adicionar
// na Vercel) não acontece dentro do produto — antes ela só aparecia depois que
// a pessoa clicava em "Verificar" e falhava. Ver o que falta não pode custar um
// clique e uma espera.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "../../Icon";
import { Bloco, Cabecalho, Vazio } from "../ui";
import { Botao, Campo } from "../../ui/controles";
import { confirmar, toast } from "../../Toast";
import { Fila } from "../../ui/micro";
import { jsonOuErro, motivoDaFalha } from "../../ui/rede";
import { PROVEDORES, limparHost, partesHost } from "@/lib/dominio-dns";
import {
  SITUACAO, situacaoDoDominio, type EstadoDominio, type Pendencia,
} from "@/lib/lojas-dominio";
import "./dominios.css";

export interface DominioCru { id: string; host: string; verificado: boolean; lojaId: string | null }
export interface LojaResumo { id: string; nome: string; publicada: boolean }

interface Check { estado: EstadoDominio; detalhe: string }

export function DominiosClient({ dominios: iniciais, lojas, lojaAtual, podeEscrever }: {
  dominios: DominioCru[];
  lojas: LojaResumo[];
  /** Aberta de dentro de uma loja: a lista começa filtrada nela. */
  lojaAtual?: LojaResumo;
  podeEscrever: boolean;
}) {
  const [lista, setLista] = useState(iniciais);
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [verificando, setVerificando] = useState<string | null>(null);
  const [ligando, setLigando] = useState<string | null>(null);
  const [soDaLoja, setSoDaLoja] = useState(!!lojaAtual);

  const recarregar = useCallback(async () => {
    const [a, b] = await Promise.all([
      fetch("/api/tridiflow/dominios", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/lojas/dominios", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (!a?.dominios) return;
    const vinc: Record<string, string> = b?.vinculos ?? {};
    setLista((a.dominios as { id: string; host: string; verificado: boolean }[])
      .map((d) => ({ ...d, lojaId: vinc[d.id] ?? null })));
  }, []);

  // Checagem automática ao abrir, só dos que ainda NÃO estão verificados.
  //
  // Uma por vez e não em paralelo: cada checagem faz uma resolução DNS e um
  // handshake HTTPS de até 8s, e disparar dez juntas é uma rajada de execução
  // na hospedagem — a conta que já pausou o projeto uma vez. Nesta tela a
  // ordem também é a leitura natural, de cima pra baixo.
  useEffect(() => {
    let vivo = true;
    (async () => {
      for (const d of iniciais.filter((x) => !x.verificado).slice(0, 8)) {
        if (!vivo) return;
        setVerificando(d.id);
        try {
          const r = await fetch("/api/tridiflow/dominios", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: d.id }),
          });
          const j = await r.json().catch(() => ({}));
          if (!vivo) return;
          if (j?.estado) setChecks((c) => ({ ...c, [d.id]: { estado: j.estado, detalhe: j.detalhe ?? "" } }));
          if (j?.ok) setLista((l) => l.map((x) => (x.id === d.id ? { ...x, verificado: true } : x)));
        } catch { /* rede caiu: o cartão mostra o estado guardado */ }
      }
      if (vivo) setVerificando(null);
    })();
    return () => { vivo = false; };
    // Só na montagem: reagir à `lista` faria a checagem se repetir a cada
    // resposta, em laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const porId = useMemo(() => new Map(lojas.map((l) => [l.id, l])), [lojas]);

  const situacoes = useMemo(() => lista.map((d) => ({
    cru: d,
    s: situacaoDoDominio({
      host: d.host,
      estado: d.verificado ? "ativo" : (checks[d.id]?.estado ?? "sem_dns"),
      detalhe: checks[d.id]?.detalhe,
      loja: d.lojaId ? (porId.get(d.lojaId) ?? null) : null,
    }),
  })), [lista, checks, porId]);

  const visiveis = soDaLoja && lojaAtual
    ? situacoes.filter((x) => x.cru.lojaId === lojaAtual.id)
    : situacoes;

  const avisoRaiz = novo.trim() ? partesHost(novo).apex : false;

  async function adicionar() {
    const host = limparHost(novo);
    if (!host) { setErro("Digite o endereço completo, com o seu domínio."); return; }
    if (!host.includes(".")) { setErro("Isso não parece um endereço — falta o domínio (ex.: loja.suaempresa.com.br)."); return; }
    setErro("");
    setSalvando(true);
    try {
      const r = await fetch("/api/tridiflow/dominios", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || "Não deu para salvar."); return; }
      setNovo("");
      await recarregar();
      toast.ok("Endereço cadastrado. Agora veja o que falta no cartão dele.");
    } finally { setSalvando(false); }
  }

  async function verificar(id: string) {
    setVerificando(id);
    try {
      const r = await fetch("/api/tridiflow/dominios", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.estado) setChecks((c) => ({ ...c, [id]: { estado: j.estado, detalhe: j.detalhe ?? "" } }));
      if (j?.ok) { toast.ok("Domínio conectado."); await recarregar(); }
      else toast.erro("Ainda não. O que falta está no cartão.");
    } finally { setVerificando(null); }
  }

  async function ligar(id: string, lojaId: string | null) {
    setLigando(id);
    try {
      const r = await fetch("/api/lojas/dominios", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dominioId: id, lojaId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.erro(r.status === 409 ? (j.detalhe ?? "Rode o supabase/lojas.sql.") : (j.error ?? "Não deu para salvar."));
        return;
      }
      setLista((l) => l.map((x) => (x.id === id ? { ...x, lojaId } : x)));
      toast.ok(lojaId ? `Endereço ligado a ${porId.get(lojaId)?.nome ?? "a loja"}.` : "Endereço solto.");
    } finally { setLigando(null); }
  }

  async function remover(d: DominioCru) {
    if (!(await confirmar(`Remover ${d.host}?`, {
      detalhe: "Quem acessar por esse endereço deixa de chegar na loja.", perigo: true,
    }))) return;
    // Só tira da lista quando o servidor confirmou: 500/403 ou o desvio pro
    // login (200 com HTML) deixam o endereço onde está.
    try {
      await jsonOuErro(await fetch(`/api/tridiflow/dominios?id=${d.id}`, { method: "DELETE" }));
    } catch (e) {
      toast.erro(`${motivoDaFalha(e, "remover o endereço")} ${d.host} continua ativo.`);
      return;
    }
    setLista((l) => l.filter((x) => x.id !== d.id));
    toast.ok("Endereço removido.");
  }

  return (
    <div className="lj-tela">
      <Cabecalho
        titulo="Domínios"
        sub={lojaAtual
          ? `Os endereços em que ${lojaAtual.nome} atende — e o que falta para cada um funcionar.`
          : "Os endereços em que suas lojas atendem, e o que falta para cada um funcionar."}
        aside={lojaAtual ? (
          <Link href="/lojas/dominios" className="lj-link">Ver todos os endereços</Link>
        ) : undefined}
      />

      {podeEscrever && (
        <Bloco titulo="Adicionar um endereço">
          <Campo
            label="Endereço que a loja vai usar"
            erro={erro}
            dica="Prefira um subdomínio (loja., www.). O domínio raiz normalmente já é do site da empresa."
          >
            {(id) => (
              <div className="dm-add">
                <input id={id} value={novo} onChange={(e) => { setNovo(e.target.value); setErro(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }}
                  type="url" inputMode="url" autoComplete="url" autoCapitalize="none" autoCorrect="off"
                  spellCheck={false} enterKeyHint="done" placeholder="loja.suaempresa.com.br" />
                <Botao variante="primario" icone="plus" carregando={salvando} onClick={adicionar}>Adicionar</Botao>
              </div>
            )}
          </Campo>

          {avisoRaiz && (
            <p className="dm-aviso">
              <Icon name="alert-triangle" size={15} color="var(--atencao)" />
              <span>
                Esse é o <strong>domínio raiz</strong>, não um subdomínio. Ele costuma já ser usado pelo site da
                empresa, e a raiz não aceita CNAME — precisa de registro A. Se o site já roda aí, prefira{" "}
                <code>loja.{limparHost(novo)}</code>.
              </span>
            </p>
          )}
        </Bloco>
      )}

      {lojaAtual && situacoes.length > visiveis.length && (
        <div className="tab-strip dm-abas">
          <button type="button" className="ui-btn" data-t="sm" data-v={soDaLoja ? "primario" : "sutil"}
            aria-pressed={soDaLoja} onClick={() => setSoDaLoja(true)}>
            Desta loja <span className="dm-conta">{situacoes.filter((x) => x.cru.lojaId === lojaAtual.id).length}</span>
          </button>
          <button type="button" className="ui-btn" data-t="sm" data-v={!soDaLoja ? "primario" : "sutil"}
            aria-pressed={!soDaLoja} onClick={() => setSoDaLoja(false)}>
            Todos <span className="dm-conta">{situacoes.length}</span>
          </button>
        </div>
      )}

      {visiveis.length === 0 ? (
        <Bloco>
          <Vazio
            icone="world"
            titulo={lista.length ? "Nenhum endereço ligado a esta loja" : "Nenhum endereço próprio ainda"}
            texto={lista.length
              ? "Os endereços cadastrados aparecem em Todos. Ligue um a esta loja para ele abrir a vitrine dela."
              : "Sua loja já funciona no endereço padrão. Um domínio próprio é para quando você quer que o cliente digite o nome da sua empresa."}
          />
        </Bloco>
      ) : (
        <Fila>
          {visiveis.map(({ cru, s }) => {
            const sit = SITUACAO[s.estado];
            return (
              <article className="dm-card" key={cru.id} data-pronto={s.pronto ? "1" : undefined}>
                <header className="dm-cab">
                  <div className="dm-cab-txt">
                    <h2>{cru.host}</h2>
                    <p>{s.pronto
                      ? <>Abre <strong>{s.loja?.nome}</strong> — <a href={`https://${cru.host}`} target="_blank" rel="noreferrer noopener">https://{cru.host}</a></>
                      : `Faltam ${s.pendencias.length} ${s.pendencias.length === 1 ? "passo" : "passos"}.`}
                    </p>
                  </div>
                  <span className="dm-selo" style={{
                    background: `color-mix(in srgb, ${sit.cor} 16%, transparent)`, color: sit.cor,
                  }}>
                    <Icon name={sit.icone} size={13} color={sit.cor} /> {sit.txt}
                  </span>
                </header>

                {/* Qual loja o endereço abre. É a pergunta mais frequente da
                    tela, então é um seletor visível e não um botão que alterna. */}
                <div className="dm-loja">
                  <label htmlFor={`loja-${cru.id}`}>Este endereço abre</label>
                  <select id={`loja-${cru.id}`} value={cru.lojaId ?? ""} disabled={!podeEscrever || ligando === cru.id}
                    onChange={(e) => ligar(cru.id, e.target.value || null)}>
                    <option value="">Nenhuma loja</option>
                    {lojas.map((l) => (
                      <option key={l.id} value={l.id}>{l.nome}{l.publicada ? "" : " (rascunho)"}</option>
                    ))}
                  </select>
                </div>

                {s.pendencias.length > 0 && (
                  <ol className="dm-passos">
                    {s.pendencias.map((p) => <PassoPendente key={p.chave} p={p} />)}
                  </ol>
                )}

                {s.detalhe && !s.pronto && (
                  <p className="dm-detalhe">
                    <Icon name="info-circle" size={14} color="var(--text-dim)" />
                    <span>{s.detalhe}</span>
                  </p>
                )}

                <footer className="dm-acoes">
                  <Botao tamanho="sm" icone="refresh" carregando={verificando === cru.id} onClick={() => verificar(cru.id)}>
                    Verificar agora
                  </Botao>
                  {s.pronto && (
                    <a className="ui-btn" data-t="sm" data-v="sutil" href={`https://${cru.host}`} target="_blank" rel="noreferrer noopener">
                      <Icon name="external-link" size={14} /> Abrir
                    </a>
                  )}
                  {podeEscrever && (
                    <Botao tamanho="sm" variante="perigo" icone="trash" onClick={() => remover(cru)}>Remover</Botao>
                  )}
                </footer>
              </article>
            );
          })}
        </Fila>
      )}

      <p className="dm-rodape">
        O cadastro de endereços é do sistema e é compartilhado com o TridiFlow — por isso a lista pode trazer
        endereços de outros projetos. Um endereço serve uma loja por vez. Quem cuida do seu domínio costuma
        ser {PROVEDORES.slice(0, 3).join(", ")} ou parecido.
      </p>
    </div>
  );
}

// ── Um passo pendente ────────────────────────────────────────────────────────

function PassoPendente({ p }: { p: Pendencia }) {
  return (
    <li className="dm-passo">
      <div className="dm-passo-txt">
        <strong>{p.titulo}</strong>
        <span>{p.detalhe}</span>
      </div>

      {p.dns && (
        <div className="dm-dns">
          {p.dns.map((linha) => (
            <div className="dm-dns-linha" key={linha.campo}>
              <div className="dm-dns-rot">
                <strong>{linha.campo}</strong>
                <small>{linha.dica}</small>
              </div>
              <code>{linha.valor}</code>
              <Copiar valor={linha.valor} />
            </div>
          ))}
        </div>
      )}

      {p.href && (
        <a className="ui-btn" data-t="sm" data-v="sutil" href={p.href} target="_blank" rel="noreferrer noopener">
          <Icon name="external-link" size={14} /> Abrir a hospedagem
        </a>
      )}
      {p.rota && <Link className="ui-btn" data-t="sm" data-v="sutil" href={p.rota}>Ir para a loja</Link>}
    </li>
  );
}

function Copiar({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button type="button" className="dm-copiar" aria-label={`Copiar ${valor}`}
      onClick={async () => {
        try { await navigator.clipboard.writeText(valor); } catch { return; }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1600);
      }}>
      <Icon name={copiado ? "check" : "copy"} size={15} color={copiado ? "var(--ok)" : "var(--text-dim)"} />
    </button>
  );
}
