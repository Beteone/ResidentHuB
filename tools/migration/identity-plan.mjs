// Offline dry-run ONLY. Does not import, connect, send mail or write storage/DB.
// verified/approveAdmin are operator attestations, not proof supplied by a user UI.
const email = value => String(value || '').trim().toLowerCase();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function identityPlan({ users, types, links, existingMemberships, organizationId }) {
  const errors = [];
  if (![users,types,links,existingMemberships].every(Array.isArray) || !uuid.test(organizationId || '')) return { ok: false, errors: ['invalid-input'], members: [], types: [] };
  function unique(rows, key, label) {
    const seen = new Set();
    for (const row of rows) {
      const value = key(row);
      if (!value || seen.has(value)) errors.push(label);
      seen.add(value);
    }
  }
  unique(users, u => u?.id, 'duplicate-or-missing-legacy-id');
  unique(users, u => email(u?.email), 'duplicate-or-missing-email');
  unique(types, t => t?.id, 'duplicate-or-missing-type');
  unique(links, l => l?.legacyId, 'duplicate-or-missing-link');
  unique(links, l => l?.authUserId, 'duplicate-or-missing-auth-uid');
  const candidates = users.filter(u => u?.id === 'u-manager-1' || email(u?.email) === 'manager@residenthub.vn');
  if (candidates.length !== 1 || candidates[0].id !== 'u-manager-1' || email(candidates[0].email) !== 'manager@residenthub.vn') errors.push('demo-admin-identity-conflict');
  const members = [];
  for (const user of users) {
    if (!user || typeof user !== 'object') { errors.push('invalid-user'); continue; }
    const type = types.find(t => t?.id === user.accountTypeId);
    const link = links.find(l => l?.legacyId === user.id);
    if (!type || (type.portal === 'resident') !== (user.role === 'resident')) { errors.push('missing-or-conflicting-type'); continue; }
    if (!link || link.verified !== true || !uuid.test(link.authUserId || '') || email(link.confirmedEmail) !== email(user.email)) { errors.push('verified-auth-link-required'); continue; }
    if (type.fullAccess && (link.approveAdmin !== true || user.role !== 'manager' || type.portal !== 'manager' || type.system !== true)) { errors.push('admin-approval-required'); continue; }
    if (!['active','locked','inactive'].includes(user.status)) { errors.push('explicit-status-required'); continue; }
    const conflicts = existingMemberships.filter(m => m.organizationId === organizationId && (m.id === user.id || m.authUserId === link.authUserId));
    if (conflicts.length) { errors.push('existing-membership-requires-manual-reconciliation'); continue; }
    const profile = {};
    for (const key of ['phone','avatar','unit','building','floor','apartmentId','department','title','employeeCode','staffGroup','supervisorId','contactEmail']) {
      if (user[key] !== undefined) {
        if (typeof user[key] !== 'string') errors.push('invalid-profile-field');
        else profile[key] = user[key];
      }
    }
    members.push({ organizationId, id:user.id, authUserId:link.authUserId, name:String(user.name || ''),
      accountTypeId:type.id, role:user.role, status:user.status, allBuildings:user.allBuildings === true,
      buildingIds:Array.isArray(user.buildingIds) ? [...new Set(user.buildingIds.map(String))] : [],
      residentId:user.residentId || null, profile });
  }
  if (links.some(l => !users.some(u => u?.id === l?.legacyId))) errors.push('orphan-auth-link');
  const plannedTypes = types.filter(Boolean).map(t => ({ id:t.id, name:t.name, portal:t.portal,
    system:t.system === true, fullAccess:t.fullAccess === true, description:String(t.description || ''),
    permissions:Array.isArray(t.permissions) ? t.permissions.filter(p => typeof p === 'string') : [] }));
  if (errors.length) return { ok:false, errors:[...new Set(errors)], members:[], types:[] };
  return { ok:true, dryRun:true, requiresTrustedAuthVerification:true, members, types:plannedTypes };
}
