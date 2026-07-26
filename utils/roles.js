const ROLE_MAP = {
  project_manager: 'project_manager',
  'project manager': 'project_manager',
  billing_engineer: 'billing_engineer',
  'billing engineer': 'billing_engineer',
  site_engineer: 'site_engineer',
  'site engineer': 'site_engineer',
};

const ROLE_LABELS = {
  project_manager: 'Project Manager',
  billing_engineer: 'Billing Engineer',
  site_engineer: 'Site Engineer',
};

const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
const ROLE_VALUES = ROLE_OPTIONS.map((role) => role.value);

function normalizeRole(role) {
  if (!role) return '';
  const key = String(role).trim().toLowerCase().replace(/[-\s]+/g, '_');
  return ROLE_MAP[key] || key;
}

function displayRole(role) {
  return ROLE_LABELS[normalizeRole(role)] || ROLE_LABELS.project_manager;
}

module.exports = { normalizeRole, displayRole, ROLE_LABELS, ROLE_OPTIONS, ROLE_VALUES };