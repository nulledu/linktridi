"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../(plataforma)/Icon";
import { normalizarQuadrada } from "../(plataforma)/tridimarket/normalizarFoto";
import { travarRolagem } from "../(plataforma)/ui/travaRolagem";
import { TrocaIcone, useClasseAberta } from "../(plataforma)/ui/micro";
import {
  planejarLocal, sugerirLocais, NOTA_MAX, type LocalConhecido,
} from "@/lib/estoque-local-do-item";

// Peças das ferramentas TEMPORÁRIAS de faxina de foto (/fotos-mercadinho e
// /fotos-estoque). Pasta SEM page.tsx de propósito: não é rota, é só o que as
// duas telas dividem.
//
// Elas são a mesma tela com dois catálogos diferentes por baixo — o mercadinho
// tem código de barras e o banco aberto de alimentos, o estoque não tem nem um
// nem outro. O que muda é de onde vem a lista e como se grava; o resto (grade,
// quadro da foto, folha, upload) é idêntico, e duplicar isso significaria
// consertar cada coisa duas vezes.

// Mesmo acento do TridiMarket. Token, não hex: cor escrita na mão não muda de
// tema (ver lib/__tests__/paleta-por-tema.test.ts).
export const INDIGO = "var(--primary-texto)";

export const cartao: React.CSSProperties = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
};

export const botaoNeutro: React.CSSProperties = {
  minHeight: "var(--tap)", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text)", fontSize: 14, fontWeight: 650,
  fontFamily: "inherit", cursor: "pointer",
};

export const botaoTexto: React.CSSProperties = {
  background: "none", border: "none", padding: 0, cursor: "pointer", font: "inherit", fontWeight: 700,
};

export const campo: React.CSSProperties = {
  minHeight: "var(--tap)", padding: "0 12px", boxSizing: "border-box",
  borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface-2)",
  color: "var(--text)", fontSize: 15, fontFamily: "inherit",
};

