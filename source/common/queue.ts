/**
 * queue contains functions that rely on jobs[] and peers[],
 * and schedules segments to be download by those whom are available
 */

import { FILES, FOLDER_ROOT, JOBS, PEERS, QUEUE_LOG } from "../app";
import RequestHandler from "../request";
import { JOB_STATUS, PEER_STATUS, STATUS } from "./constants"
import { Job, peerInfo } from "./interfaces"

export const addJob = (filename: string, seedjob: Job | null = null) => {

    let job: Job;

    if (seedjob === null){
        job = {
            filename: filename,
            status: JOB_STATUS.CREATED,
            peersTried: [],
            handler: null,
        };
    
        JOBS.push(job);
        job.status = JOB_STATUS.QUEUED;
        QUEUE_LOG.debug(`Created job for ${filename} and added to queue`);
    } else {
        job = seedjob;
    }

    // Find a free peer
    const availablePeers = PEERS.filter(peer => {
        // Check to make sure not used before, and that its available
        return !job.peersTried.includes(peer.hash) && peer.status === PEER_STATUS.AVAILABLE
    });  

    if (availablePeers.length === 0){
        QUEUE_LOG.warn(`No peers available. Going to leave job for ${filename} in queue.`);
        // At this point, should we re-run the queue?
        return;
    }

    const index = Math.floor(Math.random() * availablePeers.length);
    const chosenPeer = availablePeers[index];
    QUEUE_LOG.debug(`Chose peer ${chosenPeer.peerAddress}:${chosenPeer.peerPort} for ${filename}`);
    chosenPeer.status = PEER_STATUS.BUSY;
    job.status = JOB_STATUS.DOWNLOADING;
    assignJob(job, chosenPeer);

    // TBD: Do we need this?
    // return new Promise((resolve, reject) => {
    //     job.resolve = resolve;
    //     job.reject = reject;
    // });
}

const assignJob = async (job: Job, peer: peerInfo) => {

    // Create request handler
    const requestHandler = new RequestHandler(peer.peerAddress, peer.peerPort, FOLDER_ROOT, null);
    QUEUE_LOG.info(`Created request handler for ${job.filename} w/ ${peer.peerAddress}:${peer.peerPort}`);
    job.peersTried.push(peer.hash);
    
    try {
        await requestHandler.requestFile(job.filename);
        QUEUE_LOG.debug(`Downloaded ${job.filename} from ${peer.peerAddress}:${peer.peerPort}`);
        peer.status = PEER_STATUS.AVAILABLE;
        FILES[job.filename].status = STATUS.HAVE;
        // Free up the peer, poll for queued jobs
        checkJobs();
    } catch (error){
        QUEUE_LOG.error(`Failed to download segment from ${peer.peerAddress}:${peer.peerPort}. Will re-add to queue.`)
        //TODO: Free this peer, try another one.
        peer.status = PEER_STATUS.AVAILABLE;
        addJob(job.filename, job);
        // Check the other jobs as well
        checkJobs();
    }

    requestHandler.socket.close();
}

const checkJobs = () => {
    for (let x = 0; x < JOBS.length; x++){
        if (JOBS[x].status === JOB_STATUS.QUEUED){
            QUEUE_LOG.debug(`Found a job in queue on poll! Trying to add...`);
            addJob(JOBS[x].filename, JOBS[x]);
            break; // We freed one peer, so check one.
        }
    }
}