const legacySkillKey = 'cptv.play.rival-skill.v1';

export function freePlaySkillKey(scope?: string) {
  return scope === undefined ? legacySkillKey : `${legacySkillKey}:${scope}`;
}
