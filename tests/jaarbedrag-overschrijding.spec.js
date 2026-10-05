/* v313: HET JAARBEDRAG ONDER EEN OVERSCHRIJDING IN "WAT OPVALT".
 *
 * WAT DE REGEL DOET: onder elke rij uit `valtOpSignals()` staat "Als dit elke maand gebeurt, is dat
 * EUR X per jaar.", met X het bedrag boven het potje maal twaalf. Alleen daar: een patroon, de
 * piekdag en het lek meten geen bedrag boven een grens, dus daar is er niets om maal twaalf te doen.
 *
 * DE EIGENSCHAP DIE VASTLIGT is dat de regel HETZELFDE GETAL leest als de rij erboven (`v240`: een
 * signaal toont de maat waarop het vuurt) en niet een tweede afleiding (`v104`). Dat is NIET te
 * toetsen via de echte route, en dat is gemeten en geen voorzorg: `valtOpSignals()` zet
 * `over = uitgegeven - potje` over al afgeronde bedragen, dus een sabotage die opnieuw aftrekt geeft
 * daar exact hetzelfde getal (meetles p, de code onder test aan beide kanten van de vergelijking).
 * Wat de twee vormen WEL onderscheidt is een object waarin ze uiteenlopen, en `valtOpRij()` is een
 * pure render-functie, dus blok c roept hem daar rechtstreeks mee aan. Dat geval is GECONSTRUEERD en
 * niet gemeten, om dezelfde reden als de Kiosk-regel van `v274`.
 *
 * DE VASTE DAG IS NODIG: `valtOpSignals()` leest alleen de LOPENDE maand en de fixture bouwt zijn
 * maandsleutels in Node, dus de pin en `vasteDatum()` gaan samen (v299/v310).
 */
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum, DAGEN_OVER } = require('./vaste-dag');
const { kaalBron, kaalUit } = require('./bron-kaal');
const fs = require('fs');
const path = require('path');

const MAIN = 'NL01MAIN0000001111';
const NU = vasteDatum(DAGEN_OVER);
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(NU);
const M = (n) => ym(new Date(NU.getFullYear(), NU.getMonth() - n, 1));

/* DE GEMELDE STAND: Boodschappen EUR 484 van een potje van EUR 400, dus 84 boven het potje en
   84 x 12 = 1.008 per jaar. De historie staat erbij zodat recurringCats() en de patroonbronnen
   kunnen draaien; huur heeft een potje zodat hij buiten varBudget valt en niets verschuift. */
