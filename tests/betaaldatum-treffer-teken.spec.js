/* v278: het teken in meting 2 staat bij de treffer die betaalMoment() koos.
 *
 * DE AANLEIDING staat in de uitvoer van het toestel van 2026-09-27, op de Apple-boeking van 2026-09-02:
 *   veld 2026-09-02 03:04
 *   treffers: >"02.02.2026"   "02.02.2026"   "02.09.26/03:04"
 * Het veld komt uit de DERDE treffer en het teken stond op de eerste. De code was
 * `(i===0 && t.betaalDatum) ? '>' : ' '`, en dat was de tie-break van vóór v276: sindsdien wint de treffer
 * met een TIJD. Een teken dat de waarde ernaast tegenspreekt is precies wat dit project verbiedt, en het is
 * de meetles van v276 in mijn eigen code: bij een reparatie hoort de tekst eromheen mee.
 *
 * DE KEUZE KOMT UIT betaalMoment() EN NIET UIT EEN TWEEDE UITDRUKKING. De functie geeft op verzoek
 * `treffer` terug, naast de `reden` die er sinds v273 al stond, en het blok zoekt die string op in zijn
 * eigen treffer-lijst. Zou het blok "de eerste met een tijd" zelf nog eens opschrijven, dan is dat een
 * tweede waarheid over dezelfde desc (v104) en loopt hij bij de volgende herziening weer uiteen.
 *
 * WAT DEZE SPEC VASTLEGT, en elke bewering is een test (v260):
 *  - op de Apple-desc staat het teken op de treffer MET de tijd, en niet op de eerste. Deze test valt
 *    als het teken terug naar de eerste treffer gaat: dat is de sabotage die de reparatie afdekt;
 *  - bij twee treffers die BEIDE een tijd dragen (de Kiosk-vorm van v274) wint de eerste, dus daar staat
 *    het teken wel op de eerste, en de regel is dus een voorkeur voor een EIGENSCHAP en niet voor een
 *    positie;
 *  - een regel ZONDER veld noemt de treffer die is verworpen, want de tekst beweert dat en moet het niet
 *    aannemen;
 *  - het teken staat precies één keer per regel, want er is één gekozen treffer;
 *  - de drie teksten die "de eerste treffer" beweerden staan er niet meer.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const WO = new Date(now); WO.setDate(WO.getDate() - ((now.getDay() + 6) % 7) - 5);
const BINNEN = new Date(WO); BINNEN.setDate(BINNEN.getDate() - 28);   // binnen BETAALDATUM_VOOR (45)
const BUITEN = new Date(WO); BUITEN.setDate(BUITEN.getDate() - 60);   // erbuiten
const dd = (d) => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getFullYear()).slice(2);
const dd4 = (d) => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
const ABN = '999100200';

/* DE VORM VAN HET TOESTEL, letterlijk: twee keer de ingangsdatum zonder tijd en daarna het echte moment.
   De datums schuiven mee met vandaag, want een vaste datum kruipt naar het heden en laat deze spec na een
   tijd een ander geval toetsen dan hij beschrijft (v256). */
const apple = (start, boek) => 'eCom, TERUGKEREND PER ' + dd4(start) + ' APPLE.COM eCom, TERUGKEREND PER '
  + dd4(start) + ' APPLE.COM/BILL Betaalpas NR:00207013, ' + dd(boek) + '/03:04 CORK, Land: IRL';

function seed() {
  const tx = [];
  const add = (date, amount, src, name, desc) => tx.push({ id: 'x' + tx.length, date: ymd(date), amount,
    acc: ABN, src, name, desc, typ: '', ref: '', accName: '', refNums: [] });
  add(WO, 4000, 'mt940', 'Loonstrook', 'SALARIS MAANDELIJKS');
  // de Apple-desc van het toestel: drie treffers, alleen de laatste met een tijd
  add(WO, -1.09, 'psd2', 'APPLE.COM', apple(BINNEN, WO));
  // dezelfde vorm met de ingangsdatum BUITEN het venster: onder de oude regel viel hij volledig af
  add(WO, -2.09, 'psd2', 'APPLE.COM', apple(BUITEN, WO));
  // de Kiosk-vorm: BEIDE treffers dragen een tijd, dus daar wint de eerste en valt hij af op het venster
  add(WO, -16, 'psd2', 'Kiosk', 'BEA, BETAALPAS KIOSK NR:77, ' + dd(BUITEN) + '/12:00 EN ' + dd(WO) + '/13:00');
  /* TWEE TREFFERS ZONDER ENIGE TIJD, met een kaart-kenmerk: daar wint de EERSTE, want er is niets om op
     te kiezen. Zonder deze rij kan een teken dat "de eerste met een tijd" zoekt niet van de echte keuze
     worden onderscheiden, en dat was precies de sabotage die groen bleef. */
  add(WO, -33, 'psd2', 'Shell', 'BEA, BETAALPAS SHELL NR:77, ' + dd(WO) + ' KENMERK ' + dd(BUITEN));
  /* DE VORM DIE DE LIJST OP HET TOESTEL DOMINEERT (44 van de 52): een incasso met twee datums, geen tijd
     en GEEN kaart-kenmerk, dus de poort valt eruit VOORDAT er een treffer is gekozen. Dan hoort er geen
     teken te staan, want er is niets gekozen. */
  add(WO, -77, 'psd2', 'Belastingdienst', 'Belastingdienst SEPA Incasso algemeen doorlopend Incassant: '
    + 'NL35ZZZ273653230000 Omschrijving: J-6 ' + dd4(BUITEN) + ' termijn ' + dd4(WO));
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 4000,
      manualBal: { [ABN]: 3000 }, budgets: { boodschappen: 500, overig: 400, abonnement: 100 } }),
    minder_own: JSON.stringify([ABN]),
    minder_accmeta: JSON.stringify({ [ABN]: { balance: 3000, date: ymd(now), bank: 'ABN AMRO' } }),
    minder_plan: '{}' };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagDubbel === 'function' && typeof betaalMoment === 'function');
}

