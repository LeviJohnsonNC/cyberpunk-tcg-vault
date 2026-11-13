import { createContext } from 'react';

// The Vault owns playback. A mounted match can provide an in-flow home for its controls.
export const MatchRadioContainer = createContext<((node: HTMLDivElement | null) => void) | undefined>(undefined);
