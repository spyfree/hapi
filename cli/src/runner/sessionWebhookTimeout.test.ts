import { describe, expect, it } from 'vitest';
import { getSessionWebhookTimeoutMs } from './sessionWebhookTimeout';

describe('getSessionWebhookTimeoutMs', () => {
    it('uses a longer timeout for codex remote sessions', () => {
        expect(getSessionWebhookTimeoutMs('codex')).toBe(45_000);
    });

    it('keeps the default timeout for other agents', () => {
        expect(getSessionWebhookTimeoutMs('claude')).toBe(15_000);
        expect(getSessionWebhookTimeoutMs('gemini')).toBe(15_000);
        expect(getSessionWebhookTimeoutMs('cursor')).toBe(15_000);
        expect(getSessionWebhookTimeoutMs('opencode')).toBe(15_000);
        expect(getSessionWebhookTimeoutMs(undefined)).toBe(15_000);
    });
});
