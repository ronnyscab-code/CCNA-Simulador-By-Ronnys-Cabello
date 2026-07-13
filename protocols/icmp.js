/**
 * icmp.js
 *
 * The subset of ICMP the simulator needs for `ping` and `traceroute`: echo
 * request/reply, plus the error types a router generates (time-exceeded when
 * TTL hits zero, destination-unreachable). Plain data model.
 */

export const IcmpType = Object.freeze({
  ECHO_REQUEST: 'echo-request',
  ECHO_REPLY: 'echo-reply',
  TIME_EXCEEDED: 'time-exceeded',
  DEST_UNREACHABLE: 'dest-unreachable',
});

export class IcmpMessage {
  /**
   * @param {object} params
   * @param {string} params.type - one of `IcmpType`.
   * @param {number} [params.id] - echo identifier.
   * @param {number} [params.seq] - echo sequence number.
   */
  constructor({ type, id = 0, seq = 0 }) {
    this.type = type;
    this.id = id;
    this.seq = seq;
  }

  /**
   * Builds the echo reply that answers this echo request.
   * @returns {IcmpMessage}
   */
  toReply() {
    return new IcmpMessage({ type: IcmpType.ECHO_REPLY, id: this.id, seq: this.seq });
  }
}
