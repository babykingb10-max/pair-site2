/**
 * ======================================================
 *  clone.js   THE ONLY FILE YOU NEED TO EDIT TO REBRAND
 * ======================================================
 *  Everything the site shows (name, logo, colours, layout,
 *  footer, Session ID prefix, WhatsApp message ...) is read
 *  from here. Nothing is hard-coded anywhere else.
 *
 *  You can use these placeholders inside any text below:
 *    {name}       -> brand.name
 *    {botName}    -> brand.botName
 *    {owner}      -> brand.owner
 *    {developer}  -> brand.developer
 *    {year}       -> current year
 *
 *  Leave a text option as '' (empty) to switch that part OFF.
 *  Delete an option completely and the default is used.
 */

module.exports = {

  // ------------------------------------------------------------
  //  BRANDING
  // ------------------------------------------------------------
  brand: {
    name: 'Adevos-X Tech',          // main brand name (headings, texts, messages)
    botName: 'Adevos-X Bot',        // bot name shown on the pair page + browser tab
    owner: 'Adevos',                // owner of the brand (use {owner} in texts)
    developer: 'Ahmed',             // developer name (use {developer} in texts)
    siteTitle: '{name} Pair Site',  // title shown in the top bar (always shown in CAPITALS)
  },

  // ------------------------------------------------------------
  //  LOGO  (two ways, pick one)
  //   1) Put a file named  logo.png  (or logo.jpg / .jpeg / .webp / .svg / .gif)
  //      in the ROOT folder next to this file  -> it is used automatically.
  //   2) Or paste a direct image link below.
  //  If both exist, the file in the root folder wins.
  //  Leave both empty to show no logo.
  // ------------------------------------------------------------
  logo: {
    url: 'https://files.catbox.moe/bdwqa7.jpg',
  },

  // ------------------------------------------------------------
  //  SESSION ID (what is generated and sent to WhatsApp)
  // ------------------------------------------------------------
  session: {
    // Text put in front of the Session ID, e.g. 'ADEVOS-X:~'.
    // '' = no prefix (the Session ID is just the plain base64 creds).
    // NOTE: your bot must strip the same prefix when it loads the session.
    prefix: 'ADEVOS-X:~',

    // Small footer under the Session ID message in WhatsApp. '' = no footer.
    footer: '{name} Bots',

    // Message sent after the Session ID in WhatsApp. '' = send nothing.
    // (WhatsApp formatting works: *bold*, _italic_, > quote)
    message:
      '*Session ID Generated*\n\n' +
      '1.Keep it safe and *Do NEVER* share this Session ID with anyone if Not necessary.\n\n' +
      '> Powered by {name}',
  },

  // ------------------------------------------------------------
  //  WEBSITE
  // ------------------------------------------------------------
  website: {
    // Small badge above the big title on the home page. '' = hide it.
    badge: '8 Pairing Code & QR Code Session Generator',

    // Big title on the home page. '' = hide it.
    title: 'Session ID in minute !',

    // Text under the title. '' = hide it.
    description:
      'Generate Session ID by pairing code or a QR code for {name} Bots Deployment, Delivered straight to your WhatsApp, Keep it safe.',

    // Footer at the bottom of the home page. '' = hide the footer.
    // You may use <b>bold</b> (it is shown in the accent colour).
    footer: '{name} <b>Session Generator</b> Made by <b>{developer}</b>',
  },

  // ------------------------------------------------------------
  //  THEME  (colour + layout + mode)
  // ------------------------------------------------------------
  theme: {
    // Just type a colour NAME:
    //   green, blue, red, purple, orange, pink, cyan, yellow, teal, gold,
    //   lime, indigo, violet, white ... or any CSS colour name (crimson, tomato,
    //   dodgerblue ...) or a hex code like '#ff0055'.
    color: 'green',

    // modern | gradient | glass | minimal | cyber
    layout: 'modern',

    // dark | light     (minimal looks great in 'light')
    mode: 'light',
  },
};
