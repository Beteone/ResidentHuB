// Server ONLY. SUPABASE_SERVICE_ROLE_KEY is read from Edge secrets, never frontend.
import { createClient } from 'npm:@supabase/supabase-js@2';

const origin = Deno.env.get('RESIDENTHUB_SITE_ORIGIN') || '';
const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Vary': 'Origin', 'Content-Type': 'application/json' };
const reply = (status: number, value: object) => new Response(JSON.stringify(value), { status, headers });
Deno.serve(async request => {
  if (!origin || request.headers.get('origin') !== origin) return reply(403, { error: 'Origin denied' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS' } });
  if (request.method !== 'POST') return reply(405, { error: 'POST required' });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.replace(/^Bearer /i, '');
    const caller = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await caller.auth.getUser(token);
    if (authError || !user) return reply(401, { error: 'Sign in required' });
    const body = await request.json();
    // Do not accept browser-chosen Auth IDs, legacy IDs, passwords or Admin flags.
    if (!body || Object.keys(body).some(k => !['organizationId', 'member'].includes(k))) return reply(400, { error: 'Invalid request' });
    const args = { p_org: body.organizationId, p_member: body.member };
    const { data: actor, error: denied } = await caller.rpc('rh_identity_invite_check', args);
    if (denied || actor?.actor !== user.id) return reply(403, { error: 'Invite denied' });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(body.member.email.trim(), { redirectTo: origin + '/auth-callback.html' });
    if (inviteError || !invited.user) return reply(409, { error: 'Invitation unavailable or identity exists; do not auto-link' });
    const { data, error: attachError } = await admin.rpc('rh_identity_attach_invite', { ...args, p_auth_user: invited.user.id, p_actor: user.id, p_session: actor.session, p_started: actor.checkedAt });
    if (attachError) {
      // No automatic delete/retry: emailed Auth identity may already be in use.
      // It has NO membership/access; trusted operator must reconcile explicitly.
      console.error('ResidentHub invite requires reconciliation', { organizationId: body.organizationId, authUserId: invited.user.id });
      return reply(409, { error: 'Invitation sent, membership not attached; operator reconciliation required' });
    }
    return reply(200, data);
  } catch (_) { return reply(400, { error: 'Invitation could not be completed' }); }
});
