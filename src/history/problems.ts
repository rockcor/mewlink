// Why a replay recording could not be saved, for a short notice. Storage full
// is said as such; a pairing that is not usable yet (being confirmed, revoked or
// switched) is no problem at all; anything else is a save that failed once,
// after which recording simply carries on.

export type SaveProblem = 'space' | 'save';

export function saveProblem(error: unknown): SaveProblem | undefined {
  if (error instanceof Error && /pairing[_ ](required|changed)|relationship_revoked/.test(error.message)) return undefined;
  if (typeof DOMException !== 'undefined' && error instanceof DOMException
    && (error.name === 'QuotaExceededError' || error.code === 22)) return 'space';
  return 'save';
}
