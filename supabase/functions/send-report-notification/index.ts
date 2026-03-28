import { serve } from "https://deno.land/std@0.131.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  const payload = await req.json()
  const record = payload.record
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

  // 1. Determine Source: System Feedback has a 'subject', Card Reports don't
  const isSystemFeedback = 'subject' in record;

  // 2. Fetch User Profile (Common to both)
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', record.user_id)
    .single()

  const userName = profile?.full_name || "Unknown User"
  const userEmail = profile?.email || "Unknown Email"

  let emailSubject = ""
  let emailHtml = ""

  if (isSystemFeedback) {
    // --- TEMPLATE A: SYSTEM FEEDBACK ---
    emailSubject = `🛠️ ${record.type?.toUpperCase()}: ${record.subject}`
    emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <div style="background: #10b981; padding: 20px; color: white;">
          <h2 style="margin: 0; font-style: italic;">System ${record.type}</h2>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase;">From</p>
          <p style="font-size: 16px; font-weight: bold;">${userName} (${userEmail})</p>
          
          <p style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-top: 20px;">Subject</p>
          <p style="font-size: 18px; font-weight: bold; color: #064e3b;">${record.subject}</p>

          <div style="background: #f0fdf4; padding: 16px; border-radius: 12px; border-left: 4px solid #10b981; margin-top: 20px;">
            <p style="font-size: 14px; line-height: 1.6; color: #166534;">${record.description}</p>
          </div>
        </div>
      </div>
    `
  } else {
    // --- TEMPLATE B: CARD REPORT ---
    const { data: card } = await supabase
      .from('master_cards')
      .select('japanese, reading, english')
      .eq('id', record.card_id)
      .single()

    const cardText = card ? `${card.japanese} (${card.reading})` : "Unknown Card"
    emailSubject = `🚨 Card Report: ${card?.japanese || 'New'}`
    emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <div style="background: #4f46e5; padding: 20px; color: white;">
          <h2 style="margin: 0; font-style: italic;">Card Content Report</h2>
        </div>
        <div style="padding: 24px;">
          <p style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase;">Reporter</p>
          <p style="font-size: 16px; font-weight: bold;">${userName} (${userEmail})</p>
          
          <p style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-top: 20px;">Card</p>
          <p style="font-size: 20px; font-weight: 900; color: #4f46e5;">${cardText}</p>
          <p style="font-size: 14px; color: #64748b; margin-top: -10px;">Meaning: ${card?.english || 'N/A'}</p>

          <div style="background: #f8fafc; padding: 16px; border-radius: 12px; border-left: 4px solid #4f46e5; margin-top: 20px;">
            <p style="font-size: 14px; line-height: 1.6;">"${record.suggested_meaning}"</p>
          </div>
        </div>
      </div>
    `
  }

  // 3. Send via Resend
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Flashcards <onboarding@resend.dev>',
      to: 'pauldanao28@gmail.com',
      subject: emailSubject,
      html: emailHtml,
    }),
  })

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})