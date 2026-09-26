# Worker de leitura de nota — TridiMarket

Programa que roda **num PC Windows da empresa** (ligado 24h) e lê as fotos de
nota do supermercado enviadas pelo painel, devolvendo os itens para conferência
e entrada no estoque.

**A imagem nunca vai para o Claude.** Ela fica num bucket privado e só este
worker baixa (por uma URL assinada de 5 minutos), lê **localmente** no PC e
devolve os itens. O worker **não abre porta nenhuma** — só faz chamadas de saída
para o seu domínio, então funciona atrás de qualquer roteador.

## Instalar (uma vez) — o jeito fácil

1. Copie esta pasta `worker/` inteira para o PC da empresa (ex.: `C:\tridimarket-worker`).
2. **Dê dois cliques em `instalar.bat`.** Ele faz tudo:
   - instala o **Python** sozinho se não tiver (via winget);
   - monta o ambiente e baixa o motor de OCR (alguns minutos na 1ª vez);
   - **pergunta** o endereço do sistema e o token, e grava o `.env`;
   - oferece **iniciar sozinho quando o PC ligar** (recomendado: responda **S**);
   - já inicia o worker.

Antes de rodar, tenha em mãos:

- **Endereço do sistema** — ex.: `https://app.suaempresa.com.br`
- **Token do worker** — o **mesmo** valor que está no servidor na variável
  `TRIDIMARKET_WORKER_TOKEN` (um texto longo e aleatório, 24+ caracteres).

> Se o `instalar.bat` disser que instalou o Python e pediu para reabrir, apenas
> **feche a janela e rode o `instalar.bat` de novo** — na segunda vez ele já
> encontra o Python e segue.

## No dia a dia

Depois de instalado, o worker sobe sozinho com o Windows (se você respondeu
**S**). Para abrir na mão, dê dois cliques em **`start.bat`**. Ele se reinicia
sozinho se cair; para encerrar, feche a janela.

## Como saber se está funcionando

A janela mostra linhas como:
```
[10:22:01] Worker TridiMarket iniciado. Falando com https://...
[10:22:01] Sem notas na fila. Aguardando...
[10:23:10] Nota abc123: lendo (240 KB)...
[10:23:14] Nota abc123: 12 itens (ocr).
```
No painel (**Estoque → Adicionar nota**) o status da nota sai de “processando”
para a tela de conferência.

## O que precisa no SERVIDOR (uma vez)

Defina a variável de ambiente do app:
```
TRIDIMARKET_WORKER_TOKEN=<um texto longo e aleatório, 24+ caracteres>
```
É esse mesmo valor que você cola no `instalar.bat` como “Token do worker”.

## Futuro

Este worker é genérico: dá para plugar outras tarefas da empresa nele depois
(mesma fila `market_worker_jobs`, outros `kind`). É o “servidorzinho” da empresa.

## Problemas comuns

- **Pediu pra reabrir depois de instalar o Python** → feche e rode o
  `instalar.bat` de novo (normal na 1ª vez).
- **Sem winget / não instalou o Python** → instale manualmente em
  <https://www.python.org/downloads/> (marque “Add python.exe to PATH”) e rode
  o `instalar.bat` de novo.
- **403 nas chamadas** → o token do `.env` está diferente do
  `TRIDIMARKET_WORKER_TOKEN` do servidor. Apague o `.env` e rode o
  `instalar.bat` de novo para redigitar.
- **`pyzbar` falhou** → o worker ainda funciona só com o OCR; o QR é um extra.
