import Database from 'better-sqlite3';
import {readdirSync,readFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
export function openDatabase(path=':memory:') {
 if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
 const db=new Database(path);db.pragma('foreign_keys = ON');db.pragma('journal_mode = WAL');
 db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY)');
 const folder=new URL('./migrations/',import.meta.url);
 for(const file of readdirSync(folder).filter(x=>x.endsWith('.sql')).sort()) {
 if(!db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(file)) db.transaction(()=>{db.exec(readFileSync(new URL(file,folder),'utf8'));db.prepare('INSERT INTO schema_migrations VALUES(?)').run(file);})();
 }return db;
}
