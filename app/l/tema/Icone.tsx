// ── Ícones do tema ───────────────────────────────────────────────────────────
// Portados do `snippets/icon.liquid` do export, com os `viewBox` e os paths
// EXATOS. Não são os Tabler do ERP de propósito: a regra do projeto ("nada de
// emoji, tudo Tabler") vale pra interface do sistema, e aqui é a vitrine da
// loja — trocar a seta do tema por uma do Tabler mudaria a cara da cópia.
//
// Só entram os que a vitrine usa. O arquivo original tem 54 KB de ícones, a
// maioria de recursos que não existem aqui (moedas, redes sociais, bandeiras).

const PATHS: Record<string, { viewBox: string; corpo: React.ReactNode }> = {
  "tail-right": {
    viewBox: "0 0 24 24",
    corpo: <path fill="currentColor" d="M22.707 11.293L15 3.586 13.586 5l6 6H2c-.553 0-1 .448-1 1s.447 1 1 1h17.586l-6 6L15 20.414l7.707-7.707c.391-.391.391-1.023 0-1.414z" />,
  },
  "tail-left": {
    viewBox: "0 0 24 24",
    corpo: <path fill="currentColor" d="M1.293 11.293L9 3.586 10.414 5l-6 6H22c.553 0 1 .448 1 1s-.447 1-1 1H4.414l6 6L9 20.414l-7.707-7.707c-.391-.391-.391-1.023 0-1.414z" />,
  },
  "arrow-right": {
    viewBox: "0 0 8 12",
    corpo: <path stroke="currentColor" strokeWidth="2" d="M2 2l4 4-4 4" fill="none" strokeLinecap="square" />,
  },
  search: {
    viewBox: "0 0 21 21",
    corpo: (
      <g strokeWidth="2" stroke="currentColor" fill="none" fillRule="evenodd">
        <path d="M19 19l-5-5" strokeLinecap="square" />
        <circle cx="8.5" cy="8.5" r="7.5" />
      </g>
    ),
  },
  hamburger: {
    viewBox: "0 0 20 14",
    corpo: <path d="M0 12h20v2H0v-2zM0 0h20v2H0V0zm0 6h20v2H0V6z" fill="currentColor" fillRule="evenodd" />,
  },
  cart: {
    viewBox: "0 0 27 24",
    corpo: (
      <g transform="translate(0 1)" strokeWidth="2" stroke="currentColor" fill="none" fillRule="evenodd">
        <circle strokeLinecap="square" cx="11" cy="20" r="2" />
        <circle strokeLinecap="square" cx="22" cy="20" r="2" />
        <path d="M7.31 5h18.27l-1.44 10H9.78L6.22 0H0" />
      </g>
    ),
  },
  close: {
    viewBox: "0 0 19 19",
    corpo: <path d="M9.1923882 8.39339828l7.7781745-7.7781746 1.4142136 1.41421357-7.7781746 7.77817459 7.7781746 7.77817456L16.9705627 19l-7.7781745-7.7781746L1.41421356 19 0 17.5857864l7.7781746-7.77817456L0 2.02943725 1.41421356.61522369 9.1923882 8.39339828z" fill="currentColor" fillRule="evenodd" />,
  },
  email: {
    viewBox: "0 0 28 28",
    corpo: <path d="M14 28C6.2680135 28 0 21.7319865 0 14S6.2680135 0 14 0s14 6.2680135 14 14-6.2680135 14-14 14zm-3.2379501-18h6.4759002L14 12.6982917 10.7620499 10zM19 11.1350416V18H9v-6.8649584l5 4.1666667 5-4.1666667zM21 8H7v12h14V8z" fill="currentColor" />,
  },
  phone: {
    viewBox: "0 0 24 24",
    corpo: <path fill="currentColor" d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.36 11.36 0 003.57.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />,
  },
};

export function IconeTema({ nome, className }: { nome: string; className?: string }) {
  const i = PATHS[nome];
  if (!i) return null;
  return (
    <svg className={className ?? "icon"} viewBox={i.viewBox} role="presentation" aria-hidden="true">
      {i.corpo}
    </svg>
  );
}
