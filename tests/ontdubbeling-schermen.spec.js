// v186: de groep "dubbeling tussen schermen". Twee items gebouwd.
// (2) 'Patroon van de maand' las maandPatroon(), en dat filtert scoreNotifs() op budget-, discr- en
//     tempo. Die dragen alle drie h:'direct', dus het was letterlijk dezelfde melding die ook in de
//     meldingenlijst staat. De horizon-indeling uit v162 zegt waar een signaal hoort: structureel
//     op Maand, direct en correctie in de lijst.
// (5) 'Valt op' en de lek-vraag waren twee identiek vormgegeven kaarten die tegelijk renderden,
//     over dezelfde soort bevinding. v186 maakte er één kaart van, met het gesprek als voetregel.
//     v235 heeft die kaart gesplitst langs de horizonnen: Inzichten constateert (insSignalRows),
//     Grip draagt de keuze (gripSignalCards). Eén detectie, valtOpSignals(), en twee weergaven.
//     De ontdubbeling die deze groep bewaakt verschuift daarmee mee: de lek-ingang stond op
//     Inzichten en staat nu op Grip, en op precies één van de twee.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { kaalBron, kaalUit } = require('./bron-kaal');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [3, 2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[3];
const MAIN = 'NL01MAIN0000001111';
const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const dd = (n) => String(Math.max(1, Math.min(n, dim))).padStart(2, '0');

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a, acc: MAIN,
    name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of MS) {
    add(m, '02', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '03', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, dd(4), -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  // een forse losse uitgave deze maand: hier komt zowel een melding als een lek uit
  if (o.uitschieter !== false) add(CUR, dd(5), -420, 'Mediamarkt', 'BEA, BETAALPAS MEDIAMARKT');
  /* v311: EEN CATEGORIE OVER ZIJN POTJE, want zonder die boeking kon `maandPatroon()` hier per
     constructie niets opleveren en sloeg de test eronder over. `MAAND_PATROON` is
     `['budget-','discr-','tempo']`, en een `budget-`-signaal eist een categorie MET een potje die er
     minstens 15 euro over is. GEMETEN op de oude fixture: `scoreNotifs()` gaf `res-check`,
     `savefaster` en `room`, boodschappen stond op 300 van 400 en de Mediamarkt-uitgave landt op
     `shopping`, een categorie ZONDER potje. Geen van de drie prefixen kon dus vuren.
     HET IS BOODSCHAPPEN EN NIET SHOPPING, en dat is geen willekeur: een potje op `shopping` zou de
     LEK-helft van deze fixture weghalen, want `noPotLeak()` kijkt juist naar de grootste winkel
     ZONDER potje. De comment hierboven zegt dat die ene boeking beide draagt, en die blijft zo. */
  if (o.overPotje !== false) add(CUR, dd(6), -200, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 4000 }, budgets: { huur: 900, boodschappen: 400 },
    // de dekking-test vraagt om een dekkingsregel op Maand; die komt uit een reservering
    reserveringen: [{ id: 'r1', naam: 'Tandarts', bedrag: 300, vervalmaand: '2027-06', intervalM: 12 }],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandRegels === 'function' && TX.length > 0);
}
const scherm = async (page, n) => { await page.evaluate((x) => go(x), n); await page.waitForTimeout(90);
  return page.evaluate((x) => $('#s-' + x).innerText.replace(/\s+/g, ' '), n); };

