import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveDarkTheme } from './theme.js'

test('explicit app themes override the saved project and system themes', () => {
  assert.equal(resolveDarkTheme('light', true, true), false)
  assert.equal(resolveDarkTheme('dark', false, false), true)
  assert.equal(resolveDarkTheme('warm', true, true), false)
})

test('system theme follows the project choice when open and the device otherwise', () => {
  assert.equal(resolveDarkTheme('system', true, false), true)
  assert.equal(resolveDarkTheme('system', false, true), false)
  assert.equal(resolveDarkTheme('system', null, true), true)
})
