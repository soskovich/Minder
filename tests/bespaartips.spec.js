// Bespaartips (v81): elke tip draagt context (het getal erachter), een concrete actie,
// het bedrag per maand én per jaar, en — waar het te rekenen valt — het effect op je doel.
// Geen budget-/doelrekenlogica geraakt; dit toetst de tip-inhoud en de drie kanalen.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, MAIN } = require('./budget-fixture');

// veel kleine aankopen + een piekdag, zodat tip_small en tip_peak vuren
function tipsSeed({ goal = true } = {}) {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  const set = JSON.parse(p.minder_set);
  const add = (id, day, amount, name, desc) =>
    tx.push({ id, date: `${CUR}-${day}`, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  // acht losse aankopen onder €15, verspreid maar met een zwaartepunt
  for (let i = 0; i < 8; i++) add('kl' + i, String(3 + i).padStart(2, '0'), -12, 'Kiosk', 'BEA, BETAALPAS KIOSK');
  if (!goal) { set.savingMode = 'amount'; set.savingAmount = 0; set.nfMaanden = 0; }
  p.minder_tx = JSON.stringify(tx);
  p.minder_set = JSON.stringify(set);
  return p;
}

async function boot(page, payload) {
  await open(page, payload || tipsSeed());
  await page.waitForFunction(() => typeof goalCoachTips === 'function');
}

const tips = (page) => page.evaluate((m) => goalCoachTips(m), CUR);

test.describe('a · elke tip is een compleet advies', () => {
  test('context met een getal, concrete actie, €/mnd én €/jaar', async ({ page }) => {
    await boot(page);
    const T = await tips(page);
    expect(T.length).toBeGreaterThan(0);
    for (const t of T) {
      expect(t.context, t.key).toMatch(/\d/);                          // het getal erachter
      expect(t.context, t.key).toMatch(/€|%|abonnementen|aankopen/);
      expect(t.action, t.key).toBeTruthy();
      expect(t.action, t.key).toMatch(/^(Doe|Loop|Houd|Zet|Bundel)/);  // werkwoord voorop
      expect(t.action.length, t.key).toBeGreaterThan(20);              // een norm, geen label
      expect(t.perYear, t.key).toBe(t.save * 12);
      expect(t.save, t.key).toBeGreaterThan(0);
    }
  });

  test('de kleine-aankopen-tip noemt het aantal én de som, met een toetsbare afspraak', async ({ page }) => {
    await boot(page);
    const t = (await tips(page)).find((x) => x.key === 'tip_small');
    expect(t).toBeTruthy();
    const feit = await page.evaluate((m) => {
      const s = txOfMonth(m).filter((x) => x.amount < 0 && CATS[catOf(x)] && CATS[catOf(x)].type === 'expense' && !isFixed(x) && (-x.amount) <= 15);
      return { n: s.length, som: Math.round(s.reduce((a, x) => a - x.amount, 0)) };
    }, CUR);
    expect(t.context).toContain(`${feit.n} kleine aankopen`);
    expect(t.context).toContain(String(feit.som));                     // de som staat erbij
    expect(t.action).toMatch(/één vast moment per week/i);
  });

  test('de piekdag-tip noemt bedrag, aandeel én een norm per dag', async ({ page }) => {
    await boot(page);
    const t = (await tips(page)).find((x) => x.key === 'tip_peak');
    if (!t) test.skip(true, 'geen piekdag in deze fixture');
    expect(t.context).toMatch(/€[\d.]+ op \w+en/);                     // "€138 op maandagen"
    expect(t.context).toMatch(/\d+% van je losse uitgaven/);
    expect(t.context).toMatch(/gemiddelde andere dag/);
    expect(t.action).toMatch(/^Houd één \w+ per week onder €[\d.]+\.$/); // werkwoord + norm
  });
});

test.describe('b · scenario per tip', () => {
  test('effect is per tip berekend en klopt met de rekenwijze van het doel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const S = savingsModel(); const toGo = Math.max(S.goal - S.cur, 0);
      const t = goalCoachTips(m).find((x) => x.effect);
      if (!t) return null;
      return { eff: t.effect, save: t.save,
               base: Math.ceil(toGo / S.monthlySaving), nw: Math.ceil(toGo / (S.monthlySaving + t.save)) };
    }, CUR);
    expect(r).not.toBeNull();
    expect(r.eff.base).toBe(r.base);
    expect(r.eff.nw).toBe(r.nw);
    expect(r.eff.eerder).toBe(Math.max(r.base - r.nw, 0));
    if (r.eff.eerder >= 1) {
      expect(r.eff.kort).toMatch(/^~\d+ maand(en)? eerder$/);          // naast het bedrag
      expect(r.eff.txt).toMatch(/~\d+ maand(en)? eerder, klaar rond [a-z]{3,4} \d{4}/);
      expect(r.eff.vergelijk).toMatch(/^Zonder: klaar .+ · met deze stap: .+ \(\d+ maand(en)? eerder\)$/);
    } else {
      expect(r.eff.kort).toBe('kleine stap, klein effect');            // eerlijk, geen belofte
      expect(r.eff.txt).toBe('kleine stap, klein effect');
      expect(r.eff.vergelijk).toBe('');
    }
  });

  test('zonder doel of tempo blijft het scenario weg, de rest staat er wel', async ({ page }) => {
    await boot(page, tipsSeed({ goal: false }));
    const geen = await page.evaluate(() => { const S = savingsModel(); return !(S.goal > 0) || !(S.monthlySaving > 0); });
    if (!geen) test.skip(true, 'deze fixture heeft nog wel een doel');
    const T = await tips(page);
    expect(T.length).toBeGreaterThan(0);
    for (const t of T) {
      expect(t.effect, t.key).toBeNull();
      expect(t.context, t.key).toMatch(/\d/);                          // context en actie blijven
      expect(t.action, t.key).toBeTruthy();
      expect(t.perYear, t.key).toBe(t.save * 12);
    }
    expect(await page.evaluate(() => tipEffect(50))).toBeNull();
  });

  test('geen loze belofte: nergens "gegarandeerd" of "zeker weten"', async ({ page }) => {
    await boot(page);
    const alles = await page.evaluate((m) => goalCoachTips(m).map((t) => [t.context, t.action, t.effect ? t.effect.txt : ''].join(' ')).join(' | '), CUR);
    expect(alles).not.toMatch(/gegarandeerd|zeker weten|altijd|beloof/i);
    expect(alles).toMatch(/~|rond|op dit tempo|kleine stap/);          // onzekerheid blijft benoemd
  });
});

