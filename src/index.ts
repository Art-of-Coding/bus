import { EventEmitter } from 'events'
import * as mqtt from 'mqtt'

import { default as Pattern } from './lib/Pattern'

export interface IBusOptions extends mqtt.IClientOptions {
  //
}

export interface IPacket extends mqtt.IPacket {
  topic?: string
  payload?: Buffer|string
  params?: any
  isJson?: boolean
  json?: any
}

export interface IConnackPacket extends mqtt.IConnackPacket {
  //
}

export interface IClientSubscribeOptions extends mqtt.IClientSubscribeOptions {
  //
}

export interface ISubscriptionGrant extends mqtt.ISubscriptionGrant {
  //
}

export interface IClientPublishOptions extends mqtt.IClientPublishOptions {
  //
}

export enum Status {
  READY,
  CONNECTING,
  CONNECTED,
  RECONNECTING,
  OFFLINE,
  CLOSED,
  ERROR
}

export class Bus {
  static create (clientId: string, url: string, opts?: IBusOptions): Bus {
    return new Bus(url, Object.assign({}, opts || {}, { clientId: clientId }))
  }

  private _url: string
  private _opts: IBusOptions
  private _status: Status
  private _statusError: Error
  private _onStatusChange: (status: Status, error?: Error) => void
  private _patterns: Map<string, Pattern>
  private _messageEvents: EventEmitter
  private _subscriptionTopics: string[]
  private _client: mqtt.Client

  public constructor (url: string, opts?: IBusOptions) {
    this._url = url
    this._opts = opts
    this._reset()
  }

  /**
   * Gets the client ID for this bus.
   * @return {string} The client ID
   */
  public getId (): string {
    return this._opts.clientId
  }

  /**
   * Checks to see if the bus is available
   * @return {boolean} True if the bus is available
   */
  public isAvailable (): boolean {
    return this._client && this._client !== null && (this._client.connected || this._client.reconnecting)
  }

  /**
   * Gets the current status.
   * @return {Status} The current status
   */
  public getStatus (): Status {
    return this._status
  }

  /**
   * Gets the error status, or null if no error occured.
   * @return {Error} The error
   */
  public getStatusError (): Error|null {
    return this._statusError
  }

  /**
   * Sets the method that is called when the status changes.
   * @param  {Error}  fn The method to call
   */
  public onStatusChange (fn: (status: Status, error: Error) => void): void {
    this._onStatusChange = fn
  }

  /**
   * Sets a pattern with the given label.
   * @param  {string} label   The label
   * @param  {string} pattern The pattern
   * @return {Bus}            The Bus instance
   */
  public setPattern (label: string, pattern: string): Bus {
    if (this._patterns.has(label)) {
      throw new Error(`label already in use (${label})`)
    }
    const _pattern = Pattern.from(pattern)
    this._patterns.set(label, _pattern)
    return this
  }

  /**
   * Removes a pattern with the given label.
   * @param  {string} label The pattern label
   * @return {Bus}          The Bus instance
   */
  public removePattern (label: string): Bus {
    if (this._patterns.has(label)) {
      throw new Error(`unknown label (${label})`)
    }
    this._patterns.delete(label)
    return this
  }

  /**
   * Adds an event listener for the given label.
   * @param  {string}   label The label
   * @param  {Function} fn    The listener method
   * @return {Bus}            The Bus instance
   */
  public on (label: string, fn: (packet: IPacket) => void): Bus {
    if (!this._patterns.has(label)) {
      throw new Error(`invalid label (${label})`)
    }
    this._messageEvents.on(label, fn)
    return this
  }

  /**
   * Adds a once event listener for the given label.
   * @param  {string}   label The label
   * @param  {Function} fn    The listener method
   * @return {Bus}            The Bus instance
   */
  public once (label: string, fn: (packet: IPacket) => void): Bus {
    if (!this._patterns.has(label)) {
      throw new Error(`invalid label (${label})`)
    }
    this._messageEvents.once(label, fn)
    return this
  }

  /**
   * Removes the listener.
   * @param  {string}   label The label
   * @param  {Function} fn    The listener method
   * @return {Bus}            The Bus instance
   */
  public removeListener (label: string, fn: (packet: IPacket) => void): Bus {
    if (!this._patterns.has(label)) {
      throw new Error(`invalid label (${label})`)
    }
    this._messageEvents.removeListener(label, fn)
    return this
  }

  /**
   * Removes all listeners for the label.
   * @param  {string} label The label
   * @return {Bus}          The Bus instance
   */
  public removeAllListeners (label?: string): Bus {
    if (label && !this._patterns.has(label)) {
      throw new Error(`invalid label (${label})`)
    } else if (label) {
      this._messageEvents.removeAllListeners(label)
    } else {
      this._messageEvents.removeAllListeners()
    }
    return this
  }

  /**
   * Connects to the broker.
   * @return {Promise<IConnackPacket>} Connection acknowledge info
   */
  public connect (): Promise<IConnackPacket> {
    return new Promise((resolve, reject) => {
      if (this.isAvailable()) {
        return reject(new Error('connect: bus already available'))
      }

      const onConnect = (connack: IConnackPacket): void => {
        this._statusChanged(Status.CONNECTED)
        this._client.removeListener('error', onError)
        this._addEventListeners()
        resolve(connack)
      }

      const onError = (err: Error) => {
        this._client.removeListener('connect', onConnect)
        this._client = null
        this._statusChanged(Status.ERROR, err)
        reject(err)
      }

      this._statusChanged(Status.CONNECTING)
      this._client = mqtt.connect(this._url, this._opts)
      this._client.once('connect', onConnect)
      this._client.once('error', onError)
    })
  }

