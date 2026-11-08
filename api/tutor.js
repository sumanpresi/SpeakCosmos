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
function askPayload(body){
  const q=String(body?.question||'').slice(0,500);
  const ctx=(Array.isArray(body?.context)?body.context:[]).slice(0,16).map((c,i)=>`[${i+1}] ${String(c?.l||'').slice(0,90)} (${String(c?.k||'').slice(0,20)}): ${String(c?.d||'').slice(0,560)}`).join('\n');
  if(String(body?.topic||'')==='source'){
    const bn=String(body?.lang||'')==='bn',src=String(body?.source||'').slice(0,9000),note=(Array.isArray(body?.context)?body.context:[])[0]||{},tr=/^__translate/.test(q);
    const nt=`Title: ${String(note.l||'').slice(0,120)}\nNote: ${String(note.d||'').slice(0,900)}`;
    return {
      mode:'ask',
      max:tr?1600:2200,
      answer:q||'source',
      system:tr
        ?'Translate the learner\'s note into clear, natural Bengali (বাংলা). Keep names, numbers, timestamps and the meaning exactly; do not add or remove ideas. Return JSON only: {"answer":"<the Bengali translation>"}'
        :'You help a learner understand what a speaker says in a lecture or podcast. You get the learner\'s note and the matching passage of an automatic English translation of a Hindi transcript. The passage is machine-translated and sometimes garbled, so reconstruct the likely meaning from the surrounding lines and say plainly when a part is unclear. Use ONLY the passage and the note; add no outside facts and do not invent quotes. Attribute ideas to the speaker ("he says"). Go deeper than the note: explain the argument step by step and include the examples the speaker uses, in under 300 words, with short paragraphs or bullets. Write the answer in '+(bn?'Bengali (বাংলা)':'simple English')+'. Return JSON only: {"answer":"..."}',
      user:tr?nt:`Question: ${q}\n\n${nt}\n\nTranscript passage:\n${src}`
    };
  }
  if(String(body?.topic||'')==='judge'){
    return {
      mode:'ask',
      max:1800,
      answer:q||'judge',
      system:'You compare ideas that come from different topics of a personal knowledge graph. Each numbered note is "Pair N: A <-> B" followed by the text of A and of B. For each pair decide: "similar" (the same or a closely parallel idea), "contradicts" (they make claims that cannot both be true, or pull in opposite directions), "complements" (related, neither similar nor opposed) or "unrelated". Use ONLY the text given. Do not invent facts. Be careful: sharing words is not the same as agreeing. Return JSON only: {"answer":"one sentence overall","verdicts":[{"i":1,"verdict":"similar|contradicts|complements|unrelated","why":"under 25 words"}]}',
      user:`Pairs:\n${ctx}`
    };
  }
  if(String(body?.topic||'')==='discover'){
    const want=String(body?.topicName||'')==='contradict'?'CONTRADICT each other (opposite claims or opposite directions)':'are SIMILAR (the same or closely parallel idea)';
    return {
      mode:'ask',
      max:1800,
      answer:q||'discover',
      system:'You search a personal knowledge graph for relations between topics. The numbered notes come from several topics (the topic is in brackets). Find up to 6 pairs of notes from DIFFERENT topics that '+want+'. Use ONLY the notes given; never invent. Prefer fewer, solid pairs over many weak ones. Return JSON only: {"answer":"one sentence overall","pairs":[{"a":1,"b":5,"why":"under 25 words"}]}',
      user:`Notes:\n${ctx}`
    };
  }
  if(String(body?.topic||'')==='notes'){
    const name=String(body?.topicName||'').replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,40)||'the user\'s notes';
    return {
      mode:'ask',
      max:1400,
      answer:q,
      system:'You help a researcher think across their own notes in a personal knowledge graph ('+name+'). Use ONLY the numbered notes provided; they are the user\'s own words and may include their own claims. If they do not cover the question, say so briefly. Never invent facts, sources or quotations. When asked to connect ideas, name the link, say what is speculative, and keep it under 140 words. Cite notes as [1], [2]. Return JSON only: {"answer":"...","bn":""}',
      user:`Question: ${q}\n\nNotes:\n${ctx}`
    };
  }
  if(String(body?.topic||'')==='gita')return {
    mode:'ask',
    max:1600,
    answer:q,
    system:'You are a gentle guide to the Bhagavad Gita inside SpeakCosmos, for a learner whose first language is Bengali. Answer using ONLY the numbered notes, which are verses and ideas from the Gita graph; if they do not cover the question, say so briefly. Cite verses by their reference, like (BG 2.47). Do not invent verses or quotations. Use simple English, under 140 words.',
    user:`Question: ${q}\n\nGraph notes:\n${ctx}`
  };
  if(String(body?.topic||'')==='philosophy')return {
    mode:'ask',
    max:1600,
    answer:q,
    system:'You are a teacher of Indian philosophy inside SpeakCosmos, for a learner whose first language is Bengali. Answer using ONLY the numbered notes, which paraphrase Dr. Vikas Divyakirti\'s lectures; if they do not cover the question, say so briefly. Attribute contested views to the speaker. Use simple English, under 140 words, and cite notes as [1], [2]. Return JSON only: {"answer":"...","bn":"the same answer as a clear Bengali paragraph of 2 to 4 sentences"}',
    user:`Question: ${q}\n\nGraph notes:\n${ctx}`
  };
  return {
    mode:'ask',
    answer:q,
    system:'You are the guide inside SpeakCosmos, a spoken-English knowledge graph for an Indian learner whose first language is Bengali. Answer the question using ONLY the numbered graph notes provided; if they do not cover it, say so briefly. Be concise (under 120 words), practical, use simple English, and give one short example sentence when helpful. Cite the notes you used as [1], [2]. Return JSON only: {"answer":"...","bn":"one short line of Bengali guidance"}',
    user:`Question: ${q}\n\nGraph notes:\n${ctx}`
  };
}
function promptPayload(body){
  if(body&&body.mode==='ask')return askPayload(body);
  const {scenario,prompt,lesson,answer,modelAnswer}=body||{};
  const lines=[scenario,prompt,lesson,modelAnswer].map(v=>String(v||'').slice(0,800));
  return {
    answer:String(answer||''),
    system:'You are a helpful spoken English teacher for an Indian learner whose first language is Bengali. Write short, specific, fair feedback on one spoken attempt. Never claim to have analysed audio or pronunciation: you only receive text. Return JSON only with string keys good, next, rewrite, bn. good = one genuine observation; next = one simple improvement; rewrite = a natural corrected version preserving the learner intention; bn = explanation in simple Bengali.',
    user:`Situation: ${lines[0]}\nCoach question: ${lines[1]}\nTask: ${lines[2]}\nReference response: ${lines[3]}\nLearner answer: ${answer}`
  };
}
function safeResult(obj,mode){
  if(mode==='ask'){
    if(!obj||(!obj.answer&&!obj.verdicts&&!obj.pairs))throw new Error('Invalid AI answer');
    const out={answer:String(obj.answer||'').slice(0,3200),bn:String(obj.bn||'').slice(0,900)};
    const V=['similar','contradicts','complements','unrelated'];
    if(Array.isArray(obj.verdicts))out.verdicts=obj.verdicts.slice(0,16).map(v=>({i:Math.round(+v?.i)||0,verdict:V.includes(String(v?.verdict))?String(v.verdict):'unrelated',why:String(v?.why||'').slice(0,220)})).filter(v=>v.i>0);
    if(Array.isArray(obj.pairs))out.pairs=obj.pairs.slice(0,8).map(v=>({a:Math.round(+v?.a)||0,b:Math.round(+v?.b)||0,why:String(v?.why||'').slice(0,220)})).filter(v=>v.a>0&&v.b>0&&v.a!==v.b);
    return out;
  }
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
  try{return JSON.parse(text)}catch(e){}
  const a=text.indexOf('{'),b=text.lastIndexOf('}');
  if(a>=0&&b>a){try{return JSON.parse(text.slice(a,b+1))}catch(e){}}
  const m=text.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if(m)return {answer:m[1].replace(/\\n/g,'\n').replace(/\\"/g,'"')};
  throw new Error('AI returned an unreadable answer');
}
async function providerError(name,r,model){
  let m='';try{const j=await r.json();m=String(j?.error?.message||j?.error||'')}catch(e){}
  m=m.replace(/key=[^\s&]+/g,'').replace(/sk-[A-Za-z0-9_-]+/g,'').slice(0,110);
  const hint=r.status===404?` Model "${model}" was not found: check the model name in AI settings.`:r.status===401||r.status===403?' Check the API key in AI settings.':r.status===429?' Rate limit or quota reached.':'';
  return `${name} error ${r.status}.${hint}${m&&r.status!==404?' '+m:''}`.slice(0,175);
}
async function callOpenAI({key,model,system,user,signal,mode,max,base='https://api.openai.com/v1'}){
  const official=/^https:\/\/api\.openai\.com\//.test(base),reasoning=/^(o\d|gpt-[5-9])/i.test(model);
  const n=(max||(mode==='ask'?600:320))*(reasoning?4:1);
  const body={model,temperature:0.35,response_format:{type:'json_object'},messages:[{role:'system',content:system},{role:'user',content:user}]};
  if(reasoning)delete body.temperature;
  body[official?'max_completion_tokens':'max_tokens']=n;
  let r;
  for(let attempt=0;attempt<3;attempt++){
    r=await fetch(`${base}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal,body:JSON.stringify(body)});
    if(r.ok||r.status!==400)break;
    // some models reject a parameter: adapt once per parameter and retry
    let msg='';try{msg=String((await r.clone().json())?.error?.message||'')}catch(e){}
    if(/temperature/i.test(msg)&&'temperature' in body){delete body.temperature;body.max_completion_tokens=body.max_completion_tokens||body.max_tokens;continue}
    if(/max_tokens/i.test(msg)&&'max_tokens' in body){body.max_completion_tokens=body.max_tokens*(reasoning?1:3);delete body.max_tokens;continue}
    if(/max_completion_tokens/i.test(msg)&&'max_completion_tokens' in body){body.max_tokens=body.max_completion_tokens;delete body.max_completion_tokens;continue}
    break;
  }
  if(!r.ok)throw new Error(await providerError('OpenAI',r,model));
  const j=await r.json();
  return safeResult(parseJsonText(j.choices?.[0]?.message?.content||'{}'),mode);
}
async function callGemini({key,model,system,user,signal,mode,max}){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const r=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    signal,
    body:JSON.stringify({
      systemInstruction:{parts:[{text:system}]},
      contents:[{role:'user',parts:[{text:user}]}],
      generationConfig:{temperature:0.35,maxOutputTokens:max||(mode==='ask'?600:320),responseMimeType:'application/json'}
    })
  });
  if(!r.ok)throw new Error(await providerError('Gemini',r,model));
  const j=await r.json();
  const raw=j.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'{}';
  return safeResult(parseJsonText(raw),mode);
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
      ? await callGemini({key,model,system:p.system,user:p.user,signal:controller.signal,mode:p.mode,max:p.max})
      : await callOpenAI({key,model,system:p.system,user:p.user,signal:controller.signal,mode:p.mode,max:p.max,base:provider==='server'?base:'https://api.openai.com/v1'});
    return res.status(200).json(result);
  }catch(err){
    return res.status(502).json({error:String(err?.message||'AI could not respond').slice(0,180)});
  }finally{clearTimeout(timeout)}
}
