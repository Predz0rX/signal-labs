const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

async function sendEmail({ to, industry, company, pdfPath }) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const pdfBuffer = fs.readFileSync(pdfPath);
  const filename = `Signal-Labs-Market-Snapshot-${industry.replace(/\s+/g, '-')}.pdf`;

  const { data, error } = await resend.emails.send({
    from: process.env.FROM_EMAIL || 'reports@signallabs.ai',
    to: [to],
    subject: `Your Market Snapshot: ${industry} Industry`,
    html: `
      <div style="font-family: 'DM Sans', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #111;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 700; color: #0A0A0A;">signal<span style="color: #0071E3;">labs</span></span>
        </div>
        <h2 style="font-size: 22px; font-weight: 700; color: #0A0A0A; margin: 0 0 12px;">Your Market Snapshot is ready</h2>
        <p style="font-size: 15px; color: #6B7280; line-height: 1.6; margin: 0 0 24px;">
          Hi${company ? ` from ${company}` : ''},<br><br>
          Your <strong>${industry}</strong> Market Snapshot is attached. It includes real market data, trends, and one key opportunity — all generated from live sources.
        </p>
        <p style="font-size: 14px; color: #6B7280; line-height: 1.6; margin: 0 0 24px;">
          The report also previews what's available in our paid plans — including 15-competitor analysis and financial benchmarking.
        </p>
        <a href="https://signal-labs-omega.vercel.app/#pricing" 
           style="display: inline-block; padding: 12px 24px; background: #0A0A0A; color: #fff; font-size: 14px; font-weight: 600; border-radius: 8px; text-decoration: none;">
          See all plans →
        </a>
        <p style="font-size: 12px; color: #9CA3AF; margin-top: 32px; line-height: 1.5;">
          Signal Labs · AI-powered market intelligence<br>
          <a href="https://signal-labs-omega.vercel.app" style="color: #9CA3AF;">signal-labs-omega.vercel.app</a>
        </p>
      </div>
    `,
    attachments: [
      {
        filename,
        content: pdfBuffer.toString('base64')
      }
    ]
  });

  if (error) throw new Error(`Resend error: ${JSON.stringify(error)}`);
  return data;
}

module.exports = { sendEmail };
