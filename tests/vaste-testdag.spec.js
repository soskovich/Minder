/* v299: de klok van een test staat op een vaste dag, geteld vanaf het EINDE van de maand.
 *
 * DE AANLEIDING: zeven tests in vier bestanden eisten het meervoud van het dagwoord en stonden rood
 * op de op-een-na-laatste dag van een maand, want `maandDagenOver()` rekent `dim - elapsed` en sluit
 * vandaag uit (v257). Tien bekende rode tests maken het ding kapot waarvoor een suite bestaat: een
 * nieuwe rode valt er niet meer tussen op.
 *
 * WAT DEZE SPEC VASTHOUDT, en dat is iets anders dan wat de zeven vasthouden: dat de pin ZELF doet
 * wat hij belooft. Het restant moet in ELKE maandlengte gelijk zijn, want dat is precies wat een
 * vast dagnummer niet geeft: "dag 23" laat 5 dagen over in februari en 8 in maart.
 *
 * ER VERANDERT GEEN APP-GEDRAG. `index.html` is in deze ronde niet aangeraakt; wat verschuift is
 * alleen op welk moment een test de app bekijkt.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { seed, open } = require('./budget-fixture');
const { pinDag, vasteDatum, DAGEN_OVER } = require('./vaste-dag');

const dimVan = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

test.describe('a - de gekozen dag laat overal evenveel over', () => {
  /* VIER MAANDLENGTES, want dat is de as waarop een vast dagnummer omvalt. Februari 2024 heeft er
     29 en 2025 heeft er 28, dus de schrikkeldag staat er apart bij. */
  test('in een maand van 28, 29, 30 en 31 dagen blijven er evenveel over', () => {
    for (const ref of [new Date(2025, 1, 10), new Date(2024, 1, 10),
                       new Date(2026, 3, 10), new Date(2026, 2, 10)]) {
      const d = vasteDatum(DAGEN_OVER, ref);
      const dim = dimVan(ref);
      expect(dim, 'de vier referenties moeten echt verschillende maandlengtes hebben')
        .toBe([28, 29, 30, 31][[28, 29, 30, 31].indexOf(dim)]);
      expect(dim - d.getDate(), 'maand van ' + dim + ' dagen').toBe(DAGEN_OVER);
      expect(d.getMonth(), 'hij blijft in dezelfde maand').toBe(ref.getMonth());
      expect(d.getHours(), 'de middag, zodat een zomertijdsprong de dag niet verschuift').toBe(12);
    }
  });

  /* ZONDER DIT VERSCHIL TOETST DE TEST HIERBOVEN NIETS: waren alle vier de maanden even lang, dan
     gaf een vast dagnummer hetzelfde antwoord en zou de sabotage erop groen blijven. */
  test('de vier referentiemaanden verschillen werkelijk in lengte', () => {
    const lengtes = [new Date(2025, 1, 10), new Date(2024, 1, 10),
                     new Date(2026, 3, 10), new Date(2026, 2, 10)].map(dimVan);
    expect([...new Set(lengtes)].sort()).toEqual([28, 29, 30, 31]);
  });

  test('een restant dat niet in de maand past faalt luid in plaats van stil', () => {
    expect(() => vasteDatum(40, new Date(2026, 1, 10))).toThrow(/past niet/);
  });
});

test.describe('b - de app ziet die dag ook echt', () => {
  test('maandDagenOver leest het gepinde restant en niet de echte kalender', async ({ page }) => {
    await pinDag(page);
    await open(page, seed());
    const r = await page.evaluate(() => ({ dagen: maandDagenOver(thisYM()), ymd: vandaagYMD(),
      elapsed: daysElapsed(thisYM()).elapsed, dim: daysElapsed(thisYM()).dim }));
    expect(r.dagen).toBe(DAGEN_OVER);
    expect(r.dim - r.elapsed).toBe(DAGEN_OVER);
    expect(r.ymd.slice(8, 10)).toBe(String(vasteDatum().getDate()).padStart(2, '0'));
  });

  /* DE PIN MOET VOOR `page.goto()` STAAN. Erna leest de boot nog de echte klok, en dan verschilt
     alleen wat je daarna uitrekent van wat de app bij het opstarten zag. Dit geval onderscheidt de
     twee, en zonder deze test zou een spec die de pin te laat zet er stil doorheen komen. */
  test('na de boot gezet telt hij niet meer voor wat de boot zelf las', async ({ page }) => {
    await open(page, seed());
    const voor = await page.evaluate(() => vandaagYMD());
    expect(voor.slice(8, 10)).toBe(String(new Date().getDate()).padStart(2, '0'));
  });
});

