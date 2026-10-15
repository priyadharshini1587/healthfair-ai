export async function checkHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('API not available');
  return res.json();
}

export async function inspectFiles(modelFile, datasetFile) {
  const formData = new FormData();
  formData.append('model', modelFile);
  formData.append('dataset', datasetFile);

  const res = await fetch('/api/inspect', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Failed to inspect files');
  }
  return data;
}

export async function runAudit(modelFile, datasetFile, config) {
  const formData = new FormData();
  formData.append('model', modelFile);
  formData.append('dataset', datasetFile);
  formData.append('config', JSON.stringify(config));

  const res = await fetch('/api/audit', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Audit failed');
  }
  return data;
}

export async function applyMitigation(modelFile, datasetFile, config, method, attribute) {
  const formData = new FormData();
  formData.append('model', modelFile);
  formData.append('dataset', datasetFile);
  formData.append('config', JSON.stringify(config));
  formData.append('method', method);
  formData.append('attribute', attribute);

  const res = await fetch('/api/mitigate', {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Mitigation failed');
  }
  return data;
}

export async function downloadMitigatedPredictions(modelFile, datasetFile, config, method, attribute) {
  const formData = new FormData();
  formData.append('model', modelFile);
  formData.append('dataset', datasetFile);
  formData.append('config', JSON.stringify(config));
  formData.append('method', method);
  formData.append('attribute', attribute);

  const res = await fetch('/api/mitigate/predictions', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.detail || 'Failed to export predictions');
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `healthfair_${method}_${attribute}_predictions.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
