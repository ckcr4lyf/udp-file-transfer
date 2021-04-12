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
ffmpeg -re -i "Source.avi" -c:v libx264 -b:v 500k -c:a aac -ac 2 -b:a 128k -hls_time 10 -hls_flags temp_file -hls_list_size 10 live.m3u8
ffmpeg -i caes.mp4 -c:v copy -c:a copy -hls_time 10 -hls_playlist_type vod -t 100 caes.m3u8
```


### Third peer

```
node .\build\app.js 5555 peer2 peer 127.0.0.1 4444
```