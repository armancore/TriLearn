import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import useApi from '../src/hooks/useApi'

const HookHarness = ({ request }) => {
  const { data, error, loading, execute } = useApi({ initialData: [] })

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void execute(request, {
            transform: (response) => response.data.items
          }).catch(() => null)
        }}
      >
        Run
      </button>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="data">{JSON.stringify(data)}</span>
      <span data-testid="error">{error}</span>
    </div>
  )
}

describe('useApi', () => {
  it('stores transformed data after a successful request', async () => {
    const request = vi.fn(async (signal) => {
      expect(signal).toBeInstanceOf(AbortSignal)
      return { data: { items: ['one', 'two'] } }
    })

    render(<HookHarness request={request} />)
    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    await waitFor(() => {
      expect(screen.getByTestId('data')).toHaveTextContent('["one","two"]')
    })
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('captures friendly request errors', async () => {
    const request = vi.fn(async () => {
      const error = new Error('Too many requests')
      error.response = { status: 429, data: { message: 'Slow down a bit.' }, headers: {} }
      throw error
    })

    render(<HookHarness request={request} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    })

    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Slow down a bit.')
    })
  })
})
