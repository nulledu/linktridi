/**
 * O que um campo PEDE — e o que isso implica no teclado do celular.
 *
 * A página de login é a única tela do sistema que faz isso: diz ao aparelho que
 * ali vai um e-mail, então o teclado abre com "@" à mão, o corretor não
 * atrapalha e o gerenciador de senhas oferece preencher. Medido no resto do
 * app: de 373 campos, 7 dizem qual teclado abrir, 1 oferece preenchimento
 * automático e NENHUM define o que a tecla Enter faz.
 *
 * Num ERP que se usa em pé, no celular, isso não é detalhe: um campo de valor
 * que abre o teclado de letras custa dois toques a cada preenchimento, todo dia,
 * por pessoa. É o tipo de atrito que ninguém reporta como bug porque parece
 * "como as coisas são".
 *
 * A tabela é a fonte única: quem escreve `<input>` na mão usa `atributosDe()`, e
 * o componente `Entrada` usa a mesma coisa. Sem isso, cada tela reinventa — que
 * é exatamente como o app chegou a seis avatares e duas paletas diferentes.
 */

export type TipoCampo =
  | "texto" | "nome" | "email" | "telefone" | "senha"
  | "dinheiro" | "numero" | "inteiro" | "busca" | "url" | "codigo";

type Attrs = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * `inputMode` decide o TECLADO; `type` decide validação e o controle nativo.
 * Os dois quase nunca são a mesma resposta — daí a tabela.
 *
 * Cuidado deliberado com `type="number"`: ele parece a escolha óbvia para valor
 * e quantidade, e traz três problemas. A roda do mouse altera o número quando a
 * pessoa só queria rolar a página; o Firefox aceita letras dentro dele; e o
 * separador decimal muda com a região, então "5,50" pode virar vazio. Para
 * dinheiro usamos texto + `inputMode="decimal"`: mesmo teclado no celular, sem
 * nenhuma das três armadilhas.
 */
const TABELA: Record<TipoCampo, Attrs> = {
  texto: {},

  nome: {
    autoComplete: "name", autoCapitalize: "words", autoCorrect: "off", spellCheck: false,
  },

  email: {
    type: "email", inputMode: "email", autoComplete: "email",
    autoCapitalize: "none", autoCorrect: "off", spellCheck: false,
  },

  // `tel` e não `number`: telefone tem parênteses, traço e o "+" do país.
  telefone: {
    type: "tel", inputMode: "tel", autoComplete: "tel",
  },

  senha: {
    type: "password", autoComplete: "current-password",
    autoCapitalize: "none", autoCorrect: "off", spellCheck: false,
  },

  dinheiro: { inputMode: "decimal", autoComplete: "off", spellCheck: false },

  numero: { inputMode: "decimal", autoComplete: "off", spellCheck: false },

  inteiro: { inputMode: "numeric", autoComplete: "off", spellCheck: false },

  // `enterKeyHint: "search"` troca o rótulo da tecla Enter para "Buscar" —
  // diz o que vai acontecer ANTES de a pessoa apertar.
  busca: {
    type: "search", enterKeyHint: "search",
    autoCapitalize: "none", autoCorrect: "off", spellCheck: false,
  },

  url: {
    type: "url", inputMode: "url", autoComplete: "url",
    autoCapitalize: "none", autoCorrect: "off", spellCheck: false,
  },

  // SKU, código de barras, placa: nunca corrigir nem capitalizar.
  codigo: {
    autoCapitalize: "characters", autoCorrect: "off", spellCheck: false,
    autoComplete: "off",
  },
};

/**
 * Atributos do tipo, mais os que dependem do CONTEXTO.
 *
 * `enterKeyHint` só faz sentido sabendo se o campo é o último do formulário: no
 * último a tecla vira "Enviar"/"Concluir", nos outros "Próximo". Errar isso é
 * pior do que não definir — a tecla promete uma coisa e faz outra.
 */
export function atributosDe(
  tipo: TipoCampo,
  ctx?: { ultimo?: boolean; novaSenha?: boolean },
): Attrs {
  const base = { ...TABELA[tipo] };

  if (tipo === "senha" && ctx?.novaSenha) {
    // Cadastro/troca: o gerenciador precisa saber que é senha NOVA pra sugerir
    // uma forte, em vez de tentar preencher a antiga.
    base.autoComplete = "new-password";
  }

  if (ctx?.ultimo !== undefined && tipo !== "busca") {
    base.enterKeyHint = ctx.ultimo ? "done" : "next";
  }

  return base;
}

/**
 * Adivinha o tipo pelo texto que a pessoa vê (rótulo, placeholder).
 *
 * Existe para a migração das telas antigas, onde a intenção do campo só está
 * escrita no placeholder. É palpite, então erra pro lado seguro: sem sinal
 * claro devolve "texto", que não muda nada. Campo novo declara o tipo à mão —
 * adivinhar é remendo, não arquitetura.
 */
export function tipoPeloRotulo(txt: string | undefined | null): TipoCampo {
  const s = (txt ?? "").toLowerCase();
  if (!s) return "texto";

  // BUSCA vem PRIMEIRO, e a ordem aqui é o conserto de um erro real.
  //
  // "Buscar por ID, cliente ou telefone…" é um campo de BUSCA que por acaso
  // menciona telefone. Testando telefone antes, ele virava `type="tel"` — e
  // quem quisesse buscar pelo nome não conseguiria mais digitar letras. O mesmo
  // com "Buscar nome ou e-mail…": vira `type="email"` e passa a REJEITAR um
  // nome na validação.
  //
  // O que o campo É vence o que ele MENCIONA. Um campo de busca aceita
  // qualquer coisa por definição — é o único tipo que não pode restringir.
  if (/buscar|pesquisar|procurar|filtrar/.test(s)) return "busca";

  if (/e-?mail|@/.test(s)) return "email";
  if (/telefone|whats|celular|\(\d{2}\)/.test(s)) return "telefone";
  if (/senha|password/.test(s)) return "senha";
  if (/r\$|valor|pre[çc]o|custo|sal[áa]rio|receita|gasto|or[çc]amento/.test(s)) return "dinheiro";
  if (/https?:|link|url|site|dom[íi]nio/.test(s)) return "url";
  if (/sku|c[óo]digo|barras|placa|cnpj|cpf|cep/.test(s)) return "codigo";
  // Sem `n[ºo°]\b`: aquilo casava o "No" de "No que o canal está focado agora"
  // e forçava teclado numérico num campo de texto livre. Um padrão de duas
  // letras é curto demais pra distinguir intenção — e o preço do palpite errado
  // (teclado errado, sem recurso) é maior do que o de não palpitar.
  if (/quantidade|\bqtd\b|estoque|m[íi]nim|\bdias\b|\bhoras\b|idade/.test(s)) return "inteiro";
  if (/nome completo|seu nome|nome d[oa]/.test(s)) return "nome";
  return "texto";
}
