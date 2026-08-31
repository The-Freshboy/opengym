import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./useStore.js', () => ({ useStore: { getState: () => ({ user: null, S: { sound: false, haptics: false } }) } }))
vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), vibrate: vi.fn() }))
import { useUI } from './useUI.js'

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('document', { addEventListener: vi.fn(), removeEventListener: vi.fn() }); useUI.getState().stopRest() })
afterEach(() => { useUI.getState().stopRest(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })
describe('rest controls', () => {
  it('pauses, extends and resumes without counting paused time', () => {
    const ui = useUI.getState()
    ui.startRest(90); vi.advanceTimersByTime(10000); ui.pauseRest()
    expect(useUI.getState().timer.left).toBe(80)
    vi.advanceTimersByTime(60000); expect(useUI.getState().timer.left).toBe(80)
    ui.addRest(30); expect(useUI.getState().timer.left).toBe(110)
    ui.resumeRest(); vi.advanceTimersByTime(10000); expect(useUI.getState().timer.left).toBe(100)
    ui.stopRest(); expect(useUI.getState().timer).toBeNull()
  })
  it('does not start zero or invalid rest durations', () => {
    for (const sec of [0, -5, NaN]) { useUI.getState().startRest(sec); expect(useUI.getState().timer).toBeNull() }
  })
  it('ends rather than keeping a negative duration', () => {
    useUI.getState().startRest(10); useUI.getState().addRest(-15)
    expect(useUI.getState().timer).toBeNull()
  })
})
