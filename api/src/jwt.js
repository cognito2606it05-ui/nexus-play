import { createHmac } from 'node:crypto';

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export const jwt = {
  sign(payload, secret, options = {}) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const clonedPayload = { ...payload };

    if (options.expiresIn) {
      // Parse simple expires strings like '15m', '30d', '2h'
      const match = String(options.expiresIn).match(/^(\d+)([mdh])$/);
      if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        let ms = 0;
        if (unit === 'm') ms = value * 60 * 1000;
        else if (unit === 'h') ms = value * 60 * 60 * 1000;
        else if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;
        clonedPayload.exp = Math.floor((Date.now() + ms) / 1000);
      } else {
        // Fallback: default 1 hour
        clonedPayload.exp = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
      }
    }

    // Set iat if not present
    if (!clonedPayload.iat) {
      clonedPayload.iat = Math.floor(Date.now() / 1000);
    }

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(clonedPayload));
    const input = `${encodedHeader}.${encodedPayload}`;

    const signature = createHmac('sha256', secret)
      .update(input)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    return `${input}.${signature}`;
  },

  verify(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const input = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = createHmac('sha256', secret)
      .update(input)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (signature !== expectedSignature) {
      throw new Error('Invalid signature');
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && (Date.now() / 1000) > payload.exp) {
      throw new Error('Token expired');
    }

    return payload;
  }
};

export default jwt;
