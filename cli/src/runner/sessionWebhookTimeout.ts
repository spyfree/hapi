import type { SpawnSessionOptions } from '@/modules/common/rpcTypes';

const DEFAULT_SESSION_WEBHOOK_TIMEOUT_MS = 15_000;
const CODEX_SESSION_WEBHOOK_TIMEOUT_MS = 45_000;

export function getSessionWebhookTimeoutMs(agent: SpawnSessionOptions['agent']): number {
    return agent === 'codex'
        ? CODEX_SESSION_WEBHOOK_TIMEOUT_MS
        : DEFAULT_SESSION_WEBHOOK_TIMEOUT_MS;
}
