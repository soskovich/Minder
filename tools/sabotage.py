#!/usr/bin/env python3
"""Sabotagerunner voor Minder (v364).

Een sabotage vervangt een stuk index.html, draait een of meer specs en zet de bron terug. Een sabotage hoort de
spec rood te zetten; blijft hij groen, dan toetst de spec iets anders dan hij zegt (CLAUDE.md, meetlessen).

WAAROM DIT BESTAND BESTAAT: drie keer (v300, v315, v337, en opnieuw bij v363) bleef een sabotage in index.html
staan omdat de runner werd afgebroken tussen schrijven en terugzetten. Een try/finally dekt een SIGKILL niet af.
Deze runner zet de bron terug op vier manieren, en de vierde vangt wat de eerste drie niet kunnen:
  1. na elke sabotage, in een finally;
  2. bij SIGTERM, SIGINT en SIGHUP, in een signaalhandler;
  3. bij het afsluiten van Python (atexit);
  4. bij de volgende start: een slot (.sabotage-actief) wijst de backup aan, en een slot van een proces dat niet
     meer leeft wordt eerst hersteld. Het pre-commit-haakje (python3 tools/sabotage.py --controle) weigert een
     commit zolang dat slot er ligt.
Elke gesaboteerde versie draagt daarnaast een marker aan het eind (SABOTAGE_MARKER), zodat ook een kopie die
ergens anders terechtkomt herkenbaar is.

Gebruik:
  python3 tools/sabotage.py plan.json [--config pw.config.js]   draai de sabotages uit het plan
  python3 tools/sabotage.py --herstel                           zet de backup terug en ruim het slot op
  python3 tools/sabotage.py --controle                          de pre-commit-controle

plan.json: {"specs": ["tests/a.spec.js"], "timeout": 300,
            "sabotages": [{"naam": "...", "zoek": "...", "vervang": "...", "specs": [optioneel]}]}
"""
import atexit, hashlib, json, os, re, shutil, signal, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRON = os.path.join(ROOT, 'index.html')
SLOT = os.path.join(ROOT, '.sabotage-actief')
MAP = os.path.join(ROOT, '.git', 'sabotage')
SCHOON = os.path.join(MAP, 'schoon.html')      # de bron zoals hij was voor de laatste run
LOG = os.path.join(MAP, 'laatste.json')         # de sabotages van de laatste run, voor --controle
SABOTAGE_MARKER = '<!-- SABOTAGE-ACTIEF: deze versie van index.html is gesaboteerd, zet hem terug -->'
CONTEXT = 40

def sha(tekst): return hashlib.sha256(tekst.encode('utf8')).hexdigest()
def lees(p):
    with open(p, encoding='utf8') as f: return f.read()
def schrijf(p, tekst):
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf8') as f: f.write(tekst)
    os.replace(tmp, p)   # atomair: een afbreking laat nooit een half bestand achter

def leeft(pid):
    try: os.kill(pid, 0); return True
    except ProcessLookupError: return False
    except PermissionError: return True

def herstel(reden):
    """Zet de backup uit het slot terug. Geeft True als er iets is teruggezet of het al goed stond."""
    if not os.path.exists(SLOT): return False
    s = json.loads(lees(SLOT))
    schoon = lees(s['backup'])
    if sha(schoon) != s['sha']:
        sys.exit(f'FOUT: de backup {s["backup"]} wijkt af van het slot; niets teruggezet. Herstel met de hand.')
    if lees(BRON) != schoon:
        schrijf(BRON, schoon)
        print(f'index.html teruggezet ({reden}).', file=sys.stderr, flush=True)
    os.remove(SLOT)
    return True

def zet_slot():
    os.makedirs(MAP, exist_ok=True)
    if os.path.exists(SLOT):
        s = json.loads(lees(SLOT))
        if leeft(s.get('pid', -1)) and s.get('pid') != os.getpid():
            sys.exit(f'FOUT: er loopt al een sabotagerun (pid {s["pid"]}).')
        herstel('slot van een afgebroken run')
    schoon = lees(BRON)
    if SABOTAGE_MARKER in schoon:
        sys.exit('FOUT: index.html draagt de sabotagemarker en er is geen slot om hem mee terug te zetten. '
                 'Zet de bron met git terug voordat je een run start.')
    shutil.copyfile(BRON, SCHOON)
    schrijf(SLOT, json.dumps({'pid': os.getpid(), 'backup': SCHOON, 'sha': sha(schoon), 'gestart': time.strftime('%Y-%m-%d %H:%M:%S')}))
    return schoon

KIND = {'p': None}
def bij_signaal(sig, _frame):
    p = KIND['p']
    if p and p.poll() is None:
        try: os.killpg(p.pid, signal.SIGKILL)
        except Exception: pass
    herstel(f'signaal {sig}')
    sys.exit(128 + sig)

