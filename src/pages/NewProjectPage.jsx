import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createProjectWithFirstSheet, readSettings } from '../database/repositories.js'
import { useWorkspaceStore } from '../stores/workspaceStore.js'
import { projectRoutePath } from '../domain/projectRoutes.js'

export function NewProjectPage() {
  const [name, setName] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const navigate = useNavigate(); const inputRef=useRef(null)
  const submit = async (event) => { event.preventDefault(); const trimmed = name.trim(); if (!trimmed || trimmed.length > 100) { setError('Enter a project name from 1 to 100 characters.'); inputRef.current?.focus(); return }; setSaving(true); try { await useWorkspaceStore.getState().guardNavigation(); const settings = await readSettings(); const { project } = await createProjectWithFirstSheet(trimmed, settings.defaultDarkMode,settings.defaultRemarkVisible); navigate(projectRoutePath(project)) } catch (reason) { setError(reason.message); inputRef.current?.focus() } finally { setSaving(false) } }
  return <div className="page-wrap"><p className="eyebrow">PROJECTS</p><h1>New project</h1><p className="subtitle">Start with a blank Sheet 1 stored locally in this browser.</p><form className="project-form" onSubmit={submit}><label>Project name<input ref={inputRef} name="projectName" autoFocus value={name} maxLength="100" onChange={(event) => { setName(event.target.value); setError('') }} aria-invalid={Boolean(error)} aria-describedby={error?'new-project-error':undefined} /></label>{error && <p id="new-project-error" className="form-error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary-button" type="button" onClick={async () => { try { await useWorkspaceStore.getState().guardNavigation(); navigate('/projects') } catch (reason) { setError(reason.message) } }}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create project'}</button></div></form></div>
}
