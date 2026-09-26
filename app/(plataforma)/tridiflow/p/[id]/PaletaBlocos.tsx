"use client";

// Paleta de blocos do editor de páginas — o "menu" que abre no + da estrutura.
// Só escolhe o TIPO; quem cria o bloco (novoBloco) e decide onde encaixar é o
// editor. Por isso ela não conhece o documento: recebe `onEscolher(tipo)` e some.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BLOCOS_CONTEUDO, BLOCOS_CONVERSAO, BLOCOS_ESTRUTURA,
  ICONE_BLOCO, ROTULO_BLOCO, type BlocoTipo,
} from "@/lib/tridiflow-pagina";
import { Icon } from "../../../Icon";
import { ACENTO, Vazio, inp } from "../_ui";
import { BotaoIcone } from "../../../ui/controles";

// Uma linha por bloco: o que a pessoa precisa saber pra escolher sem testar.
const DESCRICAO: Record<BlocoTipo, string> = {
  container: "Agrupa blocos com fundo e espaçamento",
  colunas: "Divide o conteúdo lado a lado",
  espacador: "Respiro vertical entre um bloco e outro",
  divisor: "Linha fina que separa dois trechos",
  cabecalho: "Marca, links e botão no topo da página",
  bento: "Quadros de tamanhos diferentes, claros, escuros ou na cor da marca",
  carrossel: "Cartões que deslizam de lado, com setas",
  rodape: "Links, contato e parte legal no fim da página",
  titulo: "A chamada principal da página",
  texto: "Parágrafo comum de conteúdo",
  imagem: "Foto, print ou banner",
  video: "YouTube, Vimeo, Panda ou arquivo",
  beneficios: "Lista de vantagens com marcador",
  faq: "Perguntas e respostas que tiram objeções",
  depoimentos: "Prova social de quem já comprou",
  logos: "Faixa de marcas ou clientes",
  metricas: "Números de impacto (clientes, %, nota)",
  galeria: "Grade de fotos ou prints",
  recursos: "Recursos com ícone, em grade",
  passos: "Como funciona, em passos numerados",
  comparacao: "Você × os outros, item a item",
  botao: "Leva o visitante pro próximo passo",
  whatsapp: "Abre a conversa com mensagem pronta",
  formulario: "Captura nome, e-mail e WhatsApp",
  oferta: "Preço, benefícios e botão de checkout",
  planos: "Vários planos lado a lado, com preço",
  garantia: "Selo de garantia que reduz o risco",
  contador: "Urgência com tempo regressivo",
  aviso: "Faixa destacada para um recado curto",
};

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const GRUPOS: { titulo: string; tipos: BlocoTipo[] }[] = [
  { titulo: "Estrutura", tipos: BLOCOS_ESTRUTURA },
  { titulo: "Conteúdo", tipos: BLOCOS_CONTEUDO },
  { titulo: "Conversão", tipos: BLOCOS_CONVERSAO },
];

