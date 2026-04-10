// --- FILE: server/imap-handler.js ---

const imaps = require('imap-simple');

async function scanImapAccount(imapConfig, searchTargets) {
    const config = {
        imap: {
            user: imapConfig.email,
            password: imapConfig.password.replace(/\s+/g, ''), 
            host: imapConfig.host, 
            port: 993,
            tls: true,
            authTimeout: 20000,
            tlsOptions: { rejectUnauthorized: false }
        }
    };

    const results = {
        emailChecked: imapConfig.email,
        foundInInbox: [],
        foundInSpam: [],
        error: null
    };

    try {
        console.log(`\n[RADAR] ========================================`);
        console.log(`[RADAR] Connecting to IMAP for: ${imapConfig.email} via ${imapConfig.host}...`);
        
        const connection = await imaps.connect(config);
        console.log(`[RADAR] ✅ Authentication SUCCESS for ${imapConfig.email}!`);
        
        await connection.openBox('INBOX');
        const delay = 24 * 3600 * 1000; 
        const yesterday = new Date(Date.now() - delay).toISOString();
        const searchCriteria = ['ALL', ['SINCE', yesterday]]; 
        const fetchOptions = { bodies: ['HEADER', 'TEXT'], struct: true };

        // 🔥 THE NEW SMART SCANNER (Counts every physical email!)
        const scanMessages = async (messages, targetArray) => {
            const found = []; // This will hold a tally of every single hit
            
            for (const msg of messages) {
                let rawContent = '';
                msg.parts.forEach(part => {
                    if (part.which === 'HEADER' && part.body) {
                        rawContent += JSON.stringify(part.body).toLowerCase() + ' ';
                    } else if (part.body) {
                        rawContent += String(part.body).toLowerCase() + ' ';
                    }
                });

                const cleanContent = rawContent
                    .replace(/=\r?\n/g, '') 
                    .replace(/\r?\n/g, ' ') 
                    .replace(/(<([^>]+)>)/gi, '');

                // Keep track of which profiles matched THIS specific email
                const matchedProfilesForThisEmail = new Set();

                for (const target of targetArray) {
                    if (
                        (target.email && cleanContent.includes(target.email)) || 
                        (target.tag && cleanContent.includes(target.tag))
                    ) {
                        matchedProfilesForThisEmail.add(target.profileName);
                    }
                }

                // Add a tally mark for every profile that matched this physical email
                matchedProfilesForThisEmail.forEach(pName => {
                    found.push(pName);
                    console.log(`[RADAR] 🎯 Match counted for Profile: ${pName} in a message!`);
                });
            }
            return found;
        };
        
        console.log(`[RADAR] Scanning INBOX for ${imapConfig.email}...`);
        const inboxMessages = await connection.search(searchCriteria, fetchOptions);
        results.foundInInbox = await scanMessages(inboxMessages, searchTargets);

        try {
            let spamFolderName = 'Junk Email';
            if (imapConfig.host.toLowerCase().includes('gmail')) spamFolderName = '[Gmail]/Spam';
            if (imapConfig.host.toLowerCase().includes('yahoo')) spamFolderName = 'Bulk';

            await connection.openBox(spamFolderName);
            console.log(`[RADAR] Scanning SPAM (${spamFolderName}) for ${imapConfig.email}...`);
            const spamMessages = await connection.search(searchCriteria, fetchOptions);
            results.foundInSpam = await scanMessages(spamMessages, searchTargets);

        } catch (spamErr) {
            console.log(`[RADAR] Note: Could not open Spam folder '${spamFolderName}'.`);
        }

        connection.end();
        console.log(`[RADAR] Finished scan for ${imapConfig.email}. Found ${results.foundInInbox.length} matches in Inbox.`);
        console.log(`[RADAR] ========================================\n`);
        return results;

    } catch (error) {
        console.error(`\n[RADAR] ❌ IMAP Connection Error for ${imapConfig.email}: ${error.message}`);
        console.error(`[RADAR] ========================================\n`);
        results.error = error.message;
        return results;
    }
}

module.exports = { scanImapAccount };