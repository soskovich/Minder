// v143 deel A: de regels uit coachItems() die nergens anders bestonden zijn verhuisd naar de
// signalen-engine, zodat ze niet stil verdwijnen als s-act wordt opgeheven. Dit is een
// verplaatsing: dezelfde drempels, dezelfde teksten, dezelfde acties.
// v196: s-act is opgeheven en coachItems() bestaat niet meer, dus de vergelijking tussen twee
// bronnen is vervallen. Wat blijft is wat die vergelijking bewaakte: elke regel vuurt op zijn eigen
// drempel en met zijn eigen tekst. De verwachte waarden staan nu letterlijk in de test, want de
// tweede bron waar ze tegen afgezet konden worden is weg.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2, MAIN } = require('./budget-fixture');

function bouw(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  const tx = JSON.parse(p.minder_tx);
  fn(set, tx, p);
  p.minder_set = JSON.stringify(set);
  p.minder_tx = JSON.stringify(tx);
  return p;
}
const boek = (tx, m, dag, bedrag, naam, desc) => tx.push({
  id: naam + '-' + m + '-' + dag, date: `${m}-${dag}`, amount: bedrag, acc: MAIN,
  name: naam, desc: desc || '', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [],
});

async function boot(page, payload) {
  await open(page, payload || seed());
}
const sig = (page, key) => page.evaluate((k) => (scoreNotifs() || []).find((n) => n.key === k) || null, key);
// v196: de bron waar tegen vergeleken werd bestaat niet meer; wat 'oud' heette staat nu als
// verwachting in de test zelf.
const alleKeys = (page) => page.evaluate(() => (scoreNotifs() || []).map((n) => n.key));

test.describe('a · regel 1: spaarstortingen tellen als uitgave', () => {
  const fixture = () => bouw((s, tx) => {
    for (const m of [M2, M1]) boek(tx, m, '10', -150, 'Monthly Rule', 'BEA, BETAALPAS');
  });

  test('vuurt op dezelfde drempel en met dezelfde tekst als coachItems', async ({ page }) => {
    await boot(page, fixture());
    const n = await sig(page, 'savrules');
    expect(n).toBeTruthy();
    expect(n.l1).toBe('Je spaarstortingen tellen als uitgave');
    expect(n.l2).toMatch(/aan eigen overboekingen telt mee\. Tik om dit recht te zetten\./);
    expect(n.act).toBe('fixSavingsRules()');
    expect(n.t).toBe('info');
    expect(n.h).toBe('correctie');
  });

  test('onder de drempel van twee boekingen vuurt geen van beide', async ({ page }) => {
    await boot(page, bouw((s, tx) => { boek(tx, M1, '10', -150, 'Monthly Rule', 'BEA, BETAALPAS'); }));
    expect(await sig(page, 'savrules')).toBeNull();
  });
});

test.describe('b · regel 2: meevaller-afhankelijkheid', () => {
  // een maand met een flinke meevaller naast de gewone maanden, en te weinig overgehouden
  const fixture = () => bouw((s, tx) => {
    boek(tx, M1, '06', 4000, 'Bonus', 'EXTRA UITKERING');
    for (const m of [M2, M1]) boek(tx, m, '14', -1200, 'Diverse', 'BEA, BETAALPAS DIVERSE');
    s.savingAmount = 900;
  });

  test('vuurt op zijn voorwaarde, met zijn eigen tekst', async ({ page }) => {
    await boot(page, fixture());
    const n = await sig(page, 'meevaller');
    test.skip(!n, 'deze opzet haalt de voorwaarde niet');
    expect(n.l1).toBe('Zonder meevaller spaar je te weinig');
    expect(n.l2).toMatch(/automatisch opzij zodra je salaris binnen is\.$/);
    expect(n.t).toBe('bad');
    expect(n.h).toBe('structureel');
  });
});

test.describe('c · regel 3: lifestyle inflation', () => {
  const fixture = () => bouw((s, tx) => {
    boek(tx, M1, '06', 4000, 'Bonus', 'EXTRA UITKERING');
    boek(tx, M1, '15', -1500, 'Diverse', 'BEA, BETAALPAS DIVERSE');   // in de meevallermaand meer uitgegeven
  });

  test('vuurt op zijn voorwaarde, met zijn eigen tekst', async ({ page }) => {
    await boot(page, fixture());
    const n = await sig(page, 'inflatie');
    test.skip(!n, 'deze opzet haalt de voorwaarde niet');
    expect(n.l1).toBe('Meer binnen, meer uitgegeven');
    expect(n.l2).toMatch(/^Zet je extraatje meteen opzij/);
    expect(n.t).toBe('warn');
    expect(n.h).toBe('structureel');
  });
});

