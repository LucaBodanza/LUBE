#!/usr/bin/env python3
"""ELSAP DSGN — costruisce il database dei prodotti per "Cerca codice" e per l'Interrogatore.

Legge i cataloghi già preparati da prepara.py (<uscita>/cat/<slug>/) e per ogni codice articolo ricava, dal testo del PDF:
pagina, titolo, descrizione, sezione del catalogo e le caratteristiche (formato, codifica, poli, genere, uscita, schermatura,
tipo, IP, tensione, corrente, connessione, materiale, protocollo, lunghezza cavo, marchio).
Niente viene inventato: una caratteristica c'è solo se è scritta nella pagina del prodotto.

  python3 prodotti.py <uscita di prepara.py> [numero ...]

Scrive <uscita>/cat/<slug>/prodotti.json per ogni catalogo e <uscita>/prodotti.json con tutto (quello che carica l'app).
"""
import sys, re, json, subprocess, collections
from pathlib import Path

OUT = Path(sys.argv[1])
SOLO = {int(a) for a in sys.argv[2:]}

COD = re.compile(r"^[A-Z0-9][A-Z0-9\-_./+]{4,39}$")
NON_COD = re.compile(r"^(IP\d{2}K?|M\d{1,2}(X\d.*)?|\d+V|\d+A|\d+MM|\d+X\d+|ISO[\d-]+|EN[\d-]+|IEC[\d-]+|UL[\d-]+|\d+AWG|AWG\d+|CAT\.?\d\w*|RJ45|\d+/\d+|2\+PE|3\+PE|\d+POLI|100BASE-T\w*|1000BASE-T\w*|10BASE-T\w*|RS-?\d+|USB\d.*|\d{4}-\d{2}-\d{2}|V-\d|PA\d+|UL94.*|DIN\d*|\d+-\d+)$")


def e_codice(w):
    if not COD.match(w) or not any(c.isdigit() for c in w) or NON_COD.match(w):
        return False
    lettere = sum(c.isalpha() for c in w)
    cifre = sum(c.isdigit() for c in w)
    if lettere == 0 and cifre < 6:
        return False
    if re.fullmatch(r"\d+([.,/-]\d+)*", w) and len(w) < 7:
        return False
    return True


# ---------------------------------------------------------------- vocabolario: dal testo alle caratteristiche
def _primo(regole, t):
    for rx, v in regole:
        m = rx.search(t)
        if m:
            return v(m) if callable(v) else v
    return None


I = re.I
FORMATO = [(re.compile(r"\b(?:forma|form|type|tipo)\s+([ABC])\b", I), lambda m: f"Forma {m.group(1).upper()}"),
           (re.compile(r"\bRJ ?45\b", I), "RJ45"), (re.compile(r"7/8\s?[\"”″]", I), '7/8"'), (re.compile(r"1/2\s?[\"”″]", I), '1/2"'),
           (re.compile(r"\bM ?(5|8|12|23|40)\b(?!\s*[x×]\s*\d{2})", I), lambda m: f"M{m.group(1)}"),
           (re.compile(r"\bB ?(17|23|40)\b"), lambda m: f"B{m.group(1)}"),
           (re.compile(r"\b(ultra high-density|large|standard|middle|mini|micro)\s+size\b", I), lambda m: "X-Lok " + m.group(1).title()),
           (re.compile(r"\bRUND ?24\b|\bRD ?24\b", I), "RD24"), (re.compile(r"\bM ?16\b", I), "M16"), (re.compile(r"\bUSB\b"), "USB"), (re.compile(r"\bSPE\b|single pair", I), "SPE")]
CODIFICA = [(re.compile(r"\b([ABDXLYKST])[\s-]?cod(?:ed|e|ifica|ing)?\b", I), lambda m: m.group(1).upper())]
GENERE_F = re.compile(r"\b(femmina|female|socket|buchse|bussola|kupplung)\b", I)
GENERE_M = re.compile(r"\b(maschio|male|plug|stecker|spinotto|pin contacts)\b", I)
USCITA = [(re.compile(r"90\s?°|\bangled\b|right[- ]angle|\bangolo\b|\bangolat|\b90 ?gradi", I), "90°"),
          (re.compile(r"\b(diritt[oa]|straight|axial|assiale)\b", I), "Diritto")]
