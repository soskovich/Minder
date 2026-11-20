# Minder — PSD2 live bankkoppeling (backend)

Deze map bevat een kleine **Cloudflare Worker** die Minder verbindt met je bank via
**Enable Banking** (open banking / PSD2). De Worker doet één ding: hij ondertekent de
Enable Banking-aanvraag met je privésleutel (dat *moet* server-side — de sleutel mag nooit
in de browser) en geeft alleen de antwoorden door die de app nodig heeft.

> **Privacy:** zonder deze koppeling is Minder 100% lokaal. Mét de koppeling lopen je
> transacties via Enable Banking en je eigen Worker. Verder blijft alles in je browser staan.
> PSD2 verplicht je elke ~90 dagen opnieuw in te loggen bij je bank (SCA).

---

## Wat je nodig hebt (eenmalig, ~20 min)

1. Een gratis **Cloudflare**-account.
2. Een gratis **Enable Banking**-account (particulier/niet-commercieel mag).
3. **Node.js** op je pc (voor `npx wrangler`).

---

## Stap 1 — Enable Banking-applicatie aanmaken

1. Ga naar <https://enablebanking.com/> → **Control Panel** → maak een account.
2. Maak een **Application** aan:
   - **Environment:** kies *Production* voor je echte bank (of *Sandbox* om eerst te testen).
   - **Redirect URLs:** vul de URL van je app in, **exact**, bijv.
     `https://JOUWNAAM.github.io/Finance-APP/index.html`
     (dezelfde URL waarop je Minder opent; voeg er evt. ook `http://localhost:8765/index.html` aan toe voor lokaal testen).
   - Enable Banking genereert een **Application ID** en een **private key** (download de `.pem`).
3. Bewaar de **Application ID** en het **private key-bestand** — die gaan zo de Worker in.

## Stap 2 — Worker installeren

In een terminal, in deze map (`psd2-backend/`):

```bash
npm install -g wrangler        # of: npx wrangler ...
wrangler login                 # opent je browser, koppel je Cloudflare-account
```

Open `wrangler.toml` en zet bij `ALLOWED_ORIGIN` de origin van je app, bijv.
`https://JOUWNAAM.github.io` (zónder pad). `*` mag ook maar is minder veilig.

## Stap 3 — Secrets instellen

```bash
wrangler secret put EB_APP_ID
# plak je Enable Banking Application ID

wrangler secret put EB_PRIVATE_KEY
# plak de VOLLEDIGE inhoud van het .pem-bestand
# (inclusief de regels -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----)

wrangler secret put APP_TOKEN
# verzin een lang, willekeurig geheim (bv. 32+ tekens). Dit zet je straks ook in de app.
```

> Tip voor `EB_PRIVATE_KEY`: als plakken van meerdere regels lastig is, kun je het bestand
> ook pipen: `wrangler secret put EB_PRIVATE_KEY < private_key.pem`

## Stap 4 — Deployen

```bash
wrangler deploy
```

Je krijgt een URL terug, bijv. `https://minder-psd2.JOUWNAAM.workers.dev`.

## Stap 5 — App koppelen

In Minder → **Instellingen → 🔗 Live bankkoppeling (PSD2)**:

- **Backend-URL:** de Worker-URL uit stap 4.
- **App-token:** hetzelfde geheim als `APP_TOKEN`.
- Tik **Koppel je bank** → kies je bank → log in → je wordt teruggestuurd en de
  transacties worden automatisch ingelezen.

---

## Wat de Worker doet (endpoints)

| Methode | Pad | Doel |
|--------|-----|------|
| `GET`  | `/aspsps?country=NL` | lijst van banken |
| `POST` | `/auth` | start consent, geeft bank-redirect-URL |
| `POST` | `/sessions` | wissel `code` (uit redirect) in voor accounts |
| `GET`  | `/accounts/:uid/transactions` | transacties (gepagineerd) |
| `GET`  | `/accounts/:uid/balances` | saldo |

Alle verzoeken vereisen de header `Authorization: Bearer <APP_TOKEN>`.

## Veiligheid

- De privésleutel staat **alleen** als Cloudflare-secret, nooit in de app of in Git.
- De Worker accepteert alleen verzoeken met jouw `APP_TOKEN`.
- Zet `ALLOWED_ORIGIN` op je eigen app-origin zodra het werkt.
- **Commit deze secrets nooit** naar een publieke repo.

## Kosten

- Cloudflare Workers: gratis tier ruim voldoende (100k requests/dag).
- Enable Banking: gratis voor particulier/niet-commercieel gebruik.

## Sandbox eerst testen

Zet in stap 1 *Sandbox* en gebruik Enable Banking's testbank. Werkt het end-to-end,
maak dan een *Production*-applicatie en herhaal stap 3–5 met de nieuwe sleutel.
