import type { RivalSkill } from './protocol';

const legacySkillKey = 'cptv.play.rival-skill.v1';

export function freePlaySkillKey(scope?: string) {
  return scope === undefined ? legacySkillKey : `${legacySkillKey}:${scope}`;
}

export const rivalSkills: { id: RivalSkill; label: string; note: string }[] = [
  { id: 'standard', label: 'Standard', note: 'A forgiving rival with straightforward priorities.' },
  { id: 'sharp', label: 'Sharp', note: 'Looks ahead and weighs likely replies.' },
  { id: 'masterful', label: 'Masterful', note: 'Looks ahead with ability-aware tactics.' },
];