SCHERMO = [(re.compile(r"non schermat|unshielded|not shielded|senza scherm", I), "Non schermato"), (re.compile(r"schermat|shielded", I), "Schermato")]
TIPO = [(re.compile(r"field[\s-]?(attach|install|wire)|\b(a|da) cablare\b|\bcablare\b|self[- ]assembly", I), "A cablare"),
        (re.compile(r"double[- ]ended", I), "Cavo con due connettori"),
        (re.compile(r"cord ?set|sovrastampat|moldizzat|over ?mold|single[- ]ended|\bpatch\b|precablat|\bcavo (pvc|pur)\b", I), "Con cavo"),
        (re.compile(r"receptacle|panel|pannello|flangia|chassis|\binsert\b|\bPCB\b|\bTHR\b|\bSMT\b|press ?fit|da incasso", I), "Da pannello / PCB"),
        (re.compile(r"adapt[oe]r|adattator|splitter|\bT-?coupler", I), "Adattatore"),
        (re.compile(r"distribution box|distributor|ripartitor|passive", I), "Distributore"),
        (re.compile(r"I/O (module|device|system)|modul[oi] I/O|IO-Link (master|hub)|control unit", I), "Modulo I/O"),
        (re.compile(r"accessor|\bcap\b|\btappo|\btool\b|utensil|fixing clip", I), "Accessori")]
CONN = [(re.compile(r"\bcrimp", I), "Crimp"), (re.compile(r"\b(a vite|vite|screw)\b", I), "Vite"), (re.compile(r"sald|solder", I), "A saldare"),
        (re.compile(r"\bIDC\b|perforazione|insulation displacement", I), "IDC"), (re.compile(r"\bmolla\b|spring|push-in", I), "A molla"),
        (re.compile(r"press ?fit", I), "Pressfit")]
MAT = [(re.compile(r"\binox\b|stainless", I), "Inox"), (re.compile(r"metall|\bmetal\b|zinc|ottone|brass", I), "Metallo"), (re.compile(r"plastic", I), "Plastica")]
PROTO = [(re.compile(r"profibus", I), "PROFIBUS"), (re.compile(r"profinet", I), "PROFINET"), (re.compile(r"ethercat", I), "EtherCAT"),
         (re.compile(r"ethernet/ip", I), "EtherNet/IP"), (re.compile(r"io-?link", I), "IO-Link"), (re.compile(r"canopen", I), "CANopen"),
         (re.compile(r"devicenet", I), "DeviceNet"), (re.compile(r"single pair|\bSPE\b", I), "Single Pair Ethernet"),
         (re.compile(r"cat\.? ?(5e|6a|6|7)\b", I), lambda m: "Ethernet Cat." + m.group(1).upper().replace("E", "e").replace("A", "A")),
         (re.compile(r"\bethernet\b", I), "Ethernet"), (re.compile(r"\bUSB\b"), "USB")]
IP = re.compile(r"\bIP\s?(\d{2}K?)\b")
POLI_TXT = re.compile(r"\b(\d{1,2})[\s-]?(?:pin|poli|pole|poles|pos\.?|way)\b", I)


def caratteristiche(t, solo=None):
    """Caratteristiche riconosciute nel testo t."""
    f = {}

    def metti(k, v):
        if v and (solo is None or k in solo):
            f[k] = v
    metti("formato", _primo(FORMATO, t))
    metti("codifica", _primo(CODIFICA, t))
    fm, ms = bool(GENERE_F.search(t)), bool(GENERE_M.search(t))
    metti("genere", "Femmina" if fm and not ms else ("Maschio" if ms and not fm else ("Maschio + Femmina" if fm and ms else None)))
    metti("uscita", _primo(USCITA, t))
    metti("schermo", _primo(SCHERMO, t))
    metti("tipo", _primo(TIPO, t))
    metti("conn", _primo(CONN, t))
    metti("mat", _primo(MAT, t))
    metti("proto", _primo(PROTO, t))
    ip = sorted(set(IP.findall(t)))
    metti("ip", " / ".join("IP" + x for x in ip[:3]) if ip else None)
    m = POLI_TXT.search(t)
    metti("poli", m.group(1).lstrip("0") if m else None)
    return f


