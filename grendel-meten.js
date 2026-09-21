/* grendel-meten.js (v243)
 *
 * Waarom dit bestand bestaat: op jouw toestel verschuift het pijltje omlaag bij het noodfonds het
 * doel van plek 1 naar plek 2, terwijl de grendel dicht hoort te zijn. Op de testdata hier gebeurt
 * dat niet. Dan neemt jouw data een ander pad door dezelfde code, en dat pad is alleen op jouw
 * toestel te zien. Dit script leest het uit.
 *
 * HOE JE HEM DRAAIT
 *   1. Open Minder zoals je hem normaal gebruikt, met je eigen data erin.
 *   2. Open de console en plak de hele inhoud van dit bestand. Druk op enter.
 *   3. Er komt een blok tekst terug. Stuur dat blok door.
 *
 * DIT SCRIPT LEEST ALLEEN. Geen save(), niets naar SET, niets naar localStorage, geen netwerk.
 * Hij roept planMove() niet aan: de grendelcheck wordt nagerekend, niet uitgevoerd, dus je
 * volgorde verandert niet. Je kunt hem zo vaak draaien als je wilt.
 *
 * Het blok staat na afloop ook in window.__grendelMeting, voor het geval je console hem afkapt.
 */
(async function(){
  const L=[]; const p=(s)=>L.push(s);
  const J=(v)=>{ try{ return JSON.stringify(v); }catch(_){ return '<niet leesbaar>'; } };
  const T=(fn,fallback)=>{ try{ return fn(); }catch(e){ return (fallback!==undefined?fallback:'FOUT: '+e.message); } };

  p('=== MINDER GRENDELMETING ===');
  p('tijd: '+new Date().toString());

  /* 1. Draait er oude code? De cachenaam zegt welke versie de service worker heeft opgeslagen, de
        bronregel zegt welke code er nu in het geheugen staat. Die twee kunnen uiteenlopen. */
  p('');
  p('-- 1. welke versie draait --');
  p('caches: '+await (async()=>{ try{ return (await caches.keys()).join(', ')||'<geen>'; }
    catch(e){ return 'FOUT: '+e.message; } })());
  p('sw controller: '+T(()=>{ const c=navigator.serviceWorker&&navigator.serviceWorker.controller;
    return c?c.scriptURL:'<geen controller>'; }));
  p('sw wachtend: '+await (async()=>{ try{ const r=await navigator.serviceWorker.getRegistration();
    if(!r) return '<geen registratie>';
    return (r.waiting?'ja (oude worker nog actief)':'nee')+' | installing: '+(r.installing?'ja':'nee'); }
    catch(e){ return 'FOUT: '+e.message; } })());
  p('planGrendel bestaat: '+(typeof planGrendel));
  p('planMove draagt de grendelcheck: '+T(()=>/planGrendel\(\)/.test(planMove.toString())?'JA':'NEE (oude code)'));
  p('doelTempo bestaat: '+(typeof doelTempo)+' | insEyebrow bestaat: '+(typeof insEyebrow));

  /* 2. De volgorde zoals hij is opgeslagen, naast de volgorde zoals hij nu in het geheugen staat.
        Lopen die uiteen, dan is er deze sessie iets gezet dat niet is weggeschreven of andersom. */
  p('');
  p('-- 2. de volgorde --');
  p('SET.planOrder (geheugen): '+J(T(()=>SET.planOrder)));
  p('planOrder (localStorage): '+J(T(()=>JSON.parse(localStorage.getItem('minder_set')||'{}').planOrder)));
  p('planItems() getoond:      '+J(T(()=>planItems().map(x=>x.id))));
  p('planItems() namen:        '+J(T(()=>planItems().map(x=>x.naam))));
  p('SET.planPaused: '+J(T(()=>SET.planPaused)));

  /* 3. De grendel zelf, plus alles waar hij op rekent. De twee "te gaan"-bedragen onderaan komen
        uit verschillende bronnen: het plan rekent met wat je hebt TOEGEWEZEN, de bufferregel met
        wat er GEMETEN op je spaarrekening staat. Wijken die af, dan is dat het antwoord. */
  p('');
  p('-- 3. de grendel --');
  p('planGrendel(): '+J(T(()=>planGrendel())));
  p('planGrendelDatum(): '+J(T(()=>planGrendelDatum())));
  p('planCapacity(): '+J(T(()=>planCapacity())));
  p('monthlySavingTarget(): '+J(T(()=>monthlySavingTarget())));
  const NF=T(()=>planMap()[PLAN_NF],null);
  p('planMap()[noodfonds]: '+J(NF&&{id:NF.id,type:NF.type,doel:NF.doel,gespaard:NF.gespaard,
      nfOnbekend:NF.nfOnbekend,mode:NF.mode,perMaand:NF.perMaand,pct:NF.pct}));
  p('SET.nfToegewezen: '+J(T(()=>SET.nfToegewezen))+' | migrated: '+J(T(()=>SET.nfToegewezenMigrated)));
  p('noodfondsModel().doel: '+J(T(()=>Math.round(noodfondsModel().doel||0))));
  p('noodfondsModel().spaar: '+J(T(()=>noodfondsModel().spaar)));
  p('spaarSaldo(): '+J(T(()=>spaarSaldo())));
  p('te gaan volgens het PLAN   (doel - nfToegewezen): '+J(T(()=>{
      const d=Math.round(noodfondsModel().doel||0), t=Math.max(Math.round(+SET.nfToegewezen||0),0);
      return Math.max(d-t,0); })));
  p('te gaan volgens de BUFFER  (doel - spaarsaldo):   '+J(T(()=>{
      const d=Math.round(noodfondsModel().doel||0), s=spaarSaldo();
      return s.missing?'onbekend':Math.max(d-Math.round(s.cur),0); })));

  /* 4. Wat de grendelcheck in planMove() op jouw gegevens zou beslissen. Dit is de regel zelf,
        nagerekend op een kopie van de lijst. planMove() wordt niet aangeroepen. */
  p('');
  p('-- 4. wat planMove() zou beslissen (nagerekend, niet uitgevoerd) --');
  T(()=>{
    const G=planGrendel();
    const items=planItems();
    const ids0=items.map(x=>x.id);
    p('grendel dicht: '+(G?'JA':'NEE'));
    items.forEach((it,i)=>{
      [[-1,'omhoog'],[1,'omlaag']].forEach(([dir,lbl])=>{
        const ids=ids0.slice(); const j=i+dir;
        if(j<0||j>=ids.length){ p(`  ${i}. ${it.naam} ${lbl}: geen buur, valt uit op de grens`); return; }
        ids.splice(j,0,ids.splice(i,1)[0]);
        const blok=!!(G&&ids[0]!==PLAN_NF);
        p(`  ${i}. ${it.naam} (${it.id}) ${lbl}: ${blok?'GEBLOKKEERD':'DOORGELATEN'} -> ${J(ids)}`);
      });
    });
    return '';
  });

  /* 5. Wat allocatePlan() aan dezelfde items hangt. Loopt dit uiteen met punt 4, dan beslissen de
        twee functies verschillend over dezelfde grendel. */
  p('');
  p('-- 5. wat allocatePlan() zegt --');
  T(()=>{
    allocatePlan().forEach((x,i)=>p(`  ${i}. ${x.naam} (${x.id}) type=${x.type} mode=${x.mode}`
      +` status=${J(x.status)} alloc=${x.alloc} rest=${x.rest} grendel=${x.grendel?'ja':'nee'}`));
    return '';
  });

  p('');
  p('=== EINDE ===');
  const uit=L.join('\n');
  window.__grendelMeting=uit;
  console.log(uit);
  return uit;
})();
