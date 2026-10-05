/* v281: een rekening die onder twee id's staat, en wat een samenvoeging met je keuzes doet.
 *
 * DE AANLEIDING is de herkoppeling van N26 op 28 sep 2026. Vier rekeningen hielden hun id (die komt uit
 * `ibanNum(iban)`, en de IBAN staat VOOR de hash in de resolutie van `psd2IngestSession()`), en er kwam
 * geen enkele boeking dubbel binnen: toegevoegd was per rekening precies `nieuw` uit de valutadatum-teller
 * (3, 15, 0 en 0) terwijl de aanroepen 825, 428, 76 en 105 regels teruggaven. De Space zonder eigen IBAN
 * kreeg wel een nieuwe id, en die staat nu als wees naast zijn opvolger.
 *
 * WAT DEZE RONDE REPAREERT, en het was stil kapot:
 *  - `rekSamenvoeg()` verhuisde `t.acc` en liet `t.id` staan. Direct na de samenvoeging werkte alles nog;
 *    dan doet de boot `TX.forEach(categorize)`, herschrijft `categorize` elke id uit de NIEUWE rekening,
 *    en waren de overrides wees terwijl hun sleutels als dode entries in SET bleven staan;
 *  - hij ontdubbelde op `_softKey` (datum + bedrag + de eerste acht letters van de naam), en GEMETEN op
 *    het toestel vallen `From Main to Voorziening` en `From Main to Handgeld` daarop samen. De oude vorm
 *    zou van dat paar een kant weggooien.
 *
 * WAT DE FIXTURE DRAAGT, met de gevallen van het toestel bij naam:
 *  - twee overboekingen van 50 euro op dezelfde dag met dezelfde eerste acht letters, ZONDER tijd;
 *  - twee PLAYSTATION-betalingen van 9,99 op dezelfde dag met een VERSCHILLENDE tijd in de desc;
 *  - drie CJIB-boetes van 65 euro op een dag, met verschillende referenties;
 *  - dezelfde betaling met een HERSCHREVEN omschrijving, dus een andere `t.id` bij een gelijke tijd.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const { kaalBron, kaalUit } = require('./bron-kaal');

const OUD = 'psd2_94a07621';            // de wees: geen eigen IBAN, dus een nieuwe id bij een herkoppeling
const NIEUW = '100110012351717586';     // zijn opvolger, id uit ibanNum()
const STABIEL = '100110012848184840';   // houdt zijn id, want die komt uit de IBAN
/* v281: een TWEEDE wees met precies TWEE boekingen, de vorm van `psd2_874633c7` op het toestel. Die komt
   per constructie nooit in rekeningOverlap() voor (die eist minstens 3 gedeelde sleutels), en juist daarom
   moet de wees-detectie hem wel zien. Mijn eerste fixture had alleen een wees met zeven boekingen, en toen
   bleef de sabotage die `lj.length>2` eist GROEN: het geval dat de code moet scheiden zat er niet in. */
const KLEIN = 'psd2_874633c7';

const KAART = (naam, tijd, nr) => 'BEA, Betaalpas ' + naam + ' NR:' + nr + ', 17.08.26/' + tijd + ' PURMEREND';

function tx(acc, rows) {
  return rows.map((r, i) => ({ id: acc + '_seed' + i, date: r.d, amount: r.a, acc, src: 'psd2',
    name: r.n, desc: r.desc || r.n, typ: '', ref: '', accName: '', refNums: [] }));
}

/* de boekingen die op het toestel uit elkaar MOETEN blijven */
const PAREN = [
  { d: '2026-08-30', a: -50, n: 'From Main to Voorziening', desc: 'From Main to Voorziening PMNT' },
  { d: '2026-08-30', a: -50, n: 'From Main to Handgeld', desc: 'From Main to Handgeld PMNT' },
  { d: '2026-08-17', a: -9.99, n: 'eCom PLAYSTATION', desc: KAART('PLAYSTATION', '13:06', 'TERMBNET') },
  { d: '2026-08-17', a: -9.99, n: 'eCom PLAYSTATION', desc: KAART('PLAYSTATION', '19:38', 'TERMBNET') },
  { d: '2026-09-28', a: -65, n: 'CJIB Verkeersboetes', desc: 'CJIB Verkeersboetes iDEAL ref 001238605508' },
  { d: '2026-09-28', a: -65, n: 'CJIB Verkeersboetes', desc: 'CJIB Verkeersboetes iDEAL ref 001238605509' },
  { d: '2026-09-28', a: -65, n: 'CJIB Verkeersboetes', desc: 'CJIB Verkeersboetes iDEAL ref 001238605510' },
];

