'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, BarChart3, Zap, Mail, FileText } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Navigation */}
      <nav className="border-b border-slate-700 backdrop-blur-md bg-slate-900/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-lg flex items-center justify-center font-bold text-sm">3D</div>
            <span className="font-bold text-lg">3D Suite</span>
          </div>
          <div className="flex gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" className="text-white hover:bg-slate-700">Dashboard</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center space-y-8 mb-20">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Professional WeTransfer Campaign Manager
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            Send personalized files at scale. Automate lead management with real-time tracking and professional delivery.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/dashboard">
              <Button size="lg" className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600">
                Get Started <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
          <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition">
            <CardHeader>
              <FileText className="w-6 h-6 text-blue-400 mb-2" />
              <CardTitle className="text-white">Template PDFs</CardTitle>
            </CardHeader>
            <CardContent className="text-slate-400">
              Upload templates with dynamic placeholders for personalization.
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition">
            <CardHeader>
              <Mail className="w-6 h-6 text-green-400 mb-2" />
              <CardTitle className="text-white">CSV Import</CardTitle>
            </CardHeader>
            <CardContent className="text-slate-400">
              Bulk import leads with custom fields and validation.
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition">
            <CardHeader>
              <Zap className="w-6 h-6 text-yellow-400 mb-2" />
              <CardTitle className="text-white">Auto Processing</CardTitle>
            </CardHeader>
            <CardContent className="text-slate-400">
              Automated personalization, temp emails, and WeTransfer uploads.
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition">
            <CardHeader>
              <BarChart3 className="w-6 h-6 text-purple-400 mb-2" />
              <CardTitle className="text-white">Live Tracking</CardTitle>
            </CardHeader>
            <CardContent className="text-slate-400">
              Real-time dashboard with campaign stats and detailed logs.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
