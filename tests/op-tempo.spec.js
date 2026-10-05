// v226: de statusdrempel op Maand toetste of een norm NU gehaald wordt, niet of hij op tijd wordt
// gehaald. Daardoor stond er een tekort bij regels waar niets te beslissen valt: een buffer van 1,1
// maanden waar elke maand geld naartoe gaat, en een dekking waarvan het gat pas volgend jaar valt.
//
// Buffer: geen beslissing zolang er maandelijks geld naartoe gaat en er geen geld wegvloeit. Bron is
// savedNet() per afgeronde maand - de stroom waarvan spaarSaldo() de stand meet - en niet de alloc
// van het noodfonds-item: dat is een voornemen, en v216 legt vast dat een voornemen geen feit
// verdringt. Eén reeks voor beide richtingen: savedNet > 0 in elke maand van het venster sluit een
// maand zonder inleg en een maand met onttrekking samen uit.
// Dekking: geen beslissing zolang het gat voor het knelmoment te dichten is (v322; tot v321 een vaste marge). Dat moment is D.gat.maand en
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
    /* v322 zette hier een stortingstempo van 400 neer, omdat dat toen de drempel was. Sinds v323
       beslist alleen de kalender, en de grens-test zet het tempo op nul om dat te bewijzen. Bij
       resPer 0 blijft er wel een boeking op de rekening, anders valt hij uit allAccounts(). */
    add('r' + m, RES, m, '10', o.resPer != null && o.resPer !== 0 ? o.resPer : (o.resPer === 0 ? 1 : 400), 'Reserveringen', 'NAAR RESERVERINGEN');
    // de rekening bestaat ook in de stilstaande fixture: één boeking buiten het venster van drie
    if (per !== 0) add('s' + m, SPAAR, m, '26', per, 'Spaarpot', 'NAAR SPAREN');
    else if (i === 11) add('s' + m, SPAAR, m, '26', 300, 'Spaarpot', 'NAAR SPAREN');
    if (o.opname) add('u' + m, SPAAR, m, '27', -o.opname, 'Opname', 'VAN SPAREN');
  }
  const set = Object.assign({
    /* v305: de ondergrens is sinds v305 een KEUZE en heeft geen default meer, dus de fixture kiest
       hem hier. Deze spec is geschreven toen drie maanden een vaste grens was; dat getal staat nu
       waar het thuishoort, in de gegevens van de gebruiker. */
    bufferNorm: 3,
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
    await page.evaluate(() => openBeleggenVoorwaarden());
    expect(await page.evaluate(() => $('#sheet').innerText)).not.toContain('Hij groeit');
  });

  test('de gevolgzin noemt de stand, wat die betekent en de richting', async ({ page }) => {
    await boot(page);
    const r = await regel(page, 'buffer');
    expect(r.gevolg).toMatch(/maanden essenti/);
    /* v305: de zin noemt de GEKOZEN ondergrens en niet meer een vaste drie. De fixture kiest 3, dus
       de tekst is inhoudelijk dezelfde; wat verandert is dat het getal uit je keuze komt. */
    expect(r.gevolg).toContain('Onder 3 maanden vangt hij weinig op');
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
  // v323: alleen een post in de LOPENDE maand is nog een beslissing
  test('een gat in de lopende maand: een beslissing', async ({ page }) => {
    await boot(page, { resIn: 0 });
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

  /* v323: de grens is de lopende maand, en niets anders. De stortingstoets van v322 is vervallen:
     een gat dat volgende maand valt is aandacht, hoe groot het ook is en wat er ook naar de rekening
     gaat. Het tempo staat hier daarom op 1 euro per maand (een boeking houdt de rekening in
     allAccounts()), want met een echte storting erbij bewijst deze test niets. */
  test('de grens is de lopende maand, ook zonder stortingen', async ({ page }) => {
    await boot(page, { resIn: 1, resPer: 0 });
    expect((await regel(page, 'dekking')).status).toBe('let op');
    await boot(page, { resIn: 6, resPer: 0 });
    expect((await regel(page, 'dekking')).status).toBe('let op');
    await boot(page, { resIn: 0, resPer: 0 });
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

  /* v340: de kaart 'Voorwaarden voor beleggen' (maandBeleggenRegel) is vervallen. De zin 'groeit, maar
     de drempel is nog niet gehaald' (v226) staat sinds v340 in de sheet achter de tegel, waar de buffer
     als niet gehaald staat terwijl zijn tegel amber is. Beleggen is nu een tegel, en die draagt het oordeel NEUTRAAL (v314): grijs met
     'wacht' en waar hij op wacht, nooit rood of amber. Wat deze test vasthoudt is dat de twee tegels
     niet hetzelfde oordeel in twee kleuren geven: de buffer amber, beleggen grijs. */
  test('de beleggen-tegel wacht op de buffer, neutraal naast de amber buffer', async ({ page }) => {
    await boot(page, { set: { goals: [
      { id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, allocMode: 'fixed', perMaand: 50, streefdatum: vooruit(12) },
    ], assets: [{ id: 'a1', naam: 'Index', waarde: 1000 }] } });
    const uit = await page.evaluate(() => {
      const R = maandRegels(); const B = beleggenKlaar(R); renderMaand();
      const t = document.querySelector('#s-maand [data-tegel="beleggen"]');
      const buf = document.querySelector('#s-maand [data-tegel="buffer"]');
      return { blok: B.blokkade && B.blokkade.key, opTempo: !!R.find((r) => r.key === 'buffer').opTempo,
        kleur: t && t.dataset.kleur, waarde: t && t.querySelector('.kt-val').innerText,
        maat: t && t.querySelector('.kt-maat').innerText, html: t ? t.outerHTML : '', buffer: buf && buf.dataset.kleur };
    });
    expect(uit.blok).toBe('buffer');
    expect(uit.opTempo).toBe(true);
    expect(uit.buffer).toBe('amber');
    expect(uit.kleur).toBe('grijs');
    expect(uit.waarde).toBe('wacht');
    expect(uit.maat).toBe('op je buffer');
    expect(uit.html).toContain('var(--bar)');
    expect(uit.html).not.toContain('var(--red)');
    expect(uit.html).not.toContain('var(--amber)');
    await page.evaluate(() => openBeleggenVoorwaarden());
    expect(await page.evaluate(() => $('#sheet').innerText)).toContain('Hij groeit, maar de drempel is nog niet gehaald.');
  });

  /* Zonder inleg is de buffer een tekort, en dan staat de groei-zin niet in de sheet (v226). */
  test('een blokkade die niet op tempo ligt is een tekort', async ({ page }) => {
    await boot(page, { spaarPer: 0, set: { goals: [
      { id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, allocMode: 'fixed', perMaand: 50, streefdatum: vooruit(12) },
    ], assets: [{ id: 'a1', naam: 'Index', waarde: 1000 }] } });
    const uit = await page.evaluate(() => {
      const R = maandRegels(); renderMaand();
      return { status: R.find((r) => r.key === 'buffer').status,
        kleur: document.querySelector('#s-maand [data-tegel="buffer"]').dataset.kleur };
    });
    expect(uit.status).toBe('tekort');
    expect(uit.kleur).toBe('rood');
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
  /* v340: de kaarten 'Vraagt een beslissing' en 'Vraagt aandacht' zijn tegels geworden, met het
     oordeel als kleur. De oordeelzin ('niets dat vastloopt', maandOordeel) is vervallen, want Grip
     draagt geen samenvatting meer. */
  test('geen rode tegel, en de twee regels staan amber', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => { renderMaand(); return {
      statussen: maandRegels().map((r) => r.key + ':' + r.status),
      struct: maandStructureel().length,
      tegels: [...document.querySelectorAll('#s-maand [data-tegel]')].map((t) => t.dataset.tegel + ':' + t.dataset.kleur),
    }; });
    expect(uit.struct).toBe(0);
    expect(uit.statussen.sort()).toEqual(['buffer:let op', 'dekking:let op']);
    expect(uit.tegels.filter((x) => /:rood$/.test(x))).toEqual([]);
    expect(uit.tegels.sort()).toEqual(['buffer:amber', 'dekking:amber']);
  });

  /* v340: de kop (de oordeelzin) bestaat niet meer; wat blijft is dat de rij geen maand draagt
     waarop iets vastloopt, en dat Grip er ook geen noemt. */
  test('geen maand waarop iets vastloopt', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const R = maandRegels(); renderMaand();
      return { maand: R.find((r) => r.key === 'dekking').maand, scherm: document.querySelector('#s-maand').innerText };
    });
    expect(uit.maand).toBeNull();
    expect(uit.scherm).not.toMatch(/houdt stand tot/);
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

/* v232: de spaarquote is van Maand naar Vermogen verhuisd (tests/spaarquote-op-vermogen.spec.js).
   Wat groep g hier bewaakte, dat hij niet in de voet zat en een eigen kaart zonder kop was, geldt
   daar onverkort; op Maand staat hij nergens meer. */
test.describe('g - de spaarquote staat niet meer op Maand', () => {
  test('niet in de voet, niet als kaart', async ({ page }) => {
    await boot(page);
    // v315: de voet is vervallen; wat eronder stond is de vanaf-kaart
    // v340: en die staat nu in de tijdlijn 'Komende 3 maanden'; geen van beide draagt de quote
    const voet = await page.evaluate(() => { renderMaand(); return document.querySelector('#s-maand').innerHTML; });
    expect(voet).not.toMatch(/maandKpiBlok|wvo-tile|Spaarquote/);
    const k = await kaarten(page);
    expect(k.filter((x) => x.spaarquote)).toEqual([]);
    expect(await page.evaluate(() => document.querySelector('#s-maand').innerHTML.indexOf('id="maandKpiBlok"'))).toBe(-1);
  });

  /* v228: de rij 'Boven je inkomen-limiet' is vervallen, dus potjes boven de limiet vullen de voet
     niet meer. Een volgende-maand-laag doet dat nog wel; de eigenschap blijft dezelfde.
     v315: de voet is vervallen en die rij staat in zijn eigen kaart. Wat deze test vasthoudt is
     wat hij altijd vasthield: de spaarquote staat niet in de kaart die die rij draagt. */
  /* v340: de rij 'Je potjes' van de vanaf-kaart staat nu als punt in de tijdlijn 'Komende 3 maanden'
     (`[data-tlsoort="vanaf"]`), uit maandVanafData(). */
  test('de kaart met de plan-rij draagt de spaarquote niet', async ({ page }) => {
    await boot(page, { set: { budgetsNext: { boodschappen: 1100 } } });
    const uit = await page.evaluate(() => {
      renderMaand();
      const c = document.querySelector('#gripTijdlijn');
      return { kop: ((c.querySelector('.hlabel') || {}).textContent || '').trim(),
        vanaf: [...c.querySelectorAll('[data-tlsoort="vanaf"]')].map((x) => x.innerText),
        data: maandVanafData().map((x) => x.lab),
        spaarquote: /Spaarquote/.test(c.textContent) };
    });
    expect(uit.data).toContain('Je potjes');
    expect(uit.vanaf.length).toBeGreaterThan(0);
    expect(uit.spaarquote).toBe(false);
    expect(uit.kop).toBe('Komende 3 maanden');
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
