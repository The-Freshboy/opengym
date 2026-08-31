import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Personal from './Personal.jsx'

vi.mock('../store/useStore.js', () => {
  const store = { S: { workouts: [], customEx: [], goalResults: [], personal: {}, goals: [
    { id: 'hang', kind: 'hang', name: 'Hang goal', target: 25, unit: 'seconds' },
    { id: 'climb', kind: 'climbing', name: 'Climbing goal', target: 1, unit: 'sessions' },
    { id: 'beep', kind: 'beep', name: 'Beep goal', target: 7, targetShuttle: 5 }
  ] }, user: null, config: {}, update: () => {} }
  return { useStore: selector => selector ? selector(store) : store }
})
vi.mock('../store/useUI.js', () => ({ useUI: selector => selector({ toast: () => {} }) }))

describe('personal screen with existing goals', () => {
  it('renders every goal alongside the weekly dashboard', () => {
    const html = renderToStaticMarkup(<MemoryRouter><Personal /></MemoryRouter>)
    expect(html).toContain('Hang goal')
    expect(html).toContain('Climbing goal')
    expect(html).toContain('Beep goal')
    expect(html).toContain('completed sessions')
  })
})
