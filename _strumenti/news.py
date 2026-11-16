#!/usr/bin/env python3
"""ELSAP DSGN · News — sorveglia i siti dei produttori (lo esegue GitHub Actions, vedi .github/workflows/news.yml).

  python3 news.py orario   ogni ora: news, feed RSS e pagina principale di ogni famiglia (≈ 20 richieste)
  python3 news.py notte    una volta al giorno: entra nelle famiglie (taglie, sottofamiglie, pagine successive)
  python3 news.py prova    fa entrambi SENZA salvare lo stato: scrive _strumenti/news_prova.json per controllare cosa estrae

Fonti: _strumenti/fonti_news.json. Stato (elenchi già visti): _strumenti/news_stato.json.
Uscita per l'app: dati/news.json CIFRATO come il resto dei dati (segreto ELSAP_CHIAVE; senza chiave → in chiaro solo in prova).
Regole di cortesia: un solo giro per volta, pausa tra richieste allo stesso sito, si ferma su 429/503, nome del bot dichiarato.
Tipi di fonte (fonti_news.json): rss · news (elenco notizie) · famiglia (pagina con sotto-pagine) · sitemap (elenco da sitemap XML/.gz,
        per i siti che caricano i prodotti con JavaScript). Opzioni: cat, schema, pausa (crawl-delay), sito, segmenti, indice, attiva:false.
Eventi: comunicato (notizia nuova) · nuovo (prodotto/variante comparso) · tolto (sparito per 3 controlli di fila)
        · cambiato (titolo della famiglia cambiato) · famiglia (pagina spostata o non più raggiungibile).
Il primo giro di ogni fonte fa solo la "fotografia" iniziale: nessun evento, tranne le ultime notizie già pubblicate.
"""
import sys, os, re, json, time, html, hashlib, hmac, base64, datetime, zlib, urllib.request, urllib.error
from urllib.parse import urljoin, urlsplit, urlunsplit

QUI = os.path.dirname(os.path.abspath(__file__))
SITO = os.environ.get("SITO", os.path.dirname(QUI))
MODO = sys.argv[1] if len(sys.argv) > 1 else "prova"
UA = "Mozilla/5.0 (compatible; ELSAP-DSGN-news/1.0; +https://lucabodanza.github.io/LUBE/)"
PAUSA = 3                     # secondi tra due richieste allo stesso sito
MAX_PAGINE_NOTTE = 30         # per fonte, solo nel giro di notte
SOGLIA_TOLTO = 3              # controlli consecutivi senza l'elemento prima di dirlo "tolto"
SOGLIA_ERRORE = 3             # giri consecutivi in errore prima di segnalare la famiglia
MAX_GIORNI = 365              # quanto tempo si conserva un evento (12 mesi: è la risposta alla domanda di Michele)
MAX_EVENTI = 5000             # tetto di sicurezza (~1,5 MB)
TIPO_IT = {"nuovo": "nuovo prodotto", "tolto": "non più a catalogo", "cambiato": "famiglia rinominata", "famiglia": "pagina famiglia", "comunicato": "comunicato", "fonte": "fonte"}
ADESSO = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()

_F = json.load(open(os.path.join(QUI, "fonti_news.json"), encoding="utf-8"))
FONTI = [f for f in _F["fonti"] if f.get("attiva") is not False]        # "attiva": false = fonte sospesa (il motivo sta in "sospese")
STATO_F = os.environ.get("STATO_NEWS") or os.path.join(QUI, "news_stato.json")     # nel workflow sta nel ramo news-dati, non su main
STATO = json.load(open(STATO_F, encoding="utf-8")) if os.path.exists(STATO_F) and MODO != "prova" else {"fonti": {}, "eventi": []}