export function PaletaBlocos({ aberta, onFechar, onEscolher }: {
  aberta: boolean;
  onFechar: () => void;
  onEscolher: (tipo: BlocoTipo) => void;
}) {
  const [busca, setBusca] = useState("");
  const [destaque, setDestaque] = useState(0);
  const buscaRef = useRef<HTMLInputElement | null>(null);
  const cartoesRef = useRef<Record<string, HTMLButtonElement | null>>({});

  // Grupos já filtrados (acento-insensível sobre o rótulo) + a lista "achatada"
  // que a navegação por teclado percorre.
  const grupos = useMemo(() => {
    const q = semAcento(busca);
    if (!q) return GRUPOS;
    return GRUPOS
      .map((g) => ({ ...g, tipos: g.tipos.filter((t) => semAcento(ROTULO_BLOCO[t]).includes(q)) }))
      .filter((g) => g.tipos.length > 0);
  }, [busca]);

  const chapa = useMemo(() => grupos.flatMap((g) => g.tipos), [grupos]);

  const escolher = useCallback((tipo: BlocoTipo) => {
    onEscolher(tipo);
    onFechar();
  }, [onEscolher, onFechar]);

  // Abrir = estado limpo e foco na busca (dá pra sair digitando).
  useEffect(() => {
    if (!aberta) return;
    setBusca("");
    setDestaque(0);
    const t = window.setTimeout(() => buscaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [aberta]);

  useEffect(() => { setDestaque(0); }, [busca]);

  // Teclado: Esc fecha, setas andam, Enter escolhe o destacado.
  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onFechar(); return; }
      if (!chapa.length) return;
      const passo = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
      if (passo) {
        e.preventDefault();
        setDestaque((i) => (i + passo + chapa.length) % chapa.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const tipo = chapa[Math.min(destaque, chapa.length - 1)];
        if (tipo) escolher(tipo);
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberta, chapa, destaque, escolher, onFechar]);

  // Mantém o destacado visível quando a lista é longa.
  useEffect(() => {
    if (!aberta) return;
    const tipo = chapa[destaque];
    if (tipo) cartoesRef.current[tipo]?.scrollIntoView({ block: "nearest" });
  }, [aberta, chapa, destaque]);

  if (!aberta) return null;

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.5)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "10dvh 16px 24px", overflowY: "auto",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Adicionar bloco"
        style={{
          width: "100%", maxWidth: 620, maxHeight: "78dvh", display: "flex", flexDirection: "column",
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
          boxShadow: "0 24px 60px rgba(0,0,0,.28)", overflow: "hidden",
        }}
      >
        <Cabecalho valor={busca} onChange={setBusca} onFechar={onFechar} inputRef={buscaRef} />

        <div style={{ overflowY: "auto", padding: "6px 16px 18px" }}>
          {!chapa.length && <Vazio icone="search" texto="Nenhum bloco com esse nome. Tente outra palavra." />}

          {grupos.map((g) => (
            <section key={g.titulo} style={{ marginTop: 14 }}>
              <h3 style={{
                margin: "0 0 8px", fontSize: 11, fontWeight: 800, letterSpacing: ".06em",
                textTransform: "uppercase", color: "var(--text-dim)",
              }}>
                {g.titulo}
              </h3>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))" }}>
                {g.tipos.map((t) => (
                  <Cartao
                    key={t}
                    tipo={t}
                    ativo={chapa[destaque] === t}
                    onEscolher={escolher}
                    onApontar={() => setDestaque(chapa.indexOf(t))}
                    registrar={(el) => { cartoesRef.current[t] = el; }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        <Rodape />
      </div>
    </div>
  );
}

function Cabecalho({ valor, onChange, onFechar, inputRef }: {
  valor: string;
  onChange: (v: string) => void;
  onFechar: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
      borderBottom: "1px solid var(--border)",
    }}>
      <span style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
        <span style={{ position: "absolute", left: 10, display: "flex", pointerEvents: "none" }}>
          <Icon name="search" size={15} color="var(--text-dim)" />
        </span>
        <input
          ref={inputRef}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar bloco…"
          style={{ ...inp, padding: "10px 12px 10px 32px", fontSize: 13.5 }}
        />
      </span>
      <BotaoIcone icone="x" titulo="Fechar" variante="secundario" tamanho="sm" onClick={onFechar} style={{ flex: "none" }} />
    </div>
  );
}

function Cartao({ tipo, ativo, onEscolher, onApontar, registrar }: {
  tipo: BlocoTipo;
  ativo: boolean;
  onEscolher: (t: BlocoTipo) => void;
  onApontar: () => void;
  registrar: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <button
      ref={registrar}
      type="button"
      onClick={() => onEscolher(tipo)}
      onMouseEnter={onApontar}
      style={{
        display: "grid", gap: 6, textAlign: "left", padding: "11px 12px", borderRadius: 12,
        cursor: "pointer", font: "inherit", transition: "border-color .12s, background .12s",
        border: `1px solid ${ativo ? ACENTO : "var(--border)"}`,
        background: ativo ? "var(--surface-2)" : "var(--surface)",
        boxShadow: ativo ? `0 0 0 2px ${ACENTO}22` : "none",
      }}
    >
      <span style={{
        display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8,
        background: "var(--surface-2)", border: "1px solid var(--border)",
      }}>
        <Icon name={ICONE_BLOCO[tipo]} size={15} color={ativo ? ACENTO : "var(--text-dim)"} />
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.25 }}>
        {ROTULO_BLOCO[tipo]}
      </span>
      <span style={{ fontSize: 10.5, color: "var(--text-dim)", lineHeight: 1.35 }}>
        {DESCRICAO[tipo]}
      </span>
    </button>
  );
}

function Rodape() {
  const dica: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5 };
  const tecla: React.CSSProperties = {
    minWidth: 18, padding: "1px 5px", borderRadius: 5, textAlign: "center",
    border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 10.5, color: "var(--text)",
  };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14, padding: "9px 16px",
      borderTop: "1px solid var(--border)", background: "var(--surface-2)",
      fontSize: 10.5, color: "var(--text-dim)",
    }}>
      <span style={dica}><span style={tecla}>↑</span><span style={tecla}>↓</span> navegar</span>
      <span style={dica}><span style={tecla}>↵</span> adicionar</span>
      <span style={dica}><span style={tecla}>esc</span> fechar</span>
    </div>
  );
}
