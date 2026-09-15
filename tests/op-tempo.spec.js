// v226: de statusdrempel op Maand toetste of een norm NU gehaald wordt, niet of hij op tijd wordt
// gehaald. Daardoor stond er een tekort bij regels waar niets te beslissen valt: een buffer van 1,1
// maanden waar elke maand geld naartoe gaat, en een dekking waarvan het gat pas volgend jaar valt.
//
// Buffer: geen beslissing zolang er maandelijks geld naartoe gaat en er geen geld wegvloeit. Bron is
// savedNet() per afgeronde maand - de stroom waarvan spaarSaldo() de stand meet - en niet de alloc
// van het noodfonds-item: dat is een voornemen, en v216 legt vast dat een voornemen geen feit
// verdringt. Eén reeks voor beide richtingen: savedNet > 0 in elke maand van het venster sluit een
// maand zonder inleg en een maand met onttrekking samen uit.
// Dekking: geen beslissing zolang het knelmoment ver genoeg weg ligt. Dat moment is D.gat.maand en
// niet gedektTot - die twee kunnen maanden uit elkaar liggen.
//
// KRITIEK: een regel die naar 'let op' schuift houdt geen gespreksingang, want die vraagt om een
// keuze en er valt niets te kiezen. En beleggenKlaar() mag er niet in meegaan: die leest voor de
// buffer r.kritiek en niet de status, anders geeft een buffer van 1,1 maanden groen licht om te
// beleggen (v154).
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const vooruit = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000009999';

/* Eén fixture met vier knoppen, want de vier gevallen verschillen alleen in de stroom naar de
   spaarrekening en in de maand waarin de reservering valt.
     spaarPer   het netto bedrag dat elke maand op de spaarrekening landt (0 = geen boeking)
     resIn      hoeveel maanden vooruit de reservering valt
     spaar      het saldo van de spaarrekening
   Het spaarsaldo staat laag en de huur hoog, zodat bufferMaanden() ver onder de drie blijft: het
   gaat hier om de richting, niet om de stand. */
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  const per = o.spaarPer != null ? o.spaarPer : 300;
  for (let i = 11; i >= 0; i--) {
    const m = ym(new Date(now.getFullYear(), now.getMonth() - i, 1));
    add('i' + m, MAIN, m, '05', 4000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1500, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '06', -900, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('r' + m, RES, m, '10', 100, 'Reserveringen', 'NAAR RESERVERINGEN');
    // de rekening bestaat ook in de stilstaande fixture: één boeking buiten het venster van drie
    if (per !== 0) add('s' + m, SPAAR, m, '26', per, 'Spaarpot', 'NAAR SPAREN');
    else if (i === 11) add('s' + m, SPAAR, m, '26', 300, 'Spaarpot', 'NAAR SPAREN');
    if (o.opname) add('u' + m, SPAAR, m, '27', -o.opname, 'Opname', 'VAN SPAREN');
  }
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4000,
    manualBal: { [MAIN]: 2000, [SPAAR]: o.spaar != null ? o.spaar : 2000, [RES]: 400 },
    budgets: { boodschappen: 1000, huur: 1500 },
    savingMode: 'amount', savingAmount: 300,
    savingsAcc: { [SPAAR]: true }, resAcc: RES,
    nfDoelVast: 7200, nfToegewezen: 2000, nfToegewezenMigrated: true, nfMaanden: 3,
    goals: [],
    reserveringen: [{ id: 'r1', naam: 'Aanslag', bedrag: 3000, vervalmaand: vooruit(o.resIn != null ? o.resIn : 7), intervalM: 12 }],
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof bufferTempo === 'function');
  await page.evaluate(() => go('maand'));
}
const regel = (page, key) => page.evaluate((k) => {
  const r = maandRegels().find((x) => x.key === k) || null;
  if (!r) return null;
  return { status: r.status, kritiek: !!r.kritiek, opTempo: !!r.opTempo, gevolg: r.gevolg,
    ingang: maandIngang(r, curMonth || thisYM()), suggestie: maandSuggestie(r, curMonth || thisYM()) };
}, key);
const kaarten = (page) => page.evaluate(() => [...document.querySelectorAll('#s-maand .card')].map((c) => ({
  kop: ((c.querySelector('.hlabel') || {}).textContent || '').trim(),
  spaarquote: /Spaarquote/.test(c.textContent),
  limiet: /inkomen-limiet/.test(c.textContent),
})));

