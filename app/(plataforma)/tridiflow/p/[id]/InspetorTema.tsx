"use client";

// TEMA da página — a aparência global (paleta, fontes, cantos, sombra, fundo).
//
// A ordem dos campos é a ordem em que a pessoa decide: primeiro a PREDEFINIÇÃO
// (um clique que já entrega uma página bonita), depois a cor principal (a
// edição mais comum), e só então o resto. Quem não quiser mexer em nada para
// no primeiro bloco.

import { CampoCor } from "@/app/(plataforma)/ui/cores";
import { useEffect, useState } from "react";
import type { PaginaConfig } from "@/lib/tridiflow-pagina";
import {
  CORES_ACENTO, FONTES, GRADIENTES, GRADIENTE_CUSTOM_PADRAO, PREDEFINICOES, TEMA_PADRAO,
  cssGradienteCustom, type Fundo, type GradienteCustom,
} from "@/lib/tridiflow-pagina-tema";
import { pesoValido } from "@/lib/tridiflow-ab";
import { ACENTO, Campo, EntradaImagem, LinhaCor, LinhaToggle, Numero, Secao, Selecao, Segmentado, Texto, inp } from "../_ui";
import { Icon } from "../../../Icon";
import { Botao, BotaoIcone } from "../../../ui/controles";
import { Deslizante } from "../../../ui/Deslizante";

const IDS_CATALOGO = new Set(FONTES.map((f) => f.id));
/** A fonte é uma do catálogo ou uma família digitada à mão? Decide qual dos dois
 *  controles mostra o valor — sem isso o `<select>` ficaria com uma opção
 *  fantasma selecionada quando a pessoa digita uma fonte própria. */
const ehCatalogo = (v: string | undefined) => !v || IDS_CATALOGO.has(v);