test.describe('a · het patroon staat op precies één plek', () => {
  test('het is geen maandregel meer', async ({ page }) => {
    await boot(page);
    const keys = await page.evaluate(() => maandRegels().map((r) => r.key));
    expect(keys).not.toContain('patroon');
    expect(keys.every((k) => ['dekking', 'buffer', 'doel'].includes(k))).toBe(true);
    expect(await page.evaluate(() => MAAND_VOLGORDE)).toEqual(['dekking', 'buffer', 'doel']);
    expect(await scherm(page, 'maand')).not.toContain('Patroon van de maand');
  });

  test('de melding waar hij op leunde heeft horizon direct, dus hoort in de lijst', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const p = maandPatroon();
      return p ? { key: p.key, h: p.h, inLijst: notifList().some((n) => n.key === p.key) } : null;
    });
    /* v311: DE SKIP IS EEN ASSERTIE GEWORDEN, en de eis staat als eigen meting op de INVOER. Hij
       sloeg over op "deze fixture levert geen patroonsignaal", en dat las als een vastgelegde grens
       terwijl het de invoer was die het geval niet droeg: overslaan telt als groen (`v299`/`v300`).
       DE INVOERMETING STAAT ERBIJ en niet alleen de uitkomst, want de assertie hieronder zegt niets
       zodra er weer geen signaal is: dan valt hij wel, maar om een reden die een volgende ronde in
       de verkeerde hoek laat zoeken. */
    expect(r, 'de fixture moet een patroonsignaal leveren, anders toetst deze test niets').not.toBeNull();
    expect(r.key, 'en het moet een budget-signaal zijn, de enige van de drie die deze fixture kan dragen')
      .toMatch(/^budget-/);
    expect(r.h).toBe('direct');
    expect(r.inLijst).toBe(true);
  });

  test('maandPatroon blijft bestaan, maar alleen voor het verband', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof maandPatroon)).toBe('function');
    const src = await page.evaluate(() => maandVerband.toString());
    expect(src).toContain('maandPatroon()');
    /* En maandRegels roept hem niet meer aan. Commentaar telt niet als aanroep: de functie legt in
       een comment uit welke regel er stond en waarom hij weg is (dezelfde meetfout als v164). */
    const kaal = (await kaalUit(page, 'maandRegels')).split(String.fromCharCode(10)).join(' ');
    expect(kaal).not.toContain('maandPatroon');
  });

  test('het gesprek kent de sleutel niet meer en valt netjes terug', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => CO_MAAND_REGELS)).not.toContain('patroon');
    expect(await page.evaluate(() => coMaandRegel('patroon'))).toBeFalsy();
  });
});

test.describe('b · constateren en kiezen staan elk op één scherm', () => {
  /* v237: Inzichten draagt weer een lek-ingang, maar niet de oude. De CTA-voetregel is weg; wat er
     staat is een stille patroonregel die de bevinding zelf draagt. Wat deze test bewaakt is dat de
     kaart met zijn twee elementen niet terug is: geen #wvoLine, geen insLekVraag, en hooguit een
     ingang op dit scherm in plaats van een bevinding met een vraag eronder. */
  test('de kaart met de ingang is weg, en Inzichten draagt er hooguit een', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    await page.waitForTimeout(90);
    const ids = await page.evaluate(() => [...document.querySelectorAll('#s-ins > *')].map((e) => e.id || ''));
    expect(ids).not.toContain('insLekVraag');
    expect(ids).not.toContain('wvoLine');
    expect(await page.evaluate(() => typeof whatStandsOutLine)).toBe('undefined');
    expect(await page.evaluate(() => document.querySelectorAll("#s-ins [onclick*=\"coStart('lek'\"]").length))
      .toBeLessThanOrEqual(1);
    // de ingang zit in de regel zelf, niet als losse vraag eronder
    expect(await page.evaluate(() => ($('#s-ins').innerText || ''))).not.toMatch(/kunt doen\?/);
  });

  test('de ingang staat op Grip, en daar maar één keer', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    await page.waitForTimeout(90);
    const n = await page.evaluate(() => document.querySelectorAll('#s-maand [onclick*="coStart(\'lek\'"]').length);
    expect(n).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => typeof window.insLekVraag)).toBe('undefined');
  });

  test('zonder signaal en zonder patroon rendert Inzichten niets', async ({ page }) => {
    await boot(page, seed({ uitschieter: false }));
    const html = await page.evaluate((m) => insSignalRows(m, true), CUR);
    const r = await page.evaluate((m) => {
      let pat = 0;
      try { const mv = monthVsPrevInner(m);
        const ex = new Set([...mv.drivers, ...budgetFlaggedCats(m)]);
        pat = insSignals(m, ex).length; } catch (_) {}
      return { sig: valtOpSignals(m).length, pat };
    }, CUR);
    if (!r.sig && !r.pat) expect(html).toBe('');
    else expect(html).not.toBe('');
  });

  test('op een afgesloten maand komen de budgetregels niet mee', async ({ page }) => {
    await boot(page);
    const ms = await page.evaluate(() => months());
    test.skip(ms.length < 2, 'geen afgesloten maand');
    const vorige = ms[ms.length - 2];
    const html = await page.evaluate((m) => insSignalRows(m, false), vorige);
    // de handelingen gelden deze maand, dus een budgetregel hoort niet onder een afgesloten maand
    expect(html).not.toContain('valtop-rij');
    expect(html).not.toContain('in Grip');
    expect(html).not.toContain("coStart('lek'");
  });

  test('de patroonregel houdt de duiding en het dus-wat uit v174', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => insPatroonRij.toString());
    expect(src).toContain('p.hyp');
    expect(src).toContain('p.imp');
    expect(src).toContain('Alleen een observatie');
  });
});

