import json,sys
cards={c['display']:c for c in json.load(open('src/data/cards.json'))}
prices=json.load(open('src/data/prices.json')); FX=prices['fx']['usdToCad']
import pathlib
sample=json.load(open(pathlib.Path(__file__).parent.parent/'public/imports/levi-collection.json'))
slug2d={c['slug']:c['display'] for c in cards.values()}
owned={}
for e in sample['entries']: owned[slug2d[e['slug']]]=owned.get(slug2d[e['slug']],0)+e['qty']
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
dict(id='smasher-surge',name='Smasher Surge',tier='meta',colors=['Red','Yellow'],archetype='Red/Yellow big-body midrange',
 legends=['V: Streetkid','Adam Smasher: Ender of Legends','Dum Dum: Maelstrom Triggerman'],
 cards={'All is Lost':3,'Industrial Assembly':2,'Mantis Blades':3,'Satori: Sword of Saburo':3,'Appetite for Destruction':2,'Bonnie and Clyde':3,
  '6th Street Recruits':3,'Meredith Stout: Stone Cold Corpo':2,'Screw: Lovelorn Fool':2,'Animals Wrecker':2,'Carnage at the Colosseum':3,
  'Yorinobu Arasaka: Steel Dragon':3,'Kiroshi Optics':3,'Secondhand Bombus':3,'Zetatech Faceplate':2,'Augmented Negotiators':3,
  'Viktor Vektor: You Might Feel a Little Pinch':1,'Jackie Welles: Ride or Die Choom':2,'Trauma Team Operatives':1}),
dict(id='mosh-pit',name='Mosh Pit',tier='meta',colors=['Yellow','Red'],archetype='Yellow/Red Rockerboy aggro',
 legends=['Rogue Amendiares: Preem Solo','Kerry Eurodyne: Axe, Attitude, Audience','Johnny Silverhand: Rocking Renegade'],
 cards={'Mantis Blades':3,'All is Lost':3,'Industrial Assembly':2,'Satori: Sword of Saburo':3,'Kerry Eurodyne: The Last Rockerboy':3,
  'Meredith Stout: Stone Cold Corpo':2,'Johnny Silverhand: Never Stop Fighting':3,"Rockn' Rockerboy":3,'Mandibular Upgrade':3,
  "Afterparty at Lizzie's":2,'Sketchy Ripper':2,'Safety Override':2,'Dexter DeShawn: One Last Chance':2,'Gorilla Arms':3,
  'Bootleg Black Sapphire Show':2,'Jackie Welles: Ride or Die Choom':3,'Trauma Team Operatives':2}),
dict(id='arasaka-nines',name='Arasaka 9s',tier='meta',colors=['Red','Green'],archetype='Red/Green Arasaka power',
 legends=['Saburo Arasaka: Stubborn Patriarch','Adam Smasher: Ender of Legends','Yorinobu Arasaka: Embracing Destruction'],
 cards={'Minotaur':3,'Yorinobu Arasaka: Steel Dragon':3,'Arasaka Emergency Radioport':3,'Satori: Sword of Saburo':3,'Mantis Blades':3,
  'Industrial Assembly':3,'Field Operator':3,'Corpo Security':2,'Corporate Surveillance':3,'Valentino Street Racer':2,
  'Meredith Stout: Stone Cold Corpo':3,'Bonnie and Clyde':2,'Carnage at the Colosseum':2,"Sandayu Oda: Hanako's Guardian":2,'Emergency Atlus':3}),
dict(id='triple-fixers',name='Triple Fixers',tier='meta',colors=['Red','Yellow','Blue'],archetype='Three-colour Fixer midrange',
 legends=['Muamar Reyes: El Capitán','Wakako Okada: Peace and Harmony','Dexter DeShawn: Off the Grid'],
 cards={'Nocturne OP55 N1':3,'Over the Edge':3,'Floor It':3,'Reboot Optics':2,'Mantis Blades':3,'Satori: Sword of Saburo':2,
  'Industrial Assembly':2,"Afterparty at Lizzie's":2,'Psycho Squad':3,"Rockn' Rockerboy":3,'MaxTac Suppression Team':2,
  '6th Street Recruits':3,'Meredith Stout: Stone Cold Corpo':2,'Johnny Silverhand: Never Stop Fighting':2,'Screw: Lovelorn Fool':2,
  'Heywood Ripperdoc':2,'Kerry Eurodyne: The Last Rockerboy':1}),
