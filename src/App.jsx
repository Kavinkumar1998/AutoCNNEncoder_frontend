import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Zap,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Image as ImageIcon,
  Sliders,
  Settings,
  Layers,
  ArrowRight,
  Split,
  Eye,
  Check,
  X,
  RotateCcw,
  Info,
  Activity,
  Cpu,
  ChevronRight,
  SlidersHorizontal,
  FileCheck,
} from 'lucide-react';

// Hosted and local backend constants
const RENDER_BACKEND_URL = 'https://cnnautoencoder-backend.onrender.com';
const LOCAL_BACKEND_URL = 'http://localhost:8000';

const getInitialApiUrl = () => {
  // 1. Explicit build-time or runtime environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  // 2. Saved user preference from localStorage
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('neuroclean_api_url');
      if (saved) {
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        // If user is accessing the hosted domain (e.g. Netlify) and had localhost saved, migrate them to cloud backend
        if (!isLocalHost && (saved.includes('localhost') || saved.includes('127.0.0.1'))) {
          return RENDER_BACKEND_URL;
        }
        return saved;
      }
    } catch {
      // Ignore localStorage access restrictions
    }
  }
  // 3. Default to the cloud backend hosted on Render
  return RENDER_BACKEND_URL;
};

export default function App() {
  // Configuration State
  const [apiUrl, setApiUrl] = useState(getInitialApiUrl);
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showArchitectureModal, setShowArchitectureModal] = useState(false);
  const [backendStatus, setBackendStatus] = useState('checking'); // 'online' | 'offline' | 'checking'
  const [modelMeta, setModelMeta] = useState(null);

  // Operation Mode: true = Denoise Image, false = Add Gaussian Noise
  const [shouldDenoise, setShouldDenoise] = useState(true);
  const [noiseFactor, setNoiseFactor] = useState(0.2); // Adjustable noise variance

  // File & Image States
  const [selectedFile, setSelectedFile] = useState(null);
  const [inputPreviewUrl, setInputPreviewUrl] = useState(null);
  const [inputMetadata, setInputMetadata] = useState(null);

  // Processed Output States
  const [outputBlobUrl, setOutputBlobUrl] = useState(null);
  const [outputMetadata, setOutputMetadata] = useState(null);
  const [diffBlobUrl, setDiffBlobUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTimeMs, setProcessingTimeMs] = useState(null);

  // UI / Comparison States
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [viewMode, setViewMode] = useState('slider'); // 'slider' | 'side-by-side' | 'difference'
  const [sliderPosition, setSliderPosition] = useState(50);
  const [pixelRendering, setPixelRendering] = useState('smooth'); // 'smooth' | 'pixelated'

  const fileInputRef = useRef(null);
  const comparisonContainerRef = useRef(null);
  const isPointerDownRef = useRef(false);

  // Show auto-dismissing toast notifications
  const triggerToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((current) => (current === msg ? null : current));
    }, 3500);
  };

  // Helper to update and persist API URL
  const handleUpdateApiUrl = (newUrl, shouldTest = true) => {
    setApiUrl(newUrl);
    try {
      localStorage.setItem('neuroclean_api_url', newUrl);
    } catch {
      // Ignore
    }
    if (shouldTest) {
      checkHealth(newUrl);
    }
  };

  // Check Backend Health and fetch model info
  const checkHealth = useCallback(async (urlToCheck) => {
    setBackendStatus('checking');
    const targetUrl = urlToCheck || RENDER_BACKEND_URL;
    const isRender = targetUrl.includes('onrender.com');
    setIsWakingUp(false);

    // If on Render, trigger waking up status after 2.5 seconds
    const wakeTimer = setTimeout(() => {
      if (isRender) {
        setIsWakingUp(true);
      }
    }, 2500);

    const controller = new AbortController();
    const abortTimer = setTimeout(() => {
      controller.abort();
    }, 75000); // 75s cold start allowance

    try {
      const cleanUrl = targetUrl.replace(/\/$/, '');
      const response = await fetch(`${cleanUrl}/`, { 
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(wakeTimer);
      clearTimeout(abortTimer);
      setIsWakingUp(false);

      if (response.ok) {
        setBackendStatus('online');
        // Fetch model architecture info
        try {
          const infoRes = await fetch(`${cleanUrl}/model-info`);
          if (infoRes.ok) {
            const infoData = await infoRes.json();
            setModelMeta(infoData);
          }
        } catch {
          // Non-critical if model-info is temporarily unreachable
        }
      } else {
        setBackendStatus('offline');
      }
    } catch {
      clearTimeout(wakeTimer);
      clearTimeout(abortTimer);
      setIsWakingUp(false);
      setBackendStatus('offline');
    }
  }, []);

  useEffect(() => {
    checkHealth(apiUrl);
  }, [apiUrl, checkHealth]);

  // Clean up Object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (inputPreviewUrl) URL.revokeObjectURL(inputPreviewUrl);
      if (outputBlobUrl) URL.revokeObjectURL(outputBlobUrl);
      if (diffBlobUrl) URL.revokeObjectURL(diffBlobUrl);
    };
  }, [inputPreviewUrl, outputBlobUrl, diffBlobUrl]);

  // Handle File Selection
  const handleFileSelect = (file) => {
    if (!file) return;

    // Validate type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Please upload a supported image file (PNG, JPG, JPEG, BMP, WEBP).');
      return;
    }

    // Validate size (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg('File size exceeds 20MB limit. Please choose a smaller image.');
      return;
    }

    setErrorMsg(null);
    setSelectedFile(file);

    // Revoke previous URLs
    if (inputPreviewUrl) URL.revokeObjectURL(inputPreviewUrl);
    if (outputBlobUrl) {
      URL.revokeObjectURL(outputBlobUrl);
      setOutputBlobUrl(null);
      setOutputMetadata(null);
    }
    if (diffBlobUrl) {
      URL.revokeObjectURL(diffBlobUrl);
      setDiffBlobUrl(null);
    }

    const previewUrl = URL.createObjectURL(file);
    setInputPreviewUrl(previewUrl);

    // Read Image Dimensions and Color Mode
    const img = new Image();
    img.onload = () => {
      setInputMetadata({
        name: file.name,
        sizeKb: (file.size / 1024).toFixed(1),
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.src = previewUrl;
  };

  // Clipboard Paste Support (Ctrl+V anywhere on window)
  useEffect(() => {
    const handlePaste = (e) => {
      if (e.clipboardData && e.clipboardData.items) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];
          if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            if (blob) {
              const pastedFile = new File([blob], `pasted_capture_${Date.now()}.png`, {
                type: blob.type || 'image/png',
              });
              handleFileSelect(pastedFile);
              triggerToast('Image pasted from clipboard!');
              break;
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // Compute In-Browser Difference / Residual Map
  const generateDifferenceMap = useCallback((img1Url, img2Url) => {
    const img1 = new Image();
    const img2 = new Image();
    let loaded = 0;

    const onLoaded = () => {
      loaded += 1;
      if (loaded === 2) {
        const w = Math.min(img1.naturalWidth || 256, 512);
        const h = Math.min(img1.naturalHeight || 256, 512);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img1, 0, 0, w, h);
        const data1 = ctx.getImageData(0, 0, w, h);

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img2, 0, 0, w, h);
        const data2 = ctx.getImageData(0, 0, w, h);

        const diffData = ctx.createImageData(w, h);
        for (let i = 0; i < data1.data.length; i += 4) {
          // Amplify residual difference by 4x to highlight noise removal clearly
          const rDiff = Math.min(255, Math.abs(data1.data[i] - data2.data[i]) * 4);
          const gDiff = Math.min(255, Math.abs(data1.data[i + 1] - data2.data[i + 1]) * 4);
          const bDiff = Math.min(255, Math.abs(data1.data[i + 2] - data2.data[i + 2]) * 4);
          diffData.data[i] = rDiff;
          diffData.data[i + 1] = gDiff;
          diffData.data[i + 2] = bDiff;
          diffData.data[i + 3] = 255;
        }

        ctx.putImageData(diffData, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            if (diffBlobUrl) URL.revokeObjectURL(diffBlobUrl);
            const diffUrl = URL.createObjectURL(blob);
            setDiffBlobUrl(diffUrl);
          }
        }, 'image/png');
      }
    };

    img1.crossOrigin = 'anonymous';
    img2.crossOrigin = 'anonymous';
    img1.onload = onLoaded;
    img2.onload = onLoaded;
    img1.src = img1Url;
    img2.src = img2Url;
  }, [diffBlobUrl]);

  // Drag and Drop Event Handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Curated Preset Sample Images for One-Click Demonstrations
  const loadPresetSample = (presetType) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    if (presetType === 'mnist-digit') {
      // High contrast handwritten digit '8' with realistic Gaussian noise
      ctx.fillStyle = '#05070c';
      ctx.fillRect(0, 0, 64, 64);
      ctx.font = 'bold 44px monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('8', 32, 32);

      const imgData = ctx.getImageData(0, 0, 64, 64);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 120;
        imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + noise));
        imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + noise));
        imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);

      canvas.toBlob((blob) => {
        const file = new File([blob], 'mnist_digit_noisy_8.png', { type: 'image/png' });
        handleFileSelect(file);
        setShouldDenoise(true);
        triggerToast('Loaded: Noisy MNIST Digit "8" Sample');
      }, 'image/png');
    } else if (presetType === 'cifar-car') {
      // 3-channel automotive silhouette with color texture and noise
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 64, 64);

      // Sky and road background
      const skyGrad = ctx.createLinearGradient(0, 0, 0, 36);
      skyGrad.addColorStop(0, '#0284c7');
      skyGrad.addColorStop(1, '#38bdf8');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, 64, 38);

      // Car body
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(10, 32, 44, 14);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(18, 22, 28, 12);

      // Wheels
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(20, 46, 6, 0, Math.PI * 2);
      ctx.arc(44, 46, 6, 0, Math.PI * 2);
      ctx.fill();

      // Add Gaussian noise
      const imgData = ctx.getImageData(0, 0, 64, 64);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 90;
        imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + noise));
        imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + noise));
        imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);

      canvas.toBlob((blob) => {
        const file = new File([blob], 'cifar_car_noisy.png', { type: 'image/png' });
        handleFileSelect(file);
        setShouldDenoise(true);
        triggerToast('Loaded: Noisy CIFAR Vehicle Sample');
      }, 'image/png');
    } else if (presetType === 'clean-gradient') {
      // Smooth clean gradient to test Gaussian noise injection
      const grad = ctx.createLinearGradient(0, 0, 64, 64);
      grad.addColorStop(0, '#06b6d4');
      grad.addColorStop(0.5, '#3b82f6');
      grad.addColorStop(1, '#8b5cf6');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);

      // Central ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(32, 32, 18, 0, Math.PI * 2);
      ctx.stroke();

      canvas.toBlob((blob) => {
        const file = new File([blob], 'clean_geometric_gradient.png', { type: 'image/png' });
        handleFileSelect(file);
        setShouldDenoise(false); // Prepare for noising
        triggerToast('Loaded: Clean Geometric Pattern (Ready to add noise)');
      }, 'image/png');
    } else if (presetType === 'microscopy') {
      // Concentric cellular pattern
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, 64, 64);

      for (let r = 24; r > 4; r -= 6) {
        ctx.fillStyle = r % 12 === 0 ? '#e2e8f0' : '#475569';
        ctx.beginPath();
        ctx.arc(32, 32, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Speckle noise
      const imgData = ctx.getImageData(0, 0, 64, 64);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 80;
        imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + noise));
        imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + noise));
        imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);

      canvas.toBlob((blob) => {
        const file = new File([blob], 'microscopy_cell_scan.png', { type: 'image/png' });
        handleFileSelect(file);
        setShouldDenoise(true);
        triggerToast('Loaded: Microscopy Cellular Texture Sample');
      }, 'image/png');
    }
  };

  // Process Image API Call
  const handleProcessImage = async () => {
    if (!selectedFile) {
      setErrorMsg('Please select or drop an image first.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    const startTime = performance.now();

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('should_denoise', String(shouldDenoise));
      formData.append('noise_factor', String(noiseFactor));

      const endpoint = `${apiUrl.replace(/\/$/, '')}/process-image`;
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        let errText = `Server responded with HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.detail) errText = errJson.detail;
        } catch {
          // Fallback
        }
        throw new Error(errText);
      }

      // Read binary blob response
      const blob = await response.blob();
      const outputUrl = URL.createObjectURL(blob);

      if (outputBlobUrl) URL.revokeObjectURL(outputBlobUrl);
      setOutputBlobUrl(outputUrl);

      const endTime = performance.now();
      setProcessingTimeMs(Math.round(endTime - startTime));

      // Extract telemetry headers (safely exposed via CORS)
      const modeHeader = response.headers.get('X-Processed-Mode') || (shouldDenoise ? 'denoised' : 'noisy');
      const dimsHeader = response.headers.get('X-Original-Dimensions');
      const channelsHeader = response.headers.get('X-Original-Channels');
      const psnrHeader = response.headers.get('X-PSNR');
      const mseHeader = response.headers.get('X-MSE');
      const serverLatencyHeader = response.headers.get('X-Processing-Time-Ms');

      setOutputMetadata({
        mode: modeHeader,
        dimensions: dimsHeader,
        channels: channelsHeader === '1' ? '1 (Grayscale)' : '3 (RGB)',
        psnr: psnrHeader ? parseFloat(psnrHeader) : null,
        mse: mseHeader ? parseFloat(mseHeader) : null,
        serverLatencyMs: serverLatencyHeader ? parseFloat(serverLatencyHeader) : null,
        sizeKb: (blob.size / 1024).toFixed(1),
        blob,
      });

      // Generate in-memory visual difference map
      if (inputPreviewUrl) {
        generateDifferenceMap(inputPreviewUrl, outputUrl);
      }

      setBackendStatus('online');
      triggerToast(
        shouldDenoise
          ? 'Image successfully reconstructed by Autoencoder!'
          : 'Gaussian noise synthesized across pixels!'
      );
    } catch (err) {
      console.error('API Inference Error:', err);
      const isRender = apiUrl.includes('onrender.com');
      setErrorMsg(
        `Processing failed: ${err.message}. ${
          isRender
            ? 'If the Render backend was sleeping, it may still be warming up (~30–60s). Please wait a moment and try again.'
            : `Please verify the FastAPI backend is running at ${apiUrl}`
        }`
      );
      setBackendStatus('offline');
    } finally {
      setIsProcessing(false);
    }
  };

  // Cycle Pipeline: Use output image as new input for continuous testing (e.g. noise -> denoise)
  const handleUseAsInput = () => {
    if (!outputMetadata || !outputMetadata.blob) return;
    const cycledFile = new File(
      [outputMetadata.blob],
      `cycled_${shouldDenoise ? 'denoised' : 'noisy'}_image.png`,
      { type: 'image/png' }
    );
    handleFileSelect(cycledFile);
    // If we just added noise, switch mode to denoise so user can immediately restore it!
    if (!shouldDenoise) {
      setShouldDenoise(true);
    }
    triggerToast('Processed image sent back to Input! Mode set to Denoise.');
  };

  // Download Output Result
  const handleDownload = () => {
    if (!outputBlobUrl) return;
    const a = document.createElement('a');
    a.href = outputBlobUrl;
    const prefix = shouldDenoise ? 'denoised' : 'noisy';
    const baseName = selectedFile ? selectedFile.name.replace(/\.[^/.]+$/, '') : 'result';
    a.download = `${prefix}_${baseName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Slider Mouse/Touch Drag Handlers
  const handlePointerDown = (e) => {
    isPointerDownRef.current = true;
    updateSliderFromPointer(e);
  };

  const handlePointerMove = (e) => {
    if (!isPointerDownRef.current) return;
    updateSliderFromPointer(e);
  };

  const handlePointerUp = () => {
    isPointerDownRef.current = false;
  };

  const updateSliderFromPointer = (e) => {
    if (!comparisonContainerRef.current) return;
    const rect = comparisonContainerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const percentage = Math.round((x / rect.width) * 100);
    setSliderPosition(percentage);
  };

  return (
    <div
      className="min-h-screen bg-[#060911] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-slate-950"
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Background Subtle Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl" />
        <div className="absolute top-1/4 -right-40 w-[30rem] h-[30rem] bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-[28rem] h-[28rem] bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-slate-900/95 border border-cyan-500/30 text-cyan-200 text-xs font-medium px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="relative z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">
                  NeuroClean Studio
                </h1>
                <span className="hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  ConvAutoencoder v1.1
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden md:block">
                Deep Convolutional Neural Network for Image Denoising &amp; Synthesis
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Architecture Details Trigger */}
            <button
              onClick={() => setShowArchitectureModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-medium transition"
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Model Architecture</span>
            </button>

            {/* Backend Health Badge */}
            <div
              onClick={() => checkHealth(apiUrl)}
              title="Click to re-test backend health"
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                backendStatus === 'online'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                  : backendStatus === 'offline'
                  ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  backendStatus === 'online'
                    ? 'bg-emerald-400 animate-pulse'
                    : backendStatus === 'offline'
                    ? 'bg-rose-400'
                    : 'bg-amber-400 animate-ping'
                }`}
              />
              <span className="capitalize">
                {backendStatus === 'checking'
                  ? isWakingUp
                    ? 'Waking Up...'
                    : 'Connecting...'
                  : backendStatus}
              </span>
            </div>

            {/* Settings Toggle */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              title="Server Endpoint Configuration"
              className={`p-2 rounded-lg border transition ${
                showSettings
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Collapsible API Configuration Drawer */}
        {showSettings && (
          <div className="border-t border-slate-800/80 bg-slate-900/95 px-4 sm:px-6 lg:px-8 py-3.5 shadow-xl transition-all">
            <div className="max-w-7xl mx-auto flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-300 whitespace-nowrap">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>FastAPI Service URL:</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 text-[11px]">Presets:</span>
                  <button
                    type="button"
                    onClick={() => handleUpdateApiUrl(RENDER_BACKEND_URL)}
                    className={`px-2.5 py-1 rounded-md border text-xs font-medium transition ${
                      apiUrl === RENDER_BACKEND_URL
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    Cloud (Render)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateApiUrl(LOCAL_BACKEND_URL)}
                    className={`px-2.5 py-1 rounded-md border text-xs font-medium transition ${
                      apiUrl === LOCAL_BACKEND_URL
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    Local (Port 8000)
                  </button>
                </div>
              </div>

              <div className="flex-1 w-full flex flex-col sm:flex-row items-center gap-2">
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => handleUpdateApiUrl(e.target.value, false)}
                  placeholder="https://cnnautoencoder-backend.onrender.com"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => checkHealth(apiUrl)}
                  disabled={backendStatus === 'checking'}
                  className="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs text-white font-medium flex items-center justify-center gap-1.5 transition flex-shrink-0"
                >
                  <RefreshCw className={`w-3 h-3 ${backendStatus === 'checking' ? 'animate-spin' : ''}`} />
                  {backendStatus === 'checking' ? 'Testing...' : 'Test Connection'}
                </button>
              </div>

              {apiUrl.includes('onrender.com') && (
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span>
                    Render Free Tier suspends idle instances after 15 minutes. Cold boot spin-up takes ~30–60 seconds on the first ping.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col space-y-6">
        {/* Error Alert Banner */}
        {errorMsg && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 flex items-start justify-between shadow-lg backdrop-blur-sm">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold">Service Notice</p>
                <p className="text-xs text-rose-200/90 mt-0.5">{errorMsg}</p>
              </div>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-rose-400 hover:text-rose-200 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Operational Toolbar (Pipeline Mode & Interactive Controls) */}
        <section className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 shadow-xl backdrop-blur-md">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
            {/* Left: Mode Title & Info */}
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50">
                <Sliders className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  Pipeline Mode
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                    {shouldDenoise ? 'Inference Engine' : 'Gaussian Synthesizer'}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {shouldDenoise
                    ? 'Removes noise through the 32×32×3 convolutional autoencoder bottleneck.'
                    : 'Injects controlled Gaussian noise with adjustable standard deviation.'}
                </p>
              </div>
            </div>

            {/* Right: Mode Selector Switch & Noise Variance Slider */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
              {/* Segmented Mode Button */}
              <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setShouldDenoise(true)}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                    shouldDenoise
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/25'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Denoise Image</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white ml-0.5">
                    Model
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setShouldDenoise(false)}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                    !shouldDenoise
                      ? 'bg-gradient-to-r from-amber-500 to-rose-600 text-white shadow-md shadow-amber-500/25'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Synthesize Noise</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/20 text-white ml-0.5">
                    Gaussian
                  </span>
                </button>
              </div>

              {/* Noise Variance Slider (when in Noise mode) */}
              {!shouldDenoise && (
                <div className="flex items-center gap-2.5 bg-slate-950/80 border border-slate-800 px-3 py-2 rounded-xl text-xs">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-slate-400 font-mono text-[11px] whitespace-nowrap">
                    σ = {noiseFactor.toFixed(2)}
                  </span>
                  <input
                    type="range"
                    min="0.05"
                    max="0.50"
                    step="0.05"
                    value={noiseFactor}
                    onChange={(e) => setNoiseFactor(parseFloat(e.target.value))}
                    className="w-24 sm:w-28 accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Upload & Action Dashboard Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: Drag & Drop Zone + Sample Presets */}
          <div className="lg:col-span-2 space-y-3">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-7 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 group ${
                isDragging
                  ? 'border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/10 scale-[1.005]'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/40 hover:bg-slate-900/70'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/bmp,image/webp"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />

              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform shadow-inner">
                <Upload className="w-6 h-6 text-cyan-400" />
              </div>

              <h3 className="text-base font-semibold text-white">
                Drag and drop your image here, or{' '}
                <span className="text-cyan-400 underline underline-offset-4 font-medium">browse</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                Supports Grayscale &amp; RGB (PNG, JPG, BMP, WEBP). EXIF orientation is normalized automatically. Paste images anytime with{' '}
                <kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-300 font-mono">
                  Ctrl+V
                </kbd>
                .
              </p>

              {/* Sample Presets Quick Trigger Bar */}
              <div
                className="mt-5 pt-4 border-t border-slate-800/80 w-full flex flex-col sm:flex-row items-center justify-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="text-[11px] font-medium text-slate-400">Instant Demo Presets:</span>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => loadPresetSample('mnist-digit')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition flex items-center gap-1.5"
                  >
                    <span>🔢</span> Noisy MNIST "8"
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPresetSample('cifar-car')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition flex items-center gap-1.5"
                  >
                    <span>🚗</span> Noisy CIFAR Car
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPresetSample('clean-gradient')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition flex items-center gap-1.5"
                  >
                    <span>🎨</span> Clean Gradient
                  </button>
                  <button
                    type="button"
                    onClick={() => loadPresetSample('microscopy')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition flex items-center gap-1.5"
                  >
                    <span>🔬</span> Cellular Texture
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right 1 Col: Execution Summary & Action Card */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 flex flex-col justify-between backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4 pb-2 border-b border-slate-800">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Execution Spec
                </span>
                <span className="font-mono text-[10px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded">
                  {selectedFile ? 'Ready' : 'Waiting Input'}
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Target Action:</span>
                  <span className={`font-semibold ${shouldDenoise ? 'text-cyan-400' : 'text-amber-400'}`}>
                    {shouldDenoise ? 'Neural Autoencoder' : `Gaussian Noise (σ=${noiseFactor.toFixed(2)})`}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-t border-slate-800/60">
                  <span className="text-slate-400">Input Resolution:</span>
                  <span className="font-mono text-slate-200">
                    {inputMetadata ? `${inputMetadata.width} × ${inputMetadata.height}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-t border-slate-800/60">
                  <span className="text-slate-400">Model Input Size:</span>
                  <span className="font-mono text-slate-200">32 × 32 × 3</span>
                </div>
                <div className="flex justify-between py-1 border-t border-slate-800/60">
                  <span className="text-slate-400">Latent Bottleneck:</span>
                  <span className="font-mono text-indigo-300">4 × 4 × 8 (128 features)</span>
                </div>
                <div className="flex justify-between py-1 border-t border-slate-800/60">
                  <span className="text-slate-400">Output Restoration:</span>
                  <span className="text-emerald-400 font-medium">Bicubic Native Shape</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800/80">
              <button
                type="button"
                disabled={!selectedFile || isProcessing}
                onClick={handleProcessImage}
                className={`w-full py-3.5 px-4 rounded-xl font-semibold text-sm flex items-center justify-center space-x-2 transition-all duration-200 shadow-xl ${
                  !selectedFile || isProcessing
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                    : shouldDenoise
                    ? 'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-cyan-500/25 active:scale-[0.99]'
                    : 'bg-gradient-to-r from-amber-500 via-orange-600 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white shadow-amber-500/25 active:scale-[0.99]'
                }`}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Processing Neural Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>{shouldDenoise ? 'Run Denoising Model' : 'Inject Gaussian Noise'}</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Comparison & Output Visualization Suite */}
        {(inputPreviewUrl || outputBlobUrl || isProcessing) && (
          <section className="space-y-4 pt-2">
            {/* View Mode Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-2xl border border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="p-1.5 rounded-lg bg-slate-800 text-cyan-400">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Visual Inspection &amp; Comparison</h3>
                  <p className="text-xs text-slate-400">
                    Interact with split overlay, side-by-side inspection, or noise residual delta.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Image Rendering Smoothing Toggle */}
                <button
                  onClick={() => setPixelRendering(pixelRendering === 'smooth' ? 'pixelated' : 'smooth')}
                  title="Toggle Nearest-Neighbor (Pixelated) vs Bicubic (Smooth) rendering"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-slate-300 border border-slate-700 transition"
                >
                  {pixelRendering === 'pixelated' ? '🔍 Mode: Pixel Sharp' : '✨ Mode: Smooth'}
                </button>

                {outputBlobUrl && (
                  <>
                    {/* View Mode Segmented Controls */}
                    <div className="inline-flex p-1 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                      <button
                        onClick={() => setViewMode('slider')}
                        className={`px-3 py-1 rounded-md font-medium transition ${
                          viewMode === 'slider' ? 'bg-slate-800 text-cyan-400 shadow' : 'text-slate-400'
                        }`}
                      >
                        Split Slider
                      </button>
                      <button
                        onClick={() => setViewMode('side-by-side')}
                        className={`px-3 py-1 rounded-md font-medium transition ${
                          viewMode === 'side-by-side' ? 'bg-slate-800 text-cyan-400 shadow' : 'text-slate-400'
                        }`}
                      >
                        Side by Side
                      </button>
                      <button
                        onClick={() => setViewMode('difference')}
                        className={`px-3 py-1 rounded-md font-medium transition ${
                          viewMode === 'difference' ? 'bg-slate-800 text-cyan-400 shadow' : 'text-slate-400'
                        }`}
                      >
                        Residual Delta
                      </button>
                    </div>

                    {/* Cycle Button: Send output to input */}
                    <button
                      onClick={handleUseAsInput}
                      title="Use this processed output as input for next test (e.g. noise -> denoise)"
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center space-x-1.5 border border-slate-700 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="hidden sm:inline">Use as Input</span>
                    </button>

                    {/* Download Button */}
                    <button
                      onClick={handleDownload}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-md shadow-cyan-600/20 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Telemetry Metrics Cards (when output is generated) */}
            {outputMetadata && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* PSNR Card */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 backdrop-blur-sm">
                  <span className="text-[11px] text-slate-400 font-medium">Reconstruction PSNR</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold font-mono text-cyan-400">
                      {outputMetadata.psnr !== null ? `${outputMetadata.psnr} dB` : '—'}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        (outputMetadata.psnr || 0) >= 28
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : (outputMetadata.psnr || 0) >= 20
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {(outputMetadata.psnr || 0) >= 28
                        ? 'High Fidelity'
                        : (outputMetadata.psnr || 0) >= 20
                        ? 'Moderate'
                        : 'Distorted'}
                    </span>
                  </div>
                </div>

                {/* MSE Card */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 backdrop-blur-sm">
                  <span className="text-[11px] text-slate-400 font-medium">Mean Squared Error (MSE)</span>
                  <div className="mt-1">
                    <span className="text-xl font-bold font-mono text-slate-200">
                      {outputMetadata.mse !== null ? outputMetadata.mse.toFixed(5) : '—'}
                    </span>
                  </div>
                </div>

                {/* Latency Card */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 backdrop-blur-sm">
                  <span className="text-[11px] text-slate-400 font-medium">End-to-End Latency</span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold font-mono text-emerald-400">
                      {processingTimeMs} ms
                    </span>
                    {outputMetadata.serverLatencyMs && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        (model: {outputMetadata.serverLatencyMs}ms)
                      </span>
                    )}
                  </div>
                </div>

                {/* Dimensions & Channels Card */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 backdrop-blur-sm">
                  <span className="text-[11px] text-slate-400 font-medium">Output Channels &amp; Res</span>
                  <div className="mt-1">
                    <span className="text-sm font-semibold font-mono text-slate-200">
                      {outputMetadata.dimensions || `${inputMetadata?.width}×${inputMetadata?.height}`}
                    </span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      {outputMetadata.channels} • {outputMetadata.sizeKb} KB
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW MODE 1: Interactive Split Comparison Slider */}
            {viewMode === 'slider' && outputBlobUrl && inputPreviewUrl ? (
              <div
                ref={comparisonContainerRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                className="relative w-full max-w-4xl mx-auto aspect-square sm:aspect-[16/11] max-h-[520px] rounded-2xl overflow-hidden border border-slate-800 bg-[#04060b] select-none shadow-2xl cursor-ew-resize"
              >
                {/* Background Image: Processed Output */}
                <img
                  src={outputBlobUrl}
                  alt="Processed Output"
                  className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${
                    pixelRendering === 'pixelated' ? 'image-pixelated' : 'image-smooth'
                  }`}
                />
                <div className="absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-black/70 text-cyan-400 text-xs font-mono backdrop-blur-md border border-cyan-500/20 shadow-lg pointer-events-none">
                  {shouldDenoise ? 'Autoencoder Denoised' : 'Gaussian Noisy'}
                </div>

                {/* Foreground Image: Original Input with CSS Clip-Path (Pixel-Perfect Alignment!) */}
                <img
                  src={inputPreviewUrl}
                  alt="Original Input"
                  style={{
                    clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
                    WebkitClipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
                  }}
                  className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${
                    pixelRendering === 'pixelated' ? 'image-pixelated' : 'image-smooth'
                  }`}
                />
                <div
                  className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 text-slate-300 text-xs font-mono backdrop-blur-md border border-slate-700 shadow-lg pointer-events-none"
                  style={{
                    opacity: sliderPosition > 15 ? 1 : 0,
                    transition: 'opacity 0.2s',
                  }}
                >
                  Original Input
                </div>

                {/* Vertical Divider Line with Scrub Handle */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_12px_#22d3ee] pointer-events-none"
                  style={{ left: `${sliderPosition}%` }}
                >
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center shadow-lg shadow-cyan-400/40">
                    <Split className="w-4 h-4 rotate-90" />
                  </div>
                </div>

                {/* Native Range Slider for accessibility & keyboard scrubbing */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPosition}
                  onChange={(e) => setSliderPosition(Number(e.target.value))}
                  aria-label="Image comparison slider"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-30"
                />
              </div>
            ) : viewMode === 'difference' && diffBlobUrl ? (
              /* VIEW MODE 2: Noise Residual Delta Map */
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 flex flex-col items-center backdrop-blur-sm space-y-4">
                <div className="text-center max-w-lg">
                  <h4 className="text-sm font-semibold text-white flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    Noise Residual Delta Map (|Input - Output| × 4)
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Visualizes the isolated high-frequency components modified by the model or noise synthesizer.
                  </p>
                </div>

                <div className="aspect-square max-h-[460px] w-full max-w-lg rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden p-3 shadow-inner">
                  <img
                    src={diffBlobUrl}
                    alt="Noise Residual Delta Map"
                    className={`max-h-full max-w-full object-contain rounded-lg ${
                      pixelRendering === 'pixelated' ? 'image-pixelated' : 'image-smooth'
                    }`}
                  />
                </div>
              </div>
            ) : (
              /* VIEW MODE 3: Side-by-Side Inspection Grid */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Card: Input Image */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col space-y-4 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                      Original Input Image
                    </span>
                    {inputMetadata && (
                      <span className="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                        {inputMetadata.width}×{inputMetadata.height} • {inputMetadata.sizeKb} KB
                      </span>
                    )}
                  </div>

                  <div className="aspect-square max-h-96 w-full rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-center overflow-hidden p-2">
                    {inputPreviewUrl ? (
                      <img
                        src={inputPreviewUrl}
                        alt="Input Preview"
                        className={`max-h-full max-w-full object-contain rounded-lg ${
                          pixelRendering === 'pixelated' ? 'image-pixelated' : 'image-smooth'
                        }`}
                      />
                    ) : (
                      <div className="text-center text-slate-600 text-xs">
                        <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-50" />
                        No image selected yet
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Card: Processed Output */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col space-y-4 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      {shouldDenoise ? 'Denoised Autoencoder Result' : 'Gaussian Noise Result'}
                    </span>
                    {outputMetadata && (
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {processingTimeMs}ms • {outputMetadata.sizeKb} KB
                      </span>
                    )}
                  </div>

                  <div className="aspect-square max-h-96 w-full rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-center overflow-hidden p-2 relative">
                    {isProcessing ? (
                      <div className="text-center flex flex-col items-center space-y-3">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                          <Sparkles className="w-5 h-5 text-cyan-400 absolute inset-0 m-auto animate-pulse" />
                        </div>
                        <p className="text-xs text-slate-400">
                          Reconstructing features across convolutional layers...
                        </p>
                      </div>
                    ) : outputBlobUrl ? (
                      <img
                        src={outputBlobUrl}
                        alt="Processed Output"
                        className={`max-h-full max-w-full object-contain rounded-lg ${
                          pixelRendering === 'pixelated' ? 'image-pixelated' : 'image-smooth'
                        }`}
                      />
                    ) : (
                      <div className="text-center text-slate-600 text-xs">
                        <Sparkles className="w-8 h-8 mx-auto mb-1 opacity-50" />
                        Awaiting process trigger
                      </div>
                    )}
                  </div>

                  {outputBlobUrl && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleUseAsInput}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center justify-center space-x-1.5 transition"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Send to Input</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownload}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center justify-center space-x-1.5 transition shadow-md shadow-cyan-600/20"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Download Result</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Model Architecture Modal */}
      {showArchitectureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowArchitectureModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Convolutional Autoencoder Architecture</h3>
                <p className="text-xs text-slate-400">
                  Trained on Hybrid CIFAR-10 &amp; RGB-adapted MNIST for noise resilience
                </p>
              </div>
            </div>

            {/* Architecture Pipeline Flow Diagram */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 mb-5">
              <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider block mb-3">
                Pipeline Topology &amp; Latent Compression
              </span>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-center">
                  <span className="block text-[10px] text-slate-400">Input</span>
                  <span className="font-mono font-bold text-cyan-400">32 × 32 × 3</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <div className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-center">
                  <span className="block text-[10px] text-slate-400">Encoder</span>
                  <span className="font-mono text-blue-300">Conv 64 → 32 → 8</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <div className="bg-indigo-950/60 border border-indigo-500/40 px-3 py-2 rounded-lg text-center shadow-lg shadow-indigo-500/10">
                  <span className="block text-[10px] text-indigo-300 font-semibold">Latent Bottleneck</span>
                  <span className="font-mono font-bold text-indigo-400">4 × 4 × 8 (128)</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <div className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-center">
                  <span className="block text-[10px] text-slate-400">Decoder</span>
                  <span className="font-mono text-purple-300">UpSample &amp; Conv</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600" />
                <div className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg text-center">
                  <span className="block text-[10px] text-slate-400">Output</span>
                  <span className="font-mono font-bold text-emerald-400">32 × 32 × 3</span>
                </div>
              </div>
            </div>

            {/* Layer Specifications Table */}
            <div className="border border-slate-800 rounded-xl overflow-hidden mb-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-mono">
                  <tr>
                    <th className="px-3.5 py-2.5">Layer</th>
                    <th className="px-3.5 py-2.5">Type</th>
                    <th className="px-3.5 py-2.5">Specs</th>
                    <th className="px-3.5 py-2.5">Output Shape</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {modelMeta?.layers?.map((layer, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="px-3.5 py-2 text-slate-300">{layer.name}</td>
                      <td className="px-3.5 py-2 text-cyan-400">{layer.type}</td>
                      <td className="px-3.5 py-2 text-slate-400">
                        {layer.filters ? `${layer.filters} filters, ${layer.kernel}` : layer.pool_size || layer.size || '—'}
                      </td>
                      <td className="px-3.5 py-2 text-slate-300">{layer.output_shape}</td>
                    </tr>
                  )) || (
                    <tr>
                      <td colSpan={4} className="px-3.5 py-3 text-center text-slate-500">
                        Connecting to model metadata service...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
              <span>Framework: TensorFlow 2.x / Keras</span>
              <span className="font-mono text-cyan-400">
                Parameters: {modelMeta?.total_parameters?.toLocaleString() || '68,739'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Clean Professional Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-950/70 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500" />
            <span className="text-slate-400 font-medium">Neural Image Denoising Studio</span>
            <span className="text-slate-600">•</span>
            <span>TensorFlow 3-Channel Autoencoder Pipeline</span>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <button
              onClick={() => setShowArchitectureModal(true)}
              className="hover:text-slate-300 transition"
            >
              Architecture Specs
            </button>
            <span>•</span>
            <span className="font-mono text-[11px] text-slate-600">FastAPI + Vite React 19</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
