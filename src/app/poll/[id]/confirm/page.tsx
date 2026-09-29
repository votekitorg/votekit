import ConfirmBallot from './ConfirmBallot';
export default async function Page({params}:{params:Promise<{id:string}>}) {const {id}=await params;return <ConfirmBallot key={id} id={id}/>;}
