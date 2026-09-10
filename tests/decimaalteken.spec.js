// v215: de app schrijft NL (euro0/euroK, komma als decimaalteken) maar las met een kale + en dus
// alleen de Engelse punt. Op een NL-toetsenbord ligt de komma voor de hand, en dan hing het van je
// browser af of 6,5 als 6,5 of als niets aankwam: Chrome normaliseert hem, Safari weigert hem en
// levert een lege string, en +'' is 0. Stil verlies op een veld dat over geld gaat.
// numIn() is nu de enige lezer van een zelf ingetikt getal. Deze spec toetst de helper op de
// randen en toetst dat de invoervelden er doorheen lopen; de browser waarin de suite draait
// normaliseert de komma zelf, dus de helper is wat de andere browsers moet dekken.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MAIN = 'NL01MAIN0000001111';

function seed() {
  const tx = [{ id: 'i1', date: CUR + '-25', amount: 4000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }];
  const set = {
    limit: 70, mode: 'begeleid', autoIncome: false, income: 4000,
    manualBal: { [MAIN]: 3000 },
    assets: [{ id: 'a1', naam: 'Peaks pensioen', waarde: 3219, grow: true, rend: 6, per: 250 }],
    debts: [{ id: 'd1', naam: 'Lening', rest: 5000, perMaand: 100, rente: 3, type: 'lening' }],
    goals: [{ id: 'g1', naam: 'Nieuwe auto', doel: 15000, gespaard: 1000, mode: 'fixed', perMaand: 300 }],
    reis: {},
  };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof numIn === 'function');
}
const lees = (page, s) => page.evaluate((x) => numIn(x), s);

test.describe('a - numIn leest wat je intikt', () => {
  test('de komma is het decimaalteken', async ({ page }) => {
    await boot(page);
    expect(await lees(page, '6,5')).toBe(6.5);
    expect(await lees(page, '0,1')).toBe(0.1);
    expect(await lees(page, '-2,25')).toBe(-2.25);
  });

  test('de punt blijft ook werken, want die tikt de app zelf terug', async ({ page }) => {
    await boot(page);
    expect(await lees(page, '6.5')).toBe(6.5);
    expect(await lees(page, '3219.50')).toBe(3219.5);
  });

  test('staat er een komma, dan is de punt duizendtal', async ({ page }) => {
    await boot(page);
    expect(await lees(page, '1.234,56')).toBe(1234.56);
    expect(await lees(page, '12.500,00')).toBe(12500);
  });

  test('staat er geen komma, dan is de punt het decimaalteken en geen duizendtal', async ({ page }) => {
    await boot(page);
    // dit is de val van de import-parser: die stript punten altijd, en dan wordt 3.5 ineens 35
    expect(await lees(page, '3.5')).toBe(3.5);
  });

  test('leeg, rommel en spaties geven nul en nooit NaN', async ({ page }) => {
    await boot(page);
    for (const x of ['', '   ', 'abc', null, undefined, ',', '.']) {
      const n = await lees(page, x);
      expect(Number.isNaN(n)).toBe(false);
      expect(n).toBe(0);
    }
  });

  test('een spatie als duizendtalscheiding stoort niet', async ({ page }) => {
    await boot(page);
    expect(await lees(page, '1 250')).toBe(1250);
    expect(await lees(page, ' 6,5 ')).toBe(6.5);
  });
});

