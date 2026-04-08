# Codex Startup Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add machine-local Codex startup profiles with a default profile, Web launch override, structured `permissionMode`, and spawn-time `profileId` tracking without runner-side re-resolution.

**Architecture:** Define one shared profile contract in `@hapi/protocol`, persist machine-local profile settings in CLI `~/.hapi/settings.json`, expose them through machine-scoped RPC + hub routes, and make the Web UI resolve profile defaults into explicit spawn fields before session creation. Keep active-session mode changes separate from profile behavior by limiting profiles to launch-time defaults and recording only `profileId` in session metadata.

**Tech Stack:** TypeScript, Bun workspaces, Zod, Hono, Socket.IO RPC, React, TanStack Query, Vitest, Bun test

---

## File Structure

### Shared contract

- Create: `shared/src/sessionProfiles.ts`
- Modify: `shared/src/index.ts`
- Modify: `shared/src/types.ts`
- Modify: `shared/src/schemas.ts`

Responsibilities:

- Define `SessionProfile`, profile defaults, machine profile settings payload, and spawn payload additions.
- Export profile schema/types once for CLI, hub, and Web reuse.
- Extend `MetadataSchema` with `profileId`.

### CLI and runner

- Modify: `cli/src/persistence.ts`
- Create: `cli/src/persistence.test.ts`
- Create: `cli/src/modules/common/handlers/sessionProfiles.ts`
- Create: `cli/src/modules/common/handlers/sessionProfiles.test.ts`
- Modify: `cli/src/modules/common/registerCommonHandlers.ts`
- Modify: `cli/src/modules/common/rpcTypes.ts`
- Modify: `cli/src/api/apiMachine.ts`
- Modify: `cli/src/runner/run.ts`
- Modify: `cli/src/agent/sessionFactory.ts`
- Create: `cli/src/runner/sessionProfiles.test.ts`

Responsibilities:

- Persist profile lists and default profile id in settings.
- Register machine-scoped RPC for reading/writing profiles.
- Add `profileId` and `permissionMode` to runner spawn options.
- Reject unknown `profileId` at spawn.
- Record `profileId` in session metadata.

### Hub

- Modify: `hub/src/web/routes/machines.ts`
- Create: `hub/src/web/routes/machines.test.ts`
- Modify: `hub/src/sync/rpcGateway.ts`
- Modify: `hub/src/sync/syncEngine.ts`

Responsibilities:

- Add machine-scoped REST endpoints for profile settings.
- Pass profile payloads to machine RPC.
- Extend spawn contract with `profileId` and `permissionMode`.

### Web data layer

- Modify: `web/src/types/api.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/lib/query-keys.ts`
- Create: `web/src/hooks/queries/useMachineSessionProfiles.ts`
- Create: `web/src/hooks/mutations/useUpdateMachineSessionProfiles.ts`

Responsibilities:

- Add typed API surface for profile settings.
- Cache per-machine profile data.
- Expose update mutation for settings page and invalidate relevant queries.

### Web new-session flow

- Modify: `web/src/components/NewSession/index.tsx`
- Modify: `web/src/components/NewSession/types.ts`
- Create: `web/src/components/NewSession/ProfileSelector.tsx`
- Create: `web/src/components/NewSession/PermissionModeSelector.tsx`
- Create: `web/src/components/NewSession/codexProfileState.ts`
- Create: `web/src/components/NewSession/codexProfileState.test.ts`
- Modify: `web/src/hooks/mutations/useSpawnSession.ts`
- Create: `web/src/components/NewSession/index.test.tsx`

Responsibilities:

- Replace launch-time Codex `yolo` toggle with full `permissionMode`.
- Load machine-local profiles for selected machine.
- Apply default profile on dialog open.
- Resolve `No profile` back to base Codex defaults.
- Send `profileId` plus explicit resolved launch fields.

### Web settings UI

