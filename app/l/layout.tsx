import "./vitrine.css";

// A vitrine tem layout PRÓPRIO: nada do shell do ERP entra aqui — nem sidebar,
// nem gaveta, nem o gate de sessão. Quem abre isto é cliente, não colaborador.
export default function VitrineLayout({ children }: { children: React.ReactNode }) {
  return children;
}