test.describe('a - de buffer kijkt naar de richting, niet alleen naar de stand', () => {
  test('de stand staat onder de drie maanden, anders meet deze fixture niets', async ({ page }) => {
    await boot(page);
    const bm = await page.evaluate(() => bufferMaanden());
    expect(bm).not.toBeNull();
    expect(bm).toBeLessThan(3);
  });

  test('met maandelijkse inleg en een stijgend saldo: geen tekort', async ({ page }) => {
    await boot(page);
    const r = await regel(page, 'buffer');
    expect(r.status).toBe('let op');
    expect(r.opTempo).toBe(true);
    expect(r.kritiek).toBe(true);        // de stand blijft wat hij is
  });

  test('zonder inleg in het venster: wel een tekort', async ({ page }) => {
    await boot(page, { spaarPer: 0 });
    const r = await regel(page, 'buffer');
    expect(r.status).toBe('tekort');
    expect(r.opTempo).toBe(false);
  });

  test('een dalende buffer: wel een tekort', async ({ page }) => {
    await boot(page, { spaarPer: -200 });
    const r = await regel(page, 'buffer');
    expect(r.status).toBe('tekort');
    expect(r.opTempo).toBe(false);
  });

  /* Netto, niet bruto: een opname die kleiner is dan de storting laat de buffer stijgen, en dan
     gaat er nog steeds geld naartoe. savedNet() is die netto-stroom. */
  test('een opname kleiner dan de storting houdt de regel op tempo', async ({ page }) => {
    await boot(page, { spaarPer: 300, opname: 100 });
    const uit = await page.evaluate(() => {
      const T = bufferTempo();
      return { reeks: T && T.reeks, status: maandRegels().find((r) => r.key === 'buffer').status };
    });
    expect(uit.reeks).toEqual([200, 200, 200]);
    expect(uit.status).toBe('let op');
  });

  test('een opname groter dan de storting haalt hem eraf', async ({ page }) => {
    await boot(page, { spaarPer: 300, opname: 400 });
    const uit = await page.evaluate(() => {
      const T = bufferTempo();
      return { reeks: T && T.reeks, status: maandRegels().find((r) => r.key === 'buffer').status };
    });
    expect(uit.reeks).toEqual([-100, -100, -100]);
    expect(uit.status).toBe('tekort');
  });

  test('de gevolgzin noemt de stand, wat die betekent en de richting', async ({ page }) => {
    await boot(page);
    const r = await regel(page, 'buffer');
    expect(r.gevolg).toMatch(/maanden essenti/);
    expect(r.gevolg).toContain('Onder de drie maanden vangt hij weinig op');
    expect(r.gevolg).toContain('elke maand geld naartoe');
    // geen bemoediging, geen felicitatie
    expect(r.gevolg).not.toMatch(/goed bezig|mooi|prima|gelukt/i);
  });
});

test.describe('b - bufferTempo zwijgt waar hij niets meet', () => {
  test('zonder aangewezen spaarrekening is de richting onbekend, en de regel blijft een tekort', async ({ page }) => {
    // een expliciete keuze per rekening (v20/v90), want zonder keuze valt hij op de standaard terug
    await boot(page, { set: { savingsAcc: { [SPAAR]: false }, extraSavings: 2000 } });
    const uit = await page.evaluate(() => ({ tempo: bufferTempo(), bron: spaarSaldo().bron,
      status: (maandRegels().find((r) => r.key === 'buffer') || {}).status }));
    expect(uit.bron).not.toBe('spaarrekening');
    expect(uit.tempo).toBeNull();
    expect(uit.status).toBe('tekort');
  });

  test('te weinig afgeronde maanden is onbekend, geen nul', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => {
      const nu = thisYM();
      TX = TX.filter((x) => x.date.slice(0, 7) >= nu);   // alleen de lopende maand blijft over
      save();
      return bufferTempo();
    });
    expect(t).toBeNull();
  });

  test('het venster staat op één plek en telt alleen afgeronde maanden', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const T = bufferTempo();
      return { n: MAAND_DREMPEL.bufferTempoVenster, len: T.reeks.length, maanden: T.maanden, nu: thisYM() };
    });
    expect(uit.len).toBe(uit.n);
    expect(uit.maanden).not.toContain(uit.nu);
  });
});