function seed(opt) {
  opt = opt || {};
  const alles = tx(OUD, PAREN)
    .concat(tx(STABIEL, [{ d: '2026-09-01', a: -25, n: 'Albert Heijn', desc: 'Albert Heijn PMNT' }]))
    .concat(tx(KLEIN, [{ d: '2026-05-05', a: -12, n: 'Q Park', desc: 'Q Park PMNT' },
      { d: '2026-05-20', a: -8, n: 'NS Reizigers', desc: 'NS Reizigers PMNT' }]));
  if (opt.nieuw) alles.push(...tx(NIEUW, opt.nieuw));
  const ps = { [STABIEL]: { uid: 'u-stab', iban: 'DE89' + STABIEL, hash: '', label: 'Zakgeld', bank: 'N26', exp: '2027-01-01' } };
  if (!opt.weesLos) ps[OUD] = { uid: 'u-oud', iban: '', hash: '', label: 'Space', bank: 'N26', exp: '2026-12-01' };
  if (opt.nieuw) ps[NIEUW] = { uid: 'u-nw', iban: 'DE89' + NIEUW, hash: 'verse-hash', label: 'Space ··7586', bank: 'N26', exp: '2027-01-01' };
  return {
    minder_tx: JSON.stringify(alles), minder_ovr: '{}',
    minder_own: JSON.stringify([...new Set(alles.map((t) => t.acc))]),
    minder_accmeta: JSON.stringify({ [OUD]: { balance: 500, date: '2026-09-25', bank: 'N26' },
      [STABIEL]: { balance: 363, date: '2026-09-28', bank: 'N26' },
      [NIEUW]: { balance: 37, date: '2026-09-28', bank: 'N26' } }),
    minder_set: JSON.stringify({ limit: 70, toonLegeRek: true, manualBal: {}, budgets: { boodschappen: 500 },
      psd2Accounts: ps, psd2LastSync: Date.now() }),
    minder_plan: '{}',
  };
}

async function boot(page, opt) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof rekSamenvoeg === 'function' && typeof txId === 'function');
}
/* de boekingen van OUD, gekopieerd naar een andere rekening, zoals een herkoppeling ze aanlevert */
const kopieNaar = (page, acc, welke) => page.evaluate((v) => {
  const bron = TX.filter((t) => t.acc === v.van).filter((t, i) => !v.welke || v.welke.indexOf(i) >= 0);
  for (const b of bron) { const n = Object.assign({}, b, { acc: v.acc }); delete n.id; categorize(n); TX.push(n); }
  TX.sort((a, b) => a.date.localeCompare(b.date));
  return TX.length;
}, { van: OUD, acc, welke });

test.describe('0 · de fixture draagt wat de comment belooft', () => {
  test('de twee overboekingen van 50 euro hebben dezelfde _softKey en een andere t.id', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const a = TX.filter((t) => /From Main to/.test(t.name));
      return { n: a.length, soft: [...new Set(a.map(_softKey))], ids: [...new Set(a.map((t) => t.id))],
        tijden: a.map((t) => _descTijden(t).length) };
    });
    expect(r.n).toBe(2);
    expect(r.soft.length, 'zonder een gelijke softKey toetst de reparatie niets').toBe(1);
    expect(r.ids.length).toBe(2);
    expect(r.tijden).toEqual([0, 0]);          // geen tijd, dus de scheider kan ze nooit samenvoegen
  });

  test('de twee PLAYSTATION-betalingen dragen een verschillende tijd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const a = TX.filter((t) => /PLAYSTATION/.test(t.name));
      return { n: a.length, tijden: a.map((t) => _descTijden(t).join(',')), ids: [...new Set(a.map((t) => t.id))].length };
    });
    expect(r.n).toBe(2);
    expect(r.tijden).toEqual(['13:06', '19:38']);
    expect(r.ids).toBe(2);
  });

  test('de drie boetes dragen geen tijd en drie verschillende ids', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const a = TX.filter((t) => /CJIB/.test(t.name));
      return { n: a.length, ids: [...new Set(a.map((t) => t.id))].length, tijd: a.every((t) => _descTijden(t).length === 0) };
    });
    expect(r.n).toBe(3);
    expect(r.ids).toBe(3);
    expect(r.tijd).toBe(true);
  });
});

