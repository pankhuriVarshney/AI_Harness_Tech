// API client for Michelin Converge backend
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';

export const api = {
  // Create a session
  createSession: async () => {
    const response = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!response.ok) throw new Error('Failed to create session');
    return response.json();
  },

  // Get all leads (demo inbox)
  getLeads: async () => {
    const response = await fetch(`${API_BASE}/api/leads`);
    if (!response.ok) throw new Error('Failed to fetch leads');
    return response.json();
  },

  // Get tyre catalog
  getCatalog: async () => {
    const response = await fetch(`${API_BASE}/api/catalog`);
    if (!response.ok) throw new Error('Failed to fetch catalog');
    return response.json();
  },

  // Get distributors
  getDistributors: async () => {
    const response = await fetch(`${API_BASE}/api/distributors`);
    if (!response.ok) throw new Error('Failed to fetch distributors');
    return response.json();
  },

  // Process a lead
  processLead: async (sessionId, leadData) => {
    const payload = {
      session_id: sessionId,
      lead_id: leadData.lead_id,
      raw_text: leadData.raw_text,
      customer_lat: leadData.customer_lat,
      customer_lng: leadData.customer_lng
    };
    const response = await fetch(`${API_BASE}/api/leads/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to process lead');
    }
    return response.json();
  },

  // Get agent trace for a lead
  getTrace: async (leadId) => {
    const response = await fetch(`${API_BASE}/api/leads/${leadId}/trace`);
    if (!response.ok) throw new Error('Failed to fetch trace');
    return response.json();
  },

  // Run simulation (what-if)
  simulate: async (leadId, params) => {
    const payload = {
      lead_id: leadId,
      budget: params.budget,
      requested_discount_pct: params.requested_discount_pct,
      customer_lat: params.customer_lat,
      customer_lng: params.customer_lng,
      recommended_sku: params.recommended_sku
    };
    const response = await fetch(`${API_BASE}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to run simulation');
    }
    return response.json();
  }
};