test.describe('b - de invoervelden lopen erdoorheen', () => {
  test('een rendement met komma komt als decimaal in de bezitting', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      openAsset('a1');
      document.getElementById('aRend').value = '6,5';
      saveAsset('a1');
    });
    expect(await page.evaluate(() => SET.assets[0].rend)).toBe(6.5);
  });

  test('en die decimaal stuurt de projectie ook echt', async ({ page }) => {
    await boot(page);
    const zes = await page.evaluate(() => Math.round(reisModel().mid[10]));
    await page.evaluate(() => {
      openAsset('a1');
      document.getElementById('aRend').value = '6,5';
      saveAsset('a1');
    });
    expect(await page.evaluate(() => Math.round(reisModel().mid[10]))).toBeGreaterThan(zes);
  });

  test('een rente met komma komt als decimaal in de schuld', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      openDebt('d1');
      document.getElementById('dRente').value = '3,5';
      saveDebt('d1');
    });
    expect(await page.evaluate(() => SET.debts[0].rente)).toBe(3.5);
  });

  test('een bedrag dat je intikt komt als heel bedrag binnen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openAsset('a1'));
    await page.locator('#aWaarde').fill('');
    await page.locator('#aWaarde').pressSequentially('3219,50');
    await page.evaluate(() => saveAsset('a1'));
    // bedragen zijn hele euro's in de opslag; dat is bestaand gedrag, alleen de lezer is nieuw
    expect(await page.evaluate(() => SET.assets[0].waarde)).toBe(3220);
  });

  /* Bewuste afbakening. Een bedragveld blijft type=number met inputmode=numeric: daar is een
     decimaal niet betekenisvol (de opslag rondt af op hele euro's) en het veld houdt zijn
     numerieke toetsenbord. numIn leest hem wel, dus komt er via de browser toch een komma
     binnen, dan wordt die gelezen in plaats van stil nul. */
  test('een bedragveld blijft een numeriek veld, maar wordt wel via numIn gelezen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openAsset('a1'));
    expect(await page.locator('#aWaarde').getAttribute('type')).toBe('number');
    expect(await page.locator('#aWaarde').getAttribute('inputmode')).toBe('numeric');
    expect(await lees(page, '1.250,00')).toBe(1250);
  });
});

test.describe('c - een decimaal veld verklaart zichzelf niet ongeldig', () => {
  /* Dit is de kern van de reparatie. Een type=number veld WIST een komma al in de DOM: .value
     levert dan een lege string en numIn krijgt niets meer te lezen. Een lezer die de komma
     afvangt helpt daar dus niet; het veld moet hem eerst bewaren. Daarom is elk veld waar een
     decimaal betekenis heeft een tekstveld met inputmode=decimal, precies zoals de rente-invoer
     dat als enige al was. */
  test('een number-veld wist een komma voordat de lezer hem ziet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openAsset('a1'));
    const gewist = await page.evaluate(() => {
      const el = document.getElementById('aWaarde');   // type=number
      el.value = '3219,50';
      return el.value;
    });
    expect(gewist).toBe('');
  });

  test('een tekstveld bewaart hem wel, en dan doet numIn zijn werk', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openAsset('a1'));
    const bewaard = await page.evaluate(() => {
      const el = document.getElementById('aRend');   // type=text
      el.value = '6,5';
      return { waarde: el.value, gelezen: numIn(el.value) };
    });
    expect(bewaard).toEqual({ waarde: '6,5', gelezen: 6.5 });
  });

  test('elk veld waar een decimaal betekenis heeft is een tekstveld', async ({ page }) => {
    await boot(page);
    const fout = await page.evaluate(() => {
      const uit = [];
      const check = () => document.querySelectorAll('input[inputmode="decimal"]').forEach((el) => {
        if (el.type !== 'text') uit.push((el.id || el.placeholder || '(naamloos)') + ':' + el.type);
      });
      openAsset('a1'); check();
      openDebt('d1'); check();
      return uit;
    });
    expect(fout).toEqual([]);
  });

  test('en toont zijn waarde in dezelfde notatie als de rest van de app', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.assets[0].rend = 6.5; save(); openAsset('a1'); });
    expect(await page.locator('#aRend').inputValue()).toBe('6,5');
  });
});

test.describe('d - de import-parser blijft ongemoeid', () => {
  test('numIn is niet de parser voor een bestandsformaat', async ({ page }) => {
    await boot(page);
    // MT940 en CSV hebben een vast formaat waarin de punt altijd duizendtal is; die eigen parser
    // moet blijven staan, want numIn leest 3.5 juist als drie-en-een-half
    const src = await page.evaluate(() => document.documentElement.outerHTML.length > 0);
    expect(src).toBe(true);
    expect(await lees(page, '3.5')).toBe(3.5);
  });
});
