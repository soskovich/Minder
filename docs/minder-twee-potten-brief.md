# Minder module: twee-potten-architectuur (vloer + klim)

Briefing voor Claude Code. Dutch, je-vorm, geen em-dashes, geen emoji, geen gamification.
De AI is een eerlijke spiegel, geen cheerleader. Elke keuze blijft bij de gebruiker.

---

## 1. Doel

Minder splitst spaargeld in twee gescheiden potten die elk een andere vraag beantwoorden:

- **Vloer (noodfonds)**: belastbaarheid. Gemeten in maanden dekking. Cash, groeit niet mee, telt niet als vrijheid.
- **Klim (vermogensreis)**: vrijheid. Gemeten in jaren tot financiele onafhankelijkheid. Belegd, compoundt, voedt Vermogensreis en Monte Carlo.

De reden dat dit een aparte architectuur wordt en geen optelsom: mensen maken twee klassieke fouten. Ze tellen veiligheidsgeld mee als vrijheidsvoortgang (te optimistisch), of ze plunderen de vrijheidspot bij tegenslag (te onbeschermd). De muur tussen de potten voorkomt allebei.

De diepere laag onder het spaarquote-verhaal landt hier: de vloer draagt de dubbele hefboom in omgekeerde vorm (lagere lasten verkleinen de vloer en versnellen de klim in een beweging), de klim draagt de curve (spaarquote bepaalt niet-lineair hoeveel jaren tot vrijheid).

---

## 2. Kernconcepten

**Koppelvariabele.** Vaste maandlasten sturen beide potten aan. Een verlaging van je lasten is daarom geen kleine besparing maar een dubbele verschuiving: de vloer wordt lager en de finish komt dichterbij, tegelijk.

**Cascade.** Instroom vult eerst de vloer, pas daarna de klim. Zolang de vloer niet staat, bouw je geen vrijheid, en de app doet ook niet alsof.

**De muur (mental accounting).** De potten vallen nergens tegen elkaar weg. Geen samenvattend getal telt vloer en klim bij elkaar op. De vloer is liquide, de klim is stroef. Geld van de vloer halen is een expliciete gebeurtenis, geen transfer. Dat verschil in stroefheid is functioneel, niet cosmetisch.

---

## 3. Datamodel

Twee inputgetallen, beide uit bestaande Minder-data. Verder wordt niets dubbel opgeslagen: alle doelen en statussen leiden zich af.

```js
state.potten = {
  input: {
    vasteMaandlasten: 0,        // stuurt de vloer (vaste lasten die je in nood moet dekken)
    vrijheidMaanduitgaven: 0,   // stuurt de klim (default: gemiddelde werkelijke maanduitgaven)
    onttrekking: 0.04,          // 4%-regel, aanpasbaar
    reeelRendement: 0.05        // aanname voor jaren-berekening
  },
  vloer: {
    saldo: 0,
    doelMaanden: 6              // gewenste dekking
  },
  klim: {
    saldo: 0
  },
  config: {
    splitBijVullen: 0           // 0 = strikte cascade. 0.2 = 20% naar klim tijdens vullen.
  }
}
```

Let op het onderscheid tussen `vasteMaandlasten` (vloer) en `vrijheidMaanduitgaven` (klim). De vloer dekt overleven, de klim financiert het leven dat je in vrijheid wilt volhouden. Dat zijn twee verschillende bedragen. Forceer ze niet in een.

---

## 4. Afgeleide berekeningen (leiden live uit de koppelvariabele)

Centraliseer deze in een enkele module, in lijn met de netto-berekening-refactor. Nergens dupliceren.

```js
function afgeleidePotten(p) {
  const { vasteMaandlasten, vrijheidMaanduitgaven, onttrekking, reeelRendement } = p.input;

  // Vloer, in maanden
  const vloerDoelBedrag = p.vloer.doelMaanden * vasteMaandlasten;
  const vloerDekking     = vasteMaandlasten > 0 ? p.vloer.saldo / vasteMaandlasten : 0; // maanden
  const vloerTekort      = Math.max(0, vloerDoelBedrag - p.vloer.saldo);
  const vloerVol         = p.vloer.saldo >= vloerDoelBedrag;

  // Klim, in jaren
  const klimDoelBedrag = (vrijheidMaanduitgaven * 12) / onttrekking; // bij 4%: 25 x jaaruitgaven
  const jaarInstroom   = schatJaarInstroom(p);                       // uit vooruitblik, 12 x gem. instroom naar klim
  const jaren          = jarenTotVrijheid(p.klim.saldo, jaarInstroom, klimDoelBedrag, reeelRendement);

  return {
    vloer: {
      doelBedrag: Math.round(vloerDoelBedrag),
      dekkingMaanden: +vloerDekking.toFixed(1),
      tekort: Math.round(vloerTekort),
      vol: vloerVol,
      voortgang: vloerDoelBedrag > 0 ? Math.min(1, p.vloer.saldo / vloerDoelBedrag) : 0
    },
    klim: {
      doelBedrag: Math.round(klimDoelBedrag),
      jaren: jaren === Infinity ? null : +jaren.toFixed(1)
    }
  };
}
```

