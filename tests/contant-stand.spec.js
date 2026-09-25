// v258: contant geld is een stand die je af en toe telt, en het verschil is de uitgave.
//
// AANLEIDING, gemeten. €400 gepind. De opname valt onder 'intern' (RULES) en is dus geen uitgave,
// maar het banksaldo daalt wel met 400. Gemeten voor en na, op dezelfde gegevens:
// totalBalance 4000 → 3600, veilig te besteden 2912 → 2512, vermogen 4000 → 3600. Je positie
// veranderde niet en drie cijfers wel. Met de stand erbij staan ze weer op 4000 / 2912 / 4000.
//
// DE KEUZE VAN DE GEBRUIKER, en waarom niet de andere twee. Optie b (de opname IS de uitgave, met
// een categorie erbij op het moment van pinnen) is afgewezen: "Bij b moet ik op het moment van
// pinnen weten waar dat geld heen gaat, en dat weet ik niet. Een schatting die ik in de winkel
// maak is geen meting, en de app hoort liever te meten." Wat de app hier meet is het BEDRAG; de
// bestemming blijft onbekend, en dat is precies waarom de boeking op een geenNorm-categorie landt
// en niet op een potje.
//
// WAT DE geenNorm-VLAG KOOPT, gemeten in de coachlaag met en zonder. Zonder de vlag zegt
// coachWeekRisk(): "Geef 'contant' een potje: geen budget, geen aankoop" — een opdracht die per
// constructie niet uit te voeren is. Ook coachLeak() (contant €400 i.p.v. vervoer €85),
// coFirstPotCat(), coachRuleOptions(), openPotjePick() en setBudget() wijzen hem dan aan.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

/* De opnames staan op dag 02, ruim vóór vandaag, zodat de datumgrens van contantVerwacht()
   (t.date > de teldag) in de gewone tests niet meespeelt. De test die die grens zélf toetst zet
   zijn boeking bewust op vandaag. */
