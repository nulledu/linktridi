"use client";

// Cadastro do mercadinho: empresa (unidade), pessoa e produto.
//
// Até aqui o painel só EDITAVA o que o ERP antigo mandava. Com o sistema
// próprio o cadastro nasce aqui, então os três formulários moram juntos: eles
// dividem a mesma folha, o mesmo campo de foto e a mesma regra de inativar.
//
// INATIVAR, nunca apagar — em todos os três. Pessoa, produto e empresa são
// referenciados por vendas e dívidas; apagar de verdade quebraria o histórico
// (e o banco recusa: o razão é imutável). Inativo some das listas e do tablet,
// e o que já aconteceu continua de pé.

import { useEffect, useRef, useState } from "react";
import { LeitorCodigo } from "../ui/LeitorCodigo";
import { Icon } from "../Icon";
import { GlassSelect } from "../GlassPicker";
import { INDIGO, marketRequest } from "./ui";
import { Botao, BotaoIcone, Interruptor, Caixa } from "../ui/controles";
import { centavosDeReais, centavosDoTexto, reaisDeCentavos, reaisInteirosDoTexto, textoDeCentavos, textoDeReaisInteiros } from "../../../lib/tridimarket/moeda";
import { normalizarQuadrada } from "./normalizarFoto";

// ── Peças compartilhadas ────────────────────────────────────────────────────

// Folha: modal no computador, folha presa embaixo no celular (.sheet-host /
// .sheet, do globals.css). `maxHeight` em dvh porque vh no celular inclui a
// barra do navegador e o rodapé nasceria atrás dela.
export function Folha({ titulo, onFechar, children, rodape }: {
  titulo: string; onFechar: () => void; children: React.ReactNode; rodape?: React.ReactNode;
}) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div onClick={onFechar} role="dialog" aria-modal="true" aria-label={titulo} className="sheet-host"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", zIndex: 220, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", width: "min(520px, 100%)", maxHeight: "88dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)", flex: "none" }}>
          <strong style={{ fontSize: 15 }}>{titulo}</strong>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onFechar} />
        </header>
        {/* O corpo rola DENTRO da folha — a página nunca rola atrás dela. */}
        <div style={{ padding: 16, overflowY: "auto", flex: 1, minHeight: 0, display: "grid", gap: 14 }}>{children}</div>
        {rodape ? (
          <footer style={{ display: "flex", gap: 10, justifyContent: "flex-end", padding: "12px 16px", borderTop: "1px solid var(--border)", flex: "none", flexWrap: "wrap" }}>
            {rodape}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

const campoBase: React.CSSProperties = {
  width: "100%", minHeight: "var(--tap)", padding: "10px 12px", borderRadius: "var(--r-sm)",
  border: "1px solid var(--border)", background: "var(--surface-2, var(--surface))",
  color: "inherit", font: "inherit",
};

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12, opacity: .75 }}>{rotulo}</span>
      {children}
      {dica ? <span style={{ fontSize: 11, opacity: .6 }}>{dica}</span> : null}
    </label>
  );
}

export function Texto(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...campoBase, ...props.style }} />;
}

// Foto/logo: escolhe do aparelho e sobe pro Storage (/api/upload). No celular
// o mesmo botão abre a câmera, porque `accept="image/*"` já oferece isso.
//
// `quadrada` só vale pra FOTO DE PRODUTO: a imagem é normalizada em 1000×1000
// com a embalagem inteira e fundo branco. Retrato de pessoa NÃO usa isso — o
// avatar é redondo e recortado (`cover`), então a margem branca do encaixe
// apareceria dentro do círculo.
export function FotoUpload({ url, onChange, bucket = "photos", redondo = true, rotulo = "Foto", quadrada = false }: {
  url: string | null; onChange: (url: string | null) => void; bucket?: "photos" | "branding";
  redondo?: boolean; rotulo?: string; quadrada?: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subindo, setSubindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(arquivo: File) {
    setErro(null); setSubindo(true);
    try {
      const form = new FormData();
      // Quadrado de 1000×1000 com a embalagem inteira: o corte acontecia na
      // exibição, mas a causa era a foto chegar em qualquer proporção.
      form.append("file", quadrada ? await normalizarQuadrada(arquivo) : arquivo);
      form.append("bucket", bucket);
      const r = await fetch("/api/upload", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Falha ao enviar a imagem.");
      onChange(String(j.url));
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao enviar a imagem."); }
    finally { setSubindo(false); }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{
        width: 68, height: 68, flex: "none", borderRadius: redondo ? "50%" : 14,
        border: "1px solid var(--border)", background: "var(--surface-2, var(--surface))",
        display: "grid", placeItems: "center", overflow: "hidden",
      }}>
        {url
          // eslint-disable-next-line @next/next/no-img-element -- URL de bucket público, sem loader do Next
          ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: quadrada ? "contain" : "cover", background: quadrada ? "#fff" : undefined }} />
          : <Icon name="photo" size={22} color="var(--muted, #888)" />}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Botao icone="upload" onClick={() => entrada.current?.click()} carregando={subindo}>
            {subindo ? "Enviando…" : url ? `Trocar ${rotulo.toLowerCase()}` : `Escolher ${rotulo.toLowerCase()}`}
          </Botao>
          {url ? (
            <Botao variante="perigo" onClick={() => onChange(null)}>Remover</Botao>
          ) : null}
        </div>
        {erro ? <span style={{ fontSize: 11, color: "var(--neg, var(--perigo))" }}>{erro}</span> : null}
      </div>
      <input ref={entrada} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviar(f); e.target.value = ""; }} />
    </div>
  );
}

