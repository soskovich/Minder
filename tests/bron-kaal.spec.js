/* v309: de gedeelde comment-strip voor bronzoekende tests.
 *
 * HET GEVAL, GEMETEN: een bronzoekende test die `fn.toString()` leest, leest de LIVE functie MET
 * haar commentaar. `een-definitie-variabel.spec.js` eiste dat `safeToSpend()` de tempo-som aanroept,
 * en die aanroep staat daar sinds `v254` NIET meer in de code maar nog wel twee keer in de uitleg:
 * nul treffers in de code, twee in de comments. Diezelfde test eiste hetzelfde van
 * `nogDezeMaandPosten()`, en daar werd het bij `v309` waar op precies dezelfde manier. Twee
 * asserties die groen stonden op een comment, en dat is een test die niet kan falen.
 *
 * ER WAREN DRIE VERSCHILLENDE STRIPS IN DEZE SUITE, en geen van de drie was volledig: 21 bestanden
 * streepten alleen blok-comments weg en 7 alleen regel-comments, dus in beide groepen kon een
 * aanroep zich in de andere soort verstoppen. Nu is er EEN implementatie met drie ingangen
 * (`kaalBron`, `kaalUit`, `KAAL_JS`), en deze spec houdt vast dat niemand er een vierde naast zet.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { kaalBron, kaalUit, KAAL_JS } = require('./bron-kaal');

const DIR = __dirname;
const SPECS = fs.readdirSync(DIR).filter((f) => f.endsWith('.spec.js'));

test.describe('a - de eigenschap: een aanroep in een comment is geen aanroep', () => {
  /* DE SABOTAGE IN TESTVORM. Dit is het geval waar de hele helper voor bestaat: `verstopt(` staat
     alleen in het commentaar en `echt(` alleen in de code. Een strip die zijn werk niet doet laat
     de eerste staan, en dan is elke `toContain` erop groen op een vermelding. */
  function voorbeeld() {
    /* deze uitleg noemt verstoptBlok() en dat is geen aanroep */
    return echtBlok();          // en deze noemt verstoptRegel()
  }

  test('een naam die alleen in een blok-comment staat valt weg', () => {
    const k = kaalBron(voorbeeld);
    expect(voorbeeld.toString()).toContain('verstoptBlok(');   // de invoer draagt het geval
    expect(k).not.toContain('verstoptBlok(');
  });

  test('een naam die alleen in een regel-comment staat valt ook weg', () => {
    const k = kaalBron(voorbeeld);
    expect(voorbeeld.toString()).toContain('verstoptRegel(');
    expect(k).not.toContain('verstoptRegel(');
  });

  test('een echte aanroep blijft staan', () => {
    expect(kaalBron(voorbeeld)).toContain('echtBlok(');
  });

  test('hij neemt een functie of een string', () => {
    expect(kaalBron(voorbeeld)).toBe(kaalBron(voorbeeld.toString()));
    expect(kaalBron(null)).toBe('');
    expect(kaalBron(undefined)).toBe('');
  });
});

test.describe('b - de strip is niet te agressief, en dat is een meetles', () => {
  /* Uit CLAUDE.md: een strip die elke `//` weghaalt breekt op `https://` en op een `//` binnen een
     string, en dan lijkt een schrijver onzichtbaar terwijl hij er staat. */
  test('een // in een URL blijft staan', () => {
    const t = "const u = 'https://example.test/pad'; roep(u);";
    expect(kaalBron(t)).toContain('example.test/pad');
    expect(kaalBron(t)).toContain('roep(');
  });

  test('een // binnen een string blijft staan', () => {
    const t = `const s = "a // b"; roep(s);`;
    expect(kaalBron(t)).toContain('a // b');
    expect(kaalBron(t)).toContain('roep(');
  });

  test('een blok-comment wordt door spaties vervangen, dus de regelnummers kloppen nog', () => {
    const t = 'een\n/* twee\n   drie */\nvier';
    expect(kaalBron(t).split('\n').length).toBe(t.split('\n').length);
    expect(kaalBron(t).split('\n')[3]).toBe('vier');
  });
});