function seed(opt) {
  opt = opt || {};
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds) => tx.push({ id: 'x' + (i++), date: m + '-' + d, amount: a,
    acc: MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const n of [3, 2, 1]) { const m = M(n);
    add(m, '25', 4000, 'Werkgever', 'SALARIS LOON');
    add(m, '28', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '05', -180, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '12', -60, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
  }
  add(CUR, '03', -200, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add(CUR, '07', -164, 'Jumbo', 'BEA, BETAALPAS JUMBO');
  add(CUR, '11', -120, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  /* opt.lek: een losse aankoop in een categorie ZONDER potje, zodat de tweede plek een
     patroon- of lekregel wordt in plaats van een tweede overschrijding. */
  if (opt.lek) add(CUR, '09', -340, 'Mediamarkt', 'BEA, BETAALPAS MEDIAMARKT');
  /* opt.tweede: een tweede overschrijding, voor het zwaarste geval van de vouw-meting. */
  if (opt.tweede) {
    add(CUR, '02', -1480, 'Overboeking Jan', 'BEA, BETAALPAS OVERBOEKING JAN');
    add(CUR, '04', -1390, 'Basic-Fit', 'SEPA INCASSO BASIC FIT');
  }
  const budgets = { boodschappen: 400, huur: 900 };
  if (opt.tweede) { budgets.persoonlijk = 400; budgets.sport = 380; }
  const set = { limit: 70, mode: 'begeleid', autoIncome: false, income: 4000,
    savingMode: 'amount', savingAmount: 300, manualBal: { [MAIN]: 3000 },
    budgets, budgetMonth: CUR, bufferNorm: 3 };
  /* De langste categorienaam die de app heeft (24 tekens) is alleen via een eigen regel of een
     override te bereiken; persoonlijk draagt geen keywords. */
  if (opt.tweede) set.rules = [{ kw: 'OVERBOEKING JAN', cat: 'persoonlijk' }];
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([MAIN]),
    minder_accmeta: '{}', minder_plan: '{}', minder_set: JSON.stringify(set) };
}
async function boot(page, opt, breedte, hoogte) {
  await pinDag(page);
  if (breedte) await page.setViewportSize({ width: breedte, height: hoogte || 800 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof insEyebrow === 'function');
  await page.evaluate(() => go('ins'));
}
const rijen = (page) => page.evaluate(() => [...document.querySelectorAll('#insSignalRows > div')]
  .map((d) => ({ soort: d.className.split(' ')[0], tekst: d.innerText.replace(/\s+/g, ' ') })));

test.describe('a · de invoer draagt het geval', () => {
  /* ZONDER DEZE METING TOETST BLOK b NIETS: een fixture zonder overschrijding geeft geen rij, en
     dan slaagt elke `not.toContain` per constructie (v300/v311). */
  test('Boodschappen staat op 484 van een potje van 400, dus 84 boven het potje', async ({ page }) => {
    await boot(page);
    const s = await page.evaluate(() => valtOpSignals(thisYM()));
    expect(s.length).toBe(1);
    expect(s[0].naam).toBe('Boodschappen');
    expect(s[0].uitgegeven).toBe(484);
    expect(s[0].potje).toBe(400);
    expect(s[0].over).toBe(84);
  });
});

test.describe('b · de regel en zijn getal', () => {
  test('de rij zegt 84 boven je potje en 1.008 per jaar', async ({ page }) => {
    await boot(page);
    const R = await rijen(page);
    const B = R.filter((r) => r.soort === 'valtop-rij');
    expect(B.length).toBe(1);
    expect(B[0].tekst).toContain('€84 boven je potje');
    expect(B[0].tekst).toContain('Als dit elke maand gebeurt, is dat €1.008 per jaar.');
  });
  /* GEEN OORDEEL EN GEEN ONGEVEER. Het bedrag is exact (s.over is al op hele euro's gerond), dus
     een onzekerheidswoord zou meer beloven dan de meting draagt, en een oordeel staat niet in een
     regel die vaststelt (v78/v93, v222). */
  test('geen ongeveer, geen oordeel, geen uitroep', async ({ page }) => {
    await boot(page);
    const t = (await rijen(page)).filter((r) => r.soort === 'valtop-rij')[0].tekst;
    for (const woord of ['ongeveer', 'circa', 'let op', 'te veel', 'te hoog', 'pas op', '!']) {
      expect(t.toLowerCase(), woord).not.toContain(woord);
    }
  });
  /* De vorm: dezelfde kleur en dezelfde tekstgrootte als elke andere subregel in dit blok, en geen
     eigen knop of accent. `.small.muted` IS die vorm (muted is color:var(--mut)). */
  test('de regel draagt --mut en de subregel-grootte, en is geen knop', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const rij = document.querySelector('#insSignalRows .valtop-rij');
      const el = [...rij.querySelectorAll('div')].find((d) => /per jaar/.test(d.textContent));
      const cs = getComputedStyle(el);
      const mut = getComputedStyle(document.documentElement).getPropertyValue('--mut').trim();
      const proef = document.createElement('span'); proef.style.color = mut;
      document.body.appendChild(proef); const mutRgb = getComputedStyle(proef).color;
      proef.remove();
      return { klas: el.className, kleur: cs.color, mutRgb, fs: cs.fontSize,
        knoppen: el.querySelectorAll('button,a,[onclick]').length,
        eigenTik: el.hasAttribute('onclick') };
    });
    expect(r.klas).toBe('small muted');
    expect(r.kleur).toBe(r.mutRgb);
    expect(r.knoppen).toBe(0);
    expect(r.eigenTik).toBe(false);
    expect(parseFloat(r.fs)).toBeLessThan(13);        // kleiner dan de regel erboven (13px)
  });
  /* DE TIK OP DE RIJ BLIJFT DIE VAN DE RIJ: de regel staat BINNEN de rij, dus hij voegt geen tweede
     ingang toe en haalt de bestaande niet weg. */
  test('de rij opent nog steeds de kaart op Grip', async ({ page }) => {
    await boot(page);
    const on = await page.evaluate(() =>
      document.querySelector('#insSignalRows .valtop-rij').getAttribute('onclick'));
    expect(on).toContain('naarGripSignaal(');
  });
});

