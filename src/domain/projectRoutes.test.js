import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalProjectRoutePath, createUniqueProjectRouteSlug, findProjectByRouteSegment, getProjectRouteSlug, projectRoutePath, slugifyProjectName, validateProjectRouteIdentities } from './projectRoutes.js'

test('project name slugs are readable and do not contain generated IDs', () => {
  assert.equal(slugifyProjectName('Riverside Community Centre — Estimate'), 'riverside-community-centre-estimate')
  assert.equal(projectRoutePath({ id: 'random-id', name: 'My Estimate' }), '/projects/my-estimate/cost-load')
})

test('duplicate project names receive readable numeric suffixes', () => {
  const projects = [{ id: 'one', name: 'My Estimate', routeSlug: 'my-estimate' }, { id: 'two', name: 'My Estimate', routeSlug: 'my-estimate-2' }]
  assert.equal(createUniqueProjectRouteSlug('My Estimate', projects), 'my-estimate-3')
  assert.equal(createUniqueProjectRouteSlug('Another Project', projects), 'another-project')
})

test('project route matching supports current slugs, rename aliases, and old ID URLs', () => {
  const project = { id: 'legacy-random-id', name: 'Updated Estimate', routeSlug: 'updated-estimate', routeAliases: ['old-estimate'] }
  assert.equal(getProjectRouteSlug(project), 'updated-estimate')
  assert.equal(findProjectByRouteSegment([project], 'updated-estimate'), project)
  assert.equal(findProjectByRouteSegment([project], 'old-estimate'), project)
  assert.equal(findProjectByRouteSegment([project], 'legacy-random-id'), project)
})

test('canonical routes preserve each requested project section for slugs, aliases, and legacy IDs', () => {
  const project = { id: 'legacy-random-id', name: 'Updated Estimate', routeSlug: 'updated-estimate', routeAliases: ['old-estimate'] }
  const sections = ['cost-load', 'resources', 'summary', 'reports']

  for (const section of sections) {
    const expected = `/projects/updated-estimate/${section}`
    assert.equal(canonicalProjectRoutePath([project], 'updated-estimate', section), expected)
    assert.equal(canonicalProjectRoutePath([project], 'old-estimate', section), expected)
    assert.equal(canonicalProjectRoutePath([project], project.id, section), expected)
  }
  assert.equal(canonicalProjectRoutePath([project], 'missing-project', 'reports'), null)
})

test('unique route slugs reserve project IDs and route identity validation rejects conflicts', () => {
  const id = '12345678-abcd-1234-abcd-123456789012'
  const project = { id, name: 'Estimate', routeSlug: 'estimate', routeAliases: ['old-estimate'] }
  assert.notEqual(createUniqueProjectRouteSlug(id, [project]), id)
  assert.deepEqual(validateProjectRouteIdentities([project]), [])
  assert.ok(validateProjectRouteIdentities([
    project,
    { id: 'two', name: 'Other', routeSlug: 'other', routeAliases: ['old-estimate'] },
  ]).some((error) => error.includes('alias "old-estimate" is used by multiple projects')))
  assert.ok(validateProjectRouteIdentities([
    project,
    { id: 'two', name: 'Other', routeSlug: id, routeAliases: [] },
  ]).some((error) => error.includes('conflicts with a project ID')))
})
