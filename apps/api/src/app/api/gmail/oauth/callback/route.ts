import { NextRequest, NextResponse } from 'next/server';

import {
  cleanupExpiredGmailPending,
  gmailPendingStore,
  upsertGmailConnection,
} from '@/lib/gmail-oauth-store';

export const dynamic = 'force-dynamic';



export async function GET(request: NextRequest) {
  cleanupExpiredGmailPending();

  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const errorParam = url.searchParams.get('error') || '';

  if (errorParam) {
    return new NextResponse(
      `<h2>Gmail connection cancelled</h2><p>${errorParam}</p>`,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }

  const pending = gmailPendingStore().get(state);

  if (!code || !state || !pending) {
    return new NextResponse(
      '<h2>Gmail connection failed</h2><p>Missing or expired OAuth state/code.</p>',
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }

  try {
    const clientId = pending.googleClientId;
    const clientSecret = pending.googleClientSecret;
    const redirectUri = pending.googleRedirectUri;

    const tokenResponse = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      }
    );

    const tokenText = await tokenResponse.text();
    const token = tokenText ? JSON.parse(tokenText) : {};

    if (!tokenResponse.ok || !token.access_token) {
      throw new Error(
        token.error_description ||
          token.error ||
          `Google token exchange failed: HTTP ${tokenResponse.status}`
      );
    }

    const profileResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile',
      {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      }
    );

    const profileText = await profileResponse.text();
    const profile = profileText ? JSON.parse(profileText) : {};

    if (!profileResponse.ok || !profile.emailAddress) {
      throw new Error(
        profile.error?.message ||
          `Unable to read Gmail profile: HTTP ${profileResponse.status}`
      );
    }

    const existingRefreshToken = token.refresh_token || '';

    if (!existingRefreshToken) {
      throw new Error(
        'Google did not return a refresh token. Disconnect the app from your Google Account permissions and connect again with consent.'
      );
    }

    await upsertGmailConnection({
      email: String(profile.emailAddress),
      accessToken: String(token.access_token),
      refreshToken: String(existingRefreshToken),
      expiresAt:
        Date.now() + Number(token.expires_in || 3600) * 1000,
      connectedAt: new Date().toISOString(),
      profileDirectory: pending.profileDirectory,
      googleClientId: pending.googleClientId,
      googleClientSecret: pending.googleClientSecret,
      googleRedirectUri: pending.googleRedirectUri,
    });

    gmailPendingStore().delete(state);

    return NextResponse.redirect(
      process.env.GMAIL_DASHBOARD_URL?.trim() ||
        'http://localhost:7200/dashboard?gmail=connected'
    );
  } catch (error) {
    gmailPendingStore().delete(state);

    return new NextResponse(
      `<h2>Gmail connection failed</h2><pre>${String(
        error instanceof Error ? error.message : error
      )}</pre>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
}
