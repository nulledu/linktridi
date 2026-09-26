# Painéis de TV v2 — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a parede de TV desenha do disco antes de perguntar à rede, reage em segundos a mudança de perfil/versão/comando por Supabase Realtime, e o perfil Comercial vira duas telas (ranking do mockup + batalha).

**Architecture:** o app `tv-central` (Kotlin/Compose, multi-módulo) ganha um módulo `core:sinal` (WebSocket OkHttp no protocolo Phoenix do Supabase Realtime); o servidor Next ganha `lib/tv-sinal.ts` que faz broadcast nas rotas de escrita; a tela Comercial é uma RECEITA nova (`comercial-simples`) composta de widgets existentes com três opções e duas métricas novas, replicada em web e Kotlin com o teste de paridade que já existe.

**Tech Stack:** Next 15 + vitest (servidor/web); Kotlin 2.0 + Compose + OkHttp 4.12 + kotlinx.serialization + Hilt, testes JVM com JUnit (TV). Spec: `docs/superpowers/specs/2026-09-09-paineis-tv-v2-design.md`.

**Comandos de verificação** (raiz do repo):
- `npx vitest run lib/__tests__/painel-classico.test.ts` (ou o arquivo em questão)
- `npx tsc --noEmit`
- `cd tv-central && ./gradlew :panel:administracao:testDebugUnitTest :core:sinal:testDebugUnitTest --offline -q` (Gradle demora; rode uma vez por etapa Kotlin)