test.describe('c · de keuze staat vast, zodat de tweede niet terugkomt', () => {
  test('geen enkele maandregel leest scoreNotifs met horizon direct', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => (maandRegels() || []).map((x) => ({ key: x.key, sig: !!x.sig })));
    for (const x of r) expect(x.sig, x.key).toBe(false);
  });

  /* v235 haalde de lek-ingang van Inzichten af, v237 zet er weer een neer in een andere vorm en
     voor een ander geval. De ontdubbeling die deze test bewaakt is daarmee niet vervallen maar
     verschoven: geen scherm draagt er twee, en de CTA-vraag staat nergens meer als losse regel.
     Dat er er twee tegelijk kunnen zijn, een per scherm, is de dekking die v237 wil. */
  test('Inzichten toont geen enkele maandregel, en geen scherm draagt twee lek-ingangen', async ({ page }) => {
    await boot(page);
    const ins = await scherm(page, 'ins');
    expect(ins).not.toContain('Patroon van de maand');
    expect(ins).not.toMatch(/kunt doen\?/);
    const per = async (x) => page.evaluate((n) => document.querySelectorAll('#s-' + n + " [onclick*=\"coStart('lek'\"]").length, x);
    await scherm(page, 'maand');
    expect(await per('ins')).toBeLessThanOrEqual(1);
    expect(await per('maand')).toBeLessThanOrEqual(1);
    for (const x of ['vooruit', 'dash', 'tx']) expect(await per(x), x).toBe(0);
  });
});

test.describe('d · de coach-inzichten hebben één bron', () => {
  // v196: coachItems() is met de coachpagina opgeheven; alle vijf zijn regels leven in scoreNotifs().
  test('renderBehavior en coachItems bestaan niet meer', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof window.renderBehavior)).toBe('undefined');
    expect(await page.evaluate(() => typeof coachItems)).toBe('undefined');
    const kaal = await kaalUit(page, 'renderIns');
    expect(kaal).not.toContain('coachItems');
    expect(kaal).not.toContain('renderBehavior');
    expect(kaal).not.toContain('openBehavior');
  });

  test('de regels staan in de signalen-engine, niet op een derde oppervlak', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => scoreNotifs.toString());
    // v228: 'inflatie' is vervallen; de drie die over zijn wonen nog steeds hier
    for (const k of ['savrules', 'meevaller', 'overstreak']) expect(src).toContain(`key:'${k}'`);
    await page.evaluate(() => go('ins'));
    const ins = await page.evaluate(() => $('#s-ins').innerText);
    expect(ins).not.toMatch(/gedrag/i);
  });
});

