// v178: de horizongroep uit de scherm-audit. Zeven elementen stonden op een scherm waarvan de
// horizon niet bij hun vraag past. Home is "waar sta ik nu", Inzichten "deze maand, operationeel",
// Maand "houdt mijn systeem stand, structureel", Vooruitblik "de horizon".
// De regel die deze spec bewaakt: een verplaatst element staat daarna op PRECIES EEN scherm, en een
// maandregel op Maand laat je niet van scherm wisselen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');
const { kaalBron, kaalUit } = require('./bron-kaal');

async function boot(page, scherm, payload) {
  await open(page, payload || seed());
  if (scherm) {
    await page.evaluate((s) => go(s), scherm);
    await page.waitForTimeout(90);
  }
}
/* De gedeelde fixture kent geen opzegbaar abonnement: subscriptionsList() vraagt een automatische
   incasso in een opzegbare categorie. Eén Netflix-incasso per maand is genoeg. */
function metAbo() {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  const nu = new Date();
  const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  for (const k of [2, 1, 0]) {
    const m = ym(new Date(nu.getFullYear(), nu.getMonth() - k, 1));
    tx.push({ id: 'nf-' + m, date: m + '-06', amount: -12, acc: 'NL01MAIN0000001111',
      name: 'Netflix', desc: 'SEPA INCASSO NETFLIX ABONNEMENT', typ: '', ref: '', src: 'csv',
      accName: 'Main', refNums: [] });
  }
  p.minder_tx = JSON.stringify(tx);
  return p;
}
const tekst = (page, s) => page.evaluate((x) => $('#s-' + x).innerText.replace(/\s+/g, ' '), s);
const beide = async (page) => ({ ins: await tekst(page, 'ins'), maand: await tekst(page, 'maand') });

