/* v282: een rekening die er twee keer staat krijgt een ingang, en een bank wordt niet meer geraden.
 *
 * TWEE AANLEIDINGEN, beide gemeten op het toestel na de herkoppeling van 28 sep 2026.
 *
 * 1. `psd2_874633c7` is een psd2-rekening die niet meer in SET.psd2Accounts staat, met TWEE boekingen die
 *    per de identiteit van de app (`txId`) ook op `100110012351717586` staan. `rekeningOverlap()` eist
 *    minstens 3 gedeelde `_softKey`s en 60 procent van de kleinste kant, dus hij ziet hem per constructie
 *    niet. En omdat `rekOverlapRegel()` alleen bij een treffer een regel gaf, was de sheet met de
 *    samenvoeg-ingang niet eens te OPENEN: geen melding, geen ingang. Dat is de meetles dat een melding de
 *    enige drager van een ingang kan zijn, nu op zichzelf.
 *
 * 2. `buildAccMeta()` deed `bank: pm?pm.bank : isCSV?'N26':'ABN AMRO'`, dus die wees heette ABN AMRO
 *    terwijl zijn boekingen "From Main to Buffer Comfort" zeggen. Dat heeft gevolgen: sectie 6 van blok 10
 *    groepeert op `bron|bank` en die indeling beslist de as.
 *
 * WAT DE FIXTURE DRAAGT, en waarom elk stuk erin zit:
 *  - WEES met precies TWEE boekingen, allebei ook op DOEL. Dat is de vorm die de drempel niet haalt;
 *  - HALF met DRIE boekingen waarvan er maar twee elders staan: losgekoppeld, maar geen wees;
 *  - een mt940-rekening en een csv-rekening, want die twee banknamen volgen uit de PARSER en mogen blijven;
 *  - een gekoppelde rekening met een IBAN en een LEGE banknaam, met dezelfde bankcode als DOEL: die leent
 *    de naam van je eigen andere rekening. En een tweede met een NL-IBAN waarvan geen andere rekening de
 *    code draagt, want die moet `onbekend` blijven in plaats van een naam te krijgen die niet gemeten is.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');

const WEES = 'psd2_874633c7';            // 2 boekingen, beide ook op DOEL
const DOEL = '100110012351717586';       // de opvolger, id uit ibanNum()
const HALF = 'psd2_deadbeef';            // losgekoppeld, maar niet elke boeking staat elders
const ABN = '521200806';                 // mt940, dus ABN AMRO volgt uit de parser
const CSVREK = 'N26 Buffer Comfort';     // csv, dus N26 volgt uit de parser
const LEEGBANK = '100110019999999999';   // gekoppeld, IBAN met dezelfde bankcode als DOEL, bank leeg
const NLBANK = '636222403';              // gekoppeld, NL-IBAN, bank leeg, geen andere rekening met die code
/* v282: EEN WEES MET PRECIES ZOVEEL BOEKINGEN ALS ZIJN DOEL, en dat is het geval waarop `'vast'` in
   `rekSamenvoegVraag()` verschil MAAKT. Zonder die derde parameter kiest hij de nieuwste machtiging en
   anders de rekening met de meeste boekingen; een wees heeft geen machtiging, dus het valt op het aantal,
   en bij GELIJK aantal wint dan de wees en verdwijnt juist de gekoppelde rekening. Meer boekingen dan zijn
   doel kan een wees niet hebben (het doel moet ze allemaal dragen), dus gelijk is het enige pad erheen.
   Zonder dit paar viel de sabotage die `'vast'` weghaalt alleen op de BRON en niet op het gedrag. */
const GELIJK = 'psd2_gelijk11';
const GDOEL = '100110012252714323';
const WEG = 'psd2_verdwenen1';           // staat in valutaTally, niet in OWN en niet in ACCMETA

