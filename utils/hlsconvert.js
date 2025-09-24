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

    const command = `
      ffmpeg -y -threads 1 -i "${inputPath}" -preset fast \
      -filter:v:0 "scale=w=640:h=360:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" \
      -c:a aac -ar 48000 -b:a:0 96k -c:v:0 h264 -profile:v:0 main -crf 20 \
      -g 48 -keyint_min 48 -sc_threshold 0 -b:v:0 800k -maxrate:v:0 856k \
      -bufsize:v:0 1200k -hls_time 10 -hls_playlist_type vod \
      -hls_segment_filename "${absOutputDir}/${outputName}_360p_%03d.ts" \
      "${absOutputDir}/${outputName}_360p.m3u8" \
      -filter:v:1 "scale=w=1280:h=720:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" \
      -c:a aac -ar 48000 -b:a:1 128k -c:v:1 h264 -profile:v:1 main -crf 20 \
      -g 48 -keyint_min 48 -sc_threshold 0 -b:v:1 2800k -maxrate:v:1 2996k \
      -bufsize:v:1 4200k -hls_time 10 -hls_playlist_type vod \
      -hls_segment_filename "${absOutputDir}/${outputName}_720p_%03d.ts" \
      "${absOutputDir}/${outputName}_720p.m3u8" \
      -filter:v:2 "scale=w=1920:h=1080:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2" \
      -c:a aac -ar 48000 -b:a:2 192k -c:v:2 h264 -profile:v:2 high -crf 20 \
      -g 48 -keyint_min 48 -sc_threshold 0 -b:v:2 5000k -maxrate:v:2 5350k \
      -bufsize:v:2 7500k -hls_time 10 -hls_playlist_type vod \
      -hls_segment_filename "${absOutputDir}/${outputName}_1080p_%03d.ts" \
      "${absOutputDir}/${outputName}_1080p.m3u8"
    `;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ HLS conversion failed:", stderr);
        return reject(new Error(stderr));
      }

      const masterPlaylist = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
${outputName}_360p.m3u8
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