export function InspetorTema({ config, onConfig }: {
  config: PaginaConfig;
  onConfig: (patch: Partial<PaginaConfig>) => void;
}) {
  const fundo: Fundo = config.fundo ?? { tipo: "cor" };
  const setFundo = (p: Partial<Fundo>) => onConfig({ fundo: { ...fundo, ...p } });

  return (
    <div style={{ display: "grid", gap: 2 }}>
      <Secao titulo="Estilo pronto">
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "0 0 9px", lineHeight: 1.45 }}>
          Troca paleta, fontes e cantos de uma vez. Depois você ajusta o que quiser.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
          {PREDEFINICOES.map((p) => {
            const ativa = config.predefinicao === p.id;
            return (
              <button
                key={p.id}
                title={p.descricao}
                onClick={() => onConfig({ ...p.tema, predefinicao: p.id })}
                style={{
                  textAlign: "left", padding: 9, borderRadius: 11, cursor: "pointer",
                  border: `1px solid ${ativa ? ACENTO : "var(--border)"}`,
                  background: ativa ? `color-mix(in srgb, ${ACENTO} 10%, transparent)` : "var(--surface-2)",
                }}
              >
                <AmostraTema tema={p.tema} />
                <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text)", marginTop: 6 }}>{p.rotulo}</div>
              </button>
            );
          })}
        </div>
      </Secao>

      <Secao titulo="Cor principal">
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "0 0 8px" }}>
          Vale para botões, preços e destaques.
        </p>
        <Paleta
          valor={config.corPrimaria ?? TEMA_PADRAO.corPrimaria}
          onChange={(c) => onConfig({ corPrimaria: c })}
        />
      </Secao>

      <Secao titulo="Cores">
        <CorLinha rotulo="Fundo" valor={config.corFundo ?? TEMA_PADRAO.corFundo} onChange={(v) => onConfig({ corFundo: v })} />
        <CorLinha rotulo="Texto" valor={config.corTexto ?? TEMA_PADRAO.corTexto} onChange={(v) => onConfig({ corTexto: v })} />
        <CorLinha rotulo="Títulos" valor={config.corTitulo || config.corTexto || TEMA_PADRAO.corTexto}
          onChange={(v) => onConfig({ corTitulo: v })}
          aoLimpar={config.corTitulo ? () => onConfig({ corTitulo: undefined }) : undefined} />
        <CorLinha rotulo="Caixas" valor={config.corSuave || "#f6f6f8"}
          onChange={(v) => onConfig({ corSuave: v })}
          aoLimpar={config.corSuave ? () => onConfig({ corSuave: undefined }) : undefined} />
      </Secao>

      <Secao titulo="Teste A/B" aberta={!!config.teste?.ativo}>
        <LinhaToggle
          label="Testar duas versões"
          hint="Divide o tráfego e mede qual converte mais. Depois de ligar, marque em cada bloco se ele é só da A ou só da B."
          ativo={!!config.teste?.ativo}
          onChange={(ativo) => onConfig({ teste: { ...(config.teste ?? {}), ativo } })}
        />
        {config.teste?.ativo && (
          <>
            <Campo label={`Fatia da versão A — ${pesoValido(config.teste.pesoA)}%`}
              hint={`A versão B fica com ${100 - pesoValido(config.teste.pesoA)}%. Meio a meio é o normal; mova só pra proteger uma versão que você não quer expor tanto.`}>
              <Deslizante min={0} max={100} step={5} value={pesoValido(config.teste.pesoA)}
                onChange={(v) => onConfig({ teste: { ...config.teste, pesoA: v } })}
                aria-label="Peso da variação A" />
            </Campo>
            <Campo label="Nome da versão A" hint="Só pra você se achar no placar.">
              <Texto valor={config.teste.nomeA ?? ""} onChange={(v) => onConfig({ teste: { ...config.teste, nomeA: v || undefined } })}
                placeholder="Ex.: headline atual" />
            </Campo>
            <Campo label="Nome da versão B">
              <Texto valor={config.teste.nomeB ?? ""} onChange={(v) => onConfig({ teste: { ...config.teste, nomeB: v || undefined } })}
                placeholder="Ex.: headline com preço" />
            </Campo>
            <p style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45, margin: "8px 0 0" }}>
              Desligar devolve a página na versão A. Os blocos marcados como “só B” deixam
              de aparecer — eles são a variação em teste, não a página.
            </p>
          </>
        )}
      </Secao>

      <Secao titulo="Fontes">
        <Campo label="Texto">
          <Selecao valor={ehCatalogo(config.fonte) ? config.fonte! : "sistema"} onChange={(v) => onConfig({ fonte: v })}
            opcoes={FONTES.map((f) => ({ valor: f.id, label: `${f.rotulo} — ${f.nota}` }))} />
        </Campo>
        <Campo label="Peso dos títulos" hint="Médio dá o ar de marca premium: manchete grande e leve.">
          <Segmentado valor={String(config.pesoTitulo ?? 800)} onChange={(v) => onConfig({ pesoTitulo: Number(v) as 600 | 700 | 800 })}
            opcoes={[{ valor: "600", label: "Médio" }, { valor: "700", label: "Forte" }, { valor: "800", label: "Pesado" }]} />
        </Campo>
        <Campo label="Trecho em destaque" hint="Como sai a palavra marcada no título.">
          <Segmentado valor={config.destaque ?? "serifa"} onChange={(v) => onConfig({ destaque: v === "suave" || v === "cor" ? v : undefined })}
            opcoes={[{ valor: "serifa", label: "Serifa" }, { valor: "suave", label: "Tom suave" }, { valor: "cor", label: "Cor principal" }]} />
        </Campo>
        <Campo label="Títulos" hint="Vazio usa a mesma fonte do texto.">
          <Selecao valor={ehCatalogo(config.fonteTitulo) ? config.fonteTitulo! : ""} onChange={(v) => onConfig({ fonteTitulo: v || undefined })}
            opcoes={[{ valor: "", label: "Mesma do texto" }, ...FONTES.map((f) => ({ valor: f.id, label: f.rotulo }))]} />
        </Campo>
        {/* As do catálogo vêm do próprio domínio (next/font) e são a escolha
            melhor. A família livre existe pra quando a marca tem uma fonte que
            não está na lista — e o aviso é honesto sobre o custo. */}
        <Campo label="Outra fonte (avançado)"
          hint="Nome de uma família instalada no aparelho de quem abre. Se não existir lá, a página usa a fonte do sistema.">
          <Texto valor={ehCatalogo(config.fonte) ? "" : (config.fonte ?? "")}
            onChange={(v) => onConfig({ fonte: v.trim() || "sistema" })}
            placeholder="Ex.: Futura, Avenir" />
        </Campo>
      </Secao>

      <Secao titulo="Fundo da página">
        <Segmentado
          valor={fundo.tipo}
          onChange={(t) => setFundo({ tipo: t as Fundo["tipo"] })}
          opcoes={[{ valor: "cor", label: "Cor" }, { valor: "gradiente", label: "Gradiente" }, { valor: "imagem", label: "Imagem" }]}
        />

        {fundo.tipo === "gradiente" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 9 }}>
              {GRADIENTES.map((g) => (
                <button key={g.id} title={g.rotulo}
                  onClick={() => setFundo({ gradiente: g.id, gradienteCustom: undefined })}
                  style={{
                    height: 46, borderRadius: 9, cursor: "pointer", background: g.css,
                    border: `2px solid ${!fundo.gradienteCustom && fundo.gradiente === g.id ? ACENTO : "transparent"}`,
                    boxShadow: !fundo.gradienteCustom && fundo.gradiente === g.id ? `0 0 0 2px color-mix(in srgb, ${ACENTO} 30%, transparent)` : "none",
                  }} />
              ))}
            </div>
            <EditorGradiente valor={fundo.gradienteCustom} onChange={(g) => setFundo({ gradienteCustom: g })} />
          </>
        )}

        {fundo.tipo === "imagem" && (
          <div style={{ marginTop: 9, display: "grid", gap: 9 }}>
            <EntradaImagem valor={fundo.imagemUrl} onChange={(url) => setFundo({ imagemUrl: url })} />
            <Campo label="Como preencher">
              <Selecao valor={fundo.ajuste ?? "cobrir"} onChange={(v) => setFundo({ ajuste: v as Fundo["ajuste"] })}
                opcoes={[{ valor: "cobrir", label: "Cobrir a tela" }, { valor: "conter", label: "Caber inteira" }, { valor: "repetir", label: "Repetir (textura)" }]} />
            </Campo>
            <LinhaToggle label="Fundo parado ao rolar" ativo={!!fundo.fixo} onChange={(v) => setFundo({ fixo: v })}
              hint="Dá profundidade. No celular fica normal (iOS trava com fundo fixo)." />
          </div>
        )}

        {(fundo.tipo === "imagem" || fundo.tipo === "gradiente") && (
          <div style={{ marginTop: 9 }}>
            <Campo label={`Escurecer por cima — ${fundo.veu ?? 0}%`}
              hint="Sem isso, texto sobre foto some. 30–50% costuma resolver.">
              <Deslizante min={0} max={90} step={5} value={fundo.veu ?? 0}
                onChange={(v) => setFundo({ veu: v })}
                aria-label="Escurecer por cima" />
            </Campo>
          </div>
        )}
      </Secao>

      <Secao titulo="Acabamento">
        <Campo label="Cantos arredondados" hint="Vale como padrão para botões, cards e caixas.">
          <Numero valor={config.raio ?? TEMA_PADRAO.raio} onChange={(v) => onConfig({ raio: v })} min={0} max={40} sufixo="px" />
        </Campo>
        <Campo label="Sombra">
          <Selecao valor={config.sombra ?? TEMA_PADRAO.sombra} onChange={(v) => onConfig({ sombra: v as PaginaConfig["sombra"] })}
            opcoes={[{ valor: "nenhuma", label: "Sem sombra" }, { valor: "leve", label: "Leve" }, { valor: "media", label: "Média" }, { valor: "forte", label: "Forte" }]} />
        </Campo>
        <Campo label="Largura do conteúdo" hint="Quanto o texto ocupa no computador.">
          <Numero valor={config.larguraMax ?? TEMA_PADRAO.larguraMax} onChange={(v) => onConfig({ larguraMax: v })} min={420} max={1200} sufixo="px" />
        </Campo>
        <LinhaToggle label="Desligar animações" ativo={!!config.semAnimacoes} onChange={(v) => onConfig({ semAnimacoes: v })}
          hint="Desliga todas de uma vez, sem precisar mexer bloco a bloco." />
        <LinhaToggle label="Rolagem viva (estilo Apple)" ativo={!!config.rolagemViva} onChange={(v) => onConfig({ rolagemViva: v || undefined })}
          hint="Cada bloco surge enquanto entra na tela, acompanhando a rolagem (e volta se a pessoa sobe). Links de âncora deslizam. Só na página no ar." />
        <LinhaToggle label="Lembrar liberação por tempo" ativo={config.lembrarProgresso !== false}
          onChange={(v) => onConfig({ lembrarProgresso: v ? undefined : false })}
          hint="Quem atualiza a página continua de onde parou — a oferta liberada não some. Desligado, o relógio recomeça a cada visita." />
      </Secao>

      {/* Como o link se apresenta FORA da página: aba do navegador e cartão de
          compartilhamento. É metade da primeira impressão de uma landing que
          circula por WhatsApp — e até aqui só os templates preenchiam. */}
      <Secao titulo="Aba e compartilhamento" aberta={false}>
        <Campo label="Título da aba" hint="Vazio usa o nome do projeto. Também é o título do cartão ao compartilhar.">
          <Texto valor={config.tituloSeo ?? ""} onChange={(v) => onConfig({ tituloSeo: v || undefined })}
            placeholder="Ex.: Oferta especial — Tridi Gaia" />
        </Campo>
        <Campo label="Descrição do cartão" hint="A frase abaixo do título quando o link é mandado no WhatsApp.">
          <Texto valor={config.descricaoSeo ?? ""} onChange={(v) => onConfig({ descricaoSeo: v || undefined })}
            placeholder="Uma frase que faça a pessoa querer abrir." linhas={2} />
        </Campo>
        <Campo label="Imagem do cartão" hint="Aparece grande no compartilhamento. O ideal é 1200×630.">
          <EntradaImagem valor={config.imagemOgUrl} onChange={(url) => onConfig({ imagemOgUrl: url || undefined })} />
        </Campo>
        <Campo label="Ícone da aba (favicon)" hint="Quadrado pequeno — 64×64 resolve.">
          <EntradaImagem valor={config.faviconUrl} onChange={(url) => onConfig({ faviconUrl: url || undefined })} />
        </Campo>
      </Secao>
    </div>
  );
}

