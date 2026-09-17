// v229: een afspraak draagt zijn bedrag. Een optie uit maandRegelOpties() die een bedrag noemt
// ('€X per maand extra opzij zetten', '€X per maand meer inleggen') geeft dat bedrag mee aan de
// afspraak, naast de vorm en de regelKey die er al stonden (v207). afspraakUitkomst() toetst dan
// tegen dat bedrag in plaats van tegen 'elke verhoging telt'. Per regelKey een andere bron:
// dekking leest resThisMonth() (een reeks per maand), doel leest p.alloc uit allocatePlan() (een
// stand van nu, geen reeks). Buffer heeft in maandRegelOpties() geen bedrag en houdt de toets van
// v207. De zelfrapportage-tak blijft bestaan voor een afspraak zonder bedrag en zonder bron.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const plusM = (n) => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
const VORIGE_TS = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 15).getTime(); })();
const SAV = 'NL01SAVE0000004323';

// dezelfde fixture als maand-drie-vormen: dekking, buffer en doel alle drie op tekort
function drieTekorten(extra) {
  const p = seed();
  const s = JSON.parse(p.minder_set);
  s.reserveringen = [{ id: 'r1', naam: 'Waterschap', bedrag: 9000, intervalM: 12, vervalmaand: plusM(2) }];
  s.resAcc = SAV;
  s.goals = [{ id: 'g1', naam: 'Vakantie', doel: 4000, gespaard: 200, allocMode: 'fixed', perMaand: 50, streefdatum: plusM(3) }];
  s.planOrder = ['g1', 'noodfonds'];
  if (extra) extra(s);
  p.minder_set = JSON.stringify(s);
  return p;
}
const optie = (page, key, vorm, l) => page.evaluate(([k, v, lbl]) => {
  const m = curMonth || months()[months().length - 1];
  const r = maandRegels().find((x) => x.key === k);
  const o = maandRegelOpties(r, m).find((x) => x.vorm === v && (!lbl || x.l.indexOf(lbl) >= 0));
  return o ? { l: o.l, tekst: o.tekst, extra: o.extra, tekort: Math.round(r.tekortPerMaand || 0) } : null;
}, [key, vorm, l || '']);
async function kies(page, txt) {
  await page.waitForFunction((t) => [...document.querySelectorAll('#coCh .cch')].some((b) => b.innerText.indexOf(t) >= 0), txt, { timeout: 15000 });
  await page.locator('#coCh .cch', { hasText: txt }).first().click();
}
const afspraak = (page) => page.evaluate(() => (SET.coachLog || []).find((l) => l.type === 'afspraak') || null);

