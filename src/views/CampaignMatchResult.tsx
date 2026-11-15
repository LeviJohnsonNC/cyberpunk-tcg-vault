import type { EncounterId } from '../lib/play/campaign';
import { campaignChapters } from '../lib/play/campaignStory';
import { advanceRivalDialogue, rivalResult } from '../lib/play/rivalDialogue';
import type { MatchSnapshot } from '../lib/play/protocol';
import { CampaignRivalPortrait } from './CampaignRivalPortrait';
import { MatchOutcome } from './MatchOutcome';

export interface CampaignResultDetails {
  encounter: EncounterId;
  title: string;
  dialogue: boolean;
  continueLabel: string;
  next?: string;
  reload?: () => void;
}

export function CampaignMatchResult({ details, snapshot, busy, error, onContinue }: {
  details: CampaignResultDetails; snapshot: MatchSnapshot; busy: boolean; error?: string; onContinue: () => void;
}) {
  const { encounter, title, dialogue, continueLabel, next, reload } = details;
  const chapter = campaignChapters[encounter];
  const farewell = dialogue ? advanceRivalDialogue(undefined, {
    matchId: snapshot.matchId, batch: snapshot.view.stateID, beats: [], result: rivalResult(snapshot.view), now: 0,
  }, chapter.lines).line : undefined;

  return <MatchOutcome snapshot={snapshot} busy={busy} error={error} label={title} kind="Campaign result"
    rival={chapter.rival} artKey={encounter} portrait={<CampaignRivalPortrait encounter={encounter} />}
    quote={farewell?.text} next={next} continueLabel={continueLabel} onContinue={onContinue} reload={reload} />;
}
