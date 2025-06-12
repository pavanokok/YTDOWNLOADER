import asyncio
import json
import os
import uuid
import time
from typing import Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor
import yt_dlp
import psutil

app = FastAPI(title="YouTube Downloader API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DOWNLOADS_DIR = os.path.join(os.getcwd(), "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

active_downloads: Dict[str, Dict] = {}
websocket_connections: Dict[str, WebSocket] = {}
download_executor = ThreadPoolExecutor(max_workers=5)

class DownloadRequest(BaseModel):
    url: str
    quality: str = "best"
    download_id: Optional[str] = None

class VideoInfo(BaseModel):
    title: str
    thumbnail: str
    duration: int
    uploader: str
    view_count: int
    upload_date: str
    formats: list

def get_network_speed():
    """Returns the current network speed in Mbps. (Note: This is a general system metric and not specific to yt-dlp download speed)."""
    try:
        net_io_1 = psutil.net_io_counters()
        time.sleep(0.1)
        net_io_2 = psutil.net_io_counters()
        bytes_recv = net_io_2.bytes_recv - net_io_1.bytes_recv
        speed_mbps = (bytes_recv * 8) / (1024 * 1024 * 0.1)
        return round(speed_mbps, 2)
    except Exception:
        return 0

class ProgressHook:
    def __init__(self, download_id: str, websocket: WebSocket, loop: asyncio.AbstractEventLoop):
        self.download_id = download_id
        self.websocket = websocket
        self.loop = loop
        self.start_time = time.time()
        self.last_update = 0

    def __call__(self, d):
        try:
            if d['status'] == 'downloading':
                now = time.time()
                # Update progress every 0.2 seconds to avoid excessive WebSocket messages
                if now - self.last_update < 0.2:
                    return
                self.last_update = now

                downloaded = d.get('downloaded_bytes', 0)
                total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                percentage = (downloaded / total) * 100 if total > 0 else 0

                speed_bytes_sec = d.get('speed', 0)
                speed_mbps = (speed_bytes_sec * 8) / (1024 * 1024) if speed_bytes_sec > 0 else 0

                eta_seconds = d.get('eta')
                # Fixed: Ensure eta_seconds is not None before performing arithmetic
                eta = f"{int(eta_seconds // 60)}m {int(eta_seconds % 60)}s" if isinstance(eta_seconds, (int, float)) else "Unknown"

                def format_bytes(b):
                    if b is None: return "N/A"
                    if b >= 1024**3:
                        return f"{b / (1024**3):.1f} GB"
                    elif b >= 1024**2:
                        return f"{b / (1024**2):.1f} MB"
                    elif b >= 1024:
                        return f"{b / 1024:.1f} KB"
                    else:
                        return f"{b} B"

                progress_data = {
                    'type': 'progress',
                    'download_id': self.download_id,
                    'percentage': round(percentage, 1),
                    'downloaded': format_bytes(downloaded),
                    'total': format_bytes(total),
                    'speed': f"{speed_mbps:.1f} Mbps",
                    'eta': eta,
                    'filename': d.get('filename', 'Unknown'), # This might be temporary file for merges
                }

                if self.download_id in active_downloads:
                    active_downloads[self.download_id].update(progress_data)

                asyncio.run_coroutine_threadsafe(
                    self.websocket.send_text(json.dumps(progress_data)),
                    self.loop
                )

            # --- Removed 'finished' status handling from here ---
            # It will now be handled outside the hook, after the full download/merge
            elif d['status'] == 'error':
                error_message = d.get('error', 'An unknown error occurred during download.')
                error_data = {
                    'type': 'error',
                    'download_id': self.download_id,
                    'message': error_message,
                }
                if self.download_id in active_downloads:
                    active_downloads[self.download_id]['status'] = 'error'
                    active_downloads[self.download_id]['error'] = error_message

                asyncio.run_coroutine_threadsafe(
                    self.websocket.send_text(json.dumps(error_data)),
                    self.loop
                )

        except Exception as e:
            print(f"Progress hook error for download_id {self.download_id}: {e}")
            error_data = {
                'type': 'error',
                'download_id': self.download_id,
                'message': f"Internal progress hook error: {str(e)}",
            }
            if self.download_id in active_downloads:
                active_downloads[self.download_id]['status'] = 'error'
                active_downloads[self.download_id]['error'] = str(e)
            asyncio.run_coroutine_threadsafe(
                self.websocket.send_text(json.dumps(error_data)),
                self.loop
            )

def download_video(url: str, quality: str, download_id: str, websocket: WebSocket, loop: asyncio.AbstractEventLoop):
    final_filename = None

    try:
        output_template = os.path.join(DOWNLOADS_DIR, '%(title)s.%(ext)s')

        ydl_opts = {
            'outtmpl': output_template,
            'progress_hooks': [ProgressHook(download_id, websocket, loop)],
            'merge_output_format': 'mp4',
            'postprocessors': [],
            'ffmpeg_location': '/usr/bin/ffmpeg', # Confirmed path
        }

        if quality == "audio_only":
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'].append({
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            })
            ydl_opts['outtmpl'] = os.path.join(DOWNLOADS_DIR, '%(title)s.%(ext)s')
        elif quality == "best":
            ydl_opts['format'] = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        else: # Specific quality like '1080p', '720p', etc.
            try:
                height = int(quality.lower().replace('p', ''))
                ydl_opts['format'] = f'bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/best[height<={height}][ext=mp4]/best'
            except ValueError: # Fallback if quality string is not a valid height
                ydl_opts['format'] = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best' # Fallback to best quality merged

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            final_filename = ydl.prepare_filename(info) # Get the final name of the downloaded/merged file
            
            # --- Send completed message ONLY after the full download/merge is done ---
            if final_filename and os.path.exists(final_filename):
                size_bytes = os.path.getsize(final_filename)
                completion_data = {
                    'type': 'completed',
                    'download_id': download_id,
                    'filename': os.path.basename(final_filename),
                    'file_path': final_filename,
                    'file_size': f"{size_bytes / (1024**2):.1f} MB",
                }

                if download_id in active_downloads:
                    active_downloads[download_id].update(completion_data)
                    active_downloads[download_id]['status'] = 'completed'

                asyncio.run_coroutine_threadsafe(
                    websocket.send_text(json.dumps(completion_data)),
                    loop
                )
            else:
                raise Exception("Final filename not found after download.")


    except yt_dlp.utils.DownloadError as e:
        error_message = f"YouTube-DL Error: {e}"
        print(f"Download Error for {download_id}: {error_message}")
        error_data = {
            'type': 'error',
            'download_id': download_id,
            'message': error_message,
        }
        if download_id in active_downloads:
            active_downloads[download_id]['status'] = 'error'
            active_downloads[download_id]['error'] = error_message

        asyncio.run_coroutine_threadsafe(
            websocket.send_text(json.dumps(error_data)),
            loop
        )
    except Exception as e:
        error_message = f"An unexpected error occurred during download: {e}"
        print(f"General Error for {download_id}: {error_message}")
        error_data = {
            'type': 'error',
            'download_id': download_id,
            'message': error_message,
        }
        if download_id in active_downloads:
            active_downloads[download_id]['status'] = 'error'
            active_downloads[download_id]['error'] = error_message

        asyncio.run_coroutine_threadsafe(
            websocket.send_text(json.dumps(error_data)),
            loop
        )