**Regra de commit:** cada task termina em commit próprio na `main`, push imediato, teste verde antes.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/painel-layout.ts` | métricas `meta_pct`/`pedidos_dia`, receita `comercial-simples`, CATALOGO, `widgetPadrao`, `perfisPadrao`, assinatura de fábrica do Comercial de 5 slides |
| `app/painel/widgets/Widgets.tsx` | `brutoDaMetrica`, `PERCENTUAL`/`CONTAGEM`, `Relogio.formato`, `Podio.pedidos/degrau`, `Equipe.faltam` |
| `app/painel/widgets/widgets.css` | `.pw-podio-vendas`, `.pw-base-rotulo`, `.pw-equipe-faltam` |
| `lib/__tests__/painel-classico.test.ts` | paridade + upgrade do Comercial |
| `tv-central/panel/administracao/.../ui/widgets/Widgets.kt` | mesmas métricas/opções em Compose |
| `tv-central/panel/administracao/.../data/Upgrade.kt` | receita `comercial-simples` + upgrade do PERFIL de 5 slides |
| `tv-central/panel/administracao/.../ui/AdminViewModel.kt` | cofre primeiro; reação ao sinal `config` |
| `tv-central/panel/administracao/.../data/AdminRepository.kt` | `doCofre()` — leitura só do disco |
| `tv-central/app/.../TridiTvApp.kt` | `ImageLoaderFactory` (Coil, fotos offline); sobe o `SinalDaParede` |
| `lib/tv-sinal.ts` + `lib/tv-sinal-nomes.ts` | broadcast do servidor |
| `app/api/config/route.ts`, `app/api/tv/route.ts`, `app/api/version/route.ts` | chamam `avisarTv`; `/api/version` expõe `sinal` |
| `tv-central/core/sinal/**` | módulo novo: `FramePhoenix.kt`, `SinalDaParede.kt`, teste |
| `tv-central/core/storage/.../DeviceStore.kt` | guarda `sinalUrl`/`sinalChave` |
| `tv-central/app/.../fleet/FleetAgent.kt` | laço 15 min + `cutucar()` |
| `app/painel/Panel.tsx` + `app/painel/useSinalDaParede.ts` | web assina o sinal |

---

### Task 1: Métricas `meta_pct` e `pedidos_dia` (web)

**Files:**
- Modify: `lib/painel-layout.ts` (arrays `metricas`, `ROTULO_METRICA`)
- Modify: `app/painel/widgets/Widgets.tsx` (`brutoDaMetrica`, `PERCENTUAL`, `CONTAGEM`, `ICONE_METRICA`)
- Test: `lib/__tests__/painel-classico.test.ts`

- [ ] **Step 1: teste**

Acrescente ao fim de `lib/__tests__/painel-classico.test.ts`:

```ts
describe("comercial enxuto", () => {
  it("as duas métricas do mockup existem com rótulo", () => {
    expect(metricas as readonly string[]).toContain("meta_pct");
    expect(metricas as readonly string[]).toContain("pedidos_dia");
    expect(ROTULO_METRICA.meta_pct).toBe("Meta do mês");
    expect(ROTULO_METRICA.pedidos_dia).toBe("Vendas hoje");
  });
});
```
(importe `ROTULO_METRICA` no topo.)

- [ ] **Step 2:** `npx vitest run lib/__tests__/painel-classico.test.ts` → FALHA (métrica ausente).

- [ ] **Step 3: implementação**

`lib/painel-layout.ts`: em `metricas`, depois de `"projecao_mes"`, insira `"meta_pct", "pedidos_dia",`. Em `ROTULO_METRICA`: `meta_pct: "Meta do mês", pedidos_dia: "Vendas hoje",`.

`app/painel/widgets/Widgets.tsx`, dentro do `switch (m)` de `brutoDaMetrica`, antes de `default`:

```ts
    // Percentual da meta do mês. Sem meta cadastrada não há percentual — a
    // tela mostra "—", nunca "0%" (que é uma afirmação sobre o time).
    case "meta_pct": {
      const meta = d.config.monthlyRevenueGoal || 0;
      if (meta <= 0) return null;
      const fat = t?.faturamentoEmpresa ?? s?.revenue.monthly ?? 0;
      return (fat / meta) * 100;
    }
    // Pedidos de HOJE somados por vendedora: é a única contagem diária que o
    // snapshot traz — `metrics.totalSales` é do mês.
    case "pedidos_dia":
      return (s?.salespeople ?? []).reduce((n, p) => n + Math.round(p.orders?.daily ?? 0), 0);
```

`PERCENTUAL`: `new Set(["margem", "meta_pct"])`. `CONTAGEM`: adicione `"pedidos_dia"`. `ICONE_METRICA`: `meta_pct: "target", pedidos_dia: "shopping-bag"`.

- [ ] **Step 4:** teste PASSA; `npx tsc --noEmit` limpo.
- [ ] **Step 5:** `git add lib/painel-layout.ts app/painel/widgets/Widgets.tsx lib/__tests__/painel-classico.test.ts && git commit -m "feat(painel): métricas meta do mês em % e vendas de hoje"` + push.

---

### Task 2: Opções `relogio.formato`, `podio.pedidos/degrau`, `equipe.faltam` (web)

**Files:**
- Modify: `app/painel/widgets/Widgets.tsx` (`Relogio`, `Podio`, `Equipe`)
- Modify: `app/painel/widgets/widgets.css`

- [ ] **Step 1: Relogio**

```tsx
function Relogio({ w }: { w: Widget }) {
  const agora = new Date();
  const soMes = w.opcoes.formato === "mes";
  const mes = MESES[agora.getMonth()];
  const data = soMes
    ? `${mes[0].toUpperCase()}${mes.slice(1)} ${agora.getFullYear()}`
    : `${String(agora.getDate()).padStart(2, "0")} de ${mes} de ${agora.getFullYear()}`;
  const hora = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  const mostrarHora = w.opcoes.hora !== false && !soMes;
  return (
    <div className="pw-relogio">
      <Icon name="calendar" size={18} />
      <span>{data}</span>
      {mostrarHora && <strong>{hora}</strong>}
    </div>
  );
}
```

- [ ] **Step 2: Podio** — dentro do `map`, após `<strong className="pw-valor…">`, e no `.pw-base`:

```tsx
            {w.opcoes.pedidos === true && (
              <span className="pw-podio-vendas">{fmtNum(Math.round(p.orders?.[periodo] ?? 0))} vendas</span>
            )}
            <div className={`pw-base pw-pos${pos}`} style={{ height: alturas[pos] }}>
              {w.opcoes.degrau === "lugar" && <span className="pw-base-rotulo">{pos}º LUGAR</span>}
            </div>
```

- [ ] **Step 3: Equipe** — substitua o bloco "Pedidos" por:

```tsx
      {w.opcoes.faltam === true ? (
        <span className="pw-equipe-num pw-equipe-faltam">
          <span className="pw-rotulo">{receita >= metaPeriodo && metaPeriodo > 0 ? "Meta batida" : "Faltam"}</span>
          <strong className="pw-numero">{fmtDinheiro(Math.max(0, metaPeriodo - receita), d.curtos)}</strong>
        </span>
      ) : (
        <span className="pw-equipe-num">
          <span className="pw-rotulo">Pedidos</span>
          <strong className="pw-numero">{fmtNum(pedidos)}</strong>
        </span>
      )}
```

- [ ] **Step 4: CSS** (fim do arquivo, dentro do bloco da pele clara):

```css
.pw-podio-vendas { font-size: 0.8em; color: var(--p-texto-fraco, #6b6880); font-weight: 600; }
.pw-base { display: grid; place-items: center; }
.pw-base-rotulo { font-weight: 900; letter-spacing: .04em; color: var(--p-texto, #2a1e5c); font-size: clamp(12px, 3cqh, 28px); }
.pw-base.pw-pos1 .pw-base-rotulo { color: #fff; }
.pw-equipe-faltam .pw-numero { color: var(--p-primaria, #6c4cf0); }
```

- [ ] **Step 5:** `npx tsc --noEmit`; abrir `/painel?perfil=p-comercial` só depois da Task 3. Commit: `feat(painel): pódio com vendas e degrau, relógio só do mês, equipe com "faltam"`.

---

### Task 3: Receita `comercial-simples`, perfil Comercial de 2 telas, upgrade por assinatura (web)

**Files:**
- Modify: `lib/painel-layout.ts` (`widgetTipos`, `RECEITA_CLASSICA`, `PERDAS_AO_SEPARAR`, `widgetPadrao`, `CATALOGO`, `perfisPadrao`, `comTelasAtualizadas`)
- Modify: `app/painel/widgets/Widgets.tsx` (`Classico` reconhece o tipo — ver Step 3)
- Test: `lib/__tests__/painel-classico.test.ts`

- [ ] **Step 1: testes**

```ts
  it("comercial-simples é tela pronta e o Comercial padrão tem só ela e a batalha", () => {
    expect(CATALOGO.find((c) => c.tipo === "comercial-simples")?.grupo).toBe("Telas prontas");
    const com = perfisPadrao().find((p) => p.id === "p-comercial")!;
    expect(com.slides.map((s) => s.nome)).toEqual(["Ranking", "Batalha"]);
    const tipos = com.slides[0].widgets.map((w) => w.tipo);
    expect(tipos).toEqual(["texto", "relogio", "podio", "kpi", "kpi", "kpi", "kpi", "equipe"]);
    expect(com.slides[0].widgets.map((w) => w.opcoes.metrica).filter(Boolean))
      .toEqual(["faturamento_mes", "meta_pct", "pedidos_dia", "ticket_medio"]);
  });

  it("o Comercial de fábrica com 5 telas vira o de 2 na leitura; o mexido fica", () => {
    const antigo = perfilComercialAntigo();
    const [novo] = comTelasAtualizadas([antigo]);
    expect(novo.slides.map((s) => s.nome)).toEqual(["Ranking", "Batalha"]);
    const mexido = { ...antigo, slides: antigo.slides.slice(0, 4) };
    expect(comTelasAtualizadas([mexido])[0].slides).toHaveLength(4);
  });
```
`perfilComercialAntigo()` no teste: monta o perfil com os cinco slides `pecasDaTela`-equivalentes usando `separarEmBlocos({id, tipo: "classico-…", x:0,y:0,w:COLUNAS,h:LINHAS, opcoes:{}}, …)` para `classico-ranking|batalha|financeiro|trafego|produtos`, ids `s-c-rank|bat|fin|traf|prod`.

- [ ] **Step 2:** rodar → FALHA.

- [ ] **Step 3: implementação**

`widgetTipos`: adicione `"comercial-simples"` após `"classico-produtos"`.

`RECEITA_CLASSICA["comercial-simples"]`:
```ts
  "comercial-simples": [
    { tipo: "texto", x: 0, y: 0, w: 8, h: 1, opcoes: { texto: "Dashboard Comercial", tamanho: "titulo" } },
    { tipo: "relogio", x: 8, y: 0, w: 4, h: 1, opcoes: { hora: false, formato: "mes" } },
    { tipo: "podio", x: 0, y: 1, w: 12, h: 4, opcoes: { periodo: "mes", pedidos: true, degrau: "lugar" } },
    { tipo: "kpi", x: 0, y: 5, w: 3, h: 2, opcoes: { metrica: "faturamento_mes" } },
    { tipo: "kpi", x: 3, y: 5, w: 3, h: 2, opcoes: { metrica: "meta_pct" } },
    { tipo: "kpi", x: 6, y: 5, w: 3, h: 2, opcoes: { metrica: "pedidos_dia" } },
    { tipo: "kpi", x: 9, y: 5, w: 3, h: 2, opcoes: { metrica: "ticket_medio" } },
    { tipo: "equipe", x: 0, y: 7, w: 12, h: 1, opcoes: { periodo: "mes", faltam: true } },
  ],
```
`PERDAS_AO_SEPARAR["comercial-simples"] = "nada — a tela já nasce em blocos"`.
`widgetPadrao`: inclua `case "comercial-simples":` no grupo 12×8.
`CATALOGO`: `{ tipo: "comercial-simples", nome: "Comercial (tela cheia)", descricao: "Pódio, quatro números e a meta da equipe", icone: "trophy", grupo: "Telas prontas" }`.
`perfisPadrao()` Comercial: `slides: [ {id:"s-c-rank", nome:"Ranking", …pecasDaTela("comercial-simples","rk")}, {id:"s-c-bat", nome:"Batalha", …pecasDaTela("classico-batalha","bt")} ]`, descrição `"Ranking do mês e a batalha Comercial × Marketing"`.

Upgrade do PERFIL em `comTelasAtualizadas`, antes do `map` de slides:
```ts
    // O Comercial de fábrica de 5 telas (ranking, batalha, financeiro,
    // tráfego, produtos) vira o de 2 — só quando as cinco ainda são EXATAMENTE
    // as de fábrica. Um bloco mexido em qualquer uma e o perfil é da pessoa.
    if (perfil.id === "p-comercial" && ehComercialDeFabrica(perfil)) {
      return perfisPadrao().find((p) => p.id === "p-comercial")!
        // preserva o que a pessoa pode ter mudado no perfil sem tocar nas telas
        && { ...perfisPadrao().find((p) => p.id === "p-comercial")!, nome: perfil.nome, polegadas: perfil.polegadas, paraTela: perfil.paraTela, numeroCurto: perfil.numeroCurto };
    }
```
com
```ts
const ASSINATURAS_COMERCIAL_5 = ["classico-ranking", "classico-batalha", "classico-financeiro", "classico-trafego", "classico-produtos"]
  .map((t) => assinaturaDeSlide(separarEmBlocos({ id: "x", tipo: t as WidgetTipo, x: 0, y: 0, w: COLUNAS, h: LINHAS, opcoes: {} }, () => "y")));
function ehComercialDeFabrica(p: Perfil): boolean {
  if (p.slides.length !== 5) return false;
  return p.slides.every((s, i) => {
    const a = assinaturaDeSlide(s.widgets);
    return a === ASSINATURAS_COMERCIAL_5[i] || ASSINATURA_DE_FABRICA[a] === ASSINATURAS_COMERCIAL_5_TIPOS[i];
  });
}
```
(`ASSINATURAS_COMERCIAL_5_TIPOS` = a lista de tipos acima; cobre tanto o desenho antigo de fábrica quanto o já-atualizado.) Como `separarEmBlocos` é declarado abaixo, use `function` hoisting ou mova a constante para depois dele — o TS acusa se ficar errado.

`Widgets.tsx` `Classico`: `TipoClassico` precisa aceitar `"comercial-simples"`; o corpo que "separa e desenha" já é genérico por `separarEmBlocos`, então basta o tipo. Se `Classico` tiver um `switch` por tipo, adicione `case "comercial-simples"` no ramo genérico.

- [ ] **Step 4:** teste PASSA; `npx vitest run lib/__tests__/painel-classico.test.ts` inteiro ainda FALHA no "a TV não desenha comercial-simples" — esperado até a Task 5. `npx tsc --noEmit` limpo.
- [ ] **Step 5:** commit `feat(painel): perfil Comercial vira ranking do mês + batalha` (o teste de paridade Kotlin fica vermelho até a Task 5 — faça as Tasks 3–5 na mesma sessão e só faça push depois da 5).

---

### Task 4: Verificação visual web

- [ ] `/painel?perfil=p-comercial` no navegador embutido em 1280×720: pódio com "N vendas" e "1º LUGAR", quatro cartões, barra com "Faltam R$". Screenshot. Sem emoji. Corrigir CSS se algo cortar.

---

### Task 5: Comercial enxuto no Kotlin

**Files:**
- Modify: `tv-central/panel/administracao/src/main/kotlin/com/tridi/tv/panel/administracao/ui/widgets/Widgets.kt`
- Modify: `tv-central/panel/administracao/src/main/kotlin/com/tridi/tv/panel/administracao/data/Upgrade.kt`
- Test: `tv-central/panel/administracao/src/test/kotlin/com/tridi/tv/panel/administracao/data/ComercialEnxutoTest.kt`

- [ ] **Step 1: teste JVM**

```kotlin
package com.tridi.tv.panel.administracao.data

import org.junit.Assert.assertEquals
import org.junit.Test

class ComercialEnxutoTest {
    private fun slide(id: String, tipo: String) = SlideLayout(
        id = id, nome = id, duracaoMs = null, ativo = true,
        widgets = listOf(WidgetLayout(id = "w", tipo = tipo, x = 0, y = 0, w = 12, h = 8)),
    ).let { listOf(it).comTelasAtualizadas().first() }   // já separado em blocos

    @Test fun `comercial de fabrica com 5 telas vira 2`() {
        val cinco = listOf(
            slide("s-c-rank", "classico-ranking"), slide("s-c-bat", "classico-batalha"),
            slide("s-c-fin", "classico-financeiro"), slide("s-c-traf", "classico-trafego"),
            slide("s-c-prod", "classico-produtos"),
        )
        val novo = comercialAtualizado(cinco)
        assertEquals(listOf("Ranking", "Batalha"), novo.map { it.nome })
        assertEquals(listOf("texto", "relogio", "podio", "kpi", "kpi", "kpi", "kpi", "equipe"), novo[0].widgets.map { it.tipo })
    }

    @Test fun `comercial mexido fica como esta`() {
        val quatro = listOf(slide("a", "classico-ranking"), slide("b", "classico-batalha"),
            slide("c", "classico-financeiro"), slide("d", "classico-trafego"))
        assertEquals(4, comercialAtualizado(quatro).size)
    }
}
```
(Confira os nomes reais dos campos de `SlideLayout` em `Layout.kt:32` e ajuste.)

- [ ] **Step 2: Upgrade.kt**

Adicione a receita `"comercial-simples"` em `RECEITA_CLASSICA` (mesmas peças da Task 3, via `Peca(...)`/`op(...)`), e:

```kotlin
private val TIPOS_COMERCIAL_5 = listOf("classico-ranking", "classico-batalha", "classico-financeiro", "classico-trafego", "classico-produtos")

private fun assinaturaDaReceita(tipo: String): String =
    assinaturaDeSlide(separarEmBlocos(tipo, 0, 0, GRADE_COLUNAS, GRADE_LINHAS) { "x" })

/**
 * O Comercial de fábrica (5 telas intocadas) vira Ranking + Batalha. É o
 * mesmo critério do web: só quando TODAS as cinco ainda são as de fábrica.
 */
