// Exclusão de Dados — página PÚBLICA (sem login). A Meta exige uma URL de
// "Instruções de exclusão de dados do usuário" pra publicar o app. Estática.

export const metadata = {
  title: "Exclusão de Dados · Tridi Gaius",
  description: "Como solicitar a exclusão dos seus dados no Tridi Gaius.",
};

const EMPRESA = "Tridi Gaius";
const CONTATO = "sistemaempreendedores@gmail.com";

export default function ExclusaoDeDados() {
  return (
    <main style={wrap}>
      <h1 style={h1}>Exclusão de Dados</h1>
      <p style={sub}>{EMPRESA}</p>

      <Secao titulo="Como excluir seus dados">
        <p style={{ marginTop: 0 }}>Você pode remover seus dados de duas formas:</p>
        <ol style={{ paddingLeft: 22 }}>
          <li>
            <b>Desconectar a conta do Facebook:</b> na plataforma, abra
            <b> Tráfego → Integrações</b> e desconecte a conta da Meta. Isso
            remove imediatamente o token de acesso do nosso sistema; deixamos de
            ler qualquer dado das suas contas de anúncio.
          </li>
          <li>
            <b>Solicitar exclusão total:</b> envie um e-mail para{" "}
            <a href={`mailto:${CONTATO}`} style={link}>{CONTATO}</a> com o assunto
            <i> "Exclusão de dados"</i>. Confirmamos e apagamos os dados
            associados em até <b>30 dias</b>.
          </li>
        </ol>
      </Secao>

      <Secao titulo="O que é excluído">
        Tokens de acesso da Meta, métricas de campanha importadas vinculadas à sua
        conexão e informações de cadastro do usuário. Registros exigidos por
        obrigação legal ou fiscal podem ser retidos pelo prazo previsto em lei.
      </Secao>

      <Secao titulo="Contato">
        <a href={`mailto:${CONTATO}`} style={link}>{CONTATO}</a>
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
