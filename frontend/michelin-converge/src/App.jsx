import React, { useState, useEffect } from 'react';
import { useLeads } from './hooks/useLeads';
import './index.css';

/* ─── Icon components (inline SVG, zero dependencies) ─── */
const Icons = {
  Dashboard: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  Leads: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  Simulator: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  ArrowLeft: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Alert: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  X: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  ChevronRight: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>,
  Refresh: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  Plus: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Loading: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>,
};

/* ─── Reusable UI primitives ─── */
function Sidebar({ currentView, setView }) {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: Icons.Dashboard },
    { id: 'leads', label: 'Lead Queue', icon: Icons.Leads },
    { id: 'simulator', label: 'What-If Simulator', icon: Icons.Simulator },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand">MICHELIN <span style={{ color: 'var(--color-blue)' }}>CONVERGE</span><span className="brand-dot" /></div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--color-gray)', marginTop: '0.25rem', letterSpacing: '0.05em', fontWeight: 600 }}>AGENTIC AI HARNESS</div>
      </div>
      <nav className="nav">
        {items.map(item => (
          <button key={item.id} className={`nav-item ${currentView === item.id ? 'active' : ''}`} onClick={() => setView(item.id)}>
            <item.icon />{item.label}
          </button>
        ))}
      </nav>
      <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)', fontSize: '0.6875rem', color: 'var(--color-gray-light)' }}>
        v2.4.0
      </div>
    </aside>
  );
}

function Header({ title, subtitle, onRefresh, loading }) {
  return (
    <header className="header">
      <div>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 700 }}>{title}</h2>
        {subtitle && <div style={{ fontSize: '0.75rem', color: 'var(--color-gray)', marginTop: '0.125rem' }}>{subtitle}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={loading}>
          {loading ? <Icons.Loading className="spin" /> : <Icons.Refresh />}
          Refresh
        </button>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray)', fontFamily: 'var(--font-mono)' }}>
          {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-blue)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>SO</div>
      </div>
    </header>
  );
}

function ScoreBadge({ score }) {
  let cls = 'score-low';
  if (score >= 70) cls = 'score-high';
  else if (score >= 40) cls = 'score-medium';
  return <div className={`score-circle ${cls}`}>{score || '—'}</div>;
}

function StatusTag({ status }) {
  const map = {
    READY: { cls: 'tag-success', text: 'Ready' },
    PROCESSING: { cls: 'tag-beige', text: 'Processing' },
    NEEDS_CLARIFICATION: { cls: 'tag-warning', text: 'Needs Clarification' },
    OUT_OF_SCOPE: { cls: 'tag-warning', text: 'Out of Scope' },
    NO_PRODUCT_MATCH: { cls: 'tag-warning', text: 'No Match' },
    ESCALATED: { cls: 'tag-danger', text: 'Escalated' },
    high_priority: { cls: 'tag-blue', text: 'High Priority' },
    medium_priority: { cls: 'tag-beige', text: 'Medium' },
    low_priority: { cls: 'tag-beige', text: 'Low Priority' },
    human_review: { cls: 'tag-dark', text: 'Human Review' },
  };
  const s = map[status] || map.PROCESSING;
  return <span className={`tag ${s.cls}`}>{s.text}</span>;
}

function ActionBadge({ action }) {
  const map = {
    CONTACT_NOW: { cls: 'tag-success', text: 'CONTACT NOW' },
    FOLLOW_UP: { cls: 'tag-blue', text: 'FOLLOW UP' },
    NURTURE: { cls: 'tag-beige', text: 'NURTURE' },
    REQUEST_INFO: { cls: 'tag-warning', text: 'REQUEST INFO' },
    HUMAN_REVIEW: { cls: 'tag-danger', text: 'HUMAN REVIEW' },
  };
  const a = map[action] || map.HUMAN_REVIEW;
  return <span className={`tag ${a.cls}`} style={{ fontSize: '0.75rem' }}>{a.text}</span>;
}

