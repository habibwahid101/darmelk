// Minimal SES sender, called via SES's plain HTTPS API (SigV4-signed by hand
// so we don't need the ~300KB AWS SDK in the bundle). Reached through the SES
// VPC interface endpoint — no NAT gateway needed. Failures are logged and
// swallowed by callers that must not block auth flows (see auth.ts); callers
// that DO need to know (none currently) can catch this directly.
import { createHash, createHmac } from "node:crypto";

function env(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v ? v : undefined;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

async function sigv4Fetch(opts: {
  region: string;
  service: string;
  method: string;
  host: string;
  path: string;
  body: string;
  headers?: Record<string, string>;
}): Promise<Response> {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const headers: Record<string, string> = {
    host: opts.host,
    "x-amz-date": amzDate,
    "content-type": "application/x-www-form-urlencoded",
    ...(sessionToken ? { "x-amz-security-token": sessionToken } : {}),
    ...opts.headers,
  };

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const payloadHash = sha256Hex(opts.body);

  const canonicalRequest = [
    opts.method,
    opts.path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, opts.region);
  const kService = hmac(kRegion, opts.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(`https://${opts.host}${opts.path}`, {
    method: opts.method,
    headers: { ...headers, authorization },
    body: opts.body,
  });
}

export async function sendMail(opts: { to: string; subject: string; text: string }): Promise<void> {
  const region = env("AWS_REGION") ?? "ap-south-1";
  const from = env("SES_FROM_EMAIL");
  if (!from) {
    console.warn("[email] SES_FROM_EMAIL not set — skipping send to", opts.to);
    return;
  }
  const body = new URLSearchParams({
    Action: "SendEmail",
    Version: "2010-12-01",
    Source: from,
    "Destination.ToAddresses.member.1": opts.to,
    "Message.Subject.Data": opts.subject,
    "Message.Body.Text.Data": opts.text,
  }).toString();

  try {
    const res = await sigv4Fetch({
      region,
      service: "ses",
      method: "POST",
      host: `email.${region}.amazonaws.com`,
      path: "/",
      body,
    });
    if (!res.ok) {
      console.error("[email] SES send failed", res.status, await res.text());
    }
  } catch (err) {
    console.error("[email] SES send threw", err);
  }
}