// Miniatura da predefinição: fundo, título e botão — o suficiente pra escolher
// pela cara em vez de pelo nome.
function AmostraTema({ tema }: { tema: PaginaConfig }) {
  const grad = tema.fundo?.tipo === "gradiente" ? GRADIENTES.find((g) => g.id === tema.fundo?.gradiente)?.css : "";
  return (
    <div style={{
      height: 42, borderRadius: 7, overflow: "hidden", padding: "7px 8px",
      background: grad || tema.corFundo, border: "1px solid rgba(128,128,128,.2)",
      display: "flex", flexDirection: "column", justifyContent: "center", gap: 4,
    }}>
      <div style={{ height: 5, width: "72%", borderRadius: 3, background: tema.corTitulo || tema.corTexto, opacity: .9 }} />
      <div style={{ height: 3, width: "52%", borderRadius: 3, background: tema.corTexto, opacity: .45 }} />
      <div style={{ height: 9, width: 40, borderRadius: Math.min(5, tema.raio ?? 4), background: tema.corPrimaria, marginTop: 2 }} />
    </div>
  );
}

function Paleta({ valor, onChange }: { valor: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {CORES_ACENTO.map((c) => (
        <button key={c} onClick={() => onChange(c)} title={c}
          style={{
            width: 26, height: 26, borderRadius: 8, background: c, cursor: "pointer",
            border: valor.toLowerCase() === c.toLowerCase() ? `2px solid var(--text)` : "1px solid rgba(128,128,128,.25)",
          }} />
      ))}
      <CampoCor rotulo="Escolher outra cor" valor={valor} aoMudar={onChange} tamanho={18} />
    </div>
  );
}

