import { ArrowDown, ArrowUp, Search } from 'lucide-react'
import { Modal } from '../../components/Modal.jsx'

export function FindReplaceDialog({
  onClose, findInputRef, replaceInputRef, findText, onFindTextChange,
  currentFindIndex, findMatches, goToFindMatch, showReplace, replaceWith,
  onReplaceWithChange, replaceCurrentMatch, replaceAllMatches, findMatchCount,
  findSelectionOnly, findMatchCase, onMatchCaseChange, findEntireCell,
  onEntireCellChange, findSelectionCandidate, setFindSelectionScope,
  onToggleReplace, findMessage,
}) {
  return <Modal title="Find & Replace" onClose={onClose}>
    <div className="modal-body find-replace-content">
      <label className="find-replace-field"><span className="find-field-caption">Find in worksheet</span>
        <div className="find-input-wrap"><Search aria-hidden="true" /><input ref={findInputRef} type="search" value={findText} placeholder="Type a word, code, or value…" aria-label="Find in worksheet" onChange={onFindTextChange} onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); goToFindMatch(event.shiftKey ? -1 : 1) }
        }} />
          {findText.trim() && <span className="find-result-count">{currentFindIndex >= 0 && findMatches.length ? currentFindIndex + 1 : 0} / {findMatches.length}</span>}
          <button type="button" className="find-input-nav" aria-label="Previous match" title="Previous match (Shift+Enter)" onClick={() => goToFindMatch(-1)} disabled={!findText.trim()}><ArrowUp /></button>
          <button type="button" className="find-input-nav" aria-label="Next match" title="Next match (Enter)" onClick={() => goToFindMatch(1)} disabled={!findText.trim()}><ArrowDown /></button>
        </div>
      </label>
      {showReplace && <label className="find-replace-field replace-field"><span className="find-field-caption">Replace with</span>
        <div className="find-input-wrap replace-input-wrap"><input ref={replaceInputRef} type="text" value={replaceWith} placeholder="Enter replacement text…" aria-label="Replace with" onChange={onReplaceWithChange} onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); replaceCurrentMatch() }
        }} /></div>
      </label>}
      <div className="find-replace-meta" aria-live="polite">
        <div className="find-match-summary"><span className="find-match-label">Matches</span><span className="find-match-count">{findText.trim() ? findMatchCount : '—'}</span><span className="find-match-context">{findText.trim() ? (findMatchCount === 1 ? 'result' : 'results') : 'Ready to search'}</span><span className="find-scope-label">{findSelectionOnly ? 'Current selection' : 'Visible cells'}</span>{findMatchCount > 500 && <small>First 500 results available for navigation</small>}</div>
        <div className="find-options" role="group" aria-label="Search options">
          <label className="find-option-chip"><input type="checkbox" checked={findMatchCase} onChange={onMatchCaseChange} /><span>Match case</span></label>
          <label className="find-option-chip"><input type="checkbox" checked={findEntireCell} onChange={onEntireCellChange} /><span>Entire cell</span></label>
          <label className={`find-option-chip${findSelectionOnly ? ' is-active' : ''}`}><input type="checkbox" checked={findSelectionOnly} disabled={!findSelectionOnly && !findSelectionCandidate} onChange={(event) => setFindSelectionScope(event.target.checked)} /><span>Current selection</span></label>
        </div>
        <button type="button" className={`find-toggle-replace${showReplace ? ' is-open' : ''}`} aria-expanded={showReplace} onClick={onToggleReplace}><span>{showReplace ? 'Hide replace controls' : 'Replace matches'}</span><kbd>Ctrl+H</kbd><span className="find-toggle-indicator" aria-hidden="true">{showReplace ? '−' : '+'}</span></button>
      </div>
      {currentFindIndex >= 0 && findMatches[currentFindIndex] && <p className="find-replace-location"><span>Current result</span><strong>{currentFindIndex + 1} of {findMatchCount}</strong><span>{findMatches[currentFindIndex].columnLabel}</span><span>Row {findMatches[currentFindIndex].rowIndex + 1}</span></p>}
      {findMessage && <p className="find-replace-message" role="status">{findMessage}</p>}
      <div className="find-replace-actions">
        {!showReplace && <span className="find-keyboard-hint"><kbd>Enter</kbd> next <span>·</span> <kbd>Shift</kbd>+<kbd>Enter</kbd> previous</span>}
        <span className="find-actions-spacer" />
        {showReplace && <>
          <button type="button" className="secondary-button" onClick={replaceCurrentMatch} disabled={!findText.trim() || !findMatches.length}>Replace</button>
          <button type="button" className="primary-button" onClick={replaceAllMatches} disabled={!findText.trim() || !findMatches.length}>Replace all</button>
        </>}
      </div>
    </div>
  </Modal>
}
