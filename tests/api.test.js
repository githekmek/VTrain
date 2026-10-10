import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
test('API: authentication, tandem isolation, replay safety and logout',{skip:!process.env.DATABASE_TEST_URL},async()=>{
 process.env.DATABASE_URL=process.env.DATABASE_TEST_URL;
 process.env.ALLOWED_EMAILS='alice@example.test,bob@example.test';
 process.env.INVITE_CODE='test-only-invitation-code-12345';
 const {default:handler}=await import('../api/app.js');
 const db=new pg.Client({connectionString:process.env.DATABASE_TEST_URL});await db.connect();
 const call=async(op,body,cookie='',origin='https://vtrain.test')=>{
  const req={method:body?'POST':'GET',query:{op},headers:{host:'vtrain.test',origin,'content-type':'application/json',cookie,'x-vercel-forwarded-for':'192.0.2.4'},body};
  const res={headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(value){this.body=value;return this;}};
  await handler(req,res);return res;
 };
 try{
  const status=await call('status');assert.equal(status.body.configured,true);assert.equal(status.body.registrationEnabled,true);
  const invite=process.env.INVITE_CODE;process.env.INVITE_CODE='';
  assert.equal((await call('status')).body.registrationEnabled,false);process.env.INVITE_CODE=invite;
  assert.equal((await call('state')).code,401);
  assert.equal((await call('login',{email:'a',password:'long-password'},'','https://evil.test')).code,403);
  const details={email:'alice@example.test',name:'Alice',password:'correct horse battery',locale:'de',target:'pt',invite:process.env.INVITE_CODE};
  assert.equal((await call('register',{...details,email:'outsider@example.test'})).code,403);
  const registered=await call('register',details);assert.equal(registered.code,200);
  const cookie=registered.headers['Set-Cookie'].split(';')[0];
  assert.match(registered.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await call('login',{email:details.email,password:'incorrect password'})).code,401);
  const state=await call('state',undefined,cookie);assert.equal(state.body.cards.length,20);
  assert.equal('password_hash' in state.body.user,false);
  assert.notEqual((await db.query('SELECT password_hash FROM users WHERE email=$1',[details.email])).rows[0].password_hash,details.password);
  const created=await call('card',{de:'der Test',pt:'o teste',note:'shared'},cookie);assert.equal(created.code,201);
  const bob=await call('register',{...details,email:'bob@example.test',name:'Bob',target:'de'});
  const bobCookie=bob.headers['Set-Cookie'].split(';')[0];
  assert.equal((await call('state',undefined,bobCookie)).body.cards.some(c=>c.id===created.body.id),true);
  const otherTeam=randomUUID();await db.query('INSERT INTO teams(id,name) VALUES($1,$2)',[otherTeam,'Other']);
  await db.query('UPDATE users SET team_id=$1 WHERE email=$2',[otherTeam,'bob@example.test']);
  assert.equal((await call('state',undefined,bobCookie)).body.cards.some(c=>c.id===created.body.id),false);
  assert.equal((await call('review',{cardId:created.body.id,answer:'der Test'},bobCookie)).code,404);
  const reviews=await Promise.all([call('review',{cardId:'starter-1',answer:'Bom dia'},cookie),call('review',{cardId:'starter-1',answer:'Bom dia'},cookie)]);
  assert.equal(reviews.every(r=>r.code===200),true);
  assert.equal(reviews.reduce((sum,r)=>sum+r.body.xp,0),10);
  assert.equal((await call('review',{cardId:'starter-1',answer:'Bom dia'},cookie)).body.xp,0);
  const wrong=await call('review',{cardId:'starter-2',answer:'wrong'},cookie);assert.equal(wrong.body.correct,false);assert.equal(wrong.body.progress.level,0);
  assert.equal((await call('logout',{},cookie)).code,200);
  assert.equal((await call('state',undefined,cookie)).code,401);
 }finally{await db.end();}
});
