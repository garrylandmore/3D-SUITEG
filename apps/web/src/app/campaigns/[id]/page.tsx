'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Pause, Download, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  totalLeads: number;
  processedLeads: number;
  successLeads: number;
  failedLeads: number;
  leads: Lead[];
  logs: CampaignLog[];
}

interface Lead {
  id: string;
  email: string;
  name: string;
  status: string;
  sentAt?: string;
  errorMessage?: string;
}

interface CampaignLog {
  id: string;
  action: string;
  status: string;
  details?: string;
  createdAt: string;
}

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const [campaign, setCampaign] = React.useState<Campaign | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showImportModal, setShowImportModal] = React.useState(false);

  React.useEffect(() => {
    fetchCampaign();
    const interval = setInterval(fetchCampaign, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, [params.id]);

  async function fetchCampaign() {
    try {
      const res = await fetch(`/api/campaigns/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setCampaign(data);
      }
    } catch (error) {
      console.error('Failed to fetch campaign:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCampaign() {
    try {
      const res = await fetch(`/api/campaigns/${params.id}/send`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchCampaign();
      }
    } catch (error) {
      console.error('Failed to send campaign:', error);
    }
  }

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  if (!campaign) {
    return <div className="text-center py-12">Campaign not found</div>;
  }

  const successRate = campaign.totalLeads > 0
    ? Math.round((campaign.successLeads / campaign.totalLeads) * 100)
    : 0;

  const processingCount = campaign.processedLeads - campaign.successLeads - campaign.failedLeads;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Link href="/campaigns" className="inline-flex items-center text-blue-600 hover:text-blue-700 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Campaigns
          </Link>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{campaign.name}</h1>
              {campaign.description && (
                <p className="text-slate-500 mt-2">{campaign.description}</p>
              )}
            </div>
            <div className="flex gap-2">
              {campaign.status === 'draft' && (
                <Button
                  onClick={handleSendCampaign}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Campaign
                </Button>
              )}
              {campaign.status === 'active' && (
                <Button variant="outline" className="border-yellow-300">
                  <Pause className="w-4 h-4 mr-2" />
                  Pause Campaign
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Stats */}
        <div className="grid md:grid-cols-5 gap-4">
          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge className={campaign.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}>
                {campaign.status}
              </Badge>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Total Leads</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{campaign.totalLeads}</p>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Sent</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{campaign.successLeads}</p>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Processing</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{processingCount}</p>
            </CardContent>
          </Card>

          <Card className="bg-white border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-600">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-slate-900">{successRate}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Card className="bg-white border-slate-200">
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="leads" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="leads">Leads ({campaign.leads.length})</TabsTrigger>
                <TabsTrigger value="logs">Activity Logs ({campaign.logs.length})</TabsTrigger>
              </TabsList>

              {/* Leads Tab */}
              <TabsContent value="leads" className="space-y-4 mt-6">
                {campaign.leads.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-slate-500 mb-4">No leads imported yet</p>
                    <Button
                      onClick={() => setShowImportModal(true)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Import Leads
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-slate-200 bg-slate-50">
                        <tr>
                          <th className="text-left py-3 px-4 font-medium">Email</th>
                          <th className="text-left py-3 px-4 font-medium">Name</th>
                          <th className="text-left py-3 px-4 font-medium">Status</th>
                          <th className="text-left py-3 px-4 font-medium">Sent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaign.leads.map(lead => (
                          <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 px-4">{lead.email}</td>
                            <td className="py-3 px-4">{lead.name}</td>
                            <td className="py-3 px-4">
                              <Badge className={
                                lead.status === 'sent' ? 'bg-green-100 text-green-800' :
                                lead.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                                lead.status === 'failed' ? 'bg-red-100 text-red-800' :
                                'bg-slate-100 text-slate-800'
                              }>
                                {lead.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-slate-500">
                              {lead.sentAt ? new Date(lead.sentAt).toLocaleDateString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* Logs Tab */}
              <TabsContent value="logs" className="space-y-3 mt-6">
                {campaign.logs.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No activity yet</p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {campaign.logs.map(log => (
                      <div key={log.id} className="border border-slate-200 rounded p-3 bg-slate-50">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-slate-900">{log.action}</p>
                            <p className="text-xs text-slate-500">
                              {new Date(log.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <Badge className={log.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {log.status}
                          </Badge>
                        </div>
                        {log.details && (
                          <p className="text-xs text-slate-600 mt-2 font-mono">{log.details}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
