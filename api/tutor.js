/** SpeakCosmos AI feedback endpoint.
 * Two modes:
 * 1) App server mode: APP_ACCESS_TOKEN + AI_API_KEY env vars.
 * 2) User-key mode: a personal OpenAI or Gemini key arrives over HTTPS for this request only.
 *    The key is never persisted by this function.
 */
import { timingSafeEqual } from 'node:crypto';

function equal(a,b){
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length===y.length&&timingSafeEqual(x,y);
}
function cleanModel(v){return String(v||'').trim().replace(/[^a-zA-Z0-9._:/-]/g,'').slice(0,120)}
function promptPayload(body){
  const {scenario,prompt,lesson,answer,modelAnswer}=body||{};
  const lines=[scenario,prompt,lesson,modelAnswer].map(v=>String(v||'').slice(0,800));
  return {
    answer:String(answer||''),
    system:'You are a helpful spoken English teacher for an Indian learner whose first language is Bengali. Write short, specific, fair feedback on one spoken attempt. Never claim to have analysed audio or pronunciation: you only receive text. Return JSON only with string keys good, next, rewrite, bn. good = one genuine observation; next = one simple improvement; rewrite = a natural corrected version preserving the learner intention; bn = explanation in simple Bengali.',
    user:`Situation: ${lines[0]}\nCoach question: ${lines[1]}\nTask: ${lines[2]}\nReference response: ${lines[3]}\nLearner answer: ${answer}`
  };
}
function safeResult(obj){
  if(!obj||!obj.good||!obj.next)throw new Error('Invalid AI feedback');
  return {
    good:String(obj.good).slice(0,600),
    next:String(obj.next).slice(0,600),
    rewrite:String(obj.rewrite||'').slice(0,600),
    bn:String(obj.bn||'').slice(0,600)
  };
}
function parseJsonText(raw){
  const text=String(raw||'').trim().replace(/^\`\`\`(?:json)?/i,'').replace(/\`\`\`$/,'').trim();
  return JSON.parse(text);
}
async function callOpenAI({key,model,system,user,signal,base='https://api.openai.com/v1'}){
  const r=await fetch(`${base}/chat/completions`,{
    method:'POST',
    headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    signal,
    body:JSON.stringify({
      model,
      temperature:0.35,
      max_tokens:320,
      response_format:{type:'json_object'},
      messages:[{role:'system',content:system},{role:'user',content:user}]
    })
  });
  if(!r.ok)throw new Error(`OpenAI provider error ${r.status}`);
  const j=await r.json();
  return safeResult(parseJsonText(j.choices?.[0]?.message?.content||'{}'));
}
async function callGemini({key,model,system,user,signal}){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const r=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    signal,
    body:JSON.stringify({
      systemInstruction:{parts:[{text:system}]},
      contents:[{role:'user',parts:[{text:user}]}],
      generationConfig:{temperature:0.35,maxOutputTokens:320,responseMimeType:'application/json'}
    })
  });
  if(!r.ok)throw new Error(`Gemini provider error ${r.status}`);
  const j=await r.json();
  const raw=j.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'{}';
  return safeResult(parseJsonText(raw));
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});

  const p=promptPayload(req.body);
  if(!p.answer.trim()||p.answer.length>3000)return res.status(400).json({error:'Invalid response'});

  const requestedProvider=String(req.body?.provider||'server').toLowerCase();
  const userKey=String(req.headers['x-user-api-key']||'').trim();
  const appToken=String(req.headers['x-app-access-token']||'').trim();

  let provider=requestedProvider,key='',model='',base='';
  if(provider==='openai'||provider==='gemini'){
    if(!userKey)return res.status(401).json({error:'Personal API key required'});
    if(userKey.length<10||userKey.length>500)return res.status(400).json({error:'Invalid API key'});
    key=userKey;
    model=cleanModel(req.body?.model);
    if(!model)return res.status(400).json({error:'Model name is required'});
  }else{
    provider='server';
    if(!process.env.APP_ACCESS_TOKEN||!process.env.AI_API_KEY)return res.status(503).json({error:'AI is not configured. The local practice coach is still available.'});
    if(!equal(appToken,process.env.APP_ACCESS_TOKEN))return res.status(401).json({error:'Not authorised'});
    key=process.env.AI_API_KEY;
    model=process.env.AI_MODEL||'gpt-4o-mini';
    base=(process.env.AI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,'');
    if(!/^https:\/\//.test(base))return res.status(500).json({error:'Configure an HTTPS model endpoint.'});
  }

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),18000);
  try{
    const result=provider==='gemini'
      ? await callGemini({key,model,system:p.system,user:p.user,signal:controller.signal})
      : await callOpenAI({key,model,system:p.system,user:p.user,signal:controller.signal,base:provider==='server'?base:'https://api.openai.com/v1'});
    return res.status(200).json(result);
  }catch(err){
    return res.status(502).json({error:String(err?.message||'AI could not respond').slice(0,180)});
  }finally{clearTimeout(timeout)}
}
