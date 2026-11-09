const paths = {
  search: 'M21 21l-5-5m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',
  scan: 'M3 7h4l2-3h6l2 3h4a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Zm13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  starter: 'm6 20-3-.6a1.5 1.5 0 0 1-1.2-1.7L4 5.3a1.5 1.5 0 0 1 1.7-1.2l4 .7m8 15.1 3.4-.6a1.5 1.5 0 0 0 1.2-1.7L20 5.3a1.5 1.5 0 0 0-1.7-1.2l-4 .7M10 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  import: 'M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8Zm0 0v6h6',
  stack: 'm12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5',
};

export function IntakeIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
