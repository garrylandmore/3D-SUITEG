import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export interface SystemConfig {
  database: boolean;
  redis: boolean;
  wetransfer: boolean;
  email: boolean;
  tempEmail: boolean;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: SystemConfig;
  message: string;
}

/**
 * GET /api/health-check - Comprehensive system health check
 */
export async function GET(): Promise<NextResponse<HealthCheckResponse>> {
  const checks: SystemConfig = {
    database: false,
    redis: false,
    wetransfer: false,
    email: false,
    tempEmail: false,
  };

  // Check Database
  try {
    await prisma.user.findFirst();
    checks.database = true;
  } catch (error) {
    console.error('Database check failed:', error);
  }

  // Check Redis
  try {
    // In production, would test actual Redis connection
    const redisUrl = process.env.REDIS_URL;
    checks.redis = !!redisUrl;
  } catch (error) {
    console.error('Redis check failed:', error);
  }

  // Check WeTransfer API Key
  checks.wetransfer = !!process.env.WETRANSFER_API_KEY;

  // Check Email Configuration
  checks.email =
    !!process.env.SMTP_HOST &&
    !!process.env.SMTP_USER &&
    !!process.env.SMTP_PASSWORD;

  // Check Temp Email Provider
  checks.tempEmail = !!process.env.TEMP_EMAIL_PROVIDER;

  // Determine overall status
  const allHealthy = Object.values(checks).every((v) => v);
  const someHealthy = Object.values(checks).some((v) => v);

  let status: HealthCheckResponse['status'] = 'unhealthy';
  let message = 'System is not properly configured';

  if (allHealthy) {
    status = 'healthy';
    message = 'All systems operational';
  } else if (someHealthy) {
    status = 'degraded';
    message = 'Some systems are not configured';
  }

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    checks,
    message,
  });
}