test.describe('c - dekking meet het knelmoment, niet de stand van nu', () => {
  test('gedekt tot volgende maand: een beslissing', async ({ page }) => {
    await boot(page, { resIn: 1 });
    const r = await regel(page, 'dekking');
    expect(r.status).toBe('tekort');
    expect(r.opTempo).toBe(false);
  });

  test('gedekt tot volgend jaar: aandacht, geen beslissing', async ({ page }) => {
    await boot(page, { resIn: 7 });
    const r = await regel(page, 'dekking');
    expect(r.status).toBe('let op');
    expect(r.opTempo).toBe(true);
  });

  /* De marge is de grens en staat op één plek; deze twee leggen hem aan beide kanten vast. */
  test('precies op de marge is het nog aandacht, eronder een beslissing', async ({ page }) => {
    await boot(page, { resIn: 3 });
    expect((await regel(page, 'dekking')).status).toBe('let op');
    await boot(page, { resIn: 2 });
    expect((await regel(page, 'dekking')).status).toBe('tekort');
  });

  /* De reden dat er op D.gat.maand gemeten wordt en niet op gedektTot: die twee kunnen maanden uit
     elkaar liggen, en dan legt gedektTot het knelmoment te dichtbij. */
  test('gedektTot en de maand van het gat zijn niet hetzelfde gegeven', async ({ page }) => {
    await boot(page, { resIn: 7, set: { reserveringen: [
      { id: 'r0', naam: 'Premie', bedrag: 200, vervalmaand: vooruit(1), intervalM: 0 },
      { id: 'r1', naam: 'Aanslag', bedrag: 3000, vervalmaand: vooruit(7), intervalM: 12 },
    ] } });
    const D = await page.evaluate(() => { const d = dekking(12); return { tot: d.gedektTot, gat: d.gat && d.gat.maand }; });
    expect(D.tot).toBe(vooruit(1));
    expect(D.gat).toBe(vooruit(7));
    expect(D.tot).not.toBe(D.gat);
    // en op het gat gemeten valt de regel in aandacht, op gedektTot gemeten zou hij een beslissing zijn
    expect((await regel(page, 'dekking')).status).toBe('let op');
  });

  /* Past het hele jaar, dan is de graad per constructie op of boven de 100 en is 'ok' de uitkomst.
     Dat is geen keuze van deze ronde maar een eigenschap van de som: geen gat betekent dat je stand
     elk voorkomen in de horizon dekt, en benodigdeStand is hoogstens het opgebouwde deel van de
     EERSTE voorkomens. De tak 'geen gat maar de opbouw loopt achter' bestaat dus niet, en de status
     van deze regel hangt in de praktijk alleen aan het gat. Dat wordt hier vastgelegd, zodat de
     graad-clausule in de status niet ooit als bereikbaar wordt gelezen. */
  test('geen gat betekent een graad op of boven de honderd, dus ok en geen tekort', async ({ page }) => {
    await boot(page, { resIn: 7, set: { manualBal: { [MAIN]: 2000, [SPAAR]: 2000, [RES]: 6000 },
      reserveringen: [
        { id: 'r1', naam: 'Aanslag', bedrag: 3000, vervalmaand: vooruit(7), intervalM: 12 },
        { id: 'r2', naam: 'Premie', bedrag: 2000, vervalmaand: vooruit(1), intervalM: 12 },
      ] } });
    const uit = await page.evaluate(() => { const d = dekking(12); return { gat: d.gat, graad: d.graad }; });
    expect(uit.gat).toBeNull();
    expect(uit.graad).toBeGreaterThanOrEqual(100);
    const r = await regel(page, 'dekking');
    expect(r.status).toBe('ok');
    expect(r.opTempo).toBe(false);   // ok draagt het veld niet: er is geen norm die niet gehaald wordt
  });
});

