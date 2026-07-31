// @ts-nocheck
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sparkles, Upload, Image, ArrowLeft, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/ui/use-toast';

export default function ClothingUpload() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [frontFile, setFrontFile] = useState(null);
    const [frontPreview, setFrontPreview] = useState(null);
    const [backFile, setBackFile] = useState(null);
    const [backPreview, setBackPreview] = useState(null);
    const [sizeChartFile, setSizeChartFile] = useState(null);
    const [sizeChartPreview, setSizeChartPreview] = useState(null);

    const allFilesSelected = frontFile && backFile && sizeChartFile;

    const handleFileSelect = (file, setFile, setPreview) => {
        if (!file) return;
        setFile(file);
        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result);
        reader.readAsDataURL(file);
    };

    const dismissError = () => setError(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!allFilesSelected) return;
        setSubmitting(true);
        setError(null);

        try {
            const user = await apiClient.auth.me();

            const [{ file_url: frontUrl }, { file_url: backUrl }, { file_url: sizeChartUrl }] = await Promise.all([
                apiClient.integrations.Core.UploadFile({ file: frontFile }),
                apiClient.integrations.Core.UploadFile({ file: backFile }),
                apiClient.integrations.Core.UploadFile({ file: sizeChartFile }),
            ]);

            const request = await apiClient.entities.FitRequest.create({
                user_email: user.email,
                clothing_image_url: frontUrl,
                back_image_url: backUrl,
                size_chart_url: sizeChartUrl,
                status: 'pending'
            });

            navigate(`/loading/${request.id}`);
        } catch (err) {
            const message = err.message || 'Something went wrong uploading your item. Please try again.';
            setError(message);
            toast({ title: 'Upload failed', description: message, variant: 'destructive' });
            setSubmitting(false);
        }
    };

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
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                </Link>
            </nav>

            <div className="max-w-2xl mx-auto px-6 py-12">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <div className="text-center mb-10">
                        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                            <Upload className="w-7 h-7 text-primary" />
                        </div>
                        <h1 className="font-display text-3xl font-bold mb-2">Upload Clothing Item</h1>
                        <p className="text-muted-foreground">Upload photos of the item and its size chart, and we'll analyze the fit for your body.</p>
                    </div>

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

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Front Photo */}
                        <div>
                            <Label className="text-sm font-medium mb-2 block">Front Photo *</Label>
                            <label
                                className="flex flex-col items-center justify-center w-full h-52 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/40 transition-colors bg-secondary/20 overflow-hidden"
                            >
                                {frontPreview ? (
                                    <img src={frontPreview} alt="Front preview" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="text-center">
                                        <Image className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">Click to upload the front of the item</p>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleFileSelect(e.target.files[0], setFrontFile, setFrontPreview)}
                                />
                            </label>
                        </div>

                        {/* Back Photo */}
                        <div>
                            <Label className="text-sm font-medium mb-2 block">Back Photo *</Label>
                            <label
                                className="flex flex-col items-center justify-center w-full h-52 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/40 transition-colors bg-secondary/20 overflow-hidden"
                            >
                                {backPreview ? (
                                    <img src={backPreview} alt="Back preview" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="text-center">
                                        <Image className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">Click to upload the back of the item</p>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleFileSelect(e.target.files[0], setBackFile, setBackPreview)}
                                />
                            </label>
                        </div>

                        {/* Size Chart */}
                        <div>
                            <Label className="text-sm font-medium mb-2 block">Size Chart *</Label>
                            <label
                                className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/40 transition-colors bg-secondary/20 overflow-hidden"
                            >
                                {sizeChartPreview ? (
                                    <img src={sizeChartPreview} alt="Size chart" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="text-center">
                                        <Image className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">Upload size chart image</p>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleFileSelect(e.target.files[0], setSizeChartFile, setSizeChartPreview)}
                                />
                            </label>
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            disabled={!allFilesSelected || submitting}
                            className="w-full py-6 text-base rounded-xl shadow-lg shadow-primary/20"
                        >
                            {submitting ? (
                                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                            ) : (
                                <>
                                    Analyze Fit
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
