// v231: de abonnementenkaart op Maand is weg. Dezelfde posten stonden in twee lijsten met twee
// vlaggen die elkaar niet kenden: subscriptionsList() met SET.cancelFlags ('opzeggen?', las niets)
// en de liquiditeitsprognose met SET.fixDueExcl ('niet meer terugkerend'). Nu één lijst uit één
// bron (recurringSchedule), onder Instellingen als 'Vaste lasten', en één vlag met datum:
// 'Opgezegd op <datum>'. Een afschrijving ná die datum is de ene afwijking die de app kan
// vaststellen, en komt als melding. Het groene besparingsblok is weg: het claimde een besparing over
// iets wat niet was gebeurd. De coachtip 'Abonnementen nalopen' las een veld dat niet bestond en
// vuurde nooit; hij leest nu de gedeelde lijst.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const mnd = (i) => ym(new Date(now.getFullYear(), now.getMonth() - i, 1));
const CUR = mnd(0);
const MAIN = 'NL01MAIN0000001111';
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

/* Vier maanden. Netflix (incasso, abonnement) elke maand op de 6e; huur (incasso) elke maand; een
   gift via periodieke overboeking; en een verzekering per kwartaal. De oude lijst kende alleen
   Netflix en de gift; de nieuwe kent alle vier. */
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, name, desc) => tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (let i = 3; i >= 0; i--) {
    const m = mnd(i);
    add('i' + m, m, '01', 3000, 'Werkgever', 'SALARIS LOON');
    if (!(o.zonderNetflixNu && i === 0)) add('n' + m, m, '06', -12, 'Netflix', 'SEPA INCASSO NETFLIX ABONNEMENT');
    add('h' + m, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('g' + m, m, '03', -20, 'Greenpeace', 'PERIODIEKE OVERBOEKING MAANDELIJKSE GIFT');
    if (i === 3 || i === 0) add('v' + m, m, '10', -150, 'Verzekeraar', 'SEPA INCASSO KWARTAALPREMIE');
    add('a' + m, m, '12', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  const set = Object.assign({ limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 4000 }, budgets: { huur: 900, boodschappen: 400 } }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, p) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, p || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof vasteLasten === 'function');
}
const lijst = (page) => page.evaluate(() => vasteLasten().map((s) => ({ key: s.key, name: s.name, cat: s.cat, intervalM: s.intervalM, monthlyEq: s.monthlyEq, opgezegd: s.opgezegd, sinds: s.sinds, incasso: s.incasso, periodic: s.periodic })));
const sheet = (page) => page.evaluate(() => { openVasteLasten(); return { txt: document.querySelector('#sheet').innerText.replace(/\s+/g, ' '), html: document.querySelector('#sheet').innerHTML }; });
const NETFLIX = 'NETFLIX';

