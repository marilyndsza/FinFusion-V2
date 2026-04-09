import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Upload, Loader2, CheckCircle, FileText, RotateCcw } from 'lucide-react';
import axios from 'axios';
import { getAuthToken } from '@/lib/auth';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000';
const API = `${BACKEND_URL}/api`;

const CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Entertainment',
  'Healthcare', 'Utilities', 'Travel', 'Education', 'Rent', 'Other'
];

export default function ReceiptScanModal({ open, onClose, onExpenseCreated }) {
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [scanMeta, setScanMeta] = useState(null);
  const [formData, setFormData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'Food',
    description: ''
  });

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setScanning(true);

    try {
      // Upload to OCR endpoint
      const formDataObj = new FormData();
      formDataObj.append('file', file);

      const response = await axios.post(`${API}/expenses/scan-receipt`, formDataObj, {
        headers: {
          'Authorization': `Bearer ${getAuthToken()}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        const extracted = response.data.extracted;
        setExtractedData(extracted);
        setScanMeta({
          confidence: response.data.confidence,
          rawTextPreview: response.data.raw_text_preview || '',
          merchant: extracted.merchant || '',
        });
        setFormData({
          amount: extracted.amount?.toString() || '',
          date: extracted.date || new Date().toISOString().split('T')[0],
          category: extracted.category || 'Other',
          description: extracted.description || extracted.merchant || ''
        });
        toast.success('Receipt scanned successfully!');
      } else {
        toast.error(response.data.error || 'Could not extract data. Please enter manually.');
        openManualEntry();
      }
    } catch (error) {
      console.error('Scan error:', error);
      toast.error('Failed to scan receipt. Please enter manually.');
      openManualEntry();
    } finally {
      setScanning(false);
    }
  }

  function openManualEntry() {
    setExtractedData({ manual: true });
    setScanMeta(null);
    setFormData({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      category: 'Food',
      description: ''
    });
  }

  async function handleConfirm() {
    // Validate
    if (!formData.amount || !formData.date || !formData.category || !formData.description) {
      toast.error('Please fill all fields');
      return;
    }

    if (isNaN(parseFloat(formData.amount)) || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(
        `${API}/expenses`,
        {
          amount: parseFloat(formData.amount),
          date: formData.date,
          category: formData.category,
          description: formData.description
        },
        {
          headers: {
            'Authorization': `Bearer ${getAuthToken()}`,
            'Content-Type': 'application/json'
          }
        }
      );

      toast.success('Expense added successfully!');
      
      // Reset and close
      setExtractedData(null);
      setFormData({
        amount: '',
        date: new Date().toISOString().split('T')[0],
        category: 'Food',
        description: ''
      });
      
      if (onExpenseCreated) {
        onExpenseCreated();
      }
      
      onClose();
    } catch (error) {
      console.error('Create expense error:', error);
      toast.error(error.response?.data?.detail || 'Failed to create expense');
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setExtractedData(null);
    setScanMeta(null);
    setFormData({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      category: 'Food',
      description: ''
    });
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan Receipt</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload */}
          {!extractedData && !scanning && (
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="w-12 h-12 mx-auto text-gray-400 mb-3" />
              <p className="text-sm text-gray-600 mb-3">
                Upload a receipt image to extract data
              </p>
              <label htmlFor="receipt-upload" className="cursor-pointer">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors">
                  <Upload className="w-4 h-4" />
                  Choose Image
                </div>
                <input
                  id="receipt-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </label>
            </div>
          )}

          {/* Scanning State */}
          {scanning && (
            <div className="text-center py-8">
              <Loader2 className="w-12 h-12 mx-auto text-indigo-600 animate-spin mb-3" />
              <p className="text-sm text-gray-600">Scanning receipt...</p>
            </div>
          )}

          {/* Extracted Data - Editable Form */}
          {extractedData && !scanning && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-md">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">
                  {extractedData.manual ? 'Enter expense details manually' : 'OCR extracted the receipt details. Review before saving.'}
                </span>
              </div>

              {!extractedData.manual && scanMeta && (
                <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium">OCR confidence</span>
                    <span>{Math.round((scanMeta.confidence || 0) * 100)}%</span>
                  </div>
                  {scanMeta.merchant && (
                    <div className="text-xs text-slate-600">
                      <span className="font-medium text-slate-700">Merchant:</span> {scanMeta.merchant}
                    </div>
                  )}
                  {scanMeta.rawTextPreview && (
                    <div className="rounded bg-white border p-2">
                      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500 mb-1">
                        <FileText className="w-3 h-3" />
                        OCR preview
                      </div>
                      <pre className="text-[10px] leading-4 text-slate-500 whitespace-pre-wrap max-h-28 overflow-y-auto">
                        {scanMeta.rawTextPreview}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="category">Category *</Label>
                <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="description">Description *</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="What was this for?"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleConfirm}
                  disabled={loading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Add'}
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  disabled={loading}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>

              {!extractedData.manual && (
                <Button
                  onClick={() => {
                    setExtractedData(null);
                    setScanMeta(null);
                  }}
                  variant="ghost"
                  disabled={loading}
                  className="w-full text-slate-600"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Scan another receipt
                </Button>
              )}
            </div>
          )}

          {/* Manual Entry Option */}
          {!extractedData && !scanning && (
            <div className="text-center pt-2">
              <button
                onClick={openManualEntry}
                className="text-sm text-indigo-600 hover:underline"
              >
                Or enter manually
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
