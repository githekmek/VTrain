import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {starters} from '../lib/starters.js';
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
 await client.query('BEGIN');
 await client.query(await readFile(new URL('../db/schema.sql',import.meta.url),'utf8'));
 for(const card of starters)await client.query('INSERT INTO cards(id,de,pt,example,note,category) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[card.id,card.de,card.pt,card.example,card.note,card.category]);
 await client.query('COMMIT');
 console.log('VTrain schema and starter cards installed.');
}catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
