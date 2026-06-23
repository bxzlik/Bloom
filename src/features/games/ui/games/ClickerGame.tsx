import { useEffect, useReducer, useRef, useState } from 'react'
import { gameToast } from '../../lib/gameToast'
import { GameTopBar } from '../GameTopBar'
import type { GameProps } from '../gameRegistry'
import { useT, type TranslationKey } from '@shared/i18n'
import './clicker.css'

/**
 * Игра «Кликер». Idle-кликер: клик даёт очки, улучшения дают пассивный доход,
 * престиж множит всё, случайные события, достижения.
 *
 * Состояние мутируется в `stateRef` (как глобальный `_clkState`),
 * перерисовка — через `force()` (useReducer-bump). Persist — localStorage
 * `bloom_clicker`. Тик авто-дохода (1с) и таймер событий живут в useEffect,
 * чистятся на размонтировании.
 *
 * Авто-доход за время отсутствия (улучшение vs): в тик не чистился
 * и капал, только пока окно открыто. Здесь тик чистится на unmount, а доход за
 * закрытый период начисляется одним досчётом при открытии (по `lastSeen`) — без
 * фонового таймера и работает даже после перезапуска приложения. События
 * (рандомные live-бусты) в досчёт не входят. Сессия (sessionClicks/Earned)
 * сбрасывается при открытии — с `clickerInitUI`.
 *
 * CSS — main.css (.clk-float + анимация clkFloat в animations.css).
 */

interface ClkState {
  coins: number
  counts: Record<string, number>
  prestigeCount: number
  totalClicks: number
  totalEarned: number
  sessionClicks: number
  sessionEarned: number
  bestPerSec: number
  achievements: Record<string, boolean>
  hadCrit?: boolean
  /** Имя лейбла/продюсера (вкладка «Профиль»). */
  labelName?: string
  /** Метка последнего «видели игру» (мс) — для досчёта дохода за время отсутствия. */
  lastSeen?: number
}

interface ClkUpgrade {
  id: string
  nameKey: TranslationKey
  descKey: TranslationKey
  basePrice: number
  priceGrow: number
  type: 'click' | 'crit' | 'auto' | 'multi'
  perClick?: number
  perSec?: number
}

interface ClkAchievement {
  id: string
  icon: string
  nameKey: TranslationKey
  descKey: TranslationKey
  check: (s: ClkState) => boolean
}

interface ClkEvent {
  mult: number
  until: number
  label: string
}

const LS_KEY = 'bloom_clicker'

const CLK_UPGRADES: ClkUpgrade[] = [
  // Клик
  { id: 'click_power', nameKey: 'games.clk.up.click_power.name', descKey: 'games.clk.up.click_power.desc', basePrice: 50, priceGrow: 2.2, type: 'click', perClick: 1 },
  { id: 'click_crit', nameKey: 'games.clk.up.click_crit.name', descKey: 'games.clk.up.click_crit.desc', basePrice: 500, priceGrow: 3.0, type: 'crit' },
  { id: 'click_multi', nameKey: 'games.clk.up.click_multi.name', descKey: 'games.clk.up.click_multi.desc', basePrice: 8000, priceGrow: 9.0, type: 'multi' },
  // Авто
  { id: 'auto1', nameKey: 'games.clk.up.auto1.name', descKey: 'games.clk.up.auto1.desc', basePrice: 10, priceGrow: 1.5, type: 'auto', perSec: 1 },
  { id: 'auto2', nameKey: 'games.clk.up.auto2.name', descKey: 'games.clk.up.auto2.desc', basePrice: 75, priceGrow: 1.5, type: 'auto', perSec: 5 },
  { id: 'auto3', nameKey: 'games.clk.up.auto3.name', descKey: 'games.clk.up.auto3.desc', basePrice: 300, priceGrow: 1.5, type: 'auto', perSec: 20 },
  { id: 'auto4', nameKey: 'games.clk.up.auto4.name', descKey: 'games.clk.up.auto4.desc', basePrice: 1500, priceGrow: 1.5, type: 'auto', perSec: 100 },
  { id: 'auto5', nameKey: 'games.clk.up.auto5.name', descKey: 'games.clk.up.auto5.desc', basePrice: 8000, priceGrow: 1.5, type: 'auto', perSec: 500 },
  { id: 'auto6', nameKey: 'games.clk.up.auto6.name', descKey: 'games.clk.up.auto6.desc', basePrice: 45000, priceGrow: 1.5, type: 'auto', perSec: 2000 },
  { id: 'auto7', nameKey: 'games.clk.up.auto7.name', descKey: 'games.clk.up.auto7.desc', basePrice: 250000, priceGrow: 1.5, type: 'auto', perSec: 10000 },
  { id: 'auto8', nameKey: 'games.clk.up.auto8.name', descKey: 'games.clk.up.auto8.desc', basePrice: 1500000, priceGrow: 1.5, type: 'auto', perSec: 50000 },
  { id: 'auto9', nameKey: 'games.clk.up.auto9.name', descKey: 'games.clk.up.auto9.desc', basePrice: 10000000, priceGrow: 1.5, type: 'auto', perSec: 200000 },
  { id: 'auto10', nameKey: 'games.clk.up.auto10.name', descKey: 'games.clk.up.auto10.desc', basePrice: 75000000, priceGrow: 1.5, type: 'auto', perSec: 1000000 },
  // Множители
  { id: 'multi1', nameKey: 'games.clk.up.multi1.name', descKey: 'games.clk.up.multi1.desc', basePrice: 5000, priceGrow: 8.0, type: 'multi' },
]

