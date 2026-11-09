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
];
