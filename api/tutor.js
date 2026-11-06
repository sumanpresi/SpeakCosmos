/** Optional AI feedback endpoint for Vercel.
 * Required envs: APP_ACCESS_TOKEN, AI_API_KEY.
 * Optional: AI_BASE_URL, AI_MODEL.
 */
import { timingSafeEqual } from 'node:crypto';

function equal(a,b){
  const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));
  return x.length===y.length&&timingSafeEqual(x,y);
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  if(!process.env.APP_ACCESS_TOKEN||!process.env.AI_API_KEY){
    return res.status(503).json({error:'AI is not configured. The local practice coach is still available.'});
  }
  if(!equal(req.headers['x-app-access-token'],process.env.APP_ACCESS_TOKEN)){
    return res.status(401).json({error:'Not authorised'});
  }

  const {scenario,prompt,lesson,answer,modelAnswer}=req.body||{};
  if(typeof answer!=='string'||!answer.trim()||answer.length>3000){
    return res.status(400).json({error:'Invalid response'});
  }

  const lines=[scenario,prompt,lesson,modelAnswer].map(v=>String(v||'').slice(0,800));
  const base=(process.env.AI_BASE_URL||'https://api.openai.com/v1').replace(/\/+$/,'');
  if(!/^https:\/\//.test(base)) return res.status(500).json({error:'Configure an HTTPS model endpoint.'});

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);

  try{
    const r=await fetch(`${base}/chat/completions`,{
      method:'POST',
      headers:{
        'Authorization':`Bearer ${process.env.AI_API_KEY}`,
        'Content-Type':'application/json'
      },
      signal:controller.signal,
      body:JSON.stringify({
        model:process.env.AI_MODEL||'gpt-4o-mini',
        temperature:0.35,
        max_tokens:300,
        response_format:{type:'json_object'},
        messages:[
          {
            role:'system',
            content:'You are a helpful spoken English teacher for an Indian learner whose first language is Bengali. Write short, specific, fair feedback on one spoken attempt. Never claim to have analysed audio or pronunciation: you only receive text. Provide JSON only with string keys good, next, rewrite, bn. Good = one genuine observation; next = one simple improvement; rewrite = a natural corrected version preserving the learner intention; bn = explanation in simple Bengali.'
          },
          {
            role:'user',
            content:`Situation: ${lines[0]}\nCoach question: ${lines[1]}\nTask: ${lines[2]}\nReference response: ${lines[3]}\nLearner answer: ${answer}`
          }
        ]
      })
    });
    if(!r.ok) return res.status(502).json({error:'AI provider error'});
    const j=await r.json();
    const raw=j.choices?.[0]?.message?.content||'{}';
    const obj=JSON.parse(raw);
    if(!obj.good||!obj.next) return res.status(502).json({error:'Invalid AI feedback'});
    return res.status(200).json({
      good:String(obj.good).slice(0,600),
      next:String(obj.next).slice(0,600),
      rewrite:String(obj.rewrite||'').slice(0,600),
      bn:String(obj.bn||'').slice(0,600)
    });
  }catch{
    return res.status(502).json({error:'AI could not respond'});
  }finally{
    clearTimeout(timeout);
  }
}
