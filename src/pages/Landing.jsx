// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles, Eye, Ruler, ShieldCheck, LayoutDashboard } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiClient } from '@/api/apiClient';

const features = [
    { icon: Ruler, title: 'Body Analysis', desc: 'AI-powered body measurement analysis for precision sizing' },
    { icon: Eye, title: 'Fit Visualization', desc: 'See exactly how clothes look on your body type' },
    { icon: Sparkles, title: 'Smart Sizing', desc: 'Get personalized size recommendations with confidence scores' },
    { icon: ShieldCheck, title: 'Style Matching', desc: 'Recommendations tuned to your style preferences' }];


export default function Landing() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-background">
            {/* Nav */}
            <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-border/50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[hsl(var(--chart-5))]">
                        <Sparkles className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <span className="font-display text-xl font-semibold tracking-tight">Pick-le</span>
                </div>
                <div className="flex items-center gap-2">
                    <Link to="/setup">
                        <Button variant="outline" size="sm">Sign In</Button>
                    </Link>
                </div>
            </nav>

            {/* Hero */}
            <section className="relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
                <div className="relative max-w-6xl mx-auto px-6 md:px-12 pt-20 pb-24 md:pt-32 md:pb-36">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7 }}
                        className="text-center max-w-3xl mx-auto">

                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-sm font-medium mb-8 text-[hsl(var(--chart-5))]">
                            <Sparkles className="w-3.5 h-3.5" />
                            AI-Powered Fit Technology
                        </div>
                        <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
                            See how clothes fit
                            <span className="text-[hsl(var(--chart-5))]"> before</span> you buy
                        </h1>
                        <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
                            Upload any clothing item and get instant fit predictions, size recommendations, and visual previews tailored to your body.
                        </p>
                        <Link to="/setup">
                            <Button size="lg" className="text-base px-8 py-6 rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all bg-[hsl(var(--chart-5))]">
                                Get Started
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </Link>
                    </motion.div>
                </div>
            </section>

            {/* Features */}
            <section className="max-w-6xl mx-auto px-6 md:px-12 pb-24">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {features.map((f, i) =>
                        <motion.div
                            key={f.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2 + i * 0.1 }}
                            className="p-6 rounded-2xl border border-border/60 bg-card hover:shadow-lg hover:border-primary/20 transition-all group">

                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                                <f.icon className="w-5 h-5 text-[hsl(var(--chart-5))]" />
                            </div>
                            <h3 className="font-semibold text-base mb-1.5">{f.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                        </motion.div>
                    )}
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-border/50 py-8 text-center text-sm text-muted-foreground">
                © 2026 Pick-le. All rights reserved.
            </footer>
        </div>);

}