/* ─── Pages ─── */
function Dashboard({ leads, loading, onSelectLead, onSimulator, onProcessAll, processingLead }) {
  const processedLeads = leads.filter(l => l.status && l.status !== 'PROCESSING');
  const stats = [
    { label: 'Total Leads', value: leads.length, sub: `${processedLeads.length} processed` },
    { label: 'High Priority', value: leads.filter(l => l.priority === 'HIGH' || l.status === 'high_priority').length, sub: 'Ready for contact' },
    { label: 'In Human Review', value: leads.filter(l => l.escalate_to_human || l.status === 'ESCALATED' || l.status === 'human_review').length, sub: 'Requires attention' },
    { label: 'Avg. Lead Score', value: leads.length > 0 ? Math.round(leads.filter(l => l.lead_score).reduce((a, b) => a + (b.lead_score || 0), 0) / leads.filter(l => l.lead_score).length) : 0, sub: 'Out of 100' },
  ];

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-primary" onClick={onProcessAll} disabled={loading || leads.length === 0}>
            {loading ? <Icons.Loading className="spin" /> : '▶'} Process All Leads
          </button>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-gray)' }}>
          Session: <span className="font-mono">{localStorage.getItem('sessionId') || 'None'}</span>
        </div>
      </div>

      <div className="grid-4">
        {stats.map((s, i) => (
          <div key={i} className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gray)', fontWeight: 600, marginBottom: '0.5rem' }}>{s.label}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-black)', marginBottom: '0.25rem' }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-gray-light)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Lead Pipeline</h3>
          <button className="btn btn-secondary btn-sm" onClick={() => onSimulator(null)}>Open Simulator</button>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr><th>ID</th><th>Raw Text</th><th>Score</th><th>Priority</th><th>Status</th><th>Action</th><th></th></tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-gray)' }}>No leads available. Use the "New Lead" form below.</td></tr>
              ) : (
                leads.map(lead => (
                  <tr key={lead.lead_id} style={{ cursor: 'pointer' }} onClick={() => onSelectLead(lead)}>
                    <td className="font-mono" style={{ color: 'var(--color-blue)', fontWeight: 600 }}>{lead.lead_id}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {lead.raw_text?.slice(0, 60) || '—'}
                    </td>
                    <td><ScoreBadge score={lead.lead_score || lead.score} /></td>
                    <td>
                      {lead.priority && <span className={`tag ${lead.priority === 'HIGH' ? 'tag-blue' : lead.priority === 'MEDIUM' ? 'tag-beige' : 'tag-beige'}`}>{lead.priority}</span>}
                      {!lead.priority && <span className="tag tag-beige">—</span>}
                    </td>
                    <td><StatusTag status={lead.status || (lead.escalate_to_human ? 'ESCALATED' : 'PROCESSING')} /></td>
                    <td><ActionBadge action={lead.recommended_action || lead.action} /></td>
                    <td>
                      {lead.lead_id === processingLead ? <Icons.Loading className="spin" /> : <Icons.ChevronRight />}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Lead Form */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-header"><h3>New Lead</h3></div>
        <div className="card-body">
          <NewLeadForm />
        </div>
      </div>
    </div>
  );
}

function NewLeadForm() {
  const { addLead, processLead, loading } = useLeads();
  const [rawText, setRawText] = useState('');
  const [lat, setLat] = useState('18.5606');
  const [lng, setLng] = useState('73.7796');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rawText.trim()) return;
    
    const newLead = addLead(rawText, parseFloat(lat), parseFloat(lng));
    await processLead(newLead.lead_id, rawText, parseFloat(lat), parseFloat(lng));
    setRawText('');
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Enter lead details (e.g., 'Name: Rahul. Vehicle: Hyundai Creta...')"
          style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--color-border-dark)', borderRadius: 'var(--radius)', fontSize: '0.875rem', fontFamily: 'inherit', minHeight: '80px' }}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <input type="number" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="Latitude" step="0.0001" />
        <input type="number" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="Longitude" step="0.0001" />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading || !rawText.trim()}>
        <Icons.Plus /> Process Lead
      </button>
    </form>
  );
}

