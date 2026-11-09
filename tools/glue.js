
/* ── 3D cosmos (assets/cosmos3d.js + assets/cosmos-graph.json): replaces the Explore view when WebGL is available ── */
(function(){
  const orig=render;let inst=null,booting=null,failed=false;
  const webgl=()=>{try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'))}catch(e){return false}};
  const asset=(tag,attrs)=>new Promise((ok,no)=>{const el=document.createElement(tag);Object.assign(el,attrs);el.onload=ok;el.onerror=no;document.head.appendChild(el)});
  let bundle=null;
  const loadBundle=()=>bundle||(bundle=Promise.all([
    asset('link',{rel:'stylesheet',href:'assets/cosmos3d.css?v=1'}),
    asset('link',{rel:'stylesheet',href:'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'}).catch(()=>{}),
    asset('script',{src:'assets/cosmos3d.js?v=1'}),
    fetch('assets/cosmos-graph.json?v=1').then(r=>{if(!r.ok)throw new Error('graph');return r.json()}).then(d=>{window.__scGraph=d})
  ]));
  function teardown(){booting=null;if(inst){try{inst.destroy()}catch(e){}inst=null}document.getElementById('gc')?.remove()}
  const callbacks={
    navigate:v=>setView(v),
    isDone:id=>done(id),
    isBookmarked:id=>data.bookmarks.includes(id),
    aiState:()=>{
      const pv=data.settings.aiProvider||'server',key=(localStorage.getItem('speakcosmos-provider-api-key')||sessionStorage.getItem('speakcosmos-provider-api-key'))||'',tok=sessionStorage.getItem('speakcosmos-ai-token')||'';
      const ok=pv==='server'?!!tok:!!key;
      return {ok,title:ok?(pv==='server'?'App AI connected':(pv==='gemini'?'Google Gemini':pv==='anthropic'?'Anthropic Claude':'OpenAI')+(data.settings.aiModel?' · '+data.settings.aiModel:'')+'. Open settings.'):''};
    },
    cloud:(()=>{
      const NAME='speakcosmos-topics.json';
      const srv=()=>{try{return localStorage.getItem('sc_cloud_srv')==='1'}catch(e){return false}};
      try{const u=new URL(location.href);if(u.searchParams.has('gconnected')||u.searchParams.has('gerror')){if(u.searchParams.has('gconnected')){localStorage.setItem('sc_cloud_srv','1');localStorage.setItem('sc_cloud_on','1')}else setTimeout(()=>{try{toast('Google sign-in did not finish. Please try again.')}catch(e){}},1500);u.searchParams.delete('gconnected');u.searchParams.delete('gerror');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash)}}catch(e){}
      // a fresh 1-hour key from the server, which holds the long-lived sign-in in a sealed cookie
      const ensure=async()=>{
        if(restoreGoogleToken())return;
        if(!srv())return;
        let r;try{r=await fetch('/api/gauth?action=token',{method:'POST',headers:{'x-sc':'1'},credentials:'same-origin'})}catch(e){throw new Error('You are offline. Sync will resume when you are back online.')}
        if(r.status===401){try{localStorage.removeItem('sc_cloud_srv')}catch(e){}throw new Error('Google sign-in expired. Connect again.')}
        if(!r.ok)throw new Error('Google sign-in is not answering. Will retry.');
        const j=await r.json();storeGoogleToken(j.access_token,j.expires_in);
      };
      const find=async()=>{const q=encodeURIComponent("name='"+NAME+"' and trashed=false");const r=await driveRequest('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q='+q+'&fields=files(id,modifiedTime)');return (await r.json()).files?.[0]||null};
      return {
        connected:()=>!!restoreGoogleToken()||srv(),
        ensure,
        wanted:()=>{try{return localStorage.getItem('sc_cloud_on')==='1'}catch(e){return false}},
        connect:async()=>{try{const st=await (await fetch('/api/gauth?action=status')).json();if(st&&st.enabled){location.href='/api/gauth?action=start';return new Promise(()=>{})}}catch(e){}await loadGoogleScript();return new Promise((ok,no)=>{const c=window.google.accounts.oauth2.initTokenClient({client_id:GOOGLE_CLIENT_ID,scope:GOOGLE_SCOPE,callback:r=>{if(r.error)return no(new Error(r.error_description||r.error));storeGoogleToken(r.access_token,r.expires_in);try{localStorage.setItem('sc_cloud_on','1')}catch(e){}ok(r.access_token)},error_callback:e=>no(new Error(e?.message||e?.type||'Google sign-in failed'))});c.requestAccessToken({prompt:''})})},
        load:async()=>{await ensure();const f=await find();if(!f)return null;const r=await driveRequest('https://www.googleapis.com/drive/v3/files/'+f.id+'?alt=media');return r.json()},
        save:async(state,prev)=>{await ensure();
          const up=async(name,obj)=>{const body=JSON.stringify(obj);const q=encodeURIComponent("name='"+name+"' and trashed=false");const r0=await driveRequest('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q='+q+'&fields=files(id)');const f=(await r0.json()).files?.[0];
            if(f){await driveRequest('https://www.googleapis.com/upload/drive/v3/files/'+f.id+'?uploadType=media',{method:'PATCH',headers:{'Content-Type':'application/json'},body});return}
            const b='sct_'+Date.now(),meta=JSON.stringify({name,parents:['appDataFolder']});
            await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+b},body:'--'+b+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+meta+'\r\n--'+b+'\r\nContent-Type: application/json\r\n\r\n'+body+'\r\n--'+b+'--'})};
          if(prev)await up('speakcosmos-topics.prev.json',{app:'SpeakCosmos topics (previous copy)',version:1,savedAt:Date.now(),state:prev});
          await up(NAME,{app:'SpeakCosmos topics',version:1,savedAt:Date.now(),state});
        }
      };
    })(),
    ask:async(question,context,opts)=>{
      const pv=data.settings.aiProvider||'server',headers={'Content-Type':'application/json'};
      if(pv==='server')headers['x-app-access-token']=sessionStorage.getItem('speakcosmos-ai-token')||'';
      else headers['x-user-api-key']=(localStorage.getItem('speakcosmos-provider-api-key')||sessionStorage.getItem('speakcosmos-provider-api-key'))||'';
      const r=await fetch('/api/tutor',{method:'POST',headers,body:JSON.stringify({mode:'ask',provider:pv,model:data.settings.aiModel||'',question,context,topic:(opts&&opts.topic)||'',topicName:(opts&&opts.name)||'',lang:(opts&&opts.lang)||'',source:(opts&&opts.source)||''})});
      if(!r.ok){let m='';try{m=(await r.json()).error||''}catch(e){}throw new Error(m||('AI error '+r.status))}
      return r.json();
    }
  };
  render=function(){
    if(view!=='cosmos'||failed||!webgl()){teardown();document.title='SpeakCosmos';return orig()}
    if(inst){inst.refresh();return}
    if(booting)return;
    if(graph){graph.destroy();graph=null}
    const el=document.createElement('div');el.id='gc';el.className='gc';el.dataset.theme=(localStorage.getItem('sc_theme')==='dark')?'dark':'light';
    el.innerHTML='<div class="gc-loading">Loading the cosmos…</div>';document.body.appendChild(el);document.title='SpeakCosmos · Explore';
    const mine=booting=loadBundle().then(()=>{
      if(booting!==mine||!document.getElementById('gc'))return;
      inst=window.SpeakCosmos3D.mount(el,{data:window.__scGraph,cb:callbacks});
    }).catch(err=>{console.warn('3D cosmos unavailable, using the flat map',err);failed=true;bundle=null;teardown();orig()});
  };
  render();
})();
