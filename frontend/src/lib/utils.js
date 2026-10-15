export function formatPercent(val) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

export function formatRate(val) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return (val * 100).toFixed(1);
}

export function formatAuc(val) {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return Number(val).toFixed(3);
}

export function formatNumber(val) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return Number(val).toLocaleString();
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const METRIC_TOOLTIPS = {
  accuracy: {
    title: 'Accuracy',
    formula: '(TP + TN) / Total',
    desc: 'The proportion of all positive and negative diagnoses correctly classified.'
  },
  precision: {
    title: 'Precision (Positive Predictive Value)',
    formula: 'TP / (TP + FP)',
    desc: 'Out of all individuals predicted positive, the fraction who actually have the condition.'
  },
  recall: {
    title: 'Recall / True Positive Rate (TPR)',
    formula: 'TP / (TP + FN)',
    desc: 'Out of all individuals with the actual condition, the fraction correctly flagged by the model.'
  },
  fpr: {
    title: 'False Positive Rate (FPR)',
    formula: 'FP / (FP + TN)',
    desc: 'Out of all healthy individuals, the fraction falsely diagnosed with the condition.'
  },
  f1: {
    title: 'F1 Score',
    formula: '2 × (Precision × Recall) / (Precision + Recall)',
    desc: 'The harmonic balance between precision and recall.'
  },
  selection_rate: {
    title: 'Selection Rate',
    formula: '(TP + FP) / Total',
    desc: 'The proportion of total cases that received a positive prediction.'
  },
  auc: {
    title: 'ROC-AUC',
    formula: 'Area Under Receiver Operating Characteristic Curve',
    desc: 'Measures how well the model separates positive cases from negative cases across all thresholds.'
  },
  demographic_parity_diff: {
    title: 'Demographic Parity Difference',
    formula: 'Max(Selection Rate) − Min(Selection Rate)',
    desc: 'The difference in positive prediction rates between the highest and lowest group. Zero indicates perfect parity.'
  },
  disparate_impact_ratio: {
    title: 'Disparate Impact Ratio',
    formula: 'Min(Selection Rate) / Max(Selection Rate)',
    desc: 'Ratio of the lowest group selection rate to the highest. Values below 0.80 violate the legal four-fifths rule.'
  },
  equal_opportunity_diff: {
    title: 'Equal Opportunity Difference (Recall Gap)',
    formula: 'Max(Recall) − Min(Recall)',
    desc: 'The gap in true positive rate across groups. Zero indicates patients with the disease have equal probability of detection regardless of demographic.'
  },
  equalized_odds_diff: {
    title: 'Equalized Odds Difference',
    formula: 'Max(Recall Gap, FPR Gap)',
    desc: 'The maximum between the recall difference and false positive rate difference across demographic groups.'
  },
  fpr_gap: {
    title: 'False Positive Rate Gap',
    formula: 'Max(FPR) − Min(FPR)',
    desc: 'The gap in false alarm rates across demographic groups.'
  },
  accuracy_gap: {
    title: 'Accuracy Gap',
    formula: 'Max(Accuracy) − Min(Accuracy)',
    desc: 'Difference in overall accuracy between the best-performing and worst-performing groups.'
  }
};
