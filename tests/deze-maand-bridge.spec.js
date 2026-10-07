/* v349: de kaart "Deze maand" op Grip is een variance-bridge van budget naar uitkomst, met de oorzaken op
   de kaart en de opbouw in de sheet. De stand is die van de gebruiker op 6 oktober 2026
   (tests/deze-maand-stand.js): budget EUR 3.375, uitkomst EUR 2.672, Vices +83, Boodschappen +61, de rest
   -847.
   v354: de bridge gaat over de variabele potjes: van wat ze samen mogen (Vices 50 + Boodschappen 500 = 550) naar
   wat er daar verwacht uitgaat (133 + 561 = 694). De vaste potjes (huur, verzekeringen, abonnementen, sport)
   staan in de regel vaste lasten, en de totale uitkomst (2.672) in de sheet.
   v355: een potje met een herkende incasso is gemengd: de incasso is vast, de rest van het potje variabel. Op de
   stand van 6 oktober zijn Verzekeringen (675 tegen 150), Abonnementen (100 tegen 30) en Sport (600 tegen 73)
   daardoor voor het grootste deel variabel, en die drie staan in de bridge. De tests over de mechaniek van de
   bridge (de oorzaak, de as, de losse stappen) draaien op SMAL: dezelfde stand met potjes die gelijk zijn aan hun
   incasso, zodat de bridge de vorm van v354 houdt (550 naar 694). */
const { test, expect } = require('@playwright/test');
const { boot } = require('./deze-maand-stand');
const { kaalUit } = require('./bron-kaal');

const SMAL = { huur: 1450, verzekering: 150, abonnement: 30, sport: 73, vices: 50, boodschappen: 500 };
const smal = (extra) => ({ set: { budgets: Object.assign({}, SMAL, extra || {}) } });
async function grip(page) {
  await page.evaluate(() => { closeSheet(); go('maand'); });
}
const stappenVan = (page) => page.evaluate(() => {
  const Br = dezeMaandBrug(maandVooruit());
  return Br.stappen.map((s) => ({ soort: s.soort, k: s.k || null, waarde: s.waarde, aard: s.aard || null }));
});

