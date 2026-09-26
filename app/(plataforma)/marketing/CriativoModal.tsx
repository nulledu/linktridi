"use client";

// ── Marketing · Biblioteca · Subir criativo ──────────────────────────────────
// Poucas escolhas e nada de digitar nome: MÊS e ANO (já no corrente), NÚMERO
// (já no próximo livre), VARIAÇÃO (opcional: V2, "Depoimento"…), PRODUTO (a
// lista cresce pelo "+ Novo produto") e QUEM FEZ (a própria conta; só admin
// troca, inclusive pra "Outros"). O nome "SET 01 - V2 - {CRB} - {L}" aparece
// no topo enquanto a pessoa escolhe, e é o mesmo que o servidor grava — ele
// monta de novo com a mesma regra (`nomeDoCriativo`), a tela só mostra.
//
// Plataforma, tipo, campanha, status, data e prefixo digitado saíram em
// set/2026: ninguém preenchia direito, e o que importa pra achar a peça depois
// cabe no nome.
import { useEffect, useId, useState } from "react";
import { GlassSelect } from "../GlassPicker";
import { Icon } from "../Icon";
import { Acoes, Botao, BotaoIcone, Campo, Campos, Esp, PainelLateral } from "../ui/controles";
import { toast } from "../Toast";
import {
  MESES, anoAtualSP, mesAtualSigla, nomeDoCriativo, normalizarTag, sugestaoDeTag, tagDoProduto,
  type Criativo, type ProdutoCriativo,
} from "@/lib/marketing-criativos-const";
import { textoDosLimites, validarCriativo } from "@/lib/criativos/regras";
import { emMB } from "@/lib/armazenamento/referencia";
import { BibliotecaCriativo } from "./BibliotecaCriativo";
import { enviarPeca } from "./pecas";
import type { Editor } from "./MarketingClient";

export type Eu = { id: string; nome: string; admin: boolean };

const OUTROS = "__outros";
const NN = (n: number) => String(n).padStart(2, "0");

