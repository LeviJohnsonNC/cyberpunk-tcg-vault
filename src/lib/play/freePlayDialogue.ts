import { campaignChapters } from './campaignStory';
import { freePlayRoster } from './freePlayRoster';
import type { RivalDialogueBank } from './rivalDialogue';

type Voice = { role: string; lines: RivalDialogueBank };
type TableLines = Pick<RivalDialogueBank, 'intro' | 'retry' | 'playerWon' | 'rivalWon' | 'draw'>;

// Familiar rivals keep their voices at the practice table. Their greetings and farewells belong to this match.
const returning = {
  'chrome-debt': {
    intro: ['Friendly table. I still keep receipts.'], retry: ['Let’s open a fresh ledger.'],
    playerWon: ['You turned a tidy profit. Fair enough.'], rivalWon: ['That settles the account.'], draw: ['Everything balances. How dull.'],
  },
  'dead-drop': {
    intro: ['I’ve got ten minutes between stops. Sit.'], retry: ['I can make one more stop.'],
    playerWon: ['Clean work. I’d run that route again.'], rivalWon: ['Made good time. Thanks for the table.'], draw: ['Same stop, same time. Call it even.'],
  },
  'night-drive': {
    intro: ['Let’s see how you handle the curves.'], retry: ['Turn it around. Same road.'],
    playerWon: ['You drove it clean. I’ll give you that.'], rivalWon: ['Good run. Next time, watch the bends.'], draw: ['Side by side at the line. I’ll take it.'],
  },
  'dead-air': {
    intro: ['Local session. Let’s see what you send.'], retry: ['New session. Same client.'],
    playerWon: ['You found the flaw. I’m keeping the trace.'], rivalWon: ['Session closed. Your timing needs work.'], draw: ['Both endpoints answered. Call it even.'],
  },
  'red-line': {
    intro: ['Drink off the cards. Then we play.'], retry: ['Sit. We can do it again.'],
    playerWon: ['You earned that. Leave the chair where it is.'], rivalWon: ['That’s the game. Finish your drink.'], draw: ['Still standing, both of us.'],
  },
  'mosh-pit': {
    intro: ['Short set tonight. Make it loud.'], retry: ['Encore. Same stage, new set.'],
    playerWon: ['Take a bow. You earned the room.'], rivalWon: ['That’s the set. Tip the crew.'], draw: ['Fine, we’ll split the billing.'],
  },
} satisfies Record<string, TableLines>;

