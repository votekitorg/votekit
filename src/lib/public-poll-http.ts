import { NextRequest, NextResponse } from 'next/server';
import { PollError } from './public-polls';
export async function pollBody(request:NextRequest) {
  const size=Number(request.headers.get('content-length')||0);
  if(size>20000)throw new PollError('Request too large',413);
  const text=await request.text();if(text.length>20000)throw new PollError('Request too large',413);
  try {const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error();return body;}
  catch {throw new PollError('Invalid request');}
}
export function pollError(error:unknown) {
  if(error instanceof PollError)return NextResponse.json({error:error.message},{status:error.status});
  console.error('Public poll request failed');
  return NextResponse.json({error:'This request could not be completed. Please try again.'},{status:500});
}
