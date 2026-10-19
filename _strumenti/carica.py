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
    voce = {k: c[k] for k in ("numero", "slug", "nome", "sottotitolo", "marchi", "sotto", "provvisoria", "pagina_copertina") if k in c}
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


def fase_pubblica():
    f, c = scheda()
    out = LAV / "out"
    nuovo = json.load(open(out / "cataloghi.json", encoding="utf-8"))[0]
    slug = nuovo["slug"]
    cs = leggi("dati/cataloghi.json") or []
    vecchi = {x["slug"] for x in cs if x["slug"] == slug or x["numero"] == nuovo["numero"]}
    cs = [x for x in cs if x["slug"] not in vecchi] + [nuovo]
    cs.sort(key=lambda x: x["numero"])
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
    # service worker: versione nuova → i dispositivi riprendono elenco e database aggiornati
    sw = (SITO / "sw.js").read_text(encoding="utf-8")
    imp = hashlib.sha1((SITO / "dati/cataloghi.json").read_bytes() + (SITO / "dati/prodotti.json").read_bytes()).hexdigest()[:8]
    sw = re.sub(r"const VERSIONE = '([^']*?)(-c[0-9a-f]{8})?';", lambda m: f"const VERSIONE = '{m.group(1)}-c{imp}';", sw, count=1)
    (SITO / "sw.js").write_text(sw, encoding="utf-8")
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
    {"decifra": fase_decifra, "pubblica": fase_pubblica}[sys.argv[1]]()
