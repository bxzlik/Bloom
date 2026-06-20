import { useEffect, useReducer, useRef } from 'react'
import { gameToast } from '../../lib/gameToast'
import { useGamesStore } from '../../model/gamesStore'
import { useT, type TranslationKey } from '@shared/i18n'

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
const clkPrestigeMultiplier = (s: ClkState) => Math.pow(1.5, s.prestigeCount || 0)
const clkMultiplier = (s: ClkState) => Math.pow(2, s.counts['multi1'] || 0) * clkPrestigeMultiplier(s)
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
const clkPrestigeThreshold = (s: ClkState) => Math.floor(100000 * Math.pow(10, s.prestigeCount || 0))
function clkFmtNum(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T'
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return Math.floor(n).toString()
}

const Raw = ({ html }: { html: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center' }} dangerouslySetInnerHTML={{ __html: html }} />
)

const COIN_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><path d="M15 9.5a3 3 0 00-3-1.5h-1a2 2 0 000 4h2a2 2 0 010 4h-1.5a3 3 0 01-3-1.5"/></svg>'

const STAT_ICONS = [
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><path d="M5 3l14 9-7 1-4 7z"/></svg>',
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><rect x="5" y="2" width="14" height="20" rx="7"/><line x1="12" y1="2" x2="12" y2="10"/></svg>',
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><path d="M15 9.5a3 3 0 00-3-1.5h-1a2 2 0 000 4h2a2 2 0 010 4h-1.5a3 3 0 01-3-1.5"/></svg>',
  '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
]

export const ClickerGame = () => {
  const t = useT()
  const stateRef = useRef<ClkState>(loadState())
  const eventRef = useRef<ClkEvent | null>(null)
  const scRef = useRef<HTMLDivElement>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const setControls = useGamesStore((st) => st.setControls)

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
    const power = clkClickPower(cur) * (isCrit ? 2 : 1)
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
      el.textContent = (isCrit ? 'CRIT +' : '+') + power
      if (isCrit) {
        el.style.fontSize = '14px'
        el.style.color = '#ff6b35'
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
    stateRef.current = { coins: 0, counts: {}, prestigeCount: 0, totalClicks: 0, totalEarned: 0, sessionClicks: 0, sessionEarned: 0, bestPerSec: 0, achievements: {} }
    saveState(stateRef.current)
    eventRef.current = null
    force()
  }

  // Контролы в шапке модалки (сброс + тумблер уведомлений). reset стабилен
  // (замыкается на стабильные ref/force), поэтому регистрируем один раз.
  useEffect(() => {
    setControls({ notifGame: 'clicker', onReset: reset })
    return () => setControls(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Производные значения ──
  const perSec = clkAutoPerSec(s, eventRef.current)
  const crit = clkCritChance(s)
  const pm = clkPrestigeMultiplier(s)
  const ev = eventRef.current && Date.now() <= eventRef.current.until ? eventRef.current : null
  const evSecLeft = ev ? Math.ceil((ev.until - Date.now()) / 1000) : 0
  const threshold = clkPrestigeThreshold(s)
  const canPrestige = s.coins >= threshold

  let powerTxt = t('games.clk.perClick', { n: clkClickPower(s) })
  if (crit > 0) powerTxt += '  •  ' + t('games.clk.crit', { n: Math.round(crit * 100) })
  if (pm > 1) powerTxt += '  •  ' + t('games.clk.prestigeMult', { n: pm.toFixed(1) })

  const statRows: [string, string][] = [
    [STAT_ICONS[0]! + t('games.clk.statTotalClicks'), clkFmtNum(s.totalClicks || 0)],
    [STAT_ICONS[1]! + t('games.clk.statSessionClicks'), clkFmtNum(s.sessionClicks || 0)],
    [STAT_ICONS[2]! + t('games.clk.statTotalEarned'), clkFmtNum(s.totalEarned || 0)],
    [STAT_ICONS[3]! + t('games.clk.statRecordPerSec'), clkFmtNum(s.bestPerSec || 0)],
  ]

  return (
    <div className="s-section active" id="ssec-clicker">
      <div className="s-section-head">
        <div className="s-section-title">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18" /></svg>{' '}
          {t('games.clicker')}
        </div>
        <button className="s-section-reset" onClick={reset}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>{' '}
          {t('common.reset')}
        </button>
      </div>

      <div ref={scRef} className="sc" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '20px 14px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ display: ev ? 'block' : 'none', width: '100%', textAlign: 'center', padding: '5px 10px', borderRadius: 'calc(var(--radius)*.55)', background: 'rgba(255,200,0,.12)', border: '1px solid rgba(255,200,0,.3)', color: '#ffd700', fontSize: 11.5, fontWeight: 700 }}>
          {ev ? ev.label.split('!')[0] + '! (' + t('games.clk.secsShort', { n: evSecLeft }) + ')' : ''}
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, letterSpacing: -1 }}>{clkFmtNum(s.coins)}</div>
          <div className="ssub" style={{ marginTop: 4, fontSize: 11 }}>{t('games.perSec', { n: clkFmtNum(perSec) })}</div>
        </div>
        <button
          onClick={onClick}
          style={{ width: 90, height: 90, borderRadius: '50%', border: '3px solid var(--accent)', background: 'rgba(var(--accent-rgb),.12)', color: 'var(--accent)', fontSize: 36, cursor: 'pointer', transition: 'transform .08s,box-shadow .08s', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 0 rgba(var(--accent-rgb),.3)', position: 'relative', overflow: 'visible', userSelect: 'none' }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.93)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="7" /><line x1="12" y1="2" x2="12" y2="10" /></svg>
        </button>
        <div className="ssub">{powerTxt}</div>
      </div>

      <div className="sc" style={{ marginTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text2)', marginBottom: 8 }}>{t('games.stats')}</div>
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
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: 'var(--text2)', marginBottom: 8 }}>{t('games.achievements')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CLK_ACHIEVEMENTS.map((a) => {
            const unlocked = !!s.achievements[a.id]
            return (
              <div
                key={a.id}
                style={{ width: 36, height: 36, borderRadius: 'calc(var(--radius)*.55)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: unlocked ? 'rgba(var(--accent-rgb),.12)' : 'rgba(255,255,255,.02)', opacity: unlocked ? 1 : 0.25, cursor: 'default', transition: '.2s', color: unlocked ? 'var(--accent)' : 'var(--muted)' }}
                dangerouslySetInnerHTML={{ __html: a.icon }}
              />
            )
          })}
        </div>
      </div>

      <div className="sc" style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>{t('games.prestige')} {s.prestigeCount || 0}</div>
            <div className="ssub">{t('games.prestigeHint', { n: clkFmtNum(threshold) })}</div>
          </div>
          <button
            onClick={prestige}
            style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 'calc(var(--radius)*.55)', fontSize: 12, fontWeight: 700, border: '1px solid ' + (canPrestige ? 'rgba(255,200,0,.5)' : 'var(--border)'), background: canPrestige ? 'rgba(255,200,0,.1)' : 'none', color: canPrestige ? '#ffd700' : 'var(--muted)', cursor: canPrestige ? 'pointer' : 'default', fontFamily: 'var(--font)', transition: '.2s', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: canPrestige ? 1 : 0.4 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>{' '}
            {t('games.prestige')}
          </button>
        </div>
      </div>

      <div className="sc" style={{ marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text2)' }}>{t('games.upgrades')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {CLK_UPGRADES.map((u) => {
            const price = clkPrice(s, u)
            const count = s.counts[u.id] || 0
            const canAfford = s.coins >= price
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 'calc(var(--radius)*.6)', background: 'rgba(255,255,255,.03)', border: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{t(u.nameKey)}</span>
                    {count > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: 'rgba(var(--accent-rgb),.15)', color: 'var(--accent)' }}>{count}</span>}
                  </div>
                  <div className="ssub">{t(u.descKey)}</div>
                </div>
                <button
                  onClick={() => buy(u.id)}
                  style={{ flexShrink: 0, padding: '5px 12px', borderRadius: 'calc(var(--radius)*.55)', fontSize: 11.5, fontWeight: 700, border: '1px solid ' + (canAfford ? 'rgba(var(--accent-rgb),.5)' : 'var(--border)'), background: canAfford ? 'rgba(var(--accent-rgb),.13)' : 'none', color: canAfford ? 'var(--accent)' : 'var(--muted)', cursor: canAfford ? 'pointer' : 'default', fontFamily: 'var(--font)', transition: '.15s', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  {clkFmtNum(price)}
                  <Raw html={COIN_SVG} />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
