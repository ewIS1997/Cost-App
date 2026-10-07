import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { readSettings, writeSettings } from '../database/repositories.js'
import { useWorkspaceStore } from '../stores/workspaceStore.js'
import { notify, useUiStore } from '../stores/uiStore.js'
import { projectRoutePath } from '../domain/projectRoutes.js'
import { resolveDarkTheme } from '../domain/theme.js'

const links = [
  ['Projects', '/projects'],
  ['Settings', '/settings'],
]

export function AppLayout({ children }) {
  const location = useLocation()
  const navigate = useNavigate()
  const projectRouteActive = /^\/projects\/[^/]+\/(?:cost-load|resources|summary|reports)$/.test(location.pathname)
  const { project, saveStatus, retryFailedSaves } = useWorkspaceStore()
  const preferences=useUiStore((state)=>state.preferences)
  const fontFamily=preferences?.fontFamily??'inter'
  const [settings, setSettings] = useState(null)
  const previousHashRef = useRef(window.location.hash)
  const restoringHashRef = useRef(false)
  useEffect(() => { previousHashRef.current = window.location.hash }, [location.pathname, location.search, location.hash])
  useEffect(() => { readSettings().then((value)=>{setSettings(value);useUiStore.getState().setPreferences(value)}).catch((error) => notify(`Browser storage is unavailable: ${error.message}`, 'error')) }, [])
  useEffect(()=>{const refresh=()=>readSettings().then((value)=>{setSettings(value);useUiStore.getState().setPreferences(value)}).catch((error)=>notify(`Could not refresh preferences: ${error.message}`,'error'));window.addEventListener('boq-settings-updated',refresh);return()=>window.removeEventListener('boq-settings-updated',refresh)},[])
  useEffect(()=>{document.documentElement.dataset.appFont=fontFamily;return()=>{delete document.documentElement.dataset.appFont}},[fontFamily])
  const [systemDark,setSystemDark]=useState(()=>window.matchMedia?.('(prefers-color-scheme: dark)').matches??false)
  useEffect(()=>{const media=window.matchMedia?.('(prefers-color-scheme: dark)');if(!media)return;const change=(event)=>setSystemDark(event.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[])
  useEffect(() => { if (location.state?.unknownRoute) notify('Unknown route. Showing Projects.', 'warning') }, [location.state])
  useEffect(() => {
    const handler=(event)=>{
      const link=event.target.closest?.('a[href]')
      if(!link||link.target||link.hasAttribute('download')||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return
      const url=new URL(link.href,window.location.href)
      if(url.origin!==window.location.origin||url.hash===window.location.hash)return
      event.preventDefault()
      useWorkspaceStore.getState().guardNavigation().then(()=>navigate(url.hash.slice(1)||'/projects')).catch((error)=>notify(error.message,'error'))
    }
    const onExternalNavigation=(event)=>{
      if(restoringHashRef.current)return
      const target=window.location.hash
      const previous=previousHashRef.current
      if(target===previous)return
      const leavingCostLoad=previous.includes('/cost-load')&&target!==previous
      if(!leavingCostLoad||!useWorkspaceStore.getState().navigationGuard){previousHashRef.current=target;return}
      event.preventDefault()
      event.stopImmediatePropagation()
      restoringHashRef.current=true
      window.history.pushState(null,'',`${window.location.pathname}${window.location.search}${previous}`)
      restoringHashRef.current=false
      useWorkspaceStore.getState().guardNavigation().then(()=>{
        previousHashRef.current=target
        navigate(target.slice(1)||'/projects',{replace:true})
      }).catch((error)=>{
        navigate(previous.slice(1)||'/projects',{replace:true})
        notify(error.message,'error')
      })
    }
    document.addEventListener('click',handler,true)
    window.addEventListener('popstate',onExternalNavigation,true)
    window.addEventListener('hashchange',onExternalNavigation,true)
    return()=>{document.removeEventListener('click',handler,true);window.removeEventListener('popstate',onExternalNavigation,true);window.removeEventListener('hashchange',onExternalNavigation,true)}
  },[navigate])
  const dismissStorageNotice = async () => { try { const next = { ...settings, storageNoticeDismissed: true }; await writeSettings(next); setSettings(next);useUiStore.getState().setPreferences(next) } catch (error) { notify(`Could not save notice preference: ${error.message}`, 'error') } }
  // Explicit app-wide dark mode must also cover projects that were previously
  // saved in light mode. A project's own dark mode remains available otherwise.
  const warm=preferences?.theme==='warm'
  const dark=resolveDarkTheme(preferences?.theme,project?.darkMode,systemDark)

  return (
    <div className={`app-shell${dark?' theme-dark':''}${warm?' theme-warm':''} font-${preferences?.fontSize??'default'} density-${preferences?.density??'comfortable'}`} style={{'--app-font-scale':preferences?.fontSize==='small' ? 0.92 : preferences?.fontSize==='large' ? 1.08 : 1}}>
      <header className="app-topbar">
        <a className="brand" href="#/projects" aria-label="BOQ Cost Load home">
          <span className="brand-mark">B</span>
          <span>BOQ <strong>Cost Load</strong></span>
        </a>
        <nav aria-label="Main navigation" className="top-nav">
          {links.map(([label, to]) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'top-nav-link active' : 'top-nav-link'}>
              {label}
            </NavLink>
          ))}
        </nav>
        {projectRouteActive && project && <nav aria-label="Project pages" className="top-nav project-nav">
          <NavLink to={projectRoutePath(project, 'cost-load')} className={({ isActive }) => isActive ? 'top-nav-link active' : 'top-nav-link'}>Cost Load</NavLink>
          <NavLink to={projectRoutePath(project, 'resources')} className={({ isActive }) => isActive ? 'top-nav-link active' : 'top-nav-link'}>Resources</NavLink>
          <NavLink to={projectRoutePath(project, 'summary')} className={({ isActive }) => isActive ? 'top-nav-link active' : 'top-nav-link'}>Cost Summary</NavLink>
          <NavLink to={projectRoutePath(project, 'reports')} className={({ isActive }) => isActive ? 'top-nav-link active' : 'top-nav-link'}>Reports</NavLink>
        </nav>}
        <span className="topbar-label">{project ? project.name : 'PROJECT WORKSPACE'}</span>
        <span className="connection-state"><i /> {project ? saveStatus : 'Local workspace'}{project&&saveStatus==='Save failed'&&<button type="button" onClick={()=>retryFailedSaves().catch((error)=>notify(`Retry failed: ${error.message}`,'error'))}>Retry</button>}</span>
      </header>
      <main className="main-area">
        <section className="page-content">{children}</section>
        {settings && !settings.storageNoticeDismissed && <aside className="storage-notice" role="status"><span>Projects are stored in this browser, not in this HTML file. Keep JSON backups for important estimates.</span><button type="button" onClick={dismissStorageNotice}>Dismiss</button></aside>}
      </main>
    </div>
  )
}
