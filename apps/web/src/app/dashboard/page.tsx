'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, FileUp, Users, Send, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [stats, setStats] = React.useState({
    totalCampaigns: 0,
    activeCampaigns: 0,
    totalLeads: 0,
    successfulSends: 0,
  });

  React.useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch('/api/campaigns');
      const campaigns = await res.json();
      
      let totalLeads = 0;
      let successfulSends = 0;
      let activeCampaigns = 0;

      campaigns.forEach((campaign: any) => {
        totalLeads += campaign.totalLeads;
        successfulSends += campaign.successLeads;
        if (campaign.status === 'active') activeCampaigns++;
      });

      setStats({
        totalCampaigns: campaigns.length,
        activeCampaigns,
        totalLeads,
        successfulSends,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
              <p className="text-slate-500 mt-2">Welcome to 3D Suite Campaign Manager</p>
            </div>
            <Link href="/campaigns/create">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <FileUp className="w-4 h-4 mr-2" />
                New Campaign
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-white border-slate-200 hover:border-slate-300 transition">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Total Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{stats.totalCampaigns}</div>
              <p className="text-xs text-slate-500 mt-1">{stats.activeCampaigns} active</p>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 hover:border-slate-300 transition">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Total Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{stats.totalLeads}</div>
              <p className="text-xs text-slate-500 mt-1">Imported leads</p>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 hover:border-slate-300 transition">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Successful Sends</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.successfulSends}</div>
              <p className="text-xs text-slate-500 mt-1">WeTransfer delivered</p>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200 hover:border-slate-300 transition">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {stats.totalLeads > 0 ? Math.round((stats.successfulSends / stats.totalLeads) * 100) : 0}%
              </div>
              <p className="text-xs text-slate-500 mt-1">Overall performance</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-white border-slate-200 mb-8">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with your first campaign</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <Link href="/campaigns/create" className="block">
                <Button variant="outline" className="w-full justify-start hover:bg-slate-50">
                  <FileUp className="w-4 h-4 mr-2" />
                  Create Campaign
                </Button>
              </Link>
              <Link href="/campaigns" className="block">
                <Button variant="outline" className="w-full justify-start hover:bg-slate-50">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  View All Campaigns
                </Button>
              </Link>
              <Button variant="outline" className="w-full justify-start hover:bg-slate-50">
                <Send className="w-4 h-4 mr-2" />
                Import Leads
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Getting Started */}
        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-900">Getting Started</CardTitle>
          </CardHeader>
          <CardContent className="text-slate-700">
            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 min-w-fit">1.</span>
                <span>Create a new campaign and upload your template PDF</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 min-w-fit">2.</span>
                <span>Import leads from CSV or manually add them</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 min-w-fit">3.</span>
                <span>Start the campaign and monitor real-time progress</span>
              </li>
              <li className="flex gap-3">
                <span className="font-bold text-blue-600 min-w-fit">4.</span>
                <span>Check analytics and logs for detailed insights</span>
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