/* Op tempo zegt dat het gat ver weg ligt, niet dat het gedicht is. Wat er nog aan de pot ontbreekt
   blijft dus gewoon gemeten, want meevallerNodig() leest dat veld om te zeggen waar een meevaller
   als eerste heen hoort. Hing het aan de status, dan verdween de reserveringenpost daar stil uit. */
test.describe('c2 - de gemeten achterstand blijft staan, ook op tempo', () => {
  test('tekortPerMaand is D.tekort en niet nul zodra de regel aandacht vraagt', async ({ page }) => {
    await boot(page, { resIn: 7 });
    const uit = await page.evaluate(() => {
      const r = maandRegels().find((x) => x.key === 'dekking');
      return { status: r.status, veld: r.tekortPerMaand, bron: Math.max(dekking(12).tekort, 0) };
    });
    expect(uit.status).toBe('let op');
    expect(uit.bron).toBeGreaterThan(0);
    expect(uit.veld).toBe(uit.bron);
  });

  // meevallerPlan zwijgt zodra beleggenKlaar() onvolledig is, dus de doelregel moet bestaan
  test('de meevaller-verdeling houdt de reserveringen dus in het voorstel', async ({ page }) => {
    await boot(page, { resIn: 7, set: { goals: [
      { id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, allocMode: 'fixed', perMaand: 50, streefdatum: vooruit(12) },
    ] } });
    const uit = await page.evaluate(() => {
      const R = maandRegels();
      const nodig = meevallerNodig('dekking', R);
      return { status: R.find((x) => x.key === 'dekking').status, nodig,
        posten: meevallerPlan(Math.round(nodig / 0.9)).posten.map((p) => p.key) };
    });
    expect(uit.status).toBe('let op');
    expect(uit.nodig).toBeGreaterThan(0);
    expect(uit.posten[0]).toBe('dekking');
  });
});

test.describe('d - op tempo betekent geen ingang en geen duwtje', () => {
  test('een regel op let op draagt geen gespreksingang', async ({ page }) => {
    await boot(page);
    for (const k of ['buffer', 'dekking']) {
      const r = await regel(page, k);
      expect(r.status, k).toBe('let op');
      expect(r.ingang, k).toBe('');
    }
  });

  test('en ook geen suggestie die zegt wat er nodig is', async ({ page }) => {
    await boot(page);
    expect((await regel(page, 'buffer')).suggestie).toBe('');
    expect((await regel(page, 'dekking')).suggestie).toBe('');
  });

  /* Dezelfde poort die de ingang draagt: status 'tekort'. Zodra de richting wegvalt staat hij er
     weer, zodat 'geen ingang' een gevolg is van op tempo liggen en niet van iets anders. */
  test('zonder inleg keert de ingang terug', async ({ page }) => {
    await boot(page, { spaarPer: 0 });
    const r = await regel(page, 'buffer');
    expect(r.status).toBe('tekort');
    expect(r.ingang).toContain("coStart('maand'");
    expect(r.suggestie).not.toBe('');
  });

  test('het scherm draagt precies zoveel ingangen als er tekorten zijn', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => ({
      ingangen: (document.querySelector('#s-maand').innerHTML.match(/coStart\('maand'/g) || []).length,
      tekorten: maandMetAccept(maandRegels()).concat(maandStructureel()).filter((r) => r.status === 'tekort').length,
    }));
    expect(uit.ingangen).toBe(uit.tekorten);
  });
});