const CLK_ACHIEVEMENTS: ClkAchievement[] = [
  { id: 'first_click', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 9-7 1-4 7z"/></svg>', nameKey: 'games.clk.ach.first_click.name', descKey: 'games.clk.ach.first_click.desc', check: (s) => s.totalClicks >= 1 },
  { id: 'clicks_100', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="7"/><line x1="12" y1="2" x2="12" y2="10"/></svg>', nameKey: 'games.clk.ach.clicks_100.name', descKey: 'games.clk.ach.clicks_100.desc', check: (s) => s.totalClicks >= 100 },
  { id: 'clicks_1000', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>', nameKey: 'games.clk.ach.clicks_1000.name', descKey: 'games.clk.ach.clicks_1000.desc', check: (s) => s.totalClicks >= 1000 },
  { id: 'clicks_10k', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>', nameKey: 'games.clk.ach.clicks_10k.name', descKey: 'games.clk.ach.clicks_10k.desc', check: (s) => s.totalClicks >= 10000 },
  { id: 'coins_1k', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><path d="M15 9.5a3 3 0 00-3-1.5h-1a2 2 0 000 4h2a2 2 0 010 4h-1.5a3 3 0 01-3-1.5"/></svg>', nameKey: 'games.clk.ach.coins_1k.name', descKey: 'games.clk.ach.coins_1k.desc', check: (s) => s.totalEarned >= 1000 },
  { id: 'coins_1m', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>', nameKey: 'games.clk.ach.coins_1m.name', descKey: 'games.clk.ach.coins_1m.desc', check: (s) => s.totalEarned >= 1e6 },
  { id: 'coins_1b', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 21 12 17 16 21"/><line x1="12" y1="17" x2="12" y2="13"/><path d="M7 4H4a2 2 0 000 4c0 2.76 2.24 5 5 5h6c2.76 0 5-2.24 5-5a2 2 0 000-4h-3"/><line x1="7" y1="4" x2="17" y2="4"/></svg>', nameKey: 'games.clk.ach.coins_1b.name', descKey: 'games.clk.ach.coins_1b.desc', check: (s) => s.totalEarned >= 1e9 },
  { id: 'crit_hit', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>', nameKey: 'games.clk.ach.crit_hit.name', descKey: 'games.clk.ach.crit_hit.desc', check: (s) => !!s.hadCrit },
  { id: 'prestige1', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', nameKey: 'games.clk.ach.prestige1.name', descKey: 'games.clk.ach.prestige1.desc', check: (s) => s.prestigeCount >= 1 },
  { id: 'prestige5', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>', nameKey: 'games.clk.ach.prestige5.name', descKey: 'games.clk.ach.prestige5.desc', check: (s) => s.prestigeCount >= 5 },
  { id: 'best_ps_1k', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>', nameKey: 'games.clk.ach.best_ps_1k.name', descKey: 'games.clk.ach.best_ps_1k.desc', check: (s) => s.bestPerSec >= 1000 },
  { id: 'all_upgrades', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61h9.72a2 2 0 001.98-1.61L23 6H6"/></svg>', nameKey: 'games.clk.ach.all_upgrades.name', descKey: 'games.clk.ach.all_upgrades.desc', check: (s) => CLK_UPGRADES.every((u) => (s.counts[u.id] || 0) >= 1) },
]

// ── Чистые хелперы ────────────────────────────────────────────────
function loadState(): ClkState {
  let st: Partial<ClkState> | null = null
  try {
    st = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
  } catch {
    st = null
  }
  const s = (st || {}) as ClkState
  if (!s.coins) s.coins = 0
  if (!s.counts) s.counts = {}
  if (!s.prestigeCount) s.prestigeCount = 0
  if (!s.totalClicks) s.totalClicks = 0
  if (!s.totalEarned) s.totalEarned = 0
  if (!s.sessionClicks) s.sessionClicks = 0
  if (!s.sessionEarned) s.sessionEarned = 0
  if (!s.bestPerSec) s.bestPerSec = 0
  if (!s.achievements) s.achievements = {}
  if (s.labelName === undefined) s.labelName = ''
  return s
}
function saveState(s: ClkState): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}
const clkPrice = (s: ClkState, u: ClkUpgrade) => Math.floor(u.basePrice * Math.pow(u.priceGrow, s.counts[u.id] || 0))
const clkClickPower = (s: ClkState) => 1 + (s.counts['click_power'] || 0)
const clkCritChance = (s: ClkState) => Math.min((s.counts['click_crit'] || 0) * 0.1, 0.9)
const clkPrestigeMultiplier = (s: ClkState) => Math.pow(2.2, s.prestigeCount || 0)
const clkMultiplier = (s: ClkState) => Math.pow(2, s.counts['multi1'] || 0) * clkPrestigeMultiplier(s)
/** Множитель дохода за клик («Множитель клика», зеркало Турбо-режима для кликов). */
const clkClickMult = (s: ClkState) => Math.pow(2, s.counts['click_multi'] || 0)
/**
 * Доход за один клик. База — «сила клика» + 10% от текущего пассивного дохода,
 * умножается на множитель клика и множитель престижа (поэтому клик и апгрейды
 * клика/крита остаются полезными и в позднем гейме, а не только на старте). Крит ×2.
 */
function clkClickGain(s: ClkState, basePerSec: number, isCrit: boolean): number {
  const base = clkClickPower(s) + basePerSec * 0.1
  return base * (isCrit ? 2 : 1) * clkClickMult(s) * clkPrestigeMultiplier(s)
}
function clkEventMult(ev: ClkEvent | null): number {
  if (!ev) return 1
  if (Date.now() > ev.until) return 1
  return ev.mult
}
function clkAutoPerSec(s: ClkState, ev: ClkEvent | null): number {
  let total = 0
  CLK_UPGRADES.forEach((u) => {
    if (u.type === 'auto') total += (u.perSec || 0) * (s.counts[u.id] || 0)
  })
  return total * clkMultiplier(s) * clkEventMult(ev)
}
const clkPrestigeThreshold = (s: ClkState) => Math.floor(100000 * Math.pow(6, s.prestigeCount || 0))
function clkFmtNum(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return Math.floor(n).toString()
}

const STAT_ICONS = [
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><path d="M5 3l14 9-7 1-4 7z"/></svg>',
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><rect x="5" y="2" width="14" height="20" rx="7"/><line x1="12" y1="2" x2="12" y2="10"/></svg>',
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><path d="M15 9.5a3 3 0 00-3-1.5h-1a2 2 0 000 4h2a2 2 0 010 4h-1.5a3 3 0 01-3-1.5"/></svg>',
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
]

type ClkTab = 'studio' | 'shop' | 'collection' | 'profile'

export const ClickerGame = ({ onBack, onClose }: GameProps) => {
  const t = useT()
  const stateRef = useRef<ClkState>(loadState())
  const eventRef = useRef<ClkEvent | null>(null)
  const scRef = useRef<HTMLDivElement>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [tab, setTab] = useState<ClkTab>('studio')
  const [labelName, setLabelName] = useState(stateRef.current.labelName || '')

  const s = stateRef.current

  const checkAchievements = () => {
    const st = stateRef.current
    if (!st.achievements) st.achievements = {}
    let changed = false
    CLK_ACHIEVEMENTS.forEach((a) => {
      if (!st.achievements[a.id] && a.check(st)) {
        st.achievements[a.id] = true
        changed = true
        gameToast('clicker', t('games.achUnlocked') + t(a.nameKey))
      }
    })
    if (changed) saveState(st)
  }

  // Тик авто-дохода (1с) + планировщик случайных событий. clickerInitUI,
  // плюс досчёт дохода за время отсутствия (offline catch-up).
  useEffect(() => {
    const st = stateRef.current
    // Досчёт за время, пока игра/приложение были закрыты (улучшение vs —
    // доход капал только пока окно открыто). Начисляем по текущей
    // ставке за прошедшие секунды; события (рандомные live-бусты) не учитываем.
    const now = Date.now()
    if (st.lastSeen) {
      const elapsedSec = (now - st.lastSeen) / 1000
      if (elapsedSec > 1) {
        const gain = clkAutoPerSec(st, null) * elapsedSec
        if (gain > 0) {
          st.coins += gain
          st.totalEarned = (st.totalEarned || 0) + gain
        }
      }
    }
    st.lastSeen = now
    st.sessionClicks = 0
    st.sessionEarned = 0
    saveState(st)
    checkAchievements()
    force()

    const tick = setInterval(() => {
      const cur = stateRef.current
      // Сброс истёкшего события.
      if (eventRef.current && Date.now() > eventRef.current.until) eventRef.current = null
      const ps = clkAutoPerSec(cur, eventRef.current)
      cur.lastSeen = Date.now()
      if (ps > 0) {
        cur.coins += ps
        cur.totalEarned = (cur.totalEarned || 0) + ps
        cur.sessionEarned = (cur.sessionEarned || 0) + ps
        if (ps > (cur.bestPerSec || 0)) cur.bestPerSec = ps
        saveState(cur)
        checkAchievements()
      }
      force()
    }, 1000)

    let evTimer: ReturnType<typeof setTimeout>
    const scheduleEvent = () => {
      const delay = (120 + Math.random() * 120) * 1000
      evTimer = setTimeout(() => {
        fireEvent()
        scheduleEvent()
      }, delay)
    }
    const fireEvent = () => {
      const cur = stateRef.current
      const ps = clkAutoPerSec(cur, eventRef.current)
      const events = [
        { label: t('games.clk.evTurbo'), mult: 3, dur: 15000 },
        { label: t('games.clk.evMega'), mult: 5, dur: 8000 },
        { label: t('games.clk.evBug'), mult: 0.1, dur: 5000 },
        { label: t('games.clk.evCoffee'), mult: 2, dur: 20000 },
        { instant: Math.max(100, ps * 30) } as { instant: number },
      ] as Array<{ label?: string; mult?: number; dur?: number; instant?: number }>
      const ev = events[Math.floor(Math.random() * events.length)]!
      if (ev.instant !== undefined) {
        const bonus = Math.floor(ev.instant)
        cur.coins += bonus
        cur.totalEarned = (cur.totalEarned || 0) + bonus
        cur.sessionEarned = (cur.sessionEarned || 0) + bonus
        saveState(cur)
        gameToast('clicker', t('games.clk.gift', { n: clkFmtNum(bonus) }))
      } else {
        eventRef.current = { mult: ev.mult!, until: Date.now() + ev.dur!, label: ev.label! }
        gameToast('clicker', ev.label!)
      }
      force()
    }
    scheduleEvent()

    return () => {
      clearInterval(tick)
      clearTimeout(evTimer)
      // Фиксируем момент закрытия, чтобы досчёт при след. открытии был точным.
      const cur = stateRef.current
      cur.lastSeen = Date.now()
      saveState(cur)
    }
  }, [])

  const onClick = (e: React.MouseEvent) => {
    const cur = stateRef.current
    const isCrit = Math.random() < clkCritChance(cur)
    const power = clkClickGain(cur, clkAutoPerSec(cur, eventRef.current), isCrit)
    cur.coins += power
    cur.totalClicks = (cur.totalClicks || 0) + 1
    cur.sessionClicks = (cur.sessionClicks || 0) + 1
    cur.totalEarned = (cur.totalEarned || 0) + power
    cur.sessionEarned = (cur.sessionEarned || 0) + power
    if (isCrit) cur.hadCrit = true
    saveState(cur)
    checkAchievements()
    force()
    // Всплывающее число.
    const wrap = scRef.current
    if (wrap) {
      const wRect = wrap.getBoundingClientRect()
      const el = document.createElement('div')
      el.className = 'clk-float'
      el.textContent = (isCrit ? 'CRIT +' : '+') + clkFmtNum(power)
      if (isCrit) {
        el.style.fontSize = '15px'
        el.style.color = '#ffd98a'
      }
      el.style.left = e.clientX - wRect.left - 10 + 'px'
      el.style.top = e.clientY - wRect.top - 10 + 'px'
      wrap.appendChild(el)
      setTimeout(() => el.remove(), 700)
    }
  }

  const buy = (id: string) => {
    const cur = stateRef.current
    const upg = CLK_UPGRADES.find((u) => u.id === id)
    if (!upg) return
    const price = clkPrice(cur, upg)
    if (cur.coins < price) return
    cur.coins -= price
    cur.counts[id] = (cur.counts[id] || 0) + 1
    saveState(cur)
    checkAchievements()
    force()
  }

  const prestige = () => {
    const cur = stateRef.current
    if (cur.coins < clkPrestigeThreshold(cur)) return
    if (!confirm(t('games.clk.confirmPrestige'))) return
    cur.prestigeCount = (cur.prestigeCount || 0) + 1
    cur.coins = 0
    cur.counts = {}
    saveState(cur)
    checkAchievements()
    force()
    gameToast('clicker', t('games.clk.prestigeToast', { n: cur.prestigeCount, mult: clkPrestigeMultiplier(cur).toFixed(2) }))
  }

  const reset = () => {
    if (!confirm(t('games.clk.confirmReset'))) return
    stateRef.current = { coins: 0, counts: {}, prestigeCount: 0, totalClicks: 0, totalEarned: 0, sessionClicks: 0, sessionEarned: 0, bestPerSec: 0, achievements: {}, labelName: '' }
    saveState(stateRef.current)
    setLabelName('')
    eventRef.current = null
    force()
  }

  const onLabelName = (v: string) => {
    setLabelName(v)
    stateRef.current.labelName = v
    saveState(stateRef.current)
  }

  // ── Производные значения ──
  const perSec = clkAutoPerSec(s, eventRef.current)
  const crit = clkCritChance(s)
  const pm = clkPrestigeMultiplier(s)
  const ev = eventRef.current && Date.now() <= eventRef.current.until ? eventRef.current : null
  const evSecLeft = ev ? Math.ceil((ev.until - Date.now()) / 1000) : 0
  const threshold = clkPrestigeThreshold(s)
  const canPrestige = s.coins >= threshold
  const prestigePct = Math.min(100, threshold > 0 ? (s.coins / threshold) * 100 : 0)

  let powerTxt = t('games.clk.perClick', { n: clkFmtNum(clkClickGain(s, perSec, false)) })
  if (crit > 0) powerTxt += '  •  ' + t('games.clk.crit', { n: Math.round(crit * 100) })
  if (pm > 1) powerTxt += '  •  ' + t('games.clk.prestigeMult', { n: pm.toFixed(1) })

  const statRows: [string, string][] = [
    [STAT_ICONS[0]! + t('games.clk.statTotalClicks'), clkFmtNum(s.totalClicks || 0)],
    [STAT_ICONS[1]! + t('games.clk.statSessionClicks'), clkFmtNum(s.sessionClicks || 0)],
    [STAT_ICONS[2]! + t('games.clk.statTotalEarned'), clkFmtNum(s.totalEarned || 0)],
    [STAT_ICONS[3]! + t('games.clk.statRecordPerSec'), clkFmtNum(s.bestPerSec || 0)],
  ]

  const achDone = CLK_ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length

  const tabs: { id: ClkTab; label: string; icon: React.ReactNode }[] = [
    {
      id: 'studio',
      label: t('games.clk.tab.studio'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.4" /></svg>,
    },
    {
      id: 'shop',
      label: t('games.clk.tab.shop'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1.4" /></svg>,
    },
    {
      id: 'collection',
      label: t('games.clk.tab.collection'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>,
    },
    {
      id: 'profile',
      label: t('games.clk.tab.profile'),
      icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></svg>,
    },
  ]

  return (
    <div className="game-root game-clicker">
      <GameTopBar
        brand={t('games.clk.brand')}
        icon={<span className="clk-brand-coin" />}
        onBack={onBack}
        onClose={onClose}
        onReset={reset}
        notifGame="clicker"
      />

      <div className="game-scroll">
        {/* ── Студия ── */}
        {tab === 'studio' && (
          <div className="clk-studio">
            <div ref={scRef} className="clk-hero">
              {ev && (
                <div className="clk-event">
                  {ev.label.split('!')[0] + '! (' + t('games.clk.secsShort', { n: evSecLeft }) + ')'}
                </div>
              )}
              <div className="clk-counter">
                <span className="clk-counter-coin" />
                {clkFmtNum(s.coins)}
              </div>
              <div className="clk-persec">{t('games.perSec', { n: clkFmtNum(perSec) })}</div>
              <button className="clk-coin-btn" onClick={onClick} aria-label={t('games.clk.brand')}>
                <span className="clk-vinyl-label">
                  <span className="clk-coin-logo" />
                  <span className="clk-vinyl-hole" />
                </span>
              </button>
              <div className="clk-power">{powerTxt}</div>
            </div>

            {/* эквалайзер (декор студии), «играет» когда есть пассивный доход */}
            <div className="clk-eq" data-live={perSec > 0 ? 'true' : 'false'} aria-hidden="true">
              {Array.from({ length: 13 }).map((_, i) => (
                <span key={i} />
              ))}
            </div>

            {/* прогресс до престижа («переиздания») */}
            <div className="clk-progress">
              <div className="clk-progress-top">
                <span>{t('games.clk.toPrestige')}</span>
                <span className="clk-progress-pct">{Math.floor(prestigePct)}%</span>
              </div>
              <div className="clk-progress-track">
                <div className="clk-progress-fill" data-ready={canPrestige ? 'true' : 'false'} style={{ width: prestigePct + '%' }} />
              </div>
            </div>

            {/* счётчики за сессию */}
            <div className="clk-session">
              <div className="clk-session-chip">
                <div className="clk-session-label">{t('games.clk.statSessionClicks')}</div>
                <div className="clk-session-val">{clkFmtNum(s.sessionClicks || 0)}</div>
              </div>
              <div className="clk-session-chip">
                <div className="clk-session-label">{t('games.clk.statSessionEarned')}</div>
                <div className="clk-session-val">
                  <span className="clk-counter-coin" style={{ width: 13, height: 13 }} />
                  {clkFmtNum(s.sessionEarned || 0)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Лейбл (магазин) ── */}
        {tab === 'shop' && (
          <div className="clk-tabwrap">
            <div className="clk-counter-mini">
              <span className="clk-counter-coin" />
              {clkFmtNum(s.coins)}
            </div>
            <div className="clk-section">
              <div className="clk-prestige">
                <div className="clk-prestige-info">
                  <div className="clk-prestige-title">{t('games.prestige')} {s.prestigeCount || 0}</div>
                  <div className="clk-prestige-hint">{t('games.prestigeHint', { n: clkFmtNum(threshold) })}</div>
                </div>
                <button className="clk-prestige-btn" data-ready={canPrestige ? 'true' : 'false'} onClick={prestige}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                  {t('games.prestige')}
                </button>
              </div>
            </div>

            <div className="clk-section">
              <div className="clk-section-label">{t('games.upgrades')}</div>
              <div className="clk-up-list">
                {CLK_UPGRADES.map((u) => {
                  const price = clkPrice(s, u)
                  const count = s.counts[u.id] || 0
                  const canAfford = s.coins >= price
                  return (
                    <div key={u.id} className="clk-up">
                      <div className="clk-up-info">
                        <div className="clk-up-name">
                          <span className="clk-up-name-text">{t(u.nameKey)}</span>
                          {count > 0 && <span className="clk-up-count">{count}</span>}
                        </div>
                        <div className="clk-up-desc">{t(u.descKey)}</div>
                      </div>
                      <button className="clk-buy" data-afford={canAfford ? 'true' : 'false'} onClick={() => buy(u.id)}>
                        {clkFmtNum(price)}
                        <span className="clk-buy-coin" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Коллекция (достижения) ── */}
        {tab === 'collection' && (
          <div className="clk-tabwrap">
            <div className="clk-coll-head">
              {t('games.achievements')} <span className="clk-coll-count">{achDone}/{CLK_ACHIEVEMENTS.length}</span>
            </div>
            <div className="clk-coll-list">
              {CLK_ACHIEVEMENTS.map((a) => {
                const on = !!s.achievements[a.id]
                return (
                  <div key={a.id} className="clk-coll-item" data-on={on ? 'true' : 'false'}>
                    <div className="clk-medal" data-on={on ? 'true' : 'false'} dangerouslySetInnerHTML={{ __html: a.icon }} />
                    <div className="clk-coll-info">
                      <div className="clk-coll-name">{t(a.nameKey)}</div>
                      <div className="clk-coll-desc">{t(a.descKey)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Профиль (статистика) ── */}
        {tab === 'profile' && (
          <div className="clk-tabwrap">
            <div className="clk-profile-card">
              <span className="clk-profile-disc">
                <span className="clk-coin-logo" />
              </span>
              <div className="clk-profile-meta">
                <input
                  className="clk-label-input"
                  value={labelName}
                  onChange={(e) => onLabelName(e.target.value)}
                  placeholder={t('games.clk.defaultLabel')}
                  maxLength={24}
                  spellCheck={false}
                />
                <div className="clk-profile-rank">{t('games.clk.rank')} {s.prestigeCount || 0}</div>
              </div>
            </div>

            <div className="clk-section">
              <div className="clk-section-label">{t('games.stats')}</div>
              <div className="clk-stats">
                {statRows.map(([label, val], i) => (
                  <div key={i} className="clk-stat">
                    <div className="clk-stat-label" dangerouslySetInnerHTML={{ __html: label }} />
                    <div className="clk-stat-val">{val}</div>
                  </div>
                ))}
                <div className="clk-stat">
                  <div className="clk-stat-label">{t('games.achievements')}</div>
                  <div className="clk-stat-val">{achDone}/{CLK_ACHIEVEMENTS.length}</div>
                </div>
                <div className="clk-stat">
                  <div className="clk-stat-label">{t('games.clk.statIncome')}</div>
                  <div className="clk-stat-val">{clkFmtNum(perSec)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Дека вкладок ── */}
      <div className="clk-deck">
        {tabs.map((tb) => (
          <button key={tb.id} className="clk-tab" data-active={tab === tb.id ? 'true' : 'false'} onClick={() => setTab(tb.id)}>
            <span className="clk-tab-icon">{tb.icon}</span>
            {tb.label}
          </button>
        ))}
      </div>
    </div>
  )
}
