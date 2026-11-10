import type { GigRoll } from '../lib/play/protocol';

const shapes: Record<string, { outline: string; face: string; facets: string; y?: number }> = {
  d4: {
    outline: 'M24 3 46 42 4 42Z',
    face: 'M24 3 37 33 4 42Z',
    facets: 'M37 33 46 42',
    y: 28,
  },
  d6: {
    outline: 'M5 12 13 5 38 5 44 12 44 37 37 43 5 43Z',
    face: 'M5 12H37V43H5Z',
    facets: 'M37 12 44 12M37 12 38 5',
    y: 27,
  },
  d8: {
    outline: 'M24 2 44 24 24 46 4 24Z',
    face: 'M24 2 33 26 24 46 15 26Z',
    facets: 'M4 24 15 26H33L44 24',
    y: 25,
  },
  d10: {
    outline: 'M24 2 44 17 46 29 24 46 2 29 4 17Z',
    face: 'M24 2 36 25 24 46 12 25Z',
    facets: 'M4 17 12 25 2 29M44 17 36 25 46 29',
    y: 24,
  },
  d12: {
    outline: 'M15 4H33L45 16V32L33 44H15L3 32V16Z',
    face: 'M24 8 38 18 33 34H15L10 18Z',
    facets: 'M24 8 15 4M24 8 33 4M38 18 45 16M33 34 45 32M33 34V44M15 34V44M15 34 3 32M10 18 3 16',
    y: 24,
  },
  d20: {
    outline: 'M24 2 44 13V35L24 46 4 35V13Z',
    face: 'M24 10 38 34H10Z',
    facets: 'M24 2V10L4 13M24 10 44 13M38 34 44 35M38 34 24 46 10 34 4 35',
    y: 27,
  },
};

export function DieFace({ type, value }: { type: string; value?: number }) {
  const shape = Object.hasOwn(shapes, type) ? shapes[type] : shapes.d6;
  return <svg className="play-die-face" viewBox="0 0 48 48" aria-hidden="true">
    <path className="play-die-shell" d={shape.outline} />
    <path className="play-die-front" d={shape.face} />
    <path className="play-die-facets" d={shape.facets} />
    <text className={value === undefined ? 'play-die-type' : 'play-die-number'}
      x={type === 'd6' ? 21 : 24} y={shape.y ?? 24} textAnchor="middle" dominantBaseline="central">
      {value ?? type}
    </text>
  </svg>;
}

export function GigRollDisplay({ rolls, stateID }: { rolls: GigRoll[]; stateID: number }) {
  return <>
    <span className="sr-only" role="status">{rolls.map(({ seat, origin, dieType, result }) =>
      `${seat === 'player' ? 'You' : 'Rival'} ${origin === 'reroll' ? 'rerolled' : 'rolled'} a ${dieType}: ${result}.`).join(' ')}</span>
    {rolls.length > 0 && <div className="play-roll-stage" key={stateID} aria-hidden="true">
      {rolls.map(({ dieId, dieType, result, seat, origin }, index) =>
        <div className="play-roll-receipt" key={`${dieId}:${index}`} data-seat={seat} data-die={dieType} data-result={result}>
          <span className="play-roll-shadow" />
          <DieFace type={dieType} value={result} />
          <span className="play-roll-caption">{seat === 'player' ? 'You' : 'Rival'} {origin === 'reroll' ? 'rerolled' : 'rolled'} <b>{dieType}</b></span>
        </div>)}
    </div>}
  </>;
}
