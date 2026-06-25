interface MatchScoreBadgeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

function scoreColor(score: number) {
  if (score >= 90) return { ring: '#10b981', text: '#065f46', bg: '#ecfdf5' }
  if (score >= 75) return { ring: '#6366f1', text: '#3730a3', bg: '#eef2ff' }
  if (score >= 60) return { ring: '#f59e0b', text: '#92400e', bg: '#fffbeb' }
  return { ring: '#94a3b8', text: '#475569', bg: '#f8fafc' }
}

export default function MatchScoreBadge({ score, size = 'md' }: MatchScoreBadgeProps) {
  const { ring, text, bg } = scoreColor(score)
  const dim = size === 'lg' ? 72 : size === 'sm' ? 40 : 56
  const strokeWidth = size === 'lg' ? 5 : 4
  const radius = (dim - strokeWidth * 2) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const fontSize = size === 'lg' ? 16 : size === 'sm' ? 10 : 13

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={dim} height={dim} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill={bg}
          stroke="#e2e8f0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="transparent"
          stroke={ring}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            transform: 'rotate(90deg)',
            transformOrigin: 'center',
            fontSize,
            fontWeight: 700,
            fill: text,
          }}
        >
          {score}%
        </text>
      </svg>
      {size !== 'sm' && (
        <span className="text-xs font-medium" style={{ color: text }}>
          Match
        </span>
      )}
    </div>
  )
}
