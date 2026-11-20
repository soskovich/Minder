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

---

## v517 — Betaalmelding (push op je telefoon)

Naast het proxyen haalt de Worker nu **3x per dag** (rond 12:00, 17:00 en 20:30 Europe/Amsterdam)
zelf je nieuwe uitgaande boekingen op en stuurt per nieuwe boeking een **versleutelde** Web Push naar
je telefoon (RFC 8291 + VAPID, met Web Crypto; geen npm-dependency in de Worker). In KV staan **alleen**
je push-abonnement, je sessie/rekening-ID's, de **gehashte** ID's van de laatst geziene boekingen en de
tijd van de laatste ophaalronde — **geen bedragen, geen namen, geen saldi**. De cijfers (welk potje, hoeveel
er nog in zit) blijven op je telefoon: de app leest de melding uit een lokale snapshot.

Eenmalige extra opzet (naast de stappen hierboven), op Windows in `worker/`:

### 1. KV-namespace aanmaken

```powershell
npx wrangler kv namespace create MINDER_KV
```

Je krijgt een regel met een `id`. Plak die id in `wrangler.toml` onder `[[kv_namespaces]]`:

```toml
[[kv_namespaces]]
binding = "MINDER_KV"
id = "hierkomtdeid..."
```

### 2. VAPID-sleutels genereren

Dit doe je één keer, los van de Worker (geen dependency in de Worker zelf):

```powershell
npx web-push generate-vapid-keys
```

Je krijgt een **Public Key** en een **Private Key** (base64url).

- Zet de **Public Key** in `wrangler.toml` bij `VAPID_PUBLIC`.
- Zet bij `VAPID_SUBJECT` je eigen `mailto:` of een https-URL.

### 3. De privésleutel als secret

```powershell
npx wrangler secret put VAPID_PRIVATE
# plak de Private Key uit stap 2
```

### 4. Controleer `wrangler.toml`

- `ALLOWED_ORIGIN` staat op je app-origin (bv. `https://JOUWNAAM.github.io`), **niet** op `*`.
- `[triggers] crons` staat erin (6 regels: beide DST-offsets; de Worker rekent de Amsterdamse tijd uit).

### 5. Deployen

```powershell
npx wrangler deploy
```

### 6. In de app aanzetten

Minder → **Instellingen → 🔔 Meldingen → Betalingen melden**. De app maakt een push-abonnement, haalt de
publieke VAPID-sleutel op (`GET /push/vapid`) en meldt zich aan bij de Worker (`POST /push/aanmelden`) met je
rekening-UID's en tot wanneer de bank-toestemming geldig is. Uitzetten meldt zich af (`POST /push/afmelden`);
de Worker wist dan alles voor dat toestel.

### Nieuwe endpoints (v517, allemaal achter `Authorization: Bearer <APP_TOKEN>`)

| Methode | Pad | Doel |
|--------|-----|------|
| `POST` | `/push/aanmelden` | abonnement + rekening-UID's + geldig-tot opslaan |
| `POST` | `/push/afmelden` | alles voor dit toestel uit KV wissen |
| `GET`  | `/push/status` | wat er bewaard is (aantallen en datums; **geen** geheimen) |
| `GET`  | `/push/vapid` | de publieke VAPID-sleutel (publiek) |

### Verlopen sessie

PSD2 verloopt na ~90 dagen (SCA). Is de toestemming verlopen, dan stuurt de Worker niets meer en zet alleen de
status; de app ziet dat via `/push/status` en vraagt je opnieuw te koppelen.

### Live code vergelijken met wat er draait

```powershell
npx wrangler deployments list
npx wrangler versions view <versie-id>
```

Of in het dashboard: **Workers & Pages → minder-psd2 → Edit code**.
