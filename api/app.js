import pg from 'pg';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {matches,schedule,validateCard,cleanText} from '../lib/domain.js';
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:10000}):null;
const TEAM='11111111-1111-4111-8111-111111111111';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,code)=>Object.assign(new Error(code),{status});
const safeUser=u=>({id:u.id,name:u.name,locale:u.locale,target:u.target});
function passwordHash(password){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex');}
function verify(password,encoded){const [salt,key]=encoded.split(':');return timingSafeEqual(Buffer.from(key,'hex'),scryptSync(password,salt,64));}
function sessionToken(req){return req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('vt_session='))?.slice(11)||'';}
async function userFor(req){const token=sessionToken(req);if(!token)return null;const {rows}=await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hash(token)]);return rows[0]||null;}
function setSession(res,token,maxAge=2592000){res.setHeader('Set-Cookie','vt_session='+token+'; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age='+maxAge);}
async function limit(req){
 const ip=req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown';
 const key=hash(String(ip).split(',')[0]+'|'+Math.floor(Date.now()/900000));
 const result=await pool.query('INSERT INTO auth_limits(key,count,expires_at) VALUES($1,1,now()+interval \'15 minutes\') ON CONFLICT(key) DO UPDATE SET count=auth_limits.count+1 RETURNING count',[key]);
 if(result.rows[0].count>15)throw fail(429,'RATE_LIMIT');
 await pool.query('DELETE FROM auth_limits WHERE expires_at<now()');
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const op=req.query.op||'state';
  if(req.method==='GET'&&op==='status'){
   if(!pool)return res.status(200).json({configured:false,registrationEnabled:false});
   try{
    const check=await pool.query("SELECT to_regclass('public.users') IS NOT NULL AND to_regclass('public.sessions') IS NOT NULL AND to_regclass('public.cards') IS NOT NULL AND to_regclass('public.progress') IS NOT NULL AND to_regclass('public.reviews') IS NOT NULL AND to_regclass('public.teams') IS NOT NULL AND to_regclass('public.auth_limits') IS NOT NULL AS ready");
    const configured=check.rows[0].ready;
    const registrationEnabled=configured&&!!process.env.INVITE_CODE&&process.env.INVITE_CODE.length>=20&&(process.env.ALLOWED_EMAILS||'').split(',').some(email=>email.trim());
    return res.status(200).json({configured,registrationEnabled,version:'0.2.0-beta.1'});
   }catch{return res.status(200).json({configured:false,registrationEnabled:false});}
  }
  if(!pool)throw fail(503,'NOT_CONFIGURED');
  if(!['GET','POST'].includes(req.method))throw fail(405,'METHOD');
  if(req.method==='POST'){
   const origin=req.headers.origin;
   if(!origin||new URL(origin).host!==req.headers.host)throw fail(403,'ORIGIN');
   if(!req.headers['content-type']?.startsWith('application/json'))throw fail(415,'CONTENT_TYPE');
  }
  const body=req.body||{};
  if(req.method==='POST'&&['login','register'].includes(op)){
   await limit(req);
   const email=cleanText(body.email,254).toLowerCase(),password=typeof body.password==='string'?body.password:'';
   if(!email||password.length<10||password.length>128)throw fail(400,'CREDENTIALS');
   let user;
   if(op==='register'){
    const allowed=(process.env.ALLOWED_EMAILS||'').split(',').map(x=>x.trim().toLowerCase());
    if(!process.env.INVITE_CODE||process.env.INVITE_CODE.length<20||!allowed.includes(email)||typeof body.invite!=='string'||!timingSafeEqual(Buffer.from(hash(body.invite)),Buffer.from(hash(process.env.INVITE_CODE))))throw fail(403,'INVITE');
    const name=cleanText(body.name,60);
    if(!name||!['de','pt'].includes(body.locale)||!['de','pt'].includes(body.target))throw fail(400,'FIELDS_REQUIRED');
    try{
     const result=await pool.query('INSERT INTO users(id,team_id,email,name,password_hash,locale,target) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[randomUUID(),TEAM,email,name,passwordHash(password),body.locale,body.target]);
     user=result.rows[0];
    }catch(error){if(error.code==='23505')throw fail(409,'ACCOUNT_EXISTS');throw error;}
   }else{
    const result=await pool.query('SELECT * FROM users WHERE email=$1',[email]);
    user=result.rows[0];
    if(!user){scryptSync(password,'invalid-account',64);throw fail(401,'CREDENTIALS');}
    if(!verify(password,user.password_hash))throw fail(401,'CREDENTIALS');
   }
   const token=randomBytes(32).toString('hex');
   await pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'30 days\')',[hash(token),user.id]);
   await pool.query('DELETE FROM sessions WHERE expires_at<now()');
   setSession(res,token);return res.status(200).json({user:safeUser(user)});
  }
  const user=await userFor(req);
  if(!user)throw fail(401,'UNAUTHENTICATED');
  if(req.method==='POST'&&op==='logout'){
   await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hash(sessionToken(req))]);
   setSession(res,'',0);return res.status(200).json({ok:true});
  }
  if(req.method==='GET'&&op==='state'){
   const [cards,progress,stats,partners]=await Promise.all([
    pool.query('SELECT c.*,u.name AS creator_name FROM cards c LEFT JOIN users u ON u.id=c.creator_id WHERE c.team_id IS NULL OR c.team_id=$1 ORDER BY c.created_at,c.id',[user.team_id]),
    pool.query('SELECT card_id,level,due FROM progress WHERE user_id=$1',[user.id]),
    pool.query('SELECT COALESCE(sum(xp),0)::integer AS xp,count(*) FILTER(WHERE created_at>=date_trunc(\'day\',now()))::integer AS today FROM reviews WHERE user_id=$1',[user.id]),
    pool.query('SELECT u.id,u.name,u.target,COALESCE(sum(r.xp),0)::integer AS xp FROM users u LEFT JOIN reviews r ON r.user_id=u.id WHERE u.team_id=$1 GROUP BY u.id ORDER BY u.created_at',[user.team_id])
   ]);
   return res.status(200).json({user:safeUser(user),cards:cards.rows,progress:Object.fromEntries(progress.rows.map(p=>[p.card_id,p])),stats:stats.rows[0],partners:partners.rows});
  }
  if(req.method==='POST'&&op==='card'){
   const c=validateCard(body);
   if(c.audio){
    const types=['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav'];
    if(!types.some(t=>c.audio.mime===t||c.audio.mime?.startsWith(t+';'))||typeof c.audio.data!=='string'||c.audio.data.length>700000||!/^[A-Za-z0-9+/]*={0,2}$/.test(c.audio.data)||!['de','pt'].includes(c.audio.lang))throw fail(400,'AUDIO_INVALID');
   }
   const count=await pool.query('SELECT count(*)::integer AS n FROM cards WHERE creator_id=$1 AND created_at>now()-interval \'1 day\'',[user.id]);
   if(count.rows[0].n>=50)throw fail(429,'RATE_LIMIT');
   const id=randomUUID();
   await pool.query('INSERT INTO cards(id,team_id,creator_id,de,pt,example,note,category,audio) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,user.team_id,user.id,c.de,c.pt,c.example,c.note,c.category,c.audio?JSON.stringify(c.audio):null]);
   return res.status(201).json({id});
  }
  if(req.method==='POST'&&op==='review'){
   if(typeof body.cardId!=='string'||typeof body.answer!=='string'||body.answer.length>300)throw fail(400,'FIELDS_REQUIRED');
   const client=await pool.connect();
   try{
    await client.query('BEGIN');
    const {rows}=await client.query('SELECT * FROM cards WHERE id=$1 AND (team_id IS NULL OR team_id=$2)',[body.cardId,user.team_id]);
    const card=rows[0];if(!card)throw fail(404,'NOT_FOUND');
    await client.query('INSERT INTO progress(user_id,card_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,card.id]);
    const previous=(await client.query('SELECT * FROM progress WHERE user_id=$1 AND card_id=$2 FOR UPDATE',[user.id,card.id])).rows[0];
    const correct=body.revealed!==true&&matches(body.answer,card[user.target]);
    const eligible=new Date(previous.due).getTime()<=Date.now();
    let next={level:previous.level,due:previous.due},xp=0;
    if(eligible){
     next=schedule(previous,correct);xp=correct?10+Math.min(previous.level,5)*2:0;
     await client.query('UPDATE progress SET level=$3,due=$4 WHERE user_id=$1 AND card_id=$2',[user.id,card.id,next.level,next.due]);
     await client.query('INSERT INTO reviews(id,user_id,card_id,correct,xp) VALUES($1,$2,$3,$4,$5)',[randomUUID(),user.id,card.id,correct,xp]);
    }
    await client.query('COMMIT');
    return res.status(200).json({correct,xp,progress:next,eligible});
   }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  throw fail(404,'NOT_FOUND');
 }catch(error){
  const status=error.status||(error.message==='FIELDS_REQUIRED'?400:500);
  if(status===500)console.error('VTrain request failed:',error.code||error.name);
  return res.status(status).json({error:status===500?'SERVER_ERROR':error.message});
 }
}
