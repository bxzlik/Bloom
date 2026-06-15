import { useEffect, useReducer, useRef, useState } from 'react'
import { usePlayerStore } from '@features/player'
import { toast } from '@shared/ui'
import { useGamesStore } from '../../model/gamesStore'
import {
  TAMA_MOODS,
  TAMA_ACHIEVEMENTS,
  TAMA_PHRASES,
  tamaState,
  loadTama,
  saveTama,
  resetTama,
  tamaMood,
  tamaAgeHours,
  checkTamaAchievements,
} from '../../model/tamaState'

/**
 * Игра «Тамагочи». Виртуальный питомец: сытость/счастье деградируют со временем,
 * музыка повышает счастье, доигравшие треки дают еду (фоновый хук в App, см.
 * [[tamaState]]). Действия: покормить/играть/купать/погладить.
 *
 * Состояние — общий синглтон `tamaState` (model/tamaState). Компонент мутирует
 * его в 1с-тике и в действиях, перерисовка — `force()`. Музыка определяется по
 * `usePlayerStore.playing`. CSS — main.css (.tama-char/.tama-bar-*).
 */

const SVG_FOOD = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>'
const SVG_SMILE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>'
const SVG_COIN = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'

// Иконки действий (path-содержимое для общего <svg>).
const SVG_ACT_FEED = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/></svg>'
const SVG_ACT_PLAY = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:4px"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="11" x2="15.01" y2="11"/><line x1="18" y1="13" x2="18.01" y2="13"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>'
const SVG_ACT_BATH = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'

// Иконки статистики (label = svg + текст).
const STAT_AGE = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
const STAT_SONGS = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
const STAT_FED = SVG_FOOD
const STAT_PETS = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'

const NOTE_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'

const randPhrase = (key: string) => {
  const arr = TAMA_PHRASES[key] || TAMA_PHRASES['happy']!
  return arr[Math.floor(Math.random() * arr.length)]!
}

interface Speech {
  text: string
  opacity: number
}

