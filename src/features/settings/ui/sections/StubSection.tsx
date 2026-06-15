/**
 * Заглушка для ещё-не-реализованных секций. Показывает заголовок + пояснение,
 * что секция в разработке.
 */
export const StubSection = ({
  title,
  description,
  plannedAt,
}: {
  title: string
  description: string
  plannedAt?: string
}) => (
  <div className="s-section active">
    <div className="sc">
      <div
        style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--text2)',
        }}
      >
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text)',
            marginBottom: 8,
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 12 }}>
          {description}
        </div>
        {plannedAt && (
          <div
            style={{
              display: 'inline-block',
              padding: '4px 10px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.5px',
              textTransform: 'uppercase',
              color: 'var(--muted)',
              border: '1px solid var(--border)',
              borderRadius: 'calc(var(--radius) * 0.4)',
            }}
          >
            {plannedAt}
          </div>
        )}
      </div>
    </div>
  </div>
)