**Jaren tot vrijheid, met bestaand saldo.** Gesloten vorm werkt vanaf nul; met een bestaand saldo los je numeriek op. Bisectie is genoeg.

```js
function jarenTotVrijheid(saldo, jaarInstroom, doel, r) {
  if (saldo >= doel) return 0;
  if (jaarInstroom <= 0 && saldo * (1 + r) <= saldo) return Infinity; // geen instroom, geen groei richting doel
  const fv = (n) => saldo * Math.pow(1 + r, n)
                    + jaarInstroom * (Math.pow(1 + r, n) - 1) / r;
  let lo = 0, hi = 100;
  if (fv(hi) < doel) return Infinity; // binnen 100 jaar niet haalbaar bij deze aannames
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (fv(mid) < doel) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
```

**Curve-referentiepunt (voor de spiegel).** Om "op X procent sta je op Z jaar" te tonen los van het huidige saldo, gebruik de gesloten vorm vanaf nul:

```js
function jarenBijSpaarquote(s, r = 0.05, w = 0.04) {
  if (s <= 0) return Infinity;
  if (s >= 1) return 0;
  return Math.log(1 + (r * (1 - s)) / (w * s)) / Math.log(1 + r);
}
```

Dit is het getal achter de curve. Gebruik het om het gevolg van een hogere of lagere spaarquote te spiegelen, niet als de officiele prognose (die komt uit `jarenTotVrijheid` met echt saldo).

---

## 5. De cascade

```js
function verdeelInstroom(instroom, vloerTekort, config) {
  if (instroom <= 0) return { naarVloer: 0, naarKlim: 0, tekort: instroom };
  if (vloerTekort <= 0) return { naarVloer: 0, naarKlim: instroom, tekort: 0 };

  if (config.splitBijVullen === 0) {
    const naarVloer = Math.min(instroom, vloerTekort);
    return { naarVloer, naarKlim: instroom - naarVloer, tekort: 0 };
  }

  const naarKlim = Math.round(instroom * config.splitBijVullen);
  const rest = instroom - naarKlim;
  const naarVloer = Math.min(rest, vloerTekort);
  return { naarVloer, naarKlim: naarKlim + (rest - naarVloer), tekort: 0 };
}
```

Strikte cascade (`splitBijVullen: 0`) is de eerlijke standaard. Zet de gebruiker een split aan terwijl de vloer nog vult, dan benoemt de spiegel de trade-off: je bouwt vrijheid op een fundament dat nog niet af is. De keuze blijft bij de gebruiker.

---

## 6. De vijf toestanden (spiegel -> gevolg -> keuze)

Elke toestand krijgt een eigen spiegeltekst. Geen aanmoediging, geen oordeel, alleen het beeld en het gevolg. Getallen hieronder zijn placeholders uit de afgeleide waarden.

### Toestand 1: vloer onder doel, instroom positief
- **Spiegel:** je vloer staat op {dekking} van je gewenste {doelMaanden} maanden. Je instroom van {instroom} gaat deze maand volledig naar je vloer.
- **Gevolg:** zolang je vloer niet vol is, telt nog niets mee voor je vrijheidsjaren. Je bouwt nu bodem, geen speelruimte.
- **Keuze:** doorgaan met vullen, of je doelMaanden bijstellen als zes voor jou te ruim of te krap is.

### Toestand 2: vloer vol, instroom positief
- **Spiegel:** je vloer is compleet op {doelMaanden} maanden. Je instroom van {instroom} gaat nu naar je klim.
- **Gevolg:** bij je huidige spaarquote van {spaarquote} sta je op ongeveer {jaren} jaar tot vrijheid. Een euro per maand meer verschuift dat merkbaar, want de curve is steil aan jouw kant.
- **Keuze:** bij jou. Meer naar de klim betekent eerder vrij, minder betekent meer nu.

### Toestand 3: instroom negatief (tekortmaand)
- **Spiegel:** deze maand gaf je {bedrag} meer uit dan er binnenkwam. Er gaat niets naar je potten.
- **Gevolg:** als je dit tekort uit je vloer haalt, daalt je dekking van {dekkingVoor} naar {dekkingNa} maanden. Je klim staat stil, hij wordt niet aangesproken.
- **Keuze:** het tekort uit de vloer dekken, of elders in je maand ruimte vinden. De vloer is er precies voor dit moment.

### Toestand 4: vloer aangesproken (dekking onder doel gezakt)
- **Spiegel:** je vloer is gezakt naar {dekking} maanden, onder je doel van {doelMaanden}. Je klim staat op pauze.
- **Gevolg:** de cascade herprioriteert: komende instroom vult eerst je vloer weer aan voordat je klim verder bouwt. Je vrijheidsjaren staan zolang stil.
- **Keuze:** vloer eerst herstellen (de standaard), of bewust een deel naar de klim laten lopen en accepteren dat je bodem langer dun blijft.

