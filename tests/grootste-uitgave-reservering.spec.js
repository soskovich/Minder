/* v308: een uitgave die uit een reservering is betaald telt niet als losse uitgave.
 *
 * GEMELD op 30 september, op Inzichten en op hetzelfde scherm:
 *   stand-kaart: "+ €463 belasting & boetes, uit een reservering"
 *   Wat opvalt:  "Grootste uitgave · €500 (CJIB Verkeersboetes). Een winkel domineert je losse
 *                 uitgaven."
 * Twee dingen fout in die tweede regel. Het bedrag telt de €463 mee die je zelf als "uit een
 * reservering betaald" hebt vastgelegd (v269), en de zin noemt een winkel terwijl de app alleen een
 * NAAM meet (cleanMerch) en CJIB geen winkel is.
 *
 * DE OORZAAK, gemeten: catSpendMap() trok het gevlagde deel af in zijn EIGEN lus, dus die ene
 * uitdrukking stond niet buiten die functie. piekVerdeling() en de winkel-som van signaal 4 telden
 * daarom het volle bedrag. uitgaveNorm() is nu die ene uitdrukking, met drie lezers.
 *
 * WAAROM DE PIEKDAG MEE MOEST, en dat is gemeten en niet beredeneerd: sluit je de vlag alleen in
 * signaal 4 uit, dan valt `dom` weg, en dan vervalt ook de tegentest van v239 die de piekdag
 * tegenhoudt als een winkel al een regel draagt. GEMETEN op deze fixture verscheen dan
 *   "Piekdag · dinsdag €500 (normaal €166). Ongeveer 69% van je losse geld ging op dinsdag"
 * op precies dezelfde boekingen. De leugen verhuist dan een regel naar boven.
 *
 * DE FIXTURE IS GECONSTRUEERD op de twee bedragen uit de melding: een naam die in de maand €500
 * draagt waarvan €463 uit een reservering komt. De kleine boekingen eromheen zijn wat de telpoort
 * (minstens vijf losse afschrijvingen) en de mediaan nodig hebben.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
/* v326: de piekdag vuurt pas vanaf PIEK_MIN_DAGEN (14) verstreken dagen, dus deze spec pint een dag
   na de veertiende. pinDag() laat zeven dagen over en blijft in de echte maand (v299). */
const { pinDag } = require('./vaste-dag');
const fs = require('fs');
const path = require('path');
const { kaalBron, kaalUit, KAAL_JS } = require('./bron-kaal');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const DEZE = ym(now);
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const ACC = '100110012555096222';
const NAAM = 'CJIB Verkeersboetes';
const BOETES = [313, 150, 37];              // samen 500, waarvan 463 gevlagd
const GEVLAGD = 463, REST = 37;

/* v308: EEN TWEEDE STAND VOOR DE TELPOORT. De telpoort van signaal 4 eist minstens vijf losse
   afschrijvingen, en in de stand hierboven blijven er na het vlaggen zeven over: dan is een
   telpoort die de vlag leest niet te onderscheiden van een die hem negeert. Deze stand houdt er
   maar zes, waarvan drie volledig gedekt, en er is een andere naam die na het vlaggen de mediaan
   ruim overtreft. Met de vlag in de telpoort zwijgt het signaal omdat de maand te weinig losse
   uitgaven draagt; zonder de vlag vuurt het op die andere naam. */
const SMAL = { boekingen: [[-200, 'Albert Heijn'], [-10, 'Kruidvat'], [-12, 'Etos']] };

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (d, a, n, desc) => tx.push({ id: 'x' + tx.length, date: d, amount: a, acc: ACC,
    name: n, desc: desc || n, typ: '', ref: '', src: 'psd2', accName: '', refNums: [] });
  for (let i = 5; i >= 0; i--) {
    const m = M(i);
    add(m + '-25', 5216, 'Loonstrook', 'SALARIS MAANDELIJKS');
    add(m + '-01', -1450, 'Woningstichting', 'SEPA INCASSO HUUR WONINGSTICHTING');
    if (o.boekingen) { for (const b of o.boekingen) add(m + '-06', b[0], b[1]); }
    else {
      add(m + '-06', -40, 'Albert Heijn'); add(m + '-14', -40, 'Albert Heijn'); add(m + '-21', -40, 'Albert Heijn');
      add(m + '-09', -50, 'Shell'); add(m + '-17', -30, 'Cafe De Kroon'); add(m + '-11', -25, 'Kruidvat');
    }
  }
  for (const b of BOETES) add(DEZE + '-22', -b, NAAM, 'CJIB BOETE ' + b);
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, mode: 'begeleid', autoIncome: true, bufferNorm: 3,
      manualBal: { [ACC]: 4200 },
      budgets: { boodschappen: 700, huur: 1450, vervoer: 120, uiteten: 150, belasting: 100 },
      budgetMonth: DEZE }),
    minder_own: JSON.stringify([ACC]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, o) {
  await pinDag(page);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof insSignals === 'function');
}

