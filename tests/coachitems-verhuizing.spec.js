// v143 deel A: de vier regels uit coachItems() die nergens anders bestonden zijn verhuisd naar de
// signalen-engine, zodat ze niet stil verdwijnen als s-act wordt opgeheven. Dit is een
// verplaatsing: dezelfde drempels, dezelfde teksten, dezelfde acties. coachItems() blijft in deel A
// staan, dus deze spec toetst per regel dat de oude en de nieuwe bron hetzelfde melden.
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
const items = (page) => page.evaluate(() => coachItems());

test.describe('a · regel 1: spaarstortingen tellen als uitgave', () => {
  const fixture = () => bouw((s, tx) => {
    for (const m of [M2, M1]) boek(tx, m, '10', -150, 'Monthly Rule', 'BEA, BETAALPAS');
  });

  test('vuurt op dezelfde drempel en met dezelfde tekst als coachItems', async ({ page }) => {
    await boot(page, fixture());
    const n = await sig(page, 'savrules');
    const oud = (await items(page)).find((i) => i.insight === 'Je spaarstortingen tellen als uitgave');
    expect(oud).toBeTruthy();
    expect(n).toBeTruthy();
    expect(n.l1).toBe(oud.insight);
    expect(n.l2).toBe(oud.context);
    expect(n.act).toBe(oud.fn);
    expect(n.t).toBe(oud.t);
  });

  test('onder de drempel van twee boekingen vuurt geen van beide', async ({ page }) => {
    await boot(page, bouw((s, tx) => { boek(tx, M1, '10', -150, 'Monthly Rule', 'BEA, BETAALPAS'); }));
    expect(await sig(page, 'savrules')).toBeNull();
    expect((await items(page)).some((i) => i.insight === 'Je spaarstortingen tellen als uitgave')).toBe(false);
  });
});

test.describe('b · regel 2: meevaller-afhankelijkheid', () => {
  // een maand met een flinke meevaller naast de gewone maanden, en te weinig overgehouden
  const fixture = () => bouw((s, tx) => {
    boek(tx, M1, '06', 4000, 'Bonus', 'EXTRA UITKERING');
    for (const m of [M2, M1]) boek(tx, m, '14', -1200, 'Diverse', 'BEA, BETAALPAS DIVERSE');
    s.savingAmount = 900;
  });

  test('dezelfde voorwaarde en dezelfde tekst als coachItems', async ({ page }) => {
    await boot(page, fixture());
    const oud = (await items(page)).find((i) => i.insight === 'Zonder meevaller spaar je te weinig');
    const n = await sig(page, 'meevaller');
    if (!oud) { expect(n).toBeNull(); return; }          // vuurt de oude niet, dan de nieuwe ook niet
    expect(n).toBeTruthy();
    expect(n.l1).toBe(oud.insight);
    expect(n.l2).toBe(oud.context);
    expect(n.act).toBe(oud.fn);
    expect(n.t).toBe(oud.t);
  });
});

test.describe('c · regel 3: lifestyle inflation', () => {
  const fixture = () => bouw((s, tx) => {
    boek(tx, M1, '06', 4000, 'Bonus', 'EXTRA UITKERING');
    boek(tx, M1, '15', -1500, 'Diverse', 'BEA, BETAALPAS DIVERSE');   // in de meevallermaand meer uitgegeven
  });

  test('dezelfde voorwaarde en dezelfde tekst als coachItems', async ({ page }) => {
    await boot(page, fixture());
    const oud = (await items(page)).find((i) => i.insight === 'Meer binnen, meer uitgegeven');
    const n = await sig(page, 'inflatie');
    if (!oud) { expect(n).toBeNull(); return; }
    expect(n).toBeTruthy();
    expect(n.l1).toBe(oud.insight);
    expect(n.l2).toBe(oud.context);
    expect(n.act).toBe(oud.fn);
    expect(n.t).toBe(oud.t);
  });
});