# ---------------------------------------------------------------- rete
ULTIMO, FERMI, PAUSA_HOST, CACHE = {}, set(), {}, {}
def scarica(url, cache=False):
    """una richiesta cortese: pausa per sito (PAUSA o il crawl-delay dichiarato dal sito), stop su 429/503, legge anche i .gz.
    cache=True: se lo stesso indirizzo è già stato letto in questo giro (es. la sitemap di Belden usata da 6 fonti) non lo richiede."""
    if cache and url in CACHE: return CACHE[url]
    host = urlsplit(url).netloc
    if host in FERMI: return None, "sito in pausa (troppe richieste)"
    att = ULTIMO.get(host, 0) + max(PAUSA, PAUSA_HOST.get(host, 0)) - time.time()
    if att > 0: time.sleep(att)
    ULTIMO[host] = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en,it;q=0.8,de;q=0.6",
                                                   "Accept": "text/html,application/xhtml+xml,application/rss+xml,application/xml,*/*;q=0.8"})
        with urllib.request.urlopen(req, timeout=25) as h:
            raw = h.read(8_000_000)
            if raw[:2] == b"\x1f\x8b": raw = zlib.decompressobj(31).decompress(raw, 30_000_000)      # .xml.gz (limite anti "bomba")
            res = ({"url": h.geturl(), "stato": h.status, "testo": raw.decode("utf-8", "replace")}, None)
    except urllib.error.HTTPError as e:
        if e.code in (429, 503): FERMI.add(host)
        res = ({"url": url, "stato": e.code, "testo": ""}, f"HTTP {e.code}")
    except Exception as e:
        res = (None, f"{type(e).__name__}: {str(e)[:120]}")
    if cache: CACHE[url] = res
    return res

# ---------------------------------------------------------------- estrazione
pulisci = lambda t: re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"(?is)<(style|script|svg|noscript)\b.*?</\1>", " ", t or "")))).strip()
GENERICO = re.compile(r"^(product detail|details?|read more|learn more|more|mehr|weiterlesen|view|view details?|scopri|dettagli|>|›|→)$", re.I)
def titolo_pagina(s):
    m = re.search(r"(?is)<title[^>]*>(.*?)</title>", s)
    return re.split(r"\s+[|–-]\s+(?=[^|–-]*$)", pulisci(m.group(1)))[0][:140] if m else ""
def senza_query(u):
    p = urlsplit(u); return urlunsplit((p.scheme, p.netloc, p.path.rstrip("/") or "/", "", ""))
def nome_da_url(u):
    seg = [x for x in urlsplit(u).path.split("/") if x][-1:] or ["?"]
    t = re.sub(r"\.html?$", "", seg[0])
    return t.upper() if re.search(r"\d", t) else re.sub(r"[-_.]+", " ", t).strip()
def link(s, base):
    """[(url assoluto senza frammento, testo)] della pagina, senza menu ripetuti uguali"""
    out = {}
    for m in re.finditer(r'(?is)<a\b[^>]*?href\s*=\s*["\']([^"\'#]+)[^>]*>(.*?)</a>', s):
        u = urljoin(base, html.unescape(m.group(1)).strip())
        if not u.startswith("http"): continue
        t = pulisci(m.group(2))
        if not t:
            a = re.search(r'(?:title|aria-label|alt)\s*=\s*["\']([^"\']+)', m.group(0)); t = html.unescape(a.group(1)).strip() if a else ""
        if GENERICO.match(t): t = ""
        if len(t) > len(out.get(u, "")): out[u] = t[:160]
        else: out.setdefault(u, t[:160])
    return list(out.items())
def figli(s, base, schema=None):
    """elementi = link "sotto" la pagina (stesso sito, percorso che continua quello della pagina) o che rispettano lo schema"""
    b = urlsplit(base); radice = b.path.rstrip("/") + "/"
    el = {}
    for u, t in link(s, base):
        p = urlsplit(u)
        if p.netloc != b.netloc: continue
        ok = re.search(schema, p.path) if schema else (p.path.startswith(radice) and len(p.path) > len(radice))
        if not ok: continue
        k = senza_query(u)
        if k == senza_query(base): continue
        el[k] = el.get(k) if len(el.get(k, "")) >= len(t) else t
    return {k: (v or nome_da_url(k)) for k, v in el.items()}
