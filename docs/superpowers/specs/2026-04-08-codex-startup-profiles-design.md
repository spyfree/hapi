# Codex Startup Profiles Design

Date: 2026-04-08
Status: approved-for-spec

## Summary

Add HAPI-owned startup profiles for new sessions. The first supported agent is Codex.

Profiles are structured presets, not raw upstream CLI fragments. A profile can prefill Codex startup defaults such as model, reasoning effort, permission mode, collaboration mode, and session type. Users can set a machine-local default profile and still override it from the Web new-session flow before launch.

The design keeps one source of truth for launch resolution: the Web form computes the final explicit spawn payload. The runner records the chosen `profileId` for traceability, but does not re-resolve profile defaults during spawn.

## Goals

- Support one-click Codex startup from reusable HAPI profiles.
- Support a machine-local default Codex profile.
- Support per-launch override in the Web new-session dialog.
- Keep profile config structured and validated.
- Preserve current runtime behavior for in-session config changes such as switching permission mode to `yolo`.

## Non-Goals

- No raw passthrough of arbitrary Codex CLI args such as `["-p", "ice"]`.
- No cloud-synced or account-level profiles in this iteration.
- No multi-agent profile support in the first implementation beyond a forward-compatible schema.
- No retroactive application of profile changes to already-running sessions.

## Current State

- New-session spawn already supports explicit fields such as `agent`, `model`, `modelReasoningEffort`, `yolo`, and `sessionType`.
- Codex remote sessions already support runtime `permissionMode` changes via `set-session-config`.
- CLI settings in `~/.hapi/settings.json` only store machine/runtime basics and have no profile concept.
- The Web new-session form has no preset abstraction; users re-enter the same Codex options repeatedly.

## Design Overview

Introduce HAPI session profiles as machine-local structured presets stored in CLI settings and surfaced to Web through machine-scoped APIs.

The initial implementation supports Codex-only profiles, but the top-level schema remains agent-aware so later agent support does not require a second migration.

The launch path is:

1. Web loads available profiles and the default profile for the selected machine.
2. Web preselects the machine-local default Codex profile when agent is Codex.
3. Selecting a profile prefills launch fields in the form.
4. User edits can override any prefilled field.
5. Web sends `profileId` plus the final resolved explicit launch fields.
6. Hub and runner only forward/store the `profileId`; launch behavior uses the explicit resolved fields already present in the payload.

This avoids split-brain behavior where the Web and runner both try to resolve profile defaults independently.

## Data Model

### Settings schema

Extend CLI settings with machine-local profile storage:

```ts
type SessionProfile = {
    id: string
    label: string
    agent: 'codex'
    defaults: {
        model?: string
        modelReasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
        permissionMode?: 'default' | 'read-only' | 'safe-yolo' | 'yolo'
        collaborationMode?: 'default' | 'plan'
        sessionType?: 'simple' | 'worktree'
    }
}

type Settings = {
    // existing fields...
    sessionProfiles?: SessionProfile[]
    defaultProfiles?: {
        codexProfileId?: string | null
    }
}
```

Rules:

- `id` is stable and unique per settings file.
- `label` is user-facing and editable.
- `agent` is required even though only `codex` is valid initially.
- `defaults` is sparse; omitted fields mean “leave current form/default behavior unchanged”.
- `yolo` is not stored as a separate boolean. Use `permissionMode: 'yolo'`.
- “No profile” is represented by `null` profile selection, not a synthetic built-in profile object.

### Session metadata

Spawned sessions should record the chosen profile in metadata for observability and debugging:

```ts
type SessionProfileMetadata = {
    profileId?: string | null
}
```

This metadata is descriptive only. It must not be re-read to mutate runtime config.

## Precedence Rules

Launch resolution precedence is:

1. Explicit profile selected in the new-session dialog.
2. Machine-local default profile for Codex.
3. Profile `defaults` values.
4. User edits made after profile application in the form.
5. Existing launch defaults when a field remains unset.

Operational interpretation:

- Choosing a profile applies profile defaults into the form state.
- After that point, the form owns the values.
- Spawn requests include `profileId` and explicit launch fields as finally shown in the form.
- The runner does not reinterpret or overwrite those explicit launch fields from settings.

## API and RPC Changes

### Machine-scoped settings APIs

Add machine-scoped routes for profile management. These are settings for the selected machine, not global hub state.

Recommended endpoints:

- `GET /api/machines/:id/session-profiles`
  - returns `{ profiles, defaults }`
- `PUT /api/machines/:id/session-profiles`
  - replaces `{ profiles, defaults }` with validated content

The hub forwards these requests to runner RPC handlers on the target machine. The runner reads/writes local `~/.hapi/settings.json`.

This keeps profile ownership local-first and aligned with how runner state and path existence are already machine-scoped.

### Spawn payload

Extend spawn body and RPC types with:

