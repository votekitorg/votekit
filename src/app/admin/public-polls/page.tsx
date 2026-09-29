import { redirect } from 'next/navigation';
import { canManageElections,getAdminSessionFromCookies } from '@/lib/auth';
import AdminLayout from '@/components/AdminLayout';
import PublicPollManager from './PublicPollManager';
export const dynamic='force-dynamic';
export default async function Page() {const actor=await getAdminSessionFromCookies();if(!actor)redirect('/admin/login');if(!canManageElections(actor.role))redirect('/admin');return <AdminLayout currentUser={actor}><PublicPollManager/></AdminLayout>;}
