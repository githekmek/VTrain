export const intervals=[1,3,7,14,30,60];
export function normalize(value){return String(value??'').normalize('NFC').toLocaleLowerCase().trim().replace(/[.!?]+$/u,'').replace(/\s+/gu,' ');}
export function matches(answer,expected){return expected.split('|').some(item=>normalize(answer)===normalize(item));}
export function schedule(previous,correct,now=new Date()){
 const level=correct?Math.min((previous?.level??0)+1,6):0;
 const delay=correct?intervals[level-1]*86400000:600000;
 return {level,due:new Date(now.getTime()+delay).toISOString()};
}
export function cleanText(value,max=500){return typeof value==='string'?value.trim().slice(0,max):'';}
export function validateCard(input){
 const de=cleanText(input.de,160),pt=cleanText(input.pt,160);
 if(!de||!pt)throw new Error('FIELDS_REQUIRED');
 return {de,pt,example:cleanText(input.example,500),note:cleanText(input.note,1000),category:cleanText(input.category,60)||'Alltag',audio:input.audio??null};
}

export function wordContentChanged(before,after){
 const canonical=value=>[...new Set(String(value).split('|').map(normalize))].sort().join('|');
 return canonical(before.de)!==canonical(after.de)||canonical(before.pt)!==canonical(after.pt);
}
