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
    test.skip(!r, 'deze fixture levert geen patroonsignaal');
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
    const kaal = (await page.evaluate(() => maandRegels.toString()))
      .replace(/\/\*[\s\S]*?\*\//g, ' ').split(String.fromCharCode(10))
      .map((r) => r.replace(/(^|[^:\w])\/\/.*$/, '$1')).join(' ');
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
    const kaal = (await page.evaluate(() => renderIns.toString()))
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
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
    const src = await page.evaluate(() => gripSignalCards.toString() + valtOpKaartOpen.toString() + valtOpKaartDicht.toString());
    expect(src).toMatch(/valtOpSignals\(/);
    expect(src).not.toMatch(/budgetOverCat|budgetBand|effectiveBudgets/);
    await page.evaluate(() => go('maand'));
    expect(await page.locator('.valtop-open').innerText()).toContain(sig[0].naam);
  });

  test('en verschijnt maar één keer per scherm', async ({ page }) => {
    const p = seed({ set: { budgets: { huur: 900, boodschappen: 100 } } });
    await boot(page, p);
    const sig = await page.evaluate((m) => valtOpSignals(m), CUR);
    test.skip(!sig.length, 'deze fixture levert geen overschrijding');
    await page.evaluate(() => go('ins'));
    const rijen = await page.locator('.valtop-rij').allInnerTexts();
    expect(rijen.filter((t) => t.includes(sig[0].naam)).length).toBe(1);
    await page.evaluate(() => go('maand'));
    const kaarten = await page.locator('.valtop-kaart').allInnerTexts();
    expect(kaarten.filter((t) => t.includes(sig[0].naam)).length).toBe(1);
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

test.describe('h · de beleggen-regel herhaalt geen zichtbare rij', () => {
  test('bij een zichtbaar tekort op dekking of doel zwijgt hij', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const R = maandRegels(); const B = beleggenKlaar(R);
      return { blok: B.blokkade ? B.blokkade.key : null, klaar: B.klaar,
        rij: B.blokkade ? (R.find((x) => x.key === B.blokkade.key) || {}).status : null,
        regel: maandBeleggenRegel(R) };
    });
    if (r.blok && r.blok !== 'buffer' && r.rij === 'tekort') expect(r.regel).toBe('');
  });

  /* v226: hier stond een assertie op de brontekst van beleggenKlaar() - /r.status!=='tekort'/ -
     en die legde de implementatie vast in plaats van de eigenschap. Sinds de buffer daar aan
     r.kritiek wordt gemeten en niet aan zijn status klopte de tekst niet meer, terwijl de
     eigenschap onveranderd geldt: de bufferblokkade wordt nooit weggelaten omdat de rij iets
     anders zegt. Die uitzondering zit in maandBeleggenRegel() en dat is wat dit blok over gaat, dus
     daar hangt de test nu alleen nog aan. Dat de voorwaarde zelf de STAND volgt en niet de status
     staat met echte data in op-tempo.spec.js, blok e; deze fixture heeft geen spaarrekening en dus
     geen bufferregel om dat op te meten. */
  test('de bufferblokkade blijft altijd staan: let op is een ander oordeel', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => maandBeleggenRegel.toString());
    expect(src).toContain("B.blokkade.key!=='buffer'");
  });
});

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
      window.maandStructureel = orig;
      return { t, regels: maandRegels().length };
    });
    expect(r.regels).toBe(0);                                   // geen enkele gewone regel
    expect(r.t).not.toContain('Er is nog te weinig ingesteld');  // dus geen claim van leegte
    expect(r.t).toContain('Je geeft al maanden te veel uit');    // het signaal staat er
    expect(r.t).toMatch(/beslissing vraagt/);                    // met een oordeel dat het telt
  });

  test('de guard leest allebei de bronnen', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => renderMaand.toString());
    expect(src).toContain('!R.length && !STR.length');
  });
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