- Modify: `web/src/routes/settings/index.tsx`
- Modify: `web/src/routes/settings/index.test.tsx`
- Modify: `web/src/lib/locales/en.ts`
- Modify: `web/src/lib/locales/zh-CN.ts`

Responsibilities:

- Add Codex Profiles section inside Settings.
- Allow create/edit/delete profile and select default profile.
- Keep UI basic and machine-scoped.

## Task 1: Define the Shared Session Profile Contract

**Files:**
- Create: `shared/src/sessionProfiles.ts`
- Modify: `shared/src/index.ts`
- Modify: `shared/src/types.ts`
- Modify: `shared/src/schemas.ts`
- Test: `web/src/components/NewSession/types.test.ts`

- [ ] **Step 1: Add the new shared Zod schemas and exported types**

```ts
// shared/src/sessionProfiles.ts
import { z } from 'zod'
import { CodexCollaborationModeSchema, PermissionModeSchema } from './schemas'

export const SessionProfileAgentSchema = z.literal('codex')

export const SessionProfileDefaultsSchema = z.object({
    model: z.string().optional(),
    modelReasoningEffort: z.enum(['minimal', 'low', 'medium', 'high', 'xhigh']).optional(),
    permissionMode: PermissionModeSchema.optional(),
    collaborationMode: CodexCollaborationModeSchema.optional(),
    sessionType: z.enum(['simple', 'worktree']).optional()
})

export const SessionProfileSchema = z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    agent: SessionProfileAgentSchema,
    defaults: SessionProfileDefaultsSchema
})

export const MachineSessionProfilesSchema = z.object({
    profiles: z.array(SessionProfileSchema),
    defaults: z.object({
        codexProfileId: z.string().nullable().optional()
    })
})

export type SessionProfile = z.infer<typeof SessionProfileSchema>
export type MachineSessionProfiles = z.infer<typeof MachineSessionProfilesSchema>
```

- [ ] **Step 2: Extend metadata schema for `profileId` and export the new module**

```ts
// shared/src/schemas.ts
export const MetadataSchema = z.object({
    path: z.string(),
    // ...
    flavor: z.string().nullish(),
    profileId: z.string().nullable().optional(),
    worktree: WorktreeMetadataSchema.optional()
})
```

```ts
// shared/src/index.ts
export * from './sessionProfiles'
```

```ts
// shared/src/types.ts
export type { MachineSessionProfiles, SessionProfile } from './sessionProfiles'
```

- [ ] **Step 3: Tighten any existing type tests that cover Codex launch inputs**

```ts
// web/src/components/NewSession/types.test.ts
import { expect, test } from 'vitest'
import type { CodexReasoningEffort } from './types'

test('Codex reasoning effort type continues to cover shared profile values', () => {
    const value: CodexReasoningEffort = 'high'
    expect(value).toBe('high')
})
```

- [ ] **Step 4: Run focused checks**

Run: `cd web && bun run test -- src/components/NewSession/types.test.ts`
Expected: PASS

Run: `bun run typecheck`
Expected: PASS for `shared`, `web`, `hub`, and `cli`

- [ ] **Step 5: Commit**

```bash
git add shared/src/sessionProfiles.ts shared/src/index.ts shared/src/types.ts shared/src/schemas.ts web/src/components/NewSession/types.test.ts
git commit -m "feat(shared): add session profile schema"
```

## Task 2: Persist Machine-Local Profiles in CLI and Expose RPC Handlers

**Files:**
- Modify: `cli/src/persistence.ts`
- Create: `cli/src/persistence.test.ts`
- Create: `cli/src/modules/common/handlers/sessionProfiles.ts`
- Create: `cli/src/modules/common/handlers/sessionProfiles.test.ts`
- Modify: `cli/src/modules/common/registerCommonHandlers.ts`

- [ ] **Step 1: Add validated settings read/write helpers for session profiles**

