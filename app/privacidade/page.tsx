// Política de Privacidade — página PÚBLICA (sem login) exigida pela Meta pra
// publicar o app de OAuth (Login do Facebook). Rota liberada no middleware
// (PUBLIC_PREFIXES). Texto genérico do produto Tridi/Tridify — ajuste a razão
// social/contato conforme sua empresa antes de submeter à revisão da Meta.

export const metadata = {
  title: "Política de Privacidade · Tridi Gaius",
  description: "Como o Tridi Gaius coleta, usa e protege os dados, incluindo os dados das contas de anúncio do Facebook/Meta.",
};

const ATUALIZADO = "21 de julho de 2026";
const EMPRESA = "Tridi Gaius";
const CONTATO = "sistemaempreendedores@gmail.com";

export default function PoliticaPrivacidade() {
  return (
    <main style={{ background: "#fff", minHeight: "100dvh", boxSizing: "border-box", padding: "48px max(22px, calc((100% - 780px) / 2)) 80px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", color: "#1a1a1a", lineHeight: 1.65, fontSize: 16 }}>
      <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6 }}>Política de Privacidade</h1>
      <p style={{ color: "#666", marginTop: 0 }}>{EMPRESA} · Última atualização: {ATUALIZADO}</p>

      <Secao titulo="1. Quem somos">
        O {EMPRESA} é uma plataforma interna de gestão empresarial (ERP e análise de
        tráfego pago) usada pela nossa própria equipe para acompanhar vendas,
        campanhas de anúncios e operação. Esta política explica quais dados
        tratamos e como os protegemos.
      </Secao>

      <Secao titulo="2. Dados que coletamos">
        <ul style={ulSt}>
          <li><b>Dados de conta e acesso:</b> nome, e-mail e credenciais de login dos usuários autorizados da plataforma.</li>
          <li><b>Dados de contas de anúncio (Meta/Facebook):</b> ao conectar sua conta do Facebook, acessamos, via API oficial da Meta, métricas das contas de anúncio às quais você tem acesso — gasto, impressões, cliques, conversões, ROAS, nome de campanhas/conjuntos/anúncios e criativos. <b>Não</b> coletamos sua lista de amigos, mensagens privadas nem publicações pessoais.</li>
          <li><b>Dados operacionais e de vendas:</b> pedidos, faturamento e informações comerciais provenientes dos nossos próprios sistemas.</li>
        </ul>
      </Secao>

      <Secao titulo="3. Como usamos os dados">
        Usamos os dados exclusivamente para exibir relatórios, painéis e análises
        internas de desempenho de marketing e vendas — por exemplo, calcular
        ROAS, custo por venda e faturamento por canal. Não usamos os dados para
        publicidade direcionada a terceiros nem para perfis de indivíduos.
      </Secao>

      <Secao titulo="4. Uso de dados da Plataforma Meta">
        Ao usar o Login do Facebook, solicitamos as permissões
        <code style={codeSt}>ads_read</code>, <code style={codeSt}>ads_management</code> e
        <code style={codeSt}>business_management</code>, apenas para ler o desempenho
        das campanhas e, quando você solicita, pausar/ativar ou ajustar orçamento
        de campanhas. O token de acesso é armazenado de forma segura no servidor,
        usado somente para essas chamadas e <b>nunca</b> exposto publicamente,
        compartilhado ou vendido. Seguimos as Políticas da Plataforma Meta.
      </Secao>

      <Secao titulo="5. Compartilhamento">
        Não vendemos nem compartilhamos seus dados com terceiros para fins de
        marketing. Dados podem ser processados por prestadores de infraestrutura
        (por exemplo, hospedagem e banco de dados) estritamente para operar a
        plataforma, sob obrigações de confidencialidade.
      </Secao>

      <Secao titulo="6. Retenção e exclusão de dados">
        Mantemos os dados enquanto a conta estiver ativa. Você pode desconectar a
        conta do Facebook a qualquer momento na tela de Integrações, o que
        remove o token de acesso do nosso sistema. Para solicitar a exclusão dos
        seus dados, escreva para <a href={`mailto:${CONTATO}`} style={linkSt}>{CONTATO}</a> —
        atendemos em até 30 dias.
      </Secao>

      <Secao titulo="7. Segurança">
        Adotamos medidas técnicas para proteger os dados (acesso restrito por
        autenticação, tokens guardados apenas no servidor com acesso privilegiado
        e conexões criptografadas). Nenhum sistema é 100% infalível, mas tratamos
        a segurança como prioridade.
      </Secao>

      <Secao titulo="8. Seus direitos">
        Você pode solicitar acesso, correção ou exclusão dos seus dados pessoais,
        conforme a LGPD (Lei nº 13.709/2018), pelo contato abaixo.
      </Secao>

      <Secao titulo="9. Alterações">
        Podemos atualizar esta política periodicamente. A data de última
        atualização no topo indica a versão vigente.
      </Secao>

      <Secao titulo="10. Contato">
        Dúvidas sobre privacidade ou solicitações de dados:{" "}
        <a href={`mailto:${CONTATO}`} style={linkSt}>{CONTATO}</a>.
      </Secao>

      <p style={{ marginTop: 40, fontSize: 13, color: "#999" }}>© {EMPRESA}. Todos os direitos reservados.</p>
    </main>
  );
}

const ulSt: React.CSSProperties = { paddingLeft: 22, margin: "8px 0" };
const codeSt: React.CSSProperties = { background: "#f2f2f5", borderRadius: 5, padding: "1px 6px", fontSize: 14, margin: "0 2px" };
const linkSt: React.CSSProperties = { color: "var(--primary-texto)", textDecoration: "underline" };

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 26 }}>
      <h2 style={{ fontSize: 19, fontWeight: 700, marginBottom: 6 }}>{titulo}</h2>
      <div style={{ color: "#333" }}>{children}</div>
    </section>
  );
}
