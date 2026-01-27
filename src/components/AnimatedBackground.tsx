import React, { useEffect, useRef, useState } from 'react'

interface MousePosition {
  x: number
  y: number
}

export const AnimatedBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mousePosition, setMousePosition] = useState<MousePosition>({ x: 0, y: 0 })
  const [isHovering, setIsHovering] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setMousePosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        })
      }
    }

    const handleMouseEnter = () => setIsHovering(true)
    const handleMouseLeave = () => setIsHovering(false)

    const container = containerRef.current
    if (container) {
      container.addEventListener('mousemove', handleMouseMove)
      container.addEventListener('mouseenter', handleMouseEnter)
      container.addEventListener('mouseleave', handleMouseLeave)
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove)
        container.removeEventListener('mouseenter', handleMouseEnter)
        container.removeEventListener('mouseleave', handleMouseLeave)
      }
    }
  }, [])

  return (
    <div ref={containerRef} className="relative min-h-screen overflow-hidden">
      {/* 动态背景层 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* 基础渐变 */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-indigo-50/30 to-purple-50/30 dark:from-gray-900 dark:via-indigo-950/30 dark:to-purple-950/30 transition-colors duration-500" />

        {/* 鼠标跟随光晕 */}
        <div
          className="absolute w-[600px] h-[600px] rounded-full transition-all duration-300 ease-out"
          style={{
            left: mousePosition.x - 300,
            top: mousePosition.y - 300,
            background: isHovering
              ? 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.1) 30%, transparent 70%)'
              : 'radial-gradient(circle, rgba(99, 102, 241, 0.08) 0%, transparent 60%)',
            transform: `scale(${isHovering ? 1 : 0.8})`,
            opacity: isHovering ? 1 : 0.5,
          }}
        />

        {/* 动态浮动圆点 */}
        <div className="absolute top-20 left-[10%] w-72 h-72 bg-indigo-400/20 dark:bg-indigo-600/10 rounded-full blur-3xl animate-float-slow" />
        <div className="absolute top-40 right-[15%] w-96 h-96 bg-purple-400/20 dark:bg-purple-600/10 rounded-full blur-3xl animate-float-medium" />
        <div className="absolute bottom-20 left-[20%] w-80 h-80 bg-blue-400/20 dark:bg-blue-600/10 rounded-full blur-3xl animate-float-fast" />
        <div className="absolute bottom-40 right-[25%] w-64 h-64 bg-pink-400/15 dark:bg-pink-600/10 rounded-full blur-3xl animate-float-slow" />

        {/* 网格纹理 */}
        <div
          className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05]"
          style={{
            backgroundImage: `linear-gradient(rgba(99, 102, 241, 0.5) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(99, 102, 241, 0.5) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* 内容层 */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}

// 小型光效组件，用于卡片悬停
export const GlowEffect: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [position, setPosition] = useState({ x: 50, y: 50 })
  const ref = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPosition({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      })
    }
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ${className}`}
      style={{
        background: `radial-gradient(circle at ${position.x}% ${position.y}%, rgba(99, 102, 241, 0.15) 0%, transparent 50%)`,
      }}
    />
  )
}