```ts
type SpawnInput = {
    profileId?: string | null
    permissionMode?: 'default' | 'read-only' | 'safe-yolo' | 'yolo'
}
```

Behavior:

- Optional for backward compatibility.
- Hub validates shape but does not require profile existence.
- Runner must reject a non-null unknown `profileId` with `Profile not found`.
- Launch uses the explicit fields in the same request; `profileId` is not used to recompute them.

## Web UX

### New Session dialog

When `agent === 'codex'`:

- Show a `Profile` selector above the detailed Codex options.
- First option is `No profile`.
- Remaining options come from the selected machine’s profile list.
- If a default Codex profile exists, preselect it when opening the dialog.
- Replace the current Codex-only `yolo` launch control with a full `permissionMode` control so profile defaults can represent `default`, `read-only`, `safe-yolo`, and `yolo` without loss.
- On profile selection, apply sparse defaults into the form:
  - `model`
  - `modelReasoningEffort`
  - `permissionMode`
  - `collaborationMode`
  - `sessionType`

Rules:

- User edits after profile selection override the applied defaults.
- Switching to `No profile` resets all profile-owned Codex launch fields to the dialog’s base Codex defaults:
  - `model = auto`
  - `modelReasoningEffort = default`
  - `permissionMode = default`
  - `collaborationMode = default`
  - `sessionType = simple`
- Non-Codex agents do not show the Codex profile selector.

### Profile management

Do not overload the new-session dialog with default-management controls.

Add a dedicated profile management surface later in the Web settings area:

- list profiles
- create profile
- edit profile
- delete profile
- choose default Codex profile

This keeps “launch now” separate from “edit saved presets”.

## Runner and CLI Behavior

### Settings persistence

CLI owns persistence in `~/.hapi/settings.json`.

Responsibilities:

- validate profile schema on read/write
- expose RPC handlers for get/update profile settings
- preserve unrelated settings fields
- clear invalid default references when a profile is deleted

### Spawn behavior

Runner launch continues to use explicit spawn fields:

- `model`
- `modelReasoningEffort`
- `permissionMode`
- `sessionType`
- `collaborationMode` where relevant

The runner stores `profileId` into session metadata but must not recompute explicit values from local settings during spawn. This avoids divergence when the user changes form fields after selecting a profile.

For backward compatibility, existing spawn callers that only send `yolo` should be translated into `permissionMode = 'yolo'` or `permissionMode = 'default'` at the boundary layer, but Codex profile-aware paths must use `permissionMode` as the source of truth.

## Runtime Behavior

Profiles affect startup defaults only.

They do not replace current runtime config controls:

- if a session starts in normal mode and later switches to `yolo`, the switch still applies for subsequent turns
- currently running turns are not retroactively reconfigured
- profile edits do not mutate active sessions

This preserves existing Codex remote semantics and keeps profile logic limited to session creation.

## Error Handling

Handle these cases explicitly:

- `profileId` not found when loading defaults in Web:
  - fall back to `No profile`
  - do not block dialog render
- stored default profile deleted:
  - clear `defaultProfiles.codexProfileId`
  - show no default selection
- invalid settings file profile content:
  - ignore invalid profile entries
  - log a warning
  - preserve the rest of settings
- unsupported agent/profile mismatch:
  - reject write or ignore at load depending on validation layer
- profile deleted between dialog load and spawn:
  - reject spawn with `Profile not found`
- old clients without `profileId`:
  - continue working with current spawn behavior

For the first implementation, prefer fail-soft reads and fail-fast writes.

## Testing

Add focused tests only:

- CLI settings read/write validation for `sessionProfiles` and `defaultProfiles`
- RPC handlers for get/update machine profile settings
- Web new-session profile selection applies expected field defaults
- Web user edits override profile-applied values in the final spawn payload
- Web `No profile` selection resets Codex launch fields to base defaults
- Spawn request propagation carries `profileId`
- Spawn request propagation carries explicit `permissionMode`
- Deleting a profile clears invalid default references
- Unknown `profileId` at spawn is rejected
- Backward compatibility: spawn without `profileId` still works

No broad end-to-end profile suite is required initially if unit and integration coverage captures the resolution rules.

## Implementation Notes

- Prefer shared schema/types for profile payloads instead of duplicating shape in CLI, hub, and Web.
- Keep indentation and style aligned with the repo’s TypeScript conventions.
- Keep the first implementation Codex-focused in UX, but avoid naming that blocks later `agent` expansion.
- The first implementation should extend the Codex new-session UI to expose full `permissionMode`. Lossy mapping from profiles into a boolean `yolo` toggle is not acceptable.

## Open Decisions Resolved

- Use HAPI-owned structured profiles, not raw upstream Codex args.
- Store profiles machine-locally in CLI settings.
- Support both machine-local default and per-launch Web override.
- Keep runner launch resolution explicit; no runner-side profile re-resolution.
