// Modelos de tutorial — o esqueleto certo em vez da página em branco.
//
// Os blocos nascem com os TÍTULOS preenchidos e o texto vazio: o que ficou por
// escrever aparece nas pendências ("Passo 2 está vazio"), em vez de um texto de
// exemplo que alguém esquece de trocar e vai pro ar.
import { normalizarTutorial, type BlocoTutorial, type Tutorial } from "@/lib/tridiflow-tutoriais";

export interface ModeloTutorial {
  chave: string; nome: string; descricao: string; icone: string;
  montar: (ordem: number) => Tutorial;
}

const novoId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10));
const passo = (titulo: string): BlocoTutorial => ({ id: novoId(), tipo: "passo", titulo, conteudo: "", imagemUrl: "", imagemAlt: "", videoUrl: "", videoCapaUrl: "" });
const texto = (titulo: string): BlocoTutorial => ({ id: novoId(), tipo: "texto", titulo, conteudo: "" });
const aviso = (estilo: "atencao" | "dica" | "lembrete"): BlocoTutorial => ({ id: novoId(), tipo: "aviso", estilo, conteudo: "" });
const problemas = (): BlocoTutorial => ({ id: novoId(), tipo: "problemas", titulo: "Deu errado?", itens: [] });

const tutorial = (ordem: number, extra: { blocos: BlocoTutorial[]; dificuldade?: Tutorial["dificuldade"] }): Tutorial => ({
  ...normalizarTutorial({ id: novoId(), titulo: "", status: "rascunho", ordem }),
  blocos: extra.blocos,
  dificuldade: extra.dificuldade ?? null,
});

export const MODELOS: ModeloTutorial[] = [
  {
    chave: "passo-a-passo", nome: "Passo a passo", icone: "list-numbers",
    descricao: "Prepare, faça, confira — com uma dica e o \"Deu errado?\" no fim.",
    montar: (ordem) => tutorial(ordem, { dificuldade: "facil", blocos: [passo("Prepare o material"), passo("Faça"), passo("Confira o resultado"), aviso("dica"), problemas()] }),
  },
  {
    chave: "solucao", nome: "Solução de problema", icone: "help-circle",
    descricao: "Parte do sintoma (\"saiu borrado\") e chega na correção.",
    montar: (ordem) => tutorial(ordem, { blocos: [texto("O que está acontecendo"), problemas(), passo("Teste de novo"), aviso("lembrete")] }),
  },
  {
    chave: "cuidados", nome: "Cuidados e manutenção", icone: "sparkles",
    descricao: "Limpar, secar, guardar — o que faz o produto durar.",
    montar: (ordem) => tutorial(ordem, { blocos: [passo("Limpe"), passo("Seque"), passo("Guarde"), aviso("lembrete")] }),
  },
  {
    chave: "branco", nome: "Em branco", icone: "file",
    descricao: "Só o título — você monta os blocos.",
    montar: (ordem) => tutorial(ordem, { blocos: [] }),
  },
];