test.describe('e - de beleggen-voorwaarde gaat niet mee', () => {
  test('een buffer op tempo haalt de voorwaarde nog steeds niet', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const R = maandRegels(); const B = beleggenKlaar(R);
      const v = B.voorwaarden.find((x) => x.key === 'buffer');
      return { status: R.find((r) => r.key === 'buffer').status, gehaald: v.gehaald, vStatus: v.status, klaar: B.klaar };
    });
    expect(uit.status).toBe('let op');       // op het maandscherm: aandacht
    expect(uit.gehaald).toBe(false);         // voor beleggen: nog niet
    expect(uit.vStatus).toBe('tekort');
    expect(uit.klaar).toBe(false);
  });

  /* De rij zegt in amber dat hij groeit, deze kaart in rood dat de voorwaarde niet gehaald is, over
     hetzelfde cijfer en direct onder elkaar. Dat verschil moet uit de zin te lezen zijn en niet uit
     twee kleuren. */
  test('de beleggen-regel zegt zelf dat de buffer groeit en de drempel niet haalt', async ({ page }) => {
    await boot(page, { set: { goals: [
      { id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, allocMode: 'fixed', perMaand: 50, streefdatum: vooruit(12) },
    ], assets: [{ id: 'a1', naam: 'Index', waarde: 1000 }] } });
    const uit = await page.evaluate(() => {
      const R = maandRegels(); const B = beleggenKlaar(R);
      const d = document.createElement('div'); d.innerHTML = maandBeleggenRegel(R);
      return { blok: B.blokkade && B.blokkade.key, opTempo: !!R.find((r) => r.key === 'buffer').opTempo,
        tekst: d.textContent.replace(/\s+/g, ' ').trim(), html: d.innerHTML };
    });
    expect(uit.blok).toBe('buffer');
    expect(uit.opTempo).toBe(true);
    expect(uit.tekst).toContain('Nog niet aan je voorwaarden voor beleggen');
    expect(uit.tekst).toContain('groeit');
    expect(uit.tekst).toContain('drempel is nog niet gehaald');
    expect(uit.html).toContain('var(--red)');   // de dot volgt onveranderd de blokkade
  });

  test('een blokkade die niet op tempo ligt krijgt die zin niet', async ({ page }) => {
    await boot(page, { spaarPer: 0, set: { goals: [
      { id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, allocMode: 'fixed', perMaand: 50, streefdatum: vooruit(12) },
    ], assets: [{ id: 'a1', naam: 'Index', waarde: 1000 }] } });
    const uit = await page.evaluate(() => {
      const R = maandRegels();
      const d = document.createElement('div'); d.innerHTML = maandBeleggenRegel(R);
      return { status: R.find((r) => r.key === 'buffer').status, tekst: d.textContent };
    });
    expect(uit.status).toBe('tekort');
    expect(uit.tekst).not.toContain('groeit');
  });

  test('boven de drie maanden haalt hij de voorwaarde wel, ook onder je richtbedrag', async ({ page }) => {
    await boot(page, { spaar: 9000, set: { nfMaanden: 6, nfToegewezen: 9000 } });
    const uit = await page.evaluate(() => {
      const R = maandRegels(); const r = R.find((x) => x.key === 'buffer');
      const v = beleggenKlaar(R).voorwaarden.find((x) => x.key === 'buffer');
      return { bm: bufferMaanden(), kritiek: !!r.kritiek, status: r.status, gehaald: v.gehaald, vStatus: v.status };
    });
    expect(uit.bm).toBeGreaterThanOrEqual(3);
    expect(uit.kritiek).toBe(false);
    expect(uit.status).toBe('let op');
    expect(uit.gehaald).toBe(true);
    expect(uit.vStatus).toBe('let op');
  });
});

