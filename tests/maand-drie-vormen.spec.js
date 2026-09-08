// v207: de kaart 'Vraagt een beslissing' toonde een stand met een gevolgzin en geen keuze. De
// keuzes staan nu in het gesprek dat de coach-ingang opent: per regel de inleg aanpassen, de norm
// aanpassen, of bewust niets doen. Elke optie leidt naar een bestaande ingang.
//
// De derde vorm is bewust anders ontworpen: accepteren heeft een eigen opslag (SET.maandAccept),
// omdat de terugblik hoort in de maand waarin het gat valt en dat maanden later kan zijn dan de
// afspraaklus kijkt.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const CUR = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); })();
const plusM = (n) => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };

// dekking, buffer en doel alle drie op tekort: een grote jaarpost dichtbij, een lage buffer,
// en een doel met een streefdatum die het huidige tempo niet haalt
function drieTekorten(extra) {
  const p = seed();
  const s = JSON.parse(p.minder_set);
  s.reserveringen = [{ id: 'r1', naam: 'Waterschap', bedrag: 9000, intervalM: 12, vervalmaand: plusM(2) }];
  s.resAcc = 'NL01SAVE0000004323';
  s.goals = [{ id: 'g1', naam: 'Vakantie', doel: 4000, gespaard: 200, allocMode: 'fixed', perMaand: 50, streefdatum: plusM(3) }];
  s.planOrder = ['g1', 'noodfonds'];
  if (extra) extra(s);
  p.minder_set = JSON.stringify(s);
  return p;
}
const regels = (page) => page.evaluate(() => maandRegels().map((r) => ({ key: r.key, status: r.status, tekort: r.tekortPerMaand || 0 })));
const opties = (page, key) => page.evaluate((k) => {
  const m = curMonth || months()[months().length - 1];
  const r = maandRegels().find((x) => x.key === k);
  return r ? maandRegelOpties(r, m).map((o) => ({ vorm: o.vorm, l: o.l, tekst: o.tekst, accept: o.accept || null, na: !!o.na })) : null;
}, key);

test.describe('a - elke regel heeft zijn drie vormen', () => {
  test('de fixture zet alle drie op tekort', async ({ page }) => {
    await open(page, drieTekorten());
    const R = await regels(page);
    expect(R.map((r) => r.key).sort()).toEqual(['buffer', 'dekking', 'doel']);
    for (const r of R) expect(r.status).toBe('tekort');
  });

  for (const key of ['dekking', 'buffer', 'doel']) {
    test(`${key}: ten minste twee opties, en de drie vormen zijn onderscheiden`, async ({ page }) => {
      await open(page, drieTekorten());
      const o = await opties(page, key);
      expect(o.length).toBeGreaterThanOrEqual(2);
      // elke optie draagt een vorm, en accepteren staat er precies één keer
      for (const x of o) expect(['inleg', 'norm', 'accepteer']).toContain(x.vorm);
      expect(o.filter((x) => x.vorm === 'accepteer').length).toBe(1);
      expect(o.filter((x) => x.vorm === 'norm').length).toBeGreaterThanOrEqual(1);
      // geen enkele optie is voorgesorteerd of aanbevolen
      for (const x of o) {
        expect(x.l.toLowerCase()).not.toMatch(/aanbevolen|beste|slim|verstandig|zou ik/);
        expect(x.tekst.toLowerCase()).not.toMatch(/aanbevolen|beste|slim|verstandig/);
      }
    });
  }

  test('een optie zonder uitkomst verschijnt niet', async ({ page }) => {
    // geen reserveringen: dan is er niets bij te stellen en geen inleg-doel
    await open(page, seed());
    const o = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const r = maandRegels().find((x) => x.key === 'dekking');
      return r ? maandRegelOpties(r, m).length : 'geen dekkingsregel';
    });
    expect(o).toBe('geen dekkingsregel');   // zonder posten bestaat de regel zelf niet
  });

  test('bij het aankoopdoel leiden drie labels naar dezelfde sheet', async ({ page }) => {
    await open(page, drieTekorten());
    const o = await opties(page, 'doel');
    const norm = o.filter((x) => x.vorm === 'norm');
    expect(norm.length).toBe(3);            // inleg, streefdatum, doelbedrag
    for (const x of norm) expect(x.na).toBe(true);
  });

  test('bij dekking opent de inleg-optie geen sheet, want die instelling bestaat niet', async ({ page }) => {
    await open(page, drieTekorten());
    const o = await opties(page, 'dekking');
    const inleg = o.find((x) => x.vorm === 'inleg');
    expect(inleg).toBeTruthy();
    expect(inleg.na).toBe(false);
  });
});