// ── Grade de cartões ────────────────────────────────────────────────────────
// minmax(min(100%, N), 1fr): idêntico no computador, colapsa sozinho a 320px
// em vez de estourar a largura.
export function Grade({ minimo = 128, children }: { minimo?: number; children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${minimo}px), 1fr))`, gap: 10 }}>{children}</div>;
}

// Quadrado com a peça INTEIRA (`contain`) e fundo branco fixo: a foto é
// normalizada com fundo branco no upload, então a sobra da margem tem que ser
// da mesma cor — senão aparece moldura no tema escuro.
export function Quadro({ url, nome, grande = false }: { url: string | null; nome: string; grande?: boolean }) {
  return (
    <span style={{
      display: "grid", placeItems: "center", width: "100%", aspectRatio: "1 / 1",
      borderRadius: "var(--r-xs)", overflow: "hidden",
      background: url ? "#fff" : "var(--surface-2)", border: "1px solid var(--border)",
    }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element -- URL de bucket público, sem loader do Next
        ? <img src={url} alt={nome} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        : <span style={{ display: "grid", justifyItems: "center", gap: 4, color: "var(--text-dim)" }}>
            <Icon name="photo-question" size={grande ? 34 : 20} color="var(--text-dim)" />
            <span style={{ fontSize: grande ? 12 : 10, fontWeight: 700 }}>sem foto</span>
          </span>}
    </span>
  );
}

export function Acao({ icone, children, onClick, ocupado = false, tom }: {
  icone: string; children: React.ReactNode; onClick: () => void; ocupado?: boolean; tom?: "neg";
}) {
  const cor = tom === "neg" ? "var(--perigo)" : "var(--text)";
  return (
    <button onClick={onClick} disabled={ocupado}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: "var(--tap)",
        padding: "0 14px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
        background: "var(--surface-2)", color: cor, fontSize: 14, fontWeight: 650, fontFamily: "inherit",
        cursor: ocupado ? "wait" : "pointer", opacity: ocupado ? 0.6 : 1, textAlign: "left",
      }}>
      <TrocaIcone ligado={ocupado} a={icone} b="loader" size={17} corA={cor} corB={cor} />
      {ocupado ? "Um instante…" : children}
    </button>
  );
}

export function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={ativo}
      style={{
        flex: "none", whiteSpace: "nowrap", minHeight: "var(--tap)", padding: "0 15px", borderRadius: 999,
        fontSize: 13, fontWeight: 700, fontFamily: "inherit", cursor: "pointer",
        border: `1px solid ${ativo ? INDIGO : "var(--border)"}`,
        background: ativo ? `color-mix(in srgb, ${INDIGO} 14%, transparent)` : "var(--surface)",
        color: ativo ? INDIGO : "var(--text)",
      }}>{children}</button>
  );
}

export function Faixa({ tom, icone, children }: { tom: "neg" | "pos" | "aviso"; icone: string; children: React.ReactNode }) {
  const cor = tom === "neg" ? "var(--perigo)" : tom === "aviso" ? "var(--atencao)" : "var(--ok)";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9, marginBottom: 12, padding: "10px 12px",
      borderRadius: "var(--r-sm)", border: `1px solid ${cor}`, background: `color-mix(in srgb, ${cor} 10%, transparent)`,
      color: cor, fontSize: 13, fontWeight: 600,
    }}>
      <Icon name={icone} size={17} color={cor} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}

// Campo de busca da lista, com a lupa dentro.
export function Busca({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: "relative", marginBottom: 10 }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "grid", pointerEvents: "none" }}>
        <Icon name="search" size={17} color="var(--text-dim)" />
      </span>
      <input value={valor} onChange={(e) => onChange(e.target.value)} inputMode="search" placeholder={placeholder}
        style={{ ...campo, width: "100%", padding: "0 12px 0 38px", background: "var(--surface)" }} />
    </div>
  );
}

// ── Rótulo de campo ─────────────────────────────────────────────────────────
function Rotulo({ icone, children, dica }: { icone: string; children: React.ReactNode; dica?: string }) {
  return (
    <span style={{ display: "block", marginBottom: 6 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700 }}>
        <Icon name={icone} size={15} color="var(--text-dim)" />
        {children}
      </span>
      {dica && <span style={{ display: "block", marginTop: 2, fontSize: 11.5, color: "var(--text-dim)" }}>{dica}</span>}
    </span>
  );
}

// ── Onde a coisa está ───────────────────────────────────────────────────────
// Um campo de texto que termina numa linha de `estoque_locais` — a tabela que
// hoje está vazia e que a aba Localização e a etiqueta física consomem.
//
// Três coisas acontecem enquanto se digita, e as três existem pelo mesmo
// motivo: em uma tarde de mutirão o galpão ganharia quinze grafias do mesmo
// corredor se cada pessoa digitasse solto.
//
//  1. o que JÁ EXISTE aparece antes de escrever (campo vazio já lista);
//  2. a tela diz o que vai acontecer ANTES de salvar — "entra em Prateleira
//     A3" ou "cria o lugar A4", com o código que vai pra etiqueta;
//  3. nome parecido com um que já existe vira pergunta, nunca fusão automática.
//
// A lista NÃO fecha no `blur`: fechar no blur é a armadilha clássica — o toque
// na sugestão tira o foco do campo antes do clique chegar, e no celular a
// sugestão simplesmente não funciona.
export function CampoLocal({ valor, onChange, locais }: {
  valor: string;
  onChange: (v: string) => void;
  locais: LocalConhecido[];
}) {
  const [aberto, setAberto] = useState(false);
  const sugestoes = useMemo(() => sugerirLocais(valor, locais), [valor, locais]);
  const plano = useMemo(() => planejarLocal(valor, locais), [valor, locais]);

  const escolher = (l: LocalConhecido) => { onChange(l.nome); setAberto(false); };

  return (
    <div>
      <Rotulo icone="map-pin" dica="Onde a coisa está no galpão. Vale “A3 · Prateleira do fundo” pra já dar o código curto.">
        Localização
      </Rotulo>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={valor}
          onChange={(e) => { onChange(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          enterKeyHint="done"
          placeholder="Ex.: Prateleira A3"
          style={{ ...campo, flex: 1, minWidth: 0 }} />
        {valor && (
          <button onPointerDown={(e) => { e.preventDefault(); onChange(""); setAberto(false); }}
            aria-label="Limpar a localização"
            style={{ ...botaoNeutro, width: "var(--tap)", minWidth: "var(--tap)", padding: 0, display: "grid", placeItems: "center" }}>
            <Icon name="x" size={16} />
          </button>
        )}
      </div>

      {aberto && sugestoes.length > 0 && (
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {!valor.trim() && (
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Lugares que já existem:</span>
          )}
          {sugestoes.map((l) => (
            <button key={l.id} onPointerDown={(e) => { e.preventDefault(); escolher(l); }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: "var(--tap)",
                padding: "0 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
                background: "var(--surface-2)", color: "var(--text)", fontFamily: "inherit",
                fontSize: 13.5, fontWeight: 600, textAlign: "left", cursor: "pointer",
              }}>
              <Icon name="map-pin" size={15} color="var(--text-dim)" />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.nome}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-dim)", flex: "none" }}>{l.codigo}</span>
            </button>
          ))}
        </div>
      )}

      {plano.tipo === "existente" && (
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--text-dim)" }}>
          Entra em <strong style={{ color: "var(--text)" }}>{plano.local.nome}</strong> ({plano.local.codigo}).
        </p>
      )}
      {plano.tipo === "longo" && (
        <Faixa tom="aviso" icone="alert-triangle">
          Nome de lugar com até {plano.max} caracteres. O que não couber vai melhor na nota.
        </Faixa>
      )}
      {plano.tipo === "novo" && (
        <div style={{ marginTop: 8 }}>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>
            Lugar novo: <strong style={{ color: "var(--text)" }}>{plano.nome}</strong> · código{" "}
            <strong style={{ color: "var(--text)" }}>{plano.codigo}</strong> (vai pra etiqueta da prateleira).
          </p>
          {/* Não bloqueia: quem imprime é quem sabe o tamanho do papel. Só
              ensina o atalho — o código comprido é consertável depois, mas
              ninguém descobre sozinho que dá pra mandar os dois. */}
          {plano.codigo.length > 12 && (
            <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--text-dim)" }}>
              Código comprido pra etiqueta. Escreva <strong style={{ color: "var(--text)" }}>A3 · {plano.nome}</strong> pra
              separar código e nome.
            </p>
          )}
          {plano.parecidos.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 12, color: "var(--atencao)", fontWeight: 650 }}>
                Parece com {plano.parecidos.length === 1 ? "um lugar que já existe" : "lugares que já existem"} — é o mesmo?
              </span>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                {plano.parecidos.map((l) => (
                  <button key={l.id} onPointerDown={(e) => { e.preventDefault(); escolher(l); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: "var(--tap)",
                      padding: "0 12px", borderRadius: "var(--r-sm)", fontFamily: "inherit",
                      border: "1px solid var(--atencao)", background: "color-mix(in srgb, var(--atencao) 10%, transparent)",
                      color: "var(--text)", fontSize: 13.5, fontWeight: 600, textAlign: "left", cursor: "pointer",
                    }}>
                    Usar “{l.nome}”
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-dim)", flex: "none" }}>{l.codigo}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── O que é / pra que serve ─────────────────────────────────────────────────
export function CampoNota({ valor, onChange, disponivel }: {
  valor: string; onChange: (v: string) => void; disponivel: boolean;
}) {
  if (!disponivel) {
    // Degrada explicando. Sumir sem dizer nada faria a pessoa achar que anotou
    // e o texto não salvou — pior que não ter o campo.
    return (
      <Faixa tom="aviso" icone="info-circle">
        A anotação (“o que é / pra que serve”) ainda não está ligada: falta rodar o SQL
        <code style={{ margin: "0 4px" }}>supabase/estoque_faxina_organizar.sql</code>.
        Foto e localização já salvam normalmente.
      </Faixa>
    );
  }
  const sobrando = NOTA_MAX - valor.length;
  return (
    <div>
      <Rotulo icone="file-text" dica="O que é, pra que serve, o que vai junto. Escreva do jeito que você falaria.">
        Anotação
      </Rotulo>
      <textarea
        value={valor} onChange={(e) => onChange(e.target.value.slice(0, NOTA_MAX))}
        rows={3} placeholder="Ex.: sobra do carimbo redondo — serve pra reposição de cabo"
        style={{ ...campo, width: "100%", padding: "10px 12px", minHeight: 84, lineHeight: 1.35, resize: "vertical" }} />
      {sobrando < 80 && (
        <p style={{ margin: "4px 0 0", fontSize: 11.5, color: sobrando <= 0 ? "var(--perigo)" : "var(--text-dim)" }}>
          {sobrando <= 0 ? "Chegou no limite." : `${sobrando} caracteres.`}
        </p>
      )}
    </div>
  );
}

/** O que a folha edita. `local` é o texto digitado (a rota resolve pra linha de
 *  `estoque_locais`); `nota` é texto livre. */
export type Rascunho = { foto: string | null; local: string; nota: string };

/** O que FICOU gravado, devolvido por quem salvou. Não é o mesmo que o
 *  rascunho: digitar "prateleira a3" entra em "Prateleira A3", e é o nome
 *  gravado que a lista tem que passar a mostrar. `local` traz a linha inteira
 *  porque um lugar recém-criado precisa entrar na lista de sugestões na hora —
 *  senão o próximo item da mesma prateleira vira uma segunda grafia. */
export type Gravado = { rascunho: Rascunho; local: LocalConhecido | null };

/** O que a folha precisa saber pra oferecer os campos do galpão. Ausente = o
 *  catálogo não organiza (o mercadinho), e a folha volta a ser só a foto. */
export type Organizar = {
  locais: LocalConhecido[];
  /** false = falta rodar o SQL da nota. */
  nota: boolean;
  /** "Ana" — quem mexeu por último neste item. */
  porQuem?: string | null;
};

// ── A folha ─────────────────────────────────────────────────────────────────
// O invólucro é comum às duas telas; o MIOLO (os caminhos pra achar uma foto)
// muda, porque o mercadinho tem código de barras e o banco aberto de alimentos
// e o estoque não tem nenhum dos dois. Por isso `extras`: quem monta a folha
// diz o que mais existe além de "enviar do aparelho".
export function FolhaFoto({ titulo, subtitulo, inicial, organizar, salvar, onFechar, onAplicado, extras, aviso, classe = "" }: {
  /** Classe do ciclo de abertura da receita de modal (`useAbrirFechar`).
   *  OPCIONAL: quem não manda ganha o fallback do `useClasseAberta` — sem ele
   *  a folha nascia em `opacity: 0` e NUNCA acendia (o `.apple-modal.t-modal`
   *  desliga a animação de reserva), que é a "tela desfocada sem nada". */
  classe?: string;
  titulo: string;
  subtitulo: string;
  inicial: Rascunho;
  /** Presente só no catálogo que tem galpão (o estoque). */
  organizar?: Organizar;
  /** Devolve o que ficou gravado quando o servidor corrige alguma coisa (a
   *  grafia do lugar). Devolvendo nada, vale o próprio rascunho. */
  salvar: (r: Rascunho) => Promise<Gravado | void>;
  onFechar: () => void;
  onAplicado: (g: Gravado) => void;
  /** Ações e painéis extras, montados com o estado da folha. */
  extras?: (ferramentas: FerramentasDaFolha) => React.ReactNode;
  /** Recado fixo no topo (ex.: "você não pode editar"). */
  aviso?: React.ReactNode;
}) {
  const fotoAtual = inicial.foto;
  const cls = useClasseAberta(classe);
  const [foto, setFoto] = useState<string | null>(inicial.foto);
  const [local, setLocal] = useState(inicial.local);
  const [nota, setNota] = useState(inicial.nota);
  const [ocupado, setOcupado] = useState<string | null>(null);   // rótulo do que está rodando
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const fotoMudou = (foto ?? null) !== (inicial.foto ?? null);
  const mudou = fotoMudou || local.trim() !== inicial.local.trim() || nota.trim() !== inicial.nota.trim();

  // Fundo travado enquanto a folha está aberta — sempre pelo utilitário, que
  // conta as camadas (salvar/restaurar na mão trava a página inteira quando o
  // React desmonta o pai antes do filho).
  useEffect(() => travarRolagem(), []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  async function tentar(rotulo: string, fn: () => Promise<void>) {
    setErro(null); setOcupado(rotulo);
    try { await fn(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não deu certo."); }
    finally { setOcupado(null); }
  }

  const enviarArquivo = (arquivo: File) => tentar("upload", async () => {
    const form = new FormData();
    // Quadrado de 1000×1000 com fundo branco: é o formato que as listas do ERP
    // e o tablet desenham sem cortar a peça.
    form.append("file", await normalizarQuadrada(arquivo));
    form.append("bucket", "photos");
    const r = await fetch("/api/upload", { method: "POST", body: form });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? "Falha ao enviar a imagem.");
    setFoto(String(j.url));
  });

  async function confirmar() {
    setErro(null); setSalvando(true);
    const r: Rascunho = { foto, local: local.trim(), nota: nota.trim() };
    try {
      const gravado = await salvar(r);
      onAplicado(gravado ?? { rascunho: r, local: null });
    }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar."); }
    finally { setSalvando(false); }
  }

  return (
    // .apple-backdrop/.apple-modal dão o visual do sistema (e, no tema claro,
    // deixam --surface SÓLIDO dentro do modal — com o rgba de fora o cartão
    // ficava branco-no-branco). .sheet-host/.sheet, por cima, é o que no
    // celular prende a folha embaixo com rolagem interna: centralizada, o
    // botão Salvar nascia atrás do teclado.
    <div onClick={onFechar} className={`apple-backdrop sheet-host ${classe}`.trim()} role="dialog" aria-modal="true"
      aria-label={organizar ? `Organizar ${titulo}` : `Foto de ${titulo}`}
      style={{ zIndex: "var(--z-modal, 1300)" as unknown as number, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className={`apple-modal sheet t-modal ${cls}`.trim()}
        style={{
          borderRadius: "var(--r-md)",
          width: "min(520px, 100%)", maxHeight: "calc(100dvh - 40px)", overflowY: "auto",
          padding: 18, boxSizing: "border-box",
        }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ display: "block", fontSize: 16, lineHeight: 1.25 }}>{titulo}</strong>
            <span style={{ display: "block", marginTop: 3, fontSize: 12, color: "var(--text-dim)" }}>{subtitulo}</span>
          </div>
          <button onClick={onFechar} aria-label="Fechar"
            style={{ ...botaoNeutro, width: "var(--tap)", minWidth: "var(--tap)", padding: 0, display: "grid", placeItems: "center" }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div style={{ margin: "0 auto 14px", width: "min(280px, 100%)" }}>
          <Quadro url={foto} nome={titulo} grande />
          {fotoMudou && (
            <p style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 700, color: INDIGO, textAlign: "center" }}>
              Foto nova — toque em Salvar pra valer.
            </p>
          )}
        </div>

        {aviso}
        {erro && <Faixa tom="neg" icone="alert-triangle">{erro}</Faixa>}

        <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
          <Acao icone="upload" onClick={() => entrada.current?.click()} ocupado={ocupado === "upload"}>
            {foto ? "Enviar outra do aparelho" : "Enviar do aparelho"}
          </Acao>
          {extras?.({ foto, setFoto, ocupado, tentar })}
          {foto && <Acao icone="trash" tom="neg" onClick={() => setFoto(null)}>Deixar sem foto</Acao>}
        </div>

        {organizar && (
          <div style={{ display: "grid", gap: 14, marginBottom: 14 }}>
            <CampoLocal valor={local} onChange={setLocal} locais={organizar.locais} />
            <CampoNota valor={nota} onChange={setNota} disponivel={organizar.nota} />
            {organizar.porQuem && (
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-dim)" }}>
                Última mudança por <strong style={{ color: "var(--text)" }}>{organizar.porQuem}</strong>.
              </p>
            )}
          </div>
        )}

        {/* Rodapé colado embaixo da folha: no celular a folha rola por dentro e
            o Salvar ficaria abaixo do campo da nota, longe do polegar. */}
        <div style={{
          display: "flex", gap: 9, justifyContent: "flex-end",
          // `bottom: -18` e não 0: a margem negativa (que faz o rodapé sangrar
          // até a borda da folha) encolhe a caixa de margem em 18px, e com
          // `bottom: 0` ele pinava 18px ACIMA da posição de fluxo — comendo a
          // última linha do conteúdo mesmo com a folha rolada até o fim.
          position: "sticky", bottom: -18, margin: "0 -18px -18px", padding: "12px 18px calc(12px + var(--safe-b))",
          background: "var(--surface)", borderTop: "1px solid var(--border)",
        }}>
          <button onClick={onFechar} style={{ ...botaoNeutro, padding: "0 16px" }}>Cancelar</button>
          <button onClick={() => void confirmar()} disabled={!mudou || salvando}
            style={{
              minHeight: "var(--tap)", padding: "0 18px", borderRadius: "var(--r-sm)", border: "none",
              background: INDIGO, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
              cursor: mudou && !salvando ? "pointer" : "not-allowed", opacity: mudou && !salvando ? 1 : 0.5,
            }}>
            {salvando ? "Salvando…" : organizar ? "Salvar" : "Salvar foto"}
          </button>
        </div>

        {/* accept="image/*" já oferece a CÂMERA no celular — não precisa de
            botão separado nem de farejar o aparelho. */}
        <input ref={entrada} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarArquivo(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}

export type FerramentasDaFolha = {
  foto: string | null;
  setFoto: (url: string | null) => void;
  /** Rótulo da ação em andamento, ou null. */
  ocupado: string | null;
  /** Roda `fn` mostrando "um instante…" e transformando exceção em recado. */
  tentar: (rotulo: string, fn: () => Promise<void>) => Promise<void>;
};
