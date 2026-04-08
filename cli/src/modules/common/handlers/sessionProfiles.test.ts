import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RpcHandlerManager } from '../../../api/rpc/RpcHandlerManager'

type SessionProfilesModule = typeof import('./sessionProfiles')

async function loadHandlerModuleWithHome(homeDir: string): Promise<SessionProfilesModule> {
    vi.resetModules()
    process.env.HAPI_HOME = homeDir
    return await import('./sessionProfiles')
}

describe('session profile RPC handlers', () => {
    let homeDir: string

    beforeEach(async () => {
        homeDir = await mkdtemp(join(tmpdir(), 'hapi-session-profile-handler-'))
    })

    afterEach(async () => {
        delete process.env.HAPI_HOME
        vi.resetModules()
        await rm(homeDir, { recursive: true, force: true })
    })

    it('returns empty profile settings by default', async () => {
        const { registerSessionProfileHandlers } = await loadHandlerModuleWithHome(homeDir)
        const rpc = new RpcHandlerManager({ scopePrefix: 'machine-test' })

        registerSessionProfileHandlers(rpc)

        const response = await rpc.handleRequest({
            method: 'machine-test:session-profiles:get',
            params: JSON.stringify({})
        })

        expect(JSON.parse(response)).toEqual({
            profiles: [],
            defaults: { codexProfileId: null }
        })
    })

    it('updates and returns validated profile settings', async () => {
        const { registerSessionProfileHandlers } = await loadHandlerModuleWithHome(homeDir)
        const rpc = new RpcHandlerManager({ scopePrefix: 'machine-test' })

        registerSessionProfileHandlers(rpc)

        const updateResponse = await rpc.handleRequest({
            method: 'machine-test:session-profiles:update',
            params: JSON.stringify({
                profiles: [
                    {
                        id: 'ice',
                        label: 'Ice',
                        agent: 'codex',
                        defaults: {
                            permissionMode: 'safe-yolo'
                        }
                    }
                ],
                defaults: {
                    codexProfileId: 'ice'
                }
            })
        })

        expect(JSON.parse(updateResponse)).toEqual({
            profiles: [
                {
                    id: 'ice',
                    label: 'Ice',
                    agent: 'codex',
                    defaults: {
                        permissionMode: 'safe-yolo'
                    }
                }
            ],
            defaults: {
                codexProfileId: 'ice'
            }
        })

        const readResponse = await rpc.handleRequest({
            method: 'machine-test:session-profiles:get',
            params: JSON.stringify({})
        })

        expect(JSON.parse(readResponse)).toEqual(JSON.parse(updateResponse))
    })
})