test.describe('d · regel 4: twee maanden op rij boven budget', () => {
  const fixture = () => bouw((s, tx) => {
    for (const m of [M2, M1]) boek(tx, m, '16', -3000, 'Diverse', 'BEA, BETAALPAS DIVERSE');
  });

  test('dezelfde drempel en dezelfde tekst als coachItems', async ({ page }) => {
    await boot(page, fixture());
    const oud = (await items(page)).find((i) => i.insight === 'Je geeft al maanden te veel uit');
    const n = await sig(page, 'overstreak');
    expect(oud).toBeTruthy();
    expect(n).toBeTruthy();
    expect(n.l1).toBe(oud.insight);
    expect(n.l2).toBe(oud.context);
    expect(n.act).toBe(oud.fn);
    expect(n.t).toBe(oud.t);
  });

  test('één maand boven budget is niet genoeg', async ({ page }) => {
    await boot(page, bouw((s, tx) => { boek(tx, M1, '16', -3000, 'Diverse', 'BEA, BETAALPAS DIVERSE'); }));
    expect(await sig(page, 'overstreak')).toBeNull();
    expect((await items(page)).some((i) => i.insight === 'Je geeft al maanden te veel uit')).toBe(false);
  });
});

test.describe('e · de vier verhuizingen samen', () => {
  test('elke verhuisde regel die vuurt, meldt hetzelfde als zijn oude versie', async ({ page }) => {
    await boot(page, bouw((s, tx) => {
      for (const m of [M2, M1]) { boek(tx, m, '10', -150, 'Monthly Rule', 'BEA, BETAALPAS'); boek(tx, m, '16', -3000, 'Diverse', 'BEA, BETAALPAS DIVERSE'); }
      boek(tx, M1, '06', 4000, 'Bonus', 'EXTRA UITKERING');
    }));
    const paren = [['savrules', 'Je spaarstortingen tellen als uitgave'], ['meevaller', 'Zonder meevaller spaar je te weinig'],
      ['inflatie', 'Meer binnen, meer uitgegeven'], ['overstreak', 'Je geeft al maanden te veel uit']];
    const oud = await items(page);
    for (const [key, insight] of paren) {
      const o = oud.find((i) => i.insight === insight);
      const n = await sig(page, key);
      expect(!!n).toBe(!!o);                                     // beide vuren, of geen van beide
      if (o) { expect(n.l1).toBe(o.insight); expect(n.l2).toBe(o.context); expect(n.act).toBe(o.fn); }
    }
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

  test('coachOff zet ze allemaal uit, net als in coachItems', async ({ page }) => {
    await boot(page, bouw((s, tx) => {
      for (const m of [M2, M1]) boek(tx, m, '10', -150, 'Monthly Rule', 'BEA, BETAALPAS');
      s.coachOff = true;
    }));
    expect(await sig(page, 'savrules')).toBeNull();
    expect(await items(page)).toEqual([]);
  });
});

test.describe('f · deel A sloopt nog niets', () => {
  // v165: coachFocus() en nextTip() zijn weg. Dat kon omdat alle vijf regels een thuis hebben:
  // vier in de signalen-engine en regel 5 in coachRuleOptions(). coachItems() blijft, want
  // renderBehavior() leest hem nog; s-act zelf staat er tot deel B.
  test('s-act en coachItems staan er nog, coachFocus en nextTip niet meer', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => ({
      sact: !!document.querySelector('#s-act'),
      focus: typeof coachFocus, tip: typeof nextTip, items: typeof coachItems,
      opties: typeof coachRuleOptions,
      nav: !!document.querySelector('.nav a[data-go="act"]'),
    }))).toEqual({ sact: true, focus: 'undefined', tip: 'undefined', items: 'function',
      opties: 'function', nav: true });
  });

  test('regel 5 en de fallback zijn bewust niet verhuisd', async ({ page }) => {
    await boot(page);
    const keys = await page.evaluate(() => (scoreNotifs() || []).map((n) => n.key));
    expect(keys.some((k) => /hefboom|grootste-knop|opkoers/.test(k))).toBe(false);
    // de fallback zei "Je zit op koers"; die zin bestaat al als positieve noot 'room'
    const room = await page.evaluate(() => (scoreNotifs() || []).find((n) => n.key === 'room') || null);
    if (room) expect(room.l1).toMatch(/op koers/i);
  });
});
