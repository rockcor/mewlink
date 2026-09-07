import type { Language } from '../settings/preferences';

export const FEEDBACK_ENDPOINT = 'https://mewlink.jshmhsb.chatgpt.site/api/comments';

export interface FeedbackSubmission {
  nickname: string;
  message: string;
  language: Language;
}

export async function submitFeedback(
  submission: FeedbackSubmission,
  fetcher: typeof fetch = fetch
): Promise<void> {
  const response = await fetcher(FEEDBACK_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...submission, source: 'app' })
  });
  if (!response.ok) throw new Error(`feedback endpoint returned ${response.status}`);
}
