import { useState } from 'react'
import { listGatewayDevices, listGatewayPairingSessions, type GatewayDeviceSummary, type GatewayPairingSession } from './gatewayDevices'
import { useAdaptivePoll } from './useAdaptivePoll'
export const GATEWAY_POLL_MS = 5000
export const GATEWAY_IDLE_POLL_MS = 15_000
/** Caller keys the page by workspace; mutations pause and cancel this reader. */
export function useGatewayLiveStatus(workspaceId: string, paused: boolean) {
  const [devices, setDevices] = useState<GatewayDeviceSummary[]>([])
  const [sessions, setSessions] = useState<GatewayPairingSession[]>([])
  const poll = useAdaptivePoll(workspaceId, paused, async signal => {
    const [nextDevices, nextSessions] = await Promise.all([
      listGatewayDevices(workspaceId, signal), listGatewayPairingSessions(workspaceId, signal),
    ])
    return { nextDevices, nextSessions }
  }, ({ nextDevices, nextSessions }) => { setDevices(nextDevices); setSessions(nextSessions) },
  ({ nextSessions }) => nextSessions.some(session => session.status === 'pending') ? GATEWAY_POLL_MS : GATEWAY_IDLE_POLL_MS)
  return { devices, sessions, loading: !poll.finished, ...poll }
}
