// v229, route b en fase B.
// Route b: de bufferoptie 'Mijn maandbedrag verhogen' noemt geen bedrag, en het kaartbedrag is een
// totaal. De lat komt uit wat je zelf instelt: de afspraak draagt je maandbedrag van toen
// (instelling), afspraakUitkomst() leest monthlySavingTarget() op het toetsmoment, en het verschil
// is het afgesproken bedrag. Niet verhoogd: geen lat, toets van v207, en de terugblik zegt dat.
// Fase B: een regel waarover deze maand een afspraak is gemaakt vraagt geen beslissing meer. Hij
// schuift naar 'let op' via een tweede poort (r.afspraak, naast geaccepteerd uit v207), houdt zijn
// waarde, en verliest suggestie en gespreksingang. Niet via r.opTempo: dat is een meting.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const plusM = (n) => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
const VORIGE_TS = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 15).getTime(); })();
const SAV = 'NL01SAVE0000004323';

function drieTekorten(extra) {
  const p = seed();
  const s = JSON.parse(p.minder_set);
  // v323: sinds v323 is alleen een post in de LOPENDE maand een beslissing; elke latere post met een gat is aandacht.
  s.reserveringen = [{ id: 'r1', naam: 'Waterschap', bedrag: 9000, intervalM: 12, vervalmaand: plusM(0) }];
  s.resAcc = SAV;
  s.goals = [{ id: 'g1', naam: 'Vakantie', doel: 4000, gespaard: 200, allocMode: 'fixed', perMaand: 50, streefdatum: plusM(3) }];
  s.planOrder = ['g1', 'noodfonds'];
  /* v305: EN EEN BUFFER DIE WERKELIJK TEKORT KOMT, ZONDER DE GRENDEL TE SLUITEN. De basisfixture zet
     `nfToegewezen` hoog om de grendel open te houden, en tot v304 kon de bufferregel daarnaast een
     tekort melden omdat die het SALDO las. Sinds v305 lezen ze hetzelfde getal, en dan kunnen
     "grendel open" (toewijzing >= doel) en "buffer tekort" (toewijzing < norm x essCrisis) alleen
     samen bestaan als het DOEL onder de norm ligt. Met 2300 op een essCrisis van 1220 is dat 1,9
     maanden: de buffer is vol en komt toch tekort tegen de gekozen grens van 3.
     EN DE TOEWIJZINGEN SAMEN BLIJVEN BINNEN HET SPAARSALDO van 2500 (2300 plus de 200 van het doel),
     want anders meldt de controle van besluit 2 dat er meer is toegewezen dan er staat en schuift de
     regel naar `let op` in plaats van `tekort`. */
  s.nfDoelVast = 2300; s.nfToegewezen = 2300;
  if (extra) extra(s);
  p.minder_set = JSON.stringify(s);
  return p;
}
// de fixture heeft savingMode 'amount' met savingAmount 300, en zet deze maand €200 op de spaarrekening
const bufferAfspraak = (ts, extra) => Object.assign({ ts, type: 'afspraak', text: 'Ik verhoog het bedrag dat ik per maand opzij zet',
  regel: 'buffer', vorm: 'inleg', meet: 'spaar', basis: 0, instelling: 300 }, extra || {});
const uitkomst = (page) => page.evaluate(() => afspraakUitkomst(vorigeAfspraak()));
const rijen = (page) => page.evaluate(() => {
  const kaarten = [...document.querySelectorAll('#s-maand .card')];
  const per = {};
  for (const c of kaarten) {
    const kop = ((c.querySelector('.hlabel') || {}).textContent || '').trim();
    if (kop) per[kop] = c.innerText.replace(/\s+/g, ' ');
  }
  return per;
});
async function maand(page, p) {
  await open(page, p);
  await page.evaluate(() => go('maand'));
  await page.waitForSelector('#s-maand .card');
}