test.describe('c - kaalUit leest de pagina en faalt luid', () => {
  const boot = async (page) => {
    await page.route('**/sw.js', (r) => r.abort());
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof totals === 'function');
  };

  test('hij geeft de bron van een app-functie zonder commentaar', async ({ page }) => {
    await boot(page);
    const ruw = await page.evaluate(() => String(insBudgetBlok));
    const kaal = await kaalUit(page, 'insBudgetBlok');
    expect(ruw.length).toBeGreaterThan(kaal.length);       // er zat commentaar in
    expect(kaal).toContain('varPotjeStand(');              // en de aanroep staat er nog
  });

  test('meer dan een naam geeft de bronnen achter elkaar', async ({ page }) => {
    await boot(page);
    const een = await kaalUit(page, 'insBudgetBlok');
    const twee = await kaalUit(page, 'insBudgetBlok', 'nogDezeMaandPosten');
    expect(twee.length).toBeGreaterThan(een.length);
    expect(twee).toContain('varPotjeStand(');
  });

  /* Een lege string laat elke `not.toContain` per constructie slagen, en dat is een test die niet
     kan vallen. Dus faalt hij luid, net als `sectieVan()`. */
  test('een naam die niet bestaat gooit in plaats van leeg terug te geven', async ({ page }) => {
    await boot(page);
    await expect(kaalUit(page, 'bestaatNietInDeApp')).rejects.toThrow(/bestaat niet in de pagina/);
  });

  test('KAAL_JS levert in de pagina dezelfde uitkomst als in Node', async ({ page }) => {
    await boot(page);
    const inPagina = await page.evaluate((kj) => eval(kj)(String(insBudgetBlok)), KAAL_JS);
    expect(inPagina).toBe(await kaalUit(page, 'insBudgetBlok'));
  });
});

test.describe('d - de tripdraad: niemand schrijft zijn eigen strip', () => {
  /* DE EIS IS DE VORM EN NIET HET GEVAL (v271/v272/v293). Drie verschillende strips zijn hier
     ontstaan doordat elke ronde er een bij schreef uit de spec ernaast, en twee van de drie waren
     half. Deze test valt zodra er een vierde bij komt. */
  const STRIP = /replace\(\s*\/\\\/\\\*\[\\s\\S\]\*\?\\\*\\\/\/|replace\(\s*\/\\\/\\\/\[\^\\n\]\*\/|replace\(\s*\/\(\^\|\[\^:\\w\]\)\\\/\\\//;

  test('geen enkele spec strept zelf commentaar weg', () => {
    const fout = [];
    for (const f of SPECS.concat(['vaste-dag.js', 'bron-sectie.js'])) {
      const t = fs.readFileSync(path.join(DIR, f), 'utf8');
      if (STRIP.test(t)) fout.push(f);
    }
    expect(fout, 'deze bestanden strippen zelf: ' + fout.join(', ')).toEqual([]);
  });

  test('de helper heeft echte lezers, dus deze eis is niet leeg', () => {
    /* Zonder deze ondergrens zou de test hierboven ook groen staan in een suite die helemaal niet
       meer naar de bron kijkt, en dan toetst hij niets (meetles a). */
    const lezers = SPECS.filter((f) => /require\('\.\/bron-kaal'\)/.test(fs.readFileSync(path.join(DIR, f), 'utf8')));
    console.log(`### ${lezers.length} specs lezen de gedeelde strip`);
    expect(lezers.length).toBeGreaterThanOrEqual(25);
    expect(lezers).toContain('een-definitie-variabel.spec.js');   // de spec die de vondst opleverde
  });

  test('de strip staat maar een keer in de suite, en dat is in de helper', () => {
    const h = fs.readFileSync(path.join(DIR, 'bron-kaal.js'), 'utf8');
    expect((h.match(/function kaalBron\(/g) || []).length).toBe(1);
    // en KAAL_JS is de bron van diezelfde functie en geen tweede kopie
    expect(h).toContain("const KAAL_JS = '(' + kaalBron.toString() + ')'");
  });
});
