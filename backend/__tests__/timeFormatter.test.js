const { parseDparagonTime } = require("../src/helpers/timeFormatter");

describe("timeFormatter - parseDparagonTime", () => {
  describe("Boundary Value Analysis", () => {
    it("should return 0 when rawTime is null or undefined", () => {
      expect(parseDparagonTime(null)).toBe(0);
      expect(parseDparagonTime(undefined)).toBe(0);
    });

    it("should return 0 when rawTime is an empty string", () => {
      expect(parseDparagonTime("")).toBe(0);
      expect(parseDparagonTime("   ")).toBe(0);
    });

    it("should return 0 when rawTime only contains time without date", () => {
      expect(parseDparagonTime("14:30:00 (WIB)")).toBe(0);
      expect(parseDparagonTime("14:30")).toBe(0);
    });
  });

  describe("Equivalence Partitioning (Month Localization)", () => {
    it("should correctly parse dates with Indonesian month names", () => {
      // 10 Mei 2026 14:30:00
      const idTimeStr = "Senin, 10 Mei 2026 14:30:00 (WIB)";
      const parsedId = parseDparagonTime(idTimeStr);
      
      const expectedDate = new Date("May 10 2026 14:30:00").getTime();
      expect(parsedId).toBe(expectedDate);
    });

    it("should correctly parse dates with English month names", () => {
      // 10 May 2026 14:30:00
      const enTimeStr = "Monday, 10 May 2026 14:30:00 (WIB)";
      const parsedEn = parseDparagonTime(enTimeStr);
      
      const expectedDate = new Date("May 10 2026 14:30:00").getTime();
      expect(parsedEn).toBe(expectedDate);
    });
  });
});