```ts
// cli/src/persistence.ts
import { MachineSessionProfilesSchema, type MachineSessionProfiles } from '@hapi/protocol'

export async function readMachineSessionProfiles(): Promise<MachineSessionProfiles> {
    const settings = await readSettings()
    const parsed = MachineSessionProfilesSchema.safeParse({
        profiles: settings.sessionProfiles ?? [],
        defaults: settings.defaultProfiles ?? {}
    })

    if (!parsed.success) {
        return { profiles: [], defaults: { codexProfileId: null } }
    }

    const validIds = new Set(parsed.data.profiles.map((profile) => profile.id))
    const codexProfileId = parsed.data.defaults.codexProfileId
    return {
        profiles: parsed.data.profiles,
        defaults: {
            codexProfileId: codexProfileId && validIds.has(codexProfileId) ? codexProfileId : null
        }
    }
}

export async function writeMachineSessionProfiles(payload: MachineSessionProfiles): Promise<MachineSessionProfiles> {
    const parsed = MachineSessionProfilesSchema.parse(payload)
    await updateSettings((current) => ({
        ...current,
        sessionProfiles: parsed.profiles,
        defaultProfiles: parsed.defaults
    }))
    return parsed
}
```

- [ ] **Step 2: Write the failing CLI persistence tests first**

```ts
// cli/src/persistence.test.ts
import { beforeEach, expect, it } from 'vitest'
import { readMachineSessionProfiles, writeMachineSessionProfiles } from './persistence'

it('clears a stale default profile id when the profile is missing', async () => {
    await writeMachineSessionProfiles({
        profiles: [],
        defaults: { codexProfileId: 'ice' }
    })

    await expect(readMachineSessionProfiles()).resolves.toEqual({
        profiles: [],
        defaults: { codexProfileId: null }
    })
})
```

- [ ] **Step 3: Register machine RPC handlers for get/update profile settings**

```ts
// cli/src/modules/common/handlers/sessionProfiles.ts
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { readMachineSessionProfiles, writeMachineSessionProfiles } from '@/persistence'
import { MachineSessionProfilesSchema } from '@hapi/protocol'

export function registerSessionProfileHandlers(rpcHandlerManager: RpcHandlerManager): void {
    rpcHandlerManager.registerHandler('session-profiles:get', async () => {
        return await readMachineSessionProfiles()
    })

    rpcHandlerManager.registerHandler('session-profiles:update', async (params: unknown) => {
        return await writeMachineSessionProfiles(MachineSessionProfilesSchema.parse(params))
    })
}
```

```ts
// cli/src/modules/common/registerCommonHandlers.ts
import { registerSessionProfileHandlers } from './handlers/sessionProfiles'

registerSessionProfileHandlers(rpcHandlerManager)
```

- [ ] **Step 4: Add RPC handler tests**

```ts
// cli/src/modules/common/handlers/sessionProfiles.test.ts
it('returns validated profile settings from the RPC handler', async () => {
    const manager = new RpcHandlerManager({ scopePrefix: 'test', logger: () => {} })
    registerSessionProfileHandlers(manager)
    const response = await invoke(manager, 'session-profiles:get', {})
    expect(response).toEqual({ profiles: [], defaults: { codexProfileId: null } })
})
```

- [ ] **Step 5: Run focused CLI tests**

Run: `cd cli && bun run test:win -- src/persistence.test.ts src/modules/common/handlers/sessionProfiles.test.ts`
Expected: PASS

Run: `cd cli && bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add cli/src/persistence.ts cli/src/persistence.test.ts cli/src/modules/common/registerCommonHandlers.ts cli/src/modules/common/handlers/sessionProfiles.ts cli/src/modules/common/handlers/sessionProfiles.test.ts
git commit -m "feat(cli): persist machine session profiles"
```

## Task 3: Extend Runner Spawn Options and Hub Machine APIs

**Files:**
- Modify: `cli/src/modules/common/rpcTypes.ts`
- Modify: `cli/src/api/apiMachine.ts`
- Modify: `cli/src/runner/run.ts`
- Modify: `cli/src/agent/sessionFactory.ts`
- Create: `cli/src/runner/sessionProfiles.test.ts`
- Modify: `hub/src/web/routes/machines.ts`
- Create: `hub/src/web/routes/machines.test.ts`
- Modify: `hub/src/sync/rpcGateway.ts`
- Modify: `hub/src/sync/syncEngine.ts`

