// Synthetic contract model only. This is not PostgreSQL/Storage authorization proof.
const prefix='https://oqalpauljjhytnrpzcqp.supabase.co/storage/v1/object/public/request-images/';
function imagePath(r) {
  const candidate=r.request_image_path || (r.request_image_url?.startsWith(prefix)?r.request_image_url.slice(prefix.length):null);
  if(!candidate || !/^[A-Za-z0-9_/-]+\.(jpg|jpeg|png|webp)$/.test(candidate) || candidate.split('/')[0]!==r.client_id || (r.request_image_url && r.request_image_url!==prefix+candidate))return null;
  return candidate;
}
function canReadImage(state,subject,r) {
  const user=state.tables.users.find(u=>u.id===subject);
  return Boolean(state.session && user?.status==='active' && (user.role==='admin'||(user.identity_verified&&user.profile_completed)) && r && (user.role==='admin'||(user.role==='client'&&r.client_id===subject)||(user.role==='provider'&&r.selected_provider_id===subject&&['confirmed','in_progress','completed'].includes(r.status))));
}
module.exports={imagePath,canReadImage,prefix};