test.describe('a · elk verplaatst element staat op precies één scherm', () => {
  test("'vanaf volgende maand' staat op Maand en niet meer op Inzichten", async ({ page }) => {
    await boot(page, 'maand');
    const t = await beide(page);
    /* v315: de rij heet 'Je potjes' en staat onder de kop 'Vanaf <maand>' in een eigen kaart; de
       woorden 'vanaf volgende maand' zaten tot dan in de rij zelf. Wat de regel vasthoudt is dat
       het element op Grip staat en niet op Inzichten, en dat is de kop plus de rij. */
    /* DE KOP MET DE MAAND EROP EN NIET HET LOSSE WOORD 'VANAF': Inzichten zegt zelf 'vanaf 6
       afgeronde maanden zie je hier je verloop', en op dat woord binden maakt de tweede helft van
       deze test per constructie rood. Hetzelfde geldt voor 'je potjes': de stand-kaart op Inzichten
       zegt 'nog in je potjes' (v309). De kop met de maandnaam is uniek voor dit element. */
    /* v340: de kaart 'Vanaf <maand>' is opgegaan in de tijdlijn op Grip. Het element is nu het punt
       met de korte vorm uit maandVanafData(), in de kolom van volgende maand; die korte vorm noemt
       het potje en het nieuwe bedrag, en is daarmee net zo uniek als de kop was. */
    /* v365: de tijdlijn op Grip is vervallen. De rij staat op geen van beide schermen meer, en de lijst van
       volgende maand is bereikbaar via de voetlink van de lijst van deze maand (openPotjesVerdeling). */
    const r = await page.evaluate(() => { const v = maandVanafData()[0]; openPotjesVerdeling(thisYM());
      const voet = [...document.querySelectorAll('#sheet [onclick]')].map((e) => e.getAttribute('onclick')).find((o) => o.includes("'next'"));
      closeSheet(); return { v, voet }; });
    expect(r.v.lab).toBe('Je potjes');
    expect(t.maand).not.toContain(r.v.kort);
    expect(t.ins).not.toContain(r.v.kort);
    expect(r.v.act).toContain('openPotjesVerdeling');
    expect(r.voet).toBe(r.v.act);
  });

  /* v228: 'boven je inkomen-limiet' verhuisde in v178 naar Maand en is daar vervallen. De regel
     van deze spec blijft: hij staat nu op geen enkel scherm, en zeker niet terug op Inzichten. */
  test("'boven je inkomen-limiet' staat op geen van beide schermen", async ({ page }) => {
    await boot(page, 'maand');
    const t = await beide(page);
    expect(t.maand).not.toMatch(/inkomen-limiet/i);
    expect(t.ins).not.toMatch(/inkomen-limiet/i);
  });

  /* v227: deze verhuizing is omgekeerd. De grafiek staat weer op Inzichten, onder het blok over
     deze maand. De REGEL die deze spec bewaakt verandert niet - een verplaatst element staat op
     precies één scherm - alleen de richting. De afweging staat in BESLISSINGEN.md met beide kanten:
     v178 haalde hem naar Maand omdat hij maanden naast elkaar zet, en dat argument staat nog. */
  test('de meermaands-grafiek staat op Inzichten en niet meer op Maand', async ({ page }) => {
    await boot(page, 'maand');
    const t = await beide(page);
    expect(t.ins).toMatch(/over de maanden/i);           // v359: de kop heet "Over de maanden"
    expect(t.maand).not.toMatch(/over de maanden/i);
    /* Zonder comments gemeten: renderMaand() noemt de functie nog in een comment dat vertelt dát
       hij verhuisd is, en een naam in een comment is geen aanroep. */
    expect(/spendVsBudgetChart/.test(await kaalUit(page, 'renderIns'))).toBe(true);
    expect(/spendVsBudgetChart/.test(await kaalUit(page, 'renderMaand'))).toBe(false);
  });

  /* v231: de abonnementenkaart is van Maand af en de lijst staat onder Instellingen (Vaste
     lasten), samengevoegd met de lijst van de liquiditeitsprognose. De regel van deze spec blijft:
     op geen van beide horizonschermen, en het gesprek wijst naar de plek waar de lijst wel staat. */
  test('de abonnementenkaart staat op geen van beide schermen', async ({ page }) => {
    await boot(page, 'maand', metAbo());
    const t = await beide(page);
    expect(t.maand).not.toMatch(/abonnementen/i);
    expect(t.ins).not.toMatch(/abonnementen/i);
    // comments tellen niet als verwijzing: renderMaand noemt subsCard nog in de notitie over de verhuizing
    expect(/subsCard/.test(await kaalUit(page, 'renderIns', 'renderMaand'))).toBe(false);
  });

  test('de ingang uit het coachgesprek wijst naar de nieuwe plek', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => coTopicVast.toString());
    expect(src).toContain('Bekijk al mijn vaste lasten');
    expect(/Bekijk al mijn vaste lasten[\s\S]{0,120}openVasteLasten\(\)/.test(src)).toBe(true);
    expect(src).not.toContain("go('maand')");
    expect(src).not.toContain("go('ins')");
  });
});

test.describe('b · de ingeklapte kop noemt wat eronder staat', () => {
  /* v208: het Kerncijfers-blok is van Inzichten af, en met dat blok verviel de ingeklapte kop met
     zijn samenvatting (insVouw en insKpiSamenvatting hadden geen andere aanroeper). Wat deze test
     bewaakte - de kop noemt wat eronder staat - heeft geen kop meer om te noemen. Wat er voor in de
     plaats komt is de andere helft van dezelfde regel: op Maand staan precies de twee structurele
     cijfers, en op Inzichten staat er geen enkele. */
  test('de tegels staan op Maand, en Inzichten draagt er geen', async ({ page }) => {
    await boot(page, 'maand');
    const r = await page.evaluate(() => ({
      maand: [...document.querySelectorAll('#maandKpiBlok .wvo-tile')].map((e) => e.dataset.kpi),
      vouw: typeof insKpiSamenvatting,
    }));
    expect(r.maand).toEqual(['inleg']);        // v209: de vaste-lastendruk is van Maand af
    expect(r.vouw).toBe('undefined');
    const ins = await page.evaluate(() => { go('ins'); return $('#s-ins').innerText; });
    expect(ins.toLowerCase()).not.toContain('spaarquote');
  });
});

