import Peer from "./peer";

const args = process.argv.slice(2);

const filename = args[0] || 'file1.bin';
const server = args[1] || '127.0.0.1';
const port = args[2] || '3333';

const peer = new Peer(server, parseInt(port));
peer.requestFile(filename);