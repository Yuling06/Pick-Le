// @ts-nocheck
import React, { useState } from 'react';
import { apiClient } from '@/api/apiClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardCheck } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const questions = [
  { key: 'confidence_rating', text: 'This app increases my confidence when buying clothes online' },
  { key: 'sizing_match_rating', text: 'The sizing matched my expectations' },
  { key: 'visualization_rating', text: 'The visualization helped me understand fit' },
  { key: 'would_use_rating', text: 'I would use this app when shopping online' },
];

function LikertScale({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${
            value === n
              ? 'bg-primary text-primary-foreground shadow-md scale-110'
              : 'bg-secondary hover:bg-secondary/80 text-foreground'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export default function FeedbackSurveyForm({ requestId, onComplete }) {
  const { toast } = useToast();
  const [ratings, setRatings] = useState({
    confidence_rating: 0,
    sizing_match_rating: 0,
    visualization_rating: 0,
    would_use_rating: 0,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const allAnswered = Object.values(ratings).every(v => v > 0);

  const dismissError = () => setError(null);

  const handleSubmit = async () => {
    if (!allAnswered) return;
    setSubmitting(true);
    setError(null);
    try {
      const user = await apiClient.auth.me();
      await apiClient.entities.FeedbackSurvey.create({
        request_id: requestId,
        user_email: user.email,
        ...ratings,
      });
      onComplete();
    } catch (err) {
      const message = err.message || 'Something went wrong submitting your feedback. Please try again.';
      setError(message);
      toast({ title: 'Feedback not submitted', description: message, variant: 'destructive' });
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="font-semibold mb-1 flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-primary" />
        Feedback Survey
      </h2>
      <p className="text-sm text-muted-foreground mb-6">Please rate each statement (1 = Strongly Disagree, 5 = Strongly Agree)</p>

      {error && (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={dismissError}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 hover:bg-destructive/20 transition-colors leading-none"
          >
            &times;
          </button>
        </div>
      )}

      <div className="space-y-6">
        {questions.map(q => (
          <div key={q.key}>
            <p className="text-sm font-medium mb-3">{q.text}</p>
            <LikertScale
              value={ratings[q.key]}
              onChange={(v) => setRatings(prev => ({ ...prev, [q.key]: v }))}
            />
          </div>
        ))}
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!allAnswered || submitting}
        className="w-full mt-8 rounded-xl"
        size="lg"
      >
        {submitting ? (
          <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
        ) : (
          'Submit Feedback'
        )}
      </Button>
    </Card>
  );
}