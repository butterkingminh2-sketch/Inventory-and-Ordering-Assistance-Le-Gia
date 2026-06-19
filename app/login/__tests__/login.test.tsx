import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import LoginPage from '../page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { role: 'foh' } }),
    }),
  }),
}))

describe('LoginPage', () => {
  it('renders email and password inputs', () => {
    render(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/mật khẩu/i)).toBeInTheDocument()
  })

  it('renders submit button', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /đăng nhập/i })).toBeInTheDocument()
  })
})