test.describe('1 · txId is de ene identiteit', () => {
  test('categorize en de samenvoeging rekenen met dezelfde uitdrukking', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => ({ cat: categorize.toString(), merge: _samenvoegPlan.toString(),
      id: txId.toString() }));
    expect(src.cat).toContain('t.id=txId(t)');
    expect(src.merge).toContain('txId(t, naar)');
    // het bereik staat op precies een plek in de bron
    const heel = await page.evaluate(() => document.documentElement.outerHTML);
    const n = heel.split("hash(a+t.date+t.amount.toFixed(2)+t.desc)").length - 1;
    expect(n, 'het hash-bereik staat ' + n + ' keer in de bron').toBe(1);
  });

  test('txId geeft voor een andere rekening de id die categorize daar zou zetten', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      const t = TX.find((x) => x.acc === v.OUD);
      const voorspeld = txId(t, v.NIEUW);
      const kopie = Object.assign({}, t, { acc: v.NIEUW }); delete kopie.id; categorize(kopie);
      return { voorspeld, echt: kopie.id, eigen: txId(t) === t.id };
    }, { OUD, NIEUW });
    expect(r.voorspeld).toBe(r.echt);
    expect(r.eigen).toBe(true);
  });
});

test.describe('2 · de ontdubbeling leest t.id en niet _softKey', () => {
  test('een boeking die de andere kant NIET heeft verhuist mee', async ({ page }) => {
    await boot(page);
    // de nieuwe rekening krijgt alleen de EERSTE van de twee overboekingen van 50
    await kopieNaar(page, NIEUW, [0]);
    const r = await page.evaluate((v) => {
      const P = rekSamenvoegPlan(v.OUD, v.NIEUW);
      /* dezelfde vraag met de OUDE sleutel, nagerekend zonder de code die getoetst wordt: die gooit
         beide kanten weg omdat hun softKey gelijk is. */
      const houd = new Set(TX.filter((t) => t.acc === v.NIEUW).map(_softKey));
      const oudeVorm = TX.filter((t) => t.acc === v.OUD && houd.has(_softKey(t))).length;
      return { P, oudeVorm };
    }, { OUD, NIEUW });
    expect(r.oudeVorm, 'de oude vorm zou hier twee boekingen weggooien').toBe(2);
    expect(r.P.weg).toBe(1);
    expect(r.P.wegId).toBe(1);
    expect(r.P.mee).toBe(PAREN.length - 1);
  });

  test('na de samenvoeging staan beide overboekingen er nog, en precies een keer', async ({ page }) => {
    await boot(page);
    await kopieNaar(page, NIEUW, [0]);
    const r = await page.evaluate((v) => {
      rekSamenvoeg(v.OUD, v.NIEUW);
      const a = TX.filter((t) => /From Main to/.test(t.name));
      return { n: a.length, namen: a.map((t) => t.name).sort(), accs: [...new Set(a.map((t) => t.acc))] };
    }, { OUD, NIEUW });
    expect(r.n).toBe(2);
    expect(r.namen).toEqual(['From Main to Handgeld', 'From Main to Voorziening']);
    expect(r.accs).toEqual([NIEUW]);
  });

  test('de drie boetes en de twee PLAYSTATION-betalingen overleven een volledige herkoppeling', async ({ page }) => {
    await boot(page);
    await kopieNaar(page, NIEUW);                 // alles komt onder de nieuwe id opnieuw binnen
    const r = await page.evaluate((v) => {
      /* SCOPE OP DE TWEE REKENINGEN en niet op heel TX: de fixture draagt ook een kleine wees, en een
         telling over alles schuift mee met elke rij die er verder bij komt. */
      const hoort = (t) => t.acc === v.OUD || t.acc === v.NIEUW;
      const voor = TX.filter(hoort).length;
      rekSamenvoeg(v.OUD, v.NIEUW);
      const per = {};
      for (const t of TX.filter(hoort)) { const k = t.date + '|' + t.amount.toFixed(2) + '|' + t.desc; per[k] = (per[k] || 0) + 1; }
      return { voor, na: TX.filter(hoort).length, dubbel: Object.keys(per).filter((k) => per[k] > 1),
        cjib: TX.filter((t) => /CJIB/.test(t.name)).length,
        ps: TX.filter((t) => /PLAYSTATION/.test(t.name)).map((t) => _descTijden(t).join(',')).sort(),
        fromMain: TX.filter((t) => /From Main to/.test(t.name)).length };
    }, { OUD, NIEUW });
    expect(r.voor).toBe(PAREN.length * 2);
    expect(r.dubbel, 'geen enkele boeking staat twee keer').toEqual([]);
    expect(r.na).toBe(PAREN.length);
    expect(r.cjib).toBe(3);
    expect(r.ps).toEqual(['13:06', '19:38']);
    expect(r.fromMain).toBe(2);
  });
});

