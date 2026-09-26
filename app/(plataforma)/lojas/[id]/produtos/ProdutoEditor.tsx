"use client";

// ── Criar / editar produto ───────────────────────────────────────────────────
// A tela mais completa do módulo, e a que a pessoa mais abre. Duas colunas no
// computador: à esquerda o que o cliente vê (nome, texto, fotos, preço), à
// direita o que a loja decide (status, categoria). No celular vira uma coluna
// só, na mesma ordem — e a barra de ações gruda embaixo, porque um formulário
// desse tamanho rola muito e "Salvar" não pode exigir voltar ao topo.
//
// Duas decisões que valem explicação:
//
// 1. Dinheiro é campo de TEXTO com `inputMode="decimal"`, nunca `type="number"`
//    — a roda do mouse altera o valor sem querer, e o separador decimal muda
//    com a região (a pessoa digita "89,90" e o campo devolve vazio). Quem lê o
//    que foi digitado é `lerValor()`, em lib/lojas.ts, com teste.
//
// 2. A galeria não tem ação escondida no `:hover`. Hover não existe no celular:
//    o que só aparece com o mouse em cima simplesmente não existe pra metade de
//    quem usa. Tocar a foto SELECIONA, e as ações da seleção ficam numa barra
//    visível acima da grade.

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "../../../Icon";
import { GlassSelect } from "../../../GlassPicker";
import { Botao, Campo, Campos, Esp, Caixa } from "../../../ui/controles";
import { confirmar, toast } from "../../../Toast";
import { baseDoModulo } from "../../base";
import { CATEGORIAS_DEMO } from "@/lib/lojas-demo";
import {
  descontoPercentual, lerValor, lucroDe, margemDe, moeda, valorParaCampo, validarProduto,
  type ErrosProduto, type ImagemProduto, type Produto, type StatusProduto,
} from "@/lib/lojas";

const STATUS: { value: StatusProduto; label: string }[] = [
  { value: "ativo", label: "Ativo — à venda na loja" },
  { value: "rascunho", label: "Rascunho — só você vê" },
  { value: "inativo", label: "Inativo — fora da vitrine" },
];

/** Estado do formulário: dinheiro e quantidade vivem como TEXTO enquanto a
 *  pessoa digita ("89," é um estado válido no meio da digitação) e só viram
 *  número na hora de validar e salvar. */
interface Form {
  titulo: string;
  descricao: string;
  imagens: ImagemProduto[];
  preco: string;
  precoPromocional: string;
  custo: string;
  estoque: string;
  venderSemEstoque: boolean;
  sku: string;
  codigoBarras: string;
  categorias: string[];
  status: StatusProduto;
}

const vazio = (): Form => ({
  titulo: "", descricao: "", imagens: [],
  preco: "", precoPromocional: "", custo: "", estoque: "0",
  venderSemEstoque: false, sku: "", codigoBarras: "",
  categorias: [], status: "rascunho",
});

const doProduto = (p: Produto): Form => ({
  titulo: p.titulo,
  descricao: p.descricao,
  imagens: p.imagens,
  preco: valorParaCampo(p.preco),
  precoPromocional: valorParaCampo(p.precoPromocional),
  custo: valorParaCampo(p.custo),
  estoque: String(p.estoque),
  venderSemEstoque: p.venderSemEstoque,
  sku: p.sku,
  codigoBarras: p.codigoBarras,
  categorias: p.categorias,
  status: p.status,
});

