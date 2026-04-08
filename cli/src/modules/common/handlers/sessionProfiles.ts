import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { MachineSessionProfilesSchema } from '@hapi/protocol'
import { readMachineSessionProfiles, writeMachineSessionProfiles } from '@/persistence'

export function registerSessionProfileHandlers(rpcHandlerManager: RpcHandlerManager): void {
    rpcHandlerManager.registerHandler('session-profiles:get', async () => {
        return await readMachineSessionProfiles()
    })

    rpcHandlerManager.registerHandler('session-profiles:update', async (params: unknown) => {
        return await writeMachineSessionProfiles(MachineSessionProfilesSchema.parse(params))
    })
}
