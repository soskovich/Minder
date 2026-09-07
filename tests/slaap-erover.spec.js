// v205: boven SET.slaapDrempel (standaard 100) stelt de koopcheck voor om er een nacht over te
// slapen, VOOR de uitkomst en voor elke som. Staat de uitkomst er al, dan is de beslissing gevallen
// en is slapen een formaliteit. De keuze blijft bij de gebruiker: parkeren tot morgen, of meteen de
// uitkomst zien. Parkeren gebruikt de bestaande entry {type:'beslis', uitkomst:'geparkeerd'}, dus
// coParkDue()/coParkReturn() brengen hem terug via het bestaande signaal park-<ts>. "Toch nu zien"
// schrijft niets, anders zou die aankoop morgen terugkomen terwijl je hem al hebt afgerond.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

// boodschappen: potje 800, deze maand 300 uitgegeven, dus 500 ruimte. Drempel default 100.
const OP_DE_DREMPEL = 100;
const ERBOVEN = 101;

const draad = (page) => page.evaluate(() => (document.getElementById('coThr') || {}).innerText || '');
const log = (page) => page.evaluate(() => (SET.coachLog || []).filter((l) => l.type === 'beslis'));
const wachtZin = (page, txt) => page.waitForFunction(
  (t) => { const e = document.getElementById('coThr'); return !!e && e.innerText.indexOf(t) >= 0; }, txt, { timeout: 15000 });
const wachtKeuze = (page, txt) => page.waitForFunction(
  (t) => [...document.querySelectorAll('#coCh .cch')].some((b) => b.innerText.indexOf(t) >= 0), txt, { timeout: 15000 });
async function kies(page, txt) {
  await wachtKeuze(page, txt);
  await page.locator('#coCh .cch', { hasText: txt }).first().click();
}
const keuzes = (page) => page.evaluate(() => [...document.querySelectorAll('#coCh .cch')].map((b) => b.innerText.trim().split('\n')[0]));

function metDrempel(v) {
  const p = seed();
  const s = JSON.parse(p.minder_set);
  if (v === null) delete s.slaapDrempel; else s.slaapDrempel = v;
  p.minder_set = JSON.stringify(s);
  return p;
}

async function check(page, amt, payload, cat) {
  await open(page, payload || metDrempel(null));
  await page.evaluate(() => openBuy());
  await page.waitForSelector('#buyAmt');
  await page.fill('#buyItem', 'koptelefoon');
  await page.fill('#buyAmt', String(amt));
  await page.selectOption('#buyCat', cat || 'boodschappen');
  await page.locator('#sheet button.btn', { hasText: 'Check' }).click();
}

// alles wat de check zelf uitrekent of oordeelt; niets hiervan mag voor de slaapstap staan
const UITKOMST = ['Past binnen', 'geen budget meer voor', 'nog geen potje', 'In doel-termen', 'Wil je dit echt'];

test.describe('a - de drempel', () => {
  test('standaard 100, en de instelling is de enige bron', async ({ page }) => {
    await open(page, metDrempel(null));
    expect(await page.evaluate(() => [SLAAP_DREMPEL_DEFAULT, slaapDrempel()])).toEqual([100, 100]);
    expect(await page.evaluate(() => [slaapVoorstel(99), slaapVoorstel(100), slaapVoorstel(101)]))
      .toEqual([false, false, true]);   // strikt boven de drempel
  });

  test('een eigen bedrag stuurt de grens', async ({ page }) => {
    await open(page, metDrempel(25));
    expect(await page.evaluate(() => [slaapDrempel(), slaapVoorstel(25), slaapVoorstel(30)])).toEqual([25, false, true]);
  });

  test('leeg of onzin valt terug op de standaard, nul zet de stap uit', async ({ page }) => {
    await open(page, metDrempel(null));
    const uit = await page.evaluate(() => {
      const r = {};
      for (const v of ['', null, -5, 'abc']) { SET.slaapDrempel = v; r[String(v)] = slaapDrempel(); }
      SET.slaapDrempel = 0; r.nul = [slaapDrempel(), slaapVoorstel(99999)];
      return r;
    });
    expect(uit['']).toBe(100);
    expect(uit['null']).toBe(100);
    expect(uit['-5']).toBe(0);      // een negatieve drempel is geen drempel
    expect(uit['abc']).toBe(0);
    expect(uit.nul).toEqual([0, false]);
  });
});