// Linha de "está ativo?" — a mesma nos três formulários, com o aviso de que
// inativar não apaga nada.
function LinhaAtivo({ ativo, onChange, oQue }: { ativo: boolean; onChange: (v: boolean) => void; oQue: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "var(--r-sm)" }}>
      <div style={{ display: "grid", gap: 2 }}>
        <strong style={{ fontSize: 13 }}>{ativo ? "Ativo" : "Inativo"}</strong>
        <span style={{ fontSize: 11, opacity: .65 }}>
          {ativo ? `Aparece no tablet e nas listas.` : `Some do tablet e das listas. O histórico ${oQue} continua.`}
        </span>
      </div>
      <Botao variante={ativo ? "perigo" : "secundario"} onClick={() => onChange(!ativo)}>
        {ativo ? "Inativar" : "Reativar"}
      </Botao>
    </div>
  );
}

// Chave liga/desliga — o `Interruptor` do kit (role="switch", alcançável por
// Tab e anunciado pelo leitor de tela), na cor do mercadinho.
export function Toggle({ ligado, onChange, rotulo, dica, disabled }: {
  ligado: boolean; onChange: (v: boolean) => void; rotulo: React.ReactNode; dica?: string; disabled?: boolean;
}) {
  return <Interruptor ligado={ligado} onChange={onChange} rotulo={rotulo} dica={dica} desativado={disabled} cor={INDIGO} />;
}

// Categoria como grade de cards com foto, no lugar do <select>. Num <select> a
// pessoa precisa lembrar o nome da prateleira; com a foto ela reconhece de
// relance — e é o mesmo reconhecimento visual que o tablet usa.
// minmax(min(100%, …)) pra virar uma coluna sozinho a 320px.
function GradeCategorias({ categorias, valor, onChange }: {
  categorias: Categoria[]; valor: number | null; onChange: (id: number | null) => void;
}) {
  const cartao = (sel: boolean): React.CSSProperties => ({
    display: "grid", gap: 6, justifyItems: "center", padding: "10px 6px", borderRadius: "var(--r-sm)",
    minHeight: "var(--tap)", cursor: "pointer", background: sel ? `color-mix(in srgb, ${INDIGO} 10%, transparent)` : "transparent",
    border: `1px solid ${sel ? INDIGO : "var(--border)"}`, color: "inherit", textAlign: "center",
  });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 92px), 1fr))", gap: 8 }}>
      <button type="button" onClick={() => onChange(null)} style={cartao(valor == null)}>
        <span style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", display: "grid", placeItems: "center", background: "var(--surface-2, var(--surface))", border: "1px solid var(--border)" }}>
          <Icon name="layout-grid" size={18} color="var(--text-dim)" />
        </span>
        <span style={{ fontSize: 11.5, lineHeight: 1.2 }}>Sem categoria</span>
      </button>
      {categorias.map((c) => {
        const sel = valor === c.id;
        return (
          <button key={c.id} type="button" onClick={() => onChange(c.id)} style={cartao(sel)} title={c.nome}>
            <span style={{ width: 44, height: 44, borderRadius: "var(--r-sm)", overflow: "hidden", display: "grid", placeItems: "center", background: "var(--surface-2, var(--surface))", border: "1px solid var(--border)" }}>
              {c.imagemUrl
                // eslint-disable-next-line @next/next/no-img-element -- foto da categoria vem do nosso bucket, sem otimização de rota
                ? <img src={c.imagemUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                : <Icon name="photo" size={18} color="var(--text-dim)" />}
            </span>
            <span style={{ fontSize: 11.5, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{c.nome}</span>
          </button>
        );
      })}
    </div>
  );
}

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <div role="alert" style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: "var(--r-sm)", background: "color-mix(in srgb, var(--neg, var(--perigo)) 12%, transparent)", fontSize: 12 }}>
      <Icon name="alert-triangle" size={16} color="var(--neg, var(--perigo))" />
      <span>{texto}</span>
    </div>
  );
}

// Traduz o erro cru da API pra uma frase que diz o que fazer.
function frase(mensagem: string): string {
  if (/codigo_precisa_6_digitos/.test(mensagem)) return "O código precisa ter exatamente 6 dígitos — o tablet só envia o login quando junta seis.";
  if (/codigo_em_uso/.test(mensagem)) return "Esse código já é de outra pessoa. Dois cadastros com o mesmo código deixam o login ambíguo e o tablet recusa os dois.";
  if (/codigo_barras_em_uso/.test(mensagem)) return "Esse código de barras já é de outro produto.";
  if (/estoque_em_aberto/.test(mensagem)) return "Não dá pra tirar o produto de uma empresa que ainda tem estoque dele — zere o estoque lá primeiro (aba Estoque). O resto das mudanças foi salvo.";
  if (/ultima_unidade_ativa/.test(mensagem)) return "Esta é a última empresa ativa. Sem nenhuma, o tablet fica sem estoque e o painel sem escopo — crie outra antes de inativar esta.";
  if (/invalid_employee|invalid_product|invalid_unit/.test(mensagem)) return "Faltou preencher algum campo obrigatório.";
  return mensagem;
}

export type Unidade = { id: string; nome: string; descricao?: string | null; cnpj?: string | null; logo_url?: string | null; ativo: boolean };
// Opção vinda do banco aberto de produtos (Open Food Facts), pela busca por nome.
type Sugestao = { codigo: string; nome: string; marca: string | null; imagemUrl: string | null; thumbUrl: string | null };
type UsuarioGaius = { id: string; nome: string; email: string | null; fotoUrl: string | null; vinculadoA: string | null };