test.describe('c - de specs die een vaste dag nodig hebben lezen dezelfde bron', () => {
  /* EEN TWEEDE PIN NAAST DEZE ZOU EEN TWEEDE WAARHEID ZIJN over welke dag een test bekijkt (v104).
     Deze test valt zodra een van hen zijn eigen datum gaat uitrekenen.
     DE LIJST STAAT BIJ NAAM EN IS NIET AFGELEID, en dat is met opzet: hij is de verzameling specs
     waarvan de asserties AAN DE DAG hangen, en dat is een eigenschap van hun asserties en niet van
     hun broncode. Een spec die geen vaste dag nodig heeft hoort er niet in gedwongen te worden.
     Wat de test wel vangt is de enige fout die hier telt: een van hen die de pin loslaat.
     VIER KWAMEN ER BIJ v306 BIJ, op een tweede as: de zeven van v299 eisten het MEERVOUD van het
     dagwoord en vielen op de op-een-na-laatste dag; deze zes meten een RESERVERING en vielen op
     de LAATSTE, want daar is `potjeRest()` per constructie nul. */
  const NODIG = ['tempo-zonder-vaste-lasten', 'dagbedrag-potjes', 'zwijgen-met-reden', 'grafiekvormen',
    'potjesregel-diagnose', 'potjesregel-aansluiting', 'potjes-reservering', 'potje-overschreden'];
  test('geen enkele van hen rekent zijn eigen vaste dag uit', () => {
    for (const f of NODIG) {
      const src = fs.readFileSync(path.join(__dirname, f + '.spec.js'), 'utf8');
      expect(src, f + ' leest de gedeelde pin niet').toMatch(/require\('\.\/vaste-dag'\)/);
      expect(src, f + ' rekent zijn eigen vaste dag uit').not.toMatch(/clock\.(setFixedTime|install)\(new Date/);
    }
  });

  /* ZONDER DEZE TEST IS DE PIN IN DE VIER NIEUWE SPECS INERT TE MAKEN ZONDER DAT IETS OPVALT: hij
     moet VOOR de goto staan (v299), en een `pinDag` erachter leest de app niet meer. Dit is de
     vorm van meetles (c): de test loopt het pad dat de eigenschap draagt. */
  test('wie de pin gebruikt zet hem voor de eerste goto', () => {
    for (const f of NODIG) {
      const src = fs.readFileSync(path.join(__dirname, f + '.spec.js'), 'utf8');
      const pin = src.indexOf('pinDag(page)');
      const goto = src.indexOf("page.goto(");
      if (pin < 0 || goto < 0) continue;            // deze spec pint via een eigen klok-argument
      expect(pin, f + ' zet de pin na de goto').toBeLessThan(goto);
    }
  });

  /* WIE EEN KLOK ZET LEEST DE GEDEELDE BRON, MET EEN UITZONDERING DIE ZIJN REDEN DRAAGT.
     `potjes-weekvenster.spec.js` LOOPT DE VENSTERRAND AF en heeft dus juist MEER dan een dag nodig;
     een gedeelde vaste dag zou daar precies de meting weghalen. Hij is om dezelfde reden niet een
     van de zeven die omvielen: hij leidt zijn eigen maand van DERTIG dagen af in plaats van de
     echte maand te nemen, dus zijn dagen staan al vast. Deze test houdt die twee dingen vast: dat
     de lijst uitzonderingen niet stilletjes groeit, en dat de uitzondering zelf niet op de echte
     dag-van-de-maand leunt. */
  test('wie een klok zet leest de gedeelde bron, op een uitzondering na die zijn eigen dagen aflopt', () => {
    const UITZONDERING = 'potjes-weekvenster.spec.js';
    const zetters = fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && f !== 'vaste-dag.js'
      && /clock\.(setFixedTime|install)/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
    expect(zetters, 'de uitzondering moet er zijn, anders toetst de rest niets').toContain(UITZONDERING);
    for (const f of zetters) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      if (f === UITZONDERING) {
        expect(src, 'de uitzondering leidt zijn eigen maandlengte af').toMatch(/maand30/);
        continue;
      }
      expect(src, f + ' zet een klok zonder de gedeelde bron te lezen').toMatch(/require\('\.\/vaste-dag'\)/);
    }
  });
});
