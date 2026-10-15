import express from 'express';
import {openDatabase} from './db.js';
import {authRoutes} from './routes/auth.js';
import {readUser} from './auth.js';
export function createApp({db=openDatabase(),now=Date.now,devControls=false,origin='http://localhost:5174',secure=false}={}){
 const app=express();app.disable('x-powered-by');app.use(express.json({limit:'16kb'}));
 const attempts=new Map();
 app.use((req,res,next)=>{if(!['GET','HEAD','OPTIONS'].includes(req.method)){
 if(req.headers.origin!==origin)return res.status(403).json({error:{code:'ORIGIN',message:'Please use the app to send this request.'}});
 if(!req.is('application/json'))return res.status(400).json({error:{code:'JSON',message:'Send JSON data.'}});
 if(req.path.startsWith('/api/auth')||req.path==='/api/invitations/join'){const key=req.ip+req.path;let value=attempts.get(key);if(!value||now()-value.start>=60000)value={start:now(),count:0};value.count++;attempts.set(key,value);if(value.count>30)return res.status(429).json({error:{code:'LIMIT',message:'Please wait a minute before trying again.'}});if(attempts.size>10000)attempts.clear();}}
 req.user=readUser(db,req,now());next();});
 app.use('/api/auth',authRoutes({db,now,secure}));
 app.use((error,req,res,next)=>{if(res.headersSent)return next(error);const status=error.status||500;if(status===500)console.error('Request failed:',error.message);res.status(status).json({error:{code:error.code||String(status),message:status===500?'Something went wrong. Please retry.':error.message}});});
 return app;
}
