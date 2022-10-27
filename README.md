journey-interpreter
===================

Interpret an ambient stream of radio decodings as journeys of individual devices, or a group of devices moving together, in the form of ephemeral sessions.


Quick Start
-----------

The __journey-interpreter__ will listen for UDP [raddec](https://github.com/reelyactive/journey-interpreter) packets on localhost:50001.

```
const JourneyInterpreter = require('journey-interpreter');

// These are the default options
let options = {
    sessionIdentifierLength: 8,
    rssiThreshold: -50,
    mixingDelayMilliseconds: 1000,
    reinitiationHoldoffMilliseconds: 10000,
    advlibFilters: null,
    whitelistedDeviceIds: [],
    isSessionLoggingEnabled: false
};

let interpreter = new JourneyInterpreter(options);

interpreter.on('session', (session) => { console.log(session); });
```


Session Data
------------

The session data has the following form:

    {
      sessionId: "938c43ec5709e587",
      instanceId: "001122334455/2",
      nearest: [
        {
          receiverId: "001bc50940820000",
          receiverIdType: 1,
          rssi: -42,
          numberOfDecodings: 5
        }
      ],
      timestamp: 1653123456789
    }


Filtering on specific devices
-----------------------------

It is possible to filter on _specific_ devices that transmit iBeacon or Eddystone-UID packets via the advlibFilters below, respectively:

```
let options = {
    advlibFilters: { deviceIds: [ '00112233445566778899aabbccddeeff/0000/0000',
                                  '00112233445566778899/000000000001' ] }
};
```

For devices (such as smartphones) which periodically cycle their advertiser address, it is recommended to additionally whitelist the iBeacon or Eddystone-UID identifier so that the sessionId is unaffected by this cycling:

```
let options = {
    advlibFilters: { deviceIds: [ '00112233445566778899aabbccddeeff/0000/0000',
                                  '00112233445566778899/000000000001' ] },
    whitelistedDeviceIds: [ '00112233445566778899aabbccddeeff/0000/0000',
                            '00112233445566778899/000000000001' ]
};
```


License
-------

MIT License

Copyright (c) 2022 [reelyActive](https://www.reelyactive.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
