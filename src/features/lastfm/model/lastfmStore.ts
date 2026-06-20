import { create } from 'zustand'
import { openUrl } from '@tauri-apps/plugin-opener'
import { toast } from '@shared/ui'
import { t } from '@shared/i18n'
import { md5 } from '../lib/md5'

const BASE = 'https://ws.audioscrobbler.com/2.0/'

/**
 * Last.fm-скробблер: объект `LFM` + функции
 * lfmStartOAuth/lfmFinishOAuth/lfmLogout/lfmSaveKeys/lfmToggle*.
 *
 * Полностью фронтовый (Rust-бэкенда нет): запросы к web-API через `fetch` с
 * md5-подписью (`api_sig`). OAuth: getToken → открыть last.fm в браузере →
 * getSession (обмен токена на session key).
 *
 * Persist: `lfm_config` (sk/apiKey/apiSecret/флаги) + `lfm_sk` +
 * `lfm_user`. Транзиентное состояние скробблинга (текущий трек/таймер/флаг) —
 * модульные переменные ниже (не в сторе: не нужно в UI, меняется часто).
 */

interface LfmConfig {
  sk: string | null
  apiKey: string
  apiSecret: string
  scrobbleEnabled: boolean
  nowPlayingEnabled: boolean
}

const loadConfig = (): LfmConfig => {
  let cfg: Partial<LfmConfig> = {}
  try {
    cfg = JSON.parse(localStorage.getItem('lfm_config') || '{}')
  } catch {
    cfg = {}
  }
  let legacySk: string | null = null
  try {
    legacySk = localStorage.getItem('lfm_sk')
  } catch {
    legacySk = null
  }
  return {
    sk: cfg.sk || legacySk || null,
    apiKey: cfg.apiKey || '',
    apiSecret: cfg.apiSecret || '',
    scrobbleEnabled: cfg.scrobbleEnabled || false,
    nowPlayingEnabled: cfg.nowPlayingEnabled || false,
  }
}

const loadUser = (): string => {
  try {
    return localStorage.getItem('lfm_user') || ''
  } catch {
    return ''
  }
}

// ── Транзиентное состояние скробблинга (вне стора) ───────────────────────────
let _pendingToken: string | null = null
let _nowTrack: { artist: string; track: string; album: string } | null = null
let _startTime = 0
let _scrobbled = false

interface LastfmState extends LfmConfig {
  user: string
  /** Статус OAuth-формы (под кнопками «Войти»/«Готово»). */
  oauthStatus: string
  /** Показывать ли кнопку «Готово — я подтвердил». */
  oauthPending: boolean

  saveKeys: (apiKey: string, apiSecret: string) => void
  startOAuth: () => Promise<void>
  finishOAuth: () => Promise<void>
  logout: () => void
  toggleScrobble: () => void
  toggleNowPlaying: () => void

  /** Хуки скробблинга (зовёт useLastfmBridge). */
  onTrackStart: (artist: string, track: string, album: string) => void
  onProgress: (currentTime: number, duration: number) => void
}

const persist = (s: LfmConfig) => {
  try {
    localStorage.setItem(
      'lfm_config',
      JSON.stringify({
        sk: s.sk,
        apiKey: s.apiKey,
        apiSecret: s.apiSecret,
        scrobbleEnabled: s.scrobbleEnabled,
        nowPlayingEnabled: s.nowPlayingEnabled,
      }),
    )
  } catch {
    /* приватный режим / квота */
  }
}

