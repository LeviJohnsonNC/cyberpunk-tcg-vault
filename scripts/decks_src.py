import json,sys
cards={c['display']:c for c in json.load(open('src/data/cards.json'))}
prices=json.load(open('src/data/prices.json')); FX=prices['fx']['usdToCad']
owned={o['display']:o['qty'] for o in json.load(open('/home/claude/data/owned.json'))}
def cad(n): r=prices['ref'].get(cards[n]['slug']); return round(r['usd']*FX,2) if r else 0
DECKS=[
dict(id='lowball-netrun',name='Lowball Netrun',tier='owned',colors=['Blue'],archetype='Mono Blue tempo-control',
 legends=['Jackie Welles: Pour One Out For Me','Alt Cunningham: Soulkiller Architect','V: Corporate Exile'],
 cards={'Psycho Squad':3,'MT0D12 Flathead':2,'Delamain Cab':3,'Jacked-In Voodoo Boy':2,'Evelyn Parker: Scheming Siren':2,'Mox Inciters':2,
  'Hacked Corpo':2,'Delamain: Rideshare AI':1,'Rogue Amendiares: Queen of the Afterlife':1,'Placide: Voodoo Sentinel':1,'Maman Brigitte: Spirit of Death':1,
  'Floor It':3,'Trust No One':1,'Reboot Optics':3,'Three Mouths, One Desire':2,'Chrome Reverie':1,'Nocturne OP55 N1':2,'Pyramid Song':1,'Unlikely Bond':1,
  "Les Élémens":1,'Tetratronic Rippler':3,"Dying Night: V's Pistol":2}),
dict(id='heist-reloaded',name='Heist Reloaded',tier='owned',colors=['Blue','Yellow'],archetype='Blue/Yellow gear midrange',
 legends=['V: Corporate Exile','Jackie Welles: Pour One Out For Me','Viktor Vektor: Sit Down and Relax'],
 cards={'Psycho Squad':3,"Rockn' Rockerboy":2,'MaxTac Suppression Team':2,'Heywood Ripperdoc':2,'Offduty Malfini':2,'Viktor Vektor: You Might Feel a Little Pinch':2,
  'Dexter DeShawn: One Last Chance':2,'MT0D12 Flathead':2,'Jackie Welles: Ride or Die Choom':1,
  'Kiroshi Optics':3,'Zetatech Faceplate':3,'Mandibular Upgrade':2,'Tetratronic Rippler':2,"Dying Night: V's Pistol":2,
  'The Heist':1,"Afterparty at Lizzie's":2,'Floor It':3,'Reboot Optics':2,'Nocturne OP55 N1':2}),
dict(id='lowball-netrun-plus',name='Lowball Netrun+',tier='upgrade',base='lowball-netrun',colors=['Blue'],archetype='Mono Blue Braindance control',
 legends=['Jackie Welles: Pour One Out For Me','Alt Cunningham: Soulkiller Architect','Judy Álvarez: Braindance Maestro'],
 cards={'Psycho Squad':3,'MT0D12 Flathead':3,'Westbrook Netrunner':2,'Rita Wheeler: No Stupid Questions':1,'Evelyn Parker: Scheming Siren':2,'Mox Inciters':1,
  'Lizzy Wizzy: Delicate Weapon':1,'Rogue Amendiares: Queen of the Afterlife':2,'Judy Álvarez: Nothing to Doubt':1,'Placide: Voodoo Sentinel':2,
  'Floor It':3,'Trust No One':3,'Reboot Optics':2,'Three Mouths, One Desire':3,'Chrome Reverie':2,'Nocturne OP55 N1':2,'Pyramid Song':2,'Towerfall':2,
  'NetWatch Netdriver':1,"Dying Night: V's Pistol":0,'Tetratronic Rippler':2}),
dict(id='chrome-syndicate',name='Chrome Syndicate',tier='upgrade',base='heist-reloaded',colors=['Yellow','Blue'],archetype='Yellow/Blue gear midrange (Sasha\'s Promise style)',
 legends=['River Ward: Detective on the Hunt','Viktor Vektor: Sit Down and Relax','Alt Cunningham: Soulkiller Architect'],
 cards={'Psycho Squad':3,"Rockn' Rockerboy":2,'MaxTac Suppression Team':2,'Viktor Vektor: Drop Your Illusions':2,'Viktor Vektor: You Might Feel a Little Pinch':2,
  'Alt Cunningham: Mother of Daemons':2,'Offduty Malfini':2,'Sketchy Ripper':2,'Placide: Voodoo Sentinel':1,
  'Kiroshi Optics':2,'Zetatech Faceplate':3,'Gorilla Arms':2,'Adrenaline Converter':2,'The Relic: Experimental Biochip':1,'Mandibular Upgrade':1,'Tetratronic Rippler':2,
  'The Heist':3,'Cyberpsychosis':2,'Safety Override':1,'Floor It':3}),
dict(id='ripperdoc-rampage',name='Ripperdoc Rampage',tier='upgrade',colors=['Yellow'],archetype='Mono Yellow big-body aggro',
 legends=['Viktor Vektor: Sit Down and Relax','River Ward: Detective on the Hunt','Dum Dum: Maelstrom Triggerman'],
 cards={"Rockn' Rockerboy":3,'MaxTac Suppression Team':3,'Heywood Ripperdoc':2,'Jackie Welles: Ride or Die Choom':2,'Viktor Vektor: Drop Your Illusions':2,
  'Viktor Vektor: You Might Feel a Little Pinch':2,'Offduty Malfini':2,'Caliber: Totentanz\'s Top Dog':2,'Maelstrom Goons':1,'Adam Smasher: Metal Over Meat':1,
  'Kiroshi Optics':3,'Zetatech Faceplate':3,'Gorilla Arms':3,'Adrenaline Converter':2,'Mandibular Upgrade':2,
  'The Heist':3,'Cyberpsychosis':2,'Safety Override':2}),
]
ok=True
for d in DECKS:
    d['cards']={k:v for k,v in d['cards'].items() if v>0}
    lim={}
    for l in d['legends']:
        c=cards[l]; assert c['type']=='Legend',l; lim[c['color']]=lim.get(c['color'],0)+c['ram']
    n=sum(d['cards'].values()); errs=[]
    if not 40<=n<=50: errs.append(f'size {n}')
    for k,v in d['cards'].items():
        c=cards[k]
        if v>3: errs.append(f'>3 {k}')
        if c['ram']>lim.get(c['color'],0): errs.append(f'RAM {k} {c["color"]} r{c["ram"]} > {lim.get(c["color"],0)}')
    missing={k:v-owned.get(k,0) for k,v in list(d['cards'].items())+[(l,1) for l in d['legends']] if v>owned.get(k,0)}
    if d['tier']=='owned' and missing: errs.append(f'not owned {missing}')
    sell=sum(v for k,v in d['cards'].items() if cards[k]['sellable'])
    units=sum(v for k,v in d['cards'].items() if cards[k]['type']=='Unit')
    cost=sum(cad(k)*q for k,q in missing.items())
    curve={}
    for k,v in d['cards'].items():
        cc=cards[k]['cost'] or 0; curve[cc]=curve.get(cc,0)+v
    print(f"{d['name']}: n={n} units={units} sellable={sell} RAM={lim} buy=${cost:.2f} CAD curve={dict(sorted(curve.items()))} {'ERR '+str(errs) if errs else 'OK'}")
    if missing and d['tier']!='owned': print('   buy:',{k:(q,cad(k)) for k,q in missing.items()})
    ok &= not errs
json.dump([{**d,'legends':[cards[l]['slug'] for l in d['legends']],'cards':{cards[k]['slug']:v for k,v in d['cards'].items()}} for d in DECKS],open('/tmp/decks_raw.json','w'),indent=1)
sys.exit(0 if ok else 1)
