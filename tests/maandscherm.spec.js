// v130: één scherm dat je één keer per maand opent, met de getallen die samen zeggen of je
// systeem standhoudt. v186/v187: van vijf regels naar drie (dekking, buffer, doel).
// geldsysteem gezond is. Het scherm REKENT NIETS ZELF: het roept bestaande functies aan, stelt hun
// uitkomsten samen en sorteert ze. Enige uitzondering, na akkoord: bufferMaanden(), een deling van
// twee bestaande uitkomsten. Valt een bron weg, dan valt die regel weg zonder foutmelding.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const over = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const RES = 'NL01RESV0000002222';
const SAV = 'NL01SAVE0000004323';

// Basis: huur 900 vast, boodschappen 300 normaal. De pot en de spaarrekening krijgen elk een
// boeking, anders staan ze niet in OWN en zijn ze niet aanwijsbaar.
function seedM(set = {}, opt = {}) {
  const tx = [];
  const add = (id, m, day, amount, acc, naam, desc, accName) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName, refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, m, '01', 3000, MAIN, 'Werkgever', 'SALARIS LOON', 'Main');
    add('h' + m, m, '02', -900, MAIN, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING', 'Main');
    add('a' + m, m, '08', -(m === CUR && opt.uitschieter ? 620 : 300), MAIN, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'Main');
  }
  add('res1', M1, '05', 100, RES, 'Eigen rekening', 'RESERVERINGEN', 'Res');
  add('sav1', M1, '06', 100, SAV, 'Spaarpot', 'NAAR SPAREN', 'Spaar');
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
    /* v305: de ondergrens is sinds v305 een KEUZE en heeft geen default meer, dus de fixture kiest
       hem hier. Deze spec is geschreven toen drie maanden een vaste grens was; dat getal staat nu
       waar het thuishoort, in de gegevens van de gebruiker. */
    bufferNorm: 3,
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      savingMode: 'amount', savingAmount: 300, nfMaanden: 3,
      manualBal: { [MAIN]: 1500, [RES]: 2000, [SAV]: 20000 },
      resAcc: RES,
      reserveringen: [{ id: 'a', naam: 'Gemeente', bedrag: 480, vervalmaand: over(6), intervalM: 12 }],
      goals: [{ id: 'g1', naam: 'Vakantie', doel: 2000, gespaard: 1000, allocMode: 'fixed', perMaand: 300, streefdatum: over(20) }],
      planOrder: ['g1', 'noodfonds'],
      nfDoelVast: 3000,
      /* v242: de grendel. Zonder een volle buffer gaat de hele spaarinleg daarheen en krijgt het
         doel niets, en dan wordt elke regel over dat doel een tekort. Deze spec gaat over het
         oordeel op Grip en niet over de grendel, dus staat de buffer hier vol. */
      nfToegewezen: 3000, nfToegewezenMigrated: true,
    }, set)),
    minder_own: JSON.stringify([MAIN, RES, SAV]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedM());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof maandRegels === 'function');
}

const R = (page) => page.evaluate(() => maandRegels().map((r) => ({ key: r.key, status: r.status, waarde: r.waarde, eenheid: r.eenheid, sub: r.sub, gevolg: r.gevolg, maand: r.maand || null })));   // v314: sub erbij, de linker-sub van de compacte rij
/* v340: maandOordeel() (de samenvattingszin) is vervallen zonder opvolger. Wat het oordeel TELDE staat nu
   in de kleur van de tegels op Grip: rood voor tekort, amber voor let op, groen voor ok. */
const tegels = async (page) => {
  await page.evaluate(() => go('maand'));
  return page.evaluate(() => [...document.querySelectorAll('#gripTegels [data-tegel]')]
    .map((t) => ({ key: t.dataset.tegel, kleur: t.dataset.kleur, tekst: t.innerText })));
};
const KLEUR = { tekort: 'rood', 'let op': 'amber', ok: 'groen' };
const VB = (page) => page.evaluate(() => maandVerband(maandRegels()));

test.describe('a · het scherm bestaat naast de andere', () => {
  test('sectie en tabblad, en go() werkt zoals bij de rest', async ({ page }) => {
    await boot(page);
    expect(await page.locator('#s-maand').count()).toBe(1);
    expect(await page.locator('.nav a[data-go="maand"]').innerText()).toContain('Grip');   // v233: de sleutel blijft 'maand', het label is Grip
    await page.locator('.nav a[data-go="maand"]').click();
    expect(await page.evaluate(() => document.querySelector('#s-maand').classList.contains('active'))).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('minder_view'))).toBe('maand');
    expect(await page.evaluate(() => document.querySelector('.nav a[data-go="maand"]').classList.contains('on'))).toBe(true);
  });
});