fun comercialAtualizado(slides: List<SlideLayout>): List<SlideLayout> {
    val atualizados = slides.comTelasAtualizadas()
    if (atualizados.size != 5) return atualizados
    val deFabrica = atualizados.zip(TIPOS_COMERCIAL_5).all { (s, t) -> assinaturaDeSlide(s.widgets) == assinaturaDaReceita(t) }
    if (!deFabrica) return atualizados
    var n = 0
    return listOf(
        SlideLayout(id = "s-c-rank", nome = "Ranking", duracaoMs = null, ativo = true,
            widgets = separarEmBlocos("comercial-simples", 0, 0, GRADE_COLUNAS, GRADE_LINHAS) { "w-rk-${n++}" }),
        SlideLayout(id = "s-c-bat", nome = "Batalha", duracaoMs = null, ativo = true,
            widgets = separarEmBlocos("classico-batalha", 0, 0, GRADE_COLUNAS, GRADE_LINHAS) { "w-bt-${n++}" }),
    )
}
```
Em `slidesDoPerfil` (`Layout.kt:142`), onde hoje chama `comTelasAtualizadas()`, use `comercialAtualizado(...)` quando `perfilId == "p-comercial"`.

- [ ] **Step 3: Widgets.kt**

- `brutoDeVendas`: antes do `return when`, adicione
```kotlin
    if (metrica == "meta_pct") {
        val meta = c.monthlyRevenueGoal
        if (meta <= 0) return null
        return (t?.faturamentoEmpresa ?: s.revenue.monthly) / meta * 100
    }
    if (metrica == "pedidos_dia") return s.salespeople.sumOf { pedidosNo(it, "dia") }.toDouble()
