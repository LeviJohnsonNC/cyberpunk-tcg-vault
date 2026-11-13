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

export const PACK_RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Secret', 'Iconic Other', 'Iconic Legend', 'Iconic Secret'] as const;
export type PackRarity = typeof PACK_RARITIES[number];

// The spectrum describes the material, never the card's gameplay colour.
export const PACK_MATERIALS: Readonly<Record<PackRarity, PackMaterial>> = {
  Common: satin,
  Uncommon: {
    ...satin, name: 'silver', edge: '#a5e4cc', secondary: '#6389a9', catch: '#ebfff4',
    rim: 'linear-gradient(150deg, #eafff4, #99dabd 19%, #364c4c 38%, #637d8f 60%, #b8eedc 83%, #eafff4 96%, #65877d)',
    sheen: 'linear-gradient(112deg, transparent 39%, #a5e4cc12 46%, #ebfff4a0 49%, #9ec8b71c 51%, transparent 57%)',
    edgeOpacity: .96, bloom: .29, halo: .09, spill: .32, reflection: .17, surface: .23, duration: 530,
  },
  Rare: {
    ...satin, name: 'metallic', edge: '#ffbd59', secondary: '#d57532', catch: '#fff1be',
    rim: 'linear-gradient(132deg, #fff8d8, #ffd473 17%, #724a20 35%, #432526 50%, #d48c37 66%, #fff1b4 91%, #ffd479)',
    sheen: 'linear-gradient(112deg, transparent 27%, #ab6c2210 38%, #e3b34a30 45%, #fff3c8bb 49%, #bf7b2e24 52%, transparent 61%)',
    edgeOpacity: 1, bloom: .43, halo: .13, spill: .46, reflection: .2, surface: .32, duration: 640,
  },
  Epic: {
    ...satin, name: 'interference', edge: '#b09aff', secondary: '#ee72b3', catch: '#f8dcff',
    rim: 'linear-gradient(142deg, #f7ddff, #a59aff 14%, #594092 34%, #3e284f 46%, #df64ac 68%, #f7c6ec 88%, #aea1ff)',
    sheen: 'linear-gradient(116deg, transparent 22%, #9974f04a 37%, #d9c3ffb0 42%, transparent 48%, #ee68c233 52%, #ffd6ed9c 59%, #a583ff20 65%, transparent 75%)',
    edgeOpacity: 1, bloom: .47, halo: .18, spill: .48, reflection: .2, surface: .38, duration: 740,
  },
  Secret: {
    ...satin, name: 'pearl', edge: '#f2ead4', secondary: '#acd6cf', catch: '#fff9e5',
    rim: 'linear-gradient(131deg, #fffdf2, #e3d7bf 16%, #807b79 29%, #35323c 43%, #b6bec1 63%, #f9e4ce 79%, #fff9eb 91%, #b9ddd7)',
    sheen: 'linear-gradient(106deg, transparent 28%, #e7b9c118 36%, #e7ccf147 43%, #fff6debb 48%, #b1e3d74d 52%, #eed7b725 58%, transparent 72%)',
    edgeOpacity: 1, bloom: .4, halo: .11, spill: .42, reflection: .24, surface: .34, duration: 790,
  },
  'Iconic Other': {
    ...satin, name: 'dichroic', edge: '#6de3f7', secondary: '#ff68bd', catch: '#d8f9ff',
    rim: 'conic-gradient(from 12deg, #ffafe3, #ff67bd 17%, #7d466c 29%, #65d9ee 45%, #dcffff 57%, #6ae1f7 72%, #456a96 82%, #ffafe3)',
    sheen: 'linear-gradient(122deg, transparent 17%, #52d8f143 34%, #c5faffb8 41%, #447bae20 47%, #df6aa332 52%, #ffb0dbb0 60%, #d44fab30 67%, transparent 79%)',
    edgeOpacity: 1, bloom: .52, halo: .16, spill: .55, reflection: .24, surface: .43, duration: 850,
  },
  'Iconic Legend': {
    ...satin, name: 'gilded', edge: '#f5cd66', secondary: '#b79be8', catch: '#fff5c9',
    rim: 'conic-gradient(from -18deg, #fff4c2, #e8b74b 16%, #8e5a24 26%, #ffd779 41%, #fff5cb 53%, #a8d9d2 58%, #a897e5 62%, #dfad47 70%, #fff4b7 90%, #fff4c2)',
    sheen: 'linear-gradient(111deg, transparent 19%, #c89a3a20 32%, #f9d98575 43%, #fff5ccbf 47%, #e1af4535 52%, transparent 58%, #bdadee55 66%, #c3eee858 70%, transparent 79%)',
    edgeOpacity: 1, bloom: .55, halo: .16, spill: .57, reflection: .26, surface: .44, duration: 910,
  },
  'Iconic Secret': {
    ...satin, name: 'prismatic', edge: '#e2f5fb', secondary: '#e6b2db', catch: '#fff2c3',
    rim: 'conic-gradient(from 5deg, #fff6d3, #e9b4d2 12%, #a998df 24%, #a3dfef 36%, #fdf9e6 46%, #f0d599 56%, #e7a5ce 68%, #a7e4df 79%, #d3d1ff 90%, #fff6d3)',
    sheen: 'linear-gradient(119deg, transparent 13%, #c0e9f139 28%, #c2d7ff75 34%, #e4c1f084 40%, #ffe7bf9c 46%, #fffdf1cd 49%, #c0eee17d 53%, #c0c3f15a 60%, #e9afd437 67%, transparent 81%)',
    edgeOpacity: 1, bloom: .57, halo: .18, spill: .59, reflection: .28, surface: .45, duration: 990,
  },
};
export function packMaterial(rarity?: string): PackMaterial {
  return rarity && Object.hasOwn(PACK_MATERIALS, rarity) ? PACK_MATERIALS[rarity as PackRarity] : satin;
}
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
