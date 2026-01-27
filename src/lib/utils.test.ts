import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn 工具函数', () => {
  it('应合并多个类名', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('应处理条件类名', () => {
    const showBar = false
    const showBaz = true
    expect(cn('foo', showBar && 'bar', 'baz')).toBe('foo baz')
    expect(cn('foo', showBaz && 'bar', 'baz')).toBe('foo bar baz')
  })

  it('应合并 Tailwind 冲突类名', () => {
    // twMerge 会处理冲突，后面的优先
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('应处理空输入', () => {
    expect(cn()).toBe('')
    expect(cn('')).toBe('')
    expect(cn(null, undefined)).toBe('')
  })

  it('应处理数组输入', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })
})
