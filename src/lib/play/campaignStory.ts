import { ENCOUNTERS, type CampaignRun, type EncounterId } from './campaign';

export type RivalMoment =
  | 'intro' | 'retry' | 'playerGig' | 'rivalGig' | 'playerLead' | 'rivalLead'
  | 'playerUnitLost' | 'rivalUnitLost' | 'highRoll' | 'lowRoll' | 'playerWon' | 'rivalWon' | 'draw';

interface StoryBeat {
  title: string;
  text: string;
}

interface CampaignChapter {
  rival: string;
  role: string;
  briefing: string;
  victory: StoryBeat;
  lines: Record<RivalMoment, readonly string[]>;
}

export const campaignInvitation = {
  title: 'Last Call',
  text: 'The Afterlife’s house fixer is missing. Your first contract arrives on a dead phone, with your crew’s name already filled in. The payout is a pack of cards and an invitation upstairs. The invitation was printed three days before you agreed to play.',
};

export const campaignActStory = {
  1: 'The courier’s drop gives you a time, a rooftop relay, and a warning in the missing fixer’s voice: “If someone calls from my number, let it ring.” The phone starts vibrating as you step outside.',
  2: 'The house offered enough to retire on. You brought the key upstairs anyway. By the time the lift opens, the crowd is taking bets on whether you’ll make it to the last table.',
} as const;

