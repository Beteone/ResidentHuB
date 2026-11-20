import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DEMO_DELETE_STEPS } from '../tools/clear-demo-data.js';

const tables = DEMO_DELETE_STEPS.map(step => step.table);
const first = table => tables.indexOf(table);
const before = (child, parent) => {
  assert.notEqual(first(child), -1, `Missing cleanup for ${child}`);
  assert.notEqual(first(parent), -1, `Missing cleanup for ${parent}`);
  assert.ok(first(child) < first(parent), `${child} must be deleted before ${parent}`);
};

before('rh_cashflows', 'rh_invoices');
before('rh_cashflows', 'rh_buildings');
before('rh_deposit_transactions', 'rh_deposits');
before('rh_invoices', 'rh_contracts');
before('rh_invoices', 'rh_customers');
before('rh_invoices', 'rh_apartments');
before('rh_contract_tenants', 'rh_contracts');
before('rh_contract_tenants', 'rh_customers');
before('rh_contracts', 'rh_customers');
before('rh_contracts', 'rh_apartments');
before('rh_deposits', 'rh_customers');
before('rh_deposits', 'rh_apartments');
before('rh_support_requests', 'rh_customers');
before('rh_meters', 'rh_apartments');
before('rh_contracts', 'rh_apartments');
before('rh_support_requests', 'rh_apartments');
before('rh_assets', 'rh_apartments');
before('rh_customers', 'rh_buildings');
before('rh_cashflows', 'rh_buildings');
before('rh_invoices', 'rh_buildings');
before('rh_deposits', 'rh_buildings');
before('rh_support_requests', 'rh_buildings');
before('rh_assets', 'rh_buildings');
before('rh_contracts', 'rh_buildings');
before('rh_apartments', 'rh_buildings');
before('rh_building_assignments', 'rh_buildings');

for (const step of DEMO_DELETE_STEPS) {
  const filters = Object.values(step.filters);
  assert.ok(filters.every(filter => typeof filter === 'string'), `${step.table} cleanup needs explicit filters`);
  assert.ok(filters.every(filter => filter.includes('demo-rh-*') || filter === 'eq.billingRuns'),
    `${step.table} cleanup must stay limited to demo records`);
}

console.log('PASS demo cleanup: all migration foreign-key dependencies delete child rows first and target only demo-rh-* rows');

const dryRun = execFileSync(process.execPath, ['tools/seed-demo-data.js', '--dry-run'], { encoding: 'utf8' });
assert.match(dryRun, /ít nhất \d+ nhiệm vụ được giao tại 3 tòa của nhân viên/,
    'Seed must preserve at least two staff-assigned support requests in staff buildings');
console.log('PASS demo seed: at least two staff-assigned tasks are in staff buildings');
