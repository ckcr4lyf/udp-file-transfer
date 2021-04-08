import Peer from "./peer";

const args = process.argv.slice(2);
const filename = args[0] || 'file1.bin';
const server = args[1] || '127.0.0.1';
const port = args[2] || '3333';
// console.log(server, port);
const peer = new Peer(server, parseInt(port));

(async () => {
    
    try {
        // This function really only SENDS the packet, a separate function is the 
        // receive handler, but the promise resolution is stored as a class variable,
        // so the handler can resolve it.
        await peer.ping(); 
    } catch {
        console.log('Server did not respond to ping!');
        process.exit(1);
    }

    //TBD: This should be a promise which resolves when that thingy is done.
    await peer.requestFile('caes0.ts');
    await peer.requestFile('caes1.ts');
    await peer.requestFile('caes2.ts');
    await peer.requestFile('caes3.ts');
    await peer.requestFile('caes4.ts');
    await peer.requestFile('caes5.ts');
    await peer.requestFile('caes6.ts');
    await peer.requestFile('caes7.ts');
    await peer.requestFile('caes8.ts');
    await peer.requestFile('caes9.ts');
})();