import { Buffer } from 'node:buffer';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';

// Exercise Express with real Node HTTP messages, without listening on a port.
export function request(app, { method = 'GET', url, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback(); } });
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = { host: 'getgpx.test', ...headers };
    if (body !== undefined) req.headers['content-length'] = String(Buffer.byteLength(body));
    const res = new ServerResponse(req);
    res.assignSocket(socket);
    res.on('error', reject);
    res.on('finish', () => {
      // res.end payloads can use chunked encoding; use intercepted writes for body.
      resolve({ status: res.statusCode, headers: res.getHeaders(), text: Buffer.concat(payload).toString(),
        json() { return JSON.parse(this.text); } });
    });
    const payload = [];
    const write = res.write.bind(res);
    const end = res.end.bind(res);
    res.write = (chunk, ...args) => { if (chunk) payload.push(Buffer.from(chunk)); return write(chunk, ...args); };
    res.end = (chunk, ...args) => { if (chunk) payload.push(Buffer.from(chunk)); return end(chunk, ...args); };
    app.handle(req, res);
    if (body !== undefined) req.push(body);
    req.push(null);
  });
}
