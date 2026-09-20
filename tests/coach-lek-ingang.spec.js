// v139: de eerste ingang naar het coachgesprek buiten het coachscherm: een regel die
// coStart('lek', m) opent, een gesprek dat begint bij het cijfer zelf in plaats van bij een groet.
// v235: die regel was de CTA-voetregel in de Valt op-kaart op Inzichten, en die kaart is vervallen.
// Inzichten constateert nu alleen; de keuze staat op Grip. De ingang hangt daarom aan de chevron in
// de kop van de open valt-op-kaart op Grip, en niet aan een vierde knop naast de drie handelingen.
// v237: die verhuizing kostte dekking, want de chevron bestaat alleen op een kaart en een kaart
// bestaat alleen bij een overschrijding van minstens DREMPEL_EUR, terwijl coachLeak() iets anders
// meet. Een lek zonder overschrijding had daardoor geen ingang meer. Sinds v237 is coachLeak() ook
// een bron voor de patroonregels op Inzichten, dus er zijn nu twee ingangen naar hetzelfde gesprek:
// de kaart vangt het lek dat samenvalt met een overschrijding, de regel vangt het lek dat dat niet
// doet. Dat is geen dubbeling maar dekking, en a4 en a5 meten het allebei van hun eigen kant.
// Kritiek en onveranderd: dit gesprek mag de maandafspraak nooit raken, want
// coachThisMonthAfspraak() laat er één per maand toe en coAfspraakOpen() wist de bestaande eerst.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, MAIN } = require('./budget-fixture');