test.describe('3 · de tijd uit de desc is een scheider en nooit een samenvoeger', () => {
  test('een herschreven omschrijving met dezelfde tijd telt als dezelfde betaling', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      /* de bank levert dezelfde betaling met een ANDERE opmaak: andere desc, dus een andere t.id,
         maar dezelfde dag, hetzelfde bedrag en dezelfde tijd. */
      const bron = TX.find((t) => t.acc === v.OUD && /13:06/.test(t.desc));
      const n = Object.assign({}, bron, { acc: v.NIEUW,
        desc: 'eCom, Betaalpas PLAYSTATION NR:TERMBNET, 17.08.26/13:06 HILVERSUM KAARTNUMMER: **1720' });
      delete n.id; categorize(n); TX.push(n);
      const idAnders = txId(bron, v.NIEUW) !== n.id;
      const P = rekSamenvoegPlan(v.OUD, v.NIEUW);
      return { idAnders, weg: P.weg, wegId: P.wegId, wegTijd: P.wegTijd };
    }, { OUD, NIEUW });
    expect(r.idAnders, 'zonder een andere id toetst deze test de tijd-tak niet').toBe(true);
    expect(r.weg).toBe(1);
    expect(r.wegId).toBe(0);
    expect(r.wegTijd).toBe(1);
  });

  test('een andere tijd voegt niets samen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      const bron = TX.find((t) => t.acc === v.OUD && /13:06/.test(t.desc));
      const n = Object.assign({}, bron, { acc: v.NIEUW,
        desc: 'eCom, Betaalpas PLAYSTATION NR:TERMBNET, 17.08.26/21:11 HILVERSUM' });
      delete n.id; categorize(n); TX.push(n);
      const P = rekSamenvoegPlan(v.OUD, v.NIEUW);
      return { weg: P.weg, na: (function () { rekSamenvoeg(v.OUD, v.NIEUW);
        return TX.filter((t) => /PLAYSTATION/.test(t.name)).length; })() };
    }, { OUD, NIEUW });
    expect(r.weg).toBe(0);
    expect(r.na).toBe(3);      // de twee originelen plus de derde tijd
  });

  test('zonder tijd aan een van beide kanten blijft het apart', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      const bron = TX.find((t) => t.acc === v.OUD && /13:06/.test(t.desc));
      const n = Object.assign({}, bron, { acc: v.NIEUW, desc: 'PLAYSTATION NETWORK PMNT' });
      delete n.id; categorize(n); TX.push(n);
      return { tijden: _descTijden(n).length, weg: rekSamenvoegPlan(v.OUD, v.NIEUW).weg };
    }, { OUD, NIEUW });
    expect(r.tijden).toBe(0);
    expect(r.weg).toBe(0);
  });

  test('_descTijden leest BETAALDATUM_RE en geen eigen patroon', async ({ page }) => {
    await boot(page);
    const src = await kaalUit(page, '_descTijden');
    expect(src).toContain('BETAALDATUM_RE.source');
    expect(src).not.toMatch(/\\d\{2\}\)\[\.\\-/);        // geen tweede uitgeschreven patroon
    expect(src).not.toMatch(/betaalTijd|betaalMoment/);  // en geen lezer van het veld van v273
  });
});

