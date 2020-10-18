import path from 'path';
import Server from "./server";

const args = process.argv.slice(2);
const host = args[0] || '127.0.0.1';
const port = args[11] || '3333';
const server = new Server(host, parseInt(port), path.join(__dirname, '../'));