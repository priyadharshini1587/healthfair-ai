import React, { createContext, useContext, useState, useEffect } from 'react';
import { checkHealth } from '../lib/api';

const AuditContext = createContext(null);

export function AuditProvider({ children }) {
  const [history, setHistory] = useState([]);
  const [activeAudit, setActiveAudit] = useState(null);
  const [activeRunA, setActiveRunA] = useState(null);
  const [activeRunB, setActiveRunB] = useState(null);
  const [apiStatus, setApiStatus] = useState('connected');
  const [errorBanner, setErrorBanner] = useState(null);
  const [cachedFiles, setCachedFiles] = useState(null);

  // Poll /api/health every 15 seconds
  useEffect(() => {
    let isMounted = true;
    const poll = async () => {
      try {
        await checkHealth();
        if (isMounted) setApiStatus('connected');
      } catch (err) {
        if (isMounted) setApiStatus('offline');
      }
    };

    poll();
    const interval = setInterval(poll, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const addAudit = (report, modelFile, datasetFile) => {
    const reportWithId = {
      ...report,
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString()
    };
    setHistory(prev => [reportWithId, ...prev]);
    setActiveAudit(reportWithId);
    if (modelFile && datasetFile) {
      setCachedFiles({ modelFile, datasetFile });
    }
    return reportWithId;
  };

  const deleteAudit = (id) => {
    setHistory(prev => prev.filter(a => a.id !== id));
    if (activeAudit?.id === id) {
      setActiveAudit(null);
    }
  };

  const addMitigatedRun = (report, originalReportName, method) => {
    const runName = `${originalReportName} (mitigated: ${method})`;
    const updatedReport = {
      ...report,
      id: `mitigated_${Date.now()}`,
      meta: {
        ...report.meta,
        model_name: runName
      }
    };
    setHistory(prev => [updatedReport, ...prev]);
    return updatedReport;
  };

  const showError = (message) => {
    setErrorBanner({ message });
  };

  const clearError = () => {
    setErrorBanner(null);
  };

  return (
    <AuditContext.Provider
      value={{
        history,
        activeAudit,
        setActiveAudit,
        activeRunA,
        setActiveRunA,
        activeRunB,
        setActiveRunB,
        apiStatus,
        errorBanner,
        showError,
        clearError,
        cachedFiles,
        setCachedFiles,
        addAudit,
        deleteAudit,
        addMitigatedRun
      }}
    >
      {children}
    </AuditContext.Provider>
  );
}

export function useAudit() {
  const context = useContext(AuditContext);
  if (!context) {
    throw new Error('useAudit must be used within an AuditProvider');
  }
  return context;
}
