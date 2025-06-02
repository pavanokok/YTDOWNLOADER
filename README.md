
# YouTube Downloader - Full Stack Application

A complete YouTube downloader with real-time progress updates, built with FastAPI (Python) and React (TypeScript).

## Features

🎥 **Real YouTube Downloads** - Uses yt-dlp for actual video downloads
📊 **Real-time Progress** - WebSocket-based progress updates with speed, ETA, and percentage
🎛️ **Quality Selection** - Choose from best quality, 1080p, 720p, 480p, or audio-only
📋 **Clipboard Integration** - One-click paste from clipboard
🖼️ **Video Previews** - Thumbnail and metadata preview before download
⚡ **Concurrent Downloads** - Multiple downloads with thread pool executor
🌐 **Network Monitoring** - Real-time download speed tracking
🔄 **Error Handling** - Production-grade error handling and recovery
📱 **Responsive UI** - Modern React interface with animations and toasts
🐳 **Docker Ready** - Containerized for easy deployment

## Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **yt-dlp** - YouTube video extraction and downloading
- **WebSockets** - Real-time communication
- **ThreadPoolExecutor** - Concurrent download handling
- **psutil** - System and network monitoring

### Frontend  
- **React 18** - Modern React with hooks
- **TypeScript** - Type safety
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Beautiful UI components
- **WebSocket API** - Real-time updates
- **Lucide React** - Icon library

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- FFmpeg (for audio conversion)

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Start the FastAPI server:
```bash
python run.py
```

The API will be available at `http://localhost:8000`

### Frontend Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:8080`

## Docker Deployment

### Backend Container
```bash
cd backend
docker build -t youtube-downloader-api .
docker run -p 8000:8000 -v $(pwd)/downloads:/app/downloads youtube-downloader-api
```

### Full Stack with Docker Compose
```yaml
version: '3.8'
services:
  api:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./downloads:/app/downloads
    environment:
      - PORT=8000
  
  frontend:
    build: .
    ports:
      - "3000:3000"
    depends_on:
      - api
```

## API Endpoints

### REST Endpoints
- `GET /` - Health check
- `POST /video-info` - Get video metadata without downloading
- `GET /downloads` - List all downloaded files
- `GET /download/{filename}` - Download a specific file

### WebSocket Endpoint
- `WS /ws/{client_id}` - Real-time download communication

## Usage

1. **Paste URL**: Click the clipboard button or paste a YouTube URL
2. **Preview Video**: Click "Preview" to see video information and available formats
3. **Select Quality**: Choose your preferred download quality
4. **Start Download**: Click "Download" to begin the process
5. **Monitor Progress**: Watch real-time progress with speed and ETA
6. **Download File**: Click "Download File" when complete

## Configuration

### Quality Options
- `best` - Highest available quality
- `1080p` - 1080p resolution
- `720p` - 720p resolution  
- `480p` - 480p resolution
- `audio_only` - Audio-only MP3 download

### Environment Variables
- `PORT` - API server port (default: 8000)

## Production Deployment

### Server Requirements
- 2+ CPU cores
- 4GB+ RAM
- 50GB+ storage for downloads
- FFmpeg installed
- Python 3.11+

### Security Considerations
- Use reverse proxy (nginx) for production
- Enable HTTPS/WSS
- Implement rate limiting
- Add authentication if needed
- Configure CORS properly

### Example nginx configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
    
    location / {
        proxy_pass http://localhost:3000;
    }
}
```

## Troubleshooting

### Common Issues

1. **FFmpeg not found**: Install FFmpeg for audio conversion
2. **WebSocket connection failed**: Check firewall and port availability
3. **Download permission errors**: Ensure write permissions on downloads directory
4. **Video extraction failed**: Update yt-dlp to latest version

### Logs
- Backend logs: Check console output where FastAPI is running
- Frontend logs: Check browser developer console
- Download logs: Check server logs for yt-dlp output

## License

MIT License - Feel free to use for personal and commercial projects.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions:
- Check the troubleshooting section
- Review API documentation at `http://localhost:8000/docs`
- Submit GitHub issues for bugs