export const TamagotchiGame = () => {
  const playing = usePlayerStore((s) => s.playing)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const charRef = useRef<HTMLDivElement>(null)
  const [speech, setSpeech] = useState<Speech | null>(null)
  const speechTo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const setControls = useGamesStore((st) => st.setControls)

  // Тик деградации/счастья (1с) + загрузка на маунте. tamaInitUI.
  useEffect(() => {
    loadTama()
    force()
    const tick = setInterval(() => {
      const s = tamaState
      if (!s) return
      const isPlaying = usePlayerStore.getState().playing
      s.happiness = isPlaying ? Math.min(100, s.happiness + 0.08) : Math.max(0, s.happiness - 0.004)
      s.hunger = Math.max(0, s.hunger - 0.003)
      saveTama()
      checkTamaAchievements()
      force()
    }, 1000)
    return () => {
      clearInterval(tick)
      saveTama()
    }
  }, [])

  const showSpeech = (text: string) => {
    setSpeech({ text, opacity: 0 })
    setTimeout(() => setSpeech({ text, opacity: 1 }), 150)
    clearTimeout(speechTo.current)
    speechTo.current = setTimeout(() => setSpeech(null), 3200)
  }

  const feed = () => {
    const s = tamaState
    if (!s || (s.food || 0) < 1) return
    s.food = (s.food || 0) - 1
    s.hunger = Math.min(100, s.hunger + 30)
    s.totalFed = (s.totalFed || 0) + 1
    saveTama()
    checkTamaAchievements()
    force()
    showSpeech(randPhrase('happy'))
  }
  const play = () => {
    const s = tamaState
    if (!s || (s.food || 0) < 3) return
    s.food = (s.food || 0) - 3
    s.happiness = Math.min(100, s.happiness + 25)
    saveTama()
    force()
    showSpeech(randPhrase('dancing'))
  }
  const bath = () => {
    const s = tamaState
    if (!s || (s.food || 0) < 2) return
    s.food = (s.food || 0) - 2
    s.happiness = Math.min(100, s.happiness + 10)
    saveTama()
    force()
    showSpeech('Чистенький! ✨')
  }
  const pet = () => {
    const s = tamaState
    if (!s) return
    s.totalPets = (s.totalPets || 0) + 1
    s.happiness = Math.min(100, s.happiness + 5)
    saveTama()
    checkTamaAchievements()
    force()
    showSpeech(randPhrase('pet'))
    const el = charRef.current
    if (el) {
      el.style.transform = 'scale(1.25)'
      setTimeout(() => {
        if (charRef.current) charRef.current.style.transform = ''
      }, 300)
    }
  }
  const reset = () => {
    if (!confirm('Сбросить прогресс тамагочи? Питомец начнёт жизнь заново.')) return
    resetTama()
    force()
    toast('Питомец перерождён!')
  }

  // Контролы в шапке модалки (сброс + тумблер уведомлений, ключ 'tama').
  // Хук ДО раннего return (s может быть null до loadTama). reset стабилен.
  useEffect(() => {
    setControls({ notifGame: 'tama', onReset: reset })
    return () => setControls(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const s = tamaState
  if (!s) return null

  const mood = tamaMood(s, playing)
  const m = TAMA_MOODS[mood]
  const ageH = tamaAgeHours(s)
  const ageStr = ageH >= 24 ? (ageH / 24).toFixed(1) + ' дн.' : Math.round(ageH) + ' ч.'

  const bars = [
    { label: SVG_FOOD + 'Сытость', val: s.hunger, col: s.hunger < 25 ? '#e03030' : s.hunger < 50 ? '#f59e0b' : '#1db954' },
    { label: SVG_SMILE + 'Счастье', val: s.happiness, col: s.happiness < 25 ? '#e03030' : s.happiness < 50 ? '#f59e0b' : 'var(--accent)' },
  ]
  const acts = [
    { icon: SVG_ACT_FEED, label: 'Покормить', cost: 1, fn: feed },
    { icon: SVG_ACT_PLAY, label: 'Играть', cost: 3, fn: play },
    { icon: SVG_ACT_BATH, label: 'Купать', cost: 2, fn: bath },
  ]
  const statRows: [string, string | number][] = [
    [STAT_AGE + 'Возраст', ageStr],
    [STAT_SONGS + 'Треков вместе', s.songsListened || 0],
    [STAT_FED + 'Покормлено', s.totalFed || 0],
    [STAT_PETS + 'Поглажено', s.totalPets || 0],
  ]

  return (
    <div className="s-section active" id="ssec-tamagotchi">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>{' '}
          Тамагочи
        </div>
        <button className="s-section-reset" onClick={reset}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>{' '}
          Сбросить
        </button>
      </div>

      <div className="sc" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '20px 14px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div ref={charRef} className={'tama-char ' + m.css} onClick={pet} style={{ transition: 'transform .3s, filter .3s' }}>
            {m.char}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', minHeight: 16, textAlign: 'center', transition: 'opacity .3s', opacity: speech ? speech.opacity : 1 }}>
            {speech ? speech.text : m.label}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{s.name}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
          {bars.map((b, i) => (
            <div key={i} className="tama-bar-row">
              <div style={{ width: 72, color: 'var(--muted)' }} dangerouslySetInnerHTML={{ __html: b.label }} />
              <div className="tama-bar-bg">
                <div className="tama-bar-fill" style={{ width: Math.round(b.val) + '%', background: b.col }} />
              </div>
              <div style={{ width: 26, fontSize: 11, fontWeight: 700, textAlign: 'right' }}>{Math.round(b.val)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {acts.map((a) => {
            const ok = (s.food || 0) >= a.cost
            return (
              <button
                key={a.label}
                onClick={a.fn}
                style={{ padding: '6px 12px', borderRadius: 'calc(var(--radius)*.55)', fontSize: 11.5, fontWeight: 700, border: '1px solid ' + (ok ? 'rgba(var(--accent-rgb),.5)' : 'var(--border)'), background: ok ? 'rgba(var(--accent-rgb),.13)' : 'none', color: ok ? 'var(--accent)' : 'var(--muted)', cursor: ok ? 'pointer' : 'default', fontFamily: 'var(--font)', transition: '.15s' }}
              >
                <span dangerouslySetInnerHTML={{ __html: a.icon }} />
                {a.label}{' '}
                <span style={{ opacity: 0.65, fontWeight: 500 }}>
                  {a.cost}
                  <span dangerouslySetInnerHTML={{ __html: SVG_COIN }} />
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
          <span dangerouslySetInnerHTML={{ __html: NOTE_ICON }} />
          Еда: <span style={{ fontWeight: 700, color: 'var(--text)' }}>{s.food || 0}</span> — зарабатывай слушая музыку
        </div>
      </div>

      <div className="sc" style={{ marginTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text2)', marginBottom: 8 }}>Статистика</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {statRows.map(([label, val], i) => (
            <div key={i} style={{ padding: '8px 10px', borderRadius: 'calc(var(--radius)*.55)', background: 'rgba(var(--accent-rgb),.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--muted)', marginBottom: 4, fontSize: 10, fontWeight: 600 }} dangerouslySetInnerHTML={{ __html: label }} />
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.5px' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="sc" style={{ marginTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text2)', marginBottom: 8 }}>Достижения</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TAMA_ACHIEVEMENTS.map((a) => {
            const got = !!s.achievements[a.id]
            return (
              <div
                key={a.id}
                style={{ width: 36, height: 36, borderRadius: 'calc(var(--radius)*.55)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, background: got ? 'rgba(var(--accent-rgb),.12)' : 'rgba(255,255,255,.02)', opacity: got ? 1 : 0.22, cursor: 'default', transition: '.2s', color: got ? 'var(--accent)' : 'var(--muted)' }}
                dangerouslySetInnerHTML={{ __html: a.icon }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