test.describe('a - een optie met een bedrag geeft dat bedrag mee', () => {
  test('dekking: bedrag, vorm inleg, bron res, basis', async ({ page }) => {
    await open(page, drieTekorten());
    const o = await optie(page, 'dekking', 'inleg');
    expect(o).toBeTruthy();
    expect(o.tekort).toBeGreaterThan(0);
    expect(o.extra.bedrag).toBe(o.tekort);
    expect(o.extra.vorm).toBe('inleg');
    expect(o.extra.meet).toBe('res');
    expect(typeof o.extra.basis).toBe('number');
    // de tekst noemt hetzelfde bedrag als de afspraak draagt
    expect(o.tekst).toContain(String(o.tekort).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  });

  test('doel: bedrag, bron doel, de stand van de inleg als basis', async ({ page }) => {
    await open(page, drieTekorten());
    const o = await optie(page, 'doel', 'norm', 'meer inleggen');
    expect(o).toBeTruthy();
    expect(o.extra.bedrag).toBe(o.tekort);
    expect(o.extra.meet).toBe('doel');
    expect(o.extra.doelId).toBe('g1');
    const alloc = await page.evaluate(() => Math.round(allocatePlan().find((x) => x.id === 'g1').alloc || 0));
    expect(o.extra.basis).toBe(alloc);
    expect(o.tekst).toContain(String(o.tekort).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  });

  test('buffer: de optie noemt geen bedrag en draagt er dus ook geen', async ({ page }) => {
    await open(page, drieTekorten());
    const o = await optie(page, 'buffer', 'inleg');
    expect(o).toBeTruthy();
    expect(o.l).not.toMatch(/€/);
    expect(o.tekst).not.toMatch(/€/);
    expect(o.extra.bedrag).toBeUndefined();
    expect(o.extra.meet).toBe('spaar');   // de toets van v207 blijft: elke verhoging telt
  });

  test('via het gesprek komt het bedrag in de afspraak terecht', async ({ page }) => {
    await open(page, drieTekorten());
    await page.evaluate(() => go('maand'));
    const o = await optie(page, 'dekking', 'inleg');
    await page.evaluate((m) => coStart('maand', m, 'dekking'), CUR);
    await kies(page, 'per maand extra opzij zetten');
    await kies(page, 'Zo spreken we af');
    await page.waitForFunction(() => (SET.coachLog || []).some((l) => l.type === 'afspraak'));
    const af = await afspraak(page);
    expect(af.regel).toBe('dekking');
    expect(af.vorm).toBe('inleg');
    expect(af.meet).toBe('res');
    expect(af.bedrag).toBe(o.tekort);
    expect(typeof af.basis).toBe('number');
    expect(af.text).toBe(o.tekst);
  });
});

test.describe('b - afspraakUitkomst toetst tegen het bedrag', () => {
  // vorige maand afgesproken: €300 extra naar de reserveringen, basis 0
  const metAfspraak = (bedrag, basis) => drieTekorten((s) => {
    s.coachLog = [{ ts: VORIGE_TS, type: 'afspraak', text: 'Ik zet meer opzij voor mijn reserveringen',
      regel: 'dekking', vorm: 'inleg', meet: 'res', basis: basis, bedrag: bedrag }];
  });
  // deze maand gaat er `bedrag` extra naar de reserveringenpot, bovenop de €200 die de fixture
  // deze maand al op die rekening zet (spaarin-cur), dus resThisMonth(CUR) = 200 + bedrag
  const metStorting = (p, bedrag) => {
    const tx = JSON.parse(p.minder_tx);
    tx.push({ id: 'res-cur', date: CUR + '-03', amount: bedrag, acc: SAV, name: 'Reserveringen', desc: 'NAAR RESERVERINGEN', typ: '', ref: '', src: 'csv', accName: 'Res', refNums: [] });
    p.minder_tx = JSON.stringify(tx);
    return p;
  };

  test('de lat is basis plus bedrag: eronder is niet gelukt', async ({ page }) => {
    await open(page, metStorting(metAfspraak(300, 0), 50));
    const U = await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()));
    expect(U.status).toBe('niet gelukt');   // v207 had dit 'gelukt' genoemd: 250 is meer dan 0
    expect(U.afgesproken).toBe(300);
    expect(U.nu.bedrag).toBe(250);
    expect(U.toen.bedrag).toBe(0);
  });

  test('erop of erboven is gelukt', async ({ page }) => {
    await open(page, metStorting(metAfspraak(300, 0), 100));   // 300 in totaal
    const U = await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()));
    expect(U.status).toBe('gelukt');
    expect(U.afgesproken).toBe(300);
  });

  test('de basis telt mee: het bedrag komt bovenop wat er al ging', async ({ page }) => {
    await open(page, metStorting(metAfspraak(300, 200), 100));   // 300: evenveel als het bedrag, maar de basis was 200
    expect((await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()))).status).toBe('niet gelukt');
    await open(page, metStorting(metAfspraak(300, 200), 300));   // 500 = 200 + 300
    expect((await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()))).status).toBe('gelukt');
  });

  test('zonder bedrag blijft de toets van v207: elke verhoging boven de marge telt', async ({ page }) => {
    await open(page, metStorting(metAfspraak(undefined, 0), 100));
    const U = await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()));
    expect(U.status).toBe('gelukt');
    expect(U.afgesproken).toBeNull();
  });

  test('de terugblik noemt de lat, en vraagt niets', async ({ page }) => {
    await open(page, metStorting(metAfspraak(300, 0), 50));
    const h = await page.evaluate(() => maandAfspraakLus());
    expect(h).toContain('Afgesproken was €300 erbij');
    expect(h).toContain('ging van €0 naar €250');
    expect(h).not.toContain('Is het gelukt?');
    expect(h).not.toContain("afspraakZelfZet(");
  });

  test('doel: de bron is de inleg in het plan, een stand van nu', async ({ page }) => {
    const metDoelAfspraak = (perMaand) => drieTekorten((s) => {
      s.goals[0].perMaand = perMaand;
      s.coachLog = [{ ts: VORIGE_TS, type: 'afspraak', text: 'Ik leg €100 per maand meer in voor Vakantie',
        regel: 'doel', vorm: 'norm', meet: 'doel', doelId: 'g1', basis: 50, bedrag: 100 }];
    });
    await open(page, metDoelAfspraak(50));          // niets veranderd
    let U = await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()));
    expect(U.status).toBe('niet gelukt');
    expect(U.wat).toContain('Vakantie');
    expect(U.toen.bedrag).toBe(50);
    expect(U.nu.bedrag).toBe(50);
    await open(page, metDoelAfspraak(150));         // inleg met het bedrag omhoog
    U = await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()));
    expect(U.status).toBe('gelukt');
    expect(U.nu.bedrag).toBe(150);
    expect(U.afgesproken).toBe(100);
  });

  test('doel: is het doel weg, dan valt er niets te toetsen', async ({ page }) => {
    await open(page, drieTekorten((s) => {
      s.goals = [];
      s.coachLog = [{ ts: VORIGE_TS, type: 'afspraak', text: 'Ik leg €100 per maand meer in voor Vakantie',
        regel: 'doel', vorm: 'norm', meet: 'doel', doelId: 'g1', basis: 50, bedrag: 100 }];
    }));
    expect((await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()))).status).toBe('niet te toetsen');
  });
});