const standalone: Readonly<Partial<Record<string, Voice>>> = {
  patchbay: { role: 'Signal tech', lines: {
    intro: ['I patched this table into my rig.', 'Say something. I’m checking levels.'], retry: ['Same cable. Fresh signal.'],
    playerGig: ['You found an open jack.', 'Okay, I heard that.'], rivalGig: ['Good signal on that channel.', 'I’ll leave that line open.'],
    playerLead: ['You’re coming through too loud.'], rivalLead: ['Your channel’s getting quiet.'],
    playerUnitLost: ['That jack’s dead now.'], rivalUnitLost: ['Lost a channel. Patch around it.'],
    highRoll: ['Full signal. No noise.'], lowRoll: ['Bad cable. I can work with it.'],
    playerWon: ['Clean signal. Yours was louder.'], rivalWon: ['That’s the whole transmission.'], draw: ['Crossed signals again. Call it even.'],
  } },
  kiln: { role: 'Ripperdoc', lines: {
    intro: ['Hold still. I’m checking your tolerances.', 'I do repairs. This is the fun part.'], retry: ['Back for an adjustment?'],
    playerGig: ['That joint wasn’t meant to flex.', 'That’s going to need a shim.'], rivalGig: ['Solid fit. No play at all.', 'That one’s seated properly.'],
    playerLead: ['You found the weak weld.'], rivalLead: ['Hear that? That’s metal under stress.'],
    playerUnitLost: ['That one needs a new frame.'], rivalUnitLost: ['Put them on my bench.'],
    highRoll: ['Now that’s within spec.'], lowRoll: ['Hairline crack. Keep working.'],
    playerWon: ['You broke the test rig. Good work.'], rivalWon: ['Stress test complete. I’ll bill you later.'], draw: ['Nothing broke all the way through.'],
  } },
  glasshouse: { role: 'Corporate strategist', lines: {
    intro: ['I booked the table under a different name.', 'Keep the glass clear. I like to see the board.'], retry: ['I left room on the calendar.'],
    playerGig: ['I’ll move that to your column.', 'I suppose I’ll have to initial that.'], rivalGig: ['A clean transfer.', 'The figures are improving.'],
    playerLead: ['I may have underestimated the risk.'], rivalLead: ['You’re paying a premium for every choice.'],
    playerUnitLost: ['Their position has been eliminated.'], rivalUnitLost: ['An expensive change of plan.'],
    highRoll: ['A better return than forecast.'], lowRoll: ['We budgeted for that.'],
    playerWon: ['I’ll sign off on the result myself.'], rivalWon: ['I believe that concludes our meeting.'], draw: ['Same terms. Nobody signs.'],
  } },
  switchline: { role: 'Fixer', lines: {
    intro: ['Three numbers. Someone always picks up.', 'Have a seat. I know who to call.'], retry: ['I kept your number.'],
    playerGig: ['You called the right person.', 'Somebody picked up for you.'], rivalGig: ['Another favour paid back.', 'I knew they’d come through.'],
    playerLead: ['You’ve got friends I didn’t count.'], rivalLead: ['Notice who still answers my calls.'],
    playerUnitLost: ['That number’s out of service.'], rivalUnitLost: ['One contact down. I’ve got others.'],
    highRoll: ['First ring. That’s service.'], lowRoll: ['Straight to voicemail.'],
    playerWon: ['Keep my number. We could do business.'], rivalWon: ['The favour’s settled. I won’t call it in.'], draw: ['Neither of us owes the other a call.'],
  } },
  crossfade: { role: 'Braindance editor', lines: {
    intro: ['Give me something worth keeping in the cut.', 'Let it run. I’ll trim the quiet parts later.'], retry: ['Back to one. Keep the good takes.'],
    playerGig: ['That shot stays in.', 'Get a close-up of that.'], rivalGig: ['There. That’s the cut I wanted.', 'Leave a little room before the next shot.'],
    playerLead: ['You changed the whole edit.'], rivalLead: ['I can see how this ends from here.'],
    playerUnitLost: ['They didn’t make the final cut.'], rivalUnitLost: ['I’ll miss that take.'],
    highRoll: ['Print it. We got the shot.'], lowRoll: ['Cut. That one goes in the bin.'],
    playerWon: ['Fine. Your name goes first in the credits.'], rivalWon: ['Fade out. Keep the last frame.'], draw: ['Neither ending works. Leave it open.'],
  } },
  'saint-static': { role: 'Street preacher', lines: {
    intro: ['Sit close. The speakers are half blown.', 'You’ll hear the sermon when the cards hit.'], retry: ['Same pew. Different sermon.'],
    playerGig: ['I heard that above the hum.', 'I’ll let you finish that verse.'], rivalGig: ['Put that one in the collection plate.', 'Someone in the room said amen.'],
    playerLead: ['You’ve got the room listening now.'], rivalLead: ['Even the back row heard that.'],
    playerUnitLost: ['Somebody save them a seat.'], rivalUnitLost: ['Leave a light on for that one.'],
    highRoll: ['Finally, a clear answer.'], lowRoll: ['Even saints get static.'],
    playerWon: ['That’ll preach. Go on, take the table.'], rivalWon: ['Service is over. Watch your step.'], draw: ['Two sermons. Nobody converted.'],
  } },
  aftercare: { role: 'Night-shift medic', lines: {
    intro: ['How long since you’ve had a meal?', 'I’ve got half an hour before my next call.'], retry: ['You’re back. Sit before you fall.'],
    playerGig: ['That stings. I’ll be fine.', 'I felt that one. Give me a second.'], rivalGig: ['Good. I can work with that.', 'Okay. The colour’s coming back.'],
    playerLead: ['I’m going to need a second opinion.'], rivalLead: ['I’ve got you. Breathe.'],
    playerUnitLost: ['Someone check on them.'], rivalUnitLost: ['I’ll see to them after this.'],
    highRoll: ['Good pulse. Keep it there.'], lowRoll: ['Pressure’s dropping. Don’t panic.'],
    playerWon: ['You’re clear to go. Eat something.'], rivalWon: ['Done. Take a minute before you stand.'], draw: ['Both stable. We can stop here.'],
  } },
  coil: { role: 'Chrome mechanic', lines: {
    intro: ['New harness. Let’s see if it holds.', 'Can you smell the insulation? It’ll pass.'], retry: ['I tightened the connections.'],
    playerGig: ['You got around the fuse.', 'I’ll have to rewire that.'], rivalGig: ['That circuit’s live now.', 'That’s one less dead terminal.'],
    playerLead: ['You’re drawing more current than I planned.'], rivalLead: ['Everything’s running at load.'],
    playerUnitLost: ['That lead burned clean through.'], rivalUnitLost: ['Pull it before it takes the rest.'],
    highRoll: ['Clean surge. Nothing tripped.'], lowRoll: ['A short. Give me a second.'],
    playerWon: ['You found the fault. I’ll rebuild it.'], rivalWon: ['Good load test. Power down.'], draw: ['Both still live. Pull the plug.'],
  } },
  torque: { role: 'Garage chief', lines: {
    intro: ['Lean on it. I want to hear it rattle.', 'This rig’s got plenty of pull. Sit.'], retry: ['Back it up. Give it another run.'],
    playerGig: ['You got traction there.', 'You found a strip of dry road.'], rivalGig: ['It bites right where I want it.', 'I can feel it pulling now.'],
    playerLead: ['You’ve got more pull than I figured.'], rivalLead: ['Hard to catch us in this gear.'],
    playerUnitLost: ['That axle won’t take another load.'], rivalUnitLost: ['Put that one on the lift.'],
    highRoll: ['There’s the grip.'], lowRoll: ['Wheelspin. Ease off.'],
    playerWon: ['Good run. You can park inside.'], rivalWon: ['Good pull. Kill the engine.'], draw: ['Same distance. Check the tape.'],
  } },
  heirloom: { role: 'Family retainer', lines: {
    intro: ['These cards belonged to someone patient.', 'Set the deck down carefully. It’s older than you.'], retry: ['My family believes in second lessons.'],
    playerGig: ['A small loss. Still worth remembering.', 'You saw what I overlooked.'], rivalGig: ['That one comes back to the family.', 'I was taught to wait for that opening.'],
    playerLead: ['I was taught to expect less from strangers.'], rivalLead: ['This takes the time it takes.'],
    playerUnitLost: ['I’ll remember how they stood.'], rivalUnitLost: ['Their place will stay empty.'],
    highRoll: ['A little luck from the old house.'], lowRoll: ['Some debts outlast good fortune.'],
    playerWon: ['You played well. I’ll say so at home.'], rivalWon: ['My teacher would have liked that game.'], draw: ['We can both leave with our names intact.'],
  } },
  votive: { role: 'Chapel fixer', lines: {
    intro: ['Light a candle if it helps you think.', 'I saved you the chair clear of the draft.'], retry: ['There’s another candle in the drawer.'],
    playerGig: ['I saw where you put that offering.', 'Someone was listening to you.'], rivalGig: ['A small mercy. I’ll take it.', 'One more reason to keep the candles lit.'],
    playerLead: ['I hear you. The room hears you, too.'], rivalLead: ['There’s time left to change your mind.'],
    playerUnitLost: ['Leave their candle lit.'], rivalUnitLost: ['Say their name once. Then play.'],
    highRoll: ['Something answered.'], lowRoll: ['Silence is an answer, too.'],
    playerWon: ['Go well. You earned the quiet.'], rivalWon: ['Stay a minute. The street can wait.'], draw: ['Two candles. Neither goes out.'],
  } },
};