test.describe('e · de over-budget-observatie heeft één detectie', () => {
  /* v235: budgetOverCat() was de eerste bron van de Valt-op-kaart en gaf de GROOTSTE
     overschrijding. valtOpSignals() heeft die rol overgenomen met een andere lat (een bedrag in
     plaats van een percentage) en levert er twee. budgetOverCat() blijft bestaan voor
     coachWeekRisk() en coachLeak(), die een andere vraag stellen; hij voedt het scherm niet meer. */
  test('valtOpSignals is de enige detectie, en Grip rekent niet zelf', async ({ page }) => {
    const p = seed({ set: { budgets: { huur: 900, boodschappen: 100 } } });   // boodschappen loopt over
    await boot(page, p);
    const sig = await page.evaluate((m) => valtOpSignals(m), CUR);
    test.skip(!sig.length, 'deze fixture levert geen overschrijding');
    await page.evaluate(() => go('ins'));
    const ins = await page.locator('.valtop-rij').first().innerText();
    expect(ins).toContain(sig[0].naam);
    // Grip leest dezelfde functie en doet geen eigen meting
    /* v340: gripSignalCards() en valtOpKaartDicht() bestaan niet meer. Het signaal staat als Let op-regel
       (gripLetOpItems, gevoed vanuit renderMaand) en de kaart in de sheet (renderGripLetOp, valtOpKaartOpen). */
    const src = await kaalUit(page, 'renderMaand', 'gripLetOpItems', 'renderGripLetOp', 'valtOpKaartOpen');
    expect(src).toMatch(/valtOpSignals\(/);
    expect(src).not.toMatch(/budgetOverCat|budgetBand|effectiveBudgets/);
    await page.evaluate(() => { go('maand'); renderMaand(); });
    await page.locator('#s-maand #gripLetOp [data-letop="sig"]', { hasText: sig[0].naam }).click();
    expect(await page.locator('#gripLetOpSheet .valtop-open').innerText()).toContain(sig[0].naam);
    await expect(page.locator('#s-maand .valtop-open')).toHaveCount(0);
  });

  test('en verschijnt maar één keer per scherm', async ({ page }) => {
    const p = seed({ set: { budgets: { huur: 900, boodschappen: 100 } } });
    await boot(page, p);
    const sig = await page.evaluate((m) => valtOpSignals(m), CUR);
    test.skip(!sig.length, 'deze fixture levert geen overschrijding');
    await page.evaluate(() => go('ins'));
    const rijen = await page.locator('.valtop-rij').allInnerTexts();
    expect(rijen.filter((t) => t.includes(sig[0].naam)).length).toBe(1);
    /* v340: op Grip staat het signaal als Let op-regel, en de kaart pas in de sheet erachter */
    await page.evaluate(() => { go('maand'); renderMaand(); });
    const regels = await page.locator('#s-maand [data-letop="sig"]').allInnerTexts();
    expect(regels.filter((t) => t.includes(sig[0].naam)).length).toBe(1);
    expect(await page.locator('#s-maand .valtop-kaart').count()).toBe(0);
  });
});

test.describe('f · dekking wordt op één scherm beoordeeld', () => {
  test('Maand oordeelt, Plan beheert', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      regel: (maandRegels() || []).find((x) => x.key === 'dekking'),
      zin: dekkingTekst(dekking(12)),
      kaart: (function () { const d = document.createElement('div');
        d.innerHTML = resDekkingCard(); return d.innerText.replace(/\s+/g, ' '); })(),
    }));
    expect(r.regel.gevolg).toBe(r.zin);                  // het oordeel staat op Maand
    expect(r.kaart).not.toContain(r.zin);                // en niet op Plan
    expect(r.kaart).toMatch(/\d+ post/);                 // Plan houdt de feiten
    /* v243: de verwijzende zin was één weergave van de ontdubbeling, niet de ontdubbeling zelf. Die
       is dat het OORDEEL (dekkingTekst: gedekt tot, het gat, wat je per maand nodig hebt) op Grip
       staat en niet op Plan, terwijl Plan de posten en het verschil draagt. Dat toetsen we nu
       rechtstreeks in plaats van via een zin die de kaart sinds v242 niet meer nodig heeft. */
    expect(r.kaart).not.toMatch(/gedekt tot|per maand nodig/);
    expect(r.zin).toMatch(/gedekt tot|per maand nodig|nog geen verplichtingen|niets aan/i);
  });
});

test.describe('g · de aansluiting staat op Plan, niet op Maand', () => {
  test('geen maandregel, wel de vrij-regel op je plan', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => MAAND_VOLGORDE)).not.toContain('aansluiting');
    expect(await page.evaluate(() => (maandRegels() || []).some((x) => x.key === 'aansluiting'))).toBe(false);
    expect(await page.evaluate(() => typeof window.openAansluiting)).toBe('undefined');
    expect(await page.evaluate(() => typeof spaarVrijLine)).toBe('function');
  });

  test('het verband dat erop leunde blijft, en leest de bron rechtstreeks', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => maandVerband.toString());
    expect(src).toContain('spaarVrij()');
    expect(src).not.toMatch(/r\.key==='aansluiting'/);
  });
});

