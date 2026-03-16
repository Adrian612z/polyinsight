import React from 'react'
import { useTheme } from '../lib/theme'

export const AnimatedBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { resolvedTheme } = useTheme()

  return (
    <div className="relative min-h-screen overflow-clip bg-warm-white text-charcoal">
      <div className="pointer-events-none absolute inset-0">
        <div
          className={
            resolvedTheme === 'dark'
              ? 'absolute inset-0 bg-[linear-gradient(rgba(112,128,158,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(112,128,158,0.08)_1px,transparent_1px)] bg-[size:132px_132px] opacity-40'
              : 'absolute inset-0 bg-[linear-gradient(rgba(126,141,170,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(126,141,170,0.06)_1px,transparent_1px)] bg-[size:132px_132px] opacity-45'
          }
        />
        <div className="absolute inset-x-[12%] top-[-16rem] h-[34rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.84),transparent_72%)] blur-3xl" />
        <div
          className={
            resolvedTheme === 'dark'
              ? 'absolute left-[-8rem] top-[-7rem] h-[25rem] w-[25rem] rounded-full bg-[radial-gradient(circle,rgba(255,123,99,0.22),transparent_68%)] blur-3xl animate-ambient-drift'
              : 'absolute left-[-8rem] top-[-7rem] h-[25rem] w-[25rem] rounded-full bg-[radial-gradient(circle,rgba(255,107,87,0.18),transparent_68%)] blur-3xl animate-ambient-drift'
          }
        />
        <div
          className={
            resolvedTheme === 'dark'
              ? 'absolute right-[-6rem] top-[3rem] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(32,201,179,0.18),transparent_70%)] blur-3xl animate-ambient-drift'
              : 'absolute right-[-6rem] top-[3rem] h-[22rem] w-[22rem] rounded-full bg-[radial-gradient(circle,rgba(16,183,164,0.14),transparent_70%)] blur-3xl animate-ambient-drift'
          }
        />
        <div
          className={
            resolvedTheme === 'dark'
              ? 'absolute bottom-[-10rem] left-[26%] h-[18rem] w-[18rem] rounded-full bg-[radial-gradient(circle,rgba(139,123,255,0.16),transparent_72%)] blur-3xl animate-ambient-drift'
              : 'absolute bottom-[-10rem] left-[26%] h-[18rem] w-[18rem] rounded-full bg-[radial-gradient(circle,rgba(108,92,231,0.1),transparent_72%)] blur-3xl animate-ambient-drift'
          }
        />
        <div
          className={
            resolvedTheme === 'dark'
              ? 'absolute bottom-[-8rem] right-[12%] h-[16rem] w-[16rem] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.06),transparent_70%)] blur-3xl animate-ambient-drift'
              : 'absolute bottom-[-8rem] right-[12%] h-[16rem] w-[16rem] rounded-full bg-[radial-gradient(circle,rgba(255,107,87,0.08),transparent_70%)] blur-3xl animate-ambient-drift'
          }
        />
        <div className="absolute left-[12%] top-[18%] h-56 w-56 rounded-full border border-white/32 bg-white/14 blur-2xl float-gentle" />
        <div className="absolute right-[18%] top-[36%] h-40 w-40 rounded-full border border-white/26 bg-white/10 blur-2xl float-gentle-delay" />
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-white/62 to-transparent" />
        <div className="absolute left-0 right-0 top-[14%] h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      </div>

      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}