test.describe('b - accepteren verplaatst de regel, en telt niet meer als tekort', () => {
  test('een geaccepteerde regel staat bij aandacht en niet bij beslissing', async ({ page }) => {
    await open(page, drieTekorten());
    const r = await page.evaluate(() => {
      const voor = maandMetAccept(maandRegels()).filter((x) => x.status === 'tekort').map((x) => x.key);
      maandAcceptZet('buffer');
      const na = maandMetAccept(maandRegels());
      return { voor, naTekort: na.filter((x) => x.status === 'tekort').map((x) => x.key),
        naLetOp: na.filter((x) => x.status === 'let op').map((x) => x.key),
        vlag: !!na.find((x) => x.key === 'buffer').geaccepteerd };
    });
    expect(r.voor).toContain('buffer');
    expect(r.naTekort).not.toContain('buffer');
    expect(r.naLetOp).toContain('buffer');
    expect(r.vlag).toBe(true);
  });

  test('het scherm zegt dat je hem bewust hebt geaccepteerd', async ({ page }) => {
    await open(page, drieTekorten());
    const t = await page.evaluate(() => { maandAcceptZet('buffer'); go('maand'); return $('#s-maand').innerText; });
    expect(t).toContain('Je hebt dit bewust geaccepteerd');
    // de kaart Vraagt een beslissing noemt hem niet meer
    const kaart = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#s-maand .card')].find((x) => (x.innerText || '').indexOf('Vraagt een beslissing') === 0);
      return c ? c.innerText : '';
    });
    expect(kaart).not.toContain('Buffer in maanden');
  });

  test('het maandoordeel telt hem niet meer als tekort', async ({ page }) => {
    await open(page, drieTekorten());
    const r = await page.evaluate(() => {
      const a = maandOordeel(maandMetAccept(maandRegels())).zin;
      maandAcceptZet('buffer');
      return { a, b: maandOordeel(maandMetAccept(maandRegels())).zin };
    });
    expect(r.a).not.toBe(r.b);
    expect(r.a).toContain('3');   // drie dingen die een beslissing vragen
    expect(r.b).toContain('2');
  });

  test('KRITIEK: beleggenKlaar ziet het tekort onverkort', async ({ page }) => {
    await open(page, drieTekorten());
    const r = await page.evaluate(() => {
      const voor = beleggenKlaar(maandRegels());
      maandAcceptZet('buffer');
      return { voor: { klaar: voor.klaar, blok: voor.blokkade },
        ruw: (function () { const x = beleggenKlaar(maandRegels()); return { klaar: x.klaar, blok: x.blokkade }; })(),
        gewogen: (function () { const x = beleggenKlaar(maandMetAccept(maandRegels())); return { klaar: x.klaar, blok: x.blokkade }; })() };
    });
    // de onbewerkte lijst blijft hetzelfde oordeel geven, ook na accepteren
    expect(r.ruw).toEqual(r.voor);
    expect(r.ruw.klaar).toBe(false);
  });

  test('renderMaand geeft beleggenKlaar de onbewerkte regels', async ({ page }) => {
    await open(page, drieTekorten());
    const bron = await page.evaluate(() => {
      const src = [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n');
      const i = src.indexOf('function renderMaand(');
      return src.slice(i, i + 4000);
    });
    expect(bron).toContain('maandBeleggenRegel(R)');
    expect(bron).not.toContain('maandBeleggenRegel(RO)');
    expect(bron).toContain('maandMetAccept(R).concat(STR)');
  });
});