/* v340: blok h ('de beleggen-regel herhaalt geen zichtbare rij') vervallen, want maandBeleggenRegel() en
   de kaart 'Voorwaarden voor beleggen' bestaan niet meer. Beleggen is nu een eigen tegel
   ([data-tegel="beleggen"]) die altijd zijn stand draagt (klaar, of wacht op je blokkade); er is geen
   regel meer die bij een zichtbare rij zwijgt. */

test.describe('i · de terugval claimt geen leegte die er niet is', () => {
  /* v188: de terugval keek alleen naar maandRegels() en negeerde maandStructureel(). Sinds er nog
     drie regels over zijn werd hij bereikbaar, en dan las je 'er is nog te weinig ingesteld'
     terwijl er wel degelijk een signaal stond. Hij vuurt nu alleen als er noch regels noch
     structurele signalen zijn. */
  const kaal = () => {
    const p = seed();
    const set = JSON.parse(p.minder_set);
    delete set.reserveringen; delete set.goals; delete set.savingsEnds;
    p.minder_set = JSON.stringify(set);
    return p;
  };

  test('noch regels noch signalen: dan zegt het scherm dat, en niets anders', async ({ page }) => {
    await boot(page, kaal());
    const r = await page.evaluate(() => ({ regels: maandRegels().length, str: maandStructureel().length }));
    test.skip(r.regels > 0 || r.str > 0, 'deze fixture levert wel iets op');
    expect(await scherm(page, 'maand')).toContain('Er is nog te weinig ingesteld');
  });

  test('alleen structurele signalen: die worden getoond, met een oordeel erover', async ({ page }) => {
    await boot(page, kaal());
    const r = await page.evaluate(() => {
      // dwing één structureel signaal af zonder de signalen-engine aan te raken
      const orig = window.maandStructureel;
      window.maandStructureel = () => [{ key: 'overstreak', naam: 'Je geeft al maanden te veel uit',
        status: 'tekort', waarde: '', eenheid: '', gevolg: '', act: '', structureel: true }];
      renderMaand();
      const t = $('#s-maand').innerText.replace(/\s+/g, ' ');
      const rij = document.querySelector('#s-maand #gripLetOp [data-letop="str"]');
      const dot = rij ? getComputedStyle(rij.querySelector('span')).backgroundColor : '';
      const rood = (() => { const e = document.createElement('span'); e.style.background = 'var(--red)'; document.body.appendChild(e);
        const c = getComputedStyle(e).backgroundColor; e.remove(); return c; })();
      window.maandStructureel = orig;
      return { t, regels: maandRegels().length, rij: rij ? rij.innerText : '', dot, rood };
    });
    expect(r.regels).toBe(0);                                   // geen enkele gewone regel
    /* v340: de terugval gaat nu alleen over de tegels ('te weinig ingesteld om tegels te tonen'), en dat
       is waar: een structureel signaal heeft geen tegel. Een claim dat er NIETS is, mag er niet staan. */
    expect(r.t).not.toMatch(/Er is nog te weinig ingesteld(?! om tegels te tonen)/);
    expect(r.rij).toContain('Je geeft al maanden te veel uit');  // het signaal staat er, onder Let op
    /* v340: 'vraagt een beslissing' bestaat niet meer als kop; het oordeel zit in de rode stip van de regel */
    expect(r.dot).toBe(r.rood);
  });

  /* v340: 'de guard leest allebei de bronnen' vervallen, want de terugval van renderMaand() zegt alleen
     nog dat er geen tegels zijn, en de structurele signalen staan los daarvan onder Let op. */
});

test.describe('j · het bedrag staat bij het oordeel, niet op twee schermen', () => {
  test('de Plan-kaart noemt het bedrag per maand niet meer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      per: dekking(12).benodigdPerMaand,
      kaart: (function () { const d = document.createElement('div');
        d.innerHTML = resDekkingCard(); return d.innerText.replace(/\s+/g, ' '); })(),
      regel: ((maandRegels() || []).find((x) => x.key === 'dekking') || {}).gevolg || '',
    }));
    test.skip(!(r.per > 0), 'deze fixture vraagt niets per maand');
    const bedrag = String(r.per).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    expect(r.regel).toContain(bedrag);          // het oordeel op Maand noemt het
    expect(r.kaart).not.toContain(bedrag);      // de kaart op Plan niet
    expect(r.kaart).toMatch(/\d+ post/);        // die houdt de feiten over je lijst
  });
});