test.describe('c - de zelfrapportage-tak blijft bestaan', () => {
  test('een afspraak zonder bedrag en zonder bron krijgt de twee knoppen', async ({ page }) => {
    await open(page, drieTekorten((s) => {
      s.coachLog = [{ ts: VORIGE_TS, type: 'afspraak', text: 'Ik zeg Netflix op', regel: 'buffer' }];
    }));
    const r = await page.evaluate(() => ({ U: afspraakUitkomst(vorigeAfspraak()), h: maandAfspraakLus() }));
    expect(r.U.status).toBe('niet te toetsen');
    expect(r.h).toContain('Is het gelukt?');
    expect(r.h).toContain("afspraakZelfZet('gelukt')");
    expect(r.h).toContain("afspraakZelfZet('niet gelukt')");
  });

  test('een norm-afspraak zonder bron ook', async ({ page }) => {
    await open(page, drieTekorten((s) => {
      s.coachLog = [{ ts: VORIGE_TS, type: 'afspraak', text: 'Ik verlaag mijn richtbedrag', regel: 'buffer', vorm: 'norm' }];
    }));
    expect((await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()))).status).toBe('niet te toetsen');
  });

  test('een bedrag zonder bron is ook niet te toetsen', async ({ page }) => {
    await open(page, drieTekorten((s) => {
      s.coachLog = [{ ts: VORIGE_TS, type: 'afspraak', text: 'Ik zet €300 extra opzij', regel: 'buffer', bedrag: 300 }];
    }));
    expect((await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()))).status).toBe('niet te toetsen');
  });

  test('de tak staat nog in de bron, met zijn comment dat hij bewust blijft', async ({ page }) => {
    await open(page, drieTekorten());
    const src = await page.evaluate(() => maandAfspraakLus.toString());
    expect(src).toContain("afspraakZelfZet('gelukt')");
    expect(src).toContain('blijft bewust bestaan');
  });
});
