export function slugifyProjectName(name) {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'project'
}

export function getProjectRouteSlug(project) {
  return project?.routeSlug || slugifyProjectName(project?.name)
}

export function createUniqueProjectRouteSlug(name, projects = [], excludeProjectId = null) {
  const occupied = new Set()
  for (const project of projects) {
    if (project.id) occupied.add(project.id)
    if (project.id === excludeProjectId) continue
    occupied.add(getProjectRouteSlug(project))
    for (const alias of project.routeAliases ?? []) occupied.add(alias)
  }
  const base = slugifyProjectName(name)
  if (!occupied.has(base)) return base
  let suffix = 2
  while (occupied.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function projectRoutePath(project, section = 'cost-load') {
  return `/projects/${getProjectRouteSlug(project)}/${section}`
}

export function findProjectByRouteSegment(projects, segment) {
  return projects.find((project) => project.id === segment)
    ?? projects.find((project) => getProjectRouteSlug(project) === segment)
    ?? projects.find((project) => (project.routeAliases ?? []).includes(segment))
    ?? null
}

export function canonicalProjectRoutePath(projects, segment, section = 'cost-load') {
  const project = findProjectByRouteSegment(projects, segment)
  return project ? projectRoutePath(project, section) : null
}

export function validateProjectRouteIdentities(projects = []) {
  const errors = []
  const ids = new Set(projects.map((project) => project.id))
  const currentSlugs = new Map()
  const aliases = new Map()

  for (const project of projects) {
    const slug = getProjectRouteSlug(project)
    if (ids.has(slug)) errors.push(`Project route slug "${slug}" conflicts with a project ID.`)
    if (currentSlugs.has(slug)) errors.push(`Project route slug "${slug}" is used by multiple projects.`)
    else currentSlugs.set(slug, project.id)
    for (const alias of project.routeAliases ?? []) {
      if (ids.has(alias)) errors.push(`Project route alias "${alias}" conflicts with a project ID.`)
      if (aliases.has(alias)) errors.push(`Project route alias "${alias}" is used by multiple projects.`)
      else aliases.set(alias, project.id)
    }
  }

  for (const [alias, projectId] of aliases) {
    const currentProjectId = currentSlugs.get(alias)
    if (currentProjectId) errors.push(`Project route alias "${alias}" conflicts with the current slug for project ${currentProjectId}.`)
    if (projectId && currentProjectId === projectId) errors.push(`Project route alias "${alias}" duplicates its current project slug.`)
  }
  return [...new Set(errors)]
}
