#!/usr/bin/env python3
"""Coletor da página de status (Gatus em status.gedux.com.br).

  coletor.py terceiros   -> a cada 5 min: Meta e AWS, empurrados pro Gatus
  coletor.py fluxos      -> 1x por hora: lista de funis com visita nos últimos
                            7 dias (config/fluxos.yaml + data/fluxos-lista.json)
  coletor.py funis       -> a cada 10 min: abre cada funil UMA vez, compara com
                            a impressão digital e marca ocorrências (flags.json)
  coletor.py dominios    -> 1x por hora (junto do fluxos): domínios ATIVOS no
                            Acessos & Infra + ligados no produto (config/dominios.yaml)
  coletor.py tutoriais   -> 1x por hora (junto do fluxos): o site de tutoriais,
                            a central e cada tutorial publicado (config/tutoriais.yaml)

A cópia VIVA roda em /opt/status/coletor.py na VPS do gedux (cron em
/etc/cron.d/tridi-status). Esta aqui é a mesma, versionada — até 17/09/2026 o
arquivo só existia na VPS e qualquer mudança começava com um scp de resgate.
Pra publicar: `scp vps/status/coletor.py root@gedux.com.br:/opt/status/`.

Só biblioteca padrão. Configuração em /opt/status/coletor.env (KEY=VALUE).
Nunca apaga o que já existe quando a fonte falha: sem resposta, fica como está.
"""
import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

RAIZ = "/opt/status"
GATUS = "https://status.gedux.com.br"
UA = {"User-Agent": "tridi-status/1.0"}


def env():
    cfg = {}
    with open(os.path.join(RAIZ, "coletor.env")) as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                cfg[k.strip()] = v.strip()
    return cfg


def baixar(url, dados=None, cabecalhos=None, prazo=15):
    req = urllib.request.Request(url, data=dados, headers={**UA, **(cabecalhos or {})})
    with urllib.request.urlopen(req, timeout=prazo) as r:
        return r.read()


def chave(grupo, nome):
    # Mesma regra do Gatus (config/key/key.go).
    def s(x):
        x = x.strip().lower()
        for c in "/_.,  #+&":
            x = x.replace(c, "-")
        return x
    return s(grupo) + "_" + s(nome)


def empurrar(cfg, grupo, nome, ok, erro=""):
    q = {"success": "true" if ok else "false"}
    if not ok and erro:
        q["error"] = erro[:300]
    # Grupo e nome ficam em ASCII: o Gatus não decodifica %C3%A7 na chave.
    url = f"{GATUS}/api/v1/endpoints/{urllib.parse.quote(chave(grupo, nome))}/external?" + urllib.parse.urlencode(q)
    try:
        baixar(url, dados=b"", cabecalhos={"Authorization": "Bearer " + cfg["GATUS_TOKEN"]})
    except Exception as e:  # Gatus fora: o heartbeat de 20 min denuncia sozinho
        print("push falhou", nome, e, file=sys.stderr)


# ── Meta ────────────────────────────────────────────────────────────────────
# org do metastatus.com -> (nome no Gatus, serviços que importam | None = todos)
META = {
    "marketing-api": ("Marketing API", None),
    "ads-manager": ("Ads Manager", None),
    "whatsapp-business-api": ("WhatsApp Cloud API", {"Cloud API", "WhatsApp Business Account Management"}),
    "ig-messenger": ("Instagram Direct", None),
    "graph-api": ("Graph API", None),
}
# "Resolved" fica no metastatus por horas depois que a Meta fecha o incidente:
# é estado de OK, não de falha (marcava "fora do ar" com o problema já resolvido).
META_OK = {"No known issues", "Resolved"}


def meta(cfg):
    try:
        orgs = json.loads(baixar("https://metastatus.com/data/orgs.json"))
    except Exception as e:
        print("metastatus falhou", e, file=sys.stderr)
        return  # sem push: o heartbeat acusa se durar
    por_id = {o.get("id"): o for o in orgs if isinstance(o, dict)}
    for org_id, (nome, filtro) in META.items():
        org = por_id.get(org_id)
        if not org:
            empurrar(cfg, "Meta", nome, False, "sumiu do metastatus.com")
            continue
        ruins = [
            f"{s.get('name')}: {s.get('status')}"
            for s in org.get("services", [])
            if (filtro is None or s.get("name") in filtro) and s.get("status") not in META_OK
        ]
        empurrar(cfg, "Meta", nome, not ruins, "; ".join(ruins))