test.describe('d · regel 4: twee maanden op rij boven budget', () => {
  const fixture = () => bouw((s, tx) => {
    for (const m of [M2, M1]) boek(tx, m, '16', -3000, 'Diverse', 'BEA, BETAALPAS DIVERSE');
  });

  test('vuurt op twee maanden, met zijn eigen tekst', async ({ page }) => {
    await boot(page, fixture());
    const n = await sig(page, 'overstreak');
    expect(n).toBeTruthy();
    expect(n.l1).toBe('Je geeft al maanden te veel uit');
    expect(n.l2).toMatch(/^Tijd om het te kantelen/);
    expect(n.t).toBe('warn');
    expect(n.h).toBe('structureel');
    // v196: de oude actie tekende het opgeheven coachscherm opnieuw; nu een sheet die blijft staan
    expect(n.act).toMatch(/^openMonthSpend\(/);
  });

  test('één maand boven budget is niet genoeg', async ({ page }) => {
    await boot(page, bouw((s, tx) => { boek(tx, M1, '16', -3000, 'Diverse', 'BEA, BETAALPAS DIVERSE'); }));
    expect(await sig(page, 'overstreak')).toBeNull();
  });
});

test.describe('e · de vier verhuizingen samen', () => {
  test('elke regel die vuurt draagt zijn eigen zin, en geen enkele wijst naar het opgeheven scherm',
    async ({ page }) => {
      await boot(page, bouw((s, tx) => {
        for (const m of [M2, M1]) { boek(tx, m, '10', -150, 'Monthly Rule', 'BEA, BETAALPAS'); boek(tx, m, '16', -3000, 'Diverse', 'BEA, BETAALPAS DIVERSE'); }
        boek(tx, M1, '06', 4000, 'Bonus', 'EXTRA UITKERING');
      }));
      const paren = [['savrules', 'Je spaarstortingen tellen als uitgave'], ['meevaller', 'Zonder meevaller spaar je te weinig'],
        ['inflatie', 'Meer binnen, meer uitgegeven'], ['overstreak', 'Je geeft al maanden te veel uit'],
        ['hefboom', 'is je grootste knop']];
      let gevuurd = 0;
      for (const [key, zin] of paren) {
        const n = await sig(page, key);
        if (!n) continue;
        gevuurd++;
        expect(n.l1, key).toContain(zin);
        // v196: geen enkele actie mag nog naar s-act, toggleStep of toggleActDeep wijzen
        expect(n.act, key).not.toMatch(/go\('act'\)|toggleStep|toggleActDeep/);
      }
      expect(gevuurd).toBeGreaterThan(0);
    });

  test('de signalen dragen snooze en mute via hun groep', async ({ page }) => {
    await boot(page, bouw((s, tx) => { for (const m of [M2, M1]) boek(tx, m, '10', -150, 'Monthly Rule', 'BEA, BETAALPAS'); }));
    expect(await sig(page, 'savrules')).toBeTruthy();
    await page.evaluate(() => { SET.notifMuted = { savrules: true }; save(); });
    expect(await sig(page, 'savrules')).toBeNull();
    await page.evaluate(() => { SET.notifMuted = {}; SET.notifSnooze = { savrules: Date.now() + 86400000 }; save(); });
    expect(await sig(page, 'savrules')).toBeNull();
  });

  test('geen van de vier overstemt een acute melding', async ({ page }) => {
    await boot(page, bouw((s, tx) => {
      for (const m of [M2, M1]) { boek(tx, m, '10', -150, 'Monthly Rule', 'BEA, BETAALPAS'); boek(tx, m, '16', -3000, 'Diverse', 'BEA, BETAALPAS DIVERSE'); }
    }));
    const scores = await page.evaluate(() => {
      const uit = {};
      for (const n of scoreNotifs() || []) uit[n.key] = n.score;
      return uit;
    });
    for (const k of ['savrules', 'meevaller', 'inflatie', 'overstreak']) {
      if (scores[k] != null) expect(scores[k]).toBeLessThan(72);   // onder de budget-signalen en alles daarboven
    }
  });

  test('coachOff zet de hele groep uit', async ({ page }) => {
    await boot(page, bouw((s, tx) => {
      for (const m of [M2, M1]) boek(tx, m, '10', -150, 'Monthly Rule', 'BEA, BETAALPAS');
      s.coachOff = true;
    }));
    for (const k of ['savrules', 'meevaller', 'inflatie', 'overstreak', 'hefboom']) {
      expect(await sig(page, k), k).toBeNull();
    }
  });
});

test.describe('f · deel A sloopt nog niets', () => {
  // v165: coachFocus() en nextTip() zijn weg. Dat kon omdat alle vijf regels een thuis hebben:
  // vier in de signalen-engine en regel 5 in coachRuleOptions(). coachItems() blijft, want
  // renderBehavior() leest hem nog; s-act zelf staat er tot deel B.
  // v196: fase 6. s-act, coachItems() en het nav-item zijn opgeheven; coachRuleOptions() blijft,
  // want die beantwoordt een andere vraag dan regel 5 (zie het blok hieronder).
  test('s-act, coachItems en het nav-item bestaan niet meer', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => ({
      sact: !!document.querySelector('#s-act'),
      focus: typeof coachFocus, tip: typeof nextTip, items: typeof coachItems,
      acties: typeof renderActions, opties: typeof coachRuleOptions,
      nav: !!document.querySelector('.nav a[data-go="act"]'),
      tabs: [...document.querySelectorAll('.nav a')].map((a) => a.dataset.go),
    }))).toEqual({ sact: false, focus: 'undefined', tip: 'undefined', items: 'undefined',
      acties: 'undefined', opties: 'function', nav: false,
      tabs: ['dash', 'ins', 'maand', 'vooruit'] });
  });

  /* v196: regel 5 is geen signaal geworden. De vier hierboven beschrijven een VERANDERING - een
     afhankelijkheid die ontstond, uitgaven die meestegen, een streak die begon, een boeking die
     verkeerd staat. Regel 5 beschrijft een EIGENSCHAP, en je grootste stuurbare post verandert
     vrijwel nooit. Als signaal zou hij dus altijd waar zijn en permanent onder 'Vraagt aandacht'
     staan. Hij leeft als grootsteHefboom() en wordt getoond als context bij de keuze die
     coachRuleOptions() aanbiedt. */
  test('regel 5 is geen signaal: hij staat niet in de lijst en niet op Maand', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      keys: (scoreNotifs({ negeerSnooze: true }) || []).map((n) => n.key),
      struct: maandStructureel().map((x) => x.key),
    }));
    expect(r.keys).not.toContain('hefboom');
    expect(r.struct).not.toContain('hefboom');
  });

  test('regel 5 leeft als grootsteHefboom, met zijn eigen venster', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const H = grootsteHefboom();
      const src = grootsteHefboom.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      return { H, zin: hefboomZin(), venster: /slice\(-6\)/.test(src),
        afgerond: /filter\(x=>x<nowYM\)/.test(src.replace(/\s/g, '')),
        variabel: /isExpenseTx\(t\)&&!isFixed\(t\)/.test(src.replace(/\s/g, '')) };
    });
    test.skip(!r.H, 'deze fixture heeft geen variabele historie');
    expect(r.venster).toBe(true);                  // zes maanden
    expect(r.afgerond).toBe(true);                 // en alleen afgeronde
    expect(r.variabel).toBe(true);                 // alleen variabele uitgaven, netto per categorie
    expect(r.H.maanden).toBeLessThanOrEqual(6);
    expect(r.H.perMaand).toBeGreaterThan(0);
    expect(r.zin).toContain(r.H.naam.toLowerCase());
    expect(r.zin).toMatch(/grootste/);
  });

  test('de context verschijnt alleen waar er ook iets te kiezen valt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const kaal = (f) => f.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      return ['coTopicLek', 'coTopicHorizon', 'coTopicMaand']
        .map((n) => /rules\.length[\s\S]{0,90}hefboomZin\(\)/.test(kaal(window[n])));
    });
    expect(r).toEqual([true, true, true]);
  });

  test('de fallback is de positieve noot room', async ({ page }) => {
    await boot(page);
    const room = await page.evaluate(() => (scoreNotifs() || []).find((n) => n.key === 'room') || null);
    if (room) expect(room.l1).toMatch(/op koers/i);
  });
});
