/* v268: de handeling 'betaald' bij een verwachte post.
 *
 * DE VORM IS DIE VAN SET.fixDueExcl (v231): een vlag per post met de dag waarop je hem vastlegde,
 * die dezelfde lijst filtert. Geen tweede detectie en geen automatische match op je boekingen.
 *
 * HET ONDERSCHEID EENMALIG TEGEN INTERVAL IS DE HARDE EIS VAN DEZE RONDE, en het zit niet in een
 * tweede tak: de vlag draagt de MAAND van het voorkomen dat je afvinkte en resVolgende() slaat
 * alles tot en met die maand over. Bij eenmalig valt de post weg, bij een interval rolt hij door.
 *
 * DE FIXTURE, en wat eraan van de gebruiker is en wat niet (v251/v256):
 *  - €313 + €150 = €463 zijn de twee boetes zoals gemeld, en de categorie 'belasting' erbij.
 *  - DE KWARTAALVARIANT IS EEN GECONSTRUEERD GEVAL en geen toestand van het toestel: de gemelde
 *    boetes zijn eenmalige posten. Hij staat er omdat de interval-tak alleen daar te meten is, en
 *    hij heet daarom expliciet 'kwartaalvariant'.
 *  - DE POTSTAND VAN €1.537 IS EVENEENS GECONSTRUEERD: hij is zo gekozen dat de kwartaalvariant
 *    precies drie van de vier termijnen dekt en er een gat van €165 in de vierde valt. Dat gat is
 *    dus een eigenschap van deze stand en niet een meting van het toestel.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const DEZE = M(0);
const PLUS = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const ACC = '100110012555096222';
const RES = '100110012555096333';

function seed(opt) {
  opt = opt || {};
  const tx = [];
  const add = (datum, amount, naam, acc) =>
    tx.push({ id: 'x' + tx.length, date: datum, amount, acc: acc || ACC, name: naam, desc: naam,
              typ: '', ref: '', src: 'psd2', accName: '', refNums: [] });
  for (let i = 3; i >= 0; i--) {
    const m = M(i);
    add(m + '-25', 5216, 'Werkgever');
    add(m + '-03', -60, 'Albert Heijn');
  }
  add(M(3) + '-04', -12, 'Bankkosten', RES);   // zodat RES in OWN zit
  const res = opt.res || [
    { id: 'rA', naam: 'Boete A', bedrag: 313, vervalmaand: DEZE, intervalM: 0, cat: 'belasting' },
    { id: 'rB', naam: 'Boete B', bedrag: 150, vervalmaand: DEZE, intervalM: 0, cat: 'belasting' },
  ];
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, mode: 'begeleid', autoIncome: false, income: 5216,
      manualBal: { [ACC]: 4200, [RES]: (opt.pot == null ? 1537 : opt.pot) },
      savingsAcc: { [RES]: false },
      budgets: { boodschappen: 700, belasting: 100 },
      savingMode: 'amount', savingAmount: 0, goals: [],
      resAcc: RES, reserveringen: res,
      resBetaald: opt.resBetaald || undefined }),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, opt) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof resVolgende === 'function' && typeof resBetaald === 'function');
}
const KWARTAAL = (deze) => [
  { id: 'rA', naam: 'Boete A', bedrag: 313, vervalmaand: deze, intervalM: 3, cat: 'belasting' },
  { id: 'rB', naam: 'Boete B', bedrag: 150, vervalmaand: deze, intervalM: 3, cat: 'belasting' },
];

test.describe('a - een eenmalige post die betaald is, is geen verwachte kost meer', () => {
  test('hij valt uit verplichtingen() en uit de kostenregels van dekking()', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const voor = { posten: verplichtingen(12).map((x) => x.naam + '|' + x.maand),
                     regels: dekking(12).regels.filter((x) => x.soort === 'post').map((x) => x.naam) };
      resBetaaldZet('rA');
      const na = { posten: verplichtingen(12).map((x) => x.naam + '|' + x.maand),
                   regels: dekking(12).regels.filter((x) => x.soort === 'post').map((x) => x.naam),
                   vlag: SET.resBetaald.rA, volgende: resVolgende(resLijst().find((v) => v.id === 'rA')) };
      return { voor, na };
    });
    expect(r.voor.posten).toHaveLength(2);
    expect(r.voor.regels).toEqual(['Boete A', 'Boete B']);
    expect(r.na.posten).toEqual(['Boete B|' + DEZE]);
    expect(r.na.regels).toEqual(['Boete B']);
    expect(r.na.volgende).toBe(null);
    expect(r.na.vlag.maand).toBe(DEZE);
    expect(r.na.vlag.op).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('de post blijft in de beheerlijst staan en de rij zegt dat hij betaald is', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      resBetaaldZet('rA');
      openReserveringen();
      const t = document.getElementById('sheet').innerText;
      return { inLijst: resLijst().some((v) => v.id === 'rA'), aantal: resLijst().length, tekst: t,
               label: resBetaaldLabel(resLijst().find((v) => v.id === 'rA')) };
    });
    expect(r.inLijst).toBe(true);
    expect(r.aantal).toBe(2);
    expect(r.tekst).toContain('Boete A');
    expect(r.label).toMatch(/^Betaald op \d{1,2} [a-z]{3}$/);
    expect(r.tekst).toContain(r.label);
    // eenmalig: geen volgende termijn, dus het interval-woord zegt waarom er niets volgt
    expect(r.tekst).toContain(r.label + ' · eenmalig');
    expect(r.tekst).not.toContain('verstreken');
  });

  test('beide betaald laat de dekkingszin zeggen dat er niets meer aankomt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      resBetaaldZet('rA'); resBetaaldZet('rB');
      const D = dekking(12);
      return { posten: verplichtingen(12).length, zin: dekkingTekst(D), gat: D.gat,
               benodigdPerMaand: D.benodigdPerMaand, benodigdeStand: D.benodigdeStand };
    });
    expect(r.posten).toBe(0);
    expect(r.zin).toContain('niets aan uit je lijst');
    expect(r.gat).toBe(null);
    expect(r.benodigdPerMaand).toBe(0);
    expect(r.benodigdeStand).toBe(0);
  });
});

test.describe('b - de kwartaalvariant: deze termijn af, de volgende vanaf nul', () => {
  test('de betaalde termijn verdwijnt en de reeks begint bij de volgende', async ({ page }) => {
    await boot(page, { res: KWARTAAL(DEZE) });
    const r = await page.evaluate(() => {
      const lees = () => verplichtingen(12).filter((x) => x.id === 'rA').map((x) => x.maand + '/' + x.offset);
      const voor = lees();
      resBetaaldZet('rA');
      return { voor, na: lees(), volgende: resVolgende(resLijst().find((v) => v.id === 'rA')) };
    });
    expect(r.voor).toEqual([PLUS(0) + '/0', PLUS(3) + '/3', PLUS(6) + '/6', PLUS(9) + '/9']);
    expect(r.na).toEqual([PLUS(3) + '/3', PLUS(6) + '/6', PLUS(9) + '/9']);
    expect(r.volgende).toBe(3);
  });

  test('de volgende termijn bouwt vanaf nul op: opgebouwd gaat van het hele bedrag naar 0', async ({ page }) => {
    await boot(page, { res: KWARTAAL(DEZE) });
    const r = await page.evaluate(() => {
      const eerste = () => { const p = dekking(12).regels.filter((x) => x.soort === 'post' && x.id === 'rA');
        return p.length ? { maand: p[0].maand, opgebouwd: p[0].opgebouwd } : null; };
      const voor = { eerste: eerste(), stand: dekking(12).benodigdeStand };
      resBetaaldZet('rA'); resBetaaldZet('rB');
      return { voor, na: { eerste: eerste(), stand: dekking(12).benodigdeStand } };
    });
    // deze termijn valt nu, dus je hebt hem in zijn geheel nodig
    expect(r.voor.eerste).toEqual({ maand: PLUS(0), opgebouwd: 313 });
    expect(r.voor.stand).toBe(463);
    // de volgende termijn is het hele interval weg, dus er hoort nu niets te staan
    expect(r.na.eerste).toEqual({ maand: PLUS(3), opgebouwd: 0 });
    expect(r.na.stand).toBe(0);
  });

  test('het gat van 165 in de vierde termijn: met deze termijn betaald verdwijnt het', async ({ page }) => {
    await boot(page, { res: KWARTAAL(DEZE) });
    const r = await page.evaluate(() => {
      const lees = () => { const D = dekking(12);
        return { stand: D.werkelijkeStand, gedektTot: D.gedektTot,
                 gat: D.gat ? D.gat.naam + ' ' + D.gat.maand + ' tekort ' + D.gat.tekort : null }; };
      const voor = lees();
      resBetaaldZet('rA'); resBetaaldZet('rB');
      return { voor, na: lees() };
    });
    expect(r.voor.stand).toBe(1537);
    expect(r.voor.gedektTot).toBe(PLUS(6));
    expect(r.voor.gat).toBe('Boete A ' + PLUS(9) + ' tekort 165');
    // de pot is 463 lichter EN de verplichting die hij betaalde is weg, dus er is een termijn
    // ruimte bijgekomen in plaats van afgegaan
    expect(r.na.stand).toBe(1537);
    expect(r.na.gedektTot).toBe(PLUS(9));
    expect(r.na.gat).toBe(null);
  });

  test('de rij noemt de volgende termijn, en dat is het zichtbare verschil met eenmalig', async ({ page }) => {
    await boot(page, { res: KWARTAAL(DEZE) });
    const r = await page.evaluate(() => {
      resBetaaldZet('rA');
      openReserveringen();
      return { tekst: document.getElementById('sheet').innerText,
               label: resBetaaldLabel(resLijst().find((v) => v.id === 'rA')),
               volgendeLabel: resMaandLabel(resYmPlus(3)) };
    });
    expect(r.tekst).toContain(r.label + ' · volgende ' + r.volgendeLabel);
    expect(r.tekst).not.toContain(r.label + ' · per kwartaal');
  });
});

test.describe('c - terugdraaien zonder de post opnieuw aan te maken', () => {
  test('ongedaan maken zet de hele dekkingssom exact terug', async ({ page }) => {
    await boot(page, { res: KWARTAAL(DEZE) });
    const r = await page.evaluate(() => {
      const snap = () => JSON.stringify(dekking(12));
      const voor = snap();
      resBetaaldZet('rA'); resBetaaldZet('rB');
      const tussen = snap();
      resBetaaldTerug('rA'); resBetaaldTerug('rB');
      return { voor, tussen, na: snap(), vlaggen: Object.keys(SET.resBetaald || {}),
               posten: resLijst().length };
    });
    expect(r.tussen).not.toBe(r.voor);
    expect(r.na).toBe(r.voor);
    expect(r.vlaggen).toEqual([]);
    expect(r.posten).toBe(2);
  });

  test('de editor draagt de handeling en daarna de terugdraaier', async ({ page }) => {
    await boot(page);
    const heen = await page.evaluate(() => { openReservering('rA');
      return document.getElementById('sheet').innerText; });
    expect(heen).toContain('Deze post is betaald');
    expect(heen).not.toContain('ongedaan maken');
    const terug = await page.evaluate(() => { resBetaaldZet('rA');
      return document.getElementById('sheet').innerText; });
    expect(terug).toContain('Betaald op');
    expect(terug).toContain('ongedaan maken');
    expect(terug).not.toContain('Deze post is betaald ›');
    const weer = await page.evaluate(() => { resBetaaldTerug('rA');
      return { tekst: document.getElementById('sheet').innerText, vlag: (SET.resBetaald || {}).rA || null }; });
    expect(weer.tekst).toContain('Deze post is betaald');
    expect(weer.vlag).toBe(null);
  });

  test('save() schrijft de vlag naar localStorage', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { resBetaaldZet('rA');
      return JSON.parse(localStorage.getItem('minder_set') || '{}').resBetaald || null; });
    expect(r).not.toBe(null);
    expect(r.rA.maand).toBe(DEZE);
  });

  test('een koude boot met de vlag erin honoreert hem meteen', async ({ page }) => {
    await boot(page, { resBetaald: { rA: { op: DEZE + '-25', maand: DEZE } } });
    const r = await page.evaluate(() => ({ posten: verplichtingen(12).map((x) => x.naam),
      label: resBetaaldLabel(resLijst().find((v) => v.id === 'rA')) }));
    expect(r.posten).toEqual(['Boete B']);
    expect(r.label).toBe('Betaald op 25 ' + ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][+DEZE.slice(5, 7) - 1]);
  });
});

test.describe('d - één bron, en geen vlag zonder post', () => {
  test('alleen resVolgende() slaat een betaalde termijn over', async ({ page }) => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const sc = src.slice(src.indexOf('<script'), src.lastIndexOf('</script>'));
    const fn = (naam) => { const i = sc.indexOf('\nfunction ' + naam + '('); expect(i).toBeGreaterThan(-1);
      let d = 0, j = sc.indexOf('{', i);
      for (let k = j; k < sc.length; k++) { if (sc[k] === '{') d++; else if (sc[k] === '}') { d--; if (!d) return sc.slice(i, k + 1); } }
      return sc.slice(i); };
    expect(fn('resVolgende')).toContain('resBetaald(');
    for (const naam of ['verplichtingen', 'dekking']) expect(fn(naam)).not.toContain('resBetaald(');
    // en de vlag wordt op precies twee plekken geschreven: de handeling en haar terugdraaier
    const schrijvers = (sc.match(/SET\.resBetaald\[[^\]]+\]\s*=/g) || []).length;
    expect(schrijvers).toBe(1);
  });

  test('een verstreken eenmalige post biedt de handeling niet aan', async ({ page }) => {
    const vorig = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    await boot(page, { res: [{ id: 'rA', naam: 'Boete A', bedrag: 313, vervalmaand: vorig, intervalM: 0, cat: 'belasting' }] });
    const r = await page.evaluate(() => { openReservering('rA');
      return { tekst: document.getElementById('sheet').innerText,
               volgende: resVolgende(resLijst()[0]), regel: resBetaaldRegel(resLijst()[0]) }; });
    expect(r.volgende).toBe(null);
    expect(r.regel).toBe('');
    expect(r.tekst).not.toContain('Deze post is betaald');
  });

  test('de post verwijderen laat geen vlag achter', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { resBetaaldZet('rA');
      const met = Object.keys(SET.resBetaald || {});
      deleteReservering('rA');
      return { met, na: Object.keys(SET.resBetaald || {}), posten: resLijst().length }; });
    expect(r.met).toEqual(['rA']);
    expect(r.na).toEqual([]);
    expect(r.posten).toBe(1);
  });
});

/* GEMETEN dat een betaalde rij één regel blijft. Met de categorie erbij was de sub 36px in plaats
   van 18px, en de rij daarmee 76px in plaats van 57px, op 360 EN 390px; de maand korter schrijven
   hielp niets. Daarom draagt een betaalde rij de categorie niet, en dat legt deze test vast. */
test.describe('e - de sub van een betaalde rij blijft één regel', () => {
  for (const w of [360, 390]) {
    for (const [nm, res] of [['eenmalig', null], ['kwartaal', KWARTAAL(DEZE)]]) {
      test(`${nm} op ${w}px`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 800 });
        await boot(page, res ? { res } : {});
        const r = await page.evaluate(() => {
          resBetaaldZet('rA'); openReserveringen();
          const row = [...document.querySelectorAll('#sheet .row')].find((x) => x.innerText.includes('Boete A'));
          const sub = row.querySelector('.small.muted');
          return { rij: Math.round(row.getBoundingClientRect().height),
                   sub: Math.round(sub.getBoundingClientRect().height), tekst: sub.innerText };
        });
        expect(r.sub).toBe(18);
        expect(r.rij).toBe(57);
        expect(r.tekst).not.toContain('Belasting');
      });
    }
  }
});