/* De uitgeschreven regels van meting 2, per bedrag opgezocht: de kop met het veld en de treffer-regel.
   HET ANKER IS HET HELE FRAGMENT `rek <acc>  <bedrag>   dagen: ` en niet het bedrag los: mijn eerste vorm
   zocht op het getal ergens in de regel, en "16" komt ook voor in een datum als 16.09.26, dus die pakte de
   verkeerde rij. Dat is dezelfde vindfout als een test die op een zin ankert. */
const regels = (page, bedrag) => page.evaluate((b) => {
  const t = TX.find((x) => x.amount === b);
  const anker = '  rek ' + t.acc + '  ' + Math.round(-Math.min(t.amount, 0) || t.amount) + '   dagen: ';
  const L = diagDubbel();
  const i = L.findIndex((x) => x.indexOf(anker) >= 0 && x.indexOf(String(t.date)) >= 0);
  return i < 0 ? null : { kop: L[i], treffers: L[i + 1], desc: L[i + 2] };
}, bedrag);

test.describe('0 - de fixture draagt de vorm van het toestel', () => {
  test('de Apple-desc draagt drie treffers waarvan alleen de laatste een tijd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const re = new RegExp(BETAALDATUM_RE.source, 'g');
      const m = [...String(TX.find((x) => x.amount === -1.09).desc).matchAll(re)];
      return { n: m.length, metTijd: m.map((x) => !!x[4]) };
    });
    expect(r.n).toBe(3);
    expect(r.metTijd).toEqual([false, false, true]);
  });

  /* ZONDER DIT IS ER NIETS TE ONDERSCHEIDEN: staat de gekozen treffer op index 0, dan zegt het teken
     hetzelfde als de oude code en bewijst de test niets (de familie van groene sabotages). */
  test('de gekozen treffer staat NIET op index 0, dus er is iets te onderscheiden', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const t = TX.find((x) => x.amount === -1.09);
      const re = new RegExp(BETAALDATUM_RE.source, 'g');
      const alle = [...String(t.desc).matchAll(re)].map((x) => x[0]);
      return { idx: alle.indexOf(betaalMoment(t, true).treffer), n: alle.length };
    });
    expect(r.n).toBe(3);
    expect(r.idx).toBe(2);
  });
});

