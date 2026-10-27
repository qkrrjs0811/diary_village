import { BUZZ, buildTune, soundOn, type Note } from '../core/sound'
import type { KV } from '../core/storage'
import type { MoodId } from '../core/types'

/**
 * 소리와 떨림을 내는 곳. 소리 파일 없이 Web Audio 로 실로폰 소리를 만든다.
 * 소리를 못 내는 폰(AudioContext·vibrate 없음)에서는 조용히 넘어간다
 */
export function createSound(kv: KV) {
  let ctx: AudioContext | null = null

  /** 누른 순간(사용자 손길 안)에 열어 두어야 늦게 울려도 막히지 않는다 */
  function audio(): AudioContext | null {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      ctx ??= new Ctx()
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
      return ctx
    } catch {
      return null
    }
  }

  /** 맑은 나무 실로폰: 바탕음과 옅은 위 배음이 금방 사그라든다 */
  function ring(a: AudioContext, n: Note, start: number) {
    for (const [mul, part] of [
      [1, 1],
      [4, 0.12],
    ]) {
      const osc = a.createOscillator()
      const amp = a.createGain()
      osc.type = 'sine'
      osc.frequency.value = n.freq * mul
      const t = start + n.at
      amp.gain.setValueAtTime(0.0001, t)
      amp.gain.linearRampToValueAtTime(n.gain * part, t + 0.006)
      amp.gain.exponentialRampToValueAtTime(0.0001, t + n.dur)
      osc.connect(amp).connect(a.destination)
      osc.start(t)
      osc.stop(t + n.dur + 0.05)
    }
  }

  return {
    /** 집이 쑥 올라오는 순간(delay ms 뒤) 그날 기분의 가락을 울리고 짧게 떤다 */
    build(mood: MoodId, date: string, delay: number) {
      if (!soundOn(kv)) return
      const a = audio()
      if (a) {
        try {
          const start = a.currentTime + delay / 1000
          for (const n of buildTune(mood, date)) ring(a, n, start)
        } catch {
          // 소리를 못 내도 짓기는 그대로 한다
        }
      }
      window.setTimeout(() => {
        try {
          navigator.vibrate?.(BUZZ)
        } catch {
          // 떨림이 없는 폰
        }
      }, delay)
    },
  }
}
