/** Presentation only. Reward odds and saved printing IDs never depend on these tokens. */
export interface PackMaterial {
  name: string;
  edge: string;
  secondary: string;
  catch: string;
  rim: string;
  sheen: string;
  edgeOpacity: number;
  bloom: number;
  halo: number;
  spill: number;
  reflection: number;
  surface: number;
  duration: number;
}

const satin: PackMaterial = {
  name: 'satin', edge: '#cee0df', secondary: '#c987a8', catch: '#ffe5bc',
  rim: 'linear-gradient(135deg, #effcff 0%, #7dd0df 14%, #294552 29%, #291c29 46%, #ba6e91 70%, #ffe1a5 90%, #fff1d4 96%, #8e6460)',
  sheen: 'linear-gradient(115deg, transparent 28%, #e8f3ee10 43%, #fff4df60 49%, #ffd4ae15 53%, transparent 63%)',
  edgeOpacity: .9, bloom: .24, halo: .08, spill: .28, reflection: .16, surface: .16, duration: 480,
};

export function packMaterial(_rarity?: string): PackMaterial { return satin; }
export function packMaterialStyle(rarity?: string): Record<`--${string}`, string | number> {
  const m = packMaterial(rarity);
  return {
    '--material-edge': m.edge, '--material-secondary': m.secondary, '--material-catch': m.catch,
    '--material-rim': m.rim, '--material-sheen': m.sheen,
    '--material-edge-opacity': m.edgeOpacity, '--material-bloom': m.bloom,
    '--material-halo': m.halo, '--material-spill': m.spill, '--material-reflection': m.reflection,
    '--material-surface': m.surface, '--material-duration': `${m.duration}ms`,
  };
}
