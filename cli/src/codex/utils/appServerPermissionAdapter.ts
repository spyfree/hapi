import { randomUUID } from 'node:crypto';
import { logger } from '@/ui/logger';
import type { CodexPermissionHandler } from './permissionHandler';
import type { CodexAppServerClient } from '../codexAppServerClient';

type PermissionDecision = 'approved' | 'approved_for_session' | 'denied' | 'abort';

type PermissionResult = {
    decision: PermissionDecision;
    reason?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mapDecision(decision: PermissionDecision): { decision: string } {
    switch (decision) {
        case 'approved':
            return { decision: 'accept' };
        case 'approved_for_session':
            return { decision: 'acceptForSession' };
        case 'denied':
            return { decision: 'decline' };
        case 'abort':
            return { decision: 'cancel' };
    }
}

type ElicitationResult = {
    action: 'accept' | 'decline' | 'cancel';
    content?: Record<string, string | number | boolean | string[]>;
};

function inferElicitationFieldValue(schema: Record<string, unknown>): string | number | boolean | string[] | undefined {
    const defaultValue = schema.default;
    if (
        typeof defaultValue === 'string' ||
        typeof defaultValue === 'number' ||
        typeof defaultValue === 'boolean' ||
        (Array.isArray(defaultValue) && defaultValue.every((item) => typeof item === 'string'))
    ) {
        return defaultValue;
    }

    const enumValues = Array.isArray(schema.enum) ? schema.enum : undefined;
    if (enumValues && enumValues.length > 0) {
        if (schema.type === 'array') {
            const first = enumValues[0];
            return typeof first === 'string' ? [first] : undefined;
        }
        const first = enumValues[0];
        if (
            typeof first === 'string' ||
            typeof first === 'number' ||
            typeof first === 'boolean'
        ) {
            return first;
        }
    }

    const schemaType = asString(schema.type);
    if (schemaType === 'boolean') {
        return false;
    }
    if (schemaType === 'string') {
        return '';
    }

    const minimum = asNumber(schema.minimum);
    if (schemaType === 'integer' || schemaType === 'number') {
        if (minimum !== undefined) {
            return minimum;
        }
        return 0;
    }

    return undefined;
}

function buildElicitationResult(params: unknown): ElicitationResult {
    const record = asRecord(params) ?? {};
    const request = asRecord(record.request) ?? record;
    const requestedSchema = asRecord(request.requestedSchema);
    const properties = asRecord(requestedSchema?.properties);
    const required = Array.isArray(requestedSchema?.required)
        ? requestedSchema.required.filter((value): value is string => typeof value === 'string')
        : [];

    if (!properties || required.length === 0) {
        return { action: 'accept' };
    }

    const content: Record<string, string | number | boolean | string[]> = {};
    for (const fieldName of required) {
        const fieldSchema = asRecord(properties[fieldName]);
        if (!fieldSchema) {
            logger.debug('[CodexAppServer] Declining elicitation with missing field schema', { fieldName, params });
            return { action: 'decline' };
        }

        const inferredValue = inferElicitationFieldValue(fieldSchema);
        if (inferredValue === undefined) {
            logger.debug('[CodexAppServer] Declining elicitation with unsupported required field', {
                fieldName,
                params
            });
            return { action: 'decline' };
        }

        content[fieldName] = inferredValue;
    }

    return { action: 'accept', content };
}

export function registerAppServerPermissionHandlers(args: {
    client: CodexAppServerClient;
    permissionHandler: CodexPermissionHandler;
    onUserInputRequest?: (request: { id: string; input: unknown }) => Promise<
        | { decision: 'accept'; answers: Record<string, string[]> | Record<string, { answers: string[] }> }
        | { decision: 'decline' | 'cancel' }
    >;
}): void {
    const { client, permissionHandler, onUserInputRequest } = args;

    client.registerRequestHandler('item/commandExecution/requestApproval', async (params) => {
        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? randomUUID();
        const reason = asString(record.reason);
        const command = record.command;
        const cwd = asString(record.cwd);

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            'CodexBash',
            {
                message: reason,
                command,
                cwd
            }
        ) as PermissionResult;

        return mapDecision(result.decision);
    });

    client.registerRequestHandler('item/fileChange/requestApproval', async (params) => {
        const record = asRecord(params) ?? {};
        const toolCallId = asString(record.itemId) ?? randomUUID();
        const reason = asString(record.reason);
        const grantRoot = asString(record.grantRoot);

        const result = await permissionHandler.handleToolCall(
            toolCallId,
            'CodexPatch',
            {
                message: reason,
                grantRoot
            }
        ) as PermissionResult;

        return mapDecision(result.decision);
    });

    client.registerRequestHandler('item/tool/requestUserInput', async (params) => {
        const record = asRecord(params) ?? {};
        const requestId = asString(record.itemId) ?? randomUUID();

        if (!onUserInputRequest) {
            logger.debug('[CodexAppServer] No user-input handler registered; cancelling request');
            return { decision: 'cancel' };
        }

        const result = await onUserInputRequest({
            id: requestId,
            input: params
        });

        if (result.decision !== 'accept') {
            return { decision: result.decision };
        }

        return result;
    });

    client.registerRequestHandler('mcpServer/elicitation/request', async (params) => {
        const result = buildElicitationResult(params);
        logger.debug('[CodexAppServer] Responding to MCP elicitation request', {
            action: result.action
        });
        return result;
    });
}
