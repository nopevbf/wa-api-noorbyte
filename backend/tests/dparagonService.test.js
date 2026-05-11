jest.mock("socks-proxy-agent", () => ({ SocksProxyAgent: jest.fn() }));
jest.mock("puppeteer-extra", () => ({ use: jest.fn(), launch: jest.fn() }));
jest.mock("puppeteer-extra-plugin-stealth", () => jest.fn());

const { fetchDparagonReport } = require("../src/services/dparagonService");

describe("DParagon Service", () => {
  it("should have fetchDparagonReport function", () => {
    expect(typeof fetchDparagonReport).toBe("function");
  });
});
