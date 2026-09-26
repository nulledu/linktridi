"use client";

import { useEffect, useMemo, useState } from "react";
import type { Fornecedor as FornecedorLegado, Material } from "@/lib/tridi-custos";
import { Icon } from "../Icon";
import { Acoes, Botao, BotaoIcone, Campo, Campos, PainelLateral, Caixa } from "../ui/controles";
import { Abas } from "../ui/Abas";
import { confirmar, toast } from "../Toast";
import { atributosDe } from "../ui/campos";
import { triarListaFornecedores, type LinhaTriagem } from "@/lib/estoque-fornecedores-semelhanca";
import { ErroDeCarga, EstadoVazio } from "./EstadoVazio";
import type { Item } from "./tipos";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Fornecedor { id: string; nome: string; cnpj: string | null; contato: string | null; telefone: string | null; email: string | null; obs: string | null; ativo: boolean }

// Traduz os 409 da API (app/api/estoque/fornecedores/route.ts) pra português.
function erroFornecedor(codigo: string | undefined, itens?: number): string {
  if (codigo === "nome_duplicado") return "Já existe um fornecedor com este nome.";
  if (codigo === "fornecedor_em_uso") return `Este fornecedor ainda tem ${itens ?? 0} item${itens === 1 ? "" : "(ns)"} vinculado(s) no catálogo. Troque o fornecedor deles antes de apagar.`;
  if (codigo === "missing_nome") return "Dê um nome ao fornecedor.";
  return "Não foi possível salvar. Tente de novo.";
}