  /**
   * Closes the connection with the broker.
   * @param  {boolean}       [force=false] Don't wait for in-flight messages to be acked
   * @return {Promise<null>}               Resolves on success
   */
  public end (force: boolean = false): Promise<null> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        return reject(new Error('bus not available'))
      }

      this._client.end(force, () => {
        this._reset()
        resolve()
      })
    })
  }

  /**
   * Subscribes to the topic pattern identified by `label`
   * @param  {string}                           label The label
   * @param  {mqtt.IClientSubscribeOptions}     opts  Subscribe options (optional)
   * @return {Promise<ISubscriptionGrant>}            Subscription grant
   */
  public subscribe (label: string, opts?: IClientSubscribeOptions): Promise<ISubscriptionGrant> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        return reject(new Error('bus not available'))
      } else if (!this._patterns.has(label)) {
        return reject(new Error(`unknown label (${label})`))
      }

      const pattern = this._patterns.get(label)
      if (pattern.getTopic() in this._subscriptionTopics) {
        return reject(new Error('already subscribed to topic'))
      }

      this._client.subscribe(pattern.getTopic(), opts, (err, granted) => {
        if (err) return reject(err)
        this._subscriptionTopics.push(pattern.getTopic())
        resolve(granted)
      })
    })
  }

  /**
   * Unsubscribes from a topic identified by `label`. Optionally removes all
   * listeners for the label.
   * @param  {string}        label                   The label
   * @param  {boolean}       [removeListeners=false] Whether or not to remove this label's listeners
   * @return {Promise<null>}                         Resolves on success
   */
  public unsubscribe (label: string, removeListeners: boolean = false): Promise<null> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        return reject(new Error('bus not available'))
      } else if (!this._patterns.has(label)) {
        return reject(new Error(`unknown label (${label})`))
      }

      const pattern = this._patterns.get(label)
      const index = this._subscriptionTopics.indexOf(pattern.getTopic())
      if (index === -1) {
        return reject(new Error('not subscribed to topic'))
      }

      this._client.unsubscribe(pattern.getTopic(), err => {
        if (err) return reject(err)
        this._subscriptionTopics.splice(index, 1)
        if (removeListeners) this.removeAllListeners(label)
        resolve()
      })
    })
  }

  /**
   * Publishes the `payload` on the topic pattern identified by `label`.
   * @param  {string}                              label   The label
   * @param  {any}                                 params  Parameters to build the topic with
   * @param  {any}                                 payload The message payload
   * @param  {IClientPublishOptions}               opts    Publish options (optional)
   * @return {Promise<null>}                               Resolves on success
   */
  public publish (label: string, params: any, payload: any, opts?: IClientPublishOptions): Promise<null> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        return reject(new Error('bus not available'))
      } else if (!this._patterns.has(label)) {
        return reject(new Error(`unknown label (${label})`))
      }

      const pattern = this._patterns.get(label)
      const paramCount = Object.keys(params).length || 0
      const actualParamCount = pattern.getParameterCount()
      if (paramCount !== actualParamCount) {
        return reject(new Error(`wrong parameter count, got ${paramCount}, expected ${actualParamCount}`))
      }

      // Stringify possible JSON
      try {
        payload = JSON.stringify(payload)
      } catch (e) { }

      // Convert numbers to string
      if (!isNaN(Number(payload))) {
        payload = `${payload}`
      }

      const topic = pattern.buildParameterizedTopic(params)
      this._client.publish(topic, payload, opts, err => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  /**
   * Resets all instance properties.
   */
  private _reset (): void {
    this._status = Status.READY
    this._statusError = null
    this._patterns = new Map()
    this._subscriptionTopics = []

    // If _messageEvents is set, first remove all listeners
    if (this._messageEvents instanceof EventEmitter) {
      this._messageEvents.removeAllListeners()
    }
    this._messageEvents = new EventEmitter()

    // If _client is set, first remove all listeners
    if (this._client) {
      this._client.removeAllListeners()
    }
    this._client = null
  }

  /**
   * Adds all the necessary event emitters to the underlying MQTT client.
   */
  private _addEventListeners (): void {
    this._client.on('connect', () => { this._statusChanged(Status.CONNECTED) })
    this._client.on('reconnect', () => { this._statusChanged(Status.RECONNECTING) })
    this._client.on('offline', () => { this._statusChanged(Status.OFFLINE) })
    this._client.on('close', () => { this._statusChanged(Status.CLOSED) })
    this._client.on('error', err => { this._statusChanged(Status.ERROR, err) })

    this._client.on('message', (topic: string, message: string, packet: IPacket) => {
      packet.isJson = false
      if ([ '{', '[' ].indexOf(packet.payload.toString()[0]) !== -1) {
        try {
          packet.json = JSON.parse(packet.payload.toString())
          packet.isJson = true
        } catch (e) { }
      }

      this._handleMessagePacket(packet)
    })
  }

  /**
   * Handles a single message.
   * @param {IPacket} packet The message packer
   */
  private _handleMessagePacket (packet: IPacket): void {
    for (let [ label, pattern ] of this._patterns) {
      const match = pattern.match(packet.topic)
      if (match) {
        packet.params = pattern.getParameters(match)
        this._messageEvents.emit(label, packet)
        break
      }
    }
  }

  /**
   * Sets the new status and optional error and calls the status change method, if set.
   * @param {Status}   status The new status
   * @param {Error}     error The error, if any
   */
  private _statusChanged (status: Status, error: Error = null): void {
    this._status = status
    if (error !== null) this._statusError = error
    if (typeof this._onStatusChange === 'function') {
      this._onStatusChange(status, error)
    }
  }
}
