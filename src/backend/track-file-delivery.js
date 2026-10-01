import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

// Only a local nginx URI leaves this adapter. The proxy owns the upstream host.
export function createTrackFileDelivery(config, { sign = getSignedUrl } = {}) {
  return {
    redirectFor(descriptor, kind) {
      const filename = { gpx: 'source.gpx', analysis: 'analysis.json' }[kind];
      const prefix = `${config.prefix}/`;
      if (!filename || !descriptor.key.startsWith(prefix)) throw new Error('Invalid track delivery object.');
      const viewerKey = descriptor.key.slice(prefix.length);
      const parts = viewerKey.split('/');
      if (parts.length !== 4 || parts[0] !== 'tracks' || parts[3] !== filename
        || !parts.slice(1, 3).every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
        throw new Error('Invalid track delivery path.');
      }
      const viewerUrl = `https://${config.cloudFrontDomain}/${viewerKey}`;
      const signed = sign({ url: viewerUrl, keyPairId: config.cloudFrontKeyPairId,
        privateKey: config.cloudFrontPrivateKey, dateLessThan: new Date(Date.now() + 60_000).toISOString() });
      const url = new URL(signed);
      if (url.origin !== new URL(viewerUrl).origin || url.pathname !== `/${viewerKey}`
        || url.username || url.password || url.hash
        || !/^\?[A-Za-z0-9~_=%&-]+$/.test(url.search)
        || !['Expires', 'Signature', 'Key-Pair-Id'].every((name) => url.searchParams.getAll(name).length === 1 && url.searchParams.get(name))) {
        throw new Error('Invalid signed track delivery URL.');
      }
      return `/_track_files${url.pathname}${url.search}`;
    },
  };
}
