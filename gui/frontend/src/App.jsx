import { useState, useEffect, useCallback, useRef } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────
const API = (path, opts = {}) =>
  fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts })
    .then(r => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.json(); })

// ─────────────────────────────────────────────────────────────────────────────
// Tiny icon primitives (SVG paths from Heroicons Outline 24px)
// ─────────────────────────────────────────────────────────────────────────────
const Ic = ({ d, size = 18, className = '', style = {} }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.75} strokeLinecap="round"
    strokeLinejoin="round" className={className} style={style}>
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
)

const ICONS = {
  dashboard:  'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  reports:    'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  history:    'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  settings:   'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  play:       'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  folder:     'M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  check:      'M5 13l4 4L19 7',
  x:          'M6 18L18 6M6 6l12 12',
  warn:       'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  info:       'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  trash:      'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  refresh:    'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  chevron:    'M19 9l-7 7-7-7',
  copy:       'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
  film:       'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z',
  book:       'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  music:      'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
  moon:       'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z',
  scan:       'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7',
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility components
// ─────────────────────────────────────────────────────────────────────────────
const Spinner = ({ size = 20 }) => (
  <svg className="spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="31.4" strokeDashoffset="10" />
  </svg>
)

const Badge = ({ color = 'default', children, dot = false }) => (
  <span className={`badge badge-${color}`}>
    {dot && <span className="badge-dot" />}
    {children}
  </span>
)

const Tooltip = ({ text, children }) => (
  <span className="tooltip-wrap">
    {children}
    <span className="tooltip-label">{text}</span>
  </span>
)

function fmtTs(ts) {
  if (!ts) return '—'
  const y = ts.slice(0,4), mo = ts.slice(4,6), d = ts.slice(6,8)
  const h = ts.slice(9,11), mi = ts.slice(11,13), s = ts.slice(13,15)
  const dt = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
  return dt.toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function fmtIso(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })
}

function duration(start, end) {
  if (!start || !end) return '—'
  const ms = new Date(end) - new Date(start)
  if (ms < 60000) return Math.round(ms/1000) + 's'
  return Math.floor(ms/60000) + 'm ' + Math.round((ms % 60000)/1000) + 's'
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation sidebar
// ─────────────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'reports',   label: 'Reports',   icon: 'reports' },
  { id: 'history',   label: 'History',   icon: 'history' },
  { id: 'settings',  label: 'Settings',  icon: 'settings' },
]