- [ ] **Step 1: Add `profileId` and `permissionMode` to spawn contracts**

```ts
// cli/src/modules/common/rpcTypes.ts
export interface SpawnSessionOptions {
    // ...
    profileId?: string | null
    permissionMode?: 'default' | 'read-only' | 'safe-yolo' | 'yolo'
}
```

```ts
// hub/src/sync/rpcGateway.ts
async spawnSession(
    machineId: string,
    directory: string,
    agent: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode' = 'claude',
    model?: string,
    modelReasoningEffort?: string,
    permissionMode?: PermissionMode,
    sessionType?: 'simple' | 'worktree',
    worktreeName?: string,
    resumeSessionId?: string,
    effort?: string,
    profileId?: string | null
)
```

- [ ] **Step 2: Reject unknown `profileId` in the runner before spawning and translate legacy `yolo`**

```ts
// cli/src/runner/run.ts
const permissionMode = options.permissionMode
    ?? (options.yolo === true ? 'yolo' : 'default')

if (agent === 'codex' && options.profileId) {
    const { profiles } = await readMachineSessionProfiles()
    if (!profiles.some((profile) => profile.id === options.profileId)) {
        return { type: 'error', errorMessage: 'Profile not found' }
    }
}
```

- [ ] **Step 3: Record `profileId` in startup metadata**

```ts
// cli/src/agent/sessionFactory.ts
const metadata = buildSessionMetadata({
    flavor: options.flavor,
    startedBy,
    workingDirectory,
    machineId,
    metadataOverrides: {
        ...options.metadataOverrides,
        profileId: options.metadataOverrides?.profileId ?? null
    }
})
```

- [ ] **Step 4: Add machine REST endpoints for profile settings and spawn payload changes**

```ts
// hub/src/web/routes/machines.ts
const machineSessionProfilesSchema = MachineSessionProfilesSchema

app.get('/machines/:id/session-profiles', async (c) => {
    const result = await engine.getMachineSessionProfiles(machineId)
    return c.json(result)
})

app.put('/machines/:id/session-profiles', async (c) => {
    const parsed = machineSessionProfilesSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
    const result = await engine.updateMachineSessionProfiles(machineId, parsed.data)
    return c.json(result)
})
```

- [ ] **Step 5: Add hub and runner tests for unknown profile rejection and endpoint passthrough**

```ts
// cli/src/runner/sessionProfiles.test.ts
it('returns Profile not found when codex spawn references an unknown profile id', async () => {
    const result = await spawnSession({
        directory: '/tmp/project',
        agent: 'codex',
        profileId: 'missing',
        permissionMode: 'default'
    })
    expect(result).toEqual({ type: 'error', errorMessage: 'Profile not found' })
})
```

```ts
// hub/src/web/routes/machines.test.ts
it('forwards machine session profile updates through sync engine', async () => {
    const res = await app.request('/api/machines/m1/session-profiles', {
        method: 'PUT',
        body: JSON.stringify({ profiles: [], defaults: { codexProfileId: null } })
    })
    expect(res.status).toBe(200)
})
```

- [ ] **Step 6: Run focused backend tests**

Run: `cd cli && bun run test:win -- src/runner/sessionProfiles.test.ts`
Expected: PASS

