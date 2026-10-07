import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { randomAvatarPreset } from '@/lib/avatars'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    // In Next.js 16, cookies() MUST be awaited
    const cookieStore = await cookies()
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            // Since this is a GET route, we use a different approach 
            // for setting cookies if needed, but for Auth exchange, 
            // the simple set is usually fine.
            try {
              cookieStore.set({ name, value, ...options })
            } catch (error) {
              // This can happen if the component is being rendered 
              // and cookies are being set at the same time.
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set({ name, value: '', ...options })
            } catch (error) {
              // Handle potential cookie setting errors
            }
          },
        },
      }
    )
    
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // First-time OAuth sign-in: assign a random preset avatar if one isn't set yet
      if (data.user) {
        await supabase
          .from('profiles')
          .update({ avatar_url: randomAvatarPreset() })
          .eq('id', data.user.id)
          .is('avatar_url', null)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Redirect to an error page or back home if code is missing or exchange fails
  return NextResponse.redirect(`${origin}/`)
}