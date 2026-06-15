import { useState } from 'react'
import { toast } from '@shared/ui'
import { useGeniusStore } from '../model/geniusStore'

/**
 * Карточка настроек Genius: ввод Client Access Token. блока
 * «API ключи → Genius». Токен хранится в
 * `localStorage['bloom_genius_token']` (useGeniusStore) и подставляется в каждый
 * `lyrics_request` как fallback-провайдер текстов (если LRCLIB не нашёл).
 */
export const GeniusTokenCard = () => {
  const saved = useGeniusStore((s) => s.token)
  const setToken = useGeniusStore((s) => s.setToken)
  const [value, setValue] = useState(saved)
  const [visible, setVisible] = useState(false)

  const save = () => {
    const v = value.trim()
    setToken(v)
    toast(v ? 'Genius: токен сохранён' : 'Genius: токен сброшен')
  }

  return (
    <div className="sc">
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 'calc(var(--radius)*.6)',
            background: '#ffff64',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#000">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Genius</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
            Тексты песен (fallback если LRCLIB не нашёл)
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
        Введи <b>Client Access Token</b> из личного кабинета Genius.
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
          <input
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
            placeholder="Вставь Access Token…"
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: 12,
              padding: '8px 36px 8px 12px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'calc(var(--radius) * 0.6)',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
          <button
            onClick={() => setVisible((v) => !v)}
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text2)',
              display: 'flex',
              padding: 2,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
        <button
          onClick={save}
          style={{
            padding: '0 16px',
            background: 'var(--accent)',
            color: 'var(--accent-text)',
            border: 'none',
            borderRadius: 'calc(var(--radius) * 0.6)',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Сохранить
        </button>
      </div>

      {saved && (
        <div
          style={{
            fontSize: 11,
            padding: '5px 8px',
            borderRadius: 6,
            marginTop: 6,
            background: 'rgba(29,185,84,.12)',
            border: '1px solid rgba(29,185,84,.3)',
            color: '#1db954',
          }}
        >
          ✓ Genius токен сохранён
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 8 }}>
          Как получить токен:
        </div>
        <ol style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
          <li>Зайди на <b style={{ color: 'var(--text2)' }}>genius.com/api-clients</b></li>
          <li>Нажми <b style={{ color: 'var(--text2)' }}>New API Client</b></li>
          <li>Заполни название и нажми <b style={{ color: 'var(--text2)' }}>Save</b></li>
          <li>Нажми <b style={{ color: 'var(--text2)' }}>Generate Access Token</b></li>
          <li>Скопируй токен и вставь выше</li>
        </ol>
      </div>
    </div>
  )
}
