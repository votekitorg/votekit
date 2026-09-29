import { NextRequest, NextResponse } from 'next/server';
import { getPoll,pollView,publicPollResults } from '@/lib/public-polls';
import { pollError } from '@/lib/public-poll-http';
export const runtime='nodejs';
export async function GET(_request:NextRequest,context:{params:Promise<{id:string}>}) {
  try {
    const {id}=await context.params,p=getPoll(id);
    if(!p||p.status==='draft')return NextResponse.json({error:'Poll not found'},{status:404});
    return NextResponse.json({poll:pollView(p),results:p.status==='published'?publicPollResults(p):null});
  }catch(e){return pollError(e);}
}