test.describe('b - onder de drempel gebeurt er niets nieuws', () => {
  test('precies op de drempel gaat rechtstreeks naar de uitkomst', async ({ page }) => {
    await check(page, OP_DE_DREMPEL);
    await wachtZin(page, 'Past binnen boodschappen');
    expect(await draad(page)).not.toContain('nacht over slapen');
  });

  test('met de drempel op nul blijft ook een groot bedrag ongemoeid', async ({ page }) => {
    await check(page, 900, metDrempel(0));
    await wachtZin(page, 'geen budget meer voor');
    expect(await draad(page)).not.toContain('nacht over slapen');
  });
});

test.describe('c - boven de drempel komt de stap voor de uitkomst', () => {
  test('de vraag staat er, en er is nog niets uitgerekend', async ({ page }) => {
    await check(page, ERBOVEN);
    await wachtKeuze(page, 'Parkeer tot morgen');
    const t = await draad(page);
    for (const u of UITKOMST) expect(t).not.toContain(u);
    expect(await keuzes(page)).toEqual(['Parkeer tot morgen', 'Toch nu zien']);
    expect(await log(page)).toEqual([]);   // nog geen enkele beslissing
  });

  test('de stap houdt niets tegen en velt geen oordeel', async ({ page }) => {
    await check(page, ERBOVEN);
    await wachtZin(page, 'nacht over slapen');
    const t = await draad(page);
    // de zin die de stap toevoegt, zonder de openingsbubbel van de gebruiker zelf
    const zin = t.split('\n').filter((r) => r.indexOf('nacht over slapen') >= 0).join(' ');
    expect(zin).toBe('Wil je er een nacht over slapen?');
    for (const w of ['hoog', 'veel', 'duur', 'veroorloven', 'weet je zeker', 'let op', '!', '€']) {
      expect(zin.toLowerCase()).not.toContain(w.toLowerCase());
    }
  });

  test('ook boven de drempel blijft de uitkomst zelf onveranderd', async ({ page }) => {
    await check(page, 900);
    await kies(page, 'Toch nu zien');
    await wachtZin(page, 'geen budget meer voor');
    await wachtKeuze(page, 'Ik wil het nú');
    expect(await keuzes(page)).toEqual(['Ik wil het écht', 'Ik wil het nú']);
  });
});

test.describe('d - toch nu zien schrijft niets weg', () => {
  test('de check loopt door en er staat geen geparkeerde aankoop', async ({ page }) => {
    await check(page, ERBOVEN);
    await kies(page, 'Toch nu zien');
    await wachtZin(page, 'vastgelegd');
    const l = await log(page);
    expect(l.map((x) => x.uitkomst)).toEqual(['gepland']);
    expect(await page.evaluate(() => !!coParkDue())).toBe(false);
  });

  test('een dag later brengt niets terug', async ({ page }) => {
    await check(page, ERBOVEN);
    await kies(page, 'Toch nu zien');
    await wachtZin(page, 'vastgelegd');
    await page.evaluate(() => { (SET.coachLog || []).forEach((l) => { l.ts -= 24 * 36e5; }); save(); });
    expect(await page.evaluate(() => !!coParkDue())).toBe(false);
    expect(await page.evaluate(() => (scoreNotifs() || []).filter((n) => String(n.key).indexOf('park-') === 0).length)).toBe(0);
  });
});

