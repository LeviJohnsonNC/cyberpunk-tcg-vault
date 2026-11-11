// Background music. Put audio files in public/music/ and list them here in play order.
// The site is public: only add tracks you have the rights to distribute.
export interface Track {
  title: string;
  artist?: string;
  src: string; // e.g. '/music/night-city.mp3'
}

export const PLAYLIST: Track[] = [
  { title: 'Leave the Red Light On', src: '/music/leave-the-red-light-on.m4a' },
  { title: 'Deal Me In', src: '/music/deal-me-in.m4a' },
  { title: 'One More Life', src: '/music/one-more-life.m4a' },
  { title: 'Wrong Way Home', src: '/music/wrong-way-home.m4a' },
  { title: 'Dead Air, Live Wire', src: '/music/dead-air-live-wire.m4a' },
  { title: 'A Little More', src: '/music/a-little-more.mp3' },
  { title: 'Call Me Back', src: '/music/call-me-back.mp3' },
  { title: 'In the Blackout', src: '/music/in-the-blackout.mp3' },
  { title: 'Looks Like Trouble', src: '/music/looks-like-trouble.mp3' },
  { title: 'Make It Feel Real', src: '/music/make-it-feel-real.mp3' },
  { title: 'Not Yours to Keep', src: '/music/not-yours-to-keep.mp3' },
  { title: 'Ours Until Morning', src: '/music/ours-until-morning.mp3' },
  { title: 'The City Can Wait', src: '/music/the-city-can-wait.mp3' },
  { title: 'The Night Wants Us', src: '/music/the-night-wants-us.mp3' },
  { title: 'Touch Without a Trace', src: '/music/touch-without-a-trace.mp3' },
];
