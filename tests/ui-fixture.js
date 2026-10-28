// Browser-only fixture served in place of supabaseClient.js. Never connects to a project.
const role = location.pathname.split('/')[1];
const mode = new URLSearchParams(location.search).get('fixture');
const own = {id:'own', full_name:'Alex Tan', user_code:'IG-1024', role, status:'active', profile_completed:true,identity_verified:true,identity_verified_by:'fixture-admin',identity_verified_at:'2026-01-01T00:00:00Z'};
const providers = [
  {id:'p1', full_name:'Sarah Lim', user_code:'PR-201', role:'provider', status:'active'},
  {id:'p2', full_name:'Daniel Wong', user_code:'PR-202', role:'provider', status:'active'}
];
const requests = [
  {request_id:'REQ-101', client_id:'own', selected_provider_id:role==='provider'?'own':null, title:'Weekly home cleaning', category:'Cleaning', service_type:'Home Cleaning', location:'Kota Kinabalu, Sabah, Malaysia', budget:120, status:role==='provider'?'provider_selected':'pending', preferred_date:'2026-10-26', preferred_time:'10:00', client_lat:6.0367, client_lng:116.1186},
  {request_id:'REQ-102', client_id:'own', selected_provider_id:role==='provider'?'own':'p1', preferred_date:'2026-10-27', preferred_time:'11:00', title:'Kitchen tap repair', category:'Repair', location:'Likas, Sabah, Malaysia', status:'completed'}
];
function query(table) {
  const calls=[];
  const q=new Proxy({}, {get(_,key) {
    if(key==='then') return (resolve) => {
      let data=[]; let error=null;
      if(table==='verification_requests') data=[{role,status:'approved',reviewed_by:'fixture-admin',reviewed_at:'2026-01-01T00:00:00Z'}];
      const single=calls.some(c=>c[0]==='single');
      if(table==='users') data=single?own:providers;
      if(table==='service_requests') {
        const selected=calls.find(c=>c[0]==='select')?.[1];
        data=selected==='selected_provider_id'?[]:(single?requests[0]:(mode==='empty'?[]:requests));
        if(mode==='error') {data=null;error={message:'Fixture load error'};}
      }
      if(table==='provider_specializations') data=providers.map(p=>({provider_id:p.id,category:'Cleaning',specialization:'Home Cleaning'}));
      if(table==='provider_profiles') data=providers.map((p,i)=>({provider_id:p.id,is_available:true,is_verified:i===0,bio:i===0?'Careful, reliable home cleaning with attention to the little details. Happy to help keep your space fresh.':'Friendly service for busy households. Flexible cleaning support for your home.',location:i===0?'Kota Kinabalu, Sabah':'Likas, Sabah',provider_lat:6.04+i*.02,provider_lng:116.12}));
      if(table==='provider_weekly_availability') data=providers.map(p=>({provider_id:p.id,day_of_week:1,start_time:'08:00',end_time:'18:00'}));
      if(table==='service_reviews') data=[{reviewee_id:'p1',rating:5,feedback:'On time, thorough and easy to communicate with.'}];
      if(mode==='error' && table!=='verification_requests' && !(table==='users' && single)) {data=null;error={message:'Fixture load error'};}
      return Promise.resolve({data,error,count:mode==='error'?null:12}).then(resolve);
    };
    return (...args)=>{calls.push([key,...args]);return q;};
  }});
  return q;
}
export const supabase={
  auth:{getSession:async()=>({data:{session:{user:{id:'own'}}}}),getUser:async()=>({data:{user:{id:'own'}}}),signOut:async()=>({})},
  from:query,
  rpc:async(name,args)=>{
    if(name==='igotu_backend_contract') return {data:{version:'20261026.1',notifications:'database'},error:null};
    if(name==='provider_service_requests') return {data: mode==='empty'?[]:requests,error:mode==='error'?{message:'Fixture error'}:null};
    if(name==='recommended_provider_candidates') return {data:mode==='empty'?[]:providers.map((p,i)=>({...p,bio:'Careful, reliable home cleaning with attention to the little details.',location:'Likas, Sabah',is_verified:i===0,distance_km:1+i,matched_specializations:['Home Cleaning'],has_weekly_hours:true,average_rating:i===0?5:null,total_reviews:i===0?1:0,total_completed:12,recent_feedback:i===0?['On time, thorough and easy to communicate with.']:[]})),error:mode==='error'?{message:'Fixture error'}:null};
    window.fixtureRpc={name,args};return {data:null,error:{message:'Fixture: selection stopped before any write.'}};},
  channel:()=>({on(){return this;},subscribe(){return this;}}), removeChannel(){}
};

export async function clearStoredAuthSession() {}
