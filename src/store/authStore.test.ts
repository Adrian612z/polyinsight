import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './authStore'

describe('authStore', () => {
  beforeEach(() => {
    // 每个测试前重置 store 状态
    useAuthStore.setState({ session: null, user: null })
  })

  it('初始状态应为 null', () => {
    const state = useAuthStore.getState()
    expect(state.session).toBeNull()
    expect(state.user).toBeNull()
  })

  it('signOut 应清除 session 和 user', () => {
    // 先设置一些状态
    useAuthStore.setState({
      session: { access_token: 'test' } as never,
      user: { id: 'test-id' } as never,
    })

    // 调用 signOut
    useAuthStore.getState().signOut()

    // 验证状态被清除
    const state = useAuthStore.getState()
    expect(state.session).toBeNull()
    expect(state.user).toBeNull()
  })

  it('setSession 应同时设置 session 和 user', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }
    const mockSession = {
      access_token: 'token-123',
      user: mockUser,
    }

    useAuthStore.getState().setSession(mockSession as never)

    const state = useAuthStore.getState()
    expect(state.session).toEqual(mockSession)
    expect(state.user).toEqual(mockUser)
  })

  it('setSession(null) 应清除 user', () => {
    // 先设置状态
    useAuthStore.setState({
      session: { access_token: 'test' } as never,
      user: { id: 'test-id' } as never,
    })

    // 设置 session 为 null
    useAuthStore.getState().setSession(null)

    const state = useAuthStore.getState()
    expect(state.session).toBeNull()
    expect(state.user).toBeNull()
  })
})
