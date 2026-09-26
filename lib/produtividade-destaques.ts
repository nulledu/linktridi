// ── Produtividade · pódio, destaques e resumo ────────────────────────────────
// A tabela por colaborador compara, mas não APONTA. Quem leu a tela inteira
// sabe quem fez mais; quem passou os olhos, não. Estas funções são a leitura
// que um gestor faria em voz alta: quem puxou o dia, quem acertou tudo, quem
// entrega mais rápido e quem precisa de ajuda.
//
// Puras de propósito — nada aqui toca banco nem React. A frase é o produto, e
// frase se testa sem Supabase. A regra que vale mais que os números: **nada é
// inventado**. Sem conferência não há taxa de acerto; sem tempo medido não há
// "mais rápido"; sem ninguém acima de zero não há pódio. Bloco sem dado não
// aparece, em vez de aparecer com "—" fingindo de informação.

export interface PessoaMedida {
  id: string;
  nome: string;
  setor: string;
  fotoUrl?: string | null;
  concluidas: number;
  pecas: number;
  mediaMin: number | null;
  /** Certos ÷ conferidos, de 0 a 1. `null` = ninguém conferiu ainda. */
  acerto: number | null;
  /** Caixas reprovadas — trabalho que voltou pra ser refeito. */
  retrabalhos: number;
  /** Quantas conferências entraram na conta. 0 = a taxa não significa nada. */
  conferencias: number;
}

/** Mínimo de conferências pra uma taxa poder ser comparada com outra. Uma
 *  conferência certa dá 100% e ganharia de quem acertou 39 de 40. */
export const MIN_CONFERENCIAS = 3;

export interface Destaque {
  key: "volume" | "acerto" | "rapidez" | "atencao";
  rotulo: string;
  pessoa: PessoaMedida;
  /** Um ou dois números, na ordem em que aparecem no cartão. */
  numeros: { valor: string; rotulo: string }[];
  tom: "ok" | "alerta";
}

export function podio(linhas: PessoaMedida[]): PessoaMedida[] {
  return linhas.filter((l) => l.concluidas > 0)
    .slice()
    .sort((a, b) => b.concluidas - a.concluidas || b.pecas - a.pecas || a.nome.localeCompare(b.nome))
    .slice(0, 3);
}

const pct = (t: number | null) => (t == null ? "—" : `${Math.round(t * 100)}%`);

export function destaques(linhas: PessoaMedida[]): Destaque[] {
  const out: Destaque[] = [];

  const fez = linhas.filter((l) => l.concluidas > 0)
    .sort((a, b) => b.concluidas - a.concluidas || b.pecas - a.pecas)[0];
  if (fez) {
    out.push({
      key: "volume", rotulo: "Quem mais fez", pessoa: fez, tom: "ok",
      numeros: [{ valor: String(fez.concluidas), rotulo: "atividades" }],
    });
  }

  // Só entra quem foi conferido o bastante — senão "100% de acerto" é uma
  // caixa só, e o cartão vira sorteio.
  const certeiro = linhas.filter((l) => l.acerto != null && l.conferencias >= MIN_CONFERENCIAS)
    .sort((a, b) => (b.acerto as number) - (a.acerto as number) || a.retrabalhos - b.retrabalhos || b.conferencias - a.conferencias)[0];
  if (certeiro) {
    out.push({
      key: "acerto", rotulo: "Fez mais certo", pessoa: certeiro, tom: "ok",
      numeros: [
        { valor: pct(certeiro.acerto), rotulo: "acerto" },
        { valor: String(certeiro.retrabalhos), rotulo: "retrabalho" },
      ],
    });
  }

  // "Mais rápido" só compara quem entregou mais de uma atividade: uma tarefa
  // curta sozinha bate qualquer média de quem passou o dia numa peça grande.
  const rapido = linhas.filter((l) => l.mediaMin != null && l.concluidas >= 2)
    .sort((a, b) => (a.mediaMin as number) - (b.mediaMin as number) || b.concluidas - a.concluidas)[0];
  if (rapido) {
    out.push({
      key: "rapidez", rotulo: "Mais rápido", pessoa: rapido, tom: "ok",
      numeros: [{ valor: `${rapido.mediaMin}`, rotulo: "min · média" }],
    });
  }

  // Ponto de atenção é o único cartão de tom alerta, e ele PRECISA de motivo:
  // ou tem retrabalho, ou tem acerto abaixo de "bom" (85%, a mesma faixa de
  // rotuloDaTaxa). Sem nenhum dos dois, o dia não tem ponto de atenção — e
  // eleger "o pior" de um dia impecável é acusar alguém de nada.
  const atencao = linhas.filter((l) => l.conferencias > 0 && (l.retrabalhos > 0 || (l.acerto != null && l.acerto < 0.85)))
    .sort((a, b) => b.retrabalhos - a.retrabalhos || (a.acerto ?? 1) - (b.acerto ?? 1))[0];
  if (atencao) {
    out.push({
      key: "atencao", rotulo: "Ponto de atenção", pessoa: atencao, tom: "alerta",
      numeros: [
        { valor: String(atencao.retrabalhos), rotulo: atencao.retrabalhos === 1 ? "retrabalho" : "retrabalhos" },
        { valor: pct(atencao.acerto), rotulo: "acerto" },
      ],
    });
  }

  return out;
}