Run: `cd hub && bun test src/web/routes/machines.test.ts`
Expected: PASS

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add cli/src/modules/common/rpcTypes.ts cli/src/api/apiMachine.ts cli/src/runner/run.ts cli/src/agent/sessionFactory.ts cli/src/runner/sessionProfiles.test.ts hub/src/web/routes/machines.ts hub/src/web/routes/machines.test.ts hub/src/sync/rpcGateway.ts hub/src/sync/syncEngine.ts
git commit -m "feat(hub): add machine session profile APIs"
```

## Task 4: Add Web API Hooks and Pure Profile Resolution Logic

**Files:**
- Modify: `web/src/types/api.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/lib/query-keys.ts`
- Create: `web/src/hooks/queries/useMachineSessionProfiles.ts`
- Create: `web/src/hooks/mutations/useUpdateMachineSessionProfiles.ts`
- Create: `web/src/components/NewSession/codexProfileState.ts`
- Create: `web/src/components/NewSession/codexProfileState.test.ts`

- [ ] **Step 1: Add typed machine profile API methods and query keys**

```ts
// web/src/lib/query-keys.ts
machineSessionProfiles: (machineId: string) => ['machine-session-profiles', machineId] as const,
```

```ts
// web/src/api/client.ts
async getMachineSessionProfiles(machineId: string): Promise<MachineSessionProfiles> {
    return await this.request(`/api/machines/${encodeURIComponent(machineId)}/session-profiles`)
}

async updateMachineSessionProfiles(machineId: string, payload: MachineSessionProfiles): Promise<MachineSessionProfiles> {
    return await this.request(`/api/machines/${encodeURIComponent(machineId)}/session-profiles`, {
        method: 'PUT',
        body: JSON.stringify(payload)
    })
}
```

- [ ] **Step 2: Add query and mutation hooks**

```ts
// web/src/hooks/queries/useMachineSessionProfiles.ts
export function useMachineSessionProfiles(api: ApiClient | null, machineId: string | null) {
    const query = useQuery({
        queryKey: machineId ? queryKeys.machineSessionProfiles(machineId) : ['machine-session-profiles', 'none'],
        enabled: Boolean(api && machineId),
        queryFn: async () => await api!.getMachineSessionProfiles(machineId!)
    })

    return {
        profiles: query.data?.profiles ?? [],
        defaults: query.data?.defaults ?? { codexProfileId: null },
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : null
    }
}
```

- [ ] **Step 3: Implement pure Codex profile application helpers before wiring UI**

```ts
// web/src/components/NewSession/codexProfileState.ts
export function getBaseCodexLaunchState() {
    return {
        model: 'auto',
        modelReasoningEffort: 'default',
        permissionMode: 'default',
        collaborationMode: 'default',
        sessionType: 'simple'
    } as const
}

export function applyCodexProfile(base: CodexLaunchState, profile: SessionProfile | null): CodexLaunchState {
    if (!profile) return { ...base }
    return {
        model: profile.defaults.model ?? base.model,
        modelReasoningEffort: profile.defaults.modelReasoningEffort ?? base.modelReasoningEffort,
        permissionMode: profile.defaults.permissionMode ?? base.permissionMode,
        collaborationMode: profile.defaults.collaborationMode ?? base.collaborationMode,
        sessionType: profile.defaults.sessionType ?? base.sessionType
    }
}
```

- [ ] **Step 4: Write the failing pure logic tests**

```ts
// web/src/components/NewSession/codexProfileState.test.ts
it('resets to base defaults when No profile is selected', () => {
    const base = getBaseCodexLaunchState()
    expect(applyCodexProfile(base, null)).toEqual(base)
})

