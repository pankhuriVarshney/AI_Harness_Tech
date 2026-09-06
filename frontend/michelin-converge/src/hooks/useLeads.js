import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';

export function useLeads() {
  const [leads, setLeads] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [distributors, setDistributors] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [processingLead, setProcessingLead] = useState(null);

  // Initialize session on mount
  useEffect(() => {
    const initSession = async () => {
      try {
        const session = await api.createSession();
        setSessionId(session.session_id);
      } catch (err) {
        console.error('Failed to create session:', err);
      }
    };
    initSession();
  }, []);

  // Fetch leads, catalog, distributors on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [leadsData, catalogData, distributorsData] = await Promise.all([
          api.getLeads(),
          api.getCatalog(),
          api.getDistributors()
        ]);
        setLeads(leadsData);
        setCatalog(catalogData);
        setDistributors(distributorsData);
      } catch (err) {
        setError(err.message);
      }
    };
    fetchData();
  }, []);

  // Process a single lead
  const processLead = useCallback(async (leadId, rawText, lat, lng) => {
    if (!sessionId) {
      setError('No active session. Please refresh.');
      return null;
    }

    setProcessingLead(leadId);
    setLoading(true);
    setError(null);

    try {
      const result = await api.processLead(sessionId, {
        lead_id: leadId,
        raw_text: rawText,
        customer_lat: lat || 18.5606,
        customer_lng: lng || 73.7796
      });
      
      // Update the lead in the list with the processed state
      setLeads(prev => prev.map(lead => 
        lead.lead_id === leadId ? { ...lead, ...result, processed: true } : lead
      ));
      
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
      setProcessingLead(null);
    }
  }, [sessionId]);

  // Process all leads
  const processAllLeads = useCallback(async () => {
    if (!sessionId) {
      setError('No active session. Please refresh.');
      return;
    }

    setLoading(true);
    setError(null);

    const results = [];
    for (const lead of leads) {
      try {
        const result = await api.processLead(sessionId, {
          lead_id: lead.lead_id,
          raw_text: lead.raw_text,
          customer_lat: lead.customer_lat || 18.5606,
          customer_lng: lead.customer_lng || 73.7796
        });
        results.push({ leadId: lead.lead_id, success: true, result });
      } catch (err) {
        results.push({ leadId: lead.lead_id, success: false, error: err.message });
      }
    }

    // Refresh leads after processing
    try {
      const freshLeads = await api.getLeads();
      setLeads(freshLeads);
    } catch (err) {
      console.error('Failed to refresh leads:', err);
    }

    setLoading(false);
    return results;
  }, [sessionId, leads]);

  // Get trace for a lead
  const getTrace = useCallback(async (leadId) => {
    try {
      return await api.getTrace(leadId);
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  // Run simulation
  const runSimulation = useCallback(async (leadId, params) => {
    try {
      return await api.simulate(leadId, params);
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, []);

  // Add a new lead manually
  const addLead = useCallback((rawText, lat, lng) => {
    const newLead = {
      lead_id: `LEAD-${Date.now().toString().slice(-4)}`,
      raw_text: rawText,
      customer_lat: lat || 18.5606,
      customer_lng: lng || 73.7796,
      status: 'PROCESSING',
      processed: false
    };
    setLeads(prev => [...prev, newLead]);
    return newLead;
  }, []);

  return {
    leads,
    catalog,
    distributors,
    sessionId,
    loading,
    error,
    processingLead,
    processLead,
    processAllLeads,
    getTrace,
    runSimulation,
    addLead,
    refreshLeads: async () => {
      try {
        const data = await api.getLeads();
        setLeads(data);
      } catch (err) {
        setError(err.message);
      }
    }
  };
}