@app.get("/")
async def root():
    return {"message": "YouTube Downloader API is running"}

@app.post("/video-info")
async def get_video_info(request: DownloadRequest):
    """
    Retrieves video information including title, thumbnail, duration, and available formats.
    """
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'simulate': True,
            'force_generic_extractor': False,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(request.url, download=False)

            formats = []
            if 'formats' in info:
                seen_heights = set()
                for f in info['formats']:
                    # Filter for video formats that are not 'none' and are mp4/webm
                    if f.get('height') and f.get('vcodec') != 'none' and f.get('ext') in ['mp4', 'webm']:
                        h = f['height']
                        # Add only unique heights to avoid duplicates (e.g., different bitrates for same resolution)
                        if h not in seen_heights:
                            formats.append({
                                'height': h,
                                'format_note': f.get('format_note', ''),
                                'ext': f.get('ext', ''),
                                'filesize': f.get('filesize', 0),
                            })
                            seen_heights.add(h)

                # Add audio-only format option
                audio_formats = [f for f in info['formats'] if f.get('acodec') != 'none' and f.get('vcodec') == 'none']
                if audio_formats:
                    # Find the best quality audio-only format
                    best_audio = max(audio_formats, key=lambda f: f.get('tbr', 0), default=None)
                    if best_audio:
                        formats.append({
                            'height': 'N/A', # Indicates no video height
                            'format_note': 'Audio Only (MP3)',
                            'ext': 'mp3',
                            'filesize': best_audio.get('filesize', 0),
                        })

                # Sort formats by height (descending)
                formats.sort(key=lambda x: x['height'] if isinstance(x['height'], int) else -1, reverse=True)

            return VideoInfo(
                title=info.get('title', 'Unknown Title'),
                thumbnail=info.get('thumbnail', ''),
                duration=info.get('duration', 0),
                uploader=info.get('uploader', 'Unknown'),
                view_count=info.get('view_count', 0),
                upload_date=info.get('upload_date', ''),
                formats=formats,
            )

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error extracting video info: {str(e)}")

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    websocket_connections[client_id] = websocket
    loop = asyncio.get_event_loop()

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message['type'] == 'start_download':
                download_id = str(uuid.uuid4())
                url = message['url']
                quality = message.get('quality', 'best')

                active_downloads[download_id] = {
                    'id': download_id,
                    'url': url,
                    'quality': quality,
                    'status': 'starting',
                    'client_id': client_id,
                }

                await websocket.send_text(json.dumps({
                    'type': 'download_started',
                    'download_id': download_id,
                }))

                download_executor.submit(download_video, url, quality, download_id, websocket, loop)

            elif message['type'] == 'get_downloads':
                client_downloads = {
                    k: v for k, v in active_downloads.items()
                    if v.get('client_id') == client_id
                }
                await websocket.send_text(json.dumps({
                    'type': 'downloads_status',
                    'downloads': client_downloads,
                }))

    except WebSocketDisconnect:
        print(f"WebSocketDisconnect: Client {client_id} disconnected.")
    except Exception as e:
        print(f"WebSocket error for client {client_id}: {e}")
        try:
            await websocket.send_text(json.dumps({'type': 'error', 'message': f'WebSocket internal error: {e}'}))
        except RuntimeError:
            pass # WebSocket might already be closed

    finally:
        websocket_connections.pop(client_id, None)


@app.get("/download/{filename}")
async def download_file(filename: str):
    """Allows downloading a completed file from the 'downloads' directory."""
    file_path = os.path.join(DOWNLOADS_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(path=file_path, filename=filename, media_type='application/octet-stream')
    else:
        raise HTTPException(status_code=404, detail="File not found")

@app.get("/downloads")
async def list_downloads():
    """Lists all files available in the 'downloads' directory."""
    files = []
    if os.path.exists(DOWNLOADS_DIR):
        for filename in os.listdir(DOWNLOADS_DIR):
            file_path = os.path.join(DOWNLOADS_DIR, filename)
            if os.path.isfile(file_path):
                stat = os.stat(file_path)
                files.append({
                    'filename': filename,
                    'size': f"{stat.st_size / (1024**2):.1f} MB",
                    'created': time.ctime(stat.st_ctime),
                })
    return {'files': files}


if __name__ == "__main__":Add commentMore actions
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
 
