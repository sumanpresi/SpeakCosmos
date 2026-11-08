
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
      const pv=data.settings.aiProvider||'server',key=sessionStorage.getItem('speakcosmos-provider-api-key')||'',tok=sessionStorage.getItem('speakcosmos-ai-token')||'';
      const ok=pv==='server'?!!tok:!!key;
      return {ok,title:ok?(pv==='server'?'App AI connected':(pv==='gemini'?'Google Gemini':'OpenAI')+(data.settings.aiModel?' · '+data.settings.aiModel:'')+'. Open settings.'):''};
    },
    ask:async(question,context,opts)=>{
      const pv=data.settings.aiProvider||'server',headers={'Content-Type':'application/json'};
      if(pv==='server')headers['x-app-access-token']=sessionStorage.getItem('speakcosmos-ai-token')||'';
      else headers['x-user-api-key']=sessionStorage.getItem('speakcosmos-provider-api-key')||'';
      const r=await fetch('/api/tutor',{method:'POST',headers,body:JSON.stringify({mode:'ask',provider:pv,model:data.settings.aiModel||'',question,context,topic:(opts&&opts.topic)||'',topicName:(opts&&opts.name)||''})});
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