it('applies sparse profile defaults without inventing values', () => {
    const result = applyCodexProfile(getBaseCodexLaunchState(), {
        id: 'ice',
        label: 'Ice',
        agent: 'codex',
        defaults: { permissionMode: 'safe-yolo', sessionType: 'worktree' }
    })

    expect(result.permissionMode).toBe('safe-yolo')
    expect(result.sessionType).toBe('worktree')
    expect(result.model).toBe('auto')
})
```

- [ ] **Step 5: Run focused web tests**

Run: `cd web && bun run test -- src/components/NewSession/codexProfileState.test.ts`
Expected: PASS

Run: `cd web && bun run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src/types/api.ts web/src/api/client.ts web/src/lib/query-keys.ts web/src/hooks/queries/useMachineSessionProfiles.ts web/src/hooks/mutations/useUpdateMachineSessionProfiles.ts web/src/components/NewSession/codexProfileState.ts web/src/components/NewSession/codexProfileState.test.ts
git commit -m "feat(web): add machine session profile data hooks"
```

## Task 5: Replace Launch-Time Codex YOLO Toggle with Full Permission Mode and Profile Selection

**Files:**
- Modify: `web/src/components/NewSession/index.tsx`
- Modify: `web/src/components/NewSession/types.ts`
- Create: `web/src/components/NewSession/ProfileSelector.tsx`
- Create: `web/src/components/NewSession/PermissionModeSelector.tsx`
- Modify: `web/src/hooks/mutations/useSpawnSession.ts`
- Create: `web/src/components/NewSession/index.test.tsx`
- Modify: `web/src/lib/locales/en.ts`
- Modify: `web/src/lib/locales/zh-CN.ts`

- [ ] **Step 1: Add explicit Codex permission mode and profile selector components**

```tsx
// web/src/components/NewSession/PermissionModeSelector.tsx
const CODEX_PERMISSION_MODE_OPTIONS = [
    { value: 'default', label: t('newSession.permissionMode.default') },
    { value: 'read-only', label: t('newSession.permissionMode.readOnly') },
    { value: 'safe-yolo', label: t('newSession.permissionMode.safeYolo') },
    { value: 'yolo', label: t('newSession.permissionMode.yolo') },
]
```

```tsx
// web/src/components/NewSession/ProfileSelector.tsx
<select value={profileId ?? ''} onChange={(e) => onChange(e.target.value || null)}>
    <option value="">{t('newSession.profile.none')}</option>
    {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}
</select>
```

- [ ] **Step 2: Refactor `NewSession` state to use `permissionMode` instead of launch-time `yoloMode` for Codex**

```ts
// web/src/components/NewSession/index.tsx
const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
const [profileId, setProfileId] = useState<string | null>(null)

const resolvedPermissionMode = agent === 'codex'
    ? permissionMode
    : (yoloMode ? 'yolo' : 'default')
```

- [ ] **Step 3: Apply machine default profile and resolve explicit spawn payload**

```ts
// web/src/components/NewSession/index.tsx
useEffect(() => {
    if (agent !== 'codex') return
    const defaultProfile = profiles.find((profile) => profile.id === defaults.codexProfileId) ?? null
    setProfileId(defaultProfile?.id ?? null)
    const next = applyCodexProfile(getBaseCodexLaunchState(), defaultProfile)
    setModel(next.model)
    setModelReasoningEffort(next.modelReasoningEffort)
    setPermissionMode(next.permissionMode)
    setSessionType(next.sessionType)
}, [agent, profiles, defaults.codexProfileId])
```

```ts
// web/src/hooks/mutations/useSpawnSession.ts
type SpawnInput = {
    machineId: string
    directory: string
    profileId?: string | null
    permissionMode?: string
    // ...
}
```

- [ ] **Step 4: Write the failing New Session tests before final wiring**

```tsx
// web/src/components/NewSession/index.test.tsx
it('preselects the machine default codex profile and applies its defaults', async () => {
    render(<NewSession ... />)
    expect(await screen.findByDisplayValue('Ice')).toBeInTheDocument()
    expect(screen.getByDisplayValue('GPT-5.4')).toBeInTheDocument()
})

it('resets Codex launch fields to base defaults when No profile is selected', async () => {
    await user.selectOptions(screen.getByLabelText(/profile/i), '')
    expect(screen.getByDisplayValue('Auto')).toBeInTheDocument()
})