test.describe('b · de regels', () => {
  /* v186: patroon vervallen (dubbelde met de meldingenlijst). v187: aansluiting vervallen, want
     dat is een administratief verschil tussen toegewezen en aanwezig, geen oordeel over je
     positie. Drie regels over: dekking, buffer, doel. */
  test('alle drie staan er, in de vaste volgorde', async ({ page }) => {
    await boot(page);
    expect((await R(page)).map((r) => r.key)).toEqual(['dekking', 'buffer', 'doel']);
  });

  test('de bronnen komen uit de bestaande functies', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const rr = maandRegels();
      const D = dekking(12), bm = bufferMaanden(), V = spaarVrij();
      return { dekGraad: D.graad, dekGat: !!D.gat, regelDek: rr.find((r) => r.key === 'dekking').waarde,
        regelDekEenheid: rr.find((r) => r.key === 'dekking').eenheid,
        potStand: euro0(Math.round(D.werkelijkeStand || 0)),
        bm: Math.round(bm * 10) / 10, regelBuf: rr.find((r) => r.key === 'buffer').waarde, vrij: V.vrij };
    });
    expect(uit.regelDek).toBe(uit.potStand);          // v189: de kolom toont je potsaldo
    /* v191: een dekkingsgraad toont een percentage tot en met de drempel en daarboven een
       vaststelling; boven de 100% verandert het exacte getal geen enkele beslissing. */
    /* v314: zonder gat draagt de kolom wat er na de eerstvolgende post overblijft, en dan staat er
       per definitie geen percentage. Met een gat beslist graadTekst() onveranderd: tot en met de
       drempel een percentage, daarboven 'op peil'. */
    if (!uit.dekGat) { expect(uit.regelDekEenheid).toContain('blijft over'); expect(uit.regelDekEenheid).not.toMatch(/%/); }
    else if (uit.dekGraad <= 100) expect(uit.regelDekEenheid).toContain(uit.dekGraad + '%');
    else { expect(uit.regelDekEenheid).toContain('op peil'); expect(uit.regelDekEenheid).not.toMatch(/%/); }
    expect(uit.regelBuf).toBe(String(uit.bm).replace('.', ','));
  });

  /* v305: DEZE TEST PINDE DE OUDE TELLER. `bufferMaanden()` deelde het SALDO van je spaarrekening;
     sinds v305 is het de TOEWIJZING aan je noodfonds (besluit 1), zodat Plan en Grip hetzelfde getal
     tonen. Hij is herschreven naar de nieuwe deling en tegelijk sterker gemaakt: hij meet dat de twee
     tellers in deze fixture werkelijk UITEENLOPEN, want anders zou hij de oude vorm niet afwijzen. */
  test('bufferMaanden is de toewijzing gedeeld door de essentiële crisis-last', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const M = noodfondsModel();
      return { bm: bufferMaanden(), teller: bufferTeller(), spaar: M.spaar, ess: Math.round(M.essCrisis) };
    });
    expect(uit.teller, 'de toewijzing is niet het saldo, anders toetst deze test niets')
      .not.toBe(uit.spaar);
    expect(uit.bm).toBeCloseTo(uit.teller / uit.ess, 5);
  });

  test('bufferMaanden is null zonder bekend spaarsaldo', async ({ page }) => {
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 2000 } }));
    expect(await page.evaluate(() => bufferMaanden())).toBeNull();
    expect((await R(page)).some((r) => r.key === 'buffer')).toBe(false);
  });
});