// ── Empresa (unidade) ───────────────────────────────────────────────────────

export function ModalEmpresa({ empresa, onFechar, onSalvo }: {
  empresa: Unidade | null; onFechar: () => void; onSalvo: () => void;
}) {
  const editando = !!empresa;
  const [nome, setNome] = useState(empresa?.nome ?? "");
  const [descricao, setDescricao] = useState(empresa?.descricao ?? "");
  const [cnpj, setCnpj] = useState(empresa?.cnpj ?? "");
  const [logo, setLogo] = useState<string | null>(empresa?.logo_url ?? null);
  const [ativo, setAtivo] = useState(empresa?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null); setSalvando(true);
    try {
      if (editando) {
        await marketRequest("unidades", {
          method: "PATCH",
          body: JSON.stringify({ id: empresa!.id, nome: nome.trim(), descricao: descricao.trim() || null, cnpj: cnpj.trim() || null, logoUrl: logo, ativo }),
        });
      } else {
        await marketRequest("unidades", {
          method: "POST",
          body: JSON.stringify({ nome: nome.trim(), descricao: descricao.trim() || undefined, cnpj: cnpj.trim() || undefined, logoUrl: logo }),
        });
      }
      onSalvo(); onFechar();
    } catch (e) { setErro(frase(e instanceof Error ? e.message : "Não foi possível salvar.")); }
    finally { setSalvando(false); }
  }

  return (
    <Folha titulo={editando ? "Editar empresa" : "Nova empresa"} onFechar={onFechar} rodape={
      <>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={() => void salvar()} carregando={salvando} disabled={nome.trim().length < 2}>
          {salvando ? "Salvando…" : editando ? "Salvar" : "Cadastrar"}
        </Botao>
      </>
    }>
      <Erro texto={erro} />
      <Campo rotulo="Logo da empresa">
        <FotoUpload url={logo} onChange={setLogo} bucket="branding" redondo={false} rotulo="Logo" />
      </Campo>
      <Campo rotulo="Nome">
        <Texto value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Tridi Escritório" autoFocus />
      </Campo>
      <Campo rotulo="Descrição" dica="Opcional — ajuda a diferenciar unidades parecidas.">
        <Texto value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Mercadinho do escritório" />
      </Campo>
      <Campo rotulo="CNPJ" dica="Opcional.">
        <Texto value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" inputMode="numeric" />
      </Campo>
      {editando ? <LinhaAtivo ativo={ativo} onChange={setAtivo} oQue="de vendas" /> : null}
    </Folha>
  );
}

// ── Pessoa ──────────────────────────────────────────────────────────────────

export type PessoaEdicao = {
  id: number; nome: string; fotoUrl: string | null; unidadeId: string;
  ativo: boolean; limiteProprio: number | null; usuarioId: string | null;
};

