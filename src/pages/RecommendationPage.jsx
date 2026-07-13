// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiClient, resolveFileUrl } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowLeft, Check, TrendingUp, Shirt, MessageSquare } from 'lucide-react';
import { motion } from 'framer-motion';
import FeedbackSurveyForm from '@/components/FeedbackSurveyForm';

export default function RecommendationPage() {
    const { requestId } = useParams();
    const navigate = useNavigate();
    const [result, setResult] = useState(null);
    const [request, setRequest] = useState(null);
    const [loading, setLoading] = useState(true);
    const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

    useEffect(() => {
        loadResult();
    }, [requestId]);

    const loadResult = async () => {
        const user = await apiClient.auth.me();
        const results = await apiClient.entities.FitResult.filter({ request_id: requestId });
        if (results.length === 0) {
            navigate(`/loading/${requestId}`);
            return;
        }
        setResult(results[0]);

        const requests = await apiClient.entities.FitRequest.filter({ user_email: user.email });
        const req = requests.find(r => r.id === requestId);
        setRequest(req);

        // Check if feedback already submitted
        const feedbacks = await apiClient.entities.FeedbackSurvey.filter({ request_id: requestId, user_email: user.email });
        if (feedbacks.length > 0) setFeedbackSubmitted(true);

        setLoading(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    const fitNotes = [
        { label: 'Chest Fit', value: result.chest_fit_note },
        { label: 'Waist Fit', value: result.waist_fit_note },
        { label: 'Shoulder Fit', value: result.shoulder_fit_note },
    ].filter(n => n.value);

    return (
        <div className="min-h-screen bg-background">
            <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-border/50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <span className="font-display text-xl font-semibold tracking-tight">Pick-le</span>
                </div>
                <Link to="/home">
                    <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Home</Button>
                </Link>
            </nav>

            <div className="max-w-3xl mx-auto px-6 py-10">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-8">
                    {/* Header */}
                    <div className="text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-green-100 text-green-700 text-sm font-medium mb-4">
                            <Check className="w-3.5 h-3.5" />
                            Analysis Complete
                        </div>
                        <h1 className="font-display text-3xl font-bold">Your Fit Recommendation</h1>
                    </div>

                    {/* Size Recommendation */}
                    <Card className="p-8 text-center">
                        <div className="flex items-center justify-center gap-3 mb-3">
                            <Shirt className="w-6 h-6 text-primary" />
                            <span className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Recommended Size</span>
                        </div>
                        <div className="text-6xl font-display font-bold text-primary mb-3">{result.recommended_size}</div>
                        <div className="flex items-center justify-center gap-2">
                            <TrendingUp className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-green-600">{result.confidence_score}% Confidence</span>
                        </div>
                        {/* Confidence bar */}
                        <div className="mt-4 max-w-xs mx-auto">
                            <div className="h-2 rounded-full bg-secondary overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${result.confidence_score}%` }}
                                    transition={{ duration: 1, delay: 0.5 }}
                                    className="h-full rounded-full bg-green-500"
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Visualization */}
                    {result.visualization_image_url && (
                        <Card className="overflow-hidden">
                            <div className="p-4 border-b border-border">
                                <h2 className="font-semibold flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-primary" />
                                    Fit Visualization
                                </h2>
                            </div>
                            <div className="aspect-[3/4] bg-secondary/30">
                                <img
                                    src={resolveFileUrl(result.visualization_image_url)}
                                    alt="Fit visualization"
                                    className="w-full h-full object-contain"
                                />
                            </div>
                        </Card>
                    )}

                    {/* Fit Notes */}
                    {fitNotes.length > 0 && (
                        <Card className="p-6">
                            <h2 className="font-semibold mb-4 flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-primary" />
                                Fit Analysis
                            </h2>
                            <div className="space-y-3">
                                {fitNotes.map(note => (
                                    <div key={note.label} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
                                        <div className="w-1 h-full min-h-[24px] rounded-full bg-primary flex-shrink-0" />
                                        <div>
                                            <p className="text-sm font-medium">{note.label}</p>
                                            <p className="text-sm text-muted-foreground">{note.value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Style Suggestion */}
                    {result.style_suggestion && (
                        <Card className="p-6 bg-primary/5 border-primary/20">
                            <h2 className="font-semibold mb-2 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-primary" />
                                Style Suggestion
                            </h2>
                            <p className="text-muted-foreground leading-relaxed">{result.style_suggestion}</p>
                        </Card>
                    )}

                    {/* Feedback Survey */}
                    {!feedbackSubmitted ? (
                        <FeedbackSurveyForm requestId={requestId} onComplete={() => setFeedbackSubmitted(true)} />
                    ) : (
                        <Card className="p-6 text-center bg-green-50 border-green-200">
                            <Check className="w-6 h-6 text-green-600 mx-auto mb-2" />
                            <p className="font-medium text-green-700">Thank you for your feedback!</p>
                        </Card>
                    )}
                </motion.div>
            </div>
        </div>
    );
}