import { NextRequest,NextResponse } from 'next/server';
import { getTrustedRequestIp,validateCSRFRequest } from '@/lib/auth';
import { confirmPublicBallot } from '@/lib/public-polls';
import { pollBody,pollError } from '@/lib/public-poll-http';
export const runtime='nodejs';
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}) {
  if(!validateCSRFRequest(request))return NextResponse.json({error:'Invalid request'},{status:403});
  try {const {id}=await context.params,body=await pollBody(request);return NextResponse.json({success:true,...confirmPublicBallot(id,body.token,getTrustedRequestIp(request))});}
  catch(e){return pollError(e);}
}