def sezioni(s, base):
    """ripiego per le pagine senza sotto-pagine: i titoli h2/h3/h4 del contenuto (tolti menu e piè di pagina)"""
    s = re.sub(r"(?is)<(header|footer|nav|aside)\b.*?</\1>", " ", s)
    el = {}
    for m in re.finditer(r"(?is)<h[2-4][^>]*>(.*?)</h[2-4]>", s):
        t = pulisci(m.group(1))
        if 2 < len(t) < 120 and not re.search(r"cookie|newsletter|subscribe|contact|quick links|follow us|privacy", t, re.I):
            el[f"{senza_query(base)}#{re.sub(r'[^a-z0-9]+', '-', t.lower()).strip('-')}"] = t
    return el
def pagine_successive(s, base):
    """paginazione: stessa pagina con ?…page… diverso"""
    b = senza_query(base)
    return sorted({u for u, _ in link(s, base) if senza_query(u) == b and re.search(r"page|seite|p=\d", urlsplit(u).query, re.I)})
def rss(s):
    it = []
    for m in re.finditer(r"(?is)<item\b.*?</item>", s):
        x = m.group(0)
        g = lambda tag: pulisci((re.search(fr"(?is)<{tag}[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{tag}>", x) or [None, ""])[1])
        data = g("pubDate")
        try: data = datetime.datetime.strptime(data[:25].strip(), "%a, %d %b %Y %H:%M:%S").replace(tzinfo=datetime.timezone.utc).isoformat()
        except Exception: data = None
        if g("link"): it.append({"url": g("link"), "titolo": g("title")[:160], "data": data, "testo": g("description")[:240]})
    return it
def sitemap(url, indice=None, livello=0):
    """[url] di una sitemap XML (anche .gz o indice di sitemap: `indice` = regex delle sotto-sitemap da leggere) · (None, errore) se non si legge"""
    r, err = scarica(url, cache=True)
    if not r or r["stato"] >= 400: return None, err or f'HTTP {r["stato"]}'
    locs = [html.unescape(x.strip()) for x in re.findall(r"(?is)<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>", r["testo"])]
    if re.search(r"(?i)<sitemapindex", r["testo"]):
        if livello >= 2: return [], None
        out = []
        for s in locs[:40]:
            if indice and not re.search(indice, s): continue
            sub, e = sitemap(s, indice, livello + 1)
            if sub is None: return None, e
            out += sub
        return out, None
    return locs, None

# ---------------------------------------------------------------- eventi
EVENTI = []
def evento(f, tipo, titolo, url=None, **extra):
    e = {"quando": ADESSO, "tipo": tipo, "marchio": f["marchio"], "cat": f.get("cat"), "titolo": titolo, "url": url, "fonte": f["url"], **extra}
    e["id"] = hashlib.sha1(f'{tipo}|{f["url"]}|{url}|{titolo}|{extra.get("da", "")}'.encode()).hexdigest()[:12]
    EVENTI.append(e)

