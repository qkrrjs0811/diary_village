import { BUZZ, CUE_BUZZ, buildTune, cueTune, growthTune, soundOn, type Cue, type Note } from '../core/sound'
import type { KV } from '../core/storage'
import type { MoodId } from '../core/types'

/**
 * 소리와 떨림을 내는 곳(앱의 모든 소리는 여기서만 낸다). 소리 파일 없이 Web Audio 로 실로폰 소리를 만든다.
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
  function ring(a: AudioContext, n: Note, start: number, out: AudioNode = a.destination) {
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
      osc.connect(amp).connect(out)
      osc.start(t)
      osc.stop(t + n.dur + 0.05)
    }
  }

  /** delay ms 뒤에 가락을 울리고 떤다. 소리를 꺼 두었으면 아무것도 하지 않는다 */
  function play(notes: Note[], buzz: number[], delay: number) {
    if (!soundOn(kv)) return
    const a = audio()
    if (a) {
      try {
        const start = a.currentTime + delay / 1000
        for (const n of notes) ring(a, n, start)
      } catch {
        // 소리를 못 내도 하던 일은 그대로 한다
      }
    }
    if (buzz.length === 0) return
    window.setTimeout(() => {
      try {
        navigator.vibrate?.(buzz)
      } catch {
        // 떨림이 없는 폰
      }
    }, delay)
  }

  return {
    /** 집이 쑥 올라오는 순간(delay ms 뒤) 그날 기분의 가락을 울리고 짧게 떤다 */
    build(mood: MoodId, date: string, delay: number) {
      play(buildTune(mood, date), BUZZ, delay)
    },
    /** 자라 온 길에서 집이 오를 때 한 음(마을이 자랄수록 높아진다). 떨지 않는다 */
    rise(index: number, total: number) {
      play(growthTune(index, total), [], 0)
    },
    /** 축하 카드·주민 대답·소품 놓기의 짧은 소리(delay ms 뒤). key: 주민 id */
    cue(cue: Cue, key = '', delay = 0) {
      play(cueTune(cue, key), CUE_BUZZ[cue], delay)
    },
    /** 소리를 켜 두었는지 */
    on: () => soundOn(kv),
    /**
     * 이 달의 노래를 곧바로 울린다. 떨지 않는다. 돌려준 함수를 부르면 남은 음을 멈춘다.
     * 소리를 꺼 두었으면 울리지 않고, 멈춤 함수는 아무것도 하지 않는다
     */
    song(notes: Note[]): () => void {
      if (!soundOn(kv)) return () => {}
      const a = audio()
      if (!a) return () => {}
      try {
        // 한 갈래로 모아 두어야 멈출 때 남은 음을 한꺼번에 끈다
        const out = a.createGain()
        out.connect(a.destination)
        const start = a.currentTime + 0.05
        for (const n of notes) ring(a, n, start, out)
        return () => {
          try {
            out.gain.setValueAtTime(0.0001, a.currentTime)
            out.disconnect?.()
          } catch {
            // 이미 끝난 소리
          }
        }
      } catch {
        return () => {}
      }
    },
  }
}