// jij wijst de boeking aan, de app matcht niet (v269): de twee grote boetes worden gevlagd
const vlag = (page) => page.evaluate(() => {
  const b = TX.filter((t) => /CJIB/.test(t.name) && t.date.slice(0, 7) === thisYM() && -t.amount > 100);
  for (const t of b) zetUitReservering(t.id, -t.amount, false);
  return b.length;
});

const meet = (page) => page.evaluate((naam) => {
  const m = thisYM(), los = piekScope(m);
  let norm = 0, ruw = 0;
  for (const x of los) { if ((cleanMerch(x.name) || x.name) !== naam) continue;
    norm += uitgaveNorm(x); ruw += -x.amount; }
  const V = piekVerdeling(m), ref = piekReferentie(m);
  const P = V && ref ? piekVuurt(V, ref) : null;
  const sig = insSignals(m, new Set());
  const dom = sig.find((s) => s.kpiLabel === 'Grootste uitgave') || null;
  return { norm: Math.round(norm), ruw: Math.round(ruw),
    telpoort: los.filter((x) => uitgaveNorm(x) > 0).length,
    afschrijvingen: los.filter((x) => x.amount < 0).length,
    vN: V && V.n, piek: P ? { dag: P.peak, bedrag: Math.round(P.bedrag), share: P.share } : null,
    dom: dom ? { val: dom.kpiVal, sub: dom.kpiSub, hyp: dom.hyp } : null,
    labels: sig.map((s) => s.kpiLabel),
    belasting: Math.round(catSpendMap(m).belasting || 0) };
}, NAAM);

test.describe('a · de gemelde regel', () => {
  test('zonder de vlag staat de gemelde regel er, met het volle bedrag', async ({ page }) => {
    await boot(page);
    const r = await meet(page);
    // de invoer: de naam draagt werkelijk 500 in deze maand en de telpoort is open
    expect(r.ruw).toBe(BOETES.reduce((a, b) => a + b, 0));
    expect(r.afschrijvingen).toBeGreaterThanOrEqual(5);
    expect(r.dom).not.toBeNull();
    expect(r.dom.val).toBe('€500');
    expect(r.dom.sub).toBe(NAAM);
  });

  test('met de vlag telt alleen het ongedekte deel, en de regel valt weg', async ({ page }) => {
    await boot(page);
    expect(await vlag(page)).toBe(2);
    const r = await meet(page);
    expect(r.belasting).toBe(REST);            // v269 deed dit al voor de potjes
    expect(r.norm).toBe(REST);                 // en nu ook voor de losse uitgaven
    expect(r.ruw).toBe(REST + GEVLAGD);        // het bedrag zelf is onaangeroerd
    expect(r.dom).toBeNull();
    expect(r.labels).not.toContain('Grootste uitgave');
  });

  /* HET IS EEN BEDRAG EN GEEN JA/NEE (v269): vlag je maar een deel, dan telt de rest gewoon mee.
     Zonder dit geval is "het gevlagde deel valt weg" niet te onderscheiden van "de hele boeking
     valt weg". */
  test('een deel vlaggen laat de rest staan', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const t = TX.find((x) => /CJIB/.test(x.name) && x.date.slice(0, 7) === thisYM() && -x.amount === 313);
      zetUitReservering(t.id, 200, false);
    });
    const r = await meet(page);
    expect(r.norm).toBe(500 - 200);
    expect(r.dom).not.toBeNull();
    expect(r.dom.val).toBe('€300');
  });
});

