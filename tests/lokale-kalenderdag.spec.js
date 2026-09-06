// v199: een datum die een kalenderdag bedoelt komt uit ymdVan()/vandaagYMD(); toISOString() is
// alleen voor wat een API of een uitwisselingsformaat in gaat.
//
// Deze fout is drie keer opgetreden: v177 in 'Gelezen op' en de signaalmatching, v198 in het
// PSD2-saldostempel, en v199 in de accshort-sleutel. De correctie van v177 bleef onvolledig omdat
// er toen alleen naar `new Date().toISOString()` is gekeken. Deze spec toetst daarom de VORM en
// niet de plek: `new Date(<iets>).toISOString()` valt net zo goed als `new Date().toISOString()`.
//
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BRON = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* Comments eruit, maar niet de // in een URL of in een string: dat weghalen maakt juist regels
   onzichtbaar (die fout maakte de v197-analyse eerst onbruikbaar). Blokcomments worden door lege
   regels vervangen in plaats van verwijderd, zodat de regelnummers in een foutmelding kloppen. */
function strip(t) {
  t = t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return t.split('\n').map((ln) => {
    const m = /(^|[\s;})])\/\/(?!\/)/.exec(ln);
    if (!m) return ln;
    const voor = ln.slice(0, m.index + m[1].length);
    if (/http/.test(ln.slice(Math.max(0, m.index - 8), m.index))) return ln;
    const even = (x, c) => (x.split(c).length - 1) % 2 === 0;
    if (!even(voor, "'") || !even(voor, '"') || !even(voor, '`')) return ln;
    return voor;
  }).join('\n');
}
const CODE = strip(BRON);
const REGELS = CODE.split('\n');

/* De bestemming bepalen in plaats van de plek herkennen. Er zijn precies twee bestemmingen waar
   ISO hoort, en een voorkomen is alleen goed als het aantoonbaar daarheen gaat:
     - een parameter die de PSD2-API in gaat, direct of via een variabele die in een psd2Api()-
       aanroep wordt gebruikt;
     - een uitwisselbaar moment in de briefingexport (gegenereerd_op), dat geen kalenderdag is.
   Alles daarbuiten bedoelt een kalenderdag en hoort ymdVan()/vandaagYMD() te gebruiken. Een datum
   die nergens heen gaat maar wél wordt opgeslagen telt als intern: een opslagveld wordt later
   vergeleken. */
function bestemming(regel) {
  if (/gegenereerd_op\s*:/.test(regel)) return 'uitwisselingsformaat';
  if (/date_from=/.test(regel)) return 'api-parameter';
  const m = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;]*toISOString\s*\(/.exec(regel);
  if (m) {
    const naam = m[1];
    // de variabele telt alleen als API-parameter wanneer hij ook echt aan date_from wordt geplakt
    const naarApi = new RegExp("date_from='\\+" + naam).test(CODE);
    if (naarApi) return 'api-parameter';
  }
  return null;
}

