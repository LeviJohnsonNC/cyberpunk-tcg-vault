import { ENCOUNTERS, type CampaignRun, type EncounterId } from './campaign';
import { campaignChapters } from './campaignStory';

export interface CampaignSceneBeat {
  title: string;
  text: string;
  art: 'rival' | 'clue' | 'room';
}

interface ContractScenes {
  win: readonly CampaignSceneBeat[];
  loss: CampaignSceneBeat;
  retries: readonly string[];
}

export const contractScenes = {
  'first-call': {
    win: [
      { title: 'The last card', text: 'Moth counts your Gigs again. Then they look over at the bar, where nobody’s watching. “I’m supposed to give you this if you win.” They slide a receipt out from under the pack.', art: 'rival' },
      { title: 'Signed in advance', text: '“That’s her hand.” Moth puts two fingers on the signature. The fixer has been missing for twenty-three days. When Moth lifts their fingers, the ink smears.', art: 'clue' },
      { title: 'Ask for Ledger', text: 'The receipt lists your crew and a table number. Beside both is a debt you never took out. “Ask for Ledger,” Moth says. “And keep the original.” The bartender has already put a fresh pack on your side of the table.', art: 'room' },
    ],
    loss: { title: 'Hold the table', text: 'Moth takes a breath they’ve been holding since the first roll. “You can open it here,” they say, pushing over the house pack. “I told them I might need the table twice.” Whatever’s under their coaster stays there.', art: 'rival' },
    retries: ['Moth turns the chair around for luck. “Worked for me once. Your turn to try it.”', '“I practiced a better victory speech. I’ll save it. Open your pack.”', 'Moth catches the pack before it slides off the table. “You’re coming back, right?”'],
  },
  'chrome-debt': {
    win: [
      { title: 'Enter the loss', text: 'Ledger draws a line under the final score. “A loss goes in the books,” she says. “So does a debt. The difference is I can show you who entered this one.”', art: 'rival' },
      { title: 'Already on the books', text: 'She tears out the page. Your crew’s debt was entered the day before you sat down with Moth. In the margin, in the same hand as the receipt, the fixer wrote one word: Latch. Ledger lays the page under your pack. “You didn’t borrow a thing. Keep that in mind when they ask you to pay.”', art: 'clue' },
    ],
    loss: { title: 'Close of business', text: 'Ledger closes the book around her pen. “I promised a look at the books if you beat me. The house only promised you a pack.” She puts one neatly on your side of the line.', art: 'rival' },
    retries: ['“Same account, different hand.” Ledger checks the seal before she passes you the pack.', 'Ledger taps her pen on your pack. “There are cheaper ways to learn this lesson. I think you’ve found one.”', '“I can keep the book open a little longer. The pack is yours either way.”'],
  },
  'dead-drop': {
    win: [
      { title: 'Two knocks', text: 'Latch checks the side door, then knocks twice under the table. “Pack’s on top. What you came for is underneath. I was paid to wait until you won.” By the time you reach down, the courier is out the door.', art: 'rival' },
      { title: 'Delivery instructions', text: 'The recorder crackles. “If the house already has a line for your crew, you’re the people I need. Get to the Rainline relay.” You hear her draw a breath. “If someone calls from my number, let it ring.”', art: 'clue' },
    ],
    loss: { title: 'Missed pickup', text: 'Latch gets up with the packet still tucked under one arm. “No handoff today.” They tip their chin toward the bar. “Your pack’s waiting over there. Come find me when you’ve opened it.”', art: 'rival' },
    retries: ['“Same pickup window tomorrow. I’ll see if I can make it earlier.”', 'Latch flips the house pack across the table. “That one doesn’t need a signature.”', '“I’ve carried the packet this far. I can carry it another block.”'],
  },
  'night-drive': {
    win: [
      { title: 'Above the noise', text: 'Switchback wedges open the roof door with a wrench and leaves your pack on the dry side. “I promised you a look. Don’t touch the wire on the ladder. It’s the only thing keeping that relay awake.”', art: 'rival' },
      { title: 'A signal in the rain', text: 'The relay wakes as you come close. So does the dead phone. The incoming call shows the fixer’s number. You keep your thumb off the screen until it goes dark. Behind you, a second screen wakes in the rain. Someone has been waiting to see if you’d answer.', art: 'clue' },
    ],
    loss: { title: 'Off the road', text: 'Switchback pulls the roof door shut. “You don’t take a bad hand up a live ladder.” She nods at the pack on the dry step. “Open that here. The roof will still be here when you’re ready.”', art: 'rival' },
    retries: ['“We’ve pulled worse wrecks out of deeper ditches.” Switchback sets the pack within reach.', '“Check your kit before you come back. Start with the pack.”', 'Switchback opens the door just far enough to let the rain smell in. “Weather’s holding. So am I.”'],
  },
  'dead-air': {
    win: [
      { title: 'Session held open', text: 'Hush covers the camera on their deck with the foil pack, then turns the screen toward you. “You let it ring. Good. I had time to follow it back.”', art: 'rival' },
      { title: 'The account is still online', text: 'The call came from a live Afterlife account, routed through the fixer’s credentials. The same account approved the debts. Its last login came from upstairs. “Take the log,” Hush says. “Brake can get you through the door. I can’t.”', art: 'clue' },
    ],
    loss: { title: 'Session closed', text: 'Hush flips the deck shut. “You’ve still got a guest pass. It comes with a pack.” They hand it over without looking at the door. “Try me again when you’ve got something different in your hand.”', art: 'rival' },
    retries: ['“Same client. Different error this time. That’s progress.”', '“Your exit packet.” Hush drops the sealed foil on the table. “See you on the next handshake.”', 'Hush shuts off the screen. The roof goes dark. “You know where to knock.”'],
  },
  'red-line': {
    win: [
      { title: 'A deal is a deal', text: 'Brake takes his hand off the brass key. “I said I’d give it to you if you won.” He puts the pack beside it. “I’d take both before your phone goes off.”', art: 'rival' },
      { title: 'An offer on the way upstairs', text: 'The phone buzzes before you touch the key. One tap would erase your crew’s debt and put enough in your account to quit. There’s no mention of the other crews. You pocket the key. Brake quietly holds the lift.', art: 'clue' },
    ],
    loss: { title: 'Key stays here', text: 'Brake puts the key back in his pocket, but leaves the pack on the table. “You can sit here until you finish your drink.” He pulls the chair out for you on his way past.', art: 'rival' },
    retries: ['“Sit. We can do it again.” Brake nudges the pack across with two fingers.', 'Brake checks your glass is clear of the cards. “The pack’s on your side.”', '“I kept the chair where it was.” The key hasn’t moved either.'],
  },
  'mosh-pit': {
    win: [
      { title: 'Hold the room', text: 'Feedback raises your hand. The crowd starts to cheer, then catches sight of the brass key. “That goes upstairs,” somebody says. A house guard reaches for the lights.', art: 'rival' },
      { title: 'The room is listening', text: 'Feedback leaves the mic live. You read out the date on your receipt. Voices in the back start calling out their own dates, each from before they ever played. The guard lets go of the switch. Feedback sets the pack down in full view of the room.', art: 'clue' },
    ],
    loss: { title: 'End of the set', text: 'Feedback cuts the mic before the crowd can get clever. “House pack for the challenger.” They say the next part just to you. “Come back. I’m sick of playing the same set.”', art: 'rival' },
    retries: ['“Encore’s yours when you want it.” Feedback puts the pack where the front row can see.', 'Feedback lets the last clap die out. “Open it before they start requesting songs.”', '“I’ll keep the mic warm. You work on the second set.”'],
  },
  'hostile-takeover': {
    win: [
      { title: 'Roll it back', text: 'Splice watches their edited version of the match reach the wrong ending. They let it run to black, then drop the raw feed. “This is what they paid me to cut.”', art: 'rival' },
      { title: 'The footage they cut', text: 'A line of crews files out. Sato waits by the lift, taking the signed debts one by one. There you are on the list, pre-entered, just like the others. The fixer copied the ledger before Sato locked her out. “She picked a crew he hadn’t got his hands on yet,” Splice says, and slides you the recording with the pack.', art: 'clue' },
    ],
    loss: { title: 'Print that take', text: 'Splice plays the same last move twice. “It looks worse in slow motion. Trust me.” They set a pack by the console. The raw footage is still locked behind the finished cut.', art: 'rival' },
    retries: ['“Pickups tomorrow. Same mark, better ending.” Splice passes the pack over without looking.', 'Splice rewinds to your entrance. “That part still works. Take the pack.”', '“They can keep this version. I’ll save the next one for you.”'],
  },
  'last-call': {
    win: [
      { title: 'Leave me my pen', text: 'Sato looks at the ledger instead of the score. “You do understand what it costs to own this room?” You ask him to open it to the first page. He does. He leaves the pen in the crease.', art: 'rival' },
      { title: 'The house is yours', text: 'You strike out your crew’s line, then every other pre-entered debt. Downstairs, the bartender reads the cancellations into Feedback’s open mic. You hear the room go quiet from three floors up. When you come back to the table, Sato is gone. A sealed pack waits by the ledger.', art: 'room' },
      { title: 'Leave a chair empty', text: 'You send the fixer a photo of her own invitation beside the crossed-out ledger. At dawn the dead phone lights up once more. “Leave a chair empty.” You move the pack to your side of the table.', art: 'clue' },
    ],
    loss: { title: 'Meeting adjourned', text: 'Sato closes the ledger without putting it away. “I allowed for another meeting.” An attendant sets the house pack beside your glass. Sato waits while you decide whether to take it.', art: 'rival' },
    retries: ['“There’s always time for another meeting.” Sato rings once for the pack.', 'Sato straightens the ledger with the edge of the table. “Shall we leave tomorrow open?”', '“The house insists you take the pack.” Sato stays seated until you stand.'],
  },
} satisfies Record<EncounterId, ContractScenes>;

export function aftermathBeats(run: CampaignRun): readonly CampaignSceneBeat[] {
  const scene = run.aftermath;
  if (!scene) return [];
  const id = ENCOUNTERS[run.encounter].id;
  const contract = contractScenes[id];
  if (scene.outcome === 'win') return contract.win;
  if (scene.outcome === 'draw') {
    const { lines, rival } = campaignChapters[id];
    return [{ title: 'Unfinished business', text: `“${lines.draw[0]}” ${rival} leaves you with the house pack. The table is still yours to challenge.`, art: 'rival' }];
  }
  const defeat = run.defeats ?? 1;
  if (defeat <= 1) return [contract.loss];
  return [{ title: 'See you at the table', text: contract.retries[(defeat - 2) % contract.retries.length], art: 'rival' }];
}
