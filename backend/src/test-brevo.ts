import 'dotenv/config';

async function testBrevo() {
  const apiKey = (process.env.BREVO_API_KEY || '').trim();
  const from = process.env.EMAIL_FROM || 'Grace Evangelical Church <aremahailu465@gmail.com>';
  const targetEmail = process.argv[2]?.trim() || '';

  console.log('====================================================');
  console.log('          BREVO (SENDINBLUE) EMAIL DIAGNOSTIC       ');
  console.log('====================================================');
  console.log('Configured Sender (EMAIL_FROM):', from);
  console.log('API Key Present:', apiKey ? `YES (${apiKey.substring(0, 8)}...${apiKey.substring(Math.max(0, apiKey.length - 4))})` : 'NO (Empty)');

  if (!apiKey) {
    console.error('\n[ERROR] BREVO_API_KEY is empty in backend/.env!');
    console.log('To configure Brevo:');
    console.log('1. Log into your Brevo account (https://app.brevo.com)');
    console.log('2. Go to SMTP & API -> API Keys -> Generate a new API key');
    console.log('3. Paste the key into backend/.env:');
    console.log('   BREVO_API_KEY="xkeysib-YOUR_ACTUAL_KEY"\n');
    process.exit(1);
  }

  // 1. Test Account
  console.log('\n[1/3] Testing Brevo API authentication...');
  try {
    const accRes = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey, accept: 'application/json' },
    });
    if (accRes.ok) {
      const acc = await accRes.json() as { email?: string; companyName?: string; plan?: Array<{ type: string; credits: number }> };
      console.log('  ✓ Authentication successful!');
      console.log('    Account Email:', acc.email);
      console.log('    Company:', acc.companyName || 'N/A');
      if (acc.plan) {
        console.log('    Plans/Credits:', acc.plan.map(p => `${p.type}: ${p.credits} credits`).join(', '));
      }
    } else {
      const err = await accRes.text();
      console.error(`  ✗ Authentication failed (HTTP ${accRes.status}):`, err);
      process.exit(1);
    }
  } catch (err) {
    console.error('  ✗ Connection error:', err);
    process.exit(1);
  }

  // 2. Test Senders
  console.log('\n[2/3] Checking verified senders...');
  try {
    const sndRes = await fetch('https://api.brevo.com/v3/senders', {
      headers: { 'api-key': apiKey, accept: 'application/json' },
    });
    if (sndRes.ok) {
      const snd = await sndRes.json() as { senders?: Array<{ id: number; name: string; email: string; active?: boolean }> };
      const senders = snd.senders || [];
      console.log(`  ✓ Found ${senders.length} sender(s):`);
      for (const s of senders) {
        console.log(`    - [${s.active !== false ? 'ACTIVE' : 'INACTIVE'}] ${s.name} <${s.email}> (ID: ${s.id})`);
      }
    } else {
      console.warn(`  ! Could not fetch senders list (HTTP ${sndRes.status})`);
    }
  } catch (err) {
    console.warn('  ! Error fetching senders:', err);
  }

  // 3. Test Email Send (if target provided)
  if (targetEmail) {
    console.log(`\n[3/3] Sending test transactional email to: ${targetEmail}...`);
    try {
      const senderMatch = from.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/);
      const senderObj = senderMatch && senderMatch[1] && senderMatch[2]
        ? { name: senderMatch[1].trim(), email: senderMatch[2].trim() }
        : { name: 'Grace Evangelical Church', email: from.trim() };

      const sendRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: senderObj,
          to: [{ email: targetEmail, name: 'Test Recipient' }],
          subject: 'Test Transactional Email - Grace Evangelical Church',
          htmlContent: '<html><body><h2>Brevo Connection Verified</h2><p>This is a test transactional email confirming that your Brevo integration is functioning correctly.</p></body></html>',
          textContent: 'Brevo Connection Verified. This is a test transactional email.',
          headers: {
            'Auto-Submitted': 'auto-generated',
            'X-Auto-Response-Suppress': 'All',
          },
        }),
      });

      if (sendRes.ok) {
        const data = await sendRes.json();
        console.log('  ✓ Test email sent successfully!');
        console.log('    Response:', data);
      } else {
        const err = await sendRes.text();
        console.error(`  ✗ Test email send failed (HTTP ${sendRes.status}):`, err);
      }
    } catch (err) {
      console.error('  ✗ Error dispatching test email:', err);
    }
  } else {
    console.log('\n[3/3] Tip: To send a real test email, run:');
    console.log('  npx tsx src/test-brevo.ts your-email@example.com');
  }
  console.log('====================================================\n');
}

testBrevo();
