#!/usr/bin/env python3
"""ELSAP DSGN — prepara i dati dei cataloghi per l'app.

Per ogni catalogo dell'elenco (cataloghi_elsap.json) parte dal PDF finale e produce, in <uscita>/cat/<slug>/:
  Catalogo_NN_Nome.pdf   il catalogo completo (unito, se è fatto di più PDF)
  copertina.jpg          la prima pagina
  Sotto-cataloghi/*.pdf  le parti (file già pronti, oppure ricavate dai segnalibri del PDF)
  html/img/*.jpg         la prima pagina di ogni parte
  ricerca.json           codice articolo → pagine, per il catalogo e per ogni parte
  catalogo.json          la scheda che legge l'app
e alla fine <uscita>/cataloghi.json con l'elenco completo (anche i cataloghi non ancora pronti, segnati "in arrivo").

  python3 prepara.py <cataloghi_elsap.json> <uscita> [numero ...] [--forza]

Servono: python3 con pypdf, e i programmi qpdf, pdftotext, pdftoppm (poppler). I file di partenza non vengono mai modificati.
"""
import sys, os, re, json, shutil, subprocess, datetime, tempfile, time
from pathlib import Path
from pypdf import PdfReader

args = [a for a in sys.argv[1:] if not a.startswith("--")]
FORZA = "--forza" in sys.argv
CFG_FILE, OUT = Path(args[0]), Path(args[1])
SOLO = {int(a) for a in args[2:]}
CFG = json.load(open(CFG_FILE, encoding="utf-8"))
def _radice(v):                               # più percorsi possibili (Mac, ambiente di Claude): vale il primo che esiste
    L = [Path(os.path.expandvars(os.path.expanduser(x))) for x in (v if isinstance(v, list) else [v])]
    return next((x for x in L if x.exists()), L[0])


RADICI = {k: _radice(v) for k, v in CFG["radici"].items()}


def percorso(p):
    """'SERIE:07_.../x.pdf' → percorso vero. Senza prefisso: accanto all'elenco."""
    if ":" in p and p.split(":", 1)[0] in RADICI:
        k, r = p.split(":", 1)
        return RADICI[k] / r
    return CFG_FILE.parent / p


def run(*cmd):
    r = subprocess.run([str(c) for c in cmd], capture_output=True)
    if r.returncode not in (0, 3):          # qpdf: 3 = riuscito con avvisi
        raise RuntimeError(f"{cmd[0]}: {r.stderr.decode('utf-8', 'replace')[:400]}")
    return r.stdout


def pulito(t):
    return re.sub(r"[^\w.-]+", "_", t, flags=re.UNICODE).strip("_")[:70] or "parte"


def segnalibri(pdf):
    """Segnalibri del PDF come elenco piatto [{titolo, pagina, livello}], in ordine."""
    out = []
    try:
        r = PdfReader(str(pdf))

        def giro(voci, liv):
            for v in voci:
                if isinstance(v, list):
                    giro(v, liv + 1)
                    continue
                try:
                    n = r.get_destination_page_number(v) + 1
                except Exception:
                    continue
                t = re.sub(r"\s+", " ", str(v.title or "")).strip()
                if t and n > 0:
                    out.append({"titolo": t, "pagina": n, "livello": liv})
        giro(r.outline, 1)
    except Exception as e:
        print("   (segnalibri non leggibili:", e, ")")
    return out


def pagine(pdf):
    return len(PdfReader(str(pdf)).pages)


COD = re.compile(r"^[A-Z0-9][A-Z0-9\-_./+]{4,39}$")


def codici_per_pagina(pdf):
    """[insieme dei codici della pagina 1, della pagina 2, …] — i codici articolo sono parole in maiuscolo con almeno una cifra."""
    testo = run("pdftotext", "-layout", "-enc", "UTF-8", pdf, "-").decode("utf-8", "replace")
    out = []
    for pag in testo.split("\f"):
        s = set()
        # codici Amphenol a gruppi ("C016 10K006 000 10"): anche uniti, così la ricerca li trova scritti in ogni modo (19/10/2026)
        for m in re.finditer(r"\b([A-Z]\d{3}) (\d{2}[A-Z]\d{3}) (\d{3}) (\d{2})\b", pag):
            s.add("".join(m.groups()))
        for w in pag.split():
            w = w.strip(".,;:()[]•·|")
            if not COD.match(w) or not any(c.isdigit() for c in w):
                continue
            lettere = sum(c.isalpha() for c in w)
            if lettere == 0 and len(re.sub(r"\D", "", w)) < 6:      # numeri corti: misure, non codici
                continue
            if re.fullmatch(r"\d+([.,/-]\d+)*", w) and len(w) < 7:
                continue
            if re.fullmatch(r"(IP\d{2}K?|M\d{1,2}|\d+V|\d+A|\d+MM|\d+X\d+|\d+POLI|ISO\d+|EN\d+|IEC\d+|UL\d+|\d+AWG|AWG\d+)", w):
                continue
            s.add(w)
        out.append(s)
    if out and not out[-1]:
        out.pop()
    return out