test.describe('c · de statussen', () => {
  /* v226: de post ligt hier één maand vooruit en niet zes. De status hangt sindsdien niet alleen
     aan de stand maar ook aan het moment waarop het knelt: een gat dat drie maanden of verder weg
     ligt vraagt aandacht en geen beslissing. Wat deze test meet is de stand, dus het knelmoment
     wordt vastgezet in plaats van meegemeten. */
  test('dekking: tekort als de eerstvolgende post niet past, ok als hij past, onbekend zonder saldo', async ({ page }) => {
    // v323: alleen een post in de LOPENDE maand is nog een beslissing, dus het knelmoment staat in deze maand.
    await boot(page, seedM({ reserveringen: [{ id: 'a', naam: 'Gemeente', bedrag: 480, vervalmaand: over(0), intervalM: 12 }] }));
    expect((await R(page)).find((r) => r.key === 'dekking').status).toBe('ok');     // 2000 in de pot
    await page.evaluate((a) => { SET.manualBal[a] = 10; save(); }, RES);
    expect((await R(page)).find((r) => r.key === 'dekking').status).toBe('tekort');
    await page.evaluate((a) => { delete SET.manualBal[a]; save(); }, RES);
    expect((await R(page)).find((r) => r.key === 'dekking').status).toBe('onbekend');
  });

  /* v305: de grens is de GEKOZEN ondergrens (de fixture kiest 3) en de teller is de toewijzing, dus
     de stand wordt hier met `nfToegewezen` verzet en niet meer met het rekeningsaldo. De drie
     uitkomsten zijn dezelfde als voorheen; alleen de knop waaraan je draait is een andere. */
  test('buffer: tekort onder je ondergrens, let op onder je richtbedrag, anders ok', async ({ page }) => {
    /* de toewijzingen samen blijven binnen het spaarsaldo van 20.000: het doel krijgt er 1.000, dus
       de buffer 19.000. Zonder die aftrek meldt de controle van besluit 2 dat er meer is toegewezen
       dan er staat, en dan is `ok` per constructie onbereikbaar. */
    await boot(page, seedM({ nfMaanden: 6, nfDoelVast: 19000, nfToegewezen: 19000 }));
    const meet = async () => (await R(page)).find((r) => r.key === 'buffer').status;
    expect(await meet()).toBe('ok');                                                // 19000 / 1000 = 19 mnd
    await page.evaluate(() => { SET.nfToegewezen = 4000; save(); });
    expect(await meet()).toBe('let op');                                            // 4 mnd, richt 6
    await page.evaluate(() => { SET.nfToegewezen = 2000; save(); });
    expect(await meet()).toBe('tekort');                                            // 2 mnd, onder 3
  });

  /* v172: het noodfonds claimt niet meer zijn doel maar zijn toewijzing, dus het doel omhoog
     zetten sluit het gat niet meer - toewijzen wel. Dat is precies de bedoeling van model B. */
  /* v187: aansluiting is geen maandregel meer. Het feit zelf leeft onveranderd door in
     spaarVrij() en in spaarVrijLine() op Plan, dus dat is wat deze test nu meet. */
  test('aansluiting staat niet meer op Maand, maar spaarVrij meet nog hetzelfde', async ({ page }) => {
    await boot(page);
    expect((await R(page)).some((r) => r.key === 'aansluiting')).toBe(false);
    expect(await page.evaluate(() => spaarVrij().vrij)).toBeGreaterThan(0);
    expect(await page.evaluate(() => spaarVrijLine(allocatePlan()))).toContain('toewijzen');
    const saldo = await page.evaluate(() => Math.round(spaarSaldo().cur));
    await page.evaluate((s) => { SET.nfDoelVast = s; SET.nfToegewezen = s - 1000;
      SET.goals[0].gespaard = 1000; save(); }, saldo);
    expect(await page.evaluate(() => spaarVrij().vrij)).toBe(0);
    expect(await page.evaluate(() => spaarVrijLine(allocatePlan()))).toBe('');
  });

  test('aankoopdoel: tekort bij een gat, ok zonder, onbekend zonder streefdatum', async ({ page }) => {
    await boot(page);
    expect((await R(page)).find((r) => r.key === 'doel').status).toBe('ok');
    await page.evaluate(() => { SET.goals[0].streefdatum = SET.goals[0].streefdatum; SET.goals[0].doel = 40000; save(); });
    expect((await R(page)).find((r) => r.key === 'doel').status).toBe('tekort');
    await page.evaluate(() => { delete SET.goals[0].streefdatum; save(); });
    expect((await R(page)).some((r) => r.key === 'doel')).toBe(false);               // geen streefdatum: geen regel
  });

  /* v186: patroon is geen regel meer. De melding waar hij op leunde draagt h:'direct' en hoort
     dus in de meldingenlijst; maandPatroon() blijft bestaan als invoer voor maandVerband(), dat
     iets zegt wat de melding zelf niet zegt. */
  test('patroon is geen regel meer, maar voedt nog wel het verband', async ({ page }) => {
    await boot(page, seedM({}, { uitschieter: true }));
    expect((await R(page)).find((r) => r.key === 'patroon')).toBeUndefined();
    const p = await page.evaluate(() => maandPatroon());
    expect(p).not.toBeNull();
    expect(p.boven).toBeGreaterThan(0);
    // en hij zit nog in de meldingenlijst, want dat is zijn horizon
    expect(await page.evaluate(() => notifList().some((n) => n.key === maandPatroon().key))).toBe(true);
  });

  test('alleen uitgavenpatronen tellen, geen incasso of saldo-nudge', async ({ page }) => {
    await boot(page, seedM({}, { uitschieter: true }));
    const k = await page.evaluate(() => (maandPatroon() || {}).key || '');
    expect(k).toMatch(/^(budget-|discr-|tempo)/);
  });
});