test.describe('a. de bridge loopt van de variabele potjes naar wat er daar verwacht uitgaat', () => {
  test('de stappen van de stand van 6 oktober (v355: de rest van een gemengd potje is variabel)', async ({ page }) => {
    await boot(page); await grip(page);
    expect(await stappenVan(page)).toEqual([
      { soort: 'begin', k: null, waarde: 1672, aard: null },
      { soort: 'potje', k: 'sport', waarde: -527, aard: null },
      { soort: 'potje', k: 'verzekering', waarde: -525, aard: null },
      { soort: 'potje', k: 'vices', waarde: 83, aard: 'pastniet' },
      { soort: 'rest', k: null, waarde: -9, aard: null },
      { soort: 'eind', k: null, waarde: 694, aard: null },
    ]);
  });
  test('met potjes gelijk aan hun incasso blijft de vorm van v354', async ({ page }) => {
    await boot(page, smal()); await grip(page);
    const st = await stappenVan(page);
    expect(st).toEqual([
      { soort: 'begin', k: null, waarde: 550, aard: null },
      { soort: 'potje', k: 'vices', waarde: 83, aard: 'pastniet' },
      { soort: 'potje', k: 'boodschappen', waarde: 61, aard: 'pastniet' },
      { soort: 'eind', k: null, waarde: 694, aard: null },
    ]);
  });
  test('de afgeronde stappen tellen exact op tot het variabele eind, en de sheet draagt de totale uitkomst', async ({ page }) => {
    await boot(page); await grip(page);
    const r = await page.evaluate(() => {
      const kol = [...document.querySelectorAll('#gripDezeMaand [data-brugstap]')].map((e) => [e.dataset.brugstap, +e.dataset.brugwaarde]);
      openGripVooruit();
      return { kol, sheet: +document.getElementById('gripVooruit').dataset.projectie,
        kaart: +document.querySelector('#gripDezeMaand [data-dmregel]').dataset.variabel };
    });
    const begin = r.kol[0][1], eind = r.kol[r.kol.length - 1][1];
    const som = r.kol.slice(1, -1).reduce((a, x) => a + x[1], begin);
    expect(som).toBe(eind);
    expect(eind).toBe(694);
    expect(r.kaart).toBe(eind);
    expect(r.sheet).toBe(2672);
  });
  test('met delen van euro: afgeronde stappen tellen op tot de uitkomst (grootste rest)', async ({ page }) => {
    // invoermeting: een euro extra in september maakt het gemiddelde van Vices en Boodschappen een derde
    await boot(page, { extraTx: [
      { id: 'vx', date: '2026-09-22', amount: -1, name: 'Coffeeshop', desc: 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING' },
      { id: 'ax', date: '2026-09-22', amount: -1, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V);
      return { over: V.potjes.map((x) => x.overR), st: Br.stappen.map((s) => s.waarde), proj: V.variabel.eind, bud: V.variabel.budget }; });
    expect(r.over.some((x) => Math.abs(x - Math.round(x)) > 0.3)).toBe(true);
    const som = r.st.slice(1, -1).reduce((a, x) => a + x, r.st[0]);
    expect(r.st[0]).toBe(r.bud);
    expect(som).toBe(r.proj);
    expect(r.st[r.st.length - 1]).toBe(r.proj);
  });
  test('de regel boven de bridge: het stuurgetal, variabel tegen je potjes (v354)', async ({ page }) => {
    await boot(page); await grip(page);
    const t = await page.locator('#gripDezeMaand [data-dmregel]').innerText();
    expect(t.replace(/\s+/g, ' ')).toContain('Variabel: €694 verwacht · €978 onder je potjes');
    expect(t).not.toContain('€2.672');
  });
});

test.describe('b. de oorzaak: past niet in je potje tegen loopt voor', () => {
  test('de zin op de kaart, zonder oordeel', async ({ page }) => {
    await boot(page, smal()); await grip(page);
    const z = await page.locator('#gripDezeMaand [data-dmzin]').innerText();
    expect(z).toBe('Vices en Boodschappen passen niet in hun potje.');
    expect(z).not.toMatch(/loopt voor|lopen voor/);
  });
  test('de invoer draagt de gemelde gevallen: Vices niets uitgegeven, Boodschappen achter op zijn tempo', async ({ page }) => {
    await boot(page); await grip(page);
    const P = await page.evaluate(() => Object.fromEntries(maandVooruit().potjes.map((x) => [x.k, { uit: x.uit, typisch: x.typisch, patroon: x.patroon, bud: x.bud, eind: x.eind, aard: x.aard }])));
    expect(P.vices).toEqual({ uit: 0, typisch: 0, patroon: 133, bud: 50, eind: 133, aard: 'pastniet' });
    // Boodschappen: EUR 49 in zes dagen tegen gemiddeld EUR 79, dus ACHTER, en toch boven zijn potje
    expect(P.boodschappen).toEqual({ uit: 49, typisch: 79, patroon: 591, bud: 500, eind: 561, aard: 'pastniet' });
  });
  test('loopt voor alleen bij een hoger tempo dan normaal, met een patroon dat in het potje past', async ({ page }) => {
    await boot(page, { set: { budgets: { huur: 1450, verzekering: 675, abonnement: 100, sport: 600, vices: 50, boodschappen: 600 } },
      extraTx: [{ id: 'ahx', date: '2026-10-05', amount: -151, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    await grip(page);
    const r = await page.evaluate(() => { const x = maandVooruit().potjes.find((p) => p.k === 'boodschappen');
      return { uit: x.uit, typisch: x.typisch, patroon: x.patroon, eind: x.eind, aard: x.aard, zin: document.querySelector('#gripDezeMaand [data-dmzin]').innerText }; });
    expect(r.uit).toBeGreaterThan(r.typisch);
    expect(r.patroon).toBeLessThanOrEqual(600);
    expect(r.eind).toBeGreaterThan(600);
    expect(r.aard).toBe('voor');
    expect(r.zin).toContain('Boodschappen loopt voor');
  });
  test('voor en niet passend tegelijk: past niet wint, want dan komt hij ook zonder harder te gaan boven', async ({ page }) => {
    await boot(page, { extraTx: [{ id: 'ahx', date: '2026-10-05', amount: -151, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    await grip(page);
    const x = await page.evaluate(() => maandVooruit().potjes.find((p) => p.k === 'boodschappen'));
    expect(x.uit).toBeGreaterThan(x.typisch);      // invoermeting: het tempo ligt hier wel hoger
    expect(x.patroon).toBeGreaterThan(x.bud);
    expect(x.aard).toBe('pastniet');
  });
  test('zonder hoger tempo en met een patroon dat past, geen oorzaak', async ({ page }) => {
    await boot(page, { set: { budgets: { huur: 1450, verzekering: 675, abonnement: 100, sport: 600, vices: 50, boodschappen: 700 } } });
    await grip(page);
    const x = await page.evaluate(() => maandVooruit().potjes.find((p) => p.k === 'boodschappen'));
    expect(x.uit).toBeLessThan(x.typisch);
    expect(x.patroon).toBeLessThanOrEqual(x.bud);
    expect(x.aard).toBe('');
  });
  test('de sheet noemt dezelfde oorzaak per potje, en bijstellen staat bij past niet', async ({ page }) => {
    await boot(page); await grip(page);
    const r = await page.evaluate(() => { openGripVooruit();
      const v = document.querySelector('[data-handeling="vices"]'), b = document.querySelector('[data-handeling="boodschappen"]');
      return { v: v.innerText, va: v.querySelector('[data-aard]').dataset.aard, b: b.innerText, ba: b.querySelector('[data-aard]').dataset.aard,
        bijV: !!v.querySelector('[data-bijstellen]'), bijB: !!b.querySelector('[data-bijstellen]') }; });
    expect(r.va).toBe('pastniet');
    expect(r.ba).toBe('pastniet');
    expect(r.b).toContain('Past niet in je potje');
    expect(r.b).toContain('€49 in 6 dagen, gemiddeld €79');
    expect(r.v + r.b).not.toMatch(/Loopt voor/i);
    expect(r.bijV).toBe(true);
    expect(r.bijB).toBe(true);
  });
  test('komt geen potje boven uit, dan is het een zin en verder niets', async ({ page }) => {
    await boot(page, { set: { budgets: { huur: 1450, verzekering: 675, abonnement: 100, sport: 600, vices: 200, boodschappen: 700 } } });
    await grip(page);
    const r = await page.evaluate(() => ({ boven: maandVooruit().potjes.filter((x) => Math.round(x.overR) > 0).length,
      zin: document.querySelector('#gripDezeMaand [data-dmzin]').innerText }));
    expect(r.boven).toBe(0);
    expect(r.zin).toBe('Alle potjes blijven verwacht onder hun bedrag.');
  });
});

test.describe('c. de as', () => {
  test('de as begint bij de ondergrens, zonder bedrag erbij (v352)', async ({ page }) => {
    await boot(page, smal()); await grip(page);
    const b = await page.locator('#gripDezeMaand [data-asbasis]').getAttribute('data-asbasis');
    expect(+b).toBe(450);
    // v352: het bedrag staat niet meer bij de as; het stond op 360px half buiten de kaart
    expect(await page.locator('#gripDezeMaand [data-asbasis]').innerText()).toBe('');
    expect(await page.locator('#gripBrug').innerText()).not.toContain('€450');
  });
  test('bij grote stappen begint de as bij nul en staat er geen ondergrens', async ({ page }) => {
    await boot(page, { set: smal().set, extraTx: [{ id: 'groot', date: '2026-10-05', amount: -5000, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    await grip(page);
    const r = await page.evaluate(() => ({ basis: dezeMaandBrug(maandVooruit()).basis, as: document.querySelectorAll('#gripDezeMaand [data-asbasis]').length }));
    expect(r.basis).toBe(0);
    expect(r.as).toBe(0);
  });
});

test.describe('d. hooguit drie potjes los, de rest samen', () => {
  const set = smal({ uiteten: 100, shopping: 300 }).set;
  test('gekozen op de grootte van de afwijking, onder gedempt en boven in de kleur voor boven', async ({ page }) => {
    await boot(page, { set }); await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V);
      const kleur = [...document.querySelectorAll('#gripDezeMaand [data-brugstap="potje"] i')].map((i) => i.style.background).filter(Boolean);
      return { st: Br.stappen.map((s) => [s.soort, s.k || '', s.waarde]), budget: V.variabel.budget, proj: V.variabel.eind, kleur }; });
    expect(r.st.filter((s) => s[0] === 'potje').map((s) => s[1])).toEqual(['shopping', 'uiteten', 'vices']);
    expect(r.st.find((s) => s[1] === 'shopping')[2]).toBe(-300);
    expect(r.st.find((s) => s[1] === 'uiteten')[2]).toBe(175);
    expect(r.kleur).toEqual(['var(--mut2)', 'var(--red)', 'var(--red)']);
    // Boodschappen valt in de rest, en de stappen tellen nog steeds exact op.
    const som = r.st.slice(1, -1).reduce((a, s) => a + s[2], r.st[0][2]);
    expect(r.st[0][2]).toBe(r.budget);
    expect(som).toBe(r.proj);
    expect(r.st.find((s) => s[0] === 'rest')[2]).toBe(r.proj - r.budget + 300 - 175 - 83);
  });
  test('de zin noemt wat eronder blijft', async ({ page }) => {
    await boot(page, { set }); await grip(page);
    const z = await page.locator('#gripDezeMaand [data-dmzin]').innerText();
    expect(z).toContain('Online shopping blijft eronder');
  });
});

test.describe('e. potje bijstellen volgt de dekkingsregel: een ander potje levert in', () => {
  const bijstel = (page) => page.evaluate(() => { openGripVooruit(); document.querySelector('[data-bijstellen="vices"]').click(); });
  test('openen schrijft niets, niets is voorgekozen, en zonder dekking kan niet worden opgeslagen', async ({ page }) => {
    await boot(page); await grip(page);
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await bijstel(page);
    const r = await page.evaluate(() => { const s = document.getElementById('potjeBijstel');
      return { naar: +s.dataset.naar, kand: [...s.querySelectorAll('[data-dekkies]')].map((e) => e.dataset.dekkies),
        gevolg: s.querySelector('[data-bijstelgevolg]').innerText, uit: s.querySelector('[data-bijstelsave]').disabled }; });
    expect(r.naar).toBe(135);
    // ruimte boven wat je er gewoonlijk uitgeeft: sport 600-73, verzekering 675-150; abonnement (70) kan 85 niet dragen
    expect(r.kand).toEqual(['sport', 'verzekering']);
    expect(r.gevolg).toContain('Nog te dekken: €85');
    expect(r.gevolg).toContain('je maandbudget blijft dan €3.375');
    expect(r.uit).toBe(true);
    // de knop omzeilen schrijft ook niets: de schrijver eist zelf een dekking
    await page.evaluate(() => potjeBijstelZet('vices'));
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
  test('het gevolg noemt welk potje inlevert, en het maandbudget blijft gelijk', async ({ page }) => {
    await boot(page); await grip(page);
    await bijstel(page);
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.locator('[data-dekkies="verzekering"]').click();
    const r = await page.evaluate(() => ({ gevolg: document.querySelector('[data-bijstelgevolg]').innerText,
      uit: document.querySelector('[data-bijstelsave]').disabled, gelijk: localStorage.getItem('minder_set') }));
    expect(r.gelijk).toBe(voor);
    expect(r.uit).toBe(false);
    expect(r.gevolg).toContain('Vanaf november gaat Vices van €50 naar €135');
    expect(r.gevolg).toContain('Verzekeringen €85 in: van €675 naar €590');
    expect(r.gevolg).toContain('Je maandbudget blijft €3.375');
  });
  test('bevestigen zet beide potjes voor volgende maand, deze maand blijft, het totaal blijft €3.375', async ({ page }) => {
    await boot(page); await grip(page);
    await bijstel(page);
    await page.locator('[data-dekkies="verzekering"]').click();
    await page.locator('[data-bijstelsave]').click();
    const r = await page.evaluate(() => ({ next: SET.budgetsNext, nu: [SET.budgets.vices, SET.budgets.verzekering], tot: plannedTotalBudget() }));
    expect(r.next.vices).toBe(135);
    expect(r.next.verzekering).toBe(590);
    expect(r.nu).toEqual([50, 675]);
    expect(r.tot).toBe(3375);
  });
  test('zonder potje met genoeg ruimte is er geen kandidaat en blijft de knop uit', async ({ page }) => {
    await boot(page, { set: { budgets: { huur: 1450, verzekering: 160, abonnement: 40, sport: 80, vices: 50, boodschappen: 500 } } });
    await grip(page);
    await bijstel(page);
    const r = await page.evaluate(() => ({ kand: document.querySelectorAll('[data-dekkies]').length,
      gevolg: document.querySelector('[data-bijstelgevolg]').innerText, uit: document.querySelector('[data-bijstelsave]').disabled }));
    expect(r.kand).toBe(0);
    expect(r.uit).toBe(true);
    expect(r.gevolg).toContain('Geen ander potje heeft €85 over');
  });
  test('alleen een potje dat niet past heeft een voorstel', async ({ page }) => {
    await boot(page, { set: { budgets: { huur: 1450, verzekering: 675, abonnement: 100, sport: 600, vices: 50, boodschappen: 600 } },
      extraTx: [{ id: 'ahx', date: '2026-10-05', amount: -151, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    await grip(page);
    expect(await page.evaluate(() => potjeBijstelVoorstel('boodschappen'))).toBeNull();
  });
});

test.describe('f. de coachregel staat in de pop-up van de maandafsluiting', () => {
  test('niet op de kaart, wel in de afsluiting als hij er is', async ({ page }) => {
    await boot(page); await grip(page);
    const r = await page.evaluate(() => {
      const ing = maandCoachIngang(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())));
      const kaart = document.querySelectorAll('#gripDezeMaand [data-coachingang]').length;
      openAfsluiting('2026-09');
      return { ing: !!ing, kaart, pop: document.querySelectorAll('#sheet [data-coachingang]').length };
    });
    expect(r.kaart).toBe(0);
    expect(r.pop).toBe(r.ing ? 1 : 0);
  });
  test('de bron: de kaart noemt de ingang niet, de pop-up wel', async ({ page }) => {
    await boot(page);
    const kaart = await kaalUit(page, 'dezeMaandKaart'), pop = await kaalUit(page, 'renderAfsluitSheet');
    expect(kaart).not.toContain('maandCoachIngang(');
    expect(pop).toContain('maandCoachIngang(');
  });
});

test.describe('g. dynamisch met elke boeking', () => {
  test('een boeking op Vices verandert de kaart en de sheet samen', async ({ page }) => {
    await boot(page, smal()); await grip(page);
    const r = await page.evaluate(() => {
      TX.push({ id: 'vic10', date: '2026-10-06', amount: -40, acc: 'NL01MAIN0000001111', name: 'Coffeeshop', desc: 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
      TX.forEach(categorize); save(); renderMaand();
      const kaart = +document.querySelector('#gripDezeMaand [data-vooruit]').dataset.vooruit;
      const vices = +document.querySelector('#gripDezeMaand [data-brugstap="potje"]').dataset.brugwaarde;
      openGripVooruit();
      return { kaart, vices, sheet: +document.getElementById('gripVooruit').dataset.projectie };
    });
    expect(r.kaart).toBe(2712);
    expect(r.vices).toBe(123);
    expect(r.sheet).toBe(2712);
  });
});

test.describe('h. hoogte op 360 en 390px', () => {
  // Voor v349: kaart 145/127px, Grip 400/382px. Na: de bridge kost de rest.
  // v354: de kop is het stuurgetal (op 360px twee regels) en de regel vaste lasten komt eronder (68/50px):
  // de kaart gaat van 271 naar 338px op 360 en van 260 naar 300px op 390, Grip van 525 naar 592 en van 514 naar 555 (gemeten).
  // v355: Sport en Verzekeringen staan met hun variabele deel in de bridge, en de zin noemt ze: de kaart gaat
  // van 338 naar 348px op 360 en van 300 naar 309 op 390, Grip van 592 naar 602 en van 555 naar 564 (gemeten).
  const NA = { 360: { kaart: 348, grip: 602 }, 390: { kaart: 309, grip: 564 } };
  for (const w of [360, 390]) test('breedte ' + w, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await boot(page); await grip(page);
    const r = await page.evaluate(() => { const k = document.getElementById('gripDezeMaand'), kr = k.getBoundingClientRect();
      return { kaart: Math.round(kr.height), grip: Math.round(document.getElementById('s-maand').scrollHeight),
        over: [...k.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > kr.right + 0.5).length,
        horiz: document.documentElement.scrollWidth > window.innerWidth }; });
    expect(r.kaart).toBe(NA[w].kaart);
    expect(r.grip).toBe(NA[w].grip);
    expect(r.over).toBe(0);
    expect(r.horiz).toBe(false);
  });
});
