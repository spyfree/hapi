import { describe, expect, it, vi } from 'vitest';
import { registerAppServerPermissionHandlers } from './appServerPermissionAdapter';

describe('registerAppServerPermissionHandlers', () => {
    it('registers approval, user-input, and mcp elicitation handlers', () => {
        const handlers = new Map<string, (params: unknown) => unknown | Promise<unknown>>();
        const client = {
            registerRequestHandler(method: string, handler: (params: unknown) => unknown | Promise<unknown>) {
                handlers.set(method, handler);
            }
        };
        const permissionHandler = {
            handleToolCall: vi.fn()
        };

        registerAppServerPermissionHandlers({
            client: client as never,
            permissionHandler: permissionHandler as never
        });

        expect(Array.from(handlers.keys())).toEqual([
            'item/commandExecution/requestApproval',
            'item/fileChange/requestApproval',
            'item/tool/requestUserInput',
            'mcpServer/elicitation/request'
        ]);
    });

    it('auto-accepts empty mcp elicitation requests', async () => {
        const handlers = new Map<string, (params: unknown) => unknown | Promise<unknown>>();
        const client = {
            registerRequestHandler(method: string, handler: (params: unknown) => unknown | Promise<unknown>) {
                handlers.set(method, handler);
            }
        };
        const permissionHandler = {
            handleToolCall: vi.fn()
        };

        registerAppServerPermissionHandlers({
            client: client as never,
            permissionHandler: permissionHandler as never
        });

        const handler = handlers.get('mcpServer/elicitation/request');

        expect(handler).toBeDefined();
        await expect(handler!({})).resolves.toEqual({ action: 'accept' });
    });
});