test.describe('c2 · dekking van een eenmalige post (v131, herzien bij v317)', () => {
  // gemeld: pot 50, verplichting 25, en toch "onbekend". Bij een eenmalige post of een jaarpost die
  // twaalf maanden of verder weg ligt was benodigdeStand nul, dus gaf dekking() graad null, en dat
  // las het maandscherm als onbekend met status tekort. Er is niets onbekends.
  /* v317: EEN EENMALIGE POST BINNEN HET VENSTER DRAAGT ZIJN HELE BEDRAG IN DE OPBOUW-EIS, want hij
     heeft geen volgende termijn om over te spreiden en de waterval in dezelfde functie trok hem al
     voluit af. Daarmee IS er voor zo'n post een percentage, en de noemer heet "wat nu nodig is" in
     plaats van "de eerstvolgende post" - die twee zijn bij een eenmalige post per constructie
     hetzelfde getal, en dat staat als eigen assertie vast. De v131-uitkomst blijft: ok en niet
     onbekend. De tak zonder opbouw-eis is NIET dood; zie het kwartaalgeval onderaan dit blok. */
  /* v189: de waardekolom mengde vijf soorten waarde. Hij toont er nu een: wat er in je
     reserveringenpot staat, of het woord onbekend. Het oordeel dat eruit gehaald is - het
     percentage, of waarom er geen is - staat in de eenheid ernaast, met dezelfde noemers. */
  /* v226: de posten in dit blok liggen twee maanden vooruit en niet drie. De status van dekking
     hangt sindsdien ook aan het moment waarop het knelt: vanaf MAAND_DREMPEL.dekkingMarge maanden
     vraagt een gat aandacht en geen beslissing. Dit blok meet de waardekolom en de eenheid, dus het
     knelmoment wordt hier binnen de marge vastgezet in plaats van meegemeten. */
  /* v323: alleen een post in de LOPENDE maand is nog een beslissing, dus het knelmoment staat in deze maand. Een post die je wel
     kunt betalen houdt zijn offset van twee maanden. */
  const eenmalig = (bedrag, o) => ({ id: 'a', naam: 'Post', bedrag, vervalmaand: over(o), intervalM: 0 });
  const dek = async (page) => (await R(page)).find((r) => r.key === 'dekking');

  test('een eenmalige post die je kunt betalen is ok, niet onbekend', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [eenmalig(25, 2)], manualBal: { [MAIN]: 1500, [RES]: 50, [SAV]: 20000 } }));
    const d = await dek(page);
    /* v317: er IS nu een percentage, want de post draagt zijn hele bedrag in de eis: 50 van 25 is
       200 procent. De uitkomst van v131 staat: ok, en niet onbekend. */
    expect(await page.evaluate(() => dekking(12).graad)).toBe(200);
    expect(await page.evaluate(() => dekking(12).benodigdeStand)).toBe(25);
    expect(d.status).toBe('ok');
    expect(d.waarde).toBe('€50');                                       // v189: je potsaldo
    expect(d.waarde).not.toBe('onbekend');
    /* v314: de kolom zei 'er hoeft nu nog niets opzij' - een feit over de opbouw-EIS - en zegt nu wat
       er na de eerstvolgende post van je pot OVERBLIJFT. Dat is een feit over je pot, in dezelfde
       eenheid als de waarde ernaast, en de linker-sub noemt de post waar het over gaat. Beide
       uitspraken zijn waar; deze gaat over de vraag die de rij stelt. */
    expect(d.eenheid).toBe('in je pot · €25 blijft over');
    expect(d.eenheid).not.toMatch(/%/);
    expect(d.sub).toMatch(/^verwacht: €25 in /);
  });

  test('kun je hem niet betalen, dan is het tekort, met de maand erbij', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [eenmalig(25, 0)], manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 20000 } }));
    const d = await dek(page);
    expect(d.status).toBe('tekort');
    expect(d.waarde).toBe('€10');                                       // v189: je potsaldo
    /* v317: de noemer heet "wat nu nodig is", want de opbouw-eis bestaat nu voor deze post. Bij een
       eenmalige post binnen het venster zijn de twee noemers hetzelfde getal: de eis IS de post. */
    expect(d.eenheid).toBe('in je pot · 40% van wat nu nodig is');
    expect(await page.evaluate(() => {
      const d2 = dekking(12); return [d2.benodigdeStand, d2.gat.bedrag]; })).toEqual([25, 25]);
    expect(d.gevolg).toMatch(/€15 tekort/);                             // het bedrag staat in de zin
    expect(d.gevolg).not.toMatch(/gedekt tot en met \./);               // geen lege maand meer
  });

  test('valt er dit jaar niets, dan zegt hij dat en niet "onbekend"', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [{ id: 'a', naam: 'Post', bedrag: 25, vervalmaand: over(12), intervalM: 12 }] }));
    const d = await dek(page);
    expect(d.status).toBe('ok');
    expect(d.waarde).toMatch(/^€/);                                     // v189: je potsaldo, geen woord
    expect(d.eenheid).toBe('in je pot · niets aankomend dit jaar');
    expect(d.gevolg).toBe('Er komt de komende twaalf maanden niets aan uit je lijst.');
  });

  test('een gat weegt mee, ook als de opbouw op peil is', async ({ page }) => {
    // 600 over 1 maand: benodigdeStand 550, pot 560 -> graad 102%, maar de 600 past niet
    await boot(page, seedM({ reserveringen: [{ id: 'a', naam: 'Post', bedrag: 600, vervalmaand: over(1), intervalM: 12 }], manualBal: { [MAIN]: 1500, [RES]: 560, [SAV]: 20000 } }));
    const d = await dek(page);
    expect(await page.evaluate(() => dekking(12).graad)).toBeGreaterThanOrEqual(100);
    /* v323: een graad op peil met een gat kan alleen bij een LATERE post (een post in deze maand
       draagt zijn hele bedrag in de eis), en die is sinds v323 aandacht. Wat deze test vasthoudt
       staat nog: het gat weegt mee, dus het is geen 'ok'. */
    expect(d.status).toBe('let op');                                     // want er is een gat
    expect(d.gevolg).toMatch(/tekort\./);
  });

  test('bij een tekort staan het percentage en het bedrag er allebei, met de noemer', async ({ page }) => {
    // zonder opbouw-eis: percentage van de post die niet past
    await boot(page, seedM({ reserveringen: [eenmalig(25, 0)], manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 20000 } }));
    let d = await dek(page);
    expect(d.waarde).toBe('€10');                                        // v189: je potsaldo
    expect(d.eenheid).toBe('in je pot · 40% van wat nu nodig is');        // v317: 10 van 25
    expect(d.gevolg).toMatch(/€15 tekort/);                              // bedrag in de zin, niet dubbel

    // met opbouw-eis: percentage van wat nu nodig is
    // v323: deze maand, want alleen dan is het een tekort; de eis is dan de hele post
    await boot(page, seedM({ reserveringen: [{ id: 'a', naam: 'Aanslag', bedrag: 600, vervalmaand: over(0), intervalM: 12 }], manualBal: { [MAIN]: 1500, [RES]: 200, [SAV]: 20000 } }));
    d = await dek(page);
    expect(d.waarde).toBe('€200');                                       // v189: je potsaldo
    expect(d.eenheid).toBe('in je pot · 33% van wat nu nodig is');        // 200 van 600
    expect(d.gevolg).toMatch(/€400 tekort/);
  });

  test('gedektPct komt uit dekking(), niet uit een som op het scherm', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [eenmalig(25, 0)], manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 20000 } }));
    const g = await page.evaluate(() => dekking(12).gat);
    expect(g).toMatchObject({ bedrag: 25, tekort: 15, gedektPct: 40 });
  });

  test('een lege pot is 0 procent, geen verzonnen getal', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [eenmalig(25, 0)], manualBal: { [MAIN]: 1500, [RES]: 0, [SAV]: 20000 } }));
    const d = await dek(page);
    expect(d.waarde).toBe('€0');                                         // v189: een lege pot is nul
    expect(d.eenheid).toBe('in je pot · 0% van wat nu nodig is');          // v317, geen verzonnen getal
    expect(d.gevolg).toMatch(/€25 tekort/);
  });

  /* v317: DE TAK ZONDER OPBOUW-EIS IS NIET DOOD, en dat is gemeten en niet aangenomen. Een
     kwartaalpost die verder weg ligt dan zijn eigen interval heeft `intervalM - offset <= 0` en
     draagt dus nul in de eis, terwijl hij wel een voorkomen binnen de horizon heeft. Dan is `graad`
     null en valt de eenheid terug op het percentage van de eerstvolgende post (v132). Zonder dit
     geval zou die tak alleen nog levend LIJKEN. */
  test('een kwartaalpost verder weg dan zijn interval heeft geen opbouw-eis, en dan geldt v132', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [{ id: 'a', naam: 'Kwartaal', bedrag: 120, vervalmaand: over(5), intervalM: 3 }],
      manualBal: { [MAIN]: 1500, [RES]: 60, [SAV]: 20000 } }));
    const g = await page.evaluate(() => { const x = dekking(12); return { eis: x.benodigdeStand, graad: x.graad, n: x.regels.filter((r) => r.soort === 'post').length }; });
    expect(g.n).toBeGreaterThan(0);          // hij rolt wel uit
    expect(g.eis).toBe(0);                   // en draagt toch niets in de eis
    expect(g.graad).toBeNull();
    const d = await dek(page);
    /* v323: die post valt over vijf maanden en is dus aandacht, en dan noemt de eenheid het bedrag
       per maand tot de vervaldag (60 over zes maanden, deze meegeteld). DE v132-TAK IN DE EENHEID IS
       DAARMEE ONBEREIKBAAR: een tekort valt in de lopende maand, en daar draagt elke post zijn hele
       bedrag in de eis, dus `graad` is er nooit null. De eis zelf (hierboven) staat nog. */
    expect(d.status).toBe('let op');
    expect(d.eenheid).toMatch(/^in je pot · €10 per maand tot \w+$/);
  });

  test('zonder tekort blijft de eenheid schoon', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [eenmalig(25, 2)], manualBal: { [MAIN]: 1500, [RES]: 50, [SAV]: 20000 } }));
    const d = await dek(page);
    expect(d.eenheid).toBe('in je pot · €25 blijft over');   // v314, zie hierboven
    expect(d.eenheid).not.toMatch(/tekort/);
  });

  test('de zin komt uit dekkingTekst, niet uit een tweede formulering', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => ({
      regel: maandRegels().find((r) => r.key === 'dekking').gevolg,
      bron: dekkingTekst(dekking(12)),
    }));
    expect(uit.regel).toBe(uit.bron);
  });
});

