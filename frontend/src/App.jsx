import React from 'react';
import { BrowserRouter, Routes, Route } from './lib/router';
import { AuditProvider } from './context/AuditContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import NewAudit from './pages/NewAudit';
import FairnessAnalysis from './pages/FairnessAnalysis';
import ModelComparison from './pages/ModelComparison';
import ReportsHistory from './pages/ReportsHistory';

export default function App() {
  return (
    <AuditProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/audit/new" element={<NewAudit />} />
            <Route path="/analysis" element={<FairnessAnalysis />} />
            <Route path="/compare" element={<ModelComparison />} />
            <Route path="/reports" element={<ReportsHistory />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuditProvider>
  );
}
