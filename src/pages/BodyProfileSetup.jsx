// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sparkles, Ruler, ArrowRight, LogOut } from 'lucide-react';
import { motion } from 'framer-motion';
import { useToast } from '@/components/ui/use-toast';

const styleOptions = [
    { value: 'slim_fit', label: 'Slim Fit', desc: 'Tailored, close to body' },
    { value: 'regular_fit', label: 'Regular Fit', desc: 'Classic, comfortable' },
    { value: 'oversized', label: 'Oversized', desc: 'Relaxed, roomy' },
    { value: 'relaxed_streetwear', label: 'Relaxed Streetwear', desc: 'Casual, trendy' },
];

export default function BodyProfileSetup() {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        height_cm: '', weight_kg: '',
        style_preference: 'regular_fit'
    });

    useEffect(() => {
        checkExistingProfile();
    }, []);

    const checkExistingProfile = async () => {
        try {
            const user = await apiClient.auth.me();

            const profiles =
                await apiClient.entities.UserProfile.filter({
                    user_email: user.email
                });

            if (profiles.length > 0) {
                const latestProfile =
                    profiles.sort(
                        (a, b) =>
                            new Date(b.created_date) -
                            new Date(a.created_date)
                    )[0];

                switch (latestProfile.profile_status) {
                    case 'awaiting_scan':
                        navigate('/scan', { replace: true });
                        return;

                    case 'pending':
                    case 'processing':
                        navigate('/loading/profile', {
                            replace: true
                        });
                        return;

                    case 'completed':
                        navigate('/home', {
                            replace: true
                        });
                        return;

                    case 'failed':
                        break;

                    default:
                        break;
                }
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);

        try {
            const user =
                await apiClient.auth.me();

            const profiles =
                await apiClient.entities.UserProfile.filter({
                    user_email: user.email
                });

            const latestProfile =
                profiles.sort(
                    (a, b) =>
                        new Date(b.created_date) -
                        new Date(a.created_date)
                )[0];

            if (latestProfile) {
                await apiClient.entities.UserProfile.update(
                    latestProfile.id,
                    {
                        height_cm: Number(form.height_cm),
                        weight_kg: Number(form.weight_kg),
                        style_preference:
                            form.style_preference,
                        profile_status:
                            'awaiting_scan'
                    }
                );
            } else {
                await apiClient.entities.UserProfile.create({
                    user_email: user.email,
                    height_cm:
                        Number(form.height_cm),
                    weight_kg:
                        Number(form.weight_kg),
                    style_preference:
                        form.style_preference,
                    profile_status:
                        'awaiting_scan'
                });
            }

            navigate('/scan');
        } catch (err) {
            console.error(err);

            toast({
                title: 'Error',
                description:
                    'Failed to create profile.',
                variant: 'destructive'
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    const measurements = [
        { key: 'height_cm', label: 'Height (cm)', placeholder: '175' },
        { key: 'weight_kg', label: 'Weight (kg)', placeholder: '70' },
    ];

    return (
        <div className="min-h-screen bg-background">
            <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-border/50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <span className="font-display text-xl font-semibold tracking-tight">Pick-le</span>
                </div>
                <button onClick={() => { logout(); navigate('/'); }} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                </button>
            </nav>

            <div className="max-w-2xl mx-auto px-6 py-12">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <div className="text-center mb-10">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <Ruler className="w-7 h-7 text-primary" />
                        </div>
                        <h1 className="font-display text-3xl font-bold mb-2">Create Your Fit Profile</h1>
                        <p className="text-muted-foreground">Enter your height and weight, then we'll scan your body with your camera to build your personalized 3D avatar.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-8">
                        <div>
                            <h2 className="font-semibold text-lg mb-4">Body Measurements</h2>
                            <div className="grid grid-cols-2 gap-4 mb-1">
                                {measurements.map(m => (
                                    <div key={m.key} className="space-y-1.5">
                                        <Label htmlFor={m.key} className="text-sm">{m.label}</Label>
                                        <Input
                                            id={m.key}
                                            type="number"
                                            placeholder={m.placeholder}
                                            value={form[m.key]}
                                            onChange={(e) => handleChange(m.key, e.target.value)}
                                            required
                                            className="h-11"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h2 className="font-semibold text-lg mb-4">Style Preference</h2>
                            <RadioGroup
                                value={form.style_preference}
                                onValueChange={(v) => handleChange('style_preference', v)}
                                className="grid grid-cols-2 gap-3"
                            >
                                {styleOptions.map(s => (
                                    <Label
                                        key={s.value}
                                        htmlFor={s.value}
                                        className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${form.style_preference === s.value
                                            ? 'border-primary bg-primary/5 shadow-sm'
                                            : 'border-border hover:border-primary/30'
                                            }`}
                                    >
                                        <RadioGroupItem value={s.value} id={s.value} className="mt-0.5" />
                                        <div>
                                            <div className="font-medium text-sm">{s.label}</div>
                                            <div className="text-xs text-muted-foreground">{s.desc}</div>
                                        </div>
                                    </Label>
                                ))}
                            </RadioGroup>
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            disabled={submitting}
                            className="w-full py-6 text-base rounded-xl shadow-lg shadow-primary/20"
                        >
                            {submitting ? (
                                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                            ) : (
                                <>
                                    Continue to Body Scan
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </>
                            )}
                        </Button>
                    </form>
                </motion.div>
            </div>
        </div>
    );
}