test.describe('1 - het teken staat bij de gekozen treffer', () => {
  /* HET GEMETEN GEVAL. Met het teken terug op de eerste treffer valt deze test, en dat is precies de
     sabotage die de reparatie van v278 afdekt. */
  test('de Apple-regel markeert de treffer met de tijd en niet de eerste', async ({ page }) => {
    await boot(page);
    const r = await regels(page, -1.09);
    expect(r, 'de regel staat in meting 2').not.toBe(null);
    const velden = r.treffers.match(/[>\s]"[^"]+"/g).map((x) => x.trim());
    expect(velden.length).toBe(3);
    expect(velden[0].startsWith('>')).toBe(false);
    expect(velden[1].startsWith('>')).toBe(false);
    expect(velden[2].startsWith('>')).toBe(true);
    expect(velden[2]).toContain('/03:04');
    // en het veld in de kop is dezelfde dag met dezelfde tijd
    expect(r.kop).toContain('03:04');
  });

  test('ook de variant met de ingangsdatum buiten het venster markeert de treffer met de tijd', async ({ page }) => {
    await boot(page);
    const r = await regels(page, -2.09);
    const velden = r.treffers.match(/[>\s]"[^"]+"/g).map((x) => x.trim());
    expect(velden[2].startsWith('>')).toBe(true);
    expect(r.kop).toContain('03:04');
  });

  /* DE REGEL IS EEN VOORKEUR VOOR EEN EIGENSCHAP EN NIET VOOR EEN POSITIE: dragen beide treffers een
     tijd, dan wint de eerste, en dan staat het teken daar wel. Een teken dat altijd op de laatste
     treffer zou staan valt hierop. */
  test('met twee treffers met een tijd staat het teken op de eerste', async ({ page }) => {
    await boot(page);
    const r = await regels(page, -16);
    const velden = r.treffers.match(/[>\s]"[^"]+"/g).map((x) => x.trim());
    expect(velden.length).toBe(2);
    expect(velden[0].startsWith('>')).toBe(true);
    expect(velden[1].startsWith('>')).toBe(false);
  });

  /* ZONDER ENIGE TIJD WINT DE EERSTE, en dat is niet hetzelfde als "zoek de eerste met een tijd": die
     tweede vorm vindt hier niets. De sabotage die de keuze in het blok opnieuw uitdrukt bleef groen tot
     deze rij in de fixture stond. */
  test('een desc zonder enige tijd markeert de eerste treffer', async ({ page }) => {
    await boot(page);
    const r = await regels(page, -33);
    expect(r, 'de regel staat in meting 2').not.toBe(null);
    const velden = r.treffers.match(/[>\s]"[^"]+"/g).map((x) => x.trim());
    expect(velden.length).toBe(2);
    expect(velden[0].startsWith('>')).toBe(true);
    expect(velden[1].startsWith('>')).toBe(false);
    // geen van de TREFFERS draagt een tijd (het label 'treffers:' zelf draagt wel een dubbele punt)
    for (const v of velden) expect(v).not.toContain(':');
  });

  /* DE POORT KAN AL EERDER VALLEN, en dan is er niets gekozen en hoort er niets gemarkeerd. Dit is de vorm
     die de lijst op het toestel domineert, dus een teken dat hier toch verschijnt liegt over 44 regels. */
  test('een desc waarvan de poort eerder afviel markeert niets', async ({ page }) => {
    await boot(page);
    const r = await regels(page, -77);
    expect(r, 'de regel staat in meting 2').not.toBe(null);
    expect(r.kop).toContain('geen veld: geen kaart-kenmerk');
    expect(r.treffers).not.toContain('>');
    const bm = await page.evaluate(() => betaalMoment(TX.find((x) => x.amount === -77), true));
    expect(bm.treffer).toBe('');
  });

  test('het teken staat precies een keer per regel, behalve waar niets gekozen is', async ({ page }) => {
    await boot(page);
    for (const b of [-1.09, -2.09, -16, -33]) {
      const r = await regels(page, b);
      expect((r.treffers.match(/>/g) || []).length, 'bedrag ' + b).toBe(1);
    }
    expect(((await regels(page, -77)).treffers.match(/>/g) || []).length).toBe(0);
  });

  /* EEN REGEL ZONDER VELD NOEMT DE VERWORPEN TREFFER, want de tekst boven de lijst zegt dat de gekozen
     treffer is verworpen, en dat moet uit de bron komen en niet uit een aanname. */
  test('een verworpen treffer wordt gemarkeerd en de reden staat erbij', async ({ page }) => {
    await boot(page);
    const r = await regels(page, -16);
    expect(r.kop).toContain('geen veld: buiten het venster');
    const bm = await page.evaluate(() => betaalMoment(TX.find((x) => x.amount === -16), true));
    expect(bm.treffer).toBeTruthy();
    expect(r.treffers).toContain('>"' + bm.treffer + '"');
  });
});

test.describe('2 - de bron', () => {
  /* DE KEUZE STAAT OP EEN PLEK. Drukt het blok "de eerste met een tijd" zelf nog eens uit, dan is dat een
     tweede waarheid over dezelfde desc (v104) en loopt hij bij de volgende herziening weer uiteen. */
  test('de tie-break staat alleen in betaalMoment en niet in het blok', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const n = (src.match(/\.find\(x=>x\[4\]\)/g) || []).length;
    expect(n, 'de tie-break staat ' + n + ' keer in de bron').toBe(1);
    const i = src.indexOf('function betaalMoment(t, metReden){');
    const j = src.indexOf('\nfunction categorize(t){', i);
    expect(src.slice(i, j)).toMatch(/\.find\(x=>x\[4\]\)/);
  });

  /* DE DRIE TEKSTEN DIE "DE EERSTE TREFFER" BEWEERDEN. Ze zijn geschreven bij het gedrag van vóór v276 en
     spraken sindsdien de uitvoer ernaast tegen. */
  test('geen tekst in het blok belooft nog dat de eerste treffer wint', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const i = src.indexOf('function diagDubbel(){');
    const j = src.indexOf('\nconst DIAG_BLOKKEN=[', i);
    const blok = src.slice(i, j);
    expect(blok).not.toContain('de eerste treffer wint');
    expect(blok).not.toContain('de eerste treffer is verworpen');
    expect(blok).toContain('de treffer met een tijd wint, anders de eerste');
    expect(blok).toContain('de treffer die betaalMoment() koos');
  });

  test('het blok schrijft niets weg', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const echt = localStorage.setItem.bind(localStorage); let n = 0;
      localStorage.setItem = function () { n++; return echt.apply(localStorage, arguments); };
      try { diagDubbel(); } finally { localStorage.setItem = echt; }
      return n;
    });
    expect(r).toBe(0);
  });
});
