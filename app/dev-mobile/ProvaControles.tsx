"use client";

// TEMPORÁRIO — banco de provas do KIT DE CONTROLES (`ui/controles.tsx`).
// Serve pra ver as variantes lado a lado nos dois temas, medir os 44px de toque
// e testar o painel lateral (arrastar pra baixo fecha) sem precisar logar.
import { useState } from "react";
import { Acoes, Botao, BotaoIcone, Campo, Campos, Esp, PainelLateral, type Tamanho, type Variante } from "../(plataforma)/ui/controles";
import { GlassSelect } from "../(plataforma)/GlassPicker";

const VARIANTES: Variante[] = ["primario", "secundario", "sutil", "perigo"];
const TAMANHOS: Tamanho[] = ["sm", "md", "lg"];

export function ProvaControles() {
  const [painel, setPainel] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [fruta, setFruta] = useState("uva");

  return (
    <div id="prova-controles" style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 4px" }}>Prova dos controles</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 14px" }}>
        Quatro variantes, três tamanhos, um raio só. Feedback no pressionar.
      </p>

      <div className="glass" style={{ padding: 16, borderRadius: 16, display: "grid", gap: 14 }}>
        {TAMANHOS.map((t) => (
          <div key={t} style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
            {VARIANTES.map((v) => (
              <Botao key={v} variante={v} tamanho={t} icone="check">{v}</Botao>
            ))}
            <BotaoIcone icone="trash" titulo="Excluir" tamanho={t} variante="perigo" />
          </div>
        ))}

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
          <Botao variante="primario" carregando={carregando}
            onClick={() => { setCarregando(true); setTimeout(() => setCarregando(false), 1400); }}>
            Salvar
          </Botao>
          <Botao disabled>Desabilitado</Botao>
          <Botao variante="primario" onClick={() => setPainel(true)} icone="layout-columns">Abrir painel lateral</Botao>
        </div>

        <Botao variante="secundario" bloco icone="plus">Bloco (linha inteira)</Botao>
      </div>

      <PainelLateral
        aberto={painel}
        onFechar={() => setPainel(false)}
        titulo="Painel lateral"
        subtitulo="Direita no computador, folha no celular"
        rodape={(
          <Acoes>
            <Esp />
            <Botao onClick={() => setPainel(false)}>Cancelar</Botao>
            <Botao variante="primario" onClick={() => setPainel(false)}>Confirmar</Botao>
          </Acoes>
        )}
      >
        <p style={{ fontSize: 13.5, color: "var(--text-dim)", marginTop: 0 }}>
          No celular, arraste o puxador pra baixo: o painel segue o dedo e fecha
          se o impulso levar pra lá. Esc também fecha, e o fundo não rola.
        </p>
        <Campos>
          <Campo label="Dropdown padrão" dica="Um rótulo com um tamanho só.">
            <GlassSelect value={fruta} onChange={setFruta}
              options={[{ value: "uva", label: "Uva" }, { value: "caju", label: "Caju" }, { value: "manga", label: "Manga" }]} />
          </Campo>
          <Campo label="Campo de texto">
            {(id) => <input id={id} placeholder="Digite algo" />}
          </Campo>
          <Campo label="Com erro" erro="Esse código já existe.">
            {(id) => <input id={id} defaultValue="JL-014" />}
          </Campo>
          <Campo label="Observações" largo dica="A dica fica embaixo, sempre no mesmo lugar.">
            {(id) => <textarea id={id} rows={2} placeholder="Contexto, referências…" />}
          </Campo>
        </Campos>
        {Array.from({ length: 12 }, (_, i) => (
          <p key={i} style={{ fontSize: 13, color: "var(--text-dim)" }}>Linha {i + 1} — o corpo rola por dentro, o rodapé fica preso.</p>
        ))}
      </PainelLateral>
    </div>
  );
}