const W1 = { d: '2026-05-05', a: -12.5, n: 'Q Park', desc: 'Q Park Hermitage PMNT' };
const W2 = { d: '2026-05-20', a: -8.25, n: 'NS Reizigers', desc: 'NS Reizigers B.V. PMNT' };
const H1 = { d: '2026-04-01', a: -5, n: 'Splif', desc: 'Splif Purmerend PMNT' };
const H2 = { d: '2026-04-02', a: -6, n: 'Vomar', desc: 'Vomar Purmerend PMNT' };
const H3 = { d: '2026-04-03', a: -7, n: 'Kruidvat', desc: 'Kruidvat 2534 PMNT' };
const G1 = { d: '2026-07-07', a: -21, n: 'Tango', desc: 'Tango Purmerend PMNT' };
const G2 = { d: '2026-07-08', a: -22, n: 'Shell', desc: 'ShellExpress Amste PMNT' };

const rij = (acc, src, rows) => rows.map((r, i) => ({ id: acc + '_s' + i, date: r.d, amount: r.a, acc, src,
  name: r.n, desc: r.desc || r.n, typ: '', ref: '', accName: '', refNums: [] }));

function seed(opt) {
  opt = opt || {};
  const alles = rij(WEES, 'psd2', [W1, W2])
    /* DOEL draagt dezelfde dag, hetzelfde bedrag en dezelfde desc, dus na `categorize()` dezelfde t.id
       als `txId(weesboeking, DOEL)`. Dat is precies wat een herkoppeling oplevert. */
    .concat(rij(DOEL, 'psd2', [W1, W2, { d: '2026-09-25', a: -30, n: 'Plus de Gors', desc: 'Plus de Gors PMNT' }]))
    .concat(rij(HALF, 'psd2', [H1, H2, H3]))
    .concat(rij(DOEL, 'psd2', opt.halfMee === false ? [] : [H1, H2]))
    .concat(rij(ABN, 'mt940', [{ d: '2026-03-10', a: -40, n: 'BEA, BETAALPAS JUMBO', desc: 'BEA, BETAALPAS JUMBO GILDEPLEIN NR:281507, 10.03.26/12:39 PURMEREND' }]))
    .concat(rij(CSVREK, 'csv', [{ d: '2026-02-11', a: -15, n: 'Vomar', desc: 'Vomar Purmerend' }]))
    .concat(rij(LEEGBANK, 'psd2', [{ d: '2026-06-01', a: -9, n: 'Splif', desc: 'Splif PMNT' }]))
    .concat(rij(NLBANK, 'psd2', [{ d: '2026-06-02', a: -11, n: 'Vomar', desc: 'Vomar PMNT' }]))
    .concat(rij(GELIJK, 'psd2', [G1, G2])).concat(rij(GDOEL, 'psd2', [G1, G2]));
  const ps = {
    [DOEL]: { uid: 'u-doel', iban: 'DE89' + DOEL, hash: 'h-doel', label: 'Buffer Comfort', bank: 'N26', exp: '2026-12-27' },
    [LEEGBANK]: { uid: 'u-leeg', iban: 'DE89' + LEEGBANK, hash: '', label: 'Zonder naam', bank: '', exp: '2026-12-27' },
    [NLBANK]: { uid: 'u-nl', iban: 'NL05ABNA0636222403', hash: '', label: 'Zonder naam NL', bank: '', exp: '2026-12-27' },
    [GDOEL]: { uid: 'u-gd', iban: 'DE89' + GDOEL, hash: 'h-gd', label: 'Zakgeld', bank: 'N26', exp: '2026-12-27' },
  };
  if (opt.weesGekoppeld) ps[WEES] = { uid: 'u-wees', iban: '', hash: '', label: 'Space', bank: 'N26', exp: '2026-12-27' };
  return {
    minder_tx: JSON.stringify(alles), minder_ovr: '{}',
    minder_own: JSON.stringify([...new Set(alles.map((t) => t.acc))]),
    minder_accmeta: JSON.stringify({ [WEES]: { balance: 0, date: '2026-07-08' },
      [DOEL]: { balance: 37, date: '2026-09-28' }, [HALF]: { balance: 0, date: '2026-07-08' },
      [ABN]: { balance: 768, date: '2026-09-28' }, [LEEGBANK]: { balance: 5, date: '2026-09-28' },
      [NLBANK]: { balance: 6, date: '2026-09-28' } }),
    minder_set: JSON.stringify({ limit: 70, toonLegeRek: true, manualBal: {}, budgets: { boodschappen: 500 },
      psd2Accounts: ps, psd2LastSync: Date.now(),
      /* een teller op een rekening die NIET in OWN staat. Dat is het enige pad waarlangs de terugval van
         `bankVan()` in blok 10 bereikbaar is: elke andere aanroeper groepeert over TX en komt dus altijd
         in ACCMETA uit. Zonder deze entry is een sabotage op die terugval per constructie inert (v281). */
      valutaTally: { [WEG]: { gezien: 9, veld: 9, anders: 0, nieuw: 1, verrijkt: 8, op: '2026-09-28' } } }),
    minder_plan: '{}',
  };
}

