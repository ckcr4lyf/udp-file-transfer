# Setup

Make sure you have node (obviously) and typescript

```
npm i -g typescript
npm install
```

Then, build with
```
npm run build
```


## Stuff

### To make a HLS thingy from an existing video

As a VOD:

```
ffmpeg -i s01e01.mkv -c:v libx264 -vf scale=960:-1 -b:v 500k -preset medium -c:a copy -hls_time 4 -hls_playlist_type vod -t 100 sensei.m3u8
ffmpeg -i caes.mp4 -c:v copy -c:a copy -hls_time 10 -hls_playlist_type vod -t 100 caes.m3u8
```