function Sidebar({ active, onNav, isScanning }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon"><Ic d={ICONS.scan} size={22} /></div>
        <div className="brand-text">
          <span className="brand-name">ArrStack</span>
          <span className="brand-sub">Media Scanner</span>
        </div>
      </div>
      <ul className="nav-list">
        {NAV_ITEMS.map(item => (
          <li key={item.id}>
            <button
              className={`nav-item ${active === item.id ? 'nav-item--active' : ''}`}
              onClick={() => onNav(item.id)}
            >
              <Ic d={ICONS[item.icon]} size={18} />
              <span>{item.label}</span>
              {item.id === 'dashboard' && isScanning && (
                <span className="nav-badge-pulse" title="Scan in progress" />
              )}
            </button>
          </li>
        ))}
      </ul>
      <div className="sidebar-footer">
        <span className="version-tag">v2.0</span>
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat card — clickable, navigates to a tab
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, icon, onClick, loading }) {
  return (
    <button
      className={`stat-card ${onClick ? 'stat-card--clickable' : ''} stat-card--${accent || 'default'}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <div className="stat-card-header">
        <span className="stat-label">{label}</span>
        <div className={`stat-icon stat-icon--${accent || 'default'}`}>
          <Ic d={ICONS[icon] || ICONS.info} size={16} />
        </div>
      </div>
      <div className="stat-value">
        {loading ? <Spinner size={24} /> : value ?? '—'}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
      {onClick && (
        <div className="stat-card-arrow">
          <Ic d="M9 5l7 7-7 7" size={14} />
        </div>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Check toggle pill — immediate visual feedback, persists to API
// ─────────────────────────────────────────────────────────────────────────────
const CHECK_META = {
  stray_files:        { label: 'Stray Files',        icon: 'folder',  color: 'orange',  desc: 'Files outside expected hierarchy' },
  duplicates_by_name: { label: 'Name Duplicates',    icon: 'copy',    color: 'purple',  desc: 'Same title, multiple copies' },
  duplicates_by_hash: { label: 'Hash Duplicates',    icon: 'scan',    color: 'blue',    desc: 'Byte-identical files' },
  non_hd:             { label: 'Non-HD',             icon: 'film',    color: 'red',     desc: 'Video below 720p' },
  non_english:        { label: 'Non-English',        icon: 'book',    color: 'green',   desc: 'No English audio track' },
}

function CheckTogglePill({ id, enabled, onToggle, saving }) {
  const meta = CHECK_META[id] || { label: id, icon: 'info', color: 'default', desc: '' }
  return (
    <Tooltip text={meta.desc}>
      <button
        className={`check-pill ${enabled ? 'check-pill--on' : 'check-pill--off'} check-pill--${meta.color}`}
        onClick={() => onToggle(id, !enabled)}
        disabled={saving}
        aria-pressed={enabled}
        aria-label={`${meta.label}: ${enabled ? 'enabled' : 'disabled'}`}
      >
        <Ic d={ICONS[meta.icon]} size={14} />
        <span>{meta.label}</span>
        <span className={`pill-status ${enabled ? 'pill-status--on' : 'pill-status--off'}`}>
          {saving ? <Spinner size={10} /> : enabled ? <Ic d={ICONS.check} size={10} /> : <Ic d={ICONS.x} size={10} />}
        </span>
      </button>
    </Tooltip>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Live scan log panel
// ─────────────────────────────────────────────────────────────────────────────
function ScanLogPanel({ runId, onComplete }) {
  const [lines, setLines] = useState([])
  const [done, setDone] = useState(false)
  const [status, setStatus] = useState('connecting')
  const endRef = useRef(null)

  useEffect(() => {
    if (!runId) return
    setLines([]); setDone(false); setStatus('connecting')
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const host  = window.location.host
    const ws    = new WebSocket(`${proto}://${host}/api/scan/stream/${runId}`)
    ws.onopen  = () => setStatus('running')
    ws.onmessage = e => {
      const msg = JSON.parse(e.data)
      if (msg.line)   setLines(prev => [...prev, msg.line])
      if (msg.status) { setDone(true); setStatus(msg.status); if (onComplete) onComplete(msg.status) }
      if (msg.error)  { setLines(prev => [...prev, 'ERROR: ' + msg.error]); setDone(true); setStatus('error') }
    }
    ws.onerror = () => setStatus('error')
    ws.onclose = () => { if (!done) setStatus('closed') }
    return () => ws.close()
  }, [runId])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  const statusColor = { running: 'blue', done: 'green', error: 'red', connecting: 'default', closed: 'default' }
  return (
    <div className="log-panel">
      <div className="log-panel-header">
        <div className="log-panel-title">
          {status === 'running' && <Spinner size={14} />}
          <span>Live Output</span>
        </div>
        <Badge color={statusColor[status] || 'default'} dot>{status}</Badge>
      </div>
      <div className="log-body">
        {lines.length === 0 && !done && (
          <span className="log-empty">Waiting for output...</span>
        )}
        {lines.map((l, i) => {
          const isError   = l.startsWith('ERROR') || l.startsWith('error')
          const isWarn    = l.includes('[WARN]')
          const isSuccess = l.includes('SCAN COMPLETE') || l.includes('-> saved')
          const isSection = l.match(/^\[\d/)
          return (
            <div key={i} className={`log-line ${isError?'log-line--error':isWarn?'log-line--warn':isSuccess?'log-line--success':isSection?'log-line--section':''}`}>
              <span className="log-prefix">{String(i+1).padStart(3,' ')}</span>
              <span>{l}</span>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard view
// ─────────────────────────────────────────────────────────────────────────────
function DashboardView({ status, config, onRunScan, onNavigate, onToggleCheck }) {
  const [runId, setRunId]     = useState(null)
  const [scanning, setScanning] = useState(false)
  const [savingCheck, setSavingCheck] = useState(null)

  const checks  = config?.checks || {}
  const activeCount = Object.values(checks).filter(Boolean).length

  async function handleRunScan() {
    setScanning(true)
    try {
      const { run_id } = await API('/api/scan/run', { method: 'POST' })
      setRunId(run_id)
    } catch(e) {
      setScanning(false)
      alert('Failed to start scan: ' + e.message)
    }
  }

  async function handleToggleCheck(id, val) {
    setSavingCheck(id)
    const newChecks = { ...checks, [id]: val }
    const newConfig = { ...config, checks: newChecks }
    try {
      await API('/api/config', { method:'POST', body: JSON.stringify(newConfig) })
      if (onToggleCheck) onToggleCheck(newConfig)
    } catch(e) { /* revert */ }
    finally { setSavingCheck(null) }
  }

  function handleScanComplete(result) {
    setScanning(false)
    if (result === 'done') {
      setTimeout(() => { if (onNavigate) onNavigate('reports') }, 1500)
    }
  }

  const dirs = status?.media_dirs || {}
  const healthyDirs  = Object.values(dirs).filter(Boolean).length
  const totalDirs    = Object.keys(dirs).length

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Dashboard</h1>
          <p className="view-subtitle">Media library health at a glance</p>
        </div>
        <button
          className={`btn btn-primary btn-scan ${scanning ? 'btn-scan--running' : ''}`}
          onClick={handleRunScan}
          disabled={scanning}
        >
          {scanning ? <Spinner size={16} /> : <Ic d={ICONS.play} size={16} />}
          <span>{scanning ? 'Scanning…' : 'Run Scan'}</span>
        </button>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <StatCard
          label="Report Sets"
          value={status?.report_count ?? '—'}
          sub="All time"
          accent="blue"
          icon="reports"
          onClick={() => onNavigate('reports')}
        />
        <StatCard
          label="Dirs Online"
          value={totalDirs ? `${healthyDirs}/${totalDirs}` : '—'}
          sub="Category directories"
          accent={healthyDirs < totalDirs ? 'red' : 'green'}
          icon="folder"
          onClick={() => onNavigate('settings')}
        />
        <StatCard
          label="Active Checks"
          value={activeCount + '/5'}
          sub="Enabled scan checks"
          accent={activeCount === 0 ? 'red' : 'blue'}
          icon="check"
          onClick={() => onNavigate('settings')}
        />
        <StatCard
          label="Last Scan"
          value={status?.last_scan ? fmtIso(status.last_scan.started) : 'Never'}
          sub={status?.last_scan?.status ? `Status: ${status.last_scan.status}` : 'No scans yet'}
          accent={status?.last_scan?.status === 'done' ? 'green' : status?.last_scan?.status === 'error' ? 'red' : 'default'}
          icon="history"
          onClick={() => onNavigate('history')}
        />
      </div>

      {/* Directory status */}
      {totalDirs > 0 && (
        <div className="section-card">
          <h2 className="section-title">
            <Ic d={ICONS.folder} size={16} />
            Media Directories
          </h2>
          <div className="dir-grid">
            {Object.entries(dirs).map(([cat, ok]) => (
              <div key={cat} className={`dir-item ${ok ? 'dir-item--ok' : 'dir-item--missing'}`}>
                <Ic d={ok ? ICONS.check : ICONS.x} size={14} />
                <span className="dir-name">{cat}</span>
                <span className="dir-status">{ok ? 'mounted' : 'missing'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active checks — toggleable inline */}
      <div className="section-card">
        <div className="section-card-header">
          <h2 className="section-title">
            <Ic d={ICONS.check} size={16} />
            Scan Checks
          </h2>
          <span className="section-hint">Click to toggle · changes save instantly</span>
        </div>
        <div className="check-pills-row">
          {Object.entries(CHECK_META).map(([id]) => (
            <CheckTogglePill
              key={id}
              id={id}
              enabled={checks[id] ?? true}
              onToggle={handleToggleCheck}
              saving={savingCheck === id}
            />
          ))}
        </div>
      </div>

      {/* Schedule info */}
      {config && (
        <div className="section-card section-card--row">
          <div className="cron-info">
            <Ic d={ICONS.history} size={15} />
            <div>
              <span className="cron-label">Schedule</span>
              <code className="cron-expr">{config.cron || '—'}</code>
            </div>
          </div>
          <Badge color={config.cron_enabled ? 'green' : 'default'} dot>
            {config.cron_enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('settings')}>
            Configure <Ic d="M9 5l7 7-7 7" size={12} />
          </button>
        </div>
      )}

      {/* Live scan log */}
      {runId && <ScanLogPanel runId={runId} onComplete={handleScanComplete} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Reports view
// ─────────────────────────────────────────────────────────────────────────────
const REPORT_TABS = [
  { key: 'stray_files',        label: 'Stray Files',       icon: 'folder' },
  { key: 'duplicates_by_name', label: 'Name Dupes',        icon: 'copy' },
  { key: 'duplicates_by_hash', label: 'Hash Dupes',        icon: 'scan' },
  { key: 'non_hd',             label: 'Non-HD',            icon: 'film' },
  { key: 'non_english',        label: 'Non-English',       icon: 'book' },
]

function ReportsView() {
  const [sets, setSets]   = useState([])
  const [selTs, setSelTs] = useState(null)
  const [report, setReport] = useState(null)
  const [activeTab, setActiveTab] = useState('stray_files')
  const [loading, setLoading] = useState(false)
  const [loadingList, setLoadingList] = useState(true)

  useEffect(() => {
    setLoadingList(true)
    API('/api/reports').then(data => { setSets(data); if (data.length) setSelTs(data[0].timestamp) }).catch(console.error).finally(() => setLoadingList(false))
  }, [])

  useEffect(() => {
    if (!selTs) return
    setLoading(true)
    API(`/api/reports/${selTs}`).then(setReport).catch(console.error).finally(() => setLoading(false))
  }, [selTs])

  function countReport(key) {
    if (!report?.[key]) return null
    const r = report[key]
    return r.item_count ?? r.group_count ?? r.items?.length ?? r.groups?.length ?? 0
  }

  if (loadingList) return <div className="view-container"><div className="empty-state"><Spinner size={32} /><p>Loading reports…</p></div></div>
  if (sets.length === 0) return (
    <div className="view-container">
      <div className="view-header"><h1 className="view-title">Reports</h1></div>
      <div className="empty-state">
        <Ic d={ICONS.reports} size={48} className="empty-icon" />
        <h3>No reports yet</h3>
        <p>Run a scan from the Dashboard to generate your first report.</p>
      </div>
    </div>
  )

  const currentReport = report?.[activeTab]
  const items = currentReport?.items || currentReport?.groups || []

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Reports</h1>
          <p className="view-subtitle">{sets.length} report set{sets.length !== 1 ? 's' : ''} available</p>
        </div>
      </div>

      {/* Report set picker */}
      <div className="report-picker">
        <div className="report-picker-label">
          <Ic d={ICONS.history} size={14} />
          <span>Scan run</span>
        </div>
        <div className="report-picker-list">
          {sets.map(s => (
            <button
              key={s.timestamp}
              className={`report-set-btn ${selTs === s.timestamp ? 'report-set-btn--active' : ''}`}
              onClick={() => setSelTs(s.timestamp)}
            >
              <Ic d={ICONS.reports} size={13} />
              <span>{fmtTs(s.timestamp)}</span>
              <span className="report-set-count">{s.files?.length ?? 0} files</span>
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="loading-overlay"><Spinner size={28} /><span>Loading report…</span></div>}

      {!loading && report && (
        <>
          {/* Tab bar */}
          <div className="tab-bar">
            {REPORT_TABS.map(t => {
              const cnt = countReport(t.key)
              return (
                <button
                  key={t.key}
                  className={`tab-btn ${activeTab === t.key ? 'tab-btn--active' : ''}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  <Ic d={ICONS[t.icon]} size={14} />
                  <span>{t.label}</span>
                  {cnt !== null && (
                    <span className={`tab-count ${cnt > 0 ? 'tab-count--has' : ''}`}>{cnt}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Report content */}
          <div className="report-content">
            {items.length === 0 ? (
              <div className="empty-state empty-state--small">
                <Ic d={ICONS.check} size={32} className="empty-icon empty-icon--success" />
                <h3>All clear!</h3>
                <p>No issues found for this check.</p>
              </div>
            ) : (
              <ReportTable data={currentReport} tabKey={activeTab} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function ReportTable({ data, tabKey }) {
  const items = data?.items || data?.groups || []
  const [expanded, setExpanded] = useState({})
  const toggle = i => setExpanded(prev => ({ ...prev, [i]: !prev[i] }))

  if (tabKey === 'stray_files' || tabKey === 'non_hd' || tabKey === 'non_english') {
    return (
      <div className="report-table-wrap">
        <div className="report-table-stats">
          <span className="table-count">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
        <table className="report-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>File / Title</th>
              {tabKey === 'non_hd' && <th>Best Res</th>}
              {(tabKey === 'stray_files' || tabKey === 'non_english') && <th>Reason</th>}
              {tabKey === 'stray_files' && <th>Size</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td><Badge color="default">{item.category}</Badge></td>
                <td><code className="path">{item.file || item.parsed_title}</code></td>
                {tabKey === 'non_hd' && <td><Badge color={item.best_resolution === 'unknown' ? 'default' : 'red'}>{item.best_resolution}</Badge></td>}
                {(tabKey === 'stray_files' || tabKey === 'non_english') && <td className="reason-cell">{item.reason}</td>}
                {tabKey === 'stray_files' && <td className="size-cell">{item.size_mb} MB</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Duplicate groups
  return (
    <div className="dup-groups">
      <div className="report-table-stats">
        <span className="table-count">{items.length} duplicate group{items.length !== 1 ? 's' : ''}</span>
      </div>
      {items.map((group, i) => (
        <div key={i} className="dup-group">
          <button className="dup-group-header" onClick={() => toggle(i)}>
            <div className="dup-group-meta">
              <Badge color="purple">{group.category}</Badge>
              <span className="dup-title">
                {group.parsed_title || group.hash?.slice(0,12) + '…'}
              </span>
              {group.season && <Badge color="default">Season {group.season}</Badge>}
              <Badge color="red">{group.file_count} files</Badge>
            </div>
            <Ic d={ICONS.chevron} size={14} className={`chevron ${expanded[i] ? 'chevron--open' : ''}`} />
          </button>
          {expanded[i] && (
            <div className="dup-group-files">
              {(group.files || []).map((f, j) => (
                <div key={j} className={`dup-file ${f.action === 'KEEP' ? 'dup-file--keep' : 'dup-file--review'}`}>
                  <div className="dup-file-action">
                    {f.action === 'KEEP'
                      ? <Badge color="green">KEEP</Badge>
                      : <Badge color="orange">REVIEW</Badge>}
                  </div>
                  <code className="path dup-file-path">{f.file}</code>
                  <div className="dup-file-meta">
                    {f.resolution && <Badge color="default">{f.resolution}</Badge>}
                    <span className="size-tag">{f.size_mb} MB</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// History view
// ─────────────────────────────────────────────────────────────────────────────
function HistoryView() {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    API('/api/history').then(setHistory).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function handleClear() {
    if (!confirm('Clear all scan history? This cannot be undone.')) return
    setClearing(true)
    try { await API('/api/history', { method: 'DELETE' }); setHistory([]) }
    catch(e) { alert('Error: ' + e.message) }
    finally { setClearing(false) }
  }

  if (loading) return <div className="view-container"><div className="empty-state"><Spinner size={32} /><p>Loading history…</p></div></div>

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">History</h1>
          <p className="view-subtitle">{history.length} scan run{history.length !== 1 ? 's' : ''} recorded</p>
        </div>
        {history.length > 0 && (
          <button className="btn btn-danger btn-sm" onClick={handleClear} disabled={clearing}>
            {clearing ? <Spinner size={14} /> : <Ic d={ICONS.trash} size={14} />}
            Clear History
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="empty-state">
          <Ic d={ICONS.history} size={48} className="empty-icon" />
          <h3>No history yet</h3>
          <p>Completed scans will appear here.</p>
        </div>
      ) : (
        <div className="history-table-wrap">
          <table className="report-table history-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Checks Run</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => {
                const checksOn = h.checks ? Object.entries(h.checks).filter(([,v]) => v).map(([k]) => CHECK_META[k]?.label || k) : []
                return (
                  <tr key={h.run_id || i}>
                    <td>
                      <Badge color={h.status === 'done' ? 'green' : h.status === 'error' ? 'red' : 'default'} dot>
                        {h.status}
                      </Badge>
                    </td>
                    <td className="time-cell">{fmtIso(h.started)}</td>
                    <td className="time-cell mono">{duration(h.started, h.finished)}</td>
                    <td>
                      <div className="checks-list">
                        {checksOn.length ? checksOn.map(c => <Badge key={c} color="default">{c}</Badge>) : <span className="muted">—</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings view
// ─────────────────────────────────────────────────────────────────────────────
const CRON_PRESETS = [
  { label: 'Biweekly 4 AM',  value: '0 4 1,15 * *' },
  { label: 'Weekly Sunday',  value: '0 3 * * 0' },
  { label: 'Daily 3 AM',     value: '0 3 * * *' },
  { label: 'Monthly 1st',    value: '0 4 1 * *' },
  { label: 'Custom',         value: '__custom__' },
]

const DEFAULT_FOLDER_PATHS = {
  shows:      '/mnt/media/shows',
  movies:     '/mnt/media/movies',
  anime:      '/mnt/media/anime',
  books:      '/mnt/media/books',
  audiobooks: '/mnt/media/audiobooks',
  music:      '/mnt/media/music',
}

function SettingsView({ config, onSave }) {
  const [local, setLocal]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [cronMode, setCronMode] = useState('preset')

  useEffect(() => {
    if (config) {
      const merged = {
        ...config,
        folder_paths: { ...DEFAULT_FOLDER_PATHS, ...(config.folder_paths || {}) }
      }
      setLocal(merged)
      const matchPreset = CRON_PRESETS.find(p => p.value !== '__custom__' && p.value === config.cron)
      setCronMode(matchPreset ? 'preset' : 'custom')
    }
  }, [config])

  if (!local) return <div className="view-container"><div className="empty-state"><Spinner size={32} /></div></div>

  function setCheck(key, val) { setLocal(prev => ({ ...prev, checks: { ...prev.checks, [key]: val } })) }
  function setPath(cat, val)  { setLocal(prev => ({ ...prev, folder_paths: { ...prev.folder_paths, [cat]: val } })) }

  async function handleSave() {
    setSaving(true); setSaved(false)
    try {
      await API('/api/config', { method:'POST', body: JSON.stringify(local) })
      if (onSave) onSave(local)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch(e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h1 className="view-title">Settings</h1>
          <p className="view-subtitle">Configure scan behaviour, schedule, and folder paths</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Spinner size={16} /> : saved ? <Ic d={ICONS.check} size={16} /> : <Ic d={ICONS.settings} size={16} />}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Scan checks */}
      <div className="settings-section">
        <h2 className="settings-section-title">
          <Ic d={ICONS.check} size={16} />
          Scan Checks
        </h2>
        <p className="settings-section-desc">Toggle which analyses run during each scan. Changes here are also reflected on the Dashboard.</p>
        <div className="settings-checks-grid">
          {Object.entries(CHECK_META).map(([id, meta]) => (
            <label key={id} className={`settings-check-row ${local.checks?.[id] ? 'settings-check-row--on' : ''}`}>
              <div className="settings-check-info">
                <Ic d={ICONS[meta.icon]} size={15} className={`check-icon check-icon--${meta.color}`} />
                <div>
                  <span className="settings-check-label">{meta.label}</span>
                  <span className="settings-check-desc">{meta.desc}</span>
                </div>
              </div>
              <div
                className={`toggle ${local.checks?.[id] ? 'toggle--on' : 'toggle--off'}`}
                onClick={() => setCheck(id, !local.checks?.[id])}
                role="switch"
                aria-checked={local.checks?.[id]}
                tabIndex={0}
                onKeyDown={e => e.key === ' ' && setCheck(id, !local.checks?.[id])}
              >
                <span className="toggle-knob" />
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Folder paths */}
      <div className="settings-section">
        <h2 className="settings-section-title">
          <Ic d={ICONS.folder} size={16} />
          Media Folder Paths
        </h2>
        <p className="settings-section-desc">Define the exact paths to each media category inside your Docker container.</p>
        <div className="folder-paths-grid">
          {Object.entries(DEFAULT_FOLDER_PATHS).map(([cat]) => (
            <div key={cat} className="folder-path-row">
              <label className="folder-path-label">
                <Badge color="default">{cat}</Badge>
              </label>
              <input
                type="text"
                className="folder-path-input"
                value={local.folder_paths?.[cat] || ''}
                onChange={e => setPath(cat, e.target.value)}
                placeholder={`/mnt/media/${cat}`}
                spellCheck={false}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Schedule */}
      <div className="settings-section">
        <div className="settings-section-header">
          <h2 className="settings-section-title">
            <Ic d={ICONS.history} size={16} />
            Schedule
          </h2>
          <div
            className={`toggle ${local.cron_enabled ? 'toggle--on' : 'toggle--off'}`}
            onClick={() => setLocal(prev => ({ ...prev, cron_enabled: !prev.cron_enabled }))}
            role="switch"
            aria-checked={local.cron_enabled}
            tabIndex={0}
            onKeyDown={e => e.key === ' ' && setLocal(prev => ({ ...prev, cron_enabled: !prev.cron_enabled }))}
          >
            <span className="toggle-knob" />
          </div>
        </div>

        {local.cron_enabled && (
          <div className="cron-settings">
            <div className="cron-presets">
              {CRON_PRESETS.map(p => (
                <button
                  key={p.value}
                  className={`preset-btn ${(p.value === '__custom__' ? cronMode === 'custom' : (cronMode !== 'custom' && local.cron === p.value)) ? 'preset-btn--active' : ''}`}
                  onClick={() => {
                    if (p.value === '__custom__') { setCronMode('custom') }
                    else { setCronMode('preset'); setLocal(prev => ({ ...prev, cron: p.value })) }
                  }}
                >{p.label}</button>
              ))}
            </div>
            <div className="cron-input-row">
              <label className="cron-input-label">Cron expression</label>
              <input
                type="text"
                className={`cron-input ${cronMode === 'custom' ? 'cron-input--custom' : ''}`}
                value={local.cron}
                onChange={e => { setLocal(prev => ({ ...prev, cron: e.target.value })); setCronMode('custom') }}
                placeholder="0 4 1,15 * *"
                spellCheck={false}
              />
              <p className="cron-hint">min hour day-of-month month day-of-week</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Root App
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]       = useState('dashboard')
  const [status, setStatus] = useState(null)
  const [config, setConfig] = useState(null)
  const [theme, setTheme]   = useState('dark')    // 'dark' | 'darker'
  const [error, setError]   = useState(null)

  const fetchStatus = useCallback(() =>
    API('/api/status').then(setStatus).catch(e => setError(e.message)), [])

  const fetchConfig = useCallback(() =>
    API('/api/config').then(setConfig).catch(e => setError(e.message)), [])

  useEffect(() => {
    fetchStatus(); fetchConfig()
    const id = setInterval(fetchStatus, 30_000)
    return () => clearInterval(id)
  }, [fetchStatus, fetchConfig])

  // Sync theme to root element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div className={`app-shell theme-${theme}`}>
      <Sidebar active={tab} onNav={setTab} isScanning={status?.is_scanning} />

      <main className="main-content">
        {/* Global error banner */}
        {error && (
          <div className="error-banner">
            <Ic d={ICONS.warn} size={16} />
            <span>API error: {error}</span>
            <button className="error-dismiss" onClick={() => setError(null)}>
              <Ic d={ICONS.x} size={14} />
            </button>
          </div>
        )}

        {/* Theme switcher */}
        <div className="theme-switcher">
          <button
            className={`theme-btn ${theme === 'dark' ? 'theme-btn--active' : ''}`}
            onClick={() => setTheme('dark')}
            title="Dark mode"
          >
            <Ic d={ICONS.moon} size={14} />
            Dark
          </button>
          <button
            className={`theme-btn ${theme === 'darker' ? 'theme-btn--active' : ''}`}
            onClick={() => setTheme('darker')}
            title="Darker mode"
          >
            <Ic d={ICONS.moon} size={14} />
            Darker
          </button>
        </div>

        {tab === 'dashboard' && (
          <DashboardView
            status={status}
            config={config}
            onRunScan={() => {}}
            onNavigate={setTab}
            onToggleCheck={setConfig}
          />
        )}
        {tab === 'reports'   && <ReportsView />}
        {tab === 'history'   && <HistoryView />}
        {tab === 'settings'  && (
          <SettingsView
            config={config}
            onSave={cfg => { setConfig(cfg); fetchStatus() }}
          />
        )}
      </main>
    </div>
  )
}