async function boot(page, opt) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof rekWezen === 'function' && typeof bankVanRek === 'function');
}

test.describe('0 · de fixture draagt het geval dat de drempel niet haalt', () => {
  test('de wees heeft twee boekingen en rekeningOverlap() ziet hem daarom niet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => ({
      n: TX.filter((t) => t.acc === v.WEES).length,
      gekoppeld: !!(SET.psd2Accounts || {})[v.WEES],
      overlap: rekeningOverlap().map((o) => o.a + '|' + o.b),
      leeg: rekZonderBoekingen(),
    }), { WEES });
    expect(r.n, 'met meer dan twee boekingen kan de drempel hem wel halen en toetst de test niets').toBe(2);
    expect(r.gekoppeld).toBe(false);
    expect(r.overlap.join(' '), 'ziet rekeningOverlap() hem al, dan is er geen nieuwe detectie nodig').not.toContain(WEES);
    expect(r.leeg, 'met een lege gekoppelde rekening zou de oude melding al vuren').toEqual([]);
  });

  test('beide boekingen van de wees hebben op het doel dezelfde t.id, en de helft-rekening niet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      const ids = new Set(TX.filter((t) => t.acc === v.DOEL).map((t) => t.id));
      const raak = (a) => TX.filter((t) => t.acc === a).map((t) => ids.has(txId(t, v.DOEL)));
      return { wees: raak(v.WEES), half: raak(v.HALF) };
    }, { WEES, DOEL, HALF });
    expect(r.wees).toEqual([true, true]);
    expect(r.half, 'zonder een gedeeltelijk geval toetst "alle boekingen en niet de meeste" niets').toEqual([true, true, false]);
  });

  test('het gelijke paar heeft aan beide kanten hetzelfde aantal boekingen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => ({
      wees: TX.filter((t) => t.acc === v.GELIJK).length, doel: TX.filter((t) => t.acc === v.GDOEL).length,
      /* zonder 'vast' kiest rekSamenvoegVraag() op het aantal, en bij gelijk aantal wint de EERSTE */
      zouKiezen: (() => { const fa = rekFeiten(v.GELIJK), fb = rekFeiten(v.GDOEL);
        return ((fa.exp && fb.exp && fa.exp !== fb.exp) ? (fa.exp > fb.exp) : (fa.tx >= fb.tx)) ? v.GELIJK : v.GDOEL; })(),
    }), { GELIJK, GDOEL });
    expect(r.wees).toBe(r.doel);
    expect(r.zouKiezen, 'loopt de keuze zonder "vast" toch goed af, dan toetst de richting-test niets').toBe(GELIJK);
  });
});

test.describe('1 · rekWezen() staat los van de overlap-drempel', () => {
  test('de wees wordt gevonden met twee boekingen, en het doel staat erbij', async ({ page }) => {
    await boot(page);
    /* per rekening gelezen en niet over de hele lijst: een assertie op de lengte valt om zodra de fixture
       een tweede geval krijgt, en dan zegt hij niets meer over DIT geval (v281, meetles j). */
    const r = await page.evaluate(() => { const m = {}; for (const w of rekWezen()) m[w.acc] = w; return m; });
    expect(Object.keys(r).sort()).toEqual([GELIJK, WEES].sort());
    expect(r[WEES].doelen).toEqual([DOEL]);
    expect(r[WEES].tx).toBe(2);
    expect(r[GELIJK].doelen).toEqual([GDOEL]);
  });

  test('een losgekoppelde rekening waarvan niet ALLE boekingen elders staan is geen wees', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ los: rekLosgekoppeld(), wees: rekWezen().map((w) => w.acc) }));
    expect(r.los.sort()).toEqual([GELIJK, HALF, WEES].sort());
    expect(r.wees, 'HALF mist een boeking op het doel en hoort dus niet bij de wezen').not.toContain(HALF);
    expect(r.wees).toContain(WEES);
  });

  test('een rekening die nog gekoppeld is, is geen wees', async ({ page }) => {
    await boot(page, { weesGekoppeld: true });
    const r = await page.evaluate(() => ({ los: rekLosgekoppeld(), wees: rekWezen().map((w) => w.acc) }));
    expect(r.los).not.toContain(WEES);
    expect(r.wees).not.toContain(WEES);
  });

  test('zonder enige boeking elders is er geen doel en dus geen wees', async ({ page }) => {
    await boot(page, { halfMee: false });
    const r = await page.evaluate(() => rekWezen().map((w) => w.acc));
    expect(r, 'de wees blijft, want zijn twee boekingen staan nog wel op het doel').toContain(WEES);
    expect(r, 'HALF heeft nu geen enkele boeking elders').not.toContain(HALF);
  });
});

