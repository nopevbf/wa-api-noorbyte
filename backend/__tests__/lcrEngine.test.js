const { executeLCR, getLcrStatus } = require("../src/services/lcrEngine");
const puppeteer = require("puppeteer-extra");

jest.mock("puppeteer-extra", () => ({
  use: jest.fn(),
  launch: jest.fn()
}));

describe("lcrEngine - executeLCR", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("should handle error when browser/driver fails to load in stealth mode", async () => {
    const identity = { name: "test_user", ig_email: "test", ig_password: "123" };
    const payload = { links: "https://instagram.com/p/123\nhttps://tiktok.com/@user/video/123", comments: "test" };
    const options = { stealthMode: true, sessionId: "test_session_1" };

    // Simulate browser launch failure (e.g. Chrome not found or driver error)
    puppeteer.launch.mockRejectedValueOnce(new Error("Failed to launch browser: Chrome executable not found"));

    await executeLCR(identity, payload, options);

    const status = getLcrStatus("test_session_1");
    expect(status.status).toBe("error");
    expect(status.error).toContain("Failed to launch browser");
  });
});
