import {openDatabase} from './db.js';import {createApp} from './app.js';
import {reconcileAll} from './rounds.js';
const db=openDatabase(process.env.DATABASE_PATH||'data/passing-notes.sqlite');
const app=createApp({db,origin:process.env.APP_ORIGIN||'http://localhost:5174',devControls:process.env.LOCAL_TEST_CONTROLS==='1',secure:process.env.SECURE_COOKIES==='1'});
const server=app.listen(3002,'127.0.0.1',()=>console.log('Passing Notes API: http://localhost:3002'));
reconcileAll(db,Date.now());const sweep=setInterval(()=>reconcileAll(db,Date.now()),30000);
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearInterval(sweep);server.close(()=>{db.close();process.exit(0);});});