```
- `PERCENTUAL = setOf("margem", "meta_pct")`; em `formatado`, inclua `metrica == "pedidos_dia"` na contagem; em `Kpi.ehDinheiro`, `metrica != "pedidos_dia"`.
- `rotuloDaMetrica`: `"meta_pct" -> "Meta do mês"`, `"pedidos_dia" -> "Vendas hoje"`; no mapa de ícone por métrica (procure `"ticket_medio" ->` perto de `iconeDaMetrica`), `"meta_pct" -> "target"`, `"pedidos_dia" -> "shopping-bag"`.
- `Relogio`: `val soMes = w.texto("formato", "") == "mes"`; se `soMes`, `data = "${MESES[m].replaceFirstChar { it.uppercase() }} $ano"` e não mostra hora.
- `Podio`: após o valor, `if (w.booleano("pedidos", false)) Text("${fmtNum(pedidosNo(p, periodo).toDouble())} vendas", color = Tokens.textoFraco, fontSize = (larguraCol.value * 0.10f).coerceIn(8f, 16f).sp, fontWeight = FontWeight.SemiBold, maxLines = 1)`. No pedestal, envolva o `Box` com `contentAlignment = Alignment.Center` e, se `w.texto("degrau", "") == "lugar"`, `Text("${pos}º LUGAR", color = if (campeao) Color.White else Tokens.texto, fontWeight = FontWeight.Black, fontSize = (caixa.altura.value * 0.06f).coerceIn(10f, 26f).sp)`.
- `Equipe`: se `w.booleano("faltam", false)`, a segunda coluna vira `Rotulo(if (metaPeriodo > 0 && receita >= metaPeriodo) "Meta batida" else "Faltam")` + `Text(dinheiro(maxOf(0.0, metaPeriodo - receita)), color = Tokens.acento, …)`.
- Onde o `when (w.tipo)` desenha os `classico-*` (linha ~2690), adicione `"comercial-simples"` no mesmo ramo (a tela cheia é separada por `Upgrade.separarEmBlocos`, como as outras — confira como `"classico-ranking"` é tratado ali e repita).

- [ ] **Step 4:** `./gradlew :panel:administracao:testDebugUnitTest --offline -q` → PASSA. `npx vitest run lib/__tests__/painel-classico.test.ts` → PASSA (a TV conhece `"comercial-simples"`).
- [ ] **Step 5:** commit `feat(tv): comercial enxuto na parede nativa — pódio com vendas, quatro números, meta da equipe` e push (junto com a Task 3).

---

### Task 6: Cofre primeiro — a tela nasce do disco

**Files:**
- Modify: `AdminRepository.kt` — novo `suspend fun doCofre(): Cofre`
- Modify: `AdminViewModel.kt` — `init` lê o cofre antes do poll
- Modify: `tv-central/app/src/main/kotlin/com/tridi/tv/TridiTvApp.kt` — Coil `ImageLoaderFactory`
- Modify: `tv-central/gradle/libs.versions.toml` só se `coil` não estiver declarado (está: `AsyncImage` já é usado)
- Test: `tv-central/panel/administracao/src/test/kotlin/com/tridi/tv/panel/administracao/ui/CofreTest.kt`

- [ ] **Step 1: repositório**

```kotlin
/** Tudo que está no disco, sem tocar na rede. Para a tela nascer preenchida. */
data class Cofre(
    val config: PanelConfig?, val vendas: Leitura<SalesSnapshot>?,
    val producao: ResumoProducao?, val estoque: ResumoEstoque?, val expedicao: StatusExpedicao?,
)

