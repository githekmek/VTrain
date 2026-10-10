import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
test('browser setup script is repeatable and includes twenty starters',{skip:!process.env.DATABASE_TEST_URL},async()=>{
 const db=new pg.Client({connectionString:process.env.DATABASE_TEST_URL});await db.connect();
 try{
  const sql=await readFile(new URL('../db/beta-setup.sql',import.meta.url),'utf8');
  await db.query(sql);await db.query(sql);
  const {rows}=await db.query("SELECT count(*)::int AS n FROM cards WHERE id LIKE 'starter-%'");
  assert.equal(rows[0].n,20);
 }finally{await db.end();}
});
