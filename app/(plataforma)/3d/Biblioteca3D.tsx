"use client";

// ── 3D · Biblioteca de arquivos de impressão ─────────────────────────────────
// O acervo central do que roda nas impressoras: enviar, buscar, filtrar, abrir
// a ficha (com o palco 3D quando o formato permite), baixar e apagar.
//
// MVP de propósito: máquinas, programações e kanban virão DEPOIS, por cima
// desta mesma tabela — a ficha do arquivo é a unidade que essas telas vão
// referenciar. Nada de poll: biblioteca muda quando alguém envia, não sozinha.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { toast, confirmar } from "../Toast";
import { PageHead } from "../ui/mobile";
import { Momento } from "../ui/Momento";
import { Acoes, Botao, BotaoIcone, Campo, Campos, Chips, Esp, PainelLateral, useAcao } from "../ui/controles";
import { enviarArquivoPrivado } from "../ui/enviarArquivo";
import {
  FORMATOS_ACEITOS, formatoDoNome, tamanhoLegivel, visualizavel, type Arquivo3D,
} from "@/lib/impressao3d-const";
import { Visualizador3D } from "./Visualizador3D";
import { BolinhaStatus } from "./pecas3d";

const ACCEPT = FORMATOS_ACEITOS.map((f) => `.${f}`).join(",");
const TETO_MB = 200;

type Envio = { nome: string; pct: number; erro?: string };

