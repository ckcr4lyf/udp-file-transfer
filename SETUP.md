
## Source

Prepare ffmpeg stream:

```
ffmpeg -re -i "input.mp4" -c:v libx264 -b:v 1000k -preset slower -force_key_frames "expr:gte(t,n_forced*2)" -c:a aac -ac 2 -b:a 128k -hls_time 10 -hls_flags temp_file -hls_list_size 10 live.m3u8
```

Start server (initial seed)
```
node .\build\app.js 3333 sendFiles server
```

Host source:
```
http-server.cmd -p 1336 .
```

Play source:
```
ffplay http://127.0.0.1:1336/live.m3u8 -live_start_index 0 -window_title "Source"
```

## Peer 1

Start
```
node ./build/app.js 4444 recvFiles peer 127.0.0.1 3333
```

Host peer1:
```
http-server.cmd -p 1337 .
```

Play peer1:
```
ffplay http://127.0.0.1:1337/live.m3u8 -live_start_index 0 -window_title "Peer 1"
```

## Peer 2

Start
```
node ./build/app.js 5555 recvFiles peer 127.0.0.1 4444
```

Host peer2:
```
http-server.cmd -p 1338 .
```

Play peer2:
```
ffplay http://127.0.0.1:1338/live.m3u8 -live_start_index 0 -window_title "Peer 2"
```