export const useLastfmStore = create<LastfmState>((set, get) => {
  // Подпись запроса: md5(отсортированные k+v + secret), LFM.sign.
  const sign = (params: Record<string, string>): string => {
    const { apiSecret } = get()
    const str =
      Object.keys(params)
        .sort()
        .map((k) => k + params[k])
        .join('') + apiSecret
    return md5(str)
  }

  const post = async (params: Record<string, string>): Promise<unknown> => {
    const { apiKey } = get()
    if (!apiKey || !get().apiSecret) return null
    const p = { ...params, api_key: apiKey }
    const withSig = { ...p, api_sig: sign(p), format: 'json' }
    try {
      const res = await fetch(BASE, { method: 'POST', body: new URLSearchParams(withSig) })
      return await res.json()
    } catch {
      return null
    }
  }

  const nowPlaying = (artist: string, track: string, album: string) => {
    const { sk, nowPlayingEnabled } = get()
    if (!sk || !nowPlayingEnabled) return
    void post({ method: 'track.updateNowPlaying', artist, track, album: album || '', sk })
  }

  const scrobble = (artist: string, track: string, timestamp: number, album: string) => {
    const { sk, scrobbleEnabled } = get()
    if (!sk || !scrobbleEnabled) return
    void post({
      method: 'track.scrobble',
      artist,
      track,
      timestamp: String(timestamp),
      album: album || '',
      sk,
    })
  }

  return {
    ...loadConfig(),
    user: loadUser(),
    oauthStatus: '',
    oauthPending: false,

    saveKeys: (apiKey, apiSecret) => {
      const k = apiKey.trim()
      const s = apiSecret.trim()
      if (!k || !s) {
        toast(t('lastfm.toast.enterBothKeys'))
        return
      }
      set({ apiKey: k, apiSecret: s })
      persist(get())
      toast(t('lastfm.toast.keysSaved'))
    },

    startOAuth: async () => {
      const { apiKey } = get()
      if (!apiKey) {
        toast(t('lastfm.toast.saveApiKeyFirst'))
        return
      }
      set({ oauthStatus: t('lastfm.oauth.gettingToken') })
      try {
        const res = await fetch(`${BASE}?method=auth.getToken&api_key=${apiKey}&format=json`)
        const data = (await res.json()) as { token?: string; message?: string }
        if (!data.token) {
          set({ oauthStatus: t('lastfm.oauth.error', { msg: data.message || t('lastfm.oauth.noToken') }) })
          return
        }
        _pendingToken = data.token
        const authUrl = `https://www.last.fm/api/auth/?api_key=${apiKey}&token=${data.token}`
        await openUrl(authUrl).catch(() => window.open(authUrl, '_blank'))
        set({
          oauthStatus: t('lastfm.oauth.confirmAccess'),
          oauthPending: true,
        })
      } catch {
        set({ oauthStatus: t('lastfm.oauth.networkError') })
      }
    },

    finishOAuth: async () => {
      const { apiKey } = get()
      if (!_pendingToken) {
        set({ oauthStatus: t('lastfm.oauth.loginFirst') })
        return
      }
      set({ oauthStatus: t('lastfm.oauth.checking') })
      const params: Record<string, string> = {
        method: 'auth.getSession',
        api_key: apiKey,
        token: _pendingToken,
      }
      const withSig = { ...params, api_sig: sign(params), format: 'json' }
      try {
        const res = await fetch(BASE, { method: 'POST', body: new URLSearchParams(withSig) })
        const data = (await res.json()) as {
          session?: { key: string; name: string }
          message?: string
        }
        if (data.session) {
          _pendingToken = null
          set({
            sk: data.session.key,
            user: data.session.name,
            scrobbleEnabled: true,
            nowPlayingEnabled: true,
            oauthPending: false,
            oauthStatus: '',
          })
          try {
            localStorage.setItem('lfm_sk', data.session.key)
            localStorage.setItem('lfm_user', data.session.name)
          } catch {
            /* noop */
          }
          persist(get())
          toast(t('lastfm.toast.connectedAs', { name: data.session.name }))
        } else {
          set({ oauthStatus: data.message || t('lastfm.oauth.notConfirmed') })
        }
      } catch {
        set({ oauthStatus: t('lastfm.oauth.networkError') })
      }
    },

    logout: () => {
      _pendingToken = null
      set({ sk: null, user: '', oauthPending: false, oauthStatus: '' })
      try {
        localStorage.removeItem('lfm_sk')
        localStorage.removeItem('lfm_user')
      } catch {
        /* noop */
      }
      persist(get())
      toast(t('lastfm.toast.disconnected'))
    },

    toggleScrobble: () => {
      set((s) => ({ scrobbleEnabled: !s.scrobbleEnabled }))
      persist(get())
    },

    toggleNowPlaying: () => {
      set((s) => ({ nowPlayingEnabled: !s.nowPlayingEnabled }))
      persist(get())
    },

    onTrackStart: (artist, track, album) => {
      _nowTrack = { artist, track, album }
      _startTime = Math.floor(Date.now() / 1000)
      _scrobbled = false
      nowPlaying(artist, track, album)
    },

    onProgress: (currentTime, duration) => {
      if (_scrobbled || !_nowTrack || !duration) return
      // Засчёт: >=30с прослушано И (>=240с ИЛИ >=50% длительности)..
      if (currentTime >= 30 && (currentTime >= 240 || currentTime / duration >= 0.5)) {
        scrobble(_nowTrack.artist, _nowTrack.track, _startTime, _nowTrack.album)
        _scrobbled = true
      }
    },
  }
})