function dataCurta(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function Biblioteca3D({ inicial, semCabecalho, aoProgramar }: {
  /** Banco de provas (/dev-3d): dado pronto, sem tocar a rede. */
  inicial?: Arquivo3D[];
  /** Dentro das abas do 3D o cabeçalho da página já existe — este some. */
  semCabecalho?: boolean;
  /** "Programar impressão" na ficha (abre o painel de programação do módulo). */
  aoProgramar?: (a: Arquivo3D) => void;
} = {}) {
  const [arquivos, setArquivos] = useState<Arquivo3D[] | null>(inicial ?? null);
  const [busca, setBusca] = useState("");
  const [formatos, setFormatos] = useState<string[]>([]);
  const [aberto, setAberto] = useState<Arquivo3D | null>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const escolher = useRef<HTMLInputElement | null>(null);

  const soProva = inicial != null;
  const carregar = useCallback(async () => {
    if (soProva) return;
    const r = await fetch("/api/3d/arquivos").then((x) => x.json()).catch(() => null);
    setArquivos(r?.ok ? (r.arquivos as Arquivo3D[]) : []);
    if (r && !r.ok) toast.erro("Não deu pra carregar a biblioteca.");
  }, [soProva]);
  useEffect(() => { void carregar(); }, [carregar]);

  // Busca e filtro são locais: a lista já chegou limitada do servidor, e
  // filtrar aqui não paga requisição por tecla.
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (arquivos ?? []).filter((a) => {
      if (formatos.length && !formatos.includes(a.formato)) return false;
      if (!t) return true;
      return (
        a.nome.toLowerCase().includes(t) ||
        a.descricao.toLowerCase().includes(t) ||
        a.tags.some((tag) => tag.includes(t))
      );
    });
  }, [arquivos, busca, formatos]);

  const opcoesFormato = useMemo(() => {
    const contas = new Map<string, number>();
    for (const a of arquivos ?? []) contas.set(a.formato, (contas.get(a.formato) ?? 0) + 1);
    return [...contas.entries()]
      .sort((x, y) => y[1] - x[1])
      .map(([f, n]) => ({ valor: f, rotulo: f.toUpperCase(), conta: n }));
  }, [arquivos]);

  // ── Envio: valida → sobe direto no B2 → registra na biblioteca ────────────
  const enviar = useCallback(async (lista: FileList | File[]) => {
    const files = [...lista];
    for (const file of files) {
      const formato = formatoDoNome(file.name);
      if (formato === "outro") {
        toast.erro(`"${file.name}" não é um arquivo de impressão (aceitos: ${FORMATOS_ACEITOS.join(", ")}).`);
        continue;
      }
      if (file.size > TETO_MB * 1024 * 1024) {
        toast.erro(`"${file.name}" tem ${tamanhoLegivel(file.size)} — o teto é ${TETO_MB} MB. Exporte com menos resolução ou fatie a peça.`);
        continue;
      }
      setEnvios((e) => [...e, { nome: file.name, pct: 0 }]);
      const marcar = (patch: Partial<Envio>) =>
        setEnvios((e) => e.map((x) => (x.nome === file.name ? { ...x, ...patch } : x)));
      try {
        const enviado = await enviarArquivoPrivado(file, "modelos", (pct) => marcar({ pct }), null);
        const r = await fetch("/api/3d/arquivos", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ nome: file.name, url: enviado.url, mime: enviado.mime, tamanho: enviado.tamanho }),
        }).then((x) => x.json()).catch(() => null);
        if (!r?.ok) throw new Error(r?.error === "tabela_ausente" ? "o SQL da biblioteca ainda não rodou" : r?.error || "registro");
        setEnvios((e) => e.filter((x) => x.nome !== file.name));
        setArquivos((atual) => [r.arquivo as Arquivo3D, ...(atual ?? [])]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        marcar({ erro: msg === "storage_off" ? "armazenamento desligado (B2 sem configurar)" : msg });
      }
    }
  }, []);

  const vazio = arquivos !== null && arquivos.length === 0 && envios.length === 0;

  return (
    <div>
      {semCabecalho ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
          <Botao variante="primario" icone="upload" onClick={() => escolher.current?.click()}>
            Enviar arquivos
          </Botao>
        </div>
      ) : (
        <PageHead
          title="3D"
          sub="Biblioteca dos arquivos que rodam nas impressoras — envie, visualize e baixe."
          right={
            <Botao variante="primario" icone="upload" onClick={() => escolher.current?.click()}>
              Enviar arquivos
            </Botao>
          }
        />
      )}
      <input
        ref={escolher} type="file" multiple accept={ACCEPT} style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.length) void enviar(e.target.files); e.target.value = ""; }}
      />

      {/* Envios em andamento — somem quando registram, ficam quando erram. */}
      {envios.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {envios.map((e) => (
            <div key={e.nome} className="mc-card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <Icon name={e.erro ? "alert-triangle" : "upload"} size={16} color={e.erro ? "var(--perigo)" : "var(--text-dim)"} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.nome}</span>
              {e.erro ? (
                <>
                  <span style={{ fontSize: 12, color: "var(--perigo)" }}>{e.erro}</span>
                  <BotaoIcone icone="x" titulo="Dispensar" tamanho="sm"
                    onClick={() => setEnvios((l) => l.filter((x) => x.nome !== e.nome))} />
                </>
              ) : (
                <span className="mt-num" style={{ fontSize: 12, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(e.pct * 100)}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Busca + filtro por formato */}
      {(arquivos?.length ?? 0) > 0 && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 380 }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", display: "inline-flex" }}>
              <Icon name="search" size={15} color="var(--text-dim)" />
            </span>
            <input
              value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, descrição ou tag" aria-label="Buscar arquivo"
              style={{ width: "100%", paddingLeft: 34, minHeight: "var(--tap)" }}
            />
          </div>
          {opcoesFormato.length > 1 && (
            <Chips rotulo="Filtrar por formato" opcoes={opcoesFormato} valor={formatos} onMuda={setFormatos} />
          )}
        </div>
      )}

      {/* A biblioteca */}
      {arquivos === null ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Carregando…</div>
      ) : vazio ? (
        <Momento icone="box" titulo="A biblioteca está vazia"
          texto="Envie o primeiro arquivo de impressão (STL, OBJ, 3MF, G-code…) e ele vira um card aqui — com visualização 3D quando o formato permite."
          acao={<Botao variante="primario" icone="upload" onClick={() => escolher.current?.click()}>Enviar arquivos</Botao>} />
      ) : visiveis.length === 0 ? (
        <Momento compacto icone="search" titulo="Nada com esse filtro"
          texto="Nenhum arquivo casa com a busca e os formatos marcados." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 230px), 1fr))", gap: 12 }}>
          {visiveis.map((a) => (
            <button
              key={a.id} type="button" onClick={() => setAberto(a)}
              className="mc-card mt-eleva"
              style={{ textAlign: "left", padding: 16, display: "grid", gap: 10, cursor: "pointer", minHeight: "var(--tap)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 38, height: 38, borderRadius: 12, flex: "none", display: "grid", placeItems: "center",
                  background: "color-mix(in srgb, var(--graf-1) 14%, transparent)",
                }}>
                  <Icon name={visualizavel(a.formato) ? "box" : "file-description"} size={19} color="var(--graf-1)" />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.nome}</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {a.formato.toUpperCase()} · {tamanhoLegivel(a.tamanho)} · {dataCurta(a.criadoEm)}
                  </div>
                </div>
              </div>
              {a.tags.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {a.tags.slice(0, 4).map((t) => (
                    <span key={t} style={{
                      fontSize: 11, padding: "2px 8px", borderRadius: 999,
                      background: "var(--surface-2, var(--surface))", border: "1px solid var(--border)", color: "var(--text-dim)",
                    }}>{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {aberto && (
        <Ficha3D
          arquivo={aberto}
          soProva={soProva}
          aoProgramar={aoProgramar ? () => { const a = aberto; setAberto(null); aoProgramar(a); } : undefined}
          onFechar={() => setAberto(null)}
          onMudou={(novo) => {
            setAberto(novo);
            setArquivos((l) => (l ?? []).map((x) => (x.id === novo.id ? novo : x)));
          }}
          onApagou={(id) => {
            setAberto(null);
            setArquivos((l) => (l ?? []).filter((x) => x.id !== id));
          }}
        />
      )}
    </div>
  );
}

// ── Ficha do arquivo: palco 3D + detalhes + download + apagar ────────────────
function Ficha3D({ arquivo, onFechar, onMudou, onApagou, aoProgramar, soProva }: {
  arquivo: Arquivo3D;
  onFechar: () => void;
  onMudou: (a: Arquivo3D) => void;
  onApagou: (id: string) => void;
  aoProgramar?: () => void;
  soProva?: boolean;
}) {
  const [nome, setNome] = useState(arquivo.nome);
  const [descricao, setDescricao] = useState(arquivo.descricao);
  const [tags, setTags] = useState(arquivo.tags.join(", "));
  // Onde a peça já rodou: as últimas programações deste arquivo (máquina,
  // dia, status). Só a ficha paga a consulta — a lista de cards não.
  const [usos, setUsos] = useState<{ id: string; maquinaNome: string | null; data: string | null; hora: string | null; quantidade: number; status: string }[] | null>(null);
  useEffect(() => {
    if (soProva) { setUsos([]); return; }
    let vivo = true;
    fetch(`/api/3d/programacoes?arquivo=${arquivo.id}&limite=15`)
      .then((x) => x.json())
      .then((r) => { if (vivo) setUsos(r?.ok ? r.programacoes : []); })
      .catch(() => { if (vivo) setUsos([]); });
    return () => { vivo = false; };
  }, [arquivo.id, soProva]);

  const mudou =
    nome.trim() !== arquivo.nome ||
    descricao !== arquivo.descricao ||
    tags !== arquivo.tags.join(", ");

  const salvar = useAcao(async () => {
    const r = await fetch(`/api/3d/arquivos/${arquivo.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nome, descricao, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { toast.erro("Não deu pra salvar."); return false; }
    onMudou(r.arquivo as Arquivo3D);
    toast("Ficha salva.");
    return true;
  });

  const apagar = useAcao(async () => {
    const sim = await confirmar(`Apagar "${arquivo.nome}" da biblioteca?`, {
      detalhe: "O arquivo também some do armazenamento — quem precisar dele de novo terá que reenviar.",
      tom: "perigo", acao: "Apagar",
    });
    if (!sim) return false;
    const r = await fetch(`/api/3d/arquivos/${arquivo.id}`, { method: "DELETE" }).then((x) => x.json()).catch(() => null);
    if (!r?.ok) { toast.erro("Não deu pra apagar."); return false; }
    toast("Arquivo apagado.");
    onApagou(arquivo.id);
    return true;
  });

  const urlDownload = `${arquivo.url}?download=1&nome=${encodeURIComponent(arquivo.nome)}`;

  return (
    <PainelLateral
      titulo={arquivo.nome}
      subtitulo={`${arquivo.formato.toUpperCase()} · ${tamanhoLegivel(arquivo.tamanho)} · enviado em ${dataCurta(arquivo.criadoEm)}`}
      largura={720}
      onFechar={onFechar}
      acoes={
        <span style={{ display: "inline-flex", gap: 8 }}>
          {aoProgramar && (
            <Botao variante="secundario" icone="calendar-plus" tamanho="sm" onClick={aoProgramar}>Programar</Botao>
          )}
          <a href={urlDownload} download={arquivo.nome} style={{ display: "inline-flex" }}>
            <Botao variante="secundario" icone="download" tamanho="sm">Baixar</Botao>
          </a>
        </span>
      }
      rodape={
        <Acoes>
          <Botao variante="perigo" icone="trash" estado={apagar.estado} onClick={() => apagar.rodar()}>Apagar</Botao>
          <Esp />
          <Botao variante="primario" estado={salvar.estado} disabled={!mudou || !nome.trim()} onClick={() => salvar.rodar()}>
            Salvar
          </Botao>
        </Acoes>
      }
    >
      <div style={{ display: "grid", gap: 18 }}>
        {visualizavel(arquivo.formato) ? (
          <Visualizador3D arquivoId={arquivo.id} formato={arquivo.formato} urlDownload={urlDownload} />
        ) : (
          <Momento compacto icone="file-description" titulo={`${arquivo.formato.toUpperCase()} não tem visualização`}
            texto={arquivo.formato.startsWith("gcode") || arquivo.formato === "bgcode"
              ? "G-code é o caminho do bico, não uma malha — abra no fatiador. O download continua normal."
              : "Este formato ainda não monta no palco 3D. O download continua normal."} />
        )}
        <Campos min={220}>
          <Campo label="Nome" largo>
            {(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} />}
          </Campo>
          <Campo label="Descrição" largo dica="Pra que peça serve, material, altura de camada — o que a busca deve achar.">
            {(id) => <textarea id={id} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={2000} />}
          </Campo>
          <Campo label="Tags" largo dica="Separadas por vírgula. Ex.: suporte, ender-3, pla">
            {(id) => <input id={id} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="suporte, ender-3, pla" />}
          </Campo>
        </Campos>

        {/* Arquivo → programações → máquina → histórico: onde a peça já rodou. */}
        {usos !== null && usos.length > 0 && (
          <section style={{ display: "grid", gap: 6 }}>
            <h3 style={{ fontSize: 13.5, margin: 0 }}>Onde já rodou</h3>
            {usos.map((u) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)", flexWrap: "wrap" }}>
                <BolinhaStatus status={u.status as import("@/lib/impressao3d-const").StatusProgramacao} />
                <span>{u.quantidade}× · {u.maquinaNome || "sem máquina"}{u.data ? ` · ${u.data.split("-").reverse().join("/")}` : ""}{u.hora ? ` ${u.hora}` : ""}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </PainelLateral>
  );
}
