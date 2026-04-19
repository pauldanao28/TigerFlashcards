import { serve } from "https://deno.land/std@0.131.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  const payload = await req.json()
  const { email, full_name } = payload.record // Triggered by 'profiles' table

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; border: 2px solid #000; padding: 40px; background: #fff;">
      <h1 style="font-size: 40px; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -2px; margin: 0;">
        You're In.
      </h1>
      <p style="font-weight: bold; text-transform: uppercase; color: #64748b; font-size: 12px; margin-bottom: 30px;">
        Welcome to Flashkado | AI Flashcards for Japanese Learning
      </p>
      
      <p style="font-size: 16px; line-height: 1.6; color: #1e293b;">
        Hey ${full_name || 'there'}, your account is ready. You can now create your flashcards and study them.
      </p>

      <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; pt-20px;">
         <a href="https://flashkado.app/" 
            style="display: inline-block; background: #000; color: #fff; padding: 15px 30px; text-decoration: none; font-weight: 900; font-size: 14px; text-transform: uppercase;">
            Open Dashboard ⚡️
         </a>
      </div>
    </div>
  `

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Flashkado <hello@flashkado.app>',
      to: [email],
      subject: 'WELCOME TO THE JOURNEY 📈',
      html: emailHtml,
    }),
  })

  return new Response(JSON.stringify({ done: true }), { status: 200 })
})