test.describe('c · de kanalen dragen context, actie en scenario', () => {
  // v160: de tip-kaart (goalCoachCard) is verwijderd. Hij bouwde deze weergave nog wel, maar werd
  // sinds v80 nergens meer gerenderd. De drie kanalen die je wel ziet - de melding, het
  // coach-onderwerp en de Rustig-variant - staan hieronder en dekken dezelfde tips.

  test('de melding noemt de concrete stap en het effect', async ({ page }) => {
    await boot(page);
    const sf = await page.evaluate(() => saveFasterTip());
    expect(sf).not.toBeNull();
    expect(sf.action).toBeTruthy();
    expect(sf.perYear).toBe(sf.save * 12);
    if (sf.earlier >= 1) {
      const n = await page.evaluate(() => scoreNotifs().find((x) => x.key.startsWith('savefaster-')));
      if (n) {
        expect(n.l1).toBe(sf.action);
        expect(n.l2).toMatch(/\/jr\)/);
        expect(n.l2).toMatch(/~\d+ maand(en)? eerder, rond [a-z]{3,4} \d{4}/);
      }
    }
  });

  test('het coach-onderwerp Bespaartips vertelt context, actie, bedrag en scenario', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('act'); startCoachTalk(); });
    await page.waitForSelector('#s-act .coachhead');
    await page.evaluate(() => coTopic('tips', curMonth || months()[months().length - 1]));
    await page.waitForFunction(() => /per jaar/.test(document.getElementById('coThr').innerText), null, { timeout: 15000 });
    const T = await tips(page);
    const txt = await page.locator('#coThr').innerText();

    expect(txt).toContain(T[0].action);                                // de concrete stap
    expect(txt).toMatch(/\d+ kleine aankopen|€\d/);                    // context met een getal
    expect(txt).toMatch(/per jaar/);                                   // horizon
    if (T[0].effect && T[0].effect.eerder >= 1) expect(txt).toMatch(/eerder/);
    // de keuze legt de stap vast
    await page.waitForFunction(() => [...document.querySelectorAll('#coCh .cch')].some((b) => /leg vast/i.test(b.innerText)), null, { timeout: 15000 });
  });

  test('in Rustig is dezelfde tip korter, met dezelfde bedragen', async ({ page }) => {
    await boot(page);
    const T = await tips(page);
    await page.evaluate(() => { SET.mode = 'rustig'; save(); go('act'); startCoachTalk(); });
    await page.waitForSelector('#s-act .coachhead');
    await page.evaluate(() => coTopic('tips', curMonth || months()[months().length - 1]));
    await page.waitForFunction(() => /\/mnd/.test(document.getElementById('coThr').innerText), null, { timeout: 15000 });
    const r = await page.locator('#coThr').innerText();
    expect(r).toContain(await page.evaluate((v) => euro0(v), T[0].save));  // bedrag identiek
    expect(r).not.toMatch(/per jaar/);                                    // korter: geen jaarcijfer
    expect(r).not.toContain(T[0].context.replace(/<[^>]+>/g, ''));        // en zonder het contextblok
  });
});
