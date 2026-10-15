import { parentPort, workerData } from 'node:worker_threads';
import { upcoming } from './calendar.js';

// Runs the heavy iCal parsing off the main thread so the dashboard never stalls on a big calendar.
parentPort.postMessage(upcoming(workerData.text));
