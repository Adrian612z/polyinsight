import React from 'react'

export const AnimatedBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-warm-white text-charcoal relative">
      {/* 极简背景：无复杂动效，仅保留极其微妙的纹理或纯色 */}
      {/* 可以在这里添加一些非常淡的 CSS 图案，例如噪点，暂时保持纯色以符合极简主义 */}
      
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}

// 移除 GlowEffect，极简风格不需要发光
