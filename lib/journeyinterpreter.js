/**
 * Copyright reelyActive 2022
 * We believe in an open Internet of Things
 */


const crypto = require('crypto');
const dgram = require('dgram');
const EventEmitter = require('events');
const Barnowl = require('barnowl');
const advlib = require('advlib');


const RADDEC_PATH = process.env.RADDEC_PATH || '0.0.0.0:50001';
const DEFAULT_RSSI_THRESHOLD = -50;
const DEFAULT_ADVLIB_FILTERS = null;
const DEFAULT_SESSION_IDENTIFIER_LENGTH = 8;
const PROCESSORS = [
    { processor: require('advlib-ble'),
      libraries: [ require('advlib-ble-services'),
                   require('advlib-ble-manufacturers') ],
      options: { ignoreProtocolOverhead: true } }
];


/**
 * JourneyInterpreter Class
 * Interpret an ambient stream of radio decodings as journeys of individual
 * devices, or a group of devices moving together, in the form of ephemeral
 * sessions.
 */
class JourneyInterpreter extends EventEmitter {

  /**
   * JourneyIntepreter constructor
   * @param {Object} options The configuration options.
   * @constructor
   */
  constructor(options) {
    super();
    options = options || {};

    this.activeSessions = new Map();
    this.activeTransmitters = new Map();
    this.sessionIdentifierLength = DEFAULT_SESSION_IDENTIFIER_LENGTH;
    this.rssiThreshold = options.rssiThreshold || DEFAULT_RSSI_THRESHOLD;
    this.advlibFilters = options.advlibFilters || DEFAULT_ADVLIB_FILTERS;

    this.barnowl = new Barnowl({ enableMixing: true });
    this.barnowl.on('raddec', this.handleRaddec.bind(this));
    this.barnowl.addListener(Barnowl, {},
                             Barnowl.UdpListener, { path: RADDEC_PATH });
  }

  /**
   * Handle the inbound raddec.
   * @param {Raddec} raddec The inbound radio decoding.
   */
  handleRaddec(raddec) {
    let self = this;
    let isActiveTransmitter = this.activeTransmitters.has(raddec.signature);
    let isAboveThreshold = (raddec.rssiSignature[0].rssi >= self.rssiThreshold);

    if(isAboveThreshold) {
      if(isActiveTransmitter) {
        let sessionId = self.activeTransmitters.get(raddec.signature);
        let devices = self.activeSessions.get(sessionId);

        // Journey session initiation in progress
        if(devices[raddec.signature].isInitiating) {
          updateSessions(self, raddec, true);
        }

        // Existing device (re)initiating a journey
        else {
          self.activeSessions.delete(sessionId);
          initiateSession(self, raddec);
        }
      }

      // New device initiating a journey
      else if(isPassingFilters(raddec, self.advlibFilters)) {
        initiateSession(self, raddec);
      }
    }

    // The journey session continues...
    else if(isActiveTransmitter) {
      updateSessions(self, raddec, false);
    }
  }

}


/**
 * Decode the given raddec's payload to determine if it is passing the filters.
 * @param {Raddec} raddec The radio decoding.
 * @param {Object} advlibFilters The advlib property filters.
 */
function isPassingFilters(raddec, advlibFilters) {
  if(!advlibFilters) {
    return true;
  }

  let processedPackets = advlib.process(raddec.packets, PROCESSORS);

  for(const filterProperty in advlibFilters) {
    let filter = advlibFilters[filterProperty];

    if(processedPackets.hasOwnProperty(filterProperty) &&
       (typeof processedPackets[filterProperty] === typeof filter)) {
      switch(filterProperty) {
        case 'uuids':
        case 'deviceIds': // TODO: handle partial device ids
          for(const id of filter) {
            if(processedPackets[filterProperty].includes(id)) { return true; }
          }
          break;
        default:
          if(filter === processedPackets[filterProperty]) {
            return true;
          }
      }
    }
  }

  return false;
}


/**
 * Update the sessions with the given raddec.
 * @param {JourneyInterpreter} instance The JourneyInterpreter instance.
 * @param {Raddec} raddec The radio decoding of the active transmitter.
 * @param {boolean} isInitiating Whether initiation is ongoing or not.
 */
function updateSessions(instance, raddec, isInitiating) {
  let instanceId = raddec.signature;
  let sessionId = instance.activeTransmitters.get(raddec.signature);
  let devices = instance.activeSessions.get(sessionId);

  devices[raddec.signature] = { raddec: raddec, isInitiating: isInitiating };
  instance.activeSessions.set(sessionId, devices);

  emitSession(instance, sessionId, instanceId, raddec.initialTime);
}


/**
 * Initiate a session creation based on the given raddec.
 * @param {JourneyInterpreter} instance The JourneyInterpreter instance.
 * @param {Raddec} raddec The radio decoding of the transmitter above threshold.
 */
function initiateSession(instance, raddec) {
  let devices = {};
  let instanceId = raddec.signature;
  let sessionId = crypto.randomBytes(instance.sessionIdentifierLength)
                        .toString('hex');

  instance.activeTransmitters.set(instanceId, sessionId);

  devices[raddec.signature] = { raddec: raddec, isInitiating: true };
  instance.activeSessions.set(sessionId, devices);

  emitSession(instance, sessionId, instanceId, raddec.initialTime);
}


/**
 * Emit the session with the given session id.
 * @param {JourneyInterpreter} instance The JourneyInterpreter instance.
 * @param {String} sessionId The session id.
 * @param {String} instanceId The instance id.
 * @param {Number} timestamp The time of the radio decoding.
 */
function emitSession(instance, sessionId, instanceId, timestamp) {
  let session = {
      sessionId: sessionId,
      instanceId: instanceId,
      nearest: determineNearest(instance.activeSessions.get(sessionId)),
      timestamp: timestamp
  };

  instance.emit('session', session);
}


/**
 * Determine the nearest receivers to the given device(s).
 * @param {Object} devices The devices associated with the session.
 */
function determineNearest(devices) {
  let nearest = [];

  for(const device in devices) {
    let raddec = devices[device].raddec;
    nearest = raddec.rssiSignature;
    // TODO: merge nearest in case where a session/instance involves
    //       multiple devices
  }

  return nearest;
}


module.exports = JourneyInterpreter;