# ── AWS ─────────────────────────────────────────────────────────────────────
# Vercel (funções) roda em us-east-1 e a borda de SP em sa-east-1.
REGIOES_AWS = {"us-east-1", "sa-east-1", "global"}


def aws(cfg):
    try:
        bruto = baixar("https://health.aws.amazon.com/public/currentevents")
        eventos = json.loads(bruto.decode("utf-16"))  # a AWS serve em UTF-16
    except Exception as e:
        print("aws falhou", e, file=sys.stderr)
        return
    ruins = []
    for ev in eventos if isinstance(eventos, list) else []:
        arn = str(ev.get("arn", ""))  # arn:aws:health:<regiao>::event/<SERVICO>/...
        partes = arn.split(":")
        regiao = partes[3] if len(partes) > 3 and partes[3] else "global"
        if regiao in REGIOES_AWS:
            servico = arn.split("event/")[-1].split("/")[0] if "event/" in arn else "?"
            ruins.append(f"{regiao}: {servico}")
    empurrar(cfg, "Terceiros", "AWS", not ruins, "; ".join(sorted(set(ruins))))


# ── Hostinger ───────────────────────────────────────────────────────────────
# O indicador geral deles acende por qualquer dos ~97 componentes (hPanel,
# e-mail, hospedagem compartilhada em Singapura…). O que segura os funis é a
# VPS em São Paulo: só isso conta aqui.
HOSTINGER_RELEVANTE = re.compile(r"VPS|S[ãa]o Paulo|\bBR\b|BR-|Brazil|Brasil", re.I)


def hostinger(cfg):
    try:
        j = json.loads(baixar("https://statuspage.hostinger.com/api/v2/summary.json"))
    except Exception as e:
        print("hostinger falhou", e, file=sys.stderr)
        return
    ruins = [
        f"{c.get('name')}: {c.get('status')}"
        for c in j.get("components", [])
        if HOSTINGER_RELEVANTE.search(c.get("name", "")) and c.get("status") not in ("operational", "under_maintenance")
    ]
    empurrar(cfg, "Terceiros", "Hostinger", not ruins, "; ".join(ruins))


# ── Funis ───────────────────────────────────────────────────────────────────
# A lógica do changedetection.io, moldada pro funil. Cada funil tem uma
# impressão digital: a página traz o bot (`"bot":{` + `"fluxo"` no payload do
# Next) e um título. A cada 10 min o coletor abre o funil UMA vez — o Gatus não
# abre mais os funis, então não há visita dobrada nem invocação a mais — e
# compara. Qualquer coisa que não é o funil vira OCORRÊNCIA com tipo (404, erro
# no servidor, redirecionou, página de erro, "link indisponível", não é o funil,
# fora do ar) e derruba o item no Gatus (aviso no Gaius + ntfy). Título que
# mudou e resposta lenta viram AVISO: contam, mas não derrubam. Tudo conta em
# 7 dias, uma vez por episódio, e sai em site/flags.json, que o /status lê.
LISTA = os.path.join(RAIZ, "data", "fluxos-lista.json")
ESTADO = os.path.join(RAIZ, "data", "fluxos-estado.json")
# Só o `caminho` escreve aqui e só o `funis` lê: dois arquivos, nenhuma trava.
CAMINHO = os.path.join(RAIZ, "data", "fluxos-caminho.json")
FLAGS = os.path.join(RAIZ, "site", "flags.json")
JANELA = 7 * 86400
LENTO_MS = 6000
QUEDA = {"fora_do_ar", "nao_encontrado", "erro_servidor", "erro_http", "redirecionou",
         "indisponivel", "pagina_de_erro", "nao_e_o_funil", "chat_fora", "link_quebrado"}

# Links de SAÍDA do funil (o caminho depois da porta): o chat do Typebot e o
# checkout. Mídia (giphy, cloudinary, storage do Typebot) e pixel ficam de fora.
LINK_RE = re.compile(r"https?://[^\s\"'\\<>)]+")


def extrair_links(corpo):
    achados = set()
    for u in LINK_RE.findall(corpo):
        u = u.rstrip(".,;")
        p = urllib.parse.urlsplit(u)
        host, path = p.netloc.lower(), p.path
        if host == "chat.carimbostridi.com" and path.count("/") == 1 and len(path) > 1 and not path.startswith("/api"):
            achados.add(f"https://{host}{path}")
        elif host.startswith("checkout.") or host.startswith("seguro.") or host in ("wa.me", "api.whatsapp.com"):
            achados.add(u)
    return sorted(achados)[:20]