export interface FraseResumo { icone: string; titulo: string; texto: string; tom: "ok" | "alerta" }

/**
 * O rodapé "Resumo rápido": no máximo três frases, cada uma com o número que a
 * sustenta. É a mesma informação dos cartões, dita como alguém diria — e é o
 * que a pessoa lê quando não vai ler a tabela.
 */
export function resumoRapido(linhas: PessoaMedida[]): FraseResumo[] {
  const ds = destaques(linhas);
  const totalConcluidas = linhas.reduce((n, l) => n + l.concluidas, 0);
  const totalRetrabalhos = linhas.reduce((n, l) => n + l.retrabalhos, 0);
  const frases: FraseResumo[] = [];

  const volume = ds.find((d) => d.key === "volume");
  if (volume && totalConcluidas > 0) {
    const share = Math.round((volume.pessoa.concluidas / totalConcluidas) * 100);
    frases.push({
      icone: "star", tom: "ok",
      titulo: `${primeiroNome(volume.pessoa.nome)} lidera o volume do dia`,
      texto: `${volume.pessoa.concluidas} atividades concluídas, ${share}% do total.`,
    });
  }

  const acerto = ds.find((d) => d.key === "acerto");
  if (acerto) {
    frases.push({
      icone: "target", tom: "ok",
      titulo: `${primeiroNome(acerto.pessoa.nome)} mantém ${pct(acerto.pessoa.acerto)} de acerto`,
      texto: acerto.pessoa.retrabalhos === 0
        ? "Sem retrabalhos registrados no período."
        : `${acerto.pessoa.retrabalhos} retrabalho(s) em ${acerto.pessoa.conferencias} conferências.`,
    });
  }

  const atencao = ds.find((d) => d.key === "atencao");
  if (atencao && atencao.pessoa.retrabalhos > 0 && totalRetrabalhos > 0) {
    const share = Math.round((atencao.pessoa.retrabalhos / totalRetrabalhos) * 100);
    frases.push({
      icone: "alert-triangle", tom: "alerta",
      titulo: `${primeiroNome(atencao.pessoa.nome)} concentra mais retrabalhos`,
      texto: `${atencao.pessoa.retrabalhos} de ${totalRetrabalhos} — ${share}% do total do período.`,
    });
  }

  return frases;
}

/** "Ana Souza" → "Ana". A frase do resumo é falada, e ninguém fala sobrenome. */
export function primeiroNome(nome: string): string {
  return (nome || "").trim().split(/\s+/)[0] || nome;
}