### Toestand 5: maandlasten wijzigen
- **Spiegel:** je vaste maandlasten gaan van {oud} naar {nieuw}. Dat verschuift beide potten tegelijk.
- **Gevolg:** je vloerdoel wordt {vloerVoor} naar {vloerNa}, en je vrijheidsfinish verschuift van {jarenVoor} naar {jarenNa} jaar. Bij een verlaging kan een deel van je volle vloer vrijkomen richting je klim.
- **Keuze:** het vrijgekomen bedrag doorschuiven naar de klim, of je hogere dekking houden. Dit is de dubbele hefboom, live.

---

## 7. Integratiehaken

- **Vooruitblik:** toont beide potten in eigen eenheid. Vloer als maanden-dekking met voortgang naar doelMaanden. Klim als jaren-tot-vrijheid op de curve. Plus de cascade-status ("instroom gaat nu 100 procent naar je vloer"). Levert ook `jaarInstroom` aan via `schatJaarInstroom` (12 x gemiddelde instroom naar de klim).
- **Vermogensreis en Monte Carlo:** voeden zich uitsluitend uit `klim.saldo`. De vloer zit in cash, groeit niet mee, telt niet in het 25x-doel omdat hij geoormerkt is.
- **aankoopFluister:** extra signaal. Een aankoop die je onder je vloer zou duwen weegt zwaarder dan een gewone, want je geeft je bodem uit, niet je speelruimte. Toon zowel "geen budget, geen aankoop" als de vrijheidsprijs (deze vaste last van X is 25 x X aan vermogen dat je moet opbouwen).
- **Ratchet-detector:** stijgt het inkomen, dan spiegelt de vooruitblik of de spaarquote meesteeg of het leven duurder werd. De loonsverhoging-paradox als signaal.
- **Brug naar Dragen:** de vloer-in-maanden is dezelfde belastbaarheid-vs-belasting logica als Dragen, maar financieel. Houd de vloer-eenheid (maanden) bewust gelijk zodat de twee apps conceptueel op elkaar aansluiten.

---

## 8. Ontwerp en constraints

- Geen samenvattend getal dat vloer en klim optelt. De muur is heilig.
- Vloer in maanden, klim in jaren. Nooit door elkaar.
- Strikte cascade als default. Split alleen op expliciete keuze, met benoemde trade-off.
- Visuele identiteit ongewijzigd: bijna-zwart `#0a0f1a`, teal accent `#2dd4bf`, tabulaire cijfers, platte cards met haarlijnrand.
- Geen gamification, geen badges, geen aanmoediging. Spiegel -> gevolg -> keuze.
- Alle op het scherm getoonde getallen afronden (`Math.round`, `toFixed`). Geen float-artefacten.
- Rond af met `check.js` en Playwright-persona's voor de vijf toestanden.

---

## 9. Prompt voor Claude Code (plak-klaar)

```
Lees deze brief volledig voordat je code schrijft: minder-twee-potten-brief.md.

Doel: voeg een twee-potten-architectuur toe aan Minder. Een vloer (noodfonds,
gemeten in maanden dekking, cash, telt niet als vrijheid) en een klim
(vermogensreis, gemeten in jaren tot vrijheid, belegd, voedt Vermogensreis en
Monte Carlo). De potten zijn strikt gescheiden (mental accounting): geen
samenvattend getal telt ze op, de vloer is liquide, de klim is stroef.

Stappen:
1. Voeg state.potten toe volgens sectie 3. Twee inputgetallen
   (vasteMaandlasten, vrijheidMaanduitgaven), verder alles afgeleid.
2. Bouw de afgeleide-module uit sectie 4 (afgeleidePotten, jarenTotVrijheid,
   jarenBijSpaarquote). Centraliseer, dupliceer niets, in lijn met de
   netto-berekening-refactor.
3. Implementeer de cascade uit sectie 5. Strikte cascade als default.
4. Implementeer de vijf toestanden uit sectie 6 als spiegel -> gevolg -> keuze
   teksten, met de placeholders gevuld uit de afgeleide waarden.
5. Koppel de integratiehaken uit sectie 7 (vooruitblik, Vermogensreis,
   aankoopFluister, ratchet-detector).

Constraints: Dutch, je-vorm, geen em-dashes, geen emoji, geen gamification,
geen aanmoediging. Visuele identiteit ongewijzigd (#0a0f1a, #2dd4bf, tabulaire
cijfers, platte cards). Rond alle getoonde getallen af. Eerlijke spiegel, geen
cheerleader. Elke keuze blijft bij de gebruiker.

Sluit af: draai check.js en schrijf Playwright-persona's die alle vijf
toestanden doorlopen. Rapporteer welke ontwerpgaten je nog ziet voordat we
deployen.
```
