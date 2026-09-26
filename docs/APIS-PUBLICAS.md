# APIs públicas — o que serve pro Gaius

Triagem do catálogo [public-apis/public-apis](https://github.com/public-apis/public-apis)
(commit `4eb4fab`, 24/09/2026, ~1.400 APIs). O repositório é só uma lista em
README — não tem código pra instalar, por isso **não foi vendorizado**. Aqui fica
só o que tem uso real no ERP, ordenado por prioridade.

Regras que valem pra qualquer uma daqui antes de entrar no app:

- Chamada externa roda **no servidor** e passa por `cached()` (`lib/cache.ts`) —
  CEP, CNPJ e câmbio mudam pouco; sem cache vira invocação da Vercel à toa.
- `fetch` com prazo (`AbortSignal.timeout`) — API gratuita stalla sem erro
  (ver ERP legado).
- Grátis/sem chave = sem SLA. Sempre ter plano B (duas fontes, ou degradar
  mostrando o campo vazio em vez de quebrar a tela).

## Já em uso

| API | Onde |
|---|---|
| [BrasilAPI](https://brasilapi.com.br/docs) `/feriados/v1` | Ponto / RH → Calendário (feriados nacionais) |

## Alta — encaixa em tela que já existe

| API | Chave | Pra quê no Gaius |
|---|---|---|
| [BrasilAPI](https://brasilapi.com.br/docs) (CEP v2, CNPJ, bancos, DDD, FIPE, IBGE, taxas) | não | **Uma fonte pra quase tudo BR.** CNPJ preenche fornecedor/empresa no Financeiro e Estoque; CEP preenche endereço no RH (ficha), Lojas (checkout) e Currículos; `/banks` alimenta o seletor de banco do Financeiro |
| [ViaCEP](https://viacep.com.br) | não | Plano B do CEP quando a BrasilAPI cair |
| [ReceitaWS](https://www.receitaws.com.br/) | não (3 req/min) | Plano B do CNPJ — limite baixo, só com cache |
| [Banco Central — dados abertos](https://dadosabertos.bcb.gov.br/) (SGS/PTAX) | não | Selic, IPCA, PTAX oficiais → correção de valores e juros no Financeiro, câmbio de compra importada |
| [AwesomeAPI moedas](https://docs.awesomeapi.com.br/api-de-moedas) | não | Cotação USD/EUR em tempo real (widget, custo de insumo importado) |
| [Frankfurter](https://www.frankfurter.app/docs) | não | Série histórica de câmbio (BCE) pra gráfico |
| [IBGE serviços](https://servicodados.ibge.gov.br/api/docs/) | não | Lista oficial de UF/municípios (select de cidade), malhas pro mapa de vendas por estado na Analytics |
| [Nager.Date](https://date.nager.at) | não | Plano B de feriados nacionais do Ponto |

## Média — ideia pronta pra projeto futuro

| API | Chave | Ideia |
|---|---|---|
| [Nominatim (OSM)](https://nominatim.org/release-docs/latest/api/Overview/) | não (1 req/s, exige User-Agent) | Geocodificar endereço de pedido → mapa de calor de vendas / logística |
| [Open-Meteo](https://open-meteo.com/) | não (não-comercial) | Clima × venda na Analytics; card de clima na parede de TV. Uso comercial pede plano |
| [Kickbox open](https://open.kickbox.com/) / [MailCheck.ai](https://www.mailcheck.ai/) | não | Barrar e-mail descartável no LinkTridi, TridiFlow (quiz/leads) e /candidatura |
| [Orca Scan barcode](https://orcascan.com/guides/free-barcode-image-api-0e4a4fa6) | não | EAN/Code128/QR em imagem — só se a geração local das etiquetas do Estoque precisar de fallback |
| [Labelixa](https://labelixa.com/docs/api) | sim | Prévia PNG de ZPL (Zebra) antes de imprimir na /operacao |
| [Open Food Facts](https://world.openfoodfacts.org/data) | não | Cadastro do mercadinho pelo EAN bipado (nome + foto do produto) |
| [LibreTranslate](https://libretranslate.com/docs) | não (auto-hospedável) | Traduzir Tutoriais / vitrine sem pagar API; dá pra subir na VPS gedux |
| [OCR.Space](https://ocr.space/ocrapi) | sim (tier grátis) | Ler nota/comprovante do Financeiro e do mercadinho (alternativa ao worker atual) |
| [Boleto.Cloud](https://boleto.cloud/) / [Banco do Brasil](https://developers.bb.com.br/home) | sim / OAuth | Emitir boleto e conciliar extrato no Financeiro |
| [FIPE (deividfortuna)](https://deividfortuna.github.io/fipe/) | não | Valor de veículo no Patrimônio do Financeiro (também está na BrasilAPI) |
| [ip-api](https://ip-api.com/docs) | não (HTTP só, não-comercial) | Cidade do visitante no analytics da vitrine — preferir header `x-vercel-ip-city`, que é de graça |
| [DiceBear](https://www.dicebear.com/) | não | Avatar padrão de quem não tem foto (ou gerar local com o pacote npm) |
| [EditalMD](https://editalmd.com/api/) | não | Licitações (PNCP) em Markdown — só se a Tridi vender pra órgão público |

## Só pra desenvolvimento

- [JSONPlaceholder](https://jsonplaceholder.typicode.com), [ReqRes](https://reqres.in/),
  [Beeceptor](https://beeceptor.com/) — mock de API em protótipo.
- [DummyImage](https://dummyimage.com/) — placeholder de imagem nos bancos `/dev-*`.

## Descartado (e por quê)

- **CPFHub** e afins de "consulta CPF" devolvem nome/nascimento de terceiros —
  risco LGPD; não usar.
- **Screenshot/HTML→PDF pagos** (ApiFlash, pdflayer, etc.): o app já gera PDF
  (deck de criativos) no próprio código.
- **Encurtador de URL**: o TridiFlow já tem slug próprio (`/f`, `/p`, `/ab`).
- Cripto, anime, jogos, piadas etc.: sem relação com o negócio.
