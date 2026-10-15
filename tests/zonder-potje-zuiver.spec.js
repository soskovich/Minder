/* v402: "ZONDER POTJE" ZUIVER. Op de stand van grip-kring-stand (10 oktober 2026), met vier categorieen zonder potje:
   - Zorg & apotheek: uitgaven in juli en augustus na dag 10 (2 van 3 mnd), EUR 25 geboekt in oktober: telt geboekt EN verwacht.
   - Vakantie & reizen: alleen september (1 van 3 mnd), EUR 50 geboekt: telt geboekt, verwacht niets.
   - Goede doelen: juli en augustus netto uitgaven, met een terugboeking na dag 10, dus een NEGATIEVE verwachting: op 0.
   - Persoonlijke overboeking: elke maand, en EUR 150 in oktober: telt nergens in zonder potje.
   GECONSTRUEERD EN NIET GEMETEN: de stand van het toestel staat alleen daar. */
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

async function boot(page) {
  await K.boot(page);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, cat) => { const t = { id: 'z' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: 'BEA, BETAALPAS ' + n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
    for (const k of ['zorg', 'vakantie', 'goededoel', 'persoonlijk']) delete SET.budgets[k];
    add('2026-07-20', -40, 'Apotheek Centrum', 'zorg'); add('2026-08-22', -60, 'Tandarts Smit', 'zorg'); add('2026-10-05', -25, 'Apotheek Centrum', 'zorg');
    add('2026-09-25', -300, 'Transavia', 'vakantie'); add('2026-10-03', -50, 'Booking Com', 'vakantie');
    add('2026-07-03', -80, 'Stichting Een', 'goededoel'); add('2026-07-20', 30, 'Stichting Een', 'goededoel');
    add('2026-08-03', -80, 'Stichting Twee', 'goededoel'); add('2026-08-20', 30, 'Stichting Twee', 'goededoel');
    add('2026-07-25', -200, 'Tikkie Anna', 'persoonlijk'); add('2026-08-26', -310, 'Tikkie Bram', 'persoonlijk'); add('2026-09-24', -175, 'Tikkie Cas', 'persoonlijk'); add('2026-10-04', -150, 'Tikkie Dirk', 'persoonlijk');
    save(); render();
  }, { MAIN: K.MAIN });
}
const stand = page => page.evaluate(() => { const V = maandVooruit(); const Z = V.zonderStand;
  const Br = gripZienBrug(V); let st = Br.stappen.find(s => s.soort === 'zonder');
  /* v408: bij ruimtegebrek zit zonder potje in "n boven"; dan draagt die stap geboekt en verwacht */
  if (!st) { const ob = Br.stappen.find(s => s.soort === 'overig' && s.k === 'boven' && s.zonderIn); if (ob) st = { waarde: ob.zonderIn, geboekt: ob.zonderInG, verwacht: ob.zonderIn - ob.zonderInG, deel: ob.zonderInG, in: ob.label }; }
  let run = Br.stappen[0].waarde; for (const s of Br.stappen.slice(1, -1)) run += s.waarde;
  return { som: run, eind: Br.stappen[Br.stappen.length - 1].waarde, P: Math.round(V.projectie), st, Z: { geboekt: Z.geboekt, verwacht: Z.verwacht, uitgesloten: Z.uitgesloten,
    rijen: Z.rijen.map(x => ({ k: x.k, geboekt: x.geboekt, verwacht: x.verwacht, ruw: x.verwachtRuw, n: x.n, telt: x.telt, reden: x.reden })) } }; });

test('a: de stand draagt de vier gevallen (invoermeting)', async ({ page }) => {
  await boot(page); const S = await stand(page); const r = k => S.Z.rijen.find(x => x.k === k);
  expect(r('zorg').n).toBe(2); expect(r('vakantie').n).toBe(1); expect(r('goededoel').n).toBe(2); expect(r('goededoel').ruw).toBeLessThan(0);
  expect(r('persoonlijk').n).toBe(3); expect(Math.round(r('persoonlijk').geboekt)).toBe(150);
});

