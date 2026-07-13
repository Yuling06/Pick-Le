// @ts-nocheck
import React, { useState } from 'react';
import { apiClient } from '@/api/apiClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardCheck } from 'lucide-react';

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
  const [ratings, setRatings] = useState({
    confidence_rating: 0,
    sizing_match_rating: 0,
    visualization_rating: 0,
    would_use_rating: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  const allAnswered = Object.values(ratings).every(v => v > 0);

  const handleSubmit = async () => {
    if (!allAnswered) return;
    setSubmitting(true);
    const user = await apiClient.auth.me();
    await apiClient.entities.FeedbackSurvey.create({
      request_id: requestId,
      user_email: user.email,
      ...ratings,
    });
    onComplete();
  };

  return (
    <Card className="p-6">
      <h2 className="font-semibold mb-1 flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-primary" />
        Feedback Survey
      </h2>
      <p className="text-sm text-muted-foreground mb-6">Please rate each statement (1 = Strongly Disagree, 5 = Strongly Agree)</p>

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