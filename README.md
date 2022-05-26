journey-interpreter
===================

Interpret an ambient stream of radio decodings as journeys of individual devices, or a group of devices moving together, in the form of ephemeral sessions.


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