test.describe('4 · de vier markeringen verhuizen mee', () => {
  const zet = (page) => page.evaluate((v) => {
    const a = TX.filter((t) => t.acc === v.OUD);
    OVR[a[0].id] = 'vices';
    SET.onregelmatig = { [a[1].id]: 100 };
    SET.uitReservering = { [a[2].id]: 25 };
    SET.fixOvr = { [a[3].id]: { dag: 5 } };
    save();
    return a.slice(0, 4).map((t) => t.id);
  }, { OUD });
  const raakt = (page) => page.evaluate(() => TX.filter((t) => OVR[t.id] || (SET.onregelmatig || {})[t.id]
    || (SET.uitReservering || {})[t.id] || (SET.fixOvr || {})[t.id]).length);

  test('ze hangen na de samenvoeging aan dezelfde boekingen', async ({ page }) => {
    await boot(page);
    const oudIds = await zet(page);
    expect(await raakt(page)).toBe(4);
    const r = await page.evaluate((v) => { rekSamenvoeg(v.OUD, v.NIEUW);
      return { raakt: TX.filter((t) => OVR[t.id] || (SET.onregelmatig || {})[t.id]
        || (SET.uitReservering || {})[t.id] || (SET.fixOvr || {})[t.id]).length,
        accs: [...new Set(TX.map((t) => t.acc))].sort() }; }, { OUD, NIEUW });
    expect(r.raakt).toBe(4);
    expect(r.accs).not.toContain(OUD);
    // en de oude sleutels staan er niet meer
    const dood = await page.evaluate((ids) => { const set = new Set(TX.map((t) => t.id));
      return ids.filter((id) => set.has(id) === false && (OVR[id] || (SET.onregelmatig || {})[id]
        || (SET.uitReservering || {})[id] || (SET.fixOvr || {})[id])); }, oudIds);
    expect(dood).toEqual([]);
  });

  /* DIT IS DE KERN VAN v281: vlak na de samenvoeging klopte het al in de oude vorm. Pas de boot-sweep
     liet zien dat de ids waren herschreven zonder de vlaggen. */
  test('en ze overleven de boot-sweep, want de id is al de juiste', async ({ page }) => {
    await boot(page);
    await zet(page);
    const r = await page.evaluate((v) => {
      rekSamenvoeg(v.OUD, v.NIEUW);
      const voor = TX.map((t) => t.id);
      TX.forEach(categorize);                       // letterlijk wat de boot doet
      const na = TX.map((t) => t.id);
      return { gelijk: JSON.stringify(voor) === JSON.stringify(na),
        raakt: TX.filter((t) => OVR[t.id] || (SET.onregelmatig || {})[t.id]
          || (SET.uitReservering || {})[t.id] || (SET.fixOvr || {})[t.id]).length };
    }, { OUD, NIEUW });
    expect(r.gelijk, 'de boot herschrijft de ids nog, dus de vlaggen raken alsnog los').toBe(true);
    expect(r.raakt).toBe(4);
  });

  test('de markering van de overlevende wint van die van de dubbele', async ({ page }) => {
    await boot(page);
    await kopieNaar(page, NIEUW, [0]);
    const r = await page.evaluate((v) => {
      const oud = TX.find((t) => t.acc === v.OUD && /Voorziening/.test(t.name));
      const nieuw = TX.find((t) => t.acc === v.NIEUW && /Voorziening/.test(t.name));
      OVR[oud.id] = 'vices'; OVR[nieuw.id] = 'uiteten'; save();
      rekSamenvoeg(v.OUD, v.NIEUW);
      const over = TX.find((t) => /Voorziening/.test(t.name));
      return { n: TX.filter((t) => /Voorziening/.test(t.name)).length, cat: OVR[over.id],
        oudWeg: !Object.prototype.hasOwnProperty.call(OVR, oud.id) };
    }, { OUD, NIEUW });
    expect(r.n).toBe(1);
    expect(r.cat, 'de keuze op de blijvende boeking mag niet worden overschreven').toBe('uiteten');
    expect(r.oudWeg).toBe(true);
  });

  test('de vier maps staan in een lijst, en de samenvoeging leest diezelfde lijst', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ maps: VLAG_MAPS.slice(), verhuis: _vlagVerhuis.toString(),
      tel: _vlagAantal.toString() }));
    expect(r.maps).toEqual(['onregelmatig', 'uitReservering', 'fixOvr', 'bezitKoppel', 'schuldKoppel', 'bezitKosten', 'contantStort']);   // v332, v334, v341, v342
    expect(r.verhuis).toContain('VLAG_MAPS');
    expect(r.verhuis).toContain('OVR');
    expect(r.tel).toContain('VLAG_MAPS');
  });
});