def poli_puliti(v):
    """'04' → '4'; '4(3+PE)' → '3+PE'; '2+PE (PE across…)' → '2+PE'; '4B' → '4'."""
    v = v.replace(" ", "")
    m = re.match(r"^\d+\((\d+\+(?:PE|FE))\)", v)
    if m:
        return m.group(1)
    m = re.match(r"^0*(\d{1,2}(?:\+\d*(?:PE|FE))?(?:\+\d{1,2})?)", v)
    return m.group(1) if m else None


def num(v, unita):
    """'250 V AC/DC' → '250 V'; '4-20' resta com'è."""
    v = re.sub(r"\s+", " ", v).strip()
    m = re.match(r"^[≤<>]?\s?(\d+(?:[.,]\d+)?(?:\s?[-–]\s?\d+(?:[.,]\d+)?)?)", v)
    return f"{m.group(1).replace(' ', '')} {unita}" if m else None


ETICHETTE = [("poli", r"Number of Pins|N° poli|No\. of poles|Number of poles|Poles"),
             ("codifica", r"Coding|Codifica"), ("schermo", r"Shielding(?: Type)?|Schermatura"),
             ("v", r"Rated Voltage|Tensione nominale|Voltage Rating|Operating Voltage|Tensione esercizio|Tensione operativa"),
             ("a", r"Rated Current|Corrente nominale|Corrente operativa|Corrente nom\.?\*?|Current Rating"),
             ("ip", r"IP Rating|Grado IP\*{0,2}|Grado di protezione|Degree of protection|Protection Degree|Protection class"),
             ("tipo", r"Connector Type|Tipo connettore|Product style|Device Type"),
             ("genere", r"Type of Contact ?/? ?Gender|Type of Contact|Tipo contatto|Gender connector housing|Gender"),
             ("uscita", r"Connector Design|Design connettore"), ("marchio", r"Brand|Marchio"),
             ("famiglia", r"Product Sub ?Family|Sotto-famiglia|Product Family|Famiglia prodotto"),
             ("conn", r"Type of Connection|Tipo connessione|Connecting Side|Termination")]
ETICHETTE = [(k, re.compile(r"(?:^|\s{2}|: )(?:Side 1 )?(?:%s)(?: [A-Z][\w ./()*-]{0,28})?(?::[ \t]*|[ \t]{2,})(\S[^\n]*?)(?=[ \t]{2,}|$)" % rx, re.M)) for k, rx in ETICHETTE]


def da_etichette(testo):
    f = {}
    for k, rx in ETICHETTE:
        m = rx.search(testo)
        if not m:
            continue
        v = m.group(1).strip()
        if k == "poli":
            v = poli_puliti(v)
        elif k == "codifica":
            mm = re.match(r"^([ABDXLYKST])\b", v)
            v = mm.group(1) if mm else None
        elif k == "v":
            v = num(v, "V")
        elif k == "a":
            v = num(v, "A")
        elif k == "ip":
            ip = sorted(set(IP.findall(v)))
            v = " / ".join("IP" + x for x in ip[:3]) if ip else None
        elif k in ("schermo", "tipo", "genere", "uscita", "conn"):
            v = caratteristiche(v, {k}).get(k)
        elif k == "marchio":
            v = next((b for b in ("Lumberg Automation", "Hirschmann", "Belden", "CONEC", "Amphenol LTW", "Amphenol") if b.lower() in v.lower()), None)
        elif k == "famiglia":
            v = v[:60] if len(v) > 2 and not re.search(r"Resistenza|Insulation|Mating|Cicli|Family", v) else None
        if v:
            f[k] = v
    return f


