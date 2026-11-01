import { NextResponse } from 'next/server'
import { db } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Daily keep-alive (Vercel cron) so the free Supabase project never pauses.
// Returns only ok/not-ok — no data.
export async function GET() {
  const { error } = await db.from('cards').select('id').limit(1)
  return NextResponse.json({ ok: !error }, { status: error ? 500 : 200 })
}