function CorLinha({ rotulo, valor, onChange, aoLimpar }: {
  rotulo: string; valor: string; onChange: (v: string) => void; aoLimpar?: () => void;
}) {
  // O campo tem estado próprio pra deixar digitar livre ("#1a" no meio da
  // digitação não pode virar cor). Mas quando o valor muda POR FORA — aplicar
  // uma predefinição, desfazer — o texto tem que acompanhar, senão mostra a cor
  // antiga enquanto a página já está com a nova.
  const [texto, setTexto] = useState(valor);
  useEffect(() => { setTexto(valor); }, [valor]);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
      <span style={{ flex: 1, fontSize: 12.5, color: "var(--text)" }}>{rotulo}</span>
      {aoLimpar && (
        <Botao variante="sutil" tamanho="sm" onClick={aoLimpar} title="Voltar ao automático">auto</Botao>
      )}
      <input value={texto} onChange={(e) => { setTexto(e.target.value); onChange(e.target.value); }}
        style={{ ...inp, width: 84, fontSize: 11.5, fontVariantNumeric: "tabular-nums" }} />
      <CampoCor rotulo={rotulo} valor={valor} aoMudar={(v) => { setTexto(v); onChange(v); }} tamanho={22} />
    </div>
  );
}

/**
 * Gradiente próprio — ângulo e paradas.
 *
 * A lista de dez presets existia porque o arquivo de tema não aceita CSS escrito
 * pelo usuário (era a defesa contra injeção). Aqui a pessoa mexe em NÚMEROS e
 * CORES; quem monta o `linear-gradient(...)` é `cssGradienteCustom`, então a
 * defesa continua de pé e o teto de dez opções cai.
 */