test.describe('d · het oordeel', () => {
  /* v340: de oordeelzin ("Je systeem houdt stand tot ...", "Er is deze maand één ding dat ...", "Alle N
     regels staan goed.", "Er ontbreekt te veel om een oordeel te geven.") en zijn subregel zijn
     vervallen met maandOordeel(), want Grip heeft geen samenvatting meer. De tests a, d2, e en "de
     subregel" toetsten alleen die zin en zijn weg. Wat bleef: de statussen die het oordeel telde, en
     die staan nu als kleur in de tegels. */
  test('b: één tekort, één rode tegel', async ({ page }) => {
    await boot(page, seedM({ nfMaanden: 3, manualBal: { [MAIN]: 1500, [RES]: 2000, [SAV]: 2000 } }));
    const r = await R(page);
    expect(r.filter((x) => x.status === 'tekort').map((x) => x.key)).toEqual(['buffer']);
    const t = await tegels(page);
    expect(t.filter((x) => x.kleur === 'rood').map((x) => x.key)).toEqual(['buffer']);
  });

  test('b: meerdere tekorten, evenveel rode tegels', async ({ page }) => {
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 }, reserveringen: [{ id: 'a', naam: 'Gemeente', bedrag: 480, vervalmaand: over(0), intervalM: 0 }] }));   // v323
    const r = await R(page);
    const tekort = r.filter((x) => x.status === 'tekort').map((x) => x.key);
    expect(tekort.length).toBeGreaterThan(1);
    const t = await tegels(page);
    expect(t.filter((x) => x.kleur === 'rood').map((x) => x.key).sort()).toEqual(tekort.sort());
  });

  /* v187: een richtbedrag boven de stand zet de buffer op 'let op' zonder dat er iets misgaat. */
  test('c: alleen let op', async ({ page }) => {
    await boot(page, seedM({ nfMaanden: 40, nfDoelVast: 19000, nfToegewezen: 19000 }));
    const r = await R(page);
    expect(r.filter((x) => x.status === 'tekort').length).toBe(0);
    expect(r.filter((x) => x.status === 'let op').length).toBe(1);
    const t = await tegels(page);
    expect(t.filter((x) => x.kleur === 'rood').length).toBe(0);
    expect(t.filter((x) => x.kleur === 'amber').length).toBe(1);
  });

  test('d: alles goed, geen felicitatie', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { const s = Math.round(spaarSaldo().cur);
      /* v242: 'alles ok' vraagt sinds de grendel ook een VOLLE buffer. */
      const b = s - Math.round(+SET.goals[0].gespaard || 0);
      SET.nfDoelVast = b; SET.nfToegewezen = b; save(); });
    const r = await page.evaluate(() => { const R = maandRegels(); return { n: R.length, ok: R.filter((x) => x.status === 'ok').length }; });
    expect(r.ok).toBe(r.n);                                                          // alles ok in deze opzet
    const t = (await tegels(page)).filter((x) => x.key !== 'beleggen');
    expect(t.length).toBe(r.n);
    expect(t.every((x) => x.kleur === 'groen')).toBe(true);
    const tekst = await page.locator('#s-maand').innerText();
    expect(tekst).not.toMatch(/[!—]/);
    expect(tekst).not.toMatch(/mooi|knap|goed bezig|gefeliciteerd/i);
  });
});

