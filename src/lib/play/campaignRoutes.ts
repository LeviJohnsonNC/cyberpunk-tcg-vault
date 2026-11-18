import type { CampaignRun, EncounterId } from './campaign';

export type CallChoice = 'answer' | 'moth' | 'silence';
export type EvidenceChoice = 'broadcast' | 'seal';
export type StoryChoice = CallChoice | EvidenceChoice;
export type StoryArt = 'handset' | 'backroom' | 'tape' | 'chair' | 'key' | 'film';
export interface CampaignRoute { call: CallChoice; evidence?: EvidenceChoice }

interface RouteOption {
  label: string;
  stakes: string;
  record: string;
  title: string;
  rival: EncounterId;
  briefing: string;
  win: string;
  loss: string;
  art: StoryArt;
}

export const callRoutes = {
  answer: {
    label: 'Answer it yourself', stakes: 'Play Ledger for the original tape. Her reward counter favors Gear.',
    record: 'You said your name. On the other end you heard your own voice say it back, half a beat late. Ledger took the tape off the machine.',
    title: 'Voice on File', rival: 'chrome-debt', art: 'tape',
    briefing: 'Ledger plays your “hello” twice. On the second pass you hear the clink of Sato’s ice. She puts the master reel beside her Gear. “Win and you get the original. I keep the copy.”',
    win: 'Ledger lets the reel spin to the end. A second voice reads out a debt against a crew that hasn’t even arrived. She writes Brake’s table number on the sleeve. “Take this upstairs. And pick something from the counter.”',
    loss: 'Ledger winds the tape back onto its spool. “The house pack is yours. The voice is still mine.” She leaves the recorder plugged in for the rematch.',
  },
  moth: {
    label: 'Hand it to Moth', stakes: 'Moth spends their favor on a backroom match with Latch and a chance to recruit a Legend.',
    record: 'Moth answered with two knocks against the mouthpiece. Two knocks came back. They unpicked a green chip sewn into their jacket lining and gave it to you.',
    title: 'One Favor Left', rival: 'dead-drop', art: 'backroom',
    briefing: 'Latch fits the notch in Moth’s chip against the door latch. Behind the curtain, a spare chair faces the table. “Their favor buys you the introduction. Show our crew why they should take the seat.”',
    win: 'Latch pulls back the curtain. The crew have stayed to watch your last hand. Beside your pack is a slip with Brake’s name on it. Moth counts the empty holes where their ticket used to be. “Yeah,” they say. “Worth it.”',
    loss: 'Latch pins the chip to the felt. “One favor buys the table for the night. Sit back down when you’re ready.” Moth pushes the house pack over with both hands.',
  },
  silence: {
    label: 'Let it ring', stakes: 'Keep your voice off the line. Follow the relay to Hush’s Netrunner table.',
    record: 'You waited through seven rings. In the quiet after the last one, a receipt printer started up on the floor above you.',
    title: 'Dead Air', rival: 'dead-air', art: 'handset',
    briefing: 'Hush has pinned the seven ring times to a strip of receipt paper. Six came from the relay. The seventh came from the house. “Play me for the return address.”',
    win: 'Hush circles the last ring. The call came from the same upstairs account that approved the debts. They write Brake’s table number beneath it. “You were the only one they couldn’t put a voice to.”',
    loss: 'Hush folds the receipt strip back into their pocket. The return address will cost you another match. The house pack lands on your side of the table.',
  },
} as const satisfies Record<CallChoice, RouteOption>;

export const evidenceRoutes = {
  broadcast: {
    label: 'Put the crews on air', stakes: 'Play Hush for the house frequency. Every crew will hear the debts read out.',
    record: 'You pressed the lift key into the warm wax on Feedback’s mic stand. By the time the lift reached the top floor, half the bar had a copy.',
    title: 'Open Frequency', rival: 'dead-air', art: 'key',
    briefing: 'Hush has one ear pressed to a tiny speaker. Through it you can hear the crews downstairs setting out their chairs. “I get one shot at carrying an open mic past the house. Play me for it.”',
    win: 'Hush opens the channel. Somewhere below you, a woman reads out the number beside her name. Then a second voice. Then a third. Sato sends his attendant down to disconnect the mic. The attendant stays to hear her own number.',
    loss: 'Hush pulls the plug before the house hears the carrier. “Still got the frequency. We can try again.” The crowd downstairs drums on the tables while you unseal the pack.',
  },
  seal: {
    label: 'Keep the witnesses off record', stakes: 'Play Splice for the uncut footage. Take the evidence to Sato in private.',
    record: 'You hid the names inside the lift’s brass inspection plate. Splice signed the seam in grease pencil. Nobody upstairs would get a witness list from you.',
    title: 'Closed Screening', rival: 'hostile-takeover', art: 'film',
    briefing: 'Splice has threaded the only uncut reel. The signed plate stays in your pocket. “Beat me and we watch it once. Then I give you the scissors.”',
    win: 'On the film, Sato signs for debts before the crews arrive. Splice cuts off the frames that show their faces, drops them in an ashtray and hands you the rest. “That’s enough to prove it. Take the lift.”',
    loss: 'The projector clicks to a stop before a face comes into view. “Next screening’s yours too.” Splice covers the lens and slides you the house pack.',
  },
} as const satisfies Record<EvidenceChoice, RouteOption>;

export function pendingStoryDecision(run: CampaignRun) {
  if (run.phase !== 'upgrading' || run.resultPending || run.attempts || (run.briefedAct ?? 0) >= Math.floor(run.encounter / 3)) return;
  if (run.encounter === 3 && !run.route) return 'call';
  if (run.encounter === 6 && run.route && !run.route.evidence) return 'evidence';
}

export function routeContract(run: CampaignRun, index = run.encounter) {
  if (index === 4 && run.route) return callRoutes[run.route.call];
  if (index === 7 && run.route?.evidence) return evidenceRoutes[run.route.evidence];
}

export function finalInvitation(route: CampaignRoute) {
  return {
    answer: 'Ledger leaves her copy of your voice on Sato’s blotter. “He ought to recognize his next appointment.”',
    moth: 'Moth holds the door for you. The jacket still has its tags. This time they walk in with you.',
    silence: 'Hush leaves a seventh chair against the wall. “He kept waiting for you to call back.”',
  }[route.call];
}

export function routeEnding(route: CampaignRoute) {
  const ending = route.evidence === 'broadcast'
    ? 'By dawn the lift attendant has brought her mum up to see the ledger. They find the right line together. The attendant takes a rubbing of the crossed-out number and folds it into her purse.'
    : 'Under every door downstairs, the bartender slides a cancellation in a plain envelope. Nobody has to come upstairs and give their name.';
  const chair = {
    answer: 'Ledger sets the erased reel on the fixer’s empty chair. This time she hands you both copies.',
    moth: 'Moth slips the green chip back through the slit in the door. A moment later it comes rolling back across the felt. This time, the fixer has paid for their seat.',
    silence: 'The phone rings in the fixer’s empty chair. Seven times. Then a real voice at the door asks if the seat is taken.',
  }[route.call];
  return { title: 'The empty chair', text: ending + ' ' + chair };
}
