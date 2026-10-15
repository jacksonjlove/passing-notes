import {randomBytes,randomUUID,scrypt as callbackScrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {fail,text} from './errors.js';
const scrypt=promisify(callbackScrypt);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const publicUser=row=>({id:row.id,username:row.username,displayName:row.display_name});
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const hash=await scrypt(password,salt,64);return `${salt}:${hash.toString('hex')}`;}
export async function verifyPassword(password,encoded){const [salt,hex]=encoded.split(':');const hash=await scrypt(password,salt,64);return timingSafeEqual(hash,Buffer.from(hex,'hex'));}
export function readUser(db,req,now){const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('pn_session='))?.slice(11);if(!token)return null;const row=db.prepare('SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?').get(digest(token),now);return row?publicUser(row):null;}
export function setSession(db,res,userId,now,secure){const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),userId,now+30*86400000);res.cookie('pn_session',token,{httpOnly:true,sameSite:'lax',secure,maxAge:30*86400000,path:'/'});}
export async function register(db,body){const username=text(body.username,3,30,'Username').toLowerCase();if(!/^[a-z0-9_-]+$/.test(username))fail(400,'Use letters, numbers, underscores or hyphens for your username.');const displayName=text(body.displayName,1,40,'Display name');if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)fail(400,'Use a password with 8–128 characters.');if(db.prepare('SELECT 1 FROM accounts WHERE username=?').get(username))fail(409,'That username is already taken.');const id=randomUUID(),hash=await hashPassword(body.password);try{db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(id,username,displayName,hash);}catch(e){if(e.code?.includes('UNIQUE'))fail(409,'That username is already taken.');throw e;}return {id,username,displayName};}