const tableVoice: RivalDialogueBank = {
  intro: ['Shuffle up. Your table or mine?', 'Cards out. Let’s see what you brought.'], retry: ['Run it back.'],
  playerGig: ['Nice pickup.'], rivalGig: ['I’ll take that one.'],
  playerLead: ['You’ve got the edge for now.'], rivalLead: ['You’ve still got time to catch me.'],
  playerUnitLost: ['That opens the board.'], rivalUnitLost: ['I needed that one.'],
  highRoll: ['That’s the number I needed.'], lowRoll: ['I’ll work with it.'],
  playerWon: ['Good game. You earned it.'], rivalWon: ['Good game. Same table next time?'], draw: ['Even table. We can leave it there.'],
};

export function freePlayRivalProfile(key: string | undefined, deckName: string) {
  const rival = freePlayRoster.find(entry => entry.key === key);
  const portrait = rival?.portrait;
  const name = portrait?.alias ?? deckName;
  if (portrait && 'encounter' in portrait) {
    const chapter = campaignChapters[portrait.encounter];
    return { name, portrait, summary: rival?.summary, role: chapter.role,
      lines: { ...chapter.lines, ...returning[portrait.encounter] } };
  }
  const voice = portrait && standalone[portrait.art];
  const role = key === 'mirror' ? 'Mirror match' : key === 'import' ? 'Imported rival' : key?.startsWith('saved:') ? 'Saved rival' : 'Rival deck';
  return { name, portrait, summary: rival?.summary, role: voice?.role ?? role, lines: voice?.lines ?? tableVoice };
}
