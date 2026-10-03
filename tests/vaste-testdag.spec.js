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
const { kaalBron } = require('./bron-kaal');

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
     de LAATSTE, want daar is `potjeRest()` per constructie nul.
     EN EEN BIJ v308, op die tweede as: `een-definitie-variabel` eist dat de prognose en het plan
     uiteenlopen, en sinds de klem op de resterende dagen zijn die op de laatste dag allebei nul. */
  const NODIG = ['tempo-zonder-vaste-lasten', 'dagbedrag-potjes', 'zwijgen-met-reden', 'grafiekvormen',
    'potjesregel-diagnose', 'potjesregel-aansluiting', 'potjes-reservering', 'potje-overschreden',
    'een-definitie-variabel', 'budget-liquiditeit', 'geen-verbetering-door-uitgeven',
    'potjes-aansluiting-exact',
    /* v309: `uit-reservering` meet de HOOGTE van de stand-kaart, en de kop van die kaart draagt
       sinds v309 een achtervoegsel dat aan de dag hangt (de tempo-krapte of het dagbedrag), terwijl
       budgetOverZin() op de laatste dag een andere zin zegt. GEMETEN gaf het zwaarste geval op
       30 september 217px op 360px en 199px op 390px; met de pin 199px op beide. */
    'uit-reservering',
    /* v326: VIER ERBIJ, want de piekdag heeft sinds v326 een minimum van 14 verstreken dagen
       (PIEK_MIN_DAGEN). Deze specs lazen het signaal op de lopende maand met de echte klok, en op
       3 oktober 2026 vielen er elf tests op. Met de pin staat de dag op dim - 7. */
    'grootste-uitgave-reservering', 'piekdag-bedrag', 'piekdag-noemer', 'spiegel-en-gevolg',
    /* v310: NEGEN ERBIJ, OP EEN DERDE AS. De zeven van v299 vielen op de op-een-na-laatste dag en de
       zes van v306 op de laatste; deze negen vielen op de EERSTE. Hun fixtures zetten hun boekingen
       op de eerste dagen van de lopende maand met de reden dat die "ruim voor vandaag" liggen, en op
       dag 1 liggen ze in de TOEKOMST: dan valt de datumgrens van contantVerwacht() juist wel, staat
       daysElapsed() op 1 zodat het potje-voorstel verschuift en #valtOpSave uitgeschakeld blijft, en
       is een opzegdatum van vandaag eerder dan een afschrijving van dag 4. GEMETEN op 1 oktober 2026:
       twaalf rood in de volle suite, waarvan elf in contant-stand.
       DRIE VAN DE NEGEN PINNEN EEN GENOEMDE DAG en niet het restant, elk met zijn eigen reden in de
       spec: twee dragen een HARDGECODEERDE maand ('2026-09') en de derde hangt aan de WEEKDAG. Een
       restant pint geen maand en geen weekdag, dus daar kan pinDag() niets. */
    'contant-stand', 'betaaldatum-veld', 'dubbele-boekingen-bevestigen', 'inleg-voor-bestemming',
    'oud-saldo-melden', 'reservering-bevestigen', 'scope-een-bron', 'valt-op-signalen',
    'vaste-lasten',
    /* v315: de knop 'Volgende maand anders' staat alleen in de laatste VALTOP_LAATSTE_DAGEN dagen,
       dus de test die hem langs zijn echte pad tikt pint een dag waarop hij er is. De rest van die
       spec hangt aan de lopende maand en pint het restant. */
    'volgende-maand-actie',
    /* v324: blok 10 leest een venster van 60 dagen vanaf vandaag, en de fixture draagt een vaste maand
       (2026-08). Op 3 oktober 2026 viel het eerste paar uit dat venster: groen op 2 oktober, rood op 3,
       met dezelfde code. Een restant pint geen maand, dus deze pint een genoemde dag. */
    'correctie-en-uitlezing'];
  /* v310: DE BRON WORDT KAAL GELEZEN. Deze drie tests zochten in de RUWE bron, dus een
     `require('./vaste-dag')` of een `pinDag(page)` in een COMMENT hield ze groen. Dat is de vorm die
     v309b heeft opgeruimd, en deze spec was er nog een van (meetles: een bronzoekende assertie die
     een aanroep eist, staat groen op een vermelding). */
  const lees = (f) => kaalBron(fs.readFileSync(path.join(__dirname, f + '.spec.js'), 'utf8'));
  test('geen enkele van hen rekent zijn eigen vaste dag uit', () => {
    for (const f of NODIG) {
      const src = lees(f);
      expect(src, f + ' leest de gedeelde pin niet').toMatch(/require\('\.\/vaste-dag'\)/);
      expect(src, f + ' rekent zijn eigen vaste dag uit').not.toMatch(/clock\.(setFixedTime|install)\(new Date/);
    }
  });

  /* ZONDER DEZE TEST IS DE PIN IN DE VIER NIEUWE SPECS INERT TE MAKEN ZONDER DAT IETS OPVALT: hij
     moet VOOR de goto staan (v299), en een `pinDag` erachter leest de app niet meer. Dit is de
     vorm van meetles (c): de test loopt het pad dat de eigenschap draagt. */
  test('wie de pin gebruikt zet hem voor de eerste goto', () => {
    let gemeten = 0;
    for (const f of NODIG) {
      const src = lees(f);
      /* v310: OOK `pinDatum`, want drie van de negen pinnen een genoemde dag. Alleen op `pinDag`
         zoeken zou die drie stil overslaan, en dan meet deze test ze niet. */
      const pin = Math.min(...['pinDag(page)', 'pinDatum(page'].map((n) => {
        const i = src.indexOf(n); return i < 0 ? Infinity : i;
      }));
      const goto = src.indexOf("page.goto(");
      if (!isFinite(pin) || goto < 0) continue;     // deze spec pint via een eigen klok-argument
      gemeten++;
      expect(pin, f + ' zet de pin na de goto').toBeLessThan(goto);
    }
    /* ZONDER DEZE ONDERGRENS TOETST DE LUS NIETS zodra elke spec via een klok-argument pint
       (meetles a): dan valt hij per constructie in de `continue`. */
    expect(gemeten, 'geen enkele spec gemeten, dus deze test toetst niets').toBeGreaterThan(5);
  });

  /* WIE EEN KLOK ZET LEEST DE GEDEELDE BRON, EN ER IS GEEN UITZONDERING MEER.
     Tot v308 was `potjes-weekvenster.spec.js` de ene uitzondering: hij liep de VENSTERRAND van de
     weekregel af en had dus juist meer dan een dag nodig, en hij leidde zijn eigen maand van
     dertig dagen af. Die weekregel is bij v309 vervallen (de eenheid is de dag geworden, voor
     Inzichten en Home) en met hem die spec, dus de lijst uitzonderingen is nu LEEG. Dat is
     strenger dan de oude vorm en geen verzwakking: elke klokzetter leest de gedeelde bron.
     DE LOOP MAG NIET LEEG ZIJN, anders toetst deze test niets (meetles a): er moet minstens een
     zetter zijn en die moet de bron lezen. */
  test('wie een klok zet leest de gedeelde bron, zonder uitzondering', () => {
    const zetters = fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && f !== 'vaste-dag.js'
      && /clock\.(setFixedTime|install)/.test(fs.readFileSync(path.join(__dirname, f), 'utf8')));
    expect(zetters.length, 'geen enkele klokzetter, dus deze test toetst niets').toBeGreaterThan(0);
    expect(zetters).not.toContain('potjes-weekvenster.spec.js');
    for (const f of zetters) {
      const src = kaalBron(fs.readFileSync(path.join(__dirname, f), 'utf8'));
      expect(src, f + ' zet een klok zonder de gedeelde bron te lezen').toMatch(/require\('\.\/vaste-dag'\)/);
    }
  });
});
