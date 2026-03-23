import React from 'react'

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/65 bg-[linear-gradient(145deg,rgba(18,27,41,0.96),rgba(36,51,76,0.9))] font-serif text-xl font-bold text-[#e7bf99] shadow-[0_22px_40px_rgba(96,118,148,0.18),inset_0_1px_0_rgba(255,255,255,0.14)]">
        P
      </div>
      <div className="leading-none">
        <div className="font-serif text-lg font-bold tracking-[-0.04em] text-charcoal 2xl:text-xl">
          PolyInsight
        </div>
        <div className="mt-1 hidden text-[10px] font-semibold uppercase tracking-[0.32em] text-charcoal/40 2xl:block">
          Market Intelligence
        </div>
      </div>
    </div>
  )
}