test.describe('5 · de desc-wijziging op een STABIELE rekening, gemeten en niet gerepareerd', () => {
  /* HET GEVAL: de bank houdt dezelfde rekening-id maar herschrijft de omschrijving. Dan verandert `t.id`
     en ziet `commitTx()` een nieuwe boeking. De soft-dedup daar vuurt per constructie niet, want die eist
     dat de REKENING en de BRON allebei verschillen, en hier verschilt geen van beide.
     DIT IS BEWUST NIET GEREPAREERD in deze ronde. De tijd-scheider zou het kunnen vangen, maar op de
     importroute bevestigt niemand dat de twee dezelfde betaling zijn, en een boeking die stil verdwijnt
     is erger dan een dubbele die je ziet. Bij een samenvoeging wijst de gebruiker de twee rekeningen zelf
     aan, en daar mag het dus wel. Deze test legt het gat vast zodat een volgende ronde het niet hoeft te
     ontdekken. */
  test('een herschreven omschrijving komt er als tweede boeking bij', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      const bron = TX.find((t) => t.acc === v.STABIEL);
      const n = { date: bron.date, amount: bron.amount, acc: v.STABIEL, src: 'psd2', name: bron.name,
        desc: 'Albert Heijn Purmerend PMNT', typ: '', ref: '', accName: '', refNums: [] };
      categorize(n);
      const voor = TX.length;
      const added = commitTx([n], null);
      const ex = TX.filter((t) => t.acc === v.STABIEL);
      return { voor, added, na: TX.length, opRekening: ex.length,
        idAnders: txId(bron, v.STABIEL) !== n.id,
        guard: { acc: bron.acc !== n.acc, src: bron.src !== n.src } };
    }, { STABIEL });
    expect(r.idAnders).toBe(true);
    expect(r.guard.acc, 'dezelfde rekening').toBe(false);
    expect(r.guard.src, 'dezelfde bron').toBe(false);
    expect(r.added, 'dit is het gat: hij komt er gewoon bij').toBe(1);
    expect(r.opRekening).toBe(2);
  });

  test('een ONGEWIJZIGDE omschrijving komt er niet nog een keer bij', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      const bron = TX.find((t) => t.acc === v.STABIEL);
      const n = Object.assign({}, bron); delete n.id; categorize(n);
      return { added: commitTx([n], null), opRekening: TX.filter((t) => t.acc === v.STABIEL).length };
    }, { STABIEL });
    expect(r.added).toBe(0);
    expect(r.opRekening).toBe(1);
  });
});