suspend fun doCofre(): Cofre {
    fun <T> le(chave: String, des: kotlinx.serialization.KSerializer<T>): T? = null // placeholder removido abaixo
    suspend fun <T> ler(chave: String, des: kotlinx.serialization.KSerializer<T>): T? =
        store.panelCache(painel, chave)?.let { runCatching { api.json.decodeFromString(des, it) }.getOrNull() }
    val vendas = ler(CHAVE_VENDAS, SalesSnapshot.serializer())
    return Cofre(
        config = ler(CHAVE_CONFIG, PanelConfig.serializer()),
        vendas = vendas?.let { Leitura.doCache(it, store.panelCacheEm(painel, CHAVE_VENDAS) ?: 0L) },
        producao = ler(CHAVE_PRODUCAO, ResumoProducao.serializer()),
        estoque = ler(CHAVE_ESTOQUE, ResumoEstoque.serializer()),
        expedicao = ler(CHAVE_EXPEDICAO, StatusExpedicao.serializer()),
    )
}
```
(remova a linha `le(...)` — está aí só para lembrar de NÃO deixar placeholder.)

- [ ] **Step 2: ViewModel** — no `init` que lança o `pollComRecuo`, antes dele:

```kotlin
            // COFRE PRIMEIRO. A TV que liga sem rede desenhava "Sincronizando…"
            // por até 45 s esperando um timeout, com o dado bom parado no
            // disco. Agora a tela nasce do disco em milissegundos; a rede é
            // sincronização em segundo plano, nunca condição para desenhar.
            val cofre = repo.doCofre()
            _state.update {
                it.copy(
                    carregando = cofre.vendas == null,
                    config = cofre.config ?: it.config,
                    vendas = cofre.vendas?.dado ?: it.vendas,
                    dadoDe = cofre.vendas?.em ?: it.dadoDe,
                    producao = cofre.producao ?: it.producao,
                    estoque = cofre.estoque ?: it.estoque,
                    expedicao = cofre.expedicao ?: it.expedicao,
                )
            }
```
Ao aplicar a leitura de rede no `ciclo()`, o código já grava `semRede = !leitura.daRede` — confira que, com cache na tela e rede falhando, `dadoDe` NÃO é sobrescrito com 0 (`Leitura.doCache(..., em = … ?: 0L)`): troque para `?: state.dadoDe ?: 0L`.

- [ ] **Step 3: teste** — `CofreTest`: `AdminRepository` é `@Singleton` com `ApiClient` concreto; para testar sem Android, extraia a lógica do cofre para uma função pura `montarCofre(ler: (String) -> String?, em: (String) -> Long?, json: Json): Cofre` em `data/Cofre.kt` e teste ela: dado um `ler` que devolve um `SalesSnapshot` serializado para `"sales"` e `null` para o resto → `vendas != null`, `em` igual ao carimbo, `config == null`.

- [ ] **Step 4: fotos offline** — `TridiTvApp` implementa `coil.ImageLoaderFactory`:
```kotlin
override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
    .respectCacheHeaders(false)   // Storage manda no-cache; offline a foto salva vale
    .diskCache { DiskCache.Builder().directory(cacheDir.resolve("fotos")).maxSizeBytes(64L * 1024 * 1024).build() }
    .build()