def draai(specs, config, timeout):
    cmd = ['npx', 'playwright', 'test', *specs, '--reporter=line'] + (['-c', config] if config else [])
    env = dict(os.environ, TZ='Europe/Amsterdam')
    p = subprocess.Popen(cmd, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
    KIND['p'] = p
    try:
        out, _ = p.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(p.pid, signal.SIGKILL); p.communicate()
        return 'TIMEOUT', ''
    finally:
        KIND['p'] = None
    m = re.search(r'(\d+) failed', out)
    if m: return f'ROOD {m.group(1)}', out
    if p.returncode != 0: return f'FOUT exit {p.returncode}', out
    return 'GROEN', out

def handtekening(schoon, zoek, vervang):
    """De tekst die een sabotage achterlaat, met context: staat hij in een bron en niet in de schone, dan is die
    sabotage blijven staan. Ook een sabotage die alleen iets weghaalt laat zo een herkenbare naad achter."""
    i = schoon.find(zoek)
    if i < 0: return None
    return schoon[max(0, i - CONTEXT):i] + vervang + schoon[i + len(zoek):i + len(zoek) + CONTEXT]

def run(plan_pad, config):
    plan = json.loads(lees(plan_pad))
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP): signal.signal(sig, bij_signaal)
    schoon = zet_slot()
    atexit.register(lambda: herstel('afsluiten'))
    log, uitslag = [], []
    try:
        for s in plan['sabotages']:
            n = schoon.count(s['zoek'])
            if n != 1:
                uitslag.append((s['naam'], f'ZOEKTEKST {n}x')); print(uitslag[-1], flush=True); continue
            log.append({'naam': s['naam'], 'handtekening': handtekening(schoon, s['zoek'], s['vervang'])})
            schrijf(LOG, json.dumps({'schoon_sha': sha(schoon), 'sabotages': log}))
            try:
                schrijf(BRON, schoon.replace(s['zoek'], s['vervang']) + '\n' + SABOTAGE_MARKER + '\n')
                u, _ = draai(s.get('specs') or plan['specs'], config, plan.get('timeout', 300))
            finally:
                schrijf(BRON, schoon)
            uitslag.append((s['naam'], u)); print(uitslag[-1], flush=True)
    finally:
        schrijf(BRON, schoon)
        gelijk = lees(BRON) == schoon
        if gelijk and os.path.exists(SLOT): os.remove(SLOT)
        print('bron terug:', gelijk, flush=True)
        if not gelijk: sys.exit('FOUT: index.html wijkt af van de backup in ' + SCHOON)
    groen = [u for u in uitslag if not u[1].startswith('ROOD')]
    print(f'{len(uitslag) - len(groen)} van {len(uitslag)} rood' + ('' if not groen else '; niet rood: ' + ', '.join(u[0] for u in groen)))

def controle():
    """Pre-commit: faalt bij een slot, een marker, of een sabotage die in de te committen bron is blijven staan."""
    fout = []
    if os.path.exists(SLOT): fout.append('er ligt een sabotageslot (.sabotage-actief): draai python3 tools/sabotage.py --herstel')
    werk = lees(BRON)
    git = lambda *a: subprocess.run(['git', *a], cwd=ROOT, capture_output=True, text=True)
    staged = git('show', ':index.html').stdout or werk
    # Alleen wat de commit meeneemt telt voor de handtekening: een sabotage kan precies de tekst van HEAD
    # terugzetten, en dan zou een commit die index.html niet raakt ten onrechte vallen.
    raakt = 'index.html' in git('diff', '--cached', '--name-only').stdout.split()
    for naam, tekst in (('index.html', werk), ('index.html (staged)', staged)):
        if SABOTAGE_MARKER in tekst: fout.append(f'{naam} draagt de sabotagemarker')
    if raakt and os.path.exists(LOG) and os.path.exists(SCHOON):
        schoon = lees(SCHOON); L = json.loads(lees(LOG))
        for s in L.get('sabotages', []):
            h = s.get('handtekening')
            if h and h not in schoon and h in staged:
                fout.append(f'index.html (staged) draagt nog de sabotage "{s["naam"]}" uit de laatste run')
    r = subprocess.run(['node', 'check.js'], cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0: fout.append('node check.js is rood:\n' + r.stdout + r.stderr)
    if fout:
        print('pre-commit geweigerd:\n  - ' + '\n  - '.join(fout), file=sys.stderr); sys.exit(1)
    print('pre-commit: geen slot, geen marker, geen achtergebleven sabotage in wat je commit, check.js groen')

if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: sys.exit(__doc__)
    if a[0] == '--herstel':
        print('teruggezet' if herstel('handmatig') else 'geen slot: niets te herstellen')
    elif a[0] == '--controle': controle()
    else:
        cfg = a[a.index('--config') + 1] if '--config' in a else None
        run(a[0], cfg)
