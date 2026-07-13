import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Login() {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, signup } = useAuth();
    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [gender, setGender] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const redirectTo = location.state?.from || '/home';
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (mode === 'signup' && !gender) {
            setError('Please select a gender to continue');
            return;
        }
        setSubmitting(true);
        try {
            if (mode === 'login') {
                await login(email, password);
            } else {
                await signup(email, password, gender);
            }
            navigate(redirectTo, { replace: true });
        } catch (err) {
            setError(err.message || 'Something went wrong');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col">
            <nav className="flex items-center gap-2 px-6 md:px-12 py-5 border-b border-border/50">
                <Link to="/" className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <span className="font-display text-xl font-semibold tracking-tight">Pick-le</span>
                </Link>
            </nav>

            <div className="flex-1 flex items-center justify-center px-6 py-12">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="w-full max-w-sm"
                >
                    <div className="text-center mb-8">
                        <h1 className="font-display text-2xl font-bold mb-1">
                            {mode === 'login' ? 'Welcome back' : 'Create your account'}
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            {mode === 'login' ? 'Sign in to continue to Pick-le' : 'Get started with Pick-le'}
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="h-11"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={mode === 'signup' ? 8 : undefined}
                                className="h-11"
                            />
                        </div>

                        {mode === 'signup' && (
                            <div className="space-y-1.5">
                                <Label>Gender</Label>
                                <RadioGroup
                                    value={gender}
                                    onValueChange={setGender}
                                    className="grid grid-cols-2 gap-3"
                                >
                                    <Label
                                        htmlFor="gender-male"
                                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${gender === 'male' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30'}`}
                                    >
                                        <RadioGroupItem value="male" id="gender-male" />
                                        <span className="text-sm font-medium">Male</span>
                                    </Label>
                                    <Label
                                        htmlFor="gender-female"
                                        className={`flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${gender === 'female' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30'}`}
                                    >
                                        <RadioGroupItem value="female" id="gender-female" />
                                        <span className="text-sm font-medium">Female</span>
                                    </Label>
                                </RadioGroup>
                            </div>
                        )}

                        {error && (
                            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
                        )}

                        <Button type="submit" size="lg" disabled={submitting} className="w-full py-6 rounded-xl">
                            {submitting ? (
                                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                            ) : mode === 'login' ? 'Sign In' : 'Create Account'}
                        </Button>
                    </form>

                    <p className="text-center text-sm text-muted-foreground mt-6">
                        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                        <button
                            type="button"
                            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
                            className="text-primary font-medium hover:underline"
                        >
                            {mode === 'login' ? 'Sign up' : 'Sign in'}
                        </button>
                    </p>
                </motion.div>
            </div>
        </div>
    );
}
