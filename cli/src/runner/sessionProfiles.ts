import type { PermissionMode } from '@hapi/protocol/types'
import type { CodexCollaborationMode } from '@hapi/protocol/types'
import type { SpawnSessionOptions } from '@/modules/common/rpcTypes'
import { readMachineSessionProfiles } from '@/persistence'

async function resolveKnownCodexProfile(profileId?: string | null) {
    if (!profileId) {
        return null
    }

    const { profiles } = await readMachineSessionProfiles()
    const profile = profiles.find((item) => item.id === profileId)
    if (!profile) {
        throw new Error('Profile not found')
    }
    return profile
}

export function resolveSpawnPermissionMode(args: Pick<SpawnSessionOptions, 'permissionMode' | 'yolo'>): PermissionMode {
    if (args.permissionMode) {
        return args.permissionMode
    }
    return args.yolo === true ? 'yolo' : 'default'
}

export async function assertKnownSpawnProfile(
    agent: SpawnSessionOptions['agent'],
    profileId?: string | null
): Promise<void> {
    if (agent !== 'codex' || !profileId) {
        return
    }

    await resolveKnownCodexProfile(profileId)
}

export async function buildSpawnProfileEnv(
    agent: SpawnSessionOptions['agent'],
    profileId?: string | null
): Promise<Record<string, string>> {
    if (agent !== 'codex' || !profileId) {
        return {}
    }

    const profile = await resolveKnownCodexProfile(profileId)
    return {
        HAPI_SESSION_PROFILE_ID: profileId,
        ...(profile?.defaults.configProfile
            ? { HAPI_CODEX_CONFIG_PROFILE: profile.defaults.configProfile }
            : {})
    }
}

export function buildCodexSpawnModeEnv(
    permissionMode: PermissionMode,
    collaborationMode?: CodexCollaborationMode
): Record<string, string> {
    return {
        ...(permissionMode === 'default' ? {} : { HAPI_CODEX_PERMISSION_MODE: permissionMode }),
        ...(collaborationMode && collaborationMode !== 'default'
            ? { HAPI_CODEX_COLLABORATION_MODE: collaborationMode }
            : {})
    }
}
