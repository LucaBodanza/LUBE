#!/usr/bin/env python3
"""ELSAP DSGN · News — PROVA DELLE FONTI (una volta sola, dal server GitHub).
Per ogni indirizzo di fonti_news.json: risposta, peso, titolo, quanti link e quanto testo vero ci sono,
e se la pagina sembra bloccata (captcha, accesso negato) o fatta solo di JavaScript (testo quasi vuoto).
Scrive _strumenti/prova_fonti_esito.json e il riepilogo dell'Action. Una richiesta per indirizzo, 3 s di pausa tra una e l'altra."""
import json, re, time, os, urllib.request, urllib.error, html
QUI = os.path.dirname(os.path.abspath(__file__))
F = json.load(open(os.path.join(QUI, "fonti_news.json"), encoding="utf-8"))["fonti"]
UA = "Mozilla/5.0 (compatible; ELSAP-DSGN-news/1.0; +https://lucabodanza.github.io/LUBE/)"
BLOCCO = re.compile(r"captcha|access denied|are you a robot|cf-chl|just a moment|forbidden|attention required|bot detection|incapsula|akamai", re.I)
out = []
for f in F:
    r = {"marchio": f["marchio"], "tipo": f["tipo"], "url": f["url"], "cat": f.get("cat")}
    t0 = time.time()
    try:
        req = urllib.request.Request(f["url"], headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/rss+xml,*/*;q=0.8", "Accept-Language": "en,it;q=0.8"})
        with urllib.request.urlopen(req, timeout=25) as h:
            b = h.read(4_000_000); r.update(stato=h.status, finale=h.geturl(), tipo_cont=h.headers.get("Content-Type", ""),
                                            etag=bool(h.headers.get("ETag")), lastmod=bool(h.headers.get("Last-Modified")))
    except urllib.error.HTTPError as e:
        b = e.read(200_000) if hasattr(e, "read") else b""; r.update(stato=e.code, errore=str(e.reason))
    except Exception as e:
        b = b""; r.update(stato=0, errore=f"{type(e).__name__}: {e}")
    s = b.decode("utf-8", "replace")
    testo = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", s)))).strip()
    tit = re.search(r"(?is)<title[^>]*>(.*?)</title>", s)
    r.update(ms=int((time.time() - t0) * 1000), kb=round(len(b) / 1024, 1), titolo=html.unescape(tit.group(1)).strip()[:120] if tit else "",
             link=len(re.findall(r"<a\s[^>]*href=", s, re.I)), item_rss=len(re.findall(r"<item[\s>]", s, re.I)), parole=len(testo.split()),
             bloccato=bool(BLOCCO.search(s[:20000])) and len(testo.split()) < 400)
    r["giudizio"] = ("ERRORE" if not r.get("stato") or r["stato"] >= 400 else "BLOCCATO" if r["bloccato"] else
                     "SOLO JS?" if r["parole"] < 120 and not r["item_rss"] else "OK")
    out.append(r); print(f'{r["giudizio"]:9} {r.get("stato")} {r["kb"]:>7} KB {r["parole"]:>6} parole {r["link"]:>4} link  {f["marchio"]:18} {f["url"]}')
    time.sleep(3)
json.dump({"quando": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "esito": out}, open(os.path.join(QUI, "prova_fonti_esito.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as S:
    S.write("| esito | marchio | tipo | stato | KB | parole | link | url |\n|---|---|---|---|---|---|---|---|\n")
    for r in out: S.write(f'| {r["giudizio"]} | {r["marchio"]} | {r["tipo"]} | {r.get("stato")} | {r["kb"]} | {r["parole"]} | {r["link"]} | {r["url"]} |\n')