test.describe('f - een kaart zonder enig tekort', () => {
  test('de kaart Vraagt een beslissing staat er niet, en het oordeel zegt dat niets vastloopt', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => ({
      statussen: maandRegels().map((r) => r.key + ':' + r.status),
      struct: maandStructureel().length,
      zin: maandOordeel(maandMetAccept(maandRegels()).concat(maandStructureel())).zin,
    }));
    expect(uit.struct).toBe(0);
    expect(uit.statussen.sort()).toEqual(['buffer:let op', 'dekking:let op']);
    expect(uit.zin).toContain('niets dat vastloopt');
    const k = await kaarten(page);
    expect(k.map((x) => x.kop)).not.toContain('Vraagt een beslissing');
    expect(k.map((x) => x.kop)).toContain('Vraagt aandacht');
  });

  test('geen maand in de kop, want er is geen maand waarop iets vastloopt', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const R = maandRegels();
      return { maand: R.find((r) => r.key === 'dekking').maand,
        zin: maandOordeel(maandMetAccept(R).concat(maandStructureel())).zin };
    });
    expect(uit.maand).toBeNull();
    expect(uit.zin).not.toMatch(/houdt stand tot/);
  });

  /* De horizon verdwijnt niet uit het scherm: hij staat voluit in de gevolgzin van de regel zelf,
     uit dekkingTekst(). Daar wordt geen tweede formulering naast gezet. */
  test('de horizon staat nog in de gevolgzin van de dekkingsregel', async ({ page }) => {
    await boot(page, { resIn: 7 });
    const r = await regel(page, 'dekking');
    expect(r.gevolg).toMatch(/gedekt tot en met|dekt de eerstvolgende post nu al niet/i);
    expect(r.gevolg).toMatch(/komt/);
  });
});

test.describe('g - de spaarquote is een eigen kaart', () => {
  test('hij staat niet meer in de voet onder de streep', async ({ page }) => {
    await boot(page);
    const voet = await page.evaluate(() => maandVoet(curMonth || thisYM()));
    expect(voet).not.toMatch(/maandKpiBlok|wvo-tile/);
    const k = await kaarten(page);
    expect(k.filter((x) => x.spaarquote).map((x) => x.kop)).toEqual(['']);   // een kaart zonder kop
  });

  test('de kaart draagt label, percentage, band en sparkline, en geen kop of uitlegzin', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#s-maand .card')].find((x) => /Spaarquote/.test(x.textContent));
      return { html: c.innerHTML, tekst: c.innerText.replace(/\s+/g, ' '), hlabels: c.querySelectorAll('.hlabel').length,
        tegels: [...c.querySelectorAll('[data-kpi]')].map((e) => e.dataset.kpi) };
    });
    expect(uit.tegels).toEqual(['inleg']);
    expect(uit.hlabels).toBe(0);
    expect(uit.tekst).not.toMatch(/Vermogensopbouw/i);
    expect(uit.tekst).not.toContain('Welk deel van je inkomen er opzij ging');
    expect(uit.tekst).toMatch(/\d+%/);
    expect(uit.tekst).toContain('wat je opzij zette en belegde');   // de band
    expect(uit.html).toContain('spk-wrap');                          // de sparkline
  });

  test('hij staat achter de regels en voor de uitgavengrafiek', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const h = document.querySelector('#s-maand').innerHTML;
      return { quote: h.indexOf('id="maandKpiBlok"'), aandacht: h.indexOf('Vraagt aandacht'), chart: h.indexOf('id="svbChart"') };
    });
    expect(uit.aandacht).toBeGreaterThan(-1);
    expect(uit.quote).toBeGreaterThan(uit.aandacht);
    if (uit.chart > -1) expect(uit.quote).toBeLessThan(uit.chart);
  });

  test('de streep houdt zijn werk met alleen de plan-rijen eronder', async ({ page }) => {
    await boot(page, { set: { budgets: { boodschappen: 1800, huur: 1500, vervoer: 400 } } });
    const uit = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#s-maand .card')].find((x) => /inkomen-limiet/.test(x.textContent));
      return { kop: ((c.querySelector('.hlabel') || {}).textContent || '').trim(),
        streep: /border-top:1px solid var\(--line\)/.test(c.innerHTML),
        spaarquote: /Spaarquote/.test(c.textContent) };
    });
    expect(uit.streep).toBe(true);
    expect(uit.spaarquote).toBe(false);
    expect(uit.kop).toMatch(/Vraagt/);
  });
});

test.describe('h - layout', () => {
  for (const w of [360, 390]) {
    test(`Maand past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
