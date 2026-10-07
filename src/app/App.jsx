import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom'
import { AppLayout } from './AppLayout.jsx'
import { ErrorBoundary } from '../components/ErrorBoundary.jsx'
import { ToastRegion } from '../components/ToastRegion.jsx'
import { notify } from '../stores/uiStore.js'
import { useWorkspaceStore } from '../stores/workspaceStore.js'
import { CostLoadPage } from '../pages/CostLoadPage.jsx'
import { NewProjectPage } from '../pages/NewProjectPage.jsx'
import { ProjectsPage } from '../pages/ProjectsPage.jsx'
import { ReportsPage } from '../pages/ReportsPage.jsx'
import { SettingsPage } from '../pages/SettingsPage.jsx'
import { SummaryPage } from '../pages/SummaryPage.jsx'
import { ResourcesPage } from '../pages/ResourcesPage.jsx'
import { listProjectsWithSheetCounts } from '../database/repositories.js'
import { canonicalProjectRoutePath, findProjectByRouteSegment } from '../domain/projectRoutes.js'

export function App() {
  return (
    <ErrorBoundary><HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/new" element={<NewProjectPage />} />
          <Route path="/projects/:projectRoute/cost-load" element={<ProjectRoute section="cost-load"><CostLoadPage /></ProjectRoute>} />
          <Route path="/projects/:projectRoute/resources" element={<ProjectRoute section="resources"><ResourcesPage /></ProjectRoute>} />
          <Route path="/projects/:projectRoute/summary" element={<ProjectRoute section="summary"><SummaryPage /></ProjectRoute>} />
          <Route path="/projects/:projectRoute/reports" element={<ProjectRoute section="reports"><ReportsPage /></ProjectRoute>} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/projects" replace state={{ unknownRoute: true }} />} />
        </Routes>
      </AppLayout><ToastRegion />
    </HashRouter></ErrorBoundary>
  )
}

function ProjectRoute({ children, section }) {
  const { projectRoute } = useParams(); const navigate = useNavigate(); const location = useLocation(); const [readyRoute, setReadyRoute] = useState(null); const load = useWorkspaceStore((state) => state.load)
  useEffect(() => {
    let cancelled = false
    const openProject = async () => {
      try {
        const projects = await listProjectsWithSheetCounts()
        if (cancelled) return
        const project = findProjectByRouteSegment(projects, projectRoute)
        if (!project) { notify('That project no longer exists.', 'error'); navigate('/projects', { replace: true }); return }
        const canonicalPath = canonicalProjectRoutePath(projects, projectRoute, section)
        if (location.pathname !== canonicalPath) { navigate(`${canonicalPath}${location.search}${location.hash}`, { replace: true }); return }
        const loaded = await load(project.id)
        if (cancelled) return
        if (!loaded) { notify('That project no longer exists.', 'error'); navigate('/projects', { replace: true }) }
        else setReadyRoute(projectRoute)
      } catch (error) {
        if (!cancelled) { notify(`Unable to open project: ${error.message}`, 'error'); navigate('/projects', { replace: true }) }
      }
    }
    openProject()
    return () => { cancelled = true }
  }, [load, navigate, location.hash, location.pathname, location.search, projectRoute, section])
  return readyRoute === projectRoute ? children : <div className="placeholder-panel">Opening project...</div>
}
