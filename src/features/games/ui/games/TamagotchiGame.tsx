import { useEffect, useReducer, useRef, useState } from 'react'
import { usePlayerStore } from '@features/player'
import { toast } from '@shared/ui'
import { useT } from '@shared/i18n'
import { GameTopBar } from '../GameTopBar'
import { PetMark } from '../PetMark'
import type { GameProps } from '../gameRegistry'
import {
  TAMA_MOODS,
  TAMA_ACHIEVEMENTS,
  tamaPhrases,
  tamaState,
  loadTama,
  saveTama,
  resetTama,
  tamaMood,
  tamaAgeHours,
  checkTamaAchievements,
  type TamaMoodKey,
} from '../../model/tamaState'
import './tamagotchi.css'

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
  const arr = tamaPhrases(key)
  return arr[Math.floor(Math.random() * arr.length)]!
}

interface Speech {
  text: string
  opacity: number
}

/** Визуал мордочки по настроению: распускается (bloom) / спит / форма рта. */
const PET_FACE: Record<TamaMoodKey, { bloom: boolean; sleepy: boolean; mouth: string }> = {
  dancing: { bloom: true, sleepy: false, mouth: 'M40 64 Q50 77 60 64' },
  happy: { bloom: true, sleepy: false, mouth: 'M42 65 Q50 73 58 65' },
  hungry: { bloom: false, sleepy: false, mouth: 'M44 67 Q50 61 56 67' },
  sad: { bloom: false, sleepy: false, mouth: 'M42 71 Q50 63 58 71' },
  sleepy: { bloom: false, sleepy: true, mouth: 'M45 67 H55' },
}

/**
 * Персонаж «Bloom-питомец» — росток-бутон на SVG. Распускается (открытые
 * лепестки + румянец) когда питомцу хорошо/играет музыка, и сворачивается в
 * закрытый бутон, когда грустно/голодно/спит. Класс `mood-<key>` подключает
 * анимацию из animations.css.
 */
const BloomPet = ({ mood }: { mood: TamaMoodKey }) => {
  const f = PET_FACE[mood]
  return (
    <svg className={'tama-pet mood-' + mood} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="tamaBody" cx="40%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#AED98C" />
          <stop offset="100%" stopColor="#7FB45F" />
        </radialGradient>
      </defs>
      {/* листики-ушки */}
      <path d="M50 37 C46 27 38 23 30 25 C32 34 40 39 50 37 Z" fill="#7FB45F" />
      <path d="M50 37 C54 27 62 23 70 25 C68 34 60 39 50 37 Z" fill="#8FC06F" />
      {/* бутон / распустившийся цветок */}
      {f.bloom ? (
        <g>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="50" cy="14" rx="6.5" ry="10" fill="#F4A9A0" transform={`rotate(${a} 50 26)`} />
          ))}
          <circle cx="50" cy="26" r="5" fill="#F6C34A" />
        </g>
      ) : (
        <path d="M50 13 C43 20 43 31 50 35 C57 31 57 20 50 13 Z" fill="#7FB45F" />
      )}
      {/* тело */}
      <ellipse cx="50" cy="64" rx="27" ry="25" fill="url(#tamaBody)" />
      {/* щёчки */}
      {f.bloom && (
        <>
          <circle cx="33" cy="67" r="5" fill="#F4A9A0" opacity="0.7" />
          <circle cx="67" cy="67" r="5" fill="#F4A9A0" opacity="0.7" />
        </>
      )}
      {/* глаза */}
      {f.sleepy ? (
        <>
          <path d="M35 59 Q40 63 45 59" stroke="#33402c" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M55 59 Q60 63 65 59" stroke="#33402c" strokeWidth="2.4" strokeLinecap="round" />
          <text x="72" y="42" fill="#8FC06F" fontSize="13" fontWeight="700">z</text>
        </>
      ) : (
        <>
          <circle cx="40" cy="58" r="3.6" fill="#33402c" />
          <circle cx="60" cy="58" r="3.6" fill="#33402c" />
          <circle cx="41.3" cy="56.7" r="1.2" fill="#fff" />
          <circle cx="61.3" cy="56.7" r="1.2" fill="#fff" />
        </>
      )}
      {/* рот */}
      <path d={f.mouth} stroke="#33402c" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