```
(`coil-compose` já é dependência de `core:design`; adicione `implementation(libs.coil)` ao `app` se o accessor não resolver.)

- [ ] **Step 5:** `./gradlew :panel:administracao:testDebugUnitTest :app:assembleDebug --offline -q` verde. Commit `feat(tv): a parede nasce do disco e as fotos ficam offline` + push.

---

### Task 7: `lib/tv-sinal.ts` e broadcast nas rotas

**Files:**
- Create: `lib/tv-sinal-nomes.ts`, `lib/tv-sinal.ts`
- Modify: `app/api/config/route.ts` (PUT), `app/api/tv/route.ts` (publicar_versao, comando), `app/api/version/route.ts`
- Test: `lib/__tests__/tv-sinal.test.ts`

- [ ] **Step 1: nomes**
```ts
// Só nomes — importável por componente de cliente (ver lib/tridichat/sinal-nomes.ts).
export const TV_SINAL_TOPICO = "tv:parede";
export const TV_SINAL_EVENTOS = ["config", "versao", "comando"] as const;
export type TvSinalEvento = (typeof TV_SINAL_EVENTOS)[number];
```

- [ ] **Step 2: teste**
```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { avisarTv } from "@/lib/tv-sinal";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("avisarTv", () => {
  it("sem env não chama nada e não lança", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    await avisarTv("config");
    expect(f).not.toHaveBeenCalled();
  });
  it("manda o broadcast no tópico da parede com o evento e o payload", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    const f = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal("fetch", f);
    await avisarTv("versao", { versionCode: 66 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/realtime/v1/api/broadcast");
    const corpo = JSON.parse(init.body);
    expect(corpo.messages[0]).toEqual({ topic: "tv:parede", event: "versao", payload: { versionCode: 66 } });
  });
  it("fetch que explode não lança", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));
    await expect(avisarTv("config")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: implementação** `lib/tv-sinal.ts`
```ts
import { TV_SINAL_TOPICO, type TvSinalEvento } from "./tv-sinal-nomes";

/**
 * Cutuca as TVs: "algo mudou, vá buscar". Nunca lança, nunca segura a
 * resposta — é enfeite de latência; o poll de reserva cobre a ausência.
 * Mesmo desenho de lib/tridichat/sinal.ts.
 */
export async function avisarTv(evento: TvSinalEvento, payload: Record<string, unknown> = {}): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return;
  try {
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: chave, authorization: `Bearer ${chave}` },
      body: JSON.stringify({ messages: [{ topic: TV_SINAL_TOPICO, event: evento, payload }] }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch { /* sem sinal, o poll cobre */ }
}
```

- [ ] **Step 4: rotas**
- `app/api/config/route.ts` PUT, após `invalidate("panel:config")`: `await avisarTv("config");`
- `app/api/tv/route.ts`: após inserir/publicar versão → `await avisarTv("versao", { versionCode })`; após inserir comandos → `await avisarTv("comando", { dispositivos: ids })` (lista dos `dispositivo_id`; vazio quando é "todos").
- `app/api/version/route.ts`: acrescente
```ts
    sinal: process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? { url: process.env.NEXT_PUBLIC_SUPABASE_URL, chave: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, topico: TV_SINAL_TOPICO }
      : null,
```

- [ ] **Step 5:** `npx vitest run lib/__tests__/tv-sinal.test.ts` PASSA; `npx tsc --noEmit`. Commit `feat(tv): o servidor cutuca as TVs quando painel, versão ou comando mudam` + push.

---

### Task 8: Módulo `core:sinal` (Kotlin)

**Files:**
- Create: `tv-central/core/sinal/build.gradle.kts`
- Create: `tv-central/core/sinal/src/main/kotlin/com/tridi/tv/core/sinal/FramePhoenix.kt`
- Create: `tv-central/core/sinal/src/main/kotlin/com/tridi/tv/core/sinal/SinalDaParede.kt`
- Create: `tv-central/core/sinal/src/test/kotlin/com/tridi/tv/core/sinal/FramePhoenixTest.kt`
- Modify: `tv-central/settings.gradle.kts` (`include(":core:sinal")`), `tv-central/app/build.gradle.kts` (`implementation(project(":core:sinal"))`), `panel/administracao/build.gradle.kts` idem
- Modify: `DeviceStore.kt` — `sinal(): Pair<String,String>?` / `setSinal(url, chave)`

- [ ] **Step 1: build**
```kotlin
plugins { id("tridi.core") }
dependencies {
    implementation(project(":core:storage"))
    api(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.core)
}
```
(Confira os nomes dos aliases em `libs.versions.toml`; use os mesmos de `core/network`.)

- [ ] **Step 2: teste do parser**
```kotlin
class FramePhoenixTest {
    @Test fun `broadcast no topico certo vira evento`() {
        val f = """[null,null,"realtime:tv:parede","broadcast",{"type":"broadcast","event":"versao","payload":{"versionCode":66}}]"""
        val ev = FramePhoenix.decodificar(f, "realtime:tv:parede")
        assertEquals(Evento.Versao(66), ev)
    }
    @Test fun `comando traz a lista de aparelhos`() {
        val f = """[null,null,"realtime:tv:parede","broadcast",{"event":"comando","payload":{"dispositivos":["a","b"]}}]"""
        assertEquals(Evento.Comando(listOf("a", "b")), FramePhoenix.decodificar(f, "realtime:tv:parede"))
    }
    @Test fun `config vira Config`() {
        val f = """[null,null,"realtime:tv:parede","broadcast",{"event":"config","payload":{}}]"""
        assertEquals(Evento.Config, FramePhoenix.decodificar(f, "realtime:tv:parede"))
    }
    @Test fun `outro topico, heartbeat e lixo devolvem null`() {
        assertNull(FramePhoenix.decodificar("""[null,"1","phoenix","phx_reply",{}]""", "realtime:tv:parede"))
        assertNull(FramePhoenix.decodificar("""[null,null,"realtime:outro","broadcast",{"event":"config"}]""", "realtime:tv:parede"))
        assertNull(FramePhoenix.decodificar("nada", "realtime:tv:parede"))
    }
    @Test fun `join e heartbeat sao frames validos`() {
        assertEquals("""["1","1","realtime:tv:parede","phx_join",{"config":{"broadcast":{"self":false},"presence":{"key":""}}}]""", FramePhoenix.join("realtime:tv:parede", 1))
        assertEquals("""[null,"2","phoenix","heartbeat",{}]""", FramePhoenix.heartbeat(2))
    }
}
```

- [ ] **Step 3: parser**
```kotlin
package com.tridi.tv.core.sinal

import kotlinx.serialization.json.*

sealed class Evento {
    data object Config : Evento()
    data class Versao(val versionCode: Int) : Evento()
    data class Comando(val dispositivos: List<String>) : Evento()
}

/** Protocolo Phoenix v1: `[join_ref, ref, topic, event, payload]`. */
object FramePhoenix {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    fun join(topico: String, ref: Int): String =
        """["$ref","$ref","$topico","phx_join",{"config":{"broadcast":{"self":false},"presence":{"key":""}}}]"""

    fun heartbeat(ref: Int): String = """[null,"$ref","phoenix","heartbeat",{}]"""

    fun decodificar(texto: String, topico: String): Evento? = try {
        val arr = json.parseToJsonElement(texto).jsonArray
        if (arr.size < 5) null
        else if (arr[2].jsonPrimitive.contentOrNull != topico) null
        else if (arr[3].jsonPrimitive.contentOrNull != "broadcast") null
        else {
            val p = arr[4].jsonObject
            val payload = p["payload"]?.jsonObject ?: JsonObject(emptyMap())
            when (p["event"]?.jsonPrimitive?.contentOrNull) {
                "config" -> Evento.Config
                "versao" -> Evento.Versao(payload["versionCode"]?.jsonPrimitive?.intOrNull ?: 0)
                "comando" -> Evento.Comando(
                    payload["dispositivos"]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull } ?: emptyList(),
                )
                else -> null
            }
        }
    } catch (e: Exception) { null }
}
```

- [ ] **Step 4: cliente**
```kotlin
package com.tridi.tv.core.sinal

@Singleton
class SinalDaParede @Inject constructor(private val store: DeviceStore) {
    private val _eventos = MutableSharedFlow<Evento>(extraBufferCapacity = 16)
    val eventos: SharedFlow<Evento> = _eventos.asSharedFlow()
    private val _conectado = MutableStateFlow(false)
    val conectado: StateFlow<Boolean> = _conectado.asStateFlow()

    private val http = OkHttpClient.Builder().pingInterval(30, TimeUnit.SECONDS).build()
    private var socket: WebSocket? = null
    private var ref = 0

    /** Laço de vida: (re)conecta com recuo 2 s → 60 s; nunca lança. */
    fun iniciar(scope: CoroutineScope) = scope.launch {
        var recuo = 2_000L
        while (true) {
            val (url, chave) = store.sinal() ?: run { delay(60_000); return@run null } ?: continue
            val fechado = CompletableDeferred<Unit>()
            abrir(url, chave, fechado)
            fechado.await()                       // volta quando o socket cai
            _conectado.value = false
            delay(recuo); recuo = (recuo * 2).coerceAtMost(60_000)
        }
    }

    private fun abrir(base: String, chave: String, fechado: CompletableDeferred<Unit>) {
        val host = base.removePrefix("https://").removePrefix("http://").trimEnd('/')
        val topico = "realtime:" + TOPICO
        val req = Request.Builder().url("wss://$host/realtime/v1/websocket?apikey=$chave&vsn=1.0.0").build()
        socket = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                ws.send(FramePhoenix.join(topico, ++ref))
                _conectado.value = true
                // Heartbeat de aplicação a cada 30 s: o Realtime derruba quem fica mudo.
                Thread { while (socket === ws) { Thread.sleep(30_000); ws.send(FramePhoenix.heartbeat(++ref)) } }.apply { isDaemon = true }.start()
            }
            override fun onMessage(ws: WebSocket, text: String) {
                FramePhoenix.decodificar(text, topico)?.let { _eventos.tryEmit(it) }
            }
            override fun onFailure(ws: WebSocket, t: Throwable, r: Response?) { if (socket === ws) socket = null; fechado.complete(Unit) }
            override fun onClosed(ws: WebSocket, code: Int, reason: String) { if (socket === ws) socket = null; fechado.complete(Unit) }
        })
    }

    companion object { const val TOPICO = "tv:parede" }
}
```
(`store.sinal()` devolve `Pair(url, chave)?`; escreva a espera de 60 s sem o `run` truncado acima: `val par = store.sinal(); if (par == null) { delay(60_000); continue }`.) Reset do recuo: `recuo = 2_000L` em `onOpen` (guarde numa `@Volatile var`).

- [ ] **Step 5: DeviceStore**
```kotlin
suspend fun sinal(): Pair<String, String>? = context.dataStore.data.map { p ->
    val u = p[Keys.sinalUrl]; val c = p[Keys.sinalChave]
    if (u.isNullOrBlank() || c.isNullOrBlank()) null else u to c
}.first()
suspend fun setSinal(url: String, chave: String) = context.dataStore.edit { it[Keys.sinalUrl] = url; it[Keys.sinalChave] = chave }
```
(`Keys.sinalUrl = stringPreferencesKey("sinal_url")`, `sinalChave` idem.)

- [ ] **Step 6:** `./gradlew :core:sinal:testDebugUnitTest --offline -q` PASSA. Commit `feat(tv): core:sinal — a TV escuta o Supabase Realtime por WebSocket` + push.

---

### Task 9: Consumidores do sinal na TV + frota em 15 min

**Files:**
- Modify: `TridiTvApp.kt` — busca `/api/version` no boot, grava `setSinal`, inicia `SinalDaParede`, passa ao `FleetAgent`
- Modify: `FleetAgent.kt` — `iniciar(scope, sinal)`: laço de 15 min; `collect` de `Versao`/`Comando` → `ciclo()`
- Modify: `AdminViewModel.kt` — injeta `SinalDaParede`; em `Evento.Config` recarrega config e volta o ritmo
- Modify: `ShellViewModel.kt` — em `Evento.Config` recarrega perfis
- Modify: `core/network/Ritmo.kt` — `pollComRecuo` ganha `acordar: Flow<Unit>? = null` que zera `esperaExtra` e interrompe o `delay`

- [ ] **Step 1: `pollComRecuo` acordável** — troque `delay(intervalo)` por `withTimeoutOrNull(intervalo) { acordar?.first() }?.let { esperaExtra = 1 }`; teste em `RitmoTest`: com `acordar` emitindo, o próximo `bloco()` roda antes do intervalo.

- [ ] **Step 2: `TridiTvApp.onCreate`** — depois de `iniciarAgenteDaFrota()`:
```kotlin
escopo.launch {
    // Endereço do sinal: público, sem banco, uma leitura por boot.
    runCatching {
        val v = ep.api().getRaw("/api/version")
        val s = Json { ignoreUnknownKeys = true }.parseToJsonElement(v).jsonObject["sinal"]?.jsonObject
        val url = s?.get("url")?.jsonPrimitive?.contentOrNull; val chave = s?.get("chave")?.jsonPrimitive?.contentOrNull
        if (!url.isNullOrBlank() && !chave.isNullOrBlank()) ep.store().setSinal(url, chave)
    }
    ep.sinal().iniciar(escopo)
}
```
(`FleetEntryPoint` ganha `fun sinal(): SinalDaParede`.)

- [ ] **Step 3: FleetAgent** — `iniciar(scope, sinal: SinalDaParede)`: `delay(15 * 60_000)` no laço; e
```kotlin
scope.launch {
    sinal.eventos.collect { ev ->
        val meu = store.deviceToken()  // id do aparelho não está no token; comando "para todos" = lista vazia
        val paraMim = when (ev) { is Evento.Versao -> true; is Evento.Comando -> ev.dispositivos.isEmpty() || ev.dispositivos.contains(store.deviceId()); else -> false }
        if (paraMim) runCatching { ciclo() }
    }
}
```
Se `DeviceStore` não guarda o id do aparelho, grave-o em `entrarNaFrotaSozinha` (a resposta de `/api/tv/device/registrar` traz `id`? confira `app/api/tv/device/registrar/route.ts`; se não trouxer, acrescente `id` à resposta) — `setDeviceId(id)`/`deviceId()`.

- [ ] **Step 4: AdminViewModel** — `acordar = sinal.eventos.filterIsInstance<Evento.Config>().map { }`; e um `collect` que faz `repo.carregarConfig()?.let { nova -> _state.update { it.copy(config = nova) } }`. `CICLOS_POR_CONFIG = 30`.

- [ ] **Step 5: ShellViewModel** — `collect` de `Evento.Config` → repete o bloco que chama `perfisRepo.listar()` e recalcula `perfilRetrato`.

- [ ] **Step 6:** `./gradlew :app:assembleDebug :core:network:testDebugUnitTest --offline -q` verde. Commit `feat(tv): a parede reage ao sinal — perfil, versão e comando chegam em segundos` + push.

---

### Task 10: `/painel` web assina o sinal

**Files:**
- Create: `app/painel/useSinalDaParede.ts`
- Modify: `app/painel/Panel.tsx`

- [ ] **Step 1:** hook igual ao de `tridichat/tempo-real.ts` (copiar a estrutura de reconexão), tópico `TV_SINAL_TOPICO`, evento `"config"`, chama `aoMudar()`.
- [ ] **Step 2:** em `Panel.tsx`, `useSinalDaParede(() => load())` — como `load` mora dentro do `useEffect`, guarde-a numa `ref` (`loadRef.current = load`) e o hook chama `loadRef.current?.()`.
- [ ] **Step 3:** `npx tsc --noEmit`; `npx vitest run lib/__tests__/orcamento-de-execucao.test.ts` (não pode acusar poll novo). Commit `feat(painel): a parede no navegador também ouve o sinal` + push.

---

### Task 11: Versão, APK, memória e log

- [ ] `tv-central/app/build.gradle.kts`: `versionCode = 66`, `versionName = "1.66"`.
- [ ] `cd tv-central && ./gradlew :app:assembleRelease --offline -q` → `app/build/outputs/apk/release/app-release.apk`; conferir `unzip -o … 'classes*.dex' && dexdump classes*.dex | grep -c 'Ljava/time/'` ≈ 0.
- [ ] `npm test` inteiro + `npx tsc --noEmit`.
- [ ] Memória: atualizar `tv-central-paineis.md` (sinal, cofre, comercial enxuto) e `tv-frota-gestao-remota.md` (laço 15 min + sinal). `MEMORY.md` só se criar arquivo novo.
- [ ] `log.md` do Brain.
- [ ] Commit `chore(tv): v1.66` + push. Avisar o usuário: publicar a 1.66 no console da frota; conferir se Realtime está ligado no projeto Supabase (Settings → API → Realtime).
