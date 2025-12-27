const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');
const path = require('path');
const axios = require('axios');
const app = express();

app.use(cors());

// Render එකේදී Port එක dynamic ලෙස ලැබෙන නිසා
const PORT = process.env.PORT || 4000;

app.get('/info', (req, res) => {
    const videoURL = req.query.url;
    if (!videoURL) return res.status(400).json({ error: 'URL is required' });

    // Render එකේදී අපි yt-dlp root එකටම install කරන නිසා path එක මෙසේ වේ
    const ytDlpPath = './yt-dlp'; 
    const cookiesPath = path.join(__dirname, 'cookies.txt');

    const args = [videoURL, '--dump-single-json', '--no-check-certificates', '--cookies', cookiesPath];

    execFile(ytDlpPath, args, (error, stdout) => {
        if (error) return res.status(500).json({ success: false, error: 'Failed to fetch info' });

        try {
            const info = JSON.parse(stdout);
            const formats = info.formats
                .filter(f => f.url && f.ext !== 'mhtml')
                .map(f => {
                    const hasAudio = f.acodec !== 'none' && f.acodec !== undefined;
                    const hasVideo = f.vcodec !== 'none' && f.vcodec !== undefined;
                    
                    let type = 'video';
                    if (hasVideo && hasAudio) type = 'combined';
                    else if (hasVideo) type = 'video_only';
                    else if (hasAudio) type = 'audio_only';

                    let q = hasVideo ? (f.height ? f.height + 'p' : 'Video') : (f.abr ? Math.round(f.abr) + 'kbps' : 'Audio');
                    let s = f.filesize ? (f.filesize / (1024 * 1024)).toFixed(2) + ' MB' : 
                            (f.filesize_approx ? (f.filesize_approx / (1024 * 1024)).toFixed(2) + ' MB' : '---');

                    return { quality: q, size: s, ext: f.ext, url: f.url, type: type };
                }).reverse();

            res.json({
                success: true,
                title: info.title,
                thumbnail: info.thumbnail,
                duration: new Date(info.duration * 1000).toISOString().substr(11, 8),
                author: info.uploader,
                formats: formats
            });
        } catch (e) { res.status(500).json({ success: false, error: 'Data error' }); }
    });
});

app.get('/proxy', async (req, res) => {
    const downloadUrl = req.query.url;
    const fileName = req.query.title || 'video';
    if (!downloadUrl) return res.status(400).send('URL missing');

    try {
        const response = await axios({
            method: 'get',
            url: downloadUrl,
            responseType: 'stream',
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\x00-\x7F]/g, "")}.mp4"`);
        response.data.pipe(res);
    } catch (error) { res.status(500).send('Download failed'); }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));