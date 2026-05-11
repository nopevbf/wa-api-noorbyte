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

  it("should process valid links and complete successfully", async () => {
    const identity = { name: "test_user", ig_email: "test", ig_password: "123" };
    const payload = { links: "https://instagram.com/p/123", comments: "test" };
    const options = { stealthMode: false, sessionId: "test_session_success" };

    const mockPageBase = {
      keyboard: { press: jest.fn() },
      url: jest.fn().mockReturnValue("https://instagram.com/p/123"),
      on: jest.fn(),
      cookies: jest.fn().mockResolvedValue([{ name: 'sessionid', value: '123' }, { name: 'sessionid_ss', value: '123' }]),
      content: jest.fn().mockResolvedValue(""),
      evaluate: jest.fn().mockImplementation((func, ...args) => {
        const funcString = func.toString();
        if (funcString.includes('isVisible') || funcString.includes('isBlocked')) {
            return Promise.resolve(false); // Not blocked
        }
        if (funcString.includes('killPopups') || funcString.includes('window.__LCR_UTILS__')) {
            return Promise.resolve(true);
        }
        return Promise.resolve([{action: 'like'}, {action: 'comment'}, {action: 'repost'}]);
      })
    };

    const mockPage = new Proxy(mockPageBase, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return jest.fn().mockResolvedValue(true);
      }
    });

    const mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      pages: jest.fn().mockResolvedValue([mockPage]),
      close: jest.fn().mockResolvedValue(true),
      process: jest.fn().mockReturnValue({ spawnargs: [] })
    };

    puppeteer.launch.mockResolvedValueOnce(mockBrowser);

    await executeLCR(identity, payload, options);

    const status = getLcrStatus("test_session_success");
    expect(status.status).toBe("done");
  }, 15000);
});
