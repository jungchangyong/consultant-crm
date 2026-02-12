import { redirect } from 'next/navigation';
import { DEMO_MODE, mockProfile } from '@/lib/mock-data';
import type { Profile } from '@/lib/types';

export async function getCurrentProfile(): Promise<Profile | null> {
  if (DEMO_MODE) {
    return mockProfile;
  }

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return profile as Profile | null;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect('/login');
  }
  return profile;
}

export function isClientUser(profile: Profile): boolean {
  return profile.role === 'client';
}

export function isStaffUser(profile: Profile): boolean {
  return profile.role === 'admin' || profile.role === 'consultant';
}