/* categorize() herberekent t.id uit een hash over rekening, datum, bedrag en omschrijving, dus een
   id die je hier meegeeft overleeft de boot niet. Deze specs zoeken hun boekingen daarom op de
   OMSCHRIJVING en nooit op een id. Dat was geen bug in de app: het is de vindfout uit de
   meetlessen, een test die aan iets hangt wat geen anker is. */
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M1, CUR]) {
    add('i' + m, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '03', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('b' + m, m, '06', -640, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  if (o.opname !== false) add('gea1', CUR, '02', -400, 'Geldmaat', 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM 9');
  for (const e of (o.extra || [])) add(e.id, CUR, e.day || '02', e.amount, e.naam, e.desc);
  const set = Object.assign({
    limit: 70, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 3600, [SPAAR]: 0 },
    budgets: { huur: 1200, boodschappen: 700 },
    savingMode: 'amount', savingAmount: 500, savingsAcc: { [SPAAR]: true },
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: JSON.stringify(o.ovr || {}), minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof totals === 'function' && typeof contantVerwacht === 'function');
  await helpers(page);
}
/* Twee helpers in de pagina. pinVandaag() zet de boeking neer via categorize(), niet met een
   handgeschreven object: zonder autoCat is catOf() undefined en valt CATS[undefined].type om.
   gisterenTellen() verzet alleen de teldag, zodat een opname van vandaag erna valt. */
async function helpers(page) {
  await page.evaluate(() => {
    window.pinVandaag = (bedrag) => {
      const t = { date: vandaagYMD(), amount: -bedrag, acc: OWN[0], name: 'Geldmaat',
        desc: 'GEA, BETAALPAS GELDMAAT ' + bedrag, typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); TX.sort((a, b) => a.date.localeCompare(b.date)); save();
    };
    window.gisterenTellen = () => { const d = new Date(); d.setDate(d.getDate() - 1); SET.contant.datum = ymdVan(d); save(); };
  });
}
// tellen via de echte route: het scherm openen, het veld vullen, opslaan
const tel = (page, bedrag) => page.evaluate((b) => {
  contantTellen();
  document.querySelector('#contInput').value = String(b);
  contantOpslaan();
}, bedrag);

test.describe('de poort: wat telt als een opname', () => {
  test('GEA en GELDMAAT tellen, een overboeking niet', async ({ page }) => {
    await boot(page, { extra: [
      { id: 'x1', amount: -300, naam: 'Eigen rekening', desc: 'SEPA OVERBOEKING PRIVEREKENING' },
      { id: 'x2', amount: -200, naam: 'Revolut', desc: 'SEPA OVERBOEKING REVOLUT' },
      { id: 'x3', amount: -100, naam: 'Western Union', desc: 'WESTERN UNION' },
      { id: 'x4', amount: -50, naam: 'Geldmaat', desc: 'GEA, BETAALPAS GM ZWANEBLOE' },
    ] });
    const r = await page.evaluate(() => ({
      alle: TX.filter((t) => isOpnameTx(t)).map((t) => t.desc).sort(),
      internN: TX.filter((t) => catOf(t) === 'intern' && t.amount < 0).length,
    }));
    // alle vijf de negatieve boekingen hieronder zijn intern, maar alleen de automaten zijn opnames
    expect(r.internN).toBe(5);
    expect(r.alle).toEqual(['GEA, BETAALPAS GELDMAAT ZWANEBLOEM 9', 'GEA, BETAALPAS GM ZWANEBLOE']);
  });

  test('een opname die je zelf op een uitgave zet telt niet meer mee', async ({ page }) => {
    await boot(page, {});
    await page.evaluate(() => { const t = TX.find((x) => /GELDMAAT/.test(x.desc)); OVR[t.id] = 'boodschappen'; save(); });
    expect(await page.evaluate(() => TX.filter((t) => isOpnameTx(t)).length)).toBe(0);
  });

  test('een bijschrijving is nooit een opname', async ({ page }) => {
    await boot(page, { extra: [{ id: 'stort', amount: 250, naam: 'Geldmaat', desc: 'GEA, BETAALPAS STORTING' }] });
    expect(await page.evaluate(() => TX.filter((t) => isOpnameTx(t)).map((t) => t.desc))).toEqual(['GEA, BETAALPAS GELDMAAT ZWANEBLOEM 9']);
  });
});

test.describe('onbekend blijft onbekend', () => {
  test('zonder telling is er geen contant bedrag en verandert er niets aan het saldo', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => ({
      verwacht: contantVerwacht(), telling: contantTelling(), ouderdom: contantOuderdom(),
      saldo: totalBalance().sum, contantTerm: totalBalance().contant,
      safe: Math.round(safeToSpend().safe), netto: Math.round(netWorth().netto),
    }));
    expect(r.verwacht).toBeNull();
    expect(r.telling).toBeNull();
    expect(r.ouderdom).toBeNull();
    expect(r.contantTerm).toBeNull();
    // exact het banksaldo: geen term erbij, geen nul die als meting leest
    expect(r.saldo).toBe(3600);
  });

  test('de opbouwregel staat er niet zolang er niet geteld is', async ({ page }) => {
    await boot(page, {});
    expect(await page.evaluate(() => contantOpbouwRegel())).toBe('');
  });
});

test.describe('de opname wordt neutraal zodra je telt', () => {
  test('saldo, veilig te besteden en vermogen staan weer waar ze stonden', async ({ page }) => {
    await boot(page, {});
    const voor = await page.evaluate(() => ({ saldo: totalBalance().sum, safe: Math.round(safeToSpend().safe), netto: Math.round(netWorth().netto) }));
    await tel(page, 400);
    const na = await page.evaluate(() => ({ saldo: totalBalance().sum, safe: Math.round(safeToSpend().safe), netto: Math.round(netWorth().netto), contant: totalBalance().contant }));
    expect(na.saldo).toBe(voor.saldo + 400);
    expect(na.safe).toBe(voor.safe + 400);
    expect(na.netto).toBe(voor.netto + 400);
    expect(na.contant).toBe(400);
  });

  test('de eerste telling schrijft geen boeking, want er is niets om tegen af te zetten', async ({ page }) => {
    await boot(page, {});
    await tel(page, 400);
    expect(await page.evaluate(() => TX.filter((t) => t.src === 'contant').length)).toBe(0);
  });
});

test.describe('het verschil is de uitgave', () => {
  test('minder dan verwacht wordt een boeking op contant, voor precies het verschil', async ({ page }) => {
    await boot(page, {});
    await tel(page, 400);
    await tel(page, 145.5);
    const r = await page.evaluate(() => {
      const rij = TX.filter((t) => t.src === 'contant');
      return { n: rij.length, bedrag: rij[0] && rij[0].amount, cat: rij[0] && catOf(rij[0]), stand: contantTelling().stand, verwacht: contantVerwacht() };
    });
    expect(r.n).toBe(1);
    expect(r.bedrag).toBeCloseTo(-254.5, 2);
    expect(r.cat).toBe('contant');
    expect(r.stand).toBeCloseTo(145.5, 2);
    expect(r.verwacht).toBeCloseTo(145.5, 2);
  });

  test('meer dan verwacht krijgt het andere teken en wordt netto verrekend', async ({ page }) => {
    await boot(page, {});
    await tel(page, 400);
    await tel(page, 430);
    const r = await page.evaluate(() => {
      const rij = TX.filter((t) => t.src === 'contant');
      return { bedrag: rij[0].amount, byCat: Math.round(-(totals(months()[months().length - 1]).byCat.contant || 0)) };
    });
    expect(r.bedrag).toBeCloseTo(30, 2);
    expect(r.byCat).toBe(-30);
  });

  test('de identiteit: wat je nu hebt plus wat je contant uitgaf, is je eerste telling plus alles wat je daarna pinde', async ({ page }) => {
    await boot(page, {});
    await tel(page, 400);                                   // eerste telling: 400 in de zak
    await page.evaluate(() => { gisterenTellen(); pinVandaag(100); });   // telling naar gisteren, en vandaag opnieuw pinnen
    await tel(page, 310);                                   // verwacht 500, geteld 310 → 190 uitgegeven
    const r = await page.evaluate(() => ({
      stand: contantTelling().stand,
      uitgegeven: TX.filter((t) => t.src === 'contant').reduce((a, t) => a - t.amount, 0),
      eerste: 400,
      gepindNa: 100,
    }));
    expect(r.uitgegeven).toBeCloseTo(190, 2);
    expect(r.stand + r.uitgegeven).toBeCloseTo(r.eerste + r.gepindNa, 2);
  });

  test('opnieuw tellen op dezelfde dag vervangt de boeking en zet er geen tweede bij', async ({ page }) => {
    await boot(page, {});
    await tel(page, 400);
    await tel(page, 300);
    await tel(page, 250);
    const r = await page.evaluate(() => {
      const rij = TX.filter((t) => t.src === 'contant');
      return { n: rij.length, bedrag: rij[0] && rij[0].amount, stand: contantTelling().stand };
    });
    expect(r.n).toBe(1);
    expect(r.bedrag).toBeCloseTo(-150, 2);   // één boeking, maar wel de volle 400 → 250
    expect(r.stand).toBe(250);
  });

  test('een opname op de teldag zelf telt niet nog eens bovenop je telling', async ({ page }) => {
    await boot(page, {});
    await page.evaluate(() => pinVandaag(80));
    await tel(page, 480);   // je telt NA het pinnen, dus die 80 zit er al in
    expect(await page.evaluate(() => contantVerwacht())).toBe(480);
  });
});

test.describe('contant is geenNorm en geen potje', () => {
  test('de boeking telt in je maandtotaal en niet tegen je potjes', async ({ page }) => {
    await boot(page, {});
    const voor = await page.evaluate(() => { const t = totals(months()[months().length - 1]); return { spend: Math.round(t.spend), norm: Math.round(t.spendNorm), buiten: Math.round(t.buitenNorm) }; });
    await tel(page, 400);
    await tel(page, 150);
    const na = await page.evaluate(() => { const t = totals(months()[months().length - 1]); return { spend: Math.round(t.spend), norm: Math.round(t.spendNorm), buiten: Math.round(t.buitenNorm) }; });
    expect(na.spend).toBe(voor.spend + 250);
    expect(na.norm).toBe(voor.norm);                 // niet tegen je budget
    expect(na.buiten).toBe(voor.buiten + 250);
  });

  test('de coachlaag vraagt niet om een potje voor contant', async ({ page }) => {
    await boot(page, {});
    await tel(page, 400);
    await tel(page, 20);   // 380 contant uitgegeven: veruit de grootste losse post
    const r = await page.evaluate(() => {
      const m = months()[months().length - 1];
      const veilig = (f) => { try { return f(); } catch (_) { return null; } };
      return {
        leak: veilig(() => { const l = coachLeak(m); return l && l.cat; }),
        week: veilig(() => coachWeekRisk(m).txt),
        eerstePot: veilig(() => { const c = coFirstPotCat(m); return c && c.cat; }),
        regels: veilig(() => coachRuleOptions(m).map((o) => o.key)) || [],
        pick: veilig(() => { openPotjePick(); return document.querySelector('#sheet').innerText; }) || '',
      };
    });
    expect(r.leak).not.toBe('contant');
    expect(r.week || '').not.toMatch(/contant/i);
    expect(r.eerstePot).not.toBe('contant');
    expect(r.regels).not.toContain('cut_contant');
    expect(r.pick).not.toMatch(/Contant/);
  });
});

test.describe('wanneer de app vraagt te tellen', () => {
  test('nog nooit geteld en wel gepind: eerste', async ({ page }) => {
    await boot(page, {});
    expect(await page.evaluate(() => contantVraagt())).toBe('eerste');
  });

  test('geteld en daarna gepind: gepind', async ({ page }) => {
    await boot(page, {});
    await tel(page, 400);
    /* De telling gaat een dag terug voordat er opnieuw gepind wordt. Dat is geen kunstgreep om de
       test groen te krijgen maar de regel zelf: contantVerwacht() telt alleen opnames NÁ de teldag,
       want je telt op het moment dat je pint en dan zit dat briefje al in je telling. Een opname op
       de teldag zelf vraagt dus niets, en dat toetst de test hierboven. */
    await page.evaluate(() => { gisterenTellen(); pinVandaag(60); });
    expect(await page.evaluate(() => contantVraagt())).toBe('gepind');
  });

  test('geteld vandaag en niets gepind: de app zwijgt', async ({ page }) => {
    await boot(page, {});
    await tel(page, 400);
    expect(await page.evaluate(() => contantVraagt())).toBe('');
    expect(await page.evaluate(() => contantKaart())).toBe('');
  });

  test('een telling van vorige maand vraagt in de eerste week opnieuw, een van deze maand niet', async ({ page }) => {
    /* Zonder opname in de fixture, anders vuurt de gepind-tak en toetst deze test iets anders.
       De maand-tak eist een telling van VÓÓR deze maand. Op 'ouder dan vandaag' vroeg hij elke dag
       van de eerste week opnieuw zodra je op dag 1 geteld had, en dat is precies het zeuren dat
       'niet dagelijks' moest uitsluiten. verseStart() wordt hier vervangen omdat de suite op elke
       dag van de maand moet kunnen draaien; de echte functie heeft zijn eigen test bij v195. */
    await boot(page, { opname: false });
    await tel(page, 400);
    const r = await page.evaluate(() => {
      const echt = window.verseStart;
      const meet = (datum, week) => { window.verseStart = () => week; SET.contant.datum = datum; save(); return contantVraagt(); };
      const d = new Date(); d.setDate(0);                       // laatste dag van vorige maand
      const uit = {
        dezeMaand: meet(thisYM() + '-01', true),
        vorigeMaand: meet(ymdVan(d), true),
        buitenDeEersteWeek: meet(ymdVan(d), false),
      };
      window.verseStart = echt;
      return uit;
    });
    expect(r.dezeMaand).toBe('');
    expect(r.vorigeMaand).toBe('maand');
    expect(r.buitenDeEersteWeek).toBe('');
  });

  test('nooit gepind en nooit geteld: geen kaart en geen vraag', async ({ page }) => {
    await boot(page, { opname: false });
    expect(await page.evaluate(() => contantVraagt())).toBe('');
    expect(await page.evaluate(() => contantKaart())).toBe('');
  });

  test('de kaart staat op Grip en draagt spiegel, gevolg en keuze', async ({ page }) => {
    await boot(page, {});
    await page.evaluate(() => { go('maand'); });
    const r = await page.evaluate(() => {
      const el = document.querySelector('#s-maand');
      return { tekst: el.innerText, tik: /contantTellen\(\)/.test(el.innerHTML) };
    });
    expect(r.tekst).toMatch(/contant/i);         // de hlabel staat in kapitalen via CSS
    expect(r.tekst).toMatch(/€\s?400/);          // spiegel: het gemeten bedrag
    expect(r.tekst).toMatch(/in je zak/);        // gevolg
    expect(r.tik).toBe(true);                    // keuze: de enige handeling die er is
  });
});

test.describe('de ouderdom is de voorwaarde', () => {
  test('een telling van vandaag krijgt geen melding, een oudere wel', async ({ page }) => {
    await boot(page, {});
    await tel(page, 400);
    expect(await page.evaluate(() => contantOuderdom())).toBe(0);
    expect(await page.evaluate(() => contantOpbouwRegel())).not.toMatch(/dagen geleden|gisteren/);
    await page.evaluate(() => {
      const d = new Date(); d.setDate(d.getDate() - 9);
      SET.contant.datum = ymdVan(d); save();
    });
    expect(await page.evaluate(() => contantOuderdom())).toBe(9);
    expect(await page.evaluate(() => contantOpbouwRegel())).toMatch(/9 dagen geleden/);
  });

  test('de opbouw van veilig te besteden noemt het contante deel met een tik naar het telscherm', async ({ page }) => {
    await boot(page, {});
    await tel(page, 400);
    const r = await page.evaluate(() => { openSafeToSpend(); const s = document.querySelector('#sheet'); return { tekst: s.innerText, html: s.innerHTML }; });
    expect(r.tekst).toMatch(/Waarvan contant/);
    expect(r.tekst).toMatch(/€\s?400/);
    expect(r.html).toMatch(/contantTellen\(\)/);
    expect(r.tekst).toMatch(/je rekeningen en je contante geld/);
  });
});

test.describe('de poort kan niet uit de pas lopen met RULES', () => {
  /* Een woord in OPNAME_KW dat niet in de intern-rij van RULES staat is dood: isOpnameTx() eist
     catOf(t)==='intern', en categorize() zet zo'n boeking op 'overig'. Gemeten toen 'GEA BETAALPAS'
     zonder komma er nog bij stond: nul treffers, terwijl de lijst suggereerde dat hij vuurde.
     Deze test leest de bron, zodat een woord dat er ooit bij komt niet stil dood staat. */
  test('elk woord in OPNAME_KW staat ook in de intern-rij van RULES', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
      const rij = RULES.find((x) => x[0] === 'intern')[1].map((w) => w.toUpperCase());
      return { kw: OPNAME_KW.slice(), mist: OPNAME_KW.filter((w) => !rij.includes(w.toUpperCase())) };
    });
    expect(r.kw.length).toBeGreaterThan(0);
    expect(r.mist, `deze woorden kunnen nooit vuren: ${r.mist.join(', ')}`).toEqual([]);
  });

  test('een woord uit de intern-rij dat geen automaat is, is ook geen opname', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => OPNAME_KW.filter((w) => /REVOLUT|WISE|N26|PRIVEREKENING|WESTERN|TIKKIE/i.test(w)));
    expect(r).toEqual([]);
  });
});

