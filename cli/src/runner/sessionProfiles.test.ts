import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type SessionProfilesModule = typeof import('./sessionProfiles')
type PersistenceModule = typeof import('../persistence')

async function loadRunnerSessionProfilesWithHome(homeDir: string): Promise<{
    sessionProfiles: SessionProfilesModule
    persistence: PersistenceModule
}> {
    vi.resetModules()
    process.env.HAPI_HOME = homeDir
    const [sessionProfiles, persistence] = await Promise.all([
        import('./sessionProfiles'),
        import('../persistence')
    ])
    return { sessionProfiles, persistence }
}

describe('runner session profile helpers', () => {
    let homeDir: string

    beforeEach(async () => {
        homeDir = await mkdtemp(join(tmpdir(), 'hapi-runner-session-profiles-'))
    })

    afterEach(async () => {
        delete process.env.HAPI_HOME
        delete process.env.HAPI_SESSION_PROFILE_ID
        delete process.env.HAPI_CODEX_CONFIG_PROFILE
        vi.resetModules()
        await rm(homeDir, { recursive: true, force: true })
    })

    it('prefers explicit permissionMode over legacy yolo flag', async () => {
        const { sessionProfiles } = await loadRunnerSessionProfilesWithHome(homeDir)

        expect(sessionProfiles.resolveSpawnPermissionMode({
            permissionMode: 'safe-yolo',
            yolo: true
        })).toBe('safe-yolo')
    })

    it('maps legacy yolo to yolo permission mode when permissionMode is absent', async () => {
        const { sessionProfiles } = await loadRunnerSessionProfilesWithHome(homeDir)

        expect(sessionProfiles.resolveSpawnPermissionMode({
            yolo: true
        })).toBe('yolo')
        expect(sessionProfiles.resolveSpawnPermissionMode({
            yolo: false
        })).toBe('default')
    })

    it('rejects unknown codex profile ids', async () => {
        const { sessionProfiles, persistence } = await loadRunnerSessionProfilesWithHome(homeDir)

        await persistence.writeMachineSessionProfiles({
            profiles: [],
            defaults: { codexProfileId: null }
        })

        await expect(sessionProfiles.assertKnownSpawnProfile('codex', 'missing')).rejects.toThrow('Profile not found')
    })

    it('allows known codex profile ids', async () => {
        const { sessionProfiles, persistence } = await loadRunnerSessionProfilesWithHome(homeDir)

        await persistence.writeMachineSessionProfiles({
            profiles: [
                {
                    id: 'ice',
                    label: 'Ice',
                    agent: 'codex',
                    defaults: {}
                }
            ],
            defaults: { codexProfileId: 'ice' }
        })

        await expect(sessionProfiles.assertKnownSpawnProfile('codex', 'ice')).resolves.toBeUndefined()
    })

    it('builds profile env with the resolved Codex config profile', async () => {
        const { sessionProfiles, persistence } = await loadRunnerSessionProfilesWithHome(homeDir)

        await persistence.writeMachineSessionProfiles({
            profiles: [
                {
                    id: 'default',
                    label: 'Default',
                    agent: 'codex',
                    defaults: {}
                },
                {
                    id: 'ice',
                    label: 'Ice',
                    agent: 'codex',
                    defaults: {
                        configProfile: 'ice'
                    }
                }
            ],
            defaults: {
                codexProfileId: 'ice'
            }
        })

        await expect(sessionProfiles.buildSpawnProfileEnv('codex', 'ice')).resolves.toEqual({
            HAPI_SESSION_PROFILE_ID: 'ice',
            HAPI_CODEX_CONFIG_PROFILE: 'ice'
        })
        await expect(sessionProfiles.buildSpawnProfileEnv('codex', 'default')).resolves.toEqual({
            HAPI_SESSION_PROFILE_ID: 'default'
        })
        await expect(sessionProfiles.buildSpawnProfileEnv('codex', null)).resolves.toEqual({})
    })

    it('builds Codex mode env for non-default permission and collaboration modes', async () => {
        const { sessionProfiles } = await loadRunnerSessionProfilesWithHome(homeDir)

        expect(sessionProfiles.buildCodexSpawnModeEnv('safe-yolo', 'plan')).toEqual({
            HAPI_CODEX_PERMISSION_MODE: 'safe-yolo',
            HAPI_CODEX_COLLABORATION_MODE: 'plan'
        })
        expect(sessionProfiles.buildCodexSpawnModeEnv('default', 'default')).toEqual({})
    })
})