def confronta(f, st, chiave, nuovi, iniziale):
    """nuovi = {url: titolo}; st[chiave] = {url: {"t": titolo, "assente": n}}"""
    vecchi = st.setdefault(chiave, {})
    if iniziale or not vecchi:
        st[chiave] = {u: {"t": t, "assente": 0} for u, t in nuovi.items()}; return
    # Se sparisce più di metà dell'elenco in un colpo, quasi sempre è la pagina a essere rotta (non i prodotti tolti):
    # non conto le assenze. Se dura 6 giri di fila lo accetto come nuovo elenco, senza eventi.
    if len(vecchi) >= 10 and sum(u not in nuovi for u in vecchi) > len(vecchi) / 2:
        st["g_" + chiave] = st.get("g_" + chiave, 0) + 1
        if st["g_" + chiave] >= 6: st[chiave] = {u: {"t": t, "assente": 0} for u, t in nuovi.items()}; st.pop("g_" + chiave, None)
        return
    st.pop("g_" + chiave, None)
    for u, t in nuovi.items():
        if u not in vecchi: evento(f, "nuovo", t, u)
        vecchi[u] = {"t": t, "assente": 0}
    for u in list(vecchi):
        if u in nuovi: continue
        vecchi[u]["assente"] = vecchi[u].get("assente", 0) + 1
        if vecchi[u]["assente"] >= SOGLIA_TOLTO:
            evento(f, "tolto", vecchi[u]["t"], u); del vecchi[u]

def salute(st, f, ok, msg=None):
    if ok:
        if st.get("errore_dal"):
            if st.get("segnalato"): evento(f, "famiglia" if f["tipo"] in ("famiglia", "sitemap") else "fonte", "Pagina di nuovo raggiungibile", f["url"])
            st.pop("errore_dal", None); st.pop("errori", None); st.pop("segnalato", None)
        return
    st.setdefault("errore_dal", ADESSO); st["errori"] = st.get("errori", 0) + 1; st["msg"] = msg
    if st["errori"] >= SOGLIA_ERRORE and not st.get("segnalato"):
        st["segnalato"] = True
        fam = f["tipo"] in ("famiglia", "sitemap")
        evento(f, "famiglia" if fam else "fonte", f"Pagina non più raggiungibile ({msg})" if fam else f"Fonte non raggiungibile ({msg})", f["url"])

PROVA = []
chiave = lambda f: f.get("id") or f["url"]              # chiave dello stato: più fonti possono leggere la stessa sitemap (servono id diversi)
def giro_sitemap(f, st, iniziale):
    """famiglia letta da una sitemap: elementi = indirizzi che rispettano `schema` (regex sul percorso).
    `segmenti`: quanti pezzi finali del percorso formano il nome (es. 2 → «serie · codice»). `sito`: host canonico degli indirizzi."""
    rep = {"marchio": f["marchio"], "tipo": f["tipo"], "url": f["url"], "cat": f.get("cat")}
    urls, err = sitemap(f["url"], f.get("indice"))
    if urls is None:
        salute(st, f, False, err); PROVA.append({**rep, "errore": err}); return
    host = urlsplit(f.get("sito") or f["url"]).netloc
    el = {}
    for u in urls:
        p = urlsplit(u)
        if not re.search(f["schema"], p.path): continue
        k = urlunsplit(("https", host, p.path.rstrip("/") or "/", "", ""))
        seg = [x for x in p.path.split("/") if x][-f.get("segmenti", 1):]
        el[k] = " · ".join(nome_da_url("/" + s) for s in seg)
    el.pop(urlunsplit(("https", host, urlsplit(f.get("radice", "")).path.rstrip("/") or "/", "", "")), None)
    if not el:                                               # sitemap letta ma vuota per questo schema: è un guasto, non "tutto tolto"
        salute(st, f, False, "sitemap senza elementi per questo schema"); PROVA.append({**rep, "errore": "nessun elemento"}); return
    salute(st, f, True)
    rep["livello0"] = len(el); rep["esempi"] = list(el.items())[:8]
    confronta(f, st, "lv0", el, iniziale)
    st["visto"] = st.get("visto") or ADESSO
    PROVA.append(rep)