test.describe('6 · blok 8 wijst de wees aan en meet zijn tegenhangers', () => {
  const blok8 = (page) => page.evaluate(() => {
    const b = DIAG_BLOKKEN.find((x) => /rekeningen en de bankverbindingen/.test(x.titel));
    return (b.lees() || []).join(String.fromCharCode(10));
  });

  /* v282: DE TWEE REGELS ZIJN GESPLITST. `LOSGEKOPPELD` is wat deze test altijd bedoelde (psd2-boekingen,
     niet meer in SET.psd2Accounts), en `WEZEN` is sindsdien de STRENGERE vraag: losgekoppeld EN elke boeking
     staat met dezelfde `txId(t, doel)` op een andere rekening. Op deze fixture staat geen van beide
     rekeningen volledig elders, dus ze zijn losgekoppeld en geen wees, en die scheiding wordt hier gepind. */
  test('een psd2-rekening die niet meer gekoppeld is heet losgekoppeld, ongeacht het aantal boekingen', async ({ page }) => {
    await boot(page, { weesLos: true, nieuw: [{ d: '2026-09-25', a: -40, n: 'Etos', desc: 'Etos PMNT' }] });
    const t = await blok8(page);
    const regel = t.split(String.fromCharCode(10)).find((x) => /^LOSGEKOPPELD /.test(x)) || '';
    expect(regel).toContain(OUD);
    /* DE KLEINE WEES IS HET PUNT: twee boekingen, en rekeningOverlap() ziet hem per constructie nooit.
       Zonder deze assertie blijft een drempel op het aantal boekingen onopgemerkt. */
    expect(regel, 'een rekening met twee boekingen hoort er net zo goed bij').toContain(KLEIN);
    const wz = t.split(String.fromCharCode(10)).find((x) => /^WEZEN /.test(x)) || '';
    expect(wz, 'geen van beide staat volledig elders, dus geen van beide is een wees').toBe('WEZEN (losgekoppeld EN elke boeking staat met dezelfde t.id op een andere rekening): geen   <-- hieraan hangt de samenvoeg-ingang in Instellingen (Bank & koppelingen)');
    const ov = t.split(String.fromCharCode(10)).find((x) => /^rekeningen met dezelfde boekingen:/.test(x)) || '';
    expect(ov, 'de overlap-check kan hem niet zien, dus hij mag daar niet staan').not.toContain(KLEIN);
    expect(t).toMatch(/een wees met een of twee boekingen komt daar per constructie nooit in voor/);
  });

  test('de tegenhangers staan per boeking, met datum, bedrag, tijd en de id-toets', async ({ page }) => {
    await boot(page, { weesLos: true });
    await kopieNaar(page, NIEUW, [0]);
    const t = await blok8(page);
    expect(t).toMatch(/per boeking de tegenhangers elders, op datum \+ bedrag/);
    expect(t).toMatch(/dezelfde t\.id op die rekening: JA/);
    expect(t).toContain('2026-08-30  -50.00  tijd -');
  });

  test('een boeking zonder tegenhanger zegt dat ook', async ({ page }) => {
    await boot(page, { weesLos: true });
    const t = await blok8(page);
    expect(t).toMatch(/geen enkele boeking elders op die dag met dat bedrag/);
  });

  test('een gekoppelde rekening staat niet in de losgekoppeld-lijst', async ({ page }) => {
    await boot(page);
    const regel = (await blok8(page)).split(String.fromCharCode(10)).find((x) => /^LOSGEKOPPELD /.test(x)) || '';
    expect(regel).not.toContain(OUD);        // die is hier wel gekoppeld
    expect(regel).not.toContain(STABIEL);
    expect(regel).toContain(KLEIN);          // en deze is dat nooit
  });

  test('dode markeringen worden geteld en niet opgeruimd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async (v) => {
      OVR['bestaat-niet_100'] = 'vices';
      SET.uitReservering = { 'ook-niet_200': 25 };
      save();
      const b = DIAG_BLOKKEN.find((x) => /rekeningen en de bankverbindingen/.test(x.titel));
      const t = (b.lees() || []).join(String.fromCharCode(10));
      return { t, nogSteeds: !!OVR['bestaat-niet_100'] && !!SET.uitReservering['ook-niet_200'] };
    }, {});
    expect(r.t).toMatch(/DODE MARKERINGEN \(een vlag op een t\.id die niet meer bestaat\): 2/);
    expect(r.nogSteeds, 'het blok leest, het ruimt niet op (v244)').toBe(true);
  });
});

test.describe('7 · kijken verandert niets (v244)', () => {
  test('blok 8 schrijft niet naar localStorage', async ({ page }) => {
    await boot(page, { weesLos: true, nieuw: [{ d: '2026-09-25', a: -40, n: 'Etos', desc: 'Etos PMNT' }] });
    const r = await page.evaluate(async () => {
      const schrijvers = [];
      const echt = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k, v) => { schrijvers.push(k); return echt(k, v); };
      try { for (const b of DIAG_BLOKKEN) { const L = b.lees(); if (L && L.then) await L; } }
      finally { localStorage.setItem = echt; }
      return schrijvers;
    });
    expect(r).toEqual([]);
  });
});