export function EditorGradiente({ valor, onChange }: {
  valor: GradienteCustom | undefined;
  onChange: (g: GradienteCustom | undefined) => void;
}) {
  if (!valor) {
    return (
      <Botao icone="palette" bloco onClick={() => onChange(GRADIENTE_CUSTOM_PADRAO())} style={{ marginTop: 9 }}>
        Criar o meu gradiente
      </Botao>
    );
  }

  const set = (p: Partial<GradienteCustom>) => onChange({ ...valor, ...p });
  const setParada = (i: number, p: Partial<{ cor: string; pos: number }>) =>
    set({ paradas: valor.paradas.map((x, n) => (n === i ? { ...x, ...p } : x)) });

  return (
    <div style={{ marginTop: 9, display: "grid", gap: 9, padding: 10, borderRadius: 11, border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span aria-hidden style={{ flex: 1, height: 40, borderRadius: 8, background: cssGradienteCustom(valor) || "var(--surface-2)", border: "1px solid var(--border)" }} />
        <BotaoIcone icone="trash" titulo="Voltar para os prontos" variante="secundario" onClick={() => onChange(undefined)} />
      </div>

      <Campo label={`Ângulo — ${valor.angulo}°`}>
        <Deslizante min={0} max={360} step={5} value={valor.angulo}
          onChange={(v) => set({ angulo: v })} aria-label="Ângulo do gradiente" />
      </Campo>

      {valor.paradas.map((p, i) => (
        <div key={i} style={{ display: "grid", gap: 4 }}>
          <LinhaCor label={`Cor ${i + 1} — ${p.pos}%`} valor={p.cor} onChange={(c) => setParada(i, { cor: c || "#000000" })} padrao={p.cor} />
          <Deslizante min={0} max={100} value={p.pos}
            onChange={(v) => setParada(i, { pos: v })} aria-label="Posição da parada" />
        </div>
      ))}

      <div style={{ display: "flex", gap: 6 }}>
        {valor.paradas.length < 4 && (
          <Botao icone="plus" onClick={() => set({ paradas: [...valor.paradas, { cor: "#ffffff", pos: 100 }] })} style={{ flex: 1 }}>
            Mais uma cor
          </Botao>
        )}
        {valor.paradas.length > 2 && (
          <Botao icone="minus" onClick={() => set({ paradas: valor.paradas.slice(0, -1) })} style={{ flex: 1 }}>
            Menos uma
          </Botao>
        )}
      </div>
    </div>
  );
}


