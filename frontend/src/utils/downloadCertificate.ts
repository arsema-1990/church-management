function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load a certificate image.'));
    image.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function drawCentered(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const lines = wrapText(ctx, text, maxWidth);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight, maxWidth));
  return y + lines.length * lineHeight;
}

function joinBytes(chunks: Uint8Array[]) {
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

function makePdf(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number) {
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const ratio = Math.min(pageWidth / pixelWidth, pageHeight / pixelHeight);
  const drawWidth = pixelWidth * ratio;
  const drawHeight = pixelHeight * ratio;
  const x = (pageWidth - drawWidth) / 2;
  const y = (pageHeight - drawHeight) / 2;
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [encoder.encode('%PDF-1.4\n% church certificate\n')];
  const offsets = [0];
  let length = parts[0].length;
  const object = (id: number, chunks: Uint8Array[]) => {
    offsets[id] = length;
    const wrapped = [encoder.encode(`${id} 0 obj\n`), ...chunks, encoder.encode('\nendobj\n')];
    for (const chunk of wrapped) { parts.push(chunk); length += chunk.length; }
  };
  object(1, [encoder.encode('<< /Type /Catalog /Pages 2 0 R >>')]);
  object(2, [encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')]);
  object(3, [encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`)]);
  const content = encoder.encode(`q\n${drawWidth} 0 0 ${drawHeight} ${x} ${y} cm\n/Im0 Do\nQ`);
  object(4, [encoder.encode(`<< /Length ${content.length} >>\nstream\n`), content, encoder.encode('\nendstream')]);
  object(5, [encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, encoder.encode('\nendstream')]);
  const xrefOffset = length;
  const xref = [`xref\n0 6\n0000000000 65535 f \n`, ...offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`)].join('');
  parts.push(encoder.encode(xref));
  parts.push(encoder.encode(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`));
  return joinBytes(parts);
}

type DownloadOptions = { title?: string; recipientName?: string; issuerName?: string; signatureSnapshot?: string; isCourse?: boolean };

/** Draws the certificate on canvas and downloads it as a single-page A4 PDF. */
export async function downloadCertificatePdf(element: HTMLElement | null, options: DownloadOptions = {}) {
  if (!element) return;
  const certificate = element.querySelector<HTMLElement>('.certificate-border, .mgr-cert-body') ?? element;
  try {
    const width = 1600;
    const height = 1100;
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the certificate download.');
    context.scale(scale, scale);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = '#d3a522';
    context.lineWidth = 8;
    context.strokeRect(28, 28, width - 56, height - 56);
    context.lineWidth = 2;
    context.strokeRect(44, 44, width - 88, height - 88);

    const navy = '#17345e';
    const muted = '#7185a0';
    const church = certificate.querySelector('.mgr-cert-church')?.textContent?.trim()
      ?? certificate.querySelector('.certificate-border > p')?.textContent?.trim()
      ?? 'GRACE EVANGELICAL CHURCH';
    const title = options.title ?? certificate.querySelector('.mgr-cert-title')?.textContent?.trim()
      ?? certificate.querySelector('h2')?.textContent?.trim()
      ?? 'CERTIFICATE';
    const recipient = options.recipientName ?? certificate.querySelector('.mgr-cert-name')?.textContent?.trim()
      ?? certificate.querySelector('h3')?.textContent?.trim()
      ?? '';
    const paragraphs = Array.from(certificate.querySelectorAll('p')).map(p => p.textContent?.trim() ?? '').filter(Boolean);
    const intro = paragraphs.find(value => value.toLowerCase().startsWith('this certifies')) ?? 'This certifies that';
    const completion = paragraphs.find(value => value.toLowerCase().startsWith('has successfully'))
      ?? (options.isCourse === false ? 'has completed the required church process and is hereby awarded this certificate of recognition.' : 'has successfully completed the course named above and is awarded this certificate.');
    const subtitle = certificate.querySelector('.mgr-cert-subtitle')?.textContent?.trim() ?? 'WORSHIP · GROW · SERVE';
    const meta = Array.from(certificate.querySelectorAll('.certificate-meta span, .mgr-cert-meta span')).map(span => span.textContent?.trim() ?? '').filter(Boolean);
    if (!meta.length) meta.push(...[certificate.querySelector('.portal-cert-num')?.textContent?.trim(), certificate.querySelector('.portal-cert-date')?.textContent?.trim()].filter((value): value is string => Boolean(value)));
    const issuer = options.issuerName ?? certificate.querySelector('.signature-line > strong, .mgr-cert-sig-block > strong')?.textContent?.trim() ?? '';
    const issuerRole = certificate.querySelector('.signature-line > small, .mgr-cert-sig-block > small')?.textContent?.trim() ?? 'Church Manager';
    const signature = options.signatureSnapshot?.startsWith('data:image/')
      ? options.signatureSnapshot
      : certificate.querySelector<HTMLImageElement>('.signature-line img, .mgr-cert-sig-img')?.src;
    const signatureText = options.signatureSnapshot && !options.signatureSnapshot.startsWith('data:image/')
      ? options.signatureSnapshot
      : certificate.querySelector('.signature-line .sig-text, .mgr-cert-sig-text')?.textContent?.trim() ?? issuer;
    const qr = certificate.querySelector<HTMLImageElement>('.certificate-qr, .mgr-cert-qr-block img, .portal-cert-qr');

    context.textAlign = 'center';
    context.fillStyle = navy;
    context.font = '64px Georgia, serif';
    context.fillText('✝', width / 2, 145);
    context.fillStyle = '#294c7d';
    context.font = 'bold 20px Arial, sans-serif';
    let y = drawCentered(context, church.toUpperCase(), width / 2, 190, 1250, 28);
    context.fillStyle = muted;
    context.font = '16px Arial, sans-serif';
    y = drawCentered(context, subtitle, width / 2, y + 4, 1200, 24);
    context.fillStyle = navy;
    context.font = 'bold 34px Georgia, serif';
    y = drawCentered(context, title.toUpperCase(), width / 2, y + 50, 1260, 44);
    context.fillStyle = muted;
    context.font = '21px Arial, sans-serif';
    y = drawCentered(context, intro, width / 2, y + 28, 1250, 30);
    context.fillStyle = navy;
    context.font = 'bold 42px Georgia, serif';
    y = drawCentered(context, recipient, width / 2, y + 18, 1300, 54);
    context.fillStyle = muted;
    context.font = '20px Arial, sans-serif';
    y = drawCentered(context, completion, width / 2, y + 18, 1240, 30);
    context.font = '18px Arial, sans-serif';
    drawCentered(context, meta.join('     ·     '), width / 2, y + 36, 1300, 28);

    context.strokeStyle = '#dfc66f';
    context.lineWidth = 1;
    context.beginPath(); context.moveTo(130, 825); context.lineTo(width - 130, 825); context.stroke();
    context.textAlign = 'center';
    context.fillStyle = navy;
    if (signature) {
      context.drawImage(await loadImage(signature), 220, 858, 250, 80);
    } else {
      context.font = 'italic 32px Georgia, serif';
      context.fillText(signatureText, 345, 915, 400);
    }
    context.strokeStyle = navy;
    context.beginPath(); context.moveTo(180, 950); context.lineTo(510, 950); context.stroke();
    context.font = 'bold 19px Arial, sans-serif';
    context.fillText(issuer, 345, 982, 400);
    context.fillStyle = muted;
    context.font = '16px Arial, sans-serif';
    context.fillText(issuerRole, 345, 1008, 400);
    if (qr?.src) {
      context.drawImage(await loadImage(qr.src), width - 250, 858, 112, 112);
      context.fillStyle = muted;
      context.font = '14px Arial, sans-serif';
      context.fillText('Scan to verify', width - 194, 994, 170);
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
    const jpegBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), character => character.charCodeAt(0));
    const pdfBytes = makePdf(jpegBytes, canvas.width, canvas.height);
    const pdfUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = 'church-certificate.pdf';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 30_000);
  } catch (error) {
    console.error('Certificate PDF download failed:', error);
    window.alert(error instanceof Error ? error.message : 'Could not download the certificate PDF. Please try again or use Print.');
  }
}
