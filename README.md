# Setup

This project requires node v14+ and typescript v4+. 

Once you have node, you can install dependencies and build the project with:

```
npm i -g typescript
npm i -g http-server
npm install
npm run build
```

## Server

It is recommended to make a directory called `sendFiles` in the project root. The HLS stream should be pointed to be stored in this directory. 

An HLS stream can be generated from an existing video file with the following ffmpeg command:

```
ffmpeg -re -i "Input.File.mkv" -map 0:v:0 -c:v:0 libx264 -b:v:0 1000k -preset slower -force_key_frames "expr:gte(t,n_forced*2)" -map 0:a:0 -c:a:0 aac -ac 2 -b:a:0 128k -hls_time 10 -hls_flags temp_file -hls_list_size 10 /path/to/sendFiles/live.m3u8
```

The server can then be started by running the following command in the parent directory:

```
node build/app.js 3333 sendFiles server
```

where `3333` is the server's listening port.

## Peers

For each peer, create an empty folder called "peerX" in the project root, with X being the peer number. 

Then, start the app in peer mode and point it to this directory with the following command:

```
node build/app.js 4444 peerX peer 127.0.0.1 3333
```

where `4444` is the peer's listening port, `127.0.0.1` & `3333` are an existing peer's address and port respectively.


## Playback

Host the project directory as an open directory over http by running:

```
http-server -p 1337 .
```

Then navigate to `http://127.0.0.1:1337/`. Enter the `peerX` folder, and copy the link to the manifest file `live.m3u8`. 

Then, the player can be started with the command:

```
ffplay "http://127.0.0.1:1337/peerX/live.m3u8" -live_start_index 0
```