export function ModalPessoa({ pessoa, unidades, unidadePadrao, onFechar, onSalvo }: {
  pessoa: PessoaEdicao | null; unidades: Unidade[]; unidadePadrao?: string; onFechar: () => void; onSalvo: () => void;
}) {
  const editando = !!pessoa;
  const [nome, setNome] = useState(pessoa?.nome ?? "");
  const [foto, setFoto] = useState<string | null>(pessoa?.fotoUrl ?? null);
  // `||` e não `??`: o filtro do topo manda "" quando está em "Todas as
  // empresas", e `??` só troca null/undefined — o estado nascia string vazia
  // enquanto o select MOSTRAVA a primeira empresa. Resultado: "Cadastrar"
  // desabilitado pra sempre, sem nada na tela explicando. Era este o bug de
  // "clico e nunca adiciona".
  const [unidadeId, setUnidadeId] = useState(pessoa?.unidadeId || unidadePadrao || unidades[0]?.id || "");
  const [codigo, setCodigo] = useState("");
  // Limite em reais inteiros: 100 é cem reais. Com a máscara de centavos que
  // havia aqui, "100" virava R$ 1,00 e ninguém via.
  const [limite, setLimite] = useState(pessoa?.limiteProprio != null ? textoDeReaisInteiros(pessoa.limiteProprio) : "");
  const [usuarioId, setUsuarioId] = useState<string>(pessoa?.usuarioId ?? "");
  const [ativo, setAtivo] = useState(pessoa?.ativo ?? true);
  const [usuarios, setUsuarios] = useState<UsuarioGaius[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A lista de empresas costuma chegar DEPOIS que a folha abriu. Sem isto o
  // estado ficaria vazio mesmo com o select já preenchido — mesmo sintoma.
  useEffect(() => {
    if (!unidadeId && unidades.length) setUnidadeId(unidades[0].id);
  }, [unidades, unidadeId]);

  useEffect(() => {
    const atual = pessoa?.usuarioId ? `?atual=${encodeURIComponent(pessoa.usuarioId)}` : "";
    marketRequest<UsuarioGaius[]>(`usuarios${atual}`).then(setUsuarios).catch(() => setUsuarios([]));
  }, [pessoa?.usuarioId]);

  // Vincular ao usuário do Gaius traz a FOTO dele junto (vem do Ponto, onde
  // quase todo mundo já se cadastrou com selfie) e o nome, se ainda estiver
  // vazio. Só preenche o que está em branco: nunca troca a foto que a pessoa
  // acabou de escolher nem o nome que ela digitou.
  function vincular(id: string) {
    setUsuarioId(id);
    const u = usuarios.find((x) => x.id === id);
    if (!u) return;
    if (u.fotoUrl) setFoto((atual) => atual ?? u.fotoUrl);
    setNome((atual) => atual.trim() ? atual : u.nome);
  }

  async function salvar() {
    setErro(null); setSalvando(true);
    const limiteReais = limite.trim() ? reaisInteirosDoTexto(limite) : null;
    try {
      if (editando) {
        const corpo: Record<string, unknown> = {
          id: pessoa!.id, nome: nome.trim(), active: ativo, fotoUrl: foto,
          usuarioId: usuarioId || null,
        };
        if (unidadeId && unidadeId !== pessoa!.unidadeId) corpo.unidadeId = unidadeId;
        if (limiteReais != null) corpo.normalLimit = limiteReais;
        if (codigo.trim()) corpo.pin = codigo.trim();
        await marketRequest("employees", { method: "PATCH", body: JSON.stringify(corpo) });
      } else {
        await marketRequest("employees", {
          method: "PUT",
          body: JSON.stringify({
            nome: nome.trim(), unidadeId, codigo: codigo.trim(), fotoUrl: foto,
            limiteProprio: limiteReais, usuarioId: usuarioId || null,
          }),
        });
      }
      onSalvo(); onFechar();
    } catch (e) { setErro(frase(e instanceof Error ? e.message : "Não foi possível salvar.")); }
    finally { setSalvando(false); }
  }

  const codigoInvalido = codigo.trim().length > 0 && !/^\d{6}$/.test(codigo.trim());
  const podeSalvar = nome.trim().length >= 2 && !!unidadeId && !codigoInvalido;

  return (
    <Folha titulo={editando ? "Editar pessoa" : "Nova pessoa"} onFechar={onFechar} rodape={
      <>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={() => void salvar()} carregando={salvando} disabled={!podeSalvar}>
          {salvando ? "Salvando…" : editando ? "Salvar" : "Cadastrar"}
        </Botao>
      </>
    }>
      <Erro texto={erro} />
      {/* Sem empresa não dá pra cadastrar (a dívida precisa de onde cair) e o
          botão nasce desabilitado. Antes isso acontecia MUDO: clicava e nada. */}
      {!unidades.length ? <Erro texto="Nenhuma empresa carregada — sem ela não dá pra cadastrar ninguém. Atualize a página; se continuar, cadastre uma empresa na aba Empresas." /> : null}
      <Campo rotulo="Foto">
        <FotoUpload url={foto} onChange={setFoto} rotulo="Foto" />
      </Campo>
      <Campo rotulo="Nome">
        <Texto value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" autoFocus />
      </Campo>
      <Campo rotulo="Empresa" dica={editando
        ? "Onde a dívida dela cai daqui pra frente. O que já foi comprado continua na empresa de origem."
        : "Onde a dívida dela é cobrada. Ela pode comprar em qualquer tablet."}>
        <GlassSelect value={unidadeId} onChange={setUnidadeId} style={campoBase}
          options={unidades.filter((u) => u.ativo || u.id === unidadeId).map((u) => ({ value: u.id, label: u.nome }))} />
      </Campo>
      <Campo
        rotulo={editando ? "Trocar o código de acesso" : "Código de acesso"}
        dica="Exatamente 6 dígitos — é o que ela digita no tablet. O teclado só envia o login com seis."
      >
        <Texto value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder={editando ? "deixe vazio pra manter" : "000000"} inputMode="numeric"
          style={codigoInvalido ? { borderColor: "var(--neg, var(--perigo))" } : undefined} />
      </Campo>
      <Campo rotulo="Limite próprio" dica="Em reais inteiros — digite 500 pra R$ 500. Vazio = usa o limite padrão do sistema.">
        <Texto value={limite} onChange={(e) => setLimite(textoDeReaisInteiros(reaisInteirosDoTexto(e.target.value)))}
          placeholder="R$ 500" inputMode="numeric" />
      </Campo>
      <Campo rotulo="Usuário do Gaius" dica="Vincular faz ela ver a própria dívida ao entrar no sistema — e já traz a foto dela. Opcional.">
        <GlassSelect value={usuarioId} onChange={vincular} style={campoBase}
          options={[
            { value: "", label: "Sem vínculo" },
            ...usuarios.map((u) => ({
              value: u.id,
              label: `${u.nome}${u.vinculadoA ? ` — já é ${u.vinculadoA}` : ""}`,
              disabled: !!u.vinculadoA,
            })),
          ]} />
      </Campo>
      {editando ? <LinhaAtivo ativo={ativo} onChange={setAtivo} oQue="de compras dela" /> : null}
    </Folha>
  );
}

// ── Importar todo mundo do Gaius de uma vez ─────────────────────────────────
//
// Cadastrar dezenas de pessoas uma por uma é trabalho que ninguém termina — e
// enquanto não termina, o tablet não serve pra ninguém. O Gaius já tem a lista.

export function ModalImportar({ unidades, unidadePadrao, onFechar, onImportado }: {
  unidades: Unidade[]; unidadePadrao?: string; onFechar: () => void; onImportado: (quantos: number) => void;
}) {
  const [unidadeId, setUnidadeId] = useState(unidadePadrao || unidades[0]?.id || "");
  useEffect(() => { if (!unidadeId && unidades.length) setUnidadeId(unidades[0].id); }, [unidades, unidadeId]);
  const [pendentes, setPendentes] = useState<Array<{ id: string; nome: string }> | null>(null);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    marketRequest<{ pendentes: Array<{ id: string; nome: string }>; totalUsuarios: number }>("importar-usuarios")
      .then((r) => setPendentes(r.pendentes))
      .catch((e) => setErro(e instanceof Error ? e.message : "Não foi possível ler os usuários."));
  }, []);

  async function importar() {
    setErro(null); setImportando(true);
    try {
      const r = await marketRequest<{ criados: number }>("importar-usuarios", {
        method: "POST", body: JSON.stringify({ unidadeId }),
      });
      onImportado(r.criados); onFechar();
    } catch (e) { setErro(frase(e instanceof Error ? e.message : "Não foi possível importar.")); }
    finally { setImportando(false); }
  }

  const quantos = pendentes?.length ?? 0;

  return (
    <Folha titulo="Importar pessoas do Gaius" onFechar={onFechar} rodape={
      <>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={() => void importar()} carregando={importando} disabled={!quantos || !unidadeId}>
          {importando ? "Importando…" : `Criar ${quantos} conta${quantos === 1 ? "" : "s"}`}
        </Botao>
      </>
    }>
      <Erro texto={erro} />
      <Campo rotulo="Empresa" dica="Onde a dívida de todas elas vai cair. Dá pra mudar depois, uma a uma.">
        <GlassSelect value={unidadeId} onChange={setUnidadeId} style={campoBase}
          options={unidades.filter((u) => u.ativo || u.id === unidadeId).map((u) => ({ value: u.id, label: u.nome }))} />
      </Campo>

      {pendentes === null ? <span style={{ fontSize: 13, opacity: .7 }}>Lendo os usuários do Gaius…</span>
        : quantos === 0 ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <Icon name="circle-check" size={18} color="var(--tf-pos, #30a46c)" />
            Todo mundo do Gaius já tem conta aqui. Nada a importar.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13 }}>
              <strong>{quantos}</strong> {quantos === 1 ? "pessoa ainda não tem" : "pessoas ainda não têm"} conta no mercadinho.
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 10, display: "grid", gap: 6 }}>
              {pendentes.map((p) => <span key={p.id} style={{ fontSize: 12.5 }}>{p.nome}</span>)}
            </div>
            {/* Sem código de acesso de propósito — ver o comentário da rota. */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, opacity: .75 }}>
              <Icon name="info-circle" size={16} />
              <span>As contas nascem <strong>sem código de acesso</strong>. Quem for usar o tablet você dá o código depois, aqui na lista de Pessoas — código sorteado que ninguém sabe não serve pra nada.</span>
            </div>
          </>
        )}
    </Folha>
  );
}

