/**
 * Copyright reelyActive 2022
 * We believe in an open Internet of Things
 */


const crypto = require('crypto');
const dgram = require('dgram');
const EventEmitter = require('events');
const RaddecRelayUdp = require('raddec-relay-udp');


const RADDEC_PORT = process.env.RADDEC_PORT || 50001;
const DEFAULT_RSSI_THRESHOLD = -50;
const DEFAULT_SESSION_IDENTIFIER_LENGTH = 8;


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
    this.rssiThreshold = DEFAULT_RSSI_THRESHOLD;

    let sources = [ { address: "0.0.0.0", port: RADDEC_PORT } ];
    let raddecHandler = this.handleRaddec.bind(this);
    this.relay = new RaddecRelayUdp({ sources: sources,
                                      raddecHandler: raddecHandler });

  }

  /**
   * Handle the inbound raddec.
   * @param {Raddec} raddec The inbound radio decoding.
   */
  handleRaddec(raddec) {
    let self = this;
    let isActiveTransmitter = this.activeTransmitters.has(raddec.signature);
    let isAboveThreshold = (raddec.rssiSignature[0].rssi >= self.rssiThreshold);

    if(isActiveTransmitter) {
      updateSessions(self, raddec);
    }
    else if(isAboveThreshold) {
      initiateSession(self, raddec);
    }
  }

}


/**
 * Update the sessions with the given raddec.
 * @param {JourneyInterpreter} instance The JourneyInterpreter instance.
 * @param {Raddec} raddec The radio decoding of the active transmitter.
 */
function updateSessions(instance, raddec) {
  let instanceId = raddec.signature;
  let sessionId = instance.activeTransmitters.get(raddec.signature);
  let devices = instance.activeSessions.get(sessionId);

  devices[instanceId] = { raddec: raddec };
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

  devices[raddec.signature] = { raddec: raddec };
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
      devices: instance.activeSessions.get(sessionId),
      timestamp: timestamp
  };

  instance.emit('session', session);
}


module.exports = JourneyInterpreter;
