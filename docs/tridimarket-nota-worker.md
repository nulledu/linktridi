# TridiMarket · Nota do supermercado → estoque (worker self-hosted)

**Objetivo.** No Estoque do TridiMarket, subir foto/PDF de uma nota de compra e
extrair os itens (nome, quantidade e **preço pago**) para dar entrada no estoque
com **custo** — daí aparece o **lucro por produto**.

**Restrição dura.** A imagem NUNCA vai para o Claude / nenhum LLM de visão.

## Arquitetura

Um **worker** roda num PC Windows da empresa (ligado 24h, já usado como server).
Ele **não abre porta** — puxa trabalho do domínio:

```
[Estoque web] --upload--> [Supabase Storage: bucket privado market-notas]
      |                                   ^
      v                                   | (signed URL, só o worker baixa)
[market_worker_jobs: queued] <--claim-- [PC Windows: worker.py]
      ^                                   | 1) tenta QR fiscal (NFC-e) -> itens exatos
      |                                   | 2) senão RapidOCR + parser de cupom BR
      +----complete(result jsonb)---------+
      |
      v
[Estoque web: confere itens] --confirm--> estoque_perfil += qty ; custo por produto
```

### Componentes

1. **SQL** (`supabase/tridimarket-nota-worker.sql`)
   - `market_worker_jobs` — fila genérica (kind='nota_ocr' agora, extensível).
     Campos: id, kind, status(queued|processing|done|error|confirmed|failed),
     profile_id (unidade destino), image_path, result jsonb, error, created_by,
     claimed_at, attempts, created_at, updated_at.
   - `market_product_cost` — último custo por produto/unidade (product_id,
     profile_id, custo, updated_at). Lucro = preço − custo.
   - bucket privado `market-notas` (storage.buckets).

2. **API do worker** (token `WORKER_TOKEN`, sem cookie/usuário)
   - `POST /api/worker/claim` — atômico: pega 1 job `queued`, marca `processing`,
     devolve job + **signed URL** da imagem. Sem job → 204.
   - `POST /api/worker/complete` — recebe {jobId, result|error}. Salva result e
     marca `done`/`error`.
   - `GET /api/worker/ping` — saúde do worker (heartbeat, opcional).

3. **API do painel** (gate tridimarket normal)
   - `POST /api/tridimarket/notas` — cria job: sobe imagem no bucket, insere job
     `queued`. Devolve jobId.
   - `GET /api/tridimarket/notas?jobId=` — status + result pra tela pollar.
   - `POST /api/tridimarket/notas/confirmar` — recebe itens conferidos +
     mapeamento (produto existente ou novo) → dá entrada no estoque + custo.

4. **Worker** (`worker/` — pasta entregue pro usuário)
   - `worker.py` — loop: claim → baixa imagem → QR fiscal (pyzbar) OU RapidOCR →
     parser → complete. Sem porta aberta; só HTTPS de saída.
   - `requirements.txt` — rapidocr-onnxruntime, opencv-python-headless, pyzbar,
     requests, pillow, pdf2image (opcional p/ PDF).
   - `.env.example` — WORKER_URL (domínio), WORKER_TOKEN.
   - `start.bat` — cria venv, instala, roda. Atalho em shell:startup = 24h.
   - `README` — passo a passo (instalar Python uma vez, colar token, autostart).

5. **Web Estoque** — botão "Adicionar nota": foto/upload → cria job → mostra
   progresso (pollando) → tela de conferência (itens editáveis, casar com produto
   existente por código/nome ou criar novo) → confirmar → estoque + custo.

### Decisões

- **RapidOCR (ONNXRuntime)**, não PaddleOCR/Tesseract: pip puro, leve (sem
  PyTorch/Paddle), roda em CPU de PC comum, sem Docker.
- **QR fiscal primeiro**: cupom NFC-e traz os itens exatos (nome, qtd, vlUnCom)
  pela chave/QR — sem erro de OCR. OCR é só o fallback.
- **Worker puxa** (poll), não recebe: PC atrás de roteador não precisa de IP
  público nem porta.
- **Confirmação humana** antes de mexer no estoque: OCR erra; a pessoa revisa.
- Tudo tolerante à ausência: sem SQL/worker, o resto do painel funciona igual;
  o botão "Adicionar nota" avisa que o processador está offline.

### Fases de entrega

1. **Fundação** — SQL + `lib/tridimarket/notas.ts` + API worker (claim/complete)
   + API painel (criar/status). Sem UI ainda.
2. **Worker** — pasta `worker/` completa + README de instalação no Windows.
3. **Web** — botão e fluxo de conferência no Estoque.
4. **Custo/lucro** — confirmar grava custo; Produtos/Estoque mostram margem.
