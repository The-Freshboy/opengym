import dns from 'node:dns'
import https from 'node:https'
import net from 'node:net'

const privateV4 = new net.BlockList()
for (const [network, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) privateV4.addSubnet(network, bits, 'ipv4')
const globalV6 = new net.BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6')
const reservedV6 = new net.BlockList(); reservedV6.addSubnet('2001:db8::', 32, 'ipv6'); reservedV6.addSubnet('2002::', 16, 'ipv6')
export const publicAddress = address => net.isIP(address) === 4 ? !privateV4.check(address, 'ipv4') : net.isIP(address) === 6 && globalV6.check(address, 'ipv6') && !reservedV6.check(address, 'ipv6')

export function validPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint)
    return typeof endpoint === 'string' && endpoint.length <= 4096 && url.protocol === 'https:' && !url.username && !url.password && !url.hash && (!url.port || url.port === '443') && !net.isIP(url.hostname.replace(/^\[|\]$/g, '')) && url.hostname.includes('.') && !url.hostname.endsWith('.localhost') && !url.hostname.endsWith('.local')
  } catch { return false }
}

// Validate the DNS answer at connection time, not just subscription time. The selected
// address is passed directly to the socket, eliminating a second lookup/rebinding window.
export function publicLookup(hostname, options, callback, lookup = dns.lookup) {
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error)
    if (!addresses?.length || addresses.some(a => !publicAddress(a.address))) return callback(new Error('Push destination must resolve to public addresses'))
    const wanted = typeof options === 'number' ? options : options?.family
    const matches = wanted ? addresses.filter(a => a.family === wanted) : addresses
    if (!matches.length) return callback(new Error('No permitted push address'))
    return options?.all ? callback(null, matches) : callback(null, matches[0].address, matches[0].family)
  })
}
export const pushAgent = new https.Agent({ keepAlive: false, lookup: publicLookup })
