// v224: elke regel op de kaart droeg wel een suggestie ("€850 erbij brengt je pot op de stand die
// er nu bij hoort") maar geen ingang om er iets mee te doen. Er was één ingang onder de hele kaart,
// en die opende via coMaandZwaarste() alleen de zwaarste regel.
// Dat was het probleem: een structureel signaal valt buiten MAAND_VOLGORDE, krijgt daardoor index
// -1 en kwam dus altijd vóór dekking, buffer en doel, terwijl maandRegelOpties() daar geen drie
// vormen voor levert. De regels met opties waren zo onbereikbaar.
// Nu draagt elke regel met een tekort zijn eigen ingang, in de vorm die Plan al gebruikt
// (coHorizonVraag): een vraag met het bedrag en een chevron. Die functie zelf is niet
// herbruikbaar - hij opent 'horizon' en niet 'maand', leest doelTempo() in plaats van de maandregel
// en is één zin voor het hele plan - dus alleen de vorm is overgenomen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000009999';
const APRIL = ym(new Date(now.getFullYear() + 1, 3, 1));
const DOELDATUM = ym(new Date(now.getFullYear() + 1, now.getMonth(), 1));

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (let i = 11; i >= 0; i--) {
    const m = ym(new Date(now.getFullYear(), now.getMonth() - i, 1));
    add('i' + m, MAIN, m, '05', 4000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1500, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '06', -900, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('s' + m, SPAAR, m, '26', 300, 'Spaarpot', 'NAAR SPAREN');
    add('r' + m, RES, m, '10', 100, 'Reserveringen', 'NAAR RESERVERINGEN');
  }
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4000,
    manualBal: { [MAIN]: 2000, [SPAAR]: o.spaar != null ? o.spaar : 3100, [RES]: 400 },
    budgets: { boodschappen: 900, huur: 1500 },
    savingMode: 'amount', savingAmount: 300,
    savingsAcc: { [SPAAR]: true }, resAcc: RES,
    nfDoelVast: 7200, nfToegewezen: 3100, nfToegewezenMigrated: true, nfMaanden: 3,
    goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 20000, gespaard: 500, streefdatum: DOELDATUM, allocMode: 'fixed', perMaand: 0 }],
    reserveringen: [{ id: 'r1', naam: 'Aanslag', bedrag: 3000, vervalmaand: APRIL, intervalM: 12 }],
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandIngang === 'function');
  await page.evaluate(() => go('maand'));
}
// overstreak vuurt bij twee maanden op rij boven budget
const STRUCT = { set: { budgets: { boodschappen: 500, huur: 1500 } } };