test.describe('e · indeling', () => {
  /* v340: de kaarten "Vraagt een beslissing", "Vraagt aandacht" en "Staat goed" zijn vervallen; het
     onderscheid zit nu in de kleur van elke tegel. */
  test('de tegels scheiden beslissing van aandacht in hun kleur', async ({ page }) => {
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 } }));
    const R2 = await R(page);
    const t = await tegels(page);
    for (const r of R2) expect(t.find((x) => x.key === r.key).kleur, r.key).toBe(KLEUR[r.status]);
    expect(t.some((x) => x.kleur === 'rood')).toBe(true);
    const tekst = await page.locator('#s-maand').innerText();
    expect(tekst).not.toMatch(/vraagt een beslissing|vraagt aandacht|staat goed/i);
  });

  /* v134: de zin telde alleen de tekorten terwijl de kaart ook de let-op-regels toonde.
     v340: de zin en de beslissingskaart zijn vervallen. Wat blijft: precies de tekorten zijn rood. */
  test('precies de tekorten zijn rood, en niet de let-op-regels', async ({ page }) => {
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 },
      reserveringen: [{ id: 'a', naam: 'Gemeente', bedrag: 480, vervalmaand: over(0), intervalM: 12 }] }));   // v323
    const R3 = await R(page);
    const t = await tegels(page);
    expect(R3.filter((r) => r.status === 'tekort').length).toBeGreaterThan(1);
    expect(t.filter((x) => x.kleur === 'rood').length).toBe(R3.filter((r) => r.status === 'tekort').length);
    expect(t.filter((x) => x.kleur === 'amber').length).toBe(R3.filter((r) => r.status === 'let op').length);
  });

  /* v340: de kaarten zijn tegels geworden, gesorteerd op kleur (rood, amber, groen, grijs) en binnen een
     kleur op de vaste volgorde van MAAND_VOLGORDE. De oude vorm van deze test las kaarten die niet
     meer bestaan en stond daardoor groen op een lege lijst. */
  test('de tegels staan op kleur, en binnen een kleur in de vaste volgorde', async ({ page }) => {
    await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 } }));
    const t = await tegels(page);
    const volg = await page.evaluate(() => MAAND_VOLGORDE);
    const rang = { rood: 0, amber: 1, groen: 2, grijs: 3 };
    expect(t.length).toBeGreaterThan(1);
    const sleutel = t.map((x) => [rang[x.kleur], x.key === 'beleggen' ? 99 : volg.indexOf(x.key)]);
    const gesorteerd = sleutel.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    expect(sleutel).toEqual(gesorteerd);
  });

  test('alles ok: geen rode of amber tegel', async ({ page }) => {
    await boot(page);
    // v172: alles ok betekent ook: al je spaargeld is toegewezen
    await page.evaluate(() => { const s = Math.round(spaarSaldo().cur);
      const b = s - Math.round(+SET.goals[0].gespaard || 0);   // v242: de buffer moet vol zijn
      SET.nfDoelVast = b; SET.nfToegewezen = b;
      save(); go('maand'); });
    /* v340: er zijn geen kaarten meer om weg te laten; bij alles ok is geen enkele tegel rood of amber. */
    const t = await tegels(page);
    expect(t.length).toBeGreaterThan(0);
    expect(t.filter((x) => x.kleur === 'rood' || x.kleur === 'amber')).toEqual([]);
  });

  test('zonder enige bron: één rustige regel met een tik naar Instellingen', async ({ page }) => {
    await boot(page, seedM({ manualBal: {}, goals: [], reserveringen: [], resAcc: undefined, nfDoelVast: undefined }));
    const r = await R(page);
    const bruikbaar = r.filter((x) => x.status !== 'onbekend');
    if (!r.length) {
      const h = await page.evaluate(() => { renderMaand(); return document.querySelector('#s-maand').innerHTML; });
      expect(h).toContain('te weinig ingesteld');
      expect(h).toContain("go('set')");
    } else {
      expect(bruikbaar.length).toBeLessThanOrEqual(r.length);
    }
  });
});

