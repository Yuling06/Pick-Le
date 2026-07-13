// @ts-nocheck
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Upload, Image, ArrowLeft, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export default function ClothingUpload() {
    const navigate = useNavigate();
    const [submitting, setSubmitting] = useState(false);
    const [clothingFile, setClothingFile] = useState(null);
    const [clothingPreview, setClothingPreview] = useState(null);
    const [sizeChartFile, setSizeChartFile] = useState(null);
    const [sizeChartPreview, setSizeChartPreview] = useState(null);
    const [manualSizes, setManualSizes] = useState('');
    const [productInfo, setProductInfo] = useState('');

    const handleFileSelect = (file, setFile, setPreview) => {
        if (!file) return;
        setFile(file);
        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result);
        reader.readAsDataURL(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!clothingFile) return;
        setSubmitting(true);

        const user = await apiClient.auth.me();
        const { file_url: clothingUrl } = await apiClient.integrations.Core.UploadFile({ file: clothingFile });

        let sizeChartUrl = '';
        if (sizeChartFile) {
            const { file_url } = await apiClient.integrations.Core.UploadFile({ file: sizeChartFile });
            sizeChartUrl = file_url;
        }

        const request = await apiClient.entities.FitRequest.create({
            user_email: user.email,
            clothing_image_url: clothingUrl,
            size_chart_url: sizeChartUrl,
            manual_sizes: manualSizes,
            product_info: productInfo,
            status: 'pending'
        });

        navigate(`/loading/${request.id}`);
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
                        <p className="text-muted-foreground">Upload an image and we'll analyze the fit for your body.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-8">
                        {/* Clothing Image */}
                        <div>
                            <Label className="text-sm font-medium mb-2 block">Clothing Image *</Label>
                            <label
                                className="flex flex-col items-center justify-center w-full h-52 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/40 transition-colors bg-secondary/20 overflow-hidden"
                            >
                                {clothingPreview ? (
                                    <img src={clothingPreview} alt="Preview" className="w-full h-full object-contain" />
                                ) : (
                                    <div className="text-center">
                                        <Image className="w-10 h-10 text-muted-foreground/40 mx-auto mb-2" />
                                        <p className="text-sm text-muted-foreground">Click to upload clothing image</p>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleFileSelect(e.target.files[0], setClothingFile, setClothingPreview)}
                                />
                            </label>
                        </div>

                        {/* Size Chart */}
                        <div>
                            <Label className="text-sm font-medium mb-2 block">Size Chart (optional)</Label>
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

                        {/* Manual Sizes */}
                        <div>
                            <Label htmlFor="manualSizes" className="text-sm font-medium mb-2 block">Manual Size Input (optional)</Label>
                            <Input
                                id="manualSizes"
                                placeholder="e.g. S: 90cm chest, M: 96cm chest..."
                                value={manualSizes}
                                onChange={(e) => setManualSizes(e.target.value)}
                                className="h-11"
                            />
                        </div>

                        {/* Product Info */}
                        <div>
                            <Label htmlFor="productInfo" className="text-sm font-medium mb-2 block">Product Info (optional)</Label>
                            <Textarea
                                id="productInfo"
                                placeholder="Brand name, product URL, or any additional details..."
                                value={productInfo}
                                onChange={(e) => setProductInfo(e.target.value)}
                                className="min-h-[80px]"
                            />
                        </div>

                        <Button
                            type="submit"
                            size="lg"
                            disabled={!clothingFile || submitting}
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