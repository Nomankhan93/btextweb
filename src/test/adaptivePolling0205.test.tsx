// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAdaptivePoll } from '../lib/useAdaptivePoll'
import { ApiFailure, withDeadline } from '../lib/requestRecovery'
const read=vi.fn(); const commit=vi.fn()
function Probe({paused=false}:{paused?:boolean}) {
 const poll=useAdaptivePoll('scope',paused,read,commit,()=>15000)
 return <><span>{poll.syncError}</span><output>{String(poll.fetching)}</output><button onClick={poll.refresh}>Refresh</button></>
}
async function settle(){await act(async()=>{})}
async function tick(ms:number){await act(async()=>{await vi.advanceTimersByTimeAsync(ms)})}
beforeEach(()=>{vi.useFakeTimers();vi.spyOn(Math,'random').mockReturnValue(1);read.mockReset().mockResolvedValue({});commit.mockReset();Object.defineProperty(navigator,'onLine',{configurable:true,value:true});Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'})})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers()})
it('backs off failures and focus/manual refresh cannot bypass cooldown; success resets backoff',async()=>{
 read.mockRejectedValue(new ApiFailure('busy','unavailable','read',503))
 render(<Probe/>);await settle();expect(read).toHaveBeenCalledTimes(1)
 fireEvent(window,new Event('focus'));fireEvent.click(screen.getByText('Refresh'));await settle();expect(read).toHaveBeenCalledTimes(1)
 await tick(5000);expect(read).toHaveBeenCalledTimes(2)
 await tick(5000);expect(read).toHaveBeenCalledTimes(2)
 read.mockResolvedValue({});await tick(5000);expect(commit).toHaveBeenCalledTimes(1)
 read.mockRejectedValue(new ApiFailure('busy','unavailable','read',503));await tick(15000);expect(read).toHaveBeenCalledTimes(4)
 await tick(5000);expect(read).toHaveBeenCalledTimes(5)
})
it('honors Retry-After across pause/resume',async()=>{
 read.mockRejectedValue(new ApiFailure('busy','rate_limit','read',429,null,60000))
 const view=render(<Probe/>);await settle();view.rerender(<Probe paused/>);view.rerender(<Probe/>);await settle()
 await tick(59999);expect(read).toHaveBeenCalledTimes(1);await tick(1);expect(read).toHaveBeenCalledTimes(2)
})
it('cancels hanging sibling when another member fails before starting the next batch',async()=>{
 const signals:AbortSignal[]=[]
 read.mockImplementation(signal=>Promise.all([withDeadline('sibling',s=>{signals.push(s);return new Promise(()=>{})},signal),Promise.reject(new ApiFailure('busy','unavailable','read',503))]))
 render(<Probe/>);await settle();expect(signals[0].aborted).toBe(true)
 await tick(5000);expect(signals).toHaveLength(2);expect(signals.every(s=>s.aborted)).toBe(true)
})
it('bounds a hung batch, cancels it and stops fetching',async()=>{
 let signal!:AbortSignal;read.mockImplementation(s=>{signal=s;return new Promise(()=>{})})
 render(<Probe/>);await settle();await tick(15000);expect(signal.aborted).toBe(true);expect(screen.getByText('false')).toBeTruthy()
})
it('cancels obsolete requests on pause and unmount, ignoring late results',async()=>{
 let resolve!:(x:unknown)=>void;let signal!:AbortSignal
 read.mockImplementation(s=>{signal=s;return new Promise(r=>{resolve=r})})
 const view=render(<Probe/>);await settle();view.rerender(<Probe paused/>);expect(signal.aborted).toBe(true)
 await act(async()=>resolve({private:true}));expect(commit).not.toHaveBeenCalled();view.unmount()
})
it('stops automatic retries for permission failures and allows explicit retry',async()=>{
 read.mockRejectedValue(new ApiFailure('No permission','permission','read',403))
 render(<Probe/>);await settle();await tick(60000);fireEvent(window,new Event('focus'));await settle();expect(read).toHaveBeenCalledTimes(1)
 fireEvent.click(screen.getByText('Refresh'));await settle();expect(read).toHaveBeenCalledTimes(2)
})
it('suspends offline and resumes online without discarding data',async()=>{
 render(<Probe/>);await settle();Object.defineProperty(navigator,'onLine',{value:false});fireEvent(window,new Event('offline'));await tick(30000);expect(read).toHaveBeenCalledTimes(1)
 Object.defineProperty(navigator,'onLine',{value:true});fireEvent(window,new Event('online'));await settle();expect(read).toHaveBeenCalledTimes(2)
})