test.describe('a - één lijst uit één bron', () => {
  test('de nieuwe lijst bevat alles wat de oude had, en wat de oude uitsloot', async ({ page }) => {
    await boot(page);
    const L = await lijst(page);
    const namen = L.map((s) => s.name).sort();
    expect(namen).toEqual(['Greenpeace', 'Netflix', 'Verzekeraar', 'Woningcorporatie']);
    const v = L.find((s) => s.name === 'Verzekeraar');
    expect(v.intervalM).toBe(3);                         // een kwartaalpost, die de oude lijst niet kende
    expect(v.monthlyEq).toBe(50);
    expect(L.find((s) => s.name === 'Greenpeace').periodic).toBe(true);   // een overboeking, geen incasso
    expect(L.find((s) => s.name === 'Woningcorporatie').incasso).toBe(true);
    // gesorteerd op maandequivalent, en de bron is recurringSchedule
    expect(L[0].name).toBe('Woningcorporatie');
    expect(await page.evaluate(() => /recurringSchedule\(\)/.test(vasteLasten.toString()))).toBe(true);
  });

  test('de oude afbakening is een weergavefilter, geen tweede detectie', async ({ page }) => {
    await boot(page);
    const o = await page.evaluate(() => opzegbarePosten().map((s) => s.name).sort());
    // abonnement en goededoel, plus de verzekering: die valt in 'overig' met een stabiel bedrag (de oude regel); huur niet
    expect(o).toEqual(['Greenpeace', 'Netflix', 'Verzekeraar']);
    expect(await page.evaluate(() => /vasteLasten\(\)/.test(opzegbarePosten.toString()))).toBe(true);
    const bron = await page.evaluate(() => [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n'));
    expect(bron).not.toMatch(/function subscriptionsList|function subsCard|function openSubs|function toggleCancel/);
  });

  test('Maand draagt de kaart niet meer, Instellingen wel de ingang', async ({ page }) => {
    await boot(page);
    const maand = await page.evaluate(() => { go('maand'); return document.querySelector('#s-maand').innerText.replace(/\s+/g, ' '); });
    expect(maand).not.toMatch(/abonnement/i);
    const set = await page.evaluate(() => { go('set'); toggleSet('trans'); return document.querySelector('#s-set').innerText.replace(/\s+/g, ' '); });
    expect(set).toContain('Vaste lasten');
    expect(set).toContain('4 herkend');
    expect(await page.evaluate(() => /subsCard/.test(renderMaand.toString().replace(/\/\*[\s\S]*?\*\//g, '')))).toBe(false);
  });
});

test.describe('b - één vlag, met datum, en de term is opgezegd', () => {
  test('opgezegd zet fixDueExcl met de dag van vandaag, en cancelFlags blijft leeg', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((k) => {
      openVasteLasten(); toggleFixDueExcl(k, 'vaste');
      return { vlag: SET.fixDueExcl[k], cancel: SET.cancelFlags || null, sheet: document.querySelector('#sheet').innerText.replace(/\s+/g, ' ') };
    }, NETFLIX);
    expect(r.vlag).toEqual({ sinds: ymd(now) });
    expect(r.cancel).toBeNull();
    expect(r.sheet).toContain('Opgezegd op ' + now.getDate() + ' ');
    expect(r.sheet).toMatch(/Opgezegd · telt niet mee/i);   // de kop staat in kapitalen via CSS
    expect(r.sheet).toContain('Toch niet');
  });

  test('de sheet claimt geen besparing en zegt niet dat de app iets opzegt', async ({ page }) => {
    await boot(page);
    const s = await sheet(page);
    expect(s.txt).not.toMatch(/bespaar/i);
    expect(s.txt).not.toMatch(/opzeggen\?/i);
    expect(s.html).not.toContain('var(--green)');
    expect(s.txt).toContain('4 posten · samen €982 per maand');   // 900 + 12 + 20 + 50 = 982, Verzekeraar is een kwartaalpost
  });

  test('in één tik omkeerbaar', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((k) => { openVasteLasten(); toggleFixDueExcl(k, 'vaste'); toggleFixDueExcl(k, 'vaste'); return SET.fixDueExcl[k] || null; }, NETFLIX);
    expect(r).toBeNull();
  });

  test('een opgezegde post telt niet mee in de prognose, en de Home-drill-down zegt hetzelfde', async ({ page }) => {
    await boot(page, seed({ zonderNetflixNu: true }));
    const voor = await page.evaluate(() => monthLiquidity().fixDue);
    await page.evaluate((k) => { SET.fixDueExcl = { [k]: { sinds: vandaagYMD() } }; save(); }, NETFLIX);
    const na = await page.evaluate(() => monthLiquidity().fixDue);
    expect(voor - na).toBe(12);
    const home = await page.evaluate(() => { openFixedDue(); return document.querySelector('#sheet').innerText.replace(/\s+/g, ' '); });
    expect(home).toContain('Opgezegd op ' + now.getDate() + ' ');
    expect(home).not.toContain('niet meer terugkerend');
  });

  test('een oude vlag zonder datum blijft uitsluiten en heet opgezegd zonder datum', async ({ page }) => {
    await boot(page, seed({ zonderNetflixNu: true, set: { fixDueExcl: { [NETFLIX]: 1 } } }));
    const L = await lijst(page);
    const n = L.find((s) => s.name === 'Netflix');
    expect(n.opgezegd).toBe(true);
    expect(n.sinds).toBeNull();
    expect(await page.evaluate(() => monthLiquidity().fixDueItems.find((s) => s.name === 'Netflix').excl)).toBe(true);
    const s = await sheet(page);
    expect(s.txt).toMatch(/Opgezegd(?! op)/);
  });
});

test.describe('c - een afschrijving na de opzegdatum is een melding', () => {
  const sinds = (dagen) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dagen));
  const vorigeMaand6 = mnd(1) + '-06';

  test('opgezegd vóór de laatste afschrijving: de melding vuurt, met een tik naar de boeking', async ({ page }) => {
    // opgezegd op de 1e van vorige maand; op de 6e is Netflix toch afgeschreven, en deze maand weer
    await boot(page, seed({ set: { fixDueExcl: { [NETFLIX]: { sinds: mnd(1) + '-01' } } } }));
    const n = await page.evaluate(() => scoreNotifs({ negeerSnooze: true }).find((x) => x.key.indexOf('opgezegd-') === 0) || null);
    expect(n).toBeTruthy();
    expect(n.h).toBe('direct');
    expect(n.t).toBe('warn');
    expect(n.l1).toMatch(/^Netflix is op 6 \w+ toch afgeschreven\.$/);   // de laatste, deze maand
    expect(n.l2).toContain('Je gaf aan dat je dit had opgezegd');
    expect(n.act).toMatch(/^openSheet\('/);
    // en hij staat in de meldingenlijst
    expect(await page.evaluate(() => notifList().some((x) => x.key.indexOf('opgezegd-') === 0))).toBe(true);
  });

  test('opgezegd ná de laatste afschrijving: stilte', async ({ page }) => {
    await boot(page, seed({ set: { fixDueExcl: { [NETFLIX]: { sinds: ymd(now) } } } }));
    expect(await page.evaluate(() => scoreNotifs({ negeerSnooze: true }).filter((x) => x.key.indexOf('opgezegd-') === 0).length)).toBe(0);
  });

  test('een oude vlag zonder datum krijgt geen melding: sinds wanneer is onbekend', async ({ page }) => {
    await boot(page, seed({ set: { fixDueExcl: { [NETFLIX]: 1 } } }));
    expect(await page.evaluate(() => scoreNotifs({ negeerSnooze: true }).filter((x) => x.key.indexOf('opgezegd-') === 0).length)).toBe(0);
  });

  test('een pinbetaling bij dezelfde naam is geen afschrijving van de post', async ({ page }) => {
    const p = seed({ zonderNetflixNu: true, set: { fixDueExcl: { [NETFLIX]: { sinds: mnd(1) + '-20' } } } });
    const tx = JSON.parse(p.minder_tx);
    tx.push({ id: 'nx', date: CUR + '-08', amount: -12, acc: MAIN, name: 'Netflix', desc: 'BEA, BETAALPAS NETFLIX', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    p.minder_tx = JSON.stringify(tx);
    await boot(page, p);
    expect(await page.evaluate(() => scoreNotifs({ negeerSnooze: true }).filter((x) => x.key.indexOf('opgezegd-') === 0).length)).toBe(0);
  });

  test('de melding staat buiten de coachOff-guard', async ({ page }) => {
    await boot(page, seed({ set: { coachOff: true, fixDueExcl: { [NETFLIX]: { sinds: mnd(1) + '-01' } } } }));
    expect(await page.evaluate(() => scoreNotifs({ negeerSnooze: true }).some((x) => x.key.indexOf('opgezegd-') === 0))).toBe(true);
  });
});

test.describe('d - het gesprek en de coachtip lezen dezelfde lijst', () => {
  test('de coachtip vuurt weer, met een totaal uit monthlyEq', async ({ page }) => {
    await boot(page);
    const tip = await page.evaluate((m) => (goalCoachTips(m) || []).find((t) => t.key === 'tip_subs') || null, CUR);
    expect(tip).toBeTruthy();
    expect(tip.context).toContain('3 opzegbare vaste posten');
    expect(tip.context).toContain('€82 per maand');           // Netflix 12 + Greenpeace 20 + verzekering 50; huur niet
  });

  test('wat je hebt opgezegd telt de tip niet meer mee', async ({ page }) => {
    await boot(page, seed({ set: { fixDueExcl: { [NETFLIX]: { sinds: ymd(now) }, GREENPEACE: { sinds: ymd(now) } } } }));
    const tip = await page.evaluate((m) => (goalCoachTips(m) || []).find((t) => t.key === 'tip_subs') || null, CUR);
    expect(tip).toBeNull();                                    // één post over, en de tip wil er minstens twee
  });

  test('het gesprek opent de sheet in plaats van naar Maand te springen', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => coTopicVast.toString());
    expect(src).toContain('opzegbarePosten()');
    expect(src).toContain('openVasteLasten()');
    expect(src).not.toContain("go('maand')");
  });
});

test.describe('e - layout', () => {
  for (const w of [360, 390]) {
    test(`de sheet past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page, seed({ set: { fixDueExcl: { [NETFLIX]: { sinds: ymd(now) } } } }));
      await page.evaluate(() => openVasteLasten());
      await page.waitForSelector('#sheetBg.show');
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
      const sheetOver = await page.evaluate(() => { const s = document.querySelector('#sheet'); return s.scrollWidth - s.clientWidth; });
      expect(sheetOver).toBeLessThanOrEqual(1);
    });
  }
});