MODELO = """  - name: {nome}
    group: "Funis"
    token: {token}
    heartbeat: {{ interval: 30m }}
    alerts: [{{ type: custom }}]
"""


class _SemRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None  # queremos VER o 3xx, não segui-lo


def ler_json(caminho, padrao):
    try:
        with open(caminho) as f:
            return json.load(f)
    except Exception:
        return padrao


def gravar_json(caminho, dado):
    tmp = caminho + ".tmp"
    with open(tmp, "w") as f:
        json.dump(dado, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, caminho)


def examinar(url):
    """Abre o funil uma vez e diz o que ele É agora (tipo None = é o funil)."""
    t0 = time.time()
    loc = None
    try:
        r = urllib.request.build_opener(_SemRedirect).open(urllib.request.Request(url, headers=UA), timeout=20)
        status, corpo = r.status, r.read(800_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status, loc = e.code, e.headers.get("Location")
        try:
            corpo = e.read(200_000).decode("utf-8", "replace")
        except Exception:
            corpo = ""
    except Exception as e:
        return {"tipo": "fora_do_ar", "detalhe": f"Não respondeu ({type(e).__name__})", "ms": int((time.time() - t0) * 1000), "titulo": None}
    ms = int((time.time() - t0) * 1000)
    m = re.search(r"<title>([^<]*)</title>", corpo)
    titulo = m.group(1).strip() if m else None
    links = extrair_links(corpo) if status == 200 else []

    def res(tipo, detalhe=""):
        return {"tipo": tipo, "detalhe": detalhe, "ms": ms, "titulo": titulo, "links": links}

    if 300 <= status < 400:
        return res("redirecionou", f"Redirecionou pra {loc or 'outro endereço'}")
    if status in (404, 410):
        return res("nao_encontrado", f"Página não encontrada ({status})")
    if status >= 500:
        return res("erro_servidor", f"Erro {status} no servidor")
    if status >= 400:
        return res("erro_http", f"Erro {status}")
    if "Este link não está disponível" in corpo:
        return res("indisponivel", "O funil abriu dizendo que o link não está disponível")
    if "Application error" in corpo or "Internal Server Error" in corpo or "This page could not be found" in corpo:
        return res("pagina_de_erro", "Abriu uma página de erro no lugar do funil")
    if '\\"bot\\":{' not in corpo or '\\"fluxo\\"' not in corpo:
        return res("nao_e_o_funil", "Respondeu, mas a página não é o funil")
    if ms > LENTO_MS:
        return res("lento", f"Demorou {ms / 1000:.1f} s pra abrir".replace(".", ","))
    return res(None)


def carimbo(t):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def funis(cfg):
    lista = ler_json(LISTA, [])
    if not lista:
        print("sem lista de funis ainda", file=sys.stderr)
        return
    estado = ler_json(ESTADO, {"titulo": {}, "atual": {}, "eventos": []})
    estado.setdefault("links", {})
    caminho_ruim = ler_json(CAMINHO, {})
    agora = time.time()
    vistos = set()
    for f in lista:
        slug, url = f["slug"], f["url"]
        vistos.add(slug)
        r = examinar(url)
        if r["links"]:
            estado["links"][slug] = r["links"]
        # A porta abriu, mas o caminho depois dela (chat/checkout) está quebrado
        # na última rodada do `caminho`: pro cliente, o funil não funciona.
        if r["tipo"] not in QUEDA and caminho_ruim.get(slug):
            r["tipo"], r["detalhe"] = caminho_ruim[slug]["tipo"], caminho_ruim[slug]["detalhe"]
        tipo = r["tipo"]
        evento = lambda t, d: estado["eventos"].append({"ts": agora, "slug": slug, "tipo": t, "detalhe": d})
        if tipo in QUEDA:
            # Uma ocorrência por EPISÓDIO (entrou em queda ou trocou de tipo),
            # não uma a cada 10 min enquanto continua caído.
            if estado["atual"].get(slug) != tipo:
                evento(tipo, r["detalhe"])
            estado["atual"][slug] = tipo
        else:
            estado["atual"].pop(slug, None)
            if tipo == "lento":
                ult = [e for e in estado["eventos"] if e["slug"] == slug and e["tipo"] == "lento"]
                if not ult or agora - ult[-1]["ts"] > 3600:  # no máximo 1 por hora
                    evento("lento", r["detalhe"])
            # Mudança de conteúdo (changedetection): compara com a última versão
            # BOA, marca a diferença e adota a nova como referência.
            base = estado["titulo"].get(slug)
            if r["titulo"] and base and r["titulo"] != base:
                evento("mudou", f"Título mudou de “{base}” pra “{r['titulo']}”")
            if r["titulo"]:
                estado["titulo"][slug] = r["titulo"]
        empurrar(cfg, "Funis", slug, tipo not in QUEDA, r["detalhe"])

    estado["links"] = {k: v for k, v in estado["links"].items() if k in vistos}
    estado["eventos"] = [e for e in estado["eventos"] if agora - e["ts"] <= JANELA and e["slug"] in vistos][-600:]
    for k in list(estado["atual"]):
        if k not in vistos:
            estado["atual"].pop(k)
    gravar_json(ESTADO, estado)

    # Público: só slug, tipo, contagem e quando — nada do conteúdo da página.
    pub = {"atualizado": carimbo(agora), "funis": {}}
    for f in lista:
        s = f["slug"]
        evs = [e for e in estado["eventos"] if e["slug"] == s]
        por = {}
        for e in evs:
            por[e["tipo"]] = por.get(e["tipo"], 0) + 1
        pub["funis"][s] = {
            "atual": estado["atual"].get(s),
            "ocorrencias7d": len(evs),
            "porTipo": por,
            "ultimas": [{"em": carimbo(e["ts"]), "tipo": e["tipo"], "detalhe": e["detalhe"]} for e in evs[-5:]][::-1],
        }
    gravar_json(FLAGS, pub)
    caidos = [s for s in vistos if s in estado["atual"]]
    print(f"funis: {len(vistos)} vistos, {len(caidos)} fora")


# ── Foto ao vivo → Supabase (a cada 5 min) ──────────────────────────────────
# O Gaius não lê mais o Gatus pelo navegador (a API aberta entregava o nome de
# todo funil a qualquer um). Esta rodada lê o Gatus AQUI e manda a foto pra
# função status_registrar, que guarda o estado, abre/fecha incidente e conta
# a disponibilidade do dia. O Gaius lê o Supabase no servidor.
# Espelha `motivoDoErro` de lib/status-plataformas.ts. Domínio guardado na
# gaveta é o caso comum: registrado, DNS nunca apontado, e o Gatus devolve
# `dial tcp: lookup x: no such host`. Sem tradução a página mostraria isso do
# jeito que veio, e ninguém saberia que a correção é apontar o DNS (ou
# desmarcar "ativo" na ficha do domínio).
def _motivo_do_erro(erro):
    e = erro.lower()
    if "no such host" in e or "server misbehaving" in e or "name resolution" in e:
        return "O endereço não leva a lugar nenhum: falta apontar o DNS"
    if "connection refused" in e:
        return "O servidor recusou a conexão"
    if "certificate has expired" in e:
        return "O certificado HTTPS venceu"
    if "x509" in e or "tls:" in e:
        return "O certificado HTTPS não confere com o endereço"
    if "timeout" in e or "deadline exceeded" in e:
        return "Demorou demais pra responder"
    return erro[:160]


def _motivo(r):
    if r.get("errors"):
        return _motivo_do_erro(r["errors"][0])
    falhou = [c.get("condition", "") for c in r.get("conditionResults", []) if not c.get("success")]
    if any("CERTIFICATE_EXPIRATION" in c for c in falhou):
        return "O certificado HTTPS vence em menos de 14 dias"
    if any("DOMAIN_EXPIRATION" in c for c in falhou):
        return "O registro do domínio vence em menos de 30 dias"
    if any("indicator" in c for c in falhou):
        return "A página oficial marca instabilidade grave"
    if any(c.startswith("[STATUS]") for c in falhou):
        return f"Respondeu com erro {r.get('status')}" if r.get("status") else "Não respondeu"
    return "Falhou na última verificação"


def snapshot(cfg):
    auth = {}
    if cfg.get("GATUS_USER"):
        par = f"{cfg['GATUS_USER']}:{cfg['GATUS_PASS']}".encode()
        auth = {"Authorization": "Basic " + base64.b64encode(par).decode()}
    try:
        lista = json.loads(baixar(f"{GATUS}/api/v1/endpoints/statuses?page=1&pageSize=30", cabecalhos=auth))
    except Exception as e:
        print("gatus não respondeu; foto não enviada", e, file=sys.stderr)
        return
    atual = ler_json(ESTADO, {}).get("atual", {})
    itens = []
    for e in lista:
        rs = sorted(e.get("results") or [], key=lambda r: r.get("timestamp", ""))
        ult = rs[-1] if rs else None
        caiu = bool(ult) and not ult.get("success")
        slug = e.get("name") if e.get("group") == "Funis" else None
        itens.append({
            "key": e["key"], "nome": e.get("name"), "grupo": e.get("group"),
            "estado": "caiu" if caiu else "ok",
            "tipo": (atual.get(slug) if slug else None) if caiu else None,
            "motivo": _motivo(ult) if caiu else "",
            "ms": int(ult["duration"] / 1e6) if ult and ult.get("duration") else None,
            "verificado_em": ult.get("timestamp") if ult else None,
            "trilha": [1 if r.get("success") else 0 for r in rs[-30:]],
        })
    # Ocorrências dos funis (com os avisos: lento, conteúdo mudou) numa linha
    # interna — o Gaius lê daqui e o flags.json deixa de precisar ser público.
    itens.append({"key": "~ocorrencias", "nome": "ocorrências dos funis", "grupo": "_interno", "estado": "ok",
                  "motivo": json.dumps(ler_json(FLAGS, {}), ensure_ascii=False, separators=(",", ":"))})
    corpo = json.dumps({"p_token": cfg["STATUS_TOKEN"], "p_itens": itens}).encode()
    try:
        baixar(cfg["SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/status_registrar", dados=corpo, cabecalhos={
            "apikey": cfg["SUPABASE_ANON"], "Authorization": "Bearer " + cfg["SUPABASE_ANON"], "Content-Type": "application/json"})
    except Exception as e:
        print("supabase recusou a foto", e, file=sys.stderr)
        return
    print(f"snapshot: {len(itens)} itens")


# ── Caminho: o que vem DEPOIS da porta (1x por hora) ─────────────────────────
# Cada link de saída é aberto uma vez por rodada, mesmo que 10 funis usem o
# mesmo checkout. O chat do Typebot é testado pela PÁGINA, nunca pelo
# startChat: aquele abre uma sessão de verdade e inflaria os números do bot.
def testar_link(u):
    host = urllib.parse.urlsplit(u).netloc.lower()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20)  # segue redirect
        status, corpo = r.status, r.read(300_000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        status, corpo = e.code, ""
    except Exception as e:
        return f"não respondeu ({type(e).__name__})"
    if status >= 400:
        return f"respondeu com erro {status}"
    m = re.search(r"<title>([^<]*)</title>", corpo)
    titulo = (m.group(1) if m else "").strip()
    if host == "chat.carimbostridi.com" and (not titulo or "typebot" not in corpo):
        return "não existe mais no Typebot (apagado ou despublicado)"
    if "não existe" in titulo.lower() or titulo.lower().startswith("ops"):
        return f"abre dizendo “{titulo}”"
    return None


def encurtar(u):
    p = urllib.parse.urlsplit(u)
    return f"{p.netloc}{p.path}"[:60]


def caminho(cfg):
    links = ler_json(ESTADO, {}).get("links", {})
    testado = {}
    ruim = {}
    for slug, urls in links.items():
        problemas = []
        for u in urls:
            if u not in testado:
                testado[u] = testar_link(u)
            if testado[u]:
                problemas.append((u, testado[u]))
        if problemas:
            u, d = problemas[0]
            chat = "chat.carimbostridi.com" in u
            extra = f" (+{len(problemas) - 1} link)" if len(problemas) > 1 else ""
            # "Chat chat.carimbostridi.com/x: esse chat..." dizia "chat" duas vezes
            # e enterrava o nome do bot; o que a pessoa procura no builder é o nome.
            quem = f"O chat “{urllib.parse.urlsplit(u).path.strip('/')}”" if chat else f"O link de saída {encurtar(u)}"
            ruim[slug] = {"tipo": "chat_fora" if chat else "link_quebrado",
                          "detalhe": f"{quem} {d}{extra}"}
    gravar_json(CAMINHO, ruim)
    print(f"caminho: {len(testado)} links testados, {len(ruim)} funis com caminho quebrado")


# ── Domínios (1x por hora, junto do fluxos) ─────────────────────────────────
# "Os ativos são monitorados, inativos não" (pedido de 17/09/2026): quem manda
# é o interruptor "Domínio ativo" da ficha em Acessos & Infra, lido pela RPC
# status_dominios_ativos() — mais os endereços ligados dentro do produto.
#
# Aqui quem abre é o GATUS, não o coletor: sem seguir redirecionamento, a
# verificação é o handshake TLS e o primeiro status. Domínio que mora na Vercel
# custa o redirect, não a renderização da página — e a checagem responde à
# pergunta certa, que é sobre o ENDEREÇO (DNS apontado, certificado válido,
# alguém do outro lado), não sobre o conteúdo, que já tem cartão próprio.
MODELO_DOMINIO = """  - name: {nome}
    group: "Dominios"
    url: {url}
    interval: 15m
    client:
      ignore-redirect: true
      timeout: 20s
    conditions:
      - "[STATUS] < 400"
      - "[CERTIFICATE_EXPIRATION] > 336h"
    alerts: [{{ type: custom }}]
"""


def _rpc(cfg, nome):
    return json.loads(baixar(
        cfg["SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/" + nome,
        dados=b"{}",
        cabecalhos={
            "apikey": cfg["SUPABASE_ANON"],
            "Authorization": "Bearer " + cfg["SUPABASE_ANON"],
            "Content-Type": "application/json",
        },
    ))


def _gravar_config(destino, texto):
    """Só toca no arquivo quando o conteúdo mudou (o Gatus recarrega ao mudar)."""
    try:
        with open(destino) as f:
            if f.read() == texto:
                return False
    except FileNotFoundError:
        pass
    tmp = destino + ".tmp"
    with open(tmp, "w") as f:
        f.write(texto)
    os.replace(tmp, destino)
    return True


HOST_OK = re.compile(r"^[a-z0-9.-]+\.[a-z]{2,}$")


def dominios(cfg):
    try:
        lista = _rpc(cfg, "status_dominios_ativos")
    except Exception as e:
        print("lista de domínios falhou; mantendo a atual", e, file=sys.stderr)
        return
    if not isinstance(lista, list):
        print("resposta inesperada; mantendo a atual", lista, file=sys.stderr)
        return
    corpo = ["# GERADO pelo coletor.py (domínios ATIVOS no Acessos & Infra + os",
             "# ligados no produto). Não editar: a fonte é status_dominios_ativos().",
             "endpoints:"]
    vistos = set()
    for d in lista:
        host = str(d.get("host") or "").strip().lower()
        if not host or host in vistos or not HOST_OK.match(host):
            continue
        vistos.add(host)
        corpo.append(MODELO_DOMINIO.format(nome=json.dumps(host), url=json.dumps("https://" + host + "/")).rstrip("\n"))
    if len(corpo) == 3:
        corpo[2] = "endpoints: []"
    if _gravar_config(os.path.join(RAIZ, "config", "dominios.yaml"), "\n".join(corpo) + "\n"):
        print(f"dominios.yaml: {len(vistos)} domínios")


# ── Tutoriais (1x por hora, junto do fluxos) ────────────────────────────────
# O site de tutoriais tem cartão próprio porque o link dele está IMPRESSO em
# caixa e etiqueta: se /p/<slug> cai, o QR da caixa cai com ele. E o endereço
# pode estar de pé com a PÁGINA caída (central despublicada, slug renomeado),
# então o teste do domínio não responde a pergunta. Fonte:
# status_tutoriais_publicos() — endereço, central publicada e cada tutorial
# publicado.
#
# Ritmo diferente por tipo, de propósito: o ENDEREÇO segue em 15 min, como os
# outros domínios; o CAMINHO vai de hora em hora porque /p/... é
# `force-dynamic` (cada abertura é uma invocação na Vercel, e foi invocação que
# pausou o projeto em agosto). Tutorial quebrado não é emergência de minuto.
CAMINHO_OK = re.compile(r"^/p/[a-z0-9-]{1,120}(/[a-z0-9-]{1,120})?$")

MODELO_TUTORIAL = """  - name: {nome}
    group: "Tutoriais"
    url: {url}
    interval: {intervalo}
    client:
      ignore-redirect: true
      timeout: 20s
    conditions:
{condicoes}
    alerts: [{{ type: custom }}]
"""


def tutoriais(cfg):
    try:
        lista = _rpc(cfg, "status_tutoriais_publicos")
    except Exception as e:
        print("lista de tutoriais falhou; mantendo a atual", e, file=sys.stderr)
        return
    if not isinstance(lista, list):
        print("resposta inesperada; mantendo a atual", lista, file=sys.stderr)
        return
    corpo = ["# GERADO pelo coletor.py (site de tutoriais, central e cada tutorial",
             "# PUBLICADO). Não editar: a fonte é status_tutoriais_publicos().",
             "endpoints:"]
    vistos = set()
    for t in lista:
        host = str(t.get("host") or "").strip().lower()
        caminho = str(t.get("caminho") or "").strip()
        if not host or not HOST_OK.match(host):
            continue
        if caminho and not CAMINHO_OK.match(caminho):
            continue
        # Nome sem a barra da frente: a chave do Gatus troca "/" por "-" e
        # começar com barra deixaria a chave começando com "-".
        nome = caminho.lstrip("/") if caminho else host
        if (host, nome) in vistos:
            continue
        vistos.add((host, nome))
        endereco = not caminho
        corpo.append(MODELO_TUTORIAL.format(
            nome=json.dumps(nome),
            url=json.dumps("https://" + host + (caminho or "/")),
            intervalo="15m" if endereco else "1h",
            condicoes=('      - "[STATUS] < 400"\n      - "[CERTIFICATE_EXPIRATION] > 336h"'
                       if endereco else '      - "[STATUS] == 200"'),
        ).rstrip("\n"))
    if len(corpo) == 3:
        corpo[2] = "endpoints: []"
    if _gravar_config(os.path.join(RAIZ, "config", "tutoriais.yaml"), "\n".join(corpo) + "\n"):
        print(f"tutoriais.yaml: {len(vistos)} verificações")


def fluxos(cfg):
    try:
        bruto = baixar(
            cfg["SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/status_fluxos_ativos",
            dados=b"{}",
            cabecalhos={
                "apikey": cfg["SUPABASE_ANON"],
                "Authorization": "Bearer " + cfg["SUPABASE_ANON"],
                "Content-Type": "application/json",
            },
        )
        lista = json.loads(bruto)
    except Exception as e:
        print("lista de funis falhou; mantendo a atual", e, file=sys.stderr)
        return
    if not isinstance(lista, list):
        print("resposta inesperada; mantendo a atual", lista, file=sys.stderr)
        return
    corpo = ["# GERADO pelo coletor.py (funis com visita nos últimos 7 dias). Não editar.",
             "# Empurrados pelo `coletor.py funis` (o Gatus não abre os funis).", "external-endpoints:"]
    alvos = []
    for f in lista:
        slug = str(f.get("slug") or "").strip()
        if not slug:
            continue
        # Sem domínio = gedux (o Gaius redireciona /f/ pra lá desde 14/09).
        host = str(f.get("host") or "").strip() or "gedux.com.br"
        alvos.append({"slug": slug, "url": f"https://{host}/f/{slug}"})
        # json.dumps gera string entre aspas, que também é YAML válido.
        corpo.append(MODELO.format(nome=json.dumps(slug), token=json.dumps(cfg["GATUS_TOKEN"])).rstrip("\n"))
    if len(corpo) == 3:
        corpo[2] = "external-endpoints: []"
    gravar_json(LISTA, alvos)
    texto = "\n".join(corpo) + "\n"
    destino = os.path.join(RAIZ, "config", "fluxos.yaml")
    try:
        with open(destino) as f:
            if f.read() == texto:
                return  # nada mudou: não mexe no arquivo, o Gatus não recarrega
    except FileNotFoundError:
        pass
    tmp = destino + ".tmp"
    with open(tmp, "w") as f:
        f.write(texto)
    os.replace(tmp, destino)
    print(f"fluxos.yaml: {len(corpo) - 2} funis")


if __name__ == "__main__":
    c = env()
    modo = sys.argv[1] if len(sys.argv) > 1 else "terceiros"
    if modo == "fluxos":
        fluxos(c)
        dominios(c)
        tutoriais(c)
    elif modo == "dominios":
        dominios(c)
    elif modo == "tutoriais":
        tutoriais(c)
    elif modo == "funis":
        funis(c)
    elif modo == "caminho":
        caminho(c)
    elif modo == "snapshot":
        snapshot(c)
    else:
        meta(c)
        aws(c)
        hostinger(c)
