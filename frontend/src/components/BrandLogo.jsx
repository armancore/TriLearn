const BrandLogo = ({
  compact = false,
  theme = 'dark',
  showTagline = true,
  size = 'md',
  className = ''
}) => {
  const sizes = {
    sm: {
      shell: 'gap-2.5',
      badge: 'h-10 w-10 rounded-2xl',
      orbit: 'h-4 w-4',
      dot: 'h-2 w-2',
      title: 'text-base',
      subtitle: 'text-[10px] tracking-[0.22em]'
    },
    md: {
      shell: 'gap-3',
      badge: 'h-12 w-12 rounded-[1.35rem]',
      orbit: 'h-5 w-5',
      dot: 'h-2.5 w-2.5',
      title: 'text-lg',
      subtitle: 'text-[11px] tracking-[0.26em]'
    },
    lg: {
      shell: 'gap-4',
      badge: 'h-14 w-14 rounded-[1.5rem]',
      orbit: 'h-6 w-6',
      dot: 'h-3 w-3',
      title: 'text-xl',
      subtitle: 'text-xs tracking-[0.3em]'
    }
  }

  const palette = theme === 'light'
    ? {
        shell: 'text-[var(--color-heading)]',
        badge: 'ui-brand-logo-badge-light border border-primary-200 bg-[linear-gradient(135deg,#ffffff_0%,#e0ecff_100%)]',
        ring: 'border-primary-300/70',
        orbit: 'bg-primary text-white',
        dot: 'bg-accent',
        subtitle: 'text-[var(--color-text-muted)]'
      }
    : {
        shell: 'text-white',
        badge: 'ui-brand-logo-badge-dark border border-white/15 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,rgba(84,131,195,0.16)_100%)]',
        ring: 'border-white/18',
        orbit: 'bg-white text-primary',
        dot: 'bg-accent',
        subtitle: 'text-slate-300'
      }

  const scale = sizes[size] || sizes.md

  return (
    <div className={`inline-flex items-center ${scale.shell} ${palette.shell} ${className}`}>
      <div className={`relative flex shrink-0 items-center justify-center ${scale.badge} ${palette.badge}`}>
        <div className={`absolute inset-[18%] rounded-[inherit] border ${palette.ring}`} />
        <div className={`absolute left-[18%] top-[22%] flex items-center justify-center rounded-full ${scale.orbit} ${palette.orbit}`}>
          <span className="text-[9px] font-black tracking-[0.18em]">T</span>
        </div>
        <div className={`absolute bottom-[20%] right-[18%] rounded-full ${scale.dot} ${palette.dot}`} />
        <span className="text-[13px] font-black tracking-[0.36em]">TL</span>
      </div>
      {!compact ? (
        <div className="min-w-0">
          <p className={`ui-heading-tight font-black tracking-tight ${scale.title}`}>TriLearn</p>
          {showTagline ? (
            <p className={`uppercase ${scale.subtitle} ${palette.subtitle}`}>Academic Flow System</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default BrandLogo
