import PublicPollBallot from './PublicPollBallot';
export default async function Page({params}:{params:Promise<{id:string}>}) {const {id}=await params;return <PublicPollBallot id={id}/>;}
