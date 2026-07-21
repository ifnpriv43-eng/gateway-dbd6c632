import { createHmac, timingSafeEqual } from "crypto";
import { getRequestHeader, useSession } from "@tanstack/react-start/server";
import { getSessionConfig, getSessionSecret, type SessionData } from "./session";

type TokenPayload = Required<Pick<SessionData, "userId" | "role">> & {
  iat: number;
  exp: number;
};

function getSecret() {
  return getSessionSecret();
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signPayload(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSessionToken(data: Required<Pick<SessionData, "userId" | "role">>) {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    ...data,
    iat: now,
    exp: now + 60 * 60 * 24 * 7,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

function verifySessionToken(token: string | null | undefined): SessionData | null {
  if (!token) return null;
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expected = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.userId || !payload.role || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}

export async function getSessionData(): Promise<SessionData> {
  const cookieSession = await useSession<SessionData>(getSessionConfig());
  if (cookieSession.data.userId) return cookieSession.data;

  const headerToken = getRequestHeader("x-evopay-session");
  return verifySessionToken(headerToken) ?? {};
}