# ---------------------------------------------------------------- lettura delle pagine
FINE_TAB = re.compile(r"DATI TECNICI|Technical Data|General Data|GENERAL DATA|GENERA L DATA|IMMAGINE PRODOTTO|Product Description|Materials?\s*$|We reserve the right|Distributed by", I)
PIEDE = re.compile(r"We reserve the right|Distributed by ELSAP|^\s*\d{1,4}\s*$")
CELLA = re.compile(r"\S+(?: \S+)*")


def colonna(et):
    e = et.upper().replace(" ", "")
    if e.startswith("CODICE") and "CONTATTO" not in e:
        return "c"
    if e.startswith("DESCRI"):
        return "d"
    if "POLI" in e:
        return "poli"
    if e.startswith("D.CAVO") or e.startswith("ØCAVO") or e.startswith("D.PRESSA"):
        return "dcavo"
    if e.startswith("L.CAVO") or e.startswith("LUNGH") or e.startswith("L[M") or e == "[M]" or e.startswith("LFILI"):
        return "lung_mm" if "[MM]" in e else "lung"
    if e == "[A]":
        return "a"
    if e == "[V]":
        return "v"
    if e.startswith("CAVO") or e.startswith("SEZIONE") or e in ("[MMQ]", "[AWG]", "[MM²]"):
        return "sez"
    if e == "IP":
        return "ip"
    if e.startswith("COLOR"):
        return "colore"
    return "x"


INTEST2 = re.compile(r"^(\[[^\]]+\]|CAVO|L\.|D\.|PIN|CORPO|PRESSACAVO|FISSAGGIO|\[m m\])$", I)


def sembra_codice(txt):
    if re.search(r"[a-z]{3}", txt):
        return False
    w = txt.replace("–", "-").replace(" ", "")
    return bool(e_codice(w.upper()) or re.fullmatch(r"\d{2}-\d{4,6}[A-Z]{0,2}", w) or re.fullmatch(r"\d{5,6}", w))


