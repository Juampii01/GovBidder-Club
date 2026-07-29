// api/_lib/email.js
// Plantilla HTML compartida para los emails transaccionales de GovBidder Club (vía Resend).

const APP_URL = 'https://dboard.govbidderclub.com';

export function brandedEmailHtml({ eyebrow, title, bodyHtml, ctaText, ctaUrl }) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f3f7;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f3f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(20,38,79,.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#14264F,#0d1c3d);padding:28px 32px;text-align:center;">
            <img src="${APP_URL}/logo-square.png" alt="GovBidder Club" width="48" height="48" style="border-radius:10px;display:block;margin:0 auto 10px;"/>
            <div style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:.3px;">GovBidder <span style="color:#E24C5E;">Club</span></div>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 28px;">
            ${eyebrow ? `<div style="display:inline-block;background:#fdecee;color:#C42A3D;font-size:11.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;padding:5px 12px;border-radius:20px;margin-bottom:18px;">${eyebrow}</div>` : ''}
            <h1 style="margin:0 0 18px;font-size:20px;line-height:1.35;color:#14264F;font-weight:800;">${title}</h1>
            ${bodyHtml}
            ${ctaUrl ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 6px;">
              <tr><td style="border-radius:9px;background:linear-gradient(135deg,#C42A3D,#9e2231);">
                <a href="${ctaUrl}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:9px;">${ctaText} →</a>
              </td></tr>
            </table>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:22px 32px;border-top:1px solid #eef0f4;">
            <p style="margin:0 0 4px;font-size:14px;color:#14264F;font-weight:700;">Saludos,<br/>Equipo de GovBidder Club</p>
            <p style="margin:14px 0 0;font-size:12.5px;color:#9ca3af;font-style:italic;">Toma acción hoy para ser un GovBidder mañana.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendBrandedEmail({ to, subject, eyebrow, title, bodyHtml, ctaText, ctaUrl }) {
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return { ok: false, error: 'RESEND_API_KEY no configurada. Ve a Vercel → Settings → Environment Variables.' };
  const from = process.env.RESEND_FROM_EMAIL || 'GovBidder Club <onboarding@resend.dev>';
  const html = brandedEmailHtml({ eyebrow, title, bodyHtml, ctaText, ctaUrl });
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from, to, subject, html })
  });
  if (!emailRes.ok) {
    const errText = await emailRes.text();
    return { ok: false, error: `No se pudo enviar el email: ${errText.substring(0, 200)}` };
  }
  return { ok: true };
}

// Genera un link fresco y manda el email con marca — lo usan el alta de un inversionista
// nuevo, el reenvío manual desde Admin, y el "olvidé mi contraseña" público del login.
// Un link tipo 'invite' falla con "already registered" si la cuenta ya está confirmada —
// en ese caso mandamos un 'recovery' en su lugar, que también lleva a la pantalla de elegir
// contraseña (necesario: una cuenta confirmada puede seguir sin contraseña real si nunca
// completó ese paso).
export async function sendInvestorWelcomeEmail(supabase, email, name, profileId) {
  let alreadyConfirmed = false;
  if (profileId) {
    const { data: userData } = await supabase.auth.admin.getUserById(profileId);
    alreadyConfirmed = !!userData?.user?.email_confirmed_at;
  }
  const { data: invited, error: inviteErr } = await supabase.auth.admin.generateLink({
    type: alreadyConfirmed ? 'recovery' : 'invite',
    email, options: { redirectTo: 'https://dboard.govbidderclub.com' }
  });
  if (inviteErr) return { ok: false, error: inviteErr.message, invited: null };
  const inviteLink = invited.properties?.action_link;
  if (!inviteLink) return { ok: false, error: 'No se pudo generar el link.', invited };
  const emailResult = await sendBrandedEmail({
    to: email,
    subject: alreadyConfirmed ? 'Recuperá el acceso a tu cuenta' : 'Bienvenido a GovBidder Club',
    eyebrow: alreadyConfirmed ? 'Restablecer acceso' : 'Cuenta creada',
    title: alreadyConfirmed
      ? `${name ? `${name}, restablecé` : 'Restablecé'} tu acceso a GovBidder Club`
      : `${name ? `${name}, tu` : 'Tu'} cuenta de GovBidder Club está lista`,
    bodyHtml: alreadyConfirmed ? `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#374151;">Hola${name ? ` ${name}` : ''},</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#374151;">Para volver a entrar a tu cuenta de GovBidder Club, elegí una contraseña nueva haciendo clic en el siguiente botón.</p>` : `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#374151;">Hola${name ? ` ${name}` : ''},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#374151;">Te dimos de alta en GovBidder Club. Para activar tu cuenta y elegir tu contraseña, hacé clic en el siguiente botón.</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#374151;">Una vez adentro vas a poder ver tu perfil, tu actividad y todo lo que GovBidder Club tiene para tu negocio.</p>`,
    ctaText: alreadyConfirmed ? 'Elegir mi contraseña' : 'Activar mi cuenta',
    ctaUrl: inviteLink
  });
  return { ok: emailResult.ok, error: emailResult.ok ? null : emailResult.error, invited };
}
