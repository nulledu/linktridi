// Termos de Uso — página PÚBLICA (sem login), pra o campo "URL dos Termos de
// Serviço" do app Meta. Estática, sem dados sensíveis. Liberada no middleware.

export const metadata = {
  title: "Termos de Uso · Tridi Gaius",
  description: "Termos de uso da plataforma Tridi Gaius.",
};

const ATUALIZADO = "21 de julho de 2026";
const EMPRESA = "Tridi Gaius";
const CONTATO = "sistemaempreendedores@gmail.com";

export default function Termos() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Termos de Uso</h1>
      <p style={sub}>{EMPRESA} · Última atualização: {ATUALIZADO}</p>

      <Secao titulo="1. Aceitação">
        Ao acessar e usar o {EMPRESA}, você concorda com estes Termos. A
        plataforma é de uso interno, restrita a usuários autorizados da empresa.
      </Secao>
      <Secao titulo="2. Uso permitido">
        Você se compromete a usar a plataforma apenas para fins legítimos de
        gestão e análise do negócio, sem tentar acessar dados de terceiros,
        burlar a autenticação ou sobrecarregar os serviços.
      </Secao>
      <Secao titulo="3. Integrações de terceiros">
        A plataforma se conecta a serviços externos (por exemplo, Meta/Facebook
        Ads) por meio de APIs oficiais, respeitando os termos e políticas de cada
        provedor. Os acessos concedidos são usados só para as funções descritas
        na nossa Política de Privacidade.
      </Secao>
      <Secao titulo="4. Disponibilidade">
        Empenhamo-nos em manter o serviço no ar, mas ele é fornecido "como está",
        sem garantia de disponibilidade ininterrupta.
      </Secao>
      <Secao titulo="5. Alterações">
        Podemos atualizar estes Termos. A data no topo indica a versão vigente.
      </Secao>
      <Secao titulo="6. Contato">
        Dúvidas: <a href={`mailto:${CONTATO}`} style={link}>{CONTATO}</a>.
      </Secao>

      <p style={{ marginTop: 40, fontSize: 13, color: "#999" }}>
        Veja também a <a href="/privacidade" style={link}>Política de Privacidade</a>.
      </p>
    </main>
  );
}

const wrap: React.CSSProperties = { background: "#fff", minHeight: "100dvh", boxSizing: "border-box", padding: "48px max(22px, calc((100% - 780px) / 2)) 80px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#1a1a1a", lineHeight: 1.65, fontSize: 16 };
const h1: React.CSSProperties = { fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 };
const sub: React.CSSProperties = { color: "#666", marginTop: 0 };
const link: React.CSSProperties = { color: "var(--primary-texto)", textDecoration: "underline" };

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>{titulo}</h2>
      <div style={{ color: "#333" }}>{children}</div>
    </section>
  );
}