def giro(f, notte):
    if f.get("pausa"): PAUSA_HOST[urlsplit(f["url"]).netloc] = f["pausa"]   # crawl-delay dichiarato dal sito
    st = STATO["fonti"].setdefault(chiave(f), {})
    iniziale = not st.get("visto")
    if f["tipo"] == "sitemap": return giro_sitemap(f, st, iniziale)
    r, err = scarica(f["url"])
    if not r or r["stato"] >= 400:
        salute(st, f, False, err or f'HTTP {r["stato"]}'); PROVA.append({"url": f["url"], "errore": err}); return
    salute(st, f, True)
    s, rep = r["testo"], {"marchio": f["marchio"], "tipo": f["tipo"], "url": f["url"], "cat": f.get("cat")}
    tit = titolo_pagina(s)
    if f["tipo"] == "famiglia":
        if st.get("titolo") and tit and tit != st["titolo"]: evento(f, "cambiato", tit, f["url"], da=st["titolo"])
        if senza_query(r["url"]) != senza_query(f["url"]) and senza_query(r["url"]) != st.get("finale"):
            if st.get("finale") is not None or not iniziale: evento(f, "famiglia", f"La pagina della famiglia ora porta a {r['url']}", r["url"])
        st["finale"] = senza_query(r["url"]); st["titolo"] = tit or st.get("titolo")
    if f["tipo"] == "rss":
        it = rss(s); rep["elementi"] = len(it); rep["esempi"] = it[:5]
        visti = set(st.get("visti", []))
        for x in (it[:6] if iniziale else it):
            if x["url"] not in visti: evento(f, "comunicato", x["titolo"], x["url"], data=x["data"], testo=x["testo"], iniziale=iniziale)
        st["visti"] = sorted(visti | {x["url"] for x in it})[-500:]
    elif f["tipo"] == "news":
        el = figli(s, r["url"], f.get("schema")); rep["elementi"] = len(el); rep["esempi"] = list(el.items())[:8]
        visti = set(st.get("visti", []))
        for u, t in (list(el.items())[:6] if iniziale else el.items()):
            if u not in visti: evento(f, "comunicato", t, u, iniziale=iniziale)
        st["visti"] = sorted(visti | set(el))[-500:]
    else:                                                    # famiglia
        el = figli(s, r["url"], f.get("schema"))
        if not el: el = sezioni(s, r["url"]); rep["solo_sezioni"] = True; notte = False
        rep["livello0"] = len(el); rep["esempi"] = list(el.items())[:8]
        confronta(f, st, "lv0", el, iniziale)
        if notte:
            tutti, coda, fatte = dict(el), pagine_successive(s, r["url"]) + list(el), {senza_query(r["url"])}
            while coda and len(fatte) < MAX_PAGINE_NOTTE:
                u = coda.pop(0)
                if senza_query(u) in fatte and "?" not in u: continue
                fatte.add(senza_query(u) if "?" not in u else u)
                rr, e2 = scarica(u)
                if not rr or rr["stato"] >= 400: continue
                for k, v in figli(rr["testo"], rr["url"], f.get("schema")).items():
                    if k not in tutti: tutti[k] = v
                if senza_query(u) == senza_query(r["url"]):          # pagina successiva della stessa famiglia: anche la sua paginazione
                    coda += [p for p in pagine_successive(rr["testo"], rr["url"]) if p not in coda and p not in fatte]
            rep["profondo"] = len(tutti); rep["pagine_lette"] = len(fatte)
            rep["esempi_profondi"] = [x for x in tutti.items() if x[0] not in el][:8]
            confronta(f, st, "deep", tutti, iniziale or not st.get("deep"))
    st["visto"] = st.get("visto") or ADESSO
    PROVA.append(rep)

