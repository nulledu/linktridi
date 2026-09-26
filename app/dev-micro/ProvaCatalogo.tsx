"use client";

import { useState, type ReactNode } from "react";
import { AmostrasCor, CampoCor, SeletorCor } from "../(plataforma)/ui/cores";
import { CampoAdorno, CampoBusca, GrupoOpcoes } from "../(plataforma)/ui/formularios";
import { Avatares, Medidor, Tecla } from "../(plataforma)/ui/exibicao";
import { Paginacao, SombraRolagem, Trilha } from "../(plataforma)/ui/navegacao";

// ── Catálogo por categoria do HeroUI v3 ─────────────────────────────────────
// Mesma ordem de heroui.com/en/docs/react/components. Cada categoria mostra as
// peças NOVAS montadas aqui e aponta (âncora) pras que já têm bloco mais abaixo.
// O manual da mesma tabela é o "Catálogo do HeroUI v3 × o nosso kit" do DEVKIT.md.

const CATEGORIAS: { nome: string; pecas: string; ancora?: string }[] = [
  { nome: "Buttons", pecas: "Botao, BotaoIcone, Acoes, BotaoCopiar, BotaoApagar", ancora: "acabamento" },
  { nome: "Collections", pecas: "Dropdown, GlassSelect, Chips", ancora: "dropdown" },
  { nome: "Colors", pecas: "SeletorCor, CampoCor, AmostrasCor", ancora: "hc-colors" },
  { nome: "Controls", pecas: "Interruptor, Caixa, Deslizante, GrupoOpcoes", ancora: "hc-controls" },
  { nome: "Data Display", pecas: "Avatar, Avatares, Chip, Selo, Tecla, Medidor, DataList", ancora: "hc-data" },
  { nome: "Date and Time", pecas: "CalendarioDia, CalendarioIntervalo, GlassDate, PeriodPicker, GlassTime", ancora: "calendario" },
  { nome: "Feedback", pecas: "Alerta, toast(), Progresso, AnelProgresso, Skeleton", ancora: "alertas" },
  { nome: "Forms", pecas: "Campo, CampoOTP, CampoBusca, CampoAdorno", ancora: "hc-forms" },
  { nome: "Layout", pecas: "Panel, Secao, BarraFerramentas, Acoes" },
  { nome: "Media", pecas: "Avatar, SombraRolagem", ancora: "hc-nav" },
  { nome: "Navigation", pecas: "Abas, Trilha, Paginacao, .tab-strip", ancora: "hc-nav" },
  { nome: "Overlays", pecas: "Modal, PainelLateral, confirmar(), Dica", ancora: "modal" },
  { nome: "Pickers", pecas: "GlassSelect, GlassMultiSelect, GlassCombobox", ancora: "autocomplete" },
  { nome: "Typography", pecas: "escala do globals.css, PageHead" },
  { nome: "Utilities", pecas: "SombraRolagem, .glass, anel do Botao estado", ancora: "hc-nav" },
];

function Cat({ id, titulo, nota, children }: { id: string; titulo: string; nota: string; children: ReactNode }) {
  return (
    <section id={id} style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>{titulo}</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 4, maxWidth: "70ch" }}>{nota}</p>
      </div>
      <div className="glass" style={{ padding: 16, borderRadius: "var(--r-md, 18px)", display: "grid", gap: 18, minWidth: 0 }}>{children}</div>
    </section>
  );
}

const PALETA = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#ca8a04", "#ea580c", "#e11d48", "#52525b"];

