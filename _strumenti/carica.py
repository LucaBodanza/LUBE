#!/usr/bin/env python3
"""ELSAP DSGN — "Carica catalogo" dal pannello web (lo esegue GitHub Actions, vedi .github/workflows/carica.yml).

Il pannello dell'Admin DEV carica in _carica/ il PDF CIFRATO (<slug>.pdf.enc) e la scheda (<slug>.json).
Qui, con la chiave dei dati nel segreto ELSAP_CHIAVE:
  decifra   → PDF in chiaro nella cartella temporanea + elenco per prepara.py
  pubblica  → cifra i file prodotti da prepara.py/prodotti.py dentro cat/<slug>/, aggiorna dati/cataloghi.json,
              dati/prodotti.json e sw.js (versione nuova), toglie i file di _carica/.
Stesso formato e stessa cifratura deterministica di build_pwa.py. Niente in chiaro finisce nella repo.
"""
import sys, os, re, json, hmac, hashlib, base64, shutil, datetime
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SITO = Path(os.environ.get("SITO", "."))
LAV = Path(os.environ.get("LAVORO") or (os.environ.get("RUNNER_TEMP", "/tmp") + "/carica"))
KEY = base64.b64decode(os.environ["ELSAP_CHIAVE"].strip())
A = AESGCM(KEY)
BLOCCO = 1 << 18


