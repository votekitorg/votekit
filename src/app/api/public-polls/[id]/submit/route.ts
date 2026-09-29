import { after,NextRequest,NextResponse } from 'next/server';
import { getTrustedRequestIp,validateCSRFRequest } from '@/lib/auth';
import { submitPublicBallot,PollError } from '@/lib/public-polls';
import { sendPublicPollConfirmation } from '@/lib/email';
import { pollBody,pollError } from '@/lib/public-poll-http';
export const runtime='nodejs';
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}) {
  if(!validateCSRFRequest(request))return NextResponse.json({error:'Invalid request'},{status:403});
  try {
    const {id}=await context.params,body=await pollBody(request);
    let origin:string;
    try {const base=new URL(process.env.VOTEKIT_PUBLIC_URL||'');if(base.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&base.protocol==='http:'))throw new Error();origin=base.origin;}catch{throw new PollError('Email confirmation is not configured',503);}
    const delivery=submitPublicBallot(id,body,getTrustedRequestIp(request));
    // Never expose duplicate-email status, token or ballot ID to the submitting browser.
    if(delivery)after(async()=>{
      const sent=await sendPublicPollConfirmation({...delivery,url:`${origin}/poll/${id}/confirm#token=${encodeURIComponent(delivery.token)}`});
      if(!sent.success)console.error('Public poll confirmation email could not be delivered');
    });
    return NextResponse.json({success:true,message:'Submission received. Check your inbox and spam folder for a confirmation link. Only one ballot per email is counted. If you have already confirmed, your ballot is unchanged. If no email arrives, wait a minute before submitting again.'});
  }catch(e){return pollError(e);}
}