test.describe('b · de piekdag telt hetzelfde bedrag, anders verhuist de regel', () => {
  test('zonder de vlag draagt de piekdag die boekingen, en de tegentest houdt hem tegen', async ({ page }) => {
    await boot(page);
    const r = await meet(page);
    // de dag van de boetes is de piek, en hij vuurt: dat is wat de tegentest van v239 tegenhoudt
    expect(r.piek).not.toBeNull();
    expect(r.piek.bedrag).toBe(500);
    expect(r.labels).not.toContain('Piekdag');     // want de grootste uitgave draagt hem al
  });

  test('met de vlag zwijgen ze allebei, en niet een van de twee', async ({ page }) => {
    await boot(page);
    await vlag(page);
    const r = await meet(page);
    expect(r.piek).toBeNull();
    expect(r.labels).not.toContain('Piekdag');
    expect(r.labels).not.toContain('Grootste uitgave');
  });

  /* DE TELPOORT LEEST DEZELFDE UITDRUKKING ALS DE SOMMEN: een boeking die volledig uit een
     reservering is betaald draagt nul in de verdeling, dus hij telt niet mee in het minimum. */
  test('de telpoort zakt met de volledig gedekte boekingen mee', async ({ page }) => {
    await boot(page);
    const voor = await meet(page);
    await vlag(page);
    const na = await meet(page);
    expect(voor.telpoort).toBe(voor.afschrijvingen);
    expect(na.telpoort).toBe(voor.telpoort - 2);
    expect(na.afschrijvingen).toBe(voor.afschrijvingen);   // de boekingen staan er nog
    expect(na.vN).toBe(na.telpoort);
  });

  /* ZONDER DEZE STAND IS DE TELPOORT INERT: hierboven blijven er na het vlaggen zeven
     afschrijvingen over, en dat is nog steeds boven het minimum, dus daar verandert de poort niets.
     GEMETEN: de sabotage die de telpoort op x.amount<0 terugzet bleef op die stand groen. */
  test('een maand die zonder de gedekte boekingen te weinig losse uitgaven draagt, zwijgt', async ({ page }) => {
    await boot(page, SMAL);
    const voor = await meet(page);
    // de invoer: de poort staat open en er is een andere naam die de mediaan ruim overtreft
    expect(voor.afschrijvingen).toBe(6);
    await page.evaluate(() => {
      const b = TX.filter((t) => /CJIB/.test(t.name) && t.date.slice(0, 7) === thisYM());
      for (const t of b) zetUitReservering(t.id, -t.amount, false);
    });
    const na = await meet(page);
    expect(na.afschrijvingen).toBe(6);        // de boekingen staan er nog
    expect(na.telpoort).toBe(3);              // maar drie ervan dragen geen norm-uitgave meer
    expect(na.dom).toBeNull();
    /* en zonder de vlag in de telpoort zou hij WEL vuren, want de overgebleven namen halen de
       mediaan-eis: dat is het geval dat de twee vormen onderscheidt */
    const zonder = await page.evaluate(() => {
      const m = thisYM(), los = piekScope(m);
      const byM = {};
      for (const x of los) { const nm = cleanMerch(x.name) || x.name || 'onbekend';
        byM[nm] = (byM[nm] || 0) + uitgaveNorm(x); }
      const arr = Object.entries(byM).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      const vals = arr.map((e) => e[1]).sort((a, b) => a - b);
      const med = vals[Math.floor(vals.length / 2)] || 0;
      return { top: arr[0] && Math.round(arr[0][1]), med: Math.round(med),
        haalt: !!(arr.length && med > 0 && arr[0][1] >= med * 4 && arr[0][1] >= 40) };
    });
    expect(zonder.haalt).toBe(true);
  });
});

test.describe('c · de zin claimt geen winkel', () => {
  test('de duiding noemt een naam en niet een soort bedrijf', async ({ page }) => {
    await boot(page);
    const r = await meet(page);
    expect(r.dom.hyp).toBe('Eén naam draagt een groot deel van je losse uitgaven.');
    expect(r.dom.hyp).not.toMatch(/winkel/i);
    // de naam staat al in de sub, dus de zin noemt hem niet nog een keer
    expect(r.dom.hyp).not.toContain(NAAM);
  });

  test('geen enkele duiding in insSignals noemt nog een winkel', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const i = src.indexOf('function insSignals(');
    expect(i).toBeGreaterThan(-1);
    const eind = src.indexOf('\nfunction ', i + 10);
    const body = src.slice(i, eind);
    const kaal = kaalBron(body);   // v309: de gedeelde strip (tests/bron-kaal.js)
    expect(kaal).not.toMatch(/winkel/i);
  });
});

test.describe('d · een uitdrukking, drie lezers', () => {
  test('catSpendMap, piekVerdeling en signaal 4 lezen uitgaveNorm', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const sc = src.slice(src.indexOf('<script'), src.lastIndexOf('</script>'));
    expect((sc.match(/function uitgaveNorm\(/g) || []).length).toBe(1);
    const fn = (naam) => { const i = sc.indexOf('\nfunction ' + naam + '(');
      expect(i, naam + ' niet gevonden').toBeGreaterThan(-1);
      let d = 0;
      for (let k = sc.indexOf('{', i); k < sc.length; k++) {
        if (sc[k] === '{') d++; else if (sc[k] === '}') { d--; if (!d) return sc.slice(i, k + 1); } }
      return sc.slice(i); };
    for (const naam of ['catSpendMap', 'piekVerdeling', 'insSignals'])
      expect(fn(naam), naam + ' leest de uitdrukking niet').toContain('uitgaveNorm(');
    // en geen van de drie telt het volle bedrag nog zelf op
    for (const naam of ['catSpendMap', 'piekVerdeling'])
      expect(fn(naam), naam + ' telt het volle bedrag op').not.toMatch(/\+=\s*-\s*\w+\.amount/);
  });
});
