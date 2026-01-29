import React from 'react'

export const Logo: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`font-serif font-bold text-2xl tracking-tight text-charcoal flex items-center gap-2 ${className}`}>
      <span className="text-terracotta text-3xl leading-none">P</span>
      <span>olyInsight</span>
    </div>
  )
}