test.describe('de regels onder de stand-kaart op Inzichten', () => {
  /* v258: één regel per geenNorm-categorie in plaats van één opgetelde regel met één tik.
     GEMETEN op 360x640 en 390x844: elke regel is 18px hoog, de stand-kaart gaat van 167 naar 190px
     met twee categorieën, en de pagina van 700 naar 723px. v241 houdt die kaart onder de 200px, dus
     een DERDE geenNorm-categorie zou hem op 213px zetten en die eis breken. Dat is geen probleem
     vandaag en wel de grens: komt er ooit een derde, dan is de vorm van dit blok de vraag en niet
     het blok eronder. */
  for (const [w, h] of [[360, 640], [390, 844]]) {
    test(`${w}x${h} · elke categorie krijgt zijn eigen regel, zijn eigen bedrag en zijn eigen tik`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await boot(page, { extra: [{ id: 'sleep', day: '18', amount: -497, naam: 'Sleepbedrijf', desc: 'BEA, BETAALPAS SLEEPBEDRIJF' }] });
      await page.evaluate(() => { const t = TX.find((x) => /Sleepbedrijf/.test(x.name)); OVR[t.id] = 'onvoorzien'; save(); });
      await tel(page, 400);
      await tel(page, 150);
      await page.evaluate(() => { render(); go('ins'); });
      const r = await page.evaluate(() => {
        const rij = [...document.querySelectorAll('#s-ins [onclick^="openCategory"]')].map((e) => ({
          tekst: e.innerText.trim(), tik: e.getAttribute('onclick'), h: Math.round(e.getBoundingClientRect().height) }));
        const kaart = document.querySelector('#s-ins .card');
        return { rij, buitenNorm: Math.round(totals(kijkMaand()).buitenNorm), kaartH: Math.round(kaart.getBoundingClientRect().height) };
      });
      expect(r.rij.length).toBe(2);
      // de tik komt uit op het bedrag waarop je tikte (v254), en de maand gaat mee
      expect(r.rij[0].tekst).toMatch(/€\s?497 onvoorzien/);
      expect(r.rij[0].tik).toMatch(/openCategory\('onvoorzien','\d{4}-\d{2}'\)/);
      expect(r.rij[1].tekst).toMatch(/€\s?250 contant/);
      expect(r.rij[1].tik).toMatch(/openCategory\('contant','\d{4}-\d{2}'\)/);
      // de regels tellen per constructie op tot buitenNorm: één bron (v104/v169)
      const som = r.rij.reduce((a, x) => a + +(x.tekst.match(/\d[\d.]*/)[0].replace(/\./g, '')), 0);
      expect(som).toBe(r.buitenNorm);
      for (const x of r.rij) expect(x.h).toBe(18);
      expect(r.kaartH).toBeLessThan(200);   // v241 houdt de stand-kaart onder de 200px
    });
  }

  test('een categorie zonder uitgaven krijgt geen regel', async ({ page }) => {
    await boot(page, {});   // wel een opname, maar nog niets contant uitgegeven en geen onvoorzien
    await page.evaluate(() => { render(); go('ins'); });
    expect(await page.evaluate(() => document.querySelectorAll('#s-ins [onclick^="openCategory"]').length)).toBe(0);
  });
});

test.describe('stoppen zet alles terug', () => {
  test('een tik terug, en de gemeten historie blijft staan', async ({ page }) => {
    await boot(page, {});
    const voor = await page.evaluate(() => totalBalance().sum);
    await tel(page, 400);
    await tel(page, 250);
    await page.evaluate(() => contantStoppen());
    const r = await page.evaluate(() => ({
      saldo: totalBalance().sum, verwacht: contantVerwacht(), telling: contantTelling(),
      boekingen: TX.filter((t) => t.src === 'contant').length,
    }));
    expect(r.saldo).toBe(voor);
    expect(r.verwacht).toBeNull();
    expect(r.telling).toBeNull();
    expect(r.boekingen).toBe(1);   // wat je gemeten hebt gooi je niet weg
  });
});
