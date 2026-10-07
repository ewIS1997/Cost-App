import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_FONT_FAMILIES, createAppSettings } from './normalization.js'
import { validateSettings } from './validation.js'
import { migrateAppSettings } from '../database/migrations.js'

test('new app settings default to Inter and accept each supported font family', () => {
  const settings = createAppSettings()
  assert.equal(settings.schemaVersion, 3)
  assert.equal(settings.fontFamily, 'inter')
  assert.deepEqual(validateSettings(settings), [])
  for (const fontFamily of APP_FONT_FAMILIES) {
    assert.deepEqual(validateSettings({ ...settings, fontFamily }), [])
  }
})

test('settings validation rejects unsupported font families', () => {
  assert.match(validateSettings({ ...createAppSettings(), fontFamily: 'comic-sans' }).join(' '), /invalid schema or field value/)
})

test('schema 1 and 2 settings migrate to schema 3 with the Inter default', () => {
  for (const schemaVersion of [1, 2]) {
    const oldSettings = { ...createAppSettings(), schemaVersion, theme: 'dark', fontSize: 'large' }
    delete oldSettings.fontFamily
    const migrated = migrateAppSettings(oldSettings)
    assert.equal(migrated.schemaVersion, 3)
    assert.equal(migrated.fontFamily, 'inter')
    assert.equal(migrated.theme, 'dark')
    assert.equal(migrated.fontSize, 'large')
    assert.deepEqual(validateSettings(migrated), [])
  }
})

test('settings migration preserves a supported font value when upgrading an older record', () => {
  const migrated = migrateAppSettings({ ...createAppSettings(), schemaVersion: 2, fontFamily: 'manrope' })
  assert.equal(migrated.schemaVersion, 3)
  assert.equal(migrated.fontFamily, 'manrope')
})
