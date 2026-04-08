import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { MachineSessionProfiles } from '@hapi/protocol'

type PersistenceModule = typeof import('./persistence')

async function loadPersistenceWithHome(homeDir: string): Promise<PersistenceModule> {
    vi.resetModules()
    process.env.HAPI_HOME = homeDir
    return await import('./persistence')
}

describe('machine session profile persistence', () => {
    let homeDir: string

    beforeEach(async () => {
        homeDir = await mkdtemp(join(tmpdir(), 'hapi-persistence-test-'))
    })

    afterEach(async () => {
        delete process.env.HAPI_HOME
        vi.resetModules()
        await rm(homeDir, { recursive: true, force: true })
    })

    it('returns an empty default payload when no settings file exists', async () => {
        const persistence = await loadPersistenceWithHome(homeDir)

        await expect(persistence.readMachineSessionProfiles()).resolves.toEqual({
            profiles: [],
            defaults: { codexProfileId: null }
        })
    })

    it('roundtrips validated machine session profiles', async () => {
        const persistence = await loadPersistenceWithHome(homeDir)
        const payload: MachineSessionProfiles = {
            profiles: [
                {
                    id: 'ice',
                    label: 'Ice',
                    agent: 'codex',
                    defaults: {
                        configProfile: 'ice',
                        model: 'gpt-5.4',
                        modelReasoningEffort: 'high',
                        permissionMode: 'safe-yolo',
                        collaborationMode: 'plan',
                        sessionType: 'worktree'
                    }
                }
            ],
            defaults: {
                codexProfileId: 'ice'
            }
        }

        await expect(persistence.writeMachineSessionProfiles(payload)).resolves.toEqual(payload)
        await expect(persistence.readMachineSessionProfiles()).resolves.toEqual(payload)
    })

    it('clears a stale default profile id when the referenced profile is missing', async () => {
        const persistence = await loadPersistenceWithHome(homeDir)

        await persistence.writeSettings({
            sessionProfiles: [
                {
                    id: 'ice',
                    label: 'Ice',
                    agent: 'codex',
                    defaults: {}
                }
            ],
            defaultProfiles: {
                codexProfileId: 'missing'
            }
        })

        await expect(persistence.readMachineSessionProfiles()).resolves.toEqual({
            profiles: [
                {
                    id: 'ice',
                    label: 'Ice',
                    agent: 'codex',
                    defaults: {}
                }
            ],
            defaults: { codexProfileId: null }
        })
    })
})