test('b: de brug-som blijft budget plus stappen is verwacht, en z. potje is geboekt plus verwacht', async ({ page }) => {
  await boot(page); const S = await stand(page);
  expect(S.som).toBe(S.eind); expect(S.eind).toBe(S.P);
  expect(S.st).toBeTruthy(); expect(S.st.waarde).toBe(S.st.geboekt + S.st.verwacht); expect(S.st.deel).toBe(S.st.geboekt);
  expect(S.st.verwacht).toBeGreaterThan(0);
  /* v408: met ruimte (Vervoer niet meer te ruim) staat zonder potje als eigen stap, in twee kleuren */
  await page.evaluate(() => { SET.budgets.vervoer = teRuim(maandVooruit()).find(x => x.k === 'vervoer').voorstel; save(); go('maand'); gripKiesTab('begrijpen'); });   // v428: de brug staat in Begrijpen (groepbrug)
  await expect(page.locator('#gripGroepBrug [data-brugstap="zonder"] [data-brugdicht]')).toHaveCount(1);
  await expect(page.locator('#gripGroepBrug [data-brugstap="zonder"] [data-bruglicht]')).toHaveCount(1);
});

test('c: het geboekte deel is de som van de boekingen in blok 19', async ({ page }) => {
  await boot(page); const S = await stand(page);
  const L = await page.evaluate(() => diagZonderPotje(maandVooruit()));
  let som = 0, n = 0;
  for (const l of L) { const p = l.split(' | '); if (p.length >= 5 && /^\s+\d{4}-\d\d-\d\d$/.test(p[0]) && !/telt niet mee/.test(l)) { som += -(-p[2]); n++; } }
  expect(n).toBeGreaterThanOrEqual(2);
  expect(Math.abs(S.st.geboekt - som)).toBeLessThan(1);
  expect(Math.abs(S.Z.geboekt - som)).toBeLessThan(0.01);
  // de tik op de stap zegt dezelfde twee getallen
  /* v428: in de groepbrug staat zonder potje altijd als eigen stap; de tik opent de sheet per groep, en de regel zonder potje
     opent dezelfde sheet als voorheen */
  await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
  await page.locator('#gripGroepBrug [data-brugstap="zonder"]').click();
  await page.locator('#gripGroepen [data-groep="zonder"]').click();
  await expect(page.locator('#zonderPotjeSheet [data-zondergeboekt]')).toHaveAttribute('data-zondergeboekt', String(S.st.geboekt));
  await expect(page.locator('#zonderPotjeSheet [data-zonderverwacht]')).toHaveAttribute('data-zonderverwacht', String(S.st.verwacht));
  await expect(page.locator('#zonderPotjeSheet')).toContainText(`€${S.st.geboekt} geboekt`);
  const g = await page.$$eval('#zonderPotjeSheet [data-zondercatg]', e => e.reduce((a, x) => a + (+x.dataset.zondercatg), 0));
  const v = await page.$$eval('#zonderPotjeSheet [data-zondercatv]', e => e.reduce((a, x) => a + (+x.dataset.zondercatv), 0));
  expect(g).toBe(S.st.geboekt); expect(v).toBe(S.st.verwacht);
});

test('d: geen negatieve verwachting, en alleen bij minstens 2 van 3 maanden', async ({ page }) => {
  await boot(page); const S = await stand(page); const r = k => S.Z.rijen.find(x => x.k === k);
  for (const x of S.Z.rijen) expect(x.verwacht).toBeGreaterThanOrEqual(0);
  expect(r('goededoel').verwacht).toBe(0); expect(r('goededoel').reden).toContain('onder nul');
  expect(r('vakantie').verwacht).toBe(0); expect(r('vakantie').reden).toContain('1 van 3 mnd');
  expect(r('vakantie').telt).toBe(true); expect(Math.round(r('vakantie').geboekt)).toBe(50);
  expect(r('zorg').verwacht).toBeGreaterThan(0);
  expect(S.Z.verwacht).toBeCloseTo(S.Z.rijen.reduce((a, x) => a + x.verwacht, 0), 6);
});