test.describe('a - route b: de lat is je eigen maandbedrag', () => {
  test('de bufferoptie draagt je maandbedrag van nu', async ({ page }) => {
    await open(page, drieTekorten());
    const o = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const r = maandRegels().find((x) => x.key === 'buffer');
      return maandRegelOpties(r, m).find((x) => x.vorm === 'inleg').extra;
    });
    expect(o.instelling).toBe(300);
    expect(o.meet).toBe('spaar');
    expect(o.bedrag).toBeUndefined();   // nog steeds geen bedrag uit de optie zelf
  });

  test('verhoogd met 200, en 200 ging er heen: gelukt', async ({ page }) => {
    await open(page, drieTekorten((s) => { s.savingAmount = 500; s.coachLog = [bufferAfspraak(VORIGE_TS)]; }));
    const U = await uitkomst(page);
    expect(U.afgesproken).toBe(200);
    expect(U.instelling).toEqual({ toen: 300, nu: 500 });
    expect(U.nu.bedrag).toBe(200);
    expect(U.status).toBe('gelukt');
  });

  test('verhoogd met 300, maar 200 ging er heen: niet gelukt', async ({ page }) => {
    await open(page, drieTekorten((s) => { s.savingAmount = 600; s.coachLog = [bufferAfspraak(VORIGE_TS)]; }));
    const U = await uitkomst(page);
    expect(U.afgesproken).toBe(300);
    expect(U.status).toBe('niet gelukt');
    const h = await page.evaluate(() => maandAfspraakLus());
    expect(h).toContain('Je maandbedrag ging van €300 naar €600, dus afgesproken was €300 erbij.');
    expect(h).not.toContain('Is het gelukt?');
  });

  test('niet verhoogd: geen lat, de toets van v207, en de terugblik zegt het', async ({ page }) => {
    await open(page, drieTekorten((s) => { s.coachLog = [bufferAfspraak(VORIGE_TS)]; }));
    const U = await uitkomst(page);
    expect(U.afgesproken).toBeNull();
    expect(U.instelling).toEqual({ toen: 300, nu: 300 });
    expect(U.status).toBe('gelukt');                 // 200 is meer dan 0: elke verhoging telt
    const h = await page.evaluate(() => maandAfspraakLus());
    expect(h).toContain('Je maandbedrag staat nog op €300.');
    expect(h).not.toContain('afgesproken was');
  });

  test('een bedrag op de afspraak wint van de instelling', async ({ page }) => {
    await open(page, drieTekorten((s) => { s.savingAmount = 500; s.coachLog = [bufferAfspraak(VORIGE_TS, { bedrag: 150 })]; }));
    const U = await uitkomst(page);
    expect(U.afgesproken).toBe(150);
    expect(U.instelling).toBeUndefined();
  });

  test('een afspraak van vóór v229 zonder instelling houdt de toets van v207', async ({ page }) => {
    await open(page, drieTekorten((s) => { s.savingAmount = 500; s.coachLog = [bufferAfspraak(VORIGE_TS, { instelling: undefined })]; }));
    const U = await uitkomst(page);
    expect(U.afgesproken).toBeNull();
    expect(U.instelling).toBeUndefined();
    expect(U.status).toBe('gelukt');
  });
});

