import type { CupStyle } from '../domain/types';

// Vector icons do not depend on emoji fonts installed on the user's OS.
export function CupIcon({ style }: { style: CupStyle }) {
  return <svg className={`cup-icon cup-icon-${style}`} viewBox="0 0 28 28" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {style === 'ceramic' ? <>
      <path d="M5 10h15v10a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" fill="#ffdbe7" />
      <path d="M20 12h2a4 4 0 0 1 0 8h-2M9 3v3M15 3v3" />
    </> : style === 'tumbler' ? <>
      <path d="m7 9 2 15h10l2-15Z" fill="#cce5ff" />
      <path d="M6 9h16M8 6h12M16 6l2-4h4M10 14h8" />
    </> : <>
      <path d="M10 7h8v3l3 4v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9l3-4Z" fill="#ccefe8" />
      <path d="M10 3h8v4h-8ZM7 16h14M7 21h14" />
    </>}
  </svg>;
}
