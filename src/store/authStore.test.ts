import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from './authStore'

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ privyUserId: null, displayName: null })
  })

  it('initial state should be null', () => {
    const state = useAuthStore.getState()
    expect(state.privyUserId).toBeNull()
    expect(state.displayName).toBeNull()
  })

  it('setPrivyUser should set userId and displayName', () => {
    useAuthStore.getState().setPrivyUser('did:privy:abc123', 'user@example.com')

    const state = useAuthStore.getState()
    expect(state.privyUserId).toBe('did:privy:abc123')
    expect(state.displayName).toBe('user@example.com')
  })

  it('signOut should clear all state', () => {
    useAuthStore.setState({
      privyUserId: 'did:privy:abc123',
      displayName: 'user@example.com',
    })

    useAuthStore.getState().signOut()

    const state = useAuthStore.getState()
    expect(state.privyUserId).toBeNull()
    expect(state.displayName).toBeNull()
  })
})