test.describe('b - een regel met een lopende afspraak vraagt geen beslissing', () => {
  const metLopende = (extra) => drieTekorten((s) => { s.coachLog = [bufferAfspraak(Date.now())]; if (extra) extra(s); });

  test('de bufferregel schuift naar let op, met de afspraak erbij, en houdt zijn waarde', async ({ page }) => {
    await maand(page, metLopende());
    const per = await rijen(page);
    expect(per['Vraagt aandacht']).toContain('Buffer in maanden');
    /* v324: 'Vraagt aandacht' is een lijstregel, dus de rij draagt de OORZAAK en niet meer de
       eenheid van de uitgeklapte vorm. Het label van v305 staat in die vorm ook onder 'Vraagt een
       beslissing' niet, en dat is sinds v320 zo. */
    expect(per['Vraagt aandacht']).toContain('je norm is 3');
    /* v314: DE AFSPRAAK STAAT OP EEN PLEK, en dat is de kaart. Hij stond ook in de rij, dus je las
       dezelfde tekst twee keer op een scherm, en alleen de kaart heeft de ingang om hem aan te
       passen. De verbinding tussen de twee is niet weg maar omgedraaid: de kaart noemt de regel.
       De assertie is daarmee strenger dan de oude, want hij eist ook dat het er PRECIES EEN keer
       staat. */
    const heel = await page.evaluate(() => document.getElementById('s-maand').innerText);
    expect(per['Vraagt aandacht']).not.toContain('Hier loopt een afspraak over');
    expect((heel.match(/Ik verhoog het bedrag dat ik per maand opzij zet/g) || []).length).toBe(1);
    expect(heel).toContain('JE AFSPRAAK DEZE MAAND');
    expect(per['Vraagt een beslissing']).not.toContain('Buffer in maanden');
    // de andere twee blijven een beslissing vragen
    expect(per['Vraagt een beslissing']).toContain('Dekking');
    expect(per['Vraagt een beslissing']).toMatch(/Vakantie|aankoopdoel/i);
  });

  test('de suggestie en de gespreksingang vervallen voor die regel, en alleen voor die regel', async ({ page }) => {
    await maand(page, metLopende());
    const r = await page.evaluate(() => {
      const m = curMonth || thisYM();
      const RO = maandMetAfspraak(maandMetAccept(maandRegels()));
      const b = RO.find((x) => x.key === 'buffer'), d = RO.find((x) => x.key === 'dekking');
      return { bStatus: b.status, bAfspraak: !!b.afspraak, bSug: maandSuggestie(b, m), bIng: maandIngang(b, m),
        dStatus: d.status, dSug: maandSuggestie(d, m), dIng: maandIngang(d, m) };
    });
    expect(r.bStatus).toBe('let op');
    expect(r.bAfspraak).toBe(true);
    expect(r.bSug).toBe('');
    expect(r.bIng).toBe('');
    expect(r.dStatus).toBe('tekort');
    expect(r.dSug).not.toBe('');
    expect(r.dIng).toContain("coStart('maand'");
    const html = await page.evaluate(() => document.querySelector('#s-maand').innerHTML);
    expect(html).not.toContain("coStart('maand','" + CUR + "','buffer')");
  });

  test('het oordeel telt de regel niet meer als beslissing', async ({ page }) => {
    await maand(page, metLopende());
    const zin = await page.evaluate(() => document.querySelector('#s-maand .card div[style*="font-weight:700"]').innerText);
    expect(zin).toMatch(/2 dingen die een beslissing vragen/);
  });

  test('de meting zelf is niet aangeraakt: maandRegels zegt nog tekort, en niet op tempo', async ({ page }) => {
    await maand(page, metLopende());
    const r = await page.evaluate(() => { const b = maandRegels().find((x) => x.key === 'buffer'); return { status: b.status, opTempo: !!b.opTempo, kritiek: !!b.kritiek }; });
    expect(r.status).toBe('tekort');
    expect(r.opTempo).toBe(false);
    expect(r.kritiek).toBe(true);
  });

  test('een afspraak van vorige maand doet dit niet', async ({ page }) => {
    await maand(page, drieTekorten((s) => { s.coachLog = [bufferAfspraak(VORIGE_TS)]; }));
    const per = await rijen(page);
    expect(per['Vraagt een beslissing']).toContain('Buffer in maanden');
    expect(JSON.stringify(per)).not.toContain('Hier loopt een afspraak over');
  });

  test('een acceptatie loopt via zijn eigen poort en krijgt niet ook deze', async ({ page }) => {
    await maand(page, drieTekorten((s) => {
      s.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'Ik accepteer dit voorlopig, voor buffer in maanden', regel: 'buffer', vorm: 'accepteer' }];
      s.maandAccept = { buffer: { ts: Date.now(), tot: null } };
    }));
    const r = await page.evaluate(() => {
      const b = maandMetAfspraak(maandMetAccept(maandRegels())).find((x) => x.key === 'buffer');
      return { status: b.status, geaccepteerd: !!b.geaccepteerd, afspraak: !!b.afspraak };
    });
    expect(r.status).toBe('let op');
    expect(r.geaccepteerd).toBe(true);
    expect(r.afspraak).toBe(false);
    const per = await rijen(page);
    expect(per['Vraagt aandacht']).toContain('Buffer in maanden');
    expect(per['Vraagt aandacht']).not.toContain('Hier loopt een afspraak over');
    // v324: de acceptatie-zin staat in de sheet achter de lijstregel, en niet meer in de kaart
    expect(per['Vraagt aandacht']).not.toContain('Je hebt dit bewust geaccepteerd');
    await page.locator('.row[data-beslis="buffer"]').click();
    expect(await page.locator('#sheet').innerText()).toContain('Je hebt dit bewust geaccepteerd');
  });

  test('"Alleen vastleggen" telt ook: de afspraak draagt de regelKey', async ({ page }) => {
    await maand(page, drieTekorten((s) => {
      s.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'Ik pak buffer in maanden deze maand op', regel: 'buffer', cat: null }];
    }));
    const per = await rijen(page);
    const heel = await page.evaluate(() => document.getElementById('s-maand').innerText);
    // v314: de regelKey doet nog steeds zijn werk (de rij schuift naar aandacht), en de tekst staat
    // op de kaart in plaats van in de rij
    expect(per['Vraagt aandacht']).toContain('Buffer in maanden');
    expect(per['Vraagt aandacht']).not.toContain('Hier loopt een afspraak over');
    expect((heel.match(/Ik pak buffer in maanden deze maand op/g) || []).length).toBe(1);
  });

  for (const w of [360, 390]) {
    test(`Maand met een lopende afspraak past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await maand(page, metLopende());
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