export const campaignChapters = {
  'first-call': {
    rival: 'Moth',
    role: 'Rookie crew lead',
    briefing: 'Moth is wearing a jacket with the tags still on. They’ve rehearsed a line for when you sit down. You can tell because they say it twice.',
    victory: { title: 'Signed in advance', text: 'Moth slides you the pack and checks the signature on the receipt. “That’s her hand,” they say. The house fixer disappeared twenty-three days ago. This ink is still wet.' },
    lines: {
      intro: ['I know the house rules. Both pages.', 'They let me pick the chair. That means something.'],
      retry: ['You came back. Cool. I mean, obviously.', 'I moved my chair. Same rules, different luck.'],
      playerGig: ['Okay. You do that faster than I do.', 'I saw that coming. Just… late.'],
      rivalGig: ['That’s how you do it. I think.', 'Did anyone see that? Please say yes.'],
      playerLead: ['Don’t check the score. I just checked it.', 'I have a plan for this. Give me a second.'],
      rivalLead: ['Could you check the score? Out loud?', 'I’m going to act like this happens all the time.'],
      playerUnitLost: ['Sorry. I practiced that one.', 'It looked a lot messier when I did it at home.'],
      rivalUnitLost: ['I told them this would be easy.', 'Okay. Next time I bring a spare.'],
      highRoll: ['Oh. Oh, that’s the good number.', 'Pretend I called it.'],
      lowRoll: ['Can we roll it a little harder next time?', 'If I laugh, it looks deliberate, right?'],
      playerWon: ['Take the pack. Check the signature.', 'They gave me two envelopes. That one’s yours.'],
      rivalWon: ['I had a speech. I forgot all of it.', 'Okay. Now I can stop holding my breath.'],
      draw: ['Do we both get to say we almost won?'],
    },
  },
  'chrome-debt': {
    rival: 'Ledger',
    role: 'Chrome broker',
    briefing: 'Ledger knows the price of the jacket on your back. She quotes the resale value without looking up from her book.',
    victory: { title: 'Already on the books', text: 'Ledger tears out a page and tucks it under your pack. Someone has been buying up the house’s debts. Your crew has its own line, dated the day before you sat down with Moth.' },
    lines: {
      intro: ['Please sit. The clock has been running.', 'I’ve pencilled you in as an asset. For now.'],
      retry: ['Shall I reopen the account?', 'Your previous balance carries forward in my memory.'],
      playerGig: ['I’ve entered it as a loss. Don’t make me open a second column.', 'A withdrawal. I’ll need to see some identification.'],
      rivalGig: ['Received and recorded.', 'At last, a payment I didn’t have to chase.'],
      playerLead: ['Temporary exposure. Nothing I can’t price.', 'I dislike surprises that require fresh ink.'],
      rivalLead: ['Your account has slipped into arrears.', 'The interest is beginning to do the work.'],
      playerUnitLost: ['I’ll send their crew the itemized bill.', 'Liquidated. The paperwork is mercifully brief.'],
      rivalUnitLost: ['A write-off. Put it with the others.', 'I was told that asset would appreciate.'],
      highRoll: ['A rare return without a hidden fee.', 'I’d like to annualize that.'],
      lowRoll: ['Our risk model allows for indignities.', 'A rounding error with good posture.'],
      playerWon: ['Take the page. Your name is already on it.', 'I can balance my books without this table. Can you?'],
      rivalWon: ['Paid in full. You may go.', 'You can take the receipt. I keep the original.'],
      draw: ['A balanced sheet. An evening wasted.'],
    },
  },
  'dead-drop': {
    rival: 'Latch',
    role: 'Night courier',
    briefing: 'Latch sits with one glove on and an eye on the side door. There’s a packet under the table. The courier has been paid to leave it there if you win.',
    victory: { title: 'Delivery instructions', text: 'Latch knocks twice on the underside of the table before leaving. The packet contains a relay address and a recording from the fixer: “Get to Rainline. If anyone calls from my number, let it ring.”' },
    lines: {
      intro: ['Keep your coat on. This is a five-minute stop.', 'I’m already late. You’re the reason I’m waiting.'],
      retry: ['I rerouted. You get one more pickup.', 'Back again? The packet hasn’t moved.'],
      playerGig: ['You’re making me miss my window.', 'Fine. Put it in your bag.'],
      rivalGig: ['Collected. Next stop.', 'If everything went that quickly, I’d sleep indoors.'],
      playerLead: ['I’m going to need another route.', 'You’ve cut off the fast way out.'],
      rivalLead: ['I might make the second delivery after all.', 'We’re ahead of schedule. Don’t talk.'],
      playerUnitLost: ['They should’ve taken the side door.', 'Package returned. Recipient unavailable.'],
      rivalUnitLost: ['I told them to stay in the car.', 'Leave the bag. I can replace the bag.'],
      highRoll: ['Green lights all the way.', 'That gets me there before the shutter comes down.'],
      lowRoll: ['Red light. Of course.', 'The one route I didn’t check.'],
      playerWon: ['Two knocks. Then reach under the table.', 'The packet’s yours. Don’t open it in the lift.'],
      rivalWon: ['No handoff. I never saw you.', 'I made my window. Get out of the doorway.'],
      draw: ['No signature? Then the package stays put.'],
    },
  },
  'night-drive': {
    rival: 'Switchback',
    role: 'Nomad road captain',
    briefing: 'Switchback drove the relay up from the Badlands herself. She agrees to give you access if you can earn it over a hand.',
    victory: { title: 'A signal in the rain', text: 'Switchback points out the relay from the roof. Someone has been keeping the old uplink alive on a car battery. Your dead phone lights up with an incoming call. You watch it ring.' },
    lines: {
      intro: ['Road was clear coming in. That usually means trouble.', 'Sit where you can see the exit. I always do.'],
      retry: ['Long way round, but you made it.', 'Changed a tire, did you? Let’s see it hold.'],
      playerGig: ['Clean pass. I’ll give you that.', 'You found the gap before I closed it.'],
      rivalGig: ['Take the straight road when they leave it open.', 'One more mile behind us.'],
      playerLead: ['I can still see your tail lights.', 'We’ve pulled worse wrecks out of deeper ditches.'],
      rivalLead: ['Don’t chase me into that bend.', 'Plenty of road left. Keep your hands steady.'],
      playerUnitLost: ['Should’ve kept that one in the convoy.', 'That’s what happens when you drive alone.'],
      rivalUnitLost: ['Mark the spot. We come back for our own.', 'I don’t leave people twice.'],
      highRoll: ['Dry asphalt. About time.', 'She still has another gear.'],
      lowRoll: ['Washout. We go around.', 'That’s why you carry a jack.'],
      playerWon: ['Relay’s yours. Mind the live wire by the ladder.', 'You drove it clean. I’ll show you the roof.'],
      rivalWon: ['You weren’t ready for that road.', 'No shame in turning back before it gets dark.'],
      draw: ['Same place, same time. Rare thing, that.'],
    },
  },
  'dead-air': {
    rival: 'Hush',
    role: 'Netrunner',
    briefing: 'Hush has the relay open on a scratched deck. The fixer’s credentials authenticated sixteen seconds ago. The same credentials opened the door to this table.',
    victory: { title: 'The account is still online', text: 'Hush turns their screen toward you. Each invitation in the ledger carries the missing fixer’s signature and an approval from a house account. Only one operator has touched both. They leave the session open.' },
    lines: {
      intro: ['You’re loud on channels you can’t hear.', 'Your credentials work. That’s the interesting part.'],
      retry: ['Handshake accepted. Same client.', 'Good. I wanted another sample.'],
      playerGig: ['Unanticipated access. Recalculating.', 'You’re in a directory I thought I’d sealed.'],
      rivalGig: ['Request granted.', 'Still using the default permissions.'],
      playerLead: ['Privilege escalation. Nicely done.', 'I’m going to stop assuming this is noise.'],
      rivalLead: ['Your session is running out of permissions.', 'The system has a preferred outcome.'],
      playerUnitLost: ['Endpoint disconnected.', 'They were transmitting after they should have stopped.'],
      rivalUnitLost: ['Node gone. Routing around it.', 'I trusted that connection. Interesting.'],
      highRoll: ['Clean signal. Full bandwidth.', 'That should have been harder.'],
      lowRoll: ['Packet loss. Still connected.', 'Ignore that. The reading was valid.'],
      playerWon: ['I left the session open. Look for the operator.', 'You can have the log. Keep my handle out of it.'],
      rivalWon: ['Session closed. I kept a copy.', 'You can knock again. Use a different port.'],
      draw: ['No clean exit. I’ll leave the port open.'],
    },
  },
  'red-line': {
    rival: 'Brake',
    role: 'House enforcer',
    briefing: 'Brake puts a brass access key on the table. You expected a threat. He just asks you to keep your drink off the cards.',
    victory: { title: 'An offer on the way upstairs', text: 'Brake pushes the key across. An offer appears on your phone before you pick it up: return the key and the house will pay more than all six contracts combined. Brake watches you put it in your pocket.' },
    lines: {
      intro: ['Drink off the cards.', 'Key stays on the table till one of us earns it.'],
      retry: ['Sit. We can do it again.', 'I kept the chair where it was.'],
      playerGig: ['You can have that one.', 'I felt that. Keep going.'],
      rivalGig: ['Mine.', 'You left it where I could reach.'],
      playerLead: ['I’ve carried heavier things.', 'Good. Now we know what this costs.'],
      rivalLead: ['Still time to make me work for it.', 'Keep your eyes here. The score won’t move for you.'],
      playerUnitLost: ['Told you to move them.', 'They stood their ground. I respect that.'],
      rivalUnitLost: ['I’ll take the next hit myself.', 'Leave them. I know what I lost.'],
      highRoll: ['That’ll hold.', 'I needed one good throw.'],
      lowRoll: ['I’ve worked with less.', 'Still my hand.'],
      playerWon: ['Take the key. The offer will come fast.', 'I said I’d give it to you if you won. Here.'],
      rivalWon: ['Key stays with me.', 'You can stay until you finish the drink.'],
      draw: ['Leave the key here. We’ll settle it later.'],
    },
  },
  'mosh-pit': {
    rival: 'Feedback',
    role: 'Afterlife headliner',
    briefing: 'Feedback drags a chair into the light. There’s a crowd around the table now, and somebody has turned the speakers down.',
    victory: { title: 'The room is listening', text: 'Feedback holds up your hand so the back row can see it. Someone in the crowd recognizes the key. When the house tries to clear the room, nobody moves.' },
    lines: {
      intro: ['Everybody in the back, you see the cards?', 'I saved the good mic for the complaints.'],
      retry: ['Encore! This one goes out to the stubborn.', 'The crowd wanted a second set. So did I.'],
      playerGig: ['Give them a hand. That was a real move.', 'All right, you get a solo. One.'],
      rivalGig: ['That one’s for the cheap seats.', 'Hear that? Even the table’s on my side.'],
      playerLead: ['The room’s getting quiet. I hate quiet rooms.', 'You’ve got their attention. Do something with it.'],
      rivalLead: ['I know who they came to see.', 'We can skip straight to the chorus if you like.'],
      playerUnitLost: ['That’s what the pit does to a standing target.', 'Take a bow. Someone fetch them a chair.'],
      rivalUnitLost: ['We can finish the set without a drummer.', 'They were the only one who could count in.'],
      highRoll: ['Turn that up. I want the bar to hear it.', 'Perfect take. Keep rolling.'],
      lowRoll: ['That was soundcheck. You’re getting the actual show now.', 'Who put that die through the cheap amp?'],
      playerWon: ['Take a bow. Make the house watch.', 'I’m leaving the mic on. Tell them who you are.'],
      rivalWon: ['I’ll be here all night. Sorry about that.', 'One more for the house. Tip the crew.'],
      draw: ['Neither of us leaves till they stop clapping.'],
    },
  },
  'hostile-takeover': {
    rival: 'Splice',
    role: 'Braindance editor',
    briefing: 'Splice has a rough cut of your run playing on a loop. The footage of this match already has an ending.',
    victory: { title: 'The footage they cut', text: 'Splice drops the edit and plays the raw feed. Every crew that lost its seat signed its debt to the same buyer. The final clip catches Director Sato at the door, waiting for his turn.' },
    lines: {
      intro: ['I gave you a good entrance in the rough cut.', 'Hold that look. It makes the ending work.'],
      retry: ['Pickups. We’re changing the lighting, too.', 'Back to your mark. This time look at me.'],
      playerGig: ['Leave that in. It makes the cut less obvious.', 'You weren’t supposed to be framed that well.'],
      rivalGig: ['Clean take. Print it.', 'That shot pays for the whole sequence.'],
      playerLead: ['I may need a different ending.', 'Your timing is ruining a very elegant cut.'],
      rivalLead: ['The audience knows before the character does.', 'I can fade out here and nobody will complain.'],
      playerUnitLost: ['Cut there. Before they look up.', 'Keep the audio. Lose the picture.'],
      rivalUnitLost: ['They were my best close-up.', 'There goes the expensive footage.'],
      highRoll: ['That’s the trailer shot.', 'No notes. Run it at full speed.'],
      lowRoll: ['We’ll fix that in the edit.', 'I need a reaction shot to cover that.'],
      playerWon: ['The raw feed’s yours. Watch past the last cut.', 'I had a better ending. Yours happens to be true.'],
      rivalWon: ['You’ll like the version where you walk out earlier.', 'There. Now it ends where I said it would.'],
      draw: ['I hate an ending that won’t pick a side.'],
    },
  },
  'last-call': {
    rival: 'Director Sato',
    role: 'Arasaka house director',
    briefing: 'Sato thanks you for coming and takes the seat facing the door. The ledger is already on the table. He hasn’t offered to let you touch it.',
    victory: { title: 'The house is yours', text: 'The first thing you do with the ledger is strike out the debts the house used to keep crews in their seats. The second is send the fixer’s own invitation back to her number. At dawn a reply comes through: “Leave a chair empty.”' },
    lines: {
      intro: ['You have made this evening rather expensive.', 'Please sit. I’ve cleared my next appointment.'],
      retry: ['I allowed for a second meeting.', 'Your persistence has been noted in the minutes.'],
      playerGig: ['I’ll call that a concession. Briefly.', 'You negotiate better with your hands.'],
      rivalGig: ['We can dispense with the formalities now.', 'Exactly as outlined in the agreement.'],
      playerLead: ['We should discuss what you think you’re buying.', 'I would advise against celebrating in the minutes.'],
      rivalLead: ['There is still time to accept our earlier offer.', 'We have reached the part of the evening I budgeted for.'],
      playerUnitLost: ['I expect they were valuable to you.', 'You will be responsible for the notice.'],
      rivalUnitLost: ['Their replacement has already been briefed.', 'I will have to inform the board.'],
      highRoll: ['Our position has improved considerably.', 'I appreciate a straightforward number.'],
      lowRoll: ['The projection was a little optimistic.', 'Let’s leave that out of the minutes.'],
      playerWon: ['Your name will be on the door by morning. I suggest you read what comes with it.', 'You may take the ledger. Leave me my pen.'],
      rivalWon: ['We can send someone to collect the key.', 'Thank you for making the trip upstairs.'],
      draw: ['Our lawyers will be delighted. We can stay here all night.'],
    },
  },
} satisfies Record<EncounterId, CampaignChapter>;

export function unlockedCampaignChapters(run: CampaignRun) {
  const finished = run.phase === 'claimingFinish' || run.phase === 'completed';
  const count = finished ? ENCOUNTERS.length : run.encounter + Number(run.phase === 'rewardPending');
  return ENCOUNTERS.slice(0, count);
}
