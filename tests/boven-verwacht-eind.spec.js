// v391: "BOVEN" IS HET VERWACHTE EIND, OP GRIP EN OP INZICHTEN. Gemeten bij v390: Boodschappen stond op Grip als
// "+€57, 4 mnd boven" en op Inzichten als "herstelt", want herstelt keek alleen naar de uitgave tot vandaag. Nu: een potje
// met een vorige maand erboven dat naar verwachting weer boven eindigt (potjeUitschieter, dezelfde toets als uitschieters())
// is "herhaalt" met het verwachte bedrag; "herstelt" alleen als het naar verwachting NIET boven eindigt. Een potje dat 2+
// maanden op rij boven is krijgt in Kiezen als eerste optie "<potje> herzien"; binnen het spaargeld-patroon (v430, R8) is
// het potje een eigen symptoom.
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

/* Boodschappen gewoonlijk €492 (350 uit de stand + €142 op de 20e), €129 op 5 oktober: tot vandaag achter op het gewone
   tempo, maar naar verwachting boven het potje van €400. */
const boot = async (page, o) => {
  await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page, o || {});
  await page.evaluate(b => {
    for (const [d, a] of [['2026-07-20', -142], ['2026-08-20', -142], ['2026-09-20', -142], ['2026-10-05', -129]]) {
      const t = { id: 'bq' + d, date: d, amount: a, acc: 'NL01MAIN0000001111', name: 'Albert Heijn', desc: 'BEA ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'boodschappen'; }
    if (b) SET.budgets.boodschappen = b; save();
  }, (o || {}).bud || null);
};
const stand = page => page.evaluate(() => { const V = maandVooruit(); const x = V.potjes.find(p => p.k === 'boodschappen');
  const ip = insPatronen('var').find(p => p.k === 'boodschappen') || null;
  const gp = gripPatronen().find(p => p.id === 'pot:boodschappen') || null;
  return { uit: x.uit, typisch: x.typisch, overR: Math.round(x.overR), boven: potjeUitschieter(x), inUit: uitschieters(V).some(u => u.k === 'boodschappen'),
    ip: ip && { soort: ip.soort, bedrag: ip.bedrag, n: ip.nMaanden, kop: ip.kop }, gp: gp && { bedrag: gp.bedrag, twee: gp.twee, bewijs: gp.bewijs, opties: gripOpties(gp).map(o => o.titel) } }; });

test.describe('herhaalt of herstelt op het verwachte eind', () => {
  test('invoer: tot vandaag achter op het gewone tempo, naar verwachting erboven', async ({ page }) => {
    await boot(page); const s = await stand(page);
    expect(s.uit).toBeLessThan(s.typisch);   // tot vandaag zou het "herstelt" heten
    expect(s.boven).toBe(true); expect(s.inUit).toBe(true);
  });
  test('Inzichten zegt herhaalt met het verwachte bedrag, en Grip noemt hetzelfde bedrag en dezelfde maanden', async ({ page }) => {
    await boot(page); const s = await stand(page);
    expect(s.ip.soort).toBe('herhaalt');
    expect(s.ip.bedrag).toBe(s.overR);
    expect(s.ip.kop).toContain(`naar verwachting weer €${s.overR} boven je potje`);
    expect(s.ip.kop).not.toContain('loopt weer voor');   // hij loopt niet voor, hij eindigt erboven
    expect(s.gp.bedrag).toBe(s.overR);
    expect(s.gp.bewijs).toContain(`${s.ip.n} mnd boven`);
    expect(s.ip.n).toBeGreaterThanOrEqual(2);
  });
  test('herstelt alleen als het potje naar verwachting niet boven eindigt', async ({ page }) => {
    await boot(page, { bud: 450 }); const s = await stand(page);
    expect(s.boven).toBe(false);
    expect(s.ip.soort).toBe('herstelt');
    expect(s.gp).toBe(null);
  });
});

test.describe('Kiezen: 2+ maanden boven geeft eerst "herzien"', () => {
  test('als eigen patroon', async ({ page }) => {
    await boot(page); const s = await stand(page);
    expect(s.gp.twee).toBe(true);
    expect(s.gp.opties[0]).toBe('Boodschappen herzien');
  });
  /* v430 (R8): binnen het spaargeld-patroon gaan de keuzes over je spaargeld en je salaris (opzij verlagen of een buffer), niet over
     een potje. Boodschappen is daar een EIGEN symptoom (sig:boodschappen) met zijn eigen oorzaak en keuzes; de eis van v391 (de
     route valt niet op het eerste potje) geldt nu voor dat symptoom: het draagt Boodschappen en niet het eerste potje. */
  test('binnen het spaargeld-patroon is Boodschappen een eigen symptoom, en de keuzes van het patroon noemen geen potje', async ({ page }) => {
    await boot(page, { opnames: [['2026-10-06', 300], ['2026-10-09', 400]] });
    const r = await page.evaluate(() => { const p = gripPatronen().find(x => x.id === 'spaargeld');
      const pots = (p.sig || []).filter(x => x.soort === 'potje').map(x => x.k);
      const C = gripCyclusLees(), s = C.sym.find(z => z.id === 'sig:boodschappen');
      return { pots, opties: gripOpties(p).map(o => o.titel), sym: s && { k: s.k, naam: s.naam, pid: s.pid } }; });
    expect(r.pots).toContain('boodschappen');
    expect(r.pots[0]).not.toBe('boodschappen');   // de route mag niet op het eerste potje vallen
    expect(r.opties).toEqual(['Niets meer uit je spaargeld', 'Zet het terug']);
    for (const t of r.opties) expect(t).not.toMatch(/Boodschappen|herzien/);
    expect(r.sym).toEqual({ k: 'boodschappen', naam: 'Boodschappen boven je potje', pid: 'spaargeld' });
  });
  test('een potje dat alleen deze maand boven is krijgt geen herzien-voorop', async ({ page }) => {
    await boot(page); const r = await page.evaluate(() => { const p = gripPatronen().find(x => x.id === 'pot:uiteten'); return { twee: p.twee, eerste: gripOpties(p)[0].titel }; });
    expect(r.twee).toBe(false); expect(r.eerste).toBe('Uit eten & café binnen het potje');
  });
});
