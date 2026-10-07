import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmDialog, Modal } from '../components/Modal.jsx'
import { createDemoProject, deleteProject, duplicateProject, exportProjectSnapshot, importProjectAsNew, listProjectsWithSheetCounts, renameProject } from '../database/repositories.js'
import { migrateBackup } from '../database/migrations.js'
import { JSON_BACKUP_LIMIT } from '../domain/constants.js'
import { createId, createProjectRecord, createSheetRecord } from '../domain/normalization.js'
import { projectRoutePath } from '../domain/projectRoutes.js'
import { notify } from '../stores/uiStore.js'
import { useWorkspaceStore } from '../stores/workspaceStore.js'
import { serializeBackupWithinLimit } from '../domain/backupSerialization.js'

export function ProjectsPage() {
  const [projects, setProjects] = useState([]); const [dialog, setDialog] = useState(null); const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const navigate = useNavigate(); const importInputRef = useRef(null)
  const load = useCallback(async () => {
    setLoading(true); setLoadError('')
    try { setProjects(await listProjectsWithSheetCounts()) }
    catch (error) { setLoadError(error.message); notify(`Unable to load projects: ${error.message}`, 'error') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    let current = true
    listProjectsWithSheetCounts().then((items) => { if (current) setProjects(items) })
      .catch((error) => { if (current) { setLoadError(error.message); notify(`Unable to load projects: ${error.message}`, 'error') } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [])
  const run = async (operation, message) => { try { await operation(); setDialog(null); await load(); if (message) notify(message) } catch (error) { notify(error.message, 'error') } }
  const addDemoProject = async () => {
    try {
      await useWorkspaceStore.getState().guardNavigation()
      const { project } = await createDemoProject()
      await load()
      notify('Riverside Community Centre sample added with Building Works, MEP Works, and Preliminaries. Illustrative rates include a few flagged review items.')
      navigate(projectRoutePath(project))
    } catch (error) { notify(`Could not add the sample estimate: ${error.message}`, 'error') }
  }
  const exportProject = async (project) => {
    try {
      const snapshot = await exportProjectSnapshot(project.id)
      if (!snapshot) throw new Error('Project no longer exists.')
      const backup = { backupType: 'boq-cost-load-project', schemaVersion: 1, exportedAt: new Date().toISOString(), ...snapshot }
      const url = URL.createObjectURL(new Blob([serializeBackupWithinLimit(backup, JSON_BACKUP_LIMIT)], { type: 'application/json' }))
      const link = document.createElement('a'); link.href = url; link.download = `${safeFilename(project.name)}.json`; link.click(); URL.revokeObjectURL(url)
      notify(`Exported ${project.name}.`)
    } catch (error) { notify(`Could not export project: ${error.message}`, 'error') }
  }
  const importProject = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (file.size > JSON_BACKUP_LIMIT) { notify(`Import rejected: files must be ${Math.floor(JSON_BACKUP_LIMIT / 1024 / 1024)} MB or smaller.`, 'error'); return }
    try {
      const parsed = JSON.parse(await file.text())
      const migrated = migrateBackup(parsed, { projectName: filenameBase(file.name) })
      const backup = migrated.backupType ? migrated : legacyWorksheetBackup(migrated, filenameBase(file.name))
      if (backup.backupType !== 'boq-cost-load-project') throw new Error('Choose a project backup or a supported legacy worksheet/workbook file.')
      const imported = await importProjectAsNew(backup)
      await load(); notify(`Imported ${imported.project.name} as a new project.`)
    } catch (error) { notify(`Import failed: ${error.message}`, 'error') }
  }
  return (
    <div className="page-wrap">
      <div className="page-heading">
        <div><p className="eyebrow">YOUR WORKSPACE</p><h1>Projects</h1><p className="subtitle">Create and manage your cost estimates in one place.</p></div>
        <div className="project-actions"><button className="secondary-button" type="button" onClick={addDemoProject}>Try realistic sample</button><button className="secondary-button" type="button" onClick={() => importInputRef.current?.click()}>Import project</button><Link className="primary-button" to="/projects/new">＋ New project</Link><input ref={importInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importProject} /></div>
      </div>
      {loading && <div className="placeholder-panel" role="status">Loading projects...</div>}
      {!loading && loadError && <div className="empty-state" role="alert"><h2>Unable to load projects</h2><p>{loadError}</p><button className="secondary-button" type="button" onClick={() => void load()}>Retry</button></div>}
      {!loading && !loadError && !projects.length && <div className="empty-state">
        <div className="empty-icon" aria-hidden="true">▤</div>
        <h2>Your project list is ready</h2>
        <p>Create a blank estimate or load a fictional community-centre estimate with three trade sheets.</p>
        <button className="secondary-button" type="button" onClick={addDemoProject}>Load realistic sample</button>
        <Link className="secondary-button" to="/projects/new">Create your first project</Link>
      </div>}
      {!loading && !loadError && !!projects.length && <div className="project-list">
          {projects.map((project) => <article className="project-card" key={project.id}><div><h2>{project.name}</h2><p>{project.sheetCount} {project.sheetCount === 1 ? 'sheet' : 'sheets'} · Created {formatTime(project.createdAt)} · Updated {formatTime(project.updatedAt)}</p></div><div className="project-actions"><button className="primary-button" type="button" onClick={async()=>{try{await useWorkspaceStore.getState().guardNavigation();navigate(projectRoutePath(project))}catch(error){notify(error.message,'error')}}}>Open</button><button className="secondary-button" type="button" onClick={() => exportProject(project)}>Export</button><button className="secondary-button" type="button" onClick={() => setDialog({ type: 'rename', project })}>Rename</button><button className="secondary-button" type="button" onClick={() => setDialog({ type: 'duplicate', project })}>Duplicate</button><button className="danger-button" type="button" onClick={() => setDialog({ type: 'delete', project })}>Delete</button></div></article>)}
      </div>}
      {(dialog?.type === 'rename' || dialog?.type === 'duplicate') && <ProjectNameDialog dialog={dialog} onClose={() => setDialog(null)} onSubmit={(name) => run(async () => {
        if (dialog.type === 'rename') {
          const renamed = await renameProject(dialog.project.id, name.trim())
          useWorkspaceStore.getState().syncProject(renamed)
        } else {
          await useWorkspaceStore.getState().guardNavigation()
          await duplicateProject(dialog.project.id, name.trim())
        }
      }, dialog.type === 'duplicate' ? 'Project duplicated.' : 'Project renamed.')} />}
      {dialog?.type === 'delete' && <ConfirmDialog title="Delete project" danger confirmLabel="Delete project" onClose={() => setDialog(null)} onConfirm={() => run(async () => { await deleteProject(dialog.project.id); if (useWorkspaceStore.getState().project?.id === dialog.project.id) useWorkspaceStore.getState().clear(); navigate('/projects') }, 'Project deleted.')}>Delete <strong>{dialog.project.name}</strong>? All of its sheets will be removed from this browser.</ConfirmDialog>}
    </div>
  )
}

function formatTime(value) { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function filenameBase(filename) { return filename.replace(/\.[^.]+$/, '').trim().slice(0, 100) || 'Imported Project' }
function safeFilename(name) { return name.replace(/[<>:"/\\|?*]/g, '-').split('').filter((character) => character.charCodeAt(0) >= 32).join('').trim() || 'project-backup' }
function legacyWorksheetBackup(data, projectName) {
  const timestamp = new Date().toISOString(); const projectId = createId(); const sheet = createSheetRecord(projectId, 'Sheet 1', 0, timestamp)
  sheet.data = data
  const project = { ...createProjectRecord(projectName, sheet.id, false, timestamp), id: projectId }
  return { backupType: 'boq-cost-load-project', schemaVersion: 1, exportedAt: timestamp, project, sheets: [sheet] }
}
function ProjectNameDialog({ dialog, onClose, onSubmit }) {
  const [name, setName] = useState(dialog.type === 'duplicate' ? `${dialog.project.name} Copy` : dialog.project.name); const [error, setError] = useState(''); const [submitting, setSubmitting] = useState(false); const submittingRef = useRef(false)
  const submit = async (event) => { event.preventDefault(); if(submittingRef.current)return; const trimmed = name.trim(); if (!trimmed || trimmed.length > 100) { setError('Enter a project name from 1 to 100 characters.'); return } submittingRef.current=true;setSubmitting(true);try{await onSubmit(trimmed)}finally{submittingRef.current=false;setSubmitting(false)} }
  return <Modal title={dialog.type === 'rename' ? 'Rename project' : 'Duplicate project'} onClose={onClose}><form onSubmit={submit}><div className="modal-body"><label>Project name<input name="projectName" autoFocus value={name} maxLength="100" onChange={(event) => {setName(event.target.value);setError('')}} aria-invalid={Boolean(error)} aria-describedby={error?'project-name-error':undefined} /></label>{error && <p id="project-name-error" className="form-error" role="alert">{error}</p>}</div><footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={submitting}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? 'Saving…' : dialog.type === 'rename' ? 'Rename' : 'Duplicate'}</button></footer></form></Modal>
}
