import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {messages} from './i18n.js';
import {starters} from '../lib/starters.js';
import {matches,schedule,wordContentChanged} from '../lib/domain.js';
import './style.css';
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value));}
async function api(op,body){
 let response;try{response=await fetch('/api/app?op='+op,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});}catch{throw Error('NETWORK');}
 let result;try{result=await response.json();}catch{throw Error('SERVER_ERROR');}
 if(!response.ok)throw Error(result.error||'SERVER_ERROR');return result;
}
const fresh=(locale,target)=>({user:{id:'demo',name:messages[locale].demoName,target,locale},cards:starters,progress:{},stats:{xp:0,today:0},partners:[],day:new Date().toISOString().slice(0,10)});
function App(){
 const [locale,setLocale]=useState(()=>read('vt-locale',null)),[chosen,setChosen]=useState(locale||'de');
 const l=locale||chosen,t=messages[l];
 const [data,setData]=useState(null),[demo,setDemo]=useState(false),[registrationEnabled,setRegistrationEnabled]=useState(false),[configured,setConfigured]=useState(null),[loading,setLoading]=useState(true);
 const [page,setPage]=useState('home'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[register,setRegister]=useState(false);
 const [target,setTarget]=useState(l==='de'?'pt':'de'),[search,setSearch]=useState(''),[filter,setFilter]=useState('all');
 const [editing,setEditing]=useState(null);
 const [modal,setModal]=useState(null),[selected,setSelected]=useState(null),[queue,setQueue]=useState(null),[index,setIndex]=useState(0),[answer,setAnswer]=useState(''),[result,setResult]=useState(null),[mode,setMode]=useState('translation');
 const [audio,setAudio]=useState(null),[recording,setRecording]=useState(false),[audioLang,setAudioLang]=useState(l);
 const recorder=useRef(null),stream=useRef(null),timer=useRef(null),player=useRef(null);
 const setErr=e=>setError(t.errors[e.message]||(e.message==='NETWORK'?t.network:t.error));
 useEffect(()=>{document.documentElement.lang=l==='pt'?'pt-BR':'de';},[l]);
 useEffect(()=>{(async()=>{try{const status=await api('status');setConfigured(status.configured);setRegistrationEnabled(status.registrationEnabled===true);if(status.configured){try{setData(await api('state'));}catch(e){if(e.message!=='UNAUTHENTICATED')setErr(e);}}}catch{setConfigured(false);}finally{setLoading(false);}})();return()=>{stream.current?.getTracks().forEach(track=>track.stop());clearTimeout(timer.current);};},[]);
 function changeLanguage(value){setLocale(value);setChosen(value);write('vt-locale',value);}
 function demoStart(){
  const saved=read('vt-demo-'+target,null),next=saved||fresh(l,target);
  if(next.day!==new Date().toISOString().slice(0,10)){next.stats.today=0;next.day=new Date().toISOString().slice(0,10);}
  setData(next);setDemo(true);setError('');
 }
 function demoSave(next){write('vt-demo-'+next.user.target,next);setData(next);}
 async function refresh(){setData(await api('state'));}
 async function auth(event){
  event.preventDefault();setBusy(true);setError('');
  const fields=Object.fromEntries(new FormData(event.currentTarget));
  try{await api(register?'register':'login',{...fields,locale:l,target});await refresh();}catch(e){setErr(e);}finally{setBusy(false);}
 }
 async function logout(){setBusy(true);try{if(!demo)await api('logout',{});setData(null);setDemo(false);setQueue(null);setPage('home');}catch(e){setErr(e);}finally{setBusy(false);}}
 const level=id=>data?.progress[id]?.level||0;
 const isDue=card=>!data.progress[card.id]||new Date(data.progress[card.id].due)<=new Date();
 const due=data?.cards.filter(isDue)||[];
 function begin(free=false){setQueue((free?data.cards:due).slice(0,20));setIndex(0);setResult(null);setAnswer('');setPage('train');setError('');}
 async function submit(event,revealed=false){
  event?.preventDefault();if(busy||result)return;setBusy(true);setError('');
  const card=queue[index];
  try{
   let r;
   if(demo){
    const previous=data.progress[card.id],eligible=isDue(card),correct=!revealed&&matches(answer,card[data.user.target]);
    const progress=eligible?schedule(previous,correct):previous;
    const xp=eligible&&correct?10+Math.min(previous?.level||0,5)*2:0;
    r={correct,xp,progress,eligible};
    demoSave({...data,progress:{...data.progress,[card.id]:progress},stats:{xp:data.stats.xp+xp,today:data.stats.today+(eligible?1:0)}});
   }else{r=await api('review',{cardId:card.id,revision:card.revision,answer,revealed});await refresh();}
   setResult(r);
  }catch(e){setErr(e);if(e.message==='CARD_CHANGED'&&!demo){await refresh().catch(()=>{});setQueue(null);setPage('words');}}finally{setBusy(false);}
 }
 function next(){setIndex(index+1);setResult(null);setAnswer('');}
 function speak(card,lang){
  setError('');player.current?.pause();window.speechSynthesis?.cancel();
  if(card.audio?.lang===lang){const p=new Audio('data:'+card.audio.mime+';base64,'+card.audio.data);player.current=p;p.play().catch(()=>setError(t.audioFail));return;}
  if(!window.speechSynthesis){setError(t.noVoice);return;}
  const utterance=new SpeechSynthesisUtterance(card[lang].split('|')[0]);utterance.lang=lang==='pt'?'pt-BR':'de-DE';utterance.rate=.85;utterance.onerror=()=>setError(t.noVoice);window.speechSynthesis.speak(utterance);
 }
 function stopRecord(){clearTimeout(timer.current);if(recorder.current?.state==='recording')recorder.current.stop();}
 async function record(){
  setError('');
  if(recording){stopRecord();return;}
  try{
   if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error();
   stream.current=await navigator.mediaDevices.getUserMedia({audio:true});
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(x=>MediaRecorder.isTypeSupported(x));
   const rec=new MediaRecorder(stream.current,mime?{mimeType:mime}:undefined);recorder.current=rec;const chunks=[];
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   rec.onstop=async()=>{stream.current?.getTracks().forEach(track=>track.stop());setRecording(false);const blob=new Blob(chunks,{type:rec.mimeType});if(blob.size>500000){setError(t.audioLarge);return;}const reader=new FileReader();reader.onload=()=>setAudio({mime:blob.type,data:reader.result.split(',')[1],lang:audioLang});reader.readAsDataURL(blob);};
   rec.start();setRecording(true);timer.current=setTimeout(stopRecord,20000);
  }catch{stream.current?.getTracks().forEach(track=>track.stop());setRecording(false);setError(t.audioFail);}
 }
 function openEditor(card){
  player.current?.pause();window.speechSynthesis?.cancel();
  setEditing(card);setAudio(card.audio||null);setAudioLang(card.audio?.lang||data.user.target);
  setSelected(null);setError('');setModal('edit');
 }
 async function saveCard(event){
  event.preventDefault();if(recording||busy)return;setBusy(true);setError('');
  const c={...Object.fromEntries(new FormData(event.currentTarget)),audio};
  try{
   if(demo){
    if(modal==='edit'&&editing){
     const changed=wordContentChanged(editing,c),progress={...data.progress};
     if(changed&&progress[editing.id])progress[editing.id]={...progress[editing.id],due:new Date().toISOString()};
     demoSave({...data,progress,cards:data.cards.map(card=>card.id===editing.id?{...card,...c}:card)});
    }else demoSave({...data,cards:[...data.cards,{...c,id:crypto.randomUUID(),creator_name:data.user.name,creator_id:'demo'}]});
   }else{
    await api(modal==='edit'?'edit-card':'card',modal==='edit'?{...c,cardId:editing.id,revision:editing.revision}:c);
    await refresh();
   }
   setModal(null);setAudio(null);setEditing(null);
  }catch(e){setErr(e);if(e.message==='CARD_CHANGED'&&!demo)await refresh().catch(()=>{});}finally{setBusy(false);}
 }
 const logo=<a className="brand" href="/" onClick={e=>{e.preventDefault();setPage('home');setQueue(null);}}><span className="brandmark">V</span>VTrain<span className="branddot">●</span><small className="betabadge">BETA</small></a>;
 const language=<select className="language" aria-label={t.choose} value={l} onChange={e=>changeLanguage(e.target.value)}><option value="de">DE · Deutsch</option><option value="pt">BR · Português</option></select>;
 const notice=error&&<div role="alert" className="notice error">{error}<button className="textbutton" onClick={()=>setError('')} aria-label={t.close}>×</button></div>;
 if(!locale)return <div className="entry"><header>{logo}</header><main className="welcome"><div className="eyebrow">DEUTSCH ↔ PORTUGUÊS</div><h1>Zwei Sprachen.<br/><em>Ein gemeinsamer Weg.</em></h1><p>Dois idiomas. Um caminho juntos.</p><div className="languagecards"><button className={chosen==='de'?'chosen':''} onClick={()=>setChosen('de')}><span>DE</span><strong>Deutsch</strong><small>Gemeinsam weiterlernen</small></button><button className={chosen==='pt'?'chosen':''} onClick={()=>setChosen('pt')}><span>BR</span><strong>Português</strong><small>Aprender juntos</small></button></div><button className="primary" onClick={()=>{changeLanguage(chosen);setTarget(chosen==='de'?'pt':'de');}}>{messages[chosen].start} →</button></main></div>;
 if(loading)return <div className="entry"><header>{logo}</header><p className="loading" role="status">{t.loading}</p></div>;
 if(!data)return <div className="entry"><header>{logo}{language}</header><main className="auth"><section><div className="eyebrow">DE ↔ BR</div><h1>{t.authTitle}</h1><p>{t.authText}</p><div className="plant">a palavra <span>↔</span> das Wort</div><p className="fine">{t.install}</p></section><section className="panel"><div className="tabs"><button className={!register?'active':''} onClick={()=>setRegister(false)}>{t.login}</button><button className={register?'active':''} disabled={!registrationEnabled} onClick={()=>setRegister(true)}>{t.register}</button></div>{notice}{configured&&!registrationEnabled&&<p className="notice">{t.registrationClosed}</p>}{configured?<form onSubmit={auth}>{register&&<label>{t.name}<input name="name" maxLength="60" required autoComplete="name"/></label>}<label>{t.email}<input name="email" type="email" required autoComplete="email"/></label><label>{t.password}<input name="password" type="password" minLength="10" maxLength="128" required autoComplete={register?'new-password':'current-password'}/></label>{register&&<><label>{t.invite}<input name="invite" required type="password" autoComplete="off"/></label><label>{t.learn}<select value={target} onChange={e=>setTarget(e.target.value)}><option value="de">Deutsch</option><option value="pt">Português (Brasil)</option></select></label></>}<button className="primary" disabled={busy}>{busy?t.loading:register?t.register:t.login}</button></form>:<p className="notice">{t.notConfigured}</p>}<div className="demoentry"><label>{t.learn}<select value={target} onChange={e=>setTarget(e.target.value)}><option value="de">Deutsch</option><option value="pt">Português (Brasil)</option></select></label><button className="secondary" onClick={demoStart}>{t.demo} →</button></div></section></main></div>;
 const current=queue?.[index],completed=page==='train'&&(!queue||index>=queue.length);
 const totalXp=data.partners.reduce((sum,p)=>sum+p.xp,0)||data.stats.xp;
 const cards=data.cards.filter(c=>(c.de+' '+c.pt+' '+c.category).toLowerCase().includes(search.toLowerCase())&&(filter==='all'||filter==='new'&&level(c.id)===0||filter==='learning'&&level(c.id)>0&&level(c.id)<4||filter==='solid'&&level(c.id)>=4));
 return <div className="app"><aside><div>{logo}<p className="asidecaption">DEUTSCH + PORTUGUÊS</p><nav>{['home','words','tandem'].map((p,i)=><button key={p} className={page===p?'active':''} onClick={()=>{setPage(p);setQueue(null);}}><span>{['◈','▤','◎'][i]}</span>{t[p]}</button>)}</nav></div><div className="asidebottom"><div className="avatar">{data.user.name.slice(0,1).toUpperCase()}</div><strong>{data.user.name}</strong><small>{t.learn}: {data.user.target==='de'?'Deutsch':'Português'}</small><button className="textbutton" onClick={logout} disabled={busy}>{demo?t.exit:t.logout}</button></div></aside><div className="workspace"><header className="topbar"><span className="mobilebrand">VTrain</span><span className="breadcrumb">{t[page]||t.train}</span>{language}<button className="textbutton mobilelogout" onClick={logout} disabled={busy}>{demo?t.exit:t.logout}</button></header><main>{demo&&<div className="demobanner">{t.demoBanner}</div>}{notice}
 {page==='home'&&<><div className="greeting">{t.hello}, {data.user.name} <span>✦</span></div><section className="hero"><div><div className="eyebrow">DE ↔ BR · {t.level} {Math.floor(data.stats.xp/100)+1}</div><h1>{t.hero}</h1><p>{t.subtitle}</p><button className="lightbutton" onClick={()=>begin()}>{t.train} <span>↗</span></button></div><div className="wordart" aria-hidden="true"><div className="orbit"></div><div className="artcard first"><small>PORTUGUÊS</small><b>juntos</b><span>ʒũ.tus</span></div><div className="artcard second"><small>DEUTSCH</small><b>zusammen</b><span>↗</span></div><span className="spark">✳</span></div></section><section className="stats"><div><span className="stat-icon">▤</span><strong>{due.length}</strong><span>{t.due}</span></div><div><span className="stat-icon">✧</span><strong>{data.cards.filter(c=>level(c.id)>=4).length}</strong><span>{t.mastered}</span></div><div><span className="stat-icon">↗</span><strong>{data.stats.xp}</strong><span>XP</span></div></section><div className="bottomgrid"><section className="panel"><div className="sectionhead"><h2>{t.goal}</h2><span>{data.stats.today}/10</span></div><progress max="10" value={data.stats.today}/><p className="muted">{t.goalNote}</p></section><section className="panel addpanel"><span className="roundplus">+</span><div><h2>{t.newWord}</h2><p className="muted">{t.shared}</p></div><button className="circlebutton" aria-label={t.newWord} onClick={()=>{setAudio(null);setModal('add');}}>↗</button></section></div><p className="fine">{t.install}</p></>}
 {page==='words'&&<><div className="sectionhead"><div><div className="eyebrow">DE ↔ BR</div><h1>{t.collection}</h1></div><button className="primary" onClick={()=>{setAudio(null);setModal('add');}}>+ {t.newWord}</button></div><input className="search" aria-label={t.search} placeholder={t.search} value={search} onChange={e=>setSearch(e.target.value)}/><div className="filters">{['all','new','learning','solid'].map(x=><button key={x} className={filter===x?'active':''} onClick={()=>setFilter(x)}>{t[x]}</button>)}</div><div className="wordgrid">{cards.map(c=><button className="vocabcard" key={c.id} onClick={()=>setSelected(c)}><span className="category">{c.category}</span><h3>{c[data.user.target].split('|')[0]}</h3><p>{c[data.user.target==='de'?'pt':'de']}</p><div className="cardfoot"><span>{t[level(c.id)>=4?'solid':level(c.id)?'learning':'new']}</span><span>{c.audio?'♪':'↗'}</span></div></button>)}</div>{cards.length===0&&<p>{t.empty}</p>}<button className="secondary" onClick={()=>begin(true)}>{t.practice}</button></>}
 {page==='tandem'&&<><div className="eyebrow">DE ↔ BR</div><h1>{t.teamTitle}</h1><p className="muted">{t.teamText}</p><section className="teambanner"><span>◎</span><div><strong>{totalXp}</strong><p>{t.xp}</p></div><span>✦</span></section><div className="wordgrid">{(data.partners.length?data.partners:[data.user]).map(p=><div className="panel" key={p.id}><div className="avatar">{p.name.slice(0,1)}</div><h2>{p.name}</h2><p>{t.learn}: {p.target==='de'?'Deutsch':'Português'}</p><strong>{p.xp??data.stats.xp} XP</strong></div>)}</div>{data.partners.length<2&&<p className="notice">{t.teamEmpty}</p>}<div className="sectionhead"><h2>{t.shared}</h2><button className="secondary" onClick={()=>{setAudio(null);setModal('add');}}>+ {t.newWord}</button></div><div className="wordgrid">{data.cards.filter(c=>c.creator_id).map(c=><button className="vocabcard" key={c.id} onClick={()=>setSelected(c)}><span className="category">{c.creator_name}</span><h3>{c.de}</h3><p>{c.pt}</p><p className="muted">{c.note}</p></button>)}</div>{!data.cards.some(c=>c.creator_id)&&<p>{t.sharedEmpty}</p>}</>}
 {page==='train'&&(completed?<section className="completion panel"><div className="completionmark">✓</div><h1>{t.finish}</h1><p>{t.finishText}</p><button className="primary" onClick={()=>setPage('home')}>{t.back}</button><button className="textbutton" onClick={()=>begin(true)}>{t.practice}</button></section>:<section className="training"><div className="sectionhead"><button className="textbutton" onClick={()=>setPage('home')}>← {t.home}</button><span>{index+1} / {queue.length}</span></div><progress max={queue.length} value={index}/><div className="tabs"><button className={mode==='translation'?'active':''} disabled={!!result} onClick={()=>setMode('translation')}>{t.translation}</button><button className={mode==='listening'?'active':''} disabled={!!result} onClick={()=>setMode('listening')}>{t.listening}</button></div><div className="quiz panel"><span className="category">{current.category}</span><p className="muted">{mode==='listening'?t.listenPrompt:t.translate}</p>{mode==='translation'?<h1>{current[data.user.target==='de'?'pt':'de']}</h1>:<button className="listenbig" onClick={()=>speak(current,data.user.target)}>♪ <span>{t.listen}</span></button>}<form onSubmit={submit}><label>{t.answer}<input key={current.id} autoFocus value={answer} onChange={e=>setAnswer(e.target.value)} disabled={!!result||busy} autoComplete="off" autoCapitalize="none" spellCheck="false" lang={data.user.target==='pt'?'pt-BR':'de'}/></label>{!result&&<div className="actions"><button className="primary" disabled={busy||!answer.trim()}>{busy?t.loading:t.check}</button><button type="button" className="textbutton" disabled={busy} onClick={()=>submit(null,true)}>{t.reveal}</button></div>}</form>{result&&<div className={'feedback '+(result.correct?'success':'retry')} role="status"><strong>{result.correct?t.correct:t.incorrect} {result.xp>0&&'+'+result.xp+' XP'}</strong><p>{t.solution}: <b>{current[data.user.target]}</b></p><button className="textbutton" onClick={()=>speak(current,data.user.target)}>♪ {t.listen} · {current.audio?.lang===data.user.target?t.native:t.synthetic}</button><p>{current.example}</p><p>{current.note}</p>{!result.eligible&&<p className="fine">{t.replay}</p>}<button className="primary" onClick={next}>{t.next} →</button></div>}</div></section>)}
 </main></div>
 {(modal==='add'||modal==='edit')&&<div className="overlay"><section className="modal panel" role="dialog" aria-modal="true" aria-labelledby="addtitle"><div className="sectionhead"><h2 id="addtitle">{modal==='edit'?t.editWord:t.newWord}</h2><button className="textbutton" disabled={recording||busy} aria-label={t.close} onClick={()=>setModal(null)}>×</button></div>{notice}{modal==='edit'&&<p className="notice">{t.editHelp}</p>}<form key={modal==='edit'?editing.id:'new'} onSubmit={saveCard}><label>Deutsch<input name="de" maxLength="160" required autoFocus defaultValue={modal==='edit'?editing.de:''}/></label><label>Português (Brasil)<input name="pt" maxLength="160" required defaultValue={modal==='edit'?editing.pt:''}/></label><label>{t.example}<input name="example" maxLength="500" defaultValue={modal==='edit'?editing.example:''}/></label><label>{t.note}<textarea name="note" maxLength="1000" rows="3" defaultValue={modal==='edit'?editing.note:''}/></label><label>{t.category}<input name="category" maxLength="60" defaultValue={modal==='edit'?editing.category:l==='de'?'Alltag':'Dia a dia'}/></label><div className="audiobox"><label>{t.audioLang}<select value={audioLang} disabled={recording} onChange={e=>setAudioLang(e.target.value)}><option value="de">Deutsch</option><option value="pt">Português</option></select></label><button type="button" className="secondary" onClick={record}>{recording?'● '+t.stop:'♪ '+t.record}</button><p className="fine">{t.recordNote}</p>{audio&&<><audio controls src={'data:'+audio.mime+';base64,'+audio.data}/><button type="button" className="textbutton" onClick={()=>setAudio(null)}>{t.removeAudio}</button></>}</div><button className="primary" disabled={busy||recording}>{busy?t.loading:modal==='edit'?t.saveChanges:t.save}</button></form></section></div>}
 {selected&&<div className="overlay"><section className="modal panel" role="dialog" aria-modal="true" aria-labelledby="detailtitle"><div className="sectionhead"><span className="category">{selected.category}</span><button className="textbutton" aria-label={t.close} onClick={()=>{setSelected(null);player.current?.pause();window.speechSynthesis?.cancel();}}>×</button></div><h1 id="detailtitle">{selected.de}</h1><h2>{selected.pt}</h2><div className="actions"><button className="secondary" onClick={()=>speak(selected,'de')}>♪ Deutsch</button><button className="secondary" onClick={()=>speak(selected,'pt')}>♪ Português</button></div><p>{selected.example}</p><p>{selected.note}</p><p className="fine">{selected.creator_name||'VTrain'}</p><button className="primary" onClick={()=>openEditor(selected)}>{t.editWord}</button></section></div>}
 </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
if('serviceWorker' in navigator&&import.meta.env.PROD)navigator.serviceWorker.register('/sw.js').catch(()=>{});
