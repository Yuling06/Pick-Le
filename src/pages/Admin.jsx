// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { apiClient } from '@/api/apiClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Shield, BarChart3, LogOut } from 'lucide-react';

export default function Admin() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await apiClient.entities.FeedbackSurvey.list('-created_date');
      setFeedback(rows);
    } catch (err) {
      setError(err.message || 'Could not load feedback.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const avg = (key) => {
    if (feedback.length === 0) return '-';
    const sum = feedback.reduce((s, f) => s + (Number(f[key]) || 0), 0);
    return (sum / feedback.length).toFixed(1);
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
            <Shield className="w-4 h-4 text-background" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">Admin Panel</span>
          <span className="px-2.5 py-0.5 rounded-full bg-secondary text-xs font-medium">Pick-le</span>
        </div>
        <button
          onClick={() => apiClient.auth.logout('/login')}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary/50">
            <BarChart3 className="w-4 h-4" />
            <span className="text-sm font-medium">Feedback</span>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
        </div>

        <h1 className="font-display text-2xl font-bold mb-6">
          Feedback Overview <span className="text-muted-foreground font-normal text-lg">{feedback.length} responses</span>
        </h1>

        {loading ? (
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mt-16" />
        ) : error ? (
          <Card className="p-6 text-center">
            <p className="font-medium mb-2">Couldn't load feedback</p>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-1.5" /> Retry
            </Button>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { key: 'confidence_rating', label: 'Confidence' },
                { key: 'sizing_match_rating', label: 'Sizing Match' },
                { key: 'visualization_rating', label: 'Visualization' },
                { key: 'would_use_rating', label: 'Would Use' },
              ].map(({ key, label }) => (
                <Card key={key} className="p-4 text-center">
                  <p className="text-2xl font-display font-bold text-primary">{avg(key)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{label}</p>
                </Card>
              ))}
            </div>

            <Card className="divide-y divide-border">
              {feedback.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">No feedback yet.</p>
              )}
              {feedback.map((f) => (
                <div key={f.id} className="p-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                  <div className="col-span-2 md:col-span-1 text-muted-foreground truncate">{f.user_email}</div>
                  <div>Confidence: <strong>{f.confidence_rating}</strong></div>
                  <div>Sizing: <strong>{f.sizing_match_rating}</strong></div>
                  <div>Visual: <strong>{f.visualization_rating}</strong></div>
                  <div>Would use: <strong>{f.would_use_rating}</strong></div>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