const ing = (page, key) => page.evaluate((k) => {
  const m = curMonth || thisYM();
  const r = maandMetAccept(maandRegels()).concat(maandStructureel()).find((x) => x.key === k);
  if (!r) return null;
  const h = maandIngang(r, m);
  const d = document.createElement('div'); d.innerHTML = h;
  return { status: r.status, html: h, tekst: d.textContent.trim(),
    opent: (h.match(/coStart\('maand','[^']*','([^']*)'\)/) || [])[1] || null };
}, key);

test.describe('a - elke regel met een tekort draagt zijn eigen ingang', () => {
  for (const [key, bedrag] of [['dekking', '€850'], ['buffer', '€4.100'], ['doel', '€1.625']]) {
    test(`${key} opent op zijn eigen sleutel, met zijn eigen bedrag`, async ({ page }) => {
      await boot(page);
      const r = await ing(page, key);
      expect(r.status).toBe('tekort');
      expect(r.opent).toBe(key);
      expect(r.tekst).toContain(bedrag);
    });
  }

  test('het bedrag komt uit dezelfde bron als de suggestie erboven', async ({ page }) => {
    await boot(page);
    for (const k of ['dekking', 'buffer', 'doel']) {
      const uit = await page.evaluate((key) => {
        const m = curMonth || thisYM();
        const r = maandMetAccept(maandRegels()).find((x) => x.key === key);
        const T = maandTekort(r);
        const d = document.createElement('div'); d.innerHTML = maandIngang(r, m);
        return { euro: euro0(T.bedrag), sug: maandSuggestie(r, m), ingang: d.textContent };
      }, k);
      expect(uit.sug, k).toContain(uit.euro);
      expect(uit.ingang, k).toContain(uit.euro);
    }
  });

  test('en ze staan alle drie op het scherm', async ({ page }) => {
    await boot(page);
    const h = await page.locator('#s-maand').innerHTML();
    const keys = [...h.matchAll(/coStart\('maand','[^']*','([^']*)'\)/g)].map((x) => x[1]);
    expect(keys).toEqual(['dekking', 'buffer', 'doel']);
  });
});

test.describe('b - een structureel signaal krijgt een andere vraag', () => {
  test('het opent op zijn eigen sleutel en vraagt om een afspraak', async ({ page }) => {
    await boot(page, STRUCT);
    const r = await ing(page, 'overstreak');
    expect(r.status).toBe('tekort');
    expect(r.opent).toBe('overstreak');
    expect(r.tekst).toContain('afspraak');
  });

  test('want daar levert maandRegelOpties geen vormen voor', async ({ page }) => {
    await boot(page, STRUCT);
    const n = await page.evaluate(() => {
      const r = maandStructureel().find((x) => x.key === 'overstreak');
      return maandRegelOpties(r, curMonth || thisYM()).length;
    });
    expect(n).toBe(0);
  });

  test('en de vraag noemt geen bedrag dat het signaal niet draagt', async ({ page }) => {
    await boot(page, STRUCT);
    const r = await ing(page, 'overstreak');
    expect(r.tekst).not.toMatch(/€/);
  });
});

test.describe('c - geen ingang waar er niets te beslissen valt', () => {
  test('een regel op ok draagt er geen', async ({ page }) => {
    await boot(page, { spaar: 40000, set: { nfToegewezen: 40000 } });
    const r = await ing(page, 'buffer');
    expect(r.status).toBe('ok');
    expect(r.html).toBe('');
  });

  test('een bewust geaccepteerde regel ook niet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => maandAcceptZet('buffer'));
    const r = await ing(page, 'buffer');
    expect(r.html).toBe('');
  });

  test('zonder enige tekort-regel staat er geen enkele gespreksingang op een regel', async ({ page }) => {
    await boot(page, { spaar: 40000, set: {
      nfToegewezen: 40000, goals: [], reserveringen: [], nfDoelVast: 100,
    } });
    const keys = await page.evaluate(() => {
      const m = curMonth || thisYM();
      return maandMetAccept(maandRegels()).concat(maandStructureel())
        .filter((r) => maandIngang(r, m) !== '').map((r) => r.key);
    });
    expect(keys).toEqual([]);
  });
});

test.describe('d - de oude ingang onder de kaart is weg, de andere takken niet', () => {
  test('geen uitnodiging "Zullen we ... doorlopen" meer', async ({ page }) => {
    await boot(page);
    const t = await page.locator('#s-maand').innerText();
    expect(t).not.toContain('doorlopen?');
  });

  /* Direct op de functie en niet via de DOM: deze test gaat over de vraag of de afspraak-tak
     bestaat, niet over wanneer renderMaand() hem plaatst. Dat laatste hangt aan condities die
     buiten deze ronde vallen, en een DOM-assertie zou die meemeten. */
  test('de afspraak-kaart blijft: dat is een andere taak van dezelfde functie', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => {
      SET.coachLog = (SET.coachLog || []).concat([{ type: 'afspraak', ts: Date.now(), text: 'Ik zet 100 extra opzij' }]);
      save();
      return { gevonden: !!coachThisMonthAfspraak(), kaart: maandCoachIngang(maandMetAccept(maandRegels())) };
    });
    expect(h.gevonden).toBe(true);
    expect(h.kaart).toContain('Je afspraak deze maand');
    expect(h.kaart).toContain('Aanpassen');
    // en die opent het gesprek zonder sleutel, het pad dat op coMaandZwaarste terugvalt
    expect(h.kaart).toMatch(/coStart\('maand','[^']*'\)/);
  });

  test('de derde tak blijft ook: een gesprek juist wanneer er niets te beslissen valt', async ({ page }) => {
    await boot(page, { spaar: 40000, set: { nfToegewezen: 40000, goals: [], reserveringen: [], nfDoelVast: 100 } });
    const h = await page.evaluate(() => maandCoachIngang(maandMetAccept(maandRegels())));
    expect(h).toContain('niets te beslissen');
    expect(h).toContain("coStart('algemeen'");
  });

  test('coMaandZwaarste blijft bestaan, want coTopicMaand valt erop terug', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof coMaandZwaarste)).toBe('function');
    // en het gesprek zonder sleutel gebruikt hem nog
    const bron = await page.evaluate(() => coTopicMaand.toString());
    expect(bron).toContain('coMaandZwaarste');
  });
});

test.describe('e - geen tweede tik op de rij (v193)', () => {
  test('de rij houdt precies één onclick, en dat is zijn editor', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => {
      const r = maandMetAccept(maandRegels()).find((x) => x.key === 'buffer');
      return maandRij(r, false);
    });
    /* De rij-div zelf, tot waar de ingang begint. Knippen op 'coStart' zou te laat zijn: het
       onclick van de ingang staat daar al vóór, met zijn stopPropagation. */
    const rijDeel = h.slice(0, h.indexOf('padding:0 0 10px 17px'));
    expect([...rijDeel.matchAll(/onclick=/g)].length).toBe(1);
    expect(rijDeel).toContain('openNoodfondsPanel');
    // en de ingang is een eigen element met zijn eigen tik
    expect(h).toContain('coStart');
    expect(h).toContain('event.stopPropagation()');
  });

  test('de compacte rij krijgt geen ingang', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => {
      const r = maandMetAccept(maandRegels()).find((x) => x.key === 'dekking');
      return maandRij(r, true);
    });
    expect(h).not.toContain('coStart');
  });
});

test.describe('f - layout', () => {
  for (const w of [360, 390]) {
    test(`Maand past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
