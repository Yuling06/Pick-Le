import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/apiClient';
import { Sparkles, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const profileSteps = [
  'Analyzing body proportions...',
  'Creating your fit profile...',
  'Generating avatar model...',
];

const fitSteps = [
  'Analyzing clothing fit...',
  'Matching size charts...',
  'Generating recommendation...',
];

export default function LoadingScreen() {
  const { type } = useParams();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [failed, setFailed] = useState(false);
  const steps = type === 'profile' ? profileSteps : fitSteps;

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep(prev => (prev + 1) % steps.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [steps.length]);

  useEffect(() => {
    const pollStatus = async () => {
      const user = await apiClient.auth.me();

      if (type === 'profile') {
        const profiles = await apiClient.entities.UserProfile.filter({ user_email: user.email });
        if (profiles.length > 0 && profiles[0].profile_status === 'completed') {
          navigate('/home');
          return;
        }
        if (profiles.length > 0 && profiles[0].profile_status === 'failed') {
          setFailed(true);
          return;
        }
      } else {
        // type is a request ID
        const requests = await apiClient.entities.FitRequest.filter({ user_email: user.email, status: 'completed' });
        const match = requests.find(r => r.id === type);
        if (match) {
          navigate(`/result/${type}`);
          return;
        }
      }
    };

    const interval = setInterval(() => {
      if (!failed) pollStatus();
    }, 4000);
    pollStatus();
    return () => clearInterval(interval);
  }, [type, navigate, failed]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="flex items-center gap-2 px-6 md:px-12 py-5 border-b border-border/50">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-display text-xl font-semibold tracking-tight">Pick-le</span>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6">
        {failed ? (
          <div className="text-center max-w-md">
            <p className="text-lg font-semibold mb-2">Avatar generation failed</p>
            <p className="text-muted-foreground mb-6">
              Something went wrong turning your scan into a 3D avatar. Your measurements were saved -
              you can retake the scan and try again.
            </p>
            <button
              onClick={() => navigate('/scan')}
              className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
            >
              Retake Body Scan
            </button>
          </div>
        ) : (
        <div className="text-center max-w-md">
          {/* Animated orb */}
          <div className="relative w-32 h-32 mx-auto mb-10">
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-0 rounded-full bg-primary/20"
            />
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.3 }}
              className="absolute inset-4 rounded-full bg-primary/30"
            />
            <div className="absolute inset-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          </div>

          {/* Status */}
          <div className="mb-6">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              {type === 'profile' ? 'Processing Profile' : 'Pending AI Analysis'}
            </span>
          </div>

          {/* Animated step text */}
          <div className="h-8 flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={currentStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                className="text-muted-foreground text-lg"
              >
                {steps[currentStep]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 mt-8">
            {steps.map((_, i) => (
              <motion.div
                key={i}
                animate={{ scale: i === currentStep ? 1.3 : 1, opacity: i === currentStep ? 1 : 0.3 }}
                className="w-2 h-2 rounded-full bg-primary"
              />
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-10">
            This may take a moment. Please don't close this page.
          </p>
        </div>
        )}
      </div>
    </div>
  );
}