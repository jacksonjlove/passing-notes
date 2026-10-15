import {Router} from 'express';import {route,fail} from '../errors.js';import {requireMembership} from '../groups.js';import {reconcileGroup,saveAnswer} from '../rounds.js';
export function roundRoutes({db,now,devControls}){const r=Router();r.use((req,res,next)=>{if(!req.user)return res.status(401).json({error:{code:'401',message:'Please sign in.'}});next();});
 r.get('/groups/:id/round',route((req,res)=>{requireMembership(db,req.params.id,req.user.id);const round=reconcileGroup(db,req.params.id,now());res.json({round:round?{id:round.id,phase:round.phase,scored:Boolean(round.scored),prompt:round.prompt_text,answerDeadline:round.answer_deadline,revealAt:round.reveal_at}:null});}));
 r.put('/groups/:id/round/answer',route((req,res)=>res.json(saveAnswer(db,{groupId:req.params.id,userId:req.user.id,text:req.body.text,nowMs:now()}))));return r;
}
