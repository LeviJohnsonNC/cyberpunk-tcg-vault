import type { StoryArt } from '../lib/play/campaignRoutes';
import handset from '../assets/play/story/route-handset.webp';
import backroom from '../assets/play/story/route-backroom.webp';
import tape from '../assets/play/story/route-tape.webp';
import chair from '../assets/play/story/route-chair.webp';
import key from '../assets/play/story/route-key.webp';
import film from '../assets/play/story/route-film.webp';

export const routeArt = {
  handset: [handset, 'A translucent phone rings beside the rain-soaked rooftop relay.'],
  backroom: [backroom, 'A courier slips a green chip through the backroom door.'],
  tape: [tape, 'Ledger holds a finger on the reel of a pocket recorder.'],
  chair: [chair, 'The phone rests on the felt beside an empty chair at dawn.'],
  key: [key, 'Brake holds the brass lift key above the microphone stand.'],
  film: [film, 'An editor cuts a strip of film on a lit inspection plate.'],
} satisfies Record<StoryArt, [string, string]>;