function LeadDetail({ lead, onBack, onSimulator, getTrace }) {
  const [trace, setTrace] = useState(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [showTrace, setShowTrace] = useState(false);

  if (!lead) return null;

  const hasRecommendation = lead.recommendation && lead.recommendation.recommended_sku;

  const loadTrace = async () => {
    setLoadingTrace(true);
    const data = await getTrace(lead.lead_id);
    if (data) setTrace(data);
    setLoadingTrace(false);
    setShowTrace(true);
  };

  return (
    <div className="content">
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}><Icons.ArrowLeft /> Back</button>
        <div style={{ fontSize: '0.875rem', color: 'var(--color-gray)' }}>
          Dashboard <span style={{ margin: '0 0.5rem' }}>/</span> <span style={{ color: 'var(--color-black)', fontWeight: 600 }}>{lead.lead_id}</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadTrace} disabled={loadingTrace}>
          {loadingTrace ? <Icons.Loading className="spin" /> : 'View Agent Trace'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray)', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>{lead.lead_id}</div>
          <h1 style={{ fontSize: '1.5rem' }}>Lead Details</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={() => onSimulator(lead)}>Simulate Offer</button>
          <button className="btn btn-primary">Assign to Sales</button>
        </div>
      </div>

      <div className="grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Raw Input */}
          <div className="card">
            <div className="card-header"><h3>Raw Input</h3></div>
            <div className="card-body">
              <div style={{ padding: '0.75rem', background: 'var(--color-beige)', borderRadius: 'var(--radius)', fontSize: '0.875rem', color: 'var(--color-gray)', border: '1px solid var(--color-border)' }}>
                {lead.raw_text || 'No raw text available'}
              </div>
            </div>
          </div>

          {/* Assessment */}
          <div className="card">
            <div className="card-header"><h3>Lead Assessment</h3></div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gray)', fontWeight: 600, marginBottom: '0.5rem' }}>Lead Score</div>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: (lead.lead_score || 0) >= 70 ? 'var(--color-blue)' : (lead.lead_score || 0) >= 40 ? 'var(--color-gray)' : 'var(--color-gray-light)' }}>
                    {lead.lead_score || '—'}<span style={{ fontSize: '1rem', color: 'var(--color-gray-light)' }}>/100</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gray)', fontWeight: 600, marginBottom: '0.5rem' }}>Priority</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>{lead.priority || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gray)', fontWeight: 600, marginBottom: '0.5rem' }}>Status</div>
                  <StatusTag status={lead.status} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gray)', fontWeight: 600, marginBottom: '0.5rem' }}>Recommended Action</div>
                <ActionBadge action={lead.recommended_action || lead.action} />
                {lead.sales_note && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--color-gray)', padding: '0.5rem', background: 'var(--color-beige)', borderRadius: 'var(--radius)' }}>
                    {lead.sales_note}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className="card">
            <div className="card-header">
              <h3>AI Recommendation</h3>
              {hasRecommendation ? <span className="tag tag-success">Validated</span> : <span className="tag tag-warning">Blocked</span>}
            </div>
            <div className="card-body">
              {hasRecommendation ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gray)', fontWeight: 600, marginBottom: '0.5rem' }}>Recommended SKU</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem' }}>{lead.recommendation.recommended_sku}</div>
                  </div>
                  {lead.recommendation.match_score && (
                    <div>
                      <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gray)', fontWeight: 600, marginBottom: '0.5rem' }}>Match Score</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{lead.recommendation.match_score}%</div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gray)', fontWeight: 600, marginBottom: '0.5rem' }}>Discount</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: lead.deal?.recommended_discount_pct > 8 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {lead.deal?.recommended_discount_pct || lead.recommendation.discount || 0}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-gray)', fontWeight: 600, marginBottom: '0.5rem' }}>Final Total</div>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-blue)' }}>
                      ₹{lead.deal?.final_total?.toLocaleString('en-IN') || lead.recommendation.finalPrice?.toLocaleString('en-IN') || '—'}
                    </div>
                  </div>
                  <div style={{ gridColumn: '1 / -1', padding: '0.75rem', background: 'var(--color-blue-light)', borderRadius: 'var(--radius)', border: '1px solid rgba(0,51,160,0.1)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-blue-muted)' }}>{lead.recommendation.justification || 'No justification provided'}</div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-gray)' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-black)' }}>No recommendation generated</div>
                  <div style={{ fontSize: '0.875rem' }}>{lead.recommendation?.justification || 'Insufficient data or validation failure.'}</div>
                </div>
              )}
            </div>
          </div>

          {/* Dealer */}
          {lead.dealer && lead.dealer.recommended_dealer && (
            <div className="card">
              <div className="card-header"><h3>Dealer Allocation</h3></div>
              <div className="card-body">
                <div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem' }}>{lead.dealer.recommended_dealer}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray)' }}>
                    {lead.dealer.distance_km ? `${lead.dealer.distance_km}km away` : ''}
                    {lead.dealer.stock_available && ` · Stock: ${lead.dealer.stock_available}`}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Compliance */}
          {lead.compliance && (
            <div className="card">
              <div className="card-header">
                <h3>Compliance Status</h3>
                {lead.compliance.approved ? <span className="tag tag-success">Approved</span> : <span className="tag tag-warning">Flagged</span>}
              </div>
              <div className="card-body">
                {lead.compliance.approved ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)', fontSize: '0.875rem' }}>
                    <Icons.Check /> All compliance checks passed.
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: lead.compliance.escalate_to_human ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)', borderRadius: 'var(--radius)', fontSize: '0.875rem', color: lead.compliance.escalate_to_human ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                    <Icons.Alert /> {lead.compliance.escalate_to_human ? 'Escalated to human review' : 'Needs attention'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Agent Trace */}
        {showTrace && (
          <div className="card" style={{ height: 'fit-content' }}>
            <div className="card-header">
              <h3>Agent Execution Trace</h3>
              <span className="tag tag-beige">{trace?.trace?.length || 0} Steps</span>
            </div>
            <div className="card-body">
              {loadingTrace ? (
                <div style={{ textAlign: 'center', padding: '2rem' }}><Icons.Loading className="spin" /> Loading trace...</div>
              ) : trace && trace.trace ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {trace.trace.map((step, i) => (
                    <div key={i} className="trace-item">
                      <div className={`trace-dot ${step.ok ? 'success' : 'error'}`} />
                      <div className="trace-content">
                        <div className="trace-header">
                          <span className="trace-name">{step.agent}</span>
                          <span className="trace-time">{step.duration_ms}ms</span>
                        </div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--color-gray)', marginTop: '0.25rem', lineHeight: 1.5 }}>{step.note || step.output || 'No output'}</div>
                        <div className="trace-status">
                          {step.ok ? <span className="tag tag-success" style={{ fontSize: '0.625rem' }}>Success</span> : <span className="tag tag-danger" style={{ fontSize: '0.625rem' }}>Error</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-gray)' }}>No trace available for this lead.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Simulator({ lead, catalog, onBack, runSimulation }) {
  const [discount, setDiscount] = useState(lead?.deal?.recommended_discount_pct || 0);
  const [budget, setBudget] = useState(lead?.deal?.final_total || 30000);
  const [selectedSku, setSelectedSku] = useState(lead?.recommendation?.recommended_sku || catalog?.[0]?.sku || '');
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  if (!catalog || catalog.length === 0) {
    return (
      <div className="content">
        <button className="btn btn-secondary btn-sm" onClick={onBack}><Icons.ArrowLeft /> Back</button>
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-gray)' }}>Loading catalog...</div>
      </div>
    );
  }

  const product = catalog.find(p => p.sku === selectedSku) || catalog[0];
  const qty = 4;
  const baseRevenue = product.price * qty;
  const discountedRevenue = Math.round(baseRevenue * (1 - discount / 100));
  const withinBudget = discountedRevenue <= budget;
  const withinPolicy = discount <= 8;

  const handleSimulate = async () => {
    if (!lead) {
      alert('Please select a lead to simulate');
      return;
    }
    setSimLoading(true);
    const result = await runSimulation(lead.lead_id, {
      budget,
      requested_discount_pct: discount,
      customer_lat: lead.customer_lat || 18.5606,
      customer_lng: lead.customer_lng || 73.7796,
      recommended_sku: selectedSku
    });
    if (result) setSimResult(result);
    setSimLoading(false);
  };

  return (
    <div className="content">
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onBack}><Icons.ArrowLeft /> Back</button>
        <div style={{ fontSize: '0.875rem', color: 'var(--color-gray)' }}>
          {lead ? `Lead ${lead.lead_id}` : 'General'} <span style={{ margin: '0 0.5rem' }}>/</span> <span style={{ color: 'var(--color-black)', fontWeight: 600 }}>What-If Simulator</span>
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>What-If Simulator</h1>
        <p style={{ color: 'var(--color-gray)', fontSize: '0.875rem' }}>Adjust deal parameters to explore alternative scenarios. All changes are validated against live policy constraints.</p>
      </div>

      <div className="grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header"><h3>Simulation Controls</h3></div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--color-gray)', marginBottom: '0.5rem' }}>Product</label>
                <select value={selectedSku} onChange={e => setSelectedSku(e.target.value)} style={{ width: '100%' }}>
                  {catalog.map(p => <option key={p.sku} value={p.sku}>{p.sku} — ₹{p.price?.toLocaleString('en-IN') || p.unit_price?.toLocaleString('en-IN') || '—'}</option>)}
                </select>
              </div>

              <div>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--color-gray)', marginBottom: '0.5rem' }}>
                  <span>Discount</span>
                  <span className="font-mono" style={{ color: withinPolicy ? 'var(--color-blue)' : 'var(--color-danger)' }}>{discount}%</span>
                </label>
                <input type="range" min="0" max="15" value={discount} onChange={e => setDiscount(Number(e.target.value))} className="slider" />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', color: 'var(--color-gray-light)', marginTop: '0.25rem' }}>
                  <span>0%</span><span>Policy Max: 8%</span><span>15%</span>
                </div>
                {!withinPolicy && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Icons.Alert /> Exceeds policy maximum of 8%
                  </div>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--color-gray)', marginBottom: '0.5rem' }}>Customer Budget (₹)</label>
                <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))} style={{ width: '100%' }} step="1000" />
              </div>

              <button className="btn btn-primary" onClick={handleSimulate} disabled={simLoading || !lead}>
                {simLoading ? <Icons.Loading className="spin" /> : 'Run Simulation'}
              </button>
            </div>
          </div>

          <div className="card" style={{ borderColor: withinPolicy && withinBudget ? 'var(--color-success)' : 'var(--color-warning)', borderWidth: '2px' }}>
            <div className="card-header">
              <h3>Simulation Result</h3>
              {withinPolicy && withinBudget ? <span className="tag tag-success">Valid</span> : <span className="tag tag-warning">Caution</span>}
            </div>
            <div className="card-body">
              {simResult ? (
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--color-gray)', marginBottom: '0.5rem' }}>
                    Simulation completed for {simResult.lead_id}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--color-gray)', fontWeight: 600 }}>Current Final</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>₹{simResult.current?.deal?.final_total?.toLocaleString('en-IN') || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--color-gray)', fontWeight: 600 }}>Simulated Final</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-blue)' }}>₹{simResult.simulated?.deal?.final_total?.toLocaleString('en-IN') || '—'}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-gray)' }}>
                  {lead ? 'Run simulation to see results' : 'Select a lead to simulate'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ height: 'fit-content' }}>
          <div className="card-header"><h3>Scenario Comparison</h3></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.75rem', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, color: 'var(--color-gray)', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-border)', marginBottom: '0.5rem' }}>
              <div>Metric</div><div style={{ textAlign: 'right' }}>Current</div><div style={{ textAlign: 'right', color: 'var(--color-blue)' }}>Simulated</div>
            </div>

            {[
              { label: 'Product', current: lead?.recommendation?.recommended_sku || '-', simulated: product.sku },
              { label: 'Discount', current: `${lead?.deal?.recommended_discount_pct || 0}%`, simulated: `${discount}%` },
              { label: 'List Price', current: `₹${(lead?.deal?.final_total || baseRevenue).toLocaleString('en-IN')}`, simulated: `₹${baseRevenue.toLocaleString('en-IN')}` },
              { label: 'Final Price', current: `₹${(lead?.deal?.final_total || baseRevenue).toLocaleString('en-IN')}`, simulated: `₹${discountedRevenue.toLocaleString('en-IN')}` },
              { label: 'Within Budget', current: '—', simulated: withinBudget ? 'Yes' : 'No', status: withinBudget ? 'success' : 'danger' },
              { label: 'Policy', current: '—', simulated: withinPolicy ? 'Compliant' : 'Violation', status: withinPolicy ? 'success' : 'danger' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--color-gray)' }}>{row.label}</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-gray)' }}>{row.current}</span>
                <span style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600, color: row.status === 'danger' ? 'var(--color-danger)' : row.status === 'success' ? 'var(--color-success)' : 'var(--color-black)' }}>
                  {row.simulated}
                </span>
              </div>
            ))}

            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--color-beige)', borderRadius: 'var(--radius)', fontSize: '0.75rem', color: 'var(--color-gray)', border: '1px solid var(--color-border)' }}>
              <strong style={{ color: 'var(--color-black)' }}>Disclaimer:</strong> Simulated values do not constitute a binding offer.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── App shell ─── */
