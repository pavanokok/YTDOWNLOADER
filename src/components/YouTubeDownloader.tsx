import React, { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Download, Clipboard, Play, Clock, File, Wifi } from 'lucide-react';

interface VideoInfo {
  title: string;
  thumbnail: string;
  duration: number;
  uploader: string;
  view_count: number;
  upload_date: string;
  formats: Array<{
    height: number;
    format_note: string;
    ext: string;
    filesize: number;
  }>;
}

interface DownloadProgress {
  type: string;
  download_id: string;
  percentage: number;
  downloaded: string;
  total: string;
  speed: string;
  eta: string;
  filename: string;
}

interface ActiveDownload {
  id: string;
  url: string;
  quality: string;
  status: string;
  videoInfo?: VideoInfo;
  progress?: DownloadProgress;
  filename?: string;
  error?: string;
}

const YouTubeDownloader: React.FC = () => {
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState('best');
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  const { toast } = useToast();
  const wsRef = useRef<WebSocket | null>(null);
  const clientId = useRef(Math.random().toString(36).substr(2, 9));

  // --- START OF ADDED/MODIFIED LINES ---
  const API_BASE_URL = import.meta.env.VITE_APP_API_URL || 'http://localhost:8000'; // Fallback for local dev
  const WS_BASE_URL = API_BASE_URL.replace('http', 'ws').replace('https', 'wss');
  // --- END OF ADDED/MODIFIED LINES ---

  // Validate YouTube URL
  const isValidYouTubeUrl = (url: string) => {
    const regex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+(&\S*)?$/;
    return regex.test(url);
  };

  // WebSocket connection
  useEffect(() => {
    const connectWebSocket = () => {
      // --- MODIFIED LINE ---
      const ws = new WebSocket(`${WS_BASE_URL}/ws/${clientId.current}`);
      // --- END OF MODIFIED LINE ---
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        toast({
          title: "Connected",
          description: "Real-time updates enabled",
        });
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);
        
        if (data.type === 'download_started') {
          toast({
            title: "Download Started",
            description: "Your video download has begun",
          });
        } else if (data.type === 'progress') {
          updateDownloadProgress(data);
        } else if (data.type === 'completed') {
          handleDownloadComplete(data);
        } else if (data.type === 'error') {
          handleDownloadError(data);
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        toast({
          title: "Connection Error",
          description: "Failed to connect to download service",
          variant: "destructive",
        });
      };
      
      wsRef.current = ws;
    };
    
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [toast]);

  const updateDownloadProgress = (progressData: DownloadProgress) => {
    setActiveDownloads(prev => 
      prev.map(download => 
        download.id === progressData.download_id 
          ? { ...download, progress: progressData, status: 'downloading' }
          : download
      )
    );
  };

  const handleDownloadComplete = (data: any) => {
    setActiveDownloads(prev => 
      prev.map(download => 
        download.id === data.download_id 
          ? { ...download, status: 'completed', filename: data.filename }
          : download
      )
    );
    
    toast({
      title: "Download Complete!",
      description: `${data.filename} is ready for download`,
    });

    // Automatically trigger browser download
    triggerBrowserDownload(data.filename);
  };

  const handleDownloadError = (data: any) => {
    setActiveDownloads(prev => 
      prev.map(download => 
        download.id === data.download_id 
          ? { ...download, status: 'error', error: data.message }
          : download
      )
    );
    
    toast({
      title: "Download Failed",
      description: data.message,
      variant: "destructive",
    });
  };

  const triggerBrowserDownload = (filename: string) => {
    // Create a temporary download link and trigger it
    // --- MODIFIED LINE ---
    const downloadUrl = `${API_BASE_URL}/download/${encodeURIComponent(filename)}`;
    // --- END OF MODIFIED LINE ---
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (isValidYouTubeUrl(text)) {
        setUrl(text);
        toast({
          title: "URL Pasted",
          description: "YouTube URL pasted from clipboard",
        });
      } else {
        toast({
          title: "Invalid URL",
          description: "Clipboard doesn't contain a valid YouTube URL",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Clipboard Error",
        description: "Failed to read from clipboard",
        variant: "destructive",
      });
    }
  };

  const fetchVideoInfo = async () => {
    if (!url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a YouTube URL",
        variant: "destructive",
      });
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube URL",
        variant: "destructive",
      });
      return;
    }

    setIsLoadingInfo(true);
    try {
      // --- MODIFIED LINE ---
      const response = await fetch(`${API_BASE_URL}/video-info`, {
      // --- END OF MODIFIED LINE ---
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const info = await response.json();
      setVideoInfo(info);
      
      toast({
        title: "Video Info Loaded",
        description: `Found: ${info.title}`,
      });
    } catch (error) {
      console.error('Error fetching video info:', error);
      toast({
        title: "Error",
        description: "Failed to fetch video information. Please check the URL.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const startDownload = () => {
    if (!url.trim()) {
      toast({
        title: "URL Required",
        description: "Please enter a YouTube URL",
        variant: "destructive",
      });
      return;
    }

    if (!isValidYouTubeUrl(url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube URL",
        variant: "destructive",
      });
      return;
    }

    if (!isConnected || !wsRef.current) {
      toast({
        title: "Connection Error",
        description: "WebSocket not connected. Please wait and try again.",
        variant: "destructive",
      });
      return;
    }

    const downloadId = Math.random().toString(36).substr(2, 9);
    
    // Add to active downloads
    const newDownload: ActiveDownload = {
      id: downloadId,
      url,
      quality,
      status: 'starting',
      videoInfo: videoInfo || undefined,
    };
    
    setActiveDownloads(prev => [...prev, newDownload]);

    // Send download request via WebSocket
    wsRef.current.send(JSON.stringify({
      type: 'start_download',
      url,
      quality,
      download_id: downloadId,
    }));
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center py-8">
          <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            YouTube Downloader
          </h1>
          <p className="text-slate-300">Download videos with real-time progress tracking</p>
          <div className="flex items-center justify-center mt-4 space-x-2">
            <Wifi className={`w-4 h-4 ${isConnected ? 'text-green-400' : 'text-red-400'}`} />
            <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* URL Input Section */}
        <Card className="p-6 bg-white/10 backdrop-blur-lg border-white/20">
          <div className="space-y-4">
            <div className="flex space-x-2">
              <Input
                placeholder="Paste YouTube URL here..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 bg-white/5 border-white/20 text-white placeholder:text-slate-400"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={pasteFromClipboard}
                className="bg-white/5 border-white/20 text-white hover:bg-white/10"
              >
                <Clipboard className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="flex space-x-2">
              <Select value={quality} onValueChange={setQuality}>
                <SelectTrigger className="w-48 bg-white/5 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">Best Quality</SelectItem>
                  <SelectItem value="1080p">1080p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="audio_only">Audio Only</SelectItem>
                </SelectContent>
              </Select>
              
              <Button
                onClick={fetchVideoInfo}
                disabled={isLoadingInfo}
                variant="outline"
                className="bg-white/5 border-white/20 text-white hover:bg-white/10"
              >
                {isLoadingInfo ? 'Loading...' : 'Preview'}
              </Button>
              
              <Button
                onClick={startDownload}
                disabled={!url.trim() || !isConnected || !isValidYouTubeUrl(url)}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>
          </div>
        </Card>

        {/* Video Info Preview */}
        {videoInfo && (
          <Card className="p-6 bg-white/10 backdrop-blur-lg border-white/20">
            <div className="flex space-x-4">
              <img
                src={videoInfo.thumbnail}
                alt={videoInfo.title}
                className="w-32 h-24 object-cover rounded-lg"
              />
              <div className="flex-1 space-y-2">
                <h3 className="text-lg font-semibold text-white line-clamp-2">
                  {videoInfo.title}
                </h3>
                <div className="flex items-center space-x-4 text-sm text-slate-300">
                  <span className="flex items-center">
                    <Play className="w-4 h-4 mr-1" />
                    {videoInfo.uploader}
                  </span>
                  <span className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {formatDuration(videoInfo.duration)}
                  </span>
                  <span>{formatNumber(videoInfo.view_count)} views</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {videoInfo.formats.slice(0, 5).map((format, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="bg-white/10 text-white border-white/20"
                    >
                      {format.height}p {format.ext}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Active Downloads */}
        {activeDownloads.length > 0 && (
          <Card className="p-6 bg-white/10 backdrop-blur-lg border-white/20">
            <h3 className="text-lg font-semibold text-white mb-4">Active Downloads</h3>
            <div className="space-y-4">
              {activeDownloads.map((download) => (
                <div key={download.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-white font-medium line-clamp-1">
                        {download.videoInfo?.title || 'Unknown Video'}
                      </p>
                    <p className="text-sm text-slate-300">
                        Quality: {download.quality} • Status: {download.status}
                      </p>
                    </div>
                    <Badge
                      variant={
                        download.status === 'completed' ? 'default' :
                        download.status === 'error' ? 'destructive' :
                        'secondary'
                      }
                      className={
                        download.status === 'completed' ? 'bg-green-500' :
                        download.status === 'error' ? 'bg-red-500' :
                        'bg-blue-500'
                      }
                    >
                      {download.status}
                    </Badge>
                  </div>
                  
                  {download.progress && (
                    <div className="space-y-2">
                      <Progress
                        value={download.progress.percentage}
                        className="h-2 bg-white/10"
                      />
                      <div className="flex items-center justify-between text-sm text-slate-300">
                        <span>{download.progress.percentage.toFixed(1)}%</span>
                        <span>{download.progress.downloaded} / {download.progress.total}</span>
                        <span className="flex items-center">
                          <Wifi className="w-3 h-3 mr-1" />
                          {download.progress.speed}
                        </span>
                        <span>ETA: {download.progress.eta}</span>
                      </div>
                    </div>
                  )}
                  
                  {download.status === 'completed' && download.filename && (
                    <div className="flex items-center justify-between p-3 bg-green-500/20 rounded-lg">
                      <span className="text-green-300">
                        <File className="w-4 h-4 inline mr-2" />
                        {download.filename}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        // --- MODIFIED LINE ---
                        onClick={() => window.open(`${API_BASE_URL}/download/${download.filename}`, '_blank')}
                        // --- END OF MODIFIED LINE ---
                        className="bg-green-500/20 border-green-500/30 text-green-300 hover:bg-green-500/30"
                      >
                        Download File
                      </Button>
                    </div>
                  )}
                  
                  {download.status === 'error' && download.error && (
                    <div className="p-3 bg-red-500/20 rounded-lg">
                      <p className="text-red-300 text-sm">{download.error}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default YouTubeDownloader;