test.describe('c · een maandregel laat je niet van scherm wisselen', () => {
  /* v187: de aansluitingsregel is van Maand af, en openAansluiting() had geen andere aanroeper.
     Het bijsturen zit onveranderd in spaarVrijLine() op Plan. */
  test('de aansluitingsregel en zijn sheet bestaan niet meer op Maand', async ({ page }) => {
    await boot(page, 'maand');
    expect(await page.evaluate(() => (maandRegels() || []).some((x) => x.key === 'aansluiting'))).toBe(false);
    expect(await page.evaluate(() => typeof window.openAansluiting)).toBe('undefined');
    // en het feit zelf staat er nog, op zijn ene plek
    expect(await page.evaluate(() => typeof spaarVrijLine)).toBe('function');
  });

  /* v186: de patroonregel is vervallen, want hij toonde een melding die al in de meldingenlijst
     staat. Wat deze test bewaakt geldt onverkort voor de regels die overblijven: geen enkele
     maandregel stuurt je naar een ander scherm. */
  test('geen enkele maandregel stuurt je naar een ander scherm', async ({ page }) => {
    await boot(page, 'maand');
    const src = await page.evaluate(() => maandRegels.toString());
    const kaal = kaalBron(src).split('\n').join(' ');   // v309: de gedeelde strip
    expect(kaal).not.toContain("go('ins')");
    expect(kaal).not.toContain("go('vooruit')");
    const acts = await page.evaluate(() => (maandRegels() || []).map((r) => r.act || ''));
    for (const a of acts) expect(a).not.toContain('go(');
  });

  /* v187: openAansluiting() is met de aansluitingsregel meegegaan; hij had geen andere aanroeper.
     Het bijsturen zit onveranderd in spaarVrijLine() op Plan, met dezelfde bron en dezelfde route
     naar een toewijzing (v172). */
  test('spaarVrijLine leest spaarVrij en rekent zelf niets', async ({ page }) => {
    await boot(page, 'vooruit');
    const V = await page.evaluate(() => spaarVrij());
    const html = await page.evaluate(() => spaarVrijLine(allocatePlan()));
    if (V.vrij > 0) {
      expect(html).toContain(String(V.vrij).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
      expect(html).toMatch(/spaarVrijToe\(|openGoal\(/);
    }
    expect(await page.evaluate(() => /spaarVrij\(\)/.test(spaarVrijLine.toString()))).toBe(true);
  });

  test('kijken verandert niets aan je gegevens', async ({ page }) => {
    await boot(page, 'maand');
    const voor = await page.evaluate(() => JSON.stringify([TX.length, SET, OWN]));
    await page.evaluate(() => { maandRegels(); maandVerband(maandRegels()); });
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => JSON.stringify([TX.length, SET, OWN]))).toBe(voor);
  });
});

test.describe('d · de horizon van het scherm blijft kloppen', () => {
  /* v233: Grip leest altijd de lopende maand; de kiezer op Inzichten raakt hem niet. Wat deze test
     bewaakte (bij een afgesloten maand staat er op Maand niets over nu) is vervallen omdat er op
     Grip geen afgesloten maand meer bestaat. Wat ervoor in de plaats staat: de kiezer van
     Inzichten verandert niets aan Grip. */
  test('de kiezer van Inzichten verandert niets aan Grip', async ({ page }) => {
    await boot(page, 'maand', metAbo());
    const ms = await page.evaluate(() => months());
    test.skip(ms.length < 2, 'deze fixture heeft geen afgesloten maand');
    const nu = await page.evaluate(() => document.querySelector('#s-maand').innerHTML);
    await page.evaluate((m) => ((m)=>{ curMonth=m; window._insPer=null; closeSheet(); render(); })(m), ms[ms.length - 2]);
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => document.querySelector('#s-maand').innerHTML)).toBe(nu);
    expect(await tekst(page, 'ins')).toMatch(/vorige maand/i);   // Inzichten zegt het wel, in het filter (v359)
  });

  /* v187: de Gedrag-kaart ging op in de Valt-op-kaart, dus Verdieping hield er één over. v208: die
     ene is het Kerncijfers-blok en dat is van Inzichten af, dus de sectie bestaat niet meer. */
  test('de verdieping op Inzichten bestaat niet meer', async ({ page }) => {
    await boot(page, 'ins');
    const src = await page.evaluate(() => renderIns.toString());
    expect((src.match(/insVouw\(/g) || []).length).toBe(0);
    const t = await tekst(page, 'ins');
    expect(t).not.toMatch(/kerncijfers/i);
    expect(t).not.toMatch(/gedrag/i);
    expect(t).not.toMatch(/verdieping/i);
  });
});
