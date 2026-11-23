import 'dotenv/config';

async function testEmailJS() {
  const serviceId = (process.env.EMAILJS_SERVICE_ID ?? '').trim();
  const templateId = (process.env.EMAILJS_TEMPLATE_ID ?? '').trim();
  const publicKey = (process.env.EMAILJS_PUBLIC_KEY ?? process.env.EMAILJS_USER_ID ?? '').trim();
  const privateKey = (process.env.EMAILJS_PRIVATE_KEY ?? process.env.EMAILJS_ACCESS_TOKEN ?? '').trim();
  const targetEmail = process.argv[2]?.trim() || '';

  console.log('====================================================');
  console.log('              EMAILJS DIAGNOSTIC TEST               ');
  console.log('====================================================');
  console.log('Service ID: ', serviceId ? `✓ ${serviceId}` : '✗ (Missing)');
  console.log('Template ID:', templateId ? `✓ ${templateId}` : '✗ (Missing)');
  console.log('Public Key: ', publicKey ? `✓ ${publicKey.substring(0, 6)}...` : '✗ (Missing)');
  console.log('Private Key:', privateKey ? `✓ (Configured)` : '✗ (Missing)');

  if (!serviceId || !templateId || !publicKey) {
    console.error('\n[ERROR] EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, and EMAILJS_PUBLIC_KEY must be set in your .env file.');
    console.log('\nAdd the following to your .env and backend/.env:');
    console.log('EMAIL_PROVIDER="emailjs"');
    console.log('EMAILJS_SERVICE_ID="your_service_id"');
    console.log('EMAILJS_TEMPLATE_ID="your_template_id"');
    console.log('EMAILJS_PUBLIC_KEY="your_public_key"');
    console.log('EMAILJS_PRIVATE_KEY="your_private_key"');
    process.exit(1);
  }

  if (!targetEmail) {
    console.log('\nAll 4 configuration keys are detected!');
    console.log('\nTo send a live test email with verification code to your inbox, run:');
    console.log('  npx tsx src/test-emailjs.ts your-email@gmail.com');
    console.log('or:');
    console.log('  npm --workspace backend run test:emailjs your-email@gmail.com\n');
    return;
  }

  console.log(`\nSending test verification email to: ${targetEmail}...`);

  const payload: Record<string, unknown> = {
    service_id: serviceId,
    template_id: templateId,
    user_id: publicKey,
    template_params: {
      to_name: 'Test Recipient',
      name: 'Test Recipient',
      to_email: targetEmail,
      email: targetEmail,
      otp: '123456',
      code: '123456',
      passcode: '123456',
      purpose: 'email-verification',
      subject: 'Verify your email - Grace Evangelical Church (Test)',
      heading: 'Email Verification Code',
      instruction: 'Use this code to verify the email address for your account.',
      message: 'Your one-time verification code is 123456. This code expires in 5 minutes.',
    },
  };

  if (privateKey) {
    payload.accessToken = privateKey;
  }

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'application/json, text/plain, */*',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log('✓ Success! Email sent via EmailJS.');
      console.log('Check your inbox at', targetEmail, 'for the test OTP: 123456');
    } else {
      const errorText = await response.text();
      console.error(`✗ EmailJS rejected the request with HTTP ${response.status}:`, errorText);
      console.log('\nTips:');
      console.log('1. Make sure your template in EmailJS has {{to_email}} or {{email}} in the "To Email" field.');
      console.log('2. In EmailJS Dashboard -> Account -> Security, ensure "Allow EmailJS API for non-browser applications" is enabled if required, or ensure your Private Key is correct.');
    }
  } catch (error) {
    console.error('✗ Network error connecting to EmailJS:', error);
  }
}

testEmailJS();
