// Lightweight manifest generated with the engine; never loads the rules bundle into the UI.
import supportedSlugs from '../../../vendor/cyberpunk-engine/card-slugs.json';
const cardAliases: Record<string, string> = {
  'el-sombrero-n-la-venganza-lenta': 'el-sombreron-la-venganza-lenta',
  'gilded-mato-n': 'gilded-maton',
  'judy-a-lvarez-braindance-maestro': 'judy-alvarez-braindance-maestro',
  'judy-a-lvarez-nothing-to-doubt': 'judy-alvarez-nothing-to-doubt',
  'les-e-le-mens': 'les-elemens',
  'lucyna-kushinada-fresh-beginnings': 'lucyna-kushinada',
  'muamar-reyes-el-capita-n': 'muamar-reyes-el-capitan',
};

const supported = new Set(supportedSlugs);
export const engineSlug = (slug: string) => cardAliases[slug] ?? slug;
export const isEngineSupported = (slug: string) => supported.has(engineSlug(slug));
