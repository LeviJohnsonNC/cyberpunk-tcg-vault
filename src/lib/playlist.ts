// Background music. Put audio files in public/music/ and list them here in play order.
// The site is public: only add tracks you have the rights to distribute.
export interface Track {
  title: string;
  artist?: string;
  src: string; // e.g. '/music/night-city.mp3'
}

export const PLAYLIST: Track[] = [];