test.describe('2 · de ingang bestaat, ook als de overlap leeg is', () => {
  test('de melding in Instellingen vuurt zonder overlap en zonder lege rekening', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ regel: rekOverlapRegel(), ov: rekeningOverlap().length, leeg: rekZonderBoekingen().length }));
    expect(r.ov).toBe(0);
    expect(r.leeg).toBe(0);
    expect(r.regel, 'zonder deze regel is de sheet met de samenvoeg-ingang niet te openen').toContain('openRekOverlap()');
    expect(r.regel).toContain('twee keer');
  });

  test('de sheet draagt een knop naar rekSamenvoegVraag met de vaste richting', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => { openRekOverlap(); return document.querySelector('#sheet').innerHTML; });
    expect(h).toContain("rekSamenvoegVraag('" + WEES + "','" + DOEL + "','vast')");
    expect(h, 'de omgekeerde richting zou de wees laten blijven').not.toContain("rekSamenvoegVraag('" + DOEL + "','" + WEES + "'");
  });

  test('bij een gelijk aantal boekingen blijft de GEKOPPELDE rekening bestaan', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => { openRekOverlap(); return document.querySelector('#sheet').innerHTML; });
    expect(h).toContain("rekSamenvoegVraag('" + GELIJK + "','" + GDOEL + "','vast')");
    const r = await page.evaluate((v) => {
      const m = document.querySelector('#sheet').innerHTML
        .match(new RegExp("rekSamenvoegVraag\\('" + v.GELIJK + "','([^']+)','vast'\\)"));
      rekSamenvoegVraag(v.GELIJK, m[1], 'vast');
      const t = document.querySelector('#sheet').innerText;
      return { blijft: t.slice(t.indexOf('Blijft bestaan'), t.indexOf('Vervalt')), vervalt: t.slice(t.indexOf('Vervalt')) };
    }, { GELIJK });
    expect(r.blijft, 'de gekoppelde rekening draagt een machtiging en moet blijven').toContain('machtiging tot');
    expect(r.vervalt, 'de wees heeft geen machtiging en moet vervallen').not.toContain('machtiging tot');
  });

  test('de vaste richting laat de wees vervallen en het doel blijven', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      rekSamenvoegVraag(v.WEES, v.DOEL, 'vast');
      const t = document.querySelector('#sheet').innerText;
      return { tekst: t, plan: rekSamenvoegPlan(v.WEES, v.DOEL),
        nDoel: TX.filter((x) => x.acc === v.DOEL).length, nWees: TX.filter((x) => x.acc === v.WEES).length };
    }, { WEES, DOEL });
    const blijft = r.tekst.indexOf('Blijft bestaan'), vervalt = r.tekst.indexOf('Vervalt');
    expect(blijft).toBeGreaterThanOrEqual(0);
    expect(vervalt).toBeGreaterThan(blijft);
    /* het aantal wordt uit TX gelezen en niet opgeschreven: een vast getal in de assertie zou bij elke
       uitbreiding van de fixture omvallen zonder dat de richting verandert (v256). */
    expect(r.tekst.slice(blijft, vervalt)).toContain(r.nDoel + ' boekingen');
    expect(r.tekst.slice(vervalt)).toContain(r.nWees + ' boekingen');
    expect(r.plan.mee, 'er verhuist niets, want beide boekingen staan er al').toBe(0);
    expect(r.plan.weg).toBe(2);
    expect(r.plan.wegId).toBe(2);
    expect(r.plan.wegTijd, 'de tijd hoeft hier niets te doen, de id beslist al').toBe(0);
  });

  test('kijken verandert niets', async ({ page }) => {
    await boot(page);
    const n = await page.evaluate(() => {
      let n = 0; const echt = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k, v) => { n++; return echt(k, v); };
      rekLosgekoppeld(); rekWezen(); rekOverlapRegel(); openRekOverlap();
      localStorage.setItem = echt; return n;
    });
    expect(n).toBe(0);
  });
});