// een impuls zonder potje: geen categorie-budget, niet terugkerend, ruim boven de 25-euro-drempel.
// Zelfde veldvorm als de fixture zelf, anders struikelt categorize() bij het booten.
function metLek(extra) {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  tx.push({ id: 'lek1', date: `${CUR}-08`, amount: -220, acc: MAIN, name: 'MediaMarkt',
    desc: 'BEA, BETAALPAS MEDIAMARKT', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  p.minder_tx = JSON.stringify(tx);
  const set = JSON.parse(p.minder_set);
  delete set.budgets.shopping;          // zonder potje valt de aankoop onder noPotLeak
  if (extra) extra(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

// v235: de chevron hangt aan een valt-op-kaart, dus de fixture heeft naast het lek ook een
// categorie boven haar potje nodig. Boodschappen staat deze maand op 300; met een potje van 250 is
// dat 50 boven de drempel van 25.
function metLekEnSignaal() {
  return metLek((set) => { set.budgets.boodschappen = 250; });
}
/* Een valt-op-signaal zonder lek. Die twee vallen meestal samen - coachWeekRisk() noemt een
   over-budget categorie zelf een lek - maar ze meten niet hetzelfde: valtOpSignals() vuurt op een
   BEDRAG (25 euro boven het potje) en budgetOverCat() op een PERCENTAGE (budgetBand, meer dan 3%).
   Boodschappen op 900 met een potje van 875 is 25 euro over en 2,9%: wel een signaal, geen lek.
   Precies dat gat maakt zichtbaar dat de chevron aan coachLeak() hangt en niet aan de kaart. */
function alleenSignaal() {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  tx.push({ id: 'ah-extra', date: `${CUR}-09`, amount: -600, acc: MAIN, name: 'Albert Heijn',
    desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  p.minder_tx = JSON.stringify(tx);
  const set = JSON.parse(p.minder_set);
  set.budgets.boodschappen = 875;
  p.minder_set = JSON.stringify(set);
  return p;
}
async function ins(page, payload) {
  await open(page, payload || metLekEnSignaal());
  await page.evaluate(() => go('maand'));
  await page.waitForSelector('#s-maand .card');
}
const chevron = (page) => page.locator('.valtop-open [onclick*="coStart"]');
const wachtKeuze = (page) => page.waitForFunction(
  () => document.querySelectorAll('#coCh .cch').length > 0, null, { timeout: 15000 });
const log = (page) => page.evaluate(() => JSON.stringify(SET.coachLog || []));

test.describe('a · de ingang op Grip', () => {
  /* v186 maakte van de lek-vraag de voetregel binnen de Valt op-kaart. v235 heeft die kaart
     opgeheven: Inzichten constateert, Grip draagt de keuze. De ingang is nu een chevron in de kop
     van de open kaart. Wat deze tests bewaken verschuift mee: de bevinding met bedrag en naam
     staat in die kaart, en de ingang is geen neutrale knop naar de coach. */
  test('a1 · de chevron staat in de kop van de open kaart, en nergens anders', async ({ page }) => {
    await ins(page);
    await expect(chevron(page)).toHaveCount(1);
    const onclick = await chevron(page).getAttribute('onclick');
    expect(onclick).toContain("coStart('lek'");
    expect(onclick).toContain(CUR);                              // Grip leest altijd de lopende maand (v233)
    // niet als vierde knop tussen de handelingen
    expect(await page.locator('.valtop-hand [onclick*="coStart"]').count()).toBe(0);
    await expect(page.locator('.valtop-open .valtop-hand button')).toHaveCount(3);
  });

  test('a2 · de kaart eromheen draagt de bevinding met bedrag en naam', async ({ page }) => {
    await ins(page);
    const t = await page.locator('.valtop-open').innerText();
    expect(t).toMatch(/boodschappen/i);
    expect(t).toMatch(/€\d/);
    expect(t).not.toMatch(/coach/i);                             // geen neutrale knop naar de coach
  });

  test('a3 · geen lek betekent geen chevron, en geen lege staat', async ({ page }) => {
    await ins(page, alleenSignaal());                            // wel een signaal, geen lek
    expect(await page.evaluate(() => valtOpSignals(thisYM()).map((x) => x.potjeId))).toEqual(['boodschappen']);
    expect(await page.evaluate((m) => coachWeekRisk(m).tone, CUR)).toBe('ok');
    expect(await page.evaluate((m) => coachLeak(m), CUR)).toBe(null);
    await expect(page.locator('.valtop-open')).toHaveCount(1);    // de kaart staat er wel
    await expect(chevron(page)).toHaveCount(0);                   // de ingang niet
    expect(await page.locator('#s-maand').innerText()).not.toMatch(/kunt doen\?/);
  });

  /* v237: "de enige ingang" klopt niet meer, en dat is de bedoeling. Inzichten en Grip kunnen er
     allebei een dragen zolang ze over een ander geval gaan. Wat blijft staan is dat geen scherm er
     twee draagt, en dat Home, Plan en Transacties er geen krijgen: daar valt over een lek niets te
     beslissen. */
  test('a4 · hooguit een ingang per scherm, en alleen op Inzichten en Grip', async ({ page }) => {
    await ins(page, metLekEnSignaal());
    for (const scherm of ['vooruit', 'dash', 'tx']) {
      expect(await page.evaluate((s) => (document.querySelector('#s-' + s) || {}).innerHTML || '', scherm))
        .not.toContain("coStart('lek'");
    }
    const per = async (s) => page.evaluate((x) => document.querySelectorAll('#s-' + x + " [onclick*=\"coStart('lek'\"]").length, s);
    expect(await per('ins')).toBeLessThanOrEqual(1);
    expect(await per('maand')).toBeLessThanOrEqual(1);
    // deze fixture draagt allebei de gevallen: een lek zonder overschrijding (shopping, geen potje)
    // en een overschrijding met een kaart (boodschappen). Dat is precies de dekking die v237 wil.
    expect(await per('ins') + await per('maand')).toBe(2);
  });

  /* a5 was in v235 een vastgelegde versmalling: zonder kaart geen ingang. v237 heft die op, dus
     dit is nu een meting van de andere kant. Hetzelfde geval, hetzelfde lek, geen overschrijding:
     de ingang hoort er te zijn, op Inzichten, en niet op Grip. Valt hij weg, dan is de dekking
     stilletjes terug naar v235 en hoort die test rood te staan. */
  test('a5 · een lek zonder overschrijding krijgt zijn ingang op Inzichten, niet op Grip', async ({ page }) => {
    await ins(page, metLek());                                   // lek, maar geen potje-overschrijding
    expect(await page.evaluate((m) => coachWeekRisk(m).tone, CUR)).toBe('warn');
    expect(await page.evaluate((m) => !!coachLeak(m), CUR)).toBe(true);
    expect(await page.evaluate(() => valtOpSignals(thisYM()).length)).toBe(0);
    await expect(chevron(page)).toHaveCount(0);                  // geen kaart, dus geen chevron
    await page.evaluate(() => go('ins'));
    await expect(page.locator('.valtop-patroon')).toHaveCount(1);
    const onclick = await page.locator('.valtop-patroon').getAttribute('onclick');
    expect(onclick).toContain("coStart('lek'");
    expect(onclick).toContain(CUR);
    // de regel draagt de bevinding zelf, met bedrag en categorie
    const t = await page.locator('.valtop-patroon').innerText();
    expect(t).toMatch(/mediamarkt/i);
    expect(t).toMatch(/€\s?220/);
  });

  /* Het gesprek achter de regel is hetzelfde gesprek als achter de chevron: coTopicLek(), met
     dezelfde maand. Zonder deze toets kan de regel een dode tik worden. */
  test('a6 · de regel op Inzichten opent hetzelfde gesprek', async ({ page }) => {
    await ins(page, metLek());
    await page.evaluate(() => go('ins'));
    await page.locator('.valtop-patroon').click();
    await wachtKeuze(page);
    expect(await page.evaluate(() => window._coOnderwerp)).toBe('lek');
    const draad = await page.locator('#coThr').innerText();
    expect(draad).toMatch(/mediamarkt/i);
  });
});

test.describe('b · het gesprek begint bij het cijfer', () => {
  test('opent met de bevinding, niet met een groet', async ({ page }) => {
    await ins(page);
    await chevron(page).click();
    await wachtKeuze(page);
    const draad = await page.locator('#coThr').innerText();
    expect(draad).toMatch(/mediamarkt/i);
    expect(draad).toMatch(/€220/);
    expect(draad).not.toMatch(/waar werk je/i);                  // coachOpening komt hier niet voor
    expect(await page.evaluate(() => window._coOnderwerp)).toBe('lek');
    expect(await page.evaluate(() => document.querySelector('#sheetBg').classList.contains('show'))).toBe(true);
  });

  test('de keuzes zijn coachRuleOptions, met het bedrag per maand', async ({ page }) => {
    await ins(page);
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const ks = await page.evaluate(() => [...document.querySelectorAll('#coCh .cch')].map((b) => b.innerText.replace(/\s*›\s*$/, '').trim()));
    const opts = await page.evaluate((m) => coachRuleOptions(m), CUR);
    for (const o of opts) expect(ks.some((k) => k.indexOf(o.label) === 0 && k.indexOf('/mnd') > 0)).toBe(true);
    expect(ks[ks.length - 1]).toBe('Nu even niet');
  });

  test('een keuze zet de regel via coachRules en sluit het gesprek', async ({ page }) => {
    await ins(page);
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const opt = (await page.evaluate((m) => coachRuleOptions(m), CUR))[0];

    await page.locator('#coCh .cch').first().click();
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });
    expect(await page.evaluate((k) => (SET.coachRules || {})[k], opt.key)).toBe(opt.cut);
    expect(await page.locator('#coThr').innerText()).toMatch(/terug in je plan/i)      // v179: het scherm heet Plan;
  });
});

test.describe('c · nooit een maandafspraak vanaf deze ingang', () => {
  const metAfspraak = () => metLek((s) => { s.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'oude afspraak' }]; });

  test('een keuze schrijft type tip, nooit type afspraak', async ({ page }) => {
    await ins(page, metAfspraak());
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    await page.locator('#coCh .cch').first().click();
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });

    const na = JSON.parse(await log(page));
    expect(na[0].type).toBe('tip');
    expect(na.filter((l) => l.type === 'afspraak').map((l) => l.text)).toEqual(['oude afspraak']);
    expect(await page.evaluate(() => (coachThisMonthAfspraak() || {}).text)).toBe('oude afspraak');
  });

  test('coachLogAdd weigert een afspraak zolang dit gesprek loopt', async ({ page }) => {
    await ins(page, metAfspraak());
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const voor = await log(page);
    await page.evaluate(() => coachLogAdd({ type: 'afspraak', text: 'stiekem' }));
    expect(await log(page)).toBe(voor);
    // andere typen blijven gewoon werken
    await page.evaluate(() => coachLogAdd({ type: 'tip', text: 'mag wel' }));
    expect(JSON.parse(await log(page))[0].text).toBe('mag wel');
  });

  test('de twee stappen die eerst wissen zijn afgesloten', async ({ page }) => {
    await ins(page, metAfspraak());
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const voor = await log(page);

    await page.evaluate((m) => coAfspraakOpen(m), CUR);
    await page.evaluate(() => coShowAction({ title: 'x', afspraak: 'y' }));
    await page.waitForTimeout(400);
    expect(await log(page)).toBe(voor);                          // niets gewist, niets geschreven
    expect(await page.evaluate(() => (coachThisMonthAfspraak() || {}).text)).toBe('oude afspraak');
  });

  test('coCommit legt niets vast vanuit dit onderwerp', async ({ page }) => {
    await ins(page, metAfspraak());
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const voor = await log(page);
    await page.evaluate(() => coCommit('een afspraak die hier niet hoort'));
    await page.waitForTimeout(600);
    expect(await log(page)).toBe(voor);
  });

  test('het gewone gesprek mag nog wel een afspraak vastleggen', async ({ page }) => {
    await ins(page, metLek());
    await page.evaluate(() => coStart('algemeen'));
    await page.waitForFunction(() => window._coOnderwerp === 'algemeen', null, { timeout: 15000 });
    expect(await page.evaluate(() => coMagAfspraak())).toBe(true);
    await page.evaluate(() => coachLogAdd({ type: 'afspraak', text: 'wel toegestaan' }));
    expect(await page.evaluate(() => (coachThisMonthAfspraak() || {}).text)).toBe('wel toegestaan');
  });
});

