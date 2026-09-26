// Categorias do cofre de acessos.
//
// Vive num arquivo PRÓPRIO, e não junto do resto do cofre, porque a tela é um
// componente de cliente: importar `lib/acessos-cofre.ts` de lá arrastaria
// `node:crypto` (e a leitura de `ACESSOS_CRYPTO_KEY`) pro pacote do navegador.
// O build quebra — e no dia em que não quebrasse, seria pior.
export const CATEGORIAS = [
  "Infraestrutura", "Redes sociais", "Ferramentas internas",
  "Financeiro", "Marketing", "Outros",
] as const;

export type Categoria = (typeof CATEGORIAS)[number];

// Tipo da credencial: de quem a empresa entregou um acesso (funcionário), de
// um aplicativo/serviço da própria empresa (Meta Business, Hostinger, GitHub…)
// ou uma CONTA DE E-MAIL da empresa — onde o que importa é "este e-mail é pra
// tal coisa" (o campo serviço vira a finalidade). Nos dois últimos, o
// colaborador vinculado é o RESPONSÁVEL. Aqui pelo mesmo motivo das
// categorias: a tela importa sem arrastar `node:crypto`.
export const TIPOS_DE_CREDENCIAL = ["funcionario", "aplicativo", "email"] as const;
export type TipoDeCredencial = (typeof TIPOS_DE_CREDENCIAL)[number];

export const TIPO_ROTULO: Record<TipoDeCredencial, string> = {
  funcionario: "Funcionário",
  aplicativo: "Aplicativo / serviço",
  email: "E-mail",
};
