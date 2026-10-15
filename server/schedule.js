import {DateTime} from 'luxon';import {fail} from './errors.js';
function instant(date,time,zone){let value=DateTime.fromISO(`${date}T${time}`,{zone});if(!value.isValid)fail(400,'This schedule cannot be resolved.');
 if(value.toFormat('HH:mm')!==time){while(value.minus({minutes:1}).toISODate()===date&&value.minus({minutes:1}).toFormat('HH:mm')>=time)value=value.minus({minutes:1});}
 return Math.min(...value.getPossibleOffsets().map(v=>v.toMillis()));}
export function resolveSchedule(date,schedule){const opensAt=instant(date,'00:00',schedule.timeZone),answerDeadline=instant(date,schedule.answerTime,schedule.timeZone),revealAt=instant(date,schedule.revealTime,schedule.timeZone);if(answerDeadline<=opensAt||revealAt<=answerDeadline)fail(400,'These deadlines overlap during a clock change. Choose different times.');return {opensAt,answerDeadline,revealAt};}
