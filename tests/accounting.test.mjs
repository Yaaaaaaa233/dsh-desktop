import assert from 'node:assert/strict'
import { test } from 'node:test'
import { observeBalance } from '../packages/dsh-whale-widget/lib/accounting.mjs'

const at = Date.parse('2026-09-30T04:00:00Z')

test('legacy history survives migration and later observations', () => {
  const history = { '2026-09-29': 2.12, '2026-09-30': 0.52 }
  const ledger = { history: { ...history } }
  const first = observeBalance(ledger, { at, balance: 100, scope: 'demo' })
  assert.equal(first.amount, 0)
  assert.deepEqual(ledger.accounting.legacyHistory, history)
  const second = observeBalance(ledger, { at: at + 1000, balance: 99.97, scope: 'demo' })
  assert.equal(second.amount, 0.03)
  assert.deepEqual(ledger.accounting.legacyHistory, history)
})

test('a credit is kept distinct from observed consumption', () => {
  const ledger = {}
  observeBalance(ledger, { at, balance: 100, scope: 'demo' })
  observeBalance(ledger, { at: at + 1000, balance: 99, scope: 'demo' })
  const credit = observeBalance(ledger, { at: at + 2000, balance: 109, scope: 'demo' })
  assert.equal(credit.amount, 1)
  assert.equal(credit.observedIncrease, 10)
  assert.equal(credit.needsReview, true)
})

test('invalid observations cannot replace the caller ledger', () => {
  const ledger = { history: { '2026-09-29': 1 } }
  const previous = structuredClone(ledger)
  assert.throws(() => observeBalance(ledger, { at, balance: 100, scope: '../account' }))
  assert.deepEqual(ledger, previous)
  assert.throws(() => observeBalance(ledger, { at, balance: Infinity, scope: 'demo' }))
  assert.deepEqual(ledger, previous)
})