it('sends explicit permissionMode and profileId in the spawn payload', async () => {
    await user.click(screen.getByRole('button', { name: /create/i }))
    expect(spawnSession).toHaveBeenCalledWith(expect.objectContaining({
        profileId: 'ice',
        permissionMode: 'safe-yolo'
    }))
})
```

- [ ] **Step 5: Add locale strings for profile and permission mode labels**

```ts
// web/src/lib/locales/en.ts
'newSession.profile': 'Profile',
'newSession.profile.none': 'No profile',
'newSession.permissionMode': 'Permission mode',
'newSession.permissionMode.safeYolo': 'Safe YOLO',
```

- [ ] **Step 6: Run focused web UI tests**

Run: `cd web && bun run test -- src/components/NewSession/codexProfileState.test.ts src/components/NewSession/index.test.tsx`
Expected: PASS

Run: `cd web && bun run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add web/src/components/NewSession/index.tsx web/src/components/NewSession/types.ts web/src/components/NewSession/ProfileSelector.tsx web/src/components/NewSession/PermissionModeSelector.tsx web/src/hooks/mutations/useSpawnSession.ts web/src/components/NewSession/index.test.tsx web/src/lib/locales/en.ts web/src/lib/locales/zh-CN.ts
git commit -m "feat(web): add codex startup profile selection"
```

## Task 6: Add Settings UI for Managing Codex Profiles and Default Selection

**Files:**
- Modify: `web/src/routes/settings/index.tsx`
- Modify: `web/src/routes/settings/index.test.tsx`
- Modify: `web/src/hooks/queries/useMachines.ts`

- [ ] **Step 1: Add machine selector awareness to Settings page**

```tsx
// web/src/routes/settings/index.tsx
const { api } = useAppContext()
const { machines } = useMachines(api, true)
const [machineId, setMachineId] = useState<string | null>(machines[0]?.id ?? null)
const { profiles, defaults } = useMachineSessionProfiles(api, machineId)
const { updateMachineSessionProfiles, isPending } = useUpdateMachineSessionProfiles(api)
```

- [ ] **Step 2: Add a simple Codex Profiles section with create/edit/delete/default controls**

```tsx
// web/src/routes/settings/index.tsx
<div className="border-b border-[var(--app-divider)]">
    <div className="px-3 py-2 text-xs font-semibold text-[var(--app-hint)] uppercase tracking-wide">
        {t('settings.codexProfiles.title')}
    </div>
    {profiles.map((profile) => (
        <button key={profile.id} type="button" onClick={() => setEditingProfile(profile)}>
            {profile.label}
        </button>
    ))}
</div>
```

```ts
// update payload shape
await updateMachineSessionProfiles({
    machineId,
    payload: {
        profiles: nextProfiles,
        defaults: { codexProfileId: nextDefaultId }
    }
})
```

- [ ] **Step 3: Cover the settings flow with tests**

```tsx
// web/src/routes/settings/index.test.tsx
it('renders the Codex Profiles section', () => {
    renderWithProviders(<SettingsPage />)
    expect(screen.getByText('Codex Profiles')).toBeInTheDocument()
})

it('saves the selected default profile for the chosen machine', async () => {
    renderWithProviders(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: /set ice as default/i }))
    expect(updateMachineSessionProfiles).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({
            defaults: { codexProfileId: 'ice' }
        })
    }))
})
```

- [ ] **Step 4: Run settings page tests**

Run: `cd web && bun run test -- src/routes/settings/index.test.tsx`
Expected: PASS

Run: `cd web && bun run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/settings/index.tsx web/src/routes/settings/index.test.tsx web/src/hooks/queries/useMachines.ts
git commit -m "feat(web): add codex profile settings UI"
```

## Task 7: Final Integration Verification and Cleanup

**Files:**
- Modify: `web/src/api/client.ts`
- Modify: `hub/src/web/routes/machines.ts`
- Modify: `cli/src/api/apiMachine.ts`
- Modify: `cli/src/runner/run.ts`
- Modify: `cli/src/agent/sessionFactory.ts`
- Test: `cli/src/runner/sessionProfiles.test.ts`
- Test: `hub/src/web/routes/machines.test.ts`
- Test: `web/src/components/NewSession/index.test.tsx`
- Test: `web/src/routes/settings/index.test.tsx`

- [ ] **Step 1: Verify end-to-end payload names match across all layers**

```ts
// expected spawn body across layers
{
    directory,
    agent: 'codex',
    model,
    modelReasoningEffort,
    permissionMode,
    collaborationMode,
    sessionType,
    worktreeName,
    profileId
}
```

- [ ] **Step 2: Remove stale launch-time Codex `yolo` assumptions from Web-only paths**

```ts
// web/src/components/NewSession/index.tsx
const resolvedLegacyYolo = agent === 'codex'
    ? undefined
    : yoloMode
