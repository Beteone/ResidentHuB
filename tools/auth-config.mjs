// Only generates a public config file. Does not deploy/connect/import anything.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export function publicConfig(env) {
  const url = new URL(env.VITE_SUPABASE_URL);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('Supabase URL must be a plain HTTPS origin');
  const publicKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  if (!/^sb_publishable_[\w-]+$/.test(publicKey)) {
    let claims;
    try { claims = JSON.parse(Buffer.from(publicKey.split('.')[1], 'base64url').toString()); } catch (_) { throw new Error('Publishable/anon public key required'); }
    if (claims.role !== 'anon') throw new Error('Secret/service role keys are forbidden in frontend configuration');
  }
  const organizationId = env.VITE_SUPABASE_ORGANIZATION_ID;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId || '')) throw new Error('Organization UUID required');
  return { mode: 'supabase', url: url.origin, publicKey, organizationId };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const config = publicConfig(process.env);
  writeFileSync('auth-config.generated.js', 'window.RH_AUTH_CONFIG = Object.freeze(' + JSON.stringify(config) + ');\n', { flag: 'wx' });
  console.log('Generated public config; existing auth-config.js and all storage are unchanged.');
}