export function ProdutoEditor({ lojaId, produto }: { lojaId: string; produto?: Produto }) {
  const router = useRouter();
  const lista = `${baseDoModulo(usePathname())}/${lojaId}/produtos`;
  const editando = !!produto;
  const [f, setF] = useState<Form>(() => (produto ? doProduto(produto) : vazio()));
  const [erros, setErros] = useState<ErrosProduto>({});
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [sujo, setSujo] = useState(false);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((a) => ({ ...a, [k]: v }));
    setSujo(true);
    // O erro do campo some assim que a pessoa mexe nele. Manter a borda vermelha
    // enquanto ela corrige é dizer "ainda está errado" antes de conferir.
    setErros((e) => (k in e ? { ...e, [k]: undefined } : e));
  };

  // ── Números derivados ──────────────────────────────────────────────────────
  const numeros = useMemo(() => ({
    preco: lerValor(f.preco),
    promo: lerValor(f.precoPromocional),
    custo: lerValor(f.custo),
    estoque: lerValor(f.estoque),
  }), [f.preco, f.precoPromocional, f.custo, f.estoque]);

  const conta = useMemo(() => {
    if (numeros.preco == null) return null;
    const base = { preco: numeros.preco, precoPromocional: numeros.promo, custo: numeros.custo };
    return {
      vigente: numeros.promo != null && numeros.promo > 0 && numeros.promo < numeros.preco ? numeros.promo : numeros.preco,
      desconto: descontoPercentual(base),
      lucro: lucroDe(base),
      margem: margemDe(base),
    };
  }, [numeros]);

  // ── Galeria ────────────────────────────────────────────────────────────────
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);            // arquivo pairando sobre a área
  const [sel, setSel] = useState<string | null>(null);  // foto selecionada
  // Ids das fotos ainda subindo. Fica FORA de `Form` de propósito: é estado da
  // rede, não do produto — o que se salva não tem esse campo.
  const [enviando, setEnviando] = useState<Set<string>>(new Set());
  const criados = useRef<string[]>([]);

  // Prévia local: `createObjectURL` mostra a foto NA HORA, antes de o upload
  // terminar. Cada URL criada segura o arquivo na memória até alguém revogar —
  // por isso a lista, e por isso a limpeza no desmonte.
  useEffect(() => () => { criados.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  /**
   * Sobe a foto assim que ela é escolhida, e não no salvar.
   *
   * Subir no salvar significaria uma espera longa no fim, com o botão travado,
   * e — pior — perder as fotos inteiras se o salvar falhasse por causa de um
   * campo de texto. Aqui a prévia aparece de imediato (blob local) e o endereço
   * definitivo entra por baixo quando chega; se o envio falhar, só aquela foto
   * some, com o motivo, e o resto do formulário continua intacto.
   */
  async function adicionar(soltos: FileList | null) {
    const arquivos = [...(soltos ?? [])].filter((a) => a.type.startsWith("image/"));
    if (!arquivos.length) return;
    setSujo(true);

    await Promise.all(arquivos.map(async (arq, i) => {
      const previa = URL.createObjectURL(arq);
      criados.current.push(previa);
      const idLocal = `local-${Date.now().toString(36)}-${i}-${criados.current.length}`;
      setF((a) => ({
        ...a,
        imagens: [...a.imagens, { id: idLocal, url: previa, alt: arq.name.replace(/\.[^.]+$/, "") }],
      }));
      setEnviando((s) => new Set(s).add(idLocal));

      try {
        const corpo = new FormData();
        corpo.append("file", arq);
        const r = await fetch(`/api/lojas/${lojaId}/produtos/upload`, { method: "POST", body: corpo });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Não deu para enviar a foto.");

        // Troca o endereço local pelo definitivo NO LUGAR: a foto não pisca
        // nem pula de posição, e a capa continua sendo quem era.
        setF((a) => ({
          ...a,
          imagens: a.imagens.map((im) => (im.id === idLocal ? { ...im, url: j.url, alt: im.alt || j.alt } : im)),
        }));
      } catch (e) {
        setF((a) => ({ ...a, imagens: a.imagens.filter((im) => im.id !== idLocal) }));
        URL.revokeObjectURL(previa);
        criados.current = criados.current.filter((u) => u !== previa);
        toast.erro((e as Error).message);
      } finally {
        setEnviando((s) => { const n = new Set(s); n.delete(idLocal); return n; });
      }
    }));
  }

  function removerFoto() {
    if (!sel) return;
    const alvo = f.imagens.find((i) => i.id === sel);
    if (alvo && criados.current.includes(alvo.url)) {
      URL.revokeObjectURL(alvo.url);
      criados.current = criados.current.filter((u) => u !== alvo.url);
    }
    setF((a) => ({ ...a, imagens: a.imagens.filter((i) => i.id !== sel) }));
    setSel(null);
    setSujo(true);
  }

  function definirCapa() {
    if (!sel) return;
    setF((a) => {
      const alvo = a.imagens.find((i) => i.id === sel);
      if (!alvo) return a;
      return { ...a, imagens: [alvo, ...a.imagens.filter((i) => i.id !== sel)] };
    });
    setSujo(true);
    toast.ok("Capa trocada. É esta que aparece na vitrine.");
  }

  // ── Categorias ─────────────────────────────────────────────────────────────
  // Botões dentro de um <div>, nunca de um <label>: um <label> em volta de um
  // grupo de botões dispara o PRIMEIRO deles a cada clique no rótulo, e a
  // seleção troca sozinha.
  const alternarCategoria = (c: string) =>
    set("categorias", f.categorias.includes(c) ? f.categorias.filter((x) => x !== c) : [...f.categorias, c]);

  // ── Salvar ─────────────────────────────────────────────────────────────────
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const achados = validarProduto({
      titulo: f.titulo,
      preco: numeros.preco,
      precoPromocional: f.precoPromocional.trim() ? numeros.promo : null,
      custo: f.custo.trim() ? numeros.custo : null,
      estoque: numeros.estoque,
    });
    setErros(achados);
    const chaves = Object.keys(achados) as (keyof ErrosProduto)[];
    if (chaves.length) {
      toast.erro(chaves.length === 1 ? "Falta um campo." : `Faltam ${chaves.length} campos.`);
      // Leva a pessoa até o primeiro problema: num formulário desta altura o
      // erro pode estar três telas acima do botão que ela acabou de apertar.
      document.querySelector<HTMLElement>('[data-erro="1"] input, [data-erro="1"] textarea')?.focus();
      return;
    }
    // Salvar no meio de um envio gravaria o `blob:` — endereço local, válido só
    // nesta aba — e a foto sumiria pra todo mundo. Esperar é o certo, e o botão
    // já fica desabilitado; isto aqui é a segunda linha, pro Enter no campo.
    if (enviando.size) {
      toast.info(enviando.size === 1 ? "Espere a foto terminar de subir." : "Espere as fotos terminarem de subir.");
      return;
    }

    setSalvando(true);
    try {
      const corpo = {
        titulo: f.titulo.trim(),
        descricao: f.descricao,
        imagens: f.imagens,
        preco: numeros.preco!,
        precoPromocional: f.precoPromocional.trim() ? numeros.promo : null,
        custo: f.custo.trim() ? numeros.custo : null,
        estoque: numeros.estoque!,
        venderSemEstoque: f.venderSemEstoque,
        sku: f.sku.trim(),
        codigoBarras: f.codigoBarras.trim(),
        categorias: f.categorias,
        status: f.status,
      };
      const r = await fetch(
        produto ? `/api/lojas/${lojaId}/produtos/${produto.id}` : `/api/lojas/${lojaId}/produtos`,
        { method: produto ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) },
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        // 409 = o supabase/lojas.sql ainda não rodou. É a informação que
        // resolve; "erro ao salvar" mandaria a pessoa procurar no lugar errado.
        toast.erro(r.status === 409 ? (j.detalhe ?? "Rode o supabase/lojas.sql.") : (j.error ?? "Não deu para salvar."));
        return;
      }
      setSujo(false);
      toast.ok(editando ? "Produto atualizado." : "Produto criado.");
      router.push(lista);
      router.refresh();   // a lista vem do servidor: sem isto ela volta igual
    } finally { setSalvando(false); }
  }

  async function descartar() {
    if (sujo && !(await confirmar("Descartar as alterações?", {
      detalhe: "O que você digitou aqui não será salvo.", perigo: true,
    }))) return;
    router.push(lista);
  }

  async function apagar() {
    if (!produto) return;
    // Confirmação nomeando o produto: numa lista de oito "Carimbo
    // Personalizado para…", "Excluir este produto?" não diz qual.
    if (!(await confirmar(`Excluir "${produto.titulo}"?`, {
      detalhe: "Ele sai da vitrine e do catálogo. Os pedidos antigos continuam intactos.",
      perigo: true,
    }))) return;
    setApagando(true);
    try {
      const r = await fetch(`/api/lojas/${lojaId}/produtos/${produto.id}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.erro(r.status === 409 ? (j.detalhe ?? "Rode o supabase/lojas.sql.") : (j.error ?? "Não deu para excluir."));
        return;
      }
      setSujo(false);
      toast.ok("Produto excluído.");
      router.push(lista);
      router.refresh();
    } finally { setApagando(false); }
  }

  return (
    <form onSubmit={salvar}>
      {/* Cabeçalho da tela: voltar + título. O `page-head` da fundação já
          encolhe o título de 32 pra 22px no celular. */}
      <div className="page-head" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Link href={lista} className="ui-btn" data-v="sutil" data-t="sm" data-ico="1" title="Voltar para os produtos" aria-label="Voltar para os produtos">
          <Icon name="chevron-left" size={17} color="var(--text-dim)" />
        </Link>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0 }}>{editando ? f.titulo || "Produto" : "Novo produto"}</h1>
        </div>
      </div>

      <div className="lj-editor">
        {/* ── Coluna principal ────────────────────────────────────────────── */}
        <div className="lj-col">

          <section className="lj-card">
            {/* `.ui-campos` sem colunas inline = uma coluna, com o espaçamento
                padrão entre campos. Título e descrição nunca dividem linha. */}
            <div className="ui-campos">
              <Campo label="Título" erro={erros.titulo} dica="É o nome que aparece na vitrine e na busca.">
                {(id) => (
                  <input id={id} value={f.titulo} onChange={(e) => set("titulo", e.target.value)}
                    placeholder="Carimbo Personalizado para Embalagens"
                    autoCapitalize="sentences" autoCorrect="off" enterKeyHint="next" />
                )}
              </Campo>
              <Campo label="Descrição" dica="O que é, para que serve e o que acompanha.">
                {(id) => (
                  <textarea id={id} rows={5} value={f.descricao} onChange={(e) => set("descricao", e.target.value)}
                    placeholder="Carimbo com a sua logo, feito para marcar sacola, caixa e etiqueta…" />
                )}
              </Campo>
            </div>
          </section>

          {/* ── Mídia ─────────────────────────────────────────────────────── */}
          <section className="lj-card">
            <h2 className="lj-card-titulo">
              <Icon name="photo" size={17} color="var(--text-dim)" /> Fotos do produto
            </h2>

            <div
              className="lj-solta"
              data-sobre={sobre ? "1" : undefined}
              role="button"
              tabIndex={0}
              aria-label="Escolher fotos do produto"
              onClick={() => inputArquivo.current?.click()}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputArquivo.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
              onDragLeave={() => setSobre(false)}
              onDrop={(e) => { e.preventDefault(); setSobre(false); adicionar(e.dataTransfer.files); }}
            >
              <Icon name="upload" size={20} color="var(--text-dim)" />
              <span><strong>Escolher fotos</strong> ou arrastar para cá</span>
              <span style={{ fontSize: 11 }}>A primeira foto é a capa — é ela que aparece na vitrine.</span>
            </div>
            <input ref={inputArquivo} type="file" accept="image/*" multiple hidden
              onChange={(e) => { adicionar(e.target.files); e.target.value = ""; }} />

            {f.imagens.length > 0 && (
              <>
                {/* Ações da seleção: visíveis, nunca no hover. */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)", minWidth: 0 }}>
                    {enviando.size
                      ? `Enviando ${enviando.size} foto${enviando.size > 1 ? "s" : ""}…`
                      : sel ? "Foto selecionada"
                        : `${f.imagens.length} foto${f.imagens.length > 1 ? "s" : ""} — toque numa para agir`}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Botao tamanho="sm" icone="star" disabled={!sel || f.imagens[0]?.id === sel} onClick={definirCapa}>
                      Definir como capa
                    </Botao>
                    <Botao tamanho="sm" variante="perigo" icone="trash" disabled={!sel} onClick={removerFoto}>
                      Remover
                    </Botao>
                  </div>
                </div>

                <div className="lj-galeria">
                  {f.imagens.map((img, i) => {
                    const subindo = enviando.has(img.id);
                    return (
                      <button key={img.id} type="button" className="lj-foto"
                        data-sel={sel === img.id ? "1" : undefined}
                        data-subindo={subindo ? "1" : undefined}
                        aria-pressed={sel === img.id}
                        aria-busy={subindo || undefined}
                        title={subindo ? `Enviando ${img.alt}…` : img.alt}
                        disabled={subindo}
                        onClick={() => setSel(sel === img.id ? null : img.id)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.alt} />
                        {subindo && (
                          <span className="lj-foto-subindo">
                            <Icon name="loader" size={18} color="#fff" className="spin" />
                          </span>
                        )}
                        {i === 0 && !subindo && <span className="lj-foto-capa">Capa</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* ── Preço ─────────────────────────────────────────────────────── */}
          <section className="lj-card">
            <h2 className="lj-card-titulo">
              <Icon name="cash" size={17} color="var(--text-dim)" /> Preço
            </h2>
            <Campos min={150}>
              <Campo label="Preço de venda" erro={erros.preco}>
                {(id) => (
                  <input id={id} value={f.preco} onChange={(e) => set("preco", e.target.value)}
                    inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="R$ 0,00" />
                )}
              </Campo>
              <Campo label="Preço promocional" erro={erros.precoPromocional} dica="Opcional. O “de/por” da vitrine.">
                {(id) => (
                  <input id={id} value={f.precoPromocional} onChange={(e) => set("precoPromocional", e.target.value)}
                    inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="R$ 0,00" />
                )}
              </Campo>
              <Campo label="Custo por item" erro={erros.custo} dica="Não aparece para o cliente.">
                {(id) => (
                  <input id={id} value={f.custo} onChange={(e) => set("custo", e.target.value)}
                    inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="R$ 0,00" />
                )}
              </Campo>
            </Campos>

            {conta && (
              <div className="lj-conta">
                <span>Cliente paga <b style={{ color: "var(--text)" }}>{moeda(conta.vigente)}</b></span>
                {conta.desconto != null && (
                  <span>Desconto <b style={{ color: "var(--ok)" }}>{conta.desconto}%</b></span>
                )}
                {conta.lucro != null && (
                  <span>Lucro <b style={{ color: conta.lucro < 0 ? "var(--perigo)" : "var(--ok)" }}>{moeda(conta.lucro)}</b></span>
                )}
                {/* Vírgula, não ponto: "58.4%" no meio de "R$ 67,70" é a tela
                    falando duas línguas na mesma linha. */}
                {conta.margem != null && (
                  <span>Margem <b style={{ color: conta.margem < 0 ? "var(--perigo)" : "var(--text)" }}>{conta.margem.toFixed(1).replace(".", ",")}%</b></span>
                )}
              </div>
            )}
          </section>

          {/* ── Estoque ───────────────────────────────────────────────────── */}
          <section className="lj-card">
            <h2 className="lj-card-titulo">
              <Icon name="building-warehouse" size={17} color="var(--text-dim)" /> Estoque
            </h2>
            <Campos min={150}>
              <Campo label="Quantidade" erro={erros.estoque}>
                {(id) => (
                  <input id={id} value={f.estoque} onChange={(e) => set("estoque", e.target.value)}
                    inputMode="numeric" autoComplete="off" spellCheck={false} placeholder="0" />
                )}
              </Campo>
              <Campo label="SKU" dica="Seu código interno.">
                {(id) => (
                  <input id={id} value={f.sku} onChange={(e) => set("sku", e.target.value)}
                    autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="CAR-EMB-01" />
                )}
              </Campo>
              <Campo label="Código de barras" dica="EAN, UPC ou GTIN.">
                {(id) => (
                  <input id={id} value={f.codigoBarras} onChange={(e) => set("codigoBarras", e.target.value)}
                    inputMode="numeric" autoCorrect="off" spellCheck={false} autoComplete="off" placeholder="7891000100011" />
                )}
              </Campo>
            </Campos>

            <label style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 13, minHeight: "var(--tap)", cursor: "pointer" }}>
              <Caixa marcado={f.venderSemEstoque} onChange={(marc) => set("venderSemEstoque", marc)} />
              <span style={{ fontSize: 13, color: "var(--text)" }}>
                Continuar vendendo com estoque zerado
                <small style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)" }}>
                  Para produto feito sob encomenda.
                </small>
              </span>
            </label>
          </section>
        </div>

        {/* ── Coluna de decisões ──────────────────────────────────────────── */}
        <div className="lj-col">
          <section className="lj-card">
            <h2 className="lj-card-titulo">
              <Icon name="circle-dot" size={17} color="var(--text-dim)" /> Status
            </h2>
            <Campo label="Situação na loja">
              {(id) => (
                <GlassSelect id={id} value={f.status} options={STATUS}
                  onChange={(v) => set("status", v as StatusProduto)} />
              )}
            </Campo>
          </section>

          <section className="lj-card">
            <h2 className="lj-card-titulo">
              <Icon name="tag" size={17} color="var(--text-dim)" /> Categorias
            </h2>
            <div className="ui-campo-rot">Onde este produto aparece</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              {CATEGORIAS_DEMO.map((c) => {
                const on = f.categorias.includes(c);
                return (
                  <button key={c} type="button" className="ui-btn" data-t="sm"
                    data-v={on ? "primario" : "secundario"} aria-pressed={on}
                    onClick={() => alternarCategoria(c)}>
                    {on && <Icon name="check" size={14} color="var(--on-primary, #fff)" />}
                    {c}
                  </button>
                );
              })}
            </div>
            <p className="ui-campo-dica" style={{ marginTop: 10 }}>
              Sem categoria, o produto só é encontrado pela busca.
            </p>
          </section>
        </div>
      </div>

      {/* ── Ações ────────────────────────────────────────────────────────────
          A ordem no JSX é a de leitura (descartar antes, salvar depois). No
          celular o CSS gruda a barra embaixo e os dois botões dividem a linha. */}
      <div className="lj-barra">
        <Botao onClick={descartar}>Descartar</Botao>
        {editando && (
          <Botao variante="perigo" icone="trash" carregando={apagando} onClick={apagar}>Excluir</Botao>
        )}
        <Esp />
        <Botao type="submit" variante="primario" icone="check" carregando={salvando} disabled={enviando.size > 0}>
          {enviando.size ? "Enviando fotos…" : editando ? "Salvar alterações" : "Salvar produto"}
        </Botao>
      </div>
    </form>
  );
}