test.describe('d · onderbreken', () => {
  test('de sheet dicht laat niets achter in coachRules of coachLog', async ({ page }) => {
    await ins(page);
    const regelsVoor = await page.evaluate(() => JSON.stringify(SET.coachRules || {}));
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const logVoor = await log(page);

    await page.evaluate(() => closeSheet());
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => ({
      live: !!window._coLive,
      onderwerp: window._coOnderwerp,
      open: document.querySelector('#sheetBg').classList.contains('show'),
      keuzes: document.querySelectorAll('#coCh .cch').length,
    }))).toEqual({ live: false, onderwerp: null, open: false, keuzes: 0 });
    expect(await page.evaluate(() => JSON.stringify(SET.coachRules || {}))).toBe(regelsVoor);
    expect(await log(page)).toBe(logVoor);
  });

  test('"Nu even niet" sluit zonder iets te zetten', async ({ page }) => {
    await ins(page);
    const regelsVoor = await page.evaluate(() => JSON.stringify(SET.coachRules || {}));
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const logVoor = await log(page);
    await page.locator('#coCh .cch', { hasText: 'Nu even niet' }).click();
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 5000 });
    expect(await page.evaluate(() => JSON.stringify(SET.coachRules || {}))).toBe(regelsVoor);
    expect(await log(page)).toBe(logVoor);
  });
});

test.describe('e · layout', () => {
  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await ins(page);
      await chevron(page).click();
      await wachtKeuze(page);
      const over = await page.evaluate(() => ({
        ins: document.querySelector('#s-maand').scrollWidth - document.querySelector('#s-maand').clientWidth,
        sheet: document.querySelector('#sheet').scrollWidth - document.querySelector('#sheet').clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(over.ins).toBeLessThanOrEqual(1);
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
