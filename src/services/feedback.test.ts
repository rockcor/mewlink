import { describe, expect, it, vi } from 'vitest';
import { FEEDBACK_ENDPOINT, submitFeedback } from './feedback';

describe('feedback submission', () => {
  it('sends the nickname and message to the public comments endpoint', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }));
    await submitFeedback({ nickname: 'Luka', message: '动画很可爱', language: 'zh' }, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledWith(FEEDBACK_ENDPOINT, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ nickname: 'Luka', message: '动画很可爱', language: 'zh', source: 'app' })
    }));
  });

  it('reports rejected submissions', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 429 }));
    await expect(submitFeedback({ nickname: '66', message: 'hello', language: 'en' }, fetcher as typeof fetch)).rejects.toThrow('429');
  });
});