dict(id='streetkid-braindance',name='Streetkid Braindance',tier='meta',colors=['Red','Green'],archetype='Red/Green removal midrange',
 legends=['V: Streetkid','Dexter DeShawn: Off the Grid','Padre: Man of the Cross'],
 cards={'Peace Offering':2,'Field Operator':3,'Valentino Street Racer':2,'Memory Relapse':3,'Pepe Najarro: Working Doubles':3,
  'Maelstrom Zealots':2,'Nadia: Fighting Through Grief':3,'Industrial Assembly':3,'Mantis Blades':3,'Detonate':2,'Satori: Sword of Saburo':3,
  'Bonnie and Clyde':3,'Over the Edge':3,'6th Street Recruits':3,'Chrome Fang':3,'Carnage at the Colosseum':3,'Yorinobu Arasaka: Steel Dragon':3}),
dict(id='nomad-convoy',name='Nomad Convoy',tier='meta',colors=['Green','Yellow'],archetype='Green/Yellow go-wide Nomads',
 legends=['River Ward: Detective on the Hunt','Padre: Man of the Cross','Panam Palmer: Nomad Cavalry'],
 cards={'Synapse Burnout':3,"Tyger's Whisper":3,'Riot Shield':3,'Valentino Street Racer':3,'Riding Nomad':3,'We Gotta Live Together':3,
  'Panam Palmer: Strength Through Family':3,'Zetatech Berserk':3,'Nadia: Fighting Through Grief':2,"(Don't Fear) The Reaper":2,
  'MaxTac Heavy':1,'Saul Bright: Stormrider':3,'Kiroshi Optics':2,'Mandibular Upgrade':3,'Sketchy Ripper':2,'Zetatech Faceplate':3,
  'Augmented Negotiators':3,'Cyberpsychosis':2}),
dict(id='ganger-surge',name='Ganger Surge',tier='meta',colors=['Blue','Red'],archetype='Blue/Red Ganger tempo',
 legends=['V: Corporate Exile','Royce: Psycho on the Edge','Evelyn Parker: Beautiful Enigma'],
 cards={'Floor It':3,'Reboot Optics':3,"Dying Night: V's Pistol":3,'Mox Inciters':3,'Chrome Reverie':3,'All is Lost':3,'Mantis Blades':3,
  'Satori: Sword of Saburo':3,'La Llorona: Ghost of the Past':3,'Over the Edge':3,'6th Street Recruits':3,
  'Meredith Stout: Stone Cold Corpo':3,"Royce: Don't Call Me Simon":2,'Screw: Lovelorn Fool':2}),
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
    if d['id'] in ('lowball-netrun','heist-reloaded') and missing: errs.append(f'sample collection no longer covers budget deck: {missing}')
    sell=sum(v for k,v in d['cards'].items() if cards[k]['sellable'])
    units=sum(v for k,v in d['cards'].items() if cards[k]['type']=='Unit')
    cost=sum(cad(k)*q for k,q in missing.items())
    curve={}
    for k,v in d['cards'].items():
        cc=cards[k]['cost'] or 0; curve[cc]=curve.get(cc,0)+v
    print(f"{d['name']}: n={n} units={units} sellable={sell} RAM={lim} buy=${cost:.2f} CAD curve={dict(sorted(curve.items()))} {'ERR '+str(errs) if errs else 'OK'}")
    if missing and d['tier']!='owned': print('   buy:',{k:(q,cad(k)) for k,q in missing.items()})
    ok &= not errs
notes=json.load(open(pathlib.Path(__file__).parent/'deck_notes.json'))
out=[]
for d in DECKS:
    n=notes[d['id']]
    rec={k:v for k,v in d.items() if k!='tier'}
    rec.update(legends=[cards[l]['slug'] for l in d['legends']],cards={cards[k]['slug']:v for k,v in d['cards'].items()},
      kind=n['kind'],source=n['source'],confidence=n['confidence'],summary=n['summary'],plan=n['plan'],mulligan=n['mulligan'],
      keyCards=[{'slug':s_,'why':w} for s_,w in n['keyCards']],weaknesses=n['weaknesses'])
    assert all(kc['slug'] in {c['slug'] for c in cards.values()} for kc in rec['keyCards']), d['id']
    out.append(rec)
if ok: json.dump(out,open(pathlib.Path(__file__).parent.parent/'src/data/decks.json','w'),ensure_ascii=False,indent=1)
sys.exit(0 if ok else 1)
