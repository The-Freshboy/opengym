import { describe, expect, it } from 'vitest'
import { filterHistory } from './history-search.js'

const records = [
  { id: '1', name: 'Push Day', entries: [{ id: 'bench-press' }] },
  { id: '2', kind: 'activity', name: 'Bouldering', activityType: 'Climbing', location: 'City gym', entries: [] },
  { id: '3', name: 'Pull Day', incomplete: true, note: 'Short session', entries: [] }
]

describe('history search', () => {
  it('shows newest records first', () => expect(filterHistory(records).map(x => x.id)).toEqual(['3', '2', '1']))
  it('filters workouts, activities and incomplete sessions', () => {
    expect(filterHistory(records, '', 'workouts').map(x => x.id)).toEqual(['3', '1'])
    expect(filterHistory(records, '', 'activities').map(x => x.id)).toEqual(['2'])
    expect(filterHistory(records, '', 'incomplete').map(x => x.id)).toEqual(['3'])
  })
  it('searches names and activity details', () => {
    expect(filterHistory(records, 'climbing').map(x => x.id)).toEqual(['2'])
    expect(filterHistory(records, 'short session').map(x => x.id)).toEqual(['3'])
  })
})
