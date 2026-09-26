# Servidor dos chats — o que fazer

Coloca os chats no seu servidor, com o `gedux.com.br` apontando pra lá.
O resto do sistema (Gaius) continua na Vercel, como está hoje.

## O que você precisa ter em mãos

1. O **IP do servidor** (o provedor te mostra na tela dele).
2. A senha ou chave de acesso ao servidor.
3. O domínio `gedux.com.br` apontando pro IP — registro **A**, Host **@**,
   valor = o IP do servidor. Isso se faz no painel de quem vendeu o domínio.

## Por que é seguro

O servidor **não guarda nenhuma senha**. Ele só desenha o chat na tela; quando
precisa dos dados do bot, pergunta pro Gaius pela internet. As senhas do banco e
o token da Meta ficam só na Vercel, no cofre dela.

Se alguém invadir o servidor, não encontra credencial nenhuma. E o sistema
(vendas, funcionários, ponto) não existe naquela máquina — nem digitando o IP
direto no navegador.

## Onde colar cada coisa

São três lugares diferentes — não misture:

| O quê | Onde |
|---|---|
| Registro A do domínio | Site de quem vendeu o domínio (Registro.br, Hostinger…), área de DNS |
| A chave `ssh-ed25519 AAAA…` | Site do GitHub → repositório → Settings → Deploy keys |
| Todos os comandos | Janela do Terminal **conectada ao servidor** |

### Como abrir a janela do servidor (no Mac)

1. **⌘ + espaço**, digite `Terminal`, Enter.
2. Na janela, digite (trocando pelo IP do provedor):

   ```
   ssh root@SEU-IP-AQUI
   ```

   Se o provedor deu outro usuário (às vezes é `ubuntu`), use ele no lugar de `root`.
3. Vai pedir a senha. **Ela não aparece na tela enquanto você digita** — nem
   bolinhas. É normal: digite e aperte Enter.

A partir daí aquela janela **é** o servidor. Todos os comandos abaixo vão colados
ali dentro, um de cada vez, com Enter depois de cada um.

Pra sair depois: digite `exit`.

## Passo 1 — dar acesso do código ao servidor

O código está num repositório privado, então o servidor precisa de permissão pra
baixá-lo. Uma vez só:

Entre no servidor e rode:

```bash
ssh-keygen -t ed25519 -C chats -f /root/.ssh/id_ed25519 -N ""
cat /root/.ssh/id_ed25519.pub
```

Copie o que apareceu e cole em: GitHub → repositório `dashvendas` → **Settings**
→ **Deploy keys** → **Add deploy key** → cole → **Add key**.
(Não marque "Allow write access" — ele só precisa ler.)

## Passo 2 — rodar o instalador

Ainda no servidor, um comando só:

```bash
git clone git@github.com:sistemaempreendedores/dashvendas.git /tmp/gaius \
  && sudo REPO="git@github.com:sistemaempreendedores/dashvendas.git" \
     bash /tmp/gaius/scripts/instalar-chats.sh gedux.com.br https://tridigaius.vercel.app
```

Demora alguns minutos. Ele instala tudo, publica no domínio, coloca o cadeado
(HTTPS), liga o firewall — e no fim **confere sozinho** se ficou seguro,
mostrando uma lista com "ok" ou "FALHA" em cada item.

Se aparecer qualquer FALHA, **me mande a tela antes de usar**.

## Passo 3 — usar

No Gaius, o bot continua sendo publicado do mesmo jeito (editor → Compartilhar →
escolher o domínio). O link fica `https://gedux.com.br/f/<nome-do-bot>`.

## Quando eu mexer no código

Pra levar a atualização pro servidor:

```bash
sudo bash /opt/chats/app/scripts/atualizar-chats.sh
```

Ele atualiza e confere o isolamento de novo.

---

## Detalhes técnicos

Duas variáveis controlam o modo, e só isso fica no `.env.production`:

| Variável | Efeito |
|---|---|
| `APENAS_PLAYER=1` | A instância só serve `/f`, `/api/f` e `/_next`. Todo o resto responde 404, independente do host — inclusive o acesso pelo IP. |
| `PLAYER_API_BASE` | Endereço do Gaius. Com ele definido, o player não fala com o banco: busca o bot em `/api/f/bot` e encaminha sessões/eventos. Sem ele, lê o banco direto (é o que a Vercel faz). |

O encaminhamento repassa `user-agent` e o IP do visitante, senão a Meta
receberia os dados do servidor e a atribuição do anúncio ficaria errada.

`/api/f/bot` devolve exatamente o mesmo objeto que o player já entrega ao
navegador de qualquer visitante (pixels sanitizados por `getBotPublicado` — o
token da CAPI nunca sai do servidor). Não expõe nada novo.

O nginx precisa repassar `X-Forwarded-Host`: o player resolve qual bot mostrar
pelo host. Já está na config gerada pelo instalador.

### Conferir na mão

```bash
curl -I https://gedux.com.br/f/<slug>   # 200
curl -I https://gedux.com.br/painel     # 404
curl -I http://<IP-DO-SERVIDOR>/painel  # 404  ← o mais importante
grep -c SUPABASE /opt/chats/app/.env.production   # 0
```
