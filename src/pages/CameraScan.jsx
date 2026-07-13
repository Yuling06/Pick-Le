// @ts-nocheck
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Sparkles, Camera, RotateCcw, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { extractSkeletalGeometry, extractFrontSilhouette, extractSideSilhouette, detectLandmarks } from '@/lib/poseUtils';

// Both front AND side photos are required now - the side photo is what enables real
// ellipse-based chest/waist/hip circumference (instead of a rougher anthropometric
// estimate), and accuracy matters enough here that it's no longer optional.
const STEPS = ['front', 'side', 'processing'];

export default function CameraScan() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [step, setStep] = useState('front'); // 'front' | 'side' | 'processing'
  const [frontShot, setFrontShot] = useState(null); // { dataUrl, width, height }
  const [sideShot, setSideShot] = useState(null);
  const [error, setError] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    loadProfile();
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfile = async () => {
    const user = await apiClient.auth.me();
    const profiles = await apiClient.entities.UserProfile.filter({ user_email: user.email });
    if (profiles.length === 0 || !profiles[0].height_cm) {
      navigate('/setup');
      return;
    }
    setProfile(profiles[0]);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setError('Could not access your camera. Please allow camera permission and reload.');
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height };
  }, []);

  const handleCaptureFront = () => {
    const shot = capture();
    if (!shot) return;
    setFrontShot(shot);
    setStep('side');
  };

  const handleCaptureSide = () => {
    const shot = capture();
    if (!shot) return;
    setSideShot(shot);
    stopCamera();
    setStep('processing');
  };

  const handleRetakeFront = () => {
    setFrontShot(null);
    setSideShot(null);
    setStep('front');
    startCamera();
  };

  const dismissError = () => setError(null);

  // Once we have both photos, run MediaPipe and submit.
  useEffect(() => {
    if (step !== 'processing' || !frontShot || !sideShot || !profile) return;

    let cancelled = false;
    (async () => {
      try {
        const frontImg = await loadImage(frontShot.dataUrl);
        const frontLandmarks = await detectLandmarks(frontImg);
        const geometry = await extractSkeletalGeometry(frontImg, frontShot.width, frontShot.height);
        const frontSilhouette = await extractFrontSilhouette(frontImg, frontShot.width, frontShot.height, frontLandmarks);

        const sideImg = await loadImage(sideShot.dataUrl);
        const sideLandmarks = await detectLandmarks(sideImg);
        const sideSilhouette = await extractSideSilhouette(sideImg, sideShot.width, sideShot.height, sideLandmarks);

        if (cancelled) return;

        await apiClient.bodyScan.submit({
          height_cm: Number(profile.height_cm),
          weight_kg: Number(profile.weight_kg),
          geometry,
          frontSilhouette,
          sideSilhouette,
        });

        navigate('/loading/profile');
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Something went wrong analyzing your photos.');
        toast({ title: 'Scan failed', description: err.message, variant: 'destructive' });
        setStep('front');
        setFrontShot(null);
        setSideShot(null);
        startCamera();
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, frontShot, sideShot, profile]);

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="flex items-center gap-2 px-6 md:px-12 py-5 border-b border-border/50">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-display text-xl font-semibold tracking-tight">Pick-le</span>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-md text-center mb-6">
          <h1 className="font-display text-2xl font-bold mb-2">Body Scan</h1>
          <p className="text-muted-foreground text-sm">
            {step === 'front' && 'Stand facing the camera, full body in frame, arms relaxed at your sides.'}
            {step === 'side' && 'Now turn to your side - this photo is required for accurate chest/waist/hip measurements.'}
            {step === 'processing' && 'Analyzing your photos and generating your avatar...'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 w-10 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-border'}`}
              />
            ))}
          </div>
        </div>

        {error && step !== 'processing' && (
          <div className="w-full max-w-md mb-4 flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span className="text-center flex-1">{error}</span>
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

        <div className="relative w-full max-w-md aspect-[3/4] bg-black rounded-2xl overflow-hidden border border-border">
          {step !== 'processing' ? (
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
          )}
          {step !== 'processing' && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-30">
              <div className="w-2/3 h-[90%] border-2 border-dashed border-white rounded-[40%]" />
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />

        {step === 'front' && (
          <div className="flex items-center gap-3 mt-6">
            <Button onClick={handleCaptureFront} size="lg" className="rounded-full px-8">
              <Camera className="w-4 h-4 mr-2" />
              Capture Front Photo
            </Button>
          </div>
        )}

        {step === 'side' && (
          <div className="flex items-center gap-3 mt-6">
            <Button variant="outline" onClick={handleRetakeFront}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Retake Front
            </Button>
            <Button onClick={handleCaptureSide} size="lg" className="rounded-full px-8">
              <Camera className="w-4 h-4 mr-2" />
              Capture Side Photo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
