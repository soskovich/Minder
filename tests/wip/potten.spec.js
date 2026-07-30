// Persona's die de vijf toestanden uit sectie 6 van de twee-potten-brief doorlopen.
// Elke persona seedt localStorage vóór de boot, opent het potten-scherm en toetst
// de spiegel/gevolg/keuze-tekst van de bijbehorende toestand.
const { test, expect } = require('@playwright/test');

const now = new Date();
const YM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';

// Bouwt de localStorage-payload. cash stuurt de vloer, exp stuurt de instroom,
// belegd stuurt de klim. vloerDoel = nfMaanden(6) x vasteMaandlasten(1000) = 6000.
function seed({ cash, exp, belegd }) {
  const tx = [
    { id: 'inc1', date: YM + '-05', amount: 3000, acc: MAIN, name: 'SALARIS', desc: 'SALARIS LOON', partner: 'Werkgever', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    { id: 'exp1', date: YM + '-10', amount: -exp, acc: MAIN, name: 'Albert Heijn', desc: 'ALBERT HEIJN', partner: 'Albert Heijn', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    { id: 'sav1', date: YM + '-06', amount: 100, acc: SAV, name: 'Spaarpot', desc: 'NAAR SPAREN', partner: '', typ: '', ref: '', src: 'csv', accName: 'Spaarpot', refNums: [] },
  ];
  const ovr = { inc1: 'inkomen', exp1: 'boodschappen', sav1: 'sparen' };
  const set = {
    limit: 70, hideInternal: true,
    autoIncome: false, income: 3000,
    savingMode: 'amount', savingAmount: 900,
    nfMaanden: 6,
    savingsEnds: ['4323', '1123'],
    manualBal: { [SAV]: cash },
    pottenInput: { vasteMaandlasten: 1000, vrijheidMaanduitgaven: 2000 },
    assets: belegd > 0 ? [{ naam: 'Index', waarde: belegd, grow: true }] : [],
  };
  return {
    minder_tx: JSON.stringify(tx),
    minder_ovr: JSON.stringify(ovr),
    minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV]),
    minder_accmeta: JSON.stringify({}),
    minder_plan: JSON.stringify({}),
  };
}

async function open(page, payload) {
  // Service worker uitschakelen: voorkomt de controllerchange-reload tijdens de test.
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((data) => {
    for (const k in data) localStorage.setItem(k, data[k]);
  }, payload);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderPotten === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  await page.evaluate(() => go('potten'));
  await page.waitForSelector('#s-potten.active');
}

function screenText(page) {
  return page.locator('#s-potten').innerText();
}

test('Toestand 1: vloer onder doel, instroom positief', async ({ page }) => {
  await open(page, seed({ cash: 2000, exp: 1000, belegd: 0 }));
  // Controleer dat de rekenkern in toestand 1 zit.
  expect(await page.evaluate(() => { const p = pottenState(); return pottenToestand(p, afgeleidePotten(p)); })).toBe(1);
  const t = await screenText(page);
  expect(t).toContain('volledig naar je vloer');
  expect(t).toContain('Je bouwt nu bodem, geen speelruimte.');
  expect(t).toContain('van je gewenste 6 maanden');
});

test('Toestand 2: vloer vol, instroom positief', async ({ page }) => {
  await open(page, seed({ cash: 6000, exp: 1000, belegd: 0 }));
  expect(await page.evaluate(() => { const p = pottenState(); return pottenToestand(p, afgeleidePotten(p)); })).toBe(2);
  const t = await screenText(page);
  expect(t).toContain('gaat nu naar je klim');
  // De twee getallen mogen niet als tegenstrijdig overkomen: prognose vs curve-referentiepunt.
  expect(t).toContain('is je prognose ongeveer');
  expect(t).toContain('referentiepunt, niet je prognose');
});

test('Toestand 3: instroom negatief (tekortmaand)', async ({ page }) => {
  await open(page, seed({ cash: 2000, exp: 4000, belegd: 0 }));
  expect(await page.evaluate(() => { const p = pottenState(); return pottenToestand(p, afgeleidePotten(p)); })).toBe(3);
  const t = await screenText(page);
  expect(t).toContain('meer uit dan er binnenkwam');
  expect(t).toContain('Je klim staat stil');
  expect(t).toContain('De vloer is er precies voor dit moment.');
});

test('Toestand 4: vloer aangesproken (dekking onder doel, klim bestaat)', async ({ page }) => {
  await open(page, seed({ cash: 2000, exp: 1000, belegd: 5000 }));
  expect(await page.evaluate(() => { const p = pottenState(); return pottenToestand(p, afgeleidePotten(p)); })).toBe(4);
  const t = await screenText(page);
  expect(t).toContain('Je klim staat op pauze.');
  expect(t).toContain('De cascade herprioriteert');
  expect(t).toContain('onder je doel van 6');
});

test('Toestand 5: maandlasten wijzigen (wat-als, dubbele hefboom)', async ({ page }) => {
  await open(page, seed({ cash: 6000, exp: 1000, belegd: 0 }));
  // Persona typt een lagere vaste maandlast in het wat-als-veld.
  await page.fill('#s-potten input[placeholder="nieuwe vaste maandlast"]', '800');
  await page.locator('#s-potten input[placeholder="nieuwe vaste maandlast"]').blur();
  await page.waitForFunction(() => document.querySelector('#s-potten').innerText.includes('verschuift beide potten tegelijk'));
  const t = await screenText(page);
  expect(t).toContain('van €1.000 naar €800');
  expect(t).toContain('verschuift beide potten tegelijk');
  expect(t).toContain('dubbele hefboom, live');
  // Bij een verlaging met volle vloer komt een bedrag vrij richting de klim.
  expect(t).toContain('vrij richting je klim');
});

test('Toon-constraints: geen em-dash, geen emoji op het potten-scherm', async ({ page }) => {
  await open(page, seed({ cash: 6000, exp: 1000, belegd: 0 }));
  const t = await screenText(page);
  expect(t).not.toContain('—'); // em-dash
  expect(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)).toBe(false); // emoji
});