// ── Produto ─────────────────────────────────────────────────────────────────

export type ProdutoEdicao = {
  id: number; nome: string; imagemUrl: string | null; preco: number;
  ativo: boolean; semCodigo: boolean; ocultoBusca?: boolean; minimo?: number | null;
  unidades?: string[];          // empresas em que ele já existe
  codigoBarras?: string | null;
  categoriaId?: number | null;
};

type Categoria = { id: number; nome: string; imagemUrl?: string | null };

export function ModalProduto({ produto, unidadeId, unidades, onFechar, onSalvo }: {
  produto: ProdutoEdicao | null; unidadeId: string; unidades: Unidade[]; onFechar: () => void; onSalvo: () => void;
}) {
  const editando = !!produto;
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [imagem, setImagem] = useState<string | null>(produto?.imagemUrl ?? null);
  const [preco, setPreco] = useState(produto ? textoDeCentavos(centavosDeReais(produto.preco)) : "");
  const [custo, setCusto] = useState("");
  const [codigoBarras, setCodigoBarras] = useState(produto?.codigoBarras ?? "");
  const [estoque, setEstoque] = useState("0");
  const [minimo, setMinimo] = useState(String(produto?.minimo ?? 5));
  const [semCodigo, setSemCodigo] = useState(produto?.semCodigo ?? false);
  const [ocultoBusca, setOcultoBusca] = useState(produto?.ocultoBusca ?? false);
  // Nomes dos produtos que já usam o código digitado. Não-nulo = aviso na tela.
  const [conflitoCodigo, setConflitoCodigo] = useState<string[] | null>(null);
  const [unidade, setUnidade] = useState(unidadeId || unidades[0]?.id || "");
  // Na edição, as marcadas são as empresas em que o produto REALMENTE está —
  // não a empresa que estava filtrada na tela. Sem isso, salvar tiraria o
  // produto de todas as outras sem ninguém ter pedido.
  const [empresasMarcadas, setEmpresasMarcadas] = useState<string[]>(
    produto?.unidades?.length ? [...produto.unidades] : (unidadeId ? [unidadeId] : []),
  );
  const unidadesAtivas = unidades.filter((u) => u.ativo || u.id === unidade);
  const todasMarcadas = unidadesAtivas.length > 0 && unidadesAtivas.every((u) => empresasMarcadas.includes(u.id));
  // Mesmo cuidado do cadastro de pessoa: a lista chega depois de a folha abrir.
  useEffect(() => {
    if (!unidade && unidades.length) setUnidade(unidades[0].id);
    if (!empresasMarcadas.length && unidades.length) setEmpresasMarcadas([unidadeId || unidades[0].id]);
  }, [unidades, unidade, unidadeId, empresasMarcadas.length]);
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [buscandoFoto, setBuscandoFoto] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [buscandoNome, setBuscandoNome] = useState(false);
  // Código que veio da busca por NOME (não da embalagem). Fica marcado até
  // alguém digitar ou bipar: um EAN errado faz o tablet achar outro produto.
  const [codigoSugerido, setCodigoSugerido] = useState(false);
  const [lendoCodigo, setLendoCodigo] = useState(false);
  // Categoria (bebidas, congelados...). A lista vem do banco, não do código:
  // prateleira é coisa que muda com o tempo e quem sabe quais existem é quem
  // cuida do mercadinho.
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaId, setCategoriaId] = useState<number | null>(produto?.categoriaId ?? null);
  const [novaCategoria, setNovaCategoria] = useState("");
  const ultimoCodigo = useRef("");

  useEffect(() => { (async () => {
    try { setCategorias(await marketRequest<Categoria[]>("categorias")); } catch { /* segue sem lista */ }
  })(); }, []);

  // Criar a categoria na hora, sem sair do cadastro do produto: obrigar a ir
  // noutra tela pra criar "Congelados" faz a pessoa desistir e salvar sem
  // categoria — que é exatamente o estado que estamos tentando sair.
  async function criarCategoria() {
    const nome = novaCategoria.trim();
    if (nome.length < 2) return;
    try {
      const c = await marketRequest<Categoria>("categorias", { method: "POST", body: JSON.stringify({ nome }) });
      setCategorias((xs) => (xs.some((x) => x.id === c.id) ? xs : [...xs, c].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))));
      setCategoriaId(c.id);
      setNovaCategoria("");
    } catch { /* mantém o texto pra tentar de novo */ }
  }

  // Um caminho só pra digitado E bipado: se a câmera tivesse a própria versão,
  // uma das duas ia esquecer de limpar o aviso de "código sugerido" ou de puxar
  // a foto — e o comportamento mudaria conforme como a pessoa preencheu.
  function aplicarCodigo(bruto: string) {
    const limpo = bruto.replace(/\D/g, "");
    setCodigoBarras(limpo);
    setCodigoSugerido(false);   // digitou/bipou: agora é código de verdade
    // Assim que o código fica completo (EAN-8/12/13), busca foto e nome
    // sozinho — digitar o nome e fotografar cada embalagem é o que faz um
    // catálogo nunca sair do papel.
    if (limpo.length >= 8) void puxarDoCodigo(limpo);
  }
  const timerBusca = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Busca por NOME, com espera de 450ms depois da última tecla — sem isso
  // seria uma chamada por letra digitada.
  function agendarBusca(texto: string) {
    if (timerBusca.current) clearTimeout(timerBusca.current);
    const termo = texto.trim();
    if (termo.length < 3) { setSugestoes([]); setBuscandoNome(false); return; }
    setBuscandoNome(true);
    timerBusca.current = setTimeout(async () => {
      try { setSugestoes(await marketRequest<Sugestao[]>(`foto-produto?nome=${encodeURIComponent(termo)}`)); }
      catch { setSugestoes([]); }
      finally { setBuscandoNome(false); }
    }, 450);
  }
  useEffect(() => () => { if (timerBusca.current) clearTimeout(timerBusca.current); }, []);

  // Escolheu uma opção: adota nome e código, e traz a foto pro nosso bucket
  // (aqui sim vale copiar — é UMA imagem, a que vai ser usada de verdade).
  async function usarSugestao(s: Sugestao) {
    setNome(s.marca && !s.nome.toLowerCase().startsWith(s.marca.toLowerCase()) ? `${s.marca} ${s.nome}` : s.nome);
    setCodigoBarras(s.codigo);
    setCodigoSugerido(true);   // pinta o aviso: veio da busca, não da embalagem
    setSemCodigo(false);
    setSugestoes([]);
    // Copia a imagem GRANDE pela URL, em vez de buscar de novo pelo código: o
    // que a pessoa olhou e aprovou foi a foto, e o código da sugestão pode não
    // ser o do produto que ela tem na mão.
    if (!imagem && s.imagemUrl) {
      setBuscandoFoto(true);
      try {
        const r = await marketRequest<{ imagemUrl: string | null }>(`foto-produto?copiar=${encodeURIComponent(s.imagemUrl)}`);
        if (r?.imagemUrl) setImagem(r.imagemUrl);
      } catch { /* sem foto, segue */ }
      finally { setBuscandoFoto(false); }
    }
  }

  // Foto e nome pelo código de barras (Open Food Facts, copiado pro nosso
  // bucket). Só PREENCHE o que está vazio: nunca sobrescreve o que a pessoa
  // digitou nem uma foto que ela já escolheu.
  async function puxarDoCodigo(codigo: string) {
    if (ultimoCodigo.current === codigo) return;
    ultimoCodigo.current = codigo;
    setBuscandoFoto(true);
    try {
      const achado = await marketRequest<{ nome: string | null; imagemUrl: string | null } | null>(`foto-produto?codigo=${codigo}`);
      if (achado?.imagemUrl) setImagem((atual) => atual ?? achado.imagemUrl);
      if (achado?.nome) setNome((atual) => atual.trim() ? atual : achado.nome!);
    } catch { /* achar foto é um bônus, nunca um bloqueio */ }
    finally { setBuscandoFoto(false); }
  }

  // `repetirCodigo` só vem true depois de a pessoa confirmar no aviso: repetir
  // código de barras é permitido, mas nunca por acidente. Um EAN digitado
  // errado que calhe de ser o de outro produto criaria um empate silencioso —
  // e aí o tablet passa a perguntar qual é dos dois em toda leitura.
  async function salvar(repetirCodigo = false) {
    setErro(null); setConflitoCodigo(null); setSalvando(true);
    const precoReais = reaisDeCentavos(centavosDoTexto(preco));
    try {
      if (editando) {
        await marketRequest("products", {
          method: "PATCH",
          body: JSON.stringify({
            id: produto!.id, profileId: unidade, profileIds: empresasMarcadas,
            name: nome.trim(), price: precoReais, codigoBarras: codigoBarras.trim(),
            active: ativo, imageUrl: imagem, semCodigo, ocultoBusca: semCodigo ? false : ocultoBusca, minimumStock: Number(minimo) || 0,
            categoriaId, permitirCodigoRepetido: repetirCodigo,
          }),
        });
      } else {
        await marketRequest("products", {
          method: "POST",
          body: JSON.stringify({
            nome: nome.trim(), profileId: unidade, profileIds: empresasMarcadas, preco: precoReais,
            custo: custo.trim() ? reaisDeCentavos(centavosDoTexto(custo)) : null,
            codigoBarras: codigoBarras.trim() || null, imagemUrl: imagem,
            semCodigo, ocultoBusca: semCodigo ? false : ocultoBusca, estoque: Number(estoque) || 0, minimo: Number(minimo) || 0,
            categoriaId, permitirCodigoRepetido: repetirCodigo,
          }),
        });
      }
      onSalvo(); onFechar();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar.";
      const corpo = (e as Error & { payload?: { jaUsadoPor?: string[] } }).payload;
      // Código repetido não é erro final: é uma pergunta.
      if (/codigo_barras_em_uso/.test(msg)) setConflitoCodigo(corpo?.jaUsadoPor ?? []);
      else setErro(frase(msg));
    }
    finally { setSalvando(false); }
  }

  const podeSalvar = nome.trim().length >= 2 && empresasMarcadas.length > 0 && centavosDoTexto(preco) >= 0 && preco.trim().length > 0;

  return (
    <Folha titulo={editando ? "Editar produto" : "Novo produto"} onFechar={onFechar} rodape={
      <>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={() => void salvar(false)} carregando={salvando} disabled={!podeSalvar}>
          {salvando ? "Salvando…" : editando ? "Salvar" : "Cadastrar"}
        </Botao>
      </>
    }>
      <Erro texto={erro} />
      {conflitoCodigo ? (
        <div style={{ display: "grid", gap: 10, padding: 12, borderRadius: "var(--r-sm)", border: "1px solid var(--warn, var(--atencao))", background: "color-mix(in srgb, var(--warn, var(--atencao)) 10%, transparent)" }}>
          <span style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
            <Icon name="alert-triangle" size={16} color="var(--warn, var(--atencao))" />
            <span>
              Esse código de barras já é {conflitoCodigo.length ? <>de <strong>{conflitoCodigo.join(", ")}</strong></> : "de outro produto"}.
              <span style={{ display: "block", fontSize: 11.5, opacity: .75, marginTop: 3 }}>
                Se salvar assim, o tablet vai perguntar qual dos produtos é a cada leitura desse código. Só faz sentido se for de propósito.
              </span>
            </span>
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Botao tamanho="sm" onClick={() => setConflitoCodigo(null)}>
              Corrigir o código
            </Botao>
            <Botao variante="primario" tamanho="sm" onClick={() => void salvar(true)} carregando={salvando}>
              {salvando ? "Salvando…" : "Repetir mesmo assim"}
            </Botao>
          </div>
        </div>
      ) : null}
      {!unidades.length ? <Erro texto="Nenhuma empresa carregada — preço e estoque são por empresa. Atualize a página; se continuar, cadastre uma empresa na aba Empresas." /> : null}
      <Campo rotulo="Nome do produto" dica={editando ? undefined : "Digite e escolha abaixo pra preencher código de barras e foto de uma vez."}>
        <Texto value={nome} placeholder="Coca-Cola 350ml" autoFocus
          onChange={(e) => { setNome(e.target.value); if (!editando) agendarBusca(e.target.value); }} />
      </Campo>
      {/* Sugestões pelo NOME: pro produto que está na mão sem código legível
          (embalagem amassada) e pra quem prefere digitar a bipar. Escolher uma
          preenche nome, código de barras e foto de uma vez. */}
      {!editando && (buscandoNome || sugestoes.length > 0) ? (
        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 11, opacity: .6 }}>{buscandoNome ? "Procurando produtos…" : "Achei estes — toque pra usar:"}</span>
          {sugestoes.map((s) => (
            <button key={s.codigo} type="button" onClick={() => void usarSugestao(s)}
              style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", padding: "8px 10px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "transparent", color: "inherit", cursor: "pointer", textAlign: "left" }}>
              <span style={{ width: 34, height: 34, flex: "none", borderRadius: "var(--r-xs)", overflow: "hidden", border: "1px solid var(--border)", display: "grid", placeItems: "center" }}>
                {s.thumbUrl || s.imagemUrl
                  // eslint-disable-next-line @next/next/no-img-element -- preview externo; a cópia pro nosso bucket só acontece ao escolher
                  ? <img src={s.thumbUrl ?? s.imagemUrl!} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", background: "#fff" }} />
                  : <Icon name="photo" size={15} color="var(--muted, #888)" />}
              </span>
              <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.marca ? `${s.marca} · ` : ""}{s.nome}
                </span>
                <span style={{ fontSize: 11, opacity: .6 }}>{s.codigo}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {/* O código de barras também se edita: embalagem muda, produto vem com
          código errado do cadastro rápido, ou a busca por nome chutou um EAN
          que não bate. Sem isso, consertar exigia recadastrar o produto. */}
      <>
          <Campo rotulo="Código de barras" dica={
            buscandoFoto ? "Procurando foto e nome do produto…"
              : codigoSugerido ? "⚠ Este código veio da BUSCA POR NOME, não da embalagem. Bipe o produto pra confirmar — código errado faz o tablet achar outra coisa (ou nada)."
                : "Vazio = produto sem código, achado por toque no tablet."}>
            {/* Campo + câmera. Ler pela lente é o caminho CERTO (a embalagem é
                a fonte); digitar 13 dígitos à mão erra um deles com facilidade
                e aí o tablet acha outro produto. */}
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Texto value={codigoBarras} inputMode="numeric" placeholder="7894900011517"
                  style={codigoSugerido ? { borderColor: "var(--warn, var(--atencao))", background: "color-mix(in srgb, var(--warn, var(--atencao)) 8%, transparent)" } : undefined}
                  onChange={(e) => aplicarCodigo(e.target.value)} />
              </div>
              <Botao icone="camera" onClick={() => setLendoCodigo(true)} title="Ler com a câmera" style={{ flex: "none" }}>
                Ler
              </Botao>
            </div>
          </Campo>
          {lendoCodigo && (
            <LeitorCodigo
              titulo="Ler código de barras"
              onLer={(c) => aplicarCodigo(c)}
              onFechar={() => setLendoCodigo(false)}
            />
          )}

          {/* minmax(min(100%, …)) pra colapsar sozinho no celular. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
            <Campo rotulo="Preço (R$)">
              <Texto value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="R$ 5,00" inputMode="decimal" />
            </Campo>
            {!editando ? (
              <Campo rotulo="Custo" dica="Opcional — é o que dá o lucro.">
                <Texto value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="R$ 3,20" inputMode="decimal" />
              </Campo>
            ) : null}
          </div>

          <Campo rotulo="Imagem do produto">
            {/* `rotulo` entra numa frase pronta ("Escolher {rotulo}"/"Trocar
                {rotulo}") — tem que ser só o substantivo. */}
            <FotoUpload url={imagem} onChange={setImagem} redondo={false} rotulo="Foto" quadrada />
          </Campo>

          <Campo rotulo="Categoria do produto" dica="Agrupa o produto na lista e ajuda a achar no tablet.">
            <GradeCategorias categorias={categorias} valor={categoriaId} onChange={setCategoriaId} />
            {/* Criar sem sair daqui. minmax(min(100%,...)) pra o campo e o botão
                empilharem sozinhos a 320px em vez de espremerem. */}
            <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 180px), 1fr) auto", gap: 8, marginTop: 8 }}>
              <Texto value={novaCategoria} placeholder="Criar categoria nova..."
                onChange={(e) => setNovaCategoria(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void criarCategoria(); } }} />
              <Botao onClick={() => void criarCategoria()} disabled={novaCategoria.trim().length < 2}>
                Criar
              </Botao>
            </div>
          </Campo>
          {/* Estoque INICIAL só faz sentido ao cadastrar; depois disso quem
              mexe no estoque é a aba Estoque, que registra o motivo. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
            {!editando ? (
              <Campo rotulo="Estoque inicial">
                <Texto value={estoque} onChange={(e) => setEstoque(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
              </Campo>
            ) : null}
            <Campo rotulo="Estoque mínimo" dica="Abaixo disso o painel avisa.">
              <Texto value={minimo} onChange={(e) => setMinimo(e.target.value.replace(/\D/g, ""))} inputMode="numeric" />
            </Campo>
          </div>
        </>
      {/* Empresas em que o produto vai existir. É UM produto só — o que é por
          empresa são preço e estoque. Cadastrar a mesma bolacha cinco vezes,
          uma por empresa, criava cinco produtos e o painel somava separado. */}
      <Campo rotulo="Empresas" dica={editando
        ? "Marque também empresas novas pra levar este produto pra elas."
        : "O produto é o mesmo em todas; preço e estoque valem pra cada uma."}>
        <div style={{ display: "grid", gap: 6 }}>
          <Botao tamanho="sm" onClick={() => setEmpresasMarcadas(todasMarcadas ? [unidade || unidadesAtivas[0]?.id].filter(Boolean) : unidadesAtivas.map((u) => u.id))}
            style={{ justifySelf: "start" }}>
            {todasMarcadas ? "Desmarcar todas" : `Todas as empresas (${unidadesAtivas.length})`}
          </Botao>
          <div style={{ display: "grid", gap: 2, maxHeight: 150, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: 8 }}>
            {unidadesAtivas.map((u) => (
              <label key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", cursor: "pointer" }}>
                <Caixa marcado={empresasMarcadas.includes(u.id)} onChange={(marc) => setEmpresasMarcadas((atual) =>
                    marc ? [...new Set([...atual, u.id])] : atual.filter((x) => x !== u.id))} />
                <span style={{ fontSize: 13 }}>{u.nome}</span>
              </label>
            ))}
          </div>
        </div>
      </Campo>
      <Toggle ligado={semCodigo} onChange={setSemCodigo}
        rotulo={<>Aparece na categoria <strong>Produtos sem código</strong></>}
        dica="Pra pão, fruta, salgado — o que não tem código de barras pra bipar." />
      {/* Esconder da busca ≠ inativar: quem bipa o código compra normalmente.
          Não faz sentido junto com "sem código" — esse só é achado por toque na
          busca, então escondê-lo o tornaria invendável. */}
      <Toggle ligado={ocultoBusca} onChange={setOcultoBusca} disabled={semCodigo}
        rotulo="Esconder da busca do tablet"
        dica={semCodigo
          ? "Indisponível: produto sem código só é achado pela busca — escondê-lo o deixaria invendável."
          : "Some da lista que a pessoa rola e pesquisa. Continua à venda: bipando o código, compra normal."} />
      {editando ? (
        <Toggle ligado={ativo} onChange={setAtivo} rotulo="Produto ativo"
          dica={ativo ? "Aparece no tablet e nas listas." : "Some do tablet e das listas. O histórico de vendas dele continua."} />
      ) : null}
    </Folha>
  );
}