def indice_ricerca(per_pagina, da=1, a=None):
    """codice → pagine (numerate da 1 dentro l'intervallo)."""
    a = a or len(per_pagina)
    idx = {}
    for n in range(da, a + 1):
        for c in per_pagina[n - 1] if n - 1 < len(per_pagina) else ():
            idx.setdefault(c, []).append(n - da + 1)
    return {c: p[:40] for c, p in sorted(idx.items()) if len(p) <= 60}     # una "parola" su 60+ pagine è un'intestazione, non un codice


def miniatura(pdf, pag, dst, lato):
    with tempfile.TemporaryDirectory() as t:
        run("pdftoppm", "-f", pag, "-l", pag, "-jpeg", "-jpegopt", "quality=82", "-scale-to", lato, pdf, Path(t) / "p")
        f = sorted(Path(t).glob("p*.jpg"))[0]
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(f), str(dst))


def prepara(c):
    slug = c["slug"]
    d = OUT / "cat" / slug
    fonti = [percorso(p) for p in ([c["pdf"]] if isinstance(c.get("pdf"), str) else (c.get("pdf") or []))]
    manca = [str(f) for f in fonti if not f.exists()]
    if manca or not fonti:
        print(f"{c['numero']:02d} {c['nome']}: PDF non ancora disponibile → in arrivo")
        return None
    sp = c.get("sotto") or {}
    impronta = json.dumps([c, [(str(f), f.stat().st_size, int(f.stat().st_mtime)) for f in fonti] +
                           [(v["file"], percorso(v["file"]).stat().st_size) for v in sp.get("voci", []) if percorso(v["file"]).exists()]], sort_keys=True, ensure_ascii=False)
    if not FORZA and (d / "catalogo.json").exists():
        m = json.load(open(d / "catalogo.json", encoding="utf-8"))
        if m.get("_impronta") == impronta:
            print(f"{c['numero']:02d} {c['nome']}: già pronto")
            return m
    print(f"{c['numero']:02d} {c['nome']}: preparo…", flush=True)
    tmp = Path(tempfile.mkdtemp(prefix="elsap_")) / slug       # lavoro su disco locale, poi copio il risultato
    (tmp / "Sotto-cataloghi").mkdir(parents=True)
    (tmp / "html" / "img").mkdir(parents=True)
    nome_file = f"Catalogo_{slug}.pdf"
    princ = tmp / nome_file

    # ---- catalogo completo
    parti = []                                   # (file, prima pagina nel catalogo completo, pagine)
    if len(fonti) == 1:
        shutil.copy(fonti[0], princ)
        n_tot = pagine(princ)
        parti.append((fonti[0], 1, n_tot))
    else:
        pos = 1
        for f in fonti:
            n = pagine(f)
            parti.append((f, pos, n))
            pos += n
        cmd = ["qpdf", "--empty", "--pages"]
        for f in fonti:
            cmd += [f, "1-z"]
        run(*cmd, "--", princ)
        n_tot = pagine(princ)
    print(f"   {n_tot} pagine", flush=True)

    # ---- indice dai segnalibri (per i cataloghi uniti: quelli di ogni parte, spostati)
    seg = []
    for f, pos, n in parti:
        for s in segnalibri(f):
            seg.append({**s, "pagina": s["pagina"] + pos - 1})
    indice = [{"titolo": s["titolo"], "pagina": s["pagina"], "livello": s["livello"]} for s in seg if s["livello"] <= c.get("indice_livelli", 2)]

    per_pag = codici_per_pagina(princ)
    ricerca = {nome_file: indice_ricerca(per_pag, 1, n_tot)}

    # ---- sotto-cataloghi
    sotto = []
    if sp.get("tipo") == "file":
        fonte_pos = {str(f): pos for f, pos, n in parti}
        for i, v in enumerate(sp["voci"]):
            f = percorso(v["file"])
            if not f.exists():
                print("   manca la parte", v["file"])
                continue
            nf = f"Sotto-cataloghi/{pulito(v['codice'])}.pdf"
            shutil.copy(f, tmp / nf)
            n = pagine(f)
            pc = fonte_pos.get(str(f)) or v.get("pagina_catalogo")
            if pc:
                indice.append({"titolo": v["codice"], "pagina": pc, "livello": 0})
                ricerca[nf] = indice_ricerca(per_pag, pc, pc + n - 1)
            else:
                ricerca[nf] = indice_ricerca(codici_per_pagina(f))
            foto = f"img/s{i + 1:02d}.jpg"
            miniatura(f, v.get("pagina_foto", 1), tmp / "html" / foto, 520)
            sotto.append({"codice": v["codice"], "gruppo": v.get("gruppo"), "descrizione": v.get("descrizione"), "pagine": n, "file": nf, "foto": foto, "pagina_catalogo": pc})
    elif sp.get("tipo") == "segnalibri":
        liv = sp.get("livello", 1)
        salta = re.compile(sp.get("salta", r"^(indice|index|sommario|contents?|copertina|cover)$"), re.I)
        capi = [s for s in seg if s["livello"] == liv]
        usati = set()
        for i, s in enumerate(capi):
            fine = (capi[i + 1]["pagina"] - 1) if i + 1 < len(capi) else n_tot
            if salta.search(s["titolo"]) or fine - s["pagina"] + 1 < sp.get("min_pagine", 2):
                continue
            base = pulito(s["titolo"]); nome = base; k = 2
            while nome.lower() in usati:
                nome = f"{base}_{k}"; k += 1
            usati.add(nome.lower())
            nf = f"Sotto-cataloghi/{nome}.pdf"
            run("qpdf", princ, "--pages", ".", f"{s['pagina']}-{fine}", "--", tmp / nf)
            gruppo = None
            if liv > 1:                                       # il gruppo è il capitolo di livello superiore
                sup = [x for x in seg if x["livello"] == liv - 1 and x["pagina"] <= s["pagina"]]
                gruppo = sup[-1]["titolo"] if sup else None
            foto = f"img/s{len(sotto) + 1:02d}.jpg"
            miniatura(princ, s["pagina"] + sp.get("foto_dopo", 0) if s["pagina"] + sp.get("foto_dopo", 0) <= fine else s["pagina"], tmp / "html" / foto, 520)
            ricerca[nf] = indice_ricerca(per_pag, s["pagina"], fine)
            sotto.append({"codice": s["titolo"], "gruppo": gruppo, "descrizione": None, "pagine": fine - s["pagina"] + 1, "file": nf, "foto": foto, "pagina_catalogo": s["pagina"]})
    indice.sort(key=lambda x: (x["pagina"], x["livello"]))
    visti, ind2 = set(), []
    for x in indice:                                           # niente doppioni (stessa pagina e stesso titolo)
        k = (x["pagina"], x["titolo"].lower())
        if k not in visti:
            visti.add(k); ind2.append(x)

    miniatura(princ, c.get("pagina_copertina", 1), tmp / "copertina.jpg", 1100)
    json.dump(ricerca, open(tmp / "ricerca.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    sottot = c.get("sottotitolo") or " · ".join(dict.fromkeys(s["titolo"].title() if s["titolo"].isupper() else s["titolo"] for s in seg if s["livello"] == 1 and not re.search(r"^(indice|index|sommario)$", s["titolo"], re.I)))[:140]
    m = {"numero": c["numero"], "num": c.get("num", c["numero"]), "slug": slug, "nome": c["nome"], "sottotitolo": sottot, "marchi": c.get("marchi", []),
         "pagine": n_tot, "codici": len(ricerca[nome_file]), "sotto_nome": sp.get("nome", "sezioni"), "provvisoria": c.get("provvisoria", False),
         "generato": datetime.datetime.now().isoformat(timespec="seconds"), "file": nome_file, "copertina": "copertina.jpg",
         "indice": ind2, "segnalibri": [[x["livello"], x["pagina"], x["titolo"]] for x in seg], "sotto": sotto, "pdf_mb": round(princ.stat().st_size / 1048576, 1), "pronto": True, "_impronta": impronta}
    json.dump(m, open(tmp / "catalogo.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if d.exists():                                             # la versione di prima va in _da_eliminare (qui non si cancella niente)
        cest = OUT / "_da_eliminare"
        cest.mkdir(exist_ok=True)
        shutil.move(str(d), str(cest / f"{slug}_{datetime.datetime.now():%Y%m%d_%H%M%S}"))
    for tent in range(4):
        try:
            shutil.copytree(tmp, d, dirs_exist_ok=True)
            break
        except OSError:
            if tent == 3:
                raise
            time.sleep(2)
    shutil.rmtree(tmp.parent, ignore_errors=True)
    print(f"   pronto: {len(sotto)} sotto-cataloghi, {len(ind2)} voci di indice, {m['codici']} codici, {m['pdf_mb']} MB")
    return m


elenco = []
(OUT / "cat").mkdir(parents=True, exist_ok=True)
for c in CFG["cataloghi"]:
    d = OUT / "cat" / c["slug"]
    if SOLO and c["numero"] not in SOLO:
        m = json.load(open(d / "catalogo.json", encoding="utf-8")) if (d / "catalogo.json").exists() else None
    else:
        m = prepara(c)
    if m:
        m = {k: v for k, v in m.items() if k not in ("_impronta", "segnalibri")}
    elenco.append({"numero": c["numero"], "num": c.get("num", c["numero"]), "nome": c["nome"], "sottotitolo": (m or {}).get("sottotitolo") or c.get("sottotitolo", ""), "slug": c["slug"], "marchi": c.get("marchi", []),
                   "comparto": c.get("comparto", "connessione"), "manifest": m, "stato": "pronto" if m else "in arrivo"})
json.dump(elenco, open(OUT / "cataloghi.json", "w", encoding="utf-8"), ensure_ascii=False)
print(f"Elenco: {sum(1 for e in elenco if e['manifest'])} pronti su {len(elenco)} → {OUT / 'cataloghi.json'}")