export default function App() {
  const [view, setView] = useState('dashboard');
  const [selectedLead, setSelectedLead] = useState(null);
  const [simulatorLead, setSimulatorLead] = useState(null);
  
  const {
    leads,
    catalog,
    loading,
    processingLead,
    processLead,
    processAllLeads,
    getTrace,
    runSimulation,
    refreshLeads,
    addLead
  } = useLeads();

  const handleSelectLead = (lead) => { 
    setSelectedLead(lead); 
    setView('lead'); 
  };
  
  const handleBack = () => { 
    setSelectedLead(null); 
    setSimulatorLead(null); 
    setView('dashboard'); 
  };
  
  const handleSimulator = (lead) => { 
    setSimulatorLead(lead); 
    setView('simulator'); 
  };

  const handleRefresh = async () => {
    await refreshLeads();
  };

  const titles = {
    dashboard: { title: 'Sales Operations Dashboard', subtitle: 'Real-time lead pipeline overview' },
    leads: { title: 'Lead Queue', subtitle: 'All inbound leads requiring processing' },
    lead: { title: 'Lead Detail', subtitle: `Inspecting ${selectedLead?.lead_id || ''}` },
    simulator: { title: 'What-If Simulator', subtitle: 'Interactive decision support' },
  };
  const t = titles[view] || titles.dashboard;

  return (
    <div className="app">
      <Sidebar currentView={view === 'lead' ? 'leads' : view} setView={setView} />
      <div className="main">
        <Header 
          title={t.title} 
          subtitle={t.subtitle} 
          onRefresh={handleRefresh}
          loading={loading}
        />
        {view === 'dashboard' && (
          <Dashboard 
            leads={leads} 
            loading={loading}
            processingLead={processingLead}
            onSelectLead={handleSelectLead} 
            onSimulator={handleSimulator}
            onProcessAll={processAllLeads}
          />
        )}
        {view === 'leads' && (
          <Dashboard 
            leads={leads} 
            loading={loading}
            processingLead={processingLead}
            onSelectLead={handleSelectLead} 
            onSimulator={handleSimulator}
            onProcessAll={processAllLeads}
          />
        )}
        {view === 'lead' && (
          <LeadDetail 
            lead={selectedLead} 
            onBack={handleBack} 
            onSimulator={handleSimulator}
            getTrace={getTrace}
          />
        )}
        {view === 'simulator' && (
          <Simulator 
            lead={simulatorLead} 
            catalog={catalog} 
            onBack={handleBack}
            runSimulation={runSimulation}
          />
        )}
      </div>
    </div>
  );
}