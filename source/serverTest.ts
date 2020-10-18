import path from 'path';
import Server from "./server";

const server = new Server('127.0.0.1', 3333, path.join(__dirname, '../'));