test.describe('f · de twee verbandregels', () => {
  test('regel 1: een uitgave boven normaal dekt het gat', async ({ page }) => {
    // 10000 in 20 maanden = 500 nodig; de waterfall geeft dit doel 300, dus een gat van 200,
    // en dat past binnen de 320 die boodschappen boven normaal ligt
    await boot(page, seedM({ goals: [{ id: 'g1', naam: 'Vakantie', doel: 10000, gespaard: 0, allocMode: 'fixed', perMaand: 100, streefdatum: over(20) }] }, { uitschieter: true }));
    const r = await R(page);
    expect(r.find((x) => x.key === 'doel').status).toBe('tekort');
    const v = await VB(page);
    expect(v).toMatch(/per maand extra naar vakantie sluit het gat\./);
    expect(v).toMatch(/Dat is ongeveer wat je boodschappen boven je normaal ligt\.$/);
  });

  test('regel 1 zwijgt als het tekort groter is dan de overschrijding', async ({ page }) => {
    await boot(page, seedM({ goals: [{ id: 'g1', naam: 'Vakantie', doel: 90000, gespaard: 0, allocMode: 'fixed', perMaand: 100, streefdatum: over(12) }] }, { uitschieter: true }));
    const v = await VB(page);
    expect(v).not.toMatch(/sluit het gat/);
  });

  test('regel 2: niet-toegewezen geld dekt N maanden van het tekort', async ({ page }) => {
    await boot(page, seedM({ nfDoelVast: 3000, goals: [{ id: 'g1', naam: 'Vakantie', doel: 40000, gespaard: 1000, allocMode: 'fixed', perMaand: 100, streefdatum: over(20) }] }));
    const r = await R(page);
    expect(r.find((x) => x.key === 'doel').status).toBe('tekort');
    expect(await page.evaluate(() => spaarVrij().vrij)).toBeGreaterThan(0);
    expect(await VB(page)).toMatch(/^Er staat €[\d.]+ niet toegewezen\. Dat dekt \d+ maand(en)? van je tekort\.$/);
  });

  test('geen van beide: geen verbandzin', async ({ page }) => {
    await boot(page);
    expect(await VB(page)).toBe('');
  });

  // v166: MAAND_VERBANDEN stond altijd op true en is verwijderd. De twee verbandzinnen zelf
  // worden hierboven en hieronder getoetst.

  test('de signalen dragen nu cat, bedrag en boven, zonder dat de tekst verandert', async ({ page }) => {
    await boot(page, seedM({}, { uitschieter: true }));
    const n = await page.evaluate(() => scoreNotifs().find((x) => String(x.key).indexOf('discr-') === 0));
    expect(n.cat).toBe('boodschappen');
    expect(n.bedrag).toBe(620);
    expect(n.boven).toBe(320);
    expect(n.l1).toContain('boven je normaal');
  });
});

