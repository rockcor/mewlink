import { describe, expect, it, vi } from 'vitest';
import { FEEDBACK_ENDPOINT, submitFeedback } from './feedback';

describe('feedback submission', () => {
  it('sends the nickname, message and app version for the developer', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 }));
    await submitFeedback({ nickname: 'Luka', message: '动画很可爱', language: 'zh', version: '0.3.28' }, fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledWith(FEEDBACK_ENDPOINT, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ nickname: 'Luka', message: '动画很可爱', language: 'zh', version: '0.3.28', source: 'app' })
    }));
  });

  it('reports rejected submissions', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 429 }));
    await expect(submitFeedback({ nickname: '66', message: 'hello', language: 'en' }, fetcher as typeof fetch)).rejects.toThrow('429');
  });
});
