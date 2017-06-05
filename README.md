# bus &nbsp;&nbsp; [![TypeScript](https://badges.frapsoft.com/typescript/code/typescript.svg?v=101)](https://github.com/ellerbrock/typescript-badges/) [![npm](https://img.shields.io/npm/v/@art-of-coding/bus.svg)](https://www.npmjs.com/package/@art-of-coding/bus) [![npm](https://img.shields.io/npm/l/@art-of-coding/bus.svg)](https://www.npmjs.com/package/@art-of-coding/bus)

**bus** provides a high-level way to work with MQTT. Under the hood it uses
the excellent [MQTT.js](https://github.com/mqttjs/MQTT.js) module.

The module is written in [TypeScript](https://www.typescriptlang.org/) and has the
required declaration files included. It can also be used in vanilla JS.

> bus is currently in active development and breaking changes may be introduced
> without warning! This will remain true at least as long as the module is in
> alpha (e.g. 0.0.1-alpha.1)

* [Install](#install)
* [Example](#example)
* [API](#api)
* [Inspired by](#inspiredby)
* [License](#license)

------------------------------------------------

<a name="install"></a>
## Install

bus can be installed using npm:

```
npm install @art-of-coding/bus
```

------------------------------------------------

<a name="example"></a>
## Example

This basic example shows how to use the basic functionality.

```ts
import { Bus } from '@art-of-coding/bus'

// Create a new Bus instance with the given client ID and broker URL
const bus = Bus.create('my-client-id', 'mqtt://localhost')

// Set up a topic pattern identified by the label `configUpdated`
// `+deviceId` and '#keys' are parameterized wildcards
bus.setPattern('configUpdated', 'devices/+deviceId/config/#keys')

// Add a listener for `configUpdated`
// This function is called each time a publish packet is received on the
// topic identified by the label
bus.on('configUpdated', function (packet) {
  // We can use packet.params to access the pattern parameters
  console.log(`Device ${packet.params.deviceId} config updated:
  ${packet.params.keys.join('/')} is now ${packet.payload})`)
})

// Now, connect to the broker
bus.connect().then(() => {
  console.log('connected to broker')

  // Subscribe to the topic with label `configUpdated`
  return bus.subscribe('configUpdated')
}).then(() => {
  console.log('subscribed to configUpdated')

  // Publish a config update on the same pattern
  // This will publish the word 'localhost' on topic devices/my-device/config/http/host
  return bus.publish('configUpdated', { deviceId: 'my-device', keys: [ 'http', 'host' ] }, 'localhost')
}).then(() => {
  console.log('update published')

  // We're done, so we'll close the connection
  return bus.end()
}).then(() => {
  console.log('disconnected from broker')
}).catch(err => {
  // One of the steps above threw an error
  console.error('Got an error:')
  console.error(err)
})
```

------------------------------------------------

<a name="api"></a>
## API

* [Bus.create()](#create)
* [bus.getId()](#getid)
* [bus.isAvailable()](#isavailable)
* [bus.getStatus()](#getstatus)
* [bus.getStatusError()](#getstatuserror)
* [bus.onStatusChange()](#onstatuschange)
* [bus.setPattern()](#setpattern)
* [bus.removePattern()](#removepattern)
* [bus.on()](#on)
* [bus.once()](#once)
* [bus.removeListener()](#removelistener)
* [bus.removeAllListeners()](#removealllisteners)
* [bus.connect()](#connect)
* [bus.end()](#end)
* [bus.subscribe()](#subscribe)
* [bus.unsubscribe()](#unsubscribe)
* [bus.publish()](#publish)

------------------------------------------------

<a name="create"></a>
### Bus.create (clientId: string, url: string, opts?: IBusOptions): Bus

Creates a new Bus instance.

* `clientId`: The instance's client ID
* `url`: The broker URL (e.g. `mqtt://localhost:3306`)
* `opts`: MQTT.js options (see [here](https://github.com/mqttjs/MQTT.js#client))
  * `clientId` is **always** overwritten by the Id given as the first parameter

```ts
import { Bus } from '@art-of-coding/bus'
// or
const Bus = require('@art-of-coding/bus')

// create a Bus instance
const bus = Bus.create('my-client-id', 'mqtt://localhost')
```

------------------------------------------------

<a name="getid"></a>
### bus.getId (): string

Get the client ID for the instance.

------------------------------------------------

<a name="isavailable"></a>
### bus.isAvailable (): boolean

Check to see if the bus is available and can be used.

------------------------------------------------

<a name="getstatus"></a>
### bus.getStatus (): Status

Get the instance status. The return value is an integer and corresponds to the
`Status` enum:

| Status       | Code |
|--------------|------|
| READY        | 0    |
| CONNECTING   | 1    |
| CONNECTED    | 2    |
| RECONNECTING | 3    |
| OFFLINE      | 4    |
| CLOSED       | 5    |
| ERROR        | 6    |

------------------------------------------------

<a name="getstatuserror"></a>
### bus.getStatusError (): Error|null

Get the last error, or `null` if no error occured yet.
Is usually only available when `bus.getStatus()` returns `ERROR`.

------------------------------------------------

<a name="onstatuschange"></a>
### bus.onStatusChange (fn: (status: Status, error: Error) => void): void

Set a method which will be called each time the bus's status changes.

```ts
bus.onStatusChange(function (status: Status, error: Error) {
  const withOrWithout = error ? 'with' : 'without'
  console.log(`Status changed to ${status} (${withOrWithout} error)`)
})
```

------------------------------------------------

<a name="setpattern"></a>
### bus.setPattern (label: string, pattern: string): Bus

Set a topic pattern with the given label. When set, a `pattern` can be referenced
by using its `label`. For more on topic patterns, [see the mqtt-regex readme](https://github.com/RangerMauve/mqtt-regex/blob/master/README.md#api).

* This method will throw if the label already exists or the pattern is invalid
* This method returns the bus instance, so calls can be chained

------------------------------------------------

<a name="removepattern"></a>
### bus.removePattern (label: string): Bus

Removes a topic pattern with the given label.

* This method will throw if the label doesn't exist
* This method returns the bus instance, so calls can be chained

------------------------------------------------

<a name="on"></a>
### bus.on (label: string, fn: (packet: IPacket) => void): Bus

Add a listener for the given `label`. This listener is called each time a message
is received on a topic that matches the pattern accompanying the label.

* **Note:** bus is _not an EventEmitter_! Therefore, not all methods for regular
event emitters will work!
* This method will throw if the label doesn't exist
* This method returns the bus instance, so calls can be chained

------------------------------------------------

<a name="once"></a>
### bus.once (label: string, fn: (packet: IPacket) => void): Bus

Adds a once listener for the given `label`. The listener is called the next time
a message that matches the topic pattern is received, then it is removed.

* **Note:** bus is _not an EventEmitter_! Therefore, not all methods for regular
event emitters will work!
* This method will throw if the label doesn't exist
* This method returns the bus instance, so calls can be chained

------------------------------------------------

<a name="removelistener"></a>
### bus.removeListener (label: string, fn: (packet: IPacket) => void): Bus

Removes the listener method for the given `label`. The method will no longer be
called.

* **Note:** bus is _not an EventEmitter_! Therefore, not all methods for regular
event emitters will work!
* This method will throw if the label doesn't exist
* This method returns the bus instance, so calls can be chained

------------------------------------------------

<a name="removealllisteners"></a>
### bus.removeAllListeners (label?: string): Bus

Removes all listeners. When `label` is set, only that label's listeners will be
removed. Otherwise, all listeners (for all labels) will be removed.

* **Note:** bus is _not an EventEmitter_! Therefore, not all methods for regular
event emitters will work!
* This method will throw if the label doesn't exist
* This method returns the bus instance, so calls can be chained

------------------------------------------------

<a name="connect"></a>
### bus.connect(): Promise<IConnackPacket>

Connect to the broker.

```ts
bus.connect().then(() => {
  console.log('connected!')
}).catch(err => {
  console.error(err)
})
```

------------------------------------------------

<a name="end"></a>
### bus.end (force: boolean = false): Promise<null>

Closes the connection to the broker. If `force` is `true`, the connection will be
closed without waiting for in-flight packages fo be acked.

------------------------------------------------

<a name="subscribe"></a>
### bus.subscribe (label: string, opts?: IClientSubscribeOptions): Promise<ISubscriptionGrant>

Subscribe to the topic pattern identified by `label`.

`opts`:
 * `qos`: qos subscription level, (default `0`)

------------------------------------------------

<a name="unsubscribe"></a>
### bus.unsubscribe (label: string, removeListeners: boolean = false): Promise<null>

Unsubscribes from the topic patternn identified by `label`. If `removeListeners`
is `true`, all added listeners for the label will be removed as well.

------------------------------------------------

<a name="publish"></a>
### bus.publish (label: string, params: any, payload: any, opts?: IClientPublishOptions): Promise<null>

Published the `payload` on the topic pattern identified by `label`, with the
parameters `params`. If you have no parameters, use an empty object (`{}`) instead.

`opts`:
 * `qos`: QoS level (default `0`)
 * `retain`: retain flag (default `false`)
 * `dup`: mark as duplicate (default `false`)

```ts
// Set a pattern `myLabel` with one parameter (`+name`)
bus.setPattern('myLabel', 'topics/+name')

// Make the parameters object
const params = { name: 'my-topic' }
// Set the payload
const payload = 'Hello, topic!'

// Publish the payload on the label with the given parameters
bus.publish('myLabel', params, payload)
```

------------------------------------------------

<a name="inspiredby"></a>
## Inspired by

- [MQTT.js](https://github.com/mqttjs/MQTT.js), which this module uses under the hood
- [mqtt-regex](https://github.com/RangerMauve/mqtt-regex), whose support for parameterized
topics is integrated

------------------------------------------------

<a name="license"></a>
## License

Copyright 2017 [Michiel van der Velde](http://www.michielvdvelde.nl).

This software is licensed under the [MIT License](LICENSE).