type TamaTab = 'pet' | 'achievements' | 'profile'

export const TamagotchiGame = ({ onBack, onClose }: GameProps) => {
  const t = useT()
  const playing = usePlayerStore((s) => s.playing)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const charRef = useRef<HTMLDivElement>(null)
  const [speech, setSpeech] = useState<Speech | null>(null)
  const speechTo = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [tab, setTab] = useState<TamaTab>('pet')

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
    showSpeech(t('games.tama.bathDone'))
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
    if (!confirm(t('games.tama.confirmReset'))) return
    resetTama()
    force()
    toast(t('games.tama.reborn'))
  }
  const onName = (v: string) => {
    const st = tamaState
    if (!st) return
    st.name = v
    saveTama()
    force()
  }

  const s = tamaState
  if (!s) return null

  const mood = tamaMood(s, playing)
  const m = TAMA_MOODS[mood]
  const ageH = tamaAgeHours(s)
  const ageStr = ageH >= 24
    ? t('games.tama.ageDays', { n: (ageH / 24).toFixed(1) })
    : t('games.tama.ageHours', { n: Math.round(ageH) })

  const bars = [
    { label: SVG_FOOD + t('games.tama.statHunger'), val: s.hunger, col: s.hunger < 25 ? '#c4564a' : s.hunger < 50 ? '#d99a3c' : '#7fb45f' },
    { label: SVG_SMILE + t('games.tama.statHappiness'), val: s.happiness, col: s.happiness < 25 ? '#c4564a' : s.happiness < 50 ? '#d99a3c' : '#6f9a52' },
  ]
  const acts = [
    { icon: SVG_ACT_FEED, label: t('games.tama.feed'), cost: 1, fn: feed },
    { icon: SVG_ACT_PLAY, label: t('games.tama.play'), cost: 3, fn: play },
    { icon: SVG_ACT_BATH, label: t('games.tama.bath'), cost: 2, fn: bath },
  ]
  const statRows: [string, string | number][] = [
    [STAT_AGE + t('games.tama.statAge'), ageStr],
    [STAT_SONGS + t('games.tama.statSongs'), s.songsListened || 0],
    [STAT_FED + t('games.tama.statFed'), s.totalFed || 0],
    [STAT_PETS + t('games.tama.statPets'), s.totalPets || 0],
  ]
  const achDone = TAMA_ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length

  const tabs: { id: TamaTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'pet',
      label: t('games.tama.tab.pet'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M12 21c4-2.2 7-5.5 7-10a7 7 0 0 0-14 0c0 4.5 3 7.8 7 10Z" /><path d="M12 11c-2.4-.8-4-2.4-4-4.8 2.4-.8 4 .8 4 4.8Z" /></svg>,
    },
    {
      id: 'achievements',
      label: t('games.tama.tab.achievements'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6" /><path d="M9 14.5 8 22l4-2.5L16 22l-1-7.5" /></svg>,
    },
    {
      id: 'profile',
      label: t('games.tama.tab.profile'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>,
    },
  ]

  return (
    <div className="game-root game-tama">
      <GameTopBar
        brand={t('games.tama.brand')}
        icon={<PetMark size={22} />}
        onBack={onBack}
        onClose={onClose}
        onReset={reset}
        notifGame="tama"
      />

      <div className="game-scroll">
        {/* ── Питомец ── */}
        {tab === 'pet' && (
          <div className="tama-stage">
            <div ref={charRef} onClick={pet} style={{ transition: 'transform .3s' }}>
              <BloomPet mood={mood} />
            </div>
            <div className="tama-speech" style={{ opacity: speech ? speech.opacity : 1 }}>
              {speech ? speech.text : t(m.labelKey)}
            </div>
            <div className="tama-name">{s.name}</div>

            <div className="tama-bars">
              {bars.map((b, i) => (
                <div key={i} className="tama-bar-row">
                  <div className="tama-bar-label" dangerouslySetInnerHTML={{ __html: b.label }} />
                  <div className="tama-bar-track">
                    <div className="tama-bar-fill" style={{ width: Math.round(b.val) + '%', background: b.col }} />
                  </div>
                  <div className="tama-bar-val">{Math.round(b.val)}</div>
                </div>
              ))}
            </div>

            <div className="tama-actions">
              {acts.map((a) => {
                const ok = (s.food || 0) >= a.cost
                return (
                  <button key={a.label} className="tama-act" data-ok={ok ? 'true' : 'false'} onClick={a.fn}>
                    <span dangerouslySetInnerHTML={{ __html: a.icon }} />
                    {a.label}
                    <span className="tama-act-cost">
                      {a.cost}
                      <span dangerouslySetInnerHTML={{ __html: NOTE_ICON }} />
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="tama-food">
              <span dangerouslySetInnerHTML={{ __html: NOTE_ICON }} />
              {t('games.tama.foodLabel')} <b>{s.food || 0}</b> {t('games.tama.foodHint')}
            </div>
          </div>
        )}

        {/* ── Достижения ── */}
        {tab === 'achievements' && (
          <div className="tama-tabwrap">
            <div className="tama-coll-head">
              {t('games.achievements')} <span className="tama-coll-count">{achDone}/{TAMA_ACHIEVEMENTS.length}</span>
            </div>
            <div className="tama-coll-list">
              {TAMA_ACHIEVEMENTS.map((a) => {
                const on = !!s.achievements[a.id]
                return (
                  <div key={a.id} className="tama-coll-item" data-on={on ? 'true' : 'false'}>
                    <div className="tama-medal" data-on={on ? 'true' : 'false'} dangerouslySetInnerHTML={{ __html: a.icon }} />
                    <div className="tama-coll-info">
                      <div className="tama-coll-name">{t(a.nameKey)}</div>
                      <div className="tama-coll-desc">{t(a.descKey)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Профиль ── */}
        {tab === 'profile' && (
          <div className="tama-tabwrap">
            <div className="tama-profile-card">
              <span className="tama-profile-pet">
                <BloomPet mood={mood} />
              </span>
              <div className="tama-profile-meta">
                <input
                  className="tama-name-input"
                  value={s.name}
                  onChange={(e) => onName(e.target.value)}
                  placeholder={t('games.tama.defaultName')}
                  maxLength={20}
                  spellCheck={false}
                />
                <div className="tama-profile-sub">{t(m.labelKey)} · {ageStr}</div>
              </div>
            </div>

            <div className="tama-section">
              <div className="tama-section-label">{t('games.stats')}</div>
              <div className="tama-stats">
                {statRows.map(([label, val], i) => (
                  <div key={i} className="tama-stat">
                    <div className="tama-stat-label" dangerouslySetInnerHTML={{ __html: label }} />
                    <div className="tama-stat-val">{val}</div>
                  </div>
                ))}
                <div className="tama-stat">
                  <div className="tama-stat-label">{t('games.achievements')}</div>
                  <div className="tama-stat-val">{achDone}/{TAMA_ACHIEVEMENTS.length}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Дека вкладок ── */}
      <div className="tama-deck">
        {tabs.map((tb) => (
          <button key={tb.id} className="tama-tab" data-active={tab === tb.id ? 'true' : 'false'} onClick={() => setTab(tb.id)}>
            <span className="tama-tab-icon">{tb.icon}</span>
            {tb.label}
          </button>
        ))}
      </div>
    </div>
  )
}