```

```ts
// web/src/api/client.ts
body: JSON.stringify({
    directory,
    agent,
    model,
    modelReasoningEffort,
    permissionMode,
    yolo,
    sessionType,
    worktreeName,
    effort,
    profileId
})
```

- [ ] **Step 3: Run the focused cross-package test set**

Run: `cd cli && bun run test:win -- src/persistence.test.ts src/modules/common/handlers/sessionProfiles.test.ts src/runner/sessionProfiles.test.ts`
Expected: PASS

Run: `cd hub && bun test src/web/routes/machines.test.ts`
Expected: PASS

Run: `cd web && bun run test -- src/components/NewSession/codexProfileState.test.ts src/components/NewSession/index.test.tsx src/routes/settings/index.test.tsx`
Expected: PASS

- [ ] **Step 4: Run package typechecks**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 5: Run full repo test suite if focused tests passed cleanly**

Run: `bun run test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add shared/src/sessionProfiles.ts shared/src/index.ts shared/src/types.ts shared/src/schemas.ts cli/src/persistence.ts cli/src/persistence.test.ts cli/src/modules/common/registerCommonHandlers.ts cli/src/modules/common/handlers/sessionProfiles.ts cli/src/modules/common/handlers/sessionProfiles.test.ts cli/src/modules/common/rpcTypes.ts cli/src/api/apiMachine.ts cli/src/runner/run.ts cli/src/agent/sessionFactory.ts cli/src/runner/sessionProfiles.test.ts hub/src/web/routes/machines.ts hub/src/web/routes/machines.test.ts hub/src/sync/rpcGateway.ts hub/src/sync/syncEngine.ts web/src/types/api.ts web/src/api/client.ts web/src/lib/query-keys.ts web/src/hooks/queries/useMachineSessionProfiles.ts web/src/hooks/mutations/useUpdateMachineSessionProfiles.ts web/src/components/NewSession/codexProfileState.ts web/src/components/NewSession/codexProfileState.test.ts web/src/components/NewSession/index.tsx web/src/components/NewSession/types.ts web/src/components/NewSession/ProfileSelector.tsx web/src/components/NewSession/PermissionModeSelector.tsx web/src/hooks/mutations/useSpawnSession.ts web/src/components/NewSession/index.test.tsx web/src/routes/settings/index.tsx web/src/routes/settings/index.test.tsx web/src/lib/locales/en.ts web/src/lib/locales/zh-CN.ts
git commit -m "feat: add codex startup profiles"
```

## Self-Review

### Spec coverage

- Shared structured profiles: Task 1
- Machine-local settings persistence: Task 2
- Machine-scoped get/update APIs: Task 3 and Task 4
- Spawn `profileId` + explicit launch fields: Task 3 and Task 5
- Full Codex `permissionMode` launch UI: Task 5
- `No profile` reset to base defaults: Task 4 and Task 5
- Settings page management surface: Task 6
- Unknown `profileId` rejection: Task 3
- Startup-only behavior, no runtime mutation: Task 3 and Task 7

### Placeholder scan

- No `TODO`, `TBD`, or “similar to above” references remain.
- Every code-touching task names exact files.
- Every testing task includes concrete commands.

### Type consistency

- Shared source of truth names: `SessionProfile`, `MachineSessionProfiles`, `profileId`, `permissionMode`
- Spawn fields use `permissionMode` as the Codex source of truth and only keep `yolo` for compatibility at the boundary layer
- Metadata field is `profileId` everywhere