test('e: Persoonlijke overboeking telt niet mee in zonder potje, niet geboekt en niet verwacht', async ({ page }) => {
  await boot(page); const S = await stand(page); const p = S.Z.rijen.find(x => x.k === 'persoonlijk');
  expect(p.telt).toBe(false); expect(p.verwacht).toBe(0); expect(Math.round(S.Z.uitgesloten)).toBe(150);
  const zonderZonderP = S.Z.rijen.filter(x => x.telt).reduce((a, x) => a + x.geboekt, 0);
  expect(S.Z.geboekt).toBeCloseTo(zonderZonderP, 6);
  // en de uitkomst (Budget-meter) draagt hem niet: weg met de boeking verandert verwacht niet
  const P2 = await page.evaluate(() => { TX = TX.filter(t => !(t.name === 'Tikkie Dirk')); save(); return Math.round(maandVooruit().projectie); });
  expect(P2).toBe(S.P);
  await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); });
});

test('f: blok 19 noemt per categorie waarom hij wel of niet meetelt', async ({ page }) => {
  await boot(page);
  const t = (await page.evaluate(() => diagZonderPotje(maandVooruit()))).join('\n');
  expect(t).toMatch(/Zorg & apotheek: geboekt 25 \| verwacht \d+ \| 2 van 3 \| uitgaven in 2 van 3 mnd: verwacht/);
  expect(t).toMatch(/Vakantie & reizen: geboekt 50 \| verwacht 0 \| 1 van 3 \| uitgaven in 1 van 3 mnd: geen verwachting/);
  expect(t).toMatch(/Goede doelen: geboekt 0 \| verwacht 0 \| 2 van 3 \| .*onder nul, op EUR 0 gezet/);
  expect(t).toMatch(/Persoonlijke overboeking: geboekt 150 \| verwacht 0 \| 3 van 3 \| telt niet mee/);
});

test('g: Let op draagt een regel per categorie die er vaker is, met potje maken', async ({ page }) => {
  await boot(page);
  const L = await page.evaluate(() => gripLetOpItems([], [], []).filter(x => x.soort === 'zonderpot').map(x => ({ naam: x.naam, sub: x.sub, act: x.act })));
  const namen = L.map(x => x.naam);
  expect(namen).toContain('Zorg & apotheek zonder potje · 2 van 3 mnd');
  expect(namen.join('|')).not.toContain('Vakantie');
  expect(namen.join('|')).not.toContain('Persoonlijke');
  const z = L.find(x => x.naam.startsWith('Zorg'));
  /* v406: Zorg heeft uitgaven in 2 van de 3 maanden, dus eerst een reservering in Plan (12 mnd ÷ 12), met het bewijs */
  expect(z.sub).toBe('reservering in Plan €8/mnd of potje maken · jul €40 · aug €60 · sep €0');
  expect(z.act).toBe("openZonderKeuze('zorg')");
});

test('h: Let op noemt een persoonlijke overboeking niet als uitgave zonder potje', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const Lk = lekSignaal(thisYM(), budgetFlaggedCats(thisYM()));
    return { lek: Lk && Lk.cat, namen: gripLetOpItems([], [], []).map(x => x.naam + ' ' + (x.sub || '')) }; });
  /* v405: de lek-detectie leest zelf de ene definitie van uitgave (isUitgave), dus hij noemt de persoonlijke overboeking niet
     meer; de invoermeting is dat die overboeking de grootste uitgave zonder potje zou zijn als hij meetelde. */
  expect(r.lek).not.toBe('persoonlijk');
  const groot = await page.evaluate(() => { const o = {}; for (const t of txOfMonth(thisYM())) { const c = catOf(t); if (CATS[c].type === 'expense' && !((+SET.budgets[c] || 0) > 0) && !isFixed(t)) o[c] = (o[c] || 0) - t.amount; } return Object.keys(o).sort((a, b) => o[b] - o[a])[0]; });
  expect(groot).toBe('persoonlijk');
  expect(r.namen.join('|')).not.toContain('Persoonlijke overboeking');
  expect(r.namen.join('|')).not.toContain('Tikkie');
});