test.describe('3 · de bank wordt niet meer geraden', () => {
  test('een psd2-rekening zonder koppel-entry heet onbekend en niet ABN AMRO', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => ({ wees: ACCMETA[v.WEES].bank, half: ACCMETA[v.HALF].bank }), { WEES, HALF });
    expect(r.wees).toBe('onbekend');
    expect(r.half).toBe('onbekend');
  });

  test('de twee banknamen die uit de parser volgen blijven staan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => ({ abn: ACCMETA[v.ABN].bank, csv: ACCMETA[v.CSVREK].bank, doel: ACCMETA[v.DOEL].bank }),
      { ABN, CSVREK, DOEL });
    expect(r.abn, 'een MT940 komt van ABN AMRO, dat volgt uit de parser').toBe('ABN AMRO');
    expect(r.csv, 'een N26-CSV komt van N26, dat volgt uit de parser').toBe('N26');
    expect(r.doel, 'een gekoppelde rekening draagt de naam die de bank zelf gaf').toBe('N26');
  });

  test('een lege banknaam wordt uit de IBAN geleend van je eigen andere rekening', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => ({
      leeg: ACCMETA[v.LEEGBANK].bank, nl: ACCMETA[v.NLBANK].bank,
      code: [ibanBankCode('DE89' + v.DOEL), ibanBankCode('DE89' + v.LEEGBANK), ibanBankCode('NL05ABNA0636222403')],
    }), { LEEGBANK, NLBANK, DOEL });
    expect(r.code[0], 'een DE-IBAN draagt acht cijfers Bankleitzahl').toBe('10011001');
    expect(r.code[1]).toBe('10011001');
    expect(r.code[2], 'een NL-IBAN draagt vier letters').toBe('ABNA');
    expect(r.leeg, 'dezelfde bankcode als een rekening die de naam wel draagt').toBe('N26');
    expect(r.nl, 'geen andere rekening met die bankcode, dus niets gemeten').toBe('onbekend');
  });

  test('een onleesbare of ontbrekende IBAN levert geen naam op', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => [bankUitIban(''), bankUitIban('NL'), bankUitIban('XX00'), ibanBankCode('')]);
    expect(r).toEqual(['', '', '', '']);
  });

  test('de bank wordt op precies een plek gezet', async ({ page, request }) => {
    const bron = await (await request.get('/index.html')).text();
    expect((bron.match(/bank:\s*pm\s*\?\s*pm\.bank\s*:/g) || []).length, 'de oude terugval staat er nog').toBe(0);
    expect((bron.match(/bankVanRek\(/g) || []).length, 'een tweede aanroeper is een tweede waarheid').toBe(2);
    await boot(page);
  });
});

