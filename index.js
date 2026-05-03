const express = require('express');
const cors = require('cors');
const { create } = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');

// Use system yt-dlp on Linux (Railway), bundled binary on Windows (local dev)
const ytdlBin = process.platform === 'linux' ? 'yt-dlp' : undefined;
const yt = ytdlBin ? create(ytdlBin) : require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
}

// Get video information
app.get('/api/video-info', async (req, res) => {
    try {
        const { url } = req.query;
        if (!url) {
            return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
        }

        const info = await yt(url, { dumpJson: true });
        
        const details = {
            title: info.title,
            thumbnail: info.thumbnail,
            author: info.uploader,
            lengthSeconds: info.duration,
        };

        res.json({ details, formats: [] });
    } catch (error) {
        console.error('Error fetching video info:', error);
        res.status(500).json({ error: 'Failed to fetch video information. Please try again.' });
    }
});

// Download video
app.get('/api/download', async (req, res) => {
    try {
        const { url, itag } = req.query;
        if (!url) return res.status(400).send('Invalid YouTube URL');

        const info = await yt(url, { dumpJson: true });
        const title = info.title.replace(/[^\w\s-]/gi, ''); 
        
        let formatId = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'; 
        if (itag === 'best[height<=480]') formatId = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best';
        if (itag === 'worst') formatId = 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best';

        const fileName = `${title}-${Date.now()}.mp4`;
        const filePath = path.join(downloadsDir, fileName);
        
        console.log(`Starting download for: ${title} with format: ${formatId}`);
        
        const isLinux = process.platform === 'linux';
        const ffmpegPath = isLinux ? 'ffmpeg' : ffmpeg;

        await yt(url, {
            format: formatId,
            output: filePath,
            ffmpegLocation: ffmpegPath,
            mergeOutputFormat: 'mp4',
            noPart: true,
            extractorArgs: 'youtube:player_client=android'
        });

        console.log(`Download complete, sending file: ${filePath}`);
        
        res.download(filePath, `${title}.mp4`, (err) => {
            if (err) console.error('Error sending file:', err);
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting temp file:', unlinkErr);
            });
        });

    } catch (error) {
        console.error('Download error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'Failed to process download' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
