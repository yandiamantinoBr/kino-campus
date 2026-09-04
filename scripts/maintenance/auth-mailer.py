#!/usr/bin/env python3
# KinoCampus auth-mailer v1 — confirmation emails via Hostinger SMTP (bypasses MailChannels)
# Why: Supabase built-in SMTP (MailChannels) produced 71 bounces (5.1.1) — ufg.br/gmail/hotmail
#      never received confirmation emails; 45+ users stuck unconfirmed.
import os, sys, json, time, smtplib, sqlite3, ssl, hashlib
import urllib.request, urllib.error
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header

STATE_DB = os.environ.get("AUTH_MAILER_DB", "/data/auth-mailer/state.db")
SMTP_HOST = "smtp.hostinger.com"
SMTP_PORT = 465
SMTP_USER = "contato@kinocampus.com.br"
SMTP_PASS = "-+BHm+C)Axjq0yS'"
FROM_NAME = "KinoCampus"
FROM_EMAIL = "contato@kinocampus.com.br"
APP_BASE = "https://www.kinocampus.com.br"
MAX_PER_RUN = int(os.environ.get("AUTH_MAILER_MAX", "40"))

LOGO_MARK = '<table role="presentation" cellspacing="0" cellpadding="0" style="width:44px;height:44px;background:#FF6B00;border-radius:12px"><tr><td align="center" valign="middle"><svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="display:block"><path fill="#ffffff" d="M12 3.2 2.4 19.6c-.3.55.08 1.2.7 1.2h5.1l2.75-4.9c.45-.8 1.6-.8 2.05 0l2.75 4.9h5.1c.62 0 1-.65.7-1.2L12 3.2z"/></svg></td></tr></table>'

def branded_html(action_url, display_name):
    name = display_name or ""
    hi = ("Olá, " + name + "!") if name else "Olá!"
    return """<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f7f8fb;font-family:Arial,'Helvetica Neue',sans-serif;color:#1f2937;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f8fb;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #eceff5;">
<tr><td style="padding:24px 32px;background:#fff4ec;border-bottom:1px solid #eceff5;">
  <table role="presentation" cellspacing="0" cellpadding="0"><tr>
    <td style="width:48px;vertical-align:middle">""" + LOGO_MARK + """</td>
    <td style="vertical-align:middle;padding-left:14px">
      <div style="font-size:1.45rem;font-weight:900;letter-spacing:-0.02em;line-height:1.1"><span style="color:#FF6B00">Kino</span><span style="color:#1a1a1a">Campus</span></div>
      <div style="font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;margin-top:3px">Comunidade UFG</div>
    </td></tr></table>
</td></tr>
<tr><td style="padding:28px 32px">
  <h2 style="margin:0 0 10px;font-size:1.3rem;color:#111827">""" + hi + """ Confirme seu e-mail</h2>
  <p style="margin:0 0 14px;line-height:1.55">Você criou uma conta na <strong>KinoCampus</strong> — a comunidade UFG de eventos, oportunidades e vida no campus. Confirme seu e-mail para ativar seu acesso:</p>
  <p style="text-align:center;margin:22px 0">
    <a href="%(action_url)s" style="display:inline-block;background:#FF6B00;color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:12px;font-weight:700;font-size:1rem">Confirmar meu e-mail</a>
  </p>
  <p style="margin:0 0 6px;line-height:1.55">Se o botão não funcionar, copie e cole este link no navegador:</p>
  <p style="margin:0 0 18px;word-break:break-all"><a href="%(action_url)s" style="color:#FF6B00;word-break:break-all">%(action_url)s</a></p>
  <p style="margin:0;color:#6b7280;font-size:.9rem">Se você não criou esta conta, ignore este e-mail.</p>
</td></tr>
<tr><td style="padding:20px 32px;background:#f7f8fb;border-top:1px solid #eceff5">
  <p style="margin:0;font-size:.85rem;color:#6b7280">Equipe KinoCampus · <a href="https://www.kinocampus.com.br" style="color:#FF6B00">www.kinocampus.com.br</a></p>
</td></tr>
</table></td></tr></table></body></html>""" % {"action_url": action_url}

def http_json(url, payload=None, headers=None, method=None, timeout=30):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"), headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def get_env():
    # env from cadu-api container when run inside it; else from file
    url = os.environ.get("KINOCAMPUS_SUPABASE_URL")
    skey = os.environ.get("KINOCAMPUS_SUPABASE_SECRET_KEY")
    if not url or not skey:
        raise SystemExit("missing SUPABASE env")
    return url.rstrip("/"), skey

def ensure_state(db):
    con = sqlite3.connect(db)
    con.execute("create table if not exists sent (user_id text primary key, email text, link_sha text, sent_at text)")
    con.commit()
    return con

def main():
    url, skey = get_env()
    con = ensure_state(STATE_DB)
    cur = con.cursor()
    hdr = {"apikey": skey, "Authorization": "Bearer " + skey}
    # 1. list unconfirmed users (page through)
    users = []
    for page in (1, 2, 3):
        d = http_json(url + "/auth/v1/admin/users?per_page=200&page=" + str(page), headers=hdr)
        users.extend(d.get("users", []))
        if len(d.get("users", [])) < 200:
            break
    unconfirmed = [u for u in users if not u.get("email_confirmed_at")
                   and u.get("confirmation_sent_at")
                   and not u.get("invited_at")]
    print("users:", len(users), "| unconfirmed(signup):", len(unconfirmed))
    sent = 0
    for u in unconfirmed:
        if sent >= MAX_PER_RUN:
            break
        uid = u["id"]
        email = (u.get("email") or "").strip()
        if not email or cur.execute("select 1 from sent where user_id=?", (uid,)).fetchone():
            continue
        # 2. generateLink (fresh token; invalidates old one — we send THIS one)
        try:
            d = http_json(url + "/auth/v1/admin/generate_link",
                          payload={"type": "signup", "email": email, "redirect_to": APP_BASE + "/auth-callback.html"},
                          headers={**hdr, "Content-Type": "application/json"})
        except urllib.error.HTTPError as e:
            print("  generateLink FAIL", email[:36], e.code, e.read().decode()[:80]); continue
        action = d.get("action_link") or (d.get("properties") or {}).get("action_link") or ""
        if not action.startswith("http"):
            print("  no action_link", email[:36]); continue
        display = ((u.get("user_metadata") or {}).get("display_name") or "").strip()
        html = branded_html(action, display)
        # 3. send via Hostinger SMTP
        msg = MIMEMultipart("alternative")
        msg["Subject"] = Header("Confirme seu e-mail — KinoCampus", "utf-8")
        msg["From"] = "%s <%s>" % (FROM_NAME, FROM_EMAIL)
        msg["To"] = email
        msg["Reply-To"] = FROM_EMAIL
        plain = "Confirme seu e-mail KinoCampus: " + action
        msg.attach(MIMEText(plain, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
        try:
            ctx = ssl.create_default_context()
            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=30) as s:
                s.login(SMTP_USER, SMTP_PASS)
                s.sendmail(FROM_EMAIL, [email], msg.as_string())
        except Exception as e:
            print("  SMTP FAIL", email[:36], type(e).__name__, str(e)[:80]); continue
        cur.execute("insert or replace into sent values (?,?,?,?)",
                    (uid, email, hashlib.sha256(action.encode()).hexdigest()[:32], time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())))
        con.commit()
        sent += 1
        print("  sent ->", email[:36])
    print("emails enviados nesta run:", sent)

if __name__ == "__main__":
    main()
