#!/usr/bin/env python3
"""ELSAP DSGN · News — spedisce un avviso email (lo chiama .github/workflows/news.yml). Solo libreria standard, nessuna azione di terzi.

  python3 avvisa.py novita <file>     corpo = contenuto del file (novità trovate dal giro)
  python3 avvisa.py errore            avviso «il controllo News è fallito» (link al giro su GitHub)

Segreti (Settings → Secrets → Actions del repo; mai in file o in chat):
  SMTP_USER   indirizzo che spedisce (es. quello Gmail)        SMTP_PASS   password per app (NON quella normale dell'account)
  MAIL_TO     destinatari separati da virgola (se manca: SMTP_USER)
  SMTP_SERVER (default smtp.gmail.com)   SMTP_PORT (default 587 con STARTTLS; 465 = SSL)
Se mancano SMTP_USER o SMTP_PASS non fa nulla e termina senza errore: gli avvisi sono facoltativi.
"""
import os, sys, ssl, smtplib
from email.message import EmailMessage

modo = sys.argv[1] if len(sys.argv) > 1 else ""
user, pw = os.environ.get("SMTP_USER", "").strip(), os.environ.get("SMTP_PASS", "").strip()
if not user or not pw:
    print("avvisa: SMTP_USER/SMTP_PASS non impostati, nessun avviso spedito."); sys.exit(0)
a = [x.strip() for x in (os.environ.get("MAIL_TO") or user).replace(";", ",").split(",") if x.strip()]
host, porta = os.environ.get("SMTP_SERVER") or "smtp.gmail.com", int(os.environ.get("SMTP_PORT") or 587)
repo, run = os.environ.get("GITHUB_REPOSITORY", ""), os.environ.get("GITHUB_RUN_ID", "")

if modo == "novita":
    corpo = open(sys.argv[2], encoding="utf-8").read()
    n = corpo.split(" ", 1)[0]
    oggetto = f"ELSAP News: {n} novità dai produttori"
elif modo == "errore":
    oggetto = "ELSAP News: il controllo automatico NON è riuscito"
    corpo = ("Il giro automatico delle News si è fermato con un errore.\n"
             f"Dettagli: https://github.com/{repo}/actions/runs/{run}\n\n"
             "Nell'app la sezione News continua a mostrare gli ultimi dati validi. Scrivi a Luca se l'errore si ripete.")
else:
    sys.exit("uso: avvisa.py novita <file> | errore")

m = EmailMessage()
m["Subject"], m["From"], m["To"] = oggetto, f"ELSAP DSGN News <{user}>", ", ".join(a)
m.set_content(corpo)
ctx = ssl.create_default_context()
try:
    if porta == 465:
        s = smtplib.SMTP_SSL(host, porta, context=ctx, timeout=30)
    else:
        s = smtplib.SMTP(host, porta, timeout=30); s.ehlo()
        if s.has_extn("starttls"): s.starttls(context=ctx); s.ehlo()
    with s:
        if s.has_extn("auth"): s.login(user, pw)
        s.send_message(m)
    print(f"avvisa: spedito «{oggetto}» a {len(a)} destinatari.")
except Exception as e:                                       # un avviso che non parte non deve far fallire il giro
    print(f"avvisa: non riesco a spedire ({type(e).__name__}).")