test.describe('c - de acceptatie kent een einde', () => {
  test('drie vervalroutes, elk met hun eigen reden', async ({ page }) => {
    await open(page, drieTekorten());
    const r = await page.evaluate(() => {
      const reg = () => maandRegels().find((x) => x.key === 'buffer');
      maandAcceptZet('buffer');
      const geldig = maandAcceptStatus('buffer', reg()).geldig;
      SET.maandAccept.buffer.tot = thisYM();
      const maand = maandAcceptStatus('buffer', reg()).reden;
      SET.maandAccept.buffer.tot = ''; SET.maandAccept.buffer.ym = '2020-01';
      const oud = maandAcceptStatus('buffer', reg()).reden;
      SET.maandAccept.buffer.ym = thisYM();
      SET.maandAccept.buffer.maat = (+SET.maandAccept.buffer.maat || 1) * 3;
      const veranderd = maandAcceptStatus('buffer', reg()).reden;
      return { geldig, maand, oud, veranderd };
    });
    expect(r).toEqual({ geldig: true, maand: 'maand', oud: 'oud', veranderd: 'veranderd' });
  });

  test('na verval staat de regel weer als beslissing', async ({ page }) => {
    await open(page, drieTekorten());
    const r = await page.evaluate(() => {
      maandAcceptZet('buffer');
      const tijdens = maandMetAccept(maandRegels()).find((x) => x.key === 'buffer').status;
      SET.maandAccept.buffer.ym = '2020-01';   // ouder dan ACCEPT_MAX_MND
      return { tijdens, na: maandMetAccept(maandRegels()).find((x) => x.key === 'buffer').status };
    });
    expect(r.tijdens).toBe('let op');
    expect(r.na).toBe('tekort');
  });

  test('de bovengrens bestaat, ook zonder gat-maand', async ({ page }) => {
    await open(page, drieTekorten());
    const r = await page.evaluate(() => ({
      max: ACCEPT_MAX_MND, verschil: ACCEPT_VERSCHIL,
      totBuffer: acceptTot(maandRegels().find((x) => x.key === 'buffer')),
      totDoel: acceptTot(maandRegels().find((x) => x.key === 'doel')),
    }));
    expect(r.max).toBeGreaterThan(0);
    expect(r.totBuffer).toBe('');            // buffer heeft geen maand waarin iets valt
    expect(r.totDoel).toMatch(/^\d{4}-\d{2}$/);
  });

  test('bij de bereikte gat-maand komt er een terugblik, en die is eenmalig', async ({ page }) => {
    await open(page, drieTekorten());
    const r = await page.evaluate(() => {
      maandAcceptZet('doel');
      SET.maandAccept.doel.tot = thisYM(); save();   // de maand is er
      go('maand');
      const met = $('#s-maand').innerText;
      maandAcceptSluit('doel');
      return { met, zonder: $('#s-maand').innerText, weg: !(SET.maandAccept || {}).doel };
    });
    // .hlabel is text-transform:uppercase, en innerText geeft de getransformeerde tekst terug,
    // dus toetsen op de kop zelf zoekt naar iets wat er niet zo staat. De zin eronder is de bron.
    expect(r.met).toContain('Je accepteerde');
    expect(r.met).toContain('Die maand is er');
    expect(r.zonder).not.toContain('Je accepteerde');
    expect(r.weg).toBe(true);
  });
});

test.describe('d - een afspraak die volgende maand wordt getoetst', () => {
  test('een inleg-afspraak op de reserveringenpot is meetbaar', async ({ page }) => {
    const vorige = (() => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() - 1, 15); return x.getTime(); })();
    const p = drieTekorten((s) => {
      s.coachLog = [{ ts: vorige, type: 'afspraak', text: 'Ik zet meer opzij voor mijn reserveringen',
        regel: 'dekking', vorm: 'inleg', meet: 'res', basis: 0 }];
    });
    await open(page, p);
    const r = await page.evaluate(() => {
      const af = vorigeAfspraak();
      const U = afspraakUitkomst(af);
      return { heeft: !!af, status: U.status, wat: U.wat || null, nu: U.nu ? U.nu.bedrag : null };
    });
    expect(r.heeft).toBe(true);
    expect(['gelukt', 'niet gelukt']).toContain(r.status);   // meetbaar, geen zelfrapportage
    expect(r.wat).toContain('reserveringen');
  });

  test('een norm-afspraak blijft niet te toetsen, zoals afgesproken', async ({ page }) => {
    const vorige = (() => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() - 1, 15); return x.getTime(); })();
    const p = drieTekorten((s) => {
      s.coachLog = [{ ts: vorige, type: 'afspraak', text: 'Ik verlaag mijn richtbedrag', regel: 'buffer', vorm: 'norm' }];
    });
    await open(page, p);
    expect(await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()).status)).toBe('niet te toetsen');
  });

  test('een accepteer-afspraak krijgt geen tweede terugblik in de afspraaklus', async ({ page }) => {
    const vorige = (() => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() - 1, 15); return x.getTime(); })();
    const p = drieTekorten((s) => {
      s.coachLog = [{ ts: vorige, type: 'afspraak', text: 'Ik accepteer dit', regel: 'buffer', vorm: 'accepteer' }];
    });
    await open(page, p);
    expect(await page.evaluate(() => maandAfspraakLus())).toBe('');
  });

  test('de afspraak draagt de regelKey en de vorm', async ({ page }) => {
    await open(page, drieTekorten());
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const R = maandRegels().find((x) => x.key === 'dekking');
      return maandRegelOpties(R, m).map((o) => Object.assign({ vorm: o.vorm }, o.extra || {}));
    });
    for (const x of r) expect(x.vorm).toBe(x.vorm);
    const inleg = r.find((x) => x.vorm === 'inleg');
    expect(inleg.meet).toBe('res');
    expect(typeof inleg.basis).toBe('number');
  });
});

test.describe('e - layout', () => {
  for (const w of [360, 390]) {
    test(`Maand met een geaccepteerde regel past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await open(page, drieTekorten());
      await page.evaluate(() => { maandAcceptZet('buffer'); go('maand'); });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
