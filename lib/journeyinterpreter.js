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
const DEFAULT_MIXING_DELAY_MILLISECONDS = 1000;
const DEFAULT_REINITIATION_HOLDOFF_MILLISECONDS = 10000;
const DEFAULT_ADVLIB_FILTERS = null;
const DEFAULT_WHITELISTED_DEVICE_IDS = [];
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

    this.activeSessions = new Map();     // key = sessionId
    this.activeTransmitters = new Map(); // key = raddec.signature
    this.activeInstances = new Map();    // key = instanceId
    this.sessionIdentifierLength = DEFAULT_SESSION_IDENTIFIER_LENGTH;
    this.rssiThreshold = options.rssiThreshold || DEFAULT_RSSI_THRESHOLD;
    this.mixingDelayMilliseconds = options.mixingDelayMilliseconds ||
                                   DEFAULT_MIXING_DELAY_MILLISECONDS;
    this.reinitiationHoldoffMilliseconds =
                                     options.reinitiationHoldoffMilliseconds ||
                                     DEFAULT_REINITIATION_HOLDOFF_MILLISECONDS;
    this.advlibFilters = options.advlibFilters || DEFAULT_ADVLIB_FILTERS;
    this.whitelistedDeviceIds = options.whitelistedDeviceIds ||
                                DEFAULT_WHITELISTED_DEVICE_IDS;

    let barnowlOptions = {
        enableMixing: true,
        mixingDelayMilliseconds: this.mixingDelayMilliseconds
    };

    this.barnowl = new Barnowl(barnowlOptions);
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
    let sessionId = null;
    let instanceId = null;
    let isWhitelisted = false;
    let isPassingFilters = false;

    // Process the packets to determine if whitelisted or passing filters
    try {
      let processedPackets = advlib.process(raddec.packets, PROCESSORS);

      instanceId = lookupWhitelist(processedPackets,
                                   self.whitelistedDeviceIds);
      isWhitelisted = (instanceId !== null);
      isPassingFilters = isPacketsFiltered(processedPackets,
                                           self.advlibFilters);
    }
    catch(error) {}

    // Whitelisted with active session
    if(isWhitelisted && self.activeInstances.has(instanceId)) {
      sessionId = self.activeInstances.get(instanceId);
      self.activeTransmitters.set(raddec.signature, sessionId);
    }
    // Active transmitter with active session
    else if(isActiveTransmitter) {
      sessionId = self.activeTransmitters.get(raddec.signature);
      instanceId = raddec.signature;
    }

    // Journey session initiation in progress...
    if(isAboveThreshold) {
      if(sessionId !== null) {
        let session = self.activeSessions.get(sessionId);
        let isWithinHoldoff = (self.reinitiationHoldoffMilliseconds +
                               session.journeyStartTime) > Date.now();

        // Existing device continuing to initiate a journey
        if(isWithinHoldoff) {
          updateSessions(self, sessionId, raddec, instanceId, true);
        }

        // Existing device (re)initiating a journey
        else {
          self.activeSessions.delete(sessionId);
          initiateSession(self, raddec, instanceId);
        }
      }

      // Whitelisted device initiating journey
      else if(isWhitelisted) {
        initiateSession(self, raddec, instanceId);
      }

      // Other filtered device initiating a journey
      else if(isPassingFilters) {
        initiateSession(self, raddec, raddec.signature);
      }
    }

    // Journey session continuation in progress...
    else if(sessionId !== null) {
      updateSessions(self, sessionId, raddec, instanceId, false);
    }
  }

}


/**
 * Look up the deviceId from the given processed packets against the whitelist.
 * @param {Object} processedPackets The processed packets.
 * @param {Array} whitelistedDeviceIds The whitelisted deviceIds.
 */
function lookupWhitelist(processedPackets, whitelistedDeviceIds) {
  if(processedPackets.hasOwnProperty('deviceIds') &&
     Array.isArray(whitelistedDeviceIds)) {
    for(const deviceId of processedPackets.deviceIds) {
      if(whitelistedDeviceIds.includes(deviceId)) {
        return deviceId;
      }
    }
  }

  return null;
}


/**
 * Determine if the given raddec's packets pass the filters.
 * @param {Object} processedPackets The processed packets.
 * @param {Object} advlibFilters The advlib property filters.
 */
function isPacketsFiltered(processedPackets, advlibFilters) {
  if(!advlibFilters) {
    return true;
  }

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
 * @param {String} sessionId The identifier of the session.
 * @param {Raddec} raddec The radio decoding of the active transmitter.
 * @param {String} instanceId The instanceId to identify the device.
 * @param {boolean} isInitiating Whether initiation is ongoing or not.
 */
function updateSessions(instance, sessionId, raddec, instanceId, isInitiating) {
  let session = instance.activeSessions.get(sessionId);

  if(isInitiating) {
    session.journeyStartTime = Date.now();
  }

  session.devices[raddec.signature] = { raddec: raddec  };
  instance.activeSessions.set(sessionId, session);

  emitSession(instance, sessionId, instanceId, raddec.initialTime);
}


/**
 * Initiate a session creation based on the given raddec.
 * @param {JourneyInterpreter} instance The JourneyInterpreter instance.
 * @param {Raddec} raddec The radio decoding of the transmitter above threshold.
 * @param {String} instanceId The instanceId used to identify the device.
 */
function initiateSession(instance, raddec, instanceId) {
  let session = {
      devices: {},
      creationTime: Date.now(),
      journeyStartTime: Date.now()
  };
  let sessionId = crypto.randomBytes(instance.sessionIdentifierLength)
                        .toString('hex');

  instance.activeTransmitters.set(raddec.signature, sessionId);
  instance.activeInstances.set(instanceId, sessionId);

  session.devices[raddec.signature] = { raddec: raddec };
  instance.activeSessions.set(sessionId, session);

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
      nearest: determineNearest(instance.activeSessions.get(sessionId).devices),
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
