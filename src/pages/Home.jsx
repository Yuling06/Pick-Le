// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, resolveFileUrl } from '@/api/apiClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Upload, Ruler, User, ArrowRight, Clock, Pencil, LayoutDashboard } from 'lucide-react';
import { motion } from 'framer-motion';
import EditMeasurementsDialog from '@/components/EditMeasurementsDialog';
import AvatarViewer from '@/components/AvatarViewer';

const styleLabels = {
    slim_fit: 'Slim Fit',
    regular_fit: 'Regular Fit',
    oversized: 'Oversized',
    relaxed_streetwear: 'Relaxed Streetwear',
};

export default function Home() {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const [profile, setProfile] = useState(null);
    const [gender, setGender] = useState(null);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editOpen, setEditOpen] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        const user = await apiClient.auth.me();
        setGender(user.gender || null);
        const profiles = await apiClient.entities.UserProfile.filter({ user_email: user.email });
        if (profiles.length === 0) {
            navigate('/setup');
            return;
        }
        if (profiles[0].profile_status === 'pending') {
            navigate('/loading/profile');
            return;
        }
        setProfile(profiles[0]);
        const reqs = await apiClient.entities.FitRequest.filter({ user_email: user.email }, '-created_date');
        setRequests(reqs);
        setLoading(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-border/50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-primary-foreground" />
                    </div>
                    <span className="font-display text-xl font-semibold tracking-tight">Pick-le</span>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { logout(); navigate('/'); }}>Sign Out</Button>
                </div>
            </nav>

            <div className="max-w-5xl mx-auto px-6 py-10">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    {/* Avatar + Profile Section */}
                    <div className="flex flex-col md:flex-row gap-8 mb-12">
                        {/* Avatar */}
                        <Card className="w-full md:w-1/2 p-8 flex flex-col items-center text-center">
                            <div className="w-full max-w-md h-[500px] rounded-2xl bg-secondary/50 overflow-hidden">
                                {profile.avatar_url && profile.avatar_type === 'glb' ? (
                                    <AvatarViewer url={resolveFileUrl(profile.avatar_url)} className="w-full h-full" />
                                ) : profile.avatar_url ? (
                                    <img src={resolveFileUrl(profile.avatar_url)} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <User className="w-16 h-16 text-muted-foreground/40" />
                                )}
                            </div>
                            {profile.avatar_url && profile.avatar_type === 'glb' && (
                                <p className="text-xs text-muted-foreground/70 mb-2">Drag to rotate · scroll to zoom</p>
                            )}
                            {profile.body_type_label && (
                                <Badge variant="secondary" className="mb-2 text-sm">{profile.body_type_label}</Badge>
                            )}
                        </Card>

                        {/* Profile Summary */}
                        <div className="flex-1 md:w-1/2">
                            <div className="flex items-center justify-between mb-2">
                                <h1 className="font-display text-3xl font-bold">Your Fit Profile</h1>
                                <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="gap-2">
                                    <Pencil className="w-3.5 h-3.5" /> Edit
                                </Button>
                            </div>
                            <p className="text-muted-foreground mb-6">Your personalized measurements and style preferences.</p>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                                {[
                                    { label: 'Height', val: profile.height_cm ? `${profile.height_cm}cm` : '—' },
                                    { label: 'Weight', val: profile.weight_kg ? `${profile.weight_kg}kg` : '—' },
                                    { label: 'Chest', val: profile.chest_cm ? `${profile.chest_cm}cm` : '—' },
                                    { label: 'Waist', val: profile.waist_cm ? `${profile.waist_cm}cm` : '—' },
                                    { label: 'Hip', val: profile.hip_cm ? `${profile.hip_cm}cm` : '—' },
                                    { label: 'Shoulder', val: profile.shoulder_cm ? `${profile.shoulder_cm}cm` : '—' },
                                    { label: 'Gender', val: gender ? gender.charAt(0).toUpperCase() + gender.slice(1) : '—' },
                                    { label: 'Style', val: styleLabels[profile.style_preference] || profile.style_preference || '—' },
                                ].map(m => (
                                    <div key={m.label} className="p-3 rounded-xl bg-secondary/50 text-center">
                                        <p className="text-xs text-muted-foreground mb-1">{m.label}</p>
                                        <p className="font-semibold text-sm">{m.val}</p>
                                    </div>
                                ))}
                            </div>

                            <Link to="/upload">
                                <Button size="lg" className="rounded-xl shadow-lg shadow-primary/20 px-8">
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Clothing Item
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </Button>
                            </Link>
                        </div>
                    </div>

                    {/* Past Requests */}
                    {requests.length > 0 && (
                        <div>
                            <h2 className="font-display text-xl font-semibold mb-4">Your Requests</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {requests.map(req => (
                                    <Card
                                        key={req.id}
                                        className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                                        onClick={() => {
                                            if (req.status === 'completed') navigate(`/result/${req.id}`);
                                            else navigate(`/loading/${req.id}`);
                                        }}
                                    >
                                        <div className="aspect-[4/3] rounded-lg bg-secondary/50 overflow-hidden mb-3">
                                            {req.clothing_image_url && (
                                                <img src={resolveFileUrl(req.clothing_image_url)} alt="Clothing" className="w-full h-full object-cover" />
                                            )}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-muted-foreground truncate">{req.product_info || 'Clothing item'}</p>
                                            <Badge variant={req.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                                                {req.status === 'completed' ? 'Ready' : (
                                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>
                                                )}
                                            </Badge>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>

            {profile && (
                <EditMeasurementsDialog
                    profile={profile}
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    onSaved={loadData}
                />
            )}
        </div>
    );
}