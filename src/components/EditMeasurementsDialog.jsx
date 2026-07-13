// @ts-nocheck
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '@/api/apiClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/components/ui/use-toast';
import { Camera } from 'lucide-react';

const styleOptions = [
  { value: 'slim_fit', label: 'Slim Fit', desc: 'Tailored, close to body' },
  { value: 'regular_fit', label: 'Regular Fit', desc: 'Classic, comfortable' },
  { value: 'oversized', label: 'Oversized', desc: 'Relaxed, roomy' },
  { value: 'relaxed_streetwear', label: 'Relaxed Streetwear', desc: 'Casual, trendy' },
];

// Chest/waist/hip/shoulder are no longer hand-typed here - they come from the camera
// scan (src/pages/CameraScan.jsx -> POST /api/body-scan), which also regenerates the
// avatar automatically. This dialog only edits things that are legitimately manual
// (height/weight/style), and offers a direct path to redo the scan.
export default function EditMeasurementsDialog({ profile, open, onOpenChange, onSaved }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState({
    height_cm: profile.height_cm,
    weight_kg: profile.weight_kg,
    style_preference: profile.style_preference,
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // Just updates style preference - doesn't touch measurements or the avatar.
  const handleSaveStyle = async () => {
    setSaving(true);
    try {
      await apiClient.entities.UserProfile.update(profile.id, {
        style_preference: form.style_preference,
      });
      toast({ title: 'Style preference updated' });
      onOpenChange(false);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  // Height/weight changed -> re-scan is required, since the measurement math is
  // calibrated against height, and the avatar needs to be regenerated anyway.
  const handleRescan = async () => {
    setSaving(true);
    try {
      await apiClient.entities.UserProfile.update(profile.id, {
        height_cm: Number(form.height_cm),
        weight_kg: Number(form.weight_kg),
        style_preference: form.style_preference,
        profile_status: 'awaiting_scan',
      });
      onOpenChange(false);
      navigate('/scan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Your Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="height_cm">Height (cm)</Label>
              <Input
                id="height_cm"
                type="number"
                value={form.height_cm}
                onChange={(e) => handleChange('height_cm', e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="weight_kg">Weight (kg)</Label>
              <Input
                id="weight_kg"
                type="number"
                value={form.weight_kg}
                onChange={(e) => handleChange('weight_kg', e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-4">
            Chest/waist/hip/shoulder come from your camera scan, not manual entry. If you
            change height or weight, retake the scan below so your avatar stays accurate.
          </p>

          <div>
            <h3 className="font-semibold text-sm mb-3">Style Preference</h3>
            <RadioGroup
              value={form.style_preference}
              onValueChange={(v) => handleChange('style_preference', v)}
              className="grid grid-cols-2 gap-3"
            >
              {styleOptions.map((s) => (
                <Label
                  key={s.value}
                  htmlFor={`edit-${s.value}`}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    form.style_preference === s.value ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30'
                  }`}
                >
                  <RadioGroupItem value={s.value} id={`edit-${s.value}`} className="mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.desc}</div>
                  </div>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={handleSaveStyle} disabled={saving} variant="outline" className="w-full">
              Save Style Preference
            </Button>
            <Button onClick={handleRescan} disabled={saving} className="w-full gap-2">
              <Camera className="w-4 h-4" />
              Update Height/Weight & Retake Scan
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
