import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,matches,schedule,validateCard} from '../lib/domain.js';
test('alternatives and composed accents match; missing accents do not',()=>{
 assert.equal(matches(' Obrigada! ','Obrigado | Obrigada'),true);
 assert.equal(matches('cafe','café'),false);
 assert.equal(matches('cafe\u0301','café'),true);
 assert.equal(normalize('GUTEN   MORGEN!'),'guten morgen');
});
test('errors return in ten minutes, success advances and is capped',()=>{
 const now=new Date('2026-01-01T12:00:00Z');
 assert.deepEqual(schedule({level:4},false,now),{level:0,due:'2026-01-01T12:10:00.000Z'});
 assert.deepEqual(schedule(null,true,now),{level:1,due:'2026-01-02T12:00:00.000Z'});
 assert.equal(schedule({level:6},true,now).level,6);
});
test('cards require both languages and bound user content',()=>{
 assert.throws(()=>validateCard({de:' ',pt:'oi'}),/FIELDS_REQUIRED/);
 assert.equal(validateCard({de:'Hallo',pt:'Oi',note:'x'.repeat(2000)}).note.length,1000);
});