test.describe('g · leesmoment en robuustheid', () => {
  test('de datum wordt vastgelegd bij het openen, zonder streak of teller', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => SET.maandGelezen || null)).toBeNull();
    await page.evaluate(() => go('maand'));
    const d = await page.evaluate(() => SET.maandGelezen);
    // v177: de app legt de LOKALE dag vast, niet de UTC-dag; die verschillen tussen middernacht
    // en 02:00 zomertijd
    const nu = new Date();
    expect(d).toBe(nu.getFullYear() + '-' + String(nu.getMonth() + 1).padStart(2, '0') + '-' + String(nu.getDate()).padStart(2, '0'));
    await page.evaluate(() => go('maand'));
    const t = await page.locator('#s-maand').innerText();
    /* v340: de regel "Gelezen op <datum>" is vervallen; SET.maandGelezen wordt nog wel gezet (hierboven). */
    expect(t).not.toMatch(/Gelezen op/);
    expect(t).not.toMatch(/streak|op rij|dagen achter|\d+x gelezen/i);
  });

  test('het scherm werkt met één van de drie bronnen', async ({ page }) => {
    await boot(page, seedM({ reserveringen: [], goals: [] }));
    const r = await R(page);
    expect(r.map((x) => x.key)).toEqual(['buffer']);
    await page.evaluate(() => go('maand'));
    expect(await page.locator('#s-maand').innerText()).not.toContain('onbekend');
  });

  test('een stukkende bron laat de rest staan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const orig = window.dekking;
      window.dekking = () => { throw new Error('stuk'); };
      const uit = maandRegels().map((x) => x.key);
      window.dekking = orig;
      return uit;
    });
    expect(r).not.toContain('dekking');
    expect(r).toContain('buffer');
    expect(r.length).toBe(2);
  });

  test('de waardekolom blijft een kolom, geen verticale strook', async ({ page }) => {
    // v133: een lange eenheid perste zich in de ongelimiteerde rechterkolom tot een woord per regel
    await page.setViewportSize({ width: 360, height: 780 });
    /* v322: de rij moet in zijn UITGEKLAPTE vorm staan, dus op 'let op'. Dat hing aan de vaste marge
       van drie maanden; sinds v322 aan een gemeten stortingstempo, en daarvoor zijn drie afgeronde
       maanden met een storting op de reserveringsrekening nodig. */
    const P = seedM({ reserveringen: [{ id: 'a', naam: 'Gemeentelijke aanslag', bedrag: 25, vervalmaand: over(3), intervalM: 0 }], manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 4000 } });
    const T = JSON.parse(P.minder_tx);
    for (const n of [-3, -2, -1]) T.push({ id: 'rs' + n, date: over(n) + '-12', amount: 20, acc: RES, name: 'Eigen rekening', desc: 'RESERVERINGEN', typ: '', ref: '', src: 'csv', accName: 'Res', refNums: [] });
    P.minder_tx = JSON.stringify(T);
    await boot(page, P);
    expect(await page.evaluate(() => maandRegels().find((r) => r.key === 'dekking').status)).toBe('let op');
    /* v340: de lijstregel op Grip is een tegel geworden; de waarde met haar eenheid staat naast de naam
       in de sheet erachter, en daar geldt dezelfde eis. */
    await page.evaluate(() => openMaandBeslis('dekking'));
    const uit = await page.evaluate(() => {
      const kol = document.querySelector('#sheet [data-sheetbedrag="dekking"]');
      const rechts = kol.getBoundingClientRect();
      return { breedte: Math.round(rechts.width), hoogte: Math.round(rechts.height), rij: Math.round(kol.parentElement.getBoundingClientRect().width) };
    });
    expect(uit.breedte / uit.rij).toBeLessThanOrEqual(0.45);   // begrensd, dus de zin houdt ruimte
    expect(uit.breedte).toBeGreaterThan(80);                   // maar breed genoeg voor twee woorden
    expect(uit.hoogte).toBeLessThanOrEqual(60);                // hooguit een paar regels, geen strook
  });

  for (const w of [360, 390]) {
    test(`geen overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page, seedM({ manualBal: { [MAIN]: 1500, [RES]: 10, [SAV]: 2000 } }, { uitschieter: true }));
      await page.evaluate(() => go('maand'));
      const o = await page.evaluate(() => ({
        sec: document.querySelector('#s-maand').scrollWidth - document.querySelector('#s-maand').clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(o.sec).toBeLessThanOrEqual(1);
      expect(o.body).toBeLessThanOrEqual(1);
    });
  }
});
