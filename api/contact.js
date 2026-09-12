// API route: POST /api/contact — envía email vía Resend sin salir de la web
//
// Configuración por env vars (nada hardcodeado):
//   RESEND_API_KEY  → obligatoria (Vercel → Settings → Environment Variables)
//   RESEND_FROM     → remitente. Por defecto 'MALO Web <onboarding@resend.dev>'
//                     (fase de pruebas: solo llega al email con el que abriste
//                     la cuenta de Resend). Cuando malo.works esté verificado:
//                     RESEND_FROM='MALO Web <hola@malo.works>'
//   RESEND_TO       → destinatarios separados por coma. Por defecto los 4 de
//                     producción. Para la primera prueba con onboarding@:
//                     RESEND_TO='tu-email-de-cuenta-resend' (uno solo).
//
// DNS (Resend → Domains → Add domain malo.works): copia EXACTAMENTE los
// registros que genere el dashboard (DKIM TXT/CNAME y MX específicos de
// región, p.ej. feedback-smtp.eu-west-1.amazonses.com). Todo va bajo
// send.malo.works — el SPF raíz de Outlook NO se toca.
const FROM = process.env.RESEND_FROM || 'MALO Web <onboarding@resend.dev>';
const TO = (process.env.RESEND_TO ||
  'hola@malo.works,alfonso.megino@malo.works,Juan.ruiz@malo.works,juan@valmesolutions.com'
).split(',').map(s => s.trim()).filter(Boolean);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { name, email, message, company } = req.body || {};

  // honeypot: si viene relleno es un bot → responder OK sin enviar nada
  if (company) return res.status(200).json({ ok: true });

  // validación server-side
  if (!name || !EMAIL_RE.test(email || '') || !message) {
    return res.status(400).json({ ok: false, error: 'Invalid fields' });
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return res.status(500).json({ ok: false, error: 'RESEND_API_KEY not configured' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        reply_to: email,
        subject: `Nuevo mensaje de ${name} — malo.works`,
        text: [
          `Nombre: ${name}`,
          `Email: ${email}`,
          '',
          message,
        ].join('\n'),
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      console.error('Resend error', r.status, detail);
      return res.status(502).json({ ok: false, error: 'Email provider error' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('contact handler error', err);
    return res.status(500).json({ ok: false, error: 'Internal error' });
  }
}