def leggi_pagina(testo):
    """→ (titoli, [record di tabella], testo pulito). record = dict(c, d, blocco, colonne…)"""
    righe = [r.rstrip() for r in testo.split("\n")]
    righe = [r for r in righe if r.strip() and not PIEDE.search(r)]
    if not righe:
        return [], [], ""
    rientri = sorted(len(r) - len(r.lstrip()) for r in righe)
    base = rientri[len(rientri) // 2]
    # l'etichetta verticale a bordo pagina esce come riga corta tutta a sinistra: via
    righe = [r for r in righe if not ((len(r) - len(r.lstrip())) < base - 6 and len(r.strip()) < 48 and "  " not in r.strip())]
    titoli = []
    for r in righe[:7]:
        s = r.strip().lstrip("\ufeff■ ").strip()
        if re.search(r"\bCODICE\b|IMMAGINE PRODOTTO|CODICI DISPONIBILI", r) or FINE_TAB.search(r):
            break
        if len(s) > 3 and "   " not in s and not re.match(r"^\d{2} [-•·] ", s) and re.search(r"[A-Za-z]{3}", s) and not re.search(r"MERCATO SPECIFICO$", s):
            titoli.append(re.sub(r"\s+", " ", s))
    rec, gruppi, blocco, prec, x0, dopo, x_cod = [], None, None, None, 0, False, None
    i = 0
    while i < len(righe):
        r = righe[i]
        i += 1
        s = r.strip().lstrip("\ufeff■ ").strip()
        mc = re.search(r"\bCODICE(/DESCRIZIONE)?\b", r)
        if mc and "CODICI DISPONIBILI" not in r and "IL CODICE" not in r:
            col = [(colonna(m.group(0)), m.start(), m.end()) for m in CELLA.finditer(r) if m.start() >= mc.start()]
            # intestazione su due righe: "[A]  [V]  CAVO" sotto
            if i < len(righe):
                sotto_r = [(m.group(0), m.start(), m.end()) for m in CELLA.finditer(righe[i])]
                if sotto_r and all(INTEST2.match(t) for t, _, _ in sotto_r):
                    for t, a, b in sotto_r:
                        if not any(a < k[2] + 2 and b > k[1] - 2 for k in col) and colonna(t) != "x":
                            col.append((colonna(t), a, b))
                    i += 1
            col.sort(key=lambda k: k[1])
            col = [k for j, k in enumerate(col) if k[0] != "x" or j < 8]
            gruppi = []
            for k in col:
                if k[0] == "c":
                    gruppi.append([k])
                elif gruppi:
                    gruppi[-1].append(k)
            x0 = mc.start()
            blocco = prec
            dopo, x_cod = False, None
            continue
        if gruppi:
            if FINE_TAB.search(r) and not any(sembra_codice(m.group(0)) for m in CELLA.finditer(r)):
                dopo = True                    # la tabella "finisce", ma l'impaginato può far uscire altre righe più sotto
                continue
            celle = []
            for m in CELLA.finditer(r):
                if m.end() <= x0 - 25:
                    continue
                txt, a0 = m.group(0), m.start()
                p1 = txt.split(" ", 1)
                if len(p1) == 2 and len(p1[0]) >= 8 and e_codice(p1[0].replace("–", "-").upper()) and not sembra_codice(txt):
                    celle.append((p1[0], a0, a0 + len(p1[0])))            # "CODICE descrizione" separati da un solo spazio
                    celle.append((p1[1], a0 + len(p1[0]) + 1, m.end()))
                else:
                    celle.append((txt, a0, m.end()))

            def gruppo_di(a):
                scelto = gruppi[0]
                for g in gruppi:
                    if a >= g[0][1] - 26:
                        scelto = g
                return scelto
            cur, trovati = None, []
            for j, (txt, a, b) in enumerate(celle):
                nuovo = False
                if sembra_codice(txt):
                    g = gruppo_di(a)
                    if cur is None:
                        nuovo = (j == 0 or abs(g[0][1] - a) < 40) and (not dopo or (x_cod is not None and abs(a - x_cod) <= 3))
                        if nuovo and x_cod is None:
                            x_cod = a
                    else:
                        nuovo = g is not cur["_g"]
                if nuovo:
                    cur = {"c": txt.replace("–", "-").replace(" ", ""), "blocco": blocco, "_g": g, "_celle": []}
                    trovati.append(cur)
                elif cur is not None:
                    cur["_celle"].append((txt, a, b))
            for cur in trovati:
                altre = [k for k in cur["_g"][1:]]
                celle_r = cur.pop("_celle")
                cur.pop("_g")
                if len(celle_r) == len(altre):                       # stesse colonne dell'intestazione: in ordine
                    for (txt, a, b), k in zip(celle_r, altre):
                        cur[k[0]] = (cur.get(k[0], "") + " " + txt).strip() if k[0] in ("d", "x") else txt
                elif altre:
                    for txt, a, b in celle_r:
                        k = min(altre, key=lambda k: 0 if (a < k[2] and b > k[1]) else min(abs(k[1] - a), abs((k[1] + k[2]) / 2 - (a + b) / 2)))
                        cur[k[0]] = (cur.get(k[0], "") + " " + txt).strip() if k[0] in ("d", "x") else cur.get(k[0]) or txt
            if trovati:
                rec.extend(trovati)
            elif len(celle) == 1 and len(s) > 6 and not s.startswith("[") and (s.upper() == s) and not INTEST2.match(s):
                prec = re.sub(r"\s+", " ", s)   # titolo di un nuovo blocco dentro la tabella
        else:
            if len(s) > 3 and "CODICI DISPONIBILI" not in s and re.search(r"[A-Za-z]{3}", s) and "   " not in s:
                prec = re.sub(r"\s+", " ", s)
    return titoli, rec, "\n".join(righe)


TRATTINO = re.compile(r"^\s*([A-Z0-9][\w\-./+ ·]{3,60}?)\s+[—–]\s+(\S.{12,})$")
NOME_DESC = re.compile(r"^\s*([A-Z0-9][\w\-./+ ,]{4,44}?) - (\S.{14,})$")
RUMORE = re.compile(r"^(RAL\d+|(\d{4})\2|E\d{5,6}|(IP\d{2}K?){2,}|\d{2}\.\d{2}\.\d{2,4}|\d{2}K\d[A-Z]\d+|M\d+-M\d+|\d+BASE-.*|AWG.*|.*AWG|DIN.*|VDE.*|UL\d.*|IEC.*|EN\d.*|ISO.*|\d+X\d.*|J-STD.*|.*MM²?|\d+(\.\d+)?(MM|NM|NCM|KV|MA|MHZ|GHZ|OHM|V|A|M|G|KG)|CAT\.?\d\w*|\d+-\d+|\d+/\d+|PA\d+.*|PG\d+|M\d+X[\d.,]+|\d{4}/\d{2})$", I)
SOLO_ELSAP = re.compile(r"^\s*(\d{2}-\d{4,6}(?:\s*/\s*\d{2}-\d{4,6})*)\s*$")


def libero_ok(w):
    if RUMORE.match(w) or not e_codice(w):
        return False
    cifre = sum(c.isdigit() for c in w)
    lettere = sum(c.isalpha() for c in w)
    if lettere == 0:
        return cifre >= 8 or bool(re.fullmatch(r"\d{2}-\d{4,6}", w))
    return len(w) >= 7 and cifre >= 2


def prodotti_catalogo(d, m):
    pdf = d / m["file"]
    testo = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), "-"], capture_output=True).stdout.decode("utf-8", "replace")
    pagine = testo.split("\f")
    seg = sorted(m.get("segnalibri") or [[x.get("livello", 1), x["pagina"], x["titolo"]] for x in m["indice"]], key=lambda x: x[1])
    sez_cache = {}

    def sezione(p):
        per_liv, sulla_pagina = {}, {}
        for liv, pag, tit in seg:
            if pag > p:
                break
            if re.match(r"^(indice|index)$", tit, I) or liv < 1:
                continue
            per_liv[liv] = re.sub(r"\s+", " ", tit).strip()
            for k in [k for k in per_liv if k > liv]:
                del per_liv[k]
            if pag == p:
                sulla_pagina[liv] = sulla_pagina.get(liv, 0) + 1
        ambiguo = min([k for k, n in sulla_pagina.items() if n > 1], default=99)
        out, largo = [], []
        for k in sorted(per_liv):
            largo.append(per_liv[k])
            if k < ambiguo and (not out or per_liv[k].lower() != out[-1].lower()):
                out.append(per_liv[k])
        return out[:4], largo[:5]

    marchio_cat = m["marchi"][0] if len(m.get("marchi", [])) == 1 else None
    out, visti, info_pag = [], {}, {}

    def nuovo(c, n, testa, sez, f, alias=(), d="", blocco=""):
        if marchio_cat:
            f.setdefault("marchio", marchio_cat)
        out.append({"c": c, "a": [a for a in alias if a], "n": m["numero"], "p": n, "t": testa, "b": blocco, "d": d, "s": sez, "f": f})
        visti.setdefault(c.upper(), n)

    for n, tp in enumerate(pagine, 1):
        titoli, rec, pulito = leggi_pagina(tp)
        if not pulito:
            continue
        sez, sez_largo = sezione(n)
        et = da_etichette(pulito)
        if not titoli or not any(re.search(r"[A-Za-z]{4}", t) for t in titoli):
            titoli = sez[-2:]
        testa = " · ".join(dict.fromkeys(titoli[:3]))
        f_pag = caratteristiche(" | ".join(sez) + " | " + testa)
        for k, v in caratteristiche(" | ".join(sez_largo), {"formato", "codifica", "proto"}).items():
            f_pag.setdefault(k, v)
        f_sez = caratteristiche(" | ".join(sez), {"tipo"})
        if f_sez:
            f_pag.update(f_sez)             # il tipo lo dice il capitolo del catalogo, prima del titolo
        righe = pulito.split("\n")
        # --- prodotti descritti a parole: "CODICE — descrizione", "NOME - descrizione"
        nome_desc = {}
        for r in righe:
            mm = TRATTINO.match(r)
            if mm:
                for c in re.split(r"\s+[·]\s+", mm.group(1)):
                    nome_desc[c.strip()] = mm.group(2).strip()
        m_nd = None
        for r in righe[:14]:
            mm = NOME_DESC.match(r.strip()) if "   " not in r.strip() or True else None
            cand = re.search(r"(?:^|\s{3,})([A-Z0-9][\w\-./+ ,]{4,44}?) - (\S.{14,})$", r)
            if cand and any(ch.isdigit() for ch in cand.group(1)):
                m_nd = (cand.group(1).strip(), cand.group(2).strip())
                break
        desc_pag = (m_nd[1] if m_nd else "") or next(iter(nome_desc.values()), "")
        f_desc = caratteristiche(desc_pag)
        tab_txt = " ".join((r["c"] + " " + r.get("d", "")) for r in rec).upper()
        usati = set()
        # --- 1. righe di tabella
        for r in rec:
            d_riga = re.sub(r"\s+", " ", r.get("d", "")).strip()
            alias, lung_d = [], None
            parti = re.split(r"\s+[·•]\s+", d_riga)
            if parti and sembra_codice(parti[0]) and len(parti[0]) < 44 and not re.search(r"[a-z]{4}", parti[0]):
                alias.append(parti[0].replace("–", "-"))
                resto = " · ".join(parti[1:])
                ml = re.fullmatch(r"(\d+(?:[.,]\d+)?)\s?(m|mm)", resto)
                if ml:
                    lung_d, resto = f"{ml.group(1)} {ml.group(2)}", ""
                d_riga = resto
            ml = re.fullmatch(r"\d+ mm \(([\d.,]+) m\)", d_riga) or re.search(r"[Ll]unghezza(?: cavo)? ([\d.,]+) m\b", d_riga)
            if ml:
                lung_d = ml.group(1).replace(".", ",") + " m"
                if d_riga.endswith(")"):
                    d_riga = ""
            f = {}
            for k in ("poli", "dcavo", "lung", "a", "v", "sez", "ip", "colore"):
                if r.get(k) and r[k].upper() not in ("N/A", "N/D", "-", "—"):
                    f[k] = r[k]
            if r.get("lung_mm"):
                f["lung"] = r["lung_mm"] + " mm"
            if lung_d:
                f.setdefault("lung", lung_d)
            if "poli" in f:
                f["poli"] = poli_puliti(f["poli"])
                if not f["poli"]:
                    f.pop("poli")
            if "a" in f:
                f["a"] = num(f["a"], "A") or f.pop("a") and None
            if "v" in f:
                f["v"] = num(f["v"], "V") or f.pop("v") and None
            f = {k: v for k, v in f.items() if v}
            if "lung" in f and re.fullmatch(r"[\d.,]+", f["lung"]):
                f["lung"] += " m"
            if "ip" in f and not f["ip"].upper().startswith("IP"):
                f.pop("ip")
            if "dcavo" in f and not re.search(r"\d", f["dcavo"]):
                f.pop("dcavo")
            f_blocco = caratteristiche(r.get("blocco") or "")
            generali = ("formato", "codifica", "tipo", "proto", "marchio", "famiglia")
            for fonte in (caratteristiche(d_riga + " " + r.get("x", "")), f_blocco, f_desc, et, f_pag):
                for k, v in fonte.items():
                    if "genere" in f_blocco and fonte is not f_blocco and fonte is not et and k not in generali and fonte in (f_pag, f_desc):
                        continue
                    f.setdefault(k, v)
            if f_sez.get("tipo"):
                f["tipo"] = f_sez["tipo"]
            nuovo(r["c"], n, testa, sez, f, alias, d_riga or desc_pag, r.get("blocco") or "")
            usati.add(r["c"].upper())
            usati.update(a.upper() for a in alias)
        # --- 3. scheda di un prodotto: "Part Number" + "Item Description" / nome nel titolo
        pn = re.search(r"(?:Part Number|Part No\.?|Item No\.?|Order No\.?)[:\s]\s*(\d{6,12}|\d{2}-\d{4,6})\b", pulito)
        idn = re.search(r"Item Description:\s*(\S[^\n]*?)(?=\s{2,}|$)", pulito, re.M)
        nome = (idn.group(1).strip() if idn else None) or (m_nd[0] if m_nd else None)
        if pn and pn.group(1).upper() not in usati:
            f = {}
            for fonte in (f_desc, et, f_pag):
                for k, v in fonte.items():
                    f.setdefault(k, v)
            nuovo(pn.group(1), n, testa, sez, f, [nome] if nome else [], desc_pag)
            usati.add(pn.group(1).upper())
            if nome:
                usati.add(nome.upper())
        elif nome and not rec and nome.upper() not in usati and len(pulito) > 400 and et:
            f = {}
            for fonte in (f_desc, et, f_pag):
                for k, v in fonte.items():
                    f.setdefault(k, v)
            nuovo(nome, n, testa, sez, f, [], desc_pag)
            usati.add(nome.upper())
        # --- 4. altri codici scritti nella pagina (tabelle d'ordine senza intestazione riconosciuta)
        if 'Viale Famagosta' in pulito or 'P.IVA' in pulito:
            info_pag[n] = (titoli, len(usati))
            continue
        tutto_usato = " ".join(usati)
        parole_pag = []
        for x in pulito.split():
            x = x.strip(".,;:()[]•·|")
            parole_pag.extend(x.split("/") if re.fullmatch(r"\d{2}-\d{4,6}(/\d{2}-\d{4,6})+", x) else [x])
        for w in dict.fromkeys(parole_pag):
            if not libero_ok(w) or w.upper() in usati or w.upper() in tab_txt or w.upper() in tutto_usato:
                continue
            if w.upper() in visti and visti[w.upper()] != n:
                continue
            f = {}
            for fonte in (caratteristiche(nome_desc.get(w, "")),) + ((f_desc, et) if len(et) >= 3 or (not rec and len(usati) < 2) else ()) + (f_pag,):
                for k, v in fonte.items():
                    f.setdefault(k, v)
            nuovo(w, n, testa, sez, f, [], nome_desc.get(w, ""))
            usati.add(w.upper())
        info_pag[n] = (titoli, len(usati))
    # stessa voce su più pagine (richiami, indici): tengo quella con più caratteristiche
    migliori = {}
    for o in out:
        k = o["c"].upper()
        if k not in migliori or (len(o["f"]) + bool(o["d"])) > (len(migliori[k]["f"]) + bool(migliori[k]["d"])) + 1:
            migliori[k] = o
    out = sorted(migliori.values(), key=lambda o: (o["p"], o["c"]))
    # la scheda continua sulla pagina dopo? (pagina senza codici propri, stesso titolo)
    for o in out:
        k, p = 1, o["p"]
        while k < 3 and p + k in info_pag and info_pag[p + k][1] == 0 and info_pag[p + k][0][1:2] == info_pag[p][0][1:2] and len(info_pag[p][0]) > 1:
            k += 1
        o["k"] = k
    return out


tutti = []
for c in json.load(open(OUT / "cataloghi.json", encoding="utf-8")):
    m = c.get("manifest")
    if not m:
        continue
    d = OUT / "cat" / c["slug"]
    if SOLO and c["numero"] not in SOLO and (d / "prodotti.json").exists():
        P = json.load(open(d / "prodotti.json", encoding="utf-8"))
    else:
        completo = json.load(open(d / "catalogo.json", encoding="utf-8"))          # qui ci sono tutti i segnalibri
        P = prodotti_catalogo(d, {**completo, "numero": c["numero"], "marchi": c.get("marchi", [])})
        json.dump(P, open(d / "prodotti.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
        cnt = collections.Counter(k for o in P for k in o["f"])
        print(f"{c['numero']:02d} {c['nome'][:24]:24} {len(P):5} codici | " + " ".join(f"{k}:{v * 100 // max(1, len(P))}%" for k, v in cnt.most_common(12)), flush=True)
    for o in P:
        o["g"] = c["slug"]
    tutti.extend(P)
json.dump({"versione": 1, "prodotti": tutti}, open(OUT / "prodotti.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"Totale: {len(tutti)} codici → {OUT / 'prodotti.json'} ({(OUT / 'prodotti.json').stat().st_size / 1048576:.1f} MB)")
