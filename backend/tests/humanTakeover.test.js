const { 
    isAiPaused, 
    pauseAiForChat, 
    pauseAiForever,
    resumeAiForChat, 
    isBotGeneratedMessage, 
    sendBotMessage,
    botSentMessageIds,
    pausedChats,
    getSenderJid,
    isRealOwnerMessage,
    isDuplicateMessage,
    processedMessageIds,
    OWNER_ALLOWED_JIDS
} = require('../src/helpers/humanTakeover');

describe('Human Takeover Helper', () => {
    const chatJid = '12345@s.whatsapp.net';
    const groupJid = '120363158711669734@g.us';

    beforeEach(() => {
        resumeAiForChat(chatJid);
        botSentMessageIds.clear();
        pausedChats.clear();
        if (processedMessageIds) processedMessageIds.clear();
    });

    // AI Pause State Tests
    test('should pause and resume AI', () => {
        expect(isAiPaused(chatJid)).toBe(false);
        pauseAiForChat(chatJid, 1);
        expect(isAiPaused(chatJid)).toBe(true);
        resumeAiForChat(chatJid);
        expect(isAiPaused(chatJid)).toBe(false);
    });

    test('should auto resume after 1 minute for temporary pause', () => {
        pauseAiForChat(chatJid, 1);
        const realDateNow = Date.now;
        Date.now = jest.fn(() => realDateNow() + (61 * 1000));
        expect(isAiPaused(chatJid)).toBe(false);
        Date.now = realDateNow;
    });

    test('should detect bot generated message', () => {
        const msgId = 'bot_msg_123';
        botSentMessageIds.add(msgId);
        const msg = { key: { id: msgId, fromMe: true } };
        expect(isBotGeneratedMessage(msg)).toBe(true);
    });

    test('should track message ID when sending bot message', async () => {
        const mockSock = {
            sendMessage: jest.fn().mockResolvedValue({ key: { id: 'new_bot_id' } })
        };
        await sendBotMessage(mockSock, chatJid, { text: 'Hello' });
        expect(botSentMessageIds.has('new_bot_id')).toBe(true);
    });

    describe('Owner Validation and Deduplication', () => {
        test('getSenderJid should extract and normalize JID correctly', () => {
            // Case 1: Participant with device id
            const msg1 = { key: { participant: '217123:40@s.whatsapp.net', remoteJid: groupJid } };
            expect(getSenderJid(msg1)).toBe('217123@s.whatsapp.net');

            // Case 2: RemoteJid with device id (private chat)
            const msg2 = { key: { remoteJid: '628123:50@s.whatsapp.net' } };
            expect(getSenderJid(msg2)).toBe('628123@s.whatsapp.net');

            // Case 3: LID JID
            const msg3 = { key: { participant: '217166666317835:10@lid', remoteJid: groupJid } };
            expect(getSenderJid(msg3)).toBe('217166666317835@lid');
        });

        test('isRealOwnerMessage should return false if fromMe is false', () => {
            const msg = { key: { fromMe: false, remoteJid: chatJid } };
            expect(isRealOwnerMessage(msg)).toBe(false);
        });

        test('isRealOwnerMessage should return true for valid owner JID', () => {
            // First allowed JID in OWNER_ALLOWED_JIDS (e.g. 217166666317835@lid)
            const validJid = OWNER_ALLOWED_JIDS[0]; 
            const msg = { key: { fromMe: true, participant: validJid, remoteJid: groupJid } };
            expect(isRealOwnerMessage(msg)).toBe(true);
        });

        test('isRealOwnerMessage should return false for user target JID (echo bug)', () => {
            const invalidJid = '168160888094860@lid'; // User target
            const msg = { key: { fromMe: true, participant: invalidJid, remoteJid: groupJid } };
            expect(isRealOwnerMessage(msg)).toBe(false);
        });

        test('isDuplicateMessage should return false for new message and track it', () => {
            const msg = { key: { id: 'MSG123' } };
            expect(isDuplicateMessage(msg)).toBe(false);
            expect(isDuplicateMessage(msg)).toBe(true); // second time should be true
        });
    });
});
