# DashVendas

Painel de vendas em tempo real para **Android TV 9** e **tablet Android 9**, com
dashboard de controle web. Slides estilo Apple que rotacionam a cada 20s: ranking
de vendedores, corrida do foguete (Marketing vs Comercial), faturamento e produtos
mais vendidos. Auto-inicia no boot, sincroniza sozinho e toca som ao bater meta.

## Estrutura

| Pasta | O quê |
|-------|-------|
| raiz (`app/`, `lib/`, `scripts/`) | Next.js (Vercel): API (`/api/sales`, `/api/config`, …) + dashboard de controle. Supabase para dados/storage/auth. Fica na raiz para a Vercel autodetectar sem configurar Root Directory. |
| `tv-app/` | App Android nativo (Kotlin + Compose, minSdk 28). O painel da TV/tablet. |
| `supabase/` | Migration (`migrations/0001_init.sql`) + `seed.sql`. |
| `docs/` | Spec, plano e mapa do ERP legado. |

## 1. Backend + Dashboard (raiz)

```bash
cp .env.example .env.local   # preencher chaves Supabase
npm install
npm run dev                  # http://localhost:3000
```

- `/` — atalhos. `/painel` — preview do painel no browser. `/dashboard` — controle (login).
- Deploy: importar o repo na Vercel, root = raiz do repo, definir as 3 env vars
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

### Banco
Migration e seed já aplicados no projeto Supabase `tzariztovuuwyeoogbxg`. Para
reaplicar em outro projeto, rode o SQL de `supabase/` (via SQL Editor ou psql).

### Login do dashboard
Usuário admin criado em **tridiinteligenciaartificial@gmail.com** (senha entregue
em separado). Crie outros usuários no painel Supabase → Authentication.

## 2. App Android (`tv-app/`)

Pré-requisitos: Android SDK, Java 17. O wrapper Gradle já está incluso.

```bash
cd tv-app
cp local.properties.example local.properties   # ajustar sdk.dir
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Instalar na TV box / tablet:

```bash
adb connect <IP_DA_TVBOX>:5555      # TV box via rede
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Apontar para o backend
Edite `DEFAULT_API_BASE` em `tv-app/app/build.gradle.kts` com a URL da Vercel
antes de compilar (ex: `https://dashvendas.vercel.app`). O app também guarda a
URL em preferências para troca em runtime.

### Auto-início no boot
O `BootReceiver` abre o painel quando a TV/tablet liga (permissão
`RECEIVE_BOOT_COMPLETED` já no manifest). Em alguns launchers de TV box é preciso
autorizar "auto-start" do app nas configurações do aparelho.

## Como trocar os dados mock por dados reais

A camada `DataSource` (`lib/datasource/`) tem uma interface única. Hoje usa o
Supabase (`SupabaseDataSource`). Para integrar outra fonte (API da empresa,
Google Sheets, ERP), crie uma nova implementação de `DataSource` e troque em
`web/lib/datasource/index.ts`. UI e endpoints não mudam.

## ⚠️ Segurança

A senha do banco e a `service_role` key foram compartilhadas em chat durante o
setup. **Rotacione-as** no painel Supabase (Settings → Database / API) e atualize
`web/.env.local` + as env vars da Vercel. Nunca commite `.env.local`.
