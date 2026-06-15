/**
 * Секция «О программе» — версия, поддерживаемые форматы, стек.
 * по структуре `#smAboutInline`.
 * Использует классы `.sc.about-hero-card`, `.about-logo-row`,
 * `.about-logo`, `.about-meta-row`, `.about-meta-chip`.
 */
export const AboutSection = () => (
  <div className="s-section active" id="ssec-about">
    <div className="sc about-hero-card">
      <div className="about-logo-row">
        <div className="about-logo">B</div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.3px' }}>
            Bloom
          </div>
          <div className="ssub" style={{ marginTop: 2 }}>
            Версия 1.0 · Музыкальный плеер
          </div>
        </div>
      </div>
      <div className="about-meta-row">
        <div className="about-meta-chip">
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          MP3 · FLAC · WAV · OGG · AAC · M4A · OPUS · WMA · AIFF · WebM
        </div>
      </div>
    </div>
  </div>
)