// Fornecedores: cadastro próprio (novo) lado a lado com a base de custos da
// Tridi (legada, só leitura). As duas sub-abas dividem UM fetch da base
// legada — é dali que vem o `podeVerCusto` que gateia o dinheiro nos dois
// lugares, e buscar duas vezes a mesma coisa violaria a regra do projeto de
// nunca duplicar uma consulta que já está na tela.
export function FornecedoresPanel() {
  const [sub, setSub] = useState<"fornecedores" | "legado">("fornecedores");

  const [forn, setForn] = useState<FornecedorLegado[]>([]);
  const [mat, setMat] = useState<Material[]>([]);
  const [podeVerCusto, setPodeVerCusto] = useState(false);
  const [loadingLegado, setLoadingLegado] = useState(true);
  const [erroLegado, setErroLegado] = useState(false);

  useEffect(() => {
    fetch("/api/tridi/estoque", { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (d.fornecedores) { setForn(d.fornecedores); setMat(d.materiais); setPodeVerCusto(!!d.podeVerCusto); } else setErroLegado(true); })
      .catch(() => setErroLegado(true)).finally(() => setLoadingLegado(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Abas className="ui-abas--sub" valor={sub} ariaLabel="Fornecedores" onMuda={setSub}
          itens={[
            { valor: "fornecedores", rotulo: <><Icon name="truck-loading" size={14} color="currentColor" /> Fornecedores</> },
            { valor: "legado", rotulo: <><Icon name="building-warehouse" size={14} color="currentColor" /> Base de custos da Tridi</> },
          ]} />
      </div>
      {sub === "fornecedores"
        ? <FornecedoresCadastro podeVerCusto={podeVerCusto} />
        : <BaseCustosLegado forn={forn} mat={mat} podeVerCusto={podeVerCusto} loading={loadingLegado} erro={erroLegado} />}
    </div>
  );
}

// ── Cadastro novo (CRUD) ─────────────────────────────────────────────────────
// Cada card mostra quantos itens do catálogo apontam pra este fornecedor e,
// só quem tem `podeVerCusto`, o custo total deles. Os itens vêm do
// /api/estoque-itens já buscado em outras abas do Estoque (capado em 2000) —
// uma rota dedicada de contagem seria uma consulta a mais sem ganho nenhum.
function FornecedoresCadastro({ podeVerCusto }: { podeVerCusto: boolean }) {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [podeGerir, setPodeGerir] = useState(false);
  // O Financeiro é a base do cadastro agora. Se o SQL dele não rodou neste
  // banco, a lista volta vazia — e vazio por falta de SQL parece "ninguém
  // cadastrou ainda", que manda a pessoa fazer a coisa errada.
  const [financeiroPendente, setFinanceiroPendente] = useState(false);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [novo, setNovo] = useState(false);
  const [lote, setLote] = useState(false);
  const [editando, setEditando] = useState<Fornecedor | null>(null);

  // Idem LocaisPanel: `fetch` que estoura sem `catch` deixa a tela presa em
  // "Carregando…" pra sempre, sem nada pra fazer.
  async function load() {
    try {
      const [rf, ri] = await Promise.all([
        fetch("/api/estoque/fornecedores", { cache: "no-store" }),
        fetch("/api/estoque-itens", { cache: "no-store" }),
      ]);
      if (!rf.ok) { setErro(true); return; }
      const df = await rf.json();
      const di = await ri.json().catch(() => ({}));
      setFornecedores(df.fornecedores ?? []);
      setPodeGerir(!!df.podeGerir);
      setFinanceiroPendente(!!df.financeiroPendente);
      setItens(di.itens ?? []);
      setErro(false);
    } catch {
      setErro(true);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const resumo = useMemo(() => {
    const m = new Map<string, { qtd: number; total: number }>();
    for (const i of itens) {
      if (!i.fornecedor_id) continue;
      const cur = m.get(i.fornecedor_id) ?? { qtd: 0, total: 0 };
      cur.qtd += 1;
      cur.total += i.custo || 0;
      m.set(i.fornecedor_id, cur);
    }
    return m;
  }, [itens]);

  const bt = busca.trim().toLowerCase();
  const filtrados = useMemo(() => fornecedores.filter((f) =>
    !bt || `${f.nome} ${f.cnpj ?? ""} ${f.contato ?? ""}`.toLowerCase().includes(bt)), [fornecedores, bt]);

  if (loading) return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  if (erro) return <ErroDeCarga oQue="os fornecedores" naoTem="não há nenhum fornecedor cadastrado" onTentar={() => { setLoading(true); load(); }} />;

  // ── O vazio conta o que a aba resolve ─────────────────────────────────────
  // "Nenhum fornecedor cadastrado ainda." é verdade e não serve pra nada: não
  // diz o que muda com o cadastro (a origem de cada item, o custo por
  // fornecedor, o campo do Recebimento que hoje fica vazio) nem que dá pra
  // colar os dezessete da planilha numa vez só.
  if (fornecedores.length === 0) {
    return (
      <>
        <EstadoVazio
          icone="truck-loading"
          titulo="Nenhum fornecedor cadastrado ainda"
          acoes={podeGerir ? <>
            <Botao variante="primario" icone="list-check" onClick={() => setLote(true)}>Cadastrar vários</Botao>
            <Botao icone="plus" onClick={() => setNovo(true)}>Um fornecedor só</Botao>
          </> : undefined}
        >
          <p style={{ margin: 0 }}>
            É de onde cada item vem. Preenchido, o item do catálogo passa a ter origem, a compra
            no Recebimento sabe de quem é, e dá pra ver quanto do estoque saiu de cada empresa.
          </p>
          <p style={{ margin: "8px 0 0" }}>
            O cadastro é <strong>o mesmo do Financeiro</strong>: quem entra aqui aparece lá, e
            quem entra lá aparece aqui. Antes eram duas listas separadas, e elas nunca ficavam
            iguais.
          </p>
          {podeGerir ? (
            <p style={{ margin: "8px 0 0" }}>
              Cole a lista inteira de uma vez em <strong>Cadastrar vários</strong> — um nome por
              linha, direto da planilha. A tela avisa quando dois nomes se parecem
              (“EMBALAGENS AVARÉ” e “AVARÉ/CERQUEIRA”) e deixa <em>você</em> decidir: ninguém
              junta empresa sozinho.
            </p>
          ) : financeiroPendente ? (
            <p style={{ margin: "8px 0 0" }}>
              A lista está vazia porque o banco do Financeiro ainda não foi criado — não é
              cadastro por fazer. Rode <code>supabase/financeiro.sql</code> e recarregue.
            </p>
          ) : (
            <p style={{ margin: "8px 0 0" }}>
              Você vê os fornecedores, mas não cadastra: a linha nasce dentro do Financeiro, que é
              área restrita. Quem tem a permissão de cadastros do Financeiro cadastra aqui mesmo
              ou por lá — é a mesma lista.
            </p>
          )}
        </EstadoVazio>

        {novo && <EditorFornecedor fornecedor={null} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />}
        {lote && <CadastrarVarios cadastrados={fornecedores} onClose={() => setLote(false)} onSaved={() => { setLote(false); load(); }} />}
      </>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={15} color="var(--text-dim)" /></span>
          <input {...atributosDe("busca")} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor…"
            style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "9px 12px 9px 34px", color: "var(--text)", fontSize: 14 }} />
        </div>
        {/* "Cadastrar vários" antes do "Novo": com a tabela vazia e 17
            fornecedores pra entrar, um-a-um é o caminho que ninguém percorre —
            e campo de fornecedor vazio é item sem origem no catálogo inteiro. */}
        {podeGerir && <Botao icone="list-check" onClick={() => setLote(true)}>Cadastrar vários</Botao>}
        {podeGerir && <Botao variante="primario" icone="plus" onClick={() => setNovo(true)}>Novo fornecedor</Botao>}
      </div>

      {filtrados.length === 0 ? (
        // O cadastro vazio já saiu por cima (estado vazio que ensina): aqui só
        // resta o vazio da BUSCA, que é outra conversa.
        <p style={{ color: "var(--text-dim)" }}>Nada encontrado.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 230px), 1fr))", gap: 12 }}>
          {filtrados.map((f) => {
            const r = resumo.get(f.id);
            return (
              <div key={f.id} className="glass glass-spec" style={{ padding: 16, borderRadius: "var(--r-md)", cursor: podeGerir ? "pointer" : "default", opacity: f.ativo ? 1 : 0.55 }}
                onClick={() => podeGerir && setEditando(f)}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{f.nome}</div>
                  {podeGerir && <BotaoIcone icone="edit" titulo="Editar fornecedor" variante="sutil" tamanho="sm" onClick={(e) => { e.stopPropagation(); setEditando(f); }} />}
                </div>
                {!f.ativo && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>inativo</div>}
                {(f.contato || f.telefone) && <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[f.contato, f.telefone].filter(Boolean).join(" · ")}</div>}
                <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 8 }}>{r?.qtd ?? 0} {r?.qtd === 1 ? "item" : "itens"} no catálogo</div>
                {podeVerCusto && (r?.total ?? 0) > 0 && <div style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: "var(--primary-texto, var(--primary))" }}>{brl(r!.total)} <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>em itens</span></div>}
              </div>
            );
          })}
        </div>
      )}

      {(novo || editando) && (
        <EditorFornecedor
          fornecedor={editando}
          onClose={() => { setNovo(false); setEditando(null); }}
          onSaved={() => { setNovo(false); setEditando(null); load(); }}
        />
      )}

      {lote && (
        <CadastrarVarios
          cadastrados={fornecedores}
          onClose={() => setLote(false)}
          onSaved={() => { setLote(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Cadastrar vários (colar a lista) ─────────────────────────────────────────
// O problema desta aba não é cadastrar: é cadastrar DUAS VEZES a mesma
// empresa escrita diferente. A planilha do galpão tem "AVARÉ/CERQUEIRA",
// "EMBALAGENS AVARÉ" e "SIERRA(CERQUEIRA)" — pode ser um grupo só ou três
// empresas, e quem sabe é quem compra, não o código.
//
// Por isso a tela AVISA e não junta: cada linha da colagem entra marcada, com
// o parentesco escrito do lado ("parece com X"). Desmarcar é um toque. Fusão
// automática, não: duplicata a pessoa vê e conserta depois; fornecedor que
// sumiu sozinho, não.
const CHIP: Record<LinhaTriagem["situacao"], { texto: string; cor: string }> = {
  novo:      { texto: "novo",           cor: "var(--ok)" },
  existente: { texto: "já cadastrado",  cor: "var(--neutro)" },
  repetido:  { texto: "repetido",       cor: "var(--neutro)" },
  suspeito:  { texto: "confira",        cor: "var(--atencao)" },
};

function CadastrarVarios({ cadastrados, onClose, onSaved }: {
  cadastrados: Fornecedor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Decisão da pessoa, por NOME (o índice muda a cada tecla digitada).
  const [escolha, setEscolha] = useState<Record<string, boolean>>({});

  const base = useMemo(() => cadastrados.map((f) => ({ id: f.id, nome: f.nome })), [cadastrados]);
  const triagem = useMemo(() => triarListaFornecedores(texto, base), [texto, base]);

  const marcado = (l: LinhaTriagem) => escolha[l.nome] ?? l.marcar;
  const decidivel = (l: LinhaTriagem) => l.situacao === "novo" || l.situacao === "suspeito";
  const escolhidos = triagem.linhas.filter((l) => decidivel(l) && marcado(l));

  const jaTem = triagem.linhas.filter((l) => l.situacao === "existente").length;
  const repetidos = triagem.linhas.filter((l) => l.situacao === "repetido").length;

  async function cadastrar() {
    if (!escolhidos.length || busy) return;
    setBusy(true); setErro(null);
    try {
      const r = await fetch("/api/estoque/fornecedores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomes: escolhidos.map((l) => l.nome) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(erroFornecedor(d.error)); setBusy(false); return; }
      const criados = (d.criados ?? []).length as number;
      const falhas = (d.falhas ?? []).length as number;
      const extra = [
        (d.jaExistiam ?? []).length ? `${(d.jaExistiam ?? []).length} já existia(m)` : "",
        falhas ? `${falhas} não entrou(ram)` : "",
      ].filter(Boolean).join(" · ");
      toast(`${criados} fornecedor${criados === 1 ? "" : "es"} cadastrado${criados === 1 ? "" : "s"}${extra ? ` · ${extra}` : ""}`, falhas ? "erro" : "ok");
      onSaved();
    } catch {
      setErro("Não deu pra cadastrar agora. Tente de novo.");
      setBusy(false);
    }
  }

  return (
    <PainelLateral
      titulo="Cadastrar vários fornecedores"
      subtitulo="Cole a lista — um nome por linha"
      onFechar={onClose}
      largura={560}
      rodape={
        <Acoes>
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone="check" onClick={cadastrar} disabled={!escolhidos.length || busy} carregando={busy}>
            Cadastrar {escolhidos.length || ""}
          </Botao>
        </Acoes>
      }
    >
      {/* `Campo` do kit: rótulo com o tamanho de sempre e o controle herdando
          raio, largura e fonte do formulário. Textarea solto vinha com o
          monoespaçado do navegador e parecia outro produto. */}
      <Campos>
        <Campo label="Um por linha (vale colar direto da planilha)" largo>
          {(id) => (
            <textarea id={id} value={texto} onChange={(e) => setTexto(e.target.value)} rows={7}
              autoFocus spellCheck={false}
              placeholder={"AVARÉ/CERQUEIRA\nBOOK EXPRESS\nBRUNIQUÍMICA\nDS EMBALAGENS…"}
              style={{ fontSize: 14, lineHeight: 1.5 }} />
          )}
        </Campo>
      </Campos>

      {triagem.linhas.length > 0 && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", margin: "14px 0 8px", fontSize: 12.5, color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)", fontSize: 13 }}>{escolhidos.length} vão entrar</strong>
            {jaTem > 0 && <span>{jaTem} já cadastrado{jaTem === 1 ? "" : "s"}</span>}
            {repetidos > 0 && <span>{repetidos} repetido{repetidos === 1 ? "" : "s"} na lista</span>}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {triagem.linhas.map((l, i) => {
              const chip = CHIP[l.situacao];
              const podeMarcar = decidivel(l);
              const on = podeMarcar && marcado(l);
              return (
                <div key={`${l.nome}-${i}`} className="glass" style={{
                  padding: "6px 12px", borderRadius: "var(--r-sm)",
                  opacity: podeMarcar ? 1 : 0.6,
                }}>
                  <label style={{
                    display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)",
                    cursor: podeMarcar ? "pointer" : "default",
                  }}>
                    <Caixa marcado={on} desativado={!podeMarcar} onChange={(marc) => setEscolha((s) => ({ ...s, [l.nome]: marc }))} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{l.nome}</span>
                    <span style={{
                      flex: "none", fontSize: 10.5, fontWeight: 800, letterSpacing: .2, textTransform: "uppercase",
                      color: chip.cor, background: `color-mix(in srgb, ${chip.cor} 14%, transparent)`,
                      padding: "2px 7px", borderRadius: 999,
                    }}>{chip.texto}</span>
                  </label>

                  {l.aviso && (
                    <p style={{ margin: "0 0 6px 28px", fontSize: 12, color: "var(--text-dim)", overflowWrap: "anywhere" }}>{l.aviso}</p>
                  )}

                  {l.parecidos.length > 0 && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: "0 0 8px 28px" }}>
                      <span style={{ flex: "none", marginTop: 1 }}><Icon name="alert-triangle" size={13} color="var(--atencao)" /></span>
                      <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)", overflowWrap: "anywhere" }}>
                        Parece com {l.parecidos.map((p) => `"${p.nome}"`).join(", ")}.{" "}
                        <strong style={{ color: "var(--text)" }}>Se for a mesma empresa, desmarque</strong> — ninguém junta sozinho.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {erro && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: "var(--perigo)" }}>{erro}</p>}
    </PainelLateral>
  );
}

function EditorFornecedor({ fornecedor, onClose, onSaved }: { fornecedor: Fornecedor | null; onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState(fornecedor?.nome ?? "");
  const [cnpj, setCnpj] = useState(fornecedor?.cnpj ?? "");
  const [contato, setContato] = useState(fornecedor?.contato ?? "");
  const [telefone, setTelefone] = useState(fornecedor?.telefone ?? "");
  const [email, setEmail] = useState(fornecedor?.email ?? "");
  const [obs, setObs] = useState(fornecedor?.obs ?? "");
  const [ativo, setAtivo] = useState(fornecedor?.ativo ?? true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const podeSalvar = !!nome.trim() && !busy;

  async function salvar() {
    if (!podeSalvar) return;
    setBusy(true); setErro(null);
    const body = {
      id: fornecedor?.id, nome: nome.trim(),
      cnpj: cnpj.trim() || null, contato: contato.trim() || null,
      telefone: telefone.trim() || null, email: email.trim() || null,
      obs: obs.trim() || null, ativo,
    };
    const r = await fetch("/api/estoque/fornecedores", { method: fornecedor ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(erroFornecedor(d.error));
      setBusy(false);
      return;
    }
    setBusy(false); onSaved();
  }
  async function remover() {
    if (!fornecedor) return;
    if (!(await confirmar(`Remover "${fornecedor.nome}"?`, { perigo: true }))) return;
    setBusy(true);
    const r = await fetch(`/api/estoque/fornecedores?id=${fornecedor.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(erroFornecedor(d.error, d.itens));
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <PainelLateral
      titulo={fornecedor ? "Editar fornecedor" : "Novo fornecedor"}
      onFechar={onClose}
      largura={460}
      rodape={
        <Acoes>
          {fornecedor && <Botao variante="perigo" icone="trash" onClick={remover} disabled={busy}>Remover</Botao>}
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar} disabled={!podeSalvar} carregando={busy}>Salvar</Botao>
        </Acoes>
      }
    >
      <Campos>
        <Campo label="Nome" largo>
          {(id) => <input id={id} {...atributosDe("nome")} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Razão social ou nome fantasia" autoFocus />}
        </Campo>
        <Campo label="CNPJ">
          {(id) => <input id={id} {...atributosDe("codigo")} value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />}
        </Campo>
        <Campo label="Contato">
          {(id) => <input id={id} {...atributosDe("nome")} value={contato} onChange={(e) => setContato(e.target.value)} placeholder="Nome de quem atende" />}
        </Campo>
        <Campo label="Telefone">
          {(id) => <input id={id} {...atributosDe("telefone")} value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />}
        </Campo>
        <Campo label="E-mail">
          {(id) => <input id={id} {...atributosDe("email")} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@fornecedor.com" />}
        </Campo>
        <Campo label="Observações" largo>
          {(id) => <textarea id={id} value={obs} onChange={(e) => setObs(e.target.value)} rows={3} placeholder="Prazo de entrega, condição de pagamento…" />}
        </Campo>
        <Campo label="Situação" largo>
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", cursor: "pointer" }}>
            <Caixa marcado={ativo} onChange={(marc) => setAtivo(marc)} />
            <span style={{ fontSize: 13.5 }}>Fornecedor ativo <span style={{ color: "var(--text-dim)" }}>(desligue pra arquivar sem apagar)</span></span>
          </label>
        </Campo>
      </Campos>
      {erro && <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--perigo)" }}>{erro}</p>}
    </PainelLateral>
  );
}

// ── Base de custos da Tridi (legado) ─────────────────────────────────────────
// Conteúdo idêntico ao painel antigo — só leitura, direto do Sistema de
// Custos da Tridi. `forn`/`mat`/`podeVerCusto`/`loading`/`erro` chegam por
// prop porque o fetch subiu pro componente pai (ver `FornecedoresPanel`
// acima); o resto (toggle Fornecedores/Materiais, busca, os cards) é o
// mesmo de sempre.
function BaseCustosLegado({ forn, mat, podeVerCusto, loading, erro }: {
  forn: FornecedorLegado[]; mat: Material[]; podeVerCusto: boolean; loading: boolean; erro: boolean;
}) {
  const [aba, setAba] = useState<"fornecedores" | "materiais">("fornecedores");
  const [busca, setBusca] = useState("");

  const bt = busca.trim().toLowerCase();
  const fornF = useMemo(() => forn.filter((f) => !bt || f.nome.toLowerCase().includes(bt)), [forn, bt]);
  const matF = useMemo(() => mat.filter((m) => !bt || `${m.nome} ${m.fornecedor ?? ""} ${m.categoria ?? ""}`.toLowerCase().includes(bt)), [mat, bt]);

  if (loading) return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  if (erro) return <div className="glass" style={{ padding: 24, borderRadius: "var(--r-md)", color: "var(--text-dim)" }}>Não foi possível ler a base de custos da Tridi.</div>;

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
        Direto do Sistema de Custos da Tridi (ao vivo, sem duplicar).{!podeVerCusto && " Preços visíveis só p/ admin."}
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {/* Era a última fileira de "abas" desenhada à mão do módulo: dois
            <button> com fundo próprio, sem a pílula que viaja e sem rolar de
            lado. Agora é a mesma `Abas` das sub-abas logo acima. */}
        <Abas className="ui-abas--sub" ariaLabel="Base de custos" valor={aba} onMuda={setAba}
          itens={[
            { valor: "fornecedores", rotulo: `Fornecedores · ${forn.length}` },
            { valor: "materiais", rotulo: `Materiais · ${mat.length}` },
          ]} />
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 180, marginLeft: "auto" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={15} color="var(--text-dim)" /></span>
          <input {...atributosDe("busca")} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…"
            style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "9px 12px 9px 34px", color: "var(--text)", fontSize: 14 }} />
        </div>
      </div>

      {aba === "fornecedores" ? (
        // `overflowWrap: anywhere` como no cartão da sub-aba irmã: a fundação
        // só quebra palavra sozinha até 760px (`body`, no globals.css), então
        // no COMPUTADOR — que é onde esta base é lida — um nome sem espaço
        // (código colado da planilha, SKU, e-mail) saía do cartão por cima do
        // vizinho. Medido a 1280px: o nome vazava 343px de um cartão de 230px.
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 230px), 1fr))", gap: 12 }}>
          {fornF.map((f) => (
            <div key={f.id} className="glass glass-spec" style={{ padding: 16, borderRadius: "var(--r-md)" }}>
              <div style={{ fontSize: 15, fontWeight: 800, overflowWrap: "anywhere" }}>{f.nome}</div>
              <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 4 }}>{f.materiais} {f.materiais === 1 ? "material" : "materiais"}</div>
              {podeVerCusto && f.valorTotal > 0 && <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: "var(--primary-texto, var(--primary))" }}>{brl(f.valorTotal)} <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)" }}>em insumos</span></div>}
            </div>
          ))}
          {fornF.length === 0 && <p style={{ color: "var(--text-dim)" }}>Nenhum fornecedor.</p>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {matF.map((m) => (
            <div key={m.id} className="glass glass-spec" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: "var(--r-sm)", flexWrap: "wrap" }}>
              {/* Idem: sem a quebra, o nome era desenhado 174px PRA FORA da
                  própria caixa (360px de caixa para 534px de texto) e passava
                  por cima da categoria e do fornecedor na mesma linha — três
                  textos empilhados no mesmo lugar. */}
              <strong style={{ fontSize: 14, flex: "1 1 160px", minWidth: 0, overflowWrap: "anywhere" }}>{m.nome}</strong>
              {m.categoria && <span style={{ fontSize: 11, fontWeight: 700, color: m.cor || "var(--primary)", background: `color-mix(in srgb, ${m.cor || "var(--primary)"} 14%, transparent)`, padding: "2px 8px", borderRadius: 999 }}>{m.categoria}</span>}
              {m.fornecedor && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{m.fornecedor}</span>}
              {m.unidade && <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>/{m.unidade}</span>}
              {podeVerCusto && <span className="stat" style={{ marginLeft: "auto", fontSize: 15, color: "var(--primary-texto, var(--primary))", minWidth: 80, textAlign: "right" }}>{brl(m.valor)}</span>}
            </div>
          ))}
          {matF.length === 0 && <p style={{ color: "var(--text-dim)" }}>Nenhum material.</p>}
        </div>
      )}
    </div>
  );
}