test.describe('4 · sectie 6 van blok 10 toont onbekend als eigen groep', () => {
  /* v282: DEZE ASSERTIE STOND EERST OVER DE HELE TEKST, en toen bleef de sabotage die de terugval weer op
     'ABN AMRO' zet GROEN: de groep `psd2 | onbekend` bleef bestaan omdat er nog een ANDERE rekening in zat
     (een gekoppelde met een NL-IBAN zonder naam). Dat is meetles (j) opnieuw, dus hij bindt nu op het
     BEDRAG: de euro's van de groep moeten gelijk zijn aan de in-scope euro's van precies de rekeningen die
     `onbekend` heten. Verhuist de wees naar de ABN-groep, dan loopt die aansluiting uiteen. */
  test('de in-scope euro\'s van de onbekende rekeningen staan in de groep onbekend', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      let verwacht = 0, los = 0;
      const losSet = new Set(rekLosgekoppeld());
      for (const m of months()) {
        if (!piekVerdeling(m)) continue;
        for (const x of txOfMonth(m)) {
          const c = catOf(x);
          if (!(CATS[c] && CATS[c].type === 'expense' && !isFixed(x) && !geenNorm(c))) continue;
          if ((x.src || 'mt940') !== 'psd2') continue;
          if (losSet.has(x.acc)) los += -x.amount;
          if (((ACCMETA[x.acc] || {}).bank || '') === 'onbekend') verwacht += -x.amount;
        }
      }
      const tekst = diagDubbel().join('\n');
      const sec = tekst.slice(tekst.indexOf('6. PER MAAND'));
      const m = sec.match(/psd2 \| onbekend\s+in scope\s+(-?\d+) euro/);
      return { verwacht: Math.round(verwacht), los: Math.round(los), gemeten: m ? +m[1] : null, letop: sec.indexOf('een groep `onbekend` is een rekening waarvan de bank niet vaststaat') >= 0 };
    });
    expect(r.verwacht, 'zonder in-scope euro\'s op een onbekende rekening toetst deze test niets').toBeGreaterThan(0);
    expect(r.gemeten).toBe(r.verwacht);
    /* DE ONAFHANKELIJKE KANT. De aansluiting hierboven leest ACCMETA aan BEIDE zijden, dus een terugval die
       de losgekoppelde rekeningen weer ABN AMRO noemt schuift ze aan beide kanten mee en blijft groen -
       precies meetles (a), de tripdraad die niet kon vallen. `rekLosgekoppeld()` leest de bank niet, dus die
       telling staat vast: de euro's van een losgekoppelde rekening MOETEN in de groep onbekend zitten.
       Het is een ondergrens en geen gelijkheid, want de groep kan ook een gekoppelde rekening bevatten
       waarvan de naam niet vaststaat. */
    expect(r.los, 'zonder in-scope euro\'s op een losgekoppelde rekening toetst die ondergrens niets').toBeGreaterThan(0);
    expect(r.gemeten).toBeGreaterThanOrEqual(r.los);
    expect(r.letop).toBe(true);
  });

  test('een rekening zonder ACCMETA-entry heet ook onbekend en niet een streepje', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      const tekst = diagDubbel().join('\n');
      return { inOwn: OWN.indexOf(v.WEG) >= 0, meta: !!ACCMETA[v.WEG],
        regel: tekst.split('\n').find((x) => x.indexOf(v.WEG) >= 0) || '' };
    }, { WEG });
    expect(r.inOwn, 'staat hij wel in OWN, dan is de terugval niet bereikbaar en toetst dit niets').toBe(false);
    expect(r.meta).toBe(false);
    expect(r.regel).toContain('bank onbekend');
  });

  test('het blok staat in het register op zijn lees-functie', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      dubbel: DIAG_BLOKKEN.some((b) => b.lees === diagDubbel),
      rek: DIAG_BLOKKEN.some((b) => b.lees === diagRekeningen),
    }));
    expect(r.dubbel).toBe(true);
    expect(r.rek).toBe(true);
  });
});

test.describe('5 · blok 8 leest dezelfde twee bronnen', () => {
  test('het blok noemt losgekoppeld en wees apart, met het doel erbij', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagRekeningen().join('\n'));
    const los = t.split('\n').find((r) => r.startsWith('LOSGEKOPPELD'));
    const wz = t.split('\n').find((r) => r.startsWith('WEZEN'));
    expect(los).toContain(WEES);
    expect(los, 'HALF is losgekoppeld en hoort in die regel').toContain(HALF);
    expect(wz).toContain(WEES + ' -> ' + DOEL);
    expect(wz, 'HALF is geen wees en hoort niet in die regel').not.toContain(HALF);
  });

  test('per rekening staat of hij een wees is, en dat wordt per regel gelezen', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagRekeningen().join('\n'));
    const regelVan = (acc) => t.split('\n').find((r) => r.trim().startsWith(acc + '   ') && /wees:/.test(r)) || '';
    expect(regelVan(WEES)).toContain('wees: JA, doel ' + DOEL);
    expect(regelVan(HALF)).toContain('wees: nee');
  });
});