export function ProvaCatalogo() {
  const [cor, setCor] = useState("#7c3aed");
  const [frete, setFrete] = useState<"retira" | "correio" | "moto">("correio");
  const [efeito, setEfeito] = useState<"abono" | "banco">("abono");
  const [busca, setBusca] = useState("");
  const [preco, setPreco] = useState("129,90");
  const [margem, setMargem] = useState("35");
  const [pag, setPag] = useState(4);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 16px 0", display: "grid", gap: 28, minWidth: 0 }}>
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>Devkit · catálogo HeroUI v3</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 6, maxWidth: "64ch" }}>
          As 15 categorias do HeroUI, cada uma com a peça do kit que a representa. Tela nunca importa
          <code style={{ margin: "0 4px" }}>@heroui/react</code> direto: importa daqui.
        </p>
      </header>

      <nav aria-label="Categorias" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 220px), 1fr))" }}>
        {CATEGORIAS.map((c) => (
          <a key={c.nome} href={c.ancora ? `#${c.ancora}` : undefined} className="glass"
            style={{ padding: "10px 12px", borderRadius: "var(--r-sm, 12px)", textDecoration: "none", color: "inherit", minHeight: 44, display: "grid", gap: 2 }}>
            <strong style={{ fontSize: 13.5 }}>{c.nome}</strong>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{c.pecas}</span>
          </a>
        ))}
      </nav>

      <Cat id="hc-colors" titulo="Colors — SeletorCor, CampoCor, AmostrasCor" nota="CampoCor é a versão compacta (substitui o <input type=color>): amostra com alvo de 44px que abre o seletor numa folha ancorada, presa embaixo no celular. ColorArea + ColorSlider (matiz) + ColorField (hex) montados na tela, sem popover: cor escolhe-se olhando o resultado. AmostrasCor = ColorSwatchPicker pra paleta fechada. API em hex string, que é o que o banco guarda.">
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
          <SeletorCor valor={cor} aoMudar={setCor} rotulo="Destaque" />
          <div style={{ display: "grid", gap: 10 }}>
            <AmostrasCor valor={cor} aoMudar={setCor} cores={PALETA} rotulo="Paleta" />
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <CampoCor valor={cor} aoMudar={setCor} rotulo="Cor do botão" />
              <CampoCor valor={cor} aoMudar={setCor} rotulo="Cor com hex" comHex />
            </div>
          </div>
        </div>
      </Cat>

      <Cat id="hc-controls" titulo="Controls — GrupoOpcoes (RadioGroup)" nota="Escolha única quando cada opção precisa de uma frase. Sem frase, use Chips. No toque cada opção tem 44px. Com `cartao`, cada opção é um cartão e a marcada pinta com a cor dela (Meu Ponto).">
        <GrupoOpcoes rotulo="Entrega" valor={frete} aoMudar={setFrete} opcoes={[
          { valor: "retira", rotulo: "Retirar na loja", descricao: "Pronto em 2 horas." },
          { valor: "correio", rotulo: "Correios", descricao: "5 a 8 dias úteis." },
          { valor: "moto", rotulo: "Motoboy", descricao: "Só na capital.", desligada: true },
        ]} />
        <GrupoOpcoes cartao rotulo="E as horas?" valor={efeito} aoMudar={setEfeito} opcoes={[
          { valor: "abono", rotulo: "Abonar", descricao: "Conta como trabalhada.", cor: "var(--ok)" },
          { valor: "banco", rotulo: "Descontar do banco", descricao: "Sai do saldo de horas.", cor: "var(--atencao)" },
        ]} />
      </Cat>

      <Cat id="hc-data" titulo="Data Display — Tecla, Avatares, Medidor" nota="Tecla (Kbd) some no celular — não há teclado. Avatares sobrepõe rostos com +N. Medidor (Meter) é quanto de um teto foi usado; a cor vira atenção a 75% e perigo a 90%. Progresso de tarefa continua Progresso.">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13 }}>Buscar em tudo</span><Tecla mods={["command"]}>K</Tecla>
          <Tecla mods={["shift", "command"]}>P</Tecla>
          <span style={{ fontSize: 13 }}>Na frase (não some no celular): volte com <Tecla sempre>Ctrl</Tecla>+<Tecla sempre>Z</Tecla>.</span>
        </div>
        <Avatares pessoas={["Ana Souza", "Bruno Lima", "Carla Dias", "Davi Rocha", "Eva Nunes", "Fábio Reis"].map((nome) => ({ nome }))} />
        <div style={{ display: "grid", gap: 14, maxWidth: 420 }}>
          <Medidor rotulo="Armazenamento" valor={42} />
          <Medidor rotulo="Cota da Meta" valor={81} />
          <Medidor rotulo="Capacidade da máquina" valor={9.4} max={10} formatar={(v, m) => `${v} de ${m} h`} />
        </div>
      </Cat>

      <Cat id="hc-forms" titulo="Forms — CampoBusca, CampoAdorno" nota="CampoBusca = SearchField com lupa do Tabler; Esc ou o x limpam. CampoAdorno = InputGroup: R$ e % ficam fora do valor digitado.">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Buscar pedido, cliente…" largo />
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>
          <CampoAdorno rotulo="Preço" antes="R$" valor={preco} aoMudar={setPreco} modo="decimal" />
          <CampoAdorno rotulo="Margem" depois="%" valor={margem} aoMudar={setMargem} modo="numeric" />
        </div>
      </Cat>

      <Cat id="hc-nav" titulo="Navigation / Media / Utilities — Trilha, Paginacao, SombraRolagem" nota="Trilha (Breadcrumbs) vira '‹ voltar' no celular. Paginacao vira '‹ 4 de 12 ›' a 320px. SombraRolagem esmaece a borda de uma lista que rola — nunca em fileira que abre popover.">
        <Trilha itens={[{ rotulo: "Lojas", href: "#" }, { rotulo: "Minha loja", href: "#" }, { rotulo: "Aparência" }]} />
        <Paginacao pagina={pag} total={12} aoMudar={setPag} />
        <SombraRolagem altura="160px">
          <ol style={{ display: "grid", gap: 6, paddingInlineStart: 20 }}>
            {Array.from({ length: 14 }, (_, i) => <li key={i}>Pedido #{1040 + i}</li>)}
          </ol>
        </SombraRolagem>
      </Cat>
    </div>
  );
}