function voorkomens() {
  const uit = [];
  const re = /toISOString\s*\(/g;
  let m;
  while ((m = re.exec(CODE)) !== null) {
    const nr = CODE.slice(0, m.index).split('\n').length;
    uit.push({ nr, regel: REGELS[nr - 1].trim(), naar: bestemming(REGELS[nr - 1]) });
  }
  return uit;
}

test.describe('a · elke toISOString gaat naar buiten', () => {
  test('er is er geen die een kalenderdag bedoelt', async () => {
    const gevonden = voorkomens();
    expect(gevonden.length).toBeGreaterThan(0);            // anders toetst deze spec niets
    const fout = gevonden.filter((v) => !v.naar);
    expect(fout.map((v) => `regel ${v.nr}: ${v.regel.slice(0, 90)}`)).toEqual([]);
  });

  test('beide bestemmingen komen echt voor', async () => {
    // een bestemming die nergens voorkomt dekt niets af; dan is de test stiller dan hij lijkt
    const naar = voorkomens().map((v) => v.naar);
    expect(naar).toContain('api-parameter');
    expect(naar).toContain('uitwisselingsformaat');
  });

  /* Het gat waardoor de v177-correctie onvolledig bleef: daar is alleen gezocht op de vorm zonder
     argument. Deze toets kijkt naar `toISOString(` en vangt dus beide. */
  test('de toets vangt ook de vorm met een argument', async () => {
    const proef = [
      "  const sleutel='x-'+new Date(ts).toISOString().slice(0,10);",
      "  const vandaag=new Date().toISOString().slice(0,10);",
      "  SET.stempel=new Date(t).toISOString().slice(0,10);",
    ];
    for (const regel of proef) {
      expect(/toISOString\s*\(/.test(regel), regel).toBe(true);
      expect(bestemming(regel), regel).toBeNull();         // geen bestemming = zou de test laten vallen
    }
  });

  test('en hij laat de twee echte bestemmingen wel door', async () => {
    expect(bestemming("  return { gegenereerd_op:new Date().toISOString(), blokken };")).toBe('uitwisselingsformaat');
    expect(bestemming("  const dp=await psd2Api('/x?date_from='+fp.toISOString().slice(0,10));")).toBe('api-parameter');
  });
});

test.describe('b · één formule voor de lokale dag', () => {
  test('ymdVan is de enige plek waar hij staat', async () => {
    const formule = /getFullYear\(\)\s*\+\s*'-'\s*\+\s*String\([^)]*getMonth\(\)\s*\+\s*1\)[^;]*getDate\(\)/g;
    const treffers = CODE.match(formule) || [];
    expect(treffers.length).toBe(1);                       // alleen in ymdVan()
    expect(/function ymdVan\(d\)\{[\s\S]{0,200}getDate\(\)/.test(CODE)).toBe(true);
  });

  test('vandaagYMD leunt erop en rekent niet zelf', async () => {
    expect(/function vandaagYMD\(\)\{\s*return ymdVan\(new Date\(\)\);\s*\}/.test(CODE)).toBe(true);
  });

  test('de back-upnaam gebruikt de helper', async () => {
    expect(CODE).toContain("'minder-backup-'+vandaagYMD()+'.json'");
  });
});

test.describe('c · ymdVan geeft een lokale dag, ook op lokale middernacht', () => {
  async function boot(page) {
    await page.route('**/sw.js', (r) => r.abort());
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof ymdVan === 'function');
  }

  test('een Date en een timestamp geven dezelfde dag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const d = new Date(2026, 6, 14, 0, 0, 0, 0);         // 14 juli, lokale middernacht
      return { uitDate: ymdVan(d), uitTs: ymdVan(d.getTime()), iso: d.toISOString().slice(0, 10) };
    });
    expect(r.uitDate).toBe('2026-07-14');
    expect(r.uitTs).toBe('2026-07-14');
    // en dit is precies waarom: op lokale middernacht wijst ISO naar de dag ervoor
    expect(r.iso).toBe('2026-07-13');
  });

  test('ook in wintertijd wijkt ISO af op middernacht', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const d = new Date(2026, 0, 14, 0, 0, 0, 0);         // 14 januari, lokale middernacht
      return { lokaal: ymdVan(d), iso: d.toISOString().slice(0, 10) };
    });
    expect(r.lokaal).toBe('2026-01-14');
    expect(r.iso).toBe('2026-01-13');
  });

  test('vandaagYMD is de dag van de klok', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const n = new Date();
      const hand = n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0')
        + '-' + String(n.getDate()).padStart(2, '0');
      return { helper: vandaagYMD(), hand };
    });
    expect(r.helper).toBe(r.hand);
  });
});

test.describe('d · de accshort-sleutel noemt de dag die je ziet', () => {
  const MAIN = 'NL01MAIN0000001111';
  test('de sleutel komt uit ymdVan, niet uit toISOString', async ({ page }) => {
    await page.route('**/sw.js', (r) => r.abort());
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof scoreNotifs === 'function');
    const src = await page.evaluate(() => scoreNotifs.toString().replace(/\/\*[\s\S]*?\*\//g, ''));
    expect(src).toContain("'accshort-'+s.acc+'-'+ymdVan(s.t)");
    expect(src).not.toMatch(/accshort[^;]*toISOString/);
  });

  /* accshort staat in CRIT en is dus niet te snoozen; de datum in de sleutel houdt alleen twee
     shortfalls uit elkaar. Dat blijft zo, en de sleutel noemt nu de dag van de afschrijving. */
  test('de groep blijft accshort, dus snooze en mute veranderen niet', async ({ page }) => {
    await page.route('**/sw.js', (r) => r.abort());
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof scoreNotifs === 'function');
    const r = await page.evaluate(() => {
      const sleutel = 'accshort-' + 'NL01' + '-' + ymdVan(new Date(2026, 6, 14, 0, 0, 0, 0));
      return { groep: sleutel.split('-')[0], sleutel,
        crit: /CRIT=new Set\(\['lowbal','accshort'\]\)/.test(scoreNotifs.toString()) };
    });
    expect(r.groep).toBe('accshort');
    expect(r.sleutel).toContain('2026-07-14');
    expect(r.crit).toBe(true);
  });
});
