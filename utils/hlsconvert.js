import { exec } from "child_process";
import path from "path";
import fs from "fs";

const convertToHls = (inputPath, outputDir, outputName) => {
  return new Promise((resolve, reject) => {
    const absOutputDir = path.resolve(outputDir);
    const absOutputPath = path.join(absOutputDir, outputName);

    if (!fs.existsSync(absOutputDir)) {
      fs.mkdirSync(absOutputDir, { recursive: true });
    }

    // ✅ Updated FFmpeg command (5s chunks, 720p + 1080p only)
    const command = `
      ffmpeg -y -threads 1 -i "${inputPath}" -preset veryfast -movflags +faststart \
      -filter:v:0 "scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" \
      -c:a aac -ar 48000 -b:a:0 128k -c:v:0 h264 -profile:v:0 main -crf 23 \
      -g 48 -keyint_min 48 -sc_threshold 0 -b:v:0 2500k -maxrate:v:0 2800k -bufsize:v:0 4200k \
      -hls_time 5 -hls_playlist_type vod -hls_flags independent_segments \
      -hls_segment_filename "${absOutputDir}/${outputName}_720p_%03d.ts" \
      "${absOutputDir}/${outputName}_720p.m3u8" \
      -filter:v:1 "scale=w=1920:h=1080:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" \
      -c:a aac -ar 48000 -b:a:1 192k -c:v:1 h264 -profile:v:1 high -crf 23 \
      -g 48 -keyint_min 48 -sc_threshold 0 -b:v:1 4500k -maxrate:v:1 5000k -bufsize:v:1 6000k \
      -hls_time 5 -hls_playlist_type vod -hls_flags independent_segments \
      -hls_segment_filename "${absOutputDir}/${outputName}_1080p_%03d.ts" \
      "${absOutputDir}/${outputName}_1080p.m3u8"
    `;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ HLS conversion failed:", stderr);
        return reject(new Error(stderr));
      }

      // ✅ Create master playlist for adaptive streaming
      const masterPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
${outputName}_720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
${outputName}_1080p.m3u8
`;

      fs.writeFileSync(`${absOutputPath}.m3u8`, masterPlaylist);
      console.log("✅ HLS conversion completed:", `${absOutputPath}.m3u8`);
      resolve(`${absOutputPath}.m3u8`);
    });
  });
};

export default convertToHls;