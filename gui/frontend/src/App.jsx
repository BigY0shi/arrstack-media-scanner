import { useState, useEffect, useRef, useCallback } from 'react'
import './index.css'

// ─── API helpers ────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || ''

async function apiFetch(path, opts = {}) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}

// ─── Icons (inline SVG components) ──────────────────────────────────────────
const Icon = ({ d, size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
    strokeLinejoin="round" className={className}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
)
const icons = {
  home:    'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  scan:    ['M12 2v4', 'M12 18v4', 'M4.93 4.93l2.83 2.83', 'M16.24 16.24l2.83 2.83', 'M2 12h4', 'M18 12h4', 'M4.93 19.07l2.83-2.83', 'M16.24 7.76l2.83-2.83'],
  reports: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  history: 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  settings:'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  play:    'M5 3l14 9-14 9V3z',
  check:   'M20 6L9 17l-5-5',
  x:       'M18 6L6 18M6 6l12 12',
  alert:   ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  folder:  'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  copy:    ['M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 0 2 2v1'],
  chevron: 'M6 9l6 6 6-6',
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    done:    { label: 'Done',    cls: 'badge-success' },
    running: { label: 'Running', cls: 'badge-warning' },
    error:   { label: 'Error',   cls: 'badge-error' },
    pending: { label: 'Pending', cls: 'badge-neutral' },
  }
  const { label, cls } = map[status] || { label: status, cls: 'badge-neutral' }
  return <span className={`badge ${cls}`}>{label}</span>
}

function CheckToggle({ id, label, description, checked, onChange }) {
  return (
    <div className="check-toggle" onClick={() => onChange(!checked)}>
      <div className="check-toggle-text">
        <span className="check-label">{label}</span>
        <span className="check-desc">{description}</span>
      </div>
      <div className={`toggle ${checked ? 'on' : 'off'}`}>
        <div className="toggle-knob" />
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`stat-card ${accent ? 'stat-accent' : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

function Spinner() {
  return <div className="spinner" />
}

// ─── Views ───────────────────────────────────────────────────────────────────

function DashboardView({ status, onRunScan, scanState }) {
  if (!status) return <div className="loading"><Spinner /><span>Loading status…</span></div>

  const checks = status.active_checks || {}
  const activeCount = Object.values(checks).filter(Boolean).length
  const lastScan = status.last_scan

  function fmtDate(iso) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }

  return (
    <div className="view-content">
      <div className="view-header">
        <h1 className="view-title">Overview</h1>
        <button
          className={`btn-primary ${scanState.running ? 'btn-disabled' : ''}`}
          onClick={onRunScan}
          disabled={scanState.running}
        >
          {scanState.running
            ? <><Spinner /> Scanning…</>
            : <><Icon d={icons.play} size={16} /> Run Scan Now</>
          }
        </button>
      </div>

      <div className="stat-grid">
        <StatCard label="Reports Available" value={status.report_count ?? '—'} />
        <StatCard label="Active Checks" value={activeCount} sub="of 5" accent />
        <StatCard
          label="Last Scan"
          value={lastScan ? fmtDate(lastScan.started) : 'Never'}
          sub={lastScan ? <StatusBadge status={lastScan.status} /> : null}
        />
        <StatCard
          label="Cron Schedule"
          value={status.cron_enabled ? status.cron_expression : 'Disabled'}
          sub={status.cron_enabled ? 'Biweekly active' : 'Manual only'}
        />
      </div>

      {scanState.running && (
        <div className="log-panel">
          <div className="log-header">
            <Icon d={icons.scan} size={14} />
            <span>Live scan output</span>
          </div>
          <div className="log-body">
            {scanState.log.length === 0
              ? <span className="log-placeholder">Starting…</span>
              : scanState.log.map((line, i) => <div key={i} className="log-line">{line}</div>)
            }
          </div>
        </div>
      )}

      {!scanState.running && scanState.log.length > 0 && (
        <div className="log-panel log-panel-done">
          <div className="log-header">
            <Icon d={icons.check} size={14} className="icon-success" />
            <span>Last scan output ({scanState.status})</span>
          </div>
          <div className="log-body">
            {scanState.log.slice(-30).map((line, i) => <div key={i} className="log-line">{line}</div>)}
          </div>
        </div>
      )}

      <div className="section-title">Active Checks</div>
      <div className="check-summary">
        {Object.entries(checks).map(([key, val]) => (
          <div key={key} className={`check-chip ${val ? 'chip-on' : 'chip-off'}`}>
            <Icon d={val ? icons.check : icons.x} size={12} />
            {key.replace(/_/g, ' ')}
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportsView() {
  const [reportSets, setReportSets] = useState(null)
  const [selected, setSelected] = useState(null)
  const [report, setReport] = useState(null)
  const [activeTab, setActiveTab] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    apiFetch('/api/reports').then(setReportSets).catch(console.error)
  }, [])

  async function loadReport(ts) {
    setSelected(ts)
    setReport(null)
    setLoading(true)
    try {
      const data = await apiFetch(`/api/reports/${ts}`)
      setReport(data)
      setActiveTab(0)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const TABS = [
    { key: '1_stray_files',        label: 'Stray Files' },
    { key: '2_duplicates_by_name', label: 'Duplicates (Name)' },
    { key: '3_duplicates_by_hash', label: 'Duplicates (Hash)' },
    { key: '4_non_hd',             label: 'Non-HD' },
    { key: '5_non_english',        label: 'Non-English' },
  ]

  function countItems(data, tabKey) {
    if (!data || !data[tabKey]) return 0
    const cats = data[tabKey].categories || {}
    return Object.values(cats).reduce((sum, arr) => sum + (arr?.length || 0), 0)
  }

  function fmtTs(ts) {
    const y = ts.slice(0,4), mo = ts.slice(4,6), d = ts.slice(6,8)
    const h = ts.slice(9,11), mi = ts.slice(11,13)
    return `${y}-${mo}-${d} ${h}:${mi}`
  }

  return (
    <div className="view-content">
      <div className="view-header">
        <h1 className="view-title">Reports</h1>
      </div>

      <div className="reports-layout">
        <div className="report-list">
          <div className="section-title">Scan Results</div>
          {!reportSets ? <Spinner /> : reportSets.length === 0
            ? <div className="empty-state">No reports yet. Run a scan first.</div>
            : reportSets.map(rs => (
              <div
                key={rs.timestamp}
                className={`report-item ${selected === rs.timestamp ? 'report-item-active' : ''}`}
                onClick={() => loadReport(rs.timestamp)}
              >
                <Icon d={icons.folder} size={14} />
                <div className="report-item-text">
                  <span className="report-ts">{fmtTs(rs.timestamp)}</span>
                  <span className="report-file-count">{rs.files?.length || 0} files</span>
                </div>
              </div>
            ))
          }
        </div>

        <div className="report-detail">
          {!selected && <div className="empty-state">Select a report set to view</div>}
          {selected && loading && <Spinner />}
          {selected && report && (
            <>
              <div className="tab-bar">
                {TABS.map((tab, i) => {
                  const count = countItems(report, tab.key)
                  return (
                    <button
                      key={tab.key}
                      className={`tab ${activeTab === i ? 'tab-active' : ''} ${count > 0 ? 'tab-has-items' : ''}`}
                      onClick={() => setActiveTab(i)}
                    >
                      {tab.label}
                      {count > 0 && <span className="tab-badge">{count}</span>}
                    </button>
                  )
                })}
              </div>
              <ReportTable data={report[TABS[activeTab].key]} tabKey={TABS[activeTab].key} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ReportTable({ data, tabKey }) {
  if (!data) return <div className="empty-state">No data for this report.</div>
  const cats = data.categories || {}
  const allItems = Object.entries(cats).flatMap(([cat, items]) =>
    (items || []).map(item => ({ ...item, _cat: cat }))
  )
  if (allItems.length === 0) return (
    <div className="empty-state success-state">
      <Icon d={icons.check} size={20} className="icon-success" />
      <span>Nothing to report — all clear!</span>
    </div>
  )

  // Render by report type
  if (tabKey === '1_stray_files') {
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead><tr><th>Category</th><th>File</th><th>Size</th><th>Issue</th><th>Suggested Folder</th></tr></thead>
          <tbody>
            {allItems.map((item, i) => (
              <tr key={i}>
                <td><span className="cat-badge">{item._cat}</span></td>
                <td className="file-path">{item.file}</td>
                <td className="num">{item.size_mb} MB</td>
                <td className="issue-text">{item.issue}</td>
                <td className="file-path muted">{item.suggested_folder || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (tabKey === '2_duplicates_by_name') {
    return (
      <div className="dup-groups">
        {allItems.map((group, i) => (
          <div key={i} className="dup-group">
            <div className="dup-group-header">
              <span className="cat-badge">{group._cat}</span>
              <span className="dup-title">{group.parsed_title}</span>
              {group.season && <span className="dup-season">{group.season}</span>}
              <span className="dup-count">{group.file_count} files</span>
            </div>
            {(group.files || []).map((f, j) => (
              <div key={j} className={`dup-file ${f.action?.includes('KEEP') ? 'dup-keep' : 'dup-remove'}`}>
                <Icon d={f.action?.includes('KEEP') ? icons.check : icons.alert} size={13} />
                <span className="dup-file-path">{f.file}</span>
                <span className="dup-res">{f.resolution}p</span>
                <span className="dup-size">{f.size_mb} MB</span>
                <span className="dup-action">{f.action}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (tabKey === '3_duplicates_by_hash') {
    return (
      <div className="dup-groups">
        {allItems.map((group, i) => (
          <div key={i} className="dup-group">
            <div className="dup-group-header">
              <span className="cat-badge">{group._cat}</span>
              <span className="dup-title hash-text">{group.hash}</span>
              <span className="dup-count">{group.file_count} exact duplicates</span>
            </div>
            {(group.files || []).map((f, j) => (
              <div key={j} className={`dup-file ${f.action === 'KEEP' ? 'dup-keep' : 'dup-remove'}`}>
                <Icon d={f.action === 'KEEP' ? icons.check : icons.copy} size={13} />
                <span className="dup-file-path">{f.file}</span>
                <span className="dup-size">{f.size_mb} MB</span>
                <span className="dup-action">{f.action}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (tabKey === '4_non_hd') {
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead><tr><th>Category</th><th>Title</th><th>Best Res</th><th>Files</th></tr></thead>
          <tbody>
            {allItems.map((item, i) => (
              <tr key={i}>
                <td><span className="cat-badge">{item._cat}</span></td>
                <td>{item.parsed_title} {item.season && <span className="dup-season">{item.season}</span>}</td>
                <td><span className="badge badge-error">{item.best_resolution}p</span></td>
                <td className="muted">{item.files?.map(f => f.file).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (tabKey === '5_non_english') {
    return (
      <div className="table-wrapper">
        <table className="data-table">
          <thead><tr><th>Category</th><th>File</th><th>Size</th><th>Reasons</th></tr></thead>
          <tbody>
            {allItems.map((item, i) => (
              <tr key={i}>
                <td><span className="cat-badge">{item._cat}</span></td>
                <td className="file-path">{item.file}</td>
                <td className="num">{item.size_mb} MB</td>
                <td className="issue-text">{item.reasons?.join('; ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return <pre className="raw-json">{JSON.stringify(data, null, 2)}</pre>
}

function HistoryView() {
  const [history, setHistory] = useState(null)
  useEffect(() => { apiFetch('/api/history').then(setHistory).catch(console.error) }, [])

  function fmtDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }
  function duration(start, end) {
    if (!start || !end) return '—'
    const s = Math.round((new Date(end) - new Date(start)) / 1000)
    if (s < 60) return `${s}s`
    return `${Math.floor(s/60)}m ${s%60}s`
  }

  return (
    <div className="view-content">
      <div className="view-header">
        <h1 className="view-title">Scan History</h1>
      </div>
      {!history ? <Spinner /> : history.length === 0
        ? <div className="empty-state">No scans recorded yet.</div>
        : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Started</th><th>Duration</th><th>Status</th><th>Checks Run</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td>{fmtDate(h.started)}</td>
                    <td className="num">{duration(h.started, h.finished)}</td>
                    <td><StatusBadge status={h.status} /></td>
                    <td className="checks-cell">
                      {Object.entries(h.checks || {}).filter(([,v]) => v).map(([k]) => (
                        <span key={k} className="check-chip chip-on" style={{fontSize:'11px', padding:'2px 6px'}}>
                          {k.replace(/_/g,' ')}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  )
}

function SettingsView({ config, onSave }) {
  const [local, setLocal] = useState(config ? JSON.parse(JSON.stringify(config)) : null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (config && !local) setLocal(JSON.parse(JSON.stringify(config)))
  }, [config])

  if (!local) return <div className="loading"><Spinner /></div>

  function setCheck(key, val) {
    setLocal(prev => ({ ...prev, checks: { ...prev.checks, [key]: val } }))
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await apiFetch('/api/config', { method: 'POST', body: JSON.stringify(local) })
      onSave(local)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  const CHECK_META = {
    stray_files:        { label: 'Stray File Detection', desc: 'Flag files not in the correct subfolder structure' },
    duplicates_by_name: { label: 'Name-Based Duplicates', desc: 'Match duplicates by parsed title + resolution (strips studio/codec tags)' },
    duplicates_by_hash: { label: 'Hash-Based Duplicates', desc: 'Exact byte-for-byte duplicates via partial MD5' },
    non_hd:             { label: 'Non-HD Detection', desc: 'Flag titles with no 720p+ version available' },
    non_english:        { label: 'Non-English Detection', desc: 'Flag files with no English audio track (filename + ffprobe)' },
  }

  const CRON_PRESETS = [
    { label: 'Daily at 4am',               value: '0 4 * * *' },
    { label: 'Biweekly (1st & 15th) 4am',  value: '0 4 1,15 * *' },
    { label: 'Weekly (Sunday) 4am',        value: '0 4 * * 0' },
    { label: 'Monthly (1st) 4am',          value: '0 4 1 * *' },
  ]

  return (
    <div className="view-content">
      <div className="view-header">
        <h1 className="view-title">Settings</h1>
        <button className={`btn-primary ${saving ? 'btn-disabled' : ''}`} onClick={handleSave} disabled={saving}>
          {saving ? <><Spinner /> Saving…</> : saved ? <><Icon d={icons.check} size={16} /> Saved!</> : 'Save Changes'}
        </button>
      </div>

      <div className="settings-section">
        <div className="section-title">Scan Checks</div>
        <div className="section-desc">Toggle which analyses run during each scan.</div>
        {Object.entries(local.checks).map(([key, val]) => (
          <CheckToggle
            key={key}
            id={key}
            label={CHECK_META[key]?.label || key}
            description={CHECK_META[key]?.desc || ''}
            checked={val}
            onChange={v => setCheck(key, v)}
          />
        ))}
      </div>

      <div className="settings-section">
        <div className="section-title">Schedule</div>
        <div className="section-desc">Configure when automatic scans run.</div>

        <CheckToggle
          id="cron_enabled"
          label="Enable Scheduled Scans"
          description="When disabled, scans must be triggered manually."
          checked={local.cron_enabled}
          onChange={v => setLocal(prev => ({ ...prev, cron_enabled: v }))}
        />

        {local.cron_enabled && (
          <>
            <div className="cron-presets">
              {CRON_PRESETS.map(p => (
                <button
                  key={p.value}
                  className={`preset-btn ${local.cron === p.value ? 'preset-active' : ''}`}
                  onClick={() => setLocal(prev => ({ ...prev, cron: p.value }))}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="input-group">
              <label className="input-label">Custom Cron Expression</label>
              <input
                className="cron-input"
                value={local.cron}
                onChange={e => setLocal(prev => ({ ...prev, cron: e.target.value }))}
                placeholder="0 4 1,15 * *"
                spellCheck={false}
              />
              <span className="input-hint">Format: minute hour day-of-month month day-of-week</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Root App ────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard', label: 'Overview',  icon: 'home'     },
  { id: 'reports',   label: 'Reports',   icon: 'reports'  },
  { id: 'history',   label: 'History',   icon: 'history'  },
  { id: 'settings',  label: 'Settings',  icon: 'settings' },
]

export default function App() {
  const [view, setView]         = useState('dashboard')
  const [status, setStatus]     = useState(null)
  const [config, setConfig]     = useState(null)
  const [scanState, setScanState] = useState({ running: false, log: [], status: null })
  const wsRef = useRef(null)

  const fetchStatus = useCallback(() => {
    apiFetch('/api/status').then(setStatus).catch(console.error)
  }, [])

  const fetchConfig = useCallback(() => {
    apiFetch('/api/config').then(setConfig).catch(console.error)
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchConfig()
    const id = setInterval(fetchStatus, 30000)
    return () => clearInterval(id)
  }, [fetchStatus, fetchConfig])

  async function runScan() {
    if (scanState.running) return
    setScanState({ running: true, log: [], status: null })
    try {
      const { run_id } = await apiFetch('/api/scan/run', { method: 'POST' })
      const wsUrl = (API.replace(/^http/, 'ws') || `ws://${window.location.host}`) + `/api/scan/stream/${run_id}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        if (msg.line !== undefined) {
          setScanState(prev => ({ ...prev, log: [...prev.log, msg.line] }))
        }
        if (msg.status) {
          setScanState(prev => ({ ...prev, running: false, status: msg.status }))
          fetchStatus()
          ws.close()
        }
      }
      ws.onerror = () => setScanState(prev => ({ ...prev, running: false, status: 'error' }))
    } catch (e) {
      setScanState({ running: false, log: [String(e)], status: 'error' })
    }
  }

  function handleConfigSave(newCfg) {
    setConfig(newCfg)
    fetchStatus()
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <Icon d={icons.scan} size={22} className="logo-icon" />
          <span className="logo-text">arr<strong>scanner</strong></span>
        </div>
        <ul className="nav-list">
          {NAV.map(n => (
            <li key={n.id}>
              <button
                className={`nav-item ${view === n.id ? 'nav-active' : ''}`}
                onClick={() => setView(n.id)}
              >
                <Icon d={icons[n.icon]} size={17} />
                <span>{n.label}</span>
              </button>
            </li>
          ))}
        </ul>
        {scanState.running && (
          <div className="sidebar-scan-indicator">
            <Spinner />
            <span>Scan running…</span>
          </div>
        )}
      </nav>

      <main className="main">
        {view === 'dashboard' && <DashboardView status={status} onRunScan={runScan} scanState={scanState} />}
        {view === 'reports'   && <ReportsView />}
        {view === 'history'   && <HistoryView />}
        {view === 'settings'  && <SettingsView config={config} onSave={handleConfigSave} />}
      </main>
    </div>
  )
}