test.describe('e - parkeren gebruikt de bestaande route', () => {
  test('dezelfde entry, en de terugkeer een dag later', async ({ page }) => {
    await check(page, ERBOVEN);
    await kies(page, 'Parkeer tot morgen');
    await wachtZin(page, 'morgen op terug');
    const l = await log(page);
    expect(l.length).toBe(1);
    expect(l[0]).toMatchObject({ type: 'beslis', uitkomst: 'geparkeerd', intentie: 'nu', bedrag: ERBOVEN, potjeId: 'boodschappen', item: 'koptelefoon' });
    expect(l[0].resolved).toBeUndefined();

    // de belofte is morgen: zet de beslissing een dag terug, precies wat de klok anders doet
    await page.evaluate(() => { const e = (SET.coachLog || []).find((x) => x.uitkomst === 'geparkeerd'); e.ts -= 24 * 36e5; save(); });
    expect(await page.evaluate(() => !!coParkDue())).toBe(true);
    expect(await page.evaluate(() => (scoreNotifs() || []).filter((n) => String(n.key).indexOf('park-') === 0).map((n) => n.act)))
      .toEqual(["coStart('algemeen')"]);

    await page.evaluate(() => coStart('algemeen'));
    await wachtZin(page, 'parkeerde');
    expect(await draad(page)).toContain('koptelefoon');
    await kies(page, 'Nu doen');
    await wachtZin(page, 'Doorgezet');
    expect((await log(page)).map((x) => x.uitkomst)).toEqual(['doorgezet', 'geparkeerd']);   // coachLogAdd zet nieuw vooraan
  });

  test('er komt geen tweede parkeer-route naast coParkDue en coParkReturn', async ({ page }) => {
    await open(page, metDrempel(null));
    const n = await page.evaluate(() => {
      const src = [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n');
      return {
        due: (src.match(/function coParkDue\(/g) || []).length,
        ret: (src.match(/function coParkReturn\(/g) || []).length,
        geparkeerd: (src.match(/uitkomst==='geparkeerd'/g) || []).length,
        schrijft: (src.match(/'geparkeerd'/g) || []).length,
      };
    });
    expect(n.due).toBe(1);
    expect(n.ret).toBe(1);
  });
});

test.describe('f - de vraag komt precies een keer per aankoop', () => {
  test('na een nieuw potje wordt de slaapvraag niet herhaald', async ({ page }) => {
    await open(page, metDrempel(null));
    await page.evaluate(() => openBuy());
    await page.waitForSelector('#buyAmt');
    const zonder = await page.evaluate(() => {
      const o = [...document.querySelectorAll('#buyCat option')].find((x) => x.textContent.indexOf('geen potje') >= 0);
      return o ? o.value : null;
    });
    expect(zonder).toBeTruthy();
    await page.fill('#buyItem', 'losse aankoop');
    await page.fill('#buyAmt', '250');
    await page.selectOption('#buyCat', zonder);
    await page.locator('#sheet button.btn', { hasText: 'Check' }).click();

    await kies(page, 'Toch nu zien');
    await wachtKeuze(page, 'Maak eerst een');
    await page.locator('#coCh .cch', { hasText: 'Maak eerst een' }).first().click();
    await page.waitForFunction(() => !document.getElementById('coThr'));   // openPotje() heeft de sheet overgenomen
    await page.evaluate((k) => { window._potDraft = { type: 'vast', vast: 400 }; savePotje(k); }, zonder);

    await wachtZin(page, 'vastgelegd');
    const t = await draad(page);
    expect(t).not.toContain('nacht over slapen');
    expect((await log(page)).map((x) => x.uitkomst)).toEqual(['gepland']);
  });
});

test.describe('g - de instelling staat bij Budget & doelen', () => {
  test('een veld met een regel die zegt wat het doet', async ({ page }) => {
    await open(page, metDrempel(null));
    // v180: Budget & doelen opent als sheet via openBudgetEditor()
    await page.evaluate(() => { go('set'); openBudgetEditor(); });
    const paneel = await page.locator('#sheet').innerText();
    expect(paneel).toContain('Nachtje over slapen vanaf');
    expect(paneel).toContain('Boven dit bedrag stelt de koopcheck voor om er een nacht over te slapen');
    expect(paneel).toContain('parkeren tot morgen');
  });

  test('het veld schrijft SET.slaapDrempel en de check volgt', async ({ page }) => {
    await open(page, metDrempel(null));
    await page.evaluate(() => { go('set'); openBudgetEditor(); });
    const inp = page.locator('#sheet input[oninput*="slaapDrempel"]');
    await expect(inp).toHaveCount(1);
    await inp.fill('40');
    expect(await page.evaluate(() => [SET.slaapDrempel, slaapDrempel(), slaapVoorstel(45)])).toEqual([40, 40, true]);
    await inp.fill('0');
    expect(await page.evaluate(() => [SET.slaapDrempel, slaapVoorstel(99999)])).toEqual([0, false]);
  });

  for (const w of [360, 390]) {
    test(`het veld past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await open(page, metDrempel(null));
      await page.evaluate(() => { go('set'); openBudgetEditor(); });
      await page.waitForSelector('#sheet input[oninput*="slaapDrempel"]');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