test.describe('c · hij leest het veld dat hij afdrukt', () => {
  /* HET GECONSTRUEERDE GEVAL. Via de echte route is `over` altijd `uitgegeven - potje`, dus een
     sabotage die opnieuw aftrekt is daar per constructie inert. Hier lopen de twee uiteen: 100 maal
     twaalf is 1.200, en opnieuw aftrekken zou 500 maal twaalf (6.000) geven. */
  test('over 100 bij 900 van 400 geeft 1.200 en niet 6.000', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() =>
      valtOpRij({ id: 'proef', naam: 'Proef', uitgegeven: 900, potje: 400, over: 100 }, 0));
    expect(h).toContain('€1.200 per jaar');
    expect(h).not.toContain('€6.000');
  });
  /* EN GEEN TEMPO-FACTOR. Een projectie naar het einde van de maand zou het bedrag met de dag van
     de maand laten meebewegen; op de gepinde dag is dat een ANDER getal dan over x 12, dus de
     assertie hierboven vangt hem al. Deze meet dat de uitkomst niet van de dag afhangt: dezelfde
     invoer op twee klokken geeft dezelfde regel. */
  test('dezelfde invoer op een andere dag geeft hetzelfde jaarbedrag', async ({ page }) => {
    await boot(page);
    const eerst = await page.evaluate(() =>
      valtOpRij({ id: 'p', naam: 'Proef', uitgegeven: 900, potje: 400, over: 100 }, 0));
    await page.clock.setFixedTime(new Date(NU.getFullYear(), NU.getMonth(), 2, 10, 0, 0));
    const daarna = await page.evaluate(() =>
      valtOpRij({ id: 'p', naam: 'Proef', uitgegeven: 900, potje: 400, over: 100 }, 0));
    expect(daarna).toBe(eerst);
    expect(daarna).toContain('€1.200 per jaar');
  });
});

test.describe('d · alleen bij een overschrijding', () => {
  /* DE INVOERMETING EERST: deze stand moet werkelijk een patroon- of lekregel dragen, anders meet
     de assertie eronder niets. */
  test('een patroon- of lekregel draagt geen jaarbedrag', async ({ page }) => {
    await boot(page, { lek: true });
    const R = await rijen(page);
    const B = R.filter((r) => r.soort === 'valtop-rij');
    const P = R.filter((r) => r.soort === 'valtop-patroon');
    expect(B.length).toBe(1);
    expect(P.length).toBeGreaterThan(0);              // invoermeting: er IS zo'n regel
    for (const p of P) expect(p.tekst, p.tekst).not.toContain('per jaar');
    expect(B[0].tekst).toContain('per jaar');
    // precies een regel op het scherm draagt hem, en dat is de overschrijding
    const alle = R.filter((r) => /per jaar/.test(r.tekst));
    expect(alle.length).toBe(1);
    expect(alle[0].soort).toBe('valtop-rij');
  });
  /* EN HIJ STAAT NIET OP GRIP. Die kaart draagt de historie en de drie handelingen; daar is de
     vraag wat je nu doet en niet wat het op een jaar zou zijn.
     TWEE SIGNALEN EN NIET EEN, en dat is gemeten en geen voorkeur: Grip rendert de EERSTE kaart
     open (`valtOpKaartOpen`) en de rest dicht (`valtOpKaartDicht`), dus met een signaal bestaat de
     dichte vorm niet en kan een sabotage daarin per constructie niet vuren. Met twee staan beide
     vormen op het scherm, en dat wordt eerst gemeten. */
  /* v340: de dichte kaartvorm (valtOpKaartDicht) is vervallen. Op Grip staat elk signaal nu als Let
     op-regel [data-letop="sig"], en de open kaart (valtOpKaartOpen) staat in de sheet erachter. Twee
     signalen blijven de invoer: dan zijn er twee regels en twee sheets om te lezen. */
  test('geen Let op-regel op Grip en geen kaart erachter draagt hem', async ({ page }) => {
    await boot(page, { tweede: true });
    const r = await page.evaluate(() => { go('maand'); renderMaand();
      const el = document.querySelector('#s-maand');
      const regels = [...el.querySelectorAll('#gripLetOp [data-letop="sig"]')];
      const sheets = regels.map((_, i) => { renderMaand(); document.querySelectorAll('#s-maand #gripLetOp [data-letop="sig"]')[i].click();
        const sh = document.querySelector('#gripLetOpSheet'); return sh && sh.querySelector('.valtop-open') ? sh.innerText : ''; });
      return { regels: regels.length, kaartOpGrip: el.querySelectorAll('.valtop-kaart').length, tekst: el.innerText, sheets };
    });
    expect(r.regels).toBe(2);                       // invoermeting: beide signalen staan er
    expect(r.kaartOpGrip).toBe(0);
    expect(r.tekst).toContain('Sport & gezondheid');
    expect(r.tekst).not.toContain('per jaar');
    expect(r.sheets.every((t) => t.length > 0)).toBe(true);
    expect(r.sheets.join(' ')).toContain('Sport & gezondheid');
    for (const t of r.sheets) expect(t).not.toContain('per jaar');
  });
});

