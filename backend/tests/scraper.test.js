const { parseDparagonTime, isCacheExpired, setCachedData, formatAttendanceData } = require('../src/services/scraper');

describe('Scraper Service Utilities', () => {
    
    describe('parseDparagonTime', () => {
        it('should correctly parse Indonesian date format with time', () => {
            const rawTime = "Kamis, 02 April 2026 16:02:31 (WIB)";
            const timestamp = parseDparagonTime(rawTime);
            const date = new Date(timestamp);
            
            expect(date.getFullYear()).toBe(2026);
            expect(date.getMonth()).toBe(3); // April is 3 (0-indexed)
            expect(date.getDate()).toBe(2);
            expect(date.getHours()).toBe(16);
            expect(date.getMinutes()).toBe(2);
            expect(date.getSeconds()).toBe(31);
        });

        it('should handle newline and multiple spaces', () => {
            const rawTime = "Kamis, 02 April 2026\n16:02:31 (WIB)";
            const timestamp = parseDparagonTime(rawTime);
            expect(timestamp).toBeGreaterThan(0);
            expect(new Date(timestamp).getHours()).toBe(16);
        });

        it('should return 0 for invalid input', () => {
            expect(parseDparagonTime("-")).toBe(0);
            expect(parseDparagonTime(null)).toBe(0);
            expect(parseDparagonTime("invalid")).toBe(0);
        });
    });

    describe('User-Specific Cache Logic', () => {
        const testUser = "TEST USER";
        
        beforeEach(() => {
            // No direct access to Map, so we use exported methods
        });

        it('should identify expired cache correctly', () => {
            const oldTime = Date.now() - (6 * 60 * 1000); // 6 minutes ago
            setCachedData(testUser, [{ id: 1 }], oldTime);
            expect(isCacheExpired(testUser)).toBe(true);
        });

        it('should identify valid cache correctly', () => {
            const recentTime = Date.now() - (2 * 60 * 1000); // 2 minutes ago
            setCachedData(testUser, [{ id: 1 }], recentTime);
            expect(isCacheExpired(testUser)).toBe(false);
        });

        it('should return true if no cache exists for user', () => {
            expect(isCacheExpired("NON EXISTENT")).toBe(true);
        });

        it('should isolate cache between users', () => {
            const userA = "USER A";
            const userB = "USER B";
            
            setCachedData(userA, [{ data: 'A' }], Date.now());
            setCachedData(userB, [{ data: 'B' }], Date.now() - (10 * 60 * 1000));
            
            expect(isCacheExpired(userA)).toBe(false);
            expect(isCacheExpired(userB)).toBe(true);
        });
    });

    describe('formatAttendanceData', () => {
        it('should format raw data and sort by time descending', () => {
            const rawData = [
                {
                    shift_info: "Shift A",
                    foto_masuk: "url1",
                    waktu_masuk: "01 April 2026 08:00:00",
                    foto_keluar: "url2",
                    waktu_keluar: "01 April 2026 17:00:00"
                },
                {
                    shift_info: "Shift B",
                    foto_masuk: "url3",
                    waktu_masuk: "02 April 2026 08:00:00",
                    foto_keluar: "-",
                    waktu_keluar: "-"
                }
            ];

            const result = formatAttendanceData(rawData);
            
            expect(result.length).toBe(3); // 2 from first item, 1 from second
            // Sorted descending
            expect(result[0].status).toBe("checkin");
            expect(result[0].raw_time).toBe("02 April 2026 08:00:00");
            expect(result[1].status).toBe("checkout");
            expect(result[1].raw_time).toBe("01 April 2026 17:00:00");
            expect(result[2].status).toBe("checkin");
            expect(result[2].raw_time).toBe("01 April 2026 08:00:00");
        });
    });
});
