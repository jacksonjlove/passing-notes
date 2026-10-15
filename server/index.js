import {openDatabase} from './db.js';import {createApp} from './app.js';
const db=openDatabase(process.env.DATABASE_PATH||'data/passing-notes.sqlite');
const app=createApp({db,origin:process.env.APP_ORIGIN||'http://localhost:5174',devControls:process.env.LOCAL_TEST_CONTROLS==='1',secure:process.env.SECURE_COOKIES==='1'});
const server=app.listen(3002,'127.0.0.1',()=>console.log('Passing Notes API: http://localhost:3002'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