test.describe('e · de bron', () => {
  test('de jaarregel leest s.over en rekent niets opnieuw uit', async ({ page }) => {
    await boot(page);
    const src = await kaalUit(page, 'valtOpRij');
    expect(src.replace(/\s+/g, '')).toContain('s.over*12');
    // geen tweede aftrekking en geen kalender in deze functie
    expect(src).not.toMatch(/uitgegeven\s*-\s*s?\.?potje|s\.uitgegeven\s*-/);
    for (const naam of ['daysElapsed', 'potjeRest', 'elapsed', 'thisYM', 'maandDagenOver']) {
      expect(src, naam).not.toContain(naam);
    }
  });
  test('insPatroonRij noemt de regel niet', async ({ page }) => {
    await boot(page);
    const src = await kaalUit(page, 'insPatroonRij');
    expect(src).not.toContain('per jaar');
  });
  /* EEN SPELLING, EEN PLEK (v91/v104): de zin staat een keer in de bron, dus er kan geen tweede
     formulering van hetzelfde naast groeien. */
  test('de zin staat een keer in index.html', async ({ page }) => {
    const bron = kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
    const n = (bron.match(/Als dit elke maand gebeurt/g) || []).length;
    expect(n).toBe(1);
  });
});

test.describe('f · de vouw in het zwaarste geval', () => {
  /* TWEE OVERSCHRIJDINGEN MET DE LANGSTE CATEGORIENAMEN DIE DE APP HEEFT (Persoonlijke overboeking
     van 24 tekens en Sport & gezondheid van 18) en vier cijfers in elk bedrag, dus vijf in het
     jaarbedrag. GEMETEN bij v313: de rijen gaan van 56/57 naar 80/81px, en de onderkant van het
     laatste signaal van 396 naar 445px op 360x640 en van 377 naar 426px op 390x844. */
  for (const [breedte, hoogte, vouw] of [[360, 640, 567], [390, 844, 771]]) {
    test(`${breedte}x${hoogte}: beide signalen met hun jaarregel in het eerste scherm`, async ({ page }) => {
      await boot(page, { tweede: true }, breedte, hoogte);
      const r = await page.evaluate(() => {
        const el = document.querySelector('#s-ins');
        const sig = [...el.querySelectorAll('.valtop-rij,.valtop-patroon')];
        const nav = document.querySelector('.nav') || document.querySelector('nav');
        const navH = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
        return { aantal: sig.length,
          soort: sig.map((s) => s.className.split(' ')[0]),
          jaar: sig.filter((s) => /per jaar/.test(s.innerText)).length,
          hoogtes: sig.map((s) => Math.round(s.getBoundingClientRect().height)),
          regelH: (() => { const e = [...sig[0].querySelectorAll('div')]
            .find((d) => /per jaar/.test(d.textContent));
            return e ? Math.round(e.getBoundingClientRect().height) : null; })(),
          kaart: Math.round(el.querySelector('.card').getBoundingClientRect().height),
          bodem: Math.round(sig[sig.length - 1].getBoundingClientRect().bottom + window.scrollY),
          zichtbaar: window.innerHeight - navH };
      });
      // invoermeting: dit IS het zwaarste geval, twee overschrijdingen met elk een jaarregel
      expect(r.aantal).toBe(2);
      expect(r.soort).toEqual(['valtop-rij', 'valtop-rij']);
      expect(r.jaar).toBe(2);
      expect(r.zichtbaar).toBe(vouw);
      expect(r.kaart).toBeLessThan(200);                  // de stand-kaart is niet veranderd
      expect(r.bodem, JSON.stringify(r)).toBeLessThanOrEqual(r.zichtbaar);
      /* WAT DE REGEL KOST, als eigen assertie naast de vouw. De vouw houdt 122px over op de
         kleinste telefoon, dus een regel die stilletjes twee of drie keer zo hoog wordt blijft
         daar per constructie onder (GEMETEN: met line-height 4.5 gaat de bodem naar 519px en
         blijft de vouw-test groen). De eis IS de vouw en die staat hierboven; deze twee pinnen de
         PRIJS, zodat een volgende ronde ziet wat hij uitgeeft. */
      expect(r.regelH).toBe(19);                          // de jaarregel zelf
      expect(r.hoogtes[0]).toBe(80);                      // de rij was 56px zonder de regel
      expect(r.hoogtes[1]).toBe(81);                      //  en 57px
    });
  }
});