export function CriativoModal({ modo, criativo, editores, produtos, eu, onFechar, onSalvo, onProdutoCriado }: {
  modo: "novo" | "editar";
  criativo?: Criativo;
  editores: Editor[];
  produtos: ProdutoCriativo[];
  eu: Eu;
  onFechar: () => void;
  onSalvo: (c: Criativo) => void;
  onProdutoCriado?: (p: ProdutoCriativo) => void;
}) {
  const editar = modo === "editar" && !!criativo;
  const anoAtual = anoAtualSP();
  const [prefixo, setPrefixo] = useState(criativo?.prefixo ?? mesAtualSigla());
  const [ano, setAno] = useState(criativo?.ano ?? anoAtual);
  const [trocandoAno, setTrocandoAno] = useState(false);
  const [numero, setNumero] = useState<number>(criativo?.numero ?? 1);
  const [variacao, setVariacao] = useState(criativo?.variacao ?? "");
  const [buscandoNumero, setBuscandoNumero] = useState(!editar);
  const [produto, setProduto] = useState<string>(
    produtos.find((p) => p.nome.toLowerCase() === (criativo?.produto ?? "").toLowerCase())?.nome ?? "");
  const [editorSel, setEditorSel] = useState<string>(
    criativo ? (criativo.editorId ?? (criativo.editorNome ? OUTROS : eu.id)) : eu.id);
  const [outroNome, setOutroNome] = useState(criativo && !criativo.editorId ? (criativo.editorNome ?? "") : "");
  const [salvando, setSalvando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  // Criativo novo ainda não tem id, e a peça é registrada por id: as peças
  // esperam aqui, já validadas, e sobem logo depois que o criativo existe.
  const [pendentes, setPendentes] = useState<File[]>([]);
  const [progresso, setProgresso] = useState<string | null>(null);
  const idPecas = useId();

  // Próximo número livre do mês no ano, pedido ao abrir e a cada troca de
  // mês/ano. Resposta atrasada (trocou SET→OUT rápido) é descartada pelo `vivo`.
  useEffect(() => {
    if (editar) return;
    let vivo = true;
    setBuscandoNumero(true);
    void fetch(`/api/marketing/criativos/proximo?prefixo=${prefixo}&ano=${ano}`)
      .then((r) => r.json()).catch(() => null)
      .then((r) => { if (vivo) { if (r?.ok) setNumero(r.numero); setBuscandoNumero(false); } });
    return () => { vivo = false; };
  }, [prefixo, ano, editar]);

  const editorNome = editorSel === OUTROS
    ? outroNome.trim()
    : editorSel === eu.id ? eu.nome : (editores.find((e) => e.id === editorSel)?.nome ?? "");
  const nomeFinal = nomeDoCriativo(prefixo, numero, variacao, tagDoProduto(produto, produtos), editorNome);
  const erroProduto = tentativa > 0 && !produto ? "Escolha o produto do criativo." : undefined;
  const erroEditor = tentativa > 0 && eu.admin && !editorNome ? "Digite o nome de quem fez." : undefined;

  async function escolherPecas(lista: File[]) {
    for (const f of lista) {
      const problema = await validarCriativo(f);
      if (problema) { toast(problema.texto, "erro"); continue; }
      setPendentes((p) => [...p, f]);
    }
  }

  async function salvar() {
    setTentativa((t) => t + 1);
    if (!produto || (eu.admin && !editorNome) || !(numero >= 1)) return;
    setSalvando(true);
    const corpo = {
      prefixo, numero, ano, variacao, produto,
      editorId: editorSel === OUTROS ? null : editorSel,
      editorNome,
    };
    const url = editar ? `/api/marketing/criativos/${criativo!.id}` : "/api/marketing/criativos";
    const r = await fetch(url, {
      method: editar ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }).then((x) => x.json()).catch(() => null);
    setSalvando(false);
    if (!r?.ok) {
      if (r?.error === "numero_ocupado") {
        const oque = `${prefixo} ${NN(numero)}${variacao.trim() ? ` - ${variacao.trim()}` : ""}`;
        if (r.proximo) {
          toast(`${oque} já existe em ${ano}. Coloquei o próximo livre: ${prefixo} ${NN(r.proximo)}. Se for variação, preencha a variação.`, "erro");
          setNumero(r.proximo);
        } else toast(`${oque} já existe em ${ano}. Mude a variação.`, "erro");
        return;
      }
      toast(r?.error === "tabela_ausente" || r?.error === "sql_pendente"
        ? "O banco ainda não tem o ano e a variação. Rode supabase/marketing_criativos_ano_variacao.sql."
        : r?.error === "sem_permissao" ? "Você não tem permissão para subir criativos."
        : "Não deu para salvar o criativo.", "erro");
      return;
    }
    const salvo = r.criativo as Criativo;
    toast(editar ? "Criativo atualizado." : `${salvo.nome} na biblioteca.`);

    // As peças sobem DEPOIS de o criativo existir. Falha numa peça não desfaz
    // o criativo: a pessoa vê o erro e reenvia pela biblioteca.
    if (!editar && pendentes.length) {
      let ok = 0;
      for (let i = 0; i < pendentes.length; i++) {
        setProgresso(`Enviando peça ${i + 1} de ${pendentes.length}…`);
        // O botão conta a porcentagem da peça em voo: "…" parado num vídeo de
        // 30 MB parecia travado.
        const rot = `Enviando ${i + 1} de ${pendentes.length}`;
        try { await enviarPeca(pendentes[i], salvo.id, (p) => setProgresso(`${rot} · ${Math.round(p * 100)}%`)); ok++; }
        catch (e) { toast(`${pendentes[i].name}: ${(e as Error).message}`, "erro"); }
      }
      setProgresso(null);
      if (ok) toast(`${ok} peça${ok > 1 ? "s" : ""} enviada${ok > 1 ? "s" : ""}.`);
    }
    onSalvo(salvo);
  }

  return (
    <PainelLateral
      titulo={editar ? `Editar ${criativo!.prefixo} ${NN(criativo!.numero)}` : "Subir criativo"}
      subtitulo={editar ? `${MESES.find((m) => m.sigla === criativo!.prefixo)?.nome ?? criativo!.prefixo} de ${criativo!.ano}` : "O nome sai sozinho das escolhas abaixo"}
      largura={560}
      centrado
      soFechaNoX
      onFechar={onFechar}
      rodape={(
        <Acoes>
          <Esp />
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar} carregando={salvando || !!progresso}>
            {progresso ?? (editar ? "Salvar" : pendentes.length ? `Subir com ${pendentes.length} peça${pendentes.length > 1 ? "s" : ""}` : "Subir criativo")}
          </Botao>
        </Acoes>
      )}
    >
      <PreviaNome nome={nomeFinal} carregando={buscandoNumero} />

      <Campos min={200}>
        {!editar && (
          <Campo label="Mês" largo>
            <FaixaMeses valor={prefixo} onChange={setPrefixo} />
            {/* O ano é opção, não pergunta: quase sempre é o corrente, e só em
                janeiro alguém ainda sobe criativo de DEZ. Fica numa linha que
                abre os anos só quando alguém toca. */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
                {MESES.find((m) => m.sigla === prefixo)?.nome} de {ano}
              </span>
              {!trocandoAno ? (
                <Botao variante="sutil" onClick={() => setTrocandoAno(true)}>Outro ano</Botao>
              ) : (
                <div role="radiogroup" aria-label="Ano" style={{ display: "flex", gap: 6 }}>
                  {[anoAtual - 1, anoAtual].map((a) => (
                    <button key={a} type="button" role="radio" aria-checked={ano === a} onClick={() => { setAno(a); setTrocandoAno(false); }}
                      style={{ ...chip(ano === a), fontSize: 12.5 }}>
                      {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Campo>
        )}

        {!editar && (
          <Campo label="Número" dica="Já vem no próximo livre do mês.">
            <Passo valor={numero} onChange={setNumero} desativado={buscandoNumero} prefixo={prefixo} />
          </Campo>
        )}

        <Campo label="Variação" largo dica="Opcional. V2, V3 ou um nome. Pra variar um criativo que já existe, use o mesmo número dele.">
          {(id) => (
            <input id={id} value={variacao} onChange={(e) => setVariacao(e.target.value.replace(/[{}]/g, ""))}
              placeholder="Ex.: V2 ou Depoimento" maxLength={30} style={inp} />
          )}
        </Campo>

        <Campo label="Produto" largo erro={erroProduto} sinal={tentativa}>
          <Produtos produtos={produtos} valor={produto} onChange={setProduto}
            onCriado={(p) => { onProdutoCriado?.(p); setProduto(p.nome); }} />
        </Campo>

        <Campo label="Quem fez" largo erro={erroEditor} sinal={tentativa}
          dica={eu.admin ? undefined : "Criativo sobe no seu nome. Pra mudar, peça a um admin."}>
          {eu.admin ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <GlassSelect value={editorSel} onChange={setEditorSel} style={inp}
                options={[
                  { value: eu.id, label: `${eu.nome} (você)` },
                  ...editores.filter((e) => e.id !== eu.id).map((e) => ({ value: e.id, label: e.nome })),
                  { value: OUTROS, label: "Outros" },
                ]} />
              {editorSel === OUTROS && (
                <input value={outroNome} onChange={(e) => setOutroNome(e.target.value)} autoFocus
                  placeholder="Nome de quem fez" aria-label="Nome de quem fez" maxLength={80} style={inp} />
              )}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", padding: "0 12px", borderRadius: 12, background: "var(--surface-2)" }}>
              <Icon name="user-check" size={16} color="var(--primary-texto)" />
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{eu.nome}</span>
            </div>
          )}
        </Campo>

        <Campo label="Peças" largo dica={editar ? "Imagem e vídeo do criativo." : `Opcional, sobem junto. ${textoDosLimites()}.`}>
          {editar ? (
            <BibliotecaCriativo criativoId={criativo!.id} codigo={criativo!.codigo} podeEditar compacta />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input id={idPecas} type="file" multiple style={{ display: "none" }}
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                onChange={(e) => { void escolherPecas([...(e.target.files ?? [])]); e.target.value = ""; }} />
              <label htmlFor={idPecas}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); void escolherPecas([...(e.dataTransfer?.files ?? [])]); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 96, padding: "14px 12px", borderRadius: 14, border: "1.5px dashed var(--border)", cursor: "pointer", fontSize: 13.5, fontWeight: 600, textAlign: "center" }}>
                <Icon name="upload" size={20} color="var(--primary-texto)" />
                Escolher ou arrastar vídeo e imagem
              </label>
              {pendentes.map((f, i) => (
                <div key={`${f.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                  <Icon name={f.type.startsWith("video/") ? "video" : "photo"} size={15} color="var(--text-dim)" />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ color: "var(--text-dim)", flex: "none" }}>{emMB(f.size)}</span>
                  <BotaoIcone icone="x" titulo={`Tirar ${f.name}`} style={{ flex: "none" }} onClick={() => setPendentes((p) => p.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
          )}
        </Campo>
      </Campos>
    </PainelLateral>
  );
}

/**
 * Os produtos como opções, e o "+ Novo produto" no fim: abre nome + tag ali
 * mesmo (a tag já vem sugerida do nome — "Almofada" → ALM) e o produto criado
 * já fica escolhido. Sem sair do formulário, sem perder o que foi preenchido.
 * Exportado: o cadastro de story (Marketing · Stories) escolhe produto com a
 * MESMA peça — é o mesmo cadastro de produtos.
 */
export function Produtos({ produtos, valor, onChange, onCriado }: {
  produtos: ProdutoCriativo[]; valor: string; onChange: (nome: string) => void; onCriado: (p: ProdutoCriativo) => void;
}) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [tag, setTag] = useState("");
  const [tagMexida, setTagMexida] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const tagFinal = tagMexida ? normalizarTag(tag) : sugestaoDeTag(nome);

  async function criar() {
    if (!nome.trim() || !tagFinal) { toast("Dê um nome e uma tag ao produto.", "erro"); return; }
    setEnviando(true);
    const r = await fetch("/api/marketing/criativos/produtos", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome, tag: tagFinal }),
    }).then((x) => x.json()).catch(() => null);
    setEnviando(false);
    if (!r?.ok) {
      toast(r?.error === "produto_existe" ? "Esse produto já existe."
        : r?.error === "tag_existe" ? `A tag {${tagFinal}} já é de outro produto. Escolha outra.`
        : r?.error === "sql_pendente" ? "A lista de produtos ainda não existe no banco. Rode supabase/marketing_criativos_ano_variacao.sql."
        : "Não deu para criar o produto.", "erro");
      return;
    }
    onCriado(r.produto as ProdutoCriativo);
    setCriando(false); setNome(""); setTag(""); setTagMexida(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div role="radiogroup" aria-label="Produto" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 140px), 1fr))" }}>
        {produtos.map((p) => (
          <Opcao key={p.nome} ativo={valor === p.nome} onClick={() => onChange(p.nome)} titulo={p.nome} detalhe={`{${p.tag}}`} />
        ))}
        {!criando && (
          <button type="button" onClick={() => setCriando(true)}
            style={{ minHeight: 56, padding: "8px 12px", borderRadius: 14, cursor: "pointer", border: "1.5px dashed var(--border)", background: "transparent", color: "var(--text-dim)", fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icon name="plus" size={15} color="var(--text-dim)" /> Novo produto
          </button>
        )}
      </div>
      {criando && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "minmax(0, 1fr) 96px" }}>
            <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus maxLength={40}
              placeholder="Nome do produto" aria-label="Nome do produto" style={inp} />
            <input value={tagFinal} onChange={(e) => { setTagMexida(true); setTag(e.target.value); }} maxLength={6}
              placeholder="TAG" aria-label="Tag do produto" style={{ ...inp, textAlign: "center", fontWeight: 800, letterSpacing: "0.04em" }} />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>
            A tag entra no nome do criativo: {tagFinal ? `{${tagFinal}}` : "{…}"}.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Botao onClick={() => { setCriando(false); setNome(""); setTag(""); setTagMexida(false); }}>Cancelar</Botao>
            <Botao variante="primario" onClick={criar} carregando={enviando}>Criar produto</Botao>
          </div>
        </div>
      )}
    </div>
  );
}

/** O nome final, grande, com copiar — é o texto que vai no anúncio da Meta. */
function PreviaNome({ nome, carregando }: { nome: string; carregando: boolean }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try { await navigator.clipboard.writeText(nome); setCopiado(true); setTimeout(() => setCopiado(false), 1400); }
    catch { toast("Não deu pra copiar. Selecione o nome e copie à mão.", "erro"); }
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 14px 14px 16px", marginBottom: 16, borderRadius: 16, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.02em" }}>NOME DO CRIATIVO</div>
        <div className="stat" aria-live="polite"
          style={{ fontSize: 21, lineHeight: 1.2, letterSpacing: "-0.01em", marginTop: 4, color: "var(--text)", wordBreak: "break-word", opacity: carregando ? 0.5 : 1, transition: "opacity var(--duration-fast, 150ms) var(--ease-out, ease)" }}>
          {nome}
        </div>
      </div>
      <BotaoIcone icone="copy" titulo="Copiar nome" variante="secundario" estado={copiado ? "ok" : "ocioso"} onClick={copiar} style={{ flex: "none" }} />
    </div>
  );
}

/**
 * Os doze meses numa grade 6×2: todos à vista, sem rolar. Era uma fileira
 * `.tab-strip`, mas ela só rola no celular — no computador os 745px de meses
 * vazavam da caixa de 522 e quem rolava era o CORPO do pop-up, deslocando o
 * formulário inteiro. A 320px cada mês ainda tem ~44px.
 */
function FaixaMeses({ valor, onChange }: { valor: string; onChange: (s: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Mês" style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
      {MESES.map((m) => (
        <button key={m.sigla} type="button" role="radio" aria-checked={m.sigla === valor} data-mes={m.sigla}
          title={m.nome} onClick={() => onChange(m.sigla)} style={{ ...chip(m.sigla === valor), padding: 0, minWidth: 0 }}>
          {m.sigla}
        </button>
      ))}
    </div>
  );
}

/** − 07 + : número com passo e digitação. */
function Passo({ valor, onChange, desativado, prefixo }: { valor: number; onChange: (n: number) => void; desativado: boolean; prefixo: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <BotaoIcone icone="minus" titulo="Diminuir número" variante="secundario" style={{ flex: "none" }} disabled={desativado || valor <= 1} onClick={() => onChange(Math.max(1, valor - 1))} />
      <input value={NN(valor)} inputMode="numeric" aria-label={`Número do criativo em ${prefixo}`}
        disabled={desativado}
        onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "").slice(-3)); onChange(n >= 1 ? n : 1); }}
        onFocus={(e) => e.target.select()}
        style={{ ...inp, width: 0, flex: 1, minWidth: 56, textAlign: "center", fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums" }} />
      <BotaoIcone icone="plus" titulo="Aumentar número" variante="secundario" style={{ flex: "none" }} disabled={desativado || valor >= 999} onClick={() => onChange(Math.min(999, valor + 1))} />
    </div>
  );
}

function Opcao({ ativo, onClick, titulo, detalhe }: { ativo: boolean; onClick: () => void; titulo: string; detalhe: string }) {
  return (
    <button type="button" role="radio" aria-checked={ativo} onClick={onClick}
      style={{
        minHeight: 56, padding: "8px 12px", borderRadius: 14, cursor: "pointer", textAlign: "left",
        display: "flex", alignItems: "center", gap: 10, minWidth: 0,
        background: ativo ? "var(--surface)" : "transparent",
        border: `1.5px solid ${ativo ? "var(--primary-texto)" : "var(--border)"}`,
        color: "var(--text)",
      }}>
      <span aria-hidden style={{ flex: "none", width: 20, height: 20, borderRadius: 999, display: "grid", placeItems: "center", border: `1.5px solid ${ativo ? "var(--primary-texto)" : "var(--border)"}`, background: ativo ? "var(--primary-texto)" : "transparent" }}>
        {ativo && <Icon name="check" size={12} color="var(--surface, #fff)" />}
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>{detalhe}</span>
      </span>
    </button>
  );
}

const chip = (ativo: boolean): React.CSSProperties => ({
  minHeight: "var(--tap)", padding: "0 12px", borderRadius: 12, cursor: "pointer",
  fontSize: 13.5, fontWeight: 800, letterSpacing: "0.02em", fontVariantNumeric: "tabular-nums",
  background: ativo ? "var(--primary-acao, var(--primary))" : "transparent",
  color: ativo ? "var(--on-primary, #fff)" : "var(--text-dim)",
  border: `1px solid ${ativo ? "transparent" : "var(--border)"}`,
});

// Os controles de vidro (GlassSelect) recebem estilo por prop, não por classe.
const inp: React.CSSProperties = { width: "100%", minHeight: "var(--tap)", fontSize: 14.5 };
