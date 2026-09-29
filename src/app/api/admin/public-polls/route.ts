import { NextRequest, NextResponse } from 'next/server';
import { getAdminSessionFromRequest, canManageElections, validateCSRFRequest } from '@/lib/auth';
import db from '@/lib/db';
import { createPoll, updatePollDraft, deletePollDraft, pollSecuritySummary, finalisePoll, getPoll, managesPoll, openPoll, pollCounts, pollView, publicPollResults, publishPollResults, PollError, type PublicPoll } from '@/lib/public-polls';
import { pollBody, pollError } from '@/lib/public-poll-http';
export const runtime='nodejs';
export async function GET(request:NextRequest) {
  const actor=getAdminSessionFromRequest(request);
  if(!actor||!canManageElections(actor.role))return NextResponse.json({error:'Not authorised'},{status:403});
  try {
    const securityId=request.nextUrl.searchParams.get('security');
    if(securityId)return NextResponse.json({security:pollSecuritySummary(actor,securityId)});
    const list=(actor.role==='owner'?db.prepare('SELECT * FROM public_polls ORDER BY created_at DESC').all():db.prepare('SELECT * FROM public_polls WHERE created_by=? ORDER BY created_at DESC').all(actor.adminUserId)) as PublicPoll[];
    return NextResponse.json({polls:list.map(p=>({...pollView(p),counts:pollCounts(p.id),results:['finalised','published'].includes(p.status)?publicPollResults(p):null}))});
  }catch(e){return pollError(e);}
}
export async function POST(request:NextRequest) {
  const actor=getAdminSessionFromRequest(request);
  if(!actor||!canManageElections(actor.role)||!validateCSRFRequest(request))return NextResponse.json({error:'Not authorised'},{status:403});
  try {
    const body=await pollBody(request);
    if(body.action==='create')return NextResponse.json({poll:pollView(createPoll(actor,body))},{status:201});
    if(typeof body.id!=='string')throw new PollError('Invalid poll');
    const p=getPoll(body.id);if(!p||!managesPoll(actor,p))throw new PollError('Not authorised',403);
    if(body.action==='update')updatePollDraft(actor,p.id,body);
    else if(body.action==='delete')deletePollDraft(actor,p.id);
    else if(body.action==='open')openPoll(actor,p.id);
    else if(body.action==='finalise')finalisePoll(actor,p.id);
    else if(body.action==='publish_results')publishPollResults(actor,p.id);
    else throw new PollError('Unknown action');
    return NextResponse.json({success:true});
  }catch(e){return pollError(e);}
}