# ---------------------------------------------------------------- cifratura (come build_pwa.py / carica.py)
def cifra(rel, dati):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    KEY = base64.b64decode(os.environ["ELSAP_CHIAVE"].strip()); A = AESGCM(KEY); C = 1 << 18
    nonce = hmac.new(KEY, rel.encode() + hashlib.sha256(dati).digest(), "sha256").digest()[:8]
    parti = [b"ELSAPEC1" + C.to_bytes(4, "big") + len(dati).to_bytes(8, "big") + nonce + bytes(4)]
    for i in range(0, max(1, -(-len(dati) // C))) if dati else []:
        parti.append(A.encrypt(nonce + i.to_bytes(4, "big"), dati[i * C:(i + 1) * C], None))
    return b"".join(parti)

def conserva(eventi):
    """toglie gli eventi più vecchi di MAX_GIORNI (conta la data della notizia, se c'è, altrimenti il momento in cui l'abbiamo visto) e tiene il tetto"""
    limite = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=MAX_GIORNI)).isoformat()
    def quando(e):
        d = e.get("data") or e["quando"]
        try: return datetime.datetime.fromisoformat(d).astimezone(datetime.timezone.utc).isoformat()
        except Exception: return e["quando"]
    return [e for e in eventi if quando(e) >= limite][:MAX_EVENTI]

def scrivi_uscita():
    ev = conserva(EVENTI + STATO.get("eventi", []))
    STATO["eventi"] = ev
    marchi = {}
    for f in FONTI:
        m = marchi.setdefault(f["marchio"], {"nome": f["marchio"], "sito": "https://" + urlsplit(f["url"]).netloc, "fonti": 0, "in_errore": 0})
        m["fonti"] += 1; m["in_errore"] += bool(STATO["fonti"].get(chiave(f), {}).get("segnalato"))
    out = {"versione": 1, "aggiornato": ev[0]["quando"] if ev else None, "marchi": list(marchi.values()),
           "fonti": [{"marchio": f["marchio"], "tipo": f["tipo"], "cat": f.get("cat"), "url": f["url"],
                      "errore": STATO["fonti"].get(chiave(f), {}).get("msg") if STATO["fonti"].get(chiave(f), {}).get("errore_dal") else None} for f in FONTI],
           "eventi": ev}
    dati = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode()
    p = os.path.join(SITO, "dati", "news.json")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "wb").write(cifra("dati/news.json", dati))
    json.dump(STATO, open(STATO_F, "w", encoding="utf-8"), ensure_ascii=False, indent=0, sort_keys=True)

if __name__ == "__main__":
    notte = MODO in ("notte", "prova")
    for f in FONTI:
        try: giro(f, notte)
        except Exception as e: PROVA.append({"url": f["url"], "eccezione": f"{type(e).__name__}: {e}"})
    nuovi = [e for e in EVENTI if not e.get("iniziale")]
    print(f"{MODO}: {len(FONTI)} fonti · {len(EVENTI)} eventi ({len(nuovi)} nuovi)")
    for e in EVENTI[:40]: print(f'  {e["tipo"]:10} {e["marchio"]:18} {e["titolo"][:70]}')
    if MODO == "prova":
        json.dump({"quando": ADESSO, "fonti": PROVA, "eventi": EVENTI}, open(os.path.join(QUI, "news_prova.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    else:
        scrivi_uscita()
    if os.environ.get("NOVITA_FILE") and nuovi and MODO != "prova":       # testo dell'avviso email (lo spedisce avvisa.py)
        righe = [f'• {e["marchio"]} — {TIPO_IT.get(e["tipo"], e["tipo"])}: {e["titolo"]}' + (f'\n  {e["url"]}' if e.get("url") else "") for e in nuovi[:40]]
        open(os.environ["NOVITA_FILE"], "w", encoding="utf-8").write(f"{len(nuovi)} novità dai produttori:\n\n" + "\n".join(righe) + ("\n\n…e altre: vedi la sezione News dell'app." if len(nuovi) > 40 else "\n\nDettagli nella sezione News dell'app ELSAP DSGN."))
    with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as S:
        S.write(f"### News · {MODO}\n{len(FONTI)} fonti · {len(nuovi)} novità\n\n" + "".join(f'- **{e["tipo"]}** {e["marchio"]}: {e["titolo"]}\n' for e in nuovi[:50]))
