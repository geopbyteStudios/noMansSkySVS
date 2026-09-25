// Acceso a Azure Storage: tablas (usuarios, capturas) y contenedor de imágenes (capturas).
const { TableClient } = require('@azure/data-tables');
const { BlobServiceClient, StorageSharedKeyCredential, BlobSASPermissions, generateBlobSASQueryParameters } = require('@azure/storage-blob');

const CONTAINER = 'capturas';
let cached = null;

function parseConnection(cs) {
  const kv = Object.fromEntries(String(cs).split(';').filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i), p.slice(i + 1)]; }));
  return { account: kv.AccountName, key: kv.AccountKey };
}

function clients() {
  if (cached) return cached;
  const cs = process.env.STORAGE_CONNECTION;
  if (!cs) throw new Error('Falta STORAGE_CONNECTION');
  const { account, key } = parseConnection(cs);
  const blobs = BlobServiceClient.fromConnectionString(cs);
  cached = {
    account,
    users: TableClient.fromConnectionString(cs, 'usuarios'),
    shots: TableClient.fromConnectionString(cs, 'capturas'),
    container: blobs.getContainerClient(CONTAINER),
    cred: new StorageSharedKeyCredential(account, key)
  };
  return cached;
}

const blobUrl = (path) => `https://${clients().account}.blob.core.windows.net/${CONTAINER}/${path}`;

// Enlace temporal de solo escritura (crear) para UN archivo concreto: caduca en 10 minutos
function uploadUrl(path) {
  const c = clients();
  const sas = generateBlobSASQueryParameters({
    containerName: CONTAINER, blobName: path,
    permissions: BlobSASPermissions.parse('cw'),
    startsOn: new Date(Date.now() - 60 * 1000),
    expiresOn: new Date(Date.now() + 10 * 60 * 1000)
  }, c.cred).toString();
  return blobUrl(path) + '?' + sas;
}

async function getUser(usuario) {
  try { return await clients().users.getEntity('u', usuario); }
  catch (e) { if (e.statusCode === 404) return null; throw e; }
}

module.exports = { clients, blobUrl, uploadUrl, getUser, CONTAINER };
