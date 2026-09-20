/* piekdag-meten.js (v239)
 *
 * Waarom dit bestand bestaat: de twee knoppen van het piekdag-signaal staan in index.html, maar
 * wat ze op JOUW maanden doen is hier niet te zien. Je data staat in localStorage op je eigen
 * toestel en verlaat het apparaat niet. Dit script laat je die twee waarden zelf beoordelen.
 *
 * HOE JE HEM DRAAIT
 *   1. Open Minder in je browser (de gewone app, met je eigen data erin).
 *   2. Open de console. Chrome en Edge: F12, dan het tabblad Console. Safari op de Mac:
 *      Ontwikkelaar, dan Toon JavaScript-console. Op een telefoon lukt dit niet; gebruik je laptop.
 *   3. Plak de hele inhoud van dit bestand en druk op enter.
 *
 * Wil je andere waarden proberen, pas dan de twee constanten hieronder aan en plak opnieuw.
 *
 * DIT SCRIPT LEEST ALLEEN. Geen save(), niets naar SET of localStorage, geen netwerk. Je kunt hem
 * zo vaak draaien als je wilt; er verandert niets aan je gegevens.
 *
 * De cijfers komen uit piekVerdeling() en piekReferentie() van de app zelf, zodat dit script en je
 * scherm niet uiteen kunnen lopen. Alleen de twee drempels hieronder zijn van dit script.
 */
(function () {
  // ---- de twee knoppen: pas aan en plak opnieuw ----
  var PIEK_MIN_TX = 8;     // minimum aantal losse transacties in de maand
  var PIEK_FACTOR = 1.5;   // keer je eigen gemiddelde aandeel voor die weekdag
  // --------------------------------------------------

  if (typeof piekVerdeling !== 'function' || typeof piekReferentie !== 'function') {
    console.log('Dit script hoort bij v239 of later. Sluit Minder helemaal af, open hem opnieuw ' +
                'zodat de nieuwe versie geladen wordt, en plak dit dan nog een keer.');
    return;
  }

  var DAG = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  var nu = thisYM();
  var afgerond = months().filter(function (m) { return m < nu; });

  if (!afgerond.length) {
    console.log('Er is nog geen afgeronde maand in je data, dus er valt niets te meten.');
    return;
  }

  var rijen = afgerond.map(function (m) {
    var V = piekVerdeling(m);
    var ref = piekReferentie(m);
    if (!V) return { m: m, uitkomst: 'geen losse uitgaven' };
    var peak = V.aandeel.indexOf(Math.max.apply(null, V.aandeel));
    var r = { m: m, n: V.n, dag: DAG[peak],
              aandeel: Math.round(V.aandeel[peak] * 100),
              normaal: ref ? Math.round(ref[peak] * 100) : null,
              factor: (ref && ref[peak] > 0) ? V.aandeel[peak] / ref[peak] : null };
    if (V.n < PIEK_MIN_TX)          r.uitkomst = 'stil, ' + V.n + ' boekingen (minimum ' + PIEK_MIN_TX + ')';
    else if (!ref)                  r.uitkomst = 'stil, geen drie afgeronde maanden ervoor';
    else if (!(ref[peak] > 0))      r.uitkomst = 'stil, geen gemiddelde voor die dag';
    else if (r.factor < PIEK_FACTOR) r.uitkomst = 'stil, onder de factor';
    else                            r.uitkomst = 'VUURT';
    return r;
  });

  var k = function (s, n) { s = String(s); return s + Array(Math.max(n - s.length + 1, 1)).join(' '); };
  var r = function (s, n) { s = String(s); return Array(Math.max(n - s.length + 1, 1)).join(' ') + s; };
  var pct = function (v) { return v == null ? '-' : v + '%'; };
  var fac = function (v) { return v == null ? '-' : (Math.round(v * 10) / 10).toString().replace('.', ',') + 'x'; };

  console.log('');
  console.log('Piekdag, gemeten over ' + afgerond.length + ' afgeronde ' +
              (afgerond.length === 1 ? 'maand' : 'maanden') +
              '   (minimum ' + PIEK_MIN_TX + ' boekingen, factor ' +
              String(PIEK_FACTOR).replace('.', ',') + 'x)');
  console.log('Losse uitgaven, zonder vaste lasten en zonder onvoorzien.');
  console.log('');
  console.log(k('maand', 10) + r('losse', 6) + '  ' + k('piekdag', 11) +
              r('aandeel', 8) + r('normaal', 9) + r('factor', 8) + '  uitkomst');
  console.log(Array(76).join('-'));
  rijen.forEach(function (x) {
    if (x.n == null) { console.log(k(x.m, 10) + '  ' + x.uitkomst); return; }
    console.log(k(x.m, 10) + r(x.n, 6) + '  ' + k(x.dag, 11) +
                r(pct(x.aandeel), 8) + r(pct(x.normaal), 9) + r(fac(x.factor), 8) + '  ' + x.uitkomst);
  });
  console.log(Array(76).join('-'));

  var vuurt = rijen.filter(function (x) { return x.uitkomst === 'VUURT'; });
  console.log('Bij deze waarden vuurt de piekdag in ' + vuurt.length + ' van de ' + rijen.length +
              ' maanden' + (vuurt.length ? ': ' + vuurt.map(function (x) { return x.m + ' (' + x.dag + ')'; }).join(', ') : '') + '.');
  var stilMin = rijen.filter(function (x) { return /minimum/.test(x.uitkomst || ''); }).length;
  var stilHist = rijen.filter(function (x) { return /drie afgeronde/.test(x.uitkomst || ''); }).length;
  if (stilMin)  console.log(stilMin + ' ' + (stilMin === 1 ? 'maand haalt' : 'maanden halen') + ' het minimum aantal boekingen niet.');
  if (stilHist) console.log(stilHist + ' ' + (stilHist === 1 ? 'maand heeft' : 'maanden hebben') + ' geen drie afgeronde maanden ervoor, dus geen referentie.');
  console.log('');
})();