def cifra(rel, dati):
    nonce = hmac.new(KEY, rel.encode() + hashlib.sha256(dati).digest(), "sha256").digest()[:8]
    parti = [b"ELSAPEC1" + BLOCCO.to_bytes(4, "big") + len(dati).to_bytes(8, "big") + nonce + bytes(4)]
    for i in range(0, max(1, -(-len(dati) // BLOCCO))) if dati else []:
        parti.append(A.encrypt(nonce + i.to_bytes(4, "big"), dati[i * BLOCCO:(i + 1) * BLOCCO], None))
    return b"".join(parti)


def decifra(buf):
    assert buf[:8] == b"ELSAPEC1", "file non cifrato ELSAP"
    C, size, nonce = int.from_bytes(buf[8:12], "big"), int.from_bytes(buf[12:20], "big"), buf[20:28]
    out, p = [], 32
    for i in range(-(-size // C)):
        l = min(C, size - i * C) + 16
        out.append(A.decrypt(nonce + i.to_bytes(4, "big"), buf[p:p + l], None)); p += l
    return b"".join(out)


def scheda():
    jj = sorted((SITO / "_carica").glob("*.json"), key=lambda p: p.stat().st_mtime)
    if not jj:
        sys.exit("Nessun catalogo da caricare in _carica/")
    return jj[0], json.load(open(jj[0], encoding="utf-8"))


def fase_decifra():
    f, c = scheda()
    enc = SITO / "_carica" / f"{c['slug']}.pdf.enc"
    (LAV / "pdf").mkdir(parents=True, exist_ok=True)
    pdf = LAV / "pdf" / f"{c['slug']}.pdf"
    pdf.write_bytes(decifra(enc.read_bytes()))
    voce = {k: c[k] for k in ("numero", "num", "slug", "nome", "comparto", "sottotitolo", "marchi", "sotto", "provvisoria", "pagina_copertina") if k in c}
    voce["pdf"] = f"CARICA:{pdf.name}"
    json.dump({"radici": {"CARICA": str(LAV / "pdf")}, "cataloghi": [voce]}, open(LAV / "elenco.json", "w"), ensure_ascii=False)
    print(f"{c['numero']:02d} {c['nome']}: PDF decifrato ({pdf.stat().st_size / 1048576:.1f} MB)")


def leggi(rel):
    p = SITO / rel
    return json.loads(decifra(p.read_bytes())) if p.exists() else None


def scrivi(rel, dati):
    p = SITO / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(cifra(rel, dati))


def aggiorna_sw():
    # service worker: versione nuova → i dispositivi riprendono elenco e database aggiornati
    sw = (SITO / "sw.js").read_text(encoding="utf-8")
    imp = hashlib.sha1((SITO / "dati/cataloghi.json").read_bytes() + (SITO / "dati/prodotti.json").read_bytes()).hexdigest()[:8]
    sw = re.sub(r"const VERSIONE = '([^']*?)(-c[0-9a-f]{8})?';", lambda m: f"const VERSIONE = '{m.group(1)}-c{imp}';", sw, count=1)
    (SITO / "sw.js").write_text(sw, encoding="utf-8")


def fase_tipo():
    """Dice al workflow se la richiesta è un caricamento o uno spostamento (scrive 'azione' in GITHUB_OUTPUT)."""
    _, c = scheda()
    az = c.get("azione", "carica")
    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a") as o:
        o.write(f"azione={az}\n")
    print("azione:", az)


SIGLE = {"connessione": "", "elettronica-industriale": "ei", "sistemi-elettromeccanici": "se"}
ORDINE = list(SIGLE)          # stesso ordine di COMPARTI nel sito: numero interno = posizione*100 + num


def fase_sposta():
    """Sposta un catalogo in un'altra sezione (o un altro numero) senza ricaricare il PDF: cambiano posizione, slug e riferimenti."""
    f, c = scheda()
    com = lambda x: x.get("comparto") or "connessione"
    num = lambda x: x.get("num", x["numero"] % 100 if x["numero"] >= 100 else x["numero"])
    if c.get("comparto") not in SIGLE:
        sys.exit(f"STOP: sezione sconosciuta «{c.get('comparto')}»")
    cs = leggi("dati/cataloghi.json") or []
    x = next((k for k in cs if k["slug"] == c["slug"]), None)
    if not x:
        sys.exit(f"STOP: catalogo «{c['slug']}» non trovato. Non cambio niente.")
    n, dest = int(c["num"]), c["comparto"]
    if not 1 <= n <= 99:
        sys.exit("STOP: il numero deve essere tra 1 e 99")
    occ = [k for k in cs if k["slug"] != x["slug"] and com(k) == dest and num(k) == n]
    if occ:
        sys.exit(f"STOP: in {dest} il numero {n} è già di «{occ[0]['nome']}». Non cambio niente.")
    if com(x) == dest and num(x) == n:
        sys.exit("Niente da fare: il catalogo è già lì.")
    vecchio = x["slug"]
    resto = re.sub(r"^(ei|se)?\d+_", "", vecchio)
    nuovo = f"{SIGLE[dest]}{n:02d}_{resto}"
    numero = ORDINE.index(dest) * 100 + n
    if any(k["slug"] == nuovo or k["numero"] == numero for k in cs if k is not x):
        sys.exit(f"STOP: «{nuovo}» o il numero interno {numero} esistono già. Non cambio niente.")
    print(f"Sposto «{x['nome']}»: {com(x)} {num(x)} → {dest} {n} · {vecchio} → {nuovo}")
    # 1) cartella e file cifrati: il contenuto non cambia (nessun dato legato al percorso), cambiano solo i nomi
    src, dst = SITO / "cat" / vecchio, SITO / "cat" / nuovo
    if not src.is_dir():
        sys.exit(f"STOP: manca la cartella cat/{vecchio}")
    shutil.rmtree(dst, ignore_errors=True)
    for p in sorted(src.rglob("*")):
        if p.is_file():
            q = dst / p.relative_to(src).as_posix().replace(vecchio, nuovo)
            q.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, q)
    shutil.rmtree(src)
    # 2) elenco cataloghi: ogni riferimento al vecchio nome diventa il nuovo
    y = json.loads(json.dumps(x, ensure_ascii=False).replace(vecchio, nuovo))
    y["comparto"], y["num"], y["numero"] = dest, n, numero
    if isinstance(y.get("manifest"), dict):
        y["manifest"].update(numero=numero, num=n, slug=nuovo)
    cs = [k for k in cs if k is not x] + [y]
    cs.sort(key=lambda k: k["numero"])
    scrivi("dati/cataloghi.json", json.dumps(cs, ensure_ascii=False).encode())
    # 3) database prodotti: gruppo (slug) e numero
    P = leggi("dati/prodotti.json") or {"versione": 1, "prodotti": []}
    n_pr = 0
    for o in P["prodotti"]:
        if o.get("g") == vecchio:
            o["g"], o["n"] = nuovo, numero; n_pr += 1
    scrivi("dati/prodotti.json", json.dumps(P, ensure_ascii=False, separators=(",", ":")).encode())
    aggiorna_sw()
    reg = SITO / "_strumenti" / "caricati.json"
    R = json.load(open(reg, encoding="utf-8")) if reg.exists() else []
    R.append({"quando": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "scheda": c, "spostato": {"da": vecchio, "a": nuovo}, "prodotti": n_pr})
    json.dump(R, open(reg, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    f.unlink(missing_ok=True)
    print(f"Fatto: {nuovo} · {n_pr} prodotti aggiornati · {len(cs)} cataloghi")
    with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as s:
        s.write(f"### Spostato · {x['nome']}\n{vecchio} → {nuovo} · {dest} n.{n} · {n_pr} prodotti\n")


def fase_pubblica():
    f, c = scheda()
    out = LAV / "out"
    nuovo = json.load(open(out / "cataloghi.json", encoding="utf-8"))[0]
    slug = nuovo["slug"]
    cs = leggi("dati/cataloghi.json") or []
    # Un catalogo si sostituisce SOLO se è lo stesso catalogo: stesso slug, oppure stesso comparto E stesso numero DENTRO il comparto.
    # (Prima contava il numero da solo: il n.1 di Elettronica Industriale cancellava il n.1 di Connessione.)
    com = lambda x: x.get("comparto") or "connessione"
    num = lambda x: x.get("num", x["numero"] % 100 if x["numero"] >= 100 else x["numero"])
    vecchi = {x["slug"] for x in cs if x["slug"] == slug or (com(x) == com(nuovo) and num(x) == num(nuovo))}
    # chiave interna unica: se un ALTRO catalogo (altro comparto o altro slug) usa già questo numero, ci si ferma senza toccare niente
    clash = [x for x in cs if x["numero"] == nuovo["numero"] and x["slug"] not in vecchi]
    if clash:
        sys.exit(f"STOP: il numero interno {nuovo['numero']} è già usato da «{clash[0]['nome']}» ({com(clash[0])}). Non cancello niente.")
    persi = [x for x in cs if x["slug"] not in vecchi]
    cs = persi + [nuovo]
    cs.sort(key=lambda x: x["numero"])
    print(f"Sostituisce: {', '.join(sorted(vecchi)) or 'nessuno (catalogo nuovo)'} · restano {len(persi)} cataloghi")
    # file del catalogo: via quelli vecchi (stessa cartella o stesso numero), dentro i nuovi cifrati
    for s in vecchi | {slug}:
        shutil.rmtree(SITO / "cat" / s, ignore_errors=True)
    src = out / "cat" / slug
    n = 0
    for p in sorted(src.rglob("*")):
        if p.is_file() and not p.name.startswith(".") and p.name not in ("catalogo.json", "prodotti.json"):
            scrivi(f"cat/{slug}/{p.relative_to(src).as_posix()}", p.read_bytes()); n += 1
    scrivi("dati/cataloghi.json", json.dumps(cs, ensure_ascii=False).encode())
    P = leggi("dati/prodotti.json") or {"versione": 1, "prodotti": []}
    nuovi = json.load(open(out / "prodotti.json", encoding="utf-8"))["prodotti"]
    P["prodotti"] = [o for o in P["prodotti"] if o.get("g") not in vecchi | {slug}] + nuovi
    scrivi("dati/prodotti.json", json.dumps(P, ensure_ascii=False, separators=(",", ":")).encode())
    aggiorna_sw()
    # registro (per Claude: i cataloghi caricati dal pannello vanno ripresi nei dati del Mac)
    reg = SITO / "_strumenti" / "caricati.json"
    R = json.load(open(reg, encoding="utf-8")) if reg.exists() else []
    R.append({"quando": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "scheda": c,
              "pagine": nuovo["manifest"]["pagine"], "codici": nuovo["manifest"]["codici"], "prodotti": len(nuovi)})
    json.dump(R, open(reg, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for p in (SITO / "_carica").glob(f"{slug}*"):
        p.unlink()
    f.unlink(missing_ok=True)
    m = nuovo["manifest"]
    print(f"{nuovo['numero']:02d} {nuovo['nome']}: {m['pagine']} pagine, {len(m['sotto'])} sotto-cataloghi, {m['codici']} codici, {len(nuovi)} prodotti, {n} file cifrati")
    with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a") as s:
        s.write(f"### {nuovo['numero']:02d} · {nuovo['nome']}\n{m['pagine']} pagine · {len(m['sotto'])} sotto-cataloghi · {len(nuovi)} prodotti\n")


if __name__ == "__main__":
    {"decifra": fase_decifra, "pubblica": fase_pubblica, "tipo": fase_tipo, "sposta": fase_sposta}[sys